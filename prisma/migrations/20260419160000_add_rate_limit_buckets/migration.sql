-- Phase 15 Auth Advanced Step 6 — DB-backed Rate Limit (FR-6.3)
-- 세션 34 (2026-04-19). 관련 참조:
--   docs/research/2026-04-supabase-parity/02-architecture/03-auth-advanced-blueprint.md (FR-6.3)
--   docs/handover/260419-session32-phase15-step1-2.md (CK windows-wsl-gap 패턴)
-- manual-edit: Windows→WSL Postgres NAT 단절로 `prisma migrate dev --create-only` 사용 불가.
--   `prisma migrate deploy` 는 디렉토리 기반이라 무해.

-- CreateTable: fixed-window 카운터.
--   bucketKey 가 PK (UNIQUE 자동 보장).
--   hits = 현재 윈도우 내 누적 요청 수.
--   window_start = 현재 윈도우 시작 시각.
--   updated_at = 마지막 변경 (관측/디버깅용).
CREATE TABLE "rate_limit_buckets" (
    "bucket_key" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "window_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("bucket_key")
);

-- CreateIndex: cleanup job 효율 (windowStart < NOW() - INTERVAL '1 day' DELETE).
CREATE INDEX "rate_limit_buckets_window_start_idx"
    ON "rate_limit_buckets"("window_start");
