-- 세션 40 — 모든 DateTime 컬럼을 TIMESTAMP(3) → TIMESTAMPTZ(3) 마이그레이션.
--
-- 배경: 세션 34(rate-limit) + 세션 39(sessions cleanup) 에서 PG TIMESTAMP(3)
-- timezone-naive + Prisma 7 adapter-pg 조합의 9시간 KST 오프셋 버그가 두 번 재현됨.
-- CK 참조: docs/solutions/2026-04-19-pg-timestamp-naive-js-date-tz-offset.md
--
-- 기존 naive 값의 의미: PG 서버 타임존(Asia/Seoul)으로 해석된 wall-clock 시각.
-- 따라서 USING 절에 `AT TIME ZONE 'Asia/Seoul'` 적용 → 동일 wall-clock 보존.
-- 새 timestamptz 값은 UTC offset 명시 → JS Date 변환 시 9h 시프트 사라짐.
--
-- 영향: ALTER COLUMN TYPE 은 PG 가 테이블 rewrite 수행. 본 프로젝트 데이터량
-- (수백~수천 row) 기준 수 초 이내 완료. 락 시간 짧음.

-- users
ALTER TABLE "users"
  ALTER COLUMN "last_login_at" TYPE TIMESTAMPTZ(3) USING "last_login_at" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'Asia/Seoul';

-- webauthn_authenticators
ALTER TABLE "webauthn_authenticators"
  ALTER COLUMN "last_used_at" TYPE TIMESTAMPTZ(3) USING "last_used_at" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'Asia/Seoul';

-- webauthn_challenges
ALTER TABLE "webauthn_challenges"
  ALTER COLUMN "expires_at" TYPE TIMESTAMPTZ(3) USING "expires_at" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'Asia/Seoul';

-- mfa_enrollments
ALTER TABLE "mfa_enrollments"
  ALTER COLUMN "confirmed_at" TYPE TIMESTAMPTZ(3) USING "confirmed_at" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "locked_until" TYPE TIMESTAMPTZ(3) USING "locked_until" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'Asia/Seoul';

-- mfa_recovery_codes
ALTER TABLE "mfa_recovery_codes"
  ALTER COLUMN "used_at" TYPE TIMESTAMPTZ(3) USING "used_at" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'Asia/Seoul';

-- jwks_keys
ALTER TABLE "jwks_keys"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "rotated_at" TYPE TIMESTAMPTZ(3) USING "rotated_at" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "retire_at" TYPE TIMESTAMPTZ(3) USING "retire_at" AT TIME ZONE 'Asia/Seoul';

-- rate_limit_buckets
ALTER TABLE "rate_limit_buckets"
  ALTER COLUMN "window_start" TYPE TIMESTAMPTZ(3) USING "window_start" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'Asia/Seoul';

-- sessions
ALTER TABLE "sessions"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "last_used_at" TYPE TIMESTAMPTZ(3) USING "last_used_at" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "expires_at" TYPE TIMESTAMPTZ(3) USING "expires_at" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "revoked_at" TYPE TIMESTAMPTZ(3) USING "revoked_at" AT TIME ZONE 'Asia/Seoul';

-- folders
ALTER TABLE "folders"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'Asia/Seoul';

-- files
ALTER TABLE "files"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'Asia/Seoul';

-- sql_queries
ALTER TABLE "sql_queries"
  ALTER COLUMN "last_run_at" TYPE TIMESTAMPTZ(3) USING "last_run_at" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'Asia/Seoul';

-- edge_functions
ALTER TABLE "edge_functions"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'Asia/Seoul';

-- edge_function_runs
ALTER TABLE "edge_function_runs"
  ALTER COLUMN "started_at" TYPE TIMESTAMPTZ(3) USING "started_at" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "finished_at" TYPE TIMESTAMPTZ(3) USING "finished_at" AT TIME ZONE 'Asia/Seoul';

-- webhooks
ALTER TABLE "webhooks"
  ALTER COLUMN "last_triggered_at" TYPE TIMESTAMPTZ(3) USING "last_triggered_at" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'Asia/Seoul';

-- cron_jobs
ALTER TABLE "cron_jobs"
  ALTER COLUMN "last_run_at" TYPE TIMESTAMPTZ(3) USING "last_run_at" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'Asia/Seoul';

-- api_keys
ALTER TABLE "api_keys"
  ALTER COLUMN "last_used_at" TYPE TIMESTAMPTZ(3) USING "last_used_at" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "revoked_at" TYPE TIMESTAMPTZ(3) USING "revoked_at" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'Asia/Seoul';

-- log_drains
ALTER TABLE "log_drains"
  ALTER COLUMN "last_delivered_at" TYPE TIMESTAMPTZ(3) USING "last_delivered_at" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'Asia/Seoul',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'Asia/Seoul';
