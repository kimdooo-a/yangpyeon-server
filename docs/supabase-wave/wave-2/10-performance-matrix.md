# 성능/한도 비교 매트릭스: BaaS/백엔드 플랫폼 성능 완전 분석

> 작성일: 2026-04-06  
> 비교 대상: Supabase / Firebase / PlanetScale / Neon / AWS Amplify / Appwrite  
> 목적: 플랫폼별 리소스 한도, 성능 벤치마크, 스케일링 특성 파악

---

## 목차

1. [플랫폼별 리소스 한도 종합표](#1-플랫폼별-리소스-한도-종합표)
2. [데이터베이스 성능 벤치마크](#2-데이터베이스-성능-벤치마크)
3. [서버리스 함수 성능](#3-서버리스-함수-성능)
4. [실시간(Realtime) 성능](#4-실시간realtime-성능)
5. [스토리지/CDN 성능](#5-스토리지cdn-성능)
6. [인증(Auth) 성능](#6-인증auth-성능)
7. [스케일링 특성 비교](#7-스케일링-특성-비교)
8. [가용성 SLA 비교](#8-가용성-sla-비교)
9. [지역별 레이턴시 비교](#9-지역별-레이턴시-비교)
10. [성능 최적화 권장 사항](#10-성능-최적화-권장-사항)

---

## 1. 플랫폼별 리소스 한도 종합표

### 1-1. 데이터베이스 리소스 한도

| 항목 | Supabase Free | Supabase Pro | Firebase (Blaze) | Neon Free | Neon Scale | PlanetScale ps_5 |
|---|---|---|---|---|---|---|
| DB 스토리지 | 500 MB | 8 GB + 확장 | 1 GB + 확장 | 0.5 GB | 50 GB + 확장 | 10 GB |
| 최대 DB 크기 | 500 MB | 수 TB (추가 요금) | 무제한 (비용 발생) | 무제한 (비용 발생) | 무제한 (비용 발생) | 무제한 (비용 발생) |
| 동시 접속 수 | 60 (직접) / ~200 (풀러) | 200 (직접) / ~1,000 (풀러) | N/A (NoSQL) | 100~500 (컴퓨트 크기 의존) | 500~5,000 | 무제한 (MySQL 기반) |
| 최대 컴퓨트 | Shared (0.25 vCPU) | Shared~16 vCPU 선택 | 자동 스케일 | 0.25~8 vCPU | 0.25~8 vCPU | 5 vCPU (ps_5) |
| 최대 RAM | 1 GB (shared) | 1 GB~64 GB | 자동 스케일 | 1 GB~32 GB | 1 GB~32 GB | 20 GB |
| 읽기 IOPS | 공유 | ~3,000 (Pro 기본) | 자동 | ~3,000 | ~10,000 | ~5,000 |
| 쓰기 IOPS | 공유 | ~3,000 (Pro 기본) | 자동 | ~3,000 | ~10,000 | ~3,000 |
| 최대 행 수 | 제한 없음 (500MB 내) | 제한 없음 | Firestore 문서 무제한 | 제한 없음 | 제한 없음 | 제한 없음 |
| Connection Pooling | Supavisor (PgBouncer) | Supavisor | N/A | PgBouncer 내장 | PgBouncer 내장 | 내장 |

### 1-2. API 요청 한도

| 항목 | Supabase Free | Supabase Pro | Firebase Spark | Firebase Blaze | AWS Amplify |
|---|---|---|---|---|---|
| REST API 요청/초 | 500 (PostgREST) | 1,000+ | N/A | 무제한 (비용 발생) | API Gateway 한도 |
| GraphQL 요청/초 | N/A | N/A | N/A | N/A | 10,000/초 (AppSync) |
| API 요청 제한 방식 | Rate Limit (조정 가능) | 컴퓨트 의존 | 일별 쿼터 | 과금 | IAM 권한 의존 |
| API 최대 응답 크기 | 1 MB | 10 MB | 1 MB (Firestore) | 1 MB | 10 MB |
| 초당 최대 쓰기 (단일 문서) | PostgreSQL 트랜잭션 의존 | PostgreSQL 트랜잭션 의존 | 1회/초 (Firestore 단일 문서) | 1회/초 | DynamoDB 무제한 |

### 1-3. 스토리지 한도

| 항목 | Supabase Free | Supabase Pro | Firebase Spark | Firebase Blaze | Vercel Hobby | Vercel Pro |
|---|---|---|---|---|---|---|
| 파일 스토리지 | 1 GB | 100 GB + 확장 | 5 GB | 무제한 | N/A | N/A |
| 최대 단일 파일 크기 | 50 MB | 5 GB (TUS) | 5 GB | 5 GB | 100 MB (Vercel 배포) | 100 MB |
| CDN 대역폭 | 5 GB Egress | 250 GB Egress | 1 GB/일 다운로드 | 무제한 (비용 발생) | 100 GB | 1 TB |
| 스토리지 요청/초 | 공유 | 높음 | Google Cloud 인프라 | Google Cloud 인프라 | CDN 캐시 의존 | CDN 캐시 의존 |

### 1-4. 서버리스 함수 한도

| 항목 | Supabase Edge Fn | Firebase Functions (Gen1) | Firebase Functions (Gen2) | AWS Lambda (Amplify) | Appwrite Functions |
|---|---|---|---|---|---|
| 최대 실행 시간 | 150초 | 9분 | 60분 | 15분 | 15분 |
| 최대 메모리 | 150 MB | 8 GB | 32 GB | 10 GB | 512 MB |
| 동시 실행 인스턴스 | 높음 (엣지 분산) | 1,000 (기본) | 3,000 (기본) | 1,000 (기본, 증가 가능) | 100 |
| 초당 새 인스턴스 시작 | 높음 | 60/분 (Gen1) | 고속 (Gen2) | 무제한 (설정 의존) | 낮음 |
| 최대 동시 요청/인스턴스 | 1 | 1 (Gen1) | 1,000 (Gen2) | 1,000 | 1 |
| 배포 패키지 최대 크기 | 20 MB | 100 MB | 1 GB | 250 MB (ZIP) | 50 MB |
| 무료 호출/월 | 500,000 | 2,000,000 | 2,000,000 | 1,000,000 | 750,000 |

---

## 2. 데이터베이스 성능 벤치마크

### 2-1. 쿼리 응답 시간 (레이턴시)

아래 데이터는 2025~2026년 공개 벤치마크 및 커뮤니티 테스트를 기반으로 함

| 시나리오 | Supabase Pro | Firebase (Firestore) | Neon Launch | PlanetScale |
|---|---|---|---|---|
| **단순 행 조회 (PK)** | 2~8 ms | 20~80 ms | 5~20 ms (활성) / 500~3,000 ms (콜드) | 3~10 ms |
| **단순 문서 조회** | 3~10 ms | 15~60 ms | 5~15 ms | 3~8 ms |
| **복잡 JOIN (5개 테이블)** | 10~50 ms | ❌ 지원 안 함 | 15~60 ms | 20~80 ms |
| **집계 쿼리 (COUNT, SUM)** | 5~30 ms (인덱스 있음) | ❌ 제한적 | 8~40 ms | 10~50 ms |
| **전문 검색 (FTS)** | 20~100 ms | ❌ 별도 Algolia 필요 | 20~100 ms | ❌ 별도 필요 |
| **벡터 유사도 검색 (10K 벡터)** | 10~50 ms (HNSW 인덱스) | ❌ 별도 서비스 | 10~50 ms (pgvector) | ❌ 지원 안 함 |
| **벌크 INSERT (1,000행)** | 20~100 ms | 1,000~5,000 ms (1,000 doc) | 20~80 ms | 50~200 ms |
| **트랜잭션 (10 쿼리)** | 30~100 ms | ❌ 단일 문서만 | 30~100 ms | 50~150 ms |

**벤치마크 주요 발견**
- Supabase는 복잡한 SQL 쿼리에서 Firestore 대비 **40% 높은 처리량** (2025 benchmarks, 100만 행 데이터셋 기준)
- Neon의 Scale-to-Zero 콜드 스타트는 500ms~3,000ms 지연 발생 (활성 상태는 Supabase와 동등)
- Firestore는 단순 문서 조회에서 20~80ms로 Supabase와 유사하지만, 복잡 쿼리 불가

### 2-2. 처리량(Throughput) 비교

| 플랫폼 | 동시 읽기 처리량 | 동시 쓰기 처리량 | 최적 시나리오 |
|---|---|---|---|
| Supabase Pro (기본 컴퓨트) | ~500 req/초 | ~200 req/초 | 중간 규모, 복잡한 쿼리 |
| Supabase Pro (large 컴퓨트) | ~5,000 req/초 | ~2,000 req/초 | 대규모 SQL |
| Firebase Firestore | ~50,000 req/초 (자동 스케일) | ~20,000 req/초 | 단순 문서, 대량 동시 쓰기 |
| Neon Launch | ~1,000 req/초 | ~500 req/초 | 중간 규모 |
| PlanetScale ps_5 | ~2,000 req/초 | ~1,000 req/초 | MySQL 호환 대규모 |

### 2-3. 데이터베이스 연결 관리

| 항목 | Supabase | Neon | PlanetScale | Firebase |
|---|---|---|---|---|
| 최대 직접 연결 수 (Free) | 60 | 100 | 무제한 | N/A |
| 최대 직접 연결 수 (Pro) | 200 | 500+ | 무제한 | N/A |
| Connection Pooler (Pool 모드) | Supavisor | PgBouncer 내장 | 내장 | N/A |
| Pooler 동시 클라이언트 수 | 수천 개 | 수천 개 | 수천 개 | N/A |
| 연결 유지 (Keep-Alive) | ✅ | ✅ | ✅ | N/A |
| 서버리스 환경 최적화 | ✅ (풀러 사용 권장) | ✅ (자동) | ✅ | N/A |

> **핵심**: 서버리스 Next.js / Vercel 환경에서는 반드시 Connection Pooler(Supabase Supavisor, Neon PgBouncer)를 사용해야 함. 직접 연결 사용 시 Lambda/Edge Function 요청마다 새 연결을 생성하여 "Too many connections" 오류 발생.

---

## 3. 서버리스 함수 성능

### 3-1. 콜드 스타트 시간 비교

콜드 스타트(Cold Start): 함수가 처음 실행되거나 오랫동안 호출되지 않아 새 인스턴스를 시작하는 데 걸리는 시간

| 플랫폼 | 함수 타입 | 평균 콜드 스타트 | P99 콜드 스타트 | 워밍 전략 |
|---|---|---|---|---|
| **Supabase Edge Functions** | Deno (TypeScript) | **~50 ms** | ~200 ms | 항상 웜 (엣지 분산) |
| **Firebase Functions Gen2** | Node.js (Cloud Run) | **~100~500 ms** | ~1,000 ms | minInstances 설정 |
| **Firebase Functions Gen1** | Node.js | **~500~2,000 ms** | ~5,000 ms | minInstances 설정 |
| **AWS Lambda (Amplify)** | Node.js | **~100~500 ms** | ~1,000 ms | Provisioned Concurrency |
| **AWS Lambda SnapStart** | Java (JVM) | **~~100 ms** | ~300 ms | SnapStart 활성화 |
| **Vercel Edge Functions** | TypeScript/WASM | **~0~10 ms** | ~50 ms | 엣지 분산 |
| **Vercel Serverless Functions** | Node.js | **~200~500 ms** | ~1,000 ms | 자동 |
| **Appwrite Functions** | Node.js/Python 등 | **~100~500 ms** | ~1,500 ms | 수동 워밍 |
| **Cloudflare Workers** | JavaScript/WASM | **~0~5 ms** | ~20 ms | 항상 웜 (엣지) |

### 3-2. 함수 실행 레이턴시 (워밍된 상태)

| 플랫폼 | 평균 실행 레이턴시 | DB 직접 접근 레이턴시 | 비고 |
|---|---|---|---|
| Supabase Edge Functions | 5~20 ms | +2~10 ms (DB 동일 리전) | Deno 런타임, DB와 동일 인프라 |
| Firebase Functions Gen2 | 10~50 ms | +20~80 ms (Firestore) | Cloud Run 기반 |
| AWS Lambda | 5~30 ms | +20~100 ms (VPC 내 RDS) | VPC 구성 시 추가 레이턴시 |
| Vercel Edge Functions | 1~10 ms | +50~150 ms (외부 DB) | DB가 엣지에 없는 한계 |
| Cloudflare Workers | 1~5 ms | +50~200 ms (외부 DB) | Workers Durable Objects로 개선 가능 |

### 3-3. 함수 동시 실행 성능

| 시나리오 | Supabase | Firebase Gen2 | AWS Lambda |
|---|---|---|---|
| 초당 100 요청 | 문제 없음 | 문제 없음 | 문제 없음 |
| 초당 1,000 요청 | ✅ 엣지 분산 처리 | ⚠️ 스케일 업 중 일부 지연 | ✅ 자동 스케일 |
| 초당 10,000 요청 | ✅ | ⚠️ 동시 실행 한도 도달 가능 | ✅ (한도 증가 신청 필요) |
| 트래픽 버스트 (100배) | ✅ 엣지가 흡수 | ⚠️ 콜드 스타트 급증 | ⚠️ Provisioned Concurrency 필요 |

---

## 4. 실시간(Realtime) 성능

### 4-1. WebSocket 연결 한도

| 플랫폼 | 무료 동시 접속 | Pro/유료 동시 접속 | 최대 메시지 크기 | 초당 최대 메시지 |
|---|---|---|---|---|
| **Supabase Free** | 200 | — | 1 MB | 100/채널 |
| **Supabase Pro** | — | 500 | 1 MB | 높음 |
| **Supabase Enterprise** | — | 무제한 (협의) | 1 MB | 높음 |
| **Firebase RTDB (Spark)** | 100 | — | 32 KB | 높음 |
| **Firebase RTDB (Blaze)** | — | 200,000+ | 32 KB | 매우 높음 |
| **Firebase Firestore** | 무제한 리스너 | 무제한 리스너 | 1 MB | Firestore 쓰기 한도 의존 |
| **AWS AppSync** | — | 200,000 | 128 KB | 1,000/초 (기본) |
| **Appwrite** | 100 | 협의 | 1 MB | 중간 |

### 4-2. 실시간 메시지 레이턴시

| 플랫폼 | 평균 메시지 전달 레이턴시 | P99 레이턴시 | 측정 방법 |
|---|---|---|---|
| **Firebase RTDB** | ~50~150 ms | ~300 ms | 동일 리전 클라이언트 |
| **Firebase Firestore** | ~100~300 ms | ~500 ms | DB 쓰기 → 리스너 알림 |
| **Supabase Realtime** | ~100~200 ms | ~400 ms | PostgreSQL CDC → WebSocket |
| **AWS AppSync** | ~150~300 ms | ~600 ms | DynamoDB → GraphQL Subscription |
| **Appwrite Realtime** | ~100~250 ms | ~500 ms | WebSocket |

> **주의**: 측정값은 서울(ap-northeast-2) 리전 기준, 네트워크 상태에 따라 크게 변동. Firebase RTDB가 단순 키-값 구조에서 레이턴시 최저 기록.

### 4-3. Supabase Realtime 상세 한도

| 항목 | Free | Pro | Team |
|---|---|---|---|
| 동시 Peak 접속 | 200 | 500 | 협의 |
| 채널 수 | 100 | 무제한 | 무제한 |
| 초당 메시지 수 (전체) | 1,000 | 5,000 | 높음 |
| Broadcast 메시지 크기 | 1 MB | 1 MB | 1 MB |
| Presence 상태 크기 | 32 KB | 32 KB | 32 KB |
| DB Change 구독 수 | 제한 | 많음 | 많음 |

---

## 5. 스토리지/CDN 성능

### 5-1. 파일 업로드/다운로드 성능

| 플랫폼 | 업로드 속도 (평균) | 다운로드 속도 (CDN) | 이미지 변환 | 대용량 파일 지원 |
|---|---|---|---|---|
| **Supabase Storage** | S3-호환 속도 (~100 MB/s) | Supabase CDN / Cloudflare 프록시 | ✅ Imgproxy 내장 | ✅ TUS 청크 업로드 |
| **Firebase Storage** | Google Cloud Storage (~100 MB/s) | ✅ Google CDN | ⚠️ Extensions 필요 | ✅ 청크 업로드 |
| **AWS S3 (Amplify)** | ~500 MB/s (멀티파트) | ✅ CloudFront 글로벌 | ⚠️ Lambda@Edge 필요 | ✅ 멀티파트 업로드 |
| **Vercel CDN** | 빌드 아티팩트 전용 | ✅ 글로벌 엣지 | ❌ | 100 MB 제한 |
| **Cloudflare R2** | ~100 MB/s | ✅ Cloudflare CDN (Egress 무료) | ❌ (Workers 조합) | ✅ 멀티파트 |

### 5-2. CDN 글로벌 PoP(접속 지점) 수

| 플랫폼 | CDN PoP 수 | 한국(서울) 엣지 | 평균 TTFB (서울 기준) |
|---|---|---|---|
| Cloudflare | 300+ | ✅ | ~5~15 ms |
| Firebase (Google CDN) | 200+ | ✅ | ~10~30 ms |
| AWS CloudFront (Amplify) | 450+ | ✅ | ~10~25 ms |
| Vercel Edge Network | 100+ | ✅ | ~20~50 ms |
| Supabase (자체 CDN) | 제한적 | ⚠️ (Cloudflare 위임 시 개선) | ~30~100 ms (직접) |

> Supabase Storage는 자체 CDN이 약해 대용량 미디어 서비스 시 Cloudflare 또는 Cloudflare R2 조합 필수

---

## 6. 인증(Auth) 성능

### 6-1. Auth 응답 시간

| 플랫폼 | 로그인 레이턴시 (평균) | 토큰 검증 레이턴시 | 사용자 생성 레이턴시 |
|---|---|---|---|
| **Supabase Auth** | 100~300 ms | ~5~20 ms (JWT 로컬 검증) | 200~500 ms |
| **Firebase Auth** | 100~400 ms | ~5~15 ms (로컬 검증) | 200~600 ms |
| **Clerk** | 200~500 ms | ~1~5 ms (엣지 미들웨어) | 300~800 ms |
| **AWS Cognito (Amplify)** | 200~600 ms | ~10~30 ms | 300~1,000 ms |
| **Appwrite Auth** | 100~300 ms | ~10~20 ms | 200~500 ms |

> Clerk의 토큰 검증이 가장 빠른 이유: Next.js 미들웨어(엣지)에서 JWT를 로컬로 검증하므로 외부 API 호출 없음

### 6-2. MAU 처리 한도

| 플랫폼 | 무료 MAU 한도 | 최대 MAU (이론) | MAU 정의 |
|---|---|---|---|
| Supabase | 50,000 | 무제한 (비용 증가) | 실제 인증 사용자 |
| Firebase | 무제한 (Email/PW) | 무제한 | 인증 API 호출 |
| Clerk | 50,000 | 무제한 (비용 증가) | 월간 활성 사용자 |
| AWS Cognito | 50,000 MAU 무료 (12개월) | 무제한 | 인증 작업 |
| Appwrite | 75,000 MAU (Cloud Free) | 무제한 (Cloud Scale) | 활성 세션 |

---

## 7. 스케일링 특성 비교

### 7-1. 스케일링 방식 비교

| 플랫폼 | 스케일링 방식 | 자동 스케일 | 수직 스케일 | 수평 스케일 |
|---|---|---|---|---|
| **Supabase** | 수직 우선 (컴퓨트 업그레이드) | ⚠️ 수동 컴퓨트 변경 | ✅ (Nano~8XL 티어) | ✅ 읽기 복제본 |
| **Firebase Firestore** | 완전 자동 수평 | ✅ 자동 | N/A | ✅ 자동 샤딩 |
| **Firebase RTDB** | 단일 인스턴스 (제한) | ⚠️ 샤딩 수동 | 제한 | ⚠️ 다중 DB 수동 분할 |
| **AWS Amplify (DynamoDB)** | 완전 자동 수평 | ✅ 자동 | ✅ | ✅ 자동 파티셔닝 |
| **Neon** | 서버리스 자동 (컴퓨트) | ✅ Scale-to-Zero / Scale-Up | ✅ | ⚠️ 읽기 복제본 (유료) |
| **PlanetScale** | 수평 (Vitess 기반) | ✅ (일부 자동) | ✅ | ✅ 자동 샤딩 (Vitess) |
| **Appwrite** | 수직 (셀프호스팅) | ❌ | ✅ | ⚠️ 복잡한 설정 |

### 7-2. 자동 스케일링 특성

**Supabase 스케일링 특성**

```
현재 상태: 수직 스케일 중심
├── 컴퓨트 티어: Nano (0.5 vCPU/1GB) → XL (8 vCPU/32GB) → 8XL (64 vCPU/256GB)
├── 읽기 복제본: Pro 이상에서 추가 가능 (비용 발생)
├── 스케일 업/다운: 수동 (다운타임 없이 변경 가능)
├── 자동 스케일: ❌ (Enterprise에서 일부 지원 예정)
└── 연결 풀링: Supavisor로 수천 클라이언트 지원
```

**Firebase 스케일링 특성**

```
현재 상태: 완전 자동 수평 스케일
├── Firestore: 자동 샤딩, 이론상 무제한 스케일
├── 단일 문서 쓰기 한계: 1 write/sec (핫스팟 방지 설계 필요)
├── RTDB: 단일 인스턴스 (100K 동시 접속이 실용 한계)
├── Cloud Functions: 최대 3,000 인스턴스 (Gen2), 자동 스케일
└── 스케일 제한: 단일 컬렉션의 초당 쓰기 = 500 doc/초 권장
```

**Neon 스케일링 특성**

```
현재 상태: 서버리스 자동 스케일 (컴퓨트 레이어)
├── Scale-to-Zero: 비활성 시 0으로 축소 → 비용 절감
├── Scale-Up: 부하 증가 시 자동으로 컴퓨트 증가
├── 최대 컴퓨트: 8 vCPU / 32 GB RAM (Scale 플랜)
├── 스토리지: 별도 레이어 (컴퓨트와 분리, 독립 스케일)
└── 한계: PostgreSQL 단일 프라이머리 (쓰기는 수직 스케일에 의존)
```

**PlanetScale 스케일링 특성 (Vitess 기반)**

```
현재 상태: MySQL 수평 스케일 (Vitess)
├── 자동 샤딩: Vitess가 쿼리를 적절한 샤드로 라우팅
├── 스케일: 이론상 무제한 수평 확장
├── 제약: 외래 키 제약 없음 (앱 레벨에서 처리)
├── Branches: DB 브랜칭으로 스키마 변경 안전하게 적용
└── 적합: 단순한 대규모 MySQL 워크로드
```

### 7-3. 스케일링 제약 및 핫스팟

| 플랫폼 | 스케일링 병목 지점 | 핫스팟 위험 | 해결 방법 |
|---|---|---|---|
| Supabase | 단일 프라이머리 쓰기 | 낮음 (PostgreSQL WAL) | 읽기 복제본, 인덱스 최적화 |
| Firebase Firestore | 단일 문서 1 write/sec | 높음 (카운터 패턴) | 분산 카운터, 서브컬렉션 분산 |
| Firebase RTDB | 단일 인스턴스 100K 동시 한계 | 중간 | 다중 RTDB 인스턴스 분할 |
| Neon | Scale-to-Zero 콜드 스타트 | 낮음 | 최소 컴퓨트 유지, 워밍 전략 |
| PlanetScale | 외래 키 제약 없음 | 낮음 (Vitess 샤딩) | 앱 레벨 무결성 관리 |
| AWS DynamoDB (Amplify) | 파티션 키 설계 | 높음 (잘못된 키 설계 시) | 파티션 키 분산 설계 |

---

## 8. 가용성 SLA 비교

### 8-1. 공식 SLA 수치

| 플랫폼 | 서비스 | SLA (가용성) | 적용 플랜 | 연간 허용 다운타임 |
|---|---|---|---|---|
| **Supabase** | 전체 서비스 | 99.9% | Enterprise만 | ~8.7시간/년 |
| **Supabase** | Pro/Team | SLA 없음 (Best Effort) | Free/Pro/Team | — |
| **Firebase / Google** | Firebase Hosting + RTDB | **99.95%** | 모든 유료 사용자 | ~4.4시간/년 |
| **Google Cloud Firestore** | Firestore (단일 리전) | **99.99%** | 모든 Blaze 사용자 | ~52분/년 |
| **Google Cloud Firestore** | Firestore (멀티 리전) | **99.999%** | 모든 Blaze 사용자 | ~5.3분/년 |
| **AWS (Amplify 기반)** | DynamoDB | **99.999%** | 모든 유료 사용자 | ~5.3분/년 |
| **AWS (Amplify 기반)** | S3 | **99.9%** | 모든 유료 사용자 | ~8.7시간/년 |
| **AWS (Amplify 기반)** | Lambda | **99.95%** | 모든 유료 사용자 | ~4.4시간/년 |
| **Neon** | Serverless Postgres | **99.9%** (유료) | Launch 이상 | ~8.7시간/년 |
| **PlanetScale** | MySQL | **99.99%** | Metal HA | ~52분/년 |
| **Vercel** | Edge Network | **99.99%** | Pro | ~52분/년 |
| **Clerk** | Auth API | **99.99%** | Pro | ~52분/년 |

### 8-2. SLA 세부 조건

**Supabase Enterprise SLA**
- 99.9% 가용성 약정 (월별 측정)
- SLA 미달 시 서비스 크레딧 제공 (최대 이전 12개월 요금의 20%)
- AWS, Cloudflare, GCP 등 외부 벤더 장애는 SLA 제외
- 24/7 Slack 지원, 긴급 이슈 1시간 내 응답

**Firebase SLA**
- 5분 연속 오류율 > 5% 시 다운타임으로 인정
- 서비스 크레딧: 99.95% 미달 시 10%, 99.0% 미달 시 25%
- Firestore 멀티리전: 99.999% (Five Nines) — 엔터프라이즈 최고 수준

**Google Cloud Firestore SLA 크레딧 체계**
```
가용성 99.99%~99.999% 미달: 10% 크레딧
가용성 99.0%~99.99% 미달:   25% 크레딧
가용성 99.0% 미달:           50% 크레딧
```

### 8-3. 실제 가동률 (Historical Uptime)

공개된 상태 페이지 기반 2025년 연간 실제 가동률:

| 플랫폼 | 2025 실제 가동률 (추정) | 주요 인시던트 |
|---|---|---|
| Firebase | ~99.97% | Google Cloud 리전 간헐적 이슈 |
| Supabase | ~99.90% | DB 컴퓨트 일부 리전 이슈 |
| Vercel | ~99.97% | 빌드 시스템 간헐적 지연 |
| AWS | ~99.99%+ | 리전별 분산으로 영향 최소화 |
| Neon | ~99.95% | Scale-to-Zero 콜드 스타트 포함 시 |

---

## 9. 지역별 레이턴시 비교

### 9-1. 한국(서울) 기준 레이턴시

Supabase, Firebase 등 각 서비스의 서울 리전 또는 가장 가까운 리전 기준

| 서비스 | 리전 위치 | 서울 기준 레이턴시 | 서울 전용 리전 |
|---|---|---|---|
| **Supabase** | ap-northeast-1 (도쿄) | ~30~80 ms | ⚠️ (도쿄 사용) |
| **Supabase** | ap-northeast-2 (서울) | ~5~20 ms | ✅ (직접 선택 가능) |
| **Firebase Firestore** | asia-northeast3 (서울) | ~5~20 ms | ✅ |
| **Firebase RTDB** | asia-southeast1 (싱가포르) | ~80~150 ms | ⚠️ |
| **AWS DynamoDB** | ap-northeast-2 (서울) | ~5~15 ms | ✅ |
| **Neon** | ap-southeast-1 (싱가포르) | ~80~150 ms | ⚠️ (서울 리전 미지원) |
| **Vercel Edge** | 서울 엣지 PoP | ~5~20 ms | ✅ (엣지 분산) |
| **Cloudflare** | 서울 PoP | ~3~10 ms | ✅ |
| **PlanetScale** | ap-northeast-1 (도쿄) | ~20~60 ms | ⚠️ |

> **한국 서비스 주의**: Neon은 서울 리전 미지원으로 싱가포르(80~150ms)가 최근접. 한국 사용자 대상 서비스에는 Supabase(서울 리전) 또는 Firebase(서울 리전)가 유리.

### 9-2. 글로벌 리전 가용성

| 플랫폼 | 총 리전 수 | 한국 리전 | 일본 리전 | 유럽 리전 | 미국 리전 |
|---|---|---|---|---|---|
| Supabase | 17+ | ✅ (ap-northeast-2) | ✅ | ✅ 다수 | ✅ 다수 |
| Firebase | 35+ | ✅ (asia-northeast3) | ✅ | ✅ 다수 | ✅ 다수 |
| AWS (Amplify) | 30+ | ✅ | ✅ | ✅ 다수 | ✅ 다수 |
| Neon | 11 | ❌ | ✅ (ap-northeast-1) | ✅ | ✅ |
| PlanetScale | 12 | ❌ | ✅ | ✅ | ✅ |
| Vercel | 글로벌 엣지 | ✅ | ✅ | ✅ | ✅ |

---

## 10. 성능 최적화 권장 사항

### 10-1. Supabase 성능 최적화

**데이터베이스 최적화**
```sql
-- 1. 인덱스 확인 및 추가
CREATE INDEX CONCURRENTLY idx_orders_user_id ON orders(user_id);
CREATE INDEX CONCURRENTLY idx_orders_created_at ON orders(created_at DESC);

-- 2. 복합 인덱스 (자주 사용하는 WHERE 조합)
CREATE INDEX CONCURRENTLY idx_orders_user_status 
ON orders(user_id, status) WHERE status != 'cancelled';

-- 3. EXPLAIN ANALYZE로 쿼리 플랜 확인
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM orders WHERE user_id = '...' ORDER BY created_at DESC LIMIT 20;

-- 4. pgvector HNSW 인덱스 (벡터 검색 최적화)
CREATE INDEX ON embeddings USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

**연결 관리 최적화**
```typescript
// Next.js/Vercel 환경: 반드시 Connection Pooler 사용
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    db: {
      // Transaction 모드 (서버리스 최적)
      // URL: postgres://[user]@[host]:6543/postgres?pgbouncer=true
    }
  }
);
```

**Edge Function 최적화**
```typescript
// 데이터 직렬화 최소화
// Deno 런타임 모듈 캐싱 활용
// DB 쿼리 결과를 캐시하여 반복 쿼리 방지
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 싱글톤 패턴으로 클라이언트 재사용
let supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (!supabaseClient) {
    supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
  }
  return supabaseClient;
}
```

### 10-2. Firebase 성능 최적화

**Firestore 읽기 최소화**
```typescript
// 1. 오프라인 캐시 활성화 (무료 읽기 절감)
import { enableMultiTabIndexedDbPersistence } from 'firebase/firestore';
await enableMultiTabIndexedDbPersistence(db);

// 2. 실시간 리스너 대신 캐시 우선 읽기
import { getDocFromCache, getDocFromServer } from 'firebase/firestore';

// 3. 복합 인덱스 사전 생성 (자동 인덱스 빌드 비용 방지)
// firestore.indexes.json에 사전 정의

// 4. 페이지네이션으로 대량 읽기 분산
const q = query(
  collection(db, 'products'),
  orderBy('createdAt', 'desc'),
  startAfter(lastVisible),
  limit(20)
);
```

**콜드 스타트 최소화 (Firebase Functions Gen2)**
```typescript
// firebase.json
{
  "functions": {
    "minInstances": 1,  // 항상 1개 인스턴스 유지 (콜드 스타트 방지)
    "maxInstances": 100,
    "memory": "256MiB",
    "timeoutSeconds": 60
  }
}
```

### 10-3. Neon 성능 최적화

**콜드 스타트 방지**
```typescript
// 옵션 1: 최소 컴퓨트 유지 설정 (유료)
// Neon Console → 프로젝트 설정 → 컴퓨트 → "Suspend compute after" 비활성화

// 옵션 2: 주기적 ping (무료 해결책)
// Vercel Cron Job 또는 GitHub Actions로 매 5분마다 쿼리 실행
export async function GET() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`SELECT 1`; // 워밍 ping
  return Response.json({ ok: true });
}
```

**서버리스 연결 최적화**
```typescript
// Neon serverless driver 사용 (HTTP 기반, 연결 오버헤드 없음)
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL!);

// 일반 pg 드라이버 대신 neon() 사용
const users = await sql`SELECT * FROM users WHERE id = ${userId}`;
```

### 10-4. 공통 성능 최적화 원칙

| 최적화 영역 | 전략 | 효과 |
|---|---|---|
| **DB 인덱스** | WHERE, ORDER BY, JOIN 컬럼에 인덱스 | 쿼리 속도 10~1000배 개선 |
| **Connection Pooling** | PgBouncer/Supavisor 사용 | 연결 수 90% 절감 |
| **CDN 캐싱** | 정적 자산 CDN 서빙 | TTFB 80~95% 개선 |
| **쿼리 캐싱** | Redis/Upstash로 자주 읽는 데이터 캐시 | DB 부하 50~90% 절감 |
| **페이지네이션** | LIMIT/OFFSET 또는 커서 기반 | 대량 데이터 처리 안정화 |
| **N+1 방지** | JOIN 쿼리 또는 배치 조회 | 쿼리 수 N배 절감 |
| **이미지 최적화** | WebP 변환, 리사이징, 지연 로딩 | 전송량 50~70% 절감 |
| **엣지 함수 활용** | 자주 호출되는 경량 API를 엣지로 이전 | 레이턴시 10~100ms 단축 |

---

## 성능 선택 가이드 요약

| 요구사항 | 최적 플랫폼 | 이유 |
|---|---|---|
| 최저 레이턴시 SQL (한국) | Supabase (서울 리전) | PostgreSQL 직접 쿼리, 한국 리전 지원 |
| 대규모 동시 쓰기 | Firebase Firestore | 자동 수평 스케일, 50K+ 동시 쓰기 |
| 서버리스 콜드 스타트 최소화 | Supabase Edge Functions | ~50ms 콜드 스타트 |
| 오프라인 동기화 필수 | Firebase RTDB/Firestore | 네이티브 오프라인 지원 |
| 벡터 검색 성능 | Supabase (pgvector HNSW) | PostgreSQL 내장 ANN 검색 |
| 최고 가용성 (Five Nines) | Firebase (멀티리전) / AWS DynamoDB | 99.999% SLA |
| 서버리스 DB 비용 최적화 | Neon (Scale-to-Zero) | 아이들 시 비용 = $0 |
| MySQL 대규모 수평 확장 | PlanetScale (Vitess) | 자동 샤딩, 무제한 스케일 |

---

*참고 출처: Supabase Docs (Limits, SLA), Firebase Docs (Quotas), Google Cloud Firestore SLA, AWS DynamoDB SLA, Neon Docs, Vercel Docs (Limits), Tech-Insider 벤치마크 (2026), Hackceleration 리뷰 (2026), 커뮤니티 벤치마크 (DEV Community, 2025~2026)*
