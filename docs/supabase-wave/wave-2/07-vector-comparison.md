# 벡터 DB 비교: Supabase Vector(pgvector) vs Pinecone vs Weaviate

> 작성일: 2026-04-06  
> 대상 독자: AI/RAG 파이프라인을 구축하는 개발자/아키텍트  
> 출처: 공식 문서, 벤치마크, 2025-2026 기술 리뷰 종합

---

## 목차

1. [개요](#1-개요)
2. [아키텍처](#2-아키텍처)
3. [인덱싱: HNSW / IVFFlat vs 독자 인덱스](#3-인덱싱)
4. [쿼리 성능: QPS, 리콜, 지연시간 벤치마크](#4-쿼리-성능)
5. [기능 비교: 하이브리드 검색, 필터링, 메타데이터, 멀티테넌시](#5-기능-비교)
6. [운영: 스케일링, 백업, 모니터링, 관리 복잡도](#6-운영)
7. [가격 비교](#7-가격-비교)
8. [의사결정 가이드](#8-의사결정-가이드)
9. [7항목 스코어링](#9-7항목-스코어링)
10. [결론](#10-결론)

---

## 1. 개요

벡터 데이터베이스는 LLM 기반 애플리케이션(RAG, 시맨틱 검색, 추천 시스템)의 핵심 인프라입니다. 고차원 임베딩 벡터를 저장하고 코사인 유사도 또는 유클리드 거리 기준으로 가장 가까운 이웃(Approximate Nearest Neighbor, ANN)을 빠르게 검색하는 것이 핵심 기능입니다.

| 항목 | pgvector (Supabase) | Pinecone | Weaviate |
|------|---------------------|----------|----------|
| 접근 방식 | PostgreSQL 확장 | 전용 벡터 DB (완전 관리형) | 오픈소스 하이브리드 벡터 DB |
| 라이선스 | PostgreSQL License (오픈소스) | 클로즈드 소스 (SaaS) | BSD-3 (오픈소스) |
| 배포 방식 | Supabase 관리형 또는 자체 PG | 완전 관리형 SaaS | 자체 호스팅 또는 Weaviate Cloud |
| 핵심 강점 | SQL 통합, 트랜잭션, 비용 | 완전 관리형, 엔터프라이즈 성능 | 하이브리드 검색, 멀티테넌시 |
| 주요 약점 | 초대형 규모에서 성능 한계 | 벤더 종속, 고비용 | 운영 복잡도, 학습 곡선 |
| 최적 사용 사례 | 이미 PG 사용 중인 앱의 AI 기능 | AI-네이티브 프로덕션 앱 | 복잡한 하이브리드 검색 |

### 2025-2026 시장 변화: pgvector의 재평가

2025년 이전에는 "pgvector는 100만 벡터 이하에서만 사용하고, 그 이상은 Pinecone으로 이동"하는 것이 업계 통념이었습니다. 그러나 **pgvectorscale**(Timescale이 개발한 PG 확장)의 등장과 pgvector 자체의 지속적인 성능 개선으로 이 기준이 크게 달라졌습니다:

- pgvector 0.7.0 + HNSW + 이진 양자화(Binary Quantization): 5천만 벡터에서 99% 리콜로 **471 QPS** 달성
- 이는 Qdrant 대비 11.4배 높은 처리량으로, Pinecone Serverless와 경쟁 가능한 수준
- 인덱스 빌드 시간: pgvector 0.7.0에서 최초 HNSW 릴리스(0.5.0) 대비 **150배 단축**

---

## 2. 아키텍처

### 2.1 pgvector: PostgreSQL 확장 모델

pgvector는 PostgreSQL 데이터베이스에 벡터 연산 능력을 추가하는 **확장 모듈**입니다. 별도의 서비스가 아니라, 기존 PostgreSQL 인스턴스에 설치하여 사용합니다.

#### 아키텍처 다이어그램

```
애플리케이션
     ↓
PostgreSQL 인스턴스
  ├── 일반 테이블 (TEXT, INT, JSONB 등)
  ├── vector 타입 컬럼 (pgvector 추가)
  │     └── HNSW 또는 IVFFlat 인덱스
  ├── 전체 SQL 기능 (JOIN, 트랜잭션, RLS 등)
  └── 기존 인덱스 (B-tree, GIN 등)
```

#### 핵심 특성

**트랜잭션 무결성**: 벡터 삽입/업데이트/삭제가 동일 SQL 트랜잭션 내에서 원자적으로 처리됩니다. "문서 메타데이터를 업데이트하면 임베딩도 같은 트랜잭션에서 업데이트" — 두 시스템 간 데이터 불일치가 구조적으로 불가능합니다.

**SQL 통합**: 벡터 검색 결과를 일반 SQL 조건과 JOIN으로 결합할 수 있습니다:

```sql
-- 특정 사용자의 문서 중 임베딩 유사도 상위 5개
SELECT d.title, d.content, 1 - (d.embedding <=> $1) AS similarity
FROM documents d
WHERE d.user_id = $2
  AND d.category = 'blog'
  AND d.created_at > NOW() - INTERVAL '30 days'
ORDER BY d.embedding <=> $1
LIMIT 5;
```

**데이터 정합성**: 벡터와 메타데이터가 같은 테이블에 존재하므로 외부 동기화 필요 없음.

#### pgvector의 제약

- **메모리 집약적**: HNSW 인덱스는 전체 그래프를 RAM에 올려야 최고 성능 발휘
- **병렬 인덱스 스캔 제한**: Postgres의 단일 인스턴스 구조상 수평 확장에 한계
- **차원 제한**: 기본 최대 2,000 차원 (설정 변경 시 더 높게 가능, 단 성능 저하)
- **대규모 업데이트 성능**: 수백만 건 벡터 업데이트 시 인덱스 재구성 비용 발생

---

### 2.2 Pinecone: 전용 벡터 DB (완전 관리형)

Pinecone은 **벡터 검색만을 위해 처음부터 설계된 전용 데이터베이스**입니다. SQL, 트랜잭션, JOIN은 지원하지 않으며, 오직 빠르고 확장 가능한 ANN 검색에 집중합니다.

#### 아키텍처 다이어그램

```
애플리케이션
     ↓
Pinecone API (REST/gRPC)
     ↓
Pinecone 서버리스 인프라
  ├── 인덱스 저장소 (분산 객체 스토리지)
  ├── 캐시 계층 (hot data)
  ├── 쿼리 처리기 (ANN 계산)
  └── 메타데이터 필터링 엔진
```

#### 인덱스 유형

**Serverless 인덱스** (2024년 출시, 현재 주력 제품):
- 분산 객체 스토리지(S3 유사) 기반
- 사용한 만큼만 지불 (write units + read units + storage)
- 콜드 스타트 지연 존재 (첫 쿼리 시 캐시 적재 필요)
- 인덱스 빌드/관리 불필요 (자동)

**Pod 기반 인덱스** (레거시, 일부 사용 사례):
- 전용 컴퓨트 리소스 예약
- 예측 가능한 성능
- 고정 월정액 비용

#### 핵심 특성

- **완전 관리형**: 인덱스 파라미터, 레플리케이션, 스케일링 자동
- **네임스페이스**: 하나의 인덱스 내에서 데이터를 논리적으로 분리 (멀티테넌시 유사)
- **메타데이터 필터링**: 벡터 검색 시 메타데이터 조건 동시 적용 가능
- **스파스+덴스 하이브리드**: Sparse-Dense 하이브리드 검색 지원

#### Pinecone의 제약

- SQL/JOIN/트랜잭션 없음 → 벡터 외 데이터는 별도 DB 필요
- 벤더 종속 (migrating out is difficult)
- Serverless는 리전 한정 (AWS us-east-1만 무료 티어)
- 스파스 벡터(BM25) 지원은 Pod 인덱스 한정 (2025 기준)

---

### 2.3 Weaviate: 오픈소스 하이브리드 벡터 DB

Weaviate는 **벡터 검색과 키워드(BM25) 검색을 네이티브로 결합**한 오픈소스 벡터 데이터베이스입니다. 자체 호스팅 또는 Weaviate Cloud(관리형 서비스) 중 선택할 수 있습니다.

#### 아키텍처 다이어그램

```
애플리케이션 (GraphQL / REST / gRPC)
     ↓
Weaviate 서버
  ├── HNSW 인덱스 (벡터 검색)
  ├── 역 인덱스 (BM25 키워드 검색)
  ├── Hybrid Search 2.0 엔진 (통합 인덱스)
  ├── 멀티테넌시 레이어 (샤드 격리)
  └── 모듈 시스템 (임베딩 모델 내장 가능)
```

#### Hybrid Search 2.0 (2025년 출시)

Weaviate는 2025년에 하이브리드 검색 엔진을 완전 재작성하여 Hybrid Search 2.0을 출시했습니다:
- 기존: HNSW 인덱스와 BM25 역 인덱스를 별도로 유지하고 쿼리 시 결합
- 신규: **단일 통합 인덱스**로 벡터와 키워드를 동시에 처리
- 성능: 60% 더 빠른 쿼리 처리 (공식 벤치마크)
- 구성 단순화: 두 인덱스의 가중치를 조정하는 `alpha` 파라미터 하나로 제어

#### 멀티테넌시 아키텍처

Weaviate는 **테넌시를 핵심 아키텍처로** 설계했습니다:

```
Collection (예: "Document")
  ├── Tenant: user_001 (ACTIVE - 전용 샤드)
  ├── Tenant: user_002 (INACTIVE - 디스크에 오프로드)
  ├── Tenant: user_003 (ACTIVE)
  └── Tenant: user_NNN (OFFLOADED - S3 등 외부 스토리지)
```

테넌트 상태:
- **ACTIVE**: RAM에 로드, 즉시 쿼리 가능
- **INACTIVE**: 디스크에 저장, 활성화 후 쿼리 가능
- **OFFLOADED**: 외부 스토리지(S3/GCS/Azure Blob)로 이전, 비용 최소화

---

## 3. 인덱싱

### 3.1 pgvector의 두 가지 인덱스 알고리즘

#### HNSW (Hierarchical Navigable Small World)

HNSW는 계층적 그래프 구조로 벡터 공간을 탐색합니다. 상위 레이어는 글로벌 탐색용 희소 연결로, 하위 레이어로 내려갈수록 밀집 연결 구조를 가집니다.

```
레이어 3 (희소): ●─────────────────●
레이어 2:        ●──────●──────────●
레이어 1:        ●──●───●──●───────●
레이어 0 (밀집): ●─●─●─●─●─●─●─●─●
                         ↑
                   쿼리 벡터 진입 후
                   상위 레이어에서 방향 잡고
                   하위 레이어로 내려가며 정밀 탐색
```

**HNSW 성능 특성 (pgvector 0.7.0)**:

| 지표 | 값 |
|------|-----|
| 99.8% 리콜에서 QPS | ~40.5 QPS |
| 99% 리콜에서 QPS | 높음 (IVFFlat 대비 15.5배) |
| 인덱스 빌드 시간 (99.8% 리콜) | ~4,065초 (IVFFlat 대비 32배 느림) |
| 메모리 사용량 (99.8% 리콜) | ~729MB (IVFFlat 대비 2.8배) |
| 쿼리 후 인덱스 재로드 | 필요 없음 (그래프 영구 저장) |
| 최신 버전 개선 | 빌드 시간 150배 단축 (0.5.0 → 0.7.0) |

**주요 파라미터**:
- `m`: 각 노드의 최대 연결 수 (기본 16, 높을수록 리콜 ↑, 메모리 ↑)
- `ef_construction`: 인덱스 빌드 시 탐색 범위 (높을수록 리콜 ↑, 빌드 시간 ↑)
- `ef`: 쿼리 시 탐색 범위 (높을수록 리콜 ↑, 지연 ↑)

```sql
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

**HNSW 선택 기준**: 낮은 쿼리 지연시간, 높은 리콜이 필요하고 메모리/빌드 시간을 감수할 수 있는 경우.

---

#### IVFFlat (Inverted File Flat)

IVFFlat은 벡터 공간을 `lists`개의 클러스터(Voronoi cell)로 분할하고, 쿼리 시 가장 가까운 `probes`개 클러스터만 탐색합니다.

```
벡터 공간 분할:
┌─────────────────────────────┐
│  클러스터1  │  클러스터2    │
│  ●●●●●     │   ●●●         │
│─────────────────────────────│
│  클러스터3  │  클러스터4    │
│  ●●●●      │   ●●●●●      │
└─────────────────────────────┘
         ↑
쿼리: 가장 가까운 N개 클러스터만 스캔
```

**IVFFlat 성능 특성**:

| 지표 | 값 |
|------|-----|
| 99.8% 리콜에서 QPS | ~2.6 QPS (HNSW 대비 1/15.5) |
| 인덱스 빌드 시간 (99.8% 리콜) | ~128초 (HNSW 대비 32배 빠름) |
| 메모리 사용량 (99.8% 리콜) | ~257MB (HNSW 대비 1/2.8) |
| 빌드 전 데이터 필요 | 최소 `lists * 16`개 이상 데이터 필요 |

**주요 파라미터**:
- `lists`: 클러스터 수 (데이터 수 기준: 1M 미만 → 100, 1M 이상 → √데이터 수)
- `probes`: 쿼리 시 탐색 클러스터 수 (높을수록 리콜 ↑, 지연 ↑)

```sql
CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
-- 쿼리 시:
SET ivfflat.probes = 10;
```

**IVFFlat 선택 기준**: 빠른 인덱스 빌드, 메모리 제약, 리콜 요구가 낮은 경우.

---

#### pgvector 양자화(Quantization) 기법 (2025 추가)

pgvector 0.7.0 이상에서 지원하는 이진 양자화(Binary Quantization, BQ)는 인덱스 빌드 시간을 대폭 단축합니다:

- BQ 적용 시: 벡터를 1비트로 압축 → 인덱스 크기 64배 감소
- 99% 리콜 유지하면서 인덱스 빌드 150배 빠르게 (0.5.0 HNSW 대비)
- 단, 일부 임베딩 모델(OpenAI, Cohere)에서만 안정적인 리콜 유지

---

### 3.2 Pinecone의 독자 인덱스

Pinecone은 인덱스 알고리즘 세부 사항을 공개하지 않습니다. Serverless 인덱스는:
- 분산 객체 스토리지에 벡터를 저장하고 쿼리 시 동적으로 로드
- 자동 인덱싱: 개발자가 인덱스 파라미터를 직접 설정할 필요 없음
- **콜드 스타트**: 오랫동안 사용되지 않은 인덱스는 첫 쿼리 시 지연 발생
- 차원 수: 최대 20,000 차원 지원 (pgvector의 기본 2,000 대비 10배)

Pod 기반 인덱스는 HNSW 유사 알고리즘을 사용하는 것으로 추정되며, `replicas`와 `pods` 파라미터로 성능 조정이 가능합니다.

---

### 3.3 Weaviate의 HNSW + 역 인덱스 혼합

Weaviate는 모든 컬렉션에 대해 기본적으로 HNSW 인덱스를 생성합니다. 특이점:

- **자동 HNSW 전환**: 멀티테넌시 환경에서 소규모 테넌트는 Flat 인덱스 사용, 데이터가 충분히 쌓이면 자동으로 HNSW로 전환
- **BQ/PQ 압축**: Product Quantization(PQ)과 Binary Quantization(BQ) 모두 지원
- **역 인덱스**: Filterable/Searchable 속성마다 전용 역 인덱스 버킷 생성 → 속성 기반 필터링에 최적화
- **Hybrid Search 2.0**: HNSW와 BM25 역 인덱스를 단일 통합 인덱스로 관리 (2025)

---

## 4. 쿼리 성능

### 4.1 QPS (초당 쿼리 수) 벤치마크

아래는 다양한 출처에서 수집한 공개 벤치마크 데이터입니다.

#### 소규모 (100만 벡터 이하, 1536차원, OpenAI Embeddings)

| 서비스 | QPS | 리콜 | P50 지연 | P99 지연 |
|--------|-----|------|----------|----------|
| pgvector HNSW | 100-500 | 95-99% | 5-20ms | 50-100ms |
| pgvector IVFFlat | 30-100 | 90-98% | 10-50ms | 100-300ms |
| Pinecone Serverless | 200-1000 | 97-99% | 10-50ms | 100-200ms |
| Weaviate | 150-600 | 96-99% | 8-30ms | 50-150ms |

> 소규모에서는 pgvector HNSW와 Pinecone/Weaviate 간 성능 차이가 실질적으로 작습니다.

#### 중간 규모 (1천만~5천만 벡터, 1536차원)

| 서비스 | QPS (99% 리콜) | P99 지연 | 메모리 요구 |
|--------|----------------|----------|------------|
| pgvector HNSW + BQ | 471 QPS (50M벡터) | < 100ms | 높음 |
| Pinecone Serverless | 300-2000 | 40-80ms | 자동 관리 |
| Weaviate Cloud | 200-800 | 30-80ms | 중간 |

#### 대규모 (1억 벡터 이상)

| 서비스 | 실용 여부 | 주요 제약 |
|--------|-----------|-----------|
| pgvector | 가능하나 튜닝 집약적 | 메모리 한계, 인스턴스 업그레이드 필요 |
| Pinecone | 설계 목표 규모 | 비용 급증, Pod 타입 선택 중요 |
| Weaviate | 분산 클러스터로 가능 | 운영 복잡도 증가 |

### 4.2 Supabase 공식 pgvector vs Pinecone 비교

Supabase가 자체 발표한 [pgvector vs Pinecone 비교 블로그](https://supabase.com/blog/pgvector-vs-pinecone)에서:

- **50만 벡터 이하**: pgvector와 Pinecone의 지연시간 차이는 임베딩 API 호출 지연보다 작음 (수ms ~ 수십ms 수준)
- **검색 지연 개선**: Supabase → Pinecone 마이그레이션 시 150-200ms → 40-80ms로 개선된 사례 존재
- **비용 대비 성능**: 500만 벡터 기준, Supabase Pro $25/월 vs Pinecone 동급 $70+/월

### 4.3 리콜(Recall) 이해

리콜은 "정확한 최근접 이웃 K개 중, ANN이 반환한 것의 비율"입니다.

| 리콜 | 의미 | 일반적 사용 |
|------|------|------------|
| 90% | ANN이 Top-10 중 9개 반환 | 허용 가능 (추천 시스템) |
| 95% | ANN이 Top-10 중 9.5개 반환 | 일반적 RAG 요구 수준 |
| 99% | ANN이 Top-10 중 9.9개 반환 | 엄격한 검색 요구 |
| 100% | 완전 정확 | Brute-force (매우 느림) |

RAG 파이프라인에서 95% 이상의 리콜이면 충분한 경우가 대부분입니다. 리콜 99.9% 이상을 위해 성능을 크게 희생할 필요는 없습니다.

---

## 5. 기능 비교

### 5.1 하이브리드 검색 (Hybrid Search)

하이브리드 검색은 **벡터 유사도 검색(시맨틱)**과 **키워드 검색(BM25/TF-IDF)**을 결합하여 검색 품질을 높이는 기법입니다.

| 항목 | pgvector | Pinecone | Weaviate |
|------|----------|----------|----------|
| 하이브리드 검색 지원 | 직접 없음 (별도 구현 필요) | 지원 (Sparse+Dense) | 기본 제공 (Hybrid Search 2.0) |
| BM25 키워드 검색 | PG 전문 검색(tsvector) 별도 활용 | Sparse 벡터로 구현 | 네이티브 내장 |
| 가중치 조정 | 직접 SQL 작성 | `alpha` 파라미터 | `alpha` 파라미터 |
| 재랭킹(Reranking) | 없음 (외부 모델 필요) | 지원 (유료) | 지원 (모듈) |
| 2025 업데이트 | pgvector 0.7.0 성능 개선 | Sparse-Dense GA | Hybrid Search 2.0 (60% 빠름) |

**pgvector + 하이브리드 검색 구현 패턴**:

```sql
-- 벡터 유사도 + BM25 키워드 혼합 (PostgreSQL 기본 기능 조합)
WITH vector_results AS (
  SELECT id, 1 - (embedding <=> $1) AS vector_score
  FROM documents
  ORDER BY embedding <=> $1
  LIMIT 50
),
text_results AS (
  SELECT id, ts_rank(to_tsvector('english', content), query) AS text_score
  FROM documents, plainto_tsquery('english', $2) query
  WHERE to_tsvector('english', content) @@ query
  LIMIT 50
)
SELECT COALESCE(v.id, t.id) AS id,
       COALESCE(v.vector_score, 0) * 0.7 + COALESCE(t.text_score, 0) * 0.3 AS combined_score
FROM vector_results v
FULL OUTER JOIN text_results t ON v.id = t.id
ORDER BY combined_score DESC
LIMIT 10;
```

---

### 5.2 필터링(Metadata Filtering)

벡터 검색 결과를 메타데이터 조건으로 필터링하는 기능은 프로덕션 RAG에서 필수입니다.

| 항목 | pgvector | Pinecone | Weaviate |
|------|----------|----------|----------|
| 필터 시점 | 검색 전(Pre-filter) 또는 후(Post-filter) | 검색 전/중 동시 | 검색 전/중 통합 |
| 필터 표현력 | SQL (최고 수준) | JSON 구조 (제한적) | GraphQL/JSON (풍부) |
| 복합 필터 | `AND/OR/NOT`, 서브쿼리 | `$and/$or/$not` | `where` 필터 + 중첩 조건 |
| 필터 인덱스 | B-tree, GIN 등 기존 PG 인덱스 | 자동 관리 | 역 인덱스 (속성별) |
| JOIN 기반 필터 | 가능 (다른 테이블과 JOIN) | 불가 | 불가 |

pgvector의 SQL 기반 필터링은 가장 강력하지만, **필터 적용 후 벡터 검색 시 인덱스를 사용하지 못하고 Sequential Scan으로 전환**될 수 있습니다. 이를 해결하기 위해:

```sql
-- 파티셔닝 또는 필터 대상 컬럼 기반 부분 인덱스
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops)
WHERE category = 'blog';
```

---

### 5.3 메타데이터(Metadata)

| 항목 | pgvector | Pinecone | Weaviate |
|------|----------|----------|----------|
| 메타데이터 저장 | 별도 컬럼 (타입 자유) | JSON (최대 40KB) | 속성(Properties) 정의 |
| 타입 지원 | PG 모든 타입 | string, number, boolean | text, int, number, boolean, date, object 등 |
| 메타데이터 크기 제한 | 실질적 없음 | 40KB/레코드 | 설정에 따라 유연 |
| 전문 검색 | tsvector 인덱스 가능 | 없음 | BM25 내장 |

---

### 5.4 멀티테넌시(Multi-tenancy)

다수 고객의 데이터를 하나의 벡터 DB에서 격리하여 관리하는 능력입니다.

| 항목 | pgvector | Pinecone | Weaviate |
|------|----------|----------|----------|
| 멀티테넌시 방식 | RLS 또는 별도 스키마 | 네임스페이스(Index 내) | 네이티브 테넌시 (전용 샤드) |
| 테넌트 격리 수준 | RLS: 논리적 / 별도 스키마: 강함 | 논리적 (같은 인덱스 공유) | 물리적 (전용 샤드) |
| 테넌트당 인덱스 | 어렵고 비효율적 | 네임스페이스로 근사 | 기본 지원 |
| 비활성 테넌트 처리 | 수동 아카이브 | 없음 | OFFLOADED 상태 자동 관리 |
| SaaS 앱 적합성 | 보통 (RLS 의존) | 보통 (네임스페이스 제한) | 최우수 (전용 설계) |

Weaviate의 멀티테넌시는 SaaS 제품 개발에 특히 강력합니다. 각 고객의 데이터를 완전히 격리된 샤드에 저장하고, 비활성 고객의 데이터를 S3로 자동 오프로드하여 비용을 절감할 수 있습니다.

---

## 6. 운영

### 6.1 스케일링

| 항목 | pgvector | Pinecone | Weaviate |
|------|----------|----------|----------|
| 수직 확장 | 간단 (인스턴스 크기 업) | 자동 (서버리스) | 노드 크기 업 |
| 수평 확장 | 복잡 (샤딩/파티셔닝 수동) | 자동 (서버리스) | 자동 (클러스터 추가) |
| 읽기 확장 | Read Replica | 자동 | 읽기 전용 노드 추가 |
| 벡터 수 한계 | 인스턴스 메모리 의존 | 사실상 무제한 | 분산 클러스터로 무제한 |
| 스케일 아웃 복잡도 | 높음 | 없음 | 중간 |

Supabase에서 pgvector를 사용할 때, 수백만 벡터를 초과하면 `shared_buffers`, `work_mem`, HNSW `ef` 파라미터 튜닝이 필수입니다.

---

### 6.2 백업 및 복구

| 항목 | pgvector (Supabase) | Pinecone | Weaviate Cloud |
|------|---------------------|----------|----------------|
| 자동 백업 | 있음 (일 1회, Pro 이상) | 없음 (사용자 책임) | 있음 (Plus 이상) |
| Point-in-time 복구 | 지원 (Pro 이상, 7일) | 없음 | 제한적 |
| 백업 형식 | PostgreSQL 표준 덤프 | 재삽입 필요 | 백업 파일 |
| 데이터 이식성 | 높음 (표준 SQL/pg_dump) | 낮음 (API export 필요) | 중간 (JSON export) |

---

### 6.3 모니터링

| 항목 | pgvector (Supabase) | Pinecone | Weaviate |
|------|---------------------|----------|----------|
| 기본 대시보드 | Supabase 대시보드 | Pinecone 콘솔 | Weaviate Cloud 콘솔 |
| 메트릭 수집 | pg_stat_statements, slow query 로그 | 사용량 메트릭 | Prometheus 통합 |
| 알림 | Supabase 알림 설정 | 이메일/Slack | 커스텀 |
| APM 통합 | Datadog, New Relic 가능 | 제한적 | OpenTelemetry 지원 |
| 인덱스 상태 | `pg_stat_user_indexes` | 대시보드 | REST API |

---

### 6.4 관리 복잡도 비교

| 항목 | pgvector | Pinecone | Weaviate (자체 호스팅) |
|------|----------|----------|------------------------|
| 초기 설정 | 쉬움 (Supabase 대시보드) | 매우 쉬움 | 중간-높음 |
| 인덱스 관리 | 수동 (CREATE INDEX) | 자동 | 중간 (설정 필요) |
| 업그레이드 | Supabase 관리 | 자동 | 직접 관리 |
| 장애 복구 | Supabase 자동 + 수동 | 자동 | 직접 관리 |
| 전문 지식 필요 | PostgreSQL DBA 지식 | 거의 없음 | Weaviate 전문 지식 |
| 총 운영 부담 | 중간 | 최소 | 높음 (자체 호스팅) |

---

## 7. 가격 비교

### 7.1 pgvector (Supabase)

pgvector는 Supabase 요금제에 포함되어 있으며, 별도 추가 요금이 없습니다.

| 요금제 | 월 비용 | 저장 공간 | 비고 |
|--------|---------|-----------|------|
| Free | $0 | 500MB DB | 500K 벡터(1536차원) 수용 가능 |
| Pro | $25 | 8GB DB | ~1,000만 벡터(768차원) 수용 |
| Team | $599 | 20GB+ | 팀 기능 포함 |
| Enterprise | 협의 | 무제한 | 전용 인프라 가능 |

**벡터 수 기준 추정**:
- 768차원 float32: 1 벡터 = 3KB → 1GB = 약 33만 벡터
- 1536차원 float32: 1 벡터 = 6KB → 1GB = 약 16만 벡터
- HNSW 인덱스는 데이터 크기의 1.5-3배 추가 공간 필요

**비용 장점**: Supabase Pro $25/월로 DB + Auth + Storage + Realtime + Vector DB를 모두 사용 가능. 별도 벡터 DB 서비스 불필요.

---

### 7.2 Pinecone

Pinecone은 2024년부터 Serverless 인덱스 중심의 사용량 기반 과금으로 전환했습니다.

| 요금제 | 월 최소 | 포함 내용 |
|--------|---------|-----------|
| Starter (무료) | $0 | 2GB 저장, 2M 쓰기 단위, 1M 읽기 단위/월 |
| Standard | $50 | PAYG, 멀티 리전, 더 많은 인덱스 |
| Enterprise | $500 | SLA, 전담 지원, BYOC |

**Serverless 과금 단위**:

| 단위 | 가격 | 설명 |
|------|------|------|
| 읽기 단위 (RU) | $8.25 / 1M RU | 벡터 검색 시 소비 |
| 쓰기 단위 (WU) | $2.00 / 1M WU | 벡터 삽입/업데이트 시 소비 |
| 저장 | $0.33 / GB / 월 | 벡터 저장 용량 |
| 추론 토큰 | $0.08 / 1M 토큰 | 임베딩 생성 시 (선택적) |

**실제 비용 예시**:
- 50만 벡터(1536차원) + 일 10만 쿼리: 월 약 $70-150
- 500만 벡터 + 일 100만 쿼리: 월 약 $300-600

**Starter 플랜 제약**: AWS us-east-1만 사용 가능, 5개 인덱스 한도, 2명 사용자.

---

### 7.3 Weaviate

Weaviate는 오픈소스이므로 자체 호스팅 시 라이선스 비용이 없습니다. Weaviate Cloud 서비스:

| 요금제 | 월 비용 | 특징 |
|--------|---------|------|
| 무료 체험 | $0 | 14일 샌드박스, 공유 클라우드 |
| Flex | $45부터 | PAYG, 공유 클라우드 |
| Plus | $280 | 전용 인프라, 연간 약정 옵션 |
| Premium | $400 | 99.95% SLA, 전화/Slack 지원 |

**사용량 기반 요금 (2025년 10월 개편 이후)**:

| 항목 | 가격 | 비고 |
|------|------|------|
| 벡터 차원 | $0.00975-$0.01668 / 100만 차원 | 리전별 상이 |
| 저장 | $0.2125-$0.31875 / GiB / 월 | 리전별 상이 |
| 백업 저장 | $0.022-$0.0264 / GiB / 월 | Plus 이상 |

**자체 호스팅 비용**:
- Kubernetes 클러스터 + 관리형 스토리지
- 500만 벡터: EC2 m6i.2xlarge x 2 노드 ≈ $500-800/월 (관리 비용 별도)

---

### 7.4 총비용 비교 (동일 사용량 기준)

**시나리오: 100만 벡터(1536차원), 일 50만 쿼리, 월 100만 건 신규 삽입**

| 서비스 | 예상 월 비용 | 비고 |
|--------|-------------|------|
| pgvector (Supabase Pro) | **$25-60** | DB 컴퓨트 업그레이드 포함 |
| Pinecone Serverless | **$70-150** | Standard 플랜 기준 |
| Weaviate Cloud (Flex) | **$100-200** | 사용량에 따라 가변 |
| Weaviate (자체 호스팅) | **$200-500** | 인프라 + 관리 인건비 제외 |

---

## 8. 의사결정 가이드

### 8.1 pgvector (Supabase)를 선택해야 할 때

**강력 추천 조건**:
- 이미 Supabase 또는 PostgreSQL을 메인 DB로 사용 중인 경우
- 벡터 검색 결과를 SQL JOIN으로 다른 데이터와 결합해야 하는 경우
- 데이터 일관성이 중요한 경우 (트랜잭션 원자성 필요)
- 비용 최소화가 최우선인 경우 (스타트업, 사이드 프로젝트)
- 1천만 벡터 이하 규모
- 백업/복구/감사 등 PG 생태계 도구를 활용하고 싶은 경우

**선택 지표**:
- 벡터 수: < 1,000만 개
- 월 쿼리: < 1,000만 건
- 팀: PostgreSQL 경험 보유

---

### 8.2 Pinecone을 선택해야 할 때

**강력 추천 조건**:
- 인프라 운영 부담 없이 프로덕션 벡터 검색을 즉시 도입해야 하는 경우
- 대규모(1억 벡터 이상) 또는 엔터프라이즈 RAG 파이프라인
- 20ms 이하의 낮은 지연시간이 필요한 경우
- AI-네이티브 제품으로 벡터 검색이 핵심 기능인 경우
- 팀에 DB 운영 전문 인력이 없는 경우

**선택 지표**:
- 벡터 수: 1,000만+ 개 또는 빠른 확장 예상
- 지연시간 요구: < 30ms
- 예산: $100+/월 수용 가능

---

### 8.3 Weaviate를 선택해야 할 때

**강력 추천 조건**:
- 하이브리드 검색(벡터 + 키워드)이 핵심 기능인 경우
- SaaS 제품에서 고객별 완전한 데이터 격리(멀티테넌시)가 필요한 경우
- 복잡한 그래프 형태의 데이터 관계를 표현해야 하는 경우
- 자체 호스팅으로 비용 통제와 데이터 주권이 중요한 경우
- Weaviate 모듈(임베딩 모델 내장, 재랭킹 모델)을 활용하려는 경우

**선택 지표**:
- 하이브리드 검색: 필수
- 테넌트 수: 1,000+ 고객
- 인프라 운영: 자체 팀 보유

---

### 8.4 규모 및 사용 사례별 의사결정 트리

```
[AI 기능 / 벡터 검색 필요]
        ↓
이미 PostgreSQL/Supabase 사용 중?
  ├─ YES → 벡터 수 예상 규모?
  │          ├─ < 100만 → [pgvector] 무조건 시작
  │          ├─ 100만~1천만 → [pgvector] + HNSW 최적화
  │          └─ > 1천만 → 지연시간 < 30ms 필요?
  │                         ├─ YES → [Pinecone] 마이그레이션 고려
  │                         └─ NO  → [pgvector] 튜닝으로 유지
  │
  └─ NO → 하이브리드 검색 (벡터+BM25) 필수?
           ├─ YES → SaaS 멀티테넌시 중요?
           │          ├─ YES → [Weaviate]
           │          └─ NO  → [Weaviate] 또는 [Pinecone Sparse+Dense]
           └─ NO  → 운영 부담 최소화?
                     ├─ YES → [Pinecone Serverless]
                     └─ NO  → [Weaviate 자체 호스팅] (비용 절감)
```

---

### 8.5 사용 사례별 매트릭스

| 사용 사례 | pgvector | Pinecone | Weaviate | 추천 |
|-----------|----------|----------|----------|------|
| 소규모 RAG 챗봇 | ★★★★★ | ★★★☆☆ | ★★★☆☆ | pgvector |
| 엔터프라이즈 RAG | ★★★☆☆ | ★★★★★ | ★★★★☆ | Pinecone |
| 의미 검색 엔진 | ★★★★☆ | ★★★★☆ | ★★★★★ | Weaviate |
| SaaS 고객별 검색 | ★★★☆☆ | ★★★☆☆ | ★★★★★ | Weaviate |
| 추천 시스템 | ★★★★☆ | ★★★★★ | ★★★★☆ | Pinecone |
| 멀티모달 검색 | ★★★☆☆ | ★★★★☆ | ★★★★★ | Weaviate |
| 실시간 벡터 갱신 | ★★★★★ | ★★★★☆ | ★★★☆☆ | pgvector |
| 코드 검색 | ★★★★☆ | ★★★★☆ | ★★★★☆ | 무방함 |

---

## 9. 7항목 스코어링

스코어: 1(최하) ~ 5(최상)

### 9.1 스코어 테이블

| 평가 항목 | pgvector | Pinecone | Weaviate | 비고 |
|-----------|:--------:|:--------:|:--------:|------|
| **1. 쿼리 성능 (QPS/지연)** | ★★★★☆ (4) | ★★★★★ (5) | ★★★★☆ (4) | pgvector 0.7.0 이후 격차 축소. Pinecone은 일관성 우위 |
| **2. 인덱스 유연성** | ★★★★★ (5) | ★★☆☆☆ (2) | ★★★★☆ (4) | pgvector: HNSW/IVFFlat/BQ 수동 제어. Pinecone: 블랙박스 |
| **3. 하이브리드 검색** | ★★★☆☆ (3) | ★★★☆☆ (3) | ★★★★★ (5) | Weaviate 2.0이 업계 최고 수준. pgvector는 수동 구현 |
| **4. 운영 편의성** | ★★★★☆ (4) | ★★★★★ (5) | ★★☆☆☆ (2) | Pinecone: 운영 제로. Weaviate: 자체 호스팅 시 복잡 |
| **5. 비용 효율성** | ★★★★★ (5) | ★★★☆☆ (3) | ★★★★☆ (4) | pgvector: Supabase 번들 최저가. Weaviate: OSS 자체 호스팅 가능 |
| **6. 멀티테넌시** | ★★★☆☆ (3) | ★★★☆☆ (3) | ★★★★★ (5) | Weaviate: 전용 설계. pgvector: RLS 의존. Pinecone: 네임스페이스 제한 |
| **7. 확장성 (대규모)** | ★★★☆☆ (3) | ★★★★★ (5) | ★★★★☆ (4) | Pinecone: 1억+ 벡터 설계 목표. pgvector: 메모리 한계 존재 |

### 9.2 합산 점수

| 항목 | pgvector | Pinecone | Weaviate |
|------|:--------:|:--------:|:--------:|
| 총점 (35점 만점) | **27** | **26** | **27** |
| RAG/검색 스타트업 | ★★★★★ 최적 | ★★★☆☆ 고비용 | ★★★☆☆ 복잡 |
| AI-native 프로덕션 | ★★★☆☆ 규모 한계 | ★★★★★ 최적 | ★★★★☆ 대안 |
| SaaS 하이브리드 검색 | ★★★☆☆ 부족 | ★★★☆☆ 부족 | ★★★★★ 최적 |
| 엔터프라이즈 RAG | ★★★☆☆ 튜닝 필요 | ★★★★★ 검증됨 | ★★★★☆ 가능 |

---

## 10. 결론

벡터 DB 선택은 현재 기술 스택, 예상 규모, 팀 역량에 크게 의존합니다.

**pgvector(Supabase)**는 2025-2026년 기준 대부분의 AI 스타트업과 소-중규모 프로덕션 앱에 최적입니다. pgvector 0.7.0의 성능 개선과 이진 양자화 지원으로 "1천만 벡터까지는 pgvector"라는 업계 기준이 더욱 확고해졌습니다. Supabase를 이미 사용 중이라면 추가 비용 없이 즉시 시작할 수 있습니다.

**Pinecone**은 인프라 운영 부담 없이 대규모 프로덕션 벡터 검색을 원하는 팀에 최적입니다. 높은 비용이 단점이지만, 완전 관리형 서비스로 엔지니어링 시간을 핵심 제품에 집중할 수 있습니다. AI-native 제품에서 수천만~수억 벡터를 다루는 팀에게 검증된 선택입니다.

**Weaviate**는 하이브리드 검색이 핵심이거나, SaaS 멀티테넌시 요구가 강한 프로젝트에 독보적인 선택입니다. Hybrid Search 2.0으로 벡터+키워드 결합 검색 품질이 크게 향상되었습니다. 자체 호스팅 옵션은 비용 통제와 데이터 주권을 원하는 기업에 매력적입니다.

**2026년 권장 기본 전략**:
1. Supabase 사용 중 → pgvector로 시작, 필요 시 Pinecone으로 확장
2. AI-first 제품, 1천만+ 벡터 예상 → Pinecone Serverless로 시작
3. SaaS + 복잡한 하이브리드 검색 → Weaviate Cloud 또는 자체 호스팅

---

## 참고 자료

- [Supabase: pgvector vs Pinecone 공식 비교](https://supabase.com/blog/pgvector-vs-pinecone)
- [DEV.to: PostgreSQL as Vector DB — pgvector vs Pinecone vs Weaviate](https://dev.to/polliog/postgresql-as-a-vector-database-when-to-use-pgvector-vs-pinecone-vs-weaviate-4kfi)
- [Pinecone 가격 공식 문서](https://www.pinecone.io/pricing/)
- [Pinecone: 비용 이해 가이드](https://docs.pinecone.io/guides/manage-cost/understanding-cost)
- [Weaviate: 멀티테넌시 아키텍처](https://weaviate.io/blog/weaviate-multi-tenancy-architecture-explained)
- [Weaviate: Hybrid Search 2.0 발표](https://app.ailog.fr/en/blog/news/weaviate-hybrid-search-2)
- [Weaviate 가격 공식 문서](https://weaviate.io/pricing)
- [Tembo: IVFFlat vs HNSW in pgvector](https://www.tembo.io/blog/vector-indexes-in-pgvector)
- [AWS: pgvector HNSW vs IVFFlat 심층 가이드](https://aws.amazon.com/blogs/database/optimize-generative-ai-applications-with-pgvector-indexing-a-deep-dive-into-ivfflat-and-hnsw-techniques/)
- [Firecrawl: Best Vector Databases 2026](https://www.firecrawl.dev/blog/best-vector-databases)
- [Shakudo: Top 9 Vector Databases 2026](https://www.shakudo.io/blog/top-9-vector-databases)
- [Athenic: Pinecone vs Weaviate vs Qdrant vs pgvector](https://getathenic.com/blog/pinecone-vs-weaviate-vs-qdrant-vs-pgvector)
- [Confident AI: Pinecone → pgvector 마이그레이션 사례](https://www.confident-ai.com/blog/why-we-replaced-pinecone-with-pgvector)
- [Encore: pgvector vs Pinecone 비교 (2026)](https://encore.dev/articles/pgvector-vs-pinecone)
