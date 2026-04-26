# M2 Detailed Plan — Yangpyeong Messenger Phase 1 / W2

> **소스**: 세션 68 정밀화 (2026-04-26, M1 commit 2048378 검증 후 + Almanac aggregator 세션 66 패턴 흡수)
> **상위**: `milestones.md §2 M2 (W2)`, `api-surface.md §2`, `data-model.md §2`
> **하위**: M2 도메인 헬퍼 + 라우트 + 테스트 산출물 (다음 1~3 세션)
> **선행**: M1 (commit `2048378`) ACCEPTED, schema 검증 통과

---

## 0. 한 줄 요약

> M1은 9 model + 6 enum + 6 마이그레이션 + RLS 정책 + FK 모두 정확히 적용되어 *데이터 layer* 가 cross-tenant 누출을 물리적으로 차단한다. M2는 *비즈니스 layer* 를 추가한다 — 19개 REST 라우트는 Almanac이 검증한 `withTenant + prismaWithTenant` 패턴을 그대로 답습하되, 메신저 도메인 고유의 4개 비즈니스 룰(멱등성·차단·한도·역할) 을 4개 도메인 헬퍼에 단일 진실 소스로 모은다.

---

## 1. M1 점검 결과 (commit 2048378, 9/9 PASS)

| 항목 | 검증 결과 | 근거 |
|---|---|---|
| 9 model + 6 enum schema | ✅ PASS | `prisma/schema.prisma:866-1105` |
| `tenantId` 첫 컬럼 + dbgenerated | ✅ PASS | 9 model 전부 동일 패턴 (line 913, 940, 966, 1000, 1018, 1034, 1050, 1068, 1091) |
| `clientGeneratedId` UNIQUE `(tenantId, conversationId, clientGeneratedId)` | ✅ PASS | schema line 991 + 마이그 020 line 51 |
| `UserBlock` UNIQUE `(blockerId, blockedId)` | ✅ PASS | schema line 1059 |
| `AbuseReport` UNIQUE `(reporterId, targetKind, targetId)` | ✅ PASS | schema line 1082 |
| `MessageMention` UNIQUE `(messageId, mentionedUserId)` | ✅ PASS | schema line 1026 |
| `MessageReceipt` PK `(conversationId, userId)` | ✅ PASS | schema line 1042 |
| `NotificationPreference` PK `(tenantId, userId)` + global `userId @unique` | ✅ PASS | schema line 1092, 1103 |
| `MessageAttachment.fileId → files(id) ON DELETE RESTRICT` | ✅ PASS | 마이그 020 line 92-95 (raw SQL ALTER) |
| 6 마이그 적용 (`prisma migrate status`) | ✅ PASS | 28 마이그 up to date (커밋 메시지) |
| RLS 9 테이블 enable + force + tenant_isolation 정책 | ✅ PASS | 마이그 050 + 검증 쿼리 RAISE EXCEPTION |
| GRANT `app_runtime` SELECT/INSERT/UPDATE/DELETE | ✅ PASS | 마이그 050 line 49-58 |
| partial index `messages_active_idx` (deleted_at IS NULL) | ✅ PASS | 마이그 040 line 24-26 |
| GIN trgm `messages_search_gin` (body) | ✅ PASS | 마이그 040 line 32-34 + `pg_trgm` ext line 18 |
| RLS 단위 테스트 13 it (env-gated) | ✅ PASS (skip) | `tests/messenger/rls.test.ts` 정상 skip — `RLS_TEST_DATABASE_URL` 미설정 |
| TSC + ESLint `tenant/no-raw-prisma-without-tenant` 0 violations | ✅ PASS | 커밋 메시지 검증 결과 |
| spike-006 (PG NOTIFY/SSE Conditional Go) | ✅ PASS | `docs/research/spikes/spike-006-pg-notify-sse.md` |

### 1.1 M2 진입 전 *추가* 권장 작업 — 1건

| 작업 | 비고 | 우선순위 |
|---|---|---|
| RLS 단위 테스트 *실증 1회* (`RLS_TEST_DATABASE_URL` + `RLS_TEST_ADMIN_DATABASE_URL` 셋팅 후 13 it pass 확인) | M1 완료 증명 + M2 통합 테스트 환경 셋업 비용 동시 회수. 30분 예상 (1회만 하면 M2 vitest 통합 테스트도 같은 env 재사용) | M2 시작 전 |

이 작업은 *권장* 이며 게이트는 아닙니다. 미실행 상태로 M2 도메인 헬퍼 작성을 시작해도 됩니다 (TS 단위 테스트는 RLS 무관). 다만 라우트 통합 테스트 단계 (M2 후반) 진입 전 이 env 가 셋팅되어 있어야 합니다.

---

## 2. M2 핵심 결정 7건 (정밀화)

### 결정 1: 라우트 prefix = `/api/v1/t/[tenant]/messenger/...` (Phase 1부터)

**근거**:
- ADR-027 §2.2 *명시 라우트 우선* + Almanac이 세션 66 에서 검증한 패턴 (`/api/v1/t/[tenant]/categories/`)
- `withTenant` 가드 + `prismaWithTenant` Extension 의 작동 전제 = TenantContext 주입. 묵시 default tenant 라우트는 매 핸들러마다 `runWithTenant({tenantId: defaultTenantId}, ...)` 보일러플레이트 발생.
- ADR-030 옵션 C의 "Phase 2 plugin 진입 시 코드 이동" 비용 = path 변경분만큼 회수 (코드 이동 0줄)
- ESLint rule `tenant/no-raw-prisma-without-tenant` 가 자동 강제 (Almanac 패턴 답습)

**갱신 대상**:
- `api-surface.md §2` — 모든 라우트에 prefix 추가 (PRD 작성 시점에는 Almanac 검증 전이라 prefix 없이 작성됨)
- `api-surface.md §3` — 동일 prefix 가 *이미* 작성되어 있으므로 §2 와 머지 (Phase 1·2 동일 prefix, 차이는 plugin 분리 위치만)

**운영자 콘솔 UI 영향**:
- `src/app/(protected)/messenger/...` 의 fetch 호출이 `/api/v1/t/default/messenger/...` 형태로 path에 슬러그 자동 주입
- 운영자 본인은 default tenant slug 를 의식하지 않음 (UI 내부 detail)
- 슬러그는 프로젝트 상수 `DEFAULT_TENANT_SLUG = "default"` 단일 진실 소스에서 가져옴

### 결정 2: 도메인 헬퍼 4개 = 비즈니스 룰의 단일 진실 소스

19개 라우트가 핸들러마다 멱등성/차단/한도/역할 검증을 *복붙* 하면 룰 변경 시 19곳 동기화 비용 + 누락 위험. 도메인 헬퍼 4개에 룰을 모으고, 라우트는 가드 + I/O 변환 + 헬퍼 호출만 담당.

| 헬퍼 | 책임 | 핵심 함수 시그니처 |
|---|---|---|
| `src/lib/messenger/conversations.ts` | DM 페어 멱등, member TenantMembership 검증, GROUP 100명 한도 | `findOrCreateDirect(...)`, `createGroup(...)`, `addMembers(...)`, `removeMember(...)`, `updateMemberSelf(...)`, `archiveConversation(...)` |
| `src/lib/messenger/messages.ts` | clientGeneratedId 멱등 송신, edit 15분/recall 24h 한도, deletedAt soft delete | `sendMessage(...)`, `editMessage(...)`, `recallMessage(...)`, `listMessages(...)`, `searchMessages(...)` |
| `src/lib/messenger/blocks.ts` | 양방향 차단 검증 (A↔B 모든 송수신/멘션), 차단 dialog 경고 데이터 | `isBlocked(...)`, `blockUser(...)`, `unblockUser(...)`, `listMyBlocks(...)` |
| `src/lib/messenger/reports.ts` | 신고 UNIQUE 중복 거부, 운영자 처리 액션, 신고자 알림 | `fileReport(...)`, `resolveReport(...)`, `listOpenReports(...)` |

각 헬퍼는 *항상* `prismaWithTenant` 사용 (ESLint rule 강제). raw `$queryRaw` / 글로벌 `prisma` import 금지.

### 결정 3: 멱등성은 헬퍼 + DB UNIQUE 제약 *둘 다* 강제

라인 LocalMessageId 패턴. 클라이언트가 UUIDv7 생성 → request body `clientGeneratedId`. 서버는 다음 순서로 처리:

```ts
// src/lib/messenger/messages.ts (sendMessage)
async function sendMessage(input: SendMessageInput): Promise<Message> {
  // 1. 사전 lookup — 이미 있으면 fetch return (200)
  const existing = await prismaWithTenant.message.findUnique({
    where: {
      tenantId_conversationId_clientGeneratedId: {
        tenantId: getCurrentTenant().tenantId,
        conversationId: input.conversationId,
        clientGeneratedId: input.clientGeneratedId,
      },
    },
  });
  if (existing) return existing;

  // 2. INSERT — 동시성 충돌 시 UNIQUE 위반 catch
  try {
    return await prismaWithTenant.message.create({ data: ... });
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      // race condition — 다른 동시 요청이 INSERT 성공
      const fresh = await prismaWithTenant.message.findUnique({ ... });
      if (fresh) return fresh;
    }
    throw err;
  }
}
```

이 패턴은 `tests/messenger/messages.idempotency.test.ts` 에서 동시성 시뮬레이션 (Promise.all 50회 동일 clientGeneratedId 송신 → 정확히 1개 INSERT, 50개 응답 모두 같은 message.id) 으로 검증.

### 결정 4: tenant 내부 role 매핑 = `withTenantRole` 채택

api-guard-tenant.ts §`withTenantRole` 이 이미 구현되어 있다. Phase 1.3 시점에 K3 통과 키 = 내부 ADMIN 으로 간주. 메신저 라우트는:

| 권한 등급 | 사용 라우트 | 가드 |
|---|---|---|
| ConversationMember (대화 안) | GET messages, POST typing, POST receipts, GET conversation 단건 | `withTenant` + 헬퍼에서 member 검증 |
| 대화 OWNER/ADMIN | PATCH conversation, POST/DELETE members | `withTenant` + 헬퍼에서 role 검증 |
| Tenant member (대화 외) | POST/GET conversations 목록, search, blocks, reports, prefs | `withTenant` |
| Tenant OWNER/ADMIN (운영자) | `/api/v1/t/[tenant]/messenger/admin/*` | `withTenantRole(["OWNER","ADMIN"], ...)` |

운영자 패널 라우트 4종(reports queue / reports resolve / health / quota) 만 `withTenantRole` 사용. 나머지 15종은 `withTenant` + 헬퍼 내 conversation member/role 검증.

### 결정 5: 통합 테스트는 vitest + 실제 DB (RLS 검증 환경 재사용)

M1 의 `tests/messenger/rls.test.ts` 가 사용한 `RLS_TEST_DATABASE_URL` + `RLS_TEST_ADMIN_DATABASE_URL` 패턴을 그대로 재사용. M2 통합 테스트는:

```
tests/messenger/
├── rls.test.ts                      # 기존 (M1)
├── conversations.test.ts            # 새 (M2) — DM 페어 멱등, GROUP 한도
├── messages.test.ts                 # 새 (M2) — clientGeneratedId 멱등, edit/recall 한도
├── messages.idempotency.test.ts     # 새 (M2) — 동시성 시뮬레이션
├── blocks.test.ts                   # 새 (M2) — 양방향 차단, 송신 차단
├── reports.test.ts                  # 새 (M2) — UNIQUE 중복, 운영자 처리
├── routes/
│   ├── conversations.route.test.ts  # 새 (M2) — HTTP layer
│   ├── messages.route.test.ts       # 새 (M2)
│   ├── members.route.test.ts        # 새 (M2)
│   └── admin.route.test.ts          # 새 (M2) — 운영자 패널
└── _fixtures.ts                     # 새 (M2) — 테스트 tenant/user/conv 시드 헬퍼
```

라우트 테스트는 Next.js handler 를 직접 호출 (Request 객체 생성 → handler invoke → Response 검증). HTTP 서버 부팅 없음.

### 결정 6: Audit 이벤트 5종 발화 = 머지 게이트

각 라우트의 *부수 효과* 가 audit_logs에 발화되는지 자동 검증. 5종 + 운영자 액션 4종 = 9종 (머지 게이트는 메인 5종):

| 이벤트 코드 | 발화 라우트 | 페이로드 |
|---|---|---|
| `messenger.message_sent` | POST /messages | `{conversationId, messageId, kind}` |
| `messenger.message_edited` | PATCH /messages/:id | `{messageId, editCount}` |
| `messenger.message_deleted` | DELETE /messages/:id | `{messageId, deletedBy}` |
| `messenger.member_added` | POST /members | `{conversationId, addedUserIds[]}` |
| `messenger.member_removed` | DELETE /members/:userId | `{conversationId, removedUserId}` |
| `messenger.report_filed` | POST /abuse-reports | `{targetKind, targetId, reportId}` |
| `messenger.report_resolved` | POST /admin/reports/:id/resolve | `{reportId, action}` |
| `messenger.user_blocked` | POST /user-blocks | `{blockedUserId, blockId}` |
| `messenger.user_unblocked` | DELETE /user-blocks/:id | `{blockedUserId}` |

`auditLogSafe()` 헬퍼는 기존 사용. 라우트 테스트에서 audit_logs row 존재 여부를 SELECT 로 검증 (M3 SSE publish 검증 패턴과 동일).

### 결정 7: rate-limit 적용 = `src/lib/rate-limit-db` 재사용 (신설 0)

api-surface.md §1.5 의 5개 한도(POST /messages 분당 60, POST /typing 1/sec, POST /abuse-reports 분당 5, POST /push/subscribe 시간당 5, GET /messages/search 분당 30) 는 기존 `src/lib/rate-limit-db.ts` 의 `withRateLimit()` 헬퍼 그대로 적용. 메신저 도메인 코드는 데코레이터 호출만.

```ts
// src/app/api/v1/t/[tenant]/messenger/conversations/[id]/messages/route.ts
export const POST = withTenant(
  withRateLimit({ key: "messenger.message_send", windowSec: 60, max: 60 },
    async (request, user, tenant, ctx) => { ... }
  )
);
```

신규 인프라 도입 0. ADR-022 §6 "불변 코어" 부합.

---

## 3. 도메인 헬퍼 4개 — 정밀 시그니처

### 3.1 `src/lib/messenger/conversations.ts`

```ts
import type { Conversation, ConversationMember } from "@prisma/client";
import { prismaWithTenant, withTenantTx } from "@/lib/api-guard-tenant";
import { getCurrentTenant } from "@yangpyeon/core";
import { isBlocked } from "./blocks";
import { findTenantMembership } from "@/lib/tenant-router/membership";

export const GROUP_MEMBER_LIMIT = 100; // ADR-030 부속결정 #5 (Q5 결정 시 변경)

export type ConversationWithLastMessage = Conversation & {
  lastMessage: { id: string; body: string | null; kind: string; createdAt: Date; senderId: string | null } | null;
  unreadCount: number;
  members: Pick<ConversationMember, "userId" | "role">[];
};

/**
 * DM 페어 멱등 — 같은 (creator, peer) 의 활성 DIRECT conv 가 있으면 반환, 없으면 생성.
 * ADR-030 부속결정 #5 + api-surface.md §2.1.
 *
 * 검증:
 *   - peer 가 동일 tenant 의 활성 멤버인가 (TenantMembership.leftAt IS NULL)
 *   - creator/peer 양방향 차단 없는가
 */
export async function findOrCreateDirect(input: {
  creatorId: string;
  peerId: string;
}): Promise<{ conversation: Conversation; created: boolean }>;

/**
 * GROUP 생성 — creator + memberIds 자동 포함.
 *
 * 검증:
 *   - memberIds.length 1~99 (creator 포함 ≤100)
 *   - 모든 memberId 가 동일 tenant 의 활성 멤버
 *   - 차단 관계 사용자 포함 시 → throw GROUP_MEMBER_BLOCKED
 *   - title 1~80자 (Zod 단계에서 사전 검증)
 *
 * 트랜잭션:
 *   - withTenantTx 1회로 conversation INSERT + N members INSERT.
 */
export async function createGroup(input: {
  creatorId: string;
  memberIds: string[];
  title: string;
}): Promise<{ conversation: Conversation; members: ConversationMember[] }>;

/**
 * 멤버 추가 — OWNER/ADMIN 만.
 *
 * 응답 분리:
 *   - added: 정상 추가된 멤버
 *   - skipped: 이미 멤버 / TenantMembership 미참여 / 차단 관계 — reason 포함
 */
export async function addMembers(input: {
  conversationId: string;
  userIds: string[];
  actorRole: "OWNER" | "ADMIN";
}): Promise<{ added: ConversationMember[]; skipped: { userId: string; reason: string }[] }>;

/**
 * 멤버 제거 — OWNER/ADMIN/self.
 *
 * 효과: leftAt SET (soft remove). 메시지 수신 차단, 읽기는 가능.
 */
export async function removeMember(input: {
  conversationId: string;
  removerUserId: string;
  removedUserId: string;
  actorIsAdmin: boolean;
}): Promise<ConversationMember>;

/**
 * 자기 멤버 설정 갱신 (pin/mute).
 */
export async function updateMemberSelf(input: {
  conversationId: string;
  userId: string;
  pinnedAt?: Date | null;
  mutedUntil?: Date | null;
}): Promise<ConversationMember>;

/**
 * 대화 archive (soft delete) — OWNER 만.
 */
export async function archiveConversation(input: {
  conversationId: string;
  actorId: string;
}): Promise<Conversation>;
```

### 3.2 `src/lib/messenger/messages.ts`

```ts
import type { Message, MessageAttachment, MessageMention } from "@prisma/client";

export const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15분
export const RECALL_WINDOW_MS = 24 * 60 * 60 * 1000; // 24시간

export type MessageWithRelations = Message & {
  sender: { id: string; name: string | null; email: string } | null;
  replyTo: Pick<Message, "id" | "body" | "senderId"> | null;
  attachments: MessageAttachment[];
  mentions: MessageMention[];
};

/**
 * 메시지 송신 — clientGeneratedId 멱등 보장.
 *
 * 처리 순서:
 *   1. 차단 검증 (DIRECT 면 peer, GROUP 이면 멘션 대상)
 *   2. clientGeneratedId 사전 lookup (있으면 200 fetch return)
 *   3. INSERT — UNIQUE violation 시 catch + 재 lookup (race condition)
 *   4. conversations.lastMessageAt UPDATE (동일 트랜잭션)
 *   5. audit messenger.message_sent + SSE publish (M3에서 구현)
 *
 * 검증:
 *   - sender 가 conversation 활성 멤버 (leftAt IS NULL)
 *   - replyToId 가 같은 conversation
 *   - attachments[].fileId 의 owner === senderId (남의 파일 첨부 차단)
 *   - mentions[] 의 user 가 동일 tenant 멤버
 */
export async function sendMessage(input: {
  conversationId: string;
  senderId: string;
  kind: "TEXT" | "IMAGE" | "FILE";
  body: string | null;
  clientGeneratedId: string;
  replyToId?: string;
  attachments?: { fileId: string; kind: "IMAGE" | "FILE"; displayOrder: number }[];
  mentions?: string[];
}): Promise<{ message: MessageWithRelations; created: boolean }>;

/**
 * 편집 — sender 본인 + 15분 한도.
 *
 * 부수 효과: editedAt SET, editCount++, audit, SSE publish.
 *
 * Throws:
 *   - EDIT_WINDOW_EXPIRED — createdAt + 15분 < now()
 *   - FORBIDDEN — sender 가 아님
 */
export async function editMessage(input: {
  messageId: string;
  editorId: string;
  newBody: string;
}): Promise<MessageWithRelations>;

/**
 * 회수 — sender 본인 (24h) 또는 운영자 (무제한).
 *
 * 효과: deletedAt SET, body=NULL, deletedBy='self'|'admin'.
 * 첨부는 30일 cron 이 정리 (M5 dereference cleanup).
 *
 * Throws:
 *   - DELETE_WINDOW_EXPIRED — sender + 24h 초과
 *   - FORBIDDEN — sender/admin 아님
 */
export async function recallMessage(input: {
  messageId: string;
  actorId: string;
  actorIsAdmin: boolean;
}): Promise<Message>;

/**
 * 메시지 stream — keyset cursor pagination.
 *
 * Cursor: base64(JSON.stringify({createdAt, id})). desc 정렬 (createdAt, id).
 * Limit: 1~100, default 30.
 */
export async function listMessages(input: {
  conversationId: string;
  cursor?: string;
  limit?: number;
  before?: string;
  after?: string;
}): Promise<{ items: MessageWithRelations[]; nextCursor: string | null; hasMore: boolean }>;

/**
 * 검색 — LIKE %q% on body, 30일 윈도, deleted_at IS NULL, 사용자 멤버 conv 만.
 *
 * GIN trgm index (마이그 040) 가 가속.
 * Phase 2 에서 tsvector + ranking 으로 교체.
 */
export async function searchMessages(input: {
  searcherId: string;
  q: string;
  convId?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ items: SearchResult[]; nextCursor: string | null; hasMore: boolean }>;
```

### 3.3 `src/lib/messenger/blocks.ts`

```ts
/**
 * 양방향 차단 검증 — A→B 차단이면 B→A 도 차단으로 취급.
 *
 * 핫패스: 메시지 송신마다 호출. 인덱스 `(tenantId, blockedId)` 활용.
 *
 * Phase 1: 매 호출 DB hit. Phase 2 진입 시 in-memory cache (LRU) 검토.
 */
export async function isBlocked(input: {
  userIdA: string;
  userIdB: string;
}): Promise<boolean>;

export async function blockUser(input: {
  blockerId: string;
  blockedId: string;
  reason?: string;
}): Promise<UserBlock>;

export async function unblockUser(input: {
  blockerId: string;
  blockId: string;
}): Promise<void>;

export async function listMyBlocks(input: {
  blockerId: string;
}): Promise<UserBlock[]>;
```

### 3.4 `src/lib/messenger/reports.ts`

```ts
/**
 * 신고 — UNIQUE (reporter, targetKind, targetId) 중복 거부.
 *
 * Throws:
 *   - DUPLICATE_REPORT — 동일 reporter+target 이미 OPEN/RESOLVED/DISMISSED
 *   - NOT_FOUND — target message/user 없음 (cross-tenant 침투 방어)
 */
export async function fileReport(input: {
  reporterId: string;
  targetKind: "MESSAGE" | "USER";
  targetId: string;
  reason: string;
}): Promise<AbuseReport>;

/**
 * 운영자 신고 처리 — 3 액션.
 *
 * action 분기:
 *   - DELETE_MESSAGE: targetKind=MESSAGE 일 때 message 회수 (deletedBy='admin')
 *   - BLOCK_USER: targetKind=USER 일 때 tenant-wide 비활성화 (Phase 1.5+)
 *   - DISMISS: status=DISMISSED 만 SET
 */
export async function resolveReport(input: {
  reportId: string;
  resolverId: string;
  action: "DELETE_MESSAGE" | "BLOCK_USER" | "DISMISS";
  note?: string;
}): Promise<{ report: AbuseReport; performedActions: string[] }>;

export async function listOpenReports(input: {
  status?: "OPEN" | "RESOLVED" | "DISMISSED";
  cursor?: string;
  limit?: number;
}): Promise<{ items: AbuseReportWithTarget[]; nextCursor: string | null; hasMore: boolean }>;
```

---

## 4. Zod 스키마 — 9개 (`src/lib/schemas/messenger/`)

기존 프로젝트 zod 패턴 (sticky-notes, aggregator) 답습. 모든 스키마는 `.strict()` 사용 (정의되지 않은 필드 차단).

| 파일 | export 스키마 | request body 검증 |
|---|---|---|
| `conversations.ts` | `createConversationSchema`, `updateConversationSchema`, `updateMemberSelfSchema`, `addMembersSchema` | kind enum, memberIds uuid[], title 1~80자 |
| `messages.ts` | `sendMessageSchema`, `editMessageSchema`, `searchMessagesSchema` | kind enum, body 1~5000자, clientGeneratedId uuid, attachments ≤5장, mentions uuid[] |
| `safety.ts` | `blockUserSchema`, `fileReportSchema`, `resolveReportSchema`, `updateNotificationPrefsSchema` | reason 1~500자, action enum, dndStart/End "HH:MM" regex |

---

## 5. 라우트 19개 — 정확 명세 (prefix `/api/v1/t/[tenant]/messenger`)

| # | Method | Path | 가드 | 헬퍼 호출 | 머지 게이트 테스트 |
|---|---|---|---|---|---|
| 1 | GET | `/conversations` | withTenant | `prismaWithTenant.conversation.findMany` (직접) | conversations.route.test §list |
| 2 | POST | `/conversations` | withTenant | `findOrCreateDirect` 또는 `createGroup` | conversations.route.test §create + idempotency |
| 3 | GET | `/conversations/:id` | withTenant + conv member 검증 | `prismaWithTenant` 직접 | conversations.route.test §get |
| 4 | PATCH | `/conversations/:id` | withTenant + OWNER/ADMIN | `archiveConversation` 또는 직접 | conversations.route.test §patch |
| 5 | DELETE | `/conversations/:id` | withTenant + OWNER | `archiveConversation` (soft) | conversations.route.test §archive |
| 6 | POST | `/conversations/:id/members` | withTenant + OWNER/ADMIN | `addMembers` | members.route.test §add + limit |
| 7 | DELETE | `/conversations/:id/members/:userId` | withTenant + OWNER/ADMIN/self | `removeMember` | members.route.test §remove |
| 8 | PATCH | `/conversations/:id/members/me` | withTenant + self | `updateMemberSelf` | members.route.test §pin-mute |
| 9 | GET | `/conversations/:id/messages` | withTenant + conv member | `listMessages` | messages.route.test §list |
| 10 | POST | `/conversations/:id/messages` | withTenant + conv member + rate-limit 60/min | `sendMessage` | messages.route.test §send + idempotency + blocked + edit-window |
| 11 | PATCH | `/conversations/:id/messages/:msgId` | withTenant + sender | `editMessage` | messages.route.test §edit |
| 12 | DELETE | `/conversations/:id/messages/:msgId` | withTenant + sender 또는 OWNER/ADMIN | `recallMessage` | messages.route.test §recall |
| 13 | POST | `/conversations/:id/typing` | withTenant + member + rate-limit 1/sec | (publish only, M3) | (M3 게이트) |
| 14 | POST | `/conversations/:id/receipts` | withTenant + member | `prismaWithTenant.messageReceipt.upsert` (직접) | messages.route.test §receipts |
| 15 | GET | `/messages/search` | withTenant + rate-limit 30/min | `searchMessages` | messages.route.test §search |
| 16 | POST/GET/DELETE | `/user-blocks` (3 ops 합산) | withTenant + self | `blockUser` / `listMyBlocks` / `unblockUser` | blocks.route.test §full-cycle |
| 17 | POST | `/abuse-reports` | withTenant + rate-limit 5/min | `fileReport` | reports.route.test §file + duplicate |
| 18 | GET/PATCH | `/notification-preferences` (2 ops) | withTenant + self | `prismaWithTenant.notificationPreference.upsert` | prefs.route.test |
| 19 | GET | `/admin/reports`, POST `/admin/reports/:id/resolve` (2 ops) | withTenantRole(["OWNER","ADMIN"]) | `listOpenReports` / `resolveReport` | admin.route.test |

> **합계 산정 노트**: api-surface.md §2 가 19개로 카운트한 것은 ops 단위 (POST/GET/PATCH/DELETE 각각 1개). 위 표는 path 단위로 묶어 표시했지만 실제 라우트 핸들러 함수 export 합계는 19개 (POST/GET 등이 한 route.ts 파일에 공존). 일치.

> **운영자 패널 health/quota 2종 (`/admin/health`, `/admin/quota`)** 은 M6 운영자 시나리오에서 다룸. M2 게이트 외부.

---

## 6. 통합 테스트 시나리오 — 머지 게이트

### 6.1 도메인 헬퍼 단위 테스트 (커버리지 80%+ 게이트)

| 파일 | 테스트 케이스 | 시나리오 |
|---|---|---|
| `conversations.test.ts` | 8건 | DM 페어 멱등 (2회 호출 → 동일 id), GROUP 생성 (creator+1명), GROUP 100명 한도 (101번째 → throw), 차단 관계 추가 거부, TenantMembership 미참여 거부, OWNER/ADMIN 멤버 추가 권한, self leave, archive |
| `messages.test.ts` | 10건 | clientGeneratedId 신규 → 201, 동일 → 200 fetch, edit 14:59:59 → 통과, edit 15:00:01 → throw, recall self 23:59:59 → 통과, recall self 24:00:01 → throw, recall admin 무제한, replyToId cross-conversation 거부, attachments fileId.owner mismatch 거부, mentions 차단 사용자 알림 skip |
| `messages.idempotency.test.ts` | 3건 | Promise.all 50회 동일 clientGeneratedId → 1 INSERT 50 같은 응답, 다른 clientGeneratedId → 50 INSERT, 다른 conversation 동일 clientGeneratedId → 2 INSERT (UNIQUE 는 (tenant, conv, cgid) 이므로) |
| `blocks.test.ts` | 5건 | A→B 차단 후 isBlocked(A,B)=true, isBlocked(B,A)=true (양방향), 차단 후 B→A 송신 실패, 차단 해제 후 송신 성공, 자기 자신 차단 거부 |
| `reports.test.ts` | 6건 | 신규 신고 OK, 동일 신고 재시도 → DUPLICATE, cross-tenant target → NOT_FOUND, resolve DELETE_MESSAGE → 메시지 회수 + 신고 RESOLVED, resolve DISMISS → 메시지 변경 없음 + 신고 DISMISSED, listOpenReports 페이지네이션 |

### 6.2 라우트 통합 테스트 (HTTP layer)

| 시나리오 | 검증 |
|---|---|
| Cross-tenant 침투 | tenant_a 토큰으로 tenant_b 의 conversation/:id 접근 → 403 (RLS + withTenant 이중 방어) |
| 인증 없음 | 모든 라우트 401 UNAUTHORIZED |
| 잘못된 슬러그 | `/api/v1/t/INVALID/messenger/...` → 400 TENANT_INVALID_SLUG |
| 미등록 슬러그 | `/api/v1/t/notexist/messenger/...` → 404 TENANT_NOT_FOUND |
| 비활성 tenant | active=false → 410 TENANT_DISABLED |
| Rate limit | POST /messages 60회 → 60번째 200, 61번째 429 + Retry-After |
| audit 발화 | DB SELECT count(*) FROM audit_logs WHERE event = 'messenger.message_sent' → +1 |

### 6.3 머지 게이트 (M2 종료 조건)

- [ ] 도메인 헬퍼 4개 단위 테스트 32건 PASS, 커버리지 80%+ on `src/lib/messenger/**`
- [ ] 라우트 19개 통합 테스트 PASS
- [ ] cross-tenant 침투 7건 모두 403/404 응답
- [ ] clientGeneratedId 동시성 시뮬레이션 PASS
- [ ] audit 5종 발화 자동 검증 PASS
- [ ] tsc 0 errors
- [ ] eslint 0 errors (특히 `tenant/no-raw-prisma-without-tenant`)
- [ ] M1 RLS 단위 테스트 13 it 회귀 0
- [ ] OpenAPI 스펙 자동 생성은 *Phase 2 미루기* (api-surface.md §6 결정)

---

## 7. 일정 분할 — M2 5-6 작업일을 3 세션으로

> **세션 번호 매핑**: 본 정밀화는 세션 68에서 작성. M2 실행은 다음 세션부터 시작 (예상 세션 69→70→71). 본 절의 "Step1/2/3" 은 실행 단위 명칭이며, 실제 세션 번호는 진입 시점에 따라 결정.

### M2-Step1 (예상 세션 69, 1.5일) — 도메인 헬퍼 4개 + 단위 테스트 32건

**산출물**:
- `src/lib/messenger/{conversations,messages,blocks,reports,types}.ts`
- `src/lib/schemas/messenger/{conversations,messages,safety}.ts`
- `tests/messenger/{conversations,messages,messages.idempotency,blocks,reports}.test.ts`
- `tests/messenger/_fixtures.ts`

**머지 게이트**:
- 32 단위 테스트 PASS, 커버리지 80%+
- tsc/eslint 0 errors
- audit 호출은 mock (라우트 단계에서 실증)

### M2-Step2 (예상 세션 70, 2일) — 핵심 라우트 11개 + audit + rate-limit

**산출물**:
- `src/app/api/v1/t/[tenant]/messenger/conversations/route.ts` (POST/GET)
- `src/app/api/v1/t/[tenant]/messenger/conversations/[id]/route.ts` (GET/PATCH/DELETE)
- `src/app/api/v1/t/[tenant]/messenger/conversations/[id]/messages/route.ts` (POST/GET)
- `src/app/api/v1/t/[tenant]/messenger/conversations/[id]/messages/[messageId]/route.ts` (PATCH/DELETE)
- `src/app/api/v1/t/[tenant]/messenger/conversations/[id]/members/route.ts` (POST)
- `src/app/api/v1/t/[tenant]/messenger/conversations/[id]/members/[userId]/route.ts` (DELETE)
- `src/app/api/v1/t/[tenant]/messenger/conversations/[id]/members/me/route.ts` (PATCH)
- `src/app/api/v1/t/[tenant]/messenger/conversations/[id]/typing/route.ts` (POST, M3 publish 자리만)
- `src/app/api/v1/t/[tenant]/messenger/conversations/[id]/receipts/route.ts` (POST)
- `src/app/api/v1/t/[tenant]/messenger/messages/search/route.ts` (GET)
- `tests/messenger/routes/{conversations,messages,members}.route.test.ts`

**머지 게이트**:
- 라우트 통합 테스트 PASS
- audit 5종 발화 검증
- cross-tenant 침투 자동 회귀

### M2-Step3 (예상 세션 71, 1.5일) — 안전/알림/운영자 라우트 8개 + M2 종료

**산출물**:
- `src/app/api/v1/t/[tenant]/messenger/user-blocks/route.ts` (POST/GET)
- `src/app/api/v1/t/[tenant]/messenger/user-blocks/[id]/route.ts` (DELETE)
- `src/app/api/v1/t/[tenant]/messenger/abuse-reports/route.ts` (POST)
- `src/app/api/v1/t/[tenant]/messenger/notification-preferences/route.ts` (GET/PATCH)
- `src/app/api/v1/t/[tenant]/messenger/admin/reports/route.ts` (GET)
- `src/app/api/v1/t/[tenant]/messenger/admin/reports/[id]/resolve/route.ts` (POST)
- `tests/messenger/routes/{blocks,reports,prefs,admin}.route.test.ts`
- `docs/handover/2026-MM-DD-messenger-m2-handover.md`

**머지 게이트**:
- 모든 라우트 19개 PASS
- M2 머지 게이트 §6.3 전 항목
- M3 진입 권장 (api-surface.md §4 SSE 채널)

---

## 8. 다른 터미널 작업과의 영역 분리

### 8.1 Almanac aggregator 작업 영역 (다른 터미널)

| 영역 | 상태 | 메신저와 충돌? |
|---|---|---|
| `docs/assets/yangpyeon-aggregator-spec/*` | modified (42 파일) | ❌ 무관 |
| `docs/handover/260426-session66-aggregator-day1.md` | untracked | ❌ 무관 |
| `docs/handover/next-dev-prompt.md`, `docs/status/current.md` | modified | ⚠ 세션 67 기록 추가 시 *세션 66 머지 후* 추가 |
| `prisma/seeds/almanac-aggregator-{categories,sources}.sql` | untracked | ❌ 무관 |
| `src/app/api/v1/t/[tenant]/categories/route.ts` | untracked | ⚠ 메신저 라우트가 같은 `/t/[tenant]/` 트리 안에 들어가지만 *다른 path segment* (categories vs messenger). Next.js App Router 에서 형제 segment 라 충돌 0. |

### 8.2 메신저 M2 작업 영역 (이 터미널)

| 영역 | 상태 | 신규/변경 |
|---|---|---|
| `src/lib/messenger/*` | untracked | 신규 (헬퍼 4개 + types.ts) |
| `src/lib/schemas/messenger/*` | untracked | 신규 (Zod 스키마 3개) |
| `src/app/api/v1/t/[tenant]/messenger/**` | untracked | 신규 (라우트 19개) |
| `tests/messenger/{conversations,messages,...}.test.ts` | untracked | 신규 (단위/통합 테스트) |
| `docs/research/messenger/m2-detailed-plan.md` | untracked | 신규 (이 문서) |

**충돌 위험 0**. M2 작업은 모두 신규 파일. Almanac 작업이 머지된 후 M2 시작해도, M2 진행 중 Almanac 작업과 병렬 진행해도 충돌 없음.

### 8.3 Almanac 패턴 흡수 — `prisma/seeds/` + manifest

`prisma/seeds/` 트리는 Almanac이 신규 도입. 메신저는 *시드 데이터가 없으므로* (DM/그룹 모두 사용자 생성) 이 트리에 추가 안 함. 단, 향후 운영자 콘솔 첫 진입 시 default tenant 의 *welcome conversation* 자동 생성을 검토할 가치 있음 → M4 UI 단계에서 결정 (M2 외).

### 8.4 `src/app/api/v1/t/[tenant]/categories/route.ts` 패턴 답습 항목

| 항목 | Almanac 패턴 | 메신저 채택? |
|---|---|---|
| `withTenant + prismaWithTenant` 가드 | ✅ | ✅ 채택 |
| Zod query schema + `.safeParse` | ✅ | ✅ 채택 (body schema도) |
| `successResponse` / `errorResponse` 표준 | ✅ | ✅ 채택 |
| `Cache-Control: public, s-maxage=N, stale-while-revalidate=M` | ✅ (categories 5분) | ❌ 메신저 GET 은 *no-store* (실시간성 + 사용자별 응답). admin/health 만 cache 검토 |
| CORS `Access-Control-Allow-Origin` 동적 | ✅ (Almanac.vercel.app) | ❌ 메신저 Phase 1 = same-origin 운영자 콘솔. CORS 불필요. Phase 2 plugin 진입 시 재검토 |
| `runtime = "nodejs"` | ✅ | ✅ 채택 (모든 메신저 라우트, fluid compute) |

---

## 9. 잠재적 함정 5건

1. **`runtime = "nodejs"` 누락 시**: Edge runtime 으로 자동 결정되면 prismaWithTenant 가 fail. 모든 라우트 첫 줄에 명시. (Almanac route line 26 답습)
2. **`audit_logs` 테이블에 `messenger.*` event prefix 인덱스 없음**: 검증 쿼리 (count(*) WHERE event=...) 가 full scan. M2 머지 전 `audit_logs` 의 event 컬럼 인덱스 확인. 부재 시 마이그 추가 검토.
3. **`MessageReceipt` PK `(conversationId, userId)` + tenantId 컬럼 별도 존재**: RLS 가 tenantId 기반인데 PK 가 (convId, userId) 이라 RLS 정책이 row 발견 후 *2차 검증* 으로 작동. 성능 영향 무시 수준 (PK 조회는 1 row hit) 이지만 동작 원리 인지 필요.
4. **`clientGeneratedId` UNIQUE 가 `(tenantId, conversationId, clientGeneratedId)` 이므로 cross-conversation 동일 cgid 가능**: 라인 LocalMessageId 패턴 그대로. 클라이언트는 conversation 별로 cgid 풀 분리 또는 매번 새 UUID. 멱등성 헬퍼는 *항상* `(tenantId, convId, cgid)` 조합으로 lookup.
5. **`SYSTEM` 메시지 (입장/퇴장) 의 `clientGeneratedId`**: server 가 자동 생성 (UUID). 클라이언트 재시도 패턴이 없는 server-initiated 메시지이므로 `crypto.randomUUID()` 직접 사용. 멱등성 무관.

---

## 10. 결정 근거 한 줄 (10건)

1. **라우트 prefix `/t/[tenant]/messenger/`** — Almanac 검증 패턴 답습 + Phase 2 plugin 분리 비용 0
2. **도메인 헬퍼 4개 = 비즈니스 룰 단일 진실 소스** — 19개 라우트 복붙 회피 + 룰 변경 1곳 수정
3. **clientGeneratedId 멱등 = pre-lookup + race catch** — 라인 LocalMessageId, DB UNIQUE 제약 보조
4. **`withTenantRole` 채택** — api-guard-tenant.ts 기존 구현 재사용 (신규 가드 0)
5. **vitest + 실제 DB** — M1 의 RLS env 재사용, 모킹 비용 회피
6. **audit 5종 발화 머지 게이트** — 1인 운영 디버깅 단일 진실 소스 (1인 운영 N=20 가능성 증명)
7. **rate-limit 기존 헬퍼 재사용** — 신규 인프라 0 (ADR-022 §6 부합)
8. **3 세션 분할 (67/68/69)** — 토큰 한계 + 세션당 머지 게이트 명확화
9. **OpenAPI Phase 2 미루기** — Phase 1 단일 사용자 (운영자) 라 자동 생성 ROI 낮음
10. **Almanac/메신저 영역 분리 0 충돌** — 미커밋 작업 진행 중에도 안전한 동시 작업

---

## 11. 변경 이력

- v1.0 (2026-04-26 세션 68) — M1 점검 결과 (9/9 PASS) + M2 정밀화 초안. 다음 세션 (M2-Step1, 도메인 헬퍼 작성) 즉시 진입 가능 상태.
