# Supabase vs Firebase 종합 비교 (2025-2026)

> 작성일: 2026-04-06  
> 목적: 기술 선택 의사결정을 위한 심층 비교 분석  
> 대상 독자: 백엔드 플랫폼 선택을 고민하는 개발자 및 아키텍트

---

## 목차

1. [플랫폼 철학 비교](#1-플랫폼-철학-비교)
2. [서비스별 1:1 비교](#2-서비스별-11-비교)
   - 2.1 [Database](#21-database--postgresql-vs-firestore--rtdb)
   - 2.2 [Authentication](#22-authentication--gotrue-vs-firebase-auth)
   - 2.3 [Storage](#23-storage--s3-호환-vs-cloud-storage)
   - 2.4 [Functions](#24-functions--deno-edge-functions-vs-cloud-functions)
   - 2.5 [Realtime](#25-realtime--phoenix-channels-vs-firestore-리스너)
   - 2.6 [Hosting / Self-hosting](#26-hosting--self-hosting-가능-vs-lock-in)
3. [가격 비교](#3-가격-비교)
4. [DX(개발자 경험) 비교](#4-dx개발자-경험-비교)
5. [성능 비교](#5-성능-비교)
6. [마이그레이션 경로](#6-마이그레이션-경로--firebase--supabase)
7. [언제 어떤 것을 선택해야 하는가](#7-언제-어떤-것을-선택해야-하는가)
8. [스코어링 매트릭스](#8-스코어링-매트릭스)
9. [결론](#9-결론)

---

## 1. 플랫폼 철학 비교

### 1.1 핵심 철학의 차이

| 항목 | Supabase | Firebase |
|------|----------|----------|
| **소스 모델** | 오픈소스 (MIT/Apache 2) | 독점 (Google Cloud 종속) |
| **데이터 모델** | 관계형 SQL (PostgreSQL) | 비관계형 NoSQL (Firestore / RTDB) |
| **소유자** | 독립 스타트업 (2020 설립) | Google LLC |
| **자체 호스팅** | 가능 (Docker, K8s) | 불가능 |
| **벤더 종속** | 낮음 — 표준 PostgreSQL | 높음 — Google 생태계 고착 |
| **철학** | "오픈소스 Firebase 대안" | "모바일/웹 앱 올인원 BaaS" |
| **주요 언어** | TypeScript, Elixir, Go | TypeScript, Java (Android) |

### 1.2 오픈소스 vs 독점

**Supabase**는 코어 구성 요소 전체를 오픈소스로 공개한다:

- `supabase/supabase` — 메인 오케스트레이션 레이어 (GitHub 별 45,000+, 2026 Q1 기준)
- `supabase/gotrue` — Auth 서버 (MIT)
- `supabase/realtime` — Elixir/Phoenix 기반 실시간 서버 (Apache 2)
- `supabase/storage-api` — 스토리지 API (Apache 2)
- `supabase/postgrest` — REST API 자동 생성 (MIT)

오픈소스 특성 덕분에 코드를 포크하거나 커뮤니티 기여로 기능을 직접 확장할 수 있으며, 온-프레미스·사설 클라우드 배포가 가능하다.

**Firebase**는 Google이 100% 소유하는 독점 플랫폼이다. 소스 코드에 접근할 수 없으며, Google의 로드맵 결정에 사용자가 종속된다. 2012년 인수 이후 Firebase는 Google Cloud와 점진적으로 통합되어왔으며, 일부 기능(예: Firebase Extensions, Cloud Functions 2세대)은 Google Cloud 콘솔에 직접 연결된다.

### 1.3 SQL vs NoSQL — 철학적 선택

**PostgreSQL (Supabase)**:
- 데이터를 테이블, 행, 열로 구조화
- 외래 키 / 조인 / 트랜잭션 완벽 지원
- ACID 보장: 데이터 일관성이 최우선
- 스키마 마이그레이션으로 시스템적 진화 가능
- 인덱스, 뷰, 저장 프로시저, CTE 등 40년 SQL 생태계 활용

**Firestore / RTDB (Firebase)**:
- 문서(Document) → 컬렉션(Collection) 모델
- 스키마 없음 → 초기 프로토타이핑 속도 빠름
- 복잡한 조인 불가 → 비정규화 강제
- 쿼리 기능 제한적 (복합 쿼리에 인덱스 수동 생성 필요)
- 오프라인 동기화 성숙도 높음 (10년+ 최적화)

> **핵심 insight**: Firestore는 "빠른 프로토타입 + 단순한 쿼리" 앱에 적합하고,  
> PostgreSQL은 "복잡한 비즈니스 로직 + 데이터 정합성이 중요한" 앱에 적합하다.

---

## 2. 서비스별 1:1 비교

### 2.1 Database — PostgreSQL vs Firestore / RTDB

#### 데이터 모델

| 항목 | Supabase (PostgreSQL) | Firebase Firestore | Firebase RTDB |
|------|----------------------|--------------------|---------------|
| **모델** | 관계형 테이블 | 문서-컬렉션 | JSON 트리 |
| **스키마** | 강한 타입, 마이그레이션 | 스키마리스 | 스키마리스 |
| **외래 키** | 완벽 지원 | 미지원 | 미지원 |
| **조인** | JOIN 쿼리 지원 | 미지원 (수동 다중 조회) | 미지원 |
| **복합 쿼리** | SQL 전체 문법 | 제한적 (인덱스 사전 정의 필요) | 매우 제한적 |
| **전체 텍스트 검색** | 내장 (pg_trgm, tsvector) | 미지원 (Algolia 등 외부 필요) | 미지원 |
| **벡터 임베딩** | pgvector 플러그인 | 미지원 | 미지원 |

#### 쿼리 능력 비교

Supabase(PostgreSQL)에서 복잡한 집계 쿼리를 단일 SQL로 처리 가능:

```sql
-- Supabase: 사용자별 월별 매출 집계 (단일 쿼리)
SELECT
  u.name,
  DATE_TRUNC('month', o.created_at) AS month,
  SUM(o.amount) AS revenue
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE o.status = 'completed'
GROUP BY u.name, month
ORDER BY month DESC;
```

Firebase Firestore에서 동일 결과를 얻으려면:
1. 각 사용자 문서 읽기 (N 읽기 연산)
2. 사용자별 주문 컬렉션 쿼리 (N개의 별도 쿼리)
3. 클라이언트/서버 코드로 집계 처리
4. 결과: 읽기 비용 폭발적 증가 + 복잡한 코드

#### 트랜잭션

| 항목 | Supabase | Firestore |
|------|----------|-----------|
| **ACID 트랜잭션** | 완전 지원 | 부분 지원 (같은 문서 그룹 내) |
| **다중 테이블/컬렉션 트랜잭션** | 완전 지원 | 제한 (최대 500 문서) |
| **롤백** | 완전 지원 | 지원 |
| **격리 수준** | SERIALIZABLE 포함 전체 수준 | 기본 직렬화만 |

#### 확장성

- **Supabase**: PostgreSQL 수직 확장 + 읽기 복제본(Read Replica) 수평 확장. pgBouncer 커넥션 풀링으로 수만 개의 동시 연결 처리. 파티셔닝으로 수십억 행 테이블 관리 가능.
- **Firebase Firestore**: Google 인프라에서 자동 수평 확장. 관리 오버헤드 없음. 단, 단일 문서 초당 1회 쓰기 제한이 고빈도 쓰기 패턴에서 병목이 될 수 있음.

#### Row Level Security (RLS)

Supabase의 가장 강력한 차별화 요소 중 하나. PostgreSQL의 RLS를 활용해 데이터베이스 레벨에서 행 단위 접근 제어를 구현:

```sql
-- 사용자가 자신의 데이터만 볼 수 있도록 정책 설정
CREATE POLICY "사용자는 자신의 레코드만 접근"
ON orders
FOR ALL
USING (auth.uid() = user_id);
```

Firebase는 별도의 Security Rules 언어를 사용하며 데이터베이스와 독립적으로 관리된다. Supabase RLS는 SQL 표준을 따르므로 익숙한 개념으로 복잡한 접근 제어를 표현할 수 있다.

---

### 2.2 Authentication — GoTrue vs Firebase Auth

#### 지원 프로바이더 비교

| 인증 방법 | Supabase | Firebase |
|-----------|----------|---------|
| 이메일/비밀번호 | ✅ | ✅ |
| Magic Link (이메일) | ✅ | ✅ (Email Link) |
| 전화번호 (SMS OTP) | ✅ | ✅ |
| Google | ✅ | ✅ |
| Apple | ✅ | ✅ |
| GitHub | ✅ | ✅ |
| Facebook | ✅ | ✅ |
| Twitter/X | ✅ | ✅ |
| Discord | ✅ | ❌ |
| Slack | ✅ | ❌ |
| Notion | ✅ | ❌ |
| Spotify | ✅ | ❌ |
| LinkedIn | ✅ | ❌ |
| 익명 로그인 | ✅ | ✅ |
| SAML 2.0 SSO | ✅ (Team 플랜+) | ✅ (Identity Platform 업그레이드 필요) |
| OIDC | ✅ | ✅ (Identity Platform 필요) |
| 커스텀 JWT | ✅ | ✅ |
| TOTP (앱 OTP) | ✅ | ❌ (SMS만 지원) |
| Passkey / WebAuthn | 베타 | ❌ |

#### MFA 비교

- **Supabase**: TOTP (Google Authenticator 등) + SMS 지원. TOTP 기반 MFA는 추가 비용 없이 모든 플랜에서 사용 가능. 2025년 이후 Passkey/WebAuthn 베타 지원.
- **Firebase**: SMS 기반 2FA만 지원. TOTP 미지원. SAML/OIDC는 Firebase Authentication에서 **Identity Platform**으로 업그레이드 시 가능 (별도 MAU 기반 과금).

#### 커스터마이징

| 항목 | Supabase | Firebase |
|------|----------|---------|
| 이메일 템플릿 커스터마이징 | ✅ | ✅ |
| 커스텀 SMTP | ✅ | ✅ (Blaze 플랜) |
| Auth Hook (웹훅) | ✅ (Postgres 함수 또는 HTTP) | ✅ (Cloud Functions) |
| 세션 만료 설정 | ✅ | ✅ |
| 화이트라벨 | ✅ (자체 호스팅 시) | 제한적 |
| 사용자 메타데이터 | ✅ (user_metadata, app_metadata) | ✅ (Custom Claims) |

#### GoTrue 아키텍처

Supabase Auth는 **GoTrue** (Go 기반)를 백엔드로 사용한다. GoTrue는 오픈소스이므로 자체 호스팅 시 직접 수정하거나 확장할 수 있다. JWT 토큰은 Supabase의 PostgREST와 직접 통합되어 RLS 정책 평가에 사용된다 (`auth.uid()`, `auth.role()` 함수).

---

### 2.3 Storage — S3 호환 vs Cloud Storage

#### 아키텍처 비교

| 항목 | Supabase Storage | Firebase Cloud Storage |
|------|-----------------|------------------------|
| **백엔드** | S3 호환 (MinIO / AWS S3) | Google Cloud Storage |
| **메타데이터 저장** | PostgreSQL 테이블 | 별도 메타데이터 서버 |
| **접근 제어** | PostgreSQL RLS 정책 (통합) | 별도 Storage Security Rules |
| **이미지 변환** | 빌트인 (리사이즈, 포맷 변환, WebP) | 미빌트인 (Extensions 또는 외부 서비스 필요) |
| **CDN** | 글로벌 CDN 내장 | Google Cloud CDN |
| **자체 호스팅** | ✅ (MinIO 등) | ❌ |

#### Supabase 이미지 변환 (빌트인)

Supabase Storage v2부터 URL 파라미터로 이미지 변환 가능:

```
# 원본
https://project.supabase.co/storage/v1/object/public/avatars/user.jpg

# 100x100 리사이즈 + WebP 변환
https://project.supabase.co/storage/v1/object/public/avatars/user.jpg?width=100&height=100&format=webp

# 품질 80% + 스마트 크롭
https://project.supabase.co/storage/v1/object/public/avatars/user.jpg?width=800&quality=80&resize=cover
```

Firebase는 동일 기능을 위해:
1. Firebase Extensions "Resize Images" 설치 (Cloud Functions 기반)
2. 또는 Cloudinary, Imgix 등 외부 CDN 서비스 연동
3. 추가 비용 + 복잡성 증가

#### 접근 제어 통합성

Supabase의 Storage 정책은 동일한 SQL 문법으로 데이터베이스 RLS와 일관되게 관리된다:

```sql
-- 인증된 사용자만 자신의 파일 업로드 가능
CREATE POLICY "사용자 파일 업로드"
ON storage.objects FOR INSERT
WITH CHECK (auth.uid()::text = (storage.foldername(name))[1]);

-- 공개 파일은 누구나 조회 가능
CREATE POLICY "공개 파일 조회"
ON storage.objects FOR SELECT
USING (bucket_id = 'public');
```

Firebase Security Rules는 별도 언어와 콘솔에서 관리되어 데이터베이스 규칙과 분리된다.

#### 무료 티어 스토리지 비교

| 티어 | Supabase | Firebase (Spark) |
|------|----------|-----------------|
| 파일 스토리지 | 1GB | 1GB |
| 대역폭 | 2GB/월 | 10GB/월 |
| 이미지 변환 요청 | 100/월 | 해당 없음 |

---

### 2.4 Functions — Deno Edge Functions vs Cloud Functions

#### 런타임 비교

| 항목 | Supabase Edge Functions | Firebase Cloud Functions |
|------|------------------------|--------------------------|
| **런타임** | Deno (V8 기반) | Node.js 18/20, Python 3.11/3.12, Go, Java |
| **배포 위치** | Edge (전세계 분산) | Google Cloud 리전 선택 |
| **콜드 스타트** | ~100-200ms | ~300-500ms (gen2 기준) |
| **핫 스타트** | ~125ms 중앙값 | ~100-150ms |
| **언어** | TypeScript/JavaScript | 다중 언어 지원 |
| **패키지 관리** | URL import / npm: 프리픽스 | npm (Node.js) |
| **최대 실행 시간** | 150초 | 540초 (gen2) |
| **메모리** | 최대 512MB | 최대 32GB (gen2) |
| **자체 호스팅** | ✅ | ❌ |

#### 콜드 스타트 성능

2025년 Supabase 공식 벤치마크:
- **콜드 레이턴시 중앙값**: 400ms (시간당 첫 요청)
- **핫 레이턴시 중앙값**: 125ms (동일 시간 내 후속 요청)
- 영구 스토리지 도입 후 콜드 스타트 **97% 단축** 발표 (2025)

Firebase Cloud Functions gen2 (2025):
- **콜드 스타트**: 300-500ms (Node.js 런타임, 경량 함수 기준)
- gen1 대비 개선되었으나 Supabase Edge Functions에 비해 여전히 느림

#### 가격 비교

**Supabase Edge Functions:**
```
무료 플랜: 500,000 호출/월, 실행 시간 포함
Pro 플랜($25/월): 2,000,000 호출/월 + 추가 사용량 기반 과금
추가 호출: $2 per 1,000,000 호출
```

**Firebase Cloud Functions (Blaze):**
```
무료 쿼터: 2,000,000 호출/월 (Spark 동일)
초과 시: $0.40 per 1,000,000 호출
CPU: $0.00001 per vCPU-초
메모리: $0.0000025 per GB-초
Egress: $0.12 per GB (Google 외부)
```

#### Deno vs Node.js

| 항목 | Deno (Supabase) | Node.js (Firebase) |
|------|-----------------|-------------------|
| TypeScript | 네이티브 지원 | tsc 변환 필요 |
| 보안 | 퍼미션 모델 (기본 제한) | 전체 권한 (기본) |
| 패키지 | URL import 또는 npm: 프리픽스 | npm 생태계 완전 호환 |
| 성능 | V8 최적화, 낮은 메모리 | V8 최적화, 풍부한 생태계 |
| 성숙도 | 상대적으로 새로움 | 매우 성숙, 광범위한 라이브러리 |

---

### 2.5 Realtime — Phoenix Channels vs Firestore 리스너

#### 아키텍처 비교

**Supabase Realtime** — Elixir / Phoenix 기반:
1. PostgreSQL Write-Ahead Log(WAL)를 구독
2. 변경 데이터 캡처(CDC) 방식으로 행 수준 변경 감지
3. Phoenix Channels를 통해 WebSocket으로 클라이언트에 전달
4. `INSERT`, `UPDATE`, `DELETE` 이벤트를 실시간 브로드캐스트
5. Presence(접속자 추적), Broadcast(임의 메시지) 기능도 내장

```typescript
// Supabase Realtime 구독 예시
const channel = supabase
  .channel('orders-changes')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'orders' },
    (payload) => console.log('변경 감지:', payload)
  )
  .subscribe();

// Presence (접속자 추적)
const presence = supabase.channel('online-users');
presence.on('presence', { event: 'sync' }, () => {
  const state = presence.presenceState();
  console.log('현재 접속자:', state);
}).subscribe();
```

**Firebase Realtime Database** — Google 독점 WebSocket:
- 데이터 트리 전체 또는 경로 단위 실시간 동기화
- 오프라인 퍼시스턴스 성숙도 높음 (모바일 최적화)
- 구조화되지 않은 데이터(커서 위치, 알림 등) 동기화 가능

**Firebase Firestore** — gRPC 기반 리스너:
- 문서 또는 컬렉션 단위 실시간 리스너
- 오프라인 캐시 및 충돌 해결 자동 처리
- 구독 쿼리 제한 있음

#### 성능 비교 (1,000 동시 연결 기준)

| 플랫폼 | 평균 RTT | 브로드캐스트 지연 |
|--------|----------|-----------------|
| Supabase Realtime | ~50ms | <50ms |
| Firebase RTDB | ~80ms | ~80ms |
| Firebase Firestore | ~1,500ms (문서 업데이트 반영) | ~100-200ms |

#### 오프라인 지원 비교

| 항목 | Supabase | Firebase RTDB | Firestore |
|------|----------|---------------|-----------|
| 오프라인 퍼시스턴스 | 제한적 (클라이언트 라이브러리 의존) | ✅ 네이티브 지원 | ✅ 네이티브 지원 |
| 충돌 해결 | 수동 처리 필요 | 자동 | 자동 |
| 모바일 SDK 성숙도 | 개선 중 | 10년+ 최적화 | 높음 |

> **Firebase의 강점**: 오프라인 우선(Offline-First) 모바일 앱에서는 Firebase RTDB/Firestore가 여전히 우위를 점한다. Supabase는 웹 애플리케이션 실시간 기능에서 더 강점을 보인다.

---

### 2.6 Hosting / Self-hosting 가능 vs Lock-in

#### 배포 옵션

| 항목 | Supabase | Firebase |
|------|----------|---------|
| **관리형 클라우드** | Supabase Cloud (AWS 기반) | Google Cloud |
| **자체 호스팅** | ✅ Docker Compose, K8s | ❌ 불가 |
| **하이브리드** | ✅ 가능 | ❌ |
| **에어갭(인터넷 단절) 환경** | ✅ 가능 | ❌ 불가 |
| **리전 선택** | 12+ AWS 리전 | 전세계 Google 리전 |
| **GDPR 데이터 레지던시** | ✅ 자체 호스팅 또는 EU 리전 선택 | ✅ EU 리전 선택 가능 |

#### 자체 호스팅 구성 (Supabase)

```bash
# Docker Compose로 Supabase 로컬/프로덕션 실행
git clone https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
# .env에 비밀번호, JWT 시크릿 등 설정
docker compose up -d
```

자체 호스팅 시 포함되는 서비스:
- `supabase/postgres` — PostgreSQL + 확장 플러그인
- `supabase/gotrue` — Auth 서버
- `supabase/realtime` — 실시간 서버
- `supabase/storage-api` — 스토리지 API
- `supabase/postgrest` — REST API 자동 생성
- `supabase/studio` — 관리 UI 대시보드

#### 벤더 종속 분석

**Supabase 탈출 경로:**
- 데이터: 표준 PostgreSQL 덤프 (`pg_dump`)로 어디든 이전
- Auth: GoTrue 오픈소스 → 독립 실행 가능
- 코드: PostgreSQL + REST API → 표준 인터페이스

**Firebase 탈출 경로:**
- Firestore: 독점 구조 → PostgreSQL/MongoDB 등으로 이전 시 쿼리 전면 재작성
- RTDB: JSON 트리 → 관계형 DB로 변환 시 스키마 설계부터 재시작
- Auth: Firebase Auth → 커스텀 AuthToken 교체 필요
- 결론: 탈출 비용이 매우 높음 (전략적 리스크)

---

## 3. 가격 비교

### 3.1 Supabase 가격 구조

#### 플랜별 기본 요금

| 플랜 | 월 기본료 | 주요 포함 항목 |
|------|-----------|--------------|
| **Free** | $0 | DB 500MB, Storage 1GB, MAU 50,000, 프로젝트 2개, 비활성 1주 후 일시정지 |
| **Pro** | $25 | DB 8GB, Storage 100GB, MAU 100,000, 일시정지 없음, $10 컴퓨트 크레딧 포함 |
| **Team** | $599 | Pro 전체 + SSO, SOC 2 리포트, 백업 보존 28일 |
| **Enterprise** | 커스텀 협상 | 전용 인프라, SLA, 커스텀 계약 |

#### Pro 플랜 초과 과금

```
DB 스토리지:       $0.125 / GB
파일 스토리지:     $0.021 / GB
대역폭:           $0.09 / GB
MAU 초과:         $0.00325 / MAU
Edge Functions:   $2 / 1M 호출
컴퓨트 업그레이드: $10~$960/월 (인스턴스 크기별)
```

#### 실제 운영 비용 예시

```
소규모 SaaS (MAU 5,000, DB 3GB, Storage 20GB):
  Base: $25
  DB 초과 없음 (8GB 포함)
  Storage: $0 (100GB 포함)
  합계: ~$25/월

중규모 SaaS (MAU 50,000, DB 30GB, Storage 200GB):
  Base: $25
  DB 초과: (30-8) × $0.125 = $2.75
  Storage 초과: (200-100) × $0.021 = $2.10
  합계: ~$30/월

대규모 SaaS (MAU 200,000, DB 200GB, Storage 1TB):
  Base: $25
  MAU 초과: (200,000-100,000) × $0.00325 = $325
  DB 초과: (200-8) × $0.125 = $24
  Storage 초과: (1024-100) × $0.021 = $19.4
  합계: ~$393/월
```

### 3.2 Firebase 가격 구조

#### 플랜 개요

| 플랜 | 기본 요금 | 설명 |
|------|-----------|------|
| **Spark** | $0 | 넉넉한 무료 할당량, Cloud Functions 사용 불가 |
| **Blaze** | Pay-as-you-go | Spark 무료 할당량 유지 + 초과 사용량 과금 |

#### Spark 무료 할당량

```
Firestore:
  읽기:   50,000 회/일
  쓰기:   20,000 회/일
  삭제:   20,000 회/일
  저장:   1GB

Realtime Database:
  저장:   1GB
  다운로드: 10GB/월

Firebase Auth:
  MAU:    50,000
  SAML/OIDC: 50 MAU (Identity Platform 필요)

Storage:
  저장:   1GB
  다운로드: 10GB/월

Cloud Functions: 불가 (Blaze 전용)
Hosting: 10GB 저장, 360MB/일 전송
```

#### Blaze 초과 과금

```
Firestore:
  읽기:    $0.06 / 100,000 회
  쓰기:    $0.18 / 100,000 회
  삭제:    $0.02 / 100,000 회
  저장:    $0.18 / GB/월

Realtime Database:
  저장:    $5.00 / GB/월
  다운로드: $1.00 / GB

Firebase Auth (Identity Platform):
  MAU:    $0.0055 / MAU (월 50,000 초과 시)
  SAML/OIDC: $0.015 / MAU

Cloud Functions:
  호출:   $0.40 / 1,000,000 회
  컴퓨트: $0.00001 / vCPU-초
  메모리: $0.0000025 / GB-초

Storage:
  저장:   $0.026 / GB/월
  다운로드: $0.12 / GB (2025년 8월~ 10GB/월 무료)
```

#### Firebase 비용 폭발 시나리오

Firebase의 가장 큰 리스크는 **Firestore 읽기 비용의 예측 불가성**이다:

```
예시: 인기 앱 바이럴 후 1일
  Firestore 읽기 5,000,000회 발생:
  초과분: (5,000,000 - 50,000) × $0.06/100,000
        = 4,950,000 × $0.0000006
        = $2.97 (이 경우는 낮음)

  실제 문제 케이스: 쿼리 최적화 없이 100M 읽기 발생:
  = 100,000,000 × $0.0000006 = $60/일 → $1,800/월
```

Supabase는 기본적으로 **스펜드 캡(Spend Cap)**을 활성화하여 의도치 않은 초과 비용을 방지한다.

### 3.3 가격 비교 요약

| 시나리오 | Supabase | Firebase |
|---------|----------|---------|
| **프로토타입/MVP** | $0 (Free) | $0 (Spark) |
| **소규모 프로덕션** | $25/월 | 사용량 따라 $0-$50 |
| **MAU 10만 앱** | ~$35-75/월 | 예측 어려움 ($50-$500+) |
| **MAU 100만 앱** | $600-1,200/월 | $2,000-$10,000+/월 가능 |
| **예측 가능성** | 높음 (리소스 기반) | 낮음 (트랜잭션 기반) |

---

## 4. DX(개발자 경험) 비교

### 4.1 SDK 및 타입 안전성

#### Supabase SDK

```typescript
// 자동 생성 타입으로 완전한 타입 안전성
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types/supabase'  // CLI로 자동 생성

const supabase = createClient<Database>(url, key)

// 타입 추론 완전 작동
const { data, error } = await supabase
  .from('orders')       // 'orders' 테이블 자동 완성
  .select('id, amount, user_id')  // 컬럼 자동 완성
  .eq('status', 'completed')
  .gte('amount', 100)
  .order('created_at', { ascending: false })
  .limit(10)

// data는 자동으로 타입 추론됨: { id: number; amount: number; user_id: string }[]
```

TypeScript 타입 생성:
```bash
# CLI로 데이터베이스 스키마에서 타입 자동 생성
supabase gen types typescript --project-id your-project-id > types/supabase.ts
```

#### Firebase SDK

```typescript
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore'

// 타입 추론 제한적 — 개발자가 수동으로 타입 정의 필요
interface Order {
  id: string;
  amount: number;
  status: string;
  userId: string;
  createdAt: Timestamp;
}

const ordersRef = collection(db, 'orders') as CollectionReference<Order>
const q = query(
  ordersRef,
  where('status', '==', 'completed'),
  where('amount', '>=', 100),
  orderBy('createdAt', 'desc'),
  limit(10)
)
// 컴파운드 쿼리는 Firestore 인덱스를 미리 생성해야 함
```

Firebase는 Firestore의 컬렉션/문서 구조가 스키마리스이므로 타입 안전성을 달성하려면 수동으로 타입을 정의하고 유지해야 한다.

### 4.2 로컬 개발 환경

#### Supabase 로컬 개발

```bash
# 설치
npm install -g supabase
supabase login

# 새 프로젝트 초기화
supabase init

# 로컬 Supabase 스택 실행 (Docker 필요)
supabase start
# → DB, Auth, Storage, Realtime, Studio 전체 로컬에서 실행

# 마이그레이션 생성
supabase migration new create_orders_table

# 마이그레이션 적용
supabase db push

# 타입 생성
supabase gen types typescript --local > types/supabase.ts

# Studio UI (브라우저에서 DB 관리)
# http://localhost:54323

# 로컬 중지
supabase stop
```

로컬 환경과 프로덕션이 **완전히 동일한** 환경이므로 "내 컴퓨터에서는 됐는데" 문제가 없다.

#### Firebase 로컬 개발 (Emulator Suite)

```bash
# 설치
npm install -g firebase-tools
firebase login

# 에뮬레이터 초기화
firebase init emulators

# 에뮬레이터 실행
firebase emulators:start
# → Firestore, Auth, Storage, Functions 에뮬레이터 실행

# 에뮬레이터 UI
# http://localhost:4000
```

Firebase Emulator Suite는 상당히 성숙해 있으나, 일부 기능(FCM, Analytics, Extensions)은 에뮬레이터를 지원하지 않는다.

### 4.3 CLI 비교

| 기능 | Supabase CLI | Firebase CLI |
|------|-------------|-------------|
| 로컬 개발 스택 | ✅ Docker 기반 완전한 스택 | ✅ Emulator Suite |
| DB 마이그레이션 관리 | ✅ 빌트인 | ❌ 별도 도구 필요 |
| TypeScript 타입 생성 | ✅ 자동 | ❌ 수동 |
| Functions 디버깅 | ✅ V8 Inspector (Chrome DevTools) | ✅ |
| CI/CD 지원 | ✅ | ✅ |
| Secrets 관리 | ✅ | ✅ |

### 4.4 생태계 및 커뮤니티

| 항목 | Supabase | Firebase |
|------|----------|---------|
| GitHub Stars | 45,000+ (2026 Q1) | 구글 소유 (공개 수치 다름) |
| npm 주간 다운로드 | 2M+ | 8M+ |
| Stack Overflow 질문 | 급증 중 | 매우 풍부 |
| 공식 문서 품질 | 우수 (빠른 개선) | 우수 (오랜 역사) |
| 서드파티 라이브러리 | 성장 중 | 매우 풍부 |
| YouTube 튜토리얼 | 급증 | 방대 |
| Next.js 통합 | 공식 지원, 매우 강함 | 공식 지원 |
| Flutter/React Native 통합 | 공식 SDK | 매우 성숙 |

---

## 5. 성능 비교

### 5.1 데이터베이스 쿼리 성능

1,000,000 행 데이터셋 기준 표준 쿼리 벤치마크:

| 쿼리 유형 | Supabase (PostgreSQL) | Firebase Firestore |
|-----------|----------------------|--------------------|
| **단순 조회** (PK 기반) | 5-10ms | 10-20ms |
| **필터 쿼리** (인덱스 활용) | 10-20ms | 20-40ms |
| **복잡한 JOIN** (3개 테이블) | 15-25ms | N/A (불가 → 다중 읽기 필요) |
| **집계 쿼리** (SUM/GROUP BY) | 20-50ms | N/A (클라이언트 집계 필요) |
| **전체 텍스트 검색** | 30-80ms (pg_trgm) | 미지원 (외부 서비스 필요) |
| **벡터 유사도 검색** | 50-200ms (pgvector) | 미지원 |

> 출처: Tech-Insider.org 벤치마크 (2026) — Supabase가 읽기 4배, 쓰기 3.1배 빠른 결과 보고

### 5.2 실시간 성능

1,000 동시 WebSocket 연결 기준:

| 플랫폼 | 브로드캐스트 지연 | 최대 동시 연결 |
|--------|----------------|--------------|
| Supabase Realtime | <50ms | 수백만 (Elixir 기반) |
| Firebase RTDB | ~80ms | 100,000+ |
| Firebase Firestore | ~100-200ms | 무제한 (Google 인프라) |

### 5.3 Functions 성능

| 지표 | Supabase Edge Functions | Firebase Cloud Functions gen2 |
|------|------------------------|-------------------------------|
| 콜드 스타트 | 100-400ms | 300-500ms |
| 핫 실행 | 10-50ms | 10-50ms |
| 전세계 배포 | ✅ Edge 배포 | 리전 선택 (단일 리전) |
| 동시 실행 제한 | 없음 (Edge) | 1,000/리전 기본 |

### 5.4 Auth 성능

| 지표 | Supabase Auth | Firebase Auth |
|------|--------------|--------------|
| 로그인 응답 시간 | 100-300ms | 200-500ms |
| JWT 검증 | 로컬 검증 가능 | Google 서버 검증 |
| 토큰 갱신 | 자동 (클라이언트) | 자동 (클라이언트) |

---

## 6. 마이그레이션 경로 — Firebase → Supabase

### 6.1 마이그레이션 전략

Firebase에서 Supabase로의 마이그레이션은 4개 영역으로 나뉜다:

```
Firebase                    Supabase
--------                    --------
Firestore         →         PostgreSQL 테이블
Firebase Auth     →         Supabase Auth (GoTrue)
Firebase Storage  →         Supabase Storage
Cloud Functions   →         Edge Functions 또는 PostgreSQL 함수
Security Rules    →         Row Level Security (RLS)
Firebase SDK      →         Supabase SDK
```

### 6.2 단계별 마이그레이션 가이드

#### 1단계: Supabase 프로젝트 준비

```bash
# Supabase CLI 설치
npm install -g supabase

# 새 프로젝트 생성 후 연결
supabase login
supabase link --project-ref your-project-ref
```

#### 2단계: Firestore 데이터 → PostgreSQL 변환

```bash
# firebase-to-supabase 커뮤니티 도구 설치
npm install -g firebase-to-supabase

# Firestore 컬렉션을 JSON으로 내보내기
# (Firebase Admin SDK 또는 Google Cloud Console 사용)
```

Firestore 문서 → PostgreSQL 테이블 변환 예시:

```
# Firestore 문서 구조
/users/{userId}
  name: "홍길동"
  email: "hong@example.com"
  createdAt: Timestamp

/orders/{orderId}
  userId: "abc123"
  amount: 50000
  status: "completed"
```

```sql
-- PostgreSQL 테이블 설계
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),  -- 외래 키 관계!
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

```bash
# JSON → CSV 변환 후 Supabase에 임포트
supabase db push
# psql 또는 Supabase Studio에서 COPY 명령으로 데이터 임포트
```

#### 3단계: Firebase Auth → Supabase Auth 마이그레이션

```bash
# 공식 도구 사용
npx @supabase/cli auth import --file firebase-users.json

# 또는 커뮤니티 도구
git clone https://github.com/supabase-community/firebase-to-supabase
cd firebase-to-supabase/auth
node firestoreusers2json.js  # Firebase 사용자 내보내기
node import_users.js         # Supabase로 가져오기
```

사용자 비밀번호는 Firebase에서 해시 형태로 내보내기 가능하며, Supabase는 Firebase의 bcrypt 해시를 지원하여 사용자가 비밀번호를 재설정하지 않아도 된다.

#### 4단계: Firebase Storage → Supabase Storage 마이그레이션

```javascript
// firebase-to-supabase 스토리지 마이그레이션 스크립트
const { createClient } = require('@supabase/supabase-js')
const admin = require('firebase-admin')

async function migrateStorage() {
  const bucket = admin.storage().bucket()
  const [files] = await bucket.getFiles()
  
  for (const file of files) {
    const [buffer] = await file.download()
    const { error } = await supabase
      .storage
      .from('migrated-files')
      .upload(file.name, buffer)
    
    if (error) console.error(`실패: ${file.name}`, error)
    else console.log(`완료: ${file.name}`)
  }
}
```

#### 5단계: Security Rules → RLS 변환

```javascript
// Firebase Security Rules (before)
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /orders/{orderId} {
      allow read, write: if request.auth.uid == resource.data.userId;
    }
  }
}
```

```sql
-- Supabase RLS (after)
-- 동일한 보안 정책을 SQL로 표현
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "사용자 자신의 주문만 접근"
ON orders FOR ALL
USING (auth.uid() = user_id);
```

#### 6단계: SDK 교체

```typescript
// Firebase SDK (before)
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { signInWithEmailAndPassword } from 'firebase/auth'

const user = await signInWithEmailAndPassword(auth, email, password)
const orderDoc = await getDoc(doc(db, 'orders', orderId))

// Supabase SDK (after)
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(url, key)
const { data: { user } } = await supabase.auth.signInWithPassword({ email, password })
const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).single()
```

### 6.3 마이그레이션 주의사항

| 주의 항목 | 설명 |
|-----------|------|
| **병렬 운영 기간** | 마이그레이션 중 Firebase와 Supabase 동시 운영 (데이터 동기화 스크립트 필요) |
| **Firestore 복합 쿼리** | Firestore 인덱스 없이 불가능했던 쿼리들이 PostgreSQL에서 자유롭게 가능 |
| **비정규화 데이터** | Firestore에서 성능을 위해 비정규화한 데이터를 정규화 테이블로 재설계 필요 |
| **오프라인 기능** | 모바일 앱의 Firestore 오프라인 기능은 Supabase에서 직접 대체재 없음 |
| **Cloud Messaging** | Firebase FCM은 Supabase에 없음 → OneSignal, Expo Push Notifications 등 대체 |
| **Analytics / Crashlytics** | Firebase Analytics는 Supabase에 없음 → Google Analytics, Mixpanel 등 사용 |

### 6.4 마이그레이션 도구 목록

| 도구 | 용도 | 링크 |
|------|------|------|
| firebase-to-supabase (공식 커뮤니티) | Firestore + Auth + Storage 마이그레이션 | github.com/supabase-community/firebase-to-supabase |
| Supabase CLI | 마이그레이션 관리, 타입 생성 | supabase.com/docs/guides/local-development |
| Supabase 공식 마이그레이션 가이드 | Auth, Firestore, Storage 개별 가이드 | supabase.com/docs/guides/platform/migrating-to-supabase |
| firebasetosupabase.com | 커뮤니티 마이그레이션 서비스 | firebasetosupabase.com |

---

## 7. 언제 어떤 것을 선택해야 하는가

### 7.1 Supabase를 선택해야 할 때

#### 강력히 권장하는 상황

1. **복잡한 관계형 데이터 모델**
   - 다대다 관계, 복잡한 조인, 집계 쿼리가 핵심인 앱
   - 예: ERP, CRM, 커머스, 금융 서비스

2. **SQL 기술 보유 팀**
   - 기존에 PostgreSQL/MySQL 경험이 있는 팀
   - 데이터 마이그레이션 없이 기존 SQL 쿼리 재활용 가능

3. **오픈소스 / 자체 호스팅 요구사항**
   - 규제 산업 (의료, 금융, 법률) — 데이터를 자체 인프라에 보관
   - GDPR 완전 준수 — EU 데이터 거주 요구
   - 에어갭 환경 (인터넷 단절된 내부망)

4. **비용 예측 가능성이 중요한 경우**
   - 트래픽 급증 시에도 예측 가능한 비용 구조 필요
   - B2B SaaS — MAU보다 데이터 복잡성이 중심

5. **벡터 검색 / AI 기능**
   - pgvector 내장으로 임베딩 저장 및 유사도 검색
   - RAG(Retrieval-Augmented Generation) 파이프라인 구축

6. **Next.js / Vercel 기반 웹 앱**
   - Supabase + Next.js 궁합이 매우 좋음
   - 공식 Next.js 통합 가이드, App Router 지원

#### 구체적인 프로젝트 유형

```
✅ Supabase 적합:
   - 멀티테넌트 SaaS 플랫폼
   - 데이터 대시보드 / 분석 도구
   - 복잡한 권한 관리가 필요한 기업용 앱
   - 실시간 협업 도구 (웹 기반)
   - PostgreSQL 이전 앱의 BaaS 레이어 추가
   - 스타트업 (오픈소스로 시작 → 필요 시 자체 호스팅)
```

### 7.2 Firebase를 선택해야 할 때

#### 강력히 권장하는 상황

1. **모바일 퍼스트 앱 (iOS/Android)**
   - Flutter 또는 React Native 앱
   - FCM 푸시 알림, Firebase Analytics, Crashlytics 통합 필요
   - 오프라인 우선(Offline-First) 기능이 핵심

2. **빠른 프로토타이핑 / 스키마리스 요구**
   - MVP 검증 단계 — 스키마 변경이 잦은 초기 단계
   - 백엔드 경험 없는 팀의 빠른 출시

3. **Google 생태계 활용**
   - Google Analytics 4, BigQuery 연동
   - Google Cloud 기반 ML (Vertex AI, AutoML)
   - Firebase Performance Monitoring

4. **단순한 데이터 구조 앱**
   - 채팅 앱, 단순 소셜 피드, 게임 리더보드
   - 복잡한 쿼리 없이 문서 조회/수정이 전부

5. **실시간 이벤트 스트림 (비DB 데이터)**
   - 커서 위치, 마우스 움직임, 위치 공유 등 DB에 저장 안 되는 이벤트

#### 구체적인 프로젝트 유형

```
✅ Firebase 적합:
   - 모바일 앱 (iOS/Android Flutter/React Native)
   - 실시간 채팅 앱
   - 간단한 게임 백엔드 (리더보드, 매칭)
   - 소셜 피드 앱 (Twitter/Instagram 클론)
   - 퀵 프로토타입 / 해커톤 프로젝트
   - Google 생태계 밀착 앱
```

### 7.3 프로젝트 유형별 의사결정 트리

```
나의 앱은?
│
├─ 주로 모바일 앱인가?
│   ├─ YES + 오프라인 기능 중요     → Firebase RTDB/Firestore
│   ├─ YES + 푸시 알림/분석 필요    → Firebase
│   └─ YES + 복잡한 백엔드 필요    → Supabase (웹뷰 또는 API)
│
├─ 데이터 구조가 복잡한가?
│   ├─ YES (관계형, 조인, 집계)     → Supabase
│   └─ NO (단순 문서 CRUD)          → Firebase 또는 Supabase 둘 다 가능
│
├─ 벤더 락인이 우려되는가?
│   ├─ YES                          → Supabase (오픈소스, 자체 호스팅)
│   └─ NO (Google 생태계 OK)        → Firebase
│
├─ 비용 예측이 중요한가?
│   ├─ YES (고정비 선호)            → Supabase Pro ($25 + 예측 가능)
│   └─ NO (트래픽 연동 OK)          → Firebase Blaze
│
├─ 팀의 SQL 경험은?
│   ├─ SQL 경험 있음                → Supabase
│   └─ NoSQL 선호 / SQL 경험 없음   → Firebase
│
└─ 규제/컴플라이언스 요구사항?
    ├─ 자체 호스팅 필수             → Supabase (Docker)
    ├─ EU 데이터 레지던시 필수       → Supabase EU 리전 또는 자체 호스팅
    └─ 일반 요구사항                → 둘 다 가능
```

### 7.4 하이브리드 전략

경우에 따라 두 플랫폼을 병용하는 전략도 유효하다:

```
예시: 웹 + 모바일 앱
  웹 앱 백엔드:      Supabase (복잡한 쿼리, RLS)
  모바일 푸시 알림:   Firebase FCM
  모바일 분석:       Firebase Analytics
  모바일 크래시:     Firebase Crashlytics
```

---

## 8. 스코어링 매트릭스

### 8.1 평가 기준 및 척도

- **1점**: 매우 미흡 — 기본 기능 부재 또는 심각한 제약
- **2점**: 부족 — 기본 기능은 있으나 중요한 한계 존재
- **3점**: 보통 — 일반적인 요구사항 충족
- **4점**: 우수 — 대부분의 요구사항을 잘 충족
- **5점**: 탁월 — 업계 최고 수준, 차별화된 강점

### 8.2 7개 항목 스코어링

#### FUNC — 기능 완성도

| 세부 항목 | Supabase | Firebase |
|-----------|----------|---------|
| 데이터베이스 쿼리 능력 | 5 | 2 |
| 인증 프로바이더 다양성 | 5 | 4 |
| 스토리지 기능 | 4 | 4 |
| 실시간 기능 | 4 | 5 |
| 서버리스 함수 | 4 | 4 |
| 모바일 SDK | 3 | 5 |
| 푸시 알림 | 1 (미내장) | 5 (FCM) |
| 오프라인 지원 | 2 | 5 |
| AI/벡터 기능 | 5 (pgvector) | 2 |
| **FUNC 평균** | **3.7** | **4.0** |

#### PERF — 성능

| 세부 항목 | Supabase | Firebase |
|-----------|----------|---------|
| DB 쿼리 속도 | 5 | 3 |
| 실시간 지연시간 | 4 | 4 |
| Functions 콜드 스타트 | 4 | 3 |
| 글로벌 CDN | 4 | 5 |
| 자동 확장성 | 3 | 5 |
| **PERF 평균** | **4.0** | **4.0** |

#### DX — 개발자 경험

| 세부 항목 | Supabase | Firebase |
|-----------|----------|---------|
| TypeScript 타입 안전성 | 5 | 3 |
| 로컬 개발 환경 | 5 | 4 |
| CLI 도구 | 5 | 4 |
| 문서 품질 | 4 | 5 |
| SDK 직관성 | 4 | 4 |
| DB 마이그레이션 관리 | 5 | 1 |
| 디버깅 도구 | 4 | 4 |
| **DX 평균** | **4.6** | **3.6** |

#### ECO — 생태계

| 세부 항목 | Supabase | Firebase |
|-----------|----------|---------|
| 커뮤니티 크기 | 4 | 5 |
| 서드파티 라이브러리 | 3 | 5 |
| 튜토리얼/리소스 | 4 | 5 |
| 성장 추세 | 5 | 3 |
| 기업 도입 사례 | 4 | 5 |
| **ECO 평균** | **4.0** | **4.6** |

#### LIC — 라이선스 / 벤더 독립성

| 세부 항목 | Supabase | Firebase |
|-----------|----------|---------|
| 오픈소스 여부 | 5 | 1 |
| 자체 호스팅 가능 | 5 | 1 |
| 벤더 종속 위험 | 5 | 1 |
| 표준 기술 기반 | 5 | 2 |
| 마이그레이션 용이성 | 5 | 2 |
| **LIC 평균** | **5.0** | **1.4** |

#### MAINT — 유지보수성

| 세부 항목 | Supabase | Firebase |
|-----------|----------|---------|
| 스키마 버전 관리 | 5 | 1 |
| 백업 / 복구 | 4 | 3 |
| 모니터링 / 로깅 | 4 | 4 |
| 보안 감사 | 5 (RLS SQL) | 3 |
| 비용 예측 가능성 | 5 | 2 |
| 운영 복잡도 | 3 | 5 |
| **MAINT 평균** | **4.3** | **3.0** |

#### INTEG — 통합성

| 세부 항목 | Supabase | Firebase |
|-----------|----------|---------|
| Next.js 통합 | 5 | 4 |
| React 통합 | 5 | 4 |
| Google 생태계 통합 | 2 | 5 |
| Vercel 통합 | 5 | 3 |
| Stripe 연동 편의성 | 4 | 3 |
| CI/CD 통합 | 5 | 4 |
| REST API 표준성 | 5 | 3 |
| GraphQL 지원 | 4 (pg_graphql) | 2 |
| **INTEG 평균** | **4.4** | **3.5** |

### 8.3 종합 스코어링 테이블

| 항목 | 가중치 | Supabase | Firebase | 비고 |
|------|--------|----------|---------|------|
| **FUNC** (기능 완성도) | 20% | **3.7** | **4.0** | Firebase가 모바일/오프라인 강점 |
| **PERF** (성능) | 15% | **4.0** | **4.0** | 동등 (분야별 상이) |
| **DX** (개발자 경험) | 20% | **4.6** | **3.6** | Supabase TypeScript/CLI 강점 |
| **ECO** (생태계) | 10% | **4.0** | **4.6** | Firebase 더 성숙한 생태계 |
| **LIC** (라이선스/독립성) | 15% | **5.0** | **1.4** | Supabase 압도적 우위 |
| **MAINT** (유지보수성) | 10% | **4.3** | **3.0** | Supabase 스키마 관리/비용 우위 |
| **INTEG** (통합성) | 10% | **4.4** | **3.5** | Supabase 웹/Vercel 생태계 강점 |

### 8.4 가중 평균 최종 점수

```
Supabase:
  FUNC:  3.7 × 0.20 = 0.74
  PERF:  4.0 × 0.15 = 0.60
  DX:    4.6 × 0.20 = 0.92
  ECO:   4.0 × 0.10 = 0.40
  LIC:   5.0 × 0.15 = 0.75
  MAINT: 4.3 × 0.10 = 0.43
  INTEG: 4.4 × 0.10 = 0.44
  ─────────────────────────
  총점:              4.28 / 5.00

Firebase:
  FUNC:  4.0 × 0.20 = 0.80
  PERF:  4.0 × 0.15 = 0.60
  DX:    3.6 × 0.20 = 0.72
  ECO:   4.6 × 0.10 = 0.46
  LIC:   1.4 × 0.15 = 0.21
  MAINT: 3.0 × 0.10 = 0.30
  INTEG: 3.5 × 0.10 = 0.35
  ─────────────────────────
  총점:              3.44 / 5.00
```

#### 레이더 차트 (텍스트 시각화)

```
           FUNC(20%)
              5 ●
             4|
Integ(10%) ─3|─ PERF(15%)
           ─2|─
           ─1|─
  MAINT   ──●──── DX(20%)
  (10%)   
           LIC    ECO(10%)
           (15%)

■ Supabase: FUNC=3.7 / PERF=4.0 / DX=4.6 / ECO=4.0 / LIC=5.0 / MAINT=4.3 / INTEG=4.4
□ Firebase:  FUNC=4.0 / PERF=4.0 / DX=3.6 / ECO=4.6 / LIC=1.4 / MAINT=3.0 / INTEG=3.5
```

---

## 9. 결론

### 9.1 요약

2026년 시점에서 두 플랫폼은 서로 다른 철학과 강점을 가지고 있다:

**Supabase (종합 점수 4.28)**는:
- PostgreSQL 기반 강력한 관계형 데이터 처리
- 뛰어난 TypeScript/DX 경험과 마이그레이션 관리
- 오픈소스 및 자체 호스팅으로 벤더 독립성 확보
- 예측 가능한 비용 구조
- AI/벡터 검색 기능 내장

**Firebase (종합 점수 3.44)**는:
- 모바일 앱 개발에 최적화된 완성도 높은 생태계
- 오프라인 퍼스트 기능의 성숙도
- Google 생태계(Analytics, FCM, BigQuery)와의 통합
- 자동 확장성으로 인프라 관리 부담 없음

### 9.2 최종 권고

| 시나리오 | 권고 |
|---------|------|
| 웹 SaaS 플랫폼 구축 | **Supabase** |
| Next.js + Vercel 풀스택 앱 | **Supabase** |
| 규제 산업 (의료/금융) | **Supabase** (자체 호스팅) |
| Flutter 모바일 앱 | **Firebase** |
| 오프라인 필수 모바일 앱 | **Firebase** |
| 빠른 프로토타입 (모바일) | **Firebase** |
| AI/벡터 검색 필요 | **Supabase** |
| Google Analytics 필수 | **Firebase** + GA4 연동 |
| 비용 예측 중요 | **Supabase** |
| 오픈소스 필수 | **Supabase** |

### 9.3 2026년 트렌드 전망

- **Supabase**는 pgvector, AI Assistant 기능 확장으로 AI 앱 개발 플랫폼으로 진화 중. 2026 Q1 기준 1.2백만 활성 개발자 돌파, 45,000 GitHub Stars.
- **Firebase**는 Firebase GenKit(AI 통합 도구), Vertex AI 연동 강화. Google Cloud와의 통합 심화.
- 두 플랫폼 모두 AI 기능을 핵심 경쟁 전선으로 삼고 있으며, 2026년 이후 이 분야에서의 격차가 선택의 핵심 기준이 될 것이다.

---

## 참고 자료

- [Supabase 공식 Firebase 비교 페이지](https://supabase.com/alternatives/supabase-vs-firebase)
- [Supabase 공식 가격 페이지](https://supabase.com/pricing)
- [Firebase 공식 가격 페이지](https://firebase.google.com/pricing)
- [Tech-Insider Supabase vs Firebase 2026 벤치마크](https://tech-insider.org/supabase-vs-firebase-2026/)
- [Bytebase Supabase vs Firebase 2025](https://www.bytebase.com/blog/supabase-vs-firebase/)
- [Firebase to Supabase 공식 마이그레이션 가이드](https://supabase.com/docs/guides/platform/migrating-to-supabase/firestore-data)
- [Supabase Realtime Architecture 문서](https://supabase.com/docs/guides/functions/architecture)
- [Firebase vs Supabase Realtime 비교 (Ably)](https://ably.com/compare/firebase-vs-supabase)
- [Supabase Edge Functions 아키텍처](https://supabase.com/docs/guides/functions/architecture)
- [Appwrite vs Firebase vs Supabase Functions 비교](https://appwrite.io/blog/post/appwrite-vs-firebase-vs-supabase-functions-comparison)
- [Leanware Supabase vs Firebase 스타트업 가이드](https://www.leanware.co/insights/supabase-vs-firebase-complete-comparison-guide)
- [ClickITTech Firebase vs Supabase 2026](https://www.clickittech.com/software-development/supabase-vs-firebase/)
- [Hambardzumian Firebase vs Supabase 2026](https://hambardzumian.com/blog/firebase-vs-supabase-2026-comparison)
- [Supabase Storage Smart CDN 발표](https://supabase.com/blog/storage-image-resizing-smart-cdn)
- [Supabase 커뮤니티 Firebase 마이그레이션 GitHub](https://github.com/supabase-community/firebase-to-supabase)
