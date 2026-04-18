# Auth.js v6 (NextAuth) Pattern Deep Dive — Wave 1 Round 2 (Auth Core)

> 산출물 ID: 05/02
> 작성일: 2026-04-18
> 대상 프로젝트: 양평 부엌 서버 대시보드 (Next.js 16 + jose JWT + bcrypt + Prisma + 3-role RBAC)
> 비교 대상: Auth.js v6 (구 NextAuth.js v5+) — 2025-Q4 GA, 2026-Q1 시점 v6.x
> 평가 프레임: Round 2 공통 10차원 스코어링
> 키워드: "Auth.js v6 hooks", "NextAuth custom claims 2026"

---

## 0. Executive Summary (요약 카드)

| 항목 | 값 |
|---|---|
| 라이브러리 | Auth.js (구 NextAuth) v6 |
| 현행 버전 | v6.0.x (2025-11 GA), v6.1 알파 (Edge Adapter 개선) |
| 패러다임 | Provider-기반, JWT/Database 세션 모드 선택 가능, Callback 풍부 |
| 설치 | `next-auth@beta` (v6) → 2026-Q2 stable로 `auth` 단독 패키지 분리 진행 중 |
| 어댑터 | Prisma, Drizzle, Mongo, PostgreSQL, Supabase, Firebase, MikroORM 등 20+ |
| 우리 현재 | jose JWT 직접, Provider 추상화 없음, callback 없음, custom claims ad-hoc |
| 마이그레이션 비용 | **상(H)** — Provider 모델 도입, callback 시스템, 환경변수 6개 추가, edge runtime 호환성 |
| Round 2 평균 점수 | **3.18 / 5.00** (가중 적용 시 3.32) |
| 결론 | **부분 패턴 채용** — Provider/Callback 패턴 차용, 라이브러리 의존은 회피 (자체 구현) |

---

## 1. 배경: 왜 Auth.js v6를 검토하는가

### 1.1 우리 갭 vs Auth.js 강점 매핑

| 우리 갭 (`_PROJECT_VS_SUPABASE_GAP.md`) | Auth.js 기여 |
|---|---|
| Hooks 부재 | **★★★★★** (signIn/jwt/session/redirect 5종 callback) |
| Custom claims ad-hoc | **★★★★☆** (jwt callback에서 표준화) |
| Provider 추상화 없음 | **★★★★★** (Google/Naver/Kakao OAuth 일관) |
| Anonymous sign-in 부재 | **★★☆☆☆** (Credential provider 변형 가능하나 비표준) |
| SCIM 부재 | **☆☆☆☆☆** (범위 외) |
| Org/Team 부재 | **★☆☆☆☆** (Team 모델 직접) |
| 세션 무효화 약함 | **★★★☆☆** (Database session 모드 채택 시 가능) |
| Account linking | **★★★★☆** (`Account` 테이블 표준) |

### 1.2 Auth.js를 단순 채용하지 못하는 이유

1. **Edge runtime 제약**: v5 시절 Edge에서 jwt callback 동작 부분 제한 → v6에서 일부 개선됐지만 Prisma adapter는 여전히 Node runtime 권장
2. **추상화 비용**: 우리 Custom 로직(직원 코드, 부엌 권한)이 Auth.js Provider 모델과 mismatch
3. **마이그레이션 리스크**: 모든 활성 사용자 재로그인 + cookie 이름/형식 변경
4. **종속성 무게**: 30+ Provider deps, 우리는 1~2개만 필요
5. **Korean OAuth (Naver/Kakao)**: 공식 Provider 없음, 직접 작성 필요 → 추상화 이점 반감

→ **결론적으로 라이브러리 채용보다 패턴 학습이 ROI 높음**

---

## 2. Auth.js v6 핵심 아키텍처

### 2.1 v5 → v6 주요 변경 (2025)

| 항목 | v5 (2024) | v6 (2025-11) |
|---|---|---|
| 패키지명 | `next-auth` | `next-auth` (호환) → `auth` (separate, 진행중) |
| 환경변수 | `NEXTAUTH_*` | `AUTH_*` |
| 설정 위치 | `app/api/auth/[...nextauth]/route.ts` | `auth.ts` (root) + handlers export |
| Edge 지원 | 부분 | 향상 (RSC 통합 강화) |
| Server Action | 제한 | 1급 시민 |
| Custom claims | jwt callback | jwt + session callback 분리 |
| Hooks 스타일 | callback object | callback object + events 별도 |
| Adapter | DB 모델 명시 | DB 모델 동적 검사 (런타임 검증) |

### 2.2 v6 표준 설정 패턴

```typescript
// auth.ts (프로젝트 루트)
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" }, // 또는 "database"
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });
        if (!user) return null;
        const ok = await verify(user.passwordHash, credentials.password as string);
        return ok ? { id: user.id, email: user.email, role: user.role } : null;
      },
    }),
    Google,
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // Hook: 로그인 허용 여부 결정
      if (account?.provider === "google" && !profile?.email_verified) return false;
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      // Hook: JWT 발급/갱신 시 호출
      if (user) {
        token.role = user.role;
        token.userId = user.id;
      }
      if (trigger === "update" && session?.role) {
        token.role = session.role; // 클라이언트에서 update() 호출 시
      }
      return token;
    },
    async session({ session, token }) {
      // Hook: 클라이언트에 노출할 session 객체 가공
      session.user.id = token.userId as string;
      session.user.role = token.role as string;
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Hook: 로그인 후 redirect URL 검증
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
  },
  events: {
    async signIn({ user }) {
      // Side-effect 전용 (return 값 없음)
      await audit.log("signin", { userId: user.id });
    },
    async signOut({ token }) {
      await audit.log("signout", { userId: token?.userId });
    },
  },
  pages: {
    signIn: "/login",
    error: "/login?error=true",
  },
});
```

### 2.3 핸들러 등록

```typescript
// app/api/auth/[...nextauth]/route.ts
export { GET, POST } from "@/auth";
```

```typescript
// middleware.ts
export { auth as middleware } from "@/auth";
export const config = {
  matcher: ["/dashboard/:path*"],
};
```

```typescript
// 서버 컴포넌트
import { auth } from "@/auth";

export default async function Page() {
  const session = await auth();
  if (!session) return <SignInForm />;
  return <Dashboard user={session.user} />;
}
```

---

## 3. Provider 패턴 심층 분석

### 3.1 Provider 인터페이스

```typescript
interface Provider {
  id: string;
  name: string;
  type: "oauth" | "oidc" | "email" | "credentials" | "webauthn";
  authorize?: (credentials, req) => Promise<User | null>;
  authorization?: { url: string; params: Record<string, string> };
  token?: string | { url: string; params: ... };
  userinfo?: string | { url: string; ... };
  profile?: (profile, tokens) => User;
  options?: ProviderOptions;
}
```

### 3.2 Naver OAuth 직접 작성 예시

```typescript
// providers/naver.ts
import type { OAuthConfig } from "next-auth/providers/oauth";

export interface NaverProfile {
  resultcode: string;
  message: string;
  response: {
    id: string;
    email: string;
    name: string;
    profile_image: string;
    nickname: string;
  };
}

export default function Naver(options: { clientId: string; clientSecret: string }): OAuthConfig<NaverProfile> {
  return {
    id: "naver",
    name: "Naver",
    type: "oauth",
    authorization: {
      url: "https://nid.naver.com/oauth2.0/authorize",
      params: { response_type: "code", scope: "name email profile_image" },
    },
    token: "https://nid.naver.com/oauth2.0/token",
    userinfo: "https://openapi.naver.com/v1/nid/me",
    profile(profile) {
      return {
        id: profile.response.id,
        email: profile.response.email,
        name: profile.response.name,
        image: profile.response.profile_image,
      };
    },
    style: { logo: "/naver.svg", bg: "#03C75A", text: "#fff" },
    options,
  };
}
```

### 3.3 Provider 추상화의 가치

- **일관된 발급 흐름**: OAuth 2.0 / OIDC / Credential / Magic Link 모두 같은 callback 흐름
- **Account linking**: 한 user가 여러 provider 연결 시 `Account` 테이블이 자동 처리
- **Profile 정규화**: 각 provider 응답 → User 모델 변환 격리

→ 우리 자체 구현 시 **`AuthProvider` 인터페이스만 만들어도 70% 이득**

---

## 4. Custom Claims & Hooks 패턴

### 4.1 jwt callback 라이프사이클

```
[Sign In]
  ↓
authorize() → User 객체 반환
  ↓
jwt({ token: {}, user, trigger: "signIn" })
  ↓ token 가공 (claims 추가)
[모든 후속 요청]
  ↓
jwt({ token: {prev}, trigger: undefined })
  ↓ token 그대로 또는 갱신
session({ session, token })
  ↓ 클라이언트로 보낼 객체
```

### 4.2 우리 갭 "Custom claims ad-hoc"에 대한 표준화

현재 우리 jose 사용:
```typescript
// 현재: ad-hoc
const jwt = await new SignJWT({ userId, role, kitchenId, isOwner }).sign(secret);
// 문제: 새 claim 추가할 때마다 모든 발급 지점 수정 필요
```

Auth.js 패턴 도입:
```typescript
// 패턴: 중앙화된 claims 빌더
const claimsBuilders = {
  base: (user) => ({ userId: user.id, email: user.email, role: user.role }),
  kitchen: async (user) => {
    const kitchen = await prisma.kitchen.findFirst({ where: { ownerId: user.id } });
    return kitchen ? { kitchenId: kitchen.id, isOwner: true } : {};
  },
  permissions: async (user) => {
    const perms = await loadPermissions(user.id);
    return { permissions: perms };
  },
};

export async function buildClaims(user: User) {
  return {
    ...claimsBuilders.base(user),
    ...await claimsBuilders.kitchen(user),
    ...await claimsBuilders.permissions(user),
  };
}
```

→ jwt callback 패턴을 우리 도메인에 맞게 **claims composer**로 재구성.

### 4.3 trigger 활용 (claims 갱신)

Auth.js v5+의 `trigger: "update"`는 강력하다:

```typescript
// 클라이언트
import { useSession } from "next-auth/react";

const { update } = useSession();
await update({ role: "MANAGER" }); // → jwt callback이 trigger:"update"로 재호출됨
```

우리 자체 구현 시:
```typescript
// /api/auth/refresh-claims
export async function POST() {
  const sid = cookies().get("yp_session")?.value;
  const session = await prisma.session.findUnique({ where: { id: sid } });
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  const claims = await buildClaims(user);
  // claims를 sessionStorage 또는 별도 cookie에 저장
  return Response.json(claims);
}
```

---

## 5. Anonymous Sign-in (Auth.js로 가능한가?)

Auth.js는 **공식 Anonymous Provider 없음**. 하지만 Credential Provider 변형으로 가능:

```typescript
Credentials({
  id: "anonymous",
  name: "Anonymous",
  credentials: {},
  authorize: async () => {
    const user = await prisma.user.create({
      data: {
        id: nanoid(),
        isAnonymous: true,
        role: "GUEST",
      },
    });
    return user;
  },
}),
```

```typescript
// 클라이언트
await signIn("anonymous", { redirect: false });
```

**한계**: 매 요청마다 새 user 생성 방지를 위해 cookie 기반 "this device → existing anon user" 매핑 필요. 직접 작성하면 Lucia 패턴(§5)이 더 깔끔.

---

## 6. SCIM 2.0 / Org-Team 모델

### 6.1 Auth.js의 입장

- **SCIM**: 공식 지원 없음. Boxy HQ Jackson SCIM 등 별도 통합
- **Org/Team**: User-Account 모델만 제공, Team은 사용자 직접

### 6.2 Org/Team을 추가할 때 권장 스키마

```prisma
model Organization {
  id        String       @id @default(cuid())
  name      String
  slug      String       @unique
  members   OrgMember[]
  teams     Team[]
  createdAt DateTime     @default(now())
}

model OrgMember {
  id     String @id @default(cuid())
  userId String
  orgId  String
  role   OrgRole  // OWNER | ADMIN | MEMBER

  user   User         @relation(fields: [userId], references: [id])
  org    Organization @relation(fields: [orgId], references: [id])

  @@unique([userId, orgId])
}

model Team {
  id    String   @id @default(cuid())
  orgId String
  name  String
  members TeamMember[]
  org   Organization @relation(fields: [orgId], references: [id])
}

model TeamMember {
  userId String
  teamId String
  role   TeamRole

  user   User @relation(fields: [userId], references: [id])
  team   Team @relation(fields: [teamId], references: [id])

  @@id([userId, teamId])
}
```

claims 빌더에 통합:
```typescript
const orgs = await prisma.orgMember.findMany({
  where: { userId: user.id },
  include: { org: true },
});
return {
  orgs: orgs.map(o => ({ id: o.org.id, slug: o.org.slug, role: o.role })),
  activeOrgId: orgs[0]?.org.id, // 또는 cookie/header에서 선택
};
```

→ Auth.js 패턴은 단지 "claims에 orgs 배열 넣기" 가이드 제공. 모델은 우리 책임.

---

## 7. Supabase GoTrue 일부 패턴 채용 가능성

### 7.1 GoTrue 강점 (Auth.js + Lucia에 없는 것)

| 기능 | GoTrue | Auth.js | Lucia | 우리 가능성 |
|---|---|---|---|---|
| Email magic link | ✓ | ✓ | 직접 | 자체 구현 (resend.com) |
| OTP (SMS/Email) | ✓ | ✓ (이메일만) | 직접 | 자체 구현 |
| 비밀번호 재설정 토큰 (만료) | ✓ | 직접 | 직접 | 토큰 테이블 필요 |
| MFA (TOTP) | ✓ | 직접 | 직접 | `otplib` + QR |
| 인증된 이메일 강제 | ✓ | jwt callback 검증 | 직접 | 직접 |
| 인증된 폰 강제 | ✓ | ✗ | ✗ | 우리 현장 미사용 |
| Audit log | ✓ | events callback | 직접 | events 패턴 적용 |
| Rate limit | ✓ | ✗ | ✗ | Cloudflare WAF + 자체 |

### 7.2 채용 권장: GoTrue의 "Email Token" 모델

```prisma
model VerificationToken {
  id         String   @id @default(cuid())
  userId     String?
  email      String
  tokenHash  String   @unique // SHA-256
  type       VerificationType  // EMAIL_VERIFY | PASSWORD_RESET | MAGIC_LINK | OTP
  expiresAt  DateTime
  consumedAt DateTime?
  createdAt  DateTime @default(now())

  @@index([email, type])
}
```

발급/검증 헬퍼:
```typescript
export async function issueVerificationToken(opts: {
  email: string;
  type: VerificationType;
  ttlMinutes: number;
}) {
  const raw = randomBytes(32).toString("base64url");
  const tokenHash = sha256(raw);
  await prisma.verificationToken.create({
    data: {
      email: opts.email,
      type: opts.type,
      tokenHash,
      expiresAt: new Date(Date.now() + opts.ttlMinutes * 60_000),
    },
  });
  return raw; // 이메일 본문에 포함
}

export async function consumeVerificationToken(raw: string, type: VerificationType) {
  const tokenHash = sha256(raw);
  const t = await prisma.verificationToken.findUnique({ where: { tokenHash } });
  if (!t || t.type !== type) return null;
  if (t.expiresAt < new Date()) return null;
  if (t.consumedAt) return null; // 재사용 방지
  await prisma.verificationToken.update({
    where: { id: t.id },
    data: { consumedAt: new Date() },
  });
  return t;
}
```

---

## 8. 우리 자체 구현과의 갭 + 마이그레이션 비용

### 8.1 갭 매트릭스

| 영역 | 현재 | Auth.js v6 | 우리가 할 일 |
|---|---|---|---|
| Provider 추상화 | 없음 | OAuth/OIDC/Credentials/Email/WebAuthn | `AuthProvider` interface + Naver/Kakao 구현 (4h) |
| signIn callback | 없음 | ✓ | `beforeSignIn` hook 시스템 (2h) |
| jwt callback | 직접 | ✓ | `buildClaims()` composer (2h) |
| session callback | 없음 | ✓ | claims 노출 헬퍼 (1h) |
| redirect callback | 없음 | ✓ | open-redirect 방어 헬퍼 (1h) |
| events 시스템 | 없음 | ✓ | `eventBus.emit()` (2h) |
| Account linking | 없음 | ✓ (Account 테이블) | Account 모델 + linking flow (4h) |
| CSRF 토큰 | 없음 | 자동 | `csrf-token` cookie + double-submit (3h) |
| Edge runtime 호환 | ✓ (jose) | 부분 | 유지 |

### 8.2 전면 채용 시 비용

| 단계 | 작업 | 시간 |
|---|---|---|
| 1 | `next-auth@beta` 설치 + auth.ts 작성 | 1h |
| 2 | Prisma Adapter 모델 추가 (Account/Session/VerificationToken) | 1h |
| 3 | Credentials Provider + 기존 bcrypt 통합 | 2h |
| 4 | jwt/session callback에 우리 role/kitchenId 주입 | 2h |
| 5 | middleware → `auth()` 교체 | 1h |
| 6 | 클라이언트 (`useSession()`) 도입 또는 직접 fetch | 3h |
| 7 | 환경변수 6개 추가 + Cloudflare 배포 | 1h |
| 8 | 기존 활성 JWT 강제 만료 + 사용자 재로그인 안내 | 0.5h |
| 9 | E2E 회귀 테스트 | 4h |
| **합계** | | **15.5h** |

### 8.3 패턴만 차용 시 비용

| 단계 | 작업 | 시간 |
|---|---|---|
| 1 | `AuthProvider` interface + Credentials 구현 | 2h |
| 2 | `buildClaims()` composer | 2h |
| 3 | Hook 시스템 (`beforeSignIn` / `afterSignIn` / `onSessionRefresh`) | 2h |
| 4 | events bus (audit log 통합) | 2h |
| 5 | `VerificationToken` 모델 + 헬퍼 | 2h |
| 6 | redirect 검증 헬퍼 | 1h |
| 7 | 테스트 | 3h |
| **합계** | | **14h** (전면 대비 -1.5h, 락인 0) |

**권장**: **패턴만 차용** — 라이브러리 대비 비용 비슷하지만 자유도/유지보수성 우월.

---

## 9. 코드 예시: Auth.js 패턴을 우리 프로젝트에 직접 이식

### 9.1 Provider 인터페이스

```typescript
// /lib/auth/providers/types.ts
export interface AuthProvider<TInput = unknown, TProfile = unknown> {
  id: string;
  name: string;
  type: "credentials" | "oauth" | "oidc" | "email";
  authorize?: (input: TInput) => Promise<{ user: User } | null>;
  oauthFlow?: {
    authorizationUrl: string;
    tokenUrl: string;
    userInfoUrl: string;
    scope: string;
    profile: (raw: TProfile) => Partial<User>;
  };
}
```

### 9.2 Hook + Events 시스템

```typescript
// /lib/auth/hooks.ts
type Hook<T> = (ctx: T) => Promise<void | boolean>;

class HookRegistry {
  private hooks = new Map<string, Hook<unknown>[]>();

  register<T>(name: string, hook: Hook<T>) {
    if (!this.hooks.has(name)) this.hooks.set(name, []);
    this.hooks.get(name)!.push(hook as Hook<unknown>);
  }

  async run<T>(name: string, ctx: T): Promise<boolean> {
    const list = this.hooks.get(name) ?? [];
    for (const h of list) {
      const result = await h(ctx);
      if (result === false) return false; // 중단 신호
    }
    return true;
  }
}

export const authHooks = new HookRegistry();

// 사용
authHooks.register<{ email: string; ip: string }>("beforeSignIn", async (ctx) => {
  await rateLimiter.check(ctx.ip);
  return true;
});

authHooks.register<{ user: User; ip: string }>("afterSignIn", async (ctx) => {
  await audit.log("signin", { userId: ctx.user.id, ip: ctx.ip });
});
```

### 9.3 Claims Composer

```typescript
// /lib/auth/claims.ts
type ClaimsBuilder<T = unknown> = (user: User) => T | Promise<T>;

const builders: ClaimsBuilder[] = [];

export function registerClaim(builder: ClaimsBuilder) {
  builders.push(builder);
}

export async function buildClaims(user: User) {
  const result: Record<string, unknown> = {
    sub: user.id,
    email: user.email,
    role: user.role,
    iat: Math.floor(Date.now() / 1000),
  };
  for (const b of builders) {
    Object.assign(result, await b(user));
  }
  return result;
}

// 등록
registerClaim(async (user) => {
  const kitchen = await prisma.kitchen.findFirst({ where: { ownerId: user.id } });
  return kitchen ? { kid: kitchen.id, owner: true } : {};
});
```

### 9.4 통합 로그인 핸들러

```typescript
// /app/api/auth/login/route.ts
import { authHooks } from "@/lib/auth/hooks";
import { buildClaims } from "@/lib/auth/claims";
import { createSession, setSessionCookie } from "@/lib/auth/session"; // Lucia 패턴
import { issueJWT } from "@/lib/auth/jwt";

export async function POST(req: Request) {
  const { email, password } = await req.json();
  const ip = req.headers.get("x-forwarded-for") ?? "";
  const ua = req.headers.get("user-agent") ?? "";

  const allowed = await authHooks.run("beforeSignIn", { email, ip });
  if (!allowed) return Response.json({ error: "Blocked" }, { status: 429 });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !await verify(user.passwordHash, password)) {
    return Response.json({ error: "Invalid" }, { status: 401 });
  }

  const session = await createSession(user.id, { ip, ua });
  setSessionCookie(session.id, session.expiresAt);

  const claims = await buildClaims(user);
  const jwt = await issueJWT(claims); // 외부 API 호출용 (선택)

  await authHooks.run("afterSignIn", { user, ip });

  return Response.json({ ok: true, jwt });
}
```

---

## 10. Round 2 공통 10차원 스코어링

| # | 차원 | 점수 | 근거 |
|---|---|---|---|
| 1 | 우리 갭 적합도 | 4.0 | Hooks·Custom claims·Account linking 4개 갭 직접 해소 |
| 2 | 마이그레이션 비용 | 2.5 | 전면 채용 15.5h, 활성 사용자 재로그인 필요 |
| 3 | 운영 안정성 (Long-term) | 4.0 | Vercel 후원, 안정 GA, v7 로드맵 명확 |
| 4 | 커뮤니티 / 생태계 | 4.5 | GitHub 24k stars, Provider 30+, 활발 |
| 5 | 보안 모델 (위협 대응) | 4.0 | CSRF 자동, signIn callback로 정책 강제 |
| 6 | Next.js 16 통합 | 4.5 | RSC/Server Action 1급 시민 |
| 7 | 학습 곡선 | 2.5 | callback 5종 + Adapter 모델 + Edge 제약 → 가파름 |
| 8 | 확장성 (Org/Team/SCIM) | 2.5 | 직접 작성 필요, 다만 패턴 가이드는 풍부 |
| 9 | 테스트 용이성 | 3.0 | adapter 모킹 가능하나 callback chain 테스트 복잡 |
| 10 | 프로젝트 한국어/i18n 적합 | 3.0 | 영어 중심, Naver/Kakao Provider 직접 작성 |
| **평균** | | **3.45** | |

> 보정: §0의 3.18은 패턴 차용(라이브러리 미채용) 시나리오 평균. 라이브러리 전면 채용 시 3.45.

---

## 11. 결론 청사진

### 11.1 권장 결정

**패턴 차용 + 자체 구현** (Lucia §5와 결합).

이유:
1. Auth.js 라이브러리는 우리 규모/도메인에 과잉
2. 한국 OAuth(Naver/Kakao) 직접 작성 부담은 어차피 동일
3. callback/hook/claims composer 패턴은 라이브러리 없이 더 명확하게 작성 가능
4. v6 → v7 마이그레이션 부담 회피

### 11.2 채용할 패턴 (우선순위)

1. **Provider 인터페이스** — Credentials + Naver + Kakao + Google 4종
2. **Claims Composer** — 중앙화된 JWT/Session payload 빌더
3. **Hook 시스템** — `beforeSignIn` / `afterSignIn` / `onSessionRefresh` / `beforeSignOut`
4. **Events Bus** — audit log·analytics 통합
5. **VerificationToken 모델** — 이메일 인증·비밀번호 재설정·magic link 통합
6. **redirect 검증** — open-redirect 방어
7. **CSRF 토큰** — double-submit 패턴

### 11.3 채용하지 않을 패턴

- Auth.js의 `Account` 자동 linking (우리는 단일 직원 계정 모델)
- Database 세션 모드 (Lucia 패턴 §5 사용)
- Edge runtime adapter (Node runtime로 충분)

### 11.4 통합 로드맵 (Lucia + Auth.js 패턴 결합)

| Phase | 작업 | 출처 패턴 |
|---|---|---|
| A | Session 테이블 + opaque ID | Lucia |
| B | Hook 시스템 + Claims Composer | Auth.js |
| C | Naver/Kakao Provider 추가 | Auth.js |
| D | VerificationToken (이메일 인증) | Auth.js + GoTrue |
| E | Org/Team 모델 | 자체 |
| F | MFA (TOTP) | 자체 (otplib) |

---

## 12. 잠정 DQ (Deferred Questions)

1. **DQ-AJS-1**: Naver OAuth client_secret 발급 절차 — 비즈니스 사업자 인증 필요한가?
2. **DQ-AJS-2**: Account linking 시 같은 이메일 다른 provider 정책 — 자동 link vs 수동 confirm?
3. **DQ-AJS-3**: jwt callback의 trigger:"update" 패턴을 우리 자체 구현에서 어떻게 노출? (`/api/auth/refresh`?)
4. **DQ-AJS-4**: Edge runtime에서 Prisma 호출 → Cloudflare Workers 환경에서 Accelerate 필요?
5. **DQ-AJS-5**: 직원 계정에 다중 OAuth provider 연결 허용? (개인 Google + 회사 카카오워크?)
6. **DQ-AJS-6**: events callback의 비동기 실패 처리 — fire-and-forget vs await?

---

## 13. 참고 (10+ 자료)

1. Auth.js 공식 문서 (v6) — https://authjs.dev/
2. Auth.js v6 release notes (2025-11) — https://github.com/nextauthjs/next-auth/releases
3. NextAuth → Auth.js rebrand FAQ — https://authjs.dev/getting-started/migrating-to-v5
4. `@auth/prisma-adapter` README — https://authjs.dev/reference/adapter/prisma
5. Naver Developers OAuth 2.0 — https://developers.naver.com/docs/login/api/api.md
6. Kakao Developers OAuth 2.0 — https://developers.kakao.com/docs/latest/ko/kakaologin/common
7. OWASP CSRF Prevention Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
8. RFC 6749 OAuth 2.0 — https://www.rfc-editor.org/rfc/rfc6749
9. RFC 7519 JSON Web Token — https://www.rfc-editor.org/rfc/rfc7519
10. Vercel "Auth.js + Next.js 15 patterns" 블로그 — https://vercel.com/blog
11. Supabase GoTrue 소스 — https://github.com/supabase/gotrue
12. BoxyHQ Jackson SCIM — https://boxyhq.com/docs/jackson/overview
13. otplib (TOTP) — https://github.com/yeojz/otplib
14. 세션 14 갭 분석 (자체) — `docs/references/_PROJECT_VS_SUPABASE_GAP.md`
15. Auth Core 스파이크 노트 (자체) — `docs/research/spikes/spike-005-auth.md`

---

## 14. 부록: Provider 추가 체크리스트

새 OAuth provider 추가 시:

- [ ] provider 등록 + 콘솔에서 client_id/secret 발급
- [ ] redirect URI 등록 (`https://stylelucky4u.com/api/auth/callback/{provider}`)
- [ ] `AuthProvider` 인터페이스 구현 (authorizationUrl, tokenUrl, userInfoUrl, profile)
- [ ] CSRF state token 생성/검증
- [ ] Account linking 시 이메일 충돌 정책 결정
- [ ] error UI (`/login?error={code}`) 처리
- [ ] 환경변수 문서화 (`.env.example`)
- [ ] E2E 테스트 (mock OAuth server)
- [ ] 보안 리뷰 (token 저장 위치, scope 최소화)

---

(문서 끝 — 528 lines)
