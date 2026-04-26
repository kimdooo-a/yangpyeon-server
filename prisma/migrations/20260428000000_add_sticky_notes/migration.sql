-- 세션 63 — Sticky Notes (Windows 스티커 메모 스타일)
-- ADR-022 §1: tenantId 첫 컬럼 + RLS 정책 강제.
-- ADR-023 §3 RLS 패턴: ENABLE + FORCE + tenant_isolation USING/WITH CHECK.
-- 적용: prisma migrate deploy.

-- ────────────────────────────────────────────────────────────
-- 1. enum + 테이블 생성
-- ────────────────────────────────────────────────────────────
CREATE TYPE "StickyNoteVisibility" AS ENUM ('PRIVATE', 'SHARED');

CREATE TABLE "sticky_notes" (
    "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"  UUID         NOT NULL DEFAULT (current_setting('app.tenant_id'))::uuid,
    "owner_id"   TEXT         NOT NULL,
    "content"    TEXT         NOT NULL DEFAULT '',
    "color"      TEXT         NOT NULL DEFAULT '#fde68a',
    "pos_x"      INTEGER      NOT NULL DEFAULT 40,
    "pos_y"      INTEGER      NOT NULL DEFAULT 40,
    "width"      INTEGER      NOT NULL DEFAULT 220,
    "height"     INTEGER      NOT NULL DEFAULT 220,
    "visibility" "StickyNoteVisibility" NOT NULL DEFAULT 'PRIVATE',
    "pinned"     BOOLEAN      NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),

    CONSTRAINT "sticky_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sticky_notes_tenant_id_owner_id_idx"
    ON "sticky_notes"("tenant_id", "owner_id");
CREATE INDEX "sticky_notes_tenant_id_visibility_updated_at_idx"
    ON "sticky_notes"("tenant_id", "visibility", "updated_at" DESC);

-- ────────────────────────────────────────────────────────────
-- 2. RLS — tenant_isolation (Phase 1.4 패턴 동일)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "sticky_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sticky_notes" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "sticky_notes"
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ────────────────────────────────────────────────────────────
-- 3. 권한 부여 (app_runtime / app_migration)
--    Phase 1.4 의 ALTER DEFAULT PRIVILEGES 가 신설 테이블에 자동 적용되지만
--    명시 GRANT 로 idempotent 보장.
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON "sticky_notes" TO app_runtime;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_migration') THEN
        GRANT ALL PRIVILEGES ON "sticky_notes" TO app_migration;
    END IF;
END $$;
