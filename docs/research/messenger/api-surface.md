# API Surface — Yangpyeong Messenger

> **소스**: 세션 63 (2026-04-26) PRD §5/§6 보강
> **사용처**: API 핸들러 작성, OpenAPI 스펙 자동 생성 후보, Playwright E2E 작성

---

## 1. 표준 컨벤션

### 1.1 응답 포맷
기존 프로젝트 표준 (`src/lib/api-response.ts`):
```ts
// Success
{ success: true, data: T, pagination?: { ... } }

// Error
{ success: false, error: { code: string, message: string } }
```

### 1.2 페이지네이션 — keyset cursor

```
GET /api/v1/conversations/:id/messages?cursor=<base64>&limit=30

cursor = base64(JSON.stringify({ createdAt: ISOString, id: UUID }))
응답: { items: [...], nextCursor: <base64>|null, hasMore: boolean }
```

- 기본 limit=30, max=100
- 정렬 desc by `(createdAt, id)` (id 동률 시 안정 정렬)
- `before=<messageId>` / `after=<messageId>` 보조 파라미터 (특정 메시지 주변 컨텍스트)

### 1.3 멱등성 — clientGeneratedId

- 클라이언트가 UUIDv7 생성 → request body의 `clientGeneratedId`
- 서버 UNIQUE `(tenantId, conversationId, clientGeneratedId)` 제약
- 충돌 시: 기존 메시지 fetch + 200 (신규 송신처럼 보임)

### 1.4 에러 코드 표준

| Code | HTTP | 의미 |
|---|---|---|
| `UNAUTHORIZED` | 401 | 인증 토큰 없음/만료 |
| `INVALID_TOKEN` | 401 | 토큰 검증 실패 |
| `FORBIDDEN` | 403 | 권한 부족 (cross-tenant 침투, 비멤버 등) |
| `TENANT_MEMBERSHIP_REQUIRED` | 403 | tenant 멤버 아님 |
| `BLOCKED` | 403 | 차단된 사용자 송신 시도 |
| `NOT_FOUND` | 404 | 리소스 없음 |
| `VALIDATION_ERROR` | 400 | Zod 검증 실패 (message: 첫 issue) |
| `INVALID_JSON` | 400 | body 파싱 실패 |
| `EDIT_WINDOW_EXPIRED` | 409 | 편집 15분 한도 초과 |
| `DELETE_WINDOW_EXPIRED` | 409 | 회수 24h 한도 초과 (admin 제외) |
| `GROUP_LIMIT_EXCEEDED` | 422 | 100명 초과 |
| `DUPLICATE_REPORT` | 409 | 동일 신고 중복 |
| `RATE_LIMIT_EXCEEDED` | 429 | + Retry-After 헤더 |
| `QUOTA_EXCEEDED` | 429 | tenant quota 초과 |

### 1.5 Rate Limit (rate-limit-db 활용)

| 엔드포인트 | 한도 |
|---|---|
| POST /messages | 사용자당 분당 60건 |
| POST /typing | 사용자당 1초당 1건 |
| POST /abuse-reports | 사용자당 분당 5건 |
| POST /push/subscribe | 사용자당 시간당 5건 |
| GET /messages/search | 사용자당 분당 30건 |

---

## 2. Phase 1 라우트 명세 (운영 콘솔)

### 2.1 Conversations

#### GET `/api/v1/conversations`
조건: tenant member (withAuth)
쿼리: `?cursor&limit&kind=DIRECT|GROUP|CHANNEL&filter=all|unread|pinned`
응답:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "kind": "DIRECT",
      "title": null,
      "lastMessage": { "id":"...", "body":"...", "kind":"TEXT", "createdAt":"...", "senderId":"..." },
      "lastMessageAt": "ISO",
      "unreadCount": 3,
      "isPinned": true,
      "isMuted": false,
      "members": [{ "userId":"...", "role":"MEMBER", "user": { "name":"김철수" } }]
    }
  ],
  "pagination": { "nextCursor": "...", "hasMore": true }
}
```

#### POST `/api/v1/conversations`
조건: tenant member
요청:
```json
{
  "kind": "DIRECT" | "GROUP",
  "memberIds": ["userId1", "userId2", ...],  // creator 자동 포함
  "title": "프로젝트 X 논의"  // GROUP만
}
```
응답: `{ conversation: {...} }`

**비즈니스 규칙**:
- DIRECT: memberIds.length === 1 (creator + 1명) → 페어 멱등 (같은 페어 기존 conv 반환)
- GROUP: memberIds.length 1~99 (creator 포함 ≤100)
- 각 member에 대해 TenantMembership 활성 검증 (cross-tenant 차단)
- 차단 관계 검증: blocker 또는 blocked 측이 member에 포함되면 422

#### GET `/api/v1/conversations/:id`
조건: ConversationMember (leftAt IS NULL)
응답:
```json
{
  "conversation": {...},
  "members": [{ "userId":"...", "role":"...", "user":{...}, "lastReadMessageId":"...", "pinnedAt":null, "mutedUntil":null }],
  "unreadCount": 3
}
```

#### PATCH `/api/v1/conversations/:id`
조건: OWNER 또는 ADMIN
요청: `{ "title"?: string, "archivedAt"?: ISOString | null }`
응답: `{ conversation: {...} }`

#### DELETE `/api/v1/conversations/:id`
조건: OWNER
효과: archivedAt SET (soft delete)
응답: `204`

---

### 2.2 Conversation Members

#### POST `/api/v1/conversations/:id/members`
조건: OWNER 또는 ADMIN (대화 그룹)
요청: `{ "userIds": ["..."] }`
응답: `{ added: ConversationMember[], skipped: { userId, reason }[] }`

**비즈니스 규칙**:
- 100명 초과 시 422 GROUP_LIMIT_EXCEEDED
- TenantMembership 미참여 사용자 → skipped (cross-tenant 차단)
- 차단 관계 사용자 → skipped (BLOCKED)

#### DELETE `/api/v1/conversations/:id/members/:userId`
조건: OWNER, ADMIN, 또는 self (자진 퇴장)
효과: leftAt SET
응답: `204`

#### PATCH `/api/v1/conversations/:id/members/me`
조건: self (member)
요청: `{ "pinnedAt"?: ISOString | null, "mutedUntil"?: ISOString | null }`
응답: `{ member: {...} }`

---

### 2.3 Messages

#### GET `/api/v1/conversations/:id/messages`
조건: member
쿼리: `?cursor&limit&before=<msgId>&after=<msgId>`
응답:
```json
{
  "items": [
    {
      "id": "uuid",
      "kind": "TEXT",
      "body": "안녕",
      "senderId": "...",
      "sender": { "id":"...", "name":"김철수" },
      "replyToId": "...",
      "replyTo": { "id":"...", "body":"...", "senderId":"..." } | null,
      "attachments": [{"id":"...", "fileId":"...", "kind":"IMAGE", "file": {"originalName":"...", "size":..., "url":"..."}}],
      "mentions": [{"mentionedUserId":"...", "mentionedUser": {"name":"..."}}],
      "editedAt": null,
      "editCount": 0,
      "deletedAt": null,
      "createdAt": "ISO"
    }
  ],
  "pagination": {...}
}
```

#### POST `/api/v1/conversations/:id/messages`
조건: member, not blocked
요청:
```json
{
  "kind": "TEXT" | "IMAGE" | "FILE",
  "body": "안녕하세요",
  "clientGeneratedId": "uuid-7",
  "replyToId": "uuid"?,
  "mentions": ["userId1", ...]?,
  "attachments": [{"fileId":"uuid", "kind":"IMAGE", "displayOrder":0}]?
}
```
응답: `{ message: {...} }` (멱등 시 200, 신규 시 201)

**비즈니스 규칙**:
- clientGeneratedId UNIQUE 위반 → 기존 메시지 fetch 200 return
- attachments[].fileId의 owner === sender 검증 (남의 파일 첨부 차단)
- mentions[]의 user는 conversation member 또는 tenant member (멘션은 가능, 추가는 별도)
- 차단 관계: sender가 receiver 차단 또는 receiver가 sender 차단 → 403 BLOCKED
- rate-limit: 분당 60건 (기존 rate-limit-db 활용)

**부수 효과**:
- conversations.lastMessageAt 업데이트
- audit `messenger.message_sent`
- publish `conv:<id>` `message.created`
- mentions[]에게 `user:<uid>:notif` `mention.received`
- DM이면 상대방에게 `user:<peerId>:notif` `dm.received`

#### PATCH `/api/v1/conversations/:id/messages/:msgId`
조건: sender 본인, ≤15분
요청: `{ "body": "수정된 내용" }`
응답: `{ message: {...} }`
부수 효과: editedAt SET, editCount++, publish `message.updated`, audit

#### DELETE `/api/v1/conversations/:id/messages/:msgId`
조건: sender 본인 (≤24h) 또는 OWNER/ADMIN tenant 운영자 (무제한)
효과: deletedAt SET, body=NULL, deletedBy='self'|'admin'
응답: `204`
부수 효과: publish `message.deleted`, audit `messenger.message_deleted`

---

### 2.4 Typing Indicator

#### POST `/api/v1/conversations/:id/typing`
조건: member
효과: publish `conv:<id>` `typing.started` (TTL 6초 in client)
응답: `204`
rate-limit: 1초당 1건

---

### 2.5 Read Receipts

#### POST `/api/v1/conversations/:id/receipts`
조건: member
요청: `{ "lastReadMessageId": "uuid" }`
응답: `{ receipt: {...} }`
부수 효과: publish `conv:<id>` `receipt.updated` (안 읽은 수 변경)

---

### 2.6 Search

#### GET `/api/v1/messages/search`
조건: tenant member
쿼리: `?q=<keyword>&convId?&cursor&limit`
응답:
```json
{
  "items": [
    {
      "messageId": "...",
      "conversationId": "...",
      "conversation": { "title": "...", "kind": "GROUP" },
      "snippet": "...납기...일정 잡히면",  // 매치 주변 30자 발췌
      "sender": { "name": "김철수" },
      "createdAt": "ISO"
    }
  ],
  "pagination": {...}
}
```

**비즈니스 규칙**:
- LIKE `%<q>%` on `messages.body` (Phase 1)
- 30일 윈도 강제 (`createdAt >= NOW() - INTERVAL '30 days'`)
- deleted_at IS NULL
- 사용자가 멤버인 conversation만 (subquery JOIN)
- rate-limit: 분당 30건
- Phase 2: tsvector + GIN, Phase 3: 외부 엔진

---

### 2.7 User Blocks

#### POST `/api/v1/user-blocks`
조건: self
요청: `{ "blockedUserId": "...", "reason"?: "..." }`
응답: `{ block: {...} }`
부수 효과: publish `user:<blockerId>:notif` `block.created`, audit
- 같은 tenant 내 사용자만 차단 가능 (cross-tenant 차단 시도는 404)

#### GET `/api/v1/user-blocks`
조건: self
응답: `{ items: UserBlock[] }`

#### DELETE `/api/v1/user-blocks/:id`
조건: blocker 본인
응답: `204`

---

### 2.8 Abuse Reports

#### POST `/api/v1/abuse-reports`
조건: self
요청:
```json
{
  "targetKind": "MESSAGE" | "USER",
  "targetId": "...",
  "reason": "스팸 - 광고성 메시지"
}
```
응답: `{ report: {...} }`
- UNIQUE 위반 시 409 DUPLICATE_REPORT
- rate-limit: 분당 5건

---

### 2.9 Notification Preferences

#### GET `/api/v1/notification-preferences`
조건: self
응답: `{ prefs: {...} }`

#### PATCH `/api/v1/notification-preferences`
조건: self
요청: `{ mentionsOnly?: boolean, dndStart?: "22:00", dndEnd?: "08:00", pushEnabled?: boolean }`
응답: `{ prefs: {...} }`

---

### 2.10 Push Subscriptions (Phase 1.5)

#### POST `/api/v1/push/subscribe`
조건: self
요청:
```json
{
  "endpoint": "https://fcm.googleapis.com/...",
  "keys": { "p256dh": "...", "auth": "..." },
  "userAgent": "Mozilla/5.0 ..."
}
```
응답: `{ subscription: {...} }`
- endpoint UNIQUE: 동일 device 재구독은 update

#### DELETE `/api/v1/push/subscribe`
조건: self
요청: `{ "endpoint": "..." }`
응답: `204`

---

### 2.11 운영자 패널 (`/api/v1/admin/messenger/*`)

#### GET `/api/v1/admin/messenger/reports?status=OPEN&cursor&limit`
조건: MANAGER_PLUS
응답:
```json
{
  "items": [
    {
      "id":"...", "targetKind":"MESSAGE", "targetId":"...",
      "reason":"...", "status":"OPEN", "createdAt":"ISO",
      "reporter": {...},
      "target": {...}  // 메시지 또는 사용자 상세
    }
  ]
}
```

#### POST `/api/v1/admin/messenger/reports/:id/resolve`
조건: MANAGER_PLUS
요청:
```json
{
  "action": "DELETE_MESSAGE" | "BLOCK_USER" | "DISMISS",
  "note"?: "사유 노트"
}
```
응답: `{ report: {...}, performedActions: [...] }`
부수 효과: action에 따라 message DELETE 또는 user-wide block (운영자 전용 기능, Phase 1.5)

#### GET `/api/v1/admin/messenger/health`
조건: OWNER/ADMIN
응답:
```json
{
  "global": {
    "p95SendMs": 142,
    "sseConnectionsActive": 87,
    "sseConnectionsLimit": 200,
    "attachmentFailureRate": 0.003,
    "pendingReports": 5
  },
  "perTenant": [
    {"tenantId":"...", "slug":"default", "messagesPerMinute":142, "p95Ms":142, "sseConnections":23, "quotaUsagePct":30}
  ]
}
```

#### GET `/api/v1/admin/messenger/quota?tenantId?`
조건: OWNER/ADMIN
응답: `{ items: [{ tenantId, dailyMessages, dailyLimit, attachmentMB, attachmentLimitMB }] }`

#### POST `/api/v1/admin/messenger/quota/:tenantId`
조건: OWNER
요청: `{ dailyLimit?: number, attachmentLimitMB?: number }`
응답: `{ quota: {...} }`

---

## 3. Phase 2 라우트 (Plugin 컨슈머)

기본 패턴: 동일 핸들러를 `/api/v1/t/<tenant>/messenger/...` 경로로 재마운트 + `withTenant()` 가드.

```
/api/v1/t/<tenant>/messenger/conversations[/:id[/messages|members|typing|receipts]]
/api/v1/t/<tenant>/messenger/messages/search
/api/v1/t/<tenant>/messenger/user-blocks[/:id]
/api/v1/t/<tenant>/messenger/abuse-reports
/api/v1/t/<tenant>/messenger/notification-preferences
/api/v1/t/<tenant>/messenger/push/subscribe
```

추가 Phase 2 라우트:
- POST/DELETE `/api/v1/t/<tenant>/messenger/messages/:id/reactions` (emoji 반응)
- POST/DELETE `/api/v1/t/<tenant>/messenger/bookmarks` (메시지 북마크)
- POST `/api/v1/t/<tenant>/messenger/qr-invite` (QR 친구 추가 토큰 발급)

---

## 4. SSE 엔드포인트

### 4.1 Channel subscribe

```
GET /api/sse/realtime/channel/<channel-key>
Headers:
  Cookie: (auth)
  Last-Event-ID: <id>  (재연결 시 catchup, Phase 1.5+)
```

응답: `text/event-stream`, 25초마다 keep-alive ping

### 4.2 채널 키 권한 매트릭스

| 키 | 형식 | 구독 권한 | 검증 위치 |
|---|---|---|---|
| `conv:<convId>` | `conv:abc...` | ConversationMember (leftAt IS NULL) | `[channel]/route.ts` channel parser |
| `user:<userId>:notif` | `user:abc:notif` | self only (channelUserId === user.sub) | 동일 |
| `presence:<tenantId>` | `presence:abc` | TenantMembership (leftAt IS NULL) | 동일 |

### 4.3 이벤트 페이로드

| 이벤트 | 채널 | payload |
|---|---|---|
| `message.created` | `conv:<id>` | `{conversationId, message: {...}}` |
| `message.updated` | `conv:<id>` | `{conversationId, messageId, body, editedAt, editCount}` |
| `message.deleted` | `conv:<id>` | `{conversationId, messageId, deletedAt, deletedBy}` |
| `receipt.updated` | `conv:<id>` | `{conversationId, userId, lastReadMessageId, unreadCount}` |
| `typing.started` | `conv:<id>` | `{conversationId, userId, expiresAt}` |
| `typing.stopped` | `conv:<id>` | `{conversationId, userId}` |
| `member.joined` | `conv:<id>` | `{conversationId, member: {...}}` |
| `member.left` | `conv:<id>` | `{conversationId, userId, leftAt}` |
| `mention.received` | `user:<id>:notif` | `{messageId, conversationId, sender, snippet}` |
| `dm.received` | `user:<id>:notif` | `{messageId, conversationId, sender, snippet}` |
| `report.resolved` | `user:<id>:notif` | `{reportId, action, note}` |
| `block.created` | `user:<id>:notif` | `{blockId, blockedUserId}` |
| `user.online` | `presence:<tid>` | `{userId, connectedAt}` |
| `user.offline` | `presence:<tid>` | `{userId, lastSeenAt}` |

---

## 5. UI Hook 시그니처 (참고)

### 5.1 useConversation
```ts
function useConversation(conversationId: string): {
  conversation: ConversationWithMembers | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
};
```

### 5.2 useMessages (infinite scroll)
```ts
function useMessages(conversationId: string): {
  messages: MessageWithRelations[];
  hasMore: boolean;
  loadOlder: () => Promise<void>;
  isLoading: boolean;
  // SSE 연결, conv:<id> 자동 구독, 자동 dedupe (clientGeneratedId)
};
```

### 5.3 useTyping (debounced)
```ts
function useTyping(conversationId: string): {
  typingUsers: { userId: string; name: string }[];  // SSE 수신
  notifyTyping: () => void;  // composer onChange에서 호출, 1초 throttle
};
```

### 5.4 useReadReceipt
```ts
function useReadReceipt(conversationId: string): {
  markAsRead: (lastMessageId: string) => Promise<void>;
  // 자동: 채팅창 활성 + 스크롤 진입 시 마지막 보인 메시지로 update
};
```

### 5.5 usePresence
```ts
function usePresence(): {
  onlineUsers: Set<string>;  // 같은 tenant 내 활성 사용자
};
```

---

## 6. OpenAPI 자동 생성 (옵션, Phase 2)

Phase 2 진입 시 `zod-to-openapi` 또는 `next-openapi-gen`으로 자동 생성. Phase 1은 본 문서가 단일 진실 소스.

---

## 7. 결정 근거 한 줄

1. **Keyset cursor pagination** — offset 페이지네이션의 일관성 문제 회피
2. **clientGeneratedId 멱등** — 라인 LocalMessageId, 오프라인 안전
3. **error code 표준화** — 클라이언트 분기 단순화
4. **SSE 채널 키 분리** (conv/user/presence) — 권한 검증 단순 + fan-out 명확
5. **운영자 패널 분리 라우트** (`/admin/messenger/*`) — 권한 게이트 명확
6. **검색 30일 윈도 강제** — LIKE 비용 폭주 방지
7. **rate-limit 분당 60건** — 인간 사용 패턴 (1초당 1건) 안전 마진
8. **MIME 화이트리스트는 filebox 상속** — 이중 정책 회피
9. **DIRECT 페어 멱등** — 같은 1:1 conv 중복 생성 방지
10. **Phase 2 plugin 라우트는 prefix `/t/<tenant>/messenger/`** — withTenant 가드 일관성
