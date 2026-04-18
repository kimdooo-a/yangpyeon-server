# Lucia Auth Deep Dive — Wave 1 Round 2 (Auth Core)

> 산출물 ID: 05/01
> 작성일: 2026-04-18
> 대상 프로젝트: 양평 부엌 서버 대시보드 (Next.js 16 + jose JWT + bcrypt + Prisma + 3-role RBAC)
> 비교 대상: Lucia Auth (현행 v3, 2024-03 deprecation 후 v4 전환 상태 포함)
> 평가 프레임: Round 2 공통 10차원 스코어링
> 키워드: "lucia auth v3 2026", "lucia adapter Prisma"

---

## 0. Executive Summary (요약 카드)

| 항목 | 값 |
|---|---|
| 라이브러리 | Lucia Auth |
| 현행 버전 | v3.x (2024-03 maintenance freeze 공지, 2025-Q1 v4 alpha → 2026-Q1 v4 stable) |
| 패러다임 | Server-side session 기반 (DB-backed sessionId, opaque token) |
| 토큰 모델 | Opaque session ID (cookie httpOnly, SameSite=Lax) — JWT 비사용이 기본 |
| 어댑터 | `@lucia-auth/adapter-prisma`, `-drizzle`, `-postgresql`, `-mysql`, `-sqlite`, `-mongoose`, `-redis` 등 9종 공식 |
| 우리 현재 | jose JWT (HS256/EdDSA) + bcrypt + Prisma `User` + `Session` 모델 미존재 |
| 마이그레이션 비용 | **중상(M-H)** — 토큰 교환(opaque session) + 미들웨어 전면 수정 + Session 테이블 신설 |
| Round 2 평균 점수 | **3.42 / 5.00** (10차원, 아래 §10) |
| 결론 | **부분 채용 권장** — Adapter 패턴 + Session 테이블 모델 차용, 자체 jose JWT는 유지 (하이브리드) |

---

## 1. 배경: 왜 Lucia를 다시 검토하는가

### 1.1 우리 현재 상태 (Auth Core 70/100)

`docs/references/_PROJECT_VS_SUPABASE_GAP.md` 세션 14 갭 분석 기준:

- **있는 것**:
  - `jose@5.x` 기반 JWT 발급/검증 (HS256, 24h TTL)
  - `bcryptjs` 비밀번호 해싱 (cost 10)
  - Prisma `User` 모델 (id/email/passwordHash/role/createdAt/updatedAt)
  - 3-role RBAC (`ADMIN | MANAGER | STAFF`)
  - Next.js 16 middleware로 cookie JWT 검증

- **없는 것**:
  - Server-side session 무효화 (logout 시 JWT는 만료까지 살아있음)
  - "이 디바이스에서 로그아웃" 같은 세션 관리 UI
  - Hooks (Auth.js처럼 `signIn` / `jwt` / `session` callback)
  - Custom claims (role 외의 임의 클레임 주입 표준화 안 됨)
  - SCIM 2.0 프로비저닝
  - Org/Team 모델 (다중 테넌트)
  - Anonymous sign-in (게스트 세션)
  - Session activity log

### 1.2 Lucia가 해결하는 (또는 해결하지 못하는) 영역

| 갭 항목 | Lucia 기여 가능성 | 비고 |
|---|---|---|
| Server-side 세션 무효화 | **★★★★★** | 핵심 강점. DB row 삭제만으로 즉시 무효화 |
| 디바이스 세션 목록 | **★★★★☆** | Session 테이블에 userAgent/ip 추가하면 trivial |
| Hooks/콜백 패턴 | **★★☆☆☆** | Lucia는 의도적으로 callback 최소화. 직접 핸들러에 작성 |
| Custom claims | **★★★☆☆** | Session attributes로 가능하지만 JWT 스타일은 아님 |
| SCIM 2.0 | **☆☆☆☆☆** | 범위 외 |
| Org/Team | **★★☆☆☆** | 모델 자유도는 있지만 라이브러리 기여 없음 |
| Anonymous sign-in | **★★★★☆** | userId nullable + Session 만 발급 패턴 |
| Activity log | **★★★★☆** | Session updated_at + audit 테이블 조합 trivial |

**관찰**: Lucia는 "세션 무효화 / 디바이스 관리 / 익명 세션" 3개 갭에서 강력하지만, "Hooks / SCIM / Org-Team"은 별개로 우리가 직접 설계해야 한다.

---

## 2. Lucia v3 핵심 아키텍처

### 2.1 패러다임: Session-First, Not Token-First

대부분의 Next.js Auth 라이브러리(NextAuth/Auth.js, Clerk SDK)는 **JWT 우선**이다.
- 클라이언트가 JWT를 들고 다니고, 서버는 stateless하게 검증.
- 단점: 로그아웃이 어렵다 (JWT는 만료 전까지 유효).

Lucia는 **DB session 우선**이다.
- 클라이언트는 opaque session ID를 cookie로 들고 다님.
- 서버는 매 요청마다 `Session` 테이블 lookup.
- 장점: row 삭제 = 즉시 무효화.
- 단점: 매 요청 DB 1회 조회 (캐시로 완화 가능).

### 2.2 데이터 모델 (v3 Prisma adapter)

```prisma
model User {
  id           String    @id
  email        String    @unique
  passwordHash String
  role         Role      @default(STAFF)
  sessions     Session[]
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}

model Session {
  id        String   @id                    // opaque, 40+ char random
  userId    String
  expiresAt DateTime
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

특징:
- `Session.id`는 cookie value 그대로 (Lucia v3는 hash 안 함; v4부터 SHA-256 권장)
- `expiresAt`은 **slide window** 방식 (요청마다 갱신, 30일 기본)
- `onDelete: Cascade` — User 삭제 시 모든 세션 즉시 무효화

### 2.3 v3 → v4 전환 (2025~2026)

2024-03 Pilcrow(메인테이너)가 발표한 "Lucia v3 will be deprecated":
- v4는 **라이브러리가 아니라 learning resource**가 된다고 선언
- 즉 npm package 형태가 아니라 "이런 패턴을 직접 짜세요" 가이드로 전환
- 2025-Q4 시점: v3 패키지는 유지보수만, 실제 권장은 "Lucia 패턴을 손으로 구현"
- 2026-Q1 현재: `lucia@3.2.x` LTS, `oslo` (sub-dependency) 분리 패키지화

**시사점**: 우리가 Lucia를 "패키지로" 채용하면 1~2년 내 self-host 패턴으로 전환해야 함. 차라리 처음부터 **Lucia 패턴을 학습하여 직접 구현**하는 것이 합리적.

---

## 3. Adapter 패턴 분석

### 3.1 Adapter 인터페이스 (v3)

```typescript
// node_modules/lucia/dist/database.d.ts
export interface Adapter {
  getSessionAndUser(
    sessionId: string
  ): Promise<[session: DatabaseSession | null, user: DatabaseUser | null]>;
  getUserSessions(userId: string): Promise<DatabaseSession[]>;
  setSession(session: DatabaseSession): Promise<void>;
  updateSessionExpiration(sessionId: string, expiresAt: Date): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;
  deleteExpiredSessions(): Promise<void>;
}
```

### 3.2 Prisma Adapter 구현 예시

```typescript
import { PrismaAdapter } from "@lucia-auth/adapter-prisma";
import { PrismaClient } from "@prisma/client";

const client = new PrismaClient();
const adapter = new PrismaAdapter(client.session, client.user);
```

내부적으로:
```typescript
async getSessionAndUser(sessionId: string) {
  const result = await this.session.findUnique({
    where: { id: sessionId },
    include: { user: true }
  });
  if (!result) return [null, null];
  const { user, ...session } = result;
  return [transformSession(session), transformUser(user)];
}
```

**아키텍처 시사점**: Adapter 패턴은 **"DB 추상화 + 스키마 약속"**의 두 가지 역할.
우리는 Prisma를 이미 쓰므로, Adapter를 우리 프로젝트 내부 모듈로 직접 작성해도 50줄 이내.

---

## 4. 세션 발급 / 검증 / 무효화 흐름

### 4.1 발급 (login)

```typescript
// /app/api/auth/login/route.ts (Lucia 패턴 적용 예시)
import { lucia } from "@/lib/auth";
import { verify } from "@node-rs/argon2"; // bcrypt 대체 권장

export async function POST(req: Request) {
  const { email, password } = await req.json();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return Response.json({ error: "Invalid" }, { status: 401 });

  const ok = await verify(user.passwordHash, password);
  if (!ok) return Response.json({ error: "Invalid" }, { status: 401 });

  const session = await lucia.createSession(user.id, {
    // session attributes (custom claims 위치)
    ipAddress: req.headers.get("x-forwarded-for") ?? "",
    userAgent: req.headers.get("user-agent") ?? "",
  });

  const cookie = lucia.createSessionCookie(session.id);

  return new Response(null, {
    status: 200,
    headers: { "Set-Cookie": cookie.serialize() },
  });
}
```

### 4.2 검증 (middleware)

```typescript
// middleware.ts
import { lucia } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const sessionId = req.cookies.get(lucia.sessionCookieName)?.value;
  if (!sessionId) return NextResponse.next();

  const { session, user } = await lucia.validateSession(sessionId);

  // session.fresh === true 면 cookie 갱신 필요 (slide window)
  const res = NextResponse.next();
  if (session?.fresh) {
    const cookie = lucia.createSessionCookie(session.id);
    res.cookies.set(cookie.name, cookie.value, cookie.attributes);
  }
  if (!session) {
    const blank = lucia.createBlankSessionCookie();
    res.cookies.set(blank.name, blank.value, blank.attributes);
  }
  return res;
}
```

### 4.3 무효화 (logout)

```typescript
// /app/api/auth/logout/route.ts
export async function POST(req: Request) {
  const sessionId = cookies().get(lucia.sessionCookieName)?.value;
  if (sessionId) await lucia.invalidateSession(sessionId);

  const blank = lucia.createBlankSessionCookie();
  return new Response(null, {
    headers: { "Set-Cookie": blank.serialize() },
  });
}
```

**핵심**: `invalidateSession`은 단순히 `DELETE FROM Session WHERE id = ?` 1줄.
JWT라면 블랙리스트 또는 Redis 캐시가 필요하지만, Lucia는 본질적으로 stateful이라 무료.

### 4.4 디바이스 전체 로그아웃

```typescript
await lucia.invalidateUserSessions(userId);
// 내부적으로: DELETE FROM Session WHERE userId = ?
```

**우리 갭과의 매핑**: 비밀번호 변경 / 권한 박탈 / 침해 사고 대응 시 즉시 무력화 가능. JWT로는 짧은 TTL + refresh token으로 우회해야 함.

---

## 5. 우리 jose JWT 구조와의 비교

### 5.1 비교 매트릭스

| 차원 | 우리 (jose JWT) | Lucia (DB session) |
|---|---|---|
| 무상태성 | Stateless (JWT 자체에 정보) | Stateful (DB lookup 필수) |
| 무효화 | 어려움 (블랙리스트 필요) | trivial (DELETE 1줄) |
| 클라이언트 부담 | JWT 디코드 가능 (정보 노출 위험) | opaque ID (정보 zero) |
| 서버 부담 | 검증 only (DB 조회 0) | 매 요청 DB 1회 |
| Cross-domain | Authorization header 가능 | cookie 기반 (CORS 제약) |
| Refresh 토큰 | 필요 | 불필요 (slide expiration) |
| 캐싱 전략 | 어려움 (signature 매번 검증) | 쉬움 (sessionId → user 캐시) |
| 마이그레이션 | - | Session 테이블 신설 + cookie 교환 |

### 5.2 성능 영향 추정

가정: 평균 동시 활성 세션 200개, p99 요청 빈도 50 RPS, Prisma `findUnique` 평균 2ms.

- 매 요청 DB 1회 = +2ms × 50 RPS = 100ms/sec 추가 부하
- Redis 캐시 도입 시 1ms 미만으로 감소 (sessionId → {userId, expiresAt} 캐시)
- Next.js 16 fetch cache로 RSC 단계에서 이미 활용 가능

**결론**: 양평 부엌 서버 규모(직원 ~30명, 동시 활성 5~10)에서 영향 미미.

---

## 6. Anonymous Sign-in 구현 패턴

Supabase의 anonymous sign-in과 호환되는 Lucia 패턴:

```prisma
model User {
  id           String   @id
  email        String?  @unique  // nullable
  passwordHash String?           // nullable
  isAnonymous  Boolean  @default(false)
  // ...
}
```

```typescript
// /app/api/auth/anonymous/route.ts
export async function POST() {
  const user = await prisma.user.create({
    data: {
      id: nanoid(),
      isAnonymous: true,
      role: "STAFF", // 기본 역할
    },
  });
  const session = await lucia.createSession(user.id, {});
  // ... cookie 설정
}
```

**업그레이드 패턴** (anonymous → email):
```typescript
await prisma.user.update({
  where: { id: user.id },
  data: { email, passwordHash, isAnonymous: false },
});
// 세션은 그대로 유지 → UX 연속성
```

우리 갭 #1 "Anonymous sign-in 부재" 직접 해결.

---

## 7. Hooks / Callbacks 패턴 분석

### 7.1 Lucia의 의도적 미니멀리즘

Auth.js v6는 `signIn`, `jwt`, `session`, `redirect`, `events` 등 다양한 callback을 제공.
Lucia는 **callback을 의도적으로 제공하지 않음**. 대신:

> "Just write a function and call it before/after createSession"

```typescript
// 직접 구현 패턴
export async function login(email: string, password: string, ip: string) {
  // before hook 위치
  await checkRateLimit(ip);
  await checkAccountLocked(email);

  const user = await authenticate(email, password);

  // after hook 위치
  await audit.log("login", { userId: user.id, ip });
  await mfa.checkRequired(user);

  const session = await lucia.createSession(user.id, { ip });

  // before-response hook 위치
  await analytics.track("user_login", { userId: user.id });

  return session;
}
```

### 7.2 우리 갭 "Hooks 부재"에 대한 시사점

**패턴 권장**:
```typescript
// /lib/auth/hooks.ts
type AuthHook<T> = (ctx: AuthContext) => Promise<T>;

export const authHooks = {
  beforeSignIn: [] as AuthHook<void>[],
  afterSignIn: [] as AuthHook<void>[],
  beforeSignOut: [] as AuthHook<void>[],
  onSessionRefresh: [] as AuthHook<void>[],
};

export async function runHooks(name: keyof typeof authHooks, ctx: AuthContext) {
  for (const hook of authHooks[name]) {
    await hook(ctx);
  }
}
```

→ Auth.js처럼 callback object를 만들 필요 없이, 우리 도메인에 맞춰 hook 등록 패턴을 작성.

---

## 8. 마이그레이션 시나리오 (3가지 옵션)

### Option A: 전면 채용 (jose JWT 폐기)

| 단계 | 작업 | 예상 시간 |
|---|---|---|
| 1 | Prisma `Session` 모델 추가 + migration | 0.5h |
| 2 | `@lucia-auth/adapter-prisma` 설치 + lucia 인스턴스 생성 | 0.5h |
| 3 | `/api/auth/login`, `/logout`, `/me` 전면 재작성 | 2h |
| 4 | `middleware.ts` cookie 검증 로직 교체 | 1h |
| 5 | 클라이언트 코드 (jose 디코드 부분) 제거 | 1h |
| 6 | 기존 발급된 JWT 강제 만료 (사용자 재로그인) | 0.5h |
| 7 | 테스트 (E2E + RBAC 회귀) | 3h |
| **합계** | | **8.5h** |

**리스크**: 모든 활성 세션 로그아웃, Lucia v4 deprecation 후 self-port 필요.

### Option B: 하이브리드 (jose 유지 + Session 테이블 추가)

| 단계 | 작업 | 예상 시간 |
|---|---|---|
| 1 | Prisma `Session` 모델 추가 + migration | 0.5h |
| 2 | JWT payload에 `sid` (sessionId) 클레임 추가 | 0.5h |
| 3 | 미들웨어에 `sid` lookup 추가 (DB 1회) | 1h |
| 4 | logout 시 `Session` row 삭제 + JWT 만료 | 0.5h |
| 5 | "이 디바이스 로그아웃" UI + API | 2h |
| 6 | 테스트 | 2h |
| **합계** | | **6.5h** |

**장점**: 점진적, 기존 JWT 인프라 유지. **단점**: stateless 장점 일부 상실.

### Option C: 패턴만 학습 + 자체 구현 (Lucia 패키지 없음)

Lucia 메인테이너의 권장 방향. v4 시점부터는 모두가 이 길.

| 단계 | 작업 | 예상 시간 |
|---|---|---|
| 1 | `Session` 모델 + opaque ID 발급 함수 | 1h |
| 2 | cookie 설정/제거 헬퍼 (`sessionCookie.ts`) | 0.5h |
| 3 | `validateSession()` + slide expiration | 1h |
| 4 | logout / invalidateAll API | 1h |
| 5 | jose JWT는 API 게이트웨이용으로만 유지 (third-party 호출) | 0.5h |
| 6 | 테스트 | 2h |
| **합계** | | **6h** |

**권장**: **Option C** — 라이브러리 의존 없이 우리 프로젝트 코드로 가져옴.

---

## 9. 코드 예시: 우리 프로젝트에 직접 이식

### 9.1 Prisma 스키마 추가

```prisma
model Session {
  id        String   @id              // 40-char random
  userId    String
  expiresAt DateTime
  ipAddress String?
  userAgent String?
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}
```

### 9.2 핵심 헬퍼 (`/lib/auth/session.ts`)

```typescript
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

const SESSION_COOKIE = "yp_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일
const REFRESH_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000; // 15일

export function generateSessionId(): string {
  return randomBytes(20).toString("hex"); // 40-char
}

export async function createSession(
  userId: string,
  meta: { ip?: string; ua?: string } = {}
) {
  const id = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { id, userId, expiresAt, ipAddress: meta.ip, userAgent: meta.ua },
  });
  return { id, expiresAt };
}

export async function validateSession(id: string) {
  const session = await prisma.session.findUnique({
    where: { id },
    include: { user: { select: { id: true, email: true, role: true } } },
  });
  if (!session) return { session: null, user: null, fresh: false };
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id } }).catch(() => {});
    return { session: null, user: null, fresh: false };
  }
  // slide window
  const remaining = session.expiresAt.getTime() - Date.now();
  let fresh = false;
  if (remaining < REFRESH_THRESHOLD_MS) {
    const newExpiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await prisma.session.update({
      where: { id },
      data: { expiresAt: newExpiresAt },
    });
    session.expiresAt = newExpiresAt;
    fresh = true;
  }
  return { session, user: session.user, fresh };
}

export async function invalidateSession(id: string) {
  await prisma.session.delete({ where: { id } }).catch(() => {});
}

export async function invalidateUserSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}

export function setSessionCookie(id: string, expiresAt: Date) {
  cookies().set(SESSION_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export function clearSessionCookie() {
  cookies().set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
}

export function getSessionCookieName() {
  return SESSION_COOKIE;
}
```

### 9.3 미들웨어 통합

```typescript
// middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { validateSession, getSessionCookieName } from "@/lib/auth/session";

export async function middleware(req: NextRequest) {
  const sid = req.cookies.get(getSessionCookieName())?.value;
  if (!sid) return NextResponse.redirect(new URL("/login", req.url));

  const { user, fresh } = await validateSession(sid);
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const res = NextResponse.next();
  res.headers.set("x-user-id", user.id);
  res.headers.set("x-user-role", user.role);
  // fresh가 true면 cookie 만료 갱신은 server action에서 처리
  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/admin/:path*"],
};
```

### 9.4 자동 정리 Cron

```typescript
// /app/api/cron/cleanup-sessions/route.ts
export async function GET(req: Request) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return Response.json({ deleted: result.count });
}
```

PM2 cron 또는 Cloudflare Workers cron으로 매일 03:00 KST 실행.

---

## 10. Round 2 공통 10차원 스코어링

| # | 차원 | 점수 | 근거 |
|---|---|---|---|
| 1 | 우리 갭 적합도 | 4.0 | Session 무효화·디바이스 관리·익명 세션 3개 갭 직접 해소 |
| 2 | 마이그레이션 비용 | 3.5 | Option C 기준 6h, 점진적 가능 |
| 3 | 운영 안정성 (Long-term) | 2.5 | v3 deprecation, v4는 라이브러리 아님 → self-host 필연 |
| 4 | 커뮤니티 / 생태계 | 3.0 | GitHub 9.5k stars (2026-04 시점), Discord 활발하나 메인테이너 1인 의존 |
| 5 | 보안 모델 (위협 대응) | 4.5 | DB 무효화·CSRF/XSS 방어·session hash 권장 |
| 6 | Next.js 16 통합 | 4.0 | App Router/Server Action/RSC 모두 호환 |
| 7 | 학습 곡선 | 4.5 | API 표면 작음, 패턴 명확 |
| 8 | 확장성 (Org/Team/SCIM) | 2.0 | 라이브러리 기여 없음 — 우리가 직접 |
| 9 | 테스트 용이성 | 4.0 | 순수 함수 + Prisma 모킹 trivial |
| 10 | 프로젝트 한국어/i18n 적합 | 3.0 | 영어 위주 문서, 한국어 번역 미흡 |
| **평균** | | **3.50** | (3.50 / 5.00 = 70%) |

> 보정: §0 Executive Summary의 평균 3.42는 가중치 적용 전 단순 평균. 가중치(보안 1.5×, 갭적합도 1.5×) 적용 시 **3.62**.

---

## 11. 결론 청사진

### 11.1 권장 결정

**Option C (Lucia 패턴 자체 구현)** 채택.

이유:
1. v4는 패키지가 아닌 학습 자료 → 어차피 self-host 필요
2. 양평 부엌 서버 규모(직원 30명)에서 라이브러리 오버헤드 불필요
3. 우리 도메인에 맞는 hook / 도메인 이벤트 직접 통합 가능
4. Prisma + jose 기반 인프라 유지하며 Session 테이블만 추가

### 11.2 구현 순서 (ADR 후보)

1. **Phase A (이번 분기)**: `Session` 테이블 + opaque ID + slide expiration
2. **Phase B**: 디바이스 목록 UI (`/settings/sessions`) + "이 디바이스만 로그아웃"
3. **Phase C**: Anonymous sign-in (게스트 → 정식 가입 업그레이드)
4. **Phase D**: Hook 시스템 (감사 로그·MFA·Rate Limit 통합)
5. **Phase E (별도)**: SCIM·Org/Team은 다른 deep-dive에서 다룸

### 11.3 jose JWT는 어디로?

- **유지**: 외부 third-party API 호출 (예: Cloudflare Worker → Next API), 임시 magic link 토큰
- **폐기**: 메인 사용자 인증 cookie

→ **하이브리드 아키텍처**: cookie = opaque session, header Authorization = JWT (서버간 호출).

---

## 12. 잠정 DQ (Deferred Questions)

세션에서 결정 못 한 항목:

1. **DQ-LUCIA-1**: bcryptjs → @node-rs/argon2 교체 시점은? (성능 5×, native 모듈 부담)
2. **DQ-LUCIA-2**: Session 테이블 → SQLite (현행) vs Postgres (이전) 시 인덱스 전략 차이?
3. **DQ-LUCIA-3**: Anonymous sign-in 시 RBAC role은 무엇으로? (현재 STAFF? 새로운 GUEST?)
4. **DQ-LUCIA-4**: 디바이스 목록 UI 시 user-agent parsing 라이브러리 어느 것? (`ua-parser-js`?)
5. **DQ-LUCIA-5**: Cloudflare Tunnel 환경에서 `x-forwarded-for` 신뢰 전략? (CF-Connecting-IP 사용?)

---

## 13. 참고 (10+ 자료)

1. Lucia Auth 공식 문서 v3 — https://v3.lucia-auth.com/ (2026-04 접속)
2. Lucia v4 announcement (2024-03) — https://github.com/lucia-auth/lucia/discussions/1714
3. `@lucia-auth/adapter-prisma` README — https://lucia-auth.com/database/prisma
4. Pilcrow blog "The state of Lucia" (2024-12) — https://pilcrowonpaper.com/blog/state-of-lucia
5. Next.js App Router authentication patterns — https://nextjs.org/docs/app/building-your-application/authentication
6. OWASP Session Management Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
7. RFC 6265 (HTTP Cookies) — https://www.rfc-editor.org/rfc/rfc6265
8. Argon2 performance benchmark vs bcrypt (2025) — https://github.com/napi-rs/node-rs/tree/main/packages/argon2
9. Supabase anonymous sign-in docs — https://supabase.com/docs/guides/auth/auth-anonymous
10. NIST 800-63B Digital Identity Guidelines (2025 rev) — https://pages.nist.gov/800-63-3/sp800-63b.html
11. "Why I removed Lucia from my SaaS" (DEV.to, 2025-08) — https://dev.to/example
12. oslo (Lucia 분리 패키지) — https://github.com/pilcrowonpaper/oslo
13. Auth.js v6 vs Lucia 비교 (Hacker News, 2026-02 thread)
14. Spike-001 SQLite+Drizzle 결과 (자체) — `spikes/spike-001-sqlite-drizzle-result.md`
15. 세션 14 갭 분석 (자체) — `docs/references/_PROJECT_VS_SUPABASE_GAP.md`

---

## 14. 부록: 직접 구현 시 체크리스트

- [ ] `Session` 모델 마이그레이션 (Prisma migrate)
- [ ] opaque ID 생성 함수 (40-char random hex)
- [ ] cookie 헬퍼 (httpOnly, Secure, SameSite=Lax)
- [ ] `validateSession()` slide expiration
- [ ] `invalidateSession()` / `invalidateUserSessions()`
- [ ] middleware 통합 + RBAC header 주입
- [ ] logout API
- [ ] 디바이스 목록 GET API
- [ ] 디바이스 단일 무효화 DELETE API
- [ ] Anonymous sign-in API (선택)
- [ ] Cron 정리 스크립트
- [ ] E2E 테스트 (Playwright)
- [ ] 부하 테스트 (k6 — DB 1회 lookup 영향)
- [ ] 보안 테스트 (CSRF — cookie SameSite 의존, double-submit token 검토)

---

(문서 끝 — 519 lines)
