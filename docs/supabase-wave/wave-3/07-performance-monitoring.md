# Supabase 성능 최적화 & 모니터링 가이드

> 작성일: 2026-04-06  
> 대상: Supabase + Next.js 프로덕션 환경 운영자  
> 참고: Supabase 공식 문서, PostgreSQL 공식 문서

---

## 목차

1. [쿼리 최적화](#1-쿼리-최적화)
   - EXPLAIN ANALYZE 활용법
   - N+1 문제 해결 (PostgREST Embedding)
   - 인덱스 최적화 전략
   - Materialized View 활용
   - pg_stat_statements 분석
2. [커넥션 최적화](#2-커넥션-최적화)
   - Supavisor 풀링 설정
   - Transaction vs Session 모드
   - 커넥션 누수 탐지
3. [API 성능](#3-api-성능)
   - PostgREST 캐싱 전략
   - CDN 활용 (Cloudflare, Vercel)
   - 페이지네이션 전략 비교
   - 배치 요청 최적화
4. [모니터링 대시보드](#4-모니터링-대시보드)
   - Supabase Dashboard 활용
   - Log Explorer 활용
   - 커스텀 알림 설정
   - pg_stat_activity / pg_stat_user_tables
5. [스케일링 전략](#5-스케일링-전략)
   - 인스턴스 업그레이드 기준
   - 읽기 복제본 활용
   - 데이터 파티셔닝
   - Connection Pooling 튜닝

---

## 1. 쿼리 최적화

### 1.1 EXPLAIN ANALYZE 활용법

`EXPLAIN ANALYZE`는 PostgreSQL 쿼리 플래너가 실제로 어떻게 쿼리를 실행했는지 보여주는 핵심 진단 도구다. 단순한 `EXPLAIN`은 예상 실행 계획만 보여주지만, `ANALYZE` 옵션을 추가하면 실제 실행 시간과 행 수까지 측정한다.

#### 기본 사용법

```sql
-- 기본 실행 계획 확인
EXPLAIN SELECT * FROM posts WHERE user_id = '123';

-- 실제 실행 시간 포함
EXPLAIN ANALYZE SELECT * FROM posts WHERE user_id = '123';

-- 버퍼 사용량까지 확인 (캐시 히트율 분석)
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM posts WHERE user_id = '123';

-- JSON 포맷으로 출력 (파싱 용이)
EXPLAIN (ANALYZE, FORMAT JSON) SELECT * FROM posts WHERE user_id = '123';
```

#### 실행 계획 읽는 법

```
Gather  (cost=1000.00..15420.33 rows=10 width=100) (actual time=3.421..150.432 rows=10 loops=1)
  ->  Seq Scan on posts  (cost=0.00..14419.23 rows=10 width=100) (actual time=0.043..148.312 rows=10 loops=100)
        Filter: (user_id = '123'::uuid)
        Rows Removed by Filter: 1000000
Planning Time: 0.543 ms
Execution Time: 150.932 ms
```

위 예시에서 주목할 점:
- **Seq Scan** (순차 스캔): 인덱스를 사용하지 않고 전체 테이블을 읽고 있음 → 인덱스 추가 필요
- **Rows Removed by Filter**: 100만 행을 읽고 10개만 남김 → 비효율의 신호
- **cost=0.00..14419.23**: 예상 비용, 높을수록 느림
- **actual time**: 실제 소요 시간 (ms 단위)

#### 인덱스 적용 후 비교

```sql
-- 인덱스 추가
CREATE INDEX idx_posts_user_id ON posts (user_id);

-- 다시 실행
EXPLAIN ANALYZE SELECT * FROM posts WHERE user_id = '123';
```

```
Index Scan using idx_posts_user_id on posts  (cost=0.43..8.45 rows=10 width=100) (actual time=0.021..0.043 rows=10 loops=1)
  Index Cond: (user_id = '123'::uuid)
Planning Time: 0.312 ms
Execution Time: 0.098 ms
```

**Index Scan**으로 전환되어 실행 시간이 150ms → 0.1ms로 1500배 개선됨.

#### Supabase SQL 에디터에서 활용

Supabase Dashboard → SQL Editor에서 직접 실행할 수 있다:

```sql
-- RLS가 포함된 실제 쿼리 분석
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "user-uuid-here"}';

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT p.*, u.email
FROM posts p
JOIN profiles u ON p.user_id = u.id
WHERE p.user_id = auth.uid()
ORDER BY p.created_at DESC
LIMIT 20;
```

#### 주요 병목 패턴과 해결책

| 패턴 | 의미 | 해결책 |
|------|------|--------|
| `Seq Scan` | 전체 테이블 스캔 | 해당 컬럼에 인덱스 추가 |
| `Hash Join` on large tables | 대용량 해시 조인 | 인덱스 기반 Nested Loop으로 유도 |
| `Sort` with high cost | 정렬 비용 높음 | 정렬 컬럼에 인덱스 추가 |
| `Nested Loop` × 수천 | N+1 쿼리 | 배치 조인으로 변경 |
| High `Rows Removed` | 필터링 비율 낮음 | 부분 인덱스(Partial Index) 고려 |

---

### 1.2 N+1 문제 해결 (PostgREST Embedding)

N+1 문제는 목록을 조회한 후 각 항목에 대해 추가 쿼리를 실행할 때 발생하는 고전적인 성능 문제다.

#### 문제 예시 (나쁜 패턴)

```typescript
// BAD: N+1 문제 발생
const { data: posts } = await supabase.from('posts').select('*');

// posts가 100개라면 아래 쿼리가 100번 실행됨
const postsWithUsers = await Promise.all(
  posts.map(async (post) => {
    const { data: user } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', post.user_id)
      .single();
    return { ...post, user };
  })
);
```

위 코드는 1 (목록) + N (각 사용자) = N+1번의 DB 쿼리를 실행한다. 100개 게시글이면 101번의 네트워크 요청이 발생한다.

#### PostgREST Embedding으로 해결

PostgREST는 외래 키 관계를 자동으로 감지하여 단일 쿼리로 관련 데이터를 함께 가져오는 **Embedding** 기능을 제공한다.

```typescript
// GOOD: 단일 쿼리로 해결 (1번의 DB 요청)
const { data: posts } = await supabase
  .from('posts')
  .select(`
    *,
    author:profiles(id, email, avatar_url, full_name),
    comments(id, content, created_at,
      commenter:profiles(id, full_name)
    ),
    categories(id, name, slug)
  `);
```

이렇게 하면 PostgreSQL이 하나의 복잡한 쿼리로 모든 관련 데이터를 조회한다.

#### Inner Join vs Left Join (Embedding 필터링)

```typescript
// LEFT JOIN (기본): 관련 데이터 없는 게시글도 포함
const { data } = await supabase
  .from('posts')
  .select('*, comments(*)');

// INNER JOIN (!inner): 댓글 있는 게시글만 포함
const { data } = await supabase
  .from('posts')
  .select('*, comments!inner(*)');

// 특정 조건으로 필터링
const { data } = await supabase
  .from('posts')
  .select('*, comments!inner(*)')
  .eq('comments.is_approved', true);
```

#### 역방향 Embedding (자식에서 부모 조회)

```typescript
// 댓글 목록과 해당 게시글 정보를 함께
const { data } = await supabase
  .from('comments')
  .select(`
    id,
    content,
    created_at,
    post:posts(id, title, slug)
  `)
  .eq('user_id', userId)
  .order('created_at', { ascending: false });
```

#### 다단계 중첩 Embedding 주의사항

```typescript
// 주의: 3단계 이상 중첩은 쿼리가 복잡해짐
const { data } = await supabase
  .from('organizations')
  .select(`
    id,
    name,
    teams(
      id,
      name,
      members(
        id,
        role,
        user:profiles(id, email)
      )
    )
  `);
// → 이 경우 EXPLAIN으로 실행 계획 반드시 확인
```

---

### 1.3 인덱스 최적화 전략

#### 기본 인덱스 타입

```sql
-- B-Tree 인덱스 (기본, 등호/범위 검색에 적합)
CREATE INDEX idx_posts_created_at ON posts (created_at DESC);

-- 복합 인덱스 (쿼리 패턴에 맞춰 컬럼 순서 중요)
CREATE INDEX idx_posts_user_status ON posts (user_id, status, created_at DESC);

-- GIN 인덱스 (배열, JSONB, 전문검색에 적합)
CREATE INDEX idx_posts_tags ON posts USING GIN (tags);
CREATE INDEX idx_posts_metadata ON posts USING GIN (metadata jsonb_path_ops);

-- GiST 인덱스 (지리 데이터, 범위 타입에 적합)
CREATE INDEX idx_events_location ON events USING GIST (location);
```

#### 부분 인덱스 (Partial Index) — 자주 간과되는 최적화

부분 인덱스는 특정 조건을 만족하는 행에만 인덱스를 생성하여 인덱스 크기를 줄이고 성능을 높인다.

```sql
-- 활성 사용자만 인덱싱 (전체의 10%라면 90% 크기 절감)
CREATE INDEX idx_users_active_email ON users (email)
WHERE is_active = true;

-- 미처리 주문만 인덱싱
CREATE INDEX idx_orders_pending ON orders (created_at, user_id)
WHERE status = 'pending';

-- NULL이 아닌 값만 인덱싱
CREATE INDEX idx_posts_published_at ON posts (published_at)
WHERE published_at IS NOT NULL;

-- 최근 90일 데이터만 인덱싱 (표현식 인덱스와 조합)
CREATE INDEX idx_events_recent ON events (user_id, created_at)
WHERE created_at > NOW() - INTERVAL '90 days';
```

부분 인덱스를 사용하려면 쿼리의 WHERE 절이 인덱스 조건과 일치해야 한다:

```typescript
// 이 쿼리는 부분 인덱스 사용 가능
const { data } = await supabase
  .from('orders')
  .select('*')
  .eq('status', 'pending')
  .eq('user_id', userId);
```

#### 사용되지 않는 인덱스 제거

인덱스는 읽기를 빠르게 하지만 쓰기(INSERT/UPDATE/DELETE)를 느리게 만든다. 사용되지 않는 인덱스는 제거해야 한다.

```sql
-- 사용되지 않는 인덱스 탐지
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,           -- 인덱스 스캔 횟수
  idx_tup_read,       -- 읽은 튜플 수
  idx_tup_fetch,      -- 실제로 가져온 튜플 수
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;

-- 인덱스 사용률 확인
SELECT
  schemaname || '.' || tablename AS table,
  indexname,
  idx_scan AS scans,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size,
  ROUND(100.0 * idx_scan / NULLIF(seq_scan + idx_scan, 0), 2) AS usage_pct
FROM pg_stat_user_indexes
JOIN pg_stat_user_tables USING (relid)
ORDER BY idx_scan;
```

```sql
-- 중복 인덱스 탐지 (a, b 인덱스가 있으면 a 단독 인덱스는 중복)
SELECT
  indrelid::regclass AS table_name,
  array_agg(indexrelid::regclass) AS indexes,
  array_agg(indkey) AS columns
FROM pg_index
GROUP BY indrelid, indkey
HAVING COUNT(*) > 1;
```

#### RLS 정책과 인덱스 연동 (매우 중요)

```sql
-- 나쁜 예: 인덱스 없는 RLS 정책 → 전체 테이블 스캔
CREATE POLICY "사용자는 자신의 게시글만 조회"
ON posts FOR SELECT
USING (auth.uid() = user_id);
-- user_id에 인덱스 없으면 100만 행을 전부 스캔!

-- 해결: 인덱스 추가 필수
CREATE INDEX idx_posts_user_id ON posts (user_id);

-- 추가 최적화: auth.uid()를 SELECT로 감싸 캐싱 효과
CREATE POLICY "사용자는 자신의 게시글만 조회"
ON posts FOR SELECT
USING ((SELECT auth.uid()) = user_id);
-- auth.uid()를 한 번만 평가하고 결과를 재사용
```

---

### 1.4 Materialized View 활용

Materialized View는 복잡한 쿼리 결과를 테이블처럼 저장해두고, 주기적으로 갱신하는 방식이다. 실시간성이 낮아도 되는 집계 데이터에 적합하다.

#### 기본 생성 및 갱신

```sql
-- 복잡한 집계 결과를 Materialized View로 저장
CREATE MATERIALIZED VIEW mv_user_stats AS
SELECT
  u.id AS user_id,
  u.email,
  COUNT(DISTINCT p.id) AS post_count,
  COUNT(DISTINCT c.id) AS comment_count,
  COALESCE(SUM(p.view_count), 0) AS total_views,
  MAX(p.created_at) AS last_post_at
FROM profiles u
LEFT JOIN posts p ON p.user_id = u.id
LEFT JOIN comments c ON c.user_id = u.id
GROUP BY u.id, u.email
WITH DATA;  -- 즉시 데이터 채우기

-- Materialized View에 인덱스 추가 가능
CREATE INDEX idx_mv_user_stats_user_id ON mv_user_stats (user_id);
CREATE INDEX idx_mv_user_stats_post_count ON mv_user_stats (post_count DESC);

-- 데이터 갱신
REFRESH MATERIALIZED VIEW mv_user_stats;

-- 동시성 허용 갱신 (갱신 중에도 읽기 가능, 단 UNIQUE 인덱스 필요)
CREATE UNIQUE INDEX idx_mv_user_stats_unique_user ON mv_user_stats (user_id);
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_user_stats;
```

#### 자동 갱신 설정 (Supabase Cron 활용)

```sql
-- pg_cron 확장 활성화 (Supabase Dashboard에서 가능)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 매 시간 갱신 (CONCURRENTLY: 읽기 차단 없음)
SELECT cron.schedule(
  'refresh-user-stats',
  '0 * * * *',  -- 매 시간 정각
  'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_user_stats'
);

-- 매일 새벽 3시 갱신
SELECT cron.schedule(
  'refresh-daily-stats',
  '0 3 * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_summary'
);

-- 등록된 작업 확인
SELECT * FROM cron.job;
```

#### Supabase API에서 사용

```typescript
// Materialized View를 일반 테이블처럼 조회
const { data: userStats } = await supabase
  .from('mv_user_stats')
  .select('*')
  .order('post_count', { ascending: false })
  .limit(10);
```

**주의**: Materialized View는 기본적으로 PostgREST API에 노출된다. 민감한 데이터가 포함된 경우 RLS를 적용하거나 API 노출을 제한해야 한다.

---

### 1.5 pg_stat_statements 분석

`pg_stat_statements`는 Supabase의 모든 프로젝트에 기본 활성화된 확장으로, 실행된 쿼리의 통계를 수집한다.

#### 느린 쿼리 찾기

```sql
-- 총 실행 시간 기준 TOP 10 느린 쿼리
SELECT
  LEFT(query, 100) AS query_preview,
  calls,
  ROUND(total_exec_time::numeric, 2) AS total_time_ms,
  ROUND(mean_exec_time::numeric, 2) AS avg_time_ms,
  ROUND(stddev_exec_time::numeric, 2) AS stddev_ms,
  rows,
  ROUND(100.0 * shared_blks_hit / NULLIF(shared_blks_hit + shared_blks_read, 0), 2) AS cache_hit_pct
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat%'
ORDER BY total_exec_time DESC
LIMIT 10;
```

```sql
-- 평균 실행 시간 기준 TOP 10 (빈번하게 실행되는 느린 쿼리)
SELECT
  LEFT(query, 150) AS query_preview,
  calls,
  ROUND(mean_exec_time::numeric, 2) AS avg_ms,
  ROUND(total_exec_time::numeric, 2) AS total_ms,
  rows / NULLIF(calls, 0) AS avg_rows
FROM pg_stat_statements
WHERE calls > 100  -- 100회 이상 실행된 쿼리만
ORDER BY mean_exec_time DESC
LIMIT 10;
```

#### 캐시 히트율 분석

```sql
-- 버퍼 캐시 히트율이 낮은 쿼리 (디스크 I/O 많음)
SELECT
  LEFT(query, 100) AS query_preview,
  calls,
  shared_blks_hit,
  shared_blks_read,
  ROUND(100.0 * shared_blks_hit / NULLIF(shared_blks_hit + shared_blks_read, 0), 2) AS cache_hit_pct
FROM pg_stat_statements
WHERE (shared_blks_hit + shared_blks_read) > 1000
ORDER BY cache_hit_pct ASC
LIMIT 20;
-- 캐시 히트율이 95% 이하면 메모리 증설 또는 쿼리 최적화 필요
```

#### 통계 초기화

```sql
-- 최적화 전/후 비교를 위해 통계 초기화 (슈퍼유저 권한 필요)
SELECT pg_stat_reset();
SELECT pg_stat_statements_reset();
```

---

## 2. 커넥션 최적화

### 2.1 Supavisor 풀링 설정

Supavisor는 Supabase가 제공하는 서버 사이드 Postgres 커넥션 풀러다. PgBouncer를 대체하며, 멀티테넌트 환경에 최적화되어 있다.

#### 연결 방식 비교

| 구분 | 직접 연결 | Supavisor |
|------|-----------|-----------|
| 포트 | 5432 | 6543 |
| 용도 | 장기 서버 프로세스 | 서버리스/단기 함수 |
| 성능 | 빠름 (연결 오버헤드 없음) | DB 최대 연결 수 절약 |
| 준비된 구문 | 지원 | Transaction 모드에서 미지원 |
| 마이그레이션 | 적합 | 부적합 |

#### 연결 URL 구성

```bash
# 직접 연결 (DB 마이그레이션, 장기 실행 서비스용)
postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres

# Supavisor Transaction 모드 (서버리스, Edge Functions용)
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true

# Supavisor Session 모드 (준비된 구문 필요한 경우)
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres
```

#### 풀 크기 설정 가이드라인

```sql
-- 현재 최대 커넥션 수 확인
SHOW max_connections;

-- 인스턴스별 권장 풀 크기
-- Micro (0.5 GB RAM): max_connections = 15, pool_size = 6 (40%)
-- Small (1 GB RAM):   max_connections = 30, pool_size = 12 (40%)
-- Medium (4 GB RAM):  max_connections = 60, pool_size = 24 (40%)
-- Large (8 GB RAM):   max_connections = 120, pool_size = 48 (40%)
-- XL (16 GB RAM):     max_connections = 240, pool_size = 96 (40%)

-- PostgREST를 많이 사용하는 경우: 풀 크기를 max_connections의 40%로 제한
-- 그 외 워크로드: 80%까지 허용
```

---

### 2.2 Transaction vs Session 모드

#### Transaction 모드 (포트 6543)

```typescript
// Transaction 모드: 각 트랜잭션마다 커넥션 재할당
// 장점: 더 많은 동시 클라이언트 지원
// 단점: 준비된 구문(Prepared Statements) 미지원

// Supabase JS 클라이언트는 Transaction 모드와 자동 호환
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 서버리스 환경에서는 Transaction 모드 권장
// Next.js API Routes, Vercel Functions, Supabase Edge Functions
```

#### Session 모드 (포트 5432, Supavisor 경유)

```typescript
// Session 모드: 클라이언트 생애주기 동안 커넥션 유지
// 장점: 준비된 구문 지원, 세션 변수 사용 가능
// 단점: 커넥션 수 제한적

// Prisma, Drizzle ORM 같은 ORM은 Session 모드 필요
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,  // 포트 5432 URL
});
```

---

### 2.3 커넥션 누수 탐지

#### 현재 커넥션 상태 확인

```sql
-- 활성 커넥션 목록 (상태별)
SELECT
  pid,
  usename,
  application_name,
  client_addr,
  state,
  state_change,
  query_start,
  NOW() - query_start AS query_duration,
  LEFT(query, 100) AS current_query
FROM pg_stat_activity
WHERE datname = current_database()
ORDER BY query_duration DESC NULLS LAST;

-- 상태별 커넥션 수 집계
SELECT
  state,
  COUNT(*) AS connections,
  MAX(NOW() - state_change) AS max_idle_time
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state
ORDER BY connections DESC;
```

#### 누수 징후 및 처리

```sql
-- idle 상태 커넥션 중 오래된 것 탐지 (5분 이상)
SELECT pid, usename, application_name, state_change
FROM pg_stat_activity
WHERE state = 'idle'
  AND state_change < NOW() - INTERVAL '5 minutes'
  AND datname = current_database();

-- 문제가 되는 커넥션 강제 종료 (주의해서 사용)
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
  AND state_change < NOW() - INTERVAL '10 minutes'
  AND pid <> pg_backend_pid();

-- idle in transaction 상태 (트랜잭션 미완료) 탐지
SELECT pid, usename, query_start, state
FROM pg_stat_activity
WHERE state = 'idle in transaction'
  AND query_start < NOW() - INTERVAL '2 minutes';
```

#### Next.js에서 커넥션 누수 방지

```typescript
// BAD: 요청마다 새 클라이언트 생성 (커넥션 누수)
export async function GET() {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(url, key);  // 매번 새 연결!
  const { data } = await supabase.from('posts').select('*');
  return Response.json(data);
}

// GOOD: 싱글톤 패턴 (모듈 수준에서 재사용)
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}
```

---

## 3. API 성능

### 3.1 PostgREST 캐싱 전략

#### 서버 사이드 캐싱 (Next.js)

```typescript
// app/api/stats/route.ts
// Next.js fetch 캐싱 활용
export async function GET() {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/mv_user_stats?select=*`,
    {
      headers: {
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
      },
      next: {
        revalidate: 3600,  // 1시간 캐시
        tags: ['user-stats'],  // 태그 기반 무효화
      },
    }
  );
  const data = await response.json();
  return Response.json(data);
}

// 특정 이벤트 발생 시 캐시 무효화
import { revalidateTag } from 'next/cache';

export async function POST() {
  // 데이터 변경 후 캐시 무효화
  revalidateTag('user-stats');
  return Response.json({ success: true });
}
```

#### 클라이언트 사이드 캐싱 (React Query)

```typescript
// hooks/usePublicStats.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';

export function usePublicStats() {
  return useQuery({
    queryKey: ['public-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mv_public_stats')
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,   // 5분간 fresh 상태
    gcTime: 30 * 60 * 1000,     // 30분간 메모리 보관
    refetchOnWindowFocus: false, // 탭 전환 시 재요청 방지
  });
}
```

---

### 3.2 CDN 활용 (Cloudflare, Vercel)

#### Cloudflare Cache Rules 설정

```javascript
// Cloudflare Workers를 통한 API 캐싱
// 공개 통계 API에 대한 Edge 캐싱

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);

  // 공개 API만 캐싱 (인증 필요 없는 엔드포인트)
  if (url.pathname.startsWith('/rest/v1/public_')) {
    const cacheKey = new Request(url.toString(), request);
    const cache = caches.default;

    let response = await cache.match(cacheKey);
    if (!response) {
      response = await fetch(request);
      const cachedResponse = new Response(response.body, response);
      cachedResponse.headers.set('Cache-Control', 'public, max-age=300');
      event.waitUntil(cache.put(cacheKey, cachedResponse.clone()));
    }
    return response;
  }

  return fetch(request);
}
```

#### Supabase Storage CDN 활용

```typescript
// 이미지/파일은 Supabase Storage CDN URL 직접 사용
// CDN이 자동으로 엣지 캐싱 처리

// 공개 파일 URL (CDN 경유)
const publicUrl = supabase.storage
  .from('avatars')
  .getPublicUrl('user-123/avatar.jpg');

// 변환 옵션 포함 (이미지 리사이징)
const optimizedUrl = supabase.storage
  .from('images')
  .getPublicUrl('photo.jpg', {
    transform: {
      width: 400,
      height: 400,
      resize: 'cover',
      quality: 80,
      format: 'webp',
    },
  });
```

---

### 3.3 페이지네이션 전략 비교

#### Offset 기반 페이지네이션 (단순하지만 느려짐)

```typescript
// 문제: OFFSET 값이 클수록 성능 저하 (10만번째 페이지 = 10만 행 스캔)
const { data, count } = await supabase
  .from('posts')
  .select('*', { count: 'exact' })
  .order('created_at', { ascending: false })
  .range(page * pageSize, (page + 1) * pageSize - 1);
  // OFFSET 100000이면 10만 개 행을 읽고 버림!
```

#### Cursor 기반 페이지네이션 (권장 — 대용량에서 일정한 성능)

```typescript
// GOOD: cursor 기반 (항상 빠른 인덱스 탐색)
interface CursorPageResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

async function getPostsPage(
  cursor?: string,
  limit: number = 20
): Promise<CursorPageResult<Post>> {
  let query = supabase
    .from('posts')
    .select('id, title, created_at, user_id')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })  // 동일 시간대 정렬 보장
    .limit(limit + 1);  // 다음 페이지 존재 여부 확인용으로 1개 더 요청

  // cursor가 있으면 해당 지점 이후부터 조회
  if (cursor) {
    const { created_at, id } = JSON.parse(atob(cursor));
    query = query.or(
      `created_at.lt.${created_at},and(created_at.eq.${created_at},id.lt.${id})`
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  const hasMore = data.length > limit;
  const items = hasMore ? data.slice(0, limit) : data;
  const lastItem = items[items.length - 1];

  const nextCursor = hasMore && lastItem
    ? btoa(JSON.stringify({ created_at: lastItem.created_at, id: lastItem.id }))
    : null;

  return { data: items, nextCursor, hasMore };
}
```

#### Cursor 페이지네이션 성능 비교

| 조건 | Offset (100만 행, 10만 번째 페이지) | Cursor (100만 행) |
|------|--------------------------------------|-------------------|
| 실행 시간 | ~5,000ms | ~2ms |
| 스캔 행 수 | 100,000행 | 20행 |
| 인덱스 사용 | 부분적 | 완전 |
| 결과 일관성 | 실시간 데이터 추가 시 중복/누락 가능 | 안정적 |

---

### 3.4 배치 요청 최적화

#### 여러 레코드 한 번에 삽입

```typescript
// BAD: 루프에서 개별 삽입 (N번의 DB 요청)
for (const item of items) {
  await supabase.from('logs').insert(item);
}

// GOOD: 배치 삽입 (1번의 DB 요청)
const { data, error } = await supabase
  .from('logs')
  .insert(items);  // 배열로 한 번에 삽입

// UPSERT: 충돌 시 업데이트
const { data } = await supabase
  .from('user_preferences')
  .upsert(
    items.map(item => ({ user_id: item.userId, ...item.prefs })),
    { onConflict: 'user_id', ignoreDuplicates: false }
  );
```

#### RPC(Remote Procedure Call)로 복잡한 로직 서버로 이전

```sql
-- DB 함수: 여러 테이블에 걸친 트랜잭션 처리
CREATE OR REPLACE FUNCTION create_post_with_tags(
  p_title TEXT,
  p_content TEXT,
  p_tag_ids UUID[]
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_post_id UUID;
BEGIN
  -- 게시글 생성
  INSERT INTO posts (title, content, user_id)
  VALUES (p_title, p_content, auth.uid())
  RETURNING id INTO v_post_id;

  -- 태그 연결
  INSERT INTO post_tags (post_id, tag_id)
  SELECT v_post_id, unnest(p_tag_ids);

  -- 사용자 통계 업데이트
  UPDATE user_stats
  SET post_count = post_count + 1,
      updated_at = NOW()
  WHERE user_id = auth.uid();

  RETURN v_post_id;
END;
$$;
```

```typescript
// 클라이언트에서 단일 호출로 처리
const { data: postId, error } = await supabase
  .rpc('create_post_with_tags', {
    p_title: '제목',
    p_content: '내용',
    p_tag_ids: ['tag-id-1', 'tag-id-2'],
  });
```

---

## 4. 모니터링 대시보드

### 4.1 Supabase Dashboard 활용

#### API 메트릭 (Reports 탭)

Supabase Dashboard의 **Reports** 탭에서 다음 지표를 확인할 수 있다:

- **API Requests**: 시간대별 요청 수, HTTP 상태 코드 분포
- **Database**: 활성 연결 수, 쿼리 실행 시간, 캐시 히트율
- **Auth**: 로그인 시도, 성공/실패율, 활성 세션 수
- **Storage**: 버킷별 사용량, 파일 수, 대역폭

```
Dashboard → 프로젝트 선택 → Reports
  ├── API: 요청 볼륨, 에러율, 응답 시간 분포
  ├── Database: CPU, RAM, 연결 수, 쿼리 성능
  ├── Auth: MAU, 인증 방식별 사용률
  └── Storage: 사용량, 대역폭
```

#### Metrics API 활용 (Prometheus 호환)

```bash
# ~200개 이상의 Postgres 메트릭을 Prometheus 형식으로 노출
curl -H "Authorization: Bearer [SERVICE_ROLE_KEY]" \
  "https://[PROJECT-REF].supabase.co/customer/v1/privileged/metrics"
```

```yaml
# Prometheus 설정 예시
scrape_configs:
  - job_name: 'supabase'
    scrape_interval: 60s
    scheme: https
    metrics_path: /customer/v1/privileged/metrics
    bearer_token: '[SERVICE_ROLE_KEY]'
    static_configs:
      - targets: ['[PROJECT-REF].supabase.co']
```

---

### 4.2 Log Explorer 활용

#### 로그 유형별 쿼리 패턴

```sql
-- Postgres 에러 로그 (최근 1시간)
SELECT
  timestamp,
  event_message,
  metadata->>'error_severity' AS severity,
  metadata->>'query' AS query
FROM postgres_logs
WHERE timestamp > NOW() - INTERVAL '1 hour'
  AND metadata->>'error_severity' IN ('ERROR', 'FATAL', 'PANIC')
ORDER BY timestamp DESC;
```

```sql
-- 느린 API 요청 탐지 (500ms 이상)
SELECT
  timestamp,
  metadata->>'method' AS method,
  metadata->>'path' AS path,
  (metadata->>'response_time_ms')::int AS response_ms,
  metadata->>'status_code' AS status
FROM edge_logs
WHERE timestamp > NOW() - INTERVAL '1 hour'
  AND (metadata->>'response_time_ms')::int > 500
ORDER BY response_ms DESC
LIMIT 50;
```

```sql
-- 인증 실패 패턴 분석
SELECT
  DATE_TRUNC('hour', timestamp) AS hour,
  COUNT(*) AS failures,
  metadata->>'error' AS error_type
FROM auth_logs
WHERE timestamp > NOW() - INTERVAL '24 hours'
  AND metadata->>'status' != '200'
GROUP BY hour, error_type
ORDER BY hour DESC, failures DESC;
```

```sql
-- 자주 실행되는 쿼리 패턴 (PostgREST 로그)
SELECT
  COUNT(*) AS call_count,
  metadata->>'path' AS endpoint,
  ROUND(AVG((metadata->>'response_time_ms')::numeric), 2) AS avg_ms
FROM edge_logs
WHERE timestamp > NOW() - INTERVAL '1 hour'
  AND metadata->>'path' LIKE '/rest/v1/%'
GROUP BY endpoint
ORDER BY call_count DESC
LIMIT 20;
```

---

### 4.3 커스텀 알림 설정

#### Supabase + Slack/Discord Webhook

```typescript
// supabase/functions/alert-monitor/index.ts
// Edge Function으로 주기적 모니터링 및 알림

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // 커넥션 사용률 확인
  const { data: connStats } = await supabase.rpc('get_connection_stats');

  if (connStats.active_connections / connStats.max_connections > 0.8) {
    await sendAlert({
      title: '⚠️ DB 커넥션 경고',
      message: `활성 커넥션: ${connStats.active_connections}/${connStats.max_connections} (${Math.round(connStats.active_connections / connStats.max_connections * 100)}%)`,
      level: 'warning',
    });
  }

  // 느린 쿼리 확인
  const { data: slowQueries } = await supabase.rpc('get_slow_queries', {
    threshold_ms: 1000,
    limit: 5,
  });

  if (slowQueries.length > 0) {
    await sendAlert({
      title: '🐢 느린 쿼리 감지',
      message: `상위 느린 쿼리:\n${slowQueries.map(q => `${q.avg_ms}ms: ${q.query.substring(0, 80)}`).join('\n')}`,
      level: 'warning',
    });
  }

  return new Response('OK');
});

async function sendAlert({ title, message, level }: AlertPayload) {
  const webhookUrl = Deno.env.get('SLACK_WEBHOOK_URL')!;
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `*${title}*\n${message}`,
      attachments: [{ color: level === 'warning' ? 'warning' : 'danger' }],
    }),
  });
}
```

---

### 4.4 pg_stat_activity / pg_stat_user_tables 모니터링

#### pg_stat_activity — 실시간 연결 모니터링

```sql
-- 테이블 잠금 탐지 (블로킹 쿼리)
SELECT
  blocking.pid AS blocking_pid,
  blocking.query AS blocking_query,
  blocked.pid AS blocked_pid,
  blocked.query AS blocked_query,
  NOW() - blocked.query_start AS wait_duration
FROM pg_stat_activity AS blocked
JOIN pg_stat_activity AS blocking
  ON blocking.pid = ANY(pg_blocking_pids(blocked.pid))
WHERE NOT blocked.granted;
```

```sql
-- 데이터베이스 부하 요약
SELECT
  COUNT(*) FILTER (WHERE state = 'active') AS active,
  COUNT(*) FILTER (WHERE state = 'idle') AS idle,
  COUNT(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_txn,
  COUNT(*) FILTER (WHERE wait_event IS NOT NULL) AS waiting,
  COUNT(*) AS total
FROM pg_stat_activity
WHERE datname = current_database();
```

#### pg_stat_user_tables — 테이블 레벨 통계

```sql
-- 테이블별 순차 스캔 vs 인덱스 스캔 비율
SELECT
  schemaname,
  tablename,
  seq_scan,
  idx_scan,
  CASE WHEN seq_scan + idx_scan = 0 THEN 0
       ELSE ROUND(100.0 * idx_scan / (seq_scan + idx_scan), 2)
  END AS idx_scan_pct,
  n_live_tup AS live_rows,
  n_dead_tup AS dead_rows,
  CASE WHEN n_live_tup = 0 THEN 0
       ELSE ROUND(100.0 * n_dead_tup / n_live_tup, 2)
  END AS dead_row_pct,
  last_vacuum,
  last_autovacuum,
  last_analyze
FROM pg_stat_user_tables
ORDER BY seq_scan DESC
LIMIT 20;
-- idx_scan_pct가 낮은 테이블 → 인덱스 추가 고려
-- dead_row_pct가 높은 테이블 → VACUUM 수행 고려
```

```sql
-- VACUUM/ANALYZE 필요 테이블 탐지
SELECT
  tablename,
  n_dead_tup,
  n_live_tup,
  last_autovacuum,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE n_dead_tup > 10000
   OR last_autovacuum < NOW() - INTERVAL '7 days'
ORDER BY n_dead_tup DESC;

-- 수동 VACUUM 실행
VACUUM ANALYZE posts;
```

---

## 5. 스케일링 전략

### 5.1 인스턴스 크기 업그레이드 기준

다음 지표 중 하나라도 지속적으로 임계값을 초과하면 업그레이드를 고려한다:

| 지표 | 경고 임계값 | 심각 임계값 | 확인 방법 |
|------|-------------|-------------|-----------|
| CPU 사용률 | 70% | 90% | Dashboard → Reports → Database |
| RAM 사용률 | 75% | 90% | Dashboard → Reports → Database |
| 캐시 히트율 | < 95% | < 90% | pg_stat_statements |
| 활성 커넥션 | max의 60% | max의 80% | pg_stat_activity |
| 쿼리 p99 latency | > 500ms | > 1,000ms | Log Explorer |
| 디스크 I/O | 70% | 90% | Dashboard → Reports → Database |

```sql
-- 현재 버퍼 캐시 히트율 확인 (90% 이하면 RAM 부족 신호)
SELECT
  SUM(blks_hit) AS cache_hits,
  SUM(blks_read) AS disk_reads,
  ROUND(100.0 * SUM(blks_hit) / NULLIF(SUM(blks_hit) + SUM(blks_read), 0), 2) AS cache_hit_pct
FROM pg_stat_database
WHERE datname = current_database();
```

#### 업그레이드 순서

```
1. 먼저 쿼리 최적화로 해결 시도 (인덱스, 캐싱, 쿼리 재작성)
2. 그래도 부족하면 커넥션 풀링 튜닝
3. 읽기 트래픽 분산이 목적이면 Read Replica 추가
4. 전반적인 성능 부족이면 인스턴스 업그레이드
5. 특정 쿼리 패턴 문제면 파티셔닝 고려
```

---

### 5.2 읽기 복제본 활용

읽기 복제본은 Primary DB의 데이터를 실시간으로 복제하여 읽기 트래픽을 분산한다.

#### 읽기 복제본이 적합한 경우

- 보고서/분석 쿼리가 OLTP 성능에 영향을 주는 경우
- 다양한 지역의 사용자 (지역별 Read Replica로 지연 시간 감소)
- 읽기:쓰기 비율이 높은 애플리케이션 (읽기 80% 이상)
- 배치 분석 작업을 Primary에서 분리하고 싶은 경우

#### 읽기 복제본 라우팅 설정

```typescript
// lib/supabase/routing.ts
import { createClient } from '@supabase/supabase-js';

// 읽기 전용 클라이언트 (Read Replica 엔드포인트)
const readClient = createClient(
  process.env.SUPABASE_READ_REPLICA_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 쓰기 클라이언트 (Primary)
const writeClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 목적에 따라 클라이언트 선택
export function getSupabase(operation: 'read' | 'write') {
  return operation === 'read' ? readClient : writeClient;
}
```

**주의**: 복제 지연(Replication Lag)이 발생할 수 있다. 쓰기 직후 바로 읽어야 하는 경우(예: 로그인 후 프로필 조회)는 Primary를 사용해야 한다.

---

### 5.3 데이터 파티셔닝

대용량 테이블(1억 행 이상)은 파티셔닝으로 쿼리 성능을 개선할 수 있다.

#### 범위 기반 파티셔닝 (시계열 데이터)

```sql
-- 이벤트 로그 테이블을 월별 파티셔닝
CREATE TABLE events (
  id UUID DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- 파티션 생성 (월별)
CREATE TABLE events_2026_01 PARTITION OF events
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE events_2026_02 PARTITION OF events
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- 각 파티션에 인덱스 자동 적용 (파티션별)
CREATE INDEX ON events_2026_01 (user_id, created_at);
CREATE INDEX ON events_2026_02 (user_id, created_at);

-- 파티션 자동 생성 함수 (pg_cron과 연계)
CREATE OR REPLACE FUNCTION create_monthly_partition()
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  next_month DATE := DATE_TRUNC('month', NOW()) + INTERVAL '1 month';
  partition_name TEXT;
BEGIN
  partition_name := 'events_' || TO_CHAR(next_month, 'YYYY_MM');
  EXECUTE FORMAT(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF events FOR VALUES FROM (%L) TO (%L)',
    partition_name,
    next_month,
    next_month + INTERVAL '1 month'
  );
END;
$$;
```

#### 해시 기반 파티셔닝 (균일한 분산)

```sql
-- user_id 기준 해시 파티셔닝 (4개 파티션)
CREATE TABLE user_activities (
  id UUID DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  activity_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY HASH (user_id);

CREATE TABLE user_activities_0 PARTITION OF user_activities
  FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE user_activities_1 PARTITION OF user_activities
  FOR VALUES WITH (MODULUS 4, REMAINDER 1);
CREATE TABLE user_activities_2 PARTITION OF user_activities
  FOR VALUES WITH (MODULUS 4, REMAINDER 2);
CREATE TABLE user_activities_3 PARTITION OF user_activities
  FOR VALUES WITH (MODULUS 4, REMAINDER 3);
```

---

### 5.4 Connection Pooling 튜닝

#### 현재 풀 상태 모니터링

```sql
-- Supavisor와 연결된 Postgres 커넥션 모니터링
SELECT
  usename,
  application_name,
  COUNT(*) AS connection_count,
  MAX(NOW() - state_change) AS max_idle,
  AVG(EXTRACT(EPOCH FROM (NOW() - state_change))) AS avg_idle_seconds
FROM pg_stat_activity
WHERE datname = current_database()
  AND application_name LIKE 'Supavisor%'
GROUP BY usename, application_name;
```

#### 풀 크기 최적화 공식

```
이상적인 풀 크기 = 코어 수 × 2 + 유효 디스크 수

예시: 4코어 CPU, SSD 사용
= 4 × 2 + 1 = 9

실제 적용 시:
- min_pool_size: 이상적 풀 크기의 50%
- max_pool_size: max_connections의 40~80%
- idle_timeout: 300초 (5분)
```

#### 애플리케이션 레벨 풀 설정 (Drizzle/Prisma)

```typescript
// Drizzle ORM with connection pooling
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, {
  max: 10,              // 최대 커넥션 수
  idle_timeout: 20,     // idle 커넥션 유지 시간 (초)
  connect_timeout: 10,  // 연결 타임아웃 (초)
  max_lifetime: 300,    // 커넥션 최대 수명 (초)
  onnotice: () => {},   // NOTICE 무시
});

export const db = drizzle(sql);
```

```typescript
// Prisma connection pooling
// prisma/schema.prisma
// datasource db {
//   provider = "postgresql"
//   url = env("DATABASE_URL")
//   // connection_limit = 5  (Vercel 같은 서버리스 환경)
// }

// 서버리스 환경에서 Prisma Accelerate (커넥션 풀링 프록시) 권장
```

---

## 참고 자료

- [Supabase Performance Tuning](https://supabase.com/docs/guides/platform/performance)
- [Connection Management](https://supabase.com/docs/guides/database/connection-management)
- [pg_stat_statements 공식 문서](https://supabase.com/docs/guides/database/extensions/pg_stat_statements)
- [Supabase Read Replicas](https://supabase.com/docs/guides/platform/read-replicas)
- [RLS Performance and Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)
- [Supabase Metrics API](https://supabase.com/docs/guides/telemetry/metrics)
- [Managing Indexes in PostgreSQL](https://supabase.com/docs/guides/database/postgres/indexes)
- [Debugging Performance Issues](https://supabase.com/docs/guides/database/debugging-performance)
