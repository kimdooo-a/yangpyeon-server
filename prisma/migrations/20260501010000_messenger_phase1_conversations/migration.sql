-- ============================================================
-- Migration: messenger_phase1_conversations
-- ADR: ADR-030 + ADR-022 §1 (tenant_id 1급) + ADR-029 (RLS 마이그 #6에서 일괄)
-- 작성: Claude Code 세션 64 (2026-04-26)
-- Stage: additive. conversations + conversation_members 2 테이블 생성.
-- 의존: 20260501000000 (enums), 기존 users 테이블.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- conversations
--   tenant_id default 패턴: COALESCE + missing_ok (20260428100000 fix 와 일치).
-- ────────────────────────────────────────────────────────────
CREATE TABLE "conversations" (
    "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"       UUID         NOT NULL DEFAULT COALESCE(
        (current_setting('app.tenant_id', true))::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid
    ),
    "kind"            "ConversationKind" NOT NULL,
    "title"           TEXT,
    "created_by_id"   TEXT         NOT NULL,
    "last_message_at" TIMESTAMPTZ(3),
    "archived_at"     TIMESTAMPTZ(3),
    "created_at"      TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    "updated_at"      TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- FK: conversations.created_by_id → users.id (NO ACTION 기본).
ALTER TABLE "conversations"
    ADD CONSTRAINT "conversations_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE CASCADE;

-- 인덱스: 대화목록 정렬 + kind 필터 + 활성 대화.
CREATE INDEX "conversations_tenant_id_last_message_at_idx"
    ON "conversations"("tenant_id", "last_message_at" DESC);
CREATE INDEX "conversations_tenant_id_kind_idx"
    ON "conversations"("tenant_id", "kind");
CREATE INDEX "conversations_tenant_id_archived_at_idx"
    ON "conversations"("tenant_id", "archived_at");

-- ────────────────────────────────────────────────────────────
-- conversation_members
--   last_read_message_id FK 는 messages 테이블 생성 후(마이그 #3) ALTER ADD CONSTRAINT.
-- ────────────────────────────────────────────────────────────
CREATE TABLE "conversation_members" (
    "id"                   UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"            UUID         NOT NULL DEFAULT COALESCE(
        (current_setting('app.tenant_id', true))::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid
    ),
    "conversation_id"      UUID         NOT NULL,
    "user_id"              TEXT         NOT NULL,
    "role"                 "ConversationMemberRole" NOT NULL DEFAULT 'MEMBER',
    "joined_at"            TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    "last_read_message_id" UUID,
    "pinned_at"            TIMESTAMPTZ(3),
    "muted_until"          TIMESTAMPTZ(3),
    "left_at"              TIMESTAMPTZ(3),
    CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("id")
);

-- FK: conversation_members.conversation_id → conversations.id (CASCADE).
ALTER TABLE "conversation_members"
    ADD CONSTRAINT "conversation_members_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- FK: conversation_members.user_id → users.id (CASCADE).
ALTER TABLE "conversation_members"
    ADD CONSTRAINT "conversation_members_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- UNIQUE: (conversation_id, user_id) — 중복 참여 방지.
CREATE UNIQUE INDEX "conversation_members_conversation_id_user_id_key"
    ON "conversation_members"("conversation_id", "user_id");

-- 인덱스: 사용자의 활성 대화 + 대화의 활성 멤버.
CREATE INDEX "conversation_members_tenant_id_user_id_left_at_idx"
    ON "conversation_members"("tenant_id", "user_id", "left_at");
CREATE INDEX "conversation_members_tenant_id_conversation_id_left_at_idx"
    ON "conversation_members"("tenant_id", "conversation_id", "left_at");
