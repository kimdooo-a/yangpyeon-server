# Supabase 데이터 모델링 모범 사례

> Wave 3 — 실전 운영 패턴 | 작성일: 2026-04-06

---

## 목차

1. [Supabase 특화 모델링 이해](#1-supabase-특화-모델링-이해)
2. [테이블 설계 패턴](#2-테이블-설계-패턴)
3. [인덱스 전략](#3-인덱스-전략)
4. [함수/트리거 패턴](#4-함수트리거-패턴)
5. [마이그레이션 모범 사례](#5-마이그레이션-모범-사례)
6. [확장성 패턴](#6-확장성-패턴)

---

## 1. Supabase 특화 모델링 이해

### 1.1 스키마 구조 개요

Supabase는 PostgreSQL의 스키마 시스템을 적극 활용한다. 기본 설치 시 다음 스키마들이 존재한다:

| 스키마 | 용도 | API 노출 |
|--------|------|----------|
| `public` | 애플리케이션 데이터 | 기본 노출 (RLS 필요) |
| `auth` | 인증 관련 테이블 (Supabase 관리) | 비노출 |
| `storage` | 파일 메타데이터 (Supabase 관리) | 비노출 |
| `realtime` | 실시간 구독 관련 (Supabase 관리) | 비노출 |
| `extensions` | 확장 기능 | 비노출 |

#### auth 스키마 핵심 테이블

```sql
-- 직접 수정 불가, 읽기만 가능
auth.users           -- 사용자 계정 (id, email, created_at 등)
auth.sessions        -- 활성 세션
auth.refresh_tokens  -- 리프레시 토큰
auth.identities      -- OAuth 연동 정보
```

#### 커스텀 private 스키마 활용

```sql
-- 민감 데이터를 API에 노출하지 않는 스키마
CREATE SCHEMA private;

-- private 스키마는 API를 통해 직접 접근 불가
-- 함수나 뷰를 통해서만 접근
CREATE TABLE private.audit_logs (
  id         BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  action     TEXT NOT NULL,
  old_data   JSONB,
  new_data   JSONB,
  user_id    UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

### 1.2 설계 철학: 정규화 우선, 선택적 비정규화

Supabase/PostgreSQL은 조인 성능이 우수하므로 **정규화를 기본**으로 한다. 성능 문제가 확인된 경우에만 비정규화를 적용한다:

```
정규화 → 운영 시작 → 성능 모니터링 → 병목 확인 → 선택적 비정규화
```

---

## 2. 테이블 설계 패턴

### 2.1 프로필 테이블 (auth.users 확장)

`auth.users`는 Supabase가 관리하므로 직접 수정하지 않는다. 대신 `profiles` 테이블을 별도로 생성해 1:1로 연결한다:

```sql
-- 프로필 테이블 생성
CREATE TABLE public.profiles (
  -- auth.users.id를 PK로 사용 (UUID 재생성 없음)
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username     TEXT UNIQUE NOT NULL,
  display_name TEXT,
  bio          TEXT,
  avatar_url   TEXT,
  website      TEXT,
  -- 역할/권한 관련
  role         TEXT DEFAULT 'user' CHECK (role IN ('admin', 'moderator', 'user')),
  -- 알림 설정 (JSONB 활용)
  preferences  JSONB DEFAULT '{"email_notifications": true, "push_notifications": false}'::jsonb,
  -- 타임스탬프
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- RLS 활성화
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 인덱스
CREATE UNIQUE INDEX idx_profiles_username ON public.profiles(lower(username));  -- 대소문자 무시

-- 정책: 모든 사람이 프로필 조회, 본인만 수정
CREATE POLICY "프로필 공개 조회" ON public.profiles
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "프로필 본인 수정" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- 신규 사용자 가입 시 자동 프로필 생성 트리거
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    -- 이메일에서 username 생성 (충돌 방지를 위해 uuid 일부 추가)
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      split_part(NEW.email, '@', 1) || '_' || substr(NEW.id::text, 1, 8)
    ),
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NULL)
  );
  RETURN NEW;
END;
$$;

-- auth.users에 신규 사용자 추가 시 트리거 실행
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

### 2.2 다대다 관계 (조인 테이블 패턴)

```sql
-- 기본 다대다: 사용자-태그
CREATE TABLE public.tags (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT UNIQUE NOT NULL,
  slug       TEXT UNIQUE NOT NULL,  -- URL 친화적 버전
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.posts (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 조인 테이블 (추가 속성 포함)
CREATE TABLE public.post_tags (
  post_id    UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  tag_id     UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  added_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  added_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (post_id, tag_id)
);

-- 인덱스 (양방향 조회 최적화)
CREATE INDEX idx_post_tags_post_id ON public.post_tags(post_id);
CREATE INDEX idx_post_tags_tag_id ON public.post_tags(tag_id);

-- 역방향 조회도 빠르게
CREATE INDEX idx_tags_slug ON public.tags(slug);
```

#### 복잡한 다대다: 사용자-조직-역할

```sql
-- 조인 테이블에 역할과 메타데이터 포함
CREATE TABLE public.organization_members (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'member',
  invited_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at       TIMESTAMPTZ DEFAULT now(),
  expires_at      TIMESTAMPTZ,  -- 임시 멤버십 지원
  PRIMARY KEY (organization_id, user_id),
  CONSTRAINT valid_role CHECK (role IN ('owner', 'admin', 'editor', 'viewer', 'member'))
);

-- 복합 인덱스
CREATE INDEX idx_org_members_user_id ON public.organization_members(user_id);
CREATE INDEX idx_org_members_org_role ON public.organization_members(organization_id, role);
```

---

### 2.3 소프트 삭제 패턴

데이터를 완전히 삭제하지 않고 `deleted_at` 타임스탬프로 삭제 표시:

```sql
-- 소프트 삭제 컬럼 추가
ALTER TABLE public.posts ADD COLUMN deleted_at TIMESTAMPTZ;

-- 소프트 삭제를 위한 뷰 생성 (삭제되지 않은 행만)
CREATE VIEW public.active_posts AS
  SELECT * FROM public.posts WHERE deleted_at IS NULL;

-- PostgreSQL 15+: security_invoker로 RLS 유지
ALTER VIEW public.active_posts SET (security_invoker = true);

-- 소프트 삭제 함수 (RLS를 우회하지 않고 안전하게)
CREATE OR REPLACE FUNCTION public.soft_delete_post(p_post_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY INVOKER  -- 호출자 권한으로 실행 (RLS 적용)
AS $$
  UPDATE public.posts
  SET deleted_at = now()
  WHERE id = p_post_id AND deleted_at IS NULL;
$$;

-- 부분 인덱스: 활성 레코드만 인덱싱 (성능 최적화)
CREATE INDEX idx_posts_active ON public.posts(created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_posts_deleted_at ON public.posts(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- 오래된 소프트 삭제 레코드 정리 (cron job)
-- supabase/functions/cleanup-deleted/index.ts 에서 호출
CREATE OR REPLACE FUNCTION public.cleanup_old_deleted_records()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- 30일 이상 된 소프트 삭제 레코드 영구 삭제
  DELETE FROM public.posts
  WHERE deleted_at < now() - INTERVAL '30 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
```

#### 소프트 삭제 + RLS 주의사항

```sql
-- RLS와 소프트 삭제 함께 사용 시 주의
-- UPDATE 정책이 SELECT 정책도 내부적으로 사용함

-- 올바른 설정: SELECT + UPDATE 정책 모두 필요
CREATE POLICY "활성 게시물 조회" ON public.posts
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = author_id AND deleted_at IS NULL);

-- UPDATE 정책: 삭제 표시만 허용 (WITH CHECK로 제한)
CREATE POLICY "게시물 소프트 삭제" ON public.posts
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = author_id AND deleted_at IS NULL)
  WITH CHECK (
    (select auth.uid()) = author_id
    AND deleted_at IS NOT NULL  -- deleted_at 설정만 허용
  );
```

---

### 2.4 감사 로그 (Audit Trail)

#### 방법 1: 트리거 기반 감사 로그

```sql
-- 감사 로그 테이블 (private 스키마)
CREATE TABLE private.audit_log (
  id          BIGSERIAL PRIMARY KEY,
  table_schema TEXT NOT NULL,
  table_name  TEXT NOT NULL,
  record_id   UUID,
  action      TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data    JSONB,
  new_data    JSONB,
  changed_by  UUID,  -- auth.uid() (트리거 실행 시점의 사용자)
  changed_at  TIMESTAMPTZ DEFAULT now()
);

-- 타임스탬프 기반 BRIN 인덱스 (감사 테이블에 최적)
CREATE INDEX idx_audit_log_changed_at ON private.audit_log USING BRIN (changed_at);
CREATE INDEX idx_audit_log_table_name ON private.audit_log(table_name);
CREATE INDEX idx_audit_log_record_id ON private.audit_log(record_id);

-- 범용 감사 트리거 함수
CREATE OR REPLACE FUNCTION private.audit_trigger_function()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_data JSONB;
  v_new_data JSONB;
  v_record_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old_data := to_jsonb(OLD);
    v_new_data := NULL;
    -- id 컬럼 추출 (UUID 기준)
    v_record_id := (to_jsonb(OLD)->>'id')::UUID;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
    v_record_id := (to_jsonb(NEW)->>'id')::UUID;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_data := NULL;
    v_new_data := to_jsonb(NEW);
    v_record_id := (to_jsonb(NEW)->>'id')::UUID;
  END IF;

  INSERT INTO private.audit_log (
    table_schema,
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    changed_by
  ) VALUES (
    TG_TABLE_SCHEMA,
    TG_TABLE_NAME,
    v_record_id,
    TG_OP,
    v_old_data,
    v_new_data,
    auth.uid()  -- Supabase JWT에서 사용자 ID 추출
  );

  -- INSERT/UPDATE는 NEW 반환, DELETE는 OLD 반환
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- 특정 테이블에 감사 트리거 적용
CREATE TRIGGER audit_posts
  AFTER INSERT OR UPDATE OR DELETE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION private.audit_trigger_function();

CREATE TRIGGER audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.audit_trigger_function();

-- 감사 로그 조회 함수 (관리자용)
CREATE OR REPLACE FUNCTION public.get_record_history(
  p_table_name TEXT,
  p_record_id  UUID
)
RETURNS TABLE (
  action     TEXT,
  old_data   JSONB,
  new_data   JSONB,
  changed_by UUID,
  changed_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- 관리자만 조회 가능
  SELECT action, old_data, new_data, changed_by, changed_at
  FROM private.audit_log
  WHERE table_name = p_table_name
    AND record_id = p_record_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  ORDER BY changed_at DESC;
$$;
```

#### 방법 2: supa_audit 확장 사용 (Supabase 공식)

```sql
-- supa_audit 확장 활성화 (Supabase Dashboard에서 또는 SQL로)
CREATE EXTENSION IF NOT EXISTS "supa_audit" SCHEMA extensions;

-- 특정 테이블 추적 활성화
SELECT audit.enable_tracking('public.posts'::regclass);
SELECT audit.enable_tracking('public.profiles'::regclass);

-- 변경 이력 조회 (record_id로 안정적인 추적)
SELECT *
FROM audit.record_version
WHERE table_name = 'posts'
  AND record_id = '...'
ORDER BY ts DESC;

-- 특정 시점 이후 변경사항
SELECT *
FROM audit.record_version
WHERE table_name = 'posts'
  AND ts > now() - INTERVAL '24 hours'
ORDER BY ts DESC;

-- 추적 비활성화
SELECT audit.disable_tracking('public.posts'::regclass);
```

---

### 2.5 JSON 컬럼 vs 정규화

언제 JSONB를 사용하고 언제 정규화할지 결정 기준:

```sql
-- JSONB 적합한 경우: 동적 속성, 스키마가 자주 변경되는 경우
CREATE TABLE public.user_preferences (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  settings    JSONB DEFAULT '{}'::jsonb,
  -- 예: {"theme": "dark", "language": "ko", "notifications": {...}}
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- JSONB 인덱스
CREATE INDEX idx_user_preferences_theme ON public.user_preferences
  USING GIN ((settings -> 'theme'));  -- 특정 키 인덱스

CREATE INDEX idx_user_preferences_gin ON public.user_preferences
  USING GIN (settings);  -- 전체 JSONB 인덱스

-- JSONB 쿼리 예시
SELECT * FROM public.user_preferences
WHERE settings ->> 'theme' = 'dark';

SELECT * FROM public.user_preferences
WHERE settings @> '{"notifications": {"email": true}}'::jsonb;

-- 정규화 적합한 경우: 자주 조인/필터링되는 데이터
-- 나쁜 예: 주소를 JSONB로 (자주 필터링됨)
CREATE TABLE public.orders (
  id       UUID PRIMARY KEY,
  address  JSONB  -- 나쁨: 주소로 검색이 필요하다면
);

-- 좋은 예: 주소를 별도 테이블로
CREATE TABLE public.addresses (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id),
  street      TEXT NOT NULL,
  city        TEXT NOT NULL,
  country     TEXT NOT NULL DEFAULT 'KR',
  postal_code TEXT,
  is_default  BOOLEAN DEFAULT false
);
CREATE INDEX idx_addresses_user_id ON public.addresses(user_id);
CREATE INDEX idx_addresses_city ON public.addresses(city);  -- 도시별 검색
```

---

## 3. 인덱스 전략

### 3.1 B-tree 인덱스 (기본)

대부분의 경우에 사용하는 기본 인덱스:

```sql
-- 단일 컬럼 B-tree
CREATE INDEX idx_posts_author_id ON public.posts(author_id);
CREATE INDEX idx_posts_created_at ON public.posts(created_at DESC);  -- 최신순 정렬

-- 복합 인덱스 (컬럼 순서 중요: 선택도 높은 컬럼 먼저)
CREATE INDEX idx_posts_author_status ON public.posts(author_id, status);
-- 이 인덱스는 다음 쿼리에 효과적:
-- WHERE author_id = $1
-- WHERE author_id = $1 AND status = $2
-- 하지만 WHERE status = $2 만으로는 비효율적

-- 커버링 인덱스 (INCLUDE): 힙 접근 없이 인덱스만으로 쿼리 해결
CREATE INDEX idx_posts_cover ON public.posts(author_id, created_at DESC)
  INCLUDE (title, status);
-- SELECT title, status FROM posts WHERE author_id = $1 ORDER BY created_at DESC
-- 위 쿼리는 테이블 접근 없이 인덱스만으로 처리 가능
```

---

### 3.2 부분 인덱스 (Partial Index)

조건을 만족하는 행만 인덱싱하여 인덱스 크기를 줄이고 성능 향상:

```sql
-- 발행된 게시물만 인덱싱 (전체의 20%라면 80% 인덱스 크기 절감)
CREATE INDEX idx_posts_published ON public.posts(created_at DESC)
  WHERE status = 'published';

-- 활성 사용자만 인덱싱
CREATE INDEX idx_users_active_email ON public.profiles(username)
  WHERE deleted_at IS NULL;

-- 미처리 주문만 인덱싱
CREATE INDEX idx_orders_pending ON public.orders(created_at)
  WHERE status = 'pending';

-- 높은 우선순위 알림만 인덱싱
CREATE INDEX idx_notifications_urgent ON public.notifications(user_id, created_at)
  WHERE priority = 'high' AND read_at IS NULL;
```

---

### 3.3 GIN 인덱스 (배열, JSONB, 전문 검색)

```sql
-- JSONB 컬럼 전체 GIN 인덱스
CREATE INDEX idx_products_metadata ON public.products
  USING GIN (metadata);

-- 쿼리: @> 연산자 (포함 여부)
SELECT * FROM public.products
WHERE metadata @> '{"category": "electronics"}'::jsonb;

-- 배열 컬럼 GIN 인덱스
CREATE TABLE public.posts (
  id    UUID PRIMARY KEY,
  tags  TEXT[]
);
CREATE INDEX idx_posts_tags ON public.posts USING GIN (tags);

-- 쿼리: @> (배열 포함), && (배열 교차)
SELECT * FROM public.posts WHERE tags @> ARRAY['supabase', 'postgresql'];
SELECT * FROM public.posts WHERE tags && ARRAY['react', 'vue'];

-- 전문 검색 GIN 인덱스
ALTER TABLE public.posts ADD COLUMN search_vector TSVECTOR;

CREATE INDEX idx_posts_search ON public.posts USING GIN (search_vector);

-- 검색 벡터 자동 갱신 트리거
CREATE OR REPLACE FUNCTION public.posts_search_vector_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('korean', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('korean', COALESCE(NEW.content, '')), 'B');
  RETURN NEW;
END;
$$;

CREATE TRIGGER posts_search_vector_trigger
  BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.posts_search_vector_update();

-- 검색 쿼리
SELECT id, title, ts_rank(search_vector, query) AS rank
FROM public.posts, to_tsquery('korean', '검색어') query
WHERE search_vector @@ query
ORDER BY rank DESC;
```

---

### 3.4 BRIN 인덱스 (시계열 데이터)

대용량 순차 데이터(로그, 이벤트)에 최적화된 초소형 인덱스:

```sql
-- 이벤트 로그 테이블
CREATE TABLE public.event_logs (
  id         BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_id    UUID,
  data       JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- BRIN 인덱스: B-tree 대비 1/1000 크기, 시간순 스캔에 효율적
CREATE INDEX idx_event_logs_created_at ON public.event_logs
  USING BRIN (created_at);

-- B-tree도 함께 사용 (선택도 높은 컬럼)
CREATE INDEX idx_event_logs_user_id ON public.event_logs(user_id);
CREATE INDEX idx_event_logs_event_type ON public.event_logs(event_type);

-- 쿼리 최적화: 시간 범위 + 필터
SELECT * FROM public.event_logs
WHERE created_at BETWEEN now() - INTERVAL '1 hour' AND now()
  AND event_type = 'login'
ORDER BY created_at DESC;
```

---

### 3.5 인덱스 관리와 모니터링

```sql
-- 미사용 인덱스 찾기
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;

-- 인덱스 사용 통계
SELECT
  t.tablename,
  indexname,
  c.reltuples AS num_rows,
  pg_size_pretty(pg_relation_size(quote_ident(t.tablename)::text)) AS table_size,
  pg_size_pretty(pg_relation_size(quote_ident(indexrelname)::text)) AS index_size,
  ROUND(idx_scan::NUMERIC / NULLIF(seq_scan + idx_scan, 0) * 100, 2) AS percent_of_times_index_used
FROM pg_tables t
LEFT OUTER JOIN pg_class c ON c.relname = t.tablename
LEFT OUTER JOIN (
  SELECT *
  FROM pg_stat_all_indexes
  WHERE schemaname = 'public'
) AS a ON t.tablename = a.tablename
WHERE t.schemaname = 'public'
ORDER BY percent_of_times_index_used ASC NULLS LAST;

-- 중복 인덱스 찾기
SELECT
  a.indrelid::regclass AS table,
  a.indexrelid::regclass AS idx1,
  b.indexrelid::regclass AS idx2
FROM pg_index a
JOIN pg_index b ON a.indrelid = b.indrelid
  AND a.indexrelid < b.indexrelid
  AND a.indkey = b.indkey
WHERE a.schemaname = 'public';
```

---

## 4. 함수/트리거 패턴

### 4.1 updated_at 자동 갱신

```sql
-- 범용 updated_at 트리거 함수 (한 번 만들어 모든 테이블에 재사용)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 각 테이블에 트리거 적용
CREATE TRIGGER set_posts_updated_at
  BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 여러 테이블에 일괄 적용하는 함수 (마이그레이션용)
CREATE OR REPLACE FUNCTION public.apply_updated_at_trigger(p_table_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format(
    'CREATE TRIGGER set_%I_updated_at
     BEFORE UPDATE ON public.%I
     FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
    p_table_name, p_table_name
  );
END;
$$;
```

---

### 4.2 카운터 캐시

댓글 수, 좋아요 수 등을 매번 COUNT 하지 않고 캐싱:

```sql
-- 게시물 테이블에 카운터 컬럼 추가
ALTER TABLE public.posts
  ADD COLUMN comments_count INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN likes_count    INTEGER DEFAULT 0 NOT NULL;

-- 댓글 수 동기화 트리거
CREATE OR REPLACE FUNCTION public.sync_comments_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts
    SET comments_count = comments_count + 1
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts
    SET comments_count = GREATEST(0, comments_count - 1)
    WHERE id = OLD.post_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- 게시물이 변경된 경우 (댓글 이동)
    IF OLD.post_id != NEW.post_id THEN
      UPDATE public.posts
      SET comments_count = GREATEST(0, comments_count - 1)
      WHERE id = OLD.post_id;

      UPDATE public.posts
      SET comments_count = comments_count + 1
      WHERE id = NEW.post_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER sync_comments_count_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.sync_comments_count();

-- 좋아요 테이블 및 카운터
CREATE TABLE public.likes (
  post_id   UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE OR REPLACE FUNCTION public.sync_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER sync_likes_count_trigger
  AFTER INSERT OR DELETE ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.sync_likes_count();

-- 카운터 재계산 함수 (데이터 불일치 복구용)
CREATE OR REPLACE FUNCTION public.recalculate_post_counters(p_post_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.posts p SET
    comments_count = (SELECT COUNT(*) FROM public.comments WHERE post_id = p_post_id),
    likes_count    = (SELECT COUNT(*) FROM public.likes WHERE post_id = p_post_id)
  WHERE id = p_post_id;
$$;
```

---

### 4.3 데이터 검증 트리거

```sql
-- 이메일 형식 검증 (DB 레벨)
CREATE OR REPLACE FUNCTION public.validate_email()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.email IS NOT NULL
    AND NEW.email !~ '^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$'
  THEN
    RAISE EXCEPTION '잘못된 이메일 형식: %', NEW.email
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- 사용자명 형식 검증 (영문/숫자/언더스코어만, 3-30자)
CREATE OR REPLACE FUNCTION public.validate_username()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.username IS NOT NULL THEN
    IF length(NEW.username) < 3 OR length(NEW.username) > 30 THEN
      RAISE EXCEPTION '사용자명은 3-30자 사이여야 합니다'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.username !~ '^[a-zA-Z0-9_]+$' THEN
      RAISE EXCEPTION '사용자명은 영문, 숫자, 언더스코어만 사용 가능합니다'
        USING ERRCODE = 'check_violation';
    END IF;

    -- 예약어 방지
    IF lower(NEW.username) IN ('admin', 'root', 'system', 'api', 'www') THEN
      RAISE EXCEPTION '사용할 수 없는 사용자명입니다: %', NEW.username
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_profile_username
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_username();

-- CHECK 제약 조건 (간단한 검증은 트리거보다 CHECK가 더 효율적)
ALTER TABLE public.products ADD CONSTRAINT price_positive CHECK (price >= 0);
ALTER TABLE public.products ADD CONSTRAINT stock_non_negative CHECK (stock >= 0);
ALTER TABLE public.orders ADD CONSTRAINT valid_status
  CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled'));
```

---

### 4.4 알림 트리거 (pg_notify)

```sql
-- 실시간 알림을 위한 pg_notify 활용
-- Supabase Realtime이 이 채널을 구독

CREATE OR REPLACE FUNCTION public.notify_new_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_notification JSONB;
  v_post_author_id UUID;
BEGIN
  -- 게시물 작성자 조회
  SELECT author_id INTO v_post_author_id
  FROM public.posts
  WHERE id = NEW.post_id;

  -- 자신의 게시물에 댓글을 달면 알림 없음
  IF v_post_author_id = NEW.author_id THEN
    RETURN NEW;
  END IF;

  -- 알림 페이로드 구성
  v_notification := jsonb_build_object(
    'type',       'new_comment',
    'post_id',    NEW.post_id,
    'comment_id', NEW.id,
    'author_id',  NEW.author_id,
    'recipient',  v_post_author_id,
    'timestamp',  extract(epoch from now())
  );

  -- 채널에 알림 발행 (채널명: 'notifications:{user_id}')
  PERFORM pg_notify(
    'notifications:' || v_post_author_id::text,
    v_notification::text
  );

  -- 알림 테이블에도 저장
  INSERT INTO public.notifications (
    user_id,
    type,
    data,
    created_at
  ) VALUES (
    v_post_author_id,
    'new_comment',
    v_notification,
    now()
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER notify_on_new_comment
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_comment();

-- 알림 테이블
CREATE TABLE public.notifications (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  data       JSONB,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "자신의 알림만 접근" ON public.notifications
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;
```

---

## 5. 마이그레이션 모범 사례

### 5.1 무중단 스키마 변경

#### 컬럼 추가 (PostgreSQL 11+에서 빠름)

```sql
-- PostgreSQL 11+: constant default는 테이블 재작성 없음
-- 빠른 방법 (메타데이터만 업데이트)
ALTER TABLE public.users ADD COLUMN status TEXT DEFAULT 'active';

-- 느린 방법 (테이블 전체 재작성)
ALTER TABLE public.users ADD COLUMN last_seen TIMESTAMPTZ DEFAULT now();
-- now()는 상수가 아니라 함수 호출이므로 테이블 재작성 필요

-- 대안: NULL 허용 후 점진적 채우기
ALTER TABLE public.users ADD COLUMN last_seen TIMESTAMPTZ;  -- 빠름

-- 배치로 기존 행 업데이트
DO $$
DECLARE
  batch_size INTEGER := 1000;
  last_id    UUID := '00000000-0000-0000-0000-000000000000';
  updated    INTEGER;
BEGIN
  LOOP
    UPDATE public.users
    SET last_seen = created_at
    WHERE id > last_id
      AND last_seen IS NULL
    RETURNING id INTO last_id;

    GET DIAGNOSTICS updated = ROW_COUNT;
    EXIT WHEN updated = 0;

    -- 트랜잭션 중간에 커밋하여 잠금 해제
    COMMIT;
    PERFORM pg_sleep(0.1);  -- 짧은 대기로 부하 분산
  END LOOP;
END $$;
```

#### 인덱스 생성 (무중단)

```sql
-- 일반 CREATE INDEX: 쓰기 잠금 발생
-- CREATE INDEX idx_users_email ON users(email);  -- 위험

-- CONCURRENTLY: 잠금 없이 생성 (시간은 더 걸림)
CREATE INDEX CONCURRENTLY idx_users_email ON public.users(email);

-- 실패 시 Invalid 인덱스가 남을 수 있음 → 확인 후 삭제
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'users' AND indexname LIKE 'idx_users_%';

-- Invalid 인덱스 정리
DROP INDEX CONCURRENTLY IF EXISTS idx_users_email;
```

#### NOT NULL 컬럼 추가 (4단계 안전 패턴)

```sql
-- 단계 1: CHECK 제약 추가 (빠름, NOT VALID로 기존 데이터 스캔 없음)
ALTER TABLE public.users ADD CONSTRAINT users_email_not_null
  CHECK (email IS NOT NULL) NOT VALID;

-- 단계 2: 기존 데이터 유효성 확인 (롤 잠금 없이 실행)
ALTER TABLE public.users VALIDATE CONSTRAINT users_email_not_null;

-- 단계 3: NOT NULL 설정 (이미 CHECK로 검증됐으므로 빠름)
ALTER TABLE public.users ALTER COLUMN email SET NOT NULL;

-- 단계 4: 중복 CHECK 제약 제거
ALTER TABLE public.users DROP CONSTRAINT users_email_not_null;
```

#### 컬럼 이름 변경 (Expand-Contract 패턴)

```sql
-- 즉시 이름 변경은 애플리케이션 중단 유발
-- 대신 expand-contract 패턴 사용

-- 1단계 Expand: 새 컬럼 추가
ALTER TABLE public.users ADD COLUMN full_name TEXT;

-- 2단계: 양방향 동기화 트리거
CREATE OR REPLACE FUNCTION public.sync_name_columns()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.name IS DISTINCT FROM OLD.name THEN
      NEW.full_name := NEW.name;
    ELSIF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
      NEW.name := NEW.full_name;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_name_columns_trigger
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_name_columns();

-- 3단계: 기존 데이터 마이그레이션
UPDATE public.users SET full_name = name WHERE full_name IS NULL;

-- 4단계: 애플리케이션 코드를 새 컬럼 사용으로 전환

-- 5단계 Contract: 구 컬럼과 트리거 제거
DROP TRIGGER sync_name_columns_trigger ON public.users;
DROP FUNCTION public.sync_name_columns();
ALTER TABLE public.users DROP COLUMN name;
```

---

### 5.2 대규모 데이터 마이그레이션

```sql
-- 대규모 데이터 마이그레이션: 배치 처리로 잠금 최소화

-- 잘못된 방법: 한 트랜잭션에서 수백만 행 업데이트 (테이블 잠금)
UPDATE public.posts SET search_vector = ...;  -- 수백만 행 → 위험

-- 올바른 방법: 커서 기반 배치 처리
DO $$
DECLARE
  batch_size  INTEGER := 5000;
  processed   INTEGER := 0;
  last_cursor TIMESTAMPTZ := '1970-01-01'::TIMESTAMPTZ;
  batch_count INTEGER;
BEGIN
  LOOP
    -- 배치 처리
    WITH batch AS (
      SELECT id, created_at
      FROM public.posts
      WHERE created_at > last_cursor
        AND search_vector IS NULL
      ORDER BY created_at
      LIMIT batch_size
    )
    UPDATE public.posts p
    SET search_vector = to_tsvector('korean', COALESCE(title, '') || ' ' || COALESCE(content, ''))
    FROM batch
    WHERE p.id = batch.id
    RETURNING batch.created_at INTO last_cursor;

    GET DIAGNOSTICS batch_count = ROW_COUNT;
    processed := processed + batch_count;

    EXIT WHEN batch_count = 0;

    -- 진행 상황 로그
    RAISE NOTICE '처리됨: % 행, 마지막 타임스탬프: %', processed, last_cursor;

    -- 부하 분산
    PERFORM pg_sleep(0.5);
  END LOOP;

  RAISE NOTICE '마이그레이션 완료: 총 % 행 처리', processed;
END $$;
```

---

### 5.3 Supabase CLI 마이그레이션 관리

```bash
# 마이그레이션 생성
supabase migration new add_search_vector_to_posts

# 생성된 파일 편집: supabase/migrations/20260406000000_add_search_vector.sql
# 마이그레이션 적용 (로컬)
supabase db push

# 원격 적용
supabase db push --db-url postgresql://...

# 마이그레이션 상태 확인
supabase migration list
```

마이그레이션 파일 예시:

```sql
-- supabase/migrations/20260406000000_add_full_text_search.sql

-- 트랜잭션으로 감싸 원자적 적용
BEGIN;

-- 1. 컬럼 추가
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS search_vector TSVECTOR;

-- 2. 인덱스 생성 (CONCURRENTLY는 트랜잭션 내에서 사용 불가 → 분리)
-- 트랜잭션 밖에서 실행하는 주석 추가
-- NOTE: Run separately after migration:
-- CREATE INDEX CONCURRENTLY idx_posts_search ON public.posts USING GIN (search_vector);

-- 3. 트리거 함수 생성
CREATE OR REPLACE FUNCTION public.posts_search_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.content, '')), 'B');
  RETURN NEW;
END;
$$;

-- 4. 트리거 생성
DROP TRIGGER IF EXISTS posts_search_update ON public.posts;
CREATE TRIGGER posts_search_update
  BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.posts_search_update();

COMMIT;
```

---

## 6. 확장성 패턴

### 6.1 테이블 파티셔닝

대규모 테이블을 논리적으로 분할하여 쿼리 성능 향상:

```sql
-- 이벤트 로그 범위 파티셔닝 (월별)
CREATE TABLE public.event_logs (
  id          BIGSERIAL,
  event_type  TEXT NOT NULL,
  user_id     UUID,
  data        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

-- 월별 파티션 생성
CREATE TABLE public.event_logs_2026_01
  PARTITION OF public.event_logs
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE public.event_logs_2026_02
  PARTITION OF public.event_logs
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE public.event_logs_2026_03
  PARTITION OF public.event_logs
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

-- 기본 파티션 (범위 외 데이터)
CREATE TABLE public.event_logs_default
  PARTITION OF public.event_logs DEFAULT;

-- 각 파티션에 인덱스
CREATE INDEX ON public.event_logs_2026_01(user_id, created_at);
CREATE INDEX ON public.event_logs_2026_02(user_id, created_at);

-- 파티션 자동 생성 함수 (cron으로 매월 실행)
CREATE OR REPLACE FUNCTION public.create_monthly_partition(
  p_year  INTEGER,
  p_month INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  partition_name TEXT;
  start_date     DATE;
  end_date       DATE;
BEGIN
  partition_name := format('event_logs_%s_%s',
    p_year, lpad(p_month::text, 2, '0'));
  start_date := make_date(p_year, p_month, 1);
  end_date   := start_date + INTERVAL '1 month';

  -- 파티션이 없으면 생성
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = partition_name
  ) THEN
    EXECUTE format(
      'CREATE TABLE public.%I PARTITION OF public.event_logs
       FOR VALUES FROM (%L) TO (%L)',
      partition_name, start_date, end_date
    );

    EXECUTE format(
      'CREATE INDEX ON public.%I(user_id, created_at)',
      partition_name
    );

    RAISE NOTICE '파티션 생성: %', partition_name;
  END IF;
END;
$$;

-- 오래된 파티션 아카이빙/삭제
CREATE OR REPLACE FUNCTION public.drop_old_partition(
  p_months_to_keep INTEGER DEFAULT 12
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  partition_name TEXT;
  cutoff_date    DATE;
BEGIN
  cutoff_date := date_trunc('month', now() - (p_months_to_keep || ' months')::INTERVAL)::DATE;

  FOR partition_name IN
    SELECT child.relname
    FROM pg_inherits
    JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
    JOIN pg_class child  ON pg_inherits.inhrelid  = child.oid
    WHERE parent.relname = 'event_logs'
      AND child.relname != 'event_logs_default'
  LOOP
    -- 파티션 이름에서 날짜 추출 및 비교
    IF to_date(substring(partition_name, '\d{4}_\d{2}$'), 'YYYY_MM') < cutoff_date THEN
      EXECUTE 'DROP TABLE public.' || quote_ident(partition_name);
      RAISE NOTICE '파티션 삭제: %', partition_name;
    END IF;
  END LOOP;
END;
$$;
```

---

### 6.2 아카이빙 패턴

활성 데이터와 아카이브 데이터 분리:

```sql
-- 아카이브 테이블
CREATE TABLE public.posts_archive (
  LIKE public.posts INCLUDING ALL,
  archived_at TIMESTAMPTZ DEFAULT now()
);

-- 아카이브 함수
CREATE OR REPLACE FUNCTION public.archive_old_posts(
  p_days_old INTEGER DEFAULT 365
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  archived_count INTEGER;
BEGIN
  -- 오래된 삭제된 게시물 아카이브로 이동
  WITH moved AS (
    DELETE FROM public.posts
    WHERE deleted_at IS NOT NULL
      AND deleted_at < now() - (p_days_old || ' days')::INTERVAL
    RETURNING *
  )
  INSERT INTO public.posts_archive
  SELECT *, now() FROM moved;

  GET DIAGNOSTICS archived_count = ROW_COUNT;

  RAISE NOTICE '아카이브됨: % 게시물', archived_count;
  RETURN archived_count;
END;
$$;
```

---

### 6.3 마테리얼라이즈드 뷰 (집계 성능 최적화)

```sql
-- 일별 사용자 활동 집계 (대시보드용)
CREATE MATERIALIZED VIEW public.daily_user_stats AS
SELECT
  date_trunc('day', created_at) AS day,
  COUNT(DISTINCT user_id)        AS active_users,
  COUNT(*)                       AS total_posts,
  COUNT(*) FILTER (WHERE status = 'published') AS published_posts
FROM public.posts
GROUP BY date_trunc('day', created_at)
ORDER BY day DESC
WITH DATA;

-- 인덱스
CREATE UNIQUE INDEX idx_daily_user_stats_day ON public.daily_user_stats(day);

-- 뷰 새로고침 (Supabase Cron 또는 Edge Function에서 호출)
CREATE OR REPLACE FUNCTION public.refresh_daily_stats()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.daily_user_stats;
$$;

-- 팀별 프로젝트 요약
CREATE MATERIALIZED VIEW public.team_project_summary AS
SELECT
  t.id   AS team_id,
  t.name AS team_name,
  COUNT(DISTINCT p.id)      AS project_count,
  COUNT(DISTINCT tm.user_id) AS member_count,
  MAX(p.created_at)         AS last_project_at
FROM public.teams t
LEFT JOIN public.projects p ON t.id = p.team_id
LEFT JOIN public.team_members tm ON t.id = tm.team_id
GROUP BY t.id, t.name
WITH DATA;

CREATE UNIQUE INDEX idx_team_project_summary_team ON public.team_project_summary(team_id);

-- 동시 새로고침으로 무중단 업데이트
REFRESH MATERIALIZED VIEW CONCURRENTLY public.team_project_summary;
```

---

### 6.4 읽기 복제본 활용 패턴

```sql
-- Supabase에서 읽기 복제본 설정 후 활용

-- 읽기 전용 쿼리를 복제본으로 라우팅 (애플리케이션 레벨)
-- TypeScript 예시:
/*
import { createClient } from '@supabase/supabase-js'

// 쓰기용 (Primary)
const supabasePrimary = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)

// 읽기용 (Replica)
const supabaseReadOnly = createClient(
  process.env.SUPABASE_REPLICA_URL!,
  process.env.SUPABASE_ANON_KEY!
)

// 대시보드 집계 쿼리 → 읽기 복제본
const { data: stats } = await supabaseReadOnly
  .from('daily_user_stats')
  .select('*')
  .order('day', { ascending: false })
  .limit(30)

// 데이터 쓰기 → Primary
const { data: post } = await supabasePrimary
  .from('posts')
  .insert({ title, content })
*/

-- 무거운 분석 쿼리는 별도 스케줄로 처리
CREATE OR REPLACE FUNCTION public.generate_monthly_report(
  p_year  INTEGER,
  p_month INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE  -- 읽기 전용 함수 표시
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start DATE;
  v_end   DATE;
  v_report JSONB;
BEGIN
  v_start := make_date(p_year, p_month, 1);
  v_end   := v_start + INTERVAL '1 month';

  SELECT jsonb_build_object(
    'period',       to_char(v_start, 'YYYY-MM'),
    'new_users',    (SELECT COUNT(*) FROM auth.users WHERE created_at BETWEEN v_start AND v_end),
    'new_posts',    (SELECT COUNT(*) FROM public.posts WHERE created_at BETWEEN v_start AND v_end),
    'active_users', (SELECT COUNT(DISTINCT author_id) FROM public.posts WHERE created_at BETWEEN v_start AND v_end)
  ) INTO v_report;

  RETURN v_report;
END;
$$;
```

---

### 6.5 연결 풀링 최적화

```sql
-- Supabase는 PgBouncer 연결 풀러를 제공
-- Transaction 모드 사용 시 prepared statement 불가 → 주의 필요

-- 연결 상태 확인
SELECT
  count(*) AS total_connections,
  count(*) FILTER (WHERE state = 'active') AS active,
  count(*) FILTER (WHERE state = 'idle') AS idle,
  count(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_transaction
FROM pg_stat_activity
WHERE datname = current_database();

-- 오래 실행 중인 쿼리 확인
SELECT
  pid,
  now() - query_start AS duration,
  state,
  left(query, 100) AS query_snippet
FROM pg_stat_activity
WHERE state != 'idle'
  AND query_start < now() - INTERVAL '5 minutes'
ORDER BY duration DESC;

-- 연결 제한 설정 (특정 역할에)
ALTER ROLE authenticated CONNECTION LIMIT 100;
```

---

## 요약: 설계 의사결정 가이드

### 컬럼 타입 선택

| 데이터 | 권장 타입 | 이유 |
|--------|-----------|------|
| ID | `UUID` (`gen_random_uuid()`) | 분산 환경 충돌 없음 |
| 순번 | `BIGSERIAL` 또는 `GENERATED ALWAYS AS IDENTITY` | 단순 증가 ID |
| 날짜/시간 | `TIMESTAMPTZ` | 타임존 정보 포함 |
| 금액 | `NUMERIC(19, 4)` | 부동소수점 오차 없음 |
| 동적 속성 | `JSONB` | GIN 인덱스 지원 |
| 상태값 | `TEXT` + `CHECK` 또는 `ENUM` | 유연성 vs 강타입 |
| 배열 | `TEXT[]`, `UUID[]` | GIN 인덱스 가능 |

### 인덱스 선택 기준

| 상황 | 인덱스 타입 |
|------|-------------|
| 기본 조회/정렬 | B-tree |
| JSONB/배열/전문 검색 | GIN |
| 시계열 대용량 로그 | BRIN |
| 조건부 소규모 인덱스 | 부분 인덱스 |
| 인덱스만으로 쿼리 해결 | 커버링 인덱스 (INCLUDE) |

---

## 참고 자료

- [Supabase 테이블 설계 공식 문서](https://supabase.com/docs/guides/database/tables)
- [PostgreSQL Auditing (150줄 SQL)](https://supabase.com/blog/postgres-audit)
- [supa_audit GitHub](https://github.com/supabase/supa_audit)
- [pgAudit 확장](https://supabase.com/docs/guides/database/extensions/pgaudit)
- [Supabase Triggers 공식 문서](https://supabase.com/docs/guides/database/postgres/triggers)
- [SupaExplorer PostgreSQL 30 Best Practices](https://supaexplorer.com/best-practices/supabase-postgres/)
- [Bytebase: PostgreSQL 무중단 마이그레이션](https://www.bytebase.com/blog/postgres-schema-migration-without-downtime/)
