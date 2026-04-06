# 인증 서비스 비교: Supabase Auth vs Clerk vs Auth0

> 작성일: 2026-04-06  
> 목적: 양평 부엌 서버 대시보드 및 향후 프로젝트의 인증 서비스 선택 의사결정 가이드

---

## 목차

1. [서비스 개요 및 포지셔닝](#1-서비스-개요-및-포지셔닝)
2. [아키텍처](#2-아키텍처)
3. [기능 비교](#3-기능-비교)
4. [Next.js / React 통합](#4-nextjs--react-통합)
5. [가격](#5-가격)
6. [개발자 경험 (DX)](#6-개발자-경험-dx)
7. [보안](#7-보안)
8. [의사결정 가이드](#8-의사결정-가이드)
9. [7항목 스코어링](#9-7항목-스코어링)

---

## 1. 서비스 개요 및 포지셔닝

### 1.1 Supabase Auth

Supabase Auth는 Supabase 플랫폼에 내장된 인증 모듈로, GoTrue(오픈소스 인증 서버) 기반 위에 구축되었다. PostgreSQL의 Row Level Security(RLS)와 네이티브로 통합되어 "DB 인증"과 "앱 인증"이 동일한 레이어에서 작동한다.

- **유형**: 내장형(Built-in) 인증, Supabase 패키지의 일부
- **포지셔닝**: "PostgreSQL + Auth 일체형" — DB 접근 제어와 앱 인증을 하나의 시스템으로
- **인증 서버**: GoTrue (오픈소스, MIT 라이선스)
- **강점**: Supabase DB와의 완벽한 통합, 저렴한 MAU 비용, RLS 기반 데이터 보안
- **약점**: 사전 빌드된 UI 컴포넌트 없음, 엔터프라이즈 기능 제한 (SSO는 Team 플랜 이상)

### 1.2 Clerk

Clerk는 2021년 설립된 전문 인증/사용자 관리 서비스다. Next.js, React에 특화된 DX를 최우선으로 설계하였으며, 사전 빌드된 UI 컴포넌트와 완전한 사용자 관리 시스템을 제공한다. 2026년 3월 Core 3를 출시하며 성능과 아키텍처를 대폭 개선했다.

- **유형**: 전문 인증/사용자 관리 SaaS
- **포지셔닝**: "개발자 친화적 인증 + 사용자 관리" — 완성된 UX, 최소한의 코드
- **강점**: Next.js/React App Router 완벽 지원, 완성도 높은 UI 컴포넌트, 조직/팀 관리
- **약점**: 고트래픽 시 비용 급증, DB와의 연동은 직접 구현 필요

### 1.3 Auth0

Auth0는 2013년 설립되어 2021년 Okta가 65억 달러에 인수한 엔터프라이즈급 인증 플랫폼이다. B2C와 B2B 두 가지 모드를 모두 지원하며, 수백 개의 소셜 커넥터, SAML, LDAP, 기업용 IdP 통합 등 엔터프라이즈 기능의 깊이가 가장 깊다.

- **유형**: 엔터프라이즈급 CIAM(Customer Identity & Access Management) 플랫폼
- **포지셔닝**: "엔터프라이즈 인증 표준" — 컴플라이언스, SSO, 복잡한 인증 플로우
- **강점**: 업계 최고 수준의 엔터프라이즈 기능, 컴플라이언스(SOC2, HIPAA, ISO27001), 300+ 커넥터
- **약점**: 스타트업에게 가격 부담, DX가 Clerk 대비 복잡, UI 컴포넌트 커스터마이징 제한

---

## 2. 아키텍처

### 2.1 호스팅 모델

| 항목 | Supabase Auth | Clerk | Auth0 |
|------|--------------|-------|-------|
| 호스팅 방식 | 멀티테넌트 클라우드 (+ 자체 호스팅 가능) | 멀티테넌트 클라우드 전용 | 멀티테넌트 클라우드 + Private Cloud |
| 자체 호스팅 | 예 (오픈소스) | 아니요 | 엔터프라이즈만 (Private Cloud) |
| 데이터 저장 위치 | Supabase DB (PostgreSQL) | Clerk 클라우드 | Auth0/Okta 클라우드 |
| 데이터 소유권 | 개발자 (PostgreSQL) | Auth0/Clerk | Auth0/Okta |
| 리전 선택 | 프로젝트 리전과 동일 | 자동 (일부 리전 선택) | 데이터 레지던시 플랜 |

**핵심 차이**: Supabase Auth는 사용자 데이터가 **개발자 소유의 PostgreSQL에 저장**된다. `auth.users` 테이블에 직접 접근 가능하고, RLS 정책으로 데이터 접근을 제어할 수 있다. Clerk와 Auth0는 사용자 데이터가 해당 서비스의 클라우드에 저장된다.

### 2.2 아키텍처 다이어그램

#### Supabase Auth 아키텍처

```
[클라이언트]
     │
     ├── supabase.auth.signInWithPassword()  ← JS SDK
     │
     ▼
[Supabase Auth 서버 (GoTrue)]
     │  JWT 발급 (RS256)
     ▼
[PostgreSQL]
     ├── auth.users         ← 사용자 테이블
     ├── auth.sessions      ← 세션 테이블
     └── public.profiles    ← 앱 사용자 데이터 (RLS 적용)

[Row Level Security]
     → JWT의 user_id가 RLS 정책에서 auth.uid()로 사용됨
     → DB 레벨에서 사용자별 데이터 격리
```

#### Clerk 아키텍처

```
[클라이언트 (Next.js)]
     │
     ├── <SignIn /> 컴포넌트  ← 사전 빌드 UI
     ├── useAuth() 훅
     ├── auth() 서버 함수
     │
     ▼
[Clerk 클라우드 (FAPI)]
     │  세션 토큰 발급
     ▼
[Handshake 시스템]  ← Core 2 도입, 2-5x 성능 향상
     │
     ├── 클라이언트 세션 동기화
     └── 서버 컴포넌트 세션 전달 (쿠키)

[개발자 백엔드]
     ├── clerkMiddleware() ← 모든 요청 인터셉트
     └── auth().userId → 자체 DB 조회
```

#### Auth0 아키텍처

```
[클라이언트 (Next.js)]
     │
     ├── /auth/login  (자동 생성 라우트)
     ├── /auth/logout
     ├── /auth/callback
     │
     ▼
[Auth0 Authorization Server]
     │  OIDC/OAuth2 표준 플로우
     │  ├── Universal Login Page (호스팅된 로그인 페이지)
     │  └── 커스텀 도메인 지원
     ▼
[Auth0 테넌트]
     ├── User Store (Auth0 클라우드)
     ├── Actions/Rules (커스텀 로직)
     └── Connections (Social, Enterprise SAML, LDAP 등)

[개발자 백엔드]
     └── @auth0/nextjs-auth0 세션 관리
```

### 2.3 세션 관리 방식

| 항목 | Supabase Auth | Clerk | Auth0 |
|------|--------------|-------|-------|
| 세션 저장 | HTTP-only 쿠키 + localStorage | HTTP-only 쿠키 | HTTP-only 쿠키 |
| 토큰 방식 | JWT (RS256) | JWT (세션 토큰) | OIDC/JWT (RS256) |
| 토큰 만료 | 기본 1시간 (설정 가능) | 자동 갱신 | 기본 24시간 |
| 리프레시 토큰 | 예 | 예 | 예 |
| SSR 지원 | @supabase/ssr 패키지 | 기본 지원 | @auth0/nextjs-auth0 |
| Edge Runtime | 제한적 | 예 | 예 |

### 2.4 커스터마이징 깊이

**Supabase Auth**: 
- 커스텀 이메일 템플릿 (HTML)
- 커스텀 SMTP 서버 연결
- 커스텀 훅(Hooks)으로 로그인 전/후 로직 삽입
- Auth UI 컴포넌트 없음 → 완전한 커스텀 UI 구현 필요

**Clerk**:
- 외관(Appearance) API로 컴포넌트 스타일 100% 커스터마이징
- 사전 빌드 컴포넌트를 완전히 대체하는 커스텀 플로우 지원
- 이메일/SMS 템플릿 커스터마이징
- 사용자 메타데이터 + 공개/비공개 메타데이터 지원

**Auth0**:
- Universal Login Page 완전 커스터마이징 (HTML/CSS/JS)
- New Universal Experience (현대적 UI)
- Actions/Rules로 인증 파이프라인에 커스텀 로직 삽입
- 엔터프라이즈 SSO 커넥터 세부 설정

---

## 3. 기능 비교

### 3.1 소셜 로그인 (OAuth 2.0)

| 제공자 | Supabase Auth | Clerk | Auth0 |
|--------|--------------|-------|-------|
| Google | 예 | 예 | 예 |
| GitHub | 예 | 예 | 예 |
| Facebook | 예 | 예 | 예 |
| Apple | 예 | 예 | 예 |
| Twitter/X | 예 | 예 | 예 |
| Microsoft | 예 | 예 | 예 |
| LinkedIn | 예 | 예 | 예 |
| Kakao | 아니요 | 아니요 | 예 (커스텀 커넥터) |
| Naver | 아니요 | 아니요 | 예 (커스텀 커넥터) |
| 총 제공자 수 | 20+ | 20+ | 300+ |
| 커스텀 OAuth | 예 | 예 | 예 |
| SAML | 아니요 (OIDC만) | Enterprise 플랜 | 예 (모든 플랜) |

**Auth0의 압도적 우위**: 300개 이상의 사전 구성된 소셜/엔터프라이즈 커넥터를 보유한다. 카카오, 네이버 같은 한국 소셜 로그인도 커스텀 커넥터로 구현 가능하다.

### 3.2 MFA (다중 인증)

| MFA 방법 | Supabase Auth | Clerk | Auth0 |
|---------|--------------|-------|-------|
| TOTP (Google Authenticator 등) | 예 | 예 | 예 |
| SMS OTP | 예 | 예 | 예 |
| 이메일 OTP | 예 | 예 | 예 |
| WebAuthn/Passkey | 예 (2024 추가) | 예 (기본 내장) | 예 |
| 푸시 알림 (Duo 등) | 아니요 | 아니요 | 예 |
| 생체 인식 | WebAuthn 통해 | 예 | 예 |
| MFA 강제 정책 | 제한적 | 예 (조직별) | 예 (정책 기반) |
| 적응형 MFA | 아니요 | 아니요 | 예 (리스크 기반) |
| 복구 코드 | 예 | 예 | 예 |

**Auth0의 적응형 MFA**: 로그인 위치, 디바이스, 행동 패턴을 분석하여 리스크가 높을 때만 MFA를 요구하는 스마트 인증. Clerk와 Supabase에는 없는 기능이다.

### 3.3 SSO (Single Sign-On)

| SSO 기능 | Supabase Auth | Clerk | Auth0 |
|---------|--------------|-------|-------|
| SAML 2.0 | 아니요 | 예 (Enterprise) | 예 (Essentials+) |
| OIDC | 예 | 예 | 예 |
| LDAP | 아니요 | 아니요 | 예 |
| Active Directory | 아니요 | 아니요 | 예 |
| Okta 통합 | 아니요 | 아니요 | 예 (동일 회사) |
| Azure AD | 아니요 | 예 (Enterprise) | 예 |
| Google Workspace | 예 (OIDC) | 예 | 예 |
| Ping Identity | 아니요 | 아니요 | 예 |

Supabase Auth는 Team 플랜 이상에서 SAML SSO를 지원한다 (월 $599). 스타트업에게는 과도한 비용일 수 있다.

### 3.4 비밀번호 없는 인증 (Passwordless)

| 방법 | Supabase Auth | Clerk | Auth0 |
|------|--------------|-------|-------|
| 매직 링크 (이메일) | 예 | 예 | 예 |
| OTP (이메일) | 예 | 예 | 예 |
| OTP (SMS) | 예 | 예 | 예 |
| Passkey (WebAuthn) | 예 | 예 (기본 강조) | 예 |
| 소셜 로그인 (Passwordless) | 예 | 예 | 예 |
| WhatsApp OTP | 아니요 | 아니요 | 예 |

Clerk는 **Passkey를 핵심 기능으로 강조**하며, 설정 없이 바로 사용 가능하다. 사용자는 비밀번호 없이 Touch ID, Face ID, Windows Hello 등으로 로그인할 수 있다.

### 3.5 사용자 관리 UI

| 기능 | Supabase Auth | Clerk | Auth0 |
|------|--------------|-------|-------|
| 관리자 대시보드 | Supabase Studio | Clerk Dashboard | Auth0 Dashboard |
| 사용자 목록/검색 | 예 (Studio) | 예 (고급 필터) | 예 |
| 사용자 직접 편집 | 예 | 예 | 예 |
| 사용자 비활성화/삭제 | 예 | 예 | 예 |
| 프리빌트 관리 컴포넌트 | 없음 | 예 (`<UserProfile />`) | 제한적 |
| 프리빌트 로그인 UI | 없음 | 예 (`<SignIn />`) | 예 (Universal Login) |
| 사용자 임포트 | CSV 없음 | CSV 임포트 | 예 (Management API) |
| 벌크 작업 | 제한적 | 예 | 예 |

**Clerk의 가장 큰 강점**: `<SignIn />`, `<SignUp />`, `<UserButton />`, `<UserProfile />` 같은 완성도 높은 사전 빌드 컴포넌트를 코드 몇 줄로 삽입할 수 있다. 커스터마이징도 Appearance API로 자유롭다.

```tsx
// Clerk: 완성된 로그인 UI를 3줄로
import { SignIn } from "@clerk/nextjs";
export default () => <SignIn />;
```

```tsx
// Supabase: 로그인 UI를 직접 구현해야 함
const { error } = await supabase.auth.signInWithPassword({
  email, password
});
// 폼, 에러 처리, 로딩 상태 모두 직접 구현
```

### 3.6 조직/팀 관리

SaaS 앱에서 B2B 기능(조직, 팀, 역할)은 필수적이다.

| 기능 | Supabase Auth | Clerk | Auth0 |
|------|--------------|-------|-------|
| 조직(Organization) | 없음 (직접 구현) | 예 (내장) | 예 (Teams 기능) |
| 팀 초대 | 없음 | 예 | 예 |
| 역할(Role) 관리 | RLS로 구현 | 예 (커스텀 역할) | 예 (RBAC) |
| 권한(Permission) 관리 | RLS로 구현 | 예 (세분화된 권한) | 예 |
| 멤버십 관리 | 없음 | 예 | 예 |
| 다중 조직 | 없음 | 예 (무제한) | 예 |
| 조직별 SSO | 없음 | 예 (Enterprise) | 예 |
| 결제 통합 (Stripe) | 없음 | 예 (Billing 모듈) | 없음 |

**Clerk의 조직 기능**은 SaaS B2B 앱 개발 시 수백 시간을 절약해 준다. 조직 생성, 멤버 초대, 역할 할당, 멤버십 관리 등이 완전히 내장되어 있다.

Supabase Auth는 조직 기능이 없어 직접 `organizations`, `memberships` 테이블을 설계하고 RLS 정책을 작성해야 한다.

---

## 4. Next.js / React 통합

### 4.1 App Router (Next.js 13+) 지원

#### Supabase Auth (@supabase/ssr)

```typescript
// middleware.ts
import { createMiddlewareClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get, set, remove } }
  )
  // 세션 갱신 (쿠키 동기화)
  await supabase.auth.getUser()
  return response
}
```

```typescript
// app/dashboard/page.tsx (서버 컴포넌트)
import { createServerComponentClient } from '@supabase/ssr'

export default async function Dashboard() {
  const supabase = createServerComponentClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  // DB 쿼리는 사용자 JWT로 RLS 적용
  const { data } = await supabase.from('posts').select('*')
  return <div>{/* ... */}</div>
}
```

#### Clerk (@clerk/nextjs)

```typescript
// middleware.ts — 1줄로 끝
import { clerkMiddleware } from '@clerk/nextjs/server'
export default clerkMiddleware()
export const config = { matcher: ['/((?!_next|.*\\..*).*)'] }
```

```typescript
// app/dashboard/page.tsx (서버 컴포넌트)
import { auth, currentUser } from '@clerk/nextjs/server'

export default async function Dashboard() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  
  const user = await currentUser()
  return <div>안녕하세요, {user?.firstName}님</div>
}
```

```tsx
// app/sign-in/page.tsx — 사전 빌드 UI 사용
import { SignIn } from '@clerk/nextjs'
export default () => <SignIn />
```

#### Auth0 (@auth0/nextjs-auth0)

```typescript
// app/api/auth/[auth0]/route.ts — 자동 라우트 생성
import { handleAuth } from '@auth0/nextjs-auth0'
export const GET = handleAuth()
// /auth/login, /auth/logout, /auth/callback 자동 생성
```

```typescript
// middleware.ts
import { withMiddlewareAuthRequired } from '@auth0/nextjs-auth0/edge'
export default withMiddlewareAuthRequired()
```

```typescript
// app/dashboard/page.tsx (서버 컴포넌트)
import { getSession } from '@auth0/nextjs-auth0'

export default async function Dashboard() {
  const session = await getSession()
  if (!session) redirect('/auth/login')
  return <div>안녕하세요, {session.user.name}님</div>
}
```

### 4.2 미들웨어 (Edge Runtime)

| 항목 | Supabase Auth | Clerk | Auth0 |
|------|--------------|-------|-------|
| Edge Runtime 지원 | 예 (@supabase/ssr) | 예 (완전 지원) | 예 (edge 지원) |
| 미들웨어 설정 복잡도 | 중간 (쿠키 핸들러 필요) | 매우 쉬움 (1줄) | 쉬움 (withMiddlewareAuthRequired) |
| 성능 (미들웨어) | 보통 | 우수 (Handshake 시스템) | 보통 |
| 라우트 보호 | 수동 설정 | 자동 + 수동 모두 | 수동 설정 |

**Clerk의 Handshake 시스템 (Core 2 이후)**: 클라이언트와 서버 간 세션 동기화를 최적화하여 "흰 화면 깜빡임(flash of white page)" 문제를 제거했다. 2~5배 빠른 인증 실행 속도를 달성했다.

### 4.3 React Server Components (RSC) 지원

| 기능 | Supabase Auth | Clerk | Auth0 |
|------|--------------|-------|-------|
| RSC에서 사용자 정보 접근 | 예 (createServerComponentClient) | 예 (auth(), currentUser()) | 예 (getSession()) |
| 서버 액션(Server Actions)에서 | 예 | 예 | 예 |
| 클라이언트 훅 | useUser(), useSession() | useAuth(), useUser(), useOrganization() | useUser() |
| 조건부 렌더링 컴포넌트 | 없음 (직접 구현) | `<Show>` (Core 3) | 없음 |
| 로딩 상태 처리 | 직접 구현 | 내장 | 직접 구현 |

**Clerk Core 3 (2026년 3월)**: `<SignedIn>`, `<SignedOut>`, `<Protect>`를 통합한 `<Show>` 컴포넌트를 도입했다. 번들 크기도 약 50KB gzip 감소했다.

```tsx
// Clerk Core 3의 통합 Show 컴포넌트
import { Show } from '@clerk/nextjs'

export default function Navbar() {
  return (
    <Show>
      <Show.SignedIn>
        <UserButton />
      </Show.SignedIn>
      <Show.SignedOut>
        <SignInButton />
      </Show.SignedOut>
    </Show>
  )
}
```

### 4.4 Vercel 배포 통합

| 항목 | Supabase Auth | Clerk | Auth0 |
|------|--------------|-------|-------|
| Vercel 공식 통합 | 예 | 예 (1순위 추천) | 예 |
| 환경변수 자동 설정 | 예 | 예 | 예 |
| Preview 환경 지원 | 예 | 예 | 예 |
| Edge Config 활용 | 아니요 | 예 | 아니요 |

---

## 5. 가격

### 5.1 무료 티어 비교 (2026년 4월 기준)

| 항목 | Supabase Auth Free | Clerk Free | Auth0 Free |
|------|-------------------|------------|------------|
| 무료 MAU | 50,000 | 10,000 | 7,500 |
| 소셜 로그인 | 예 | 예 | 예 |
| MFA | 기본 (TOTP) | 예 | 아니요 |
| 이메일/SMS OTP | 예 | 예 | 예 |
| Passkey | 예 | 예 | 아니요 |
| 조직/팀 | 아니요 | 예 (제한) | 아니요 |
| SSO | 아니요 | 아니요 | 아니요 |
| 커스텀 도메인 | 아니요 | 아니요 | 아니요 |
| 브루트포스 방어 | 예 | 예 | 예 |
| 무료 MAU 우위 | **1위 (50K)** | 2위 (10K) | 3위 (7.5K) |

### 5.2 유료 플랜 비교

#### Supabase Auth (Supabase 플랜에 포함)

| 플랜 | 가격 | MAU 포함 | 초과 과금 | 주요 추가 기능 |
|------|------|---------|---------|--------------|
| Free | $0 | 50,000 | 비활성화됨 | - |
| Pro | $25/월 | 100,000 | $0.00325/MAU | 읽기 복제본 |
| Team | $599/월 | 확인 필요 | $0.00325/MAU | SSO, 감사 로그 |
| Enterprise | 문의 | 커스텀 | 커스텀 | HIPAA, 전용 VPC |

#### Clerk

| 플랜 | 가격 | MAU 포함 | 초과 과금 | 주요 추가 기능 |
|------|------|---------|---------|--------------|
| Free | $0 | 10,000 | 초과 시 업그레이드 | 기본 인증 |
| Pro | $25/월 (연간) / $25/월 | 50,000 MRU | $0.02/MRU (50K-100K), $0.018 (100K-1M) | 커스텀 도메인, MFA |
| Enterprise | 문의 | 커스텀 | 커스텀 | SAML SSO, HIPAA |

> **MRU (Monthly Retained Users)**: Clerk는 MAU 대신 MRU(활성 세션 보유 사용자) 기준으로 과금. 실제로는 MAU와 유사하게 계산된다.

Clerk 고트래픽 비용 시뮬레이션:
- 50,000 MRU: $25/월 (Pro 포함)
- 100,000 MRU: $25 + (50,000 × $0.02) = **$1,025/월**
- 200,000 MRU: $25 + (50,000 × $0.02) + (100,000 × $0.018) = **$2,825/월**

#### Auth0

| 플랜 | 가격 | MAU 포함 | 초과 과금 | 주요 추가 기능 |
|------|------|---------|---------|--------------|
| Free | $0 | 7,500 | 불가 (업그레이드 필요) | 기본 인증 |
| B2C Essentials | $35/월 | 500 | ~$0.07/MAU | MFA, RBAC |
| B2C Professional | $240/월 | 1,000 | 높음 | 고급 MFA, PKCE |
| B2B Essentials | $150/월 | 500 | ~$0.30/MAU | SAML, Orgs |
| Enterprise | 문의 | 커스텀 | 커스텀 | 전용 클러스터, SLA |

Auth0 "성장 패널티" 시뮬레이션 (B2C Essentials):
- 500 MAU: $35/월
- 5,000 MAU: 약 $350/월 ($0.07 × 5,000)
- 50,000 MAU: 약 $3,500/월
- 회사 성장 1.67배 → 청구서 15.54배 증가 사례 보고됨

### 5.3 MAU 당 비용 비교

| MAU 규모 | Supabase Auth | Clerk | Auth0 (B2C) |
|---------|--------------|-------|------------|
| 10,000 | $0 (Free) | $0 (Free) | $35 (유료 시작) |
| 50,000 | $0 (Free) | $25/월 | ~$3,115 |
| 100,000 | $25 + $162 = $187 | $1,025 | ~$6,615 |
| 500,000 | $25 + $1,300 = $1,325 | ~$9,000 | 엔터프라이즈 문의 |

**결론**: MAU 기준 비용은 Supabase Auth가 압도적으로 저렴하다. 단, Supabase Auth를 사용하려면 DB도 Supabase를 써야 한다.

### 5.4 숨겨진 비용 주의사항

**Clerk**:
- Pro 플랜은 연간 약정 시 할인 적용
- 조직(Organization) 기능은 유료 플랜 필요
- 2026년 2월 새로운 가격 정책 적용 → 기존 가격에서 변경됨

**Auth0**:
- MFA는 Essentials 이상에서만 지원 → 무료 티어에서 MFA 불가
- B2C와 B2B 플랜 분리 → B2B 요구사항이 있으면 비용 폭증
- SAML SSO는 별도 add-on 비용 발생 가능
- Okta 인수 이후 가격 인상 이력 (2023년 300% 인상)

**Supabase Auth**:
- Supabase DB Pro 플랜($25+)에 묶여 있음 → DB 단독 사용 불가
- SSO는 Team 플랜($599)부터 → 개별 SSO 비용으로는 매우 비쌈
- 이메일 발송은 외부 SMTP 설정 권장 (기본 제공 제한 있음)

---

## 6. 개발자 경험 (DX)

### 6.1 설치 및 초기 설정 난이도

#### Supabase Auth

```bash
npm install @supabase/supabase-js @supabase/ssr

# 환경변수
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

초기 설정: 중간 난이도. 미들웨어 설정, 쿠키 핸들러 작성, 서버/클라이언트 클라이언트 생성 방식 이해 필요. 하지만 Supabase 공식 문서가 Next.js App Router 예제를 상세히 제공한다.

#### Clerk

```bash
npm install @clerk/nextjs

# 환경변수
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
```

초기 설정: 매우 쉬움. `clerkMiddleware()` 한 줄 추가로 전체 앱 보호 완료. `<ClerkProvider>`로 래핑 후 즉시 사전 빌드 컴포넌트 사용 가능.

#### Auth0

```bash
npm install @auth0/nextjs-auth0

# 환경변수
AUTH0_SECRET=...
AUTH0_BASE_URL=...
AUTH0_ISSUER_BASE_URL=...
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...
```

초기 설정: 중간 난이도. 환경변수가 많고, OIDC 플로우 이해가 필요하다. 하지만 `handleAuth()`로 라우트 자동 생성이 편리하다.

### 6.2 문서 품질

| 항목 | Supabase Auth | Clerk | Auth0 |
|------|--------------|-------|-------|
| 전반적 문서 품질 | 우수 | 탁월 | 우수 |
| Next.js 예제 | 상세한 App Router 예제 | App Router/Pages Router 완전 커버 | 상세 |
| TypeScript 지원 문서 | 예 | 예 | 예 |
| 영상 튜토리얼 | 유튜브 공식 | 유튜브 공식 + 블로그 | 광범위 |
| 커뮤니티 | Discord 활성 | Discord 활성 | 포럼 활성 |
| 한국어 자료 | 블로그 포스트 다수 | 블로그 포스트 일부 | 블로그 포스트 일부 |
| AI 코딩 도우미 지원 | Claude/Copilot에 학습됨 | Claude/Copilot에 학습됨 | Claude/Copilot에 학습됨 |

**Clerk의 문서 특징**: 공식 문서 내에서 직접 경쟁사(Supabase Auth, Auth0, NextAuth)와의 비교 문서를 제공한다. 마케팅 목적이 있지만 실제로 유용한 비교 정보를 제공한다.

### 6.3 사전 빌드 UI 컴포넌트

**Clerk — 가장 완성도 높은 UI 컴포넌트**

```tsx
// 로그인 페이지
<SignIn 
  appearance={{
    elements: {
      formButtonPrimary: 'bg-blue-600 hover:bg-blue-700',
      card: 'shadow-lg',
    }
  }}
/>

// 회원가입 페이지
<SignUp />

// 프로필 수정 팝업 버튼
<UserButton />

// 사용자 프로필 전체 페이지
<UserProfile />

// 조직 생성
<CreateOrganization />

// 조직 프로필
<OrganizationProfile />
```

**Auth0 — Universal Login Page**

Auth0는 자체 호스팅 로그인 페이지(Universal Login)를 제공한다. 개발자가 임베딩하는 컴포넌트가 아니라, Auth0 도메인으로 리디렉션되는 방식이다. 완전한 커스터마이징이 가능하지만 사용자가 잠깐 Auth0 도메인으로 이동한다.

**Supabase Auth — UI 컴포넌트 없음**

공식 UI 컴포넌트를 제공하지 않는다. `@supabase/auth-ui-react` 패키지가 있으나 현재 유지보수 상태가 불안정하다. 대부분의 프로젝트에서 로그인 폼을 직접 구현하거나 react-hook-form 등을 활용한다.

### 6.4 SDK 및 API 품질

| 항목 | Supabase Auth | Clerk | Auth0 |
|------|--------------|-------|-------|
| TypeScript 지원 | 완전한 타입 | 완전한 타입 | 완전한 타입 |
| 번들 크기 | 중간 | 중간 (Core 3에서 ~50KB 감소) | 중간~큼 |
| 에러 처리 | 명시적 (에러 객체 반환) | 예외 기반 | 예외 기반 |
| API 안정성 | 안정적 | Core 2→3 변경 있었음 | 안정적 |
| React Native 지원 | 예 | 예 | 예 |
| 비 JS 언어 SDK | Python, Swift, Flutter, Kotlin | 없음 (JS/TS 전용) | 50+ 언어 |

---

## 7. 보안

### 7.1 컴플라이언스 인증

| 인증 | Supabase Auth | Clerk | Auth0 |
|------|--------------|-------|-------|
| SOC 2 Type II | 예 | 예 | 예 |
| ISO 27001 | 예 | 아니요 (미확인) | 예 (27001/27017/27018) |
| HIPAA | Enterprise | 제한적 | 예 (BAA 제공) |
| GDPR | 예 | 예 | 예 |
| PCI DSS | 아니요 | 아니요 | 예 |
| FedRAMP | 아니요 | 아니요 | Enterprise |
| CSA STAR | 아니요 | 아니요 | 예 |

**Auth0는 컴플라이언스 측면에서 압도적**: Okta 인수 이후 Okta의 인증 체계를 물려받아 가장 광범위한 컴플라이언스 커버리지를 갖는다. 의료(HIPAA), 금융(PCI DSS), 정부(FedRAMP) 등 규제 산업에서는 Auth0가 거의 유일한 선택지다.

### 7.2 브루트포스 방어

| 방어 기능 | Supabase Auth | Clerk | Auth0 |
|---------|--------------|-------|-------|
| Rate Limiting | 예 (IP 기반) | 예 | 예 |
| IP 차단 | 제한적 | 예 | 예 |
| 계정 잠금 | 예 (설정 가능) | 예 | 예 |
| CAPTCHA | 예 (hCaptcha) | 예 (Turnstile) | 예 |
| 의심스러운 로그인 탐지 | 기본 | 예 | 예 (Attack Protection) |

**Auth0 Attack Protection**: 
- 브루트포스 방어
- 비정상적 IP 탐지
- 유출된 비밀번호 탐지 (HaveIBeenPwned 데이터베이스 연동)
- 봇 탐지
- 적응형 MFA (리스크 기반 자동 MFA 요청)

### 7.3 봇 탐지

| 기능 | Supabase Auth | Clerk | Auth0 |
|------|--------------|-------|-------|
| 봇 탐지 | 기본 (CAPTCHA) | 예 (자동) | 예 (Bot Detection add-on) |
- **Clerk**: 기본 내장. 별도 설정 없이 자동으로 봇 트래픽 필터링
- **Auth0**: Bot Detection은 별도 add-on, 고급 플랜 필요
- **Supabase**: hCaptcha 통합으로 구현 가능하나 수동 설정 필요

### 7.4 비밀번호 보안

| 항목 | Supabase Auth | Clerk | Auth0 |
|------|--------------|-------|-------|
| bcrypt 해싱 | 예 | 예 | 예 |
| 유출 비밀번호 탐지 | 아니요 | 예 (Breach Monitoring) | 예 (HaveIBeenPwned) |
| 비밀번호 강도 정책 | 기본 설정 | 예 (커스터마이징 가능) | 예 (정책 기반) |
| 비밀번호 재사용 방지 | 아니요 | 아니요 | 예 |
| 순환 정책 (만료) | 아니요 | 아니요 | 예 |

**Clerk의 Breach Monitoring**: 사용자가 이미 알려진 데이터 유출에 포함된 비밀번호를 사용하려 할 때 자동으로 경고하고 차단한다. 별도 설정 없이 자동으로 활성화된다.

### 7.5 감사 로그 (Audit Logs)

| 항목 | Supabase Auth | Clerk | Auth0 |
|------|--------------|-------|-------|
| 감사 로그 제공 | Team 플랜 이상 | Pro 플랜 | 모든 유료 플랜 |
| 로그 보관 기간 | 제한적 | 90일 | 30일 (기본) |
| 로그 내보내기 | 예 | 예 | 예 |
| SIEM 통합 | 제한적 | 아니요 | 예 (다양한 SIEM) |
| 실시간 스트리밍 | 아니요 | 아니요 | 예 (Log Streaming) |

---

## 8. 의사결정 가이드

### 8.1 Supabase Auth를 선택해야 하는 경우

**적합한 상황**:
- **이미 Supabase DB 사용 중**: DB와 인증을 동일한 플랫폼에서 관리하면 RLS로 자연스러운 데이터 보안이 구현된다.
- **대규모 MAU, 비용 민감**: 100K MAU까지 $25 + α면 다른 서비스와 비교해 압도적으로 저렴하다.
- **PostgreSQL RLS 활용**: 사용자별 데이터 접근 제어를 DB 레이어에서 처리하고 싶을 때.
- **오픈소스 선호/자체 호스팅**: GoTrue를 자체 서버에서 실행할 수 있다.
- **국내 스타트업 일반 B2C**: 소셜 로그인, OTP, Passkey로 충분한 일반 앱.
- **풀스택 BaaS를 최소 비용으로**: $25/월에 DB + Auth + Storage 모두 해결.

**부적합한 상황**:
- 빠른 UI 프로토타이핑이 필요한 경우 (사전 빌드 UI 컴포넌트 없음)
- B2B SaaS에서 조직/팀 기능이 중요한 경우 (직접 구현 비용)
- SAML SSO가 필요한 중소 규모 ($599/월 Team 플랜은 과도)
- 규제 산업(의료, 금융)의 고급 컴플라이언스가 필요한 경우

### 8.2 Clerk를 선택해야 하는 경우

**적합한 상황**:
- **Next.js/React App Router 최우선**: 업계 최고의 Next.js DX, 1순위 추천
- **B2B SaaS 개발**: 조직, 팀, 역할, 멤버십 관리가 즉시 필요할 때 수백 시간 절약
- **빠른 프로토타이핑**: `<SignIn />` 컴포넌트 하나로 완성된 로그인 UI
- **인증에 시간을 쏟기 싫은 팀**: 최소한의 코드로 최대한의 기능
- **MAU 10K 이하 소규모**: 무료 티어가 Supabase(50K) 다음으로 비용 효율적
- **Passkey/WebAuthn 핵심 기능**: 최고 수준의 Passkey 지원
- **Stripe 결제 통합**: Clerk Billing 모듈로 인증+결제 일체 관리

**부적합한 상황**:
- 고트래픽(100K+ MAU): 비용이 급격히 증가함
- MySQL/비 JS 백엔드: JS/TS 전용 SDK
- 규제 산업 컴플라이언스: HIPAA/PCI DSS 지원 미흡
- 비용 예측 가능성 중시: MAU 기반 변동 비용이 부담스러운 경우

### 8.3 Auth0를 선택해야 하는 경우

**적합한 상황**:
- **엔터프라이즈 B2B**: SAML, LDAP, Active Directory, 기업 SSO 필수
- **규제 산업**: HIPAA(의료), PCI DSS(금융), FedRAMP(정부) 컴플라이언스 요구
- **복잡한 인증 플로우**: Actions/Rules로 커스텀 인증 파이프라인 구성
- **300+ 소셜/엔터프라이즈 커넥터**: 광범위한 IdP 연동 필요
- **고급 보안**: 적응형 MFA, 봇 탐지, 이상 탐지, 공격 방어
- **다언어 백엔드**: 50+ 언어 SDK 지원 (Java, Python, Go, Ruby, .NET 등)
- **Okta 생태계 통합**: 이미 Okta를 사용하는 기업

**부적합한 상황**:
- 스타트업/소규모 (비용 급증 패턴)
- 일반 B2C 앱 (기능 과잉, 비용 과다)
- 빠른 MVP 개발 (설정 복잡성)
- 100K 미만 MAU (Supabase/Clerk 대비 ROI 없음)

### 8.4 비교 요약 매트릭스

| 사용 케이스 | 최선 선택 | 차선 | 비고 |
|-----------|---------|------|------|
| Next.js 스타트업 (일반 B2C) | Supabase Auth | Clerk | MAU 비용, Supabase DB 연동 |
| Next.js B2B SaaS, 조직 필요 | Clerk | Supabase + 자체 구현 | 조직 기능 내장 |
| 엔터프라이즈, SAML SSO | Auth0 | Clerk Enterprise | SAML 깊이 |
| 빠른 MVP, UI 컴포넌트 | Clerk | Supabase (Auth UI) | DX 최우선 |
| 규제 산업 (의료/금융) | Auth0 | - | 컴플라이언스 유일 선택 |
| 비용 최소화 (대규모 MAU) | Supabase Auth | Neon + 직접 구현 | MAU 당 최저 비용 |
| 복잡한 인증 파이프라인 | Auth0 | - | Actions/Rules |
| Passkey / WebAuthn 중심 | Clerk | Supabase Auth | 가장 자연스러운 UX |
| 자체 호스팅 | Supabase Auth | - | GoTrue 오픈소스 |

### 8.5 혼합 전략

일부 팀은 두 서비스를 조합해서 사용한다:

**Supabase DB + Clerk Auth**: 
- Supabase의 저렴한 DB + Clerk의 완성도 높은 UI/조직 기능
- Clerk JWT를 Supabase RLS와 연동하는 커스텀 설정 필요
- `SUPABASE_JWT_SECRET`를 Clerk의 커스텀 JWT 템플릿으로 사용

**Neon DB + Clerk Auth**:
- 서버리스 DB + 전문 인증 서비스의 조합
- Vercel 배포 환경에서 최적의 서버리스 스택
- 각 서비스를 독립적으로 스케일 가능

---

## 9. 7항목 스코어링

> 1점 = 매우 부족, 5점 = 최고 수준

### 9.1 스코어카드

| 항목 | 가중치 | Supabase Auth | Clerk | Auth0 |
|------|--------|--------------|-------|-------|
| **기능 풍부성** | 20% | 3 | 4 | 5 |
| **개발자 경험 (DX)** | 20% | 3 | 5 | 3 |
| **Next.js/React 통합** | 15% | 4 | 5 | 4 |
| **가격 효율성** | 15% | 5 | 3 | 1 |
| **보안 및 컴플라이언스** | 15% | 3 | 4 | 5 |
| **UI/UX 컴포넌트** | 10% | 1 | 5 | 3 |
| **생태계/지속성** | 5% | 5 | 4 | 4 |

### 9.2 가중치 적용 총점

| 서비스 | 가중 평균 |
|--------|---------|
| Supabase Auth | **3.40** |
| Clerk | **4.20** |
| Auth0 | **3.55** |

### 9.3 항목별 세부 평가

**기능 풍부성**
- Auth0 (5): 300+ 커넥터, 적응형 MFA, SAML, LDAP, Active Directory, Actions/Rules. 인증 기능의 완전한 집합.
- Clerk (4): 소셜 로그인, Passkey, 조직/팀, RBAC, 결제 통합. 현대적 SaaS에 필요한 기능 모두 제공.
- Supabase Auth (3): 기본적인 인증 기능은 충족. 조직 관리, SSO, 고급 MFA 등 고급 기능 부재.

**개발자 경험 (DX)**
- Clerk (5): Next.js 1순위 추천. 사전 빌드 컴포넌트, 직관적 API, 탁월한 문서. 설정 1줄로 시작 가능.
- Supabase Auth (3): 좋은 문서와 로컬 에뮬레이션. 하지만 UI 컴포넌트 없음, 미들웨어 설정 복잡.
- Auth0 (3): 광범위한 문서. 하지만 설정 복잡도 높고, OIDC/OAuth2 개념 이해 필요.

**Next.js/React 통합**
- Clerk (5): App Router 완벽 지원, RSC 네이티브 헬퍼, Edge Runtime, Handshake 세션 동기화.
- Supabase Auth (4): @supabase/ssr로 App Router 지원. 쿠키 핸들러 설정 후 잘 작동.
- Auth0 (4): @auth0/nextjs-auth0으로 자동 라우트 생성. App Router 지원하나 Clerk 대비 설정 복잡.

**가격 효율성**
- Supabase Auth (5): 50K MAU 무료. 100K MAU에 $25/월. MAU 당 최저 비용.
- Clerk (3): 10K MAU 무료. 고트래픽 시 비용 급증. 50K MAU에 $25/월은 합리적이나 그 이상에서 급등.
- Auth0 (1): 7.5K MAU에서 유료 시작. 고트래픽 시 "성장 패널티"로 비용 폭발. 스타트업 생존 위협 수준.

**보안 및 컴플라이언스**
- Auth0 (5): SOC2, ISO27001, HIPAA, PCI DSS, 적응형 MFA, 봇 탐지. 규제 산업의 표준 선택.
- Clerk (4): SOC2, 자동 봇 탐지, Breach Monitoring, Passkey. 일반 앱에는 충분한 수준.
- Supabase Auth (3): SOC2, 기본 보안 기능. 고급 보안 기능 부재. RLS로 데이터 보안은 강점.

**UI/UX 컴포넌트**
- Clerk (5): 가장 완성도 높은 사전 빌드 컴포넌트. Appearance API로 완전한 커스터마이징. 업계 표준.
- Auth0 (3): Universal Login Page(호스팅 로그인). 커스터마이징 가능하나 자체 도메인 리디렉션 방식.
- Supabase Auth (1): 공식 UI 컴포넌트 없음. @supabase/auth-ui-react는 유지보수 상태 불안정.

**생태계/지속성**
- Supabase Auth (5): 1M+ 사용자, 강력한 오픈소스 커뮤니티, 충분한 투자, GoTrue 자체 호스팅 옵션.
- Auth0 (4): Okta($43B 시장가) 산하로 재정 안정. 단, Okta 전략과의 제품 방향 갈등 리스크.
- Clerk (4): 빠른 성장, 충분한 VC 투자. 2026년 2월 가격 정책 변경 이력 — 향후 변경 리스크 존재.

---

## 부록 A: 빠른 선택 도구

다음 질문에 답하여 최적의 서비스를 찾으세요:

```
1. HIPAA/PCI DSS/FedRAMP 컴플라이언스가 필요한가?
   YES → Auth0 (유일한 선택)

2. Supabase DB를 이미 사용하거나 사용할 예정인가?
   YES → Supabase Auth (비용 효율 + RLS 통합)

3. B2B SaaS에서 조직/팀 관리가 핵심 기능인가?
   YES → Clerk (조직 기능 내장)

4. 빠른 프로토타이핑, 완성된 UI가 필요한가?
   YES → Clerk (<SignIn /> 한 줄)

5. 100K+ MAU를 예상하고 비용이 최우선인가?
   YES → Supabase Auth (MAU 당 최저 비용)

6. Next.js App Router에서 최고의 DX를 원하는가?
   YES → Clerk (업계 1위)

기본값: Supabase Auth (Next.js + Supabase 스택의 자연스러운 선택)
```

## 부록 B: 한국 서비스 고려사항

- **카카오/네이버 로그인**: 세 서비스 모두 기본 제공하지 않음. Auth0의 커스텀 커넥터로 구현 가능. Supabase Auth와 Clerk는 커스텀 OAuth 공급자 추가로 구현 가능.
- **SMS OTP (한국 번호)**: 세 서비스 모두 Twilio/AWS SNS 연동. 한국 번호(+82) 지원됨.
- **개인정보보호법 (PIPA)**: 국내 규정에 따른 데이터 처리는 리전 선택 중요. Supabase Auth는 사용자 데이터가 개발자 PostgreSQL에 저장되어 가장 높은 통제권 보장.

---

*Sources:*
- [Clerk vs Auth0 vs Supabase: Pricing & DX Compared - DesignRevision](https://designrevision.com/blog/auth-providers-compared)
- [Clerk Auth Review 2026 - BuildPilot](https://trybuildpilot.com/453-clerk-auth-review-2026)
- [Auth0 Pricing Explained - Security Boulevard](https://securityboulevard.com/2025/09/auth0-pricing-explained-and-why-startups-call-it-a-growth-penalty/)
- [Auth0 Pricing 2026 - auth0pricing.com](http://www.auth0pricing.com/)
- [Clerk vs Auth0 for Next.js - Clerk Official](https://clerk.com/articles/clerk-vs-auth0-for-nextjs)
- [Supabase Manage MAU - Supabase Docs](https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users)
- [Auth0 Data Privacy and Compliance - Auth0 Docs](https://auth0.com/docs/secure/data-privacy-and-compliance)
- [Complete Authentication Guide for Next.js App Router 2025 - Clerk](https://clerk.com/articles/complete-authentication-guide-for-nextjs-app-router)
- [Better Auth vs Clerk vs NextAuth 2026 - StarterPick](https://starterpick.com/blog/better-auth-clerk-nextauth-saas-showdown-2026)
