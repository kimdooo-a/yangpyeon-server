-- Phase 14c 1순위 — @updatedAt 필드에 DB DEFAULT 부여 + 4테이블에 updated_at 신규 추가
-- 세션 23 (2026-04-17). 관련 spec/plan:
--   docs/superpowers/specs/2026-04-17-phase-14c-updated-at-default-design.md
--   docs/superpowers/plans/2026-04-17-phase-14c-updated-at-default-plan.md
-- manual-edit included: 하단 B2 백필 UPDATE 4줄 (created_at 값으로 정렬)
-- 이유: Windows 로컬에서 WSL PostgreSQL에 도달 불가(NAT). `prisma migrate dev
--       --create-only`가 발행할 DDL을 수작업으로 작성. prisma migrate deploy는
--       디렉토리 기반 적용이라 무해.

-- ── 5개 기존 모델 — updated_at에 DB DEFAULT 추가 (ORM @updatedAt 동작 유지)
ALTER TABLE "users"          ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "folders"        ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "sql_queries"    ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "edge_functions" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "cron_jobs"      ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- ── 4개 모델 — updated_at 컬럼 신규 추가 (NOT NULL + DEFAULT, fast default)
ALTER TABLE "files"      ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "webhooks"   ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "api_keys"   ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "log_drains" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ────────────────────────────────────────────────────────────
-- manual-edit: B2 백필 — 기존 행의 updated_at을 created_at으로 정렬
-- Reason: ADD COLUMN ... DEFAULT CURRENT_TIMESTAMP는 기존 행 전부에 마이그레이션
--         실행 시각을 보이게 만듦(B1 효과). 이력 의미를 유지하기 위해 created_at
--         값으로 덮어씀. 이후 신규 INSERT는 DB DEFAULT(NOW)로 계속 동작.
-- ────────────────────────────────────────────────────────────
UPDATE "files"      SET "updated_at" = "created_at";
UPDATE "webhooks"   SET "updated_at" = "created_at";
UPDATE "api_keys"   SET "updated_at" = "created_at";
UPDATE "log_drains" SET "updated_at" = "created_at";
