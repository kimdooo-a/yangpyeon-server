-- Phase 1.4 (T1.4) — ADR-023 Stage 3: NOT NULL + dbgenerated default + RLS 정책 활성화.
-- 작성: 2026-04-27 세션 60+
-- 트리거: ADR-023 ACCEPTED 2026-04-26 + 02-adr-023-impl-spec §3.3 / §9.3
-- Stage: 3 of 5 (transformative). Stage 1 additive(20260427000000_add_tenant_model_stage1) 의 후속.
--
-- 본 마이그레이션이 하는 일:
--   1. 15 개 비즈니스 테이블의 tenant_id 백필 (defensive — '00000000-...-000000000000' default tenant).
--   2. tenant_id SET NOT NULL.
--   3. tenant_id SET DEFAULT (current_setting('app.tenant_id'))::uuid.
--   4. 15 개 테이블 ENABLE / FORCE ROW LEVEL SECURITY + tenant_isolation 정책 생성.
--   5. composite unique 추가 (users / edge_functions / cron_jobs / folders).
--   6. app_migration (BYPASSRLS) + app_runtime role 생성 — 운영자 패스워드는 별도.
--
-- 본 마이그레이션이 하지 않는 일:
--   - JwksKey / SecretItem / WebAuthnChallenge 의 RLS — spec §2.4 Tenant-bypass.
--   - audit_logs RLS — 본 프로젝트는 audit_logs 가 SQLite (Drizzle) 에 있음 (PG 외부).
--     Postgres 로 이관 시 spec §3.4 정책 적용 (별도 ADR).
--   - 호출 사이트의 (tenantId, email) findUnique 전환 — 후속 PR.
--
-- 중요: 본 마이그레이션은 "transformative". prisma migrate deploy 만으로 적용.
--   prisma migrate dev 는 사용 금지 (운영자 패스워드 placeholder 처리 필요).

-- ────────────────────────────────────────────────────────────
-- 1. Backfill — 모든 NULL tenant_id 를 default tenant 로 채움
--    Stage 1 의 ALTER TABLE ADD COLUMN 시 default 가 없었으므로 기존 row 는 NULL.
--    Phase 1.5 의 cron_jobs / api_keys 도 nullable FK 였으므로 동일.
-- ────────────────────────────────────────────────────────────
UPDATE "users"                  SET "tenant_id" = '00000000-0000-0000-0000-000000000000' WHERE "tenant_id" IS NULL;
UPDATE "sessions"               SET "tenant_id" = '00000000-0000-0000-0000-000000000000' WHERE "tenant_id" IS NULL;
UPDATE "folders"                SET "tenant_id" = '00000000-0000-0000-0000-000000000000' WHERE "tenant_id" IS NULL;
UPDATE "files"                  SET "tenant_id" = '00000000-0000-0000-0000-000000000000' WHERE "tenant_id" IS NULL;
UPDATE "api_keys"               SET "tenant_id" = '00000000-0000-0000-0000-000000000000' WHERE "tenant_id" IS NULL;
UPDATE "sql_queries"            SET "tenant_id" = '00000000-0000-0000-0000-000000000000' WHERE "tenant_id" IS NULL;
UPDATE "edge_functions"         SET "tenant_id" = '00000000-0000-0000-0000-000000000000' WHERE "tenant_id" IS NULL;
UPDATE "edge_function_runs"     SET "tenant_id" = '00000000-0000-0000-0000-000000000000' WHERE "tenant_id" IS NULL;
UPDATE "cron_jobs"              SET "tenant_id" = '00000000-0000-0000-0000-000000000000' WHERE "tenant_id" IS NULL;
UPDATE "webhooks"               SET "tenant_id" = '00000000-0000-0000-0000-000000000000' WHERE "tenant_id" IS NULL;
UPDATE "mfa_enrollments"        SET "tenant_id" = '00000000-0000-0000-0000-000000000000' WHERE "tenant_id" IS NULL;
UPDATE "mfa_recovery_codes"     SET "tenant_id" = '00000000-0000-0000-0000-000000000000' WHERE "tenant_id" IS NULL;
UPDATE "webauthn_authenticators" SET "tenant_id" = '00000000-0000-0000-0000-000000000000' WHERE "tenant_id" IS NULL;
UPDATE "rate_limit_buckets"     SET "tenant_id" = '00000000-0000-0000-0000-000000000000' WHERE "tenant_id" IS NULL;
UPDATE "log_drains"             SET "tenant_id" = '00000000-0000-0000-0000-000000000000' WHERE "tenant_id" IS NULL;

-- ────────────────────────────────────────────────────────────
-- 2. SET NOT NULL — 15 개 비즈니스 테이블
-- ────────────────────────────────────────────────────────────
ALTER TABLE "users"                  ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "sessions"               ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "folders"                ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "files"                  ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "api_keys"               ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "sql_queries"            ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "edge_functions"         ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "edge_function_runs"     ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "cron_jobs"              ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "webhooks"               ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "mfa_enrollments"        ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "mfa_recovery_codes"     ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "webauthn_authenticators" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "rate_limit_buckets"     ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "log_drains"             ALTER COLUMN "tenant_id" SET NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 3. SET DEFAULT (current_setting('app.tenant_id'))::uuid
--    Prisma dbgenerated 와 정합. INSERT 시 app.tenant_id GUC 가 설정되어 있어야 함
--    (withTenant() / withTenantTx() 가 SET LOCAL 로 보장).
-- ────────────────────────────────────────────────────────────
ALTER TABLE "users"                  ALTER COLUMN "tenant_id" SET DEFAULT (current_setting('app.tenant_id'))::uuid;
ALTER TABLE "sessions"               ALTER COLUMN "tenant_id" SET DEFAULT (current_setting('app.tenant_id'))::uuid;
ALTER TABLE "folders"                ALTER COLUMN "tenant_id" SET DEFAULT (current_setting('app.tenant_id'))::uuid;
ALTER TABLE "files"                  ALTER COLUMN "tenant_id" SET DEFAULT (current_setting('app.tenant_id'))::uuid;
ALTER TABLE "api_keys"               ALTER COLUMN "tenant_id" SET DEFAULT (current_setting('app.tenant_id'))::uuid;
ALTER TABLE "sql_queries"            ALTER COLUMN "tenant_id" SET DEFAULT (current_setting('app.tenant_id'))::uuid;
ALTER TABLE "edge_functions"         ALTER COLUMN "tenant_id" SET DEFAULT (current_setting('app.tenant_id'))::uuid;
ALTER TABLE "edge_function_runs"     ALTER COLUMN "tenant_id" SET DEFAULT (current_setting('app.tenant_id'))::uuid;
ALTER TABLE "cron_jobs"              ALTER COLUMN "tenant_id" SET DEFAULT (current_setting('app.tenant_id'))::uuid;
ALTER TABLE "webhooks"               ALTER COLUMN "tenant_id" SET DEFAULT (current_setting('app.tenant_id'))::uuid;
ALTER TABLE "mfa_enrollments"        ALTER COLUMN "tenant_id" SET DEFAULT (current_setting('app.tenant_id'))::uuid;
ALTER TABLE "mfa_recovery_codes"     ALTER COLUMN "tenant_id" SET DEFAULT (current_setting('app.tenant_id'))::uuid;
ALTER TABLE "webauthn_authenticators" ALTER COLUMN "tenant_id" SET DEFAULT (current_setting('app.tenant_id'))::uuid;
ALTER TABLE "rate_limit_buckets"     ALTER COLUMN "tenant_id" SET DEFAULT (current_setting('app.tenant_id'))::uuid;
ALTER TABLE "log_drains"             ALTER COLUMN "tenant_id" SET DEFAULT (current_setting('app.tenant_id'))::uuid;

-- ────────────────────────────────────────────────────────────
-- 4. 기존 cron_jobs / api_keys FK 변경 (SetNull → Cascade) — schema 정합.
--    NOT NULL 전환과 함께 ON DELETE 정책도 Cascade 로 (SetNull 은 NOT NULL 위반).
-- ────────────────────────────────────────────────────────────
ALTER TABLE "cron_jobs" DROP CONSTRAINT "cron_jobs_tenant_id_fkey";
ALTER TABLE "cron_jobs"
    ADD CONSTRAINT "cron_jobs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_tenant_id_fkey";
ALTER TABLE "api_keys"
    ADD CONSTRAINT "api_keys_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ────────────────────────────────────────────────────────────
-- 5. Composite unique 추가 — schema 의 @@unique([tenantId, ...]) 와 일치.
--    글로벌 unique (users.email / edge_functions.name / cron_jobs.name) 는 호출 사이트 호환 보존.
-- ────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "users_tenant_id_email_key"        ON "users"("tenant_id", "email");
CREATE UNIQUE INDEX "edge_functions_tenant_id_name_key" ON "edge_functions"("tenant_id", "name");
CREATE UNIQUE INDEX "cron_jobs_tenant_id_name_key"     ON "cron_jobs"("tenant_id", "name");

-- folders: 기존 (parent_id, name, owner_id) → (tenant_id, parent_id, name, owner_id) 로 교체.
ALTER TABLE "folders" DROP CONSTRAINT "folders_parent_id_name_owner_id_key";
CREATE UNIQUE INDEX "folders_tenant_id_parent_id_name_owner_id_key"
    ON "folders"("tenant_id", "parent_id", "name", "owner_id");

-- ────────────────────────────────────────────────────────────
-- 6. tenant_id index 보강 (RLS planner 효율 + Phase 1 백필 정합)
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "users_tenant_id_idx"                  ON "users"("tenant_id");
CREATE INDEX IF NOT EXISTS "folders_tenant_id_idx"                ON "folders"("tenant_id");
CREATE INDEX IF NOT EXISTS "files_tenant_id_folder_id_idx"        ON "files"("tenant_id", "folder_id");
CREATE INDEX IF NOT EXISTS "sessions_tenant_id_user_id_revoked_at_expires_at_idx"
    ON "sessions"("tenant_id", "user_id", "revoked_at", "expires_at");
CREATE INDEX IF NOT EXISTS "sql_queries_tenant_id_owner_id_scope_idx"
    ON "sql_queries"("tenant_id", "owner_id", "scope");
CREATE INDEX IF NOT EXISTS "edge_functions_tenant_id_owner_id_idx"
    ON "edge_functions"("tenant_id", "owner_id");
CREATE INDEX IF NOT EXISTS "edge_function_runs_tenant_id_function_id_started_at_idx"
    ON "edge_function_runs"("tenant_id", "function_id", "started_at");
CREATE INDEX IF NOT EXISTS "webhooks_tenant_id_source_table_event_idx"
    ON "webhooks"("tenant_id", "source_table", "event");
CREATE INDEX IF NOT EXISTS "api_keys_tenant_id_owner_id_idx"
    ON "api_keys"("tenant_id", "owner_id");
CREATE INDEX IF NOT EXISTS "log_drains_tenant_id_idx"             ON "log_drains"("tenant_id");
CREATE INDEX IF NOT EXISTS "mfa_enrollments_tenant_id_idx"        ON "mfa_enrollments"("tenant_id");
CREATE INDEX IF NOT EXISTS "mfa_recovery_codes_tenant_id_user_id_used_at_idx"
    ON "mfa_recovery_codes"("tenant_id", "user_id", "used_at");
CREATE INDEX IF NOT EXISTS "webauthn_authenticators_tenant_id_user_id_idx"
    ON "webauthn_authenticators"("tenant_id", "user_id");
CREATE INDEX IF NOT EXISTS "rate_limit_buckets_tenant_id_window_start_idx"
    ON "rate_limit_buckets"("tenant_id", "window_start");

-- folders 기존 owner_id index 는 보존, 신규 tenant_id 단독 idx 만 추가됨.
-- Stage 1 의 sessions(user_id, revoked_at, expires_at) idx 는 기존대로 유지 (drop 없음).

-- ────────────────────────────────────────────────────────────
-- 7. ENABLE ROW LEVEL SECURITY + tenant_isolation 정책 (15개 테이블)
--    spec §3.3 — DO $$ FOREACH 루프 패턴.
--    USING + WITH CHECK 동시 정의 = SELECT/UPDATE/DELETE/INSERT 전 차원 차단.
--    FORCE ROW LEVEL SECURITY = table owner 도 정책 적용 (BYPASSRLS role 만 우회).
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
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
        EXECUTE format($pol$
            CREATE POLICY tenant_isolation ON %I
                USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
                WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
        $pol$, tbl);
    END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- 8. Roles — app_migration (BYPASSRLS) + app_runtime
--    ⚠️ 운영자 작업 필요:
--      1. 아래 'CHANGE_ME_*' placeholder 를 실제 시크릿으로 교체 (별도 시크릿 관리).
--      2. CONNECTION STRING 교체 (DATABASE_URL=postgresql://app_runtime:...).
--      3. Vault 또는 환경변수에 저장.
--    DO $$ ... 블록은 이미 존재하는 role 에 대해 idempotent.
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
    -- app_migration: BYPASSRLS — prisma migrate deploy / 백업 / cleanup cron 전용.
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_migration') THEN
        CREATE ROLE app_migration BYPASSRLS LOGIN PASSWORD 'CHANGE_ME_APP_MIGRATION_PASSWORD';
    END IF;
    -- app_runtime: 일반 핸들러 — RLS 적용. BYPASSRLS 명시 REVOKE.
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
        CREATE ROLE app_runtime LOGIN PASSWORD 'CHANGE_ME_APP_RUNTIME_PASSWORD';
    END IF;
    -- app_admin: 운영 콘솔 BYPASS_RLS 모드 — withTenantTx({ bypassRls: true }) 가 SET LOCAL ROLE 로 전환.
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
        CREATE ROLE app_admin BYPASSRLS NOLOGIN;
    END IF;
END $$;

-- 권한 부여 (idempotent — REVOKE/GRANT 모두 안전).
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_migration;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_migration;

REVOKE BYPASSRLS FROM app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_runtime;

-- app_runtime 이 SET LOCAL ROLE app_admin 로 전환 가능하도록 grant.
GRANT app_admin TO app_runtime;

-- 향후 신설 테이블에 대한 default privileges (운영자가 새 테이블 추가 시 자동 적용).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE ON SEQUENCES TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL PRIVILEGES ON TABLES TO app_migration;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL PRIVILEGES ON SEQUENCES TO app_migration;

-- ────────────────────────────────────────────────────────────
-- 검증 쿼리 (운영자 수동 실행)
-- ────────────────────────────────────────────────────────────
-- 1) RLS 활성화 확인 (모두 't' 이어야 함)
-- SELECT relname, relrowsecurity, relforcerowsecurity
--   FROM pg_class
--   WHERE relname IN ('users','sessions','folders','files','api_keys',
--                     'sql_queries','edge_functions','edge_function_runs',
--                     'cron_jobs','webhooks','mfa_enrollments','mfa_recovery_codes',
--                     'webauthn_authenticators','rate_limit_buckets','log_drains');
--
-- 2) 정책 존재 확인 (15 row)
-- SELECT schemaname, tablename, policyname, qual, with_check
--   FROM pg_policies WHERE policyname = 'tenant_isolation';
--
-- 3) NOT NULL 확인
-- SELECT table_name, column_name, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema='public' AND column_name='tenant_id'
--   ORDER BY table_name;
-- → 15 개 테이블의 tenant_id 모두 NO. JwksKey/SecretItem/WebAuthnChallenge 만 YES.
--
-- 4) 기본값 확인
-- SELECT table_name, column_default
--   FROM information_schema.columns
--   WHERE table_schema='public' AND column_name='tenant_id'
--     AND column_default LIKE '%current_setting%';
-- → 15 row.
--
-- 5) Cross-tenant 침투 테스트 (수동)
-- SET LOCAL app.tenant_id = '11111111-1111-1111-1111-111111111111';
-- SELECT count(*) FROM users WHERE tenant_id = '22222222-2222-2222-2222-222222222222';
-- → 0 (정책에 의해 row 가시 차단).
--
-- ────────────────────────────────────────────────────────────
-- Rollback: migration_rollback.sql 참조 (sibling 파일).
-- ────────────────────────────────────────────────────────────
