-- ============================================================
-- Migration: messenger_phase1_indexes_partial
-- ADR: ADR-030 (검색 GIN trgm) + data-model §5.2
-- 작성: Claude Code 세션 64 (2026-04-26)
-- Stage: additive (인덱스만). messages 테이블에 partial idx + GIN trgm 추가.
-- 의존: 20260501020000 (messages 테이블).
-- 근거:
--   1. messages_active_idx: 채팅창 stream 조회 시 deleted_at IS NULL 필터 가속.
--      Phase 1 메시지 회수가 빈번하지 않더라도, 회수 데이터가 인덱스에 포함되지 않아
--      cardinality 단조 증가 회피.
--   2. messages_search_gin: Phase 1 LIKE '%키워드%' 검색을 GIN trgm 으로 가속.
--      Phase 2 tsvector 전환 시 본 인덱스는 drop (data-model §10 §7).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. pg_trgm extension (GIN trgm 인덱스 prerequisite)
-- ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ────────────────────────────────────────────────────────────
-- 2. partial index: 활성 메시지만 (deleted_at IS NULL).
--    Prisma DSL 미지원이므로 raw SQL.
-- ────────────────────────────────────────────────────────────
CREATE INDEX "messages_active_idx"
    ON "messages"("tenant_id", "conversation_id", "created_at" DESC)
    WHERE "deleted_at" IS NULL;

-- ────────────────────────────────────────────────────────────
-- 3. GIN trigram index: body LIKE 검색 가속.
--    body NULL (회수) 은 자동 제외. deleted_at IS NULL 조건도 추가하여 활성만.
-- ────────────────────────────────────────────────────────────
CREATE INDEX "messages_search_gin"
    ON "messages" USING gin ("body" gin_trgm_ops)
    WHERE "deleted_at" IS NULL;
