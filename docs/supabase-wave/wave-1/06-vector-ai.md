# Supabase Vector & AI 완전 가이드

> 작성일: 2026-04-06  
> 대상: 개발자 / ML 엔지니어  
> 버전 기준: pgvector 0.8.x, Supabase AI Toolkit 2025 기준

---

## 목차

1. [개요: Supabase의 AI/Vector 전략](#1-개요-supabase의-aivector-전략)
2. [pgvector 확장 심층 분석](#2-pgvector-확장-심층-분석)
3. [임베딩 생성 파이프라인](#3-임베딩-생성-파이프라인)
4. [벡터 유사도 검색](#4-벡터-유사도-검색)
5. [인덱싱 전략: IVFFlat vs HNSW](#5-인덱싱-전략-ivfflat-vs-hnsw)
6. [RAG (Retrieval Augmented Generation)](#6-rag-retrieval-augmented-generation)
7. [Supabase AI 통합](#7-supabase-ai-통합)
8. [Vecs: Python 클라이언트 라이브러리](#8-vecs-python-클라이언트-라이브러리)
9. [사용 패턴 및 실전 예제](#9-사용-패턴-및-실전-예제)
10. [전용 벡터 DB와의 비교](#10-전용-벡터-db와의-비교)
11. [제한사항](#11-제한사항)
12. [운영 및 비용 최적화](#12-운영-및-비용-최적화)

---

## 1. 개요: Supabase의 AI/Vector 전략

### 1.1 핵심 철학

Supabase의 AI/Vector 전략은 단순하고 명확하다: **PostgreSQL을 벡터 데이터베이스로 만든다.**

별도의 전용 벡터 DB를 추가하는 대신, 이미 사용 중인 PostgreSQL에 `pgvector` 확장을 추가해서 임베딩을 관계형 데이터와 함께 저장한다. 이 접근법의 핵심 장점은:

- **단일 데이터베이스**: 벡터 데이터와 메타데이터를 JOIN으로 한 번에 조회
- **기존 인프라 활용**: 별도 벡터 DB 운영 비용/복잡도 없음
- **SQL로 모든 것**: 익숙한 SQL 문법으로 벡터 검색
- **RLS 자동 적용**: 벡터 검색에도 Row Level Security 적용
- **트랜잭션 일관성**: ACID 보장 범위 내에서 벡터 데이터 관리

### 1.2 Supabase AI Toolkit 구성요소

```
Supabase AI Toolkit
├── pgvector 확장 (PostgreSQL 내장)
│   ├── vector 데이터 타입
│   ├── IVFFlat 인덱스
│   └── HNSW 인덱스
│
├── Edge Functions (임베딩 생성)
│   ├── OpenAI API 연동
│   ├── Hugging Face 모델 실행
│   └── 자동 임베딩 (pgmq + pg_cron)
│
├── Supabase JS SDK
│   └── supabase.rpc('match_documents', ...) 패턴
│
└── Vecs (Python 클라이언트)
    ├── 컬렉션 관리
    ├── 어댑터 (Hugging Face 등)
    └── 일괄 처리 지원
```

### 1.3 버전 이력

| pgvector 버전 | 주요 추가 기능 | 출시 시점 |
|---------------|----------------|-----------|
| 0.4.x | 기본 벡터 타입 + L2/코사인/내적 | 2023 초 |
| 0.5.0 | HNSW 인덱스 추가 | 2023.09 |
| 0.7.0 | HNSW 병렬 인덱싱 | 2024.03 |
| 0.8.x | 성능 개선, sparse vector 지원 | 2024-2025 |

---

## 2. pgvector 확장 심층 분석

### 2.1 설치 및 활성화

```sql
-- Supabase에서는 대시보드 > Database > Extensions에서 활성화
-- 또는 SQL로:
CREATE EXTENSION IF NOT EXISTS vector;

-- 설치 확인
SELECT * FROM pg_extension WHERE extname = 'vector';
```

### 2.2 vector 데이터 타입

```sql
-- 벡터 컬럼 생성 (차원 수 고정 필요)
CREATE TABLE documents (
  id          BIGSERIAL PRIMARY KEY,
  content     TEXT NOT NULL,
  metadata    JSONB,
  embedding   VECTOR(1536),  -- OpenAI text-embedding-ada-002 차원
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 다양한 임베딩 차원 예시
-- OpenAI text-embedding-ada-002: 1536차원
-- OpenAI text-embedding-3-small: 1536차원 (기본) / 256~1536차원 (축소 가능)
-- OpenAI text-embedding-3-large: 3072차원
-- Hugging Face all-MiniLM-L6-v2: 384차원
-- Cohere embed-multilingual-v3.0: 1024차원
-- Google text-embedding-004: 768차원

-- NULL 허용 (임베딩 생성 전 행을 먼저 삽입하는 경우)
ALTER TABLE documents ADD COLUMN embedding VECTOR(1536);
```

### 2.3 벡터 데이터 삽입

```sql
-- 직접 삽입 (주로 테스트용)
INSERT INTO documents (content, embedding)
VALUES (
  '안녕하세요, 반갑습니다.',
  '[0.1, 0.2, 0.3, ...]'::vector  -- 1536개 값
);

-- JavaScript에서 삽입
const { error } = await supabase.from('documents').insert({
  content: '안녕하세요, 반갑습니다.',
  embedding: embeddingArray,  // number[] 타입
  metadata: { source: 'user-input', language: 'ko' }
})
```

### 2.4 벡터 연산자 전체 목록

```sql
-- 거리 연산자
SELECT
  content,
  embedding <-> '[0.1, 0.2, ...]'  AS l2_distance,      -- L2 (유클리드)
  embedding <=> '[0.1, 0.2, ...]'  AS cosine_distance,   -- 코사인 거리
  embedding <#> '[0.1, 0.2, ...]'  AS neg_inner_product  -- 내적 (음수)
FROM documents;

-- 유사도 함수 (거리와 반대: 클수록 유사)
SELECT
  content,
  1 - (embedding <=> query_vector) AS cosine_similarity,
  (embedding <#> query_vector) * -1 AS inner_product_similarity
FROM documents;

-- 평균 벡터 계산
SELECT AVG(embedding) FROM documents;

-- 벡터 차원 확인
SELECT vector_dims(embedding) FROM documents LIMIT 1;

-- 벡터 L2 노름 (크기)
SELECT vector_norm(embedding) FROM documents LIMIT 1;
```

### 2.5 희소 벡터 (Sparse Vector) - pgvector 0.7+

```sql
-- BM25 등 sparse 임베딩을 위한 sparsevec 타입
CREATE TABLE sparse_docs (
  id      BIGSERIAL PRIMARY KEY,
  content TEXT,
  -- 최대 30,000개 차원 중 실제 사용된 차원만 저장
  sparse_embedding SPARSEVEC(30000)
);

-- 희소 벡터 삽입 ({index:value, ...}/dimensions 형식)
INSERT INTO sparse_docs (content, sparse_embedding)
VALUES (
  '검색 문서',
  '{1:0.5, 4:0.3, 100:0.8}/30000'::sparsevec
);
```

---

## 3. 임베딩 생성 파이프라인

### 3.1 Edge Functions를 통한 임베딩 생성

```typescript
// supabase/functions/generate-embedding/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const { text } = await req.json()

  // OpenAI API로 임베딩 생성
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
      encoding_format: 'float',
    }),
  })

  const { data } = await response.json()
  const embedding = data[0].embedding  // number[1536]

  return new Response(
    JSON.stringify({ embedding }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
```

### 3.2 자동 임베딩 (Automatic Embeddings)

Supabase는 데이터 삽입/업데이트 시 자동으로 임베딩을 생성하는 파이프라인을 제공한다. 이 패턴은 `pgmq` (메시지 큐) + `pg_net` (HTTP 요청) + `pg_cron` (스케줄러)을 조합한다.

```sql
-- 1. pgmq로 임베딩 큐 생성
SELECT pgmq.create('embedding_jobs');

-- 2. 새 문서 삽입 시 자동으로 큐에 작업 추가하는 트리거
CREATE OR REPLACE FUNCTION queue_embedding_job()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pgmq.send(
    'embedding_jobs',
    jsonb_build_object(
      'id', NEW.id,
      'content', NEW.content,
      'table', TG_TABLE_NAME
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER documents_embedding_trigger
AFTER INSERT OR UPDATE OF content ON documents
FOR EACH ROW EXECUTE FUNCTION queue_embedding_job();

-- 3. pg_cron으로 주기적으로 큐를 처리
SELECT cron.schedule(
  'process-embedding-queue',
  '*/10 * * * * *',  -- 10초마다
  $$
  SELECT net.http_post(
    url := 'https://[project-ref].supabase.co/functions/v1/process-embeddings',
    headers := '{"Authorization": "Bearer [service-role-key]"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

```typescript
// supabase/functions/process-embeddings/index.ts
// 큐에서 작업을 가져와 임베딩 생성 후 DB 업데이트
serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // 큐에서 배치로 작업 가져오기
  const { data: jobs } = await supabase.rpc('pgmq_read', {
    queue_name: 'embedding_jobs',
    vt: 30,   // 30초 visibility timeout
    qty: 10   // 한 번에 10개 처리
  })

  if (!jobs || jobs.length === 0) {
    return new Response('No jobs', { status: 200 })
  }

  for (const job of jobs) {
    const { id, content, table } = job.message

    // 임베딩 생성
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: content,
      }),
    })
    const { data } = await response.json()
    const embedding = data[0].embedding

    // DB 업데이트
    await supabase
      .from(table)
      .update({ embedding })
      .eq('id', id)

    // 큐에서 작업 삭제
    await supabase.rpc('pgmq_delete', {
      queue_name: 'embedding_jobs',
      msg_id: job.msg_id
    })
  }

  return new Response(`Processed ${jobs.length} jobs`, { status: 200 })
})
```

### 3.3 Hugging Face 모델을 Edge Function에서 실행

```typescript
// supabase/functions/embed-local/index.ts
// Deno + Transformers.js로 로컬 모델 실행 (API 비용 없음)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.6.0'

// 첫 실행 시 모델 다운로드 (이후 캐싱)
const extractor = await pipeline(
  'feature-extraction',
  'Supabase/gte-small'  // 384차원, 다국어 지원
)

serve(async (req) => {
  const { texts } = await req.json()

  const output = await extractor(texts, {
    pooling: 'mean',
    normalize: true
  })

  return new Response(
    JSON.stringify({ embeddings: output.tolist() }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
```

### 3.4 배치 임베딩 처리

```typescript
// 대량 문서 처리 시 배치 처리 (비용 최적화)
async function batchEmbedDocuments(documents: string[]) {
  const BATCH_SIZE = 100  // OpenAI API 배치 크기 한계
  const embeddings: number[][] = []

  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    const batch = documents.slice(i, i + BATCH_SIZE)

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: batch,
      }),
    })

    const { data } = await response.json()
    embeddings.push(...data.map((d: any) => d.embedding))

    // Rate limit 방지
    if (i + BATCH_SIZE < documents.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  return embeddings
}
```

---

## 4. 벡터 유사도 검색

### 4.1 세 가지 거리 함수 비교

| 연산자 | 함수명 | 범위 | 의미 | 언제 사용 |
|--------|--------|------|------|-----------|
| `<->` | L2 (유클리드) | 0~∞ | 벡터 공간의 직선 거리 | 크기(magnitude)가 중요한 경우 |
| `<=>` | 코사인 거리 | 0~2 | 벡터 방향의 각도 차이 | 정규화된 임베딩 (LLM 출력) |
| `<#>` | 내적 (음수) | -∞~0 | 방향 + 크기 모두 반영 | MIPS(최대 내적 검색) |

**실용적 선택 기준:**

```
OpenAI/Cohere/Voyage 임베딩
→ 이미 정규화됨 → <=> (코사인) 또는 <#> (내적) 사용
→ 코사인과 L2는 정규화된 벡터에서 동일한 결과 (수학적으로 등가)

Hugging Face 모델 (정규화 옵션)
→ normalize=True 설정 후 <=> 사용 권장

이미지 임베딩, 오디오 임베딩
→ 크기가 의미를 가질 수 있음 → <-> (L2) 검토

추천 시스템 (user/item 임베딩)
→ <#> (내적) — 실제 추천 점수는 내적으로 계산됨
```

### 4.2 기본 유사도 검색 SQL

```sql
-- 코사인 유사도 기반 검색 (가장 일반적)
SELECT
  id,
  content,
  metadata,
  1 - (embedding <=> '[0.1, 0.2, ...]'::vector) AS similarity
FROM documents
ORDER BY embedding <=> '[0.1, 0.2, ...]'::vector
LIMIT 10;

-- threshold 적용 (일정 유사도 이상만)
SELECT
  id,
  content,
  1 - (embedding <=> query_embedding) AS similarity
FROM documents
WHERE 1 - (embedding <=> query_embedding) > 0.7  -- 70% 이상 유사
ORDER BY embedding <=> query_embedding
LIMIT 10;
```

### 4.3 Supabase RPC 함수 패턴

```sql
-- 재사용 가능한 검색 함수 생성
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding VECTOR(1536),
  match_count     INT DEFAULT 10,
  match_threshold FLOAT DEFAULT 0.7,
  filter          JSONB DEFAULT '{}'
)
RETURNS TABLE (
  id         BIGINT,
  content    TEXT,
  metadata   JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.content,
    d.metadata,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM documents d
  WHERE
    -- JSONB 필터 적용 (metadata 기반 필터링)
    (filter = '{}' OR d.metadata @> filter)
    AND 1 - (d.embedding <=> query_embedding) > match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

```typescript
// JavaScript에서 RPC 호출
const { data: matches, error } = await supabase.rpc('match_documents', {
  query_embedding: queryEmbedding,
  match_count: 5,
  match_threshold: 0.78,
  filter: { source: 'product-manual', language: 'ko' }
})
```

### 4.4 하이브리드 검색 (벡터 + 키워드)

```sql
-- RRF (Reciprocal Rank Fusion) 기반 하이브리드 검색
CREATE OR REPLACE FUNCTION hybrid_search(
  query_text      TEXT,
  query_embedding VECTOR(1536),
  match_count     INT DEFAULT 10
)
RETURNS TABLE (
  id      BIGINT,
  content TEXT,
  score   FLOAT
)
LANGUAGE sql
AS $$
WITH
-- 벡터 검색 결과 (시맨틱)
vector_search AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY embedding <=> query_embedding) AS rank
  FROM documents
  ORDER BY embedding <=> query_embedding
  LIMIT 50
),
-- 전문 검색 결과 (키워드)
keyword_search AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      ORDER BY ts_rank_cd(
        to_tsvector('korean', content),
        plainto_tsquery('korean', query_text)
      ) DESC
    ) AS rank
  FROM documents
  WHERE to_tsvector('korean', content) @@ plainto_tsquery('korean', query_text)
  LIMIT 50
),
-- RRF 점수 계산 (k=60이 표준)
rrf AS (
  SELECT
    COALESCE(v.id, k.id) AS id,
    COALESCE(1.0 / (60 + v.rank), 0) +
    COALESCE(1.0 / (60 + k.rank), 0) AS score
  FROM vector_search v
  FULL OUTER JOIN keyword_search k USING (id)
)
SELECT
  d.id,
  d.content,
  r.score
FROM rrf r
JOIN documents d ON r.id = d.id
ORDER BY r.score DESC
LIMIT match_count;
$$;
```

### 4.5 RLS 적용 벡터 검색

```sql
-- RLS 정책이 있는 테이블에서 벡터 검색
-- RLS가 자동으로 적용됨 (사용자가 볼 수 있는 문서만 검색)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own documents"
ON documents FOR SELECT
USING (user_id = auth.uid() OR is_public = true);

-- 위 정책이 있으면 match_documents 함수도 자동으로 필터링됨
-- SECURITY INVOKER 함수는 호출자 권한으로 실행 (기본값)
-- SECURITY DEFINER 함수는 정의자 권한으로 실행 (RLS 우회 주의)
```

---

## 5. 인덱싱 전략: IVFFlat vs HNSW

### 5.1 인덱스 없는 경우 (Exact Search)

```sql
-- 인덱스 없이 검색: 전체 순차 스캔 (Sequential Scan)
-- 행 수에 비례하여 선형적으로 느려짐
-- 소규모 (< 10,000행): 무시할 수 있는 차이
-- 중규모 (10,000~100,000행): 허용 가능
-- 대규모 (> 100,000행): 심각한 성능 저하

-- 정확도: 100% (Exact NN)
-- 속도: O(n) — 느림
```

### 5.2 IVFFlat 인덱스

**원리:** Inverted File Flat (역파일 평면)

```
전체 벡터 공간
    │
    ├── 클러스터 1 (centroid 1 근방)
    │   ├── 벡터 A
    │   └── 벡터 B
    ├── 클러스터 2 (centroid 2 근방)
    │   ├── 벡터 C
    │   └── 벡터 D
    └── ...

검색 시: 쿼리와 가장 가까운 k개 클러스터만 탐색
```

**인덱스 생성:**

```sql
-- IVFFlat 인덱스 (코사인 거리용)
CREATE INDEX ON documents
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);  -- 클러스터 수 (lists)

-- L2 거리용
CREATE INDEX ON documents
USING ivfflat (embedding vector_l2_ops)
WITH (lists = 100);

-- 내적용
CREATE INDEX ON documents
USING ivfflat (embedding vector_ip_ops)
WITH (lists = 100);
```

**lists 파라미터 설정 가이드:**

```
일반적인 권장값:
- 행 수 < 100,000: lists = sqrt(행_수) 또는 100
- 행 수 100,000~1,000,000: lists = sqrt(행_수)
- 행 수 > 1,000,000: lists = 행_수 / 1000

예시:
- 10만 행: lists = 316 (sqrt(100000))
- 50만 행: lists = 707
- 100만 행: lists = 1000
```

**검색 시 probes 조정:**

```sql
-- 검색할 클러스터 수 (높을수록 정확도 증가, 속도 감소)
SET ivfflat.probes = 10;  -- 기본값: 1

-- 세션 수준 설정
SET LOCAL ivfflat.probes = 20;

-- 정확도 vs 속도 트레이드오프
-- probes = 1:   빠르지만 recall 낮음 (~70%)
-- probes = 10:  균형 (recall ~95%)
-- probes = 100: 느리지만 recall 높음 (~99%)
-- probes = lists: exact search와 동일
```

**IVFFlat 한계:**
- 인덱스 빌드 전에 모든 데이터가 있어야 함 (k-means 클러스터링 필요)
- 새 데이터 삽입 후 시간이 지나면 정확도 저하 → 주기적 재빌드 필요
- 빌드 속도 빠름, 메모리 사용량 적음

### 5.3 HNSW 인덱스 (권장)

**원리:** Hierarchical Navigable Small World (계층적 소세계 그래프)

```
레이어 2 (희소):  노드 1 ——— 노드 5
                              │
레이어 1 (중간):  노드 1 — 노드 3 — 노드 5 — 노드 8
                              │
레이어 0 (밀집):  모든 노드 + 최근접 이웃 연결
```

검색: 상위 레이어에서 시작하여 점진적으로 하위 레이어로 내려가며 최근접 이웃 탐색

**인덱스 생성:**

```sql
-- HNSW 인덱스 (코사인 거리 — 가장 일반적)
CREATE INDEX ON documents
USING hnsw (embedding vector_cosine_ops)
WITH (
  m = 16,             -- 노드당 최대 연결 수 (기본: 16, 권장: 12~48)
  ef_construction = 64  -- 빌드 시 후보 크기 (기본: 64, 권장: 64~200)
);

-- L2 거리용
CREATE INDEX ON documents
USING hnsw (embedding vector_l2_ops)
WITH (m = 16, ef_construction = 64);
```

**파라미터 가이드:**

```
m (Maximum Connections):
- 기본값: 16
- 낮은 값 (5~12): 메모리 절약, 빌드 빠름, recall 다소 낮음
- 높은 값 (24~48): 높은 recall, 메모리 사용 증가
- 권장: 16~32 (대부분의 경우)

ef_construction:
- 기본값: 64
- 낮은 값: 빌드 빠름, 그래프 품질 낮음
- 높은 값 (100~200): 높은 품질의 그래프, 빌드 느림
- 권장: 64~128

ef_search (검색 시 조정):
SET hnsw.ef_search = 40;  -- 기본값: 40, 범위: 1~1000
-- 높을수록 recall 증가, 검색 속도 감소
-- 세션/트랜잭션 수준 설정 가능
```

**HNSW 장점:**
- 데이터 추가 후에도 정확도 유지 (동적 그래프 업데이트)
- 재빌드 불필요
- 대부분의 경우 IVFFlat보다 높은 검색 성능 (QPS)
- 튜닝 포인트 적음

### 5.4 성능 비교

| 항목 | IVFFlat | HNSW |
|------|---------|------|
| 빌드 시간 | 빠름 (128초/1M) | 느림 (4065초/1M, 32배↑) |
| 메모리 사용 | 적음 O(n*d) | 많음 O(n*m*d) |
| 검색 속도 | 낮음 (2.6 QPS @ 99% recall) | 높음 (40.5 QPS @ 99% recall) |
| 동적 업데이트 | 취약 (재빌드 필요) | 강함 (증분 업데이트) |
| 파라미터 튜닝 | 복잡 (lists, probes) | 간단 (m, ef_construction) |
| 권장 규모 | 대용량 정적 데이터 | 대부분의 경우 |

**결론:** 특수한 경우(매우 큰 정적 데이터셋, 메모리 제약)가 아니라면 **HNSW를 기본 선택**으로 사용하라.

### 5.5 인덱스 빌드 중 성능

```sql
-- HNSW 빌드는 오래 걸릴 수 있음 (병렬 처리 활용)
-- 빌드 시 maintenance_work_mem 크게 설정
SET maintenance_work_mem = '4GB';

-- 병렬 빌드 (pgvector 0.7+)
SET max_parallel_maintenance_workers = 4;

-- 빌드 진행 상황 모니터링
SELECT
  phase,
  blocks_done,
  blocks_total,
  tuples_done,
  tuples_total
FROM pg_stat_progress_create_index
WHERE relid = 'documents'::regclass;
```

---

## 6. RAG (Retrieval Augmented Generation)

### 6.1 RAG 패턴 개요

```
사용자 질문
    │
    ▼
[1. 질문 임베딩 생성]
    │ OpenAI/Hugging Face API
    ▼
[2. 유사 문서 검색]
    │ pgvector 유사도 검색
    ▼
[3. 컨텍스트 구성]
    │ 검색된 문서를 프롬프트에 포함
    ▼
[4. LLM 생성]
    │ OpenAI GPT / Anthropic Claude 등
    ▼
최종 답변 (근거 문서 포함)
```

### 6.2 완전한 RAG 구현 예시

```sql
-- 문서 저장 테이블
CREATE TABLE knowledge_base (
  id           BIGSERIAL PRIMARY KEY,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  source_url   TEXT,
  chunk_index  INTEGER,    -- 긴 문서를 청크로 나눈 경우
  embedding    VECTOR(1536),
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW 인덱스
CREATE INDEX ON knowledge_base
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 검색 함수
CREATE OR REPLACE FUNCTION search_knowledge(
  query_embedding VECTOR(1536),
  match_count     INT DEFAULT 5,
  min_similarity  FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id         BIGINT,
  title      TEXT,
  content    TEXT,
  source_url TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.title,
    kb.content,
    kb.source_url,
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM knowledge_base kb
  WHERE 1 - (kb.embedding <=> query_embedding) > min_similarity
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

```typescript
// Next.js API Route: /api/chat
// app/api/chat/route.ts
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // 서버에서만 사용
)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: Request) {
  const { question } = await req.json()

  // 1단계: 질문 임베딩 생성
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: question,
  })
  const queryEmbedding = embeddingResponse.data[0].embedding

  // 2단계: 유사 문서 검색
  const { data: relevantDocs, error } = await supabase.rpc('search_knowledge', {
    query_embedding: queryEmbedding,
    match_count: 5,
    min_similarity: 0.7,
  })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  // 3단계: 컨텍스트 구성
  const context = relevantDocs
    .map((doc: any) => `[출처: ${doc.title}]\n${doc.content}`)
    .join('\n\n---\n\n')

  // 4단계: LLM으로 답변 생성
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `당신은 도움이 되는 AI 어시스턴트입니다.
주어진 컨텍스트를 기반으로 질문에 답변하세요.
컨텍스트에 없는 내용은 모른다고 말하세요.

컨텍스트:
${context}`
      },
      {
        role: 'user',
        content: question
      }
    ],
    stream: true,  // 스트리밍 응답
  })

  // 스트리밍 응답 반환
  const stream = new ReadableStream({
    async start(controller) {
      for await (const chunk of completion) {
        const text = chunk.choices[0]?.delta?.content || ''
        controller.enqueue(new TextEncoder().encode(text))
      }
      controller.close()
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Sources': JSON.stringify(relevantDocs.map((d: any) => ({
        id: d.id,
        title: d.title,
        url: d.source_url,
        similarity: d.similarity
      })))
    }
  })
}
```

### 6.3 문서 청킹 전략

```typescript
// 긴 문서를 청크로 나누기
function chunkDocument(text: string, chunkSize = 800, overlap = 100): string[] {
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    chunks.push(text.slice(start, end))
    start += chunkSize - overlap  // 오버랩으로 문맥 연속성 유지
  }

  return chunks
}

// 문서 수집 및 청킹 후 DB 저장
async function indexDocument(title: string, content: string, sourceUrl: string) {
  const chunks = chunkDocument(content, 800, 100)

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]

    // 임베딩 생성
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: chunk,
    })

    await supabase.from('knowledge_base').insert({
      title: `${title} (청크 ${i + 1}/${chunks.length})`,
      content: chunk,
      source_url: sourceUrl,
      chunk_index: i,
      embedding: embeddingResponse.data[0].embedding,
      metadata: { original_title: title, total_chunks: chunks.length }
    })
  }
}
```

### 6.4 권한 기반 RAG

```sql
-- 사용자별 접근 권한이 있는 문서 RAG
-- RLS로 자동 필터링

ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

-- 공개 문서 또는 자신의 문서만 검색 가능
CREATE POLICY "accessible documents"
ON knowledge_base FOR SELECT
USING (
  is_public = true
  OR owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM document_permissions
    WHERE document_id = knowledge_base.id
    AND user_id = auth.uid()
  )
);
```

---

## 7. Supabase AI 통합

### 7.1 지원 AI 제공업체

```
Supabase Edge Functions에서 직접 호출 가능한 AI 서비스:

텍스트 임베딩:
├── OpenAI (text-embedding-3-small, text-embedding-3-large)
├── Cohere (embed-multilingual-v3.0)
├── Hugging Face (다양한 모델)
├── Google (text-embedding-004)
└── Anthropic (claude를 통한 간접 임베딩)

LLM (생성):
├── OpenAI GPT-4o, GPT-4o-mini
├── Anthropic Claude 3.5 Sonnet
├── Google Gemini
└── Groq (고속 추론)

로컬 모델 (Edge Functions 내):
└── Transformers.js (Hugging Face 모델을 Deno에서 실행)
    ├── Supabase/gte-small (384차원)
    ├── sentence-transformers/all-MiniLM-L6-v2 (384차원)
    └── BAAI/bge-small-en-v1.5 (384차원)
```

### 7.2 Hugging Face 통합 예시

```typescript
// Hugging Face Inference API 사용
serve(async (req) => {
  const { text } = await req.json()

  const response = await fetch(
    'https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('HUGGINGFACE_ACCESS_TOKEN')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: text,
        options: { wait_for_model: true }
      })
    }
  )

  const embedding = await response.json()
  // HF 출력은 배열의 배열 형태: [[0.1, 0.2, ...]]
  const vector = Array.isArray(embedding[0]) ? embedding[0] : embedding

  return new Response(JSON.stringify({ embedding: vector }))
})
```

### 7.3 LangChain 통합

```typescript
// LangChain + Supabase Vector Store
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase"
import { OpenAIEmbeddings } from "@langchain/openai"
import { createClient } from "@supabase/supabase-js"

const supabaseClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 벡터 스토어 초기화
const vectorStore = new SupabaseVectorStore(
  new OpenAIEmbeddings({
    model: 'text-embedding-3-small'
  }),
  {
    client: supabaseClient,
    tableName: 'documents',
    queryName: 'match_documents',  // RPC 함수명
    filter: { source: 'product-docs' }  // 메타데이터 필터
  }
)

// 문서 추가
await vectorStore.addDocuments([
  { pageContent: '내용 1', metadata: { source: 'product-docs' } },
  { pageContent: '내용 2', metadata: { source: 'product-docs' } },
])

// 유사도 검색
const results = await vectorStore.similaritySearch('질문 텍스트', 5)

// RAG 체인 구성
import { RetrievalQAChain } from "langchain/chains"
import { ChatOpenAI } from "@langchain/openai"

const chain = RetrievalQAChain.fromLLM(
  new ChatOpenAI({ model: 'gpt-4o-mini' }),
  vectorStore.asRetriever({ k: 5 })
)

const response = await chain.invoke({ query: '제품 반품 정책은?' })
```

### 7.4 Vercel AI SDK 통합

```typescript
// app/api/chat/route.ts (Vercel AI SDK + Supabase)
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'

export async function POST(req: Request) {
  const { messages } = await req.json()
  const lastMessage = messages[messages.length - 1].content

  // 임베딩 생성 및 벡터 검색
  const embedding = await generateEmbedding(lastMessage)
  const { data: docs } = await supabase.rpc('match_documents', {
    query_embedding: embedding,
    match_count: 3
  })

  const context = docs?.map((d: any) => d.content).join('\n\n') ?? ''

  const result = streamText({
    model: openai('gpt-4o-mini'),
    system: `다음 컨텍스트를 바탕으로 답변하세요:\n\n${context}`,
    messages,
  })

  return result.toDataStreamResponse()
}
```

---

## 8. Vecs: Python 클라이언트 라이브러리

### 8.1 설치 및 기본 사용

```bash
pip install vecs
# Hugging Face 어댑터 포함
pip install vecs "vecs[text_embedding]"
```

```python
import vecs

# 연결 (PostgreSQL 연결 문자열)
DB_CONNECTION = "postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres"
vx = vecs.create_client(DB_CONNECTION)

# 컬렉션 생성 (차원 수 지정)
docs = vx.get_or_create_collection(
    name="documents",
    dimension=1536
)

# 벡터 삽입
docs.upsert(
    records=[
        ("doc-1", [0.1, 0.2, ...], {"source": "manual", "page": 1}),
        ("doc-2", [0.3, 0.4, ...], {"source": "manual", "page": 2}),
    ]
)

# 인덱스 생성
docs.create_index(
    method=vecs.IndexMethod.hnsw,
    measure=vecs.IndexMeasure.cosine_distance,
    index_arguments=vecs.IndexArgsHNSW(
        m=16,
        ef_construction=64
    )
)

# 검색
results = docs.query(
    data=[0.1, 0.2, ...],
    limit=5,
    filters={"source": {"$eq": "manual"}},
    measure="cosine_distance",
    include_value=True,
    include_metadata=True
)
```

### 8.2 Vecs 어댑터 (Adapters)

```python
from vecs.adapter import Adapter, ParagraphSplitter, TextEmbedding

# 텍스트 → 청킹 → 임베딩 파이프라인 자동화
docs = vx.get_or_create_collection(
    name="documents",
    dimension=384,  # all-MiniLM-L6-v2 차원
    adapter=Adapter(
        [
            ParagraphSplitter(skip_during_query=True),  # 쿼리 시 청킹 스킵
            TextEmbedding(model='all-MiniLM-L6-v2'),    # HF 모델 자동 사용
        ]
    )
)

# 텍스트를 직접 전달 (임베딩 자동 생성)
docs.upsert(
    records=[
        ("doc-1", "긴 텍스트 내용...", {"title": "문서 1"}),
        ("doc-2", "다른 긴 텍스트...", {"title": "문서 2"}),
    ]
)

# 텍스트로 바로 검색 (임베딩 자동 생성)
results = docs.query(
    data="검색 질문",
    limit=5
)
```

### 8.3 Vecs 고급 필터

```python
# 메타데이터 필터 연산자
results = docs.query(
    data=query_vector,
    limit=5,
    filters={
        # 동등 비교
        "source": {"$eq": "manual"},
        # 범위 비교
        "page": {"$gt": 5, "$lte": 20},
        # 포함 여부
        "category": {"$in": ["tech", "science"]},
        # 복합 조건
        "$and": [
            {"source": {"$eq": "manual"}},
            {"language": {"$eq": "ko"}}
        ]
    }
)
```

---

## 9. 사용 패턴 및 실전 예제

### 9.1 시맨틱 검색 엔진

```typescript
// 쇼핑몰 상품 시맨틱 검색
export async function semanticProductSearch(query: string) {
  // 검색어 임베딩
  const embedding = await generateEmbedding(query)

  // 벡터 검색 + 메타데이터 필터
  const { data } = await supabase.rpc('match_products', {
    query_embedding: embedding,
    match_count: 20,
    filter: {
      in_stock: true,
      category: 'electronics'
    }
  })

  return data
}

// SQL 함수
-- CREATE OR REPLACE FUNCTION match_products(
--   query_embedding VECTOR(1536),
--   match_count INT,
--   filter JSONB
-- ) ...
```

### 9.2 추천 시스템

```sql
-- 사용자 행동 기반 아이템 추천
-- 1. 사용자가 본 상품들의 임베딩 평균 계산
WITH user_profile AS (
  SELECT AVG(p.embedding) AS user_embedding
  FROM user_views uv
  JOIN products p ON p.id = uv.product_id
  WHERE uv.user_id = $1
  AND uv.viewed_at > NOW() - INTERVAL '7 days'
)
-- 2. 유사한 상품 추천 (이미 본 상품 제외)
SELECT
  p.id,
  p.name,
  p.price,
  1 - (p.embedding <=> up.user_embedding) AS relevance_score
FROM products p, user_profile up
WHERE p.id NOT IN (
  SELECT product_id FROM user_views WHERE user_id = $1
)
ORDER BY p.embedding <=> up.user_embedding
LIMIT 10;
```

### 9.3 문서 Q&A 챗봇

```typescript
// 사내 문서 Q&A 시스템
// PDF → 텍스트 추출 → 청킹 → 임베딩 → DB 저장
async function indexPDF(pdfBuffer: Buffer, title: string) {
  // PDF 텍스트 추출 (서버사이드)
  const text = await extractTextFromPDF(pdfBuffer)
  const chunks = chunkDocument(text, 800, 100)

  // 배치 임베딩 생성
  const embeddings = await batchEmbedDocuments(chunks)

  // DB 저장
  const records = chunks.map((chunk, i) => ({
    title: `${title} - 청크 ${i + 1}`,
    content: chunk,
    chunk_index: i,
    embedding: embeddings[i],
    metadata: { source_type: 'pdf', original_title: title }
  }))

  await supabase.from('knowledge_base').insert(records)
}
```

### 9.4 이미지 검색

```typescript
// CLIP 모델로 이미지 임베딩 생성 후 텍스트-이미지 교차 검색
// (멀티모달 임베딩)

// 이미지 저장 시 CLIP 임베딩 생성
async function indexImage(imageUrl: string, description: string) {
  const clipEmbedding = await generateCLIPEmbedding(imageUrl)  // 512차원

  await supabase.from('images').insert({
    url: imageUrl,
    description,
    embedding: clipEmbedding,  // VECTOR(512)
  })
}

// 텍스트로 이미지 검색 (CLIP의 텍스트 임베딩 사용)
async function searchImagesByText(query: string) {
  const textEmbedding = await generateCLIPTextEmbedding(query)  // 512차원

  const { data } = await supabase.rpc('match_images', {
    query_embedding: textEmbedding,
    match_count: 10
  })

  return data
}
```

### 9.5 이상 탐지 (Anomaly Detection)

```sql
-- 최근 로그 엔트리 중 이상한 패턴 탐지
-- 정상 로그들의 평균과 거리가 먼 항목 찾기

WITH normal_baseline AS (
  SELECT AVG(embedding) AS avg_embedding
  FROM logs
  WHERE
    log_level = 'INFO'
    AND created_at > NOW() - INTERVAL '24 hours'
)
SELECT
  l.id,
  l.message,
  l.log_level,
  l.created_at,
  l.embedding <-> nb.avg_embedding AS anomaly_score
FROM logs l, normal_baseline nb
WHERE
  l.created_at > NOW() - INTERVAL '1 hour'
  AND l.embedding <-> nb.avg_embedding > 1.5  -- 임계값
ORDER BY anomaly_score DESC
LIMIT 20;
```

---

## 10. 전용 벡터 DB와의 비교

### 10.1 경쟁 솔루션 비교표

| 항목 | Supabase/pgvector | Pinecone | Weaviate | Qdrant |
|------|-------------------|----------|----------|--------|
| **기반** | PostgreSQL + pgvector | 전용 벡터 DB | 전용 벡터 DB | 전용 벡터 DB |
| **운영 방식** | 관리형 Postgres | 완전 관리형 | 자체 호스팅 / 클라우드 | 자체 호스팅 / 클라우드 |
| **SQL 지원** | 완전한 SQL | 없음 | GraphQL / REST | REST / gRPC |
| **관계형 데이터** | JOIN 가능 | 불가 | 부분적 | 불가 |
| **RLS/권한** | PostgreSQL RLS | 네임스페이스 기반 | 클래스 기반 | 컬렉션 기반 |
| **최대 규모** | ~수천만 벡터 (pgvector) | 수억 이상 | 수억 이상 | 수억 이상 |
| **검색 속도** | 보통 (대규모 시 느림) | 빠름 | 빠름 | 매우 빠름 |
| **하이브리드 검색** | 수동 구현 필요 | 메타데이터 필터 | 기본 내장 | 페이로드 필터 |
| **가격** | Supabase 플랜 포함 | 사용량 기반 (비쌈) | 자체 호스팅 시 무료 | 자체 호스팅 시 무료 |
| **운영 복잡도** | 낮음 (Supabase가 관리) | 낮음 | 중간 | 중간 |

### 10.2 pgvector 선택 시 장점

```
✅ 장점

1. 기존 Postgres 인프라 재활용
   - 새 서비스 추가 없이 확장 가능
   - 운영 복잡도 미증가

2. 관계형 데이터와의 JOIN
   SELECT p.name, 1-(p.embedding <=> $1) AS similarity
   FROM products p
   JOIN categories c ON p.category_id = c.id
   WHERE c.name = 'electronics'
   이런 쿼리가 전용 벡터 DB에서는 불가능

3. ACID 트랜잭션
   BEGIN;
   INSERT INTO documents (content) VALUES ('...');
   UPDATE documents SET embedding = $1 WHERE id = lastval();
   COMMIT;
   벡터 + 메타데이터가 원자적으로 업데이트됨

4. 비용
   - Supabase Pro 플랜에 포함
   - 별도 Pinecone 비용 없음 (대규모 시 수백~수천 달러/월 절약 가능)

5. 익숙한 SQL
   - 기존 팀의 SQL 지식 활용
   - ORM(Prisma, Drizzle 등)과 호환
```

### 10.3 전용 벡터 DB 선택 시 장점

```
✅ 전용 벡터 DB가 유리한 경우

1. 초대규모 (1억 이상 벡터)
   - pgvector는 수천만 벡터 이상에서 성능 저하
   - Pinecone/Qdrant는 수억 벡터도 일관된 성능

2. 매우 낮은 지연시간 요구 (< 10ms P99)
   - 전용 벡터 DB는 벡터 검색에 최적화된 스토리지 엔진
   - pgvector는 범용 Postgres 위에 구현

3. 다차원 메타데이터 필터링
   - Weaviate: 스키마 기반 강력한 필터
   - Qdrant: 페이로드 필터링 성능 우수

4. 실시간 대규모 업데이트
   - IVFFlat 재빌드 없이 수백만 벡터 동적 업데이트

5. 팀이 SQL을 모르는 경우
   - Pinecone API는 단순하고 직관적
```

### 10.4 결정 기준 플로우차트

```
벡터 데이터가 < 1,000만 행?
    YES → pgvector/Supabase 충분
    NO  →
        기존 Postgres 데이터와 JOIN 필요?
            YES → pgvectorscale 검토 또는 pgvector 유지
            NO  → 전용 벡터 DB 검토 (Qdrant 또는 Pinecone)

비용 민감?
    YES → pgvector (Supabase 플랜에 포함)
    NO  → Pinecone (운영 간편) 또는 Qdrant (고성능)

팀의 인프라 운영 역량?
    있음 → Qdrant 자체 호스팅
    없음 → Pinecone 또는 Supabase pgvector
```

---

## 11. 제한사항

### 11.1 벡터 차원 제한

```
pgvector 최대 차원 수:
- 저장: 16,000차원 (버전 0.5 이상)
- HNSW 인덱스: 2,000차원 이하 권장 (이상은 빌드 시간 극증)
- IVFFlat 인덱스: 차원 제한 없음 (성능 저하는 있음)

실용적 차원 수:
- text-embedding-3-small: 256~1536차원 (1536이 기본)
- 고성능 필요 시: 256~512차원으로 축소 가능 (정확도 약간 감소)
```

### 11.2 인덱스 크기 및 메모리

```
HNSW 메모리 계산:
메모리 ≈ n_vectors × m × (4 bytes per float + 8 bytes for links)

예시:
- 100만 벡터 × 1536차원 × m=16
  = 약 96GB 메모리 (매우 큼)

실용적 최대치:
- 10만 벡터 × 1536차원: ~9.6GB
- 10만 벡터 × 384차원: ~2.4GB (소형 모델 사용 시)

권장:
- Supabase Pro: 1GB RAM → 최대 ~5만 벡터 (1536차원) 인덱스 가능
- Supabase Team: 8GB RAM → ~40만 벡터
- 대용량 시: 차원 축소 또는 IVFFlat 사용 (메모리 효율적)
```

### 11.3 검색 성능 한계

```
pgvector 성능 (HNSW, 1536차원, m=16, ef_search=40):
- 1만 벡터: ~1ms
- 10만 벡터: ~5ms
- 100만 벡터: ~20ms
- 1000만 벡터: ~100ms+

비교 (Pinecone):
- 1000만 벡터: ~5ms (5~20배 빠름)

결론: 수백만 이상의 벡터 + 낮은 지연시간이 모두 필요하면
      pgvector의 한계에 도달할 수 있음
```

### 11.4 기타 제한사항

```
1. 차원 변경 불가
   - 컬럼 생성 후 차원 수 변경 불가
   - 다른 임베딩 모델로 교체 시 컬럼 재생성 + 전체 재임베딩 필요

2. 인덱스 유형별 거리 함수 고정
   - HNSW vector_cosine_ops 인덱스는 <=> 연산자만 가속
   - <-> 사용 시 인덱스 미사용 (전체 스캔)
   - 여러 거리 함수가 필요하면 여러 인덱스 생성 필요

3. NULL 벡터 인덱스 제외
   - embedding IS NULL인 행은 인덱스에 포함되지 않음
   - 인덱스 생성 전 NULL 처리 필요

4. 병렬 쿼리 미지원 (일부 버전)
   - 단일 벡터 검색 쿼리는 단일 CPU 코어만 사용
   - 여러 동시 쿼리로 병렬성 확보 권장
```

---

## 12. 운영 및 비용 최적화

### 12.1 인덱스 관리

```sql
-- 인덱스 현황 조회
SELECT
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  idx_scan,
  idx_tup_read
FROM pg_stat_user_indexes
WHERE relname = 'documents';

-- HNSW 인덱스 재빌드 (파라미터 변경 시)
REINDEX INDEX CONCURRENTLY documents_embedding_hnsw_idx;

-- IVFFlat 인덱스 주기적 재빌드 (데이터 분포 변화 시)
-- 1. 새 인덱스 생성 (concurrent)
CREATE INDEX CONCURRENTLY documents_embedding_new_idx
ON documents USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 200);

-- 2. 기존 인덱스 삭제
DROP INDEX documents_embedding_old_idx;

-- 3. 새 인덱스 이름 변경
ALTER INDEX documents_embedding_new_idx
RENAME TO documents_embedding_idx;
```

### 12.2 임베딩 비용 최적화

```typescript
// 1. 캐싱: 동일한 텍스트의 임베딩 재사용
// Redis 또는 Supabase 자체 캐싱 활용
async function getCachedEmbedding(text: string): Promise<number[]> {
  const hash = crypto.createHash('sha256').update(text).digest('hex')

  // 캐시 확인
  const { data: cached } = await supabase
    .from('embedding_cache')
    .select('embedding')
    .eq('text_hash', hash)
    .single()

  if (cached) return cached.embedding

  // 새로 생성
  const embedding = await generateEmbedding(text)

  // 캐시 저장
  await supabase.from('embedding_cache').insert({
    text_hash: hash,
    embedding,
    created_at: new Date().toISOString()
  })

  return embedding
}

// 2. 차원 축소: text-embedding-3-small의 dimensions 파라미터 활용
// 1536 → 256차원으로 축소 (비용 동일, 저장 공간 6배 절약)
const response = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: text,
  dimensions: 256,  // 차원 축소 (성능 약간 감소)
})

// 3. 로컬 모델 사용 (무료, API 비용 없음)
// Supabase Edge Functions + Transformers.js
// text-embedding-3-small 대비 성능 90%이지만 비용 0

// 4. 배치 처리로 API 호출 최소화
const BATCH_SIZE = 100
for (let i = 0; i < docs.length; i += BATCH_SIZE) {
  const batch = docs.slice(i, i + BATCH_SIZE)
  // 100개를 한 번의 API 호출로 처리
  await batchEmbedDocuments(batch)
}
```

### 12.3 쿼리 성능 최적화

```sql
-- 1. EXPLAIN ANALYZE로 인덱스 사용 확인
EXPLAIN ANALYZE
SELECT id, content, embedding <=> $1 AS distance
FROM documents
ORDER BY embedding <=> $1
LIMIT 10;

-- 인덱스를 사용하는 경우:
-- "Index Scan using documents_embedding_hnsw_idx on documents"

-- 인덱스를 사용 안 하는 경우 (문제):
-- "Seq Scan on documents" — 인덱스/연산자 클래스 불일치 확인

-- 2. 분할 파티셔닝 (매우 큰 테이블)
CREATE TABLE documents_2024
PARTITION OF documents
FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

-- 각 파티션에 별도 인덱스
CREATE INDEX ON documents_2024
USING hnsw (embedding vector_cosine_ops);

-- 3. 부분 인덱스 (특정 조건 행만 인덱싱)
-- 공개 문서만 인덱스에 포함
CREATE INDEX documents_public_hnsw
ON documents USING hnsw (embedding vector_cosine_ops)
WHERE is_public = true;
```

### 12.4 스토리지 비용 최적화

```sql
-- 임베딩 저장 공간 계산
-- 1536차원 벡터 = 1536 × 4바이트 = 6,144바이트 = ~6KB
-- 100만 행 × 6KB = ~6GB

-- 차원 축소로 절약
-- 256차원 벡터 = 256 × 4바이트 = 1,024바이트 = ~1KB
-- 100만 행 × 1KB = ~1GB (6배 절약)

-- 사용 중인 벡터 스토리지 크기 확인
SELECT
  pg_size_pretty(SUM(pg_column_size(embedding))) AS total_embedding_size,
  COUNT(*) AS row_count
FROM documents;

-- 전체 테이블 크기
SELECT pg_size_pretty(pg_total_relation_size('documents'));
```

### 12.5 모니터링

```sql
-- 벡터 검색 쿼리 성능 모니터링
-- pg_stat_statements 활성화 필요
SELECT
  query,
  calls,
  total_exec_time / calls AS avg_ms,
  rows / calls AS avg_rows
FROM pg_stat_statements
WHERE query LIKE '%<=>%'
   OR query LIKE '%match_documents%'
ORDER BY avg_ms DESC
LIMIT 20;

-- 인덱스 효율 확인
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan AS index_scans,
  idx_tup_read AS tuples_read
FROM pg_stat_user_indexes
WHERE tablename = 'documents';
```

---

## 참고 자료

- [Supabase AI & Vectors 공식 문서](https://supabase.com/docs/guides/ai)
- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [pgvector: Embeddings and vector similarity](https://supabase.com/docs/guides/database/extensions/pgvector)
- [HNSW Indexes 문서](https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes)
- [Automatic Embeddings 블로그](https://supabase.com/blog/automatic-embeddings)
- [OpenAI 임베딩 + Postgres 저장](https://supabase.com/blog/openai-embeddings-postgres-vector)
- [Hugging Face Supabase 통합](https://supabase.com/blog/hugging-face-supabase)
- [Supabase Vector 모듈](https://supabase.com/modules/vector)
- [RAG with Permissions](https://supabase.com/docs/guides/ai/rag-with-permissions)
- [IVFFlat vs HNSW 비교 (AWS)](https://aws.amazon.com/blogs/database/optimize-generative-ai-applications-with-pgvector-indexing-a-deep-dive-into-ivfflat-and-hnsw-techniques/)
- [pgvector HNSW (Crunchy Data)](https://www.crunchydata.com/blog/hnsw-indexes-with-postgres-and-pgvector)
- [벡터 DB 비교 (Pinecone vs Qdrant vs pgvector)](https://getathenic.com/blog/pinecone-vs-weaviate-vs-qdrant-vs-pgvector)
