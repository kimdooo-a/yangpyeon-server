-- ============================================================
-- Migration: messenger_phase1_safety
-- ADR: ADR-030 + ADR-022 §1 + ADR-029
-- 작성: Claude Code 세션 64 (2026-04-26)
-- Stage: additive. user_blocks + abuse_reports + notification_preferences (3 테이블).
-- 의존: 20260501000000 (enums), 기존 users.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. user_blocks — 양방향 차단 (A↔B 송수신/멘션 모두 차단).
-- ────────────────────────────────────────────────────────────
CREATE TABLE "user_blocks" (
    "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"  UUID         NOT NULL DEFAULT COALESCE(
        (current_setting('app.tenant_id', true))::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid
    ),
    "blocker_id" TEXT         NOT NULL,
    "blocked_id" TEXT         NOT NULL,
    "reason"     TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "user_blocks"
    ADD CONSTRAINT "user_blocks_blocker_id_fkey"
    FOREIGN KEY ("blocker_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_blocks"
    ADD CONSTRAINT "user_blocks_blocked_id_fkey"
    FOREIGN KEY ("blocked_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "user_blocks_blocker_id_blocked_id_key"
    ON "user_blocks"("blocker_id", "blocked_id");
CREATE INDEX "user_blocks_tenant_id_blocked_id_idx"
    ON "user_blocks"("tenant_id", "blocked_id");

-- ────────────────────────────────────────────────────────────
-- 2. abuse_reports — UNIQUE 중복 신고 거부.
--    target_id 는 messageId 또는 userId — target_kind 분기 (FK 비참조).
-- ────────────────────────────────────────────────────────────
CREATE TABLE "abuse_reports" (
    "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"       UUID         NOT NULL DEFAULT COALESCE(
        (current_setting('app.tenant_id', true))::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid
    ),
    "reporter_id"     TEXT         NOT NULL,
    "target_kind"     "AbuseReportTargetKind" NOT NULL,
    "target_id"       TEXT         NOT NULL,
    "reason"          TEXT         NOT NULL,
    "status"          "AbuseReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_by_id"  TEXT,
    "resolved_at"     TIMESTAMPTZ(3),
    "resolution_note" TEXT,
    "created_at"      TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    CONSTRAINT "abuse_reports_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "abuse_reports"
    ADD CONSTRAINT "abuse_reports_reporter_id_fkey"
    FOREIGN KEY ("reporter_id") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "abuse_reports"
    ADD CONSTRAINT "abuse_reports_resolved_by_id_fkey"
    FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE CASCADE;

CREATE UNIQUE INDEX "abuse_reports_reporter_id_target_kind_target_id_key"
    ON "abuse_reports"("reporter_id", "target_kind", "target_id");
CREATE INDEX "abuse_reports_tenant_id_status_created_at_idx"
    ON "abuse_reports"("tenant_id", "status", "created_at" DESC);

-- ────────────────────────────────────────────────────────────
-- 3. notification_preferences — User 1:1 (tenant 단위 PK).
--    user_id @unique 유지 (User 가 이미 tenant-scoped 이므로 cross-tenant 충돌 0,
--    Prisma 1:1 관계 요건). 복합 PK (tenant_id, user_id) 는 query locality 목적.
-- ────────────────────────────────────────────────────────────
CREATE TABLE "notification_preferences" (
    "tenant_id"     UUID         NOT NULL DEFAULT COALESCE(
        (current_setting('app.tenant_id', true))::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid
    ),
    "user_id"       TEXT         NOT NULL,
    "mentions_only" BOOLEAN      NOT NULL DEFAULT false,
    "dnd_start"     TEXT,                              -- "HH:MM"
    "dnd_end"       TEXT,                              -- "HH:MM"
    "push_enabled"  BOOLEAN      NOT NULL DEFAULT true,
    "updated_at"    TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("tenant_id", "user_id")
);

ALTER TABLE "notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 글로벌 user_id @unique (Prisma 1:1 관계 요건).
CREATE UNIQUE INDEX "notification_preferences_user_id_key"
    ON "notification_preferences"("user_id");
