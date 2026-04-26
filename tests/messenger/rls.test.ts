/**
 * tests/messenger/rls.test.ts
 *
 * 세션 64 (2026-04-26) — 메신저 Phase 1 (M1 W1) RLS 검증.
 * ADR-030 + ADR-022 §1 + ADR-029.
 *
 * 검증 대상 9 테이블:
 *   conversations, conversation_members, messages,
 *   message_attachments, message_mentions, message_receipts,
 *   user_blocks, abuse_reports, notification_preferences.
 *
 * 시나리오:
 *   M1: tenant_a context 에서 tenant_b conversation SELECT → 0 row.
 *   M2: tenant_a context 에서 tenant_b message UPDATE (회수) → 0 affected.
 *   M3: tenant_a context 에서 tenant_b 의 tenant_id 로 conversation INSERT → RLS 예외.
 *   M4: tenant context 미설정 + raw 조회 → 0 row.
 *   M5 (각 model): cross-tenant findMany → tenant_a row 만 반환.
 *
 * 실행:
 *   기본 — RLS_TEST_DATABASE_URL 미설정 시 모든 it 가 it.skip.
 *   실증 — `RLS_TEST_DATABASE_URL=postgres://app_runtime:...
 *           RLS_TEST_ADMIN_DATABASE_URL=postgres://postgres:...
 *           pnpm vitest tests/messenger/`
 *
 * 가드:
 *   - cross-tenant-leak.test.ts 와 동일한 env 가드.
 *   - bootstrap 은 BYPASSRLS connection 으로 conv_a/conv_b 시드.
 *   - 매 it 전 reseed.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

const TENANTS = {
  a: "11111111-1111-1111-1111-111111111111",
  b: "22222222-2222-2222-2222-222222222222",
} as const;

const HAS_DB =
  !!process.env.RLS_TEST_DATABASE_URL &&
  !!process.env.RLS_TEST_ADMIN_DATABASE_URL;

type PrismaWithTenantModule =
  typeof import("../../src/lib/db/prisma-tenant-client");
type TenantContextModule =
  typeof import("../../packages/core/src/tenant/context");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PgPool = any;

let prismaWithTenant: PrismaWithTenantModule["prismaWithTenant"];
let runWithTenant: TenantContextModule["runWithTenant"];
let adminPool: PgPool | null = null;
let userIdA: string;
let userIdB: string;
let convIdA: string;
let convIdB: string;
let msgIdA: string;
let msgIdB: string;

async function loadModules() {
  if (!HAS_DB) return;
  const m1 = await import("../../src/lib/db/prisma-tenant-client");
  const m2 = await import("../../packages/core/src/tenant/context");
  prismaWithTenant = m1.prismaWithTenant;
  runWithTenant = m2.runWithTenant;
}

async function bootstrap() {
  if (!HAS_DB) return;
  const { Pool } = await import("pg");
  adminPool = new Pool({
    connectionString: process.env.RLS_TEST_ADMIN_DATABASE_URL!,
  });
  await adminPool.query(
    `INSERT INTO tenants (id, slug, display_name, status, created_at, updated_at)
     VALUES ($1, 'msg-test-a', 'Messenger Test Tenant A', 'active', NOW(), NOW()),
            ($2, 'msg-test-b', 'Messenger Test Tenant B', 'active', NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [TENANTS.a, TENANTS.b],
  );
}

async function reseed() {
  if (!adminPool) return;
  // 메신저 데이터 cleanup (tenant_a / tenant_b 만, RLS BYPASS 로).
  await adminPool.query(
    `DELETE FROM messages WHERE tenant_id IN ($1, $2)`,
    [TENANTS.a, TENANTS.b],
  );
  await adminPool.query(
    `DELETE FROM conversation_members WHERE tenant_id IN ($1, $2)`,
    [TENANTS.a, TENANTS.b],
  );
  await adminPool.query(
    `DELETE FROM conversations WHERE tenant_id IN ($1, $2)`,
    [TENANTS.a, TENANTS.b],
  );
  await adminPool.query(
    `DELETE FROM users WHERE email IN ('msg-a@x.com', 'msg-b@x.com')`,
  );

  // adminPool 이 any 이므로 row 결과를 명시 캐스트.
  type Row = { id: string; tenant_id: string };

  // user_a / user_b 1명씩.
  const u = await adminPool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'msg-a@x.com', 'h', NOW(), NOW()),
            (gen_random_uuid(), $2, 'msg-b@x.com', 'h', NOW(), NOW())
     RETURNING id, tenant_id`,
    [TENANTS.a, TENANTS.b],
  );
  const uRows = u.rows as Row[];
  userIdA = uRows.find((r) => r.tenant_id === TENANTS.a)!.id;
  userIdB = uRows.find((r) => r.tenant_id === TENANTS.b)!.id;

  // conv_a / conv_b 각 1개 (DIRECT, member 1명만 — 멤버 검증은 RLS 와 별개).
  const c = await adminPool.query(
    `INSERT INTO conversations (id, tenant_id, kind, created_by_id, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'DIRECT', $3, NOW(), NOW()),
            (gen_random_uuid(), $2, 'DIRECT', $4, NOW(), NOW())
     RETURNING id, tenant_id`,
    [TENANTS.a, TENANTS.b, userIdA, userIdB],
  );
  const cRows = c.rows as Row[];
  convIdA = cRows.find((r) => r.tenant_id === TENANTS.a)!.id;
  convIdB = cRows.find((r) => r.tenant_id === TENANTS.b)!.id;

  // msg_a / msg_b 각 1개.
  const m = await adminPool.query(
    `INSERT INTO messages (id, tenant_id, conversation_id, sender_id, kind, body,
                           client_generated_id, created_at)
     VALUES (gen_random_uuid(), $1, $3, $5, 'TEXT', 'hello from a',
             'cga-' || gen_random_uuid()::text, NOW()),
            (gen_random_uuid(), $2, $4, $6, 'TEXT', 'hello from b',
             'cgb-' || gen_random_uuid()::text, NOW())
     RETURNING id, tenant_id`,
    [TENANTS.a, TENANTS.b, convIdA, convIdB, userIdA, userIdB],
  );
  const mRows = m.rows as Row[];
  msgIdA = mRows.find((r) => r.tenant_id === TENANTS.a)!.id;
  msgIdB = mRows.find((r) => r.tenant_id === TENANTS.b)!.id;
}

beforeAll(async () => {
  if (!HAS_DB) return;
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
    await reseed();
  }
});

describe("Messenger RLS — cross-tenant isolation (env-gated)", () => {
  it.skipIf(!HAS_DB)(
    "M1: tenant_a context 는 tenant_b conversation 조회 불가",
    async () => {
      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const convs = await prismaWithTenant.conversation.findMany();
        expect(convs).toHaveLength(1);
        expect(convs[0].tenantId).toBe(TENANTS.a);
        expect(convs[0].id).toBe(convIdA);
      });
    },
  );

  it.skipIf(!HAS_DB)(
    "M2: tenant_a context 의 UPDATE 는 tenant_b message 영향 없음",
    async () => {
      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const result = await prismaWithTenant.message.updateMany({
          where: { id: msgIdB },
          data: { body: "tampered" },
        });
        expect(result.count).toBe(0);
      });
      // tenant_b 측 admin 으로 검증 — body 미변경.
      const verify = await adminPool!.query(
        "SELECT body FROM messages WHERE id = $1",
        [msgIdB],
      );
      expect(verify.rows[0]?.body).toBe("hello from b");
    },
  );

  it.skipIf(!HAS_DB)(
    "M3: WITH CHECK — tenant_a context 에서 tenant_b id INSERT 차단",
    async () => {
      await expect(
        runWithTenant({ tenantId: TENANTS.a }, async () => {
          await prismaWithTenant.$executeRawUnsafe(
            `INSERT INTO conversations (id, tenant_id, kind, created_by_id, created_at, updated_at)
             VALUES (gen_random_uuid(), '${TENANTS.b}', 'DIRECT', '${userIdA}', NOW(), NOW())`,
          );
        }),
      ).rejects.toThrow(/row-level security|policy/i);
    },
  );

  it.skipIf(!HAS_DB)(
    "M4: tenant context 미설정 + raw 조회 → 0 row (안전 기본값)",
    async () => {
      const { Pool } = await import("pg");
      const runtimePool = new Pool({
        connectionString: process.env.RLS_TEST_DATABASE_URL!,
      });
      try {
        const result = await runtimePool.query("SELECT * FROM conversations");
        expect(result.rowCount).toBe(0);
      } finally {
        await runtimePool.end();
      }
    },
  );

  it.skipIf(!HAS_DB).each([
    "conversation",
    "conversationMember",
    "message",
    "messageAttachment",
    "messageMention",
    "messageReceipt",
    "userBlock",
    "abuseReport",
    "notificationPreference",
  ] as const)("M5-%s: cross-tenant leak 0 (메신저 9 model)", async (model) => {
    await runWithTenant({ tenantId: TENANTS.a }, async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = prismaWithTenant as any;
      const rows: Array<{ tenantId: string }> = await client[model].findMany();
      for (const row of rows) {
        expect(row.tenantId).toBe(TENANTS.a);
      }
    });
  });
});
