-- Session 14 증분 마이그레이션 (Supabase-clone 11 P0 모듈)
-- 적용 전제: 20260406140453_init_users + 20260406140506_add_filebox 적용된 DB
-- 생성 방법 수동(shadow DB 없이 all_tables_from_empty.sql에서 기존 부분 제거)
--
-- 검증: 아래 SQL은 prisma schema.prisma의 신규 모델 7개(+ enum 7개)와 1:1 매칭
-- 사용자 실행 절차:
--   1) WSL2 PG 접속 후 아래 SQL 수동 적용
--   2) 또는 마이그레이션 폴더로 이동:
--      mkdir prisma/migrations/20260412000000_supabase_clone_session_14
--      mv prisma/migrations-draft/session_14_incremental.sql \
--         prisma/migrations/20260412000000_supabase_clone_session_14/migration.sql
--      npx prisma migrate resolve --applied 20260412000000_supabase_clone_session_14
--      (수동 적용 후 resolve로 적용 기록만 남기는 경우)
--   또는
--      npx prisma migrate deploy  (자동 적용)

-- ============================================================
-- 신규 Enum (7개)
-- ============================================================
CREATE TYPE "QueryScope" AS ENUM ('PRIVATE', 'SHARED', 'FAVORITE');
CREATE TYPE "FunctionRuntime" AS ENUM ('NODE_VM', 'WORKER_THREAD');
CREATE TYPE "RunStatus" AS ENUM ('SUCCESS', 'FAILURE', 'TIMEOUT');
CREATE TYPE "WebhookEvent" AS ENUM ('INSERT', 'UPDATE', 'DELETE', 'ANY');
CREATE TYPE "CronKind" AS ENUM ('SQL', 'FUNCTION', 'WEBHOOK');
CREATE TYPE "ApiKeyType" AS ENUM ('PUBLISHABLE', 'SECRET');
CREATE TYPE "DrainType" AS ENUM ('HTTP', 'LOKI', 'WEBHOOK');

-- ============================================================
-- 신규 테이블 (7개)
-- ============================================================

-- SQL Editor 저장된 쿼리
CREATE TABLE "sql_queries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sql" TEXT NOT NULL,
    "scope" "QueryScope" NOT NULL DEFAULT 'PRIVATE',
    "owner_id" TEXT NOT NULL,
    "last_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sql_queries_pkey" PRIMARY KEY ("id")
);

-- Edge Functions 정의
CREATE TABLE "edge_functions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "code" TEXT NOT NULL,
    "runtime" "FunctionRuntime" NOT NULL DEFAULT 'NODE_VM',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "owner_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "edge_functions_pkey" PRIMARY KEY ("id")
);

-- Edge Functions 실행 이력
CREATE TABLE "edge_function_runs" (
    "id" TEXT NOT NULL,
    "function_id" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL,
    "duration_ms" INTEGER,
    "stdout" TEXT,
    "stderr" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    CONSTRAINT "edge_function_runs_pkey" PRIMARY KEY ("id")
);

-- Webhooks
CREATE TABLE "webhooks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source_table" TEXT NOT NULL,
    "event" "WebhookEvent" NOT NULL,
    "url" TEXT NOT NULL,
    "headers" JSONB NOT NULL DEFAULT '{}',
    "secret" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_triggered_at" TIMESTAMP(3),
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- Cron Jobs
CREATE TABLE "cron_jobs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "kind" "CronKind" NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMP(3),
    "last_status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cron_jobs_pkey" PRIMARY KEY ("id")
);

-- API Keys
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "type" "ApiKeyType" NOT NULL,
    "scopes" TEXT[],
    "owner_id" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- Log Drains
CREATE TABLE "log_drains" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DrainType" NOT NULL,
    "url" TEXT NOT NULL,
    "auth_header" TEXT,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_delivered_at" TIMESTAMP(3),
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "log_drains_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- 신규 Index
-- ============================================================
CREATE INDEX "sql_queries_owner_id_scope_idx" ON "sql_queries"("owner_id", "scope");
CREATE UNIQUE INDEX "edge_functions_name_key" ON "edge_functions"("name");
CREATE INDEX "edge_function_runs_function_id_started_at_idx" ON "edge_function_runs"("function_id", "started_at");
CREATE UNIQUE INDEX "cron_jobs_name_key" ON "cron_jobs"("name");
CREATE UNIQUE INDEX "api_keys_prefix_key" ON "api_keys"("prefix");
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- ============================================================
-- 신규 FK (기존 users, edge_functions 참조)
-- ============================================================
ALTER TABLE "sql_queries"
    ADD CONSTRAINT "sql_queries_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "edge_functions"
    ADD CONSTRAINT "edge_functions_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "edge_function_runs"
    ADD CONSTRAINT "edge_function_runs_function_id_fkey"
    FOREIGN KEY ("function_id") REFERENCES "edge_functions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "api_keys"
    ADD CONSTRAINT "api_keys_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
