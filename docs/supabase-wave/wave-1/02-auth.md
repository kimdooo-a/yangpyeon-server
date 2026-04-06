# Supabase Auth 심층 분석

> **Wave 1 / 문서 02**
> 작성일: 2026-04-06
> 대상 버전: Supabase Auth (GoTrue fork) — 2025-2026 기준

---

## 목차

1. [개요: Supabase Auth(GoTrue) 아키텍처와 역할](#1-개요)
2. [인증 방식 상세](#2-인증-방식-상세)
   - 2.1 Email/Password 인증
   - 2.2 OAuth 소셜 로그인
   - 2.3 Phone/SMS 인증 (OTP)
   - 2.4 SAML SSO (Enterprise)
   - 2.5 Anonymous Sign-in
   - 2.6 MFA/2FA (TOTP)
3. [내부 아키텍처](#3-내부-아키텍처)
   - 3.1 GoTrue 서버 동작 원리
   - 3.2 JWT 토큰 구조
   - 3.3 세션 관리
   - 3.4 Refresh Token Rotation
4. [RLS 연동](#4-rls-연동)
   - 4.1 auth.uid() 함수 활용
   - 4.2 auth.jwt() 커스텀 클레임
   - 4.3 RLS 정책 패턴
5. [사용자 관리](#5-사용자-관리)
   - 5.1 사용자 메타데이터
   - 5.2 역할(Role) 관리
   - 5.3 사용자 초대 및 팀 관리
   - 5.4 계정 연결 (Account Linking)
6. [보안](#6-보안)
   - 6.1 Rate Limiting
   - 6.2 CAPTCHA 통합
   - 6.3 비밀번호 정책
   - 6.4 이메일 템플릿 커스터마이징
   - 6.5 Redirect URL 화이트리스트
7. [제한사항](#7-제한사항)
   - 7.1 플랜별 MAU 제한
   - 7.2 SMS 비용 및 제한
   - 7.3 알려진 이슈
8. [운영 패턴](#8-운영-패턴)
   - 8.1 Server-side Auth (SSR/Next.js)
   - 8.2 PKCE Flow
   - 8.3 세션 관리 모범 사례

---

## 1. 개요

### 1.1 Supabase Auth란?

Supabase Auth는 Netlify가 원래 개발한 **GoTrue** 프로젝트를 Supabase 팀이 포크하여 독자적으로 발전시킨 **JWT 기반 사용자 인증/인가 API 서버**이다. Go 언어로 작성되어 있으며, PostgreSQL의 `auth` 스키마를 직접 활용한다.

공개 GitHub 저장소: `supabase/auth` (과거 `supabase-community/gotrue`에서 이전)

### 1.2 역할과 위치

Supabase 전체 스택에서 Auth 서비스는 다음과 같은 위치를 차지한다.

```
클라이언트 앱
    ↓  (SDK: @supabase/supabase-js, @supabase/ssr 등)
Supabase Auth 서버 (GoTrue, 포트 9999)
    ↓  JWT 발급 / 세션 관리
PostgreSQL auth 스키마
    ↓  RLS 정책에서 auth.uid(), auth.jwt() 사용
PostgreSQL public 스키마 (실제 데이터)
```

클라이언트 SDK는 다음 세 가지를 자동 처리한다.

- Auth 백엔드로의 HTTP 요청 헤더/쿠키 설정
- 액세스 토큰·리프레시 토큰의 스토리지 저장 및 갱신
- 토큰 만료 시 자동 갱신 (silent refresh)

### 1.3 핵심 구성 요소

| 구성 요소 | 역할 |
|-----------|------|
| GoTrue 서버 | 회원가입/로그인/토큰 발급 REST API |
| PostgreSQL `auth` 스키마 | `auth.users`, `auth.sessions`, `auth.identities` 테이블 |
| JWT | 인증 상태를 인코딩한 단기 토큰 (기본 1시간) |
| Refresh Token | 장기 토큰 (만료 없음, 1회 사용 원칙) |
| RLS 정책 | `auth.uid()` / `auth.jwt()`로 DB 행 수준 접근 제어 |

### 1.4 auth 스키마 핵심 테이블

```sql
-- 사용자 기본 정보
auth.users (
  id              UUID PRIMARY KEY,
  email           TEXT,
  phone           TEXT,
  role            TEXT,                    -- 'authenticated' 또는 'anon'
  raw_user_meta_data  JSONB,              -- 사용자 수정 가능
  raw_app_meta_data   JSONB,              -- 서버/서비스롤만 수정 가능
  is_anonymous    BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ
);

-- 소셜/이메일/전화 등 인증 수단별 ID 연결
auth.identities (
  id              TEXT,
  user_id         UUID REFERENCES auth.users,
  identity_data   JSONB,
  provider        TEXT,                    -- 'google', 'email', 'phone' 등
  created_at      TIMESTAMPTZ
);

-- 활성 세션 추적
auth.sessions (
  id              UUID PRIMARY KEY,
  user_id         UUID REFERENCES auth.users,
  created_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ,
  factor_id       UUID,                    -- MFA 팩터 연결
  aal             auth.aal_level           -- 'aal1' 또는 'aal2'
);

-- Refresh Token 관리
auth.refresh_tokens (
  id              BIGINT,
  token           TEXT UNIQUE,
  user_id         UUID,
  session_id      UUID,
  revoked         BOOLEAN,
  parent          TEXT                     -- rotation 추적용 부모 토큰
);
```

---

## 2. 인증 방식 상세

### 2.1 Email/Password 인증

#### 기본 회원가입

가장 전통적인 인증 방식이다. 이메일 확인(Confirm Email) 기능을 함께 사용하면 보안이 강화된다.

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// 회원가입 (이메일 확인 활성화 시 확인 메일 발송)
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'StrongPassword123!',
  options: {
    // 이메일 확인 후 리다이렉트될 URL
    emailRedirectTo: 'https://example.com/auth/callback',
    // 회원가입 시 user_metadata 저장 가능
    data: {
      full_name: '홍길동',
      avatar_url: 'https://...',
    },
  },
})
```

#### 로그인

```typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'StrongPassword123!',
})

// data.session.access_token  → JWT 액세스 토큰
// data.session.refresh_token → 리프레시 토큰
// data.user                  → 사용자 정보
```

#### 매직 링크 (Passwordless)

비밀번호 없이 이메일 링크만으로 로그인하는 방식이다.

```typescript
// 매직 링크 발송
const { error } = await supabase.auth.signInWithOtp({
  email: 'user@example.com',
  options: {
    emailRedirectTo: 'https://example.com/auth/callback',
    shouldCreateUser: true, // 미가입자 자동 생성 여부
  },
})
```

사용자가 이메일 링크를 클릭하면 `emailRedirectTo` URL로 리다이렉트되며, URL에 `code` 파라미터(PKCE 모드) 또는 `access_token`·`refresh_token` 해시가 포함된다.

#### 비밀번호 재설정 플로우

```typescript
// 1단계: 재설정 이메일 발송
await supabase.auth.resetPasswordForEmail('user@example.com', {
  redirectTo: 'https://example.com/auth/update-password',
})

// 2단계: 링크 클릭 후 리다이렉트 페이지에서 세션 처리
// (PKCE 모드에서는 exchangeCodeForSession 필요)

// 3단계: 새 비밀번호 설정
const { error } = await supabase.auth.updateUser({
  password: 'NewStrongPassword456!',
})
```

#### 이메일 OTP (6자리 코드)

링크 대신 6자리 숫자 코드를 보내는 방식이다.

```typescript
// OTP 발송 (type: 'email')
await supabase.auth.signInWithOtp({
  email: 'user@example.com',
})

// OTP 검증
const { data, error } = await supabase.auth.verifyOtp({
  email: 'user@example.com',
  token: '123456',
  type: 'email',
})
```

---

### 2.2 OAuth 소셜 로그인

#### 지원 프로바이더 전체 목록

2025년 기준 Supabase가 기본 제공하는 OAuth 프로바이더는 다음과 같다.

| 프로바이더 | 가이드 페이지 |
|-----------|--------------|
| Apple | `auth-apple` |
| Azure (Microsoft) | `auth-azure` |
| Bitbucket | `auth-bitbucket` |
| Discord | `auth-discord` |
| Facebook | `auth-facebook` |
| Figma | `auth-figma` |
| GitHub | `auth-github` |
| GitLab | `auth-gitlab` |
| Google | `auth-google` |
| Kakao | `auth-kakao` |
| Keycloak | `auth-keycloak` |
| LinkedIn (OIDC) | `auth-linkedin` |
| Notion | `auth-notion` |
| Slack (OIDC) | `auth-slack` |
| Spotify | `auth-spotify` |
| Twitch | `auth-twitch` |
| Twitter (X) | `auth-twitter` |
| WorkOS | `auth-workos` |
| Zoom | `auth-zoom` |

> **참고**: Naver는 공식 내장 프로바이더 목록에 없으며, Custom OAuth/OIDC 프로바이더로 추가해야 한다 (아래 항목 참조).

#### 기본 사용법 (Next.js App Router 기준)

```typescript
// 소셜 로그인 시작 (리다이렉트 방식)
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${origin}/auth/callback`,
    scopes: 'openid email profile',     // 추가 스코프 요청
    queryParams: {
      access_type: 'offline',           // Google: 리프레시 토큰 요청
      prompt: 'consent',
    },
  },
})
// data.url로 리다이렉트하거나 자동 리다이렉트됨
```

#### Kakao 로그인 설정

Kakao는 내장 프로바이더이므로 별도 커스텀 설정 없이 사용할 수 있다.

1. Kakao Developers(developers.kakao.com)에서 앱 생성
2. 플랫폼 > Web 사이트 도메인 등록
3. 카카오 로그인 > Redirect URI에 `https://<project>.supabase.co/auth/v1/callback` 추가
4. Supabase 대시보드 > Authentication > Providers > Kakao에서 REST API 키(Client ID) 및 Secret 입력

```typescript
await supabase.auth.signInWithOAuth({
  provider: 'kakao',
  options: {
    redirectTo: `${origin}/auth/callback`,
  },
})
```

#### Custom OAuth/OIDC 프로바이더 (Naver, 사내 IdP 등)

```typescript
// Supabase 대시보드 설정 후 provider 이름으로 호출
await supabase.auth.signInWithOAuth({
  provider: 'custom_naver' as any, // custom provider slug
})
```

프로젝트당 최대 3개의 커스텀 프로바이더를 추가할 수 있다. 더 필요하면 Supabase 지원에 문의해야 한다.

#### 팝업 모드 (리다이렉트 없이 팝업 창)

```typescript
await supabase.auth.signInWithOAuth({
  provider: 'github',
  options: {
    skipBrowserRedirect: true,
  },
})
// 반환된 data.url을 직접 팝업 창으로 열기
window.open(data.url, '_blank', 'width=500,height=600')
```

---

### 2.3 Phone/SMS 인증 (OTP)

#### 지원 SMS 프로바이더

| 프로바이더 | 공식 지원 여부 |
|-----------|--------------|
| Twilio | 공식 지원 |
| MessageBird | 공식 지원 |
| Vonage (Nexmo) | 공식 지원 |
| TextLocal | 커뮤니티 지원 |
| WhatsApp (Twilio) | 공식 지원 |

#### 전화번호 로그인 플로우

```typescript
// 1단계: OTP 발송 (국제 전화번호 형식 필수: +82XXXXXXXXXX)
const { error } = await supabase.auth.signInWithOtp({
  phone: '+821012345678',
})

// 2단계: OTP 입력 검증
const { data, error } = await supabase.auth.verifyOtp({
  phone: '+821012345678',
  token: '123456',
  type: 'sms',
})
```

#### 주요 제약

- 기본적으로 동일 번호는 60초에 1회만 OTP 요청 가능
- OTP 코드 유효 시간: 기본 1시간
- WhatsApp 사용 시 Twilio와의 별도 계약 필요

---

### 2.4 SAML SSO (Enterprise)

SAML 2.0 기반의 기업용 Single Sign-On이다.

#### 활성화 조건

- **Pro 플랜 이상**에서만 사용 가능
- 기본 비활성화 상태 → 대시보드 Authentication > Providers에서 활성화

#### SAML 설정 흐름

```
1. IdP(Identity Provider, 예: Okta, Azure AD, Google Workspace)에서
   Supabase SAML SP 메타데이터 등록:
   - Entity ID: https://<project>.supabase.co/auth/v1
   - ACS URL: https://<project>.supabase.co/auth/v1/sso/saml/acs

2. Supabase에서 IdP 메타데이터 등록 (Admin API 또는 대시보드)

3. 사용자는 도메인(이메일) 기반으로 자동 IdP 라우팅
```

#### Admin API로 SSO 프로바이더 등록

```bash
curl -X POST 'https://<project>.supabase.co/auth/v1/admin/sso/providers' \
  -H 'apikey: <service_role_key>' \
  -H 'Authorization: Bearer <service_role_key>' \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "saml",
    "metadata_url": "https://accounts.google.com/o/saml2/idp?idpid=XXXXXX",
    "domains": ["company.com"],
    "attribute_mapping": {
      "keys": {
        "email": { "name": "email" },
        "name": { "name": "displayName" }
      }
    }
  }'
```

#### 로그인 시작

```typescript
const { data, error } = await supabase.auth.signInWithSSO({
  domain: 'company.com',           // 도메인 기반 IdP 자동 탐색
  options: {
    redirectTo: 'https://example.com/auth/callback',
  },
})
// data.url로 IdP 로그인 페이지 리다이렉트
```

---

### 2.5 Anonymous Sign-in

사용자가 계정을 생성하지 않고도 인증된 상태로 앱을 사용할 수 있게 한다. 쇼핑 카트, 임시 설정 저장 등에 유용하다.

#### 특징

- 익명 사용자는 `auth.users`에 **실제 레코드**로 저장됨
- `is_anonymous = true` 플래그 설정
- 로그아웃 또는 브라우저 데이터 삭제 시 계정 재접근 불가
- 이메일/소셜 계정으로 **업그레이드(연결)** 가능

```typescript
// 익명 로그인
const { data, error } = await supabase.auth.signInAnonymously({
  options: {
    captchaToken: '...', // 악용 방지를 위해 권장
  },
})

// 나중에 이메일로 계정 업그레이드
const { error } = await supabase.auth.updateUser({
  email: 'user@example.com',
  password: 'Password123!',
})
```

#### RLS에서 익명 사용자 처리

```sql
-- 익명 사용자는 자신의 데이터만 읽기 허용
CREATE POLICY "익명 사용자 자신 데이터 접근"
  ON public.temp_data
  FOR ALL
  USING (
    auth.uid() = user_id
    AND (auth.jwt() ->> 'is_anonymous')::boolean = true
  );

-- 인증된 사용자만 특정 테이블 접근
CREATE POLICY "인증 사용자만"
  ON public.orders
  FOR ALL
  TO authenticated
  USING (
    auth.uid() = user_id
    AND (auth.jwt() ->> 'is_anonymous')::boolean = false
  );
```

---

### 2.6 MFA/2FA (TOTP)

#### 지원 MFA 방식

| 방식 | 지원 여부 |
|------|---------|
| TOTP (Google Authenticator, Authy 등) | 지원 (무료) |
| Phone (SMS/WhatsApp) | 지원 |
| 복구 코드 | 미지원 (팩터 다중 등록으로 대체) |
| WebAuthn/FIDO2 | 미지원 (2025 기준) |

모든 Supabase 프로젝트에서 기본 활성화되어 있으며 **무료**이다.

#### TOTP 등록 플로우

```typescript
// 1단계: MFA 팩터 등록 시작 (QR코드 + 시크릿 반환)
const { data, error } = await supabase.auth.mfa.enroll({
  factorType: 'totp',
  friendlyName: '내 인증 앱',
})

// data.totp.qr_code  → QR 코드 SVG (이미지 태그에 바로 사용 가능)
// data.totp.secret   → 수동 입력용 Base32 시크릿
// data.id            → factor_id

// 2단계: 챌린지 생성
const { data: challengeData } = await supabase.auth.mfa.challenge({
  factorId: data.id,
})

// 3단계: 사용자가 앱에서 입력한 코드로 검증
const { data: verifyData, error } = await supabase.auth.mfa.verify({
  factorId: data.id,
  challengeId: challengeData.id,
  code: '123456',  // 6자리 TOTP 코드
})
```

#### MFA 로그인 플로우

```typescript
// 일반 로그인 후 MFA 챌린지 확인
const { data: { session } } = await supabase.auth.getSession()

if (session?.user.aal === 'aal1') {
  // MFA 필요 → 챌린지 시작
  const factors = await supabase.auth.mfa.listFactors()
  const totp = factors.data?.totp[0]

  const { data: challenge } = await supabase.auth.mfa.challenge({
    factorId: totp.id,
  })

  // 코드 입력 후 검증
  const { error } = await supabase.auth.mfa.verify({
    factorId: totp.id,
    challengeId: challenge.id,
    code: userInputCode,
  })
  // 성공 시 세션의 aal이 'aal2'로 업그레이드
}
```

#### AAL (Authentication Assurance Level)

- `aal1`: 단일 인증 (비밀번호, 소셜, OTP 등 하나)
- `aal2`: 2단계 인증 완료 (TOTP 또는 SMS 추가 확인)

팩터당 최대 10개 등록 가능. 등록 해제(unenroll) 시 다른 팩터가 1개 이상 있어야 한다.

---

## 3. 내부 아키텍처

### 3.1 GoTrue 서버 동작 원리

GoTrue는 표준 HTTP REST API를 제공한다. 주요 엔드포인트:

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/auth/v1/signup` | POST | 이메일/전화 회원가입 |
| `/auth/v1/token?grant_type=password` | POST | 이메일/비밀번호 로그인 |
| `/auth/v1/token?grant_type=refresh_token` | POST | 토큰 갱신 |
| `/auth/v1/authorize` | GET | OAuth 인가 시작 |
| `/auth/v1/callback` | GET | OAuth 콜백 처리 |
| `/auth/v1/user` | GET/PUT | 현재 사용자 조회/수정 |
| `/auth/v1/logout` | POST | 로그아웃 (세션 무효화) |
| `/auth/v1/otp` | POST | OTP 발송 |
| `/auth/v1/verify` | POST | OTP/토큰 검증 |
| `/auth/v1/admin/users` | GET/POST | 관리자용 사용자 목록/생성 |

GoTrue는 내부적으로 다음 순서로 요청을 처리한다.

```
1. 요청 수신 → Rate Limit 검사 → CAPTCHA 검증 (설정 시)
2. 인증 방식에 따른 분기 처리
3. auth.users 테이블 조작 (생성/조회/업데이트)
4. JWT 서명 및 발급 (HS256 또는 RS256/ES256)
5. 리프레시 토큰 생성 및 auth.refresh_tokens 저장
6. 응답 반환 (세션 객체)
```

### 3.2 JWT 토큰 구조

#### 헤더

```json
{
  "alg": "HS256",    // 또는 RS256, ES256 (비대칭 키 사용 시)
  "typ": "JWT"
}
```

#### 페이로드 (필수 클레임)

```json
{
  "iss": "https://<project>.supabase.co/auth/v1",
  "sub": "550e8400-e29b-41d4-a716-446655440000",   // auth.users.id (UUID)
  "aud": "authenticated",
  "exp": 1735689600,                               // 만료 시각 (Unix timestamp)
  "iat": 1735686000,                               // 발급 시각
  "email": "user@example.com",
  "phone": "",
  "role": "authenticated",                         // PostgreSQL 역할
  "aal": "aal1",                                   // 인증 보증 레벨
  "session_id": "a1b2c3d4-...",                   // 세션 UUID
  "is_anonymous": false
}
```

#### 페이로드 (선택 클레임)

```json
{
  "jti": "unique-jwt-id",
  "nbf": 1735686000,
  "app_metadata": {
    "provider": "google",
    "providers": ["google", "email"],
    "role": "admin"                                // 커스텀 앱 역할
  },
  "user_metadata": {
    "full_name": "홍길동",
    "avatar_url": "https://..."
  },
  "amr": [
    {
      "method": "password",
      "timestamp": 1735686000
    },
    {
      "method": "totp",
      "timestamp": 1735686060
    }
  ]
}
```

#### 서명 알고리즘 선택

- **HS256** (기본): 대칭 키. 간단하지만 비밀키 공유 필요
- **RS256** (권장): 비대칭 RSA. 공개키로 검증 가능
- **ES256** (권장): 비대칭 ECDSA. RS256보다 키가 작고 빠름
- **Ed25519** (옵션): 최신 타원 곡선. 최고 성능

OAuth 서버 구현 시 비대칭 알고리즘(RS256/ES256) 강력 권장. 공개키는 `/.well-known/jwks.json`에서 자동 노출된다.

### 3.3 세션 관리 (쿠키 vs 토큰)

#### 브라우저 환경 (SPA)

기본적으로 `localStorage`에 저장한다. PKCE 플로우와 함께 사용하면 보안이 강화된다.

```typescript
// 기본 클라이언트: localStorage 사용
const supabase = createClient(URL, ANON_KEY)

// 커스텀 스토리지 (예: sessionStorage)
const supabase = createClient(URL, ANON_KEY, {
  auth: {
    storage: sessionStorage,
    storageKey: 'my-app-auth',
  },
})
```

#### SSR 환경 (Next.js, SvelteKit 등)

`@supabase/ssr` 패키지를 사용해 **HTTP-Only 쿠키**에 세션을 저장한다. 이는 XSS 공격으로부터 토큰을 보호한다.

```typescript
// Next.js 서버 컴포넌트용 클라이언트
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )
}
```

#### 세션 상태 변화 감지

```typescript
// 클라이언트 측 세션 변화 리스너
const { data: { subscription } } = supabase.auth.onAuthStateChange(
  (event, session) => {
    // 이벤트 종류:
    // SIGNED_IN       → 로그인 성공
    // SIGNED_OUT      → 로그아웃
    // TOKEN_REFRESHED → 액세스 토큰 갱신
    // USER_UPDATED    → 사용자 정보 변경
    // MFA_CHALLENGE_VERIFIED → MFA 인증 완료
    console.log(event, session)
  }
)

// 구독 해제
subscription.unsubscribe()
```

### 3.4 Refresh Token Rotation

GoTrue는 **자동 Refresh Token Rotation**을 구현하고 있다.

#### 동작 원리

```
1. 사용자 로그인 → (access_token_1, refresh_token_1) 발급
2. access_token_1 만료 (기본 1시간 후)
3. refresh_token_1으로 갱신 요청
4. refresh_token_1 즉시 무효화 (revoked = true)
5. (access_token_2, refresh_token_2) 새로 발급
6. refresh_token_1 재사용 시도 → 보안 위반 감지
7. 해당 refresh_token에서 파생된 모든 토큰 즉시 무효화 (세션 강제 종료)
```

#### Reuse Interval (재사용 허용 시간)

동시 요청이 많은 환경에서 경쟁 조건(Race Condition)을 방지하기 위해 기본 **10초 재사용 허용** 창이 있다.

```
refresh_token_1 발급 시각: T
T ~ T+10초: refresh_token_1 재사용 허용 (같은 토큰 반환)
T+10초 이후: 재사용 시 보안 위반으로 처리
```

#### 서버 측에서의 토큰 갱신

```typescript
// 현재 세션 가져오기 (자동 갱신)
const { data: { session } } = await supabase.auth.getSession()

// 수동 갱신
const { data, error } = await supabase.auth.refreshSession()

// 특정 refresh_token으로 세션 설정
const { data, error } = await supabase.auth.setSession({
  access_token: '...',
  refresh_token: '...',
})
```

---

## 4. RLS 연동

### 4.1 auth.uid() 함수 활용

`auth.uid()`는 현재 JWT에서 사용자 ID(`sub` 클레임)를 추출한다. 인증되지 않은 요청에서는 `null`을 반환한다.

#### 기본 패턴: 자신의 데이터만 접근

```sql
-- 사용자는 자신의 프로필만 볼 수 있음
CREATE POLICY "자신의 프로필 조회"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- 자신의 게시물만 수정/삭제 가능
CREATE POLICY "자신의 게시물 수정"
  ON public.posts
  FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- 자신의 데이터만 삭제
CREATE POLICY "자신의 데이터 삭제"
  ON public.posts
  FOR DELETE
  TO authenticated
  USING (author_id = auth.uid());
```

#### 외래 키를 통한 간접 소유권 확인

```sql
-- 사용자가 소속된 팀의 프로젝트만 접근
CREATE POLICY "팀 프로젝트 접근"
  ON public.projects
  FOR SELECT
  TO authenticated
  USING (
    team_id IN (
      SELECT team_id
      FROM public.team_members
      WHERE user_id = auth.uid()
    )
  );
```

#### 성능 최적화: 서브쿼리 대신 JOIN 또는 EXISTS

```sql
-- 비효율적 (서브쿼리 매번 실행)
USING (user_id = (SELECT auth.uid()))

-- 권장 (인덱스 활용 가능)
USING (user_id = auth.uid())

-- 복잡한 조건에서 EXISTS 사용
CREATE POLICY "관리자 또는 소유자만"
  ON public.documents
  FOR ALL
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.admins
      WHERE user_id = auth.uid()
    )
  );
```

### 4.2 auth.jwt() 커스텀 클레임

`auth.jwt()`는 현재 JWT 전체를 JSONB로 반환한다.

#### 기본 클레임 접근

```sql
-- 역할 확인
SELECT auth.jwt() ->> 'role';            -- 'authenticated'

-- 이메일 확인
SELECT auth.jwt() ->> 'email';

-- AAL(인증 보증 레벨) 확인
SELECT auth.jwt() ->> 'aal';             -- 'aal1' 또는 'aal2'

-- 익명 여부 확인
SELECT (auth.jwt() ->> 'is_anonymous')::boolean;

-- app_metadata 접근
SELECT auth.jwt() -> 'app_metadata' ->> 'role';

-- user_metadata 접근
SELECT auth.jwt() -> 'user_metadata' ->> 'full_name';
```

#### 커스텀 클레임으로 역할 기반 접근 제어(RBAC)

```sql
-- app_metadata.role = 'admin'인 사용자만 모든 데이터 접근
CREATE POLICY "관리자 전체 접근"
  ON public.posts
  FOR ALL
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR author_id = auth.uid()
  );

-- MFA 완료(aal2)한 사용자만 민감 데이터 접근
CREATE POLICY "MFA 완료 사용자만"
  ON public.sensitive_data
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt() ->> 'aal' = 'aal2'
    AND user_id = auth.uid()
  );
```

#### 보안 주의사항

`user_metadata`는 **사용자가 직접 수정 가능**하므로 보안 결정에 사용하면 안 된다.

```sql
-- 위험: user_metadata는 사용자가 조작 가능
-- USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')  ← 절대 금지

-- 안전: app_metadata는 서비스롤만 수정 가능
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')  -- 올바른 방법
```

### 4.3 RLS 정책에서 인증 정보 활용 패턴

#### 패턴 1: 공개 읽기 + 소유자 쓰기

```sql
-- 게시물: 누구나 읽기, 작성자만 쓰기
CREATE POLICY "공개 읽기" ON public.posts
  FOR SELECT USING (true);

CREATE POLICY "작성자 INSERT" ON public.posts
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "작성자 UPDATE" ON public.posts
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "작성자 DELETE" ON public.posts
  FOR DELETE TO authenticated
  USING (author_id = auth.uid());
```

#### 패턴 2: 테넌트(조직) 기반 멀티테넌시

```sql
-- organizations 테이블과 조인하여 같은 조직 데이터만 접근
CREATE POLICY "조직 데이터 격리"
  ON public.documents
  FOR ALL
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );
```

#### 패턴 3: 행 수준 소유권 자동 설정

```sql
-- INSERT 시 자동으로 user_id를 현재 사용자로 설정
ALTER TABLE public.posts
  ALTER COLUMN author_id SET DEFAULT auth.uid();

-- 또는 트리거 사용
CREATE OR REPLACE FUNCTION public.set_auth_user_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.author_id := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER set_author_on_insert
  BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.set_auth_user_id();
```

#### 패턴 4: Custom Access Token Hook으로 클레임 주입

```sql
-- Postgres 함수로 커스텀 클레임 추가
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  user_role TEXT;
BEGIN
  -- 사용자 역할 조회
  SELECT role INTO user_role
  FROM public.user_roles
  WHERE user_id = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';

  -- app_metadata에 역할 추가
  claims := jsonb_set(
    claims,
    '{app_metadata, role}',
    to_jsonb(COALESCE(user_role, 'user'))
  );

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Supabase 대시보드 > Auth > Hooks에서 위 함수 등록
```

---

## 5. 사용자 관리

### 5.1 사용자 메타데이터

#### user_metadata vs app_metadata

| 항목 | user_metadata | app_metadata |
|------|--------------|-------------|
| DB 컬럼 | `raw_user_meta_data` | `raw_app_meta_data` |
| 수정 주체 | 사용자 본인 (updateUser) | 서비스롤 키 또는 Custom Hook |
| JWT 포함 | 선택적 | 항상 포함 |
| RLS 보안 활용 | 위험 (조작 가능) | 안전 |
| 용도 | 닉네임, 아바타 등 사용자 설정 | 역할, 구독 상태 등 비즈니스 로직 |

#### user_metadata 조작

```typescript
// 클라이언트에서 user_metadata 업데이트 (사용자 본인)
const { data, error } = await supabase.auth.updateUser({
  data: {
    full_name: '홍길동',
    avatar_url: 'https://example.com/avatar.jpg',
    preferences: {
      theme: 'dark',
      language: 'ko',
    },
  },
})
```

#### app_metadata 조작 (서버 측 전용)

```typescript
// 서버 측에서만 실행 (서비스롤 키 필요)
const supabaseAdmin = createClient(URL, SERVICE_ROLE_KEY)

const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
  userId,
  {
    app_metadata: {
      role: 'admin',
      subscription_tier: 'pro',
      subscription_expires: '2026-12-31',
    },
  }
)
```

### 5.2 역할(Role) 관리

#### PostgreSQL 역할과 Supabase 역할

Supabase Auth에서 `role` 클레임은 **PostgreSQL 데이터베이스 역할**을 지정한다.

| 역할 | 설명 |
|------|------|
| `anon` | 로그인하지 않은 익명 사용자 |
| `authenticated` | 로그인한 모든 사용자 |
| `service_role` | 서비스 키 사용자 (RLS 우회) |

> **주의**: JWT의 `role` 클레임은 PostgreSQL 역할이다. 앱 수준의 관리자/일반 사용자 구분은 `app_metadata`를 활용해야 한다.

#### 앱 레벨 RBAC 구현

```typescript
// 관리자 역할 부여 (서버 측)
await supabaseAdmin.auth.admin.updateUserById(userId, {
  app_metadata: { role: 'admin' },
})

// 역할 확인 (클라이언트 측)
const { data: { user } } = await supabase.auth.getUser()
const isAdmin = user?.app_metadata?.role === 'admin'
```

### 5.3 사용자 초대 및 팀 관리

#### 이메일로 사용자 초대

```typescript
// 서버 측 (Admin API)
const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
  'newuser@example.com',
  {
    redirectTo: 'https://example.com/accept-invite',
    data: {
      organization_id: 'org-123',
      invited_role: 'member',
    },
  }
)
```

초대받은 사용자는 이메일 링크를 클릭하면 비밀번호 설정 페이지로 이동한다.

#### 팀 멤버십 관리 패턴

```sql
-- 팀 멤버십 테이블
CREATE TABLE public.team_members (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id     UUID REFERENCES public.teams NOT NULL,
  user_id     UUID REFERENCES auth.users NOT NULL,
  role        TEXT DEFAULT 'member',    -- 'owner', 'admin', 'member'
  invited_by  UUID REFERENCES auth.users,
  joined_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

-- RLS: 팀 멤버만 팀 정보 접근
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "팀 멤버 조회"
  ON public.team_members FOR SELECT
  TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM public.team_members
      WHERE user_id = auth.uid()
    )
  );
```

### 5.4 계정 연결 (Account Linking)

#### 자동 연결 (기본 동작)

같은 이메일 주소를 사용하는 서로 다른 OAuth 프로바이더는 **자동으로 동일 계정에 연결**된다.

예) Google 로그인 후 GitHub으로 같은 이메일 로그인 시 → 동일 `auth.users` 레코드 사용

#### 수동 연결 (Manual Linking)

```typescript
// 현재 로그인된 상태에서 다른 소셜 계정 연결
const { data, error } = await supabase.auth.linkIdentity({
  provider: 'github',
  options: {
    redirectTo: 'https://example.com/settings/accounts',
  },
})

// 연결된 모든 ID 목록 조회
const { data: { identities } } = await supabase.auth.getUserIdentities()

// 특정 ID 연결 해제 (최소 1개 ID 유지 필요)
const { error } = await supabase.auth.unlinkIdentity(
  identities.find(i => i.provider === 'github')
)
```

수동 연결 활성화는 대시보드 Authentication > Settings에서 "Allow manual linking" 토글을 켜거나, 환경변수 `GOTRUE_SECURITY_MANUAL_LINKING_ENABLED=true`로 설정한다.

#### Admin API로 사용자 관리

```typescript
// 사용자 목록 조회 (페이지네이션)
const { data, error } = await supabaseAdmin.auth.admin.listUsers({
  page: 1,
  perPage: 50,
})

// 특정 사용자 조회
const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(userId)

// 사용자 삭제
await supabaseAdmin.auth.admin.deleteUser(userId)

// 사용자의 모든 세션 강제 로그아웃
await supabaseAdmin.auth.admin.signOut(userId, 'global')
```

---

## 6. 보안

### 6.1 Rate Limiting

GoTrue는 여러 계층의 Rate Limiting을 구현한다.

#### IP 기반 Rate Limiting

| 엔드포인트 | 기본 제한 |
|-----------|---------|
| OTP 발송 (이메일/SMS) | 사용자당 60초에 1회 |
| 비밀번호 로그인 시도 | IP당 시간당 30회 |
| 회원가입 | IP당 시간당 30회 |
| 비밀번호 재설정 | 사용자당 60초에 1회 |

#### 이메일 Rate Limiting

두 가지 방식으로 제한한다.

- **사용자별 빈도 제한**: 단일 사용자에게 너무 많은 이메일 발송 방지
- **글로벌 Rate Limit**: 서비스 전체 이메일 발송량 제한

#### 셀프호스팅 시 커스텀 Rate Limit 설정

```yaml
# docker-compose.yml
auth:
  environment:
    GOTRUE_RATE_LIMIT_EMAIL_SENT: 30     # 시간당 이메일 30개
    GOTRUE_RATE_LIMIT_SMS_SENT: 30       # 시간당 SMS 30개
    GOTRUE_RATE_LIMIT_VERIFY: 30         # 시간당 OTP 검증 30회
    GOTRUE_RATE_LIMIT_TOKEN_REFRESH: 150 # 시간당 토큰 갱신 150회
    GOTRUE_RATE_LIMIT_HEADER: X-Forwarded-For  # 실제 IP 헤더
```

### 6.2 CAPTCHA 통합

#### 지원 CAPTCHA 서비스

| 서비스 | 특징 |
|--------|------|
| **hCaptcha** | 프라이버시 중심, 무료 플랜 있음 |
| **Cloudflare Turnstile** | 사용자 경험 최소화, 무료 |

#### 설정 방법 (대시보드)

```
Authentication > Settings > Bot and Abuse Protection
→ Enable CAPTCHA protection 토글 ON
→ Provider 선택 (hCaptcha 또는 Cloudflare Turnstile)
→ Secret Key 입력
→ Save
```

#### 프론트엔드 통합 (hCaptcha)

```typescript
import HCaptcha from '@hcaptcha/react-hcaptcha'
import { useRef } from 'react'

function SignUpForm() {
  const captchaRef = useRef(null)

  const handleSignUp = async (email: string, password: string) => {
    const token = await captchaRef.current?.execute({ async: true })

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        captchaToken: token.response,
      },
    })
  }

  return (
    <>
      {/* 폼 필드 */}
      <HCaptcha
        ref={captchaRef}
        sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY!}
        size="invisible"
      />
    </>
  )
}
```

#### 프론트엔드 통합 (Cloudflare Turnstile)

```typescript
import { Turnstile } from '@marsidev/react-turnstile'

function SignUpForm() {
  const [captchaToken, setCaptchaToken] = useState<string>('')

  const handleSignUp = async (email: string, password: string) => {
    await supabase.auth.signUp({
      email,
      password,
      options: { captchaToken },
    })
  }

  return (
    <>
      <Turnstile
        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY!}
        onSuccess={setCaptchaToken}
      />
    </>
  )
}
```

CAPTCHA는 `signUp`, `signInWithPassword`, `signInWithOtp`, `signInAnonymously`, `resetPasswordForEmail` 엔드포인트에 적용된다.

### 6.3 비밀번호 정책

#### 대시보드 설정

```
Authentication > Settings > Password Protection
```

| 설정 항목 | 옵션 |
|----------|------|
| 최소 비밀번호 길이 | 8자 이상 (기본값: 8) |
| 복잡성 요구사항 | 소문자, 대문자, 숫자, 특수문자 조합 선택 |
| HaveIBeenPwned 확인 | ON/OFF (유출된 비밀번호 차단) |

#### HaveIBeenPwned 통합

Supabase는 Troy Hunt의 HaveIBeenPwned API와 통합하여 알려진 유출 비밀번호를 차단한다. 활성화 시 회원가입·비밀번호 변경 시 자동 검사가 이루어진다.

#### 클라이언트 측 비밀번호 검증 예시

```typescript
import { z } from 'zod'

const passwordSchema = z
  .string()
  .min(8, '비밀번호는 최소 8자 이상이어야 합니다')
  .regex(/[a-z]/, '소문자를 포함해야 합니다')
  .regex(/[A-Z]/, '대문자를 포함해야 합니다')
  .regex(/[0-9]/, '숫자를 포함해야 합니다')
  .regex(/[^a-zA-Z0-9]/, '특수문자를 포함해야 합니다')
```

### 6.4 이메일 템플릿 커스터마이징

#### 제공 템플릿 종류

| 템플릿 | 용도 |
|--------|------|
| Confirm signup | 회원가입 이메일 확인 |
| Invite user | 사용자 초대 |
| Magic Link | 매직 링크 로그인 |
| Change Email Address | 이메일 주소 변경 확인 |
| Reset Password | 비밀번호 재설정 |
| Reauthentication | 재인증 (민감 작업 전) |

#### 템플릿 변수

```
{{ .ConfirmationURL }}  → 확인 링크 전체 URL
{{ .Token }}           → OTP 코드 (6자리)
{{ .TokenHash }}       → 토큰 해시
{{ .SiteURL }}         → 사이트 URL
{{ .RedirectTo }}      → 리다이렉트 URL
{{ .Data }}            → 추가 메타데이터 (JSON)
{{ .Email }}           → 사용자 이메일
```

#### 커스텀 이메일 예시

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
</head>
<body>
  <h2>안녕하세요!</h2>
  <p>아래 버튼을 클릭하여 이메일을 확인해 주세요:</p>
  <a href="{{ .ConfirmationURL }}"
     style="background:#3ECF8E;color:white;padding:12px 24px;text-decoration:none;border-radius:4px">
    이메일 확인
  </a>
  <p>또는 아래 코드를 입력하세요: <strong>{{ .Token }}</strong></p>
  <p>이 링크는 24시간 후 만료됩니다.</p>
</body>
</html>
```

#### SMTP 커스텀 설정

기본적으로 Supabase 내장 SMTP(발송 제한 있음)를 사용한다. 프로덕션 환경에서는 외부 SMTP 권장.

```
Authentication > Settings > SMTP Settings
→ Enable Custom SMTP 토글 ON
→ Host, Port, Username, Password, Sender Name, Sender Email 입력
```

권장 SMTP 서비스: Resend, SendGrid, Postmark, AWS SES

### 6.5 Redirect URL 화이트리스트

인증 이메일 링크 클릭 후 리다이렉트될 수 있는 URL을 명시적으로 허용해야 한다.

#### 설정 위치

```
Authentication > URL Configuration
→ Site URL: https://example.com
→ Redirect URLs에 허용 URL 추가
```

#### 와일드카드 패턴 지원

```
# 정확한 URL
https://example.com/auth/callback

# 서브도메인 와일드카드
https://*.example.com/auth/callback

# Vercel Preview URL
https://*-example.vercel.app/auth/callback

# 로컬 개발
http://localhost:3000/auth/callback
```

#### 코드에서 redirectTo 사용

```typescript
// redirectTo는 반드시 허용 목록에 등록된 URL이어야 함
await supabase.auth.signInWithOtp({
  email: 'user@example.com',
  options: {
    emailRedirectTo: 'https://example.com/auth/callback',
  },
})
```

---

## 7. 제한사항

### 7.1 플랜별 MAU 제한

MAU(Monthly Active Users)는 해당 월에 한 번이라도 로그인한 고유 사용자 수이다.

| 플랜 | 월 요금 | MAU 한도 | 초과 요금 |
|------|--------|---------|---------|
| **Free** | $0 | 50,000 MAU | 초과 시 서비스 중단 |
| **Pro** | $25 | 100,000 MAU | MAU당 $0.00325 |
| **Team** | $599 | 높은 한도 포함 | 별도 협의 |
| **Enterprise** | 협의 | 무제한 | 커스텀 |

> **주의**: Free 플랜에서 MAU를 초과하면 인증 기능이 중단된다. 프로덕션 서비스라면 반드시 Pro 이상 사용 권장.

#### MAU 사용량 확인

```
Supabase 대시보드 → Reports → Auth
또는
Project Settings → Billing → Usage
```

#### MAU 절약 팁

- 만료된 익명 사용자 정기 삭제 (`auth.users`에서 `is_anonymous=true` AND `last_sign_in_at < NOW() - INTERVAL '30 days'`)
- 실제 필요 없는 테스트 계정 관리

### 7.2 SMS 비용 및 제한

SMS 인증은 외부 SMS 프로바이더 비용이 발생한다.

| 프로바이더 | 특징 |
|-----------|------|
| Twilio | 가장 널리 사용, SMS/WhatsApp 지원 |
| Vonage | 경쟁력 있는 가격 |
| MessageBird | 유럽 중심 |
| TextLocal | 인도 중심, 커뮤니티 지원 |

한국 번호(+82) SMS 발송 시 주요 고려사항:
- 국제 SMS 요금 (Twilio 기준 한국 약 $0.05/건)
- 발신번호 등록 의무 (한국 규정상 사전 등록 필요)
- 알파 태그(발신번호 문자) 제한

#### Free 플랜 SMS 제한

Free 플랜에서 SMS 기능을 사용하려면 외부 프로바이더 계정이 별도로 필요하다. Supabase는 SMS 발송 자체에 대해 직접 과금하지 않지만, SMS 프로바이더 비용은 사용자 부담이다.

### 7.3 알려진 이슈 및 제약

#### 세션 관련

| 이슈 | 설명 | 해결책 |
|------|------|--------|
| ISR/CDN 캐싱 | 응답이 캐시되면 다른 사용자 세션이 노출될 수 있음 | `export const dynamic = 'force-dynamic'` 사용 |
| Server Components 쿠키 쓰기 | Next.js Server Components는 직접 Set-Cookie 불가 | 미들웨어에서 토큰 갱신 처리 |
| Race Condition | 동시 요청 시 Refresh Token 충돌 | Reuse Interval(10초) 내에서 자동 처리 |

#### 소셜 로그인 관련

| 이슈 | 설명 |
|------|------|
| Apple 로그인 | 첫 로그인에서만 이름 정보 제공 → user_metadata에 수동 저장 필요 |
| Google One Tap | 별도 설정 필요, PKCE 플로우와 다름 |
| Kakao 이메일 미제공 | 사용자가 이메일 제공 동의를 거부할 수 있음 |

#### SAML SSO 관련

- Pro 플랜 이상에서만 사용 가능
- IdP에서 이메일 클레임이 반드시 포함되어야 함
- 사용자 프로비저닝/디프로비저닝은 수동으로 처리해야 함 (SCIM 미지원)

#### 커스텀 클레임 관련

- Auth Hook이 500ms 이내 응답하지 않으면 로그인 실패
- Auth Hook 오류 시 사용자 경험 저하 → 오류 처리 신중하게 구현 필요

---

## 8. 운영 패턴

### 8.1 Server-side Auth (SSR/Next.js)

#### 패키지 설치

```bash
npm install @supabase/supabase-js @supabase/ssr
```

#### 클라이언트 팩토리 함수

```typescript
// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/supabase'

export function createClient() {
  const cookieStore = cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Components에서는 쿠키 쓰기 불가 (무시)
          }
        },
      },
    }
  )
}
```

```typescript
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

#### 미들웨어 (세션 갱신 핵심)

Next.js에서 Server Components는 쿠키를 쓸 수 없으므로, 미들웨어에서 토큰 갱신을 처리해야 한다.

```typescript
// src/middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 세션 갱신 (중요: getUser()로만 검증, getSession() 사용 금지)
  const { data: { user } } = await supabase.auth.getUser()

  // 보호된 라우트 처리
  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

#### 서버 컴포넌트에서 사용

```typescript
// src/app/dashboard/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = createClient()

  // getClaims()가 가장 안전한 서버 측 사용자 확인 방법
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  // 인증된 사용자 데이터 조회
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return <div>안녕하세요, {profile?.full_name}!</div>
}
```

#### Auth 콜백 라우트

```typescript
// src/app/auth/callback/route.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    // code를 session으로 교환 (PKCE 플로우)
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`)
}
```

### 8.2 PKCE Flow

**PKCE(Proof Key for Code Exchange)**는 인가 코드 가로채기 공격을 방지하는 OAuth 2.0 확장이다. SSR 환경에서 기본 활성화된다.

#### PKCE 플로우 상세 단계

```
1. 클라이언트가 code_verifier 생성 (랜덤 43-128자 문자열)
2. code_verifier를 SHA-256 해시 → code_challenge
3. 인가 요청 시 code_challenge와 code_challenge_method=S256 포함
4. 서버는 code_challenge 저장, 인가 코드(code) 발급
5. 콜백에서 code + code_verifier로 토큰 교환 요청
6. 서버가 SHA-256(code_verifier) == code_challenge 검증
7. 검증 성공 시 access_token + refresh_token 발급
```

`@supabase/ssr` 패키지는 이 과정을 자동으로 처리한다.

#### 암묵적 플로우 vs PKCE 플로우 비교

| 항목 | 암묵적 플로우 (Implicit) | PKCE 플로우 |
|------|------------------------|------------|
| 토큰 위치 | URL 해시(#) | URL 쿼리 파라미터(?code=) |
| 서버 처리 | 불필요 | exchangeCodeForSession() 필요 |
| 보안 | 토큰이 URL에 노출 | 코드만 노출, 토큰은 서버에서 교환 |
| 권장 환경 | SPA (레거시) | SSR, 모바일 앱 (현재 권장) |

#### PKCE 수동 활성화 (SPA)

```typescript
const supabase = createClient(URL, ANON_KEY, {
  auth: {
    flowType: 'pkce',  // 기본값: 'implicit' (SPA), 'pkce' (SSR)
  },
})
```

### 8.3 세션 관리 모범 사례

#### getUser() vs getSession() 선택 기준

```typescript
// ❌ 보안 취약: getSession()은 서버에서 토큰을 재검증하지 않음
// 쿠키 조작 공격에 취약
const { data: { session } } = await supabase.auth.getSession()

// ✅ 안전: getUser()는 Supabase 서버에서 항상 재검증
// 보호된 라우트/서버 액션에서 반드시 사용
const { data: { user } } = await supabase.auth.getUser()
```

#### 세션 보안 체크리스트

```typescript
// 1. 민감한 작업 전 재인증 요구
const { error } = await supabase.auth.reauthenticate()
// 이메일/SMS로 재인증 코드 발송됨

// 2. 전체 기기 로그아웃
await supabase.auth.signOut({ scope: 'global' })
// scope 옵션: 'local' (현재 기기), 'others' (다른 기기), 'global' (모든 기기)

// 3. 현재 세션만 로그아웃
await supabase.auth.signOut({ scope: 'local' })
```

#### ISR/CDN 캐싱 주의사항

```typescript
// Next.js App Router: 인증이 필요한 페이지는 동적 렌더링 강제
export const dynamic = 'force-dynamic'
// 또는
export const revalidate = 0

// Page Router: getServerSideProps 사용 (캐시되지 않음)
export async function getServerSideProps(context) {
  const supabase = createServerClient(URL, ANON_KEY, {
    cookies: {
      getAll: () => Object.entries(context.req.cookies).map(...),
      setAll: (cookies) => cookies.forEach(c => context.res.setHeader('Set-Cookie', ...))
    }
  })
  const { data: { user } } = await supabase.auth.getUser()
  // ...
}
```

#### 세션 자동 갱신 설정

```typescript
const supabase = createClient(URL, ANON_KEY, {
  auth: {
    autoRefreshToken: true,          // 기본 true: 만료 전 자동 갱신
    persistSession: true,            // 기본 true: 세션 스토리지 저장
    detectSessionInUrl: true,        // 기본 true: URL에서 세션 감지
  },
})
```

#### 토큰 만료 시간 커스터마이징 (셀프호스팅)

```yaml
# docker-compose.yml
auth:
  environment:
    GOTRUE_JWT_EXPIRY: 3600          # 액세스 토큰 만료: 1시간 (초 단위)
    GOTRUE_JWT_EXP: 3600
```

Supabase 클라우드에서는 대시보드 Authentication > Settings > JWT Expiry에서 설정 가능하다.

#### 보안 권장사항 요약

| 항목 | 권장 설정 |
|------|---------|
| JWT 만료 시간 | 1시간 (기본값 유지 권장) |
| Refresh Token 재사용 시간 | 10초 (기본값) |
| HTTP-Only 쿠키 | SSR 환경에서 필수 |
| CAPTCHA | 회원가입/로그인에 적용 권장 |
| Rate Limiting | 프로덕션에서 커스텀 설정 검토 |
| MFA | 민감 데이터 접근 시 aal2 요구 |
| RLS | 모든 테이블에 반드시 활성화 |
| Service Role Key | 서버 측에서만 사용, 절대 클라이언트 노출 금지 |

---

## 참고 자료

- [Supabase Auth 공식 문서](https://supabase.com/docs/guides/auth)
- [GoTrue GitHub 저장소](https://github.com/supabase/auth)
- [JWT 클레임 레퍼런스](https://supabase.com/docs/guides/auth/jwt-fields)
- [Auth 아키텍처](https://supabase.com/docs/guides/auth/architecture)
- [RLS 문서](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [PKCE 플로우](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- [Next.js SSR Auth 설정](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [MFA TOTP 문서](https://supabase.com/docs/guides/auth/auth-mfa/totp)
- [이메일 템플릿](https://supabase.com/docs/guides/auth/auth-email-templates)
- [CAPTCHA 설정](https://supabase.com/docs/guides/auth/auth-captcha)
- [계정 연결 (Identity Linking)](https://supabase.com/docs/guides/auth/auth-identity-linking)
- [SAML SSO](https://supabase.com/docs/guides/auth/enterprise-sso/auth-sso-saml)
- [소셜 로그인 목록](https://supabase.com/docs/guides/auth/social-login)
- [Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook)
- [Redirect URL 설정](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase 가격 정책](https://supabase.com/pricing)
- [MAU 사용량 관리](https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users)
