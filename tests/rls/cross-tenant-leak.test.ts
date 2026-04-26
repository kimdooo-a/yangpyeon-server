/**
 * tests/rls/cross-tenant-leak.test.ts
 *
 * Phase 1.4 (T1.4) — ADR-023 §7 RLS e2e 테스트.
 *
 * 동적 backstop:
 *   - ESLint custom rule (§6) 의 false-negative 보완.
 *   - 실제 RLS 정책이 cross-tenant SELECT/UPDATE/DELETE/INSERT 를 차단하는지 검증.
 *
 * 실행 방식:
 *   기본 vitest 실행 시 — RLS_TEST_DATABASE_URL 미설정 → 모든 it 가 it.skip.
 *   실제 검증 시 — `RLS_TEST_DATABASE_URL=postgres://app_runtime:...@localhost/test pnpm vitest tests/rls/`
 *
 * 시나리오 (spec §7.1):
 *   T1: tenant_a context 에서 tenant_b row 조회 → 0 row.
 *   T2: tenant_a context 에서 tenant_b row UPDATE → 0 row affected.
 *   T3: tenant_a context 에서 tenant_b row DELETE → 0 row affected.
 *   T4: tenant_a context 에서 tenant_b 의 tenant_id 로 INSERT → exception.
 *   T5: tenant context 미설정 + raw query → 0 row 또는 exception.
 *   T6: bypassRls=true 모드 (admin role) → 모든 tenant row 가시 (skip — Phase 4 ops).
 *   T7: 9 개 모델 일괄 cross-tenant 침투 → 모두 0 row.
 *
 * 가드:
 *   - 환경변수 RLS_TEST_DATABASE_URL 미설정 시 it.skip — CI default vitest 비파괴.
 *   - bootstrap 은 BYPASSRLS app_admin 권한 connection 으로 수행 (별도 ENV — RLS_TEST_ADMIN_DATABASE_URL).
 *   - tenant_a / tenant_b 는 매 테스트 실행 시 truncate + reseed.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

const TENANTS = {
  a: "11111111-1111-1111-1111-111111111111",
  b: "22222222-2222-2222-2222-222222222222",
} as const;

const HAS_DB =
  !!process.env.RLS_TEST_DATABASE_URL && !!process.env.RLS_TEST_ADMIN_DATABASE_URL;

// ──────────────────────────────────────────────────────────────────────────
// Lazy 로드: env 미설정 시 prisma / pg / 모듈 import 자체를 회피.
//   - pg 가 worktree 에 hoist 되지 않은 상태에서도 default vitest 실행이 PASS (skip).
//   - 실제 RLS 검증 시 env 설정 + pg 설치 보장.
// ──────────────────────────────────────────────────────────────────────────
type PrismaWithTenantModule =
  typeof import("../../src/lib/db/prisma-tenant-client");
type TenantContextModule =
  typeof import("../../packages/core/src/tenant/context");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PgPool = any;

let prismaWithTenant: PrismaWithTenantModule["prismaWithTenant"];
let runWithTenant: TenantContextModule["runWithTenant"];
let adminPool: PgPool | null = null;

async function loadModules() {
  if (!HAS_DB) return;
  const m1 = await import("../../src/lib/db/prisma-tenant-client");
  const m2 = await import("../../packages/core/src/tenant/context");
  prismaWithTenant = m1.prismaWithTenant;
  runWithTenant = m2.runWithTenant;
}

async function bootstrap() {
  if (!HAS_DB) return;
  // dynamic import — pg 가 install 되어 있지 않은 환경에서도 default vitest 가 통과한다.
  const { Pool } = await import("pg");
  adminPool = new Pool({
    connectionString: process.env.RLS_TEST_ADMIN_DATABASE_URL!,
  });
  // Tenant 시드 — UPSERT 패턴.
  await adminPool.query(
    `INSERT INTO tenants (id, slug, display_name, status, created_at, updated_at)
     VALUES ($1, 'test-a', 'Test Tenant A', 'active', NOW(), NOW()),
            ($2, 'test-b', 'Test Tenant B', 'active', NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [TENANTS.a, TENANTS.b],
  );
}

async function reseedUsers() {
  if (!adminPool) return;
  // 매 테스트 전 tenant_a / tenant_b 의 user 1개씩 (정해진 email).
  // BYPASSRLS connection 이므로 정책 미적용.
  await adminPool.query(
    `DELETE FROM users WHERE email IN ('a@x.com', 'b@x.com', 'evil@x.com')`,
  );
  await adminPool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'a@x.com', 'h', NOW(), NOW()),
            (gen_random_uuid(), $2, 'b@x.com', 'h', NOW(), NOW())`,
    [TENANTS.a, TENANTS.b],
  );
}

beforeAll(async () => {
  if (!HAS_DB) {
    return;
  }
  await loadModules();
  await bootstrap();
});

afterAll(async () => {
  if (adminPool) {
    await adminPool.end();
    adminPool = null;
  }
});

beforeEach(async () => {
  if (HAS_DB) {
    await reseedUsers();
  }
});

describe("RLS cross-tenant isolation (env-gated)", () => {
  it.skipIf(!HAS_DB)(
    "T1: tenant_a context 는 tenant_b user 조회 불가",
    async () => {
      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const users = await prismaWithTenant.user.findMany();
        expect(users).toHaveLength(1);
        expect(users[0].tenantId).toBe(TENANTS.a);
        expect(users[0].email).toBe("a@x.com");
      });
    },
  );

  it.skipIf(!HAS_DB)(
    "T2: tenant_a context 의 UPDATE 는 tenant_b row 영향 없음",
    async () => {
      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const result = await prismaWithTenant.user.updateMany({
          where: { email: "b@x.com" },
          data: { name: "hacked" },
        });
        expect(result.count).toBe(0);
      });
      // tenant_b 측 검증 — admin 으로 직접 확인.
      const verify = await adminPool!.query(
        "SELECT name FROM users WHERE email = 'b@x.com'",
      );
      expect(verify.rows[0]?.name).toBeNull();
    },
  );

  it.skipIf(!HAS_DB)(
    "T3: tenant_a context 의 DELETE 는 tenant_b row 영향 없음",
    async () => {
      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const result = await prismaWithTenant.user.deleteMany({
          where: { email: "b@x.com" },
        });
        expect(result.count).toBe(0);
      });
      const verify = await adminPool!.query(
        "SELECT count(*) FROM users WHERE email = 'b@x.com'",
      );
      expect(Number(verify.rows[0].count)).toBe(1);
    },
  );

  it.skipIf(!HAS_DB)(
    "T4: WITH CHECK — tenant_a context 에서 tenant_b 의 tenant_id INSERT 차단",
    async () => {
      await expect(
        runWithTenant({ tenantId: TENANTS.a }, async () => {
          // raw INSERT — Prisma 가 자동 inject 안 한 시뮬레이션.
          await prismaWithTenant.$executeRawUnsafe(
            `INSERT INTO users (id, tenant_id, email, password_hash, created_at, updated_at)
             VALUES (gen_random_uuid(), '${TENANTS.b}', 'evil@x.com', 'h', NOW(), NOW())`,
          );
        }),
      ).rejects.toThrow(/row-level security|policy/i);
    },
  );

  it.skipIf(!HAS_DB)(
    "T5: tenant context 미설정 + raw 조회 → 0 row (안전 기본값)",
    async () => {
      // app_runtime 권한 직접 connection — GUC 미설정.
      const { Pool } = await import("pg");
      const runtimePool = new Pool({
        connectionString: process.env.RLS_TEST_DATABASE_URL!,
      });
      try {
        const result = await runtimePool.query("SELECT * FROM users");
        // current_setting('app.tenant_id', true) → NULL → tenant_id = NULL → false → 0 row.
        expect(result.rowCount).toBe(0);
      } finally {
        await runtimePool.end();
      }
    },
  );

  it.skip(
    "T6: bypassRls=true 모드 (admin role) — 모든 tenant row 가시",
    async () => {
      // TODO(Phase 4 ops): app_admin role 권한 grant 후 활성화.
      // 현 단계는 prismaWithTenant 의 SET LOCAL ROLE app_admin 경로 검증 deferred.
    },
  );

  it.skipIf(!HAS_DB).each([
    "user",
    "session",
    "folder",
    "file",
    "apiKey",
    "sqlQuery",
    "edgeFunction",
    "cronJob",
    "webhook",
  ] as const)("T7-%s: cross-tenant leak 0 (모든 model)", async (model) => {
    await runWithTenant({ tenantId: TENANTS.a }, async () => {
      // dynamic 접근 — 각 model 의 findMany.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = prismaWithTenant as any;
      const rows: Array<{ tenantId: string }> = await client[model].findMany();
      for (const row of rows) {
        expect(row.tenantId).toBe(TENANTS.a);
      }
    });
  });
});
