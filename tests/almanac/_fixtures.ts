/**
 * tests/almanac/_fixtures.ts
 *
 * PLUGIN-MIG-4 (S100, 2026-05-16) — Almanac plugin 라이브 RLS 검증 fixture.
 *
 * 패턴: tests/messenger/_fixtures.ts (세션 67) 와 동일 구조.
 *   - admin pool (BYPASSRLS) 로 seed → runtime helper(prismaWithTenant) 가 RLS 안에서 검증.
 *   - 두 tenant (a/b) 를 항상 셋업하여 cross-tenant 침투 회귀를 자동 보장.
 *
 * 환경:
 *   - HAS_DB: RLS_TEST_DATABASE_URL + RLS_TEST_ADMIN_DATABASE_URL 둘 다 설정 시만 true.
 *   - HAS_DB 미설정 환경에서는 모든 테스트가 it.skipIf 로 PASS (CI 게이트는 dev 환경에서만 활성).
 *
 * PR 게이트 #4 (CLAUDE.md): non-BYPASSRLS role 로 라이브 테스트 1회 통과 — `bash scripts/run-integration-tests.sh tests/almanac/`.
 */
import { afterAll, beforeAll, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";

// messenger 와 다른 UUID — bootstrapTenants 충돌 회피 (id 다름).
export const TENANTS = {
  a: "aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa",
  b: "bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb",
} as const;

export type TenantId = (typeof TENANTS)[keyof typeof TENANTS];

export const HAS_DB =
  !!process.env.RLS_TEST_DATABASE_URL &&
  !!process.env.RLS_TEST_ADMIN_DATABASE_URL;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PgPool = any;

let _adminPool: PgPool | null = null;
let _bootstrapped = false;

export async function getAdminPool(): Promise<PgPool> {
  if (!HAS_DB) {
    throw new Error(
      "Admin pool requested but HAS_DB=false. Guard tests with it.skipIf(!HAS_DB).",
    );
  }
  if (!_adminPool) {
    const { Pool } = await import("pg");
    _adminPool = new Pool({
      connectionString: process.env.RLS_TEST_ADMIN_DATABASE_URL!,
    });
  }
  return _adminPool;
}

export async function closeAdminPool(): Promise<void> {
  if (_adminPool) {
    await _adminPool.end();
    _adminPool = null;
    _bootstrapped = false;
  }
}

/**
 * 두 test tenant row 삽입 (idempotent). tenants 테이블은 RLS 미적용.
 */
export async function bootstrapTenants(): Promise<void> {
  if (!HAS_DB || _bootstrapped) return;
  const pool = await getAdminPool();
  await pool.query(
    `INSERT INTO tenants (id, slug, display_name, status, created_at, updated_at)
     VALUES ($1, 'almanac-test-a', 'Almanac Test Tenant A', 'active', NOW(), NOW()),
            ($2, 'almanac-test-b', 'Almanac Test Tenant B', 'active', NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [TENANTS.a, TENANTS.b],
  );
  _bootstrapped = true;
}

/**
 * 두 tenant 의 Almanac 5 모델 데이터 일괄 정리.
 * FK 의존성 역방향: metrics → items → ingested_items → sources → categories.
 */
export async function resetAlmanacData(): Promise<void> {
  if (!HAS_DB) return;
  const pool = await getAdminPool();
  const tenantArr = [TENANTS.a, TENANTS.b];
  await pool.query(
    `DELETE FROM content_item_metrics WHERE tenant_id = ANY($1::uuid[])`,
    [tenantArr],
  );
  await pool.query(
    `DELETE FROM content_items WHERE tenant_id = ANY($1::uuid[])`,
    [tenantArr],
  );
  await pool.query(
    `DELETE FROM content_ingested_items WHERE tenant_id = ANY($1::uuid[])`,
    [tenantArr],
  );
  await pool.query(
    `DELETE FROM content_sources WHERE tenant_id = ANY($1::uuid[])`,
    [tenantArr],
  );
  await pool.query(
    `DELETE FROM content_categories WHERE tenant_id = ANY($1::uuid[])`,
    [tenantArr],
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Seeders — admin pool 로 직접 INSERT (BYPASSRLS).
// ─────────────────────────────────────────────────────────────────────────

export interface CreateCategoryInput {
  tenantId: TenantId | string;
  track: string;
  slug: string;
  name: string;
}

export interface SeededCategory {
  id: string;
  tenantId: string;
  slug: string;
}

export async function createCategory(
  input: CreateCategoryInput,
): Promise<SeededCategory> {
  const pool = await getAdminPool();
  // cuid 는 앱 레이어 생성 — 테스트에서는 randomUUID slug 로 대체 (TEXT @id 가 cuid 강제 안 함).
  const id = `cat-${randomUUID().slice(0, 12)}`;
  const r = await pool.query(
    `INSERT INTO content_categories (id, tenant_id, track, slug, name, sort_order, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 0, NOW(), NOW())
     RETURNING id, tenant_id, slug`,
    [id, input.tenantId, input.track, input.slug, input.name],
  );
  const row = r.rows[0] as { id: string; tenant_id: string; slug: string };
  return { id: row.id, tenantId: row.tenant_id, slug: row.slug };
}

export interface CreateSourceInput {
  tenantId: TenantId | string;
  slug: string;
  name: string;
  url: string;
  kind: "RSS" | "HTML" | "API" | "FIRECRAWL";
}

export interface SeededSource {
  id: number;
  tenantId: string;
  slug: string;
}

export async function createSource(
  input: CreateSourceInput,
): Promise<SeededSource> {
  const pool = await getAdminPool();
  const r = await pool.query(
    `INSERT INTO content_sources (tenant_id, slug, name, url, kind, parser_config, active, consecutive_failures, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::"ContentSourceKind", '{}'::jsonb, true, 0, NOW(), NOW())
     RETURNING id, tenant_id, slug`,
    [input.tenantId, input.slug, input.name, input.url, input.kind],
  );
  const row = r.rows[0] as { id: number; tenant_id: string; slug: string };
  return { id: row.id, tenantId: row.tenant_id, slug: row.slug };
}

export interface CreateItemInput {
  tenantId: TenantId | string;
  sourceId: number;
  track: string;
  slug: string;
  title: string;
  url: string;
  publishedAt?: Date;
}

export interface SeededItem {
  id: string;
  tenantId: string;
  slug: string;
}

export async function createItem(input: CreateItemInput): Promise<SeededItem> {
  const pool = await getAdminPool();
  const id = `item-${randomUUID().slice(0, 12)}`;
  const r = await pool.query(
    `INSERT INTO content_items (
       id, tenant_id, source_id, track, slug, title, excerpt, url,
       published_at, first_seen_at, score, pinned, featured, quality_flag,
       view_count, click_count, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, '', $7, $8, NOW(), 0, false, false, 'auto_ok'::"ContentQualityFlag", 0, 0, NOW(), NOW())
     RETURNING id, tenant_id, slug`,
    [
      id,
      input.tenantId,
      input.sourceId,
      input.track,
      input.slug,
      input.title,
      input.url,
      input.publishedAt ?? new Date(),
    ],
  );
  const row = r.rows[0] as { id: string; tenant_id: string; slug: string };
  return { id: row.id, tenantId: row.tenant_id, slug: row.slug };
}

// ─────────────────────────────────────────────────────────────────────────
// 통합 hook — describe 안에서 setupAlmanacFixtures() 한 줄로 등록.
// ─────────────────────────────────────────────────────────────────────────

let _modulesLoaded: {
  prismaWithTenant: typeof import("@/lib/db/prisma-tenant-client").prismaWithTenant;
  runWithTenant: typeof import("@yangpyeon/core/tenant/context").runWithTenant;
} | null = null;

export async function loadRuntimeModules() {
  if (!HAS_DB) {
    throw new Error("Runtime modules requested but HAS_DB=false.");
  }
  if (_modulesLoaded) return _modulesLoaded;
  const a = await import("../../src/lib/db/prisma-tenant-client");
  const b = await import("../../packages/core/src/tenant/context");
  _modulesLoaded = {
    prismaWithTenant: a.prismaWithTenant,
    runWithTenant: b.runWithTenant,
  };
  return _modulesLoaded;
}

export function setupAlmanacFixtures(): {
  hasDb: boolean;
  modules: () => Promise<NonNullable<typeof _modulesLoaded>>;
} {
  beforeAll(async () => {
    if (!HAS_DB) return;
    await bootstrapTenants();
    await loadRuntimeModules();
  });

  beforeEach(async () => {
    if (!HAS_DB) return;
    await resetAlmanacData();
  });

  afterAll(async () => {
    if (!HAS_DB) return;
    await closeAdminPool();
  });

  return {
    hasDb: HAS_DB,
    modules: async () => {
      if (!_modulesLoaded) {
        await loadRuntimeModules();
      }
      return _modulesLoaded!;
    },
  };
}
