-- Phase 1.4 (T1.4) — Rollback SQL.
-- 작성: 2026-04-27 세션 60+
-- 사용 시점: Stage 3 (RLS 활성화) 직후 cross-tenant leak 또는 성능 회귀 발견 시.
--
-- 실행 순서: migration.sql 의 역순.
-- 운영자 수동 실행 (prisma 자동 rollback 미지원).
-- 데이터 무손실 — backfill 된 default tenant row 는 그대로 유지.

-- ────────────────────────────────────────────────────────────
-- 1. RLS 정책 DROP + DISABLE
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
    tbl TEXT;
    business_tables TEXT[] := ARRAY[
        'users', 'sessions', 'folders', 'files', 'api_keys',
        'sql_queries', 'edge_functions', 'edge_function_runs',
        'cron_jobs', 'webhooks', 'mfa_enrollments', 'mfa_recovery_codes',
        'webauthn_authenticators', 'rate_limit_buckets', 'log_drains'
    ];
BEGIN
    FOREACH tbl IN ARRAY business_tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
        EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', tbl);
        EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', tbl);
    END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- 2. Composite unique 제거 / 기존 unique 복원
-- ────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS "users_tenant_id_email_key";
DROP INDEX IF EXISTS "edge_functions_tenant_id_name_key";
DROP INDEX IF EXISTS "cron_jobs_tenant_id_name_key";

DROP INDEX IF EXISTS "folders_tenant_id_parent_id_name_owner_id_key";
ALTER TABLE "folders"
    ADD CONSTRAINT "folders_parent_id_name_owner_id_key"
    UNIQUE ("parent_id", "name", "owner_id");

-- ────────────────────────────────────────────────────────────
-- 3. tenant_id index 제거 (필요 시. 일반적으로 보존이 안전).
--    운영자 판단으로 keep / drop 결정.
-- ────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS "users_tenant_id_idx";
-- DROP INDEX IF EXISTS "folders_tenant_id_idx";
-- DROP INDEX IF EXISTS "files_tenant_id_folder_id_idx";
-- DROP INDEX IF EXISTS "sessions_tenant_id_user_id_revoked_at_expires_at_idx";
-- DROP INDEX IF EXISTS "sql_queries_tenant_id_owner_id_scope_idx";
-- DROP INDEX IF EXISTS "edge_functions_tenant_id_owner_id_idx";
-- DROP INDEX IF EXISTS "edge_function_runs_tenant_id_function_id_started_at_idx";
-- DROP INDEX IF EXISTS "webhooks_tenant_id_source_table_event_idx";
-- DROP INDEX IF EXISTS "api_keys_tenant_id_owner_id_idx";
-- DROP INDEX IF EXISTS "log_drains_tenant_id_idx";
-- DROP INDEX IF EXISTS "mfa_enrollments_tenant_id_idx";
-- DROP INDEX IF EXISTS "mfa_recovery_codes_tenant_id_user_id_used_at_idx";
-- DROP INDEX IF EXISTS "webauthn_authenticators_tenant_id_user_id_idx";
-- DROP INDEX IF EXISTS "rate_limit_buckets_tenant_id_window_start_idx";

-- ────────────────────────────────────────────────────────────
-- 4. FK Cascade → SetNull 복원 (Stage 1 호환)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "cron_jobs" DROP CONSTRAINT "cron_jobs_tenant_id_fkey";
ALTER TABLE "cron_jobs"
    ADD CONSTRAINT "cron_jobs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_tenant_id_fkey";
ALTER TABLE "api_keys"
    ADD CONSTRAINT "api_keys_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ────────────────────────────────────────────────────────────
-- 5. DEFAULT 제거 + NOT NULL 해제
-- ────────────────────────────────────────────────────────────
ALTER TABLE "users"                  ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "sessions"               ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "folders"                ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "files"                  ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "api_keys"               ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "sql_queries"            ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "edge_functions"         ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "edge_function_runs"     ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "cron_jobs"              ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "webhooks"               ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "mfa_enrollments"        ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "mfa_recovery_codes"     ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "webauthn_authenticators" ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "rate_limit_buckets"     ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "log_drains"             ALTER COLUMN "tenant_id" DROP DEFAULT;

ALTER TABLE "users"                  ALTER COLUMN "tenant_id" DROP NOT NULL;
ALTER TABLE "sessions"               ALTER COLUMN "tenant_id" DROP NOT NULL;
ALTER TABLE "folders"                ALTER COLUMN "tenant_id" DROP NOT NULL;
ALTER TABLE "files"                  ALTER COLUMN "tenant_id" DROP NOT NULL;
ALTER TABLE "api_keys"               ALTER COLUMN "tenant_id" DROP NOT NULL;
ALTER TABLE "sql_queries"            ALTER COLUMN "tenant_id" DROP NOT NULL;
ALTER TABLE "edge_functions"         ALTER COLUMN "tenant_id" DROP NOT NULL;
ALTER TABLE "edge_function_runs"     ALTER COLUMN "tenant_id" DROP NOT NULL;
ALTER TABLE "cron_jobs"              ALTER COLUMN "tenant_id" DROP NOT NULL;
ALTER TABLE "webhooks"               ALTER COLUMN "tenant_id" DROP NOT NULL;
ALTER TABLE "mfa_enrollments"        ALTER COLUMN "tenant_id" DROP NOT NULL;
ALTER TABLE "mfa_recovery_codes"     ALTER COLUMN "tenant_id" DROP NOT NULL;
ALTER TABLE "webauthn_authenticators" ALTER COLUMN "tenant_id" DROP NOT NULL;
ALTER TABLE "rate_limit_buckets"     ALTER COLUMN "tenant_id" DROP NOT NULL;
ALTER TABLE "log_drains"             ALTER COLUMN "tenant_id" DROP NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 6. Roles — 보존 권장 (drop 시 운영자 cascade 영향 검토 필요).
--    DROP ROLE 은 별도 운영 결정 후 수동 실행:
-- ────────────────────────────────────────────────────────────
-- REVOKE app_admin FROM app_runtime;
-- REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM app_runtime;
-- REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM app_migration;
-- DROP ROLE IF EXISTS app_admin;
-- DROP ROLE IF EXISTS app_runtime;
-- DROP ROLE IF EXISTS app_migration;
