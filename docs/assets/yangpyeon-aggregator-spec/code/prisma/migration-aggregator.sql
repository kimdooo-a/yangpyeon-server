-- =============================================================================
-- Almanac × yangpyeon-server — 콘텐츠 어그리게이터 raw SQL 마이그레이션
-- -----------------------------------------------------------------------------
-- ⚠️ 권장 경로: `npx prisma migrate dev --name aggregator_init`
--    Prisma가 schema-additions.prisma 를 인식하면 동등한 마이그레이션을 자동 생성함.
--
-- 이 SQL 파일은 **비상용 fallback** 입니다:
--   - shadow DB 사용 불가, prisma migrate 차단된 운영 DB 등에서 직접 실행할 때.
--   - 그 외에는 Prisma 마이그레이션 사용을 강력히 권장 (이력 추적/롤백 용이).
--
-- 실행 순서:
--   1) ENUM TYPE 생성
--   2) TABLE 생성 (외래키 의존성 순서: categories → sources → ingested → items → metrics)
--   3) INDEX / UNIQUE 추가
--   4) (선택) 기존 cron_kind enum 에 AGGREGATOR 값 추가
--
-- PostgreSQL 13+ 가정.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. ENUM TYPES
-- -----------------------------------------------------------------------------

CREATE TYPE "ContentSourceKind" AS ENUM ('RSS', 'HTML', 'API', 'FIRECRAWL');

CREATE TYPE "ContentIngestStatus" AS ENUM (
  'pending',
  'classifying',
  'ready',
  'promoted',
  'rejected',
  'duplicate'
);

CREATE TYPE "ContentQualityFlag" AS ENUM (
  'auto_ok',
  'manual_review',
  'blocked'
);

-- 기존 enum CronKind 에 AGGREGATOR 추가 (있을 경우만)
-- ⚠️ ALTER TYPE ADD VALUE 는 IF NOT EXISTS 를 PG 12+ 에서 지원
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CronKind') THEN
    ALTER TYPE "CronKind" ADD VALUE IF NOT EXISTS 'AGGREGATOR';
  END IF;
END$$;


-- -----------------------------------------------------------------------------
-- 2. TABLES
-- -----------------------------------------------------------------------------

-- 2.1 content_categories
CREATE TABLE "content_categories" (
  "id"          TEXT PRIMARY KEY,                                      -- cuid (앱 레이어 생성)
  "track"       TEXT NOT NULL,
  "slug"        TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "name_en"     TEXT,
  "description" TEXT,
  "icon"        TEXT,
  "sort_order"  INTEGER NOT NULL DEFAULT 0,
  "created_at"  TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updated_at"  TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "content_categories_slug_key"
  ON "content_categories" ("slug");

CREATE UNIQUE INDEX "content_categories_track_slug_key"
  ON "content_categories" ("track", "slug");

CREATE INDEX "content_categories_track_sort_order_idx"
  ON "content_categories" ("track", "sort_order");


-- 2.2 content_sources
CREATE TABLE "content_sources" (
  "id"                    SERIAL PRIMARY KEY,
  "slug"                  TEXT NOT NULL,
  "name"                  TEXT NOT NULL,
  "url"                   TEXT NOT NULL,
  "kind"                  "ContentSourceKind" NOT NULL,
  "default_track"         TEXT,
  "default_category_id"   TEXT,
  "country"               TEXT,
  "parser_config"         JSONB NOT NULL DEFAULT '{}'::jsonb,
  "active"                BOOLEAN NOT NULL DEFAULT TRUE,
  "consecutive_failures"  INTEGER NOT NULL DEFAULT 0,
  "last_fetched_at"       TIMESTAMPTZ(3),
  "last_success_at"       TIMESTAMPTZ(3),
  "last_error"            TEXT,
  "notes"                 TEXT,
  "created_at"            TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updated_at"            TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),

  CONSTRAINT "content_sources_default_category_fk"
    FOREIGN KEY ("default_category_id")
    REFERENCES "content_categories"("id")
    ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE UNIQUE INDEX "content_sources_slug_key"
  ON "content_sources" ("slug");

CREATE INDEX "content_sources_active_last_fetched_at_idx"
  ON "content_sources" ("active", "last_fetched_at");


-- 2.3 content_ingested_items
CREATE TABLE "content_ingested_items" (
  "id"                     TEXT PRIMARY KEY,                  -- cuid
  "source_id"              INTEGER NOT NULL,
  "url_hash"               TEXT NOT NULL,                     -- sha256(canonical_url)
  "url"                    TEXT NOT NULL,
  "title"                  TEXT NOT NULL,
  "summary"                TEXT,
  "content_html"           TEXT,                              -- 250자 발췌 권장
  "author"                 TEXT,
  "image_url"              TEXT,
  "published_at"           TIMESTAMPTZ(3),
  "fetched_at"             TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "raw_json"               JSONB NOT NULL DEFAULT '{}'::jsonb,
  "status"                 "ContentIngestStatus" NOT NULL DEFAULT 'pending',
  "suggested_track"          TEXT,
  "suggested_category_slug"  TEXT,
  "ai_summary"               TEXT,
  "ai_tags"                  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "ai_language"              TEXT,
  "error_msg"                TEXT,
  "processed_at"             TIMESTAMPTZ(3),
  "quality_flag"             "ContentQualityFlag" NOT NULL DEFAULT 'auto_ok',
  "reviewed_by_id"           TEXT,
  "reviewed_at"              TIMESTAMPTZ(3),
  "review_note"              TEXT,

  CONSTRAINT "content_ingested_items_source_fk"
    FOREIGN KEY ("source_id")
    REFERENCES "content_sources"("id")
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE UNIQUE INDEX "content_ingested_items_url_hash_key"
  ON "content_ingested_items" ("url_hash");

CREATE INDEX "content_ingested_items_status_fetched_at_idx"
  ON "content_ingested_items" ("status", "fetched_at");

CREATE INDEX "content_ingested_items_source_id_fetched_at_idx"
  ON "content_ingested_items" ("source_id", "fetched_at");


-- 2.4 content_items
CREATE TABLE "content_items" (
  "id"                 TEXT PRIMARY KEY,                       -- cuid
  "ingested_item_id"   TEXT,
  "source_id"          INTEGER NOT NULL,
  "track"              TEXT NOT NULL,
  "category_id"        TEXT,
  "slug"               TEXT NOT NULL,
  "title"              TEXT NOT NULL,
  "excerpt"            TEXT NOT NULL,
  "ai_summary"         TEXT,
  "keywords"           TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "tags"               TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "language"           TEXT,
  "url"                TEXT NOT NULL,
  "image_url"          TEXT,
  "author"             TEXT,
  "published_at"       TIMESTAMPTZ(3) NOT NULL,
  "first_seen_at"      TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "score"              DOUBLE PRECISION NOT NULL DEFAULT 0,
  "pinned"             BOOLEAN NOT NULL DEFAULT FALSE,
  "featured"           BOOLEAN NOT NULL DEFAULT FALSE,
  "quality_flag"       "ContentQualityFlag" NOT NULL DEFAULT 'auto_ok',
  "view_count"         INTEGER NOT NULL DEFAULT 0,
  "click_count"        INTEGER NOT NULL DEFAULT 0,
  "created_at"         TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updated_at"         TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),

  CONSTRAINT "content_items_ingested_fk"
    FOREIGN KEY ("ingested_item_id")
    REFERENCES "content_ingested_items"("id")
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "content_items_source_fk"
    FOREIGN KEY ("source_id")
    REFERENCES "content_sources"("id")
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "content_items_category_fk"
    FOREIGN KEY ("category_id")
    REFERENCES "content_categories"("id")
    ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE UNIQUE INDEX "content_items_slug_key"
  ON "content_items" ("slug");

CREATE UNIQUE INDEX "content_items_ingested_item_id_key"
  ON "content_items" ("ingested_item_id");

CREATE INDEX "content_items_track_published_at_idx"
  ON "content_items" ("track", "published_at" DESC);

CREATE INDEX "content_items_category_published_at_idx"
  ON "content_items" ("category_id", "published_at" DESC);

CREATE INDEX "content_items_quality_flag_idx"
  ON "content_items" ("quality_flag");

CREATE INDEX "content_items_featured_published_at_idx"
  ON "content_items" ("featured", "published_at" DESC);


-- 2.5 content_item_metrics
CREATE TABLE "content_item_metrics" (
  "item_id"  TEXT NOT NULL,
  "date"     DATE NOT NULL,
  "views"    INTEGER NOT NULL DEFAULT 0,
  "clicks"   INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "content_item_metrics_pkey" PRIMARY KEY ("item_id", "date"),
  CONSTRAINT "content_item_metrics_item_fk"
    FOREIGN KEY ("item_id")
    REFERENCES "content_items"("id")
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX "content_item_metrics_date_idx"
  ON "content_item_metrics" ("date");


COMMIT;

-- =============================================================================
-- 롤백 스크립트 (필요 시 별도 실행)
-- -----------------------------------------------------------------------------
-- BEGIN;
--   DROP TABLE IF EXISTS "content_item_metrics";
--   DROP TABLE IF EXISTS "content_items";
--   DROP TABLE IF EXISTS "content_ingested_items";
--   DROP TABLE IF EXISTS "content_sources";
--   DROP TABLE IF EXISTS "content_categories";
--   DROP TYPE  IF EXISTS "ContentQualityFlag";
--   DROP TYPE  IF EXISTS "ContentIngestStatus";
--   DROP TYPE  IF EXISTS "ContentSourceKind";
-- COMMIT;
-- =============================================================================
