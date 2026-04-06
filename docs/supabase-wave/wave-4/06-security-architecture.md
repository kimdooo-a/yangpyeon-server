# Wave 4 — Supabase 보안 아키텍처 설계

> 작성일: 2026-04-06  
> 참조: [Supabase Security](https://supabase.com/security) | [RLS Docs](https://supabase.com/docs/guides/database/postgres/row-level-security) | [Platform Security](https://supabase.com/docs/guides/security/platform-security) | [API Keys](https://supabase.com/docs/guides/api/api-keys)

---

## 목차

1. [보안 계층 설계 (Defense in Depth)](#1-보안-계층-설계)
2. [키 관리 전략](#2-키-관리-전략)
3. [RLS 보안 체크리스트](#3-rls-보안-체크리스트)
4. [보안 모니터링](#4-보안-모니터링)
5. [인시던트 대응 계획](#5-인시던트-대응-계획)
6. [보안 설정 자동화](#6-보안-설정-자동화)

---

## 1. 보안 계층 설계

Supabase 기반 애플리케이션은 **5개의 방어 계층(Defense in Depth)**으로 구성된다.  
각 계층은 독립적으로 동작하며, 하나가 뚫려도 다음 계층이 차단한다.

```
┌──────────────────────────────────────────────────────────────────┐
│           Supabase 보안 아키텍처 — 5계층 방어                     │
│                                                                  │
│  클라이언트 (Browser / App)                                       │
│       │                                                          │
│  ─────▼─────────────────────────────────────────────────────    │
│  Layer 1: 네트워크                                               │
│           SSL/TLS 암호화, Cloudflare CDN, IP 제한                │
│  ─────────────────────────────────────────────────────────────  │
│  Layer 2: API Gateway                                            │
│           Kong, Rate Limiting, CORS, API Key 검증                │
│  ─────────────────────────────────────────────────────────────  │
│  Layer 3: 인증 (Authentication)                                  │
│           GoTrue, JWT 검증, MFA, 세션 관리                        │
│  ─────────────────────────────────────────────────────────────  │
│  Layer 4: 인가 (Authorization)                                   │
│           RLS (Row Level Security), RBAC, 역할 기반 정책          │
│  ─────────────────────────────────────────────────────────────  │
│  Layer 5: 데이터                                                 │
│           AES-256 암호화, Vault, 데이터 마스킹                    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

### Layer 1: 네트워크 보안

#### SSL/TLS 구성

모든 Supabase 통신은 TLS 1.2 이상으로 암호화된다.  
로컬 프로젝트 환경에서는 DB 연결 시 SSL 강제를 명시적으로 설정해야 한다.

```sql
-- Postgres SSL 강제 확인
SHOW ssl;
-- on이어야 함

-- DB 연결 파라미터에 SSL 강제 추가
-- connection string 예시:
-- postgresql://user:pass@host:5432/db?sslmode=require
```

```typescript
// Next.js API Route에서 Supabase 클라이언트 생성 시 SSL 확인
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

// 서버사이드 클라이언트 (SSL은 Supabase SDK가 자동 처리)
export const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)
```

#### Cloudflare 통합 (이 프로젝트: stylelucky4u.com)

이 프로젝트는 Cloudflare Tunnel 경유로 배포되므로, 아래 설정을 적용한다.

```
Cloudflare 보안 설정 체크리스트:
☐ SSL/TLS 모드: Full (Strict) — Cloudflare ↔ 오리진 간 인증서 검증
☐ HSTS 활성화: Strict-Transport-Security max-age 1년
☐ WAF (Web Application Firewall) OWASP 룰셋 활성화
☐ DDoS 보호: L3/L4/L7 자동 완화 활성화
☐ Bot Fight Mode 활성화
☐ Rate Limiting 규칙:
   - /auth/v1/* → 인증 엔드포인트 분당 60회 제한
   - /rest/v1/* → API 엔드포인트 분당 300회 제한
☐ IP Access Rules: 관리자 엔드포인트에 IP 화이트리스트 적용
☐ Cloudflare Tunnel을 통한 오리진 IP 숨김
```

#### IP 제한 (Supabase DB 접근)

```
Supabase Dashboard → Settings → Database → Network Restrictions

허용 IP 범위 설정:
- 개발팀 사무실 IP
- GitHub Actions IP 범위 (변동적 — CI 전용 사용자 권장)
- 서버 IP (PM2로 실행 중인 서버)

# DB 직접 연결 IP 제한 (Supabase CLI)
supabase network-restrictions update \
  --db-allow-cidr 192.0.2.0/24 \
  --db-allow-cidr 10.0.0.0/8
```

---

### Layer 2: API Gateway (Kong)

Supabase는 **Kong**을 API Gateway로 사용한다.  
모든 클라이언트 요청은 Kong을 거쳐 백엔드 서비스로 라우팅된다.

```
클라이언트 요청
    │
    ▼
[Kong API Gateway :54321]
    │
    ├─ /rest/v1/*      → PostgREST (DB 쿼리)
    ├─ /auth/v1/*      → GoTrue (인증)
    ├─ /storage/v1/*   → Storage API
    ├─ /realtime/v1/*  → Realtime (WebSocket)
    └─ /functions/v1/* → Edge Functions (Deno)
```

#### Kong 레벨 Rate Limiting 설정

```yaml
# supabase/config.toml (로컬) — 프로덕션은 Dashboard에서 설정
[auth]
# 인증 Rate Limits (분당 요청 수)
rate_limit_email_sent = 2         # 이메일 발송
rate_limit_sms_sent = 30          # SMS 발송
rate_limit_verify = 360           # 토큰 검증
rate_limit_token_refresh = 150    # 토큰 갱신
rate_limit_sign_in_sign_ups = 30  # 로그인/회원가입
rate_limit_anonymous_users = 30   # 익명 사용자
rate_limit_otp = 30               # OTP
```

```sql
-- 커스텀 Rate Limiting (Edge Function 또는 미들웨어에서)
-- 사용자별 API 요청 카운터 테이블
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id           BIGSERIAL PRIMARY KEY,
  identifier   TEXT NOT NULL,          -- IP 또는 user_id
  endpoint     TEXT NOT NULL,          -- 엔드포인트 경로
  request_count INT DEFAULT 1,
  window_start TIMESTAMPTZ DEFAULT now(),
  UNIQUE (identifier, endpoint)
);

-- 요청 수 증가 함수
CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  p_identifier TEXT,
  p_endpoint   TEXT,
  p_limit      INT,
  p_window     INTERVAL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
BEGIN
  -- 만료된 윈도우 정리
  DELETE FROM public.rate_limits
  WHERE identifier = p_identifier
    AND endpoint   = p_endpoint
    AND window_start < now() - p_window;

  -- 현재 카운트 조회 또는 삽입
  INSERT INTO public.rate_limits (identifier, endpoint)
  VALUES (p_identifier, p_endpoint)
  ON CONFLICT (identifier, endpoint)
  DO UPDATE SET request_count = rate_limits.request_count + 1
  RETURNING request_count INTO v_count;

  -- 제한 초과 여부 반환
  RETURN v_count <= p_limit;
END;
$$;
```

#### CORS 설정

```toml
# supabase/config.toml
[api]
# 허용할 Origin 목록 (프로덕션은 정확한 도메인만)
# 로컬 개발
extra_search_path = ["public", "extensions"]

# Next.js 미들웨어에서 CORS 추가 처리
# src/middleware.ts
```

```typescript
// src/middleware.ts — CORS 및 인증 미들웨어
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  // Supabase 세션 갱신
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()

  // 보호된 경로 접근 제어
  const protectedPaths = ['/dashboard', '/admin', '/api/private']
  const isProtected = protectedPaths.some(
    (path) => request.nextUrl.pathname.startsWith(path)
  )

  if (isProtected && !session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // 관리자 전용 경로
  if (request.nextUrl.pathname.startsWith('/admin')) {
    const { data: { user } } = await supabase.auth.getUser()
    const isAdmin = user?.user_metadata?.role === 'admin'
    if (!isAdmin) {
      return NextResponse.redirect(new URL('/403', request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

---

### Layer 3: 인증 (Authentication)

#### JWT 구조와 검증

Supabase Auth는 **RS256** (비대칭) 또는 **HS256** (대칭) JWT를 발급한다.  
2025년부터 RS256 기반 비대칭 서명이 기본값으로 도입되었다.

```typescript
// JWT 페이로드 구조
interface SupabaseJWT {
  aud: string          // 'authenticated' | 'anon'
  exp: number          // 만료 시각 (Unix timestamp)
  iat: number          // 발급 시각
  iss: string          // 'https://<project>.supabase.co/auth/v1'
  sub: string          // 사용자 UUID (user_id)
  email: string        // 사용자 이메일
  role: string         // 'authenticated' | 'anon' | 'service_role'
  session_id: string   // 세션 ID
  app_metadata: {
    provider: string   // 'email' | 'google' | 'github' 등
    providers: string[]
  }
  user_metadata: {
    // 사용자 정의 메타데이터
    // ⚠️ 주의: 사용자가 수정 가능 → RLS 정책에 직접 사용 금지
    full_name?: string
    avatar_url?: string
  }
}

// 안전한 RLS용 역할 확인 (user_metadata 대신 별도 테이블 사용)
-- ✓ 안전: DB 테이블 기반 역할 확인
CREATE POLICY "관리자 전용"
  ON public.sensitive_table FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );

-- ✗ 위험: user_metadata 기반 (사용자가 조작 가능)
CREATE POLICY "관리자 전용 (위험)"
  ON public.sensitive_table FOR ALL
  USING (
    (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
  );
```

#### MFA (다단계 인증) 설정

```typescript
// MFA 등록 (TOTP 앱 — Google Authenticator 등)
const { data, error } = await supabase.auth.mfa.enroll({
  factorType: 'totp',
  friendlyName: 'My Authenticator App',
})

if (data) {
  // data.totp.qr_code를 QR 코드로 표시
  // data.totp.secret은 수동 입력용
  console.log('QR URI:', data.totp.uri)
}

// MFA 인증 (로그인 후)
const { data: challengeData } = await supabase.auth.mfa.challenge({
  factorId: data.id,
})

const { error: verifyError } = await supabase.auth.mfa.verify({
  factorId: data.id,
  challengeId: challengeData.id,
  code: userInputCode,  // 6자리 TOTP 코드
})

// 현재 세션의 MFA 인증 수준 확인
const { data: { session } } = await supabase.auth.getSession()
const aal = session?.user?.factors?.length > 0 ? 'aal2' : 'aal1'

// RLS에서 MFA 요구
CREATE POLICY "MFA 필수 — 금융 데이터"
  ON public.financial_records FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (auth.jwt() ->> 'aal') = 'aal2'  -- MFA 완료 필수
  );
```

#### 세션 관리

```typescript
// 세션 설정 (supabase/config.toml)
[auth]
jwt_expiry = 3600           # 액세스 토큰 만료: 1시간
refresh_token_reuse_interval = 10  # 리프레시 토큰 재사용 허용 간격 (초)

// 클라이언트 세션 설정
const supabase = createClient(url, anonKey, {
  auth: {
    autoRefreshToken: true,   // 자동 토큰 갱신
    persistSession: true,     // 세션 로컬 저장 (브라우저)
    detectSessionInUrl: true, // URL에서 세션 감지 (OAuth 콜백)
    storage: {
      // 커스텀 스토리지 (HttpOnly 쿠키 권장 — XSS 방지)
      getItem: (key) => Cookies.get(key) ?? null,
      setItem: (key, value) => Cookies.set(key, value, {
        secure: true,
        sameSite: 'lax',
        httpOnly: false,  // JS 접근 필요 시 false, 불필요 시 true
      }),
      removeItem: (key) => Cookies.remove(key),
    },
  },
})

// 세션 강제 종료 (보안 이슈 발생 시)
await supabase.auth.signOut({ scope: 'global' })  // 모든 디바이스 로그아웃
await supabase.auth.signOut({ scope: 'others' })  // 다른 디바이스만 로그아웃
```

---

### Layer 4: 인가 (Authorization)

#### RBAC (역할 기반 접근 제어) 설계

```sql
-- 역할 테이블
CREATE TABLE public.user_roles (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, role)
);

-- 역할 확인 헬퍼 함수 (성능 최적화 — 인덱스 활용)
CREATE OR REPLACE FUNCTION public.has_role(required_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = required_role
  );
$$;

-- 역할 확인 인덱스
CREATE INDEX idx_user_roles_user_id ON public.user_roles (user_id);
CREATE INDEX idx_user_roles_user_role ON public.user_roles (user_id, role);

-- 역할 기반 RLS 정책 예시
CREATE POLICY "admin 전체 접근"
  ON public.products FOR ALL
  USING (public.has_role('admin'));

CREATE POLICY "editor 읽기/쓰기"
  ON public.products FOR SELECT
  USING (public.has_role('editor') OR public.has_role('admin'));

CREATE POLICY "editor 업데이트"
  ON public.products FOR UPDATE
  USING (public.has_role('editor'))
  WITH CHECK (public.has_role('editor'));

CREATE POLICY "viewer 읽기 전용"
  ON public.products FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (public.has_role('viewer') OR public.has_role('editor') OR public.has_role('admin'))
  );
```

#### 소유권 기반 RLS

```sql
-- 소유자만 CRUD 가능한 기본 패턴
CREATE TABLE public.posts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  content    TEXT,
  is_public  BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- 소유자: 전체 권한
CREATE POLICY "소유자 전체 권한"
  ON public.posts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 공개 글: 모든 인증 사용자 읽기
CREATE POLICY "공개 글 읽기"
  ON public.posts FOR SELECT
  USING (is_public = TRUE AND auth.role() = 'authenticated');

-- 성능을 위한 인덱스
CREATE INDEX idx_posts_user_id ON public.posts (user_id);
```

#### 멀티 테넌트 RLS

```sql
-- 팀 기반 멀티 테넌트 구조
CREATE TABLE public.teams (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL
);

CREATE TABLE public.team_members (
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role    TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE public.projects (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name    TEXT NOT NULL
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- ✓ 성능 최적화: team_id IN (subquery) 패턴
CREATE POLICY "팀 멤버 프로젝트 접근"
  ON public.projects FOR SELECT
  USING (
    team_id IN (
      SELECT team_id FROM public.team_members
      WHERE user_id = auth.uid()
    )
  );

-- 인덱스 (필수)
CREATE INDEX idx_team_members_user_id ON public.team_members (user_id);
CREATE INDEX idx_projects_team_id     ON public.projects (team_id);
```

---

### Layer 5: 데이터 보안

#### 암호화

```sql
-- Supabase Vault로 민감 데이터 암호화 저장
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- 민감 컬럼 암호화 (pgsodium 활용)
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- 암호화된 개인정보 테이블
CREATE TABLE public.user_profiles (
  id             UUID PRIMARY KEY REFERENCES auth.users(id),
  -- 평문 (검색 가능)
  username       TEXT UNIQUE NOT NULL,
  -- 암호화된 민감 정보 (pgsodium)
  phone_number   BYTEA,    -- 암호화 저장
  ssn_last4      BYTEA,    -- 암호화 저장
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- 전화번호 암호화 삽입 함수
CREATE OR REPLACE FUNCTION public.upsert_user_profile_secure(
  p_user_id  UUID,
  p_username TEXT,
  p_phone    TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, username, phone_number)
  VALUES (
    p_user_id,
    p_username,
    pgsodium.crypto_secretbox(
      p_phone::bytea,
      pgsodium.crypto_secretbox_noncegen(),
      pgsodium.randombytes(32)  -- 실제론 키 관리 필요
    )
  )
  ON CONFLICT (id) DO UPDATE
  SET username = EXCLUDED.username,
      phone_number = EXCLUDED.phone_number;
END;
$$;
```

#### 데이터 마스킹 (뷰 활용)

```sql
-- 민감 정보 마스킹 뷰
CREATE VIEW public.users_masked AS
SELECT
  id,
  email,
  -- 이메일 일부 마스킹: us***@example.com
  REGEXP_REPLACE(email, '(^[^@]{2}).*(@.*)$', '\1***\2') AS email_masked,
  -- 생성일만 노출 (정확한 시각 숨김)
  DATE(created_at) AS created_date,
  raw_app_meta_data->>'provider' AS auth_provider
FROM auth.users;

-- 일반 사용자에게는 마스킹 뷰만 노출
GRANT SELECT ON public.users_masked TO authenticated;
REVOKE SELECT ON auth.users FROM authenticated;
```

---

## 2. 키 관리 전략

### 2.1 키 유형과 사용 원칙

```
┌────────────────────────────────────────────────────────────────────┐
│                      Supabase API 키 비교                          │
│                                                                    │
│  키 유형          형식                 용도              노출 가능? │
│  ──────────────────────────────────────────────────────────────── │
│  anon key         eyJ... (JWT)         클라이언트 SDK     ✓ 공개   │
│  (publishable)    sb_publishable_...   RLS 정책으로 제어           │
│                                                                    │
│  service_role key eyJ... (JWT)         서버 전용           ✗ 비공개│
│  (secret)         sb_secret_...        RLS 우회 — 절대 클라이언트  │
│                                        코드에 포함 금지            │
│                                                                    │
│  JWT Secret       (문자열)             JWT 서명 키         ✗ 비공개│
└────────────────────────────────────────────────────────────────────┘
```

### 2.2 올바른 사용 패턴

```typescript
// ─────────────────────────────────────────────────────────────────
// ✓ 올바른 사용: 클라이언트 컴포넌트 (anon key)
// ─────────────────────────────────────────────────────────────────
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!  // anon key만 사용
  )
}

// ─────────────────────────────────────────────────────────────────
// ✓ 올바른 사용: 서버 컴포넌트 / API Route (anon key + 세션)
// ─────────────────────────────────────────────────────────────────
// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,  // anon key + RLS
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)) },
      },
    }
  )
}

// ─────────────────────────────────────────────────────────────────
// ✓ 올바른 사용: 관리자 API Route만 (service_role key)
// ─────────────────────────────────────────────────────────────────
// src/app/api/admin/users/route.ts
import { createClient } from '@supabase/supabase-js'

// 이 함수는 서버에서만 실행됨 (API Route)
export async function GET() {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,  // service_role — 서버 전용
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // service_role은 RLS를 우회 → 권한 확인 로직 직접 구현 필수
  const { data: { user } } = await supabaseAdmin.auth.getUser()
  // 관리자 확인 후 처리...
}

// ─────────────────────────────────────────────────────────────────
// ✗ 잘못된 사용 예시 (절대 금지)
// ─────────────────────────────────────────────────────────────────
// 'use client'
// const supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!)
// → SUPABASE_SERVICE_ROLE_KEY는 NEXT_PUBLIC_ 아니어도
//   클라이언트 컴포넌트에서 process.env로 접근 시 번들에 포함될 수 있음
```

### 2.3 환경변수 보안 분류

```bash
# .env.example (저장소에 포함 — 실제 값 없음)

# ─── 공개 가능 (클라이언트 노출 OK) ──────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# ─── 서버 전용 (절대 클라이언트 노출 금지) ───────────────────────
# Supabase 관리자 키 — API Route/서버사이드에서만 사용
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Supabase DB 직접 연결 (마이그레이션/백업용)
SUPABASE_DB_URL=postgresql://postgres:password@host:5432/postgres

# Supabase 개인 접근 토큰 (CI/CD 파이프라인용)
SUPABASE_ACCESS_TOKEN=your-access-token-here

# 외부 서비스 키
STRIPE_SECRET_KEY=sk_live_...
OPENAI_API_KEY=sk-...
```

### 2.4 키 로테이션 절차

```
시나리오 A: 정기 로테이션 (3~6개월 권장)
──────────────────────────────────────────
1. [사전 준비]
   - 모든 환경(로컬/staging/production)의 현재 키 목록 확인
   - 배포 계획 수립 (다운타임 최소화)

2. [신규 API 키 시스템 사용 (sb_publishable_*)]
   Supabase Dashboard → Settings → API → Keys
   - "Create new key" 클릭
   - 새 publishable key 발급
   - 새 secret key 발급

3. [이중 키 운영 기간 (1~2일)]
   - 기존 키 + 신규 키 동시 유효
   - 신규 키로 모든 환경 업데이트
   - GitHub Secrets 업데이트
   - 재배포 후 정상 동작 확인

4. [기존 키 폐기]
   - 모든 환경에서 신규 키 사용 확인 후
   - 기존 키 삭제

시나리오 B: 긴급 로테이션 (키 유출 의심 시)
──────────────────────────────────────────
1. 즉시 기존 키 폐기 (Supabase Dashboard에서 삭제)
2. 신규 키 발급
3. 모든 환경 긴급 재배포
4. 감사 로그에서 유출 후 의심 접근 패턴 조사
5. 인시던트 보고서 작성

시나리오 C: JWT 시크릿 로테이션 (레거시 방식)
──────────────────────────────────────────
⚠️ 주의: JWT 시크릿 로테이션은 기존 anon/service_role 키를 즉시 무효화

Supabase Dashboard → Settings → API → JWT Settings → Regenerate
→ 새 anon key, service_role key 즉시 복사
→ 전체 환경 즉시 재배포 필요
```

---

## 3. RLS 보안 체크리스트

### 3.1 전체 테이블 RLS 활성화 확인

```sql
-- ════════════════════════════════════════════════════════════════
-- RLS 감사 쿼리 1: RLS 비활성화된 테이블 목록
-- ════════════════════════════════════════════════════════════════
SELECT
  schemaname,
  tablename,
  rowsecurity,
  CASE
    WHEN rowsecurity THEN '✓ RLS 활성화'
    ELSE '✗ RLS 비활성화 — 즉시 조치 필요'
  END AS status
FROM pg_tables
WHERE schemaname IN ('public', 'auth', 'storage')
ORDER BY rowsecurity ASC, schemaname, tablename;

-- ════════════════════════════════════════════════════════════════
-- RLS 감사 쿼리 2: 정책이 없는 테이블 (RLS 활성화됐지만 정책 없음)
-- → RLS ON + 정책 없음 = 아무도 접근 불가 (의도인지 확인 필요)
-- ════════════════════════════════════════════════════════════════
SELECT
  t.schemaname,
  t.tablename,
  COUNT(p.policyname) AS policy_count,
  CASE
    WHEN COUNT(p.policyname) = 0 THEN '⚠ 정책 없음 — 접근 완전 차단'
    ELSE '✓ ' || COUNT(p.policyname) || '개 정책'
  END AS status
FROM pg_tables t
LEFT JOIN pg_policies p
  ON t.schemaname = p.schemaname
  AND t.tablename = p.tablename
WHERE t.schemaname = 'public'
  AND t.rowsecurity = TRUE
GROUP BY t.schemaname, t.tablename
ORDER BY policy_count ASC;

-- ════════════════════════════════════════════════════════════════
-- RLS 감사 쿼리 3: 과도하게 허용적인 정책 탐지
-- (USING(true) 패턴 — 모든 사용자 접근 허용)
-- ════════════════════════════════════════════════════════════════
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual AS using_expression,
  with_check,
  '⚠ 과도한 허용 정책 — 검토 필요' AS warning
FROM pg_policies
WHERE
  schemaname = 'public'
  AND (
    qual = 'true'
    OR qual IS NULL
    OR with_check = 'true'
  );

-- ════════════════════════════════════════════════════════════════
-- RLS 감사 쿼리 4: auth.uid() 없는 SELECT 정책 (인증 없이 접근)
-- ════════════════════════════════════════════════════════════════
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE
  schemaname = 'public'
  AND cmd = 'SELECT'
  AND qual NOT LIKE '%auth.uid()%'
  AND qual NOT LIKE '%auth.role()%'
  AND qual != 'true'
ORDER BY tablename;
```

### 3.2 RLS 정책 패턴 표준

```sql
-- ════════════════════════════════════════════════════════════════
-- 표준 패턴 1: 사용자 소유 데이터
-- ════════════════════════════════════════════════════════════════
-- 모든 CRUD에 user_id 체크 + WITH CHECK 포함
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- SELECT: 본인 것만
CREATE POLICY "documents_select_own"
  ON public.documents FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- INSERT: 본인 ID로만 삽입
CREATE POLICY "documents_insert_own"
  ON public.documents FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: 본인 것만, 삽입 후도 본인 것
CREATE POLICY "documents_update_own"
  ON public.documents FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: 본인 것만
CREATE POLICY "documents_delete_own"
  ON public.documents FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════
-- 표준 패턴 2: 공개 읽기 + 인증 쓰기
-- ════════════════════════════════════════════════════════════════
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

-- 공개 글은 anon도 읽기 가능
CREATE POLICY "articles_select_public"
  ON public.articles FOR SELECT
  USING (published = TRUE);

-- 본인 글은 로그인 시 읽기 가능 (미공개 포함)
CREATE POLICY "articles_select_own_all"
  ON public.articles FOR SELECT
  TO authenticated
  USING (auth.uid() = author_id);

-- ════════════════════════════════════════════════════════════════
-- 표준 패턴 3: anon role 명시적 차단
-- (authenticated만 허용할 때 role 조건 추가 권장)
-- ════════════════════════════════════════════════════════════════
CREATE POLICY "sensitive_data_authenticated_only"
  ON public.payment_info FOR SELECT
  TO authenticated           -- anon role 자동 제외
  USING (auth.uid() = user_id);

-- ⚠️ 아래는 anon도 접근할 수 있음 (auth.uid()는 anon일 때 NULL)
-- CREATE POLICY "incorrect_pattern"
--   ON public.payment_info FOR SELECT
--   USING (auth.uid() = user_id);
--   → auth.uid() = NULL은 FALSE이므로 실질적 차단이지만,
--     role을 명시하는 것이 더 명확하고 안전함
```

### 3.3 RLS 테스트 자동화

```sql
-- ════════════════════════════════════════════════════════════════
-- RLS 테스트 함수 (개발/스테이징 환경)
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.test_rls_policy(
  p_user_id UUID,
  p_query   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  -- 특정 사용자로 RLS 컨텍스트 설정
  PERFORM set_config('request.jwt.claims',
    json_build_object(
      'sub', p_user_id,
      'role', 'authenticated',
      'aud', 'authenticated'
    )::text,
    true
  );

  -- 쿼리 실행
  EXECUTE 'SELECT to_jsonb(t) FROM (' || p_query || ') t' INTO result;
  RETURN result;
END;
$$;
```

```typescript
// RLS 정책 통합 테스트 (Jest + Supabase 로컬)
// src/__tests__/rls/documents.test.ts

describe('RLS 정책 — documents 테이블', () => {
  let userAClient: ReturnType<typeof createClient>
  let userBClient: ReturnType<typeof createClient>
  let userAId: string
  let userBId: string

  beforeAll(async () => {
    // 테스트 사용자 생성 (로컬 Supabase)
    const adminClient = createClient(
      'http://localhost:54321',
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: userA } = await adminClient.auth.admin.createUser({
      email: 'user-a@test.com',
      password: 'test-password',
      email_confirm: true,
    })
    userAId = userA.user!.id

    const { data: userB } = await adminClient.auth.admin.createUser({
      email: 'user-b@test.com',
      password: 'test-password',
      email_confirm: true,
    })
    userBId = userB.user!.id

    // 각 사용자 클라이언트
    userAClient = createClient('http://localhost:54321', process.env.SUPABASE_ANON_KEY!)
    await userAClient.auth.signInWithPassword({
      email: 'user-a@test.com',
      password: 'test-password',
    })

    userBClient = createClient('http://localhost:54321', process.env.SUPABASE_ANON_KEY!)
    await userBClient.auth.signInWithPassword({
      email: 'user-b@test.com',
      password: 'test-password',
    })
  })

  it('사용자는 본인 문서만 조회 가능', async () => {
    // UserA가 문서 생성
    await userAClient.from('documents').insert({
      title: 'UserA 문서',
      user_id: userAId,
    })

    // UserA: 본인 문서 조회 성공
    const { data: ownDocs } = await userAClient.from('documents').select()
    expect(ownDocs).toHaveLength(1)
    expect(ownDocs![0].title).toBe('UserA 문서')

    // UserB: UserA 문서 조회 불가
    const { data: otherDocs } = await userBClient.from('documents').select()
    expect(otherDocs).toHaveLength(0)
  })

  it('사용자는 타인의 문서를 삭제 불가', async () => {
    const { data: docs } = await userAClient.from('documents').select('id')
    const { error } = await userBClient
      .from('documents')
      .delete()
      .eq('id', docs![0].id)

    // RLS로 인해 에러 없이 0건 삭제 (Supabase RLS 특성)
    expect(error).toBeNull()
    // 실제 삭제 안 됨 확인
    const { data: remaining } = await userAClient.from('documents').select()
    expect(remaining).toHaveLength(1)
  })
})
```

---

## 4. 보안 모니터링

### 4.1 감사 로그 설계

```sql
-- 포괄적 감사 로그 테이블
CREATE TABLE public.security_audit_logs (
  id            BIGSERIAL PRIMARY KEY,
  event_type    TEXT NOT NULL,   -- 'auth.login', 'auth.logout', 'data.read', 'data.write'
  severity      TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address    INET,
  user_agent    TEXT,
  endpoint      TEXT,            -- 접근한 API 엔드포인트
  resource_type TEXT,            -- 접근한 테이블/리소스
  resource_id   TEXT,            -- 접근한 레코드 ID
  action        TEXT,            -- 'select', 'insert', 'update', 'delete'
  success       BOOLEAN NOT NULL,
  error_message TEXT,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 파티셔닝 (월별 — 대용량 처리)
CREATE TABLE public.security_audit_logs_2026_04
  PARTITION OF public.security_audit_logs
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

-- 인덱스
CREATE INDEX idx_audit_user_id    ON public.security_audit_logs (user_id);
CREATE INDEX idx_audit_ip_address ON public.security_audit_logs (ip_address);
CREATE INDEX idx_audit_created_at ON public.security_audit_logs (created_at DESC);
CREATE INDEX idx_audit_severity   ON public.security_audit_logs (severity, created_at DESC);

-- RLS: 관리자만 조회
ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "관리자만 감사 로그 접근"
  ON public.security_audit_logs FOR SELECT
  TO authenticated
  USING (public.has_role('admin'));

-- 감사 로그 삽입 함수 (service_role로 호출)
CREATE OR REPLACE FUNCTION public.log_security_event(
  p_event_type    TEXT,
  p_severity      TEXT,
  p_user_id       UUID,
  p_ip_address    TEXT,
  p_endpoint      TEXT,
  p_action        TEXT,
  p_success       BOOLEAN,
  p_error_message TEXT DEFAULT NULL,
  p_metadata      JSONB DEFAULT '{}'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.security_audit_logs (
    event_type, severity, user_id, ip_address,
    endpoint, action, success, error_message, metadata
  ) VALUES (
    p_event_type, p_severity, p_user_id, p_ip_address::INET,
    p_endpoint, p_action, p_success, p_error_message, p_metadata
  );
END;
$$;
```

#### pgAudit 활성화

```sql
-- pgAudit 확장 활성화 (Supabase에서 지원)
CREATE EXTENSION IF NOT EXISTS pgaudit;

-- 설정 (특정 역할의 DDL/DML 감사)
ALTER SYSTEM SET pgaudit.log = 'ddl, write, role';
ALTER SYSTEM SET pgaudit.log_relation = 'on';
ALTER SYSTEM SET pgaudit.log_parameter = 'on';

-- 또는 특정 역할만 감사
ALTER ROLE authenticated SET pgaudit.log = 'write';
```

### 4.2 비정상 접근 탐지 쿼리

```sql
-- ════════════════════════════════════════════════════════════════
-- 탐지 1: 짧은 시간 내 다수 실패 로그인 (무차별 대입 탐지)
-- ════════════════════════════════════════════════════════════════
SELECT
  ip_address,
  COUNT(*) AS fail_count,
  MIN(created_at) AS first_attempt,
  MAX(created_at) AS last_attempt
FROM public.security_audit_logs
WHERE
  event_type = 'auth.login'
  AND success = FALSE
  AND created_at > now() - interval '15 minutes'
GROUP BY ip_address
HAVING COUNT(*) >= 5
ORDER BY fail_count DESC;

-- ════════════════════════════════════════════════════════════════
-- 탐지 2: 비정상 시간대 접근 (새벽 2~5시)
-- ════════════════════════════════════════════════════════════════
SELECT
  user_id,
  COUNT(*) AS access_count,
  array_agg(DISTINCT ip_address::text) AS ips,
  array_agg(DISTINCT endpoint) AS endpoints
FROM public.security_audit_logs
WHERE
  EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Seoul') BETWEEN 2 AND 5
  AND created_at > now() - interval '24 hours'
  AND user_id IS NOT NULL
GROUP BY user_id
HAVING COUNT(*) > 10
ORDER BY access_count DESC;

-- ════════════════════════════════════════════════════════════════
-- 탐지 3: 평소와 다른 지역에서 접근 (신규 IP 대역)
-- ════════════════════════════════════════════════════════════════
WITH user_known_ips AS (
  -- 지난 30일 내 사용자별 알려진 IP 대역
  SELECT
    user_id,
    array_agg(DISTINCT split_part(ip_address::text, '.', 1) ||
              '.' || split_part(ip_address::text, '.', 2)) AS known_prefixes
  FROM public.security_audit_logs
  WHERE
    success = TRUE
    AND created_at BETWEEN now() - interval '30 days'
                       AND now() - interval '1 hour'
  GROUP BY user_id
)
SELECT
  l.user_id,
  l.ip_address,
  l.created_at
FROM public.security_audit_logs l
JOIN user_known_ips u ON l.user_id = u.user_id
WHERE
  l.created_at > now() - interval '1 hour'
  AND l.success = TRUE
  AND NOT (
    split_part(l.ip_address::text, '.', 1) || '.' ||
    split_part(l.ip_address::text, '.', 2)
  ) = ANY(u.known_prefixes);

-- ════════════════════════════════════════════════════════════════
-- 탐지 4: 대량 데이터 조회 (데이터 유출 탐지)
-- ════════════════════════════════════════════════════════════════
SELECT
  user_id,
  resource_type,
  COUNT(*) AS query_count,
  SUM((metadata->>'rows_returned')::int) AS total_rows_returned
FROM public.security_audit_logs
WHERE
  action = 'select'
  AND created_at > now() - interval '1 hour'
  AND user_id IS NOT NULL
GROUP BY user_id, resource_type
HAVING SUM((metadata->>'rows_returned')::int) > 10000
ORDER BY total_rows_returned DESC;
```

### 4.3 Supabase Auth Audit Logs 활용

```typescript
// Auth 감사 로그 조회 (service_role 사용)
// src/app/api/admin/audit-logs/route.ts

export async function GET(request: Request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 최근 인증 이벤트 조회
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 50,
  })

  // Auth 감사 로그는 Supabase Dashboard → Auth → Logs에서도 확인 가능
  return Response.json({ users: data.users })
}
```

### 4.4 알림 설정 (Edge Function 기반)

```typescript
// supabase/functions/security-alert/index.ts
// 보안 이벤트 발생 시 Slack/이메일 알림

const SLACK_WEBHOOK = Deno.env.get('SLACK_SECURITY_WEBHOOK')!

interface SecurityEvent {
  type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  ip_address?: string
  user_id?: string
}

async function sendSlackAlert(event: SecurityEvent) {
  const color = {
    low: '#36a64f',
    medium: '#ff9900',
    high: '#ff6600',
    critical: '#cc0000',
  }[event.severity]

  await fetch(SLACK_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attachments: [{
        color,
        title: `보안 알림: ${event.type}`,
        text: event.description,
        fields: [
          { title: '심각도', value: event.severity.toUpperCase(), short: true },
          { title: 'IP', value: event.ip_address || 'N/A', short: true },
          { title: '시각', value: new Date().toISOString(), short: true },
        ],
      }],
    }),
  })
}

Deno.serve(async (req) => {
  const event: SecurityEvent = await req.json()

  // high/critical만 즉시 알림
  if (['high', 'critical'].includes(event.severity)) {
    await sendSlackAlert(event)
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

---

## 5. 인시던트 대응 계획

### 5.1 심각도 분류

| 레벨 | 조건 | 대응 시간 | 예시 |
|------|------|-----------|------|
| SEV-1 (Critical) | 서비스 전체 중단 또는 데이터 유출 확인 | 15분 이내 | 서비스 롤 키 유출, 전체 DB 접근 차단 |
| SEV-2 (High) | 부분 기능 중단 또는 보안 위협 탐지 | 1시간 이내 | 무차별 대입 공격, 비정상 데이터 접근 |
| SEV-3 (Medium) | 잠재적 보안 취약점 발견 | 24시간 이내 | 미사용 RLS 정책, 취약 의존성 |
| SEV-4 (Low) | 모니터링 알림, 경미한 이상 | 1주일 이내 | 비정상 시간대 소수 접근 |

### 5.2 시나리오별 대응

#### 시나리오 A: API 키 유출

```bash
# ─── 즉시 대응 (5분 이내) ─────────────────────────────────────

# Step 1: 유출된 키 즉시 폐기
# Supabase Dashboard → Settings → API → 해당 키 삭제/재생성

# Step 2: 신규 키 발급 및 배포
supabase link --project-ref <PROJECT_REF>
# 새 anon key, service_role key 복사 후 GitHub Secrets 업데이트

# Step 3: 모든 환경 즉시 재배포
# GitHub Actions 수동 트리거 또는 직접 실행

# ─── 30분 이내 조사 ────────────────────────────────────────────
# 키 유출 후 의심 접근 로그 조사
```

```sql
-- 유출 시점 이후 비정상 접근 패턴 조사
SELECT
  ip_address,
  user_id,
  endpoint,
  action,
  created_at,
  metadata
FROM public.security_audit_logs
WHERE
  -- 유출 의심 시각 이후
  created_at > '2026-04-06 10:00:00'::timestamptz
  -- 알려진 IP가 아닌 경우
  AND ip_address NOT IN (
    SELECT DISTINCT ip_address
    FROM public.security_audit_logs
    WHERE created_at < '2026-04-06 10:00:00'::timestamptz
  )
ORDER BY created_at DESC
LIMIT 100;

-- 대량 데이터 조회 탐지
SELECT
  COUNT(*) AS total_requests,
  SUM((metadata->>'rows_returned')::int) AS total_rows
FROM public.security_audit_logs
WHERE created_at > '2026-04-06 10:00:00'::timestamptz;
```

#### 시나리오 B: 데이터 유출 의심

```sql
-- Step 1: 영향받은 테이블 특정
SELECT
  resource_type,
  COUNT(*) AS access_count,
  COUNT(DISTINCT user_id) AS unique_users,
  COUNT(DISTINCT ip_address) AS unique_ips
FROM public.security_audit_logs
WHERE
  created_at > now() - interval '24 hours'
  AND action = 'select'
GROUP BY resource_type
ORDER BY access_count DESC;

-- Step 2: 영향받은 사용자 특정 (PII 포함 테이블)
SELECT DISTINCT
  l.user_id,
  u.email,
  l.ip_address,
  l.created_at
FROM public.security_audit_logs l
JOIN auth.users u ON l.user_id = u.id
WHERE
  l.resource_type IN ('user_profiles', 'payment_info', 'personal_data')
  AND l.created_at > now() - interval '24 hours'
ORDER BY l.created_at DESC;
```

```typescript
// Step 3: 영향받은 사용자 세션 즉시 종료
// src/scripts/emergency-revoke-sessions.ts

async function revokeAllUserSessions(affectedUserIds: string[]) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  for (const userId of affectedUserIds) {
    await supabaseAdmin.auth.admin.signOut(userId, 'global')
    console.log(`세션 종료: ${userId}`)
  }

  console.log(`총 ${affectedUserIds.length}명의 세션 종료 완료`)
}
```

#### 시나리오 C: DDoS 공격

```
즉시 대응:
1. Cloudflare Dashboard → Firewall → Under Attack Mode 활성화
   (JS Challenge를 모든 방문자에게 적용)

2. 공격 IP 대역 차단
   Cloudflare → Firewall Rules:
   (ip.src in {x.x.x.0/24}) → Block

3. Supabase Rate Limiting 강화
   Dashboard → Auth → Rate Limits → 임시 하향 조정

4. Kong 레벨 추가 제한 (자체 호스팅 시)
   nginx/kong 설정에서 연결 수 제한

복구 후:
5. 공격 패턴 분석 → Cloudflare WAF 규칙 영구 추가
6. 알림 임계값 하향 조정
7. 인시던트 보고서 작성
```

### 5.3 인시던트 사후 처리

```markdown
# 인시던트 보고서 템플릿
# docs/handover/incidents/YYYY-MM-DD-incident-title.md

## 인시던트 요약
- 발생일시: 
- 탐지일시: 
- 해결일시: 
- 심각도: SEV-X
- 영향 범위: 

## 타임라인
- HH:MM 탐지/발생
- HH:MM 초기 대응
- HH:MM 원인 파악
- HH:MM 완화 조치
- HH:MM 해결

## 근본 원인 (5-Why)
1. Why: ...
2. Why: ...

## 영향 범위
- 영향받은 사용자: N명
- 영향받은 데이터: ...

## 대응 조치
- 즉시 조치:
- 중기 조치:
- 장기 개선:

## 재발 방지
- 기술적 개선:
- 프로세스 개선:
```

---

## 6. 보안 설정 자동화

### 6.1 보안 마이그레이션 체크리스트

```sql
-- supabase/migrations/20260406000001_security_baseline.sql
-- 목적: 모든 테이블 RLS 기본 활성화 + 보안 베이스라인

-- 1. 공개 스키마 모든 테이블 RLS 활성화 확인 트리거
CREATE OR REPLACE FUNCTION public.enforce_rls_on_create()
RETURNS event_trigger
LANGUAGE plpgsql
AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF obj.command_tag = 'CREATE TABLE' THEN
      -- 새 테이블 생성 시 RLS 자동 활성화 (Postgres Event Trigger)
      EXECUTE 'ALTER TABLE ' || obj.object_identity || ' ENABLE ROW LEVEL SECURITY';
      RAISE NOTICE 'RLS 자동 활성화: %', obj.object_identity;
    END IF;
  END LOOP;
END;
$$;

-- 이벤트 트리거 등록 (Supabase에서 2025년부터 지원)
CREATE EVENT TRIGGER enforce_rls_trigger
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE')
  EXECUTE FUNCTION public.enforce_rls_on_create();

-- 2. 시크릿 테이블 (민감 설정값 보관)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,              -- Vault로 암호화 권장
  is_public   BOOLEAN DEFAULT FALSE,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- 공개 설정: anon 읽기 가능
CREATE POLICY "공개 설정 읽기"
  ON public.app_settings FOR SELECT
  USING (is_public = TRUE);

-- 비공개 설정: 관리자만
CREATE POLICY "관리자 설정 관리"
  ON public.app_settings FOR ALL
  TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));
```

### 6.2 보안 상태 대시보드 쿼리

```sql
-- 보안 현황 종합 뷰
CREATE OR REPLACE VIEW public.security_dashboard AS
SELECT
  -- RLS 미활성화 테이블 수
  (SELECT COUNT(*) FROM pg_tables
   WHERE schemaname = 'public' AND rowsecurity = FALSE) AS tables_without_rls,

  -- 정책 없는 테이블 수 (RLS는 활성화됐지만)
  (SELECT COUNT(DISTINCT t.tablename) FROM pg_tables t
   LEFT JOIN pg_policies p ON t.tablename = p.tablename AND t.schemaname = p.schemaname
   WHERE t.schemaname = 'public' AND t.rowsecurity = TRUE AND p.policyname IS NULL
  ) AS rls_tables_without_policies,

  -- 최근 24시간 로그인 실패 건수
  (SELECT COUNT(*) FROM public.security_audit_logs
   WHERE event_type = 'auth.login' AND success = FALSE
   AND created_at > now() - interval '24 hours') AS failed_logins_24h,

  -- 최근 1시간 고심각도 이벤트
  (SELECT COUNT(*) FROM public.security_audit_logs
   WHERE severity IN ('high', 'critical')
   AND created_at > now() - interval '1 hour') AS high_severity_events_1h,

  -- 현재 활성 사용자 세션 수 (근사치)
  (SELECT COUNT(DISTINCT user_id) FROM public.security_audit_logs
   WHERE created_at > now() - interval '15 minutes'
   AND user_id IS NOT NULL) AS active_sessions_approx,

  now() AS checked_at;

-- 관리자만 접근
ALTER VIEW public.security_dashboard OWNER TO postgres;
GRANT SELECT ON public.security_dashboard TO authenticated;
-- (실제론 has_role('admin') 체크하는 RLS 추가 필요)
```

### 6.3 Supabase Security Advisor 연동

```bash
# Supabase Security Advisor (Dashboard → Database → Advisors → Security)
# 자동으로 아래 항목을 검사:
# - RLS 비활성화 테이블
# - 과도한 허용 정책 (USING(true))
# - 취약한 함수 보안 설정
# - 불필요한 퍼블릭 권한

# CLI에서 확인 (베타)
supabase inspect db --project-ref <PROJECT_REF>
```

---

> 출처:
> - [Supabase Security](https://supabase.com/security)
> - [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
> - [Platform Security](https://supabase.com/docs/guides/security/platform-security)
> - [Understanding API Keys](https://supabase.com/docs/guides/api/api-keys)
> - [Auth Architecture](https://supabase.com/docs/guides/auth/architecture)
> - [Rotating API Keys](https://supabase.com/docs/guides/troubleshooting/rotating-anon-service-and-jwt-secrets-1Jq6yd)
> - [RLS Performance and Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)
> - [Platform Audit Logs](https://supabase.com/docs/guides/security/platform-audit-logs)
> - [Auth Audit Logs](https://supabase.com/docs/guides/auth/audit-logs)
> - [PGAudit Extension](https://supabase.com/docs/guides/database/extensions/pgaudit)
> - [Supabase Security Retro 2025](https://supaexplorer.com/dev-notes/supabase-security-2025-whats-new-and-how-to-stay-secure.html)
> - [Hardening Self-hosted Supabase with CrowdSec](https://www.crowdsec.net/blog/hardening-self-hosted-supabase)
