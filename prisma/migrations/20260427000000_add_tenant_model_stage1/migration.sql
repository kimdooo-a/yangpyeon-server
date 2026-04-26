-- Phase 0.3 (T0.3) Stage 1 additive — 멀티테넌트 BaaS 1급 시민 도입.
-- 작성: 2026-04-26 세션 59
-- 트리거: ADR-022/023/026 ACCEPTED 2026-04-26 세션 58
-- 영향: 기존 동작 0 회귀 — nullable 컬럼만 추가, 데이터 변경 없음.
-- Stage: 1 of 5 (additive). Stage 2 backfill / Stage 3 enforce(NOT NULL+RLS) 는 Phase 1 에서.
--
-- 본 마이그레이션이 하는 일:
--   1. tenants 테이블 신설 (Tenant 모델 — id UUID PK, slug TEXT UNIQUE, status, etc)
--   2. 'default' tenant 1행 시드 (모든 기존 row 의 향후 backfill 대상)
--   3. 18 개 비즈니스 테이블에 tenant_id UUID NULL 컬럼 추가
--
-- 본 마이그레이션이 하지 않는 일 (Phase 1 이후):
--   - tenant_id 채움 (UPDATE) — Stage 2
--   - NOT NULL 전환 — Stage 3
--   - RLS 정책 — Stage 3
--   - FK constraint — Stage 3 (현재는 단순 UUID 컬럼)

-- ────────────────────────────────────────────────────────────
-- 1. tenants 테이블 신설
-- ────────────────────────────────────────────────────────────
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "runtime_overrides" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- ────────────────────────────────────────────────────────────
-- 2. 'default' tenant 시드 (legacy 단일테넌트 호환용 backfill 대상)
--    고정 UUID 사용 — Phase 1 backfill SQL 이 본 UUID 로 모든 row 채움.
--    Sprint Plan §0.3 + Migration Strategy §2.1.2 T1-5 참조.
-- ────────────────────────────────────────────────────────────
INSERT INTO "tenants" ("id", "slug", "display_name", "status", "created_at", "updated_at")
VALUES (
    '00000000-0000-0000-0000-000000000000',
    'default',
    'Default (legacy single-tenant)',
    'active',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- ────────────────────────────────────────────────────────────
-- 3. 18 개 비즈니스 테이블에 tenant_id UUID NULL 컬럼 추가
--    Stage 1 additive — 모든 기존 row 의 tenant_id 는 NULL 로 시작.
--    Phase 1 Stage 2 에서 default UUID 로 backfill 후 Stage 3 에서 NOT NULL 전환.
-- ────────────────────────────────────────────────────────────

ALTER TABLE "users" ADD COLUMN "tenant_id" UUID;
ALTER TABLE "webauthn_authenticators" ADD COLUMN "tenant_id" UUID;
ALTER TABLE "webauthn_challenges" ADD COLUMN "tenant_id" UUID;
ALTER TABLE "mfa_enrollments" ADD COLUMN "tenant_id" UUID;
ALTER TABLE "mfa_recovery_codes" ADD COLUMN "tenant_id" UUID;
ALTER TABLE "jwks_keys" ADD COLUMN "tenant_id" UUID;
ALTER TABLE "rate_limit_buckets" ADD COLUMN "tenant_id" UUID;
ALTER TABLE "sessions" ADD COLUMN "tenant_id" UUID;
ALTER TABLE "folders" ADD COLUMN "tenant_id" UUID;
ALTER TABLE "files" ADD COLUMN "tenant_id" UUID;
ALTER TABLE "sql_queries" ADD COLUMN "tenant_id" UUID;
ALTER TABLE "edge_functions" ADD COLUMN "tenant_id" UUID;
ALTER TABLE "edge_function_runs" ADD COLUMN "tenant_id" UUID;
ALTER TABLE "webhooks" ADD COLUMN "tenant_id" UUID;
ALTER TABLE "cron_jobs" ADD COLUMN "tenant_id" UUID;
ALTER TABLE "api_keys" ADD COLUMN "tenant_id" UUID;
ALTER TABLE "log_drains" ADD COLUMN "tenant_id" UUID;
ALTER TABLE "secret_items" ADD COLUMN "tenant_id" UUID;

-- ────────────────────────────────────────────────────────────
-- 검증 쿼리 (운영자 수동 실행)
-- ────────────────────────────────────────────────────────────
-- SELECT * FROM tenants WHERE slug='default';
-- → 1 row 반환 (id='00000000-0000-0000-0000-000000000000')
--
-- SELECT COUNT(*) FROM users WHERE tenant_id IS NULL;
-- → 기존 user 수 = NULL 행 수 (모두 NULL)
--
-- 동일 패턴 18 테이블 모두에 대해 검증 가능.

-- ────────────────────────────────────────────────────────────
-- Rollback (Stage 1 — 즉시 회복 가능, 데이터 손실 없음)
-- ────────────────────────────────────────────────────────────
-- ALTER TABLE "users" DROP COLUMN "tenant_id";
-- ... 18 테이블 모두 ...
-- DROP TABLE "tenants";
