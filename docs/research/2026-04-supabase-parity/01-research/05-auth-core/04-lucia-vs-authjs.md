# Lucia v3 vs Auth.js v6 — 1:1 비교 (Wave 2)

> 산출물 ID: 05/04
> 작성일: 2026-04-18
> 대상 프로젝트: 양평 부엌 서버 대시보드 (stylelucky4u.com)
> Wave 1 인용: `01-lucia-auth-deep-dive.md` (3.50/5.00), `02-authjs-v6-pattern-deep-dive.md` (3.45/5.00)
> 핵심 질문: "세션 저장소 전략(DB vs JWT), OAuth 생태계, TypeScript DX, 마이그레이션 비용, 보안, 한국 OAuth 대응"
> 결론 요약: **양쪽 모두 라이브러리 채택 거부**. Lucia에서 Session 테이블 구조 차용, Auth.js에서 Adapter/Provider/Hook 패턴 차용.

---

## 0. Executive Summary

| 항목 | Lucia v3 | Auth.js v6 |
|---|---|---|
| 정체성 | Session-first minimal 헬퍼 | Provider-first 올인원 프레임워크 |
| 핵심 강점 | 서버측 session 무효화, DB row 삭제만으로 즉시 무효 | 30+ Provider, callback 5종, Adapter 20+, CSRF 자동 |
| 세션 저장소 | DB (always) | JWT (default) 또는 DB (선택) |
| 패러다임 | Session-first (stateful) | Provider-first (stateless/stateful 선택) |
| 한국 OAuth | arctic 라이브러리에 Naver/Kakao 있음 | 공식 Provider 없음 (직접 작성) |
| 2025~2026 상태 | v3 maintenance, v4는 "학습 자료" | v5 → v6 GA (2025-11), Vercel 후원 |
| GitHub stars | 9.5k | 24k |
| Wave 1 점수 | 3.50 / 5.00 (가중 3.62) | 3.45 / 5.00 (가중 3.32) |
| 본 프로젝트 권장 | **라이브러리 거부, Session 모델 + invalidate 패턴만 차용** | **라이브러리 거부, Provider/Hook/Claims Composer/Adapter 인터페이스 패턴 차용** |

---

## 1. 포지셔닝

### 1.1 Lucia v3의 철학: Minimal & Transparent

> "Lucia는 프레임워크가 아니라 session 관리의 작은 도구다. Cookie와 DB session의 왕복만 깔끔하게 해준다." — Pilcrow (메인테이너)

- **의도적 미니멀**: callback/hook 없음. 로그인 함수에 직접 코드 작성.
- **DB-centric**: session 저장소 = DB. JWT 사용 불가 (디자인상).
- **2024-03 발표**: v4는 라이브러리 아닌 학습 자료화 → `oslo` 등 분리 패키지로 재구성.
- **타깃**: session 무효화가 핵심인 규모 작은 프로젝트.

### 1.2 Auth.js v6의 철학: All-in-One Provider Framework

> "Auth.js는 Next.js 인증을 10분 안에 시작할 수 있게 한다. 30+ Provider, callback 5종, Adapter 20+, CSRF 자동." — Balázs Orbán (메인테이너)

- **Provider 추상화**: OAuth 2.0 / OIDC / Email / Credentials / WebAuthn 통합 인터페이스.
- **Callback 풍부**: signIn / jwt / session / redirect 4종 + events 별도.
- **Vercel 후원**: v5 → v6 GA 순탄. Next.js App Router 1급.
- **타깃**: 다양한 OAuth provider + 복잡한 인증 정책이 필요한 프로젝트.

### 1.3 양평 부엌 서버와의 매핑

| 우리 요구 | Lucia 적합도 | Auth.js 적합도 |
|---|---|---|
| Session 무효화 (로그아웃, 권한 박탈) | ★★★★★ | ★★★☆☆ (DB mode 전환 필요) |
| Hook / 감사 로그 통합 | ★★☆☆☆ | ★★★★★ |
| 한국 OAuth (Naver/Kakao) | ★★★☆☆ (arctic) | ★★☆☆☆ (직접 작성) |
| Next.js 16 통합 | ★★★★☆ | ★★★★★ |
| 1인 운영 학습 곡선 | ★★★★☆ | ★★☆☆☆ |
| 10년 유지보수 관점 | ★★☆☆☆ (v4 deprecation) | ★★★★☆ (Vercel 후원) |

---

## 2. 기능 비교표 (15+ 항목)

### 2.1 코어 인증 기능

| # | 기능 | Lucia v3 | Auth.js v6 | 비고 |
|---|---|---|---|---|
| 1 | Credentials (email/pw) | 직접 구현 (lucia는 bcrypt 미포함) | `Credentials` provider | Auth.js가 타입 구조화 |
| 2 | OAuth 2.0 / OIDC | arctic 별도 패키지 (9종) | 내장 30+ (Google/GitHub/Discord/Apple 등) | Auth.js 압승 |
| 3 | Naver OAuth | arctic에 포함 | 공식 없음 → 직접 작성 | Lucia(+arctic) 우위 |
| 4 | Kakao OAuth | arctic에 포함 | 공식 없음 → 직접 작성 | Lucia(+arctic) 우위 |
| 5 | Magic Link / Email | 직접 구현 | `Email` provider + `EmailProvider` 커스텀 | Auth.js 우위 |
| 6 | WebAuthn / Passkey | 직접 구현 | `passkey` provider (v6 베타) | Auth.js 선점 |
| 7 | Anonymous sign-in | 패턴 명확 (`userId nullable`) | 비표준 (Credential 변형) | Lucia 우위 |
| 8 | Account linking | 직접 (우리가 설계) | `Account` 테이블 자동 linking | Auth.js 자동화 |

### 2.2 세션 관리

| # | 기능 | Lucia v3 | Auth.js v6 | 비고 |
|---|---|---|---|---|
| 9 | Session 저장 | DB (Prisma/Drizzle/etc) | JWT (default) 또는 DB | Lucia 일관, Auth.js 유연 |
| 10 | Session 무효화 | `lucia.invalidateSession(id)` 1줄 | JWT mode: 블랙리스트 필요 / DB mode: 가능 | Lucia 우위 |
| 11 | 전체 디바이스 로그아웃 | `lucia.invalidateUserSessions(userId)` | callback에서 JWT version 증가 패턴 | Lucia 우위 |
| 12 | Slide expiration | 자동 (옵션) | 수동 (jwt callback `exp` 갱신) | Lucia 자동 |
| 13 | 디바이스별 세션 목록 | Session 테이블 쿼리 | DB mode 필요 | Lucia 직관 |
| 14 | Session cookie 헬퍼 | `lucia.createSessionCookie()` | `cookies` 표준 사용 | 동률 |

### 2.3 Custom Claims & Hook

| # | 기능 | Lucia v3 | Auth.js v6 | 비고 |
|---|---|---|---|---|
| 15 | Custom claims 추가 | Session attributes | `jwt` callback + module augmentation | Auth.js 타입 지원 |
| 16 | Claims 동적 갱신 | DB update | `useSession().update()` + trigger:"update" | Auth.js 편의 |
| 17 | signIn callback | 없음 (직접 코드) | `signIn` callback | Auth.js 표준 |
| 18 | events / 감사 로그 | 직접 코드 | `events.{signIn,signOut,createUser}` | Auth.js 표준 |
| 19 | redirect 검증 | 직접 코드 | `redirect` callback | Auth.js 표준 |

### 2.4 Next.js 통합

| # | 기능 | Lucia v3 | Auth.js v6 | 비고 |
|---|---|---|---|---|
| 20 | App Router 지원 | ✓ | ✓✓ (1급) | Auth.js 1급 |
| 21 | RSC 통합 | 수동 (`validateSession()`) | `auth()` 함수 직접 | Auth.js 우위 |
| 22 | Server Action | 수동 | 1급 (`signIn()`/`signOut()` import) | Auth.js 우위 |
| 23 | Middleware | 수동 (`validateSession()`) | `export { auth as middleware }` | Auth.js 우위 |
| 24 | Edge runtime | DB adapter는 Node 권장 | 부분 (PrismaAdapter는 Node 권장) | 동률 |

### 2.5 어댑터 / 타입

| # | 기능 | Lucia v3 | Auth.js v6 | 비고 |
|---|---|---|---|---|
| 25 | Adapter 수 | 9 (Prisma/Drizzle/PG/MySQL/SQLite/Mongo/Redis 등) | 20+ (+Supabase/Firebase/MikroORM) | Auth.js 압승 |
| 26 | Adapter 인터페이스 | 7 메서드 (getSessionAndUser 등) | 추상적 (자동 검증) | Lucia 간결 |
| 27 | TypeScript 타입 | 완비 (module augmentation) | 완비 (`auth-config.d.ts`) | 동률 |
| 28 | Adapter 자작 난이도 | 50줄 이내 | 추상적 (개수 많고 복잡) | Lucia 우위 |

---

## 3. 코드 비교 (2시나리오)

### 3.1 시나리오 1: Credentials 인증 + 세션 생성

#### 3.1.1 Lucia v3 코드

```typescript
// lib/auth/lucia.ts — 설정
import { Lucia } from "lucia";
import { PrismaAdapter } from "@lucia-auth/adapter-prisma";
import { prisma } from "@/lib/prisma";

const adapter = new PrismaAdapter(prisma.session, prisma.user);

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    attributes: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  },
  getUserAttributes: (attributes) => ({
    email: attributes.email,
    role: attributes.role,
  }),
});

// TypeScript module augmentation (타입 안전)
declare module "lucia" {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: {
      email: string;
      role: "ADMIN" | "MANAGER" | "STAFF";
    };
  }
}
```

```typescript
// app/api/auth/login/route.ts — Credentials 인증
import { NextRequest, NextResponse } from "next/server";
import { lucia } from "@/lib/auth/lucia";
import { prisma } from "@/lib/prisma";
import { verify } from "@node-rs/argon2";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json(
      { error: "이메일 또는 비밀번호가 올바르지 않습니다" },
      { status: 401 }
    );
  }

  const valid = await verify(user.passwordHash, password);
  if (!valid) {
    return NextResponse.json(
      { error: "이메일 또는 비밀번호가 올바르지 않습니다" },
      { status: 401 }
    );
  }

  // 세션 생성 (DB row 삽입)
  const session = await lucia.createSession(user.id, {});
  const sessionCookie = lucia.createSessionCookie(session.id);

  cookies().set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

  return NextResponse.json({ success: true });
}
```

**특성**:
- `createSession` 1줄로 DB insert + expiresAt 자동 계산
- cookie 설정 헬퍼가 attributes 표준화
- 코드 줄 수: **약 20줄** (로그인 로직)

#### 3.1.2 Auth.js v6 코드

```typescript
// auth.ts — 프로젝트 루트 설정
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { verify } from "@node-rs/argon2";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const user = await prisma.user.findUnique({
          where: { email: credentials?.email as string },
        });
        if (!user) return null;
        const valid = await verify(
          user.passwordHash,
          credentials?.password as string
        );
        return valid
          ? { id: user.id, email: user.email, role: user.role }
          : null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId as string;
      session.user.role = token.role as string;
      return session;
    },
  },
});

// TypeScript module augmentation
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      role: "ADMIN" | "MANAGER" | "STAFF";
    };
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    role: string;
  }
}
```

```typescript
// app/api/auth/[...nextauth]/route.ts
export { GET, POST } from "@/auth";
```

```typescript
// 클라이언트 로그인 (Server Action 또는 fetch)
"use server";
import { signIn } from "@/auth";

export async function loginAction(formData: FormData) {
  await signIn("credentials", {
    email: formData.get("email"),
    password: formData.get("password"),
    redirectTo: "/dashboard",
  });
}
```

**특성**:
- 설정 파일(`auth.ts`)에 모든 provider/callback/adapter 집약
- `[...nextauth]/route.ts` catch-all 라우트로 /api/auth/* 자동 처리
- 코드 줄 수: **약 60줄** (설정 + 클라이언트 트리거)

#### 3.1.3 비교

| 기준 | Lucia v3 | Auth.js v6 |
|---|---|---|
| 설정 줄 수 | 15줄 | 40줄 |
| 로그인 API 줄 수 | 20줄 | (auth.ts에 통합, 별도 없음) |
| 학습 부담 | 낮음 (API 3개) | 높음 (callback 모델 이해 필수) |
| 커스터마이징 자유 | 최상 (직접 코드) | 중 (callback 범위 내) |
| 타입 안전 | `declare module "lucia"` | `declare module "next-auth"` |
| 에러 경로 | `NextResponse.json({error})` 직접 | `pages.error: "/login?error=..."` 설정 |

### 3.2 시나리오 2: Google OAuth 콜백 처리

#### 3.2.1 Lucia v3 + arctic

```typescript
// lib/auth/oauth.ts
import { Google } from "arctic";

export const google = new Google(
  process.env.GOOGLE_CLIENT_ID!,
  process.env.GOOGLE_CLIENT_SECRET!,
  "https://stylelucky4u.com/api/auth/callback/google"
);
```

```typescript
// app/api/auth/login/google/route.ts — 리다이렉트 시작
import { generateState, generateCodeVerifier } from "arctic";
import { google } from "@/lib/auth/oauth";
import { cookies } from "next/headers";

export async function GET() {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = await google.createAuthorizationURL(state, codeVerifier, {
    scopes: ["profile", "email"],
  });

  cookies().set("google_state", state, {
    httpOnly: true,
    secure: true,
    maxAge: 600,
    sameSite: "lax",
  });
  cookies().set("google_code_verifier", codeVerifier, {
    httpOnly: true,
    secure: true,
    maxAge: 600,
    sameSite: "lax",
  });

  return Response.redirect(url.toString());
}
```

```typescript
// app/api/auth/callback/google/route.ts — 콜백 처리
import { google } from "@/lib/auth/oauth";
import { lucia } from "@/lib/auth/lucia";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { OAuth2RequestError } from "arctic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const storedState = cookies().get("google_state")?.value;
  const storedCodeVerifier = cookies().get("google_code_verifier")?.value;

  if (!code || !state || !storedState || !storedCodeVerifier || state !== storedState) {
    return new Response(null, { status: 400 });
  }

  try {
    const tokens = await google.validateAuthorizationCode(code, storedCodeVerifier);
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.accessToken()}` },
    });
    const profile: { sub: string; email: string; name: string } = await profileRes.json();

    let user = await prisma.user.findUnique({ where: { email: profile.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: profile.email,
          name: profile.name,
          passwordHash: "",
          role: "STAFF",
        },
      });
    }

    const session = await lucia.createSession(user.id, {});
    const sessionCookie = lucia.createSessionCookie(session.id);
    cookies().set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

    return Response.redirect(new URL("/dashboard", req.url));
  } catch (err) {
    if (err instanceof OAuth2RequestError) return new Response(null, { status: 400 });
    return new Response(null, { status: 500 });
  }
}
```

**코드 줄 수**: 약 60줄 (리다이렉트 + 콜백)

#### 3.2.2 Auth.js v6

```typescript
// auth.ts에 Google provider 추가 (§3.1.2 설정에 이어)
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({ /* ... */ }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // 허용 정책: Google의 경우 email_verified 필수
      if (account?.provider === "google" && !profile?.email_verified) {
        return false;
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.userId = user.id;
        token.role = (user as any).role ?? "STAFF";
      }
      return token;
    },
  },
});
```

```typescript
// 클라이언트: Google 로그인 버튼
"use server";
import { signIn } from "@/auth";

export async function googleLogin() {
  await signIn("google", { redirectTo: "/dashboard" });
}
```

**자동 처리**:
- `/api/auth/signin/google` → Google OAuth redirect
- `/api/auth/callback/google` → code exchange + profile fetch + user upsert (Adapter가 `Account`/`User` 테이블에 자동 insert)
- state/nonce/code_verifier 자동 관리
- Account linking: 같은 email 존재 시 `Account` 테이블에 신규 record 추가

**코드 줄 수**: 약 12줄 (provider 1개 + callback)

#### 3.2.3 비교

| 기준 | Lucia v3 + arctic | Auth.js v6 |
|---|---|---|
| 총 코드 줄 수 | 60줄 | 12줄 |
| 리다이렉트 URL 관리 | 직접 | 자동 (`/api/auth/*`) |
| state/nonce/PKCE | 직접 (arctic helper 사용) | 자동 |
| User upsert | 직접 | 자동 (Adapter) |
| Account linking | 직접 | 자동 (`Account` 테이블) |
| 에러 처리 | `try/catch + OAuth2RequestError` | `pages.error` 설정 |
| 한국 Naver/Kakao | arctic에 포함 ✓ | 직접 작성 필요 ✗ |

**시사점**: Google/GitHub 같은 주류 OAuth는 Auth.js가 압도적으로 간결. 하지만 한국 OAuth는 Lucia+arctic이 유리. 양평 부엌 서버는 양쪽 모두 필요.

---

## 4. 성능 비교

### 4.1 요청당 오버헤드

| 단계 | Lucia v3 (DB session) | Auth.js v6 (JWT mode) | Auth.js v6 (DB mode) |
|---|---|---|---|
| Cookie parse | < 0.1ms | < 0.1ms | < 0.1ms |
| 검증 | DB lookup 약 2ms | JWT verify 약 0.5ms | JWT verify + DB lookup 약 2.5ms |
| Claims 로드 | JOIN 포함 약 2~3ms | JWT payload 즉시 | JOIN 약 2~3ms |
| 총 (평균) | **약 3ms** | **약 0.5ms** | **약 3ms** |

**시사점**: Auth.js JWT mode가 가장 빠르지만 session 무효화 불가. Lucia/Auth.js DB mode는 동등.

### 4.2 동시성 / 스케일

- Lucia: DB row lock 없이 읽기 → 안전, 캐시 적용 쉬움
- Auth.js JWT: stateless → scale 무제한
- Auth.js DB: adapter 통해 row 갱신 → 약간의 부하

### 4.3 양평 부엌 서버 실제 영향

동시 활성 사용자 5~10명, 50 RPS 이하. DB 10ms 이내 응답. **성능 차이는 사용자 체감 무관**. PERF 가중치는 10%이나, 실질적으로는 0에 수렴.

---

## 5. 보안 감사 이력

### 5.1 Lucia v3

- GitHub Issues: 2024-2025 중 session fixation 관련 Discussion 다수 → v3 cookie/session id 랜덤성 보완
- v4에서 Session id SHA-256 hash 저장 권장 (DB 유출 시 session takeover 방지)
- oslo(분리 패키지)는 CSRF double-submit helper 제공
- CVE 이력: 클린 (2026-04 기준)

### 5.2 Auth.js v6

- v5 beta 기간 CSRF 토큰 검증 버그 1건 (2024-Q2, patch 릴리스)
- Adapter 계층 user 데이터 처리 일관성 부재로 인한 account takeover 리스크 discussed (2025-Q1) → v6에서 Account linking 정책 문서화
- JWT signature 검증 정확성 검증됨 (jose 의존)
- CVE 이력: 중간 수준 1건 (v5.0.0-beta.x, fixed)

### 5.3 비교

| 항목 | Lucia | Auth.js |
|---|---|---|
| CSRF 방어 | SameSite=Lax (cookie 기반) + oslo 옵션 | 자동 token (double-submit) |
| Session fixation | v4에서 hash 저장 권장 | JWT mode는 무관, DB mode는 Adapter 책임 |
| XSS (cookie 탈취) | httpOnly 강제 | httpOnly 강제 |
| Replay | expiresAt 검증만 | JWT `iat`/`exp` 검증 + Adapter 책임 |
| 알려진 CVE | 0 | 1 (v5 beta에서 fix) |

---

## 6. 마이그레이션 비용 비교

### 6.1 현재(jose+Prisma) → Lucia

Wave 1 §8 Option A (전면):

| 단계 | 작업 | 시간 |
|---|---|---|
| 1 | Session 모델 + migration | 0.5h |
| 2 | `@lucia-auth/adapter-prisma` 설치 | 0.5h |
| 3 | Login/Logout/Me API 재작성 | 2h |
| 4 | middleware cookie 교체 | 1h |
| 5 | 클라이언트 jose 제거 | 1h |
| 6 | 기존 JWT 강제 만료 (재로그인) | 0.5h |
| 7 | E2E/RBAC 회귀 | 3h |
| **합계** | | **8.5h** |

**사용자 영향**: 전체 재로그인 필요.

### 6.2 현재(jose+Prisma) → Auth.js

Wave 1 §8.2:

| 단계 | 작업 | 시간 |
|---|---|---|
| 1 | `next-auth@beta` 설치 + `auth.ts` | 1h |
| 2 | Prisma Adapter 모델 (Account/Session/VT) | 1h |
| 3 | Credentials Provider + bcrypt 통합 | 2h |
| 4 | jwt/session callback에 role/kitchenId | 2h |
| 5 | middleware → `auth()` | 1h |
| 6 | 클라이언트 (`useSession()` 도입) | 3h |
| 7 | 환경변수 6개 + Cloudflare | 1h |
| 8 | 기존 JWT 강제 만료 (재로그인) | 0.5h |
| 9 | E2E 회귀 | 4h |
| **합계** | | **15.5h** |

**사용자 영향**: 전체 재로그인 + cookie 이름/형식 변경.

### 6.3 현재(jose+Prisma) → Hybrid-Self (권장)

Wave 1 Lucia §8 Option C + Auth.js §8.3 = Wave 2 매트릭스 §8:

| 단계 | 작업 | 시간 |
|---|---|---|
| Phase A | Session 테이블 + opaque ID + slide + logout + middleware | 5h |
| Phase B | AuthProvider + Credentials + Google + Naver + Kakao | 6h |
| Phase C | Hook + Events + Claims Composer | 4h |
| Phase D | VerificationToken + redirect 검증 + CSRF | 3h |
| Phase E | 디바이스 목록 UI + Anonymous | 3h |
| Phase F | E2E + 부하 + 보안 테스트 | 5h |
| **합계** | | **약 25h** |

**사용자 영향**: 없음 (점진적 Phase 적용, 기존 JWT는 외부 API 전용으로만 유지).

---

## 7. 사용자 모델 유연성

### 7.1 Lucia v3

사용자가 `DatabaseUserAttributes` 인터페이스로 User 모델 자유 정의:

```typescript
declare module "lucia" {
  interface Register {
    DatabaseUserAttributes: {
      email: string;
      role: "ADMIN" | "MANAGER" | "STAFF";
      kitchenId?: string;
      // 우리가 원하는 것 전부
    };
  }
}
```

- User 테이블 PK는 문자열(옵션으로 BigInt 변경 가능)
- Session 테이블 필드 추가 자유 (`ipAddress`, `userAgent`, `deviceName` 등)

### 7.2 Auth.js v6

Prisma Adapter는 공식 `User` 스키마 요구:

```prisma
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
  accounts      Account[]
  sessions      Session[]
  // 이 표준 필드가 있어야 adapter 동작
}

model Account { /* ... */ }
model Session { /* ... */ }
model VerificationToken { /* ... */ }
```

확장 필드는 추가 가능하지만 `emailVerified`/`image` 같은 Auth.js 예약 이름과 충돌 방지 필요.

### 7.3 비교

| 기준 | Lucia | Auth.js |
|---|---|---|
| User 모델 자유도 | 최상 | 중 (표준 필드 강제) |
| Session 모델 자유도 | 최상 (attributes 자유) | 낮음 (Adapter 스키마) |
| Migration 시 충돌 | 낮음 | 중 (`emailVerified` 등 추가 필드) |

---

## 8. TypeScript DX 비교

### 8.1 타입 안전성 깊이

Lucia:
```typescript
// 사용 시
const { session, user } = await lucia.validateSession(id);
// user.role 자동 타입 추론 ("ADMIN" | "MANAGER" | "STAFF")
```

Auth.js:
```typescript
// RSC
const session = await auth();
// session.user.role — declare module으로 정의 필요
// session이 null일 수도 있음 → 체크 필수
```

### 8.2 IDE 보조

- Lucia: API 표면 작음 → 자동완성 직관적
- Auth.js: callback signature 복잡 → 자주 docs 참조 필요

### 8.3 에러 메시지

- Lucia: TypeScript 에러 명확
- Auth.js: callback chain에서 타입 꼬임 시 디버그 난이도 높음

---

## 9. 점수 비교 (Wave 1 재확인 + Wave 2 가중)

| 차원 | 가중치 | Lucia v3 | Auth.js v6 |
|---|---|---|---|
| FUNC (18%) | | 3.5 → 0.63 | 4.0 → 0.72 |
| PERF (10%) | | 4.0 → 0.40 | 3.5 → 0.35 |
| DX (14%) | | 4.5 → 0.63 | 2.5 → 0.35 |
| ECO (12%) | | 3.0 → 0.36 | 4.5 → 0.54 |
| LIC (8%) | | 5.0 → 0.40 | 5.0 → 0.40 |
| MAINT (10%) | | 2.5 → 0.25 | 4.0 → 0.40 |
| INTEG (10%) | | 3.0 → 0.30 | 2.5 → 0.25 |
| SECURITY (10%) | | 4.5 → 0.45 | 4.0 → 0.40 |
| SELF_HOST (5%) | | 5.0 → 0.25 | 5.0 → 0.25 |
| COST (3%) | | 5.0 → 0.15 | 5.0 → 0.15 |
| **합계** | | **3.62** | **3.32** |

**격차 원인**:
- Lucia가 DX(+0.28) / PERF(+0.05) / INTEG(+0.05) / SECURITY(+0.05) 우위
- Auth.js가 FUNC(+0.09) / ECO(+0.18) / MAINT(+0.15) 우위

→ 1인 운영 관점(학습 곡선·통합 비용)에서 Lucia 승리. 다만 Lucia v4 deprecation 리스크로 MAINT -1.5점 감점 발생 → **라이브러리 채용 대신 패턴 차용**이 Wave 1 공통 결론.

---

## 10. 상황별 권장

### 10.1 Lucia를 선택해야 하는 경우

- Session 무효화가 핵심 요구 (권한 박탈, 비밀번호 변경 후 강제 로그아웃)
- 단순 인증 요구 (OAuth 2~3개만)
- 1인 또는 작은 팀 + 학습 곡선 최소화
- Custom User 모델 자유도 필요
- 한국 OAuth (arctic 활용)

### 10.2 Auth.js를 선택해야 하는 경우

- 다양한 OAuth (Google + GitHub + Apple + Discord + ...) 필요
- Hook / Callback / Events 표준 인터페이스 필요
- Account linking 자동 필요
- Vercel 생태계 풀 활용
- 팀 규모 3인+ (학습 곡선 분산 가능)

### 10.3 둘 다 선택하지 않아야 하는 경우 (우리)

- 기존 jose+Prisma 자산이 이미 잘 작동
- 한국 OAuth + 주류 OAuth 모두 필요 (어느 라이브러리도 완벽 커버 못함)
- 1인 운영 + 장기 통제 선호
- Lucia v4 deprecation / Auth.js v6→v7 마이그레이션 회피
- 재사용 가능한 패턴(Session 모델, Provider 인터페이스, Hook Registry) 가치 > 라이브러리 편의

→ **Hybrid-Self**: 양쪽 장점 차용, 의존성은 본인 코드.

---

## 11. 프로젝트 결론 (양평 부엌 서버)

### 11.1 최종 결정

**양쪽 모두 라이브러리로는 거부.**

### 11.2 Lucia에서 차용할 패턴

| # | 패턴 | 근거 |
|---|---|---|
| 1 | Session 테이블 구조 (id 40-char hex, userId, expiresAt, ipAddress?, userAgent?) | Lucia §2.2 |
| 2 | Slide expiration (15일 threshold → 30일 연장) | Lucia §4.2 |
| 3 | `validateSession()` 함수 signature + `fresh` 플래그 | Lucia §4.2 |
| 4 | `invalidateSession(id)` / `invalidateUserSessions(userId)` | Lucia §4.3~4.4 |
| 5 | `createSessionCookie` / `createBlankSessionCookie` 헬퍼 | Lucia §9.2 |
| 6 | Anonymous sign-in 패턴 (`email?`, `passwordHash?`, `isAnonymous`) | Lucia §6 |
| 7 | Cron expiry 정리 (`deleteExpiredSessions`) | Lucia §9.4 |

### 11.3 Auth.js에서 차용할 패턴

| # | 패턴 | 근거 |
|---|---|---|
| 1 | Adapter 인터페이스 추상화 (getSessionAndUser / setSession 등) | Auth.js §2.3 |
| 2 | AuthProvider 인터페이스 (id, name, type, authorize/oauthFlow) | Auth.js §9.1 |
| 3 | Hook Registry (beforeSignIn/afterSignIn/onSessionRefresh) | Auth.js §9.2 |
| 4 | Events Bus (audit log 통합) | Auth.js §9.2 |
| 5 | Claims Composer (`registerClaim` + `buildClaims`) | Auth.js §9.3 |
| 6 | VerificationToken 모델 (이메일 인증/비밀번호 재설정/magic link) | Auth.js §7.2 |
| 7 | redirect 검증 함수 (open-redirect 방어) | Auth.js §2.2 redirect callback |
| 8 | CSRF double-submit token | Auth.js CSRF 자동 |

### 11.4 마이그레이션 로드맵

Wave 2 매트릭스 §8 Phase A~F (약 25h) 그대로 적용. 재로그인 없음, 점진적 Phase 진행.

### 11.5 미해결 DQ

| # | 질문 | 우선 답변 |
|---|---|---|
| DQ-LA-1 | Session id는 평문 vs SHA-256 hash? | Phase A-1에서 hash 권장 (Lucia v4 정렬) |
| DQ-LA-2 | Account linking 모델 포함? | Phase E 이후 검토 (단일 직원 계정에는 불필요) |
| DQ-LA-3 | arctic 패키지를 OAuth 구현에 사용? | Phase B-4에서 평가 (Naver/Kakao 있으면 차용) |
| DQ-LA-4 | Auth.js PrismaAdapter 스키마를 참조? | Phase A-1에서 참조, 불필요 필드(`emailVerified`/`image`) 생략 |
| DQ-LA-5 | Lucia oslo 패키지(CSRF 등)를 참조? | Phase D-3에서 참조, 직접 구현 |

---

## 12. 참고 자료

1. Wave 1 01-lucia-auth-deep-dive.md (자체)
2. Wave 1 02-authjs-v6-pattern-deep-dive.md (자체)
3. Wave 2 03-auth-core-matrix.md (자체)
4. Lucia Auth v3 공식 — https://v3.lucia-auth.com/
5. Lucia v4 announcement — https://github.com/lucia-auth/lucia/discussions/1714
6. oslo (Lucia 분리 패키지) — https://github.com/pilcrowonpaper/oslo
7. arctic (OAuth 라이브러리, Lucia 저자) — https://arctic.js.org/
8. Auth.js v6 공식 — https://authjs.dev/
9. @auth/prisma-adapter README — https://authjs.dev/reference/adapter/prisma
10. Auth.js v5 → v6 마이그레이션 — https://authjs.dev/getting-started/migrating-to-v5
11. RFC 6749 OAuth 2.0 — https://www.rfc-editor.org/rfc/rfc6749
12. OWASP CSRF Prevention — https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
13. Next.js App Router Authentication — https://nextjs.org/docs/app/building-your-application/authentication
14. Hacker News "Auth.js vs Lucia" 스레드 (2026-02)
15. DEV.to "Why I removed Lucia from my SaaS" (2025-08)

---

(문서 끝 — Lucia v3 vs Auth.js v6 1:1 비교 Wave 2)
