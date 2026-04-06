# 전체 서비스 기능 매트릭스: BaaS/백엔드 플랫폼 비교

> 작성일: 2026-04-06  
> 비교 대상: Supabase / Firebase / AWS Amplify / Appwrite  
> 목적: 플랫폼 선택 의사결정을 위한 종합 기능 비교

---

## 목차

1. [한눈에 보는 플랫폼 개요](#1-한눈에-보는-플랫폼-개요)
2. [Database 기능 비교](#2-database-기능-비교)
3. [Auth(인증) 기능 비교](#3-auth인증-기능-비교)
4. [Storage 기능 비교](#4-storage-기능-비교)
5. [Functions(서버리스 함수) 비교](#5-functions서버리스-함수-비교)
6. [Realtime 기능 비교](#6-realtime-기능-비교)
7. [Vector / AI 기능 비교](#7-vector--ai-기능-비교)
8. [Cron / Queues 기능 비교](#8-cron--queues-기능-비교)
9. [Studio / Dashboard 비교](#9-studio--dashboard-비교)
10. [CLI 도구 비교](#10-cli-도구-비교)
11. [Self-hosting 비교](#11-self-hosting-비교)
12. [종합 점수 및 분석](#12-종합-점수-및-분석)
13. [선택 가이드](#13-선택-가이드)

---

## 1. 한눈에 보는 플랫폼 개요

| 항목 | Supabase | Firebase | AWS Amplify | Appwrite |
|---|---|---|---|---|
| 출시 | 2020 | 2011 (Google 인수 2014) | 2017 | 2019 |
| 데이터베이스 타입 | PostgreSQL (관계형) | Firestore/RTDB (NoSQL) | DynamoDB/AppSync (NoSQL/GraphQL) | MariaDB/내장 DB |
| 오픈소스 | ✅ 완전 오픈소스 | ❌ 독점 (Google) | ❌ 독점 (AWS) | ✅ 완전 오픈소스 |
| 주요 언어 | TypeScript/Deno | Node.js/다양 | Node.js/다양 | Node.js/Python/Ruby/PHP/Dart/Go |
| 배포 방식 | 클라우드 + 셀프호스팅 | 클라우드만 | 클라우드만 | 클라우드 + 셀프호스팅 |
| 주요 특징 | PostgreSQL 기반 올인원 | Google 생태계 통합 | AWS 서비스 통합 | 멀티언어 오픈소스 |
| 적합 대상 | SQL 선호 개발자, 스타트업 | 모바일/빠른 프로토타이핑 | AWS 기반 엔터프라이즈 | 오픈소스 선호, 멀티언어 팀 |

---

## 2. Database 기능 비교

### 2-1. 데이터베이스 엔진 및 쿼리

| 기능 | Supabase | Firebase | AWS Amplify | Appwrite |
|---|---|---|---|---|
| 관계형 DB (SQL) | ✅ PostgreSQL | ❌ NoSQL만 | ⚠️ Aurora Serverless (추가 설정 필요) | ⚠️ MariaDB (일부 제한) |
| 문서형 NoSQL | ⚠️ JSONB 컬럼으로 지원 | ✅ Firestore + RTDB | ✅ DynamoDB | ✅ 내장 문서 DB |
| JOIN 쿼리 | ✅ 완전 지원 | ❌ 미지원 | ⚠️ AppSync/GraphQL 통해서만 | ⚠️ 제한적 |
| Full-text Search | ✅ PostgreSQL FTS | ⚠️ 제한적 | ⚠️ OpenSearch 연동 필요 | ⚠️ 제한적 |
| 트랜잭션 (ACID) | ✅ PostgreSQL ACID | ⚠️ 단일 문서만 | ⚠️ 제한적 | ⚠️ 제한적 |
| 복잡 집계 쿼리 | ✅ SQL GROUP BY/HAVING 등 | ❌ 매우 제한적 | ⚠️ GraphQL 쿼리 필요 | ⚠️ 제한적 |
| Row Level Security | ✅ PostgreSQL RLS | ⚠️ 보안 규칙 방식 | ⚠️ IAM/AppSync 방식 | ✅ 권한 시스템 |
| 데이터 마이그레이션 | ✅ 표준 SQL 마이그레이션 | ❌ 공식 마이그레이션 없음 | ⚠️ 복잡 | ✅ 마이그레이션 지원 |
| 지리공간 (GIS) | ✅ PostGIS 확장 | ⚠️ 제한적 | ⚠️ 별도 구성 필요 | ❌ 미지원 |
| 시계열 데이터 | ✅ TimescaleDB 확장 가능 | ❌ 비효율 | ⚠️ Timestream 연동 | ❌ 미지원 |

### 2-2. 데이터베이스 확장성

| 기능 | Supabase | Firebase | AWS Amplify | Appwrite |
|---|---|---|---|---|
| 읽기 복제본 | ✅ Pro/Enterprise | ⚠️ 자동 (멀티리전) | ✅ Aurora 복제본 | ⚠️ 셀프호스팅만 |
| 자동 스케일링 | ⚠️ 수직 스케일 (수동) | ✅ 자동 | ✅ Aurora Serverless 자동 | ⚠️ 제한적 |
| 멀티리전 | ⚠️ Enterprise만 | ✅ 기본 제공 | ✅ 글로벌 CDN | ⚠️ 셀프호스팅 구성 필요 |
| Connection Pooling | ✅ Supavisor (PgBouncer) | N/A | ⚠️ 별도 구성 | ⚠️ 제한적 |
| 브랜칭 (DB Branch) | ✅ Supabase Branches | ❌ 미지원 | ❌ 미지원 | ❌ 미지원 |

> **분석**: Supabase는 PostgreSQL의 모든 장점을 그대로 제공하여 복잡한 쿼리, ACID 트랜잭션, 확장 기능에서 압도적 우위. Firebase는 단순 문서 조회에 최적화되어 있어 복잡한 관계형 데이터에는 적합하지 않음. AWS Amplify는 AppSync/GraphQL 레이어를 통한 DynamoDB 접근이 초기 설정 복잡도가 높음.

---

## 3. Auth(인증) 기능 비교

### 3-1. 인증 방법

| 기능 | Supabase | Firebase | AWS Amplify | Appwrite |
|---|---|---|---|---|
| 이메일/비밀번호 | ✅ | ✅ | ✅ | ✅ |
| 매직 링크 (이메일) | ✅ | ⚠️ 비표준 | ⚠️ 커스텀 필요 | ✅ |
| 소셜 로그인 (OAuth) | ✅ 20+ 프로바이더 | ✅ 다양 | ✅ Cognito 기반 | ✅ 30+ 프로바이더 |
| 전화번호 OTP | ✅ | ✅ | ✅ | ✅ |
| SAML SSO | ✅ Enterprise | ⚠️ 제한적 | ✅ Cognito 기반 | ✅ |
| MFA (다중인증) | ✅ TOTP/SMS | ✅ | ✅ | ✅ |
| 익명 로그인 | ✅ | ✅ | ⚠️ | ✅ |
| JWT 커스터마이징 | ✅ | ⚠️ 제한적 | ⚠️ Cognito 제한 | ✅ |
| 사용자 관리 UI | ✅ Dashboard | ✅ Console | ⚠️ Cognito Console | ✅ Console |

### 3-2. 권한 및 세션 관리

| 기능 | Supabase | Firebase | AWS Amplify | Appwrite |
|---|---|---|---|---|
| 역할 기반 접근 제어 (RBAC) | ✅ PostgreSQL RLS + 역할 | ⚠️ 보안 규칙 | ✅ IAM 기반 | ✅ 팀/역할 시스템 |
| 세션 관리 | ✅ JWT (Refresh Token) | ✅ | ✅ | ✅ |
| 세션 만료 커스터마이징 | ✅ | ⚠️ 제한적 | ✅ | ✅ |
| 서드파티 Auth 통합 | ✅ (Clerk, Auth0 등) | ⚠️ 제한적 | ✅ 다양한 IdP | ⚠️ |
| 조직/팀 관리 | ✅ | ❌ | ⚠️ | ✅ |

> **분석**: 4개 플랫폼 모두 기본 인증 기능은 충족. Supabase는 PostgreSQL RLS와의 통합이 매우 강력하여 복잡한 데이터 접근 제어에 유리. Appwrite는 팀/조직 개념이 내장되어 B2B SaaS에 적합. AWS Amplify는 Cognito를 통한 엔터프라이즈 SSO에 강점.

---

## 4. Storage 기능 비교

### 4-1. 파일 스토리지

| 기능 | Supabase | Firebase | AWS Amplify | Appwrite |
|---|---|---|---|---|
| 파일 업로드/다운로드 | ✅ | ✅ | ✅ S3 기반 | ✅ |
| 이미지 변환 (리사이징 등) | ✅ Imgproxy 내장 | ⚠️ Extensions 필요 | ⚠️ Lambda 트리거 | ⚠️ 제한적 |
| CDN 배포 | ✅ | ✅ Firebase Hosting CDN | ✅ CloudFront | ⚠️ 제한적 |
| 접근 제어 (버킷 정책) | ✅ RLS 기반 | ✅ 보안 규칙 | ✅ S3 버킷 정책 | ✅ |
| 서명된 URL | ✅ | ✅ | ✅ | ✅ |
| 대용량 파일 청크 업로드 | ✅ TUS 프로토콜 | ✅ | ✅ | ✅ |
| 스토리지 트리거 (함수 연동) | ✅ | ✅ | ✅ S3 이벤트 | ✅ |
| 멀티 버킷 | ✅ | ✅ | ✅ | ✅ |

> **분석**: Supabase는 이미지 변환 기능을 내장하여 별도 서비스 없이 썸네일 생성 등이 가능. Firebase Storage는 Google Cloud Storage 기반으로 안정성 높음. AWS Amplify는 S3/CloudFront 통해 가장 높은 내구성과 성능 제공.

---

## 5. Functions(서버리스 함수) 비교

### 5-1. 함수 지원 언어 및 런타임

| 기능 | Supabase | Firebase | AWS Amplify | Appwrite |
|---|---|---|---|---|
| JavaScript/TypeScript | ✅ Deno 기반 | ✅ Node.js | ✅ Node.js | ✅ |
| Python | ❌ | ✅ | ✅ Lambda | ✅ |
| Go | ❌ | ✅ | ✅ Lambda | ✅ |
| Ruby | ❌ | ❌ | ✅ Lambda | ✅ |
| PHP | ❌ | ❌ | ❌ | ✅ |
| Dart/Flutter | ❌ | ✅ | ❌ | ✅ |
| Java | ❌ | ✅ | ✅ Lambda | ❌ |
| 커스텀 런타임 | ❌ | ❌ | ✅ Lambda Layer | ❌ |

### 5-2. 함수 실행 특성

| 기능 | Supabase | Firebase | AWS Amplify | Appwrite |
|---|---|---|---|---|
| 엣지 함수 (CDN 엣지) | ✅ Deno Edge | ⚠️ Firebase Hosting | ⚠️ CloudFront Lambda@Edge | ❌ |
| 콜드 스타트 시간 | ✅ ~50ms (Edge) | ⚠️ 200ms~2s (Gen1) / 100ms (Gen2) | ⚠️ 100ms~1s | ⚠️ 100ms~500ms |
| 최대 실행 시간 | 150초 (Edge) | 9분 (Gen1) / 60분 (Gen2) | 15분 (Lambda) | 15분 |
| 최대 메모리 | 150MB (Edge) | 8GB (Gen2) | 10GB (Lambda) | 512MB~2GB |
| DB 직접 접근 | ✅ PostgreSQL 직접 | ⚠️ Firebase Admin SDK | ⚠️ VPC 설정 필요 | ✅ |
| HTTP 엔드포인트 | ✅ | ✅ | ✅ API Gateway | ✅ |
| 비동기 트리거 (DB 이벤트) | ✅ DB Webhooks | ✅ Firestore 트리거 | ✅ DynamoDB 스트림 | ✅ |

> **분석**: 멀티언어 지원에서 AWS Amplify(Lambda)와 Appwrite가 가장 유연. Supabase는 TypeScript/Deno 기반 엣지 함수에 특화되어 있어 빠른 응답이 필요한 API 레이어에 적합하지만 언어 다양성은 부족. Firebase Gen2는 장시간 실행 함수 지원으로 대폭 개선됨.

---

## 6. Realtime 기능 비교

### 6-1. 실시간 지원 방식

| 기능 | Supabase | Firebase | AWS Amplify | Appwrite |
|---|---|---|---|---|
| WebSocket | ✅ 네이티브 | ✅ RTDB | ✅ AppSync Subscriptions | ✅ |
| DB 변경사항 구독 | ✅ PostgreSQL CDC | ✅ Firestore 리스너 | ✅ DynamoDB 스트림 | ✅ |
| Broadcast (P2P 메시지) | ✅ | ❌ | ❌ | ⚠️ |
| Presence (온라인 상태) | ✅ | ❌ | ❌ | ⚠️ |
| 채널/룸 개념 | ✅ | ❌ | ⚠️ 별도 구성 | ⚠️ |
| 초당 메시지 처리 | ✅ 높음 | ✅ 매우 높음 (RTDB) | ⚠️ 제한 있음 | ⚠️ |
| 오프라인 동기화 | ⚠️ 클라이언트 수준 | ✅ 네이티브 (RTDB/Firestore) | ✅ DataStore | ⚠️ |

### 6-2. 실시간 제한 및 성능

| 항목 | Supabase Free | Supabase Pro | Firebase Spark | Firebase Blaze |
|---|---|---|---|---|
| 동시 Realtime 접속 | 200 | 500 | 100 (RTDB) | 무제한 (비용 증가) |
| 최대 채널 수 | 100 | 무제한 | N/A | N/A |
| 메시지 크기 제한 | 1MB | 1MB | 32KB (RTDB) | 1MB (Firestore) |

> **분석**: Firebase RTDB는 오프라인 동기화와 빠른 실시간 메시지 처리에서 역사적 강점. Supabase Realtime은 PostgreSQL CDC 기반으로 DB 변경사항을 실시간으로 스트리밍하는 데 강점이 있으며, Broadcast/Presence 기능으로 게임/협업 도구에도 적용 가능. AWS Amplify는 AppSync GraphQL Subscriptions 방식으로 쿼리와 실시간 구독이 통합됨.

---

## 7. Vector / AI 기능 비교

### 7-1. 벡터 데이터베이스 및 임베딩

| 기능 | Supabase | Firebase | AWS Amplify | Appwrite |
|---|---|---|---|---|
| 벡터 스토리지 | ✅ pgvector (네이티브) | ⚠️ 2025년 11월 추가 (별도 서비스) | ⚠️ OpenSearch 연동 | ❌ |
| 유사도 검색 (ANN) | ✅ pgvector HNSW/IVFFlat | ⚠️ 제한적 | ⚠️ Knn 쿼리 (OpenSearch) | ❌ |
| 임베딩 자동 생성 | ✅ pg_cron + Edge Functions | ⚠️ 별도 구성 | ⚠️ Lambda + Bedrock | ❌ |
| LLM 통합 | ✅ OpenAI, HuggingFace 1급 지원 | ✅ Gemini AI 통합 | ✅ AWS Bedrock | ⚠️ 커스텀 필요 |
| RAG 파이프라인 구축 | ✅ 내장 툴킷 | ⚠️ 복잡한 구성 필요 | ⚠️ 다중 서비스 구성 | ❌ |
| 시맨틱 검색 | ✅ | ⚠️ | ⚠️ | ❌ |
| AI 추천 엔진 | ✅ pgvector 기반 | ⚠️ | ⚠️ Personalize 별도 | ❌ |

### 7-2. AI/ML 부가 기능

| 기능 | Supabase | Firebase | AWS Amplify | Appwrite |
|---|---|---|---|---|
| ML 모델 호스팅 | ❌ | ✅ Firebase ML | ✅ SageMaker | ❌ |
| 비전 API (이미지 인식) | ❌ | ✅ Firebase ML (Vision) | ✅ Rekognition | ❌ |
| 자연어 처리 | ❌ (LLM API 활용) | ✅ Vertex AI 연동 | ✅ Comprehend | ❌ |
| 엣지 AI 추론 | ❌ | ✅ 온디바이스 ML | ❌ | ❌ |

> **분석**: AI/벡터 기능에서 Supabase가 현재 가장 개발자 친화적인 통합을 제공. pgvector를 통해 별도 벡터 DB 없이 PostgreSQL 안에서 임베딩 저장 및 유사도 검색 가능. Firebase는 Google AI(Gemini) 생태계와의 통합이 강점. AWS Amplify는 Bedrock/SageMaker를 통한 엔터프라이즈 ML 파이프라인에 강점.

---

## 8. Cron / Queues 기능 비교

### 8-1. 스케줄링 (Cron)

| 기능 | Supabase | Firebase | AWS Amplify | Appwrite |
|---|---|---|---|---|
| Cron 스케줄러 | ✅ pg_cron (네이티브) | ✅ Cloud Scheduler 연동 | ✅ EventBridge 스케줄러 | ✅ 내장 Cron |
| SQL 직접 실행 Cron | ✅ | ❌ | ❌ | ❌ |
| Edge Function Cron | ✅ | ✅ (Cloud Scheduler → Functions) | ✅ (EventBridge → Lambda) | ✅ |
| Webhook Cron | ✅ | ✅ | ✅ | ✅ |
| 최소 실행 간격 | 1분 | 1분 | 1분 | 1분 |
| Cron 모니터링 UI | ✅ Dashboard | ⚠️ Cloud Console | ⚠️ AWS Console | ✅ |

### 8-2. 메시지 큐

| 기능 | Supabase | Firebase | AWS Amplify | Appwrite |
|---|---|---|---|---|
| 메시지 큐 내장 | ✅ pgmq (Postgres 기반) | ❌ Cloud Tasks 별도 | ✅ SQS/SNS (별도 서비스) | ❌ |
| 보장 전달 | ✅ | ⚠️ Cloud Tasks | ✅ SQS | ❌ |
| Dead Letter Queue | ✅ | ⚠️ Cloud Tasks | ✅ SQS DLQ | ❌ |
| 지연 메시지 | ✅ | ⚠️ Cloud Tasks | ✅ | ❌ |
| 우선순위 큐 | ⚠️ | ❌ | ✅ SQS FIFO | ❌ |
| 시각화/모니터링 | ✅ Dashboard | ❌ | ✅ AWS Console | ❌ |

> **분석**: Supabase는 pg_cron과 pgmq를 통해 Postgres 안에서 Cron 및 Queue를 완결하는 독특한 접근법 제공. AWS Amplify는 EventBridge + SQS + SNS 조합으로 가장 강력하고 유연한 이벤트 아키텍처 구성 가능하나 설정 복잡도 높음. Firebase와 Appwrite는 네이티브 큐 지원 미흡.

---

## 9. Studio / Dashboard 비교

### 9-1. 관리 인터페이스

| 기능 | Supabase | Firebase | AWS Amplify | Appwrite |
|---|---|---|---|---|
| 웹 기반 DB 에디터 | ✅ Table Editor + SQL Editor | ✅ Firestore Data Viewer | ⚠️ DynamoDB Console | ✅ Database 뷰 |
| 쿼리 자동완성 | ✅ AI 보조 SQL Editor | ❌ | ❌ | ⚠️ |
| 스키마 시각화 | ✅ Entity Relationship 뷰 | ❌ (문서형) | ❌ | ⚠️ |
| 사용자 관리 UI | ✅ | ✅ | ✅ Cognito | ✅ |
| 함수 로그 보기 | ✅ | ✅ | ✅ CloudWatch | ✅ |
| Storage 파일 브라우저 | ✅ | ✅ | ⚠️ S3 Console | ✅ |
| API 문서 자동생성 | ✅ (PostgREST 기반) | ❌ | ⚠️ API Gateway Swagger | ❌ |
| Realtime 로그 | ✅ | ⚠️ | ⚠️ | ✅ |
| 사용량/비용 대시보드 | ✅ | ✅ | ✅ | ✅ |
| 다크 모드 | ✅ | ✅ | ⚠️ | ✅ |

### 9-2. 개발자 경험 (DX)

| 항목 | Supabase | Firebase | AWS Amplify | Appwrite |
|---|---|---|---|---|
| 초기 셋업 시간 | ✅ 5분 이내 | ✅ 5분 이내 | ⚠️ 30~60분 | ✅ 10~15분 |
| 문서 품질 | ✅ 매우 우수 | ✅ 우수 | ⚠️ 복잡 | ✅ 우수 |
| SDK 품질 | ✅ | ✅ | ⚠️ 복잡 | ✅ |
| 커뮤니티 크기 | ✅ 빠르게 성장 중 | ✅ 대규모 | ✅ 대규모 | ✅ 성장 중 |

> **분석**: Supabase Dashboard는 데이터베이스 중심 개발자에게 가장 친화적인 UI 제공. SQL Editor에 AI 보조 기능 탑재로 스키마 설계부터 쿼리 최적화까지 지원. Firebase Console은 모바일 개발자 중심의 단순화된 UI. AWS Amplify/Cognito는 UI가 복잡하지만 엔터프라이즈 수준의 세밀한 제어 가능.

---

## 10. CLI 도구 비교

### 10-1. CLI 기능 범위

| 기능 | Supabase CLI | Firebase CLI | AWS Amplify CLI | Appwrite CLI |
|---|---|---|---|---|
| 로컬 개발 환경 | ✅ `supabase start` (Docker) | ✅ Firebase Emulator | ✅ Amplify Sandbox | ✅ |
| DB 마이그레이션 | ✅ `supabase db push/pull` | ❌ | ❌ | ✅ |
| 타입 자동생성 | ✅ `supabase gen types` | ❌ | ✅ (GraphQL 타입) | ✅ |
| 함수 배포 | ✅ `supabase functions deploy` | ✅ `firebase deploy` | ✅ `amplify push` | ✅ |
| 환경변수 관리 | ✅ | ✅ | ✅ | ✅ |
| CI/CD 통합 | ✅ GitHub Actions 지원 | ✅ | ✅ | ✅ |
| 로컬-원격 동기화 | ✅ | ✅ Firebase Emulator | ✅ | ✅ |
| Seed 데이터 관리 | ✅ | ❌ | ❌ | ⚠️ |
| 멀티 환경 (dev/staging/prod) | ✅ | ✅ | ✅ | ✅ |

### 10-2. CLI 설치 및 사용성

| 항목 | Supabase | Firebase | AWS Amplify | Appwrite |
|---|---|---|---|---|
| 설치 방법 | npm / Homebrew / Binary | npm | npm (amplify-cli) | npm / Docker |
| 로컬 에뮬레이터 포함 | ✅ Docker Compose 포함 | ✅ Emulator Suite | ✅ LocalStack 부분 지원 | ✅ Docker |
| Windows 지원 | ✅ | ✅ | ✅ | ✅ |
| 학습 곡선 | ✅ 낮음 | ✅ 낮음 | ⚠️ 높음 | ✅ 낮음 |

> **분석**: Supabase CLI는 TypeScript 타입 자동생성 및 DB 마이그레이션 관리에서 가장 강력. `supabase start`로 로컬 Docker 환경이 즉시 구동되어 프로덕션과 동일한 환경에서 개발 가능. AWS Amplify CLI는 기능이 풍부하지만 복잡도가 높아 학습 비용 발생.

---

## 11. Self-hosting 비교

### 11-1. 셀프호스팅 지원

| 기능 | Supabase | Firebase | AWS Amplify | Appwrite |
|---|---|---|---|---|
| 오픈소스 라이선스 | ✅ Apache 2.0 | ❌ 독점 | ❌ 독점 | ✅ BSD 3-Clause |
| Docker 배포 | ✅ | ❌ | ❌ | ✅ (1개 컨테이너) |
| Kubernetes 지원 | ✅ Helm Chart | ❌ | ❌ | ✅ Helm Chart |
| VPS 1대 배포 | ✅ | ❌ | ❌ | ✅ (~$5/월 VPS) |
| 클라우드 선택 자유 | ✅ | ❌ GCP만 | ❌ AWS만 | ✅ |
| 셀프호스팅 비용 | 인프라 비용만 | 해당 없음 | 해당 없음 | 인프라 비용만 |
| 기술 지원 | 커뮤니티 (Pro 유료 지원) | 해당 없음 | 해당 없음 | 커뮤니티 (유료 지원) |
| 데이터 주권 | ✅ 완전 통제 | ❌ Google 서버 | ❌ AWS 서버 | ✅ 완전 통제 |
| GDPR 컴플라이언스 | ✅ 셀프호스팅 시 완전 통제 | ⚠️ 데이터 센터 선택 제한 | ⚠️ 리전 선택 가능 | ✅ |
| 업데이트 관리 | 수동 (자체 책임) | N/A | N/A | 수동 (자체 책임) |

### 11-2. 셀프호스팅 난이도

| 항목 | Supabase | Appwrite |
|---|---|---|
| 필요 컴포넌트 | PostgreSQL, Auth, Storage, Realtime, Edge Runtime, Studio | 단일 Docker 컴포즈 |
| 최소 서버 스펙 | 2 vCPU, 4GB RAM | 1 vCPU, 2GB RAM |
| 설치 복잡도 | ⚠️ 중간 (여러 서비스 구성) | ✅ 낮음 (단일 컨테이너) |
| 운영 복잡도 | ⚠️ 중간 | ✅ 낮음 |

> **분석**: 데이터 주권과 비용 통제가 중요한 경우 Supabase 또는 Appwrite의 셀프호스팅이 유일한 선택지. Appwrite는 단일 Docker 컨테이너로 훨씬 간단하게 배포 가능. Supabase 셀프호스팅은 여러 서비스 구성이 필요하나 PostgreSQL의 모든 기능을 그대로 활용 가능. Firebase/AWS Amplify는 셀프호스팅 불가.

---

## 12. 종합 점수 및 분석

### 12-1. 카테고리별 점수표 (5점 만점)

| 카테고리 | Supabase | Firebase | AWS Amplify | Appwrite |
|---|---|---|---|---|
| Database | ⭐⭐⭐⭐⭐ (5) | ⭐⭐⭐ (3) | ⭐⭐⭐⭐ (4) | ⭐⭐⭐ (3) |
| Auth | ⭐⭐⭐⭐ (4) | ⭐⭐⭐⭐ (4) | ⭐⭐⭐⭐ (4) | ⭐⭐⭐⭐ (4) |
| Storage | ⭐⭐⭐⭐ (4) | ⭐⭐⭐⭐ (4) | ⭐⭐⭐⭐⭐ (5) | ⭐⭐⭐ (3) |
| Functions | ⭐⭐⭐ (3) | ⭐⭐⭐⭐ (4) | ⭐⭐⭐⭐⭐ (5) | ⭐⭐⭐⭐ (4) |
| Realtime | ⭐⭐⭐⭐ (4) | ⭐⭐⭐⭐⭐ (5) | ⭐⭐⭐ (3) | ⭐⭐⭐ (3) |
| Vector/AI | ⭐⭐⭐⭐⭐ (5) | ⭐⭐⭐ (3) | ⭐⭐⭐⭐ (4) | ⭐ (1) |
| Cron/Queues | ⭐⭐⭐⭐⭐ (5) | ⭐⭐⭐ (3) | ⭐⭐⭐⭐⭐ (5) | ⭐⭐ (2) |
| Studio/Dashboard | ⭐⭐⭐⭐⭐ (5) | ⭐⭐⭐⭐ (4) | ⭐⭐⭐ (3) | ⭐⭐⭐⭐ (4) |
| CLI | ⭐⭐⭐⭐⭐ (5) | ⭐⭐⭐⭐ (4) | ⭐⭐⭐ (3) | ⭐⭐⭐⭐ (4) |
| Self-hosting | ⭐⭐⭐⭐ (4) | ❌ (0) | ❌ (0) | ⭐⭐⭐⭐⭐ (5) |
| **합계** | **44** | **34** | **36** | **33** |

### 12-2. 강점 및 약점 요약

**Supabase**
- 강점: PostgreSQL 전체 기능, pgvector AI, 내장 Cron/Queue, 탁월한 DX, 오픈소스
- 약점: 함수 언어 제한(TypeScript만), 고가용성은 Enterprise 플랜 필요, 상대적으로 신생 플랫폼

**Firebase**
- 강점: 오프라인 동기화, 실시간 RTDB, Google AI 통합, 모바일 SDK 성숙도, 광범위한 커뮤니티
- 약점: 벤더 종속(Google), 복잡한 쿼리 불가, 예측 어려운 비용 구조, 셀프호스팅 불가

**AWS Amplify**
- 강점: 다양한 AWS 서비스 통합, 엔터프라이즈 스케일, 최대 런타임 다양성, 글로벌 인프라
- 약점: 높은 학습 곡선, 복잡한 설정, 개발자 경험 불친절, AWS 종속

**Appwrite**
- 강점: 완전 오픈소스, 셀프호스팅 최강, 멀티언어 함수, B2B 팀 관리, 단순한 아키텍처
- 약점: Vector/AI 기능 없음, Queue 없음, 규모 확장성 미흡, 성숙도 부족

---

## 13. 선택 가이드

### 상황별 추천

| 상황 | 추천 플랫폼 | 이유 |
|---|---|---|
| SQL + 빠른 MVP | **Supabase** | PostgreSQL + 즉시 API + 탁월한 DX |
| 모바일 앱 (오프라인 지원) | **Firebase** | RTDB 오프라인 동기화 최강 |
| AI/RAG 애플리케이션 | **Supabase** | pgvector 네이티브 통합 |
| 엔터프라이즈 AWS 환경 | **AWS Amplify** | 기존 AWS 인프라 통합 |
| 완전한 데이터 주권 필요 | **Appwrite** | 셀프호스팅 가장 간단 |
| 멀티언어 팀 | **Appwrite** / **Firebase** | 다양한 런타임 지원 |
| 실시간 협업 도구 | **Supabase** / **Firebase** | Broadcast/Presence or RTDB |
| 글로벌 서비스 저지연 | **Firebase** / **AWS Amplify** | 멀티리전 기본 지원 |
| 오픈소스 기여/감사 필요 | **Supabase** / **Appwrite** | Apache 2.0 / BSD 3-Clause |
| B2B SaaS 조직 관리 | **Appwrite** | 팀/조직 개념 내장 |

### 2026년 트렌드 관점

1. **AI 통합**: Supabase pgvector가 사실상 표준으로 자리잡음. Firebase도 Gemini 3.1 통합으로 추격 중
2. **엣지 컴퓨팅**: Supabase Edge Functions(Deno)가 콜드 스타트 ~50ms 달성으로 Firebase Gen1 대비 압도적
3. **오픈소스 모멘텀**: Supabase GitHub Star 80,000+, Appwrite 40,000+로 커뮤니티 급성장
4. **벤더 종속 탈피**: GDPR, 데이터 주권 이슈로 셀프호스팅 가능 플랫폼 수요 증가

---

*참고 출처: Supabase Docs, Firebase Docs, AWS Amplify Docs, Appwrite Docs, UI Bakery Blog, Hackceleration, SQLFlash AI (2026-04 기준)*
