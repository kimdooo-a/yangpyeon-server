/**
 * tests/messenger/_fixtures.ts
 *
 * 세션 67 (2026-04-26) — M2 도메인 헬퍼 단위 테스트 공용 fixture.
 *
 * 설계:
 *   - admin pool (BYPASSRLS) 로 seed → runtime helper(prismaWithTenant) 가 RLS 안에서 검증.
 *   - 두 tenant (a/b) 를 항상 셋업하여 cross-tenant 침투 회귀를 자동 보장.
 *   - 테스트별로 필요한 시나리오를 조합할 수 있도록 building block 노출.
 *
 * 환경:
 *   - HAS_DB: RLS_TEST_DATABASE_URL + RLS_TEST_ADMIN_DATABASE_URL 둘 다 설정 시만 true.
 *   - HAS_DB 미설정 환경에서는 모든 테스트가 it.skip 으로 통과 (CI 게이트는 dev 환경에서만 활성).
 *
 * 사용:
 *   ```ts
 *   import { setupMessengerFixtures, TENANTS, createUser, createConversation } from "./_fixtures";
 *   const fx = setupMessengerFixtures();
 *   it.skipIf(!fx.hasDb)("...", async () => {
 *     const u = await createUser({ tenantId: TENANTS.a, email: "alice@x.com" });
 *     ...
 *   });
 *   ```
 */
import { afterAll, beforeAll, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";

export const TENANTS = {
  a: "11111111-1111-1111-1111-111111111111",
  b: "22222222-2222-2222-2222-222222222222",
} as const;

export type TenantId = (typeof TENANTS)[keyof typeof TENANTS];

export const HAS_DB =
  !!process.env.RLS_TEST_DATABASE_URL &&
  !!process.env.RLS_TEST_ADMIN_DATABASE_URL;

// pg.Pool 타입 — generated client 가 @ts-nocheck 로 외부에 expose 안 됨.
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
 * 두 test tenant row 삽입 (idempotent).
 * tenants 테이블은 RLS 적용 안 됨 (인증 인프라 전 단계) — admin pool 로 직접 INSERT.
 */
export async function bootstrapTenants(): Promise<void> {
  if (!HAS_DB || _bootstrapped) return;
  const pool = await getAdminPool();
  await pool.query(
    `INSERT INTO tenants (id, slug, display_name, status, created_at, updated_at)
     VALUES ($1, 'msg-test-a', 'Messenger Test Tenant A', 'active', NOW(), NOW()),
            ($2, 'msg-test-b', 'Messenger Test Tenant B', 'active', NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [TENANTS.a, TENANTS.b],
  );
  _bootstrapped = true;
}

/**
 * 두 tenant 의 메신저 데이터 + 테스트 user 일괄 정리.
 * FK 의존성 순서로 DELETE — children → parents.
 */
export async function resetMessengerData(): Promise<void> {
  if (!HAS_DB) return;
  const pool = await getAdminPool();
  const tenantArr = [TENANTS.a, TENANTS.b];

  // 자식 테이블 먼저 (FK CASCADE 가 일부를 자동 처리하지만 안전상 명시).
  await pool.query(
    `DELETE FROM message_attachments WHERE tenant_id = ANY($1::uuid[])`,
    [tenantArr],
  );
  await pool.query(
    `DELETE FROM message_mentions WHERE tenant_id = ANY($1::uuid[])`,
    [tenantArr],
  );
  await pool.query(
    `DELETE FROM message_receipts WHERE tenant_id = ANY($1::uuid[])`,
    [tenantArr],
  );
  await pool.query(
    `DELETE FROM messages WHERE tenant_id = ANY($1::uuid[])`,
    [tenantArr],
  );
  await pool.query(
    `DELETE FROM conversation_members WHERE tenant_id = ANY($1::uuid[])`,
    [tenantArr],
  );
  await pool.query(
    `DELETE FROM conversations WHERE tenant_id = ANY($1::uuid[])`,
    [tenantArr],
  );
  await pool.query(
    `DELETE FROM user_blocks WHERE tenant_id = ANY($1::uuid[])`,
    [tenantArr],
  );
  await pool.query(
    `DELETE FROM abuse_reports WHERE tenant_id = ANY($1::uuid[])`,
    [tenantArr],
  );
  await pool.query(
    `DELETE FROM notification_preferences WHERE tenant_id = ANY($1::uuid[])`,
    [tenantArr],
  );
  // tenant_memberships 정리 (test user 들이 사라지므로 cascade 가능하지만 명시).
  await pool.query(
    `DELETE FROM tenant_memberships WHERE tenant_id = ANY($1::uuid[])`,
    [tenantArr],
  );
  // test 시작/종료 시 user 도 정리. 테스트 email pattern 으로 좁혀 다른 시드와 충돌 회피.
  await pool.query(`DELETE FROM users WHERE email LIKE 'mxtest-%@x.com'`);
}

// ─────────────────────────────────────────────────────────────────────────
// Seeders — 테스트가 필요한 row 를 admin pool 로 직접 INSERT.
// helper 단위 테스트는 RLS 안에서 동작하므로 세팅 단계는 BYPASS 가 필수.
// ─────────────────────────────────────────────────────────────────────────

export interface CreateUserInput {
  tenantId: TenantId | string;
  email: string;
  name?: string | null;
  /**
   * true 면 TenantMembership 도 함께 INSERT (cookie auth 경로 통과).
   * 기본 true — 헬퍼 대부분이 동일 tenant 멤버 검증을 한다.
   */
  withMembership?: boolean;
  membershipRole?: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
}

export interface SeededUser {
  id: string;
  tenantId: string;
  email: string;
}

export async function createUser(input: CreateUserInput): Promise<SeededUser> {
  const pool = await getAdminPool();
  const r = await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, is_active, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'h', $3, true, NOW(), NOW())
     RETURNING id, tenant_id, email`,
    [input.tenantId, input.email, input.name ?? null],
  );
  const row = r.rows[0] as { id: string; tenant_id: string; email: string };

  if (input.withMembership !== false) {
    await pool.query(
      `INSERT INTO tenant_memberships (id, tenant_id, user_id, role, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())
       ON CONFLICT ON CONSTRAINT tenant_memberships_tenant_id_user_id_key DO NOTHING`,
      [input.tenantId, row.id, input.membershipRole ?? "MEMBER"],
    );
  }
  return { id: row.id, tenantId: row.tenant_id, email: row.email };
}

export interface CreateConversationInput {
  tenantId: TenantId | string;
  kind: "DIRECT" | "GROUP" | "CHANNEL";
  creatorId: string;
  /** 모든 멤버 (creator 포함). DIRECT 면 정확히 2명. */
  memberIds: string[];
  title?: string | null;
  archivedAt?: Date | null;
  lastMessageAt?: Date | null;
  /** 멤버별 role 매핑. 미지정 시 creator=OWNER, 나머지=MEMBER. */
  memberRoles?: Record<string, "OWNER" | "ADMIN" | "MEMBER">;
}

export interface SeededConversation {
  id: string;
  tenantId: string;
  kind: string;
}

export async function createConversation(
  input: CreateConversationInput,
): Promise<SeededConversation> {
  const pool = await getAdminPool();
  const c = await pool.query(
    `INSERT INTO conversations (
       id, tenant_id, kind, title, created_by_id, last_message_at,
       archived_at, created_at, updated_at
     )
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())
     RETURNING id, tenant_id, kind`,
    [
      input.tenantId,
      input.kind,
      input.title ?? null,
      input.creatorId,
      input.lastMessageAt ?? null,
      input.archivedAt ?? null,
    ],
  );
  const conv = c.rows[0] as { id: string; tenant_id: string; kind: string };

  for (const userId of input.memberIds) {
    const role =
      input.memberRoles?.[userId] ??
      (userId === input.creatorId ? "OWNER" : "MEMBER");
    await pool.query(
      `INSERT INTO conversation_members (
         id, tenant_id, conversation_id, user_id, role, joined_at
       )
       VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
       ON CONFLICT (conversation_id, user_id) DO NOTHING`,
      [input.tenantId, conv.id, userId, role],
    );
  }

  return { id: conv.id, tenantId: conv.tenant_id, kind: conv.kind };
}

export interface CreateMessageInput {
  tenantId: TenantId | string;
  conversationId: string;
  senderId: string | null;
  body: string | null;
  kind?: "TEXT" | "IMAGE" | "FILE" | "VOICE" | "STICKER" | "SYSTEM";
  clientGeneratedId?: string;
  replyToId?: string | null;
  createdAt?: Date;
  deletedAt?: Date | null;
}

export interface SeededMessage {
  id: string;
  tenantId: string;
  conversationId: string;
  clientGeneratedId: string;
}

export async function createMessage(
  input: CreateMessageInput,
): Promise<SeededMessage> {
  const pool = await getAdminPool();
  const cgid =
    input.clientGeneratedId ?? `mxtest-${Math.random().toString(36).slice(2)}`;
  const r = await pool.query(
    `INSERT INTO messages (
       id, tenant_id, conversation_id, sender_id, kind, body,
       reply_to_id, client_generated_id, deleted_at, created_at
     )
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, tenant_id, conversation_id, client_generated_id`,
    [
      input.tenantId,
      input.conversationId,
      input.senderId,
      input.kind ?? "TEXT",
      input.body,
      input.replyToId ?? null,
      cgid,
      input.deletedAt ?? null,
      input.createdAt ?? new Date(),
    ],
  );
  const row = r.rows[0] as {
    id: string;
    tenant_id: string;
    conversation_id: string;
    client_generated_id: string;
  };
  return {
    id: row.id,
    tenantId: row.tenant_id,
    conversationId: row.conversation_id,
    clientGeneratedId: row.client_generated_id,
  };
}

export interface CreateBlockInput {
  tenantId: TenantId | string;
  blockerId: string;
  blockedId: string;
  reason?: string;
}

export async function createBlock(input: CreateBlockInput): Promise<{ id: string }> {
  const pool = await getAdminPool();
  const r = await pool.query(
    `INSERT INTO user_blocks (id, tenant_id, blocker_id, blocked_id, reason, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
     RETURNING id`,
    [input.tenantId, input.blockerId, input.blockedId, input.reason ?? null],
  );
  return { id: (r.rows[0] as { id: string }).id };
}

// ─────────────────────────────────────────────────────────────────────────
// 통합 hook — 각 테스트 파일의 표준 셋업.
// describe 안에서 setupMessengerFixtures() 한 줄로 beforeAll/beforeEach/afterAll 등록.
// ─────────────────────────────────────────────────────────────────────────

let _modulesLoaded: {
  prismaWithTenant: typeof import("@/lib/db/prisma-tenant-client").prismaWithTenant;
  runWithTenant: typeof import("@yangpyeon/core/tenant/context").runWithTenant;
  withTenantTx: typeof import("@/lib/db/prisma-tenant-client").withTenantTx;
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
    withTenantTx: a.withTenantTx,
  };
  return _modulesLoaded;
}

/**
 * 표준 셋업 — describe 블록 첫 줄에서 호출.
 * 반환된 객체로 hasDb 분기 + runtime modules 접근.
 */
export function setupMessengerFixtures(): {
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
    await resetMessengerData();
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

/**
 * 편의: tenant_a 에 alice/bob 2명 + DIRECT 대화 1개 — 가장 흔한 시나리오.
 * 차단/신고 테스트의 baseline.
 */
export async function seedAliceBobDirect(): Promise<{
  alice: SeededUser;
  bob: SeededUser;
  conv: SeededConversation;
}> {
  const stamp = randomUUID().slice(0, 8);
  const alice = await createUser({
    tenantId: TENANTS.a,
    email: `mxtest-alice-${stamp}@x.com`,
    name: "Alice",
  });
  const bob = await createUser({
    tenantId: TENANTS.a,
    email: `mxtest-bob-${stamp}@x.com`,
    name: "Bob",
  });
  const conv = await createConversation({
    tenantId: TENANTS.a,
    kind: "DIRECT",
    creatorId: alice.id,
    memberIds: [alice.id, bob.id],
    memberRoles: { [alice.id]: "OWNER", [bob.id]: "OWNER" },
  });
  return { alice, bob, conv };
}
