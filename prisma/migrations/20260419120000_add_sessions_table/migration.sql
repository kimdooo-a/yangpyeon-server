-- Phase 15 Auth Advanced Step 1 — DB-backed 세션 테이블 신규 추가
-- 세션 32 (2026-04-19). 관련 참조:
--   docs/research/2026-04-supabase-parity/02-architecture/03-auth-advanced-blueprint.md §7.2.2
--   docs/research/spikes/spike-015-session-index-result.md (Go 판정, p95 48μs)
--   docs/solutions/2026-04-19-pg-partial-index-now-incompatibility.md
-- manual-edit (CK 2026-04-17-prisma-migration-windows-wsl-gap.md 절차):
--   Windows→WSL Postgres NAT 단절로 `prisma migrate dev --create-only` 사용 불가.
--   `prisma migrate deploy`는 디렉토리 기반이라 무해.

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (unique on token_hash)
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex (active session lookup: user_id + revoked_at + expires_at)
-- SP-015: partial index WHERE expires_at > NOW() 불가 (NOW() STABLE) → 일반 복합 인덱스
CREATE INDEX "sessions_user_id_revoked_at_expires_at_idx"
    ON "sessions"("user_id", "revoked_at", "expires_at");

-- AddForeignKey
ALTER TABLE "sessions"
    ADD CONSTRAINT "sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
