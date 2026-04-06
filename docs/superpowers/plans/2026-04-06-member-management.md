# 회원관리 백엔드 시스템 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WSL2 로컬 PostgreSQL + Prisma 기반 회원 CRUD + RBAC REST API를 구축한다.

**Architecture:** 기존 Next.js API Route 패턴을 확장하여 `/api/v1/` 네임스페이스에 회원 API를 추가. 기존 대시보드 인증(`/api/auth/*`, 쿠키 기반)은 그대로 유지하고, 새 API는 Bearer Token 인증을 사용. 미들웨어에서 `/api/v1/` 경로를 공개로 등록하고, 각 API Route에서 `withAuth`/`withRole` 가드로 인증/인가를 처리.

**Tech Stack:** Next.js 16, Prisma (PostgreSQL), bcrypt, zod, jose (JWT)

---

## 파일 구조

### 새로 생성하는 파일

| 파일 | 책임 |
|------|------|
| `prisma/schema.prisma` | DB 스키마 (User 모델, Role enum) |
| `src/lib/prisma.ts` | Prisma 클라이언트 싱글톤 |
| `src/lib/password.ts` | bcrypt 해싱/검증 |
| `src/lib/jwt-v1.ts` | v1 API용 JWT 생성/검증 (Bearer Token) |
| `src/lib/api-guard.ts` | withAuth, withRole 미들웨어 |
| `src/lib/api-response.ts` | 공통 응답 헬퍼 (success, error, paginated) |
| `src/lib/schemas/auth.ts` | 인증 관련 Zod 스키마 |
| `src/lib/schemas/member.ts` | 회원 관련 Zod 스키마 |
| `src/app/api/v1/auth/register/route.ts` | POST 회원가입 |
| `src/app/api/v1/auth/login/route.ts` | POST 로그인 |
| `src/app/api/v1/auth/logout/route.ts` | POST 로그아웃 |
| `src/app/api/v1/auth/me/route.ts` | GET/PUT 내 정보 |
| `src/app/api/v1/auth/password/route.ts` | PUT 비밀번호 변경 |
| `src/app/api/v1/members/route.ts` | GET 회원 목록 |
| `src/app/api/v1/members/[id]/route.ts` | GET/PUT/DELETE 회원 상세 |
| `src/app/api/v1/members/[id]/role/route.ts` | PUT 역할 변경 |
| `src/app/(dashboard)/members/page.tsx` | 회원 목록 UI |
| `src/app/(dashboard)/members/[id]/page.tsx` | 회원 상세 UI |

### 수정하는 파일

| 파일 | 변경 내용 |
|------|-----------|
| `package.json` | prisma, @prisma/client, bcrypt, zod 추가 |
| `src/middleware.ts:6` | PUBLIC_PATHS에 `/api/v1/auth/register`, `/api/v1/auth/login` 추가 |
| `src/middleware.ts:13-17` | v1 API Rate Limit 설정 추가 |
| `src/middleware.ts:35-49` | v1 API 경로는 쿠키 인증 스킵 (Bearer Token은 각 Route에서 처리) |
| `src/lib/rate-limit.ts:72-79` | v1 Rate Limit 설정 추가 |
| `src/components/layout/sidebar.tsx:8-13` | 회원 관리 메뉴 추가 |
| `src/components/ui/icons.tsx` | IconMembers 아이콘 추가 |
| `.env.example` | DATABASE_URL, JWT_V1_SECRET, JWT_V1_REFRESH_SECRET 추가 |

---

## Task 1: 의존성 설치 + Prisma 초기화

**Files:**
- Modify: `package.json`
- Create: `prisma/schema.prisma`
- Create: `src/lib/prisma.ts`
- Modify: `.env.example`

- [ ] **Step 1: 패키지 설치**

```bash
cd E:/00_develop/260406_luckystyle4u_server
npm install prisma @prisma/client bcrypt zod
npm install -D @types/bcrypt
```

- [ ] **Step 2: Prisma 초기화**

```bash
npx prisma init --datasource-provider postgresql
```

이 명령은 `prisma/schema.prisma`와 `.env`에 `DATABASE_URL`을 생성한다. 생성된 schema.prisma를 아래 내용으로 교체.

- [ ] **Step 3: Prisma 스키마 작성**

`prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String    @id @default(uuid())
  email        String    @unique
  passwordHash String    @map("password_hash")
  name         String?
  phone        String?
  role         Role      @default(USER)
  isActive     Boolean   @default(true) @map("is_active")
  lastLoginAt  DateTime? @map("last_login_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  @@map("users")
}

enum Role {
  ADMIN
  MANAGER
  USER
}
```

- [ ] **Step 4: Prisma 클라이언트 싱글톤 작성**

`src/lib/prisma.ts`:
```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 5: .env.example 업데이트**

`.env.example`에 다음 추가:
```env
# === 회원관리 (v1 API) ===
DATABASE_URL="postgresql://user:password@localhost:5432/luckystyle4u"
JWT_V1_SECRET="최소32자이상의시크릿키를여기에입력"
JWT_V1_REFRESH_SECRET="리프레시토큰용별도시크릿키"
```

- [ ] **Step 6: .env.local에 실제 값 설정**

`.env.local`에 실제 PostgreSQL 연결 정보와 시크릿 설정. (커밋하지 않음)

- [ ] **Step 7: DB 마이그레이션 실행**

```bash
npx prisma migrate dev --name init-users
```

Expected: `migrations/` 디렉토리 생성, `users` 테이블 + `Role` enum 생성됨.

- [ ] **Step 8: Prisma Client 생성 확인**

```bash
npx prisma generate
```

Expected: `node_modules/.prisma/client` 생성됨.

- [ ] **Step 9: 커밋**

```bash
git add prisma/ src/lib/prisma.ts package.json package-lock.json .env.example
git commit -m "feat: Prisma 초기화 + User 모델 + PostgreSQL 연결"
```

---

## Task 2: 공통 유틸리티 (password, jwt-v1, api-response, zod 스키마)

**Files:**
- Create: `src/lib/password.ts`
- Create: `src/lib/jwt-v1.ts`
- Create: `src/lib/api-response.ts`
- Create: `src/lib/schemas/auth.ts`
- Create: `src/lib/schemas/member.ts`

- [ ] **Step 1: 비밀번호 해싱 유틸**

`src/lib/password.ts`:
```typescript
import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPasswordHash(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 2: v1 JWT 유틸**

`src/lib/jwt-v1.ts`:
```typescript
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@prisma/client";

const ACCESS_MAX_AGE = 15 * 60; // 15분
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60; // 7일

export const V1_REFRESH_COOKIE = "v1_refresh_token";

function getAccessSecret() {
  const secret = process.env.JWT_V1_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_V1_SECRET 환경변수가 설정되지 않았거나 너무 짧습니다 (최소 32자)");
  }
  return new TextEncoder().encode(secret);
}

function getRefreshSecret() {
  const secret = process.env.JWT_V1_REFRESH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_V1_REFRESH_SECRET 환경변수가 설정되지 않았거나 너무 짧습니다 (최소 32자)");
  }
  return new TextEncoder().encode(secret);
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  type: "access";
}

export interface RefreshTokenPayload {
  sub: string;
  type: "refresh";
}

export async function createAccessToken(payload: {
  userId: string;
  email: string;
  role: Role;
}): Promise<string> {
  return new SignJWT({
    sub: payload.userId,
    email: payload.email,
    role: payload.role,
    type: "access",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_MAX_AGE}s`)
    .sign(getAccessSecret());
}

export async function createRefreshToken(userId: string): Promise<string> {
  return new SignJWT({
    sub: userId,
    type: "refresh",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_MAX_AGE}s`)
    .sign(getRefreshSecret());
}

export async function verifyAccessToken(
  token: string
): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getAccessSecret());
    if (payload.type !== "access") return null;
    return payload as unknown as AccessTokenPayload;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(
  token: string
): Promise<RefreshTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getRefreshSecret());
    if (payload.type !== "refresh") return null;
    return payload as unknown as RefreshTokenPayload;
  } catch {
    return null;
  }
}

export { ACCESS_MAX_AGE, REFRESH_MAX_AGE };
```

- [ ] **Step 3: 공통 API 응답 헬퍼**

`src/lib/api-response.ts`:
```typescript
import { NextResponse } from "next/server";

export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status }
  );
}

export function paginatedResponse<T>(
  data: T[],
  pagination: { page: number; limit: number; total: number }
) {
  return NextResponse.json({
    success: true,
    data,
    pagination: {
      ...pagination,
      totalPages: Math.ceil(pagination.total / pagination.limit),
    },
  });
}
```

- [ ] **Step 4: Zod 인증 스키마**

`src/lib/schemas/auth.ts`:
```typescript
import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email("유효한 이메일을 입력하세요"),
  password: z
    .string()
    .min(8, "비밀번호는 최소 8자입니다")
    .max(100, "비밀번호는 최대 100자입니다"),
  name: z.string().min(1).max(50).optional(),
  phone: z
    .string()
    .regex(/^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/, "유효한 전화번호를 입력하세요")
    .optional(),
});

export const loginSchema = z.object({
  email: z.string().email("유효한 이메일을 입력하세요"),
  password: z.string().min(1, "비밀번호를 입력하세요"),
});

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  phone: z
    .string()
    .regex(/^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/, "유효한 전화번호를 입력하세요")
    .optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "현재 비밀번호를 입력하세요"),
  newPassword: z
    .string()
    .min(8, "새 비밀번호는 최소 8자입니다")
    .max(100, "새 비밀번호는 최대 100자입니다"),
});
```

- [ ] **Step 5: Zod 회원 관리 스키마**

`src/lib/schemas/member.ts`:
```typescript
import { Role } from "@prisma/client";
import { z } from "zod";

export const memberListSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  role: z.nativeEnum(Role).optional(),
  isActive: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

export const updateMemberSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  phone: z
    .string()
    .regex(/^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/, "유효한 전화번호를 입력하세요")
    .optional(),
  isActive: z.boolean().optional(),
});

export const changeRoleSchema = z.object({
  role: z.nativeEnum(Role),
});
```

- [ ] **Step 6: 커밋**

```bash
git add src/lib/password.ts src/lib/jwt-v1.ts src/lib/api-response.ts src/lib/schemas/
git commit -m "feat: 공통 유틸리티 (password, jwt-v1, api-response, zod 스키마)"
```

---

## Task 3: API 가드 (withAuth, withRole)

**Files:**
- Create: `src/lib/api-guard.ts`

- [ ] **Step 1: API 가드 작성**

`src/lib/api-guard.ts`:

> 주의: Bearer Token을 우선 확인하되, 대시보드 쿠키 세션이 있으면 ADMIN으로 fallback.
> 이렇게 하면 대시보드 UI(`/members` 페이지)에서 v1 API를 직접 호출할 수 있다.

```typescript
import { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { verifyAccessToken, type AccessTokenPayload } from "@/lib/jwt-v1";
import { errorResponse } from "@/lib/api-response";
import type { Role } from "@prisma/client";

export type AuthenticatedHandler = (
  request: NextRequest,
  user: AccessTokenPayload,
  context?: { params: Promise<Record<string, string>> }
) => Promise<Response>;

function extractBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

/** 대시보드 쿠키 세션 확인 → ADMIN 페이로드 반환 */
async function checkDashboardSession(
  request: NextRequest
): Promise<AccessTokenPayload | null> {
  const token = request.cookies.get("dashboard_session")?.value;
  if (!token) return null;

  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;

  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    // 대시보드 접근 가능 = ADMIN 권한
    return {
      sub: "dashboard-admin",
      email: "admin@dashboard",
      role: "ADMIN" as Role,
      type: "access",
    };
  } catch {
    return null;
  }
}

export function withAuth(handler: AuthenticatedHandler) {
  return async (
    request: NextRequest,
    context?: { params: Promise<Record<string, string>> }
  ) => {
    // 1. Bearer Token 확인
    const bearerToken = extractBearerToken(request);
    if (bearerToken) {
      const payload = await verifyAccessToken(bearerToken);
      if (payload) return handler(request, payload, context);
      return errorResponse("INVALID_TOKEN", "유효하지 않은 토큰입니다", 401);
    }

    // 2. 대시보드 쿠키 세션 fallback
    const dashboardUser = await checkDashboardSession(request);
    if (dashboardUser) return handler(request, dashboardUser, context);

    return errorResponse("UNAUTHORIZED", "인증 토큰이 필요합니다", 401);
  };
}

export function withRole(roles: Role[], handler: AuthenticatedHandler) {
  return withAuth(async (request, user, context) => {
    if (!roles.includes(user.role)) {
      return errorResponse("FORBIDDEN", "권한이 부족합니다", 403);
    }
    return handler(request, user, context);
  });
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/lib/api-guard.ts
git commit -m "feat: API 가드 (withAuth, withRole) Bearer Token 인증"
```

---

## Task 4: 미들웨어 수정 (v1 경로 처리)

**Files:**
- Modify: `src/middleware.ts`
- Modify: `src/lib/rate-limit.ts`

- [ ] **Step 1: rate-limit.ts에 v1 설정 추가**

`src/lib/rate-limit.ts`의 `RATE_LIMITS` 객체에 추가:
```typescript
export const RATE_LIMITS = {
  api: { maxRequests: 60, windowMs: 60 * 1000 },
  pm2Action: { maxRequests: 10, windowMs: 60 * 1000 },
  login: { maxRequests: 5, windowMs: 60 * 1000 },
  // v1 API
  v1Register: { maxRequests: 5, windowMs: 60 * 1000 },
  v1Login: { maxRequests: 5, windowMs: 60 * 1000 },
  v1Api: { maxRequests: 60, windowMs: 60 * 1000 },
} as const;
```

- [ ] **Step 2: middleware.ts 수정**

`src/middleware.ts`를 다음과 같이 수정:

1. `PUBLIC_PATHS` 배열에 v1 공개 경로 추가:
```typescript
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/v1/auth/register",
  "/api/v1/auth/login",
  "/api/v1/auth/logout",
];
```

2. `getRateLimitConfig` 함수에 v1 경로 추가:
```typescript
function getRateLimitConfig(pathname: string, method: string) {
  if (pathname === "/api/auth/login") return RATE_LIMITS.login;
  if (pathname === "/api/v1/auth/register") return RATE_LIMITS.v1Register;
  if (pathname === "/api/v1/auth/login") return RATE_LIMITS.v1Login;
  if (pathname.startsWith("/api/v1/")) return RATE_LIMITS.v1Api;
  if (pathname.match(/^\/api\/pm2\/\w+$/) && method === "POST") return RATE_LIMITS.pm2Action;
  if (pathname.startsWith("/api/")) return RATE_LIMITS.api;
  return null;
}
```

3. 인증 체크 블록에서 `/api/v1/` 경로는 쿠키 인증 스킵 (Bearer Token은 각 Route에서 처리):
```typescript
  if (!isPublic) {
    // v1 API는 각 Route에서 Bearer Token 인증 처리
    if (pathname.startsWith("/api/v1/")) {
      // 쿠키 인증 스킵, Rate Limit + CORS만 적용
    } else {
      // 기존 대시보드 쿠키 인증
      const token = request.cookies.get(COOKIE_NAME)?.value;
      if (!token) {
        return redirectToLogin(request);
      }
      try {
        const secret = process.env.AUTH_SECRET;
        if (!secret) return redirectToLogin(request);
        await jwtVerify(token, new TextEncoder().encode(secret));
      } catch {
        return redirectToLogin(request);
      }
    }
  }
```

- [ ] **Step 3: 빌드 확인**

```bash
npm run build
```

Expected: 빌드 성공, 기존 기능 영향 없음.

- [ ] **Step 4: 커밋**

```bash
git add src/middleware.ts src/lib/rate-limit.ts
git commit -m "feat: 미들웨어에 v1 API 경로 처리 추가 (공개경로, Rate Limit, 쿠키인증 스킵)"
```

---

## Task 5: 회원가입 API

**Files:**
- Create: `src/app/api/v1/auth/register/route.ts`

- [ ] **Step 1: 회원가입 Route 작성**

`src/app/api/v1/auth/register/route.ts`:
```typescript
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { registerSchema } from "@/lib/schemas/auth";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message ?? "입력값이 올바르지 않습니다";
    return errorResponse("VALIDATION_ERROR", message, 400);
  }

  const { email, password, name, phone } = parsed.data;

  // 이메일 중복 확인
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return errorResponse("EMAIL_EXISTS", "이미 사용 중인 이메일입니다", 409);
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: { email, passwordHash, name, phone },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  return successResponse(user, 201);
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/api/v1/auth/register/
git commit -m "feat: POST /api/v1/auth/register 회원가입 API"
```

---

## Task 6: 로그인 API

**Files:**
- Create: `src/app/api/v1/auth/login/route.ts`

- [ ] **Step 1: 로그인 Route 작성**

`src/app/api/v1/auth/login/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPasswordHash } from "@/lib/password";
import { loginSchema } from "@/lib/schemas/auth";
import {
  createAccessToken,
  createRefreshToken,
  V1_REFRESH_COOKIE,
  REFRESH_MAX_AGE,
} from "@/lib/jwt-v1";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message ?? "입력값이 올바르지 않습니다";
    return errorResponse("VALIDATION_ERROR", message, 400);
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    return errorResponse("INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다", 401);
  }

  const valid = await verifyPasswordHash(password, user.passwordHash);
  if (!valid) {
    return errorResponse("INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다", 401);
  }

  // lastLoginAt 업데이트
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const accessToken = await createAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });
  const refreshToken = await createRefreshToken(user.id);

  const response = NextResponse.json(
    {
      success: true,
      data: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
    },
    { status: 200 }
  );

  response.cookies.set(V1_REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: REFRESH_MAX_AGE,
    path: "/api/v1/",
  });

  return response;
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/api/v1/auth/login/
git commit -m "feat: POST /api/v1/auth/login 로그인 API (JWT access + refresh)"
```

---

## Task 7: 로그아웃 + 내 정보 + 비밀번호 변경 API

**Files:**
- Create: `src/app/api/v1/auth/logout/route.ts`
- Create: `src/app/api/v1/auth/me/route.ts`
- Create: `src/app/api/v1/auth/password/route.ts`

- [ ] **Step 1: 로그아웃 Route**

`src/app/api/v1/auth/logout/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { V1_REFRESH_COOKIE } from "@/lib/jwt-v1";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(V1_REFRESH_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/api/v1/",
  });
  return response;
}
```

- [ ] **Step 2: 내 정보 조회/수정 Route**

`src/app/api/v1/auth/me/route.ts`:
```typescript
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-guard";
import { updateProfileSchema } from "@/lib/schemas/auth";
import { successResponse, errorResponse } from "@/lib/api-response";

export const GET = withAuth(async (_request, user) => {
  const dbUser = await prisma.user.findUnique({
    where: { id: user.sub },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!dbUser) {
    return errorResponse("NOT_FOUND", "사용자를 찾을 수 없습니다", 404);
  }

  return successResponse(dbUser);
});

export const PUT = withAuth(async (request: NextRequest, user) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
  }

  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message ?? "입력값이 올바르지 않습니다";
    return errorResponse("VALIDATION_ERROR", message, 400);
  }

  const updated = await prisma.user.update({
    where: { id: user.sub },
    data: parsed.data,
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      updatedAt: true,
    },
  });

  return successResponse(updated);
});
```

- [ ] **Step 3: 비밀번호 변경 Route**

`src/app/api/v1/auth/password/route.ts`:
```typescript
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-guard";
import { hashPassword, verifyPasswordHash } from "@/lib/password";
import { changePasswordSchema } from "@/lib/schemas/auth";
import { successResponse, errorResponse } from "@/lib/api-response";

export const PUT = withAuth(async (request: NextRequest, user) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
  }

  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message ?? "입력값이 올바르지 않습니다";
    return errorResponse("VALIDATION_ERROR", message, 400);
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.sub } });
  if (!dbUser) {
    return errorResponse("NOT_FOUND", "사용자를 찾을 수 없습니다", 404);
  }

  const valid = await verifyPasswordHash(
    parsed.data.currentPassword,
    dbUser.passwordHash
  );
  if (!valid) {
    return errorResponse("WRONG_PASSWORD", "현재 비밀번호가 올바르지 않습니다", 400);
  }

  const newHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({
    where: { id: user.sub },
    data: { passwordHash: newHash },
  });

  return successResponse({ message: "비밀번호가 변경되었습니다" });
});
```

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/v1/auth/logout/ src/app/api/v1/auth/me/ src/app/api/v1/auth/password/
git commit -m "feat: v1 로그아웃, 내 정보 조회/수정, 비밀번호 변경 API"
```

---

## Task 8: 회원 관리 API (ADMIN/MANAGER)

**Files:**
- Create: `src/app/api/v1/members/route.ts`
- Create: `src/app/api/v1/members/[id]/route.ts`
- Create: `src/app/api/v1/members/[id]/role/route.ts`

- [ ] **Step 1: 회원 목록 API**

`src/app/api/v1/members/route.ts`:
```typescript
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/api-guard";
import { memberListSchema } from "@/lib/schemas/member";
import { paginatedResponse, errorResponse } from "@/lib/api-response";
import type { Prisma } from "@prisma/client";

export const GET = withRole(["ADMIN", "MANAGER"], async (request: NextRequest) => {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = memberListSchema.safeParse(params);
  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message ?? "입력값이 올바르지 않습니다";
    return errorResponse("VALIDATION_ERROR", message, 400);
  }

  const { page, limit, search, role, isActive } = parsed.data;
  const skip = (page - 1) * limit;

  const where: Prisma.UserWhereInput = {};
  if (search) {
    where.OR = [
      { email: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
    ];
  }
  if (role) where.role = role;
  if (isActive !== undefined) where.isActive = isActive;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  return paginatedResponse(users, { page, limit, total });
});
```

- [ ] **Step 2: 회원 상세/수정/삭제 API**

`src/app/api/v1/members/[id]/route.ts`:
```typescript
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/api-guard";
import { updateMemberSchema } from "@/lib/schemas/member";
import { successResponse, errorResponse } from "@/lib/api-response";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withRole(
  ["ADMIN", "MANAGER"],
  async (_request: NextRequest, _user, context) => {
    const { id } = await (context as RouteContext).params;

    const member = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!member) {
      return errorResponse("NOT_FOUND", "회원을 찾을 수 없습니다", 404);
    }

    return successResponse(member);
  }
);

export const PUT = withRole(
  ["ADMIN", "MANAGER"],
  async (request: NextRequest, _user, context) => {
    const { id } = await (context as RouteContext).params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
    }

    const parsed = updateMemberSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.errors[0]?.message ?? "입력값이 올바르지 않습니다";
      return errorResponse("VALIDATION_ERROR", message, 400);
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse("NOT_FOUND", "회원을 찾을 수 없습니다", 404);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: parsed.data,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        updatedAt: true,
      },
    });

    return successResponse(updated);
  }
);

export const DELETE = withRole(
  ["ADMIN"],
  async (_request: NextRequest, user, context) => {
    const { id } = await (context as RouteContext).params;

    if (id === user.sub) {
      return errorResponse("SELF_DELETE", "자기 자신을 비활성화할 수 없습니다", 400);
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse("NOT_FOUND", "회원을 찾을 수 없습니다", 404);
    }

    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    return successResponse({ message: "회원이 비활성화되었습니다" });
  }
);
```

- [ ] **Step 3: 역할 변경 API**

`src/app/api/v1/members/[id]/role/route.ts`:
```typescript
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/api-guard";
import { changeRoleSchema } from "@/lib/schemas/member";
import { successResponse, errorResponse } from "@/lib/api-response";

type RouteContext = { params: Promise<{ id: string }> };

export const PUT = withRole(
  ["ADMIN"],
  async (request: NextRequest, user, context) => {
    const { id } = await (context as RouteContext).params;

    if (id === user.sub) {
      return errorResponse("SELF_ROLE_CHANGE", "자기 자신의 역할을 변경할 수 없습니다", 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
    }

    const parsed = changeRoleSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.errors[0]?.message ?? "입력값이 올바르지 않습니다";
      return errorResponse("VALIDATION_ERROR", message, 400);
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse("NOT_FOUND", "회원을 찾을 수 없습니다", 404);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { role: parsed.data.role },
      select: { id: true, email: true, name: true, role: true },
    });

    return successResponse(updated);
  }
);
```

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/v1/members/
git commit -m "feat: 회원 관리 API (목록/상세/수정/비활성화/역할변경) RBAC 적용"
```

---

## Task 9: 대시보드 회원 관리 UI

**Files:**
- Modify: `src/components/ui/icons.tsx` (IconMembers 추가)
- Modify: `src/components/layout/sidebar.tsx` (메뉴 추가)
- Create: `src/app/(dashboard)/members/page.tsx`
- Create: `src/app/(dashboard)/members/[id]/page.tsx`

- [ ] **Step 1: 아이콘 추가**

`src/components/ui/icons.tsx`에 IconMembers 추가:
```typescript
export function IconMembers({ size = 24, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
```

- [ ] **Step 2: 사이드바에 회원 관리 메뉴 추가**

`src/components/layout/sidebar.tsx`의 `navItems` 배열에 추가:
```typescript
import { IconDashboard, IconProcess, IconLog, IconNetwork, IconLogout, IconServer, IconMembers } from "@/components/ui/icons";

const navItems: { href: string; label: string; icon: ReactNode }[] = [
  { href: "/", label: "대시보드", icon: <IconDashboard size={18} /> },
  { href: "/processes", label: "프로세스", icon: <IconProcess size={18} /> },
  { href: "/logs", label: "로그", icon: <IconLog size={18} /> },
  { href: "/network", label: "네트워크", icon: <IconNetwork size={18} /> },
  { href: "/members", label: "회원 관리", icon: <IconMembers size={18} /> },
];
```

- [ ] **Step 3: 회원 목록 페이지**

`src/app/(dashboard)/members/page.tsx`:
```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

interface Member {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
      });
      if (search) params.set("search", search);

      const res = await fetch(`/api/v1/members?${params}`);
      const json = await res.json();
      if (json.success) {
        setMembers(json.data);
        setPagination(json.pagination);
      }
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const roleLabel: Record<string, string> = {
    ADMIN: "관리자",
    MANAGER: "매니저",
    USER: "사용자",
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader title="회원 관리" onRefresh={fetchMembers} />

      {/* 검색 */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="이메일 또는 이름 검색..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-full max-w-md px-3 py-2 bg-surface-200 border border-border rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-brand"
        />
      </div>

      {/* 테이블 */}
      <div className="bg-surface-200 border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-gray-400">
              <th className="px-4 py-3 font-medium">이메일</th>
              <th className="px-4 py-3 font-medium">이름</th>
              <th className="px-4 py-3 font-medium">역할</th>
              <th className="px-4 py-3 font-medium">상태</th>
              <th className="px-4 py-3 font-medium">가입일</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  로딩 중...
                </td>
              </tr>
            ) : members.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  회원이 없습니다
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr
                  key={m.id}
                  className="border-b border-border/50 hover:bg-surface-300/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/members/${m.id}`}
                      className="text-brand hover:underline"
                    >
                      {m.email}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{m.name ?? "-"}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded bg-surface-300 text-gray-300">
                      {roleLabel[m.role] ?? m.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      status={m.isActive ? "online" : "stopped"}
                      label={m.isActive ? "활성" : "비활성"}
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {new Date(m.createdAt).toLocaleDateString("ko-KR")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
          <span>
            전체 {pagination.total}명 (
            {pagination.page}/{pagination.totalPages} 페이지)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 bg-surface-200 border border-border rounded disabled:opacity-50"
            >
              이전
            </button>
            <button
              onClick={() =>
                setPage((p) => Math.min(pagination.totalPages, p + 1))
              }
              disabled={page === pagination.totalPages}
              className="px-3 py-1 bg-surface-200 border border-border rounded disabled:opacity-50"
            >
              다음
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 회원 상세 페이지**

`src/app/(dashboard)/members/[id]/page.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";

interface MemberDetail {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function MemberDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchMember() {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/members/${params.id}`);
      const json = await res.json();
      if (json.success) setMember(json.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMember();
  }, [params.id]);

  async function handleToggleActive() {
    if (!member) return;
    if (member.isActive) {
      // 비활성화 (DELETE)
      const res = await fetch(`/api/v1/members/${member.id}`, {
        method: "DELETE",
      });
      if (res.ok) fetchMember();
    } else {
      // 활성화 (PUT)
      const res = await fetch(`/api/v1/members/${member.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      if (res.ok) fetchMember();
    }
  }

  async function handleRoleChange(role: string) {
    if (!member) return;
    const res = await fetch(`/api/v1/members/${member.id}/role`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) fetchMember();
  }

  const roleLabel: Record<string, string> = {
    ADMIN: "관리자",
    MANAGER: "매니저",
    USER: "사용자",
  };

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-gray-500">로딩 중...</p>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="p-6">
        <p className="text-gray-500">회원을 찾을 수 없습니다</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <PageHeader title="회원 상세" onRefresh={fetchMember} />

      <div className="bg-surface-200 border border-border rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">이메일</span>
            <p className="text-gray-200 mt-1">{member.email}</p>
          </div>
          <div>
            <span className="text-gray-500">이름</span>
            <p className="text-gray-200 mt-1">{member.name ?? "-"}</p>
          </div>
          <div>
            <span className="text-gray-500">전화번호</span>
            <p className="text-gray-200 mt-1">{member.phone ?? "-"}</p>
          </div>
          <div>
            <span className="text-gray-500">역할</span>
            <div className="mt-1 flex items-center gap-2">
              <select
                value={member.role}
                onChange={(e) => handleRoleChange(e.target.value)}
                className="bg-surface-300 border border-border rounded px-2 py-1 text-gray-200 text-sm"
              >
                {Object.entries(roleLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <span className="text-gray-500">상태</span>
            <p className={`mt-1 ${member.isActive ? "text-green-400" : "text-red-400"}`}>
              {member.isActive ? "활성" : "비활성"}
            </p>
          </div>
          <div>
            <span className="text-gray-500">마지막 로그인</span>
            <p className="text-gray-200 mt-1">
              {member.lastLoginAt
                ? new Date(member.lastLoginAt).toLocaleString("ko-KR")
                : "없음"}
            </p>
          </div>
          <div>
            <span className="text-gray-500">가입일</span>
            <p className="text-gray-200 mt-1">
              {new Date(member.createdAt).toLocaleString("ko-KR")}
            </p>
          </div>
          <div>
            <span className="text-gray-500">수정일</span>
            <p className="text-gray-200 mt-1">
              {new Date(member.updatedAt).toLocaleString("ko-KR")}
            </p>
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-border">
          <button
            onClick={() => router.back()}
            className="px-4 py-2 text-sm bg-surface-300 border border-border rounded-lg text-gray-300 hover:text-gray-100"
          >
            목록으로
          </button>
          <button
            onClick={handleToggleActive}
            className={`px-4 py-2 text-sm rounded-lg ${
              member.isActive
                ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                : "bg-green-500/10 text-green-400 hover:bg-green-500/20"
            }`}
          >
            {member.isActive ? "비활성화" : "활성화"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: (dashboard) 레이아웃 확인**

현재 `src/app/layout.tsx`가 사이드바를 포함하므로, `(dashboard)` 그룹을 사용할 경우 layout이 중복 적용되지 않는지 확인. 현재 구조상 `(dashboard)` 폴더는 route group으로만 작동하고 별도 layout.tsx 없이 루트 layout을 상속한다. 만약 빌드 오류가 발생하면 `(dashboard)` 없이 `src/app/members/`로 변경.

- [ ] **Step 6: 빌드 확인**

```bash
npm run build
```

Expected: 빌드 성공.

- [ ] **Step 7: 커밋**

```bash
git add src/components/ui/icons.tsx src/components/layout/sidebar.tsx src/app/\(dashboard\)/members/
git commit -m "feat: 대시보드 회원 관리 UI (목록 + 상세 페이지)"
```

---

## Task 10: 통합 검증 + .env.example 최종화

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: PostgreSQL 연결 확인**

```bash
npx prisma db push
```

Expected: 스키마가 DB에 반영됨.

- [ ] **Step 2: API 수동 테스트 — 회원가입**

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test1234","name":"테스트"}'
```

Expected: `{ "success": true, "data": { "id": "...", "email": "test@example.com", ... } }`

- [ ] **Step 3: API 수동 테스트 — 로그인**

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test1234"}'
```

Expected: `{ "success": true, "data": { "accessToken": "...", "user": { ... } } }`

- [ ] **Step 4: API 수동 테스트 — 내 정보 (Bearer Token)**

위에서 받은 accessToken을 사용:

```bash
curl http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer <accessToken>"
```

Expected: `{ "success": true, "data": { "id": "...", "email": "test@example.com", ... } }`

- [ ] **Step 5: API 수동 테스트 — 권한 부족 확인**

일반 USER 토큰으로 회원 목록 접근:

```bash
curl http://localhost:3000/api/v1/members \
  -H "Authorization: Bearer <accessToken>"
```

Expected: `{ "success": false, "error": { "code": "FORBIDDEN", "message": "권한이 부족합니다" } }` (403)

- [ ] **Step 6: 대시보드 회원 목록 UI 확인**

브라우저에서 `http://localhost:3000/members` 접속하여 회원 목록 페이지가 정상 렌더링되는지 확인.

- [ ] **Step 7: 최종 빌드 확인**

```bash
npm run build
```

Expected: 빌드 성공, 경고 없음.

- [ ] **Step 8: 최종 커밋**

```bash
git add -A
git commit -m "feat: 회원관리 백엔드 시스템 완성 (PostgreSQL + Prisma + RBAC)"
```
