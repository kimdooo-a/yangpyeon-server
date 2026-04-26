-- ============================================================
-- Migration: messenger_phase1_messages
-- ADR: ADR-030 + ADR-022 §1 + ADR-029
-- 작성: Claude Code 세션 64 (2026-04-26)
-- Stage: additive. messages + message_attachments + message_mentions + message_receipts (4 테이블).
--        + 보류된 conversation_members.last_read_message_id FK 추가.
--        + message_attachments.file_id 단방향 FK → files (data-model §6.2).
-- 의존: 20260501000000 (enums), 20260501010000 (conversations + members), 기존 users/files.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. messages
-- ────────────────────────────────────────────────────────────
CREATE TABLE "messages" (
    "id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"           UUID         NOT NULL DEFAULT COALESCE(
        (current_setting('app.tenant_id', true))::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid
    ),
    "conversation_id"     UUID         NOT NULL,
    "sender_id"           TEXT,                          -- SYSTEM 메시지는 NULL
    "kind"                "MessageKind" NOT NULL DEFAULT 'TEXT',
    "body"                TEXT,                          -- 회수 시 NULL
    "reply_to_id"         UUID,
    "client_generated_id" TEXT         NOT NULL,
    "edited_at"           TIMESTAMPTZ(3),
    "edit_count"          INTEGER      NOT NULL DEFAULT 0,
    "deleted_at"          TIMESTAMPTZ(3),
    "deleted_by"          TEXT,                          -- 'self' | 'admin'
    "created_at"          TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- FK
ALTER TABLE "messages"
    ADD CONSTRAINT "messages_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "messages"
    ADD CONSTRAINT "messages_sender_id_fkey"
    FOREIGN KEY ("sender_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "messages"
    ADD CONSTRAINT "messages_reply_to_id_fkey"
    FOREIGN KEY ("reply_to_id") REFERENCES "messages"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 멱등성 UNIQUE: (tenant_id, conversation_id, client_generated_id).
CREATE UNIQUE INDEX "messages_tenant_id_conversation_id_client_generated_id_key"
    ON "messages"("tenant_id", "conversation_id", "client_generated_id");

-- 인덱스: 채팅창 stream + 사용자 송신 이력.
CREATE INDEX "messages_tenant_id_conversation_id_created_at_idx"
    ON "messages"("tenant_id", "conversation_id", "created_at" DESC);
CREATE INDEX "messages_tenant_id_sender_id_created_at_idx"
    ON "messages"("tenant_id", "sender_id", "created_at" DESC);

-- ────────────────────────────────────────────────────────────
-- 2. 보류 FK: conversation_members.last_read_message_id → messages.id (SetNull).
-- ────────────────────────────────────────────────────────────
ALTER TABLE "conversation_members"
    ADD CONSTRAINT "conversation_members_last_read_message_id_fkey"
    FOREIGN KEY ("last_read_message_id") REFERENCES "messages"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ────────────────────────────────────────────────────────────
-- 3. message_attachments
--    file_id 단방향 FK → files.id (RESTRICT) — 회수 cron 우회 (data-model §6.2).
-- ────────────────────────────────────────────────────────────
CREATE TABLE "message_attachments" (
    "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"     UUID         NOT NULL DEFAULT COALESCE(
        (current_setting('app.tenant_id', true))::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid
    ),
    "message_id"    UUID         NOT NULL,
    "file_id"       TEXT         NOT NULL,
    "kind"          "AttachmentKind" NOT NULL,
    "display_order" INTEGER      NOT NULL DEFAULT 0,
    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "message_attachments"
    ADD CONSTRAINT "message_attachments_message_id_fkey"
    FOREIGN KEY ("message_id") REFERENCES "messages"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 단방향 FK: message_attachments.file_id → files.id (RESTRICT).
-- files 모델 변경 회피 (ADR-024 §4.3, data-model §6.2).
ALTER TABLE "message_attachments"
    ADD CONSTRAINT "message_attachments_file_id_fkey"
    FOREIGN KEY ("file_id") REFERENCES "files"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "message_attachments_tenant_id_message_id_display_order_idx"
    ON "message_attachments"("tenant_id", "message_id", "display_order");
CREATE INDEX "message_attachments_tenant_id_file_id_idx"
    ON "message_attachments"("tenant_id", "file_id");

-- ────────────────────────────────────────────────────────────
-- 4. message_mentions
-- ────────────────────────────────────────────────────────────
CREATE TABLE "message_mentions" (
    "id"                UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"         UUID         NOT NULL DEFAULT COALESCE(
        (current_setting('app.tenant_id', true))::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid
    ),
    "message_id"        UUID         NOT NULL,
    "mentioned_user_id" TEXT         NOT NULL,
    "created_at"        TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    CONSTRAINT "message_mentions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "message_mentions"
    ADD CONSTRAINT "message_mentions_message_id_fkey"
    FOREIGN KEY ("message_id") REFERENCES "messages"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "message_mentions"
    ADD CONSTRAINT "message_mentions_mentioned_user_id_fkey"
    FOREIGN KEY ("mentioned_user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "message_mentions_message_id_mentioned_user_id_key"
    ON "message_mentions"("message_id", "mentioned_user_id");
CREATE INDEX "message_mentions_tenant_id_mentioned_user_id_created_at_idx"
    ON "message_mentions"("tenant_id", "mentioned_user_id", "created_at" DESC);

-- ────────────────────────────────────────────────────────────
-- 5. message_receipts
--    PK (conversation_id, user_id). user_id FK 는 application layer (RLS + tenant 보장).
-- ────────────────────────────────────────────────────────────
CREATE TABLE "message_receipts" (
    "tenant_id"            UUID         NOT NULL DEFAULT COALESCE(
        (current_setting('app.tenant_id', true))::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid
    ),
    "conversation_id"      UUID         NOT NULL,
    "user_id"              TEXT         NOT NULL,
    "last_read_message_id" UUID         NOT NULL,
    "updated_at"           TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    CONSTRAINT "message_receipts_pkey" PRIMARY KEY ("conversation_id", "user_id")
);

ALTER TABLE "message_receipts"
    ADD CONSTRAINT "message_receipts_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "message_receipts_tenant_id_user_id_updated_at_idx"
    ON "message_receipts"("tenant_id", "user_id", "updated_at");
