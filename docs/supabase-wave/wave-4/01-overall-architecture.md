# Supabase 전체 아키텍처 다이어그램

> Wave 4 / Document 1 — 전체 시스템 구성, 데이터 흐름, 서비스 의존성, 배포 및 보안 아키텍처

---

## 목차

1. [전체 시스템 아키텍처](#1-전체-시스템-아키텍처)
2. [컴포넌트별 상세 설명](#2-컴포넌트별-상세-설명)
3. [데이터 흐름 분석](#3-데이터-흐름-분석)
4. [서비스 간 의존성 맵](#4-서비스-간-의존성-맵)
5. [배포 아키텍처](#5-배포-아키텍처)
6. [보안 아키텍처](#6-보안-아키텍처)
7. [성능 및 확장성](#7-성능-및-확장성)
8. [운영 관찰성](#8-운영-관찰성)

---

## 1. 전체 시스템 아키텍처

### 1.1 최상위 구성도

Supabase는 단일 PostgreSQL 데이터베이스를 중심으로, 각 기능을 독립적인 마이크로서비스로 구성한 오픈소스 Firebase 대안입니다. 클라이언트의 모든 요청은 Kong API Gateway를 통해 라우팅됩니다.

```
╔══════════════════════════════════════════════════════════════════════════════════╗
║                              SUPABASE 전체 시스템                                ║
╠══════════════════════════════════════════════════════════════════════════════════╣
║                                                                                  ║
║  ┌─────────────────────────────────────────────────────────────────────────┐    ║
║  │                         클라이언트 레이어                                │    ║
║  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │    ║
║  │  │  웹 브라우저  │  │ 모바일 앱    │  │  서버 (SSR)  │  │  CLI/SDK  │  │    ║
║  │  │  (React/Vue)  │  │ (iOS/Android)│  │ (Next.js 등) │  │  (Node.js)│  │    ║
║  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘  │    ║
║  └─────────┼─────────────────┼─────────────────┼────────────────┼─────────┘    ║
║            │                 │                 │                │               ║
║            └─────────────────┼─────────────────┘                │               ║
║                              │  HTTPS / WSS                     │               ║
║  ┌───────────────────────────▼──────────────────────────────────▼─────────┐    ║
║  │                    Kong API Gateway (포트 8000/8443)                     │    ║
║  │                                                                          │    ║
║  │  라우팅 규칙:                                                             │    ║
║  │  /rest/v1/*      → PostgREST (5432 내부)                                 │    ║
║  │  /auth/v1/*      → GoTrue Auth (9999 내부)                               │    ║
║  │  /storage/v1/*   → Storage API (5000 내부)                               │    ║
║  │  /realtime/v1/*  → Realtime WS (4000 내부)                               │    ║
║  │  /functions/v1/* → Edge Runtime (8081 내부)                              │    ║
║  │  /graphql/v1/*   → pg_graphql (5432 통해)                                │    ║
║  │  /pg/*           → pgMeta API (8080 내부)                                │    ║
║  │                                                                          │    ║
║  │  공통 처리: JWT 검증, CORS, Rate Limiting, API Key 인증                   │    ║
║  └──────────────────────────┬───────────────────────────────────────────────┘    ║
║                             │                                                    ║
║     ┌───────────────────────┼────────────────────────────┐                      ║
║     │                       │                            │                      ║
║  ┌──▼──────────┐  ┌─────────▼────────┐  ┌──────────────▼──────────────────┐   ║
║  │ PostgREST   │  │  GoTrue (Auth)   │  │    Realtime Server               │   ║
║  │             │  │                  │  │                                   │   ║
║  │ REST CRUD   │  │ JWT 발급/검증    │  │ WebSocket 채널 관리               │   ║
║  │ GraphQL via │  │ OAuth 2.0        │  │ Broadcast, Presence              │   ║
║  │ pg_graphql  │  │ MFA, OTP         │  │ DB Changes (WAL 구독)            │   ║
║  └──────┬──────┘  └────────┬─────────┘  └──────────────┬──────────────────┘   ║
║         │                  │                            │ WAL 스트림             ║
║  ┌──────▼──────┐  ┌────────▼─────────┐  ┌─────────────▼──────────────────┐   ║
║  │  Supavisor  │  │   Storage API    │  │    Edge Runtime (Deno)          │   ║
║  │             │  │                  │  │                                   │   ║
║  │ 연결 풀링   │  │ 파일 CRUD        │  │ V8 Isolate 기반 실행              │   ║
║  │ Transaction │  │ 접근 제어 (RLS)  │  │ TypeScript/JavaScript            │   ║
║  │ Session 모드│  │ 이미지 변환 프록시│  │ 글로벌 엣지 배포                 │   ║
║  └──────┬──────┘  └────────┬─────────┘  └─────────────────────────────────┘   ║
║         │                  │ ↕                                                   ║
║         │                  │  imgproxy ← 이미지 변환 (리사이즈/WebP 변환)         ║
║         │                  │                                                    ║
║  ┌──────▼──────────────────▼────────────────────────────────────────────────┐  ║
║  │                      PostgreSQL (핵심 데이터베이스)                        │  ║
║  │                                                                            │  ║
║  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  ║
║  │  │ auth 스키마  │  │storage 스키마│  │realtime 스키마│  │ public 스키마│  │  ║
║  │  │ (GoTrue 전용)│  │(Storage 전용)│  │(Realtime 전용)│  │ (사용자 데이터│ │  ║
║  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘  │  ║
║  │                                                                            │  ║
║  │  Row Level Security (RLS) | WAL | pg_graphql | pg_net | pgsodium          │  ║
║  └────────────────────────────────────────────────────────────────────────────┘  ║
║                                                                                  ║
║  ┌─────────────────────┐  ┌─────────────────────┐                               ║
║  │  Analytics (Logflare)│  │  Studio (대시보드)   │                               ║
║  │  로그 집계/조회       │  │  pgMeta를 통한 DB    │                               ║
║  │  벡터 로그 처리       │  │  관리 UI              │                               ║
║  └─────────────────────┘  └─────────────────────┘                               ║
╚══════════════════════════════════════════════════════════════════════════════════╝
```

### 1.2 네트워크 레이어 구조

```
인터넷
  │
  │ (TLS 443 / 80)
  ▼
┌─────────────────────────────────────────────────────┐
│  Managed: Cloudflare CDN + DDoS Protection          │
│  Self-hosted: Nginx / Traefik (사용자 구성)           │
└────────────────────────┬────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│  Kong API Gateway (DB-less 모드, YAML 설정)          │
│  - anon key / service_role key 검증                  │
│  - JWT 서명 검증 (HS256 또는 RS256)                  │
│  - Rate Limiting 플러그인                            │
│  - CORS 플러그인                                     │
│  - Request/Response 변환                            │
└────────────────────────┬────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
    PostgREST        GoTrue          Storage API
    (REST/GraphQL)   (Auth)          (파일 저장)
         │               │               │
         └───────────────┼───────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  Supavisor (풀러)   │
              │  Transaction Mode   │
              │  Session Mode       │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   PostgreSQL 15+    │
              │   (단일 진실 소스)   │
              └─────────────────────┘
```

---

## 2. 컴포넌트별 상세 설명

### 2.1 Kong API Gateway

Kong은 Supabase의 단일 진입점(Single Entry Point)으로, DB-less 선언형 모드로 운영됩니다. 모든 설정은 YAML 파일로 정의되며 데이터베이스 없이 작동합니다.

**핵심 역할:**
- 경로 기반 라우팅: `/rest/v1/`, `/auth/v1/`, `/storage/v1/`, `/realtime/v1/`, `/functions/v1/`
- API Key 인증: `apikey` 헤더 검증 (anon key, service_role key)
- JWT 검증: Bearer 토큰 유효성 검사
- CORS 처리: 허용된 오리진 필터링
- Rate Limiting: 과부하 방지

**Kong 라우팅 규칙 (내부 YAML 예시):**

```yaml
# kong.yml (자체 호스팅 설정)
_format_version: "2.1"

consumers:
  - username: anon
    keyauth_credentials:
      - key: ${ANON_KEY}
  - username: service_role
    keyauth_credentials:
      - key: ${SERVICE_ROLE_KEY}

services:
  - name: postgrest
    url: http://rest:3000/
    routes:
      - name: postgrest-v1
        strip_path: true
        paths:
          - /rest/v1/
    plugins:
      - name: cors
      - name: key-auth
        config:
          hide_credentials: true

  - name: auth
    url: http://auth:9999/
    routes:
      - name: auth-v1
        strip_path: true
        paths:
          - /auth/v1/

  - name: storage
    url: http://storage:5000/
    routes:
      - name: storage-v1
        strip_path: true
        paths:
          - /storage/v1/

  - name: realtime
    url: http://realtime-dev.supabase-realtime:4000/socket/
    routes:
      - name: realtime-v1
        strip_path: true
        paths:
          - /realtime/v1/
```

### 2.2 PostgreSQL (핵심 데이터베이스)

모든 Supabase 서비스의 데이터는 단일 PostgreSQL 인스턴스에 저장됩니다. 각 서비스는 전용 스키마를 사용합니다.

**스키마 구조:**
```
PostgreSQL
├── public          ← 사용자 애플리케이션 데이터
├── auth            ← GoTrue가 관리 (users, sessions, identities 등)
├── storage         ← Storage API가 관리 (buckets, objects 등)
├── realtime        ← Realtime이 관리 (subscription 상태)
├── extensions      ← pg_graphql, pgsodium, pg_net 등
└── _analytics      ← Logflare 로그 메타데이터
```

**주요 확장 기능:**
- `pg_graphql`: GraphQL 쿼리를 SQL로 변환 (PostgREST 통해 노출)
- `pg_net`: PostgreSQL 내부에서 HTTP 요청 발송 (웹훅)
- `pgsodium`: 컬럼 레벨 암호화 (Transparent Column Encryption)
- `pgcrypto`: 해시, 암호화 유틸리티
- `uuid-ossp` / `gen_random_uuid()`: UUID 생성
- `pg_tle`: Trusted Language Extensions (사용자 정의 확장)

### 2.3 Supavisor (연결 풀러)

Supavisor는 Elixir로 작성된 클라우드 네이티브, 멀티테넌트 PostgreSQL 연결 풀러입니다. PgBouncer를 대체하며 수백만 개의 클라이언트 연결을 처리합니다.

```
클라이언트 N개 (수백만)
         │
         ▼
┌─────────────────────────┐
│      Supavisor          │
│                         │
│  Transaction Mode:      │
│  - 쿼리 단위 연결 공유  │
│  - Prepared Statement X │
│  - 서버리스에 최적       │
│                         │
│  Session Mode:          │
│  - 클라이언트당 1 연결  │
│  - Prepared Statement O │
│  - 장시간 연결에 적합    │
└──────────┬──────────────┘
           │ 실제 DB 연결 (수십~수백 개)
           ▼
┌─────────────────────────┐
│    PostgreSQL           │
│    max_connections      │
│    (보통 100~500)       │
└─────────────────────────┘
```

**Supavisor 설계 특징:**
- Elixir/OTP 기반: BEAM VM의 고가용성, 분산 처리 활용
- 멀티테넌트: 하나의 Supavisor 인스턴스가 수천 개의 테넌트 DB를 관리
- 클러스터 동작: 노드 장애 시 자동 풀 재연결
- 테넌트 설정을 PostgreSQL DB에서 로드하여 동적 확장

### 2.4 GoTrue (인증 서비스)

Netlify의 GoTrue를 포크하여 Supabase가 관리하는 Go 기반 JWT 인증 서비스입니다.

**지원 기능:**
- 이메일/비밀번호 인증
- Magic Link (OTP 이메일)
- OAuth 2.0: Google, GitHub, Apple, Kakao 등 20+ 공급자
- PKCE (Proof Key for Code Exchange) 플로우
- MFA: TOTP (Google Authenticator 등)
- SAML 2.0 (Enterprise)
- 익명 로그인
- 전화번호 인증 (Twilio 연동)

**JWT 토큰 구조:**
```json
{
  "aud": "authenticated",
  "exp": 1735689600,
  "iat": 1735686000,
  "iss": "https://your-project.supabase.co/auth/v1",
  "sub": "user-uuid",
  "email": "user@example.com",
  "role": "authenticated",
  "app_metadata": {
    "provider": "email",
    "providers": ["email"]
  },
  "user_metadata": {
    "full_name": "홍길동"
  },
  "session_id": "session-uuid"
}
```

### 2.5 PostgREST

PostgreSQL 스키마를 읽어 자동으로 REST API를 생성하는 Haskell 기반 서비스입니다. 별도의 코드 없이 테이블/뷰/함수를 즉시 API로 노출합니다.

**자동 엔드포인트 생성:**
```
테이블: public.todos
→ GET    /rest/v1/todos          (전체 조회)
→ POST   /rest/v1/todos          (생성)
→ PATCH  /rest/v1/todos?id=eq.1  (수정)
→ DELETE /rest/v1/todos?id=eq.1  (삭제)
→ GET    /rest/v1/todos?select=id,title,user_id(users(*))  (JOIN 조회)

함수: public.get_leaderboard()
→ POST   /rest/v1/rpc/get_leaderboard
```

**RLS 통합:**
JWT의 `role` 클레임이 PostgreSQL 역할로 매핑되고, RLS 정책이 자동 적용됩니다:
- `anon`: 비인증 사용자 (anon key 사용 시)
- `authenticated`: 인증된 사용자 (JWT 토큰 보유 시)
- `service_role`: 관리자 (RLS 우회)

### 2.6 Realtime 서버

Elixir/Phoenix 기반의 실시간 WebSocket 서버입니다. WAL(Write-Ahead Log)을 구독하여 DB 변경사항을 실시간으로 클라이언트에 전달합니다.

**세 가지 채널 타입:**
```
1. Broadcast (채널 간 메시지 전달)
   클라이언트 A → Realtime → 클라이언트 B, C, D
   (DB 저장 없음, 순수 메시지 브로커)

2. Presence (온라인 상태 추적)
   클라이언트들의 상태(온라인/오프라인/커서 위치 등)를 공유
   CRDT(충돌 없는 복제 데이터 타입) 기반

3. Postgres Changes (DB 변경 스트리밍)
   PostgreSQL WAL → Realtime → WebSocket → 클라이언트
   INSERT/UPDATE/DELETE/TRUNCATE 이벤트 지원
```

### 2.7 Storage API

S3 호환 오브젝트 스토리지로, 파일 메타데이터는 PostgreSQL에 저장하고 실제 바이너리는 S3/로컬 디스크에 저장합니다.

**내부 구조:**
```
클라이언트 업로드 요청
         │
         ▼
Storage API (Node.js)
    │           │
    │           ▼
    │      파일 메타데이터 → PostgreSQL (storage.objects 테이블)
    │
    ▼
S3 / 로컬 파일시스템 (실제 바이너리)
         │
         ▼ (이미지 변환 요청 시)
      imgproxy
      - 리사이즈
      - 크롭
      - WebP/AVIF 변환
      - 워터마크
         │
         ▼
       CDN 캐시 (Managed: Cloudflare)
```

**버킷 접근 제어:**
```sql
-- 공개 버킷: 인증 없이 접근 가능
-- 비공개 버킷: Storage RLS 정책 적용

-- 예: 자신의 파일만 업로드 가능
CREATE POLICY "사용자는 자신의 폴더에만 업로드"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

### 2.8 Edge Functions (Edge Runtime)

Deno 기반의 V8 Isolate 실행 환경입니다. 각 요청마다 새로운 격리된 실행 컨텍스트를 생성합니다.

**실행 흐름:**
```
클라이언트 HTTP 요청
         │
         ▼
Edge Gateway (JWT 검증, 라우팅)
         │
         ▼
V8 Isolate 생성 (격리된 실행 환경)
         │
         ├── 각 Isolate는 독립 메모리 힙
         ├── Deno 표준 라이브러리 사용 가능
         ├── Supabase 클라이언트 내장
         └── ESZip 번들 로드 (빠른 시작)
         │
         ▼
함수 실행 (TypeScript/JavaScript)
         │
         ▼
응답 반환 + Isolate 종료
```

---

## 3. 데이터 흐름 분석

### 3.1 읽기 경로 (Read Path)

```
클라이언트
    │
    │ GET /rest/v1/todos?select=*&user_id=eq.abc
    │ Headers: apikey: <anon_key>, Authorization: Bearer <JWT>
    ▼
Kong API Gateway
    │
    │ 1. API Key 유효성 검사 (anon_key 일치 확인)
    │ 2. JWT 서명 검증 (HMAC-SHA256)
    │ 3. /rest/v1/ 경로 → PostgREST 서비스로 포워딩
    ▼
PostgREST
    │
    │ 1. JWT에서 role 추출 ("authenticated" 또는 "anon")
    │ 2. 쿼리 파라미터를 SQL로 변환:
    │    SELECT * FROM todos WHERE user_id = 'abc'
    │ 3. SET role = 'authenticated';
    │    SET request.jwt.claims = '{"sub": "...", ...}';
    ▼
Supavisor (Transaction Mode)
    │
    │ 1. 사용 가능한 DB 연결 할당
    │ 2. SQL 실행 후 연결 반환 (트랜잭션 완료 시)
    ▼
PostgreSQL
    │
    │ 1. SET LOCAL role = 'authenticated'
    │ 2. RLS 정책 평가:
    │    auth.uid() = user_id  → TRUE이면 허용
    │ 3. 쿼리 실행 및 결과 반환
    ▼
PostgREST → JSON 직렬화
    ▼
Kong → CORS 헤더 추가
    ▼
클라이언트 (JSON 응답)

평균 지연 시간: 5~20ms (동일 리전)
```

### 3.2 쓰기 경로 + WAL 스트리밍

```
클라이언트
    │
    │ POST /rest/v1/todos
    │ Body: {"title": "새 작업", "user_id": "abc"}
    ▼
Kong → PostgREST → Supavisor → PostgreSQL
    │
    │ INSERT INTO todos (title, user_id) VALUES (...)
    │ RLS INSERT 정책 검사 → 통과
    │ 행 삽입 완료
    │
    │ ↓ WAL (Write-Ahead Log) 기록
    ▼
PostgreSQL WAL 스트림
    │
    │ 변경 이벤트: {table: "todos", type: "INSERT", record: {...}}
    ▼
Realtime 서버 (WAL 구독자)
    │
    │ 1. WAL 디코딩 (wal2json 플러그인)
    │ 2. 변경된 테이블의 구독자 목록 조회
    │ 3. 각 구독자의 RLS 필터 적용
    │    (구독자가 해당 행을 SELECT 할 수 있는지 검사)
    ▼
WebSocket 채널
    │
    │ 구독 중인 클라이언트들에게 이벤트 브로드캐스트
    ▼
클라이언트들 실시간 업데이트 수신
    │
    │ 병렬 처리: pg_net으로 외부 웹훅 발송
    ▼
외부 웹훅 수신 서버 (Stripe, Slack 등)
```

### 3.3 인증 흐름

```
[최초 로그인 흐름]

클라이언트
    │
    │ POST /auth/v1/token?grant_type=password
    │ Body: {"email": "user@ex.com", "password": "secret"}
    ▼
Kong (auth 경로 → GoTrue 포워딩)
    ▼
GoTrue
    │
    │ 1. auth.users에서 이메일 조회
    │ 2. bcrypt 해시 비교
    │ 3. 성공 시:
    │    - Access Token (JWT) 생성 (기본 1시간 유효)
    │    - Refresh Token 생성 (기본 1주일)
    │    - auth.sessions에 세션 기록
    │    - auth.refresh_tokens에 토큰 저장
    ▼
응답: {access_token, refresh_token, expires_in, user}

[토큰 갱신 흐름]

클라이언트 (access_token 만료 감지)
    │
    │ POST /auth/v1/token?grant_type=refresh_token
    │ Body: {"refresh_token": "..."}
    ▼
GoTrue
    │
    │ 1. auth.refresh_tokens에서 토큰 검증
    │ 2. 기존 refresh_token 무효화 (Rotation)
    │ 3. 새 access_token + refresh_token 발급
    ▼
클라이언트 쿠키/스토리지 업데이트

[이후 API 요청 흐름]

클라이언트
    │ Authorization: Bearer <access_token>
    ▼
Kong → JWT 서명 검증 (Supabase JWT Secret 사용)
    ▼
PostgREST → JWT claims를 PostgreSQL 설정값으로 주입
    ▼
PostgreSQL → RLS 정책에서 auth.uid() 함수로 사용자 식별
```

### 3.4 파일 업로드/서빙 흐름

```
[업로드 흐름]

클라이언트
    │
    │ POST /storage/v1/object/avatars/user-123/profile.jpg
    │ Headers: Authorization: Bearer <JWT>
    │ Body: <바이너리 데이터>
    ▼
Kong → Storage API
    │
    │ 1. JWT 검증 및 사용자 식별
    │ 2. storage.objects RLS 정책 검사
    │    (해당 경로에 쓰기 권한 있는지)
    │ 3. S3/로컬에 파일 저장
    │ 4. PostgreSQL storage.objects에 메타데이터 저장:
    │    {bucket_id, name, owner, size, mimetype, ...}
    ▼
응답: {Key: "avatars/user-123/profile.jpg"}

[이미지 서빙 + 변환 흐름]

클라이언트
    │ GET /storage/v1/render/image/public/avatars/user-123/profile.jpg
    │     ?width=200&height=200&resize=cover&format=webp
    ▼
Storage API
    │
    │ 1. 파일 접근 권한 검사
    │ 2. imgproxy에 변환 요청 전달
    ▼
imgproxy
    │
    │ 1. S3에서 원본 파일 로드
    │ 2. 200x200 크롭 + WebP 변환
    │ 3. 변환된 이미지 반환
    ▼
Storage API → CDN 캐시 헤더 설정
    ▼
클라이언트 (최적화된 WebP 이미지 수신)
    │
    │ 이후 동일 요청: CDN 캐시 HIT → Storage 서버 우회
```

---

## 4. 서비스 간 의존성 맵

### 4.1 의존성 다이어그램

```
                    ┌─────────────────────────────────────┐
                    │                                     │
                    │         PostgreSQL                  │
                    │         (모든 서비스의 중심)          │
                    │                                     │
                    └──────────────┬──────────────────────┘
                                   │
          ┌────────────────────────┼─────────────────────────┐
          │                        │                         │
          ▼                        ▼                         ▼
   ┌──────────────┐        ┌──────────────┐         ┌──────────────┐
   │   GoTrue     │        │  PostgREST   │         │  Realtime    │
   │   (Auth)     │        │              │         │              │
   │              │        │ pg_graphql   │         │ WAL 구독     │
   │ auth.*       │        │ 의존: PG     │         │ 의존: PG     │
   │ 스키마 사용  │        └──────────────┘         └──────────────┘
   └──────┬───────┘
          │ JWT 발급
          ▼
   모든 서비스가 GoTrue JWT를 신뢰
   (검증 키 공유)

          ┌──────────────────────────────────────┐
          │            Storage API               │
          │                                      │
          │  의존:                               │
          │  - PostgreSQL (메타데이터 저장)       │
          │  - GoTrue (인증/RLS)                 │
          │  - imgproxy (이미지 변환)            │
          │  - S3/MinIO (바이너리 저장)          │
          └──────────────────────────────────────┘

          ┌──────────────────────────────────────┐
          │          Edge Functions              │
          │                                      │
          │  의존:                               │
          │  - GoTrue (auth.getUser())           │
          │  - PostgreSQL (직접 쿼리)            │
          │  - Storage (파일 접근)               │
          │  - 외부 API (pg_net 또는 fetch)      │
          └──────────────────────────────────────┘
```

### 4.2 서비스별 의존성 행렬

| 서비스 | PostgreSQL | GoTrue | PostgREST | Realtime | Storage | Supavisor |
|--------|:----------:|:------:|:---------:|:--------:|:-------:|:---------:|
| Kong | - | - | - | - | - | - |
| GoTrue | ✅ 필수 | - | - | - | - | ✅ 통해 |
| PostgREST | ✅ 필수 | ✅ JWT | - | - | - | ✅ 통해 |
| Realtime | ✅ WAL | ✅ RLS | - | - | - | ✅ 통해 |
| Storage | ✅ 메타 | ✅ JWT | - | - | - | ✅ 통해 |
| Edge Fn | ✅ 선택 | ✅ 선택 | ✅ 선택 | ✅ 선택 | ✅ 선택 | ✅ 통해 |
| pgMeta | ✅ 필수 | - | - | - | - | - |
| Studio | ✅ 통해 | - | ✅ 통해 | - | ✅ 통해 | - |
| Logflare | ✅ 선택 | - | - | - | - | - |

### 4.3 시작 순서 의존성

```
Docker Compose 서비스 시작 순서:

1단계 (기반 서비스):
  └── PostgreSQL (db)
       └── healthcheck: pg_isready 통과 시 다음 단계

2단계 (풀러 + 초기화):
  ├── Supavisor (pooler) → depends_on: db healthy
  └── db_migrations → depends_on: db healthy

3단계 (핵심 API 서비스):
  ├── GoTrue (auth)      → depends_on: db healthy
  ├── PostgREST (rest)   → depends_on: db healthy
  ├── Realtime           → depends_on: db healthy
  ├── Storage            → depends_on: db healthy
  └── pgMeta (meta)      → depends_on: db healthy

4단계 (보조 서비스):
  ├── imgproxy           → depends_on: storage
  ├── Edge Runtime       → depends_on: auth, rest
  └── Logflare           → depends_on: db

5단계 (게이트웨이 + UI):
  ├── Kong               → depends_on: auth, rest, storage, realtime
  └── Studio             → depends_on: meta, kong
```

---

## 5. 배포 아키텍처

### 5.1 Managed (클라우드 관리형)

Supabase가 운영하는 managed 서비스는 AWS 기반으로 여러 리전에 분산 배포됩니다.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Supabase Cloud (Managed)                             │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     글로벌 엣지 레이어                               │ │
│  │                                                                    │ │
│  │  Cloudflare CDN  ←── 정적 자산, Storage 이미지 캐싱                 │ │
│  │  Edge Functions  ←── 사용자와 가장 가까운 리전에서 실행              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │                                            │
│  ┌───────────────────────────▼────────────────────────────────────────┐ │
│  │                     리전별 배포 (예: ap-northeast-1)                 │ │
│  │                                                                    │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │  프로젝트 격리 레이어                                          │ │ │
│  │  │  (각 Supabase 프로젝트 = 독립 컨테이너 그룹)                   │ │ │
│  │  │                                                              │ │ │
│  │  │  Kong ─→ GoTrue, PostgREST, Realtime, Storage               │ │ │
│  │  │              │                                              │ │ │
│  │  │          Supavisor ─→ PostgreSQL (전용 인스턴스)             │ │ │
│  │  │              │                                              │ │ │
│  │  │          Read Replica (Pro+ 플랜, 동일/다른 리전)            │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  │                                                                    │ │
│  │  S3 (파일 저장) + WAL 아카이빙 (Point-in-Time Recovery)            │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘

리전 목록 (2025 기준):
- us-east-1 (버지니아)
- us-west-1 (오레곤)
- eu-central-1 (프랑크푸르트)
- eu-west-2 (런던)
- ap-northeast-1 (도쿄)
- ap-southeast-1 (싱가포르)
- ap-southeast-2 (시드니)
- sa-east-1 (상파울루)
```

### 5.2 Self-hosted (Docker Compose)

```
호스트 서버 (Ubuntu 22.04 / Debian 12 권장)
│
├── Docker Engine 24+
│   └── Docker Compose
│
└── /opt/supabase/
    ├── docker-compose.yml     ← 서비스 정의
    ├── .env                   ← 환경변수 (시크릿 관리 필수!)
    ├── volumes/
    │   ├── db/
    │   │   └── init/          ← DB 초기화 SQL
    │   ├── storage/           ← 파일 저장 경로
    │   ├── functions/         ← Edge Functions 소스
    │   └── logs/              ← Logflare 로그
    └── kong.yml               ← Kong API Gateway 설정

Docker Compose 서비스 구성도:

┌─────────────────────────────────────────────────┐
│  Docker Network: supabase_network               │
│                                                 │
│  ┌─────────┐  ┌──────────┐  ┌────────────────┐ │
│  │  kong   │  │   auth   │  │      rest      │ │
│  │ :8000   │  │  :9999   │  │    :3000       │ │
│  └────┬────┘  └────┬─────┘  └───────┬────────┘ │
│       │            │                │           │
│  ┌────▼────────────▼────────────────▼─────────┐ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐ │ │
│  │  │realtime  │  │ storage  │  │  meta    │ │ │
│  │  │  :4000   │  │  :5000   │  │  :8080   │ │ │
│  │  └──────────┘  └──────────┘  └──────────┘ │ │
│  └─────────────────────────────────────────────┘ │
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │        db (PostgreSQL :5432)             │   │
│  │        pooler (Supavisor :6543)          │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
│  ┌──────────────┐  ┌──────────────┐            │
│  │   imgproxy   │  │   studio     │            │
│  │   :8080(내부)│  │   :3000(UI)  │            │
│  └──────────────┘  └──────────────┘            │
└─────────────────────────────────────────────────┘

외부 노출 포트:
- 8000: Kong HTTP (API 엔드포인트)
- 8443: Kong HTTPS
- 3000: Studio (대시보드 UI, 내부망 전용 권장)
```

### 5.3 Self-hosted 환경변수 필수 항목

```bash
# .env (절대 Git 커밋 금지!)

# PostgreSQL
POSTGRES_PASSWORD=your-super-secret-password
POSTGRES_DB=postgres

# JWT 시크릿 (32자 이상 랜덤 문자열)
JWT_SECRET=your-super-secret-jwt-token-with-at-least-32-characters

# API Keys (JWT 서명된 토큰)
ANON_KEY=<jwt-with-role-anon>
SERVICE_ROLE_KEY=<jwt-with-role-service_role>

# Site URL
SITE_URL=https://your-domain.com
ADDITIONAL_REDIRECT_URLS=https://your-domain.com

# Studio
DASHBOARD_USERNAME=supabase
DASHBOARD_PASSWORD=your-dashboard-password

# SMTP (이메일 발송)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_ADMIN_EMAIL=admin@your-domain.com

# Storage
STORAGE_BACKEND=file  # 또는 s3
FILE_SIZE_LIMIT=52428800  # 50MB

# S3 (S3 백엔드 사용 시)
AWS_DEFAULT_REGION=ap-northeast-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
STORAGE_S3_BUCKET=your-bucket-name
```

---

## 6. 보안 아키텍처

### 6.1 다층 보안 모델

```
요청 처리 보안 레이어 (깊이 우선 순서):

레이어 1: 네트워크
    ├── TLS/HTTPS 강제 (HTTP → HTTPS 리디렉션)
    ├── DDoS 방어 (Cloudflare / 로드 밸런서)
    └── IP Allowlist (Self-hosted: 방화벽 규칙)

레이어 2: API Gateway (Kong)
    ├── API Key 검증 (anon 또는 service_role)
    ├── JWT 서명 검증 (HMAC-SHA256)
    ├── Rate Limiting (초당 요청 수 제한)
    ├── CORS 오리진 검사
    └── 허용된 HTTP 메서드만 통과

레이어 3: 서비스 레이어
    ├── GoTrue: 인증된 사용자만 민감 엔드포인트 접근
    ├── PostgREST: JWT role 클레임 검증
    ├── Storage: 버킷별 공개/비공개 설정
    └── Realtime: 채널 구독 권한 검사

레이어 4: 데이터베이스 (PostgreSQL)
    ├── Row Level Security (RLS)
    │   └── 모든 테이블에 RLS 활성화 권장
    ├── 컬럼 레벨 암호화 (pgsodium)
    ├── 역할 기반 접근 제어 (RBAC)
    │   ├── anon: 최소 권한
    │   ├── authenticated: 일반 사용자 권한
    │   └── service_role: 관리자 권한 (RLS 우회)
    └── 감사 로그 (pg_audit 확장)
```

### 6.2 RLS (Row Level Security) 패턴

```sql
-- 모든 사용자 테이블에 RLS 활성화 (필수)
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todos FORCE ROW LEVEL SECURITY;  -- 테이블 소유자도 적용

-- 기본 정책: 자신의 데이터만 접근
CREATE POLICY "todos_select_own"
ON public.todos
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "todos_insert_own"
ON public.todos
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "todos_update_own"
ON public.todos
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "todos_delete_own"
ON public.todos
FOR DELETE
USING (auth.uid() = user_id);

-- 팀 기반 접근 정책 예시
CREATE POLICY "team_members_can_read"
ON public.team_documents
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = team_documents.team_id
    AND user_id = auth.uid()
  )
);

-- 역할 기반 정책 (JWT claims 활용)
CREATE POLICY "admin_full_access"
ON public.todos
FOR ALL
USING (
  (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
);
```

### 6.3 API Key 보안 계층

```
┌────────────────────────────────────────────────────────────┐
│                    API Key 종류                             │
│                                                            │
│  anon key (공개 가능)                                      │
│  ├── 클라이언트 측 JavaScript에 노출해도 안전              │
│  ├── RLS가 올바르게 설정된 경우 데이터 보호됨              │
│  ├── 비인증 사용자의 공개 데이터 읽기에 사용               │
│  └── JWT payload: {"role": "anon"}                        │
│                                                            │
│  service_role key (절대 노출 금지!)                        │
│  ├── 서버 측에서만 사용 (Node.js, Edge Functions 등)       │
│  ├── RLS를 완전히 우회                                     │
│  ├── 모든 데이터에 무제한 접근                             │
│  ├── 환경변수로만 관리 (.env, Vercel Secrets 등)           │
│  └── JWT payload: {"role": "service_role"}               │
│                                                            │
│  JWT Access Token (동적, 사용자별)                        │
│  ├── GoTrue가 로그인 시 발급                               │
│  ├── 기본 만료: 1시간                                      │
│  ├── role: "authenticated" + 사용자 UUID 포함              │
│  └── Refresh Token으로 자동 갱신                           │
└────────────────────────────────────────────────────────────┘
```

### 6.4 네트워크 보안 (Self-hosted 권장 설정)

```nginx
# Nginx 리버스 프록시 설정 (Kong 앞단)
server {
    listen 443 ssl http2;
    server_name api.your-domain.com;

    ssl_certificate /etc/letsencrypt/live/.../fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/.../privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Studio는 내부망에서만 접근 허용
    location /studio/ {
        allow 10.0.0.0/8;     # 내부망
        allow 127.0.0.1;       # 로컬
        deny all;
        proxy_pass http://localhost:3000/;
    }

    # API Gateway
    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket 지원 (Realtime용)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

# HTTP → HTTPS 리디렉션
server {
    listen 80;
    return 301 https://$host$request_uri;
}
```

---

## 7. 성능 및 확장성

### 7.1 Managed 플랜별 성능

```
Free 플랜:
├── PostgreSQL: 500MB 저장, 공유 CPU/RAM
├── Storage: 1GB
├── Edge Functions: 500K 요청/월
├── Realtime: 200 동시 연결
├── 인증: 50,000 MAU
└── 주의: 7일 비활성 시 프로젝트 일시 정지

Pro 플랜 ($25/월):
├── PostgreSQL: 8GB 저장, 전용 인스턴스
├── Storage: 100GB
├── Edge Functions: 2M 요청/월
├── Realtime: 500 동시 연결
└── PITR (Point-in-Time Recovery): 7일

Team 플랜 ($599/월):
├── 더 큰 인스턴스, Read Replicas 지원
├── PITR: 28일
├── 고급 보안 기능 (SSO, Audit Log)
└── 전용 지원

Enterprise:
└── 커스텀 인스턴스, 전용 VPC, SLA 보장
```

### 7.2 확장 전략

```
읽기 확장:
클라이언트 → Kong → PostgREST → Supavisor
                                    │
                          ┌─────────┴──────────┐
                          ▼                    ▼
                    Primary DB          Read Replica
                    (쓰기)              (읽기 전용)
                                        (Pro+ 플랜)

연결 수 확장:
직접 연결 (5432) → 최대 max_connections (기본 100)
Supavisor  (6543) → 사실상 무제한 (Transaction Mode)

쓰기 확장:
- 큰 배치 작업: 청크 단위 분할
- 비동기 처리: Edge Functions + 큐
- Webhook: pg_net으로 비동기 발송
```

---

## 8. 운영 관찰성

### 8.1 로깅 아키텍처

```
각 서비스 로그
    │
    ▼
Logflare (벡터 기반 로그 집계)
    │
    ├── PostgreSQL 쿼리 로그
    ├── Auth 이벤트 로그 (로그인/로그아웃/실패)
    ├── Storage 접근 로그
    ├── Edge Functions 실행 로그
    └── API Gateway 요청 로그

Supabase Dashboard
    ├── 실시간 로그 뷰어
    ├── 슬로우 쿼리 리포트
    └── 오류율 모니터링
```

### 8.2 주요 모니터링 지표

| 지표 | 임계값 | 대응 방법 |
|------|--------|-----------|
| DB CPU | >80% | 인스턴스 업그레이드 또는 쿼리 최적화 |
| DB 연결 수 | max_connections의 80% | Supavisor Transaction Mode 전환 |
| 슬로우 쿼리 | >1초 | 인덱스 추가, EXPLAIN ANALYZE |
| Realtime 지연 | >500ms | WAL sender 설정 확인 |
| Storage I/O | 높은 지연 | CDN 캐시 히트율 확인 |
| Edge Fn 타임아웃 | 기본 60초 | 함수 최적화 또는 백그라운드 처리 |

---

## 참고 자료

- [Supabase 공식 아키텍처 문서](https://supabase.com/docs/guides/getting-started/architecture)
- [Supavisor 블로그 포스트](https://supabase.com/blog/supavisor-postgres-connection-pooler)
- [Supabase 자체 호스팅 가이드](https://supabase.com/docs/guides/self-hosting/docker)
- [DeepWiki: Supabase Docker Compose 아키텍처](https://deepwiki.com/supabase/supabase/3.1-docker-compose-architecture)
- [Edge Functions 아키텍처](https://supabase.com/docs/guides/functions/architecture)
- [Auth 아키텍처](https://supabase.com/docs/guides/auth/architecture)

---

> Wave 4 / Document 1 작성 완료
> 다음: `02-nextjs-integration.md` — Next.js 15 + Supabase 통합 아키텍처
