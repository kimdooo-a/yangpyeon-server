# Supabase RLS 보안 패턴 가이드

> Wave 3 — 실전 운영 패턴 | 작성일: 2026-04-06

---

## 목차

1. [RLS 기초 개념](#1-rls-기초-개념)
2. [인증 기반 패턴](#2-인증-기반-패턴)
3. [고급 패턴](#3-고급-패턴)
4. [성능 최적화](#4-성능-최적화)
5. [RLS 테스트](#5-rls-테스트)
6. [실전 시나리오](#6-실전-시나리오)
7. [안티패턴과 보안 실수](#7-안티패턴과-보안-실수)

---

## 1. RLS 기초 개념

### 1.1 RLS란 무엇인가

Row Level Security(RLS)는 PostgreSQL의 행 단위 접근 제어 기능으로, 테이블의 각 행에 대해 사용자별 접근 가능 여부를 데이터베이스 레벨에서 강제한다. Supabase는 `anon` / `authenticated` 역할을 통해 클라이언트 SDK에서 직접 데이터베이스에 접근하는 구조를 사용하기 때문에 RLS가 사실상 **유일한 방어선**이 된다.

RLS 정책은 쿼리에 암묵적인 `WHERE` 절을 추가하는 방식으로 동작한다:

```sql
-- 애플리케이션 쿼리
SELECT * FROM posts;

-- RLS 정책 적용 후 실제 실행
SELECT * FROM posts WHERE (select auth.uid()) = user_id;
```

> 주의: 2025년 1월 Lovable로 제작된 170개 이상의 앱에서 RLS 미설정으로 데이터베이스가 노출되는 사고가 발생했다. RLS는 기본값이 **비활성화**다. 모든 public 스키마 테이블에 명시적으로 활성화해야 한다.

---

### 1.2 RLS 활성화

```sql
-- 테이블에 RLS 활성화
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- RLS 활성화 여부 확인
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';
```

RLS를 활성화하면 정책(Policy)이 없는 경우 **아무도 접근할 수 없다**. 이는 안전한 기본 상태(deny-by-default)다.

---

### 1.3 CREATE POLICY 문법

```sql
CREATE POLICY "정책 이름"
  ON 스키마.테이블명
  FOR { ALL | SELECT | INSERT | UPDATE | DELETE }
  TO { 역할명 | PUBLIC | CURRENT_USER | SESSION_USER }
  USING ( using_조건 )
  WITH CHECK ( check_조건 );
```

**USING vs WITH CHECK 차이점:**

| 구분 | 적용 대상 | 동작 |
|------|-----------|------|
| `USING` | SELECT, UPDATE, DELETE | 기존 행을 **읽을 때** 필터링 |
| `WITH CHECK` | INSERT, UPDATE | 새로 쓰는 행이 조건을 **만족하는지** 검증 |

```sql
-- SELECT: USING만 사용
CREATE POLICY "자신의 게시물만 조회"
  ON public.posts FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- INSERT: WITH CHECK만 사용
CREATE POLICY "자신의 게시물만 생성"
  ON public.posts FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- UPDATE: 둘 다 사용 (어떤 행을 수정할 수 있는지 + 수정 후 상태 검증)
CREATE POLICY "자신의 게시물만 수정"
  ON public.posts FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- DELETE: USING만 사용
CREATE POLICY "자신의 게시물만 삭제"
  ON public.posts FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);
```

---

### 1.4 내장 인증 헬퍼 함수

Supabase Auth는 RLS 정책에서 사용할 수 있는 헬퍼 함수를 제공한다:

```sql
-- 현재 인증된 사용자의 UUID 반환 (미인증 시 NULL)
auth.uid()

-- JWT 전체 클레임 반환 (JSONB)
auth.jwt()

-- JWT에서 특정 값 추출 예시
auth.jwt() ->> 'role'                      -- 커스텀 클레임
auth.jwt() -> 'app_metadata' ->> 'role'    -- app_metadata (서버에서만 수정 가능)
```

> 보안 주의: `raw_user_meta_data`는 사용자가 직접 수정할 수 있다. RLS 정책에서 역할 확인 시 반드시 `app_metadata` 또는 별도 DB 테이블을 사용해야 한다.

---

## 2. 인증 기반 패턴

### 2.1 사용자 본인 데이터만 접근

가장 기본적인 패턴. 각 행의 `user_id`가 인증된 사용자와 일치하는 행만 접근 허용:

```sql
-- 테이블 생성
CREATE TABLE public.todos (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  completed   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- RLS 활성화
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

-- 정책 생성 (CRUD 각각)
CREATE POLICY "자신의 todo만 조회"
  ON public.todos FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "자신의 todo만 생성"
  ON public.todos FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "자신의 todo만 수정"
  ON public.todos FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "자신의 todo만 삭제"
  ON public.todos FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- 성능을 위한 인덱스 (RLS 정책과 함께 필수)
CREATE INDEX idx_todos_user_id ON public.todos(user_id);
```

---

### 2.2 역할 기반 접근 제어 (RBAC)

사용자에게 역할(admin, moderator, user)을 부여하고 역할별로 접근을 제어한다:

```sql
-- 역할 타입 정의
CREATE TYPE public.user_role AS ENUM ('admin', 'moderator', 'user');

-- 프로필 테이블 (역할 포함)
CREATE TABLE public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username   TEXT UNIQUE NOT NULL,
  role       public.user_role DEFAULT 'user' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 역할 확인 헬퍼 함수 (security definer로 RLS 우회 없이 역할 조회)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.profiles WHERE id = (select auth.uid());
$$;

-- 게시물 테이블 정책
CREATE TABLE public.articles (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id   UUID NOT NULL REFERENCES auth.users(id),
  title       TEXT NOT NULL,
  content     TEXT,
  published   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

-- 모든 사람이 발행된 게시물 조회 가능
CREATE POLICY "발행된 게시물 공개 조회"
  ON public.articles FOR SELECT
  TO authenticated, anon
  USING (published = true);

-- 작성자는 자신의 게시물(미발행 포함) 조회 가능
CREATE POLICY "작성자 자신의 게시물 조회"
  ON public.articles FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = author_id);

-- 관리자는 모든 게시물 조회 가능
CREATE POLICY "관리자 전체 조회"
  ON public.articles FOR SELECT
  TO authenticated
  USING (public.get_my_role() = 'admin');

-- 인증된 사용자만 게시물 작성 가능
CREATE POLICY "인증 사용자 게시물 작성"
  ON public.articles FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = author_id);

-- 작성자 또는 관리자/모더레이터만 수정 가능
CREATE POLICY "작성자 또는 관리자 수정"
  ON public.articles FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) = author_id
    OR public.get_my_role() IN ('admin', 'moderator')
  )
  WITH CHECK (
    (select auth.uid()) = author_id
    OR public.get_my_role() IN ('admin', 'moderator')
  );

-- 작성자 또는 관리자만 삭제 가능
CREATE POLICY "작성자 또는 관리자 삭제"
  ON public.articles FOR DELETE
  TO authenticated
  USING (
    (select auth.uid()) = author_id
    OR public.get_my_role() = 'admin'
  );
```

---

### 2.3 조직/팀 기반 접근

팀 멤버십을 확인하여 같은 팀의 데이터만 접근 허용하는 패턴:

```sql
-- 팀 테이블
CREATE TABLE public.teams (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 팀 멤버십 테이블 (역할 포함)
CREATE TABLE public.team_members (
  team_id    UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- 팀 멤버십 확인 헬퍼 함수
CREATE OR REPLACE FUNCTION public.is_team_member(p_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id
      AND user_id = (select auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_team_admin(p_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id
      AND user_id = (select auth.uid())
      AND role IN ('owner', 'admin')
  );
$$;

-- 팀 정책: 멤버만 팀 정보 조회
CREATE POLICY "팀 멤버 조회"
  ON public.teams FOR SELECT
  TO authenticated
  USING (public.is_team_member(id));

-- 팀 멤버십 정책: 자신의 멤버십 조회
CREATE POLICY "자신의 멤버십 조회"
  ON public.team_members FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- 팀 내 같은 멤버 조회 (팀원 목록)
CREATE POLICY "같은 팀 멤버 목록 조회"
  ON public.team_members FOR SELECT
  TO authenticated
  USING (public.is_team_member(team_id));

-- 팀 프로젝트 테이블
CREATE TABLE public.projects (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id     UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- 팀 멤버만 프로젝트 조회
CREATE POLICY "팀 멤버 프로젝트 조회"
  ON public.projects FOR SELECT
  TO authenticated
  USING (public.is_team_member(team_id));

-- 팀 어드민만 프로젝트 생성/수정/삭제
CREATE POLICY "팀 어드민 프로젝트 생성"
  ON public.projects FOR INSERT
  TO authenticated
  WITH CHECK (public.is_team_admin(team_id));

CREATE POLICY "팀 어드민 프로젝트 수정"
  ON public.projects FOR UPDATE
  TO authenticated
  USING (public.is_team_admin(team_id))
  WITH CHECK (public.is_team_admin(team_id));

-- 인덱스 (성능 핵심)
CREATE INDEX idx_team_members_user_id ON public.team_members(user_id);
CREATE INDEX idx_team_members_team_id ON public.team_members(team_id);
CREATE INDEX idx_team_members_user_team ON public.team_members(user_id, team_id);
CREATE INDEX idx_projects_team_id ON public.projects(team_id);
```

---

### 2.4 공개/비공개 데이터 혼합

공개 데이터는 누구나 읽고, 개인 데이터는 본인만 접근하는 혼합 패턴:

```sql
CREATE TABLE public.posts (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  content     TEXT,
  is_private  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- 공개 게시물: 비인증 포함 모두 조회 가능
CREATE POLICY "공개 게시물 전체 조회"
  ON public.posts FOR SELECT
  TO anon, authenticated
  USING (is_private = false);

-- 비공개 게시물: 작성자만 조회 가능
CREATE POLICY "비공개 게시물 작성자 조회"
  ON public.posts FOR SELECT
  TO authenticated
  USING (is_private = true AND (select auth.uid()) = author_id);

-- 작성자만 게시물 생성 (자신의 author_id로만 생성 가능)
CREATE POLICY "게시물 생성"
  ON public.posts FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = author_id);

-- 작성자만 수정 가능
CREATE POLICY "게시물 수정"
  ON public.posts FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = author_id)
  WITH CHECK ((select auth.uid()) = author_id);
```

---

## 3. 고급 패턴

### 3.1 계층적 권한 (조직 > 팀 > 개인)

대규모 SaaS에서 흔히 사용되는 3계층 권한 구조:

```sql
-- 조직 테이블
CREATE TABLE public.organizations (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL,
  plan       TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 조직 멤버십 (역할 포함)
CREATE TABLE public.org_members (
  org_id    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  PRIMARY KEY (org_id, user_id)
);

-- 퍼미션 타입 정의
CREATE TYPE public.app_permission AS ENUM (
  'members.read',
  'members.manage',
  'projects.read',
  'projects.manage',
  'billing.read',
  'billing.manage',
  'settings.manage'
);

-- 역할별 퍼미션 매핑 테이블
CREATE TABLE public.role_permissions (
  role       TEXT NOT NULL,
  permission public.app_permission NOT NULL,
  PRIMARY KEY (role, permission)
);

-- 기본 역할별 퍼미션 설정
INSERT INTO public.role_permissions (role, permission) VALUES
  ('owner',  'members.read'),
  ('owner',  'members.manage'),
  ('owner',  'projects.read'),
  ('owner',  'projects.manage'),
  ('owner',  'billing.read'),
  ('owner',  'billing.manage'),
  ('owner',  'settings.manage'),
  ('admin',  'members.read'),
  ('admin',  'members.manage'),
  ('admin',  'projects.read'),
  ('admin',  'projects.manage'),
  ('admin',  'billing.read'),
  ('member', 'members.read'),
  ('member', 'projects.read');

-- 퍼미션 확인 함수
CREATE OR REPLACE FUNCTION public.has_org_permission(
  p_org_id    UUID,
  p_permission public.app_permission
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_members m
    JOIN public.role_permissions rp ON m.role = rp.role
    WHERE m.org_id = p_org_id
      AND m.user_id = (select auth.uid())
      AND rp.permission = p_permission
  );
$$;

-- 조직 소속 여부 확인 (빠른 멤버십 체크)
CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = p_org_id AND user_id = (select auth.uid())
  );
$$;

-- 조직 정책 적용
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "조직 멤버 조회"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (public.is_org_member(id));

CREATE POLICY "멤버 관리 권한으로 멤버 추가"
  ON public.org_members FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_org_permission(org_id, 'members.manage')
    -- 자신보다 높은 역할 부여 방지 (권한 상승 방지)
    AND EXISTS (
      SELECT 1 FROM public.org_members m
      JOIN public.role_permissions rp1 ON m.role = rp1.role
      WHERE m.org_id = org_id
        AND m.user_id = (select auth.uid())
        AND rp1.permission = 'members.manage'
    )
  );

-- 인덱스
CREATE INDEX idx_org_members_user_id ON public.org_members(user_id);
CREATE INDEX idx_org_members_org_user ON public.org_members(org_id, user_id);
CREATE INDEX idx_role_permissions_role ON public.role_permissions(role);
```

---

### 3.2 시간 기반 접근 (유효기간이 있는 공유)

링크 공유나 임시 접근 토큰을 통한 시간 제한 접근 패턴:

```sql
-- 공유 링크 테이블
CREATE TABLE public.share_links (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  resource_id UUID NOT NULL,
  resource_type TEXT NOT NULL,  -- 'document', 'project' 등
  created_by  UUID NOT NULL REFERENCES auth.users(id),
  token       TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  permissions TEXT[] DEFAULT ARRAY['read'],  -- 'read', 'write', 'comment'
  expires_at  TIMESTAMPTZ,                   -- NULL이면 만료 없음
  max_uses    INTEGER,                       -- NULL이면 무제한
  use_count   INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;

-- 유효한 공유 링크 확인 함수
CREATE OR REPLACE FUNCTION public.is_valid_share_token(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.share_links
    WHERE token = p_token
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
      AND (max_uses IS NULL OR use_count < max_uses)
  );
$$;

-- 문서 테이블 (공유 링크 접근 포함)
CREATE TABLE public.documents (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id    UUID NOT NULL REFERENCES auth.users(id),
  title       TEXT NOT NULL,
  content     TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- 소유자 접근
CREATE POLICY "소유자 전체 접근"
  ON public.documents FOR ALL
  TO authenticated
  USING ((select auth.uid()) = owner_id)
  WITH CHECK ((select auth.uid()) = owner_id);

-- 유효한 공유 링크로 접근 (읽기만)
-- 실제 구현에서는 세션 변수나 커스텀 클레임을 활용
CREATE POLICY "공유 링크로 읽기"
  ON public.documents FOR SELECT
  TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM public.share_links sl
      WHERE sl.resource_id = id
        AND sl.resource_type = 'document'
        AND sl.is_active = true
        AND (sl.expires_at IS NULL OR sl.expires_at > now())
        AND (sl.max_uses IS NULL OR sl.use_count < sl.max_uses)
        AND 'read' = ANY(sl.permissions)
    )
  );

-- 공유 링크 사용 횟수 증가 함수
CREATE OR REPLACE FUNCTION public.use_share_link(p_token TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.share_links
  SET use_count = use_count + 1
  WHERE token = p_token
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR use_count < max_uses);
$$;
```

---

### 3.3 컬럼 레벨 보안 (민감 데이터 보호)

Supabase는 PostgreSQL의 컬럼 권한(`GRANT`/`REVOKE`)을 통한 컬럼 레벨 보안을 지원한다. 그러나 공식 문서에서는 **대부분의 경우 뷰(View) + RLS 조합을 권장**한다:

#### 방법 1: GRANT/REVOKE (컬럼 권한)

```sql
-- 전체 업데이트 권한 취소
REVOKE UPDATE ON TABLE public.users FROM authenticated;

-- 특정 컬럼만 업데이트 허용
GRANT UPDATE (username, avatar_url) ON TABLE public.users TO authenticated;

-- 민감 컬럼(salary, ssn 등) SELECT 제한
REVOKE SELECT (salary, ssn) ON TABLE public.employees FROM authenticated;
GRANT SELECT (id, name, department) ON TABLE public.employees TO authenticated;
```

> 주의: 컬럼 권한 적용 시 `SELECT *`를 사용할 수 없다. 컬럼을 명시해야 한다.

#### 방법 2: 보안 뷰 (권장)

```sql
-- 원본 테이블 (민감 데이터 포함)
CREATE TABLE private.employee_data (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id),
  name       TEXT,
  department TEXT,
  salary     NUMERIC,   -- 민감 데이터
  ssn        TEXT,      -- 민감 데이터
  hire_date  DATE
);

-- 공개용 뷰 (민감 데이터 제외)
CREATE VIEW public.employees AS
  SELECT id, user_id, name, department, hire_date
  FROM private.employee_data;

-- 뷰에 RLS 정책 적용 (PostgreSQL 15+: security_invoker)
ALTER VIEW public.employees SET (security_invoker = true);

-- 관리자용 뷰 (급여 포함)
CREATE VIEW public.employees_with_salary AS
  SELECT *
  FROM private.employee_data
  WHERE EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (select auth.uid()) AND role = 'admin'
  );
```

#### 방법 3: 함수 기반 마스킹

```sql
-- 전화번호 마스킹 함수
CREATE OR REPLACE FUNCTION public.mask_phone(phone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(phone, '(\d{3})\d{4}(\d{4})', '\1****\2');
$$;

-- 마스킹 적용 뷰
CREATE VIEW public.user_contacts AS
  SELECT
    id,
    name,
    CASE
      WHEN (select auth.uid()) = user_id THEN phone     -- 본인은 원본
      WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'admin')
        THEN phone                                        -- 관리자는 원본
      ELSE public.mask_phone(phone)                      -- 그 외 마스킹
    END AS phone,
    email
  FROM private.user_data;
```

---

### 3.4 Security Definer 함수 활용

`SECURITY DEFINER` 함수는 함수를 **정의한 사람의 권한**으로 실행되어, 내부 테이블에 RLS 없이 접근할 수 있다. 복잡한 권한 로직을 효율적으로 구현하는 핵심 도구다:

```sql
-- 안전한 security definer 함수 작성 패턴
CREATE OR REPLACE FUNCTION public.get_user_accessible_projects(p_user_id UUID)
RETURNS TABLE (
  project_id   UUID,
  project_name TEXT,
  team_name    TEXT,
  user_role    TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''  -- 중요: 검색 경로 고정으로 스키마 인젝션 방지
AS $$
  SELECT
    p.id,
    p.name,
    t.name,
    tm.role
  FROM public.projects p
  JOIN public.teams t ON p.team_id = t.id
  JOIN public.team_members tm ON t.id = tm.team_id
  WHERE tm.user_id = p_user_id;
$$;

-- 권한 상승 방지: 함수 내에서도 현재 사용자 확인
CREATE OR REPLACE FUNCTION public.transfer_ownership(
  p_team_id UUID,
  p_new_owner_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- 현재 사용자가 owner인지 확인
  IF NOT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id
      AND user_id = (select auth.uid())
      AND role = 'owner'
  ) THEN
    RAISE EXCEPTION '권한 없음: owner만 소유권 이전 가능';
  END IF;

  -- 새 owner로 역할 변경
  UPDATE public.team_members
  SET role = 'owner'
  WHERE team_id = p_team_id AND user_id = p_new_owner_id;

  -- 기존 owner를 admin으로 강등
  UPDATE public.team_members
  SET role = 'admin'
  WHERE team_id = p_team_id AND user_id = (select auth.uid());
END;
$$;

-- API 노출 방지 (필요한 경우)
REVOKE ALL ON FUNCTION public.get_user_accessible_projects FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_accessible_projects TO authenticated;
```

> 중요: `SET search_path = ''`는 필수 보안 설정이다. 검색 경로를 고정하지 않으면 공격자가 스키마 이름을 가장한 악의적인 함수로 교체(Schema Poisoning)할 수 있다.

---

## 4. 성능 최적화

### 4.1 RLS 정책의 성능 영향

RLS 정책은 쿼리마다 실행되므로 복잡한 정책은 성능 저하를 유발한다. 핵심 최적화 기법:

#### (1) auth.uid() 캐싱 패턴

```sql
-- 느림: 매 행마다 함수 호출
CREATE POLICY "느린 정책"
  ON public.posts FOR SELECT
  USING (auth.uid() = user_id);

-- 빠름: 서브쿼리로 감싸 statement 단위로 캐싱
CREATE POLICY "빠른 정책"
  ON public.posts FOR SELECT
  USING ((select auth.uid()) = user_id);
```

PostgreSQL은 `(select auth.uid())`를 서브쿼리로 인식해 한 번만 실행하고 결과를 캐싱한다. 대규모 테이블에서 **수배 이상의 성능 차이**가 발생한다.

#### (2) 인덱스 전략

```sql
-- RLS 정책에 사용되는 모든 컬럼에 인덱스 필수
CREATE INDEX idx_posts_user_id ON public.posts(user_id);
CREATE INDEX idx_posts_team_id ON public.posts(team_id);

-- 부분 인덱스: 공개 게시물만 인덱싱
CREATE INDEX idx_posts_published ON public.posts(created_at)
  WHERE published = true;

-- 복합 인덱스: 정책에서 여러 컬럼 조합 사용 시
CREATE INDEX idx_team_members_user_team_role
  ON public.team_members(user_id, team_id, role);
```

#### (3) 복잡한 정책 최적화

```sql
-- 느림: 매 행마다 서브쿼리 실행
CREATE POLICY "느린 팀 정책"
  ON public.projects FOR SELECT
  USING (
    team_id IN (
      SELECT team_id FROM public.team_members
      WHERE user_id = (select auth.uid())
    )
  );

-- 빠름: EXISTS 사용 (인덱스 활용 더 잘 됨)
CREATE POLICY "빠른 팀 정책"
  ON public.projects FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = projects.team_id
        AND user_id = (select auth.uid())
    )
  );

-- 더 빠름: security definer 함수로 결과 캐싱
CREATE POLICY "최적화된 팀 정책"
  ON public.projects FOR SELECT
  USING (public.is_team_member(team_id));
```

---

### 4.2 실행 계획 분석으로 성능 검증

```sql
-- RLS 정책이 적용된 실행 계획 확인
-- (service_role이 아닌 authenticated 역할로 확인해야 함)
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT * FROM public.posts WHERE id = '...';

-- 정책이 인덱스를 사용하는지 확인
-- "Seq Scan" 대신 "Index Scan"이 나와야 함

-- RLS 정책 목록 조회
SELECT
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

---

### 4.3 자주 하는 실수와 해결책

| 실수 | 증상 | 해결책 |
|------|------|--------|
| RLS 미활성화 | 모든 데이터 노출 | 모든 public 테이블에 `ENABLE ROW LEVEL SECURITY` |
| 정책 없이 RLS만 활성화 | 아무것도 조회 안 됨 | 최소 SELECT 정책 추가 |
| `auth.uid()` 직접 사용 | 대규모 테이블 느려짐 | `(select auth.uid())`로 캐싱 |
| 정책 컬럼에 인덱스 없음 | 풀 테이블 스캔 | 모든 정책 컬럼에 인덱스 추가 |
| UPDATE에 SELECT 정책 누락 | UPDATE 실패 | UPDATE 정책은 내부적으로 SELECT 필요 |
| `user_meta_data`로 역할 확인 | 권한 상승 취약점 | `app_metadata` 또는 별도 테이블 사용 |
| 뷰에서 RLS 우회 | 정책 적용 안 됨 | PostgreSQL 15+에서 `security_invoker = true` |
| service_role 키 클라이언트 노출 | RLS 완전 우회 | 서버 사이드에서만 service_role 사용 |

---

## 5. RLS 테스트

### 5.1 pgTAP을 이용한 자동화 테스트

Supabase CLI는 pgTAP 기반 데이터베이스 테스트를 지원한다:

```bash
# 테스트 파일 위치: supabase/tests/database/
supabase test db
```

#### 기본 RLS 테스트 설정

```sql
-- supabase/tests/database/rls_test.sql

BEGIN;
SELECT plan(10);  -- 테스트 수 선언

-- 테스트 헬퍼 설치 (supabase-test-helpers)
CREATE EXTENSION IF NOT EXISTS "basejump-supabase_test_helpers";

-- 테스트 사용자 생성
SELECT tests.create_supabase_user('user1', 'user1@test.com');
SELECT tests.create_supabase_user('user2', 'user2@test.com');

-- 테스트 데이터 생성 (service_role로)
INSERT INTO public.todos (user_id, title)
VALUES (tests.get_supabase_uid('user1'), 'User1의 할일');

INSERT INTO public.todos (user_id, title)
VALUES (tests.get_supabase_uid('user2'), 'User2의 할일');

-- 1. RLS 활성화 확인
SELECT ok(
  (SELECT rowsecurity FROM pg_tables WHERE tablename = 'todos'),
  'todos 테이블에 RLS가 활성화되어 있어야 함'
);

-- 2. 비인증 사용자는 아무것도 볼 수 없음
SELECT tests.clear_authentication();
SELECT is_empty(
  $$ SELECT * FROM public.todos $$,
  '비인증 사용자는 todo를 볼 수 없음'
);

-- 3. user1은 자신의 todo만 볼 수 있음
SELECT tests.authenticate_as('user1');
SELECT results_eq(
  $$ SELECT count(*)::int FROM public.todos $$,
  ARRAY[1],
  'user1은 자신의 todo 1개만 볼 수 있음'
);

-- 4. user1은 user2의 todo를 볼 수 없음
SELECT is_empty(
  $$ SELECT * FROM public.todos
     WHERE user_id = tests.get_supabase_uid('user2') $$,
  'user1은 user2의 todo를 볼 수 없음'
);

-- 5. user1은 자신의 todo 생성 가능
SELECT lives_ok(
  $$ INSERT INTO public.todos (user_id, title)
     VALUES (tests.get_supabase_uid('user1'), '새 할일') $$,
  'user1은 자신의 todo를 생성할 수 있음'
);

-- 6. user1은 user2의 user_id로 todo 생성 불가
SELECT throws_ok(
  $$ INSERT INTO public.todos (user_id, title)
     VALUES (tests.get_supabase_uid('user2'), '위장 할일') $$,
  '42501',
  NULL,
  'user1은 user2의 user_id로 todo를 생성할 수 없음'
);

-- 7. user1은 자신의 todo 수정 가능
SELECT lives_ok(
  $$ UPDATE public.todos SET title = '수정된 할일'
     WHERE user_id = tests.get_supabase_uid('user1') $$,
  'user1은 자신의 todo를 수정할 수 있음'
);

-- 8. user1은 user2의 todo 수정 불가 (조용한 실패 확인)
SELECT tests.authenticate_as('user1');
UPDATE public.todos SET title = '해킹 시도'
WHERE user_id = tests.get_supabase_uid('user2');

-- 수정 후 실제 값이 변경되지 않았는지 확인 (service_role로 전환)
SET LOCAL ROLE service_role;
SELECT is(
  (SELECT title FROM public.todos WHERE user_id = tests.get_supabase_uid('user2')),
  'User2의 할일',
  'user2의 todo는 수정되지 않아야 함'
);

-- 9. user2는 자신의 todo 삭제 가능
SELECT tests.authenticate_as('user2');
SELECT lives_ok(
  $$ DELETE FROM public.todos WHERE user_id = tests.get_supabase_uid('user2') $$,
  'user2는 자신의 todo를 삭제할 수 있음'
);

-- 10. 삭제 후 user1의 todo는 영향받지 않음
SET LOCAL ROLE service_role;
SELECT is(
  (SELECT count(*)::int FROM public.todos WHERE user_id = tests.get_supabase_uid('user1')),
  2,
  'user1의 todo는 영향받지 않음'
);

SELECT * FROM finish();
ROLLBACK;
```

---

### 5.2 역할 기반 RLS 테스트

```sql
BEGIN;
SELECT plan(6);

-- 관리자 사용자 생성
SELECT tests.create_supabase_user('admin_user', 'admin@test.com');
SELECT tests.create_supabase_user('regular_user', 'user@test.com');

-- 역할 설정 (service_role로 profiles 직접 수정)
INSERT INTO public.profiles (id, username, role)
VALUES (tests.get_supabase_uid('admin_user'), 'admin', 'admin');

INSERT INTO public.profiles (id, username, role)
VALUES (tests.get_supabase_uid('regular_user'), 'user', 'user');

-- 일반 사용자 테스트 데이터
INSERT INTO public.articles (author_id, title, published)
VALUES (tests.get_supabase_uid('regular_user'), '일반 게시물', true);

-- 1. 관리자는 모든 게시물 조회 가능
SELECT tests.authenticate_as('admin_user');
SELECT results_eq(
  $$ SELECT count(*)::int FROM public.articles $$,
  ARRAY[1],
  '관리자는 모든 게시물을 볼 수 있음'
);

-- 2. 관리자는 다른 사용자 게시물 삭제 가능
SELECT lives_ok(
  $$ DELETE FROM public.articles
     WHERE author_id = tests.get_supabase_uid('regular_user') $$,
  '관리자는 모든 게시물을 삭제할 수 있음'
);

-- 데이터 복원
INSERT INTO public.articles (author_id, title, published)
VALUES (tests.get_supabase_uid('regular_user'), '일반 게시물', true);

-- 3. 일반 사용자는 자신의 게시물만 관리 가능
SELECT tests.authenticate_as('regular_user');
SELECT results_eq(
  $$ SELECT count(*)::int FROM public.articles $$,
  ARRAY[1],
  '일반 사용자는 자신의 게시물만 볼 수 있음'
);

-- 4. 일반 사용자는 관리자 역할로 권한 상승 불가
SELECT throws_ok(
  $$ UPDATE public.profiles SET role = 'admin'
     WHERE id = tests.get_supabase_uid('regular_user') $$,
  NULL,
  NULL,
  '일반 사용자는 자신의 역할을 변경할 수 없음'
);

SELECT * FROM finish();
ROLLBACK;
```

---

### 5.3 SQL Editor vs 클라이언트 테스트

> 중요: Supabase SQL Editor는 `postgres` 슈퍼유저 권한으로 실행되어 RLS를 무시한다. 반드시 클라이언트 SDK 또는 명시적 역할 전환으로 테스트해야 한다.

```sql
-- SQL Editor에서 RLS 적용 테스트 방법
-- authenticated 역할로 전환
SET ROLE authenticated;
SET request.jwt.claims = '{"sub": "user-uuid-here", "role": "authenticated"}';

-- 이제 RLS가 적용된 상태로 쿼리 실행
SELECT * FROM public.todos;

-- 테스트 후 권한 복원
RESET ROLE;
RESET request.jwt.claims;
```

---

## 6. 실전 시나리오

### 6.1 블로그 플랫폼

```sql
-- 블로그 전체 스키마 및 RLS

-- 작성자 프로필
CREATE TABLE public.author_profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  bio         TEXT,
  is_verified BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 블로그 포스트
CREATE TABLE public.blog_posts (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id   UUID NOT NULL REFERENCES auth.users(id),
  title       TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  content     TEXT,
  status      TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  tags        TEXT[],
  published_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 댓글
CREATE TABLE public.comments (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id     UUID NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES auth.users(id),
  content     TEXT NOT NULL,
  is_deleted  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.author_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- 프로필: 누구나 조회, 본인만 수정
CREATE POLICY "프로필 공개 조회" ON public.author_profiles
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "프로필 본인 수정" ON public.author_profiles
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- 블로그 포스트: 발행된 것만 공개, 초안은 작성자만
CREATE POLICY "발행 포스트 공개" ON public.blog_posts
  FOR SELECT TO anon, authenticated
  USING (status = 'published');

CREATE POLICY "초안 작성자만 조회" ON public.blog_posts
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = author_id AND status = 'draft');

CREATE POLICY "포스트 작성" ON public.blog_posts
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = author_id);

CREATE POLICY "포스트 수정" ON public.blog_posts
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = author_id)
  WITH CHECK ((select auth.uid()) = author_id);

-- 댓글: 포스트가 발행된 경우 조회, 삭제되지 않은 댓글만
CREATE POLICY "댓글 공개 조회" ON public.comments
  FOR SELECT TO anon, authenticated
  USING (
    is_deleted = false
    AND EXISTS (
      SELECT 1 FROM public.blog_posts
      WHERE id = post_id AND status = 'published'
    )
  );

CREATE POLICY "인증 사용자 댓글 작성" ON public.comments
  FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = author_id
    AND EXISTS (
      SELECT 1 FROM public.blog_posts
      WHERE id = post_id AND status = 'published'
    )
  );

CREATE POLICY "댓글 작성자 삭제 (소프트)" ON public.comments
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = author_id)
  WITH CHECK (is_deleted = true);  -- 소프트 삭제만 허용
```

---

### 6.2 SaaS 멀티테넌트

```sql
-- 멀티테넌트 SaaS 핵심 스키마

-- 테넌트(계정) 테이블
CREATE TABLE public.accounts (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL,
  plan       TEXT DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 계정 멤버십
CREATE TABLE public.account_members (
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member',
  PRIMARY KEY (account_id, user_id)
);

-- 멤버십 확인 함수
CREATE OR REPLACE FUNCTION public.my_account_ids()
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ARRAY(
    SELECT account_id FROM public.account_members
    WHERE user_id = (select auth.uid())
  );
$$;

-- 테넌트 격리 정책
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "자신의 계정만 접근"
  ON public.accounts FOR SELECT
  TO authenticated
  USING (id = ANY(public.my_account_ids()));

-- 테넌트별 데이터 테이블
CREATE TABLE public.tenant_data (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  data       JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.tenant_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "테넌트 데이터 격리"
  ON public.tenant_data FOR ALL
  TO authenticated
  USING (account_id = ANY(public.my_account_ids()))
  WITH CHECK (account_id = ANY(public.my_account_ids()));

-- 인덱스
CREATE INDEX idx_account_members_user_id ON public.account_members(user_id);
CREATE INDEX idx_tenant_data_account_id ON public.tenant_data(account_id);
```

---

### 6.3 이커머스 시나리오

```sql
-- 이커머스 주문/상품 RLS 패턴

-- 상품: 공개 조회, 관리자만 수정
CREATE TABLE public.products (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  price       NUMERIC NOT NULL,
  stock       INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "활성 상품 공개 조회"
  ON public.products FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "관리자 상품 관리"
  ON public.products FOR ALL
  TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- 주문: 본인 주문만 접근
CREATE TABLE public.orders (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES auth.users(id),
  status      TEXT DEFAULT 'pending',
  total       NUMERIC NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "자신의 주문만 조회"
  ON public.orders FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = customer_id);

CREATE POLICY "주문 생성"
  ON public.orders FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = customer_id);

-- 관리자는 모든 주문 접근 (배송 처리 등)
CREATE POLICY "관리자 주문 전체 접근"
  ON public.orders FOR ALL
  TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- 주문 상태는 관리자만 변경 가능 (컬럼 레벨 제어)
REVOKE UPDATE ON TABLE public.orders FROM authenticated;
GRANT UPDATE (status) ON TABLE public.orders TO service_role;
```

---

## 7. 안티패턴과 보안 실수

### 7.1 치명적인 보안 실수

#### 실수 1: RLS 활성화 없이 배포

```sql
-- 위험: RLS 없이 API 키로 접근 가능
-- 모든 사용자가 모든 데이터 접근 가능
CREATE TABLE public.user_secrets (...);
-- RLS 없음 = 누구나 SELECT/UPDATE/DELETE 가능

-- 올바른 방법
ALTER TABLE public.user_secrets ENABLE ROW LEVEL SECURITY;
-- 정책 없으면 아무도 접근 못함 (안전한 기본 상태)
```

#### 실수 2: service_role 키 프론트엔드 노출

```typescript
// 위험: 브라우저에서 service_role 사용
const supabase = createClient(url, SERVICE_ROLE_KEY);  // RLS 완전 우회

// 올바른 방법: 브라우저에서는 anon 키만
const supabase = createClient(url, ANON_KEY);
// 서버 사이드(API Route, Edge Function)에서만 service_role 사용
```

#### 실수 3: user_meta_data로 역할 확인

```sql
-- 위험: 사용자가 user_meta_data를 직접 수정할 수 있음
CREATE POLICY "잘못된 관리자 정책"
  ON public.admin_data FOR SELECT
  USING (
    auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
  );

-- 올바른 방법 1: app_metadata (사용자가 수정 불가)
CREATE POLICY "올바른 관리자 정책 (app_metadata)"
  ON public.admin_data FOR SELECT
  USING (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  );

-- 올바른 방법 2: DB 테이블 조회 (가장 안전)
CREATE POLICY "올바른 관리자 정책 (DB)"
  ON public.admin_data FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (select auth.uid()) AND role = 'admin'
    )
  );
```

#### 실수 4: 뷰에서 RLS 우회 (PostgreSQL 14 이하)

```sql
-- 위험: 뷰는 기본적으로 뷰 생성자 권한으로 실행 (RLS 우회)
CREATE VIEW public.all_posts AS SELECT * FROM public.posts;
-- RLS가 적용된 posts에도 불구하고 뷰로 모든 데이터 노출

-- 올바른 방법: security_invoker 설정 (PostgreSQL 15+)
CREATE VIEW public.all_posts
WITH (security_invoker = true) AS
SELECT * FROM public.posts;

-- 또는 뷰 대신 security definer 함수 사용
```

#### 실수 5: UPDATE 정책 없이 DELETE만 허용

```sql
-- 의도치 않은 위험: soft delete 구현 시
CREATE POLICY "소프트 삭제"
  ON public.posts FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = author_id);

-- 위험: WITH CHECK 없으면 다른 사용자의 게시물로 owner 변경 가능
UPDATE posts SET author_id = '다른사용자 UUID' WHERE id = '내 게시물 ID';

-- 올바른 방법: WITH CHECK로 변경 후 상태도 검증
CREATE POLICY "소프트 삭제 안전"
  ON public.posts FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = author_id)
  WITH CHECK ((select auth.uid()) = author_id);  -- author_id 변경 방지
```

---

### 7.2 성능 안티패턴

```sql
-- 안티패턴 1: 정책 컬럼에 인덱스 없음
-- 100만 행 테이블에서 풀 스캔 발생
CREATE POLICY "느린 정책" ON public.posts FOR SELECT
  USING (user_id = (select auth.uid()));
-- user_id에 인덱스 없으면 매 쿼리마다 전체 테이블 스캔

-- 안티패턴 2: 중첩 서브쿼리
CREATE POLICY "과도한 중첩" ON public.items FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE team_id IN (
        SELECT team_id FROM public.team_members
        WHERE user_id = (select auth.uid())
      )
    )
  );
-- security definer 함수로 단순화 필요

-- 안티패턴 3: DISTINCT 또는 집계 함수 정책에 사용
-- PostgreSQL이 최적화하기 어려움
CREATE POLICY "집계 사용 안티패턴" ON public.data FOR SELECT
  USING (
    (SELECT COUNT(*) FROM public.memberships WHERE user_id = (select auth.uid())) > 0
  );
-- COUNT 대신 EXISTS 사용
CREATE POLICY "EXISTS 최적화" ON public.data FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.memberships WHERE user_id = (select auth.uid()))
  );
```

---

### 7.3 RLS 보안 체크리스트

```
[ ] public 스키마의 모든 테이블에 RLS 활성화
[ ] 모든 RLS 활성화 테이블에 최소 1개 이상의 정책 존재
[ ] SELECT/INSERT/UPDATE/DELETE 각각의 정책 의도 확인
[ ] auth.uid()를 (select auth.uid())로 캐싱
[ ] 정책에 사용된 모든 컬럼에 인덱스 존재
[ ] user_metadata 대신 app_metadata 또는 DB 테이블로 역할 확인
[ ] service_role 키가 클라이언트 코드에 없음
[ ] 뷰에 security_invoker = true 설정 (PostgreSQL 15+)
[ ] security definer 함수에 SET search_path = '' 설정
[ ] UPDATE 정책에 WITH CHECK 포함
[ ] pgTAP으로 positive/negative 케이스 모두 테스트
[ ] SQL Editor가 아닌 클라이언트 역할로 테스트
```

---

## 참고 자료

- [Supabase RLS 공식 문서](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Column Level Security](https://supabase.com/docs/guides/database/postgres/column-level-security)
- [pgTAP Advanced Testing](https://supabase.com/docs/guides/local-development/testing/pgtap-extended)
- [Makerkit RLS Best Practices](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices)
- [supabase-test-helpers GitHub](https://github.com/usebasejump/supabase-test-helpers)
- [SupaExplorer PostgreSQL Best Practices](https://supaexplorer.com/best-practices/supabase-postgres/)
