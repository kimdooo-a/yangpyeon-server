# Supabase Database 심층 분석

> 작성일: 2026-04-06
> 대상: Supabase Database 서비스 전체 기능 및 아키텍처
> 목적: Wave-1 리서치 — 기반 데이터베이스 서비스 완전 이해

---

## 목차

1. [개요](#1-개요)
2. [핵심 기능 상세](#2-핵심-기능-상세)
   - 2.1 PostgreSQL 버전 및 지원 범위
   - 2.2 PostgREST를 통한 자동 REST API
   - 2.3 pg_graphql을 통한 GraphQL API
   - 2.4 Row Level Security (RLS)
   - 2.5 데이터베이스 확장(Extensions)
   - 2.6 Realtime과의 연동
   - 2.7 데이터베이스 Webhooks
   - 2.8 Foreign Data Wrappers (FDW)
   - 2.9 Database Branching / Preview Environments
3. [내부 아키텍처](#3-내부-아키텍처)
4. [성능 특성](#4-성능-특성)
5. [제한사항 및 한계](#5-제한사항-및-한계)
6. [보안](#6-보안)
7. [운영](#7-운영)

---

## 1. 개요

### 1.1 Supabase Database란 무엇인가

Supabase Database는 완전히 관리되는 PostgreSQL 데이터베이스 서비스다. Supabase는 단순한 "Firebase 대안"을 넘어 2026년 현재 "Postgres 개발 플랫폼"으로 스스로를 정의한다. 핵심은 각 프로젝트에 독립된 PostgreSQL 인스턴스를 제공하고, 그 위에 REST API, GraphQL API, Realtime, Auth, Storage 레이어를 자동으로 구성해주는 구조다.

Firebase가 NoSQL(Firestore) 기반이라면, Supabase는 관계형 데이터베이스의 모든 기능(조인, 트랜잭션, 외래 키, 인덱스, 저장 프로시저 등)을 그대로 활용할 수 있다.

### 1.2 PostgreSQL 기반 아키텍처 원칙

Supabase의 아키텍처 철학은 "어떤 대규모 기업도 스스로 설계할 만한 구조를 인디 개발자도 사용할 수 있도록 제공한다"는 것이다.

전체 스택 구조:

```
클라이언트 (브라우저 / 모바일 / 서버)
        │
        ▼
┌─────────────────────────────────────────┐
│              Kong (API Gateway)          │
└───────┬─────────┬──────────┬────────────┘
        │         │          │
        ▼         ▼          ▼
  PostgREST   GoTrue     Realtime
  (REST API)  (인증)     (WebSocket)
        │         │          │
        └─────────┴──────────┘
                  │
                  ▼
        ┌─────────────────┐
        │   Supavisor     │  ← Connection Pooler
        └────────┬────────┘
                 │
                 ▼
        ┌─────────────────┐
        │  PostgreSQL DB  │  ← 핵심 엔진
        └─────────────────┘
```

각 컴포넌트:
- **PostgreSQL**: 실제 데이터 저장 및 처리 엔진
- **PostgREST**: DB 스키마를 읽어 RESTful API를 자동 생성
- **GoTrue**: JWT 기반 인증 서비스
- **Realtime**: Elixir/Phoenix 기반 WebSocket 서버, WAL 변경 감지
- **Kong**: 모든 서비스 앞단의 API 게이트웨이
- **Supavisor**: Elixir로 구현된 클라우드 네이티브 커넥션 풀러

### 1.3 Supabase가 제공하는 PostgreSQL의 특징

일반 PostgreSQL과 비교했을 때 Supabase가 추가로 제공하는 것:

1. 자동 REST API (PostgREST) — 테이블 생성 즉시 CRUD 엔드포인트 활성화
2. 자동 GraphQL API (pg_graphql) — 스키마 기반 GraphQL 자동 생성
3. 실시간 구독 (Realtime) — WAL 기반 변경사항 스트리밍
4. Auth 통합 — auth.users 테이블과 RLS 정책 연동
5. Storage — S3 호환 파일 스토리지와 DB 메타데이터 통합
6. Edge Functions — Deno 기반 서버리스 함수

---

## 2. 핵심 기능 상세

### 2.1 PostgreSQL 버전 및 지원 범위

#### 지원 버전

Supabase는 현재 **PostgreSQL 15** 이상을 기본으로 사용하며, 신규 프로젝트는 최신 안정 버전(2026년 기준 PostgreSQL 16/17)으로 생성된다. 각 프로젝트는 독립된 전용 PostgreSQL 인스턴스를 갖는다 (공유 인스턴스 아님).

주요 PostgreSQL 기능 지원:
- 전체 SQL 표준 지원 (DDL, DML, DCL)
- 저장 프로시저 (PL/pgSQL, PL/Python, PL/V8 등)
- 트리거 (BEFORE / AFTER / INSTEAD OF)
- 뷰 및 Materialized Views
- 파티셔닝 (Range, List, Hash)
- 외래 키, 체크 제약조건, 고유 제약조건
- 트랜잭션 및 ACID 보장
- JSON / JSONB 네이티브 지원
- 배열 타입
- 전문 검색 (Full-Text Search)
- 지리 데이터 (PostGIS 통해 지원)

#### 주요 PostgreSQL 확장 기능

Supabase는 PostgreSQL 확장 생태계를 폭넓게 지원한다. 기본 활성화 확장과 선택적 활성화 확장으로 나뉜다.

```sql
-- 현재 활성화된 확장 목록 확인
SELECT name, default_version, installed_version, comment
FROM pg_available_extensions
WHERE installed_version IS NOT NULL
ORDER BY name;
```

#### 업그레이드 정책

Supabase는 메이저 버전 업그레이드 시 대시보드의 "Upgrade" 기능을 통해 진행한다. 업그레이드 과정에서 짧은 다운타임(통상 2분 미만)이 발생한다.

---

### 2.2 PostgREST를 통한 자동 REST API 생성

#### PostgREST란

PostgREST는 PostgreSQL 데이터베이스를 즉시 RESTful API로 변환하는 오픈소스 도구다. Supabase는 PostgREST를 내장하여 테이블/뷰/함수를 생성하는 순간 자동으로 HTTP 엔드포인트를 노출한다.

PostgREST v14(2025년 도입)의 주요 개선사항:
- GET 요청 처리량 약 20% 향상
- 복잡한 DB의 스키마 캐시 로딩 시간: 7분 → 2초로 단축

#### 자동 생성되는 엔드포인트

테이블 `posts`를 생성하면 다음 엔드포인트가 즉시 활성화된다:

```
GET    /rest/v1/posts          → 목록 조회 (필터링/정렬/페이징 지원)
POST   /rest/v1/posts          → 행 삽입
PATCH  /rest/v1/posts?id=eq.1  → 조건부 수정
DELETE /rest/v1/posts?id=eq.1  → 조건부 삭제
```

#### 요청 예시

```bash
# 기본 조회
curl "https://<project>.supabase.co/rest/v1/posts" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <JWT_TOKEN>"

# 필터링 (status가 'published'인 것만)
curl "https://<project>.supabase.co/rest/v1/posts?status=eq.published" \
  -H "apikey: <ANON_KEY>"

# 관계 데이터 조인 (외래 키 기반)
curl "https://<project>.supabase.co/rest/v1/posts?select=*,author:profiles(*)" \
  -H "apikey: <ANON_KEY>"

# 페이지네이션
curl "https://<project>.supabase.co/rest/v1/posts?limit=10&offset=20" \
  -H "apikey: <ANON_KEY>"

# 정렬
curl "https://<project>.supabase.co/rest/v1/posts?order=created_at.desc" \
  -H "apikey: <ANON_KEY>"
```

#### PostgREST가 PostgreSQL과 통신하는 방식

PostgREST는 HTTP 요청을 받으면 다음 과정을 거친다:

1. **JWT 파싱**: Authorization 헤더에서 JWT를 추출하고 검증
2. **역할 설정**: JWT의 role 클레임 기반으로 `SET LOCAL ROLE`을 실행 (anon 또는 authenticated)
3. **컨텍스트 설정**: JWT 페이로드를 `SET LOCAL request.jwt.claims`로 PostgreSQL 세션 변수에 주입
4. **쿼리 실행**: HTTP 메서드와 파라미터를 SQL로 변환하여 실행
5. **RLS 적용**: PostgreSQL의 Row Level Security 정책이 자동으로 적용됨
6. **결과 직렬화**: 결과를 JSON으로 직렬화하여 반환

```sql
-- PostgREST가 내부적으로 실행하는 트랜잭션 예시
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"user-uuid","role":"authenticated"}';
  SET LOCAL request.method = 'GET';
  -- 실제 쿼리
  SELECT json_agg(posts) FROM posts;  -- RLS 정책 자동 적용
COMMIT;
```

#### JavaScript 클라이언트 사용

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// 조회
const { data, error } = await supabase
  .from('posts')
  .select('*, author:profiles(id, username)')
  .eq('status', 'published')
  .order('created_at', { ascending: false })
  .limit(10)

// 삽입
const { data, error } = await supabase
  .from('posts')
  .insert({ title: '새 글', content: '내용...' })
  .select()

// 수정
const { data, error } = await supabase
  .from('posts')
  .update({ status: 'published' })
  .eq('id', postId)
  .select()

// 삭제
const { error } = await supabase
  .from('posts')
  .delete()
  .eq('id', postId)
```

#### 뷰와 함수도 API로 노출

```sql
-- 뷰 생성 → 자동으로 GET /rest/v1/active_posts 생성
CREATE VIEW active_posts AS
  SELECT * FROM posts WHERE status = 'active';

-- 함수 생성 → POST /rest/v1/rpc/get_top_posts 로 호출
CREATE FUNCTION get_top_posts(limit_count INT DEFAULT 10)
RETURNS SETOF posts
LANGUAGE sql
SECURITY DEFINER  -- 호출자가 아닌 소유자 권한으로 실행
AS $$
  SELECT * FROM posts ORDER BY likes DESC LIMIT limit_count;
$$;
```

---

### 2.3 pg_graphql을 통한 GraphQL API

#### 개요

`pg_graphql`은 Supabase가 개발한 PostgreSQL 확장으로, SQL 스키마를 읽어 GraphQL 스키마를 자동으로 생성하고 `graphql.resolve()` 함수 하나로 모든 GraphQL 쿼리를 처리한다. 별도 서버, 별도 프로세스 없이 PostgreSQL 내부에서 완결된다.

2025년 주요 변경사항: **보안 강화 정책**으로 인해 신규 프로젝트에서 pg_graphql이 기본 비활성화로 변경되었다. GraphQL이 필요한 경우 대시보드의 Database Extensions 페이지에서 수동으로 활성화하거나 마이그레이션에 `CREATE EXTENSION pg_graphql;`을 추가해야 한다.

#### 활성화

```sql
-- pg_graphql 활성화
CREATE EXTENSION IF NOT EXISTS pg_graphql;
```

#### 자동 생성 스키마 예시

테이블 구조:
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID REFERENCES profiles(id),
  title TEXT NOT NULL,
  content TEXT,
  published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

자동 생성되는 GraphQL 타입:
```graphql
type Profile {
  id: UUID!
  username: String!
  createdAt: Datetime!
  posts(
    first: Int
    last: Int
    before: Cursor
    after: Cursor
    filter: PostFilter
    orderBy: [PostOrderBy!]
  ): PostConnection
}

type Post {
  id: UUID!
  authorId: UUID
  title: String!
  content: String
  published: Boolean!
  createdAt: Datetime!
  author: Profile
}

type Query {
  profilesCollection(
    first: Int
    last: Int
    before: Cursor
    after: Cursor
    filter: ProfileFilter
    orderBy: [ProfileOrderBy!]
  ): ProfilesConnection
}

type Mutation {
  insertIntoProfilesCollection(objects: [ProfilesInsertInput!]!): ProfilesMutationResponse
  updateProfilesCollection(set: ProfilesUpdateInput!, filter: ProfileFilter): ProfilesMutationResponse
  deleteFromProfilesCollection(filter: ProfileFilter): ProfilesMutationResponse
}
```

#### GraphQL 쿼리 실행

```bash
# GraphQL 엔드포인트: /graphql/v1
curl -X POST "https://<project>.supabase.co/graphql/v1" \
  -H "apikey: <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { postsCollection(filter: { published: { eq: true } }) { edges { node { id title author { username } } } } }"
  }'
```

#### JavaScript에서 GraphQL 사용

```typescript
// @supabase/supabase-js의 graphql 메서드 또는 직접 fetch
const response = await fetch(`${SUPABASE_URL}/graphql/v1`, {
  method: 'POST',
  headers: {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: `
      query GetPosts($first: Int) {
        postsCollection(first: $first, orderBy: [{ createdAt: DescNullsLast }]) {
          edges {
            node {
              id
              title
              content
              createdAt
              author {
                username
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `,
    variables: { first: 10 }
  })
})
```

#### pg_graphql 내부 동작 원리

1. PostgreSQL의 Information Schema와 시스템 카탈로그를 분석하여 테이블, 열, 외래 키, 뷰 정보를 파악
2. 이를 GraphQL 타입으로 매핑 (1:1 연관 관계 자동 감지)
3. GraphQL 쿼리가 들어오면 단일 SQL 쿼리로 변환 (N+1 문제 없음)
4. PostgreSQL의 쿼리 최적화 엔진을 활용하여 효율적으로 실행

#### 제한사항

- 복잡한 커스텀 타입이나 함수 반환 타입은 자동 매핑 제한
- Subscription (실시간 GraphQL)은 지원하지 않음 (대신 Supabase Realtime 사용)
- 중첩 Mutation (한 번에 부모+자식 삽입) 제한적 지원

---

### 2.4 Row Level Security (RLS) 상세 동작 원리

#### RLS란

Row Level Security는 PostgreSQL의 네이티브 기능으로, 테이블의 각 행에 대한 접근을 사용자별로 제어한다. Supabase에서 RLS는 보안 아키텍처의 핵심으로, 클라이언트에서 직접 DB에 접근할 때 안전성을 보장한다.

**중요**: `public` 스키마에 노출된 모든 테이블에는 반드시 RLS를 활성화해야 한다. 그렇지 않으면 anon 키로 모든 데이터를 읽을 수 있다.

#### RLS 활성화

```sql
-- RLS 활성화
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- RLS 비활성화 (주의: 프로덕션에서 사용 금지)
ALTER TABLE posts DISABLE ROW LEVEL SECURITY;

-- RLS가 활성화된 테이블에서 정책 없이는 → 아무 행도 반환되지 않음
-- (deny by default 원칙)
```

#### 정책 종류

PostgreSQL RLS는 USING(행 필터링)과 WITH CHECK(쓰기 제약)를 지원한다:

| 명령 | USING 사용 | WITH CHECK 사용 |
|------|-----------|----------------|
| SELECT | 읽을 수 있는 행 결정 | 해당 없음 |
| INSERT | 해당 없음 | 삽입 가능한 행 결정 |
| UPDATE | 수정 대상 행 결정 | 수정 후 상태 검증 |
| DELETE | 삭제 대상 행 결정 | 해당 없음 |

#### 기본 정책 패턴

```sql
-- 1. 자신의 행만 읽기
CREATE POLICY "사용자는 자신의 데이터만 조회"
  ON posts
  FOR SELECT
  USING (auth.uid() = author_id);

-- 2. 인증된 사용자만 삽입, 자신의 author_id로만
CREATE POLICY "인증된 사용자만 게시글 작성"
  ON posts
  FOR INSERT
  WITH CHECK (auth.uid() = author_id);

-- 3. 자신의 행만 수정
CREATE POLICY "자신의 게시글만 수정"
  ON posts
  FOR UPDATE
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

-- 4. 자신의 행만 삭제
CREATE POLICY "자신의 게시글만 삭제"
  ON posts
  FOR DELETE
  USING (auth.uid() = author_id);

-- 5. 공개 데이터는 모두 읽기 허용
CREATE POLICY "공개 게시글은 누구나 조회"
  ON posts
  FOR SELECT
  USING (is_public = true);
```

#### Supabase 전용 Auth 헬퍼 함수

```sql
-- 현재 사용자의 UUID 반환 (JWT의 sub 클레임)
auth.uid()

-- 현재 사용자의 JWT 역할 반환 ('anon' 또는 'authenticated')
auth.role()

-- JWT 전체 페이로드를 JSONB로 반환
auth.jwt()

-- 사용 예: 사용자 이메일로 필터링
CREATE POLICY "이메일 확인된 사용자만"
  ON profiles
  FOR SELECT
  USING (auth.jwt() ->> 'email_confirmed_at' IS NOT NULL);
```

#### 고급 RLS 패턴: 멀티테넌시

```sql
-- 조직 멤버만 조직 데이터 접근
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL
);

CREATE TABLE org_members (
  org_id UUID REFERENCES organizations(id),
  user_id UUID REFERENCES auth.users(id),
  role TEXT CHECK (role IN ('admin', 'member', 'viewer')),
  PRIMARY KEY (org_id, user_id)
);

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  title TEXT NOT NULL,
  content TEXT
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- 조직 멤버만 문서 접근
CREATE POLICY "조직 멤버만 문서 조회"
  ON documents
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid()
    )
  );

-- 어드민만 문서 삭제
CREATE POLICY "어드민만 문서 삭제"
  ON documents
  FOR DELETE
  USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
```

#### RLS 성능 고려사항

RLS 정책의 USING 절은 매 행마다 평가되므로 성능에 영향을 미친다.

```sql
-- 나쁜 예: 서브쿼리가 매 행마다 실행됨
CREATE POLICY "느린 정책"
  ON large_table
  FOR SELECT
  USING (
    (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'admin'
  );

-- 좋은 예: 인덱스를 활용한 빠른 정책
CREATE INDEX ON org_members(user_id, org_id);

-- 더 좋은 예: auth.jwt()에서 클레임 직접 읽기 (DB 조회 없음)
CREATE POLICY "JWT 클레임 기반 정책"
  ON documents
  FOR SELECT
  USING (
    auth.jwt() -> 'app_metadata' ->> 'org_id' = org_id::TEXT
  );
```

JWT의 `app_metadata`나 `user_metadata`에 역할/조직 정보를 담으면 RLS에서 DB 조회 없이 처리할 수 있어 성능이 크게 향상된다.

---

### 2.5 데이터베이스 확장(Extensions) 목록 및 활용법

Supabase는 50개 이상의 PostgreSQL 확장을 지원한다. 대시보드 Database > Extensions 메뉴 또는 SQL로 관리한다.

#### pgvector — 벡터 유사도 검색

AI/ML 애플리케이션의 임베딩 저장 및 검색에 사용된다.

```sql
-- 활성화
CREATE EXTENSION IF NOT EXISTS vector;

-- 임베딩 컬럼을 가진 테이블
CREATE TABLE documents (
  id BIGSERIAL PRIMARY KEY,
  content TEXT,
  embedding vector(1536)  -- OpenAI text-embedding-3-small 차원수
);

-- 벡터 인덱스 생성 (HNSW - 고속 근사 최근접 이웃)
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 또는 IVFFlat 인덱스 (메모리 효율적)
CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 유사도 검색
SELECT id, content, 1 - (embedding <=> query_embedding) AS similarity
FROM documents
ORDER BY embedding <=> query_embedding  -- cosine distance
LIMIT 5;

-- 다른 거리 연산자
-- <->  : L2 (유클리드) 거리
-- <#>  : 내적 (inner product, 최대화)
-- <=>  : 코사인 거리
```

RLS와 pgvector 통합으로 사용자별 RAG 구현:
```sql
CREATE POLICY "자신의 문서만 벡터 검색 가능"
  ON documents
  FOR SELECT
  USING (user_id = auth.uid());
```

#### pg_cron — 작업 스케줄러

PostgreSQL 내부에서 크론 작업을 실행한다.

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 매일 밤 3시 오래된 로그 삭제
SELECT cron.schedule(
  'cleanup-old-logs',     -- 작업 이름
  '0 3 * * *',           -- cron 표현식
  $$DELETE FROM logs WHERE created_at < NOW() - INTERVAL '30 days'$$
);

-- 매 5분마다 통계 갱신
SELECT cron.schedule(
  'refresh-stats',
  '*/5 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY user_statistics'
);

-- 작업 목록 조회
SELECT * FROM cron.job;

-- 작업 실행 이력 조회
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- 작업 제거
SELECT cron.unschedule('cleanup-old-logs');
```

#### pgmq — 메시지 큐

PostgreSQL 내장 메시지 큐로, 분산 시스템 없이 큐 기반 처리를 구현한다.

```sql
CREATE EXTENSION IF NOT EXISTS pgmq;

-- 큐 생성
SELECT pgmq.create('email_queue');

-- 메시지 발송
SELECT pgmq.send(
  'email_queue',
  '{"to": "user@example.com", "subject": "Welcome!"}'::jsonb
);

-- 메시지 수신 (visibility timeout 30초)
SELECT * FROM pgmq.read('email_queue', 30, 1);

-- 처리 완료 후 삭제
SELECT pgmq.delete('email_queue', msg_id);

-- 처리 실패 시 재큐 (visibility timeout 만료 시 자동 재처리 가능)

-- pg_cron과 연동: 5초마다 큐 처리
SELECT cron.schedule('process-email-queue', '* * * * *',
  $$SELECT pgmq.read('email_queue', 30, 100)$$  -- 분당 최대 100건
);
```

#### pg_stat_statements — 쿼리 성능 모니터링

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- 느린 쿼리 상위 10개
SELECT
  query,
  calls,
  total_exec_time / 1000 AS total_sec,
  mean_exec_time / 1000 AS mean_sec,
  rows
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- 통계 리셋
SELECT pg_stat_statements_reset();
```

#### PostGIS — 지리공간 데이터

```sql
CREATE EXTENSION IF NOT EXISTS postgis;

-- 위치 정보 테이블
CREATE TABLE locations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT,
  geom GEOMETRY(Point, 4326)  -- WGS84 좌표계
);

-- 공간 인덱스
CREATE INDEX ON locations USING GIST(geom);

-- 특정 좌표에서 5km 내 장소 검색
SELECT name, ST_Distance(geom::geography, ST_MakePoint(126.9780, 37.5665)::geography) AS distance_m
FROM locations
WHERE ST_DWithin(geom::geography, ST_MakePoint(126.9780, 37.5665)::geography, 5000)
ORDER BY distance_m;
```

#### 기타 주요 확장

| 확장 | 용도 | 활성화 여부 |
|------|------|------------|
| `uuid-ossp` | UUID 생성 | 기본 활성 |
| `pgcrypto` | 암호화 함수 | 기본 활성 |
| `pg_net` | HTTP 요청 (Webhooks) | 기본 활성 |
| `http` | HTTP 클라이언트 | 선택 활성 |
| `pgtap` | 단위 테스트 프레임워크 | 선택 활성 |
| `pg_jsonschema` | JSON 스키마 검증 | 선택 활성 |
| `wrappers` | FDW 프레임워크 | 선택 활성 |
| `index_advisor` | 인덱스 최적화 조언 | 선택 활성 |
| `plv8` | JavaScript 저장 프로시저 | 선택 활성 |
| `plpython3u` | Python 저장 프로시저 | 선택 활성 |
| `timescaledb` | 시계열 데이터 | 선택 활성 |
| `rum` | 고급 전문 검색 인덱스 | 선택 활성 |

---

### 2.6 Realtime과의 연동 (Postgres Changes)

#### Supabase Realtime 아키텍처

Realtime은 Elixir와 Phoenix Framework로 구축된 WebSocket 서버다. 세 가지 핵심 채널을 제공한다:

1. **Broadcast**: 클라이언트 간 에피머럴(일시적) 메시지 전달
2. **Presence**: 접속 중인 클라이언트 상태 추적 및 동기화
3. **Postgres Changes**: DB 변경사항을 실시간으로 클라이언트에 스트리밍

#### Postgres Changes 동작 원리

```
PostgreSQL WAL (Write-Ahead Log)
         │
         ▼
  논리적 복제 슬롯 (Logical Replication Slot)
         │
         ▼
  Realtime 서버 (Elixir)  ← 가장 가까운 리전에서 연결
         │  WAL 폴링
         ▼
  채널 구독자에게 변경사항 브로드캐스트
         │
         ▼
  WebSocket 클라이언트
```

WAL에서 읽은 각 레코드에 채널 구독 ID가 추가되고, Erlang VM이 자동으로 해당 소켓으로 메시지를 라우팅한다.

#### JavaScript에서 Postgres Changes 구독

```typescript
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// 특정 테이블의 모든 변경 구독
const channel = supabase
  .channel('posts-changes')
  .on(
    'postgres_changes',
    {
      event: '*',        // INSERT | UPDATE | DELETE | *
      schema: 'public',
      table: 'posts',
    },
    (payload) => {
      console.log('변경 감지:', payload)
      console.log('이벤트 타입:', payload.eventType)  // INSERT, UPDATE, DELETE
      console.log('새 데이터:', payload.new)
      console.log('이전 데이터:', payload.old)
    }
  )
  .subscribe()

// 특정 조건에 맞는 변경만 구독
const channel = supabase
  .channel('my-posts')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'posts',
      filter: `author_id=eq.${userId}`,  // 자신의 게시글만
    },
    (payload) => {
      // 새 게시글 알림 처리
    }
  )
  .subscribe()

// 구독 해제
supabase.removeChannel(channel)
```

#### Realtime과 RLS

Postgres Changes는 RLS를 적용하여 권한이 있는 행의 변경만 전달한다. 단, 이를 위해 RLS 정책이 올바르게 설정되어 있어야 한다.

```sql
-- Realtime 구독이 올바르게 작동하도록 RLS 정책 설정
ALTER TABLE posts REPLICA IDENTITY FULL;
-- REPLICA IDENTITY FULL: UPDATE/DELETE 시 이전 행 데이터도 WAL에 포함
-- 없으면 UPDATE의 old 값이 빈 객체로 전달됨
```

#### Broadcast 사용 예시 (DB 거치지 않고 실시간 통신)

```typescript
// 채팅방 브로드캐스트
const channel = supabase.channel('chat-room-123')

// 메시지 수신
channel.on('broadcast', { event: 'message' }, ({ payload }) => {
  appendMessage(payload)
})
.subscribe()

// 메시지 발송
await channel.send({
  type: 'broadcast',
  event: 'message',
  payload: { text: '안녕하세요!', userId: currentUserId }
})
```

---

### 2.7 데이터베이스 Webhooks

#### 개요

Database Webhooks는 테이블 이벤트(INSERT/UPDATE/DELETE)를 트리거로 외부 HTTP 엔드포인트를 호출하는 기능이다. 내부적으로 `pg_net` 확장을 사용하여 비동기로 HTTP 요청을 보내며, 긴 네트워크 요청이 DB 트랜잭션을 블로킹하지 않는다.

#### 설정 방법

대시보드 Database > Webhooks > Create Webhook 또는 SQL로 직접 설정:

```sql
-- Webhooks는 내부적으로 pg_net을 사용하는 트리거로 구현됨
-- 대시보드에서 설정하면 자동으로 아래와 같은 트리거가 생성됨

-- 수동 설정 예시
CREATE OR REPLACE TRIGGER on_new_post
  AFTER INSERT ON posts
  FOR EACH ROW
  EXECUTE FUNCTION supabase_functions.http_request(
    'https://your-server.com/webhook',  -- 엔드포인트 URL
    'POST',                               -- HTTP 메서드
    '{"Content-Type":"application/json"}',-- 헤더 (JSON)
    '{}',                                 -- 추가 파라미터
    '5000'                                -- 타임아웃 (ms)
  );
```

#### Webhook 페이로드 구조

```json
{
  "type": "INSERT",
  "table": "posts",
  "schema": "public",
  "record": {
    "id": "uuid-here",
    "title": "새 게시글",
    "author_id": "user-uuid",
    "created_at": "2026-04-06T12:00:00Z"
  },
  "old_record": null
}
```

UPDATE의 경우 `record`는 새 값, `old_record`는 이전 값을 담는다.

#### 실전 활용 사례

1. **이메일 알림**: 새 주문 INSERT 시 이메일 서비스 호출
2. **AI 처리 트리거**: 새 문서 삽입 시 임베딩 생성 Edge Function 호출
3. **외부 동기화**: Slack, Discord 알림 전송
4. **감사 로그**: 중요 데이터 변경 시 별도 감사 시스템으로 전송

```typescript
// Supabase Edge Function에서 Webhook 수신
Deno.serve(async (req) => {
  const payload = await req.json()

  if (payload.type === 'INSERT' && payload.table === 'posts') {
    // 새 게시글 → 임베딩 생성
    await generateEmbedding(payload.record.content, payload.record.id)
  }

  return new Response('ok', { status: 200 })
})
```

---

### 2.8 Foreign Data Wrappers (FDW)

#### 개요

FDW는 PostgreSQL에서 외부 데이터 소스를 마치 로컬 테이블처럼 조회할 수 있게 하는 기능이다. Supabase는 Rust로 구현된 `wrappers` 프레임워크를 통해 다양한 FDW를 제공하며, WebAssembly 런타임을 지원하여 커스텀 FDW 개발이 가능하다.

#### 지원 FDW 목록

| FDW | 외부 소스 |
|-----|----------|
| `stripe_fdw` | Stripe 결제 데이터 |
| `firebase_fdw` | Firebase Firestore |
| `s3_fdw` | AWS S3 / Cloudflare R2 |
| `bigquery_fdw` | Google BigQuery |
| `clickhouse_fdw` | ClickHouse |
| `airtable_fdw` | Airtable |
| `logflare_fdw` | Logflare |
| `auth0_fdw` | Auth0 |
| `mssql_fdw` | Microsoft SQL Server |
| `redis_fdw` | Redis |

#### 설정 예시: Stripe FDW

```sql
-- wrappers 확장 활성화
CREATE EXTENSION IF NOT EXISTS wrappers WITH SCHEMA extensions;

-- Stripe FDW 서버 생성
CREATE SERVER stripe_server
  FOREIGN DATA WRAPPER stripe_wrapper
  OPTIONS (
    api_key_id 'your-vault-secret-id'  -- Supabase Vault에 저장된 시크릿 참조
  );

-- 외부 테이블 매핑
CREATE FOREIGN TABLE stripe_customers (
  id TEXT,
  email TEXT,
  name TEXT,
  created BIGINT,
  attrs JSONB
)
SERVER stripe_server
OPTIONS (object 'customers');

-- 이제 Stripe 고객 데이터를 SQL로 조회 가능
SELECT id, email, name
FROM stripe_customers
WHERE email LIKE '%@company.com'
LIMIT 10;

-- 로컬 DB와 조인도 가능
SELECT u.id, u.email, s.name as stripe_name
FROM auth.users u
JOIN stripe_customers s ON u.email = s.email;
```

#### Wasm FDW (커스텀 FDW)

```sql
-- Wasm 런타임을 통한 커스텀 FDW 등록
CREATE FOREIGN DATA WRAPPER wasm_wrapper
  HANDLER wasm_fdw_handler
  VALIDATOR wasm_fdw_validator;
```

커스텀 Wasm FDW는 어떤 HTTP API나 데이터 소스도 PostgreSQL 테이블로 매핑할 수 있어 확장성이 매우 높다.

#### 비동기 스트리밍 (Async Streaming)

Supabase Wrappers는 대용량 데이터 소스에 대해 비동기 스트리밍을 지원한다. 수백만 행의 외부 데이터를 메모리에 모두 적재하지 않고 스트리밍 방식으로 처리할 수 있다.

---

### 2.9 Database Branching / Preview Environments

#### 개요

Database Branching은 Git 브랜치처럼 데이터베이스 환경을 분기하여 개발/테스트/스테이징 환경을 독립적으로 운영하는 기능이다. GitHub PR 워크플로우와 통합된다.

#### 작동 방식

```
메인 프로젝트 (프로덕션)
    │
    ├── Preview Branch (PR #123)  ← PR 생성 시 자동 생성
    │   - 독립된 DB 인스턴스
    │   - 마이그레이션 자동 적용
    │   - PR 병합/닫힘 시 자동 삭제
    │
    └── Preview Branch (PR #124)
        - 별도 독립 환경
```

#### 브랜치 특성

- **에피머럴(일시적)**: 비활성 상태로 일정 시간 경과 시 자동 일시정지
- **자동 마이그레이션**: PR의 `supabase/migrations/` 변경사항 자동 적용
- **환경변수 동기화**: Vercel 통합 시 브랜치별 환경변수 자동 업데이트
- **시드 데이터**: `supabase/seed.sql` 자동 적용 가능

#### 설정 방법

```bash
# Supabase CLI로 브랜칭 활성화
supabase link --project-ref <project-id>

# 로컬에서 마이그레이션 생성
supabase migration new add_user_profiles

# 마이그레이션 작성 후 PR 생성 시 Preview Branch 자동 생성
git push origin feature/user-profiles
# → GitHub PR 생성
# → Supabase Preview Branch 자동 생성
# → 마이그레이션 자동 적용
```

#### 고려사항

- Preview Branch는 프로덕션 데이터를 복사하지 않음 (빈 DB 또는 시드 데이터만)
- Team/Enterprise 플랜에서 지원
- 브랜치 수에 따라 추가 비용 발생

---

## 3. 내부 아키텍처

### 3.1 PostgREST와 PostgreSQL 통신 방식 상세

PostgREST는 PostgreSQL과 다음 방식으로 통신한다:

```
HTTP 요청
    │
    ▼
PostgREST 프로세스
    │
    ├── 1. JWT 검증 (HMAC or RSA)
    ├── 2. 쿼리 파싱 및 SQL 생성
    └── 3. PostgreSQL 연결 풀에서 커넥션 획득
              │
              ▼
         PostgreSQL (단일 트랜잭션)
              │
              ├── SET LOCAL ROLE <role>
              ├── SET LOCAL request.jwt.claims = '<jwt-payload>'
              ├── SET LOCAL request.headers = '<headers>'
              └── <실제 SQL 쿼리> (RLS 자동 적용)
```

특징:
- PostgREST는 stateless: 각 요청은 독립된 트랜잭션
- `request.jwt.claims`는 RLS 정책에서 `current_setting()` 또는 `auth.jwt()` 함수로 접근 가능
- 스키마 캐시는 메모리에 유지하며, DB 스키마 변경 시 자동 갱신 (PostgREST v14에서 대폭 개선)

### 3.2 Connection Pooling: Supavisor

#### Supavisor란

Supavisor는 Supabase가 자체 개발한 클라우드 네이티브, 멀티테넌트 PostgreSQL 커넥션 풀러다. Elixir/OTP로 구현되어 매우 높은 동시성을 처리할 수 있다. 기존 PgBouncer를 대체하여 모든 프로젝트에 적용되었다.

PgBouncer 대비 Supavisor의 장점:
- 멀티테넌트 지원 (단일 Supavisor 클러스터가 수천 개 프로젝트 처리)
- 수백만 개의 클라이언트 커넥션 수용
- 미래 기능: 읽기 복제본 간 부하 분산, 쿼리 결과 캐싱

#### 커넥션 모드

```
직접 연결 (포트 5432)
─────────────────────────────
클라이언트 → PostgreSQL 직접
- 풀링 없음, 세션 레벨 기능 완전 지원
- 커넥션 수 제한 있음 (인스턴스 크기에 따라)
- 서버사이드 코드, 마이그레이션 도구에 적합

트랜잭션 모드 (포트 6543, Supavisor)
─────────────────────────────
클라이언트 → Supavisor → PostgreSQL
- 트랜잭션 단위로 커넥션 공유
- 수천 개의 동시 클라이언트 커넥션 지원
- Prepared Statements, 세션 변수 등 제한
- 서버리스 환경(Edge Functions, Vercel 등)에 적합
```

#### 커넥션 문자열 형식

```
# 직접 연결
postgresql://postgres:[PASSWORD]@db.<project-ref>.supabase.co:5432/postgres

# Supavisor (트랜잭션 모드)
postgresql://postgres.<project-ref>:[PASSWORD]@aws-0-<region>.pooler.supabase.com:6543/postgres

# Supavisor (세션 모드, 포트 5432 사용)
postgresql://postgres.<project-ref>:[PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres
```

#### 커넥션 설정 최적화

```sql
-- 현재 커넥션 상태 모니터링
SELECT count(*), state, wait_event_type, wait_event
FROM pg_stat_activity
GROUP BY state, wait_event_type, wait_event
ORDER BY count DESC;

-- Supavisor 풀 크기 확인
-- 대시보드: Settings > Database > Connection pooling
```

### 3.3 읽기 복제본 (Read Replicas)

#### 개요

읽기 복제본은 프라이머리 DB와 동일한 데이터를 유지하는 읽기 전용 DB 인스턴스다. 읽기 요청을 복제본으로 분산하여 프라이머리 부하를 줄이고, 사용자와 가까운 리전에 복제본을 배치하여 읽기 레이턴시를 줄일 수 있다.

#### 2025년 4월 변경사항

2025년 4월 4일부터 Data API(PostgREST를 통한 REST/GraphQL 요청)의 라우팅 방식이 **지오 라우팅(Geo-routing)**으로 변경되었다. 이는 클라이언트와 가장 가까운 DB(읽기 복제본 포함)로 자동 라우팅된다.

#### 구성

```
프라이머리 DB (쓰기 + 읽기)
    │
    ├── Logical Replication → 읽기 복제본 1 (us-east-1)
    ├── Logical Replication → 읽기 복제본 2 (eu-west-1)
    └── Logical Replication → 읽기 복제본 3 (ap-southeast-1)
```

#### 제한사항

- 복제 지연(Replication Lag)이 존재: 쓰기 후 즉시 읽으면 이전 데이터가 반환될 수 있음
- DDL(스키마 변경)은 프라이머리에서만 실행
- Team/Enterprise 플랜 이상에서 지원

#### 클라이언트에서 읽기 복제본 사용

```typescript
// 특정 리전의 읽기 복제본에 직접 연결
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: {
    schema: 'public',
  },
  global: {
    // 지오 라우팅이 자동으로 처리 (2025년 4월 이후)
  }
})
```

### 3.4 Point-in-Time Recovery (PITR)

#### 동작 원리

PITR은 물리적 백업 + WAL 아카이빙 조합으로 구현된다. Supabase는 WAL-G(오픈소스 WAL 아카이빙 도구)를 사용한다.

```
PITR 복원 프로세스:
1. 지정한 시점 이전 최신 전체 물리 백업 다운로드
2. 지정 시점까지의 WAL 파일 다운로드
3. DB에 물리 백업 적용
4. WAL 레코드를 순서대로 재실행 (지정 시점까지)
5. 복원 완료 → 초 단위 정밀도
```

#### 구성

```
전체 물리 백업: 주 1회 (weekly)
WAL 아카이빙:  연속 (continuous, 초 단위)
  │
  └── 복원 가능 기간: 플랜에 따라 다름
      - Pro: 기본 제공 없음, 애드온 구매 필요
      - PITR 1일 보존: 추가 비용
      - PITR 7일 보존: 추가 비용
      - PITR 30일 보존: 추가 비용 (최대)
```

#### 복원 시간 영향 요소

- 마지막 전체 백업으로부터의 경과 시간
- 해당 기간 WAL 활동량 (DML이 많을수록 WAL 크기 증가)
- 목표 시점이 전체 백업 직후에 가까울수록 빠름

#### PITR 복원 절차

1. 대시보드: Settings > Backups > Point in Time Recovery
2. 복원할 날짜/시간 선택 (초 단위)
3. "Restore" 클릭 → 새 프로젝트에 복원되거나 기존 프로젝트에 덮어씌움
4. 복원 완료 후 검증

---

## 4. 성능 특성

### 4.1 인스턴스 크기별 사양

| 인스턴스 | vCPU | RAM | 기본 커넥션 수 | 가격 (월) |
|---------|------|-----|--------------|----------|
| Nano (Free) | 공유 | 0.5 GB | 60 | $0 |
| Micro | 공유 | 1 GB | 60 | ~$10 |
| Small | 2 | 2 GB | 90 | ~$25 |
| Medium | 2 | 4 GB | 120 | ~$50 |
| Large | 4 | 8 GB | 160 | ~$100 |
| XL | 4 | 16 GB | 240 | ~$200 |
| 2XL | 8 | 32 GB | 380 | ~$400 |
| 4XL | 16 | 64 GB | 480 | ~$800 |
| 8XL | 32 | 128 GB | 490 | ~$1,600 |
| 12XL | 48 | 192 GB | 500 | ~$2,400 |
| 16XL | 64 | 256 GB | 500 | ~$3,200 |

Small 이하 인스턴스는 버스트 CPU(일시적으로 높은 성능 발휘 후 제한), Large 이상은 예측 가능한 일정 성능을 유지한다.

### 4.2 커넥션 제한 및 풀링 전략

```sql
-- 현재 최대 커넥션 수 확인
SHOW max_connections;

-- 현재 활성 커넥션 수
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';

-- 슈퍼유저용 예약 커넥션 확인
SHOW superuser_reserved_connections;
-- 기본값 3 → 실제 사용 가능 = max_connections - 3
```

서버리스/엣지 환경(Vercel, Netlify, Edge Functions)에서는 반드시 Supavisor 트랜잭션 모드를 사용해야 한다. 서버리스 함수는 인스턴스가 늘어날 때마다 새 DB 커넥션을 열기 때문에, 직접 연결 방식 사용 시 커넥션 고갈이 발생한다.

```typescript
// Next.js / Vercel Edge 환경에서의 올바른 설정
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    db: { schema: 'public' },
    // Supavisor URL을 DATABASE_URL로 사용
    // (환경변수에서 포트 6543 사용)
  }
)
```

### 4.3 인덱싱 전략

#### B-tree 인덱스 (기본)

```sql
-- 기본 B-tree 인덱스
CREATE INDEX CONCURRENTLY idx_posts_author_id ON posts(author_id);
CREATE INDEX CONCURRENTLY idx_posts_created_at ON posts(created_at DESC);

-- 복합 인덱스 (author_id로 필터 후 created_at으로 정렬하는 쿼리에 최적)
CREATE INDEX CONCURRENTLY idx_posts_author_created
  ON posts(author_id, created_at DESC);

-- 부분 인덱스 (활성 게시글만 인덱싱)
CREATE INDEX CONCURRENTLY idx_active_posts
  ON posts(created_at DESC)
  WHERE status = 'active';
```

#### 특수 인덱스

```sql
-- GIN 인덱스: JSONB, 배열, 전문 검색
CREATE INDEX idx_posts_tags ON posts USING GIN(tags);  -- tags가 배열이나 JSONB인 경우
CREATE INDEX idx_posts_fts ON posts USING GIN(to_tsvector('korean', content));  -- 전문 검색

-- BRIN 인덱스: 시계열 데이터 (매우 작은 크기)
CREATE INDEX idx_logs_created_at ON logs USING BRIN(created_at);

-- HNSW 인덱스: pgvector 벡터 검색 (고속)
CREATE INDEX idx_embeddings ON documents USING hnsw(embedding vector_cosine_ops);
```

#### index_advisor 활용

```sql
CREATE EXTENSION IF NOT EXISTS index_advisor;

-- 특정 쿼리에 대한 인덱스 추천
SELECT *
FROM index_advisor('
  SELECT id, title
  FROM posts
  WHERE author_id = ''user-uuid''
    AND status = ''published''
  ORDER BY created_at DESC
  LIMIT 10
');
-- 결과: 추천 인덱스와 예상 개선 효과 반환
```

### 4.4 쿼리 최적화

#### EXPLAIN ANALYZE 활용

```sql
-- 쿼리 실행 계획 분석
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT p.*, pr.username
FROM posts p
JOIN profiles pr ON p.author_id = pr.id
WHERE p.status = 'published'
ORDER BY p.created_at DESC
LIMIT 20;

-- 주의점:
-- Seq Scan → 인덱스 스캔으로 바꿀 수 있는지 검토
-- Hash Join → Nested Loop로 바꾸면 더 빠를 수 있음 (소규모 데이터)
-- 높은 cost 숫자 → 최적화 필요
```

#### Materialized View 활용

```sql
-- 집계가 많은 뷰는 Materialized View로 캐싱
CREATE MATERIALIZED VIEW user_stats AS
SELECT
  author_id,
  COUNT(*) AS post_count,
  SUM(likes) AS total_likes,
  MAX(created_at) AS last_post_at
FROM posts
GROUP BY author_id;

CREATE INDEX ON user_stats(author_id);

-- pg_cron으로 주기적 갱신
SELECT cron.schedule('refresh-user-stats', '*/10 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats'
);
```

### 4.5 대용량 데이터 처리 한계

- 테이블 크기: 이론적 제한 없음, 실질적으로 수TB 처리 가능
- 단일 쿼리 결과: 메모리 제한(인스턴스 RAM) 내에서 처리
- JSONB 컬럼: 최대 1GB (실용적으로 수MB 이내 권장)
- 파티셔닝 없이 수억 행: 성능 저하 발생 → 파티셔닝 필수

```sql
-- Range 파티셔닝 예시 (월별)
CREATE TABLE events (
  id BIGSERIAL,
  occurred_at TIMESTAMPTZ NOT NULL,
  type TEXT,
  payload JSONB
) PARTITION BY RANGE (occurred_at);

CREATE TABLE events_2026_01 PARTITION OF events
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE events_2026_02 PARTITION OF events
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
```

---

## 5. 제한사항 및 한계

### 5.1 플랜별 리소스 제한

| 항목 | Free | Pro ($25/월) | Team ($599/월) | Enterprise |
|------|------|-------------|----------------|-----------|
| 프로젝트 수 | 2 | 무제한 | 무제한 | 무제한 |
| DB 스토리지 | 500 MB | 8 GB 포함 | 8 GB 포함 | 협의 |
| 스토리지 초과 | 불가 | $0.125/GB | $0.125/GB | 협의 |
| DB 대역폭 | 5 GB | 포함 | 포함 | 협의 |
| 일일 백업 | 1일 | 7일 | 14일 | 30일 |
| PITR | 미지원 | 애드온 | 애드온 | 포함 |
| 읽기 복제본 | 미지원 | 지원 | 지원 | 지원 |
| 브랜칭 | 미지원 | 미지원 | 지원 | 지원 |
| 자동 일시정지 | 7일 비활성 시 | 없음 | 없음 | 없음 |

### 5.2 커넥션 제한 상세

| 인스턴스 | max_connections | 실용 권장 동시 커넥션 |
|---------|----------------|---------------------|
| Nano | 60 | 직접: 10~20, Supavisor: ~200 |
| Micro | 60 | 직접: 10~20, Supavisor: ~200 |
| Small | 90 | 직접: 30, Supavisor: ~500 |
| Medium | 120 | 직접: 50, Supavisor: ~1,000 |
| Large | 160 | 직접: 80, Supavisor: ~2,000 |

### 5.3 SQL 기능 제한사항

Supabase에서 제한되거나 주의가 필요한 SQL 기능:

1. **슈퍼유저 없음**: `postgres` 역할은 슈퍼유저가 아님 (일부 확장 설치 불가)
2. **외부 파일 시스템 접근 불가**: `COPY TO/FROM FILE`은 제한됨
3. **pg_hba.conf 직접 수정 불가**: 접근 제어는 대시보드에서만
4. **WAL 설정 변경 제한**: `wal_level`, `max_replication_slots` 등
5. **`public` 스키마 `auth`, `storage` 등 예약 스키마 있음**

```sql
-- 제한된 스키마들
-- auth    → Supabase Auth 내부 스키마 (직접 수정 금지)
-- storage → Supabase Storage 내부 스키마 (직접 수정 금지)
-- realtime → Supabase Realtime 내부 스키마
-- extensions → 확장 설치 스키마 (이 스키마에만 확장 설치)
-- graphql, graphql_public → pg_graphql 스키마

-- 사용자 테이블은 public 또는 커스텀 스키마에 생성
```

### 5.4 알려진 이슈 및 주의점

1. **트랜잭션 모드에서 Prepared Statements 불가**
   - Supavisor 트랜잭션 모드에서는 세션이 공유되므로 Prepared Statements 지원 안 됨
   - 해결: 세션 모드 사용 또는 직접 연결

2. **Realtime 구독 수 제한**
   - 무료 플랜: 최대 200 동시 Realtime 연결
   - Pro: 최대 500 동시 연결

3. **무료 플랜 자동 일시정지**
   - 7일 비활성 시 자동 일시정지
   - 재개에 30초~1분 소요
   - 프로덕션 사용 부적합

4. **복제 지연**
   - 읽기 복제본의 데이터가 수백 ms ~ 수 초 지연될 수 있음
   - 강한 일관성이 필요한 경우 프라이머리 직접 쿼리 필요

5. **pgvector 인덱스 구축 시간**
   - 수백만 행의 벡터 인덱스 구축은 수분~수십분 소요
   - `CREATE INDEX CONCURRENTLY` 사용 권장

---

## 6. 보안

### 6.1 RLS 정책 작성 가이드

#### 체크리스트

```sql
-- 1. 새 테이블 생성 시 즉시 RLS 활성화
CREATE TABLE new_table (...);
ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;

-- 2. 기본 정책 (deny all) 확인: 정책 없으면 모든 접근 거부

-- 3. 필요한 정책만 최소 권한으로 추가
-- 공개 읽기
CREATE POLICY "public_read" ON new_table FOR SELECT USING (is_public = true);

-- 인증된 사용자 자신의 데이터만
CREATE POLICY "owner_all" ON new_table
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. 정책 테스트
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"test-user-id"}';
SELECT * FROM new_table;  -- 정책이 올바르게 필터링하는지 확인
RESET ROLE;
```

#### 일반적인 RLS 패턴 모음

```sql
-- 패턴 1: 공개 읽기 + 인증된 사용자 쓰기
CREATE POLICY "공개 읽기" ON posts FOR SELECT USING (true);
CREATE POLICY "인증 쓰기" ON posts FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 패턴 2: 소유자 전용 CRUD
CREATE POLICY "소유자 전용" ON private_data
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- 패턴 3: 역할 기반 접근 (JWT app_metadata 활용)
CREATE POLICY "어드민 전체 접근" ON admin_table
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- 패턴 4: 조직 멤버십 기반
CREATE POLICY "조직 멤버 접근" ON org_documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE org_id = org_documents.org_id
        AND user_id = auth.uid()
    )
  );

-- 패턴 5: 시간 기반 (특정 기간만 수정 가능)
CREATE POLICY "24시간 내 수정 가능" ON posts
  FOR UPDATE
  USING (
    auth.uid() = author_id
    AND created_at > NOW() - INTERVAL '24 hours'
  );
```

### 6.2 Service Role vs Anon Key

#### API 키 종류

| 키 | 설명 | 사용 위치 | RLS 적용 |
|----|------|----------|---------|
| `anon` (public) | 비인증 요청용 | 클라이언트 (브라우저/앱) | O (적용됨) |
| `publishable` | anon과 동일 | 클라이언트 | O (적용됨) |
| `service_role` | 서비스 전체 권한 | 서버사이드만 (절대 클라이언트 노출 금지) | X (우회됨) |
| `secret` | service_role과 동일 | 서버사이드만 | X (우회됨) |

```typescript
// 올바른 사용 패턴

// 클라이언트 코드 (Next.js client component)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!  // anon key만 클라이언트에 노출
)

// 서버사이드 코드 (API Routes, Server Actions)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,  // service_role key는 서버에서만
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)
```

#### JWT 구조와 역할

```
JWT Payload 예시 (인증된 사용자):
{
  "aud": "authenticated",
  "exp": 1744000000,
  "sub": "user-uuid-here",
  "email": "user@example.com",
  "role": "authenticated",
  "app_metadata": {
    "provider": "email",
    "role": "admin"         ← 커스텀 역할 (서버사이드에서만 설정)
  },
  "user_metadata": {
    "full_name": "김도영"  ← 사용자가 설정 가능한 메타데이터
  }
}

JWT Payload 예시 (비인증):
{
  "aud": "anon",
  "role": "anon"
}
```

### 6.3 네트워크 보안 (SSL, IP 제한)

#### SSL 연결 강제

모든 Supabase DB 연결은 기본적으로 SSL을 사용한다. 연결 문자열에 `sslmode=require`를 명시하는 것을 권장한다:

```
postgresql://postgres:[PASSWORD]@db.<ref>.supabase.co:5432/postgres?sslmode=require
```

```python
# Python (psycopg2) 예시
import psycopg2
conn = psycopg2.connect(
    host="db.xxx.supabase.co",
    port=5432,
    database="postgres",
    user="postgres",
    password="your-password",
    sslmode="require"
)
```

#### IP 허용 목록 (Network Restrictions)

Pro 플랜 이상에서 특정 IP에서만 DB 접근을 허용하도록 제한할 수 있다:

```
대시보드: Settings > Database > Network Restrictions
- 특정 IP CIDR 블록만 허용
- 0.0.0.0/0 = 모든 IP 허용 (기본값)
- 내부 네트워크에서만 DB 접근하는 서버 환경에 유용
```

#### API 게이트웨이 보안 헤더

```bash
# 모든 API 요청에 apikey 헤더 필수
curl "https://<project>.supabase.co/rest/v1/posts" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <JWT>"
  # apikey 없으면 401 반환

# JWT 만료 시간 설정 (기본 3600초 = 1시간)
# 대시보드: Authentication > Settings > JWT Expiry
```

---

## 7. 운영

### 7.1 마이그레이션 관리

#### Supabase CLI를 사용한 마이그레이션

```bash
# CLI 설치
npm install -g supabase

# 프로젝트 초기화
supabase init

# 프로젝트 연결
supabase link --project-ref <project-ref>

# 새 마이그레이션 파일 생성
supabase migration new create_posts_table
# → supabase/migrations/20260406120000_create_posts_table.sql 생성

# 마이그레이션 내용 작성
cat supabase/migrations/20260406120000_create_posts_table.sql
```

```sql
-- 마이그레이션 파일 예시
-- supabase/migrations/20260406120000_create_posts_table.sql

CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS 즉시 활성화
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- 기본 정책
CREATE POLICY "공개 게시글 조회" ON posts
  FOR SELECT USING (status = 'published');

CREATE POLICY "소유자 전체 권한" ON posts
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

-- 인덱스
CREATE INDEX idx_posts_author_id ON posts(author_id);
CREATE INDEX idx_posts_status_created ON posts(status, created_at DESC);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

```bash
# 로컬 DB에 마이그레이션 적용
supabase db reset  # 로컬 DB 초기화 후 모든 마이그레이션 재적용

# 프로덕션에 마이그레이션 배포
supabase db push

# 현재 마이그레이션 상태 확인
supabase migration list
```

#### 마이그레이션 베스트 프랙티스

```sql
-- 1. 항상 IF NOT EXISTS / IF EXISTS 사용
CREATE TABLE IF NOT EXISTS new_table (...);
ALTER TABLE IF EXISTS old_table DROP COLUMN IF EXISTS old_col;

-- 2. 대규모 테이블 컬럼 추가 시 DEFAULT 값 주의
-- 나쁜 예: 전체 테이블 잠금 발생
ALTER TABLE large_table ADD COLUMN new_col TEXT DEFAULT 'value';

-- 좋은 예: 기본값 없이 추가 후 백그라운드 업데이트
ALTER TABLE large_table ADD COLUMN new_col TEXT;
UPDATE large_table SET new_col = 'value' WHERE new_col IS NULL;
-- 또는 DEFAULT 추가 (PostgreSQL 11+는 ADD DEFAULT가 non-blocking)

-- 3. 인덱스는 CONCURRENTLY로 생성
CREATE INDEX CONCURRENTLY idx_name ON table_name(column);
-- CONCURRENTLY는 테이블 잠금 없이 생성 (더 오래 걸리지만 안전)

-- 4. 외래 키 추가 시 NOT VALID 활용 (대규모 테이블)
ALTER TABLE child ADD CONSTRAINT fk_parent
  FOREIGN KEY (parent_id) REFERENCES parent(id) NOT VALID;
-- NOT VALID: 기존 행은 검증하지 않고 새 행만 검증
-- 이후 백그라운드로 검증
ALTER TABLE child VALIDATE CONSTRAINT fk_parent;
```

### 7.2 백업 및 복원

#### 백업 종류

| 종류 | 방식 | 빈도 | 보존 기간 |
|------|------|------|---------|
| 논리적 백업 (기본) | pg_dump | 일 1회 | 플랜별 상이 |
| 물리적 백업 (PITR 기반) | WAL-G | 주 1회 전체 + 연속 WAL | PITR 애드온 설정값 |

#### 수동 백업 (pg_dump)

```bash
# pg_dump 사용 (직접 연결)
pg_dump \
  --host=db.<project-ref>.supabase.co \
  --port=5432 \
  --username=postgres \
  --dbname=postgres \
  --schema=public \
  --no-owner \
  --no-privileges \
  --file=backup_$(date +%Y%m%d).sql

# 특정 테이블만 백업
pg_dump \
  --host=db.<project-ref>.supabase.co \
  --port=5432 \
  --username=postgres \
  --dbname=postgres \
  --table=posts \
  --table=profiles \
  --file=partial_backup.sql

# 압축 형식으로 저장
pg_dump \
  --format=custom \
  --compress=9 \
  --file=backup.dump \
  <connection-string>
```

#### 복원

```bash
# 논리적 백업 복원
psql \
  --host=db.<new-project>.supabase.co \
  --port=5432 \
  --username=postgres \
  --dbname=postgres \
  --file=backup.sql

# custom 형식 복원 (pg_restore)
pg_restore \
  --host=db.<new-project>.supabase.co \
  --port=5432 \
  --username=postgres \
  --dbname=postgres \
  --no-owner \
  backup.dump
```

#### 복원 속도 향상

대규모 복원 시 대시보드에서 컴퓨트를 일시적으로 업그레이드하여 복원 속도를 높일 수 있다:
Settings > Compute and Disk > 인스턴스 크기 일시 업그레이드 → 복원 완료 후 원래 크기로 복구

### 7.3 모니터링

#### 대시보드 모니터링

대시보드 Reports 섹션에서 제공하는 지표:
- 쿼리 처리량 (QPS)
- 활성 커넥션 수
- 캐시 적중률
- 디스크 I/O
- 슬로우 쿼리 목록

#### pg_stat_* 뷰 활용

```sql
-- 테이블 통계 (스캔 방식, 튜플 수 등)
SELECT
  relname AS table_name,
  seq_scan,
  idx_scan,
  n_tup_ins,
  n_tup_upd,
  n_tup_del,
  n_live_tup,
  n_dead_tup,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;

-- 인덱스 사용 통계
SELECT
  indexrelname AS index_name,
  relname AS table_name,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan;
-- idx_scan = 0인 인덱스는 미사용 → 삭제 검토

-- 블로트(Dead Tuple) 높은 테이블
SELECT
  relname,
  n_dead_tup,
  n_live_tup,
  ROUND(n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0) * 100, 2) AS dead_ratio
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY dead_ratio DESC;

-- 현재 실행 중인 쿼리
SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
FROM pg_stat_activity
WHERE state != 'idle'
  AND (now() - pg_stat_activity.query_start) > INTERVAL '5 seconds'
ORDER BY duration DESC;

-- 대기 이벤트 분석
SELECT wait_event_type, wait_event, count(*)
FROM pg_stat_activity
WHERE state = 'active'
GROUP BY wait_event_type, wait_event
ORDER BY count DESC;

-- 캐시 적중률 (95% 이상 유지 권장)
SELECT
  sum(heap_blks_read) AS heap_read,
  sum(heap_blks_hit) AS heap_hit,
  ROUND(sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit + heap_blks_read), 0) * 100, 2) AS cache_hit_ratio
FROM pg_statio_user_tables;
```

#### Supabase Performance Advisor

대시보드 Database > Performance Advisor에서 자동 분석 기능 제공:
- 미사용 인덱스 탐지
- 인덱스 추천 (index_advisor 활용)
- 과도한 Dead Tuple 경고
- RLS 정책 성능 이슈 탐지

#### Supabase Security Advisor

대시보드 Database > Security Advisor에서 자동 보안 점검:
- RLS 미활성 테이블 탐지
- 공개 함수 보안 설정 확인
- 불필요한 권한 감지

### 7.4 스키마 관리 모범 사례

#### 스키마 분리 원칙

```sql
-- public: 기본 사용자 데이터 (PostgREST API 노출)
-- private: API 미노출 내부 데이터
-- app: 애플리케이션 함수, 뷰, 헬퍼

-- 스키마 생성
CREATE SCHEMA IF NOT EXISTS private;
CREATE SCHEMA IF NOT EXISTS app;

-- PostgREST가 특정 스키마만 노출하도록 설정
-- 대시보드: API > Exposed Schemas에 public과 app 추가
```

#### 공통 컬럼 패턴

```sql
-- 모든 사용자 테이블에 권장하는 기본 컬럼들
CREATE TABLE base_example (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE  -- 소프트 삭제 패턴
);

-- 소프트 삭제 뷰
CREATE VIEW active_base_example AS
  SELECT * FROM base_example WHERE is_deleted = FALSE;
```

#### 외래 키 전략

```sql
-- auth.users 참조 시 ON DELETE CASCADE 주의
-- 사용자 삭제 시 관련 데이터도 삭제되길 원하면:
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE

-- 사용자 삭제 후도 데이터 보존 원하면:
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL
-- user_id를 nullable로 설정 필요

-- 삭제 시도 자체를 막으려면:
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT
```

#### 데이터 타입 선택 가이드

```sql
-- UUID vs BIGSERIAL 비교
-- UUID: 분산 환경, 예측 불가능 ID, 외부 노출 안전
--   gen_random_uuid() → 완전 무작위
--   uuid_generate_v7() → 시간순 정렬 가능 (최신 PostgreSQL)
-- BIGSERIAL: 정렬 가능, 더 작은 인덱스 크기, 순서 예측 가능 (보안 주의)

-- TIMESTAMPTZ vs TIMESTAMP
-- TIMESTAMPTZ: 타임존 정보 포함, UTC로 저장됨 → 권장
-- TIMESTAMP: 타임존 없음 → 특별한 이유 없으면 사용 지양

-- TEXT vs VARCHAR
-- PostgreSQL에서 TEXT와 VARCHAR 성능 차이 없음
-- VARCHAR(n)은 길이 제한이 필요할 때만 사용
-- TEXT 기본 사용 권장

-- JSONB vs JSON
-- JSONB: 이진 저장, 인덱싱 지원, 쿼리 가능 → 권장
-- JSON: 텍스트 저장, 원본 보존 (공백 등) → 특수 용도
```

#### 감사 로그 패턴

```sql
-- 변경 이력 추적 테이블
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  old_values JSONB,
  new_values JSONB,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 감사 트리거 함수
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (table_name, record_id, operation, old_values, new_values, changed_by)
  VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    auth.uid()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 중요 테이블에 감사 트리거 적용
CREATE TRIGGER audit_posts
  AFTER INSERT OR UPDATE OR DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
```

---

## 참고 자료 및 링크

- [Supabase Database 공식 문서](https://supabase.com/docs/guides/database/overview)
- [Supabase 아키텍처 가이드](https://supabase.com/docs/guides/getting-started/architecture)
- [PostgREST 공식 문서](https://supabase.com/docs/guides/api)
- [pg_graphql 공식 문서](https://supabase.github.io/pg_graphql/)
- [Row Level Security 가이드](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Extensions 목록](https://supabase.com/docs/guides/database/extensions)
- [pgvector 가이드](https://supabase.com/docs/guides/database/extensions/pgvector)
- [Supavisor GitHub](https://github.com/supabase/supavisor)
- [Read Replicas 문서](https://supabase.com/docs/guides/platform/read-replicas)
- [Database Backups 문서](https://supabase.com/docs/guides/platform/backups)
- [PITR 관리 문서](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery)
- [Compute and Disk 문서](https://supabase.com/docs/guides/platform/compute-and-disk)
- [Database Webhooks 문서](https://supabase.com/docs/guides/database/webhooks)
- [Foreign Data Wrappers 문서](https://supabase.com/docs/guides/database/extensions/wrappers/overview)
- [Branching 문서](https://supabase.com/docs/guides/deployment/branching)
- [Query Optimization 문서](https://supabase.com/docs/guides/database/query-optimization)
- [Performance Tuning 문서](https://supabase.com/docs/guides/platform/performance)
- [Realtime 아키텍처 문서](https://supabase.com/docs/guides/realtime/architecture)
- [Supabase Pricing](https://supabase.com/pricing)
