-- Phase 1.6 (T1.6) — Almanac aggregator 5 테이블 + RLS 정책
-- 작성: 2026-04-27
-- 트리거: ADR-022 §7원칙 (tenant_id 첫 컬럼 강제) + spec/aggregator-fixes T1.6
--
-- 본 마이그레이션이 하는 일:
--   1. ENUM TYPE 3개 생성 (ContentSourceKind, ContentIngestStatus, ContentQualityFlag)
--   2. CronKind enum에 AGGREGATOR 값 추가
--   3. TABLE 5개 생성 (tenant_id NOT NULL, FK → tenants)
--   4. INDEX / UNIQUE 추가
--   5. ENABLE / FORCE ROW LEVEL SECURITY + tenant_isolation 정책 (5개 테이블)
--
-- 본 마이그레이션이 하지 않는 일:
--   - migrate dev 실행 금지 — 직접 SQL 작성 (운영 정책)
--   - almanac tenant 시드 — 다음 마이그레이션(20260427140001)에서 처리
--
-- T1.4 RLS 패턴 참조: 20260427110000_phase1_4_rls_stage3/migration.sql §7
-- ────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────
-- 1. ENUM TYPES
-- ────────────────────────────────────────────────────────────
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

-- ────────────────────────────────────────────────────────────
-- 2. CronKind enum에 AGGREGATOR 추가
--    ALTER TYPE ADD VALUE 는 트랜잭션 내부 실행 불가 → 별도 DO 블록.
--    IF NOT EXISTS (PG 12+) — idempotent.
-- ────────────────────────────────────────────────────────────
ALTER TYPE "CronKind" ADD VALUE IF NOT EXISTS 'AGGREGATOR';

-- ────────────────────────────────────────────────────────────
-- 3. TABLES
--    의존성 순서: content_categories → content_sources → content_ingested_items
--                → content_items → content_item_metrics
--    모든 테이블에 tenant_id NOT NULL + FK → tenants(id) ON DELETE CASCADE
--    NOT NULL 즉시 가능: 이 시점에 데이터 0건 (신규 테이블).
-- ────────────────────────────────────────────────────────────

-- 3.1 content_categories
CREATE TABLE "content_categories" (
  "id"          TEXT PRIMARY KEY,                                          -- cuid (앱 레이어 생성)
  "tenant_id"   UUID NOT NULL DEFAULT (current_setting('app.tenant_id'))::uuid,
  "track"       TEXT NOT NULL,
  "slug"        TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "name_en"     TEXT,
  "description" TEXT,
  "icon"        TEXT,
  "sort_order"  INTEGER NOT NULL DEFAULT 0,
  "created_at"  TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updated_at"  TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),

  CONSTRAINT "content_categories_tenant_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE UNIQUE INDEX "content_categories_tenant_id_slug_key"
  ON "content_categories" ("tenant_id", "slug");

CREATE UNIQUE INDEX "content_categories_tenant_id_track_slug_key"
  ON "content_categories" ("tenant_id", "track", "slug");

CREATE INDEX "content_categories_tenant_id_track_sort_order_idx"
  ON "content_categories" ("tenant_id", "track", "sort_order");


-- 3.2 content_sources
CREATE TABLE "content_sources" (
  "id"                    SERIAL PRIMARY KEY,
  "tenant_id"             UUID NOT NULL DEFAULT (current_setting('app.tenant_id'))::uuid,
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

  CONSTRAINT "content_sources_tenant_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "content_sources_default_category_fk"
    FOREIGN KEY ("default_category_id")
    REFERENCES "content_categories"("id")
    ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE UNIQUE INDEX "content_sources_tenant_id_slug_key"
  ON "content_sources" ("tenant_id", "slug");

CREATE INDEX "content_sources_tenant_id_active_last_fetched_at_idx"
  ON "content_sources" ("tenant_id", "active", "last_fetched_at");


-- 3.3 content_ingested_items
CREATE TABLE "content_ingested_items" (
  "id"                      TEXT PRIMARY KEY,                              -- cuid
  "tenant_id"               UUID NOT NULL DEFAULT (current_setting('app.tenant_id'))::uuid,
  "source_id"               INTEGER NOT NULL,
  "url_hash"                TEXT NOT NULL,                                 -- sha256(canonical_url)
  "url"                     TEXT NOT NULL,
  "title"                   TEXT NOT NULL,
  "summary"                 TEXT,
  "content_html"            TEXT,                                          -- 250자 발췌 권장
  "author"                  TEXT,
  "image_url"               TEXT,
  "published_at"            TIMESTAMPTZ(3),
  "fetched_at"              TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "raw_json"                JSONB NOT NULL DEFAULT '{}'::jsonb,
  "status"                  "ContentIngestStatus" NOT NULL DEFAULT 'pending',
  "suggested_track"         TEXT,
  "suggested_category_slug" TEXT,
  "ai_summary"              TEXT,
  "ai_tags"                 TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "ai_language"             TEXT,
  "error_msg"               TEXT,
  "processed_at"            TIMESTAMPTZ(3),
  "quality_flag"            "ContentQualityFlag" NOT NULL DEFAULT 'auto_ok',
  "reviewed_by_id"          TEXT,
  "reviewed_at"             TIMESTAMPTZ(3),
  "review_note"             TEXT,

  CONSTRAINT "content_ingested_items_tenant_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "content_ingested_items_source_fk"
    FOREIGN KEY ("source_id")
    REFERENCES "content_sources"("id")
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE UNIQUE INDEX "content_ingested_items_tenant_id_url_hash_key"
  ON "content_ingested_items" ("tenant_id", "url_hash");

CREATE INDEX "content_ingested_items_tenant_id_status_fetched_at_idx"
  ON "content_ingested_items" ("tenant_id", "status", "fetched_at");

CREATE INDEX "content_ingested_items_tenant_id_source_id_fetched_at_idx"
  ON "content_ingested_items" ("tenant_id", "source_id", "fetched_at");


-- 3.4 content_items
CREATE TABLE "content_items" (
  "id"                TEXT PRIMARY KEY,                                    -- cuid
  "tenant_id"         UUID NOT NULL DEFAULT (current_setting('app.tenant_id'))::uuid,
  "ingested_item_id"  TEXT,                                                -- @unique (글로벌 1:1)
  "source_id"         INTEGER NOT NULL,
  "track"             TEXT NOT NULL,
  "category_id"       TEXT,
  "slug"              TEXT NOT NULL,
  "title"             TEXT NOT NULL,
  "excerpt"           TEXT NOT NULL,
  "ai_summary"        TEXT,
  "keywords"          TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "tags"              TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "language"          TEXT,
  "url"               TEXT NOT NULL,
  "image_url"         TEXT,
  "author"            TEXT,
  "published_at"      TIMESTAMPTZ(3) NOT NULL,
  "first_seen_at"     TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "score"             DOUBLE PRECISION NOT NULL DEFAULT 0,
  "pinned"            BOOLEAN NOT NULL DEFAULT FALSE,
  "featured"          BOOLEAN NOT NULL DEFAULT FALSE,
  "quality_flag"      "ContentQualityFlag" NOT NULL DEFAULT 'auto_ok',
  "view_count"        INTEGER NOT NULL DEFAULT 0,
  "click_count"       INTEGER NOT NULL DEFAULT 0,
  "created_at"        TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updated_at"        TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),

  CONSTRAINT "content_items_tenant_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON UPDATE CASCADE ON DELETE CASCADE,
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

-- ingested_item_id: 글로벌 @unique (cuid 기반, 1:1 Prisma 관계 요건)
CREATE UNIQUE INDEX "content_items_ingested_item_id_key"
  ON "content_items" ("ingested_item_id");

CREATE UNIQUE INDEX "content_items_tenant_id_slug_key"
  ON "content_items" ("tenant_id", "slug");

CREATE INDEX "content_items_tenant_id_track_published_at_idx"
  ON "content_items" ("tenant_id", "track", "published_at" DESC);

CREATE INDEX "content_items_tenant_id_category_id_published_at_idx"
  ON "content_items" ("tenant_id", "category_id", "published_at" DESC);

CREATE INDEX "content_items_tenant_id_quality_flag_idx"
  ON "content_items" ("tenant_id", "quality_flag");

CREATE INDEX "content_items_tenant_id_featured_published_at_idx"
  ON "content_items" ("tenant_id", "featured", "published_at" DESC);


-- 3.5 content_item_metrics
--     PK: (tenant_id, item_id, date) — T1.6 tenant 격리 포함
CREATE TABLE "content_item_metrics" (
  "tenant_id"  UUID NOT NULL DEFAULT (current_setting('app.tenant_id'))::uuid,
  "item_id"    TEXT NOT NULL,
  "date"       DATE NOT NULL,
  "views"      INTEGER NOT NULL DEFAULT 0,
  "clicks"     INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "content_item_metrics_pkey" PRIMARY KEY ("tenant_id", "item_id", "date"),
  CONSTRAINT "content_item_metrics_tenant_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "content_item_metrics_item_fk"
    FOREIGN KEY ("item_id")
    REFERENCES "content_items"("id")
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX "content_item_metrics_tenant_id_date_idx"
  ON "content_item_metrics" ("tenant_id", "date");


-- ────────────────────────────────────────────────────────────
-- 4. ENABLE ROW LEVEL SECURITY + tenant_isolation 정책 (5개 테이블)
--    T1.4 패턴 (20260427110000) §7 동일 — DO $$ FOREACH 루프.
--    FORCE ROW LEVEL SECURITY = table owner 도 정책 적용 (BYPASSRLS role 만 우회).
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
    tbl TEXT;
    content_tables TEXT[] := ARRAY[
        'content_categories',
        'content_sources',
        'content_ingested_items',
        'content_items',
        'content_item_metrics'
    ];
BEGIN
    FOREACH tbl IN ARRAY content_tables LOOP
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
-- 검증 쿼리 (운영자 수동 실행)
-- ────────────────────────────────────────────────────────────
-- 1) RLS 활성화 확인
-- SELECT relname, relrowsecurity, relforcerowsecurity
--   FROM pg_class
--   WHERE relname IN ('content_categories','content_sources','content_ingested_items',
--                     'content_items','content_item_metrics');
--
-- 2) 정책 존재 확인 (5 row)
-- SELECT schemaname, tablename, policyname
--   FROM pg_policies WHERE policyname = 'tenant_isolation'
--   AND tablename LIKE 'content_%';
--
-- 3) CronKind enum에 AGGREGATOR 추가 확인
-- SELECT unnest(enum_range(NULL::"CronKind"))::text;
-- ────────────────────────────────────────────────────────────
