# Data Model — Yangpyeong Messenger

> **소스**: 세션 63 (2026-04-26) PRD §5 보강 · ADR-022 §1 (tenant_id 첫 컬럼) + ADR-029 (RLS) 강제 준수
> **사용처**: prisma/schema.prisma 모델 작성, 마이그 SQL 작성, RLS 정책 검증

---

## 1. Enum (6종)

```prisma
enum ConversationKind {
  DIRECT     // 1:1 (정확히 2 멤버)
  GROUP      // 다중 멤버 (≤100 P1, ≤500 P2)
  CHANNEL    // 1:N broadcast (write owner-only, P2+)
}

enum ConversationMemberRole {
  OWNER      // 생성자, 멤버 추가/삭제, 그룹 삭제
  ADMIN      // 멤버 추가/삭제 (그룹 삭제 X)
  MEMBER     // 메시지 송수신
  // VIEWER  // 읽기 전용 (P3 채널 모더레이션 시 추가 검토)
}

enum MessageKind {
  TEXT       // 일반 텍스트
  IMAGE      // 이미지 첨부 (body는 caption)
  FILE       // 일반 파일 첨부
  VOICE      // 음성 메모 (P2+)
  STICKER    // 스티커 (P2+)
  SYSTEM     // 시스템 메시지 (입장/퇴장/제목변경 등, sender=null)
}

enum AttachmentKind {
  IMAGE
  FILE
  VOICE
}

enum AbuseReportStatus {
  OPEN       // 미처리
  RESOLVED   // 처리됨
  DISMISSED  // 무시
}

enum AbuseReportTargetKind {
  MESSAGE    // 특정 메시지 신고
  USER       // 사용자 자체 신고
}
```

---

## 2. 모델 정의 (Phase 1 — 11종)

> **공통 패턴 (ADR-022 §1 + ADR-029)**:
> - `tenantId String @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid` — 첫 컬럼
> - 마이그에서 `ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY` + `CREATE POLICY tenant_isolation`
> - `app_runtime` GRANT 자동 (default privileges)

### 2.1 Conversation

```prisma
model Conversation {
  id              String                 @id @default(uuid()) @db.Uuid
  tenantId        String                 @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid
  kind            ConversationKind
  title           String?                // GROUP/CHANNEL만 사용. DIRECT는 NULL
  createdById     String                 @map("created_by_id")
  lastMessageAt   DateTime?              @map("last_message_at") @db.Timestamptz(3)
  archivedAt      DateTime?              @map("archived_at") @db.Timestamptz(3)
  createdAt       DateTime               @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt       DateTime               @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(3)

  createdBy       User                   @relation("ConversationCreatedBy", fields: [createdById], references: [id])
  members         ConversationMember[]
  messages        Message[]
  receipts        MessageReceipt[]

  @@index([tenantId, lastMessageAt(sort: Desc)])
  @@index([tenantId, kind])
  @@index([tenantId, archivedAt])
  @@map("conversations")
}
```

**비즈니스 규칙**:
- DIRECT: members.length === 2 강제 (DB constraint 아닌 application layer)
- DIRECT: 같은 (userA, userB) 페어는 페어 멱등 (POST 시 기존 conv 반환)
- GROUP: members.length ≤ 100 (P1, Q5 결정 시 변경)
- archivedAt: soft delete, NULL이면 활성

### 2.2 ConversationMember

```prisma
model ConversationMember {
  id                  String                  @id @default(uuid()) @db.Uuid
  tenantId            String                  @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid
  conversationId      String                  @map("conversation_id") @db.Uuid
  userId              String                  @map("user_id")
  role                ConversationMemberRole  @default(MEMBER)
  joinedAt            DateTime                @default(now()) @map("joined_at") @db.Timestamptz(3)
  lastReadMessageId   String?                 @map("last_read_message_id") @db.Uuid
  pinnedAt            DateTime?               @map("pinned_at") @db.Timestamptz(3)
  mutedUntil          DateTime?               @map("muted_until") @db.Timestamptz(3)
  leftAt              DateTime?               @map("left_at") @db.Timestamptz(3)

  conversation        Conversation            @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user                User                    @relation("ConversationMembership", fields: [userId], references: [id], onDelete: Cascade)
  lastReadMessage     Message?                @relation("LastReadMessage", fields: [lastReadMessageId], references: [id], onDelete: SetNull)

  @@unique([conversationId, userId])
  @@index([tenantId, userId, leftAt])
  @@index([tenantId, conversationId, leftAt])
  @@map("conversation_members")
}
```

**비즈니스 규칙**:
- ConversationMember 생성 시 `(tenantId, userId)`가 활성 TenantMembership 존재해야 함 (server-side 검증)
- leftAt IS NOT NULL → 채팅방 나간 상태 (메시지 수신 안 함, 읽기는 가능)
- mutedUntil < now() → 자동 unmute (lazy)

### 2.3 Message

```prisma
model Message {
  id                  String                @id @default(uuid()) @db.Uuid
  tenantId            String                @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid
  conversationId      String                @map("conversation_id") @db.Uuid
  senderId            String?               @map("sender_id")  // SYSTEM 메시지는 NULL
  kind                MessageKind           @default(TEXT)
  body                String?               @db.Text  // 회수 시 NULL
  replyToId           String?               @map("reply_to_id") @db.Uuid
  clientGeneratedId   String                @map("client_generated_id")
  editedAt            DateTime?             @map("edited_at") @db.Timestamptz(3)
  editCount           Int                   @default(0) @map("edit_count")
  deletedAt           DateTime?             @map("deleted_at") @db.Timestamptz(3)
  deletedBy           String?               @map("deleted_by")  // self / admin (운영자 강제 회수)
  createdAt           DateTime              @default(now()) @map("created_at") @db.Timestamptz(3)

  conversation        Conversation          @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender              User?                 @relation("MessageSender", fields: [senderId], references: [id], onDelete: SetNull)
  replyTo             Message?              @relation("MessageReply", fields: [replyToId], references: [id], onDelete: SetNull)
  replies             Message[]             @relation("MessageReply")
  attachments         MessageAttachment[]
  mentions            MessageMention[]
  receiptsTo          ConversationMember[]  @relation("LastReadMessage")

  @@unique([tenantId, conversationId, clientGeneratedId])
  @@index([tenantId, conversationId, createdAt(sort: Desc)])
  @@index([tenantId, senderId, createdAt(sort: Desc)])
  // P1.4: partial index (마이그에서 raw SQL로 추가 — Prisma DSL 미지원)
  // CREATE INDEX messages_active_idx ON messages(tenant_id, conversation_id, created_at DESC) WHERE deleted_at IS NULL;
  // CREATE INDEX messages_search_gin ON messages USING gin (body gin_trgm_ops) WHERE deleted_at IS NULL;
  @@map("messages")
}
```

**비즈니스 규칙**:
- 편집(15분 한도): editedAt SET, editCount++, body 갱신 — UI에 "편집됨" 표시
- 회수: deletedAt SET, body=NULL, deletedBy='self'|'admin' — 첨부는 30일 cron이 dereference
- clientGeneratedId 멱등: UNIQUE 위반 시 기존 메시지 fetch return (멱등 송신 보장)

### 2.4 MessageAttachment

```prisma
model MessageAttachment {
  id            String          @id @default(uuid()) @db.Uuid
  tenantId      String          @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid
  messageId     String          @map("message_id") @db.Uuid
  fileId        String          @map("file_id")  // File.id (filebox)
  kind          AttachmentKind
  displayOrder  Int             @default(0) @map("display_order")

  message       Message         @relation(fields: [messageId], references: [id], onDelete: Cascade)
  // file        File          @relation(fields: [fileId], references: [id], onDelete: Restrict) — 양방향 관계 추가 시
  // 단방향 FK는 raw SQL ALTER로 추가 (filebox 모델 변경 회피)

  @@index([tenantId, messageId, displayOrder])
  @@index([tenantId, fileId])
  @@map("message_attachments")
}
```

**비즈니스 규칙**:
- fileId → files.id ON DELETE RESTRICT (메시지 삭제 시 첨부 자동 dereference 안 함, 30일 cron이 정리)
- displayOrder: 5장 이미지 묶음 등 표시 순서 보장

### 2.5 MessageMention

```prisma
model MessageMention {
  id                String    @id @default(uuid()) @db.Uuid
  tenantId          String    @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid
  messageId         String    @map("message_id") @db.Uuid
  mentionedUserId   String    @map("mentioned_user_id")
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)

  message           Message   @relation(fields: [messageId], references: [id], onDelete: Cascade)
  mentionedUser     User      @relation("UserMentioned", fields: [mentionedUserId], references: [id], onDelete: Cascade)

  @@unique([messageId, mentionedUserId])
  @@index([tenantId, mentionedUserId, createdAt(sort: Desc)])
  @@map("message_mentions")
}
```

**비즈니스 규칙**:
- 멘션된 사용자가 conversation 미참여 → 자동 추가 안 함, 알림만 push
- 차단된 사용자 멘션 → 알림 발송 X

### 2.6 MessageReceipt

```prisma
model MessageReceipt {
  tenantId            String      @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid
  conversationId      String      @map("conversation_id") @db.Uuid
  userId              String      @map("user_id")
  lastReadMessageId   String      @map("last_read_message_id") @db.Uuid
  updatedAt           DateTime    @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(3)

  conversation        Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@id([conversationId, userId])
  @@index([tenantId, userId, updatedAt])
  @@map("message_receipts")
}
```

**비즈니스 규칙**:
- "안 읽은 N명" 계산: `Conversation.members.length - count(receipts WHERE lastReadMessageId >= messageId)`
- 채팅창 활성/스크롤 진입 시에만 update (백그라운드 탭은 skip)
- ConversationMember.lastReadMessageId와 중복으로 보이지만, receipts는 별도 테이블로 분리하여 (a) update 빈번성 격리 (b) 향후 read receipt history 추적 확장 여지

### 2.7 UserBlock

```prisma
model UserBlock {
  id          String    @id @default(uuid()) @db.Uuid
  tenantId    String    @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid
  blockerId   String    @map("blocker_id")
  blockedId   String    @map("blocked_id")
  reason      String?
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)

  blocker     User      @relation("UserBlocker", fields: [blockerId], references: [id], onDelete: Cascade)
  blocked     User      @relation("UserBlocked", fields: [blockedId], references: [id], onDelete: Cascade)

  @@unique([blockerId, blockedId])
  @@index([tenantId, blockedId])
  @@map("user_blocks")
}
```

**비즈니스 규칙**:
- 양방향 적용: A가 B 차단 → A↔B 모든 메시지 송수신/멘션 차단
- 차단 후 그룹에서 만남 (S3.2): 새 그룹 초대 시 dialog 경고

### 2.8 AbuseReport

```prisma
model AbuseReport {
  id            String                  @id @default(uuid()) @db.Uuid
  tenantId      String                  @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid
  reporterId    String                  @map("reporter_id")
  targetKind    AbuseReportTargetKind
  targetId      String                  @map("target_id")  // messageId 또는 userId
  reason        String                  @db.Text
  status        AbuseReportStatus       @default(OPEN)
  resolvedById  String?                 @map("resolved_by_id")
  resolvedAt    DateTime?               @map("resolved_at") @db.Timestamptz(3)
  resolutionNote String?                @map("resolution_note") @db.Text
  createdAt     DateTime                @default(now()) @map("created_at") @db.Timestamptz(3)

  reporter      User                    @relation("AbuseReportReporter", fields: [reporterId], references: [id])
  resolvedBy    User?                   @relation("AbuseReportResolver", fields: [resolvedById], references: [id])

  @@unique([reporterId, targetKind, targetId])  // 동일 사용자 → 동일 대상 중복 신고 거부
  @@index([tenantId, status, createdAt(sort: Desc)])
  @@map("abuse_reports")
}
```

### 2.9 NotificationPreference

```prisma
model NotificationPreference {
  tenantId      String    @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid
  userId        String    @map("user_id")
  mentionsOnly  Boolean   @default(false) @map("mentions_only")
  dndStart      String?   @map("dnd_start")  // "22:00" 형식
  dndEnd        String?   @map("dnd_end")
  pushEnabled   Boolean   @default(true) @map("push_enabled")
  updatedAt     DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(3)

  user          User      @relation("UserNotifPref", fields: [userId], references: [id], onDelete: Cascade)

  @@id([tenantId, userId])
  @@map("notification_preferences")
}
```

### 2.10 PushSubscription (Phase 1.5)

```prisma
model PushSubscription {
  id          String    @id @default(uuid()) @db.Uuid
  tenantId    String    @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid
  userId      String    @map("user_id")
  endpoint    String    @unique  // Web Push endpoint URL
  p256dh      String    // ECDH public key
  auth        String    // auth secret
  userAgent   String?   @map("user_agent")
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)

  user        User      @relation("UserPushSub", fields: [userId], references: [id], onDelete: Cascade)

  @@index([tenantId, userId])
  @@map("push_subscriptions")
}
```

**비즈니스 규칙**:
- VAPID self-host (Q1 권장)
- endpoint UNIQUE: 동일 device 재구독 시 update
- iOS Safari = PWA 설치 시만 동작

### 2.11 Notification (Phase 1.5, 옵션)

```prisma
model Notification {
  id            String    @id @default(uuid()) @db.Uuid
  tenantId      String    @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid
  userId        String    @map("user_id")  // 수신자
  kind          String    // 'message' | 'mention' | 'report_resolved' | 'block'
  payload       Json
  readAt        DateTime? @map("read_at") @db.Timestamptz(3)
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)

  user          User      @relation("UserNotification", fields: [userId], references: [id], onDelete: Cascade)

  @@index([tenantId, userId, readAt, createdAt(sort: Desc)])
  @@map("notifications")
}
```

**용도**: 우상단 종 아이콘 알림 센터 — 미처리 알림 표시 + 클릭 시 deep link

---

## 3. Phase 2 추가 모델 (2종)

### 3.1 MessageReaction

```prisma
model MessageReaction {
  id          String    @id @default(uuid()) @db.Uuid
  tenantId    String    @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid
  messageId   String    @map("message_id") @db.Uuid
  userId      String    @map("user_id")
  emoji       String    // 유니코드 emoji 또는 sticker_id
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)

  message     Message   @relation(fields: [messageId], references: [id], onDelete: Cascade)
  user        User      @relation("UserReaction", fields: [userId], references: [id], onDelete: Cascade)

  @@unique([messageId, userId, emoji])
  @@index([tenantId, messageId])
  @@map("message_reactions")
}
```

### 3.2 MessageBookmark

```prisma
model MessageBookmark {
  id          String    @id @default(uuid()) @db.Uuid
  tenantId    String    @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid
  userId      String    @map("user_id")
  messageId   String    @map("message_id") @db.Uuid
  note        String?
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)

  user        User      @relation("UserBookmark", fields: [userId], references: [id], onDelete: Cascade)
  message     Message   @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@unique([userId, messageId])
  @@index([tenantId, userId, createdAt(sort: Desc)])
  @@map("message_bookmarks")
}
```

---

## 4. RLS 정책 (모든 테이블 공통)

### 4.1 정책 정의 SQL (마이그 #6에서 일괄 적용)

```sql
DO $$
DECLARE
  tbl TEXT;
  messenger_tables TEXT[] := ARRAY[
    'conversations', 'conversation_members', 'messages',
    'message_attachments', 'message_mentions', 'message_receipts',
    'user_blocks', 'abuse_reports', 'notification_preferences'
  ];
BEGIN
  FOREACH tbl IN ARRAY messenger_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format($pol$
      CREATE POLICY tenant_isolation ON %I
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
    $pol$, tbl);
  END LOOP;
END $$;
```

### 4.2 검증 쿼리 (마이그 적용 후 자동 실행)

```sql
-- 1) RLS 활성화 확인
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN ('conversations','conversation_members','messages',
                  'message_attachments','message_mentions','message_receipts',
                  'user_blocks','abuse_reports','notification_preferences');
-- 9 row 모두 t,t

-- 2) 정책 존재 확인 (9 row)
SELECT schemaname, tablename, policyname
FROM pg_policies WHERE policyname = 'tenant_isolation' AND tablename LIKE 'message%' OR tablename IN (...);

-- 3) Cross-tenant 침투 테스트 (수동, 단위 테스트로 자동화)
SET LOCAL app.tenant_id = '11111111-1111-1111-1111-111111111111';
SELECT count(*) FROM messages WHERE tenant_id = '22222222-2222-2222-2222-222222222222';
-- 0
```

---

## 5. 인덱스 전략

### 5.1 hot path 인덱스 (마이그 #1~5에서 정의)

| 테이블 | 인덱스 | 용도 |
|---|---|---|
| conversations | `(tenantId, lastMessageAt desc)` | 대화목록 정렬 |
| conversations | `(tenantId, kind)` | DM/그룹/채널 필터 |
| conversations | `(tenantId, archivedAt)` | 활성 대화만 |
| conversation_members | UNIQUE `(conversationId, userId)` | 중복 참여 방지 |
| conversation_members | `(tenantId, userId, leftAt)` | 사용자의 활성 대화 목록 |
| messages | UNIQUE `(tenantId, conversationId, clientGeneratedId)` | 멱등 송신 |
| messages | `(tenantId, conversationId, createdAt desc)` | 채팅창 메시지 stream |
| messages | `(tenantId, senderId, createdAt desc)` | 사용자 송신 이력 |
| message_mentions | UNIQUE `(messageId, mentionedUserId)` | 동일 멘션 중복 방지 |
| message_mentions | `(tenantId, mentionedUserId, createdAt desc)` | 사용자가 멘션받은 목록 |
| user_blocks | UNIQUE `(blockerId, blockedId)` | 중복 차단 방지 |
| abuse_reports | UNIQUE `(reporterId, targetKind, targetId)` | 중복 신고 방지 |
| abuse_reports | `(tenantId, status, createdAt desc)` | 운영자 신고 큐 |

### 5.2 partial index (마이그 #5에서 raw SQL)

```sql
-- 활성 메시지만 (회수 안 된 것) — channel timeline 조회 가속
CREATE INDEX messages_active_idx
  ON messages(tenant_id, conversation_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- 검색용 GIN trigram (Phase 1 LIKE 가속)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX messages_search_gin
  ON messages USING gin (body gin_trgm_ops)
  WHERE deleted_at IS NULL;
```

---

## 6. 기존 모델과의 관계 (FK 매핑)

### 6.1 User (`prisma/schema.prisma:76` 기존 모델)

User에 추가될 backref 관계:
```prisma
model User {
  // ... 기존 필드
  // Phase 1 Messenger backrefs
  conversationsCreated       Conversation[]              @relation("ConversationCreatedBy")
  conversationMemberships    ConversationMember[]        @relation("ConversationMembership")
  messagesSent               Message[]                   @relation("MessageSender")
  mentionsReceived           MessageMention[]            @relation("UserMentioned")
  blockedByMe                UserBlock[]                 @relation("UserBlocker")
  blockedMe                  UserBlock[]                 @relation("UserBlocked")
  abuseReportsFiled          AbuseReport[]               @relation("AbuseReportReporter")
  abuseReportsResolved       AbuseReport[]               @relation("AbuseReportResolver")
  notificationPreference     NotificationPreference?     @relation("UserNotifPref")
  pushSubscriptions          PushSubscription[]          @relation("UserPushSub")
  notifications              Notification[]              @relation("UserNotification")
  // Phase 2
  messageReactions           MessageReaction[]           @relation("UserReaction")
  messageBookmarks           MessageBookmark[]           @relation("UserBookmark")
}
```

### 6.2 File (`prisma/schema.prisma` 기존 filebox 모델)

File 모델은 **변경하지 않음**. 단방향 FK는 raw SQL로 message_attachments에 추가:
```sql
ALTER TABLE message_attachments
  ADD CONSTRAINT message_attachments_file_id_fkey
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE RESTRICT;
```

근거: filebox 코드 변경 시 회귀 위험. 단방향 FK + cleanup cron 패턴이 ADR-024 §4.3 (영향 범위 격리)에 부합.

### 6.3 TenantMembership (검증 only, FK 아님)

ConversationMember 추가 시 server-side에서:
```ts
const membership = await prismaWithTenant.tenantMembership.findFirst({
  where: { tenantId: ctx.tenantId, userId: targetUserId, leftAt: null }
});
if (!membership) throw new Error('TENANT_MEMBERSHIP_REQUIRED');
```

---

## 7. 데이터 보존 정책

| 데이터 | hot 보존 | cold/archive | cleanup |
|---|---|---|---|
| 메시지 (활성) | 영구 | — | 회수 시 deletedAt SET (body=NULL), 30일 후 첨부 dereference |
| 메시지 (회수) | 30일 (감사용) | 30일 후 hard delete | 일 1회 cron |
| 첨부 파일 | reference count > 0이면 영구 | 0 → 30일 grace | 일 1회 cron `messenger.cleanup_orphan_attachments` |
| 신고 (resolved/dismissed) | 90일 | 90일 후 hard delete | 일 1회 cron |
| 알림 (읽음) | 30일 | hard delete | 일 1회 cron |
| 푸시 구독 | endpoint 410 응답 시 | 즉시 hard delete | webhook 또는 send 실패 시 |
| typing indicator | 무저장 (메모리만) | — | 6초 TTL |

---

## 8. Migration step (개략)

상세는 `milestones.md`. 핵심 순서:

```
#1 (additive)    20260501000000_messenger_phase1_enums                # enum 6종
#2 (additive)    20260501010000_messenger_phase1_conversations        # conversations + members
#3 (additive)    20260501020000_messenger_phase1_messages             # messages + attachments + mentions + receipts
#4 (additive)    20260501030000_messenger_phase1_safety               # user_blocks + abuse_reports + notification_preferences
#5 (additive)    20260501040000_messenger_phase1_indexes_partial      # partial idx + GIN trgm
#6 (enforce)     20260501050000_messenger_phase1_grants               # RLS enable + tenant_isolation policy + GRANTs
```

각 마이그 적용 후 RLS 검증 쿼리 자동 실행 (CLAUDE.md 운영 정책).

---

## 9. ESLint / 타입 안전 가드

### 9.1 raw prisma 차단 (기존 ESLint rule `tenant/no-raw-prisma-without-tenant` 활용)

메신저 핸들러는 **반드시** `prismaWithTenant` 사용. 위반 시 빌드 실패.

### 9.2 TypeScript 모델 helper

```ts
// src/lib/messenger/types.ts (신설 예정)
export type ConversationWithLastMessage = Awaited<ReturnType<typeof prismaWithTenant.conversation.findFirst>> & {
  lastMessage: Message | null;
  unreadCount: number;
};

export type MessageWithRelations = Message & {
  sender: Pick<User, 'id'|'email'|'name'>;
  attachments: MessageAttachment[];
  mentions: MessageMention[];
  replyTo: Message | null;
};
```

---

## 10. 데이터 모델 결정 근거 한 줄

1. **tenantId 첫 컬럼 강제** — ADR-022 §1, 모든 cross-tenant 누출 차단
2. **clientGeneratedId UNIQUE** — 라인 LocalMessageId, 오프라인 멱등성
3. **soft delete (deletedAt)** — 24h 회수 + admin 무제한 + audit 가능성
4. **첨부=File FK 단방향** — filebox 모델 변경 회귀 회피, ADR-024 §4.3
5. **MessageReceipt 별도 테이블** — update 빈번성 격리 + 향후 read history 확장
6. **partial index WHERE deleted_at IS NULL** — 활성 메시지만 색인, 회수 데이터 비대화 회피
7. **GIN trgm index** — Phase 1 LIKE 검색 성능, Phase 2 tsvector 전환 시 drop
8. **AbuseReport UNIQUE 중복 거부** — 운영자 큐 폭주 방지
9. **PushSubscription endpoint UNIQUE** — 동일 device 재구독 시 update 패턴
10. **Notification 분리 테이블** — 알림 센터 표준 분리, audit_logs와 다른 인덱스 전략
