-- Phase 1.5 (T1.5) — TenantWorkerPool + circuit breaker + TenantCronPolicy.
-- 작성: 2026-04-27 세션 60
-- 트리거: ADR-028 §10 옵션 D ACCEPTED + 07-adr-028-impl-spec §7 마이그레이션 시퀀스 §1~2.
-- Stage: Phase 1 cron isolation 도입 — 모든 변경은 additive (기존 동작 0 회귀).
--
-- 본 마이그레이션이 하는 일:
--   1. cron_jobs 에 4 개 컬럼 추가 (consecutive_failures, circuit_state, circuit_opened_at, last_success_at).
--   2. cron_jobs(tenant_id, enabled) + cron_jobs(circuit_state, circuit_opened_at) 인덱스 생성.
--   3. cron_jobs.tenant_id 에 FK SetNull (Stage 1 nullable 호환) — onDelete: SetNull.
--   4. api_keys 에 (tenant_id, prefix) + (tenant_id, revoked_at) 인덱스 생성.
--   5. api_keys.tenant_id 에 FK SetNull (T1.3 include 호환).
--   6. tenant_cron_policies 테이블 신설 (07-adr-028-impl-spec §7.1).
--
-- 본 마이그레이션이 하지 않는 일 (Phase 2/3):
--   - 기존 cron_jobs row 의 tenant_id 백필 — Phase 1 Stage 2 backfill 별도 PR.
--   - tenant_cron_policies 시드 — 운영 콘솔에서 컨슈머 등록 시 1회 INSERT.

-- ────────────────────────────────────────────────────────────
-- 1. cron_jobs — 4 columns 추가 (circuit breaker 컬럼)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "cron_jobs" ADD COLUMN "consecutive_failures" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "cron_jobs" ADD COLUMN "circuit_state" TEXT NOT NULL DEFAULT 'CLOSED';
ALTER TABLE "cron_jobs" ADD COLUMN "circuit_opened_at" TIMESTAMPTZ(3);
ALTER TABLE "cron_jobs" ADD COLUMN "last_success_at" TIMESTAMPTZ(3);

-- ────────────────────────────────────────────────────────────
-- 2. cron_jobs — 인덱스 추가
-- ────────────────────────────────────────────────────────────
CREATE INDEX "cron_jobs_tenant_id_enabled_idx" ON "cron_jobs"("tenant_id", "enabled");
CREATE INDEX "cron_jobs_circuit_state_circuit_opened_at_idx" ON "cron_jobs"("circuit_state", "circuit_opened_at");

-- ────────────────────────────────────────────────────────────
-- 3. cron_jobs — tenant_id FK (SetNull, Stage 1 nullable 호환)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "cron_jobs"
    ADD CONSTRAINT "cron_jobs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ────────────────────────────────────────────────────────────
-- 4. api_keys — 인덱스 추가
-- ────────────────────────────────────────────────────────────
CREATE INDEX "api_keys_tenant_id_prefix_idx" ON "api_keys"("tenant_id", "prefix");
CREATE INDEX "api_keys_tenant_id_revoked_at_idx" ON "api_keys"("tenant_id", "revoked_at");

-- ────────────────────────────────────────────────────────────
-- 5. api_keys — tenant_id FK (SetNull, Stage 1 nullable 호환)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "api_keys"
    ADD CONSTRAINT "api_keys_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ────────────────────────────────────────────────────────────
-- 6. tenant_cron_policies — 신설 (07-adr-028-impl-spec §7.1)
-- ────────────────────────────────────────────────────────────
CREATE TABLE "tenant_cron_policies" (
    "tenant_id"                     UUID NOT NULL,
    "max_concurrent_jobs"           INTEGER NOT NULL DEFAULT 3,
    "job_timeout_ms"                INTEGER NOT NULL DEFAULT 30000,
    "job_memory_limit_mb"           INTEGER NOT NULL DEFAULT 128,
    "consecutive_failure_threshold" INTEGER NOT NULL DEFAULT 5,
    "ticks_per_day"                 INTEGER NOT NULL DEFAULT 1440,
    "allowed_fetch_hosts"           TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "webhook_timeout_ms"            INTEGER NOT NULL DEFAULT 60000,
    CONSTRAINT "tenant_cron_policies_pkey" PRIMARY KEY ("tenant_id")
);

ALTER TABLE "tenant_cron_policies"
    ADD CONSTRAINT "tenant_cron_policies_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ────────────────────────────────────────────────────────────
-- 검증 쿼리 (운영자 수동 실행)
-- ────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'cron_jobs'
--     AND column_name IN ('consecutive_failures','circuit_state','circuit_opened_at','last_success_at');
-- → 4 row 반환, 각 default/nullable 일치.
--
-- SELECT * FROM tenant_cron_policies LIMIT 1;
-- → 0 row (Phase 1.5 직후, 시드 없음).

-- ────────────────────────────────────────────────────────────
-- Rollback (Phase 1.5 — 즉시 회복 가능, 데이터 손실 없음)
-- ────────────────────────────────────────────────────────────
-- DROP TABLE "tenant_cron_policies";
-- ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_tenant_id_fkey";
-- DROP INDEX "api_keys_tenant_id_revoked_at_idx";
-- DROP INDEX "api_keys_tenant_id_prefix_idx";
-- ALTER TABLE "cron_jobs" DROP CONSTRAINT "cron_jobs_tenant_id_fkey";
-- DROP INDEX "cron_jobs_circuit_state_circuit_opened_at_idx";
-- DROP INDEX "cron_jobs_tenant_id_enabled_idx";
-- ALTER TABLE "cron_jobs" DROP COLUMN "last_success_at";
-- ALTER TABLE "cron_jobs" DROP COLUMN "circuit_opened_at";
-- ALTER TABLE "cron_jobs" DROP COLUMN "circuit_state";
-- ALTER TABLE "cron_jobs" DROP COLUMN "consecutive_failures";
