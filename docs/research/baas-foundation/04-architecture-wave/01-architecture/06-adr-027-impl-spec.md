# 06 — ADR-027 (Path Router + K3 Matching) Implementation Spec

> **상태**: IMPL-SPEC v0.1 · **작성**: 2026-04-26 (sub-agent #6 / baas-foundation Architecture Wave)
> **상위**: [CLAUDE.md](../../../../../CLAUDE.md) → [04-architecture-wave/](../) → [01-architecture/](./) → **이 문서**
> **소스 ADR**: [ADR-027](../../01-adrs/ADR-027-multi-tenant-router-and-api-key-matching.md) (ACCEPTED 2026-04-26)
> **연관 ADR**: ADR-021 (audit fail-soft), ADR-022 (정체성 재정의), ADR-023 (RLS), ADR-024 (Plugin), ADR-026 (Tenant Manifest)
> **연관 코드**: `src/lib/api-guard.ts`, `src/lib/auth/keys.ts`, `src/lib/auth.ts`, `prisma/schema.prisma`

---

## 0. 목적과 범위

본 문서는 ADR-027의 **5개 부속 결정**(Router 옵션 A + Key 매칭 K3 + `withTenant()` 가드 + 점진 마이그레이션 + Almanac 출시 후 재구조화)을 **실행 가능한 구현 명세**로 옮긴 것이다. 다음을 구체화한다:

1. Next.js 15 App Router 디렉토리 트리 (`src/app/api/v1/t/[tenant]/[...path]/route.ts`)
2. catch-all dispatcher 코드 (메서드 5종)
3. `withTenant()` / `withTenantRole()` 가드 전체 구현 (TS)
4. K3 매칭 로직 (`verifyApiKeyForTenant()` — prefix 파싱 → DB lookup → hash 검증 → 2중 cross-validation)
5. ApiKey/Tenant Prisma 모델 변경 + 마이그레이션 SQL
6. ADR-021 audit fail-soft에 신규 이벤트 3종 통합
7. cross-tenant 침범 차단 7가지 시나리오 매트릭스
8. Phase 0~6 마이그레이션 순서 (8~10주)
9. `withAuth`/`withRole` 무수정 공존 모델
10. Open Questions (글로벌 운영자 admin override, 키 회전 등)

본 문서는 **구현 코드를 그대로 복사할 수 있는 수준**의 상세도를 목표로 한다. 단, Tenant 모델 스키마 자체는 ADR-026에서 정의되며, 본 spec은 ADR-026 모델이 존재한다고 가정한다.

---

## 1. 결정 요약 (5 부속 결정)

| # | 결정 항목 | 채택안 | 비고 |
|---|-----------|--------|------|
| 1 | Router 패턴 | **옵션 A** — URL path `/api/v1/t/<tenant>/...` | Cloudflare Tunnel single hostname 제약 + path 명시성 |
| 2 | API Key 매칭 | **옵션 K3** — `pub_<slug>_<rand>` prefix + DB FK + 2중 cross-validation | 3중 방어 (prefix·FK·hash 동시 위조 시에만 침범) |
| 3 | 가드 구조 | **`withTenant()` 신규** + `withAuth`/`withRole` 무수정 공존 | 글로벌 라우트와 BaaS 라우트 분리 |
| 4 | 마이그레이션 | **점진 — Phase 0~6 (8~10주)** | 기존 `/api/v1/*` 유지하며 신규는 `/api/v1/t/<tenant>/*` |
| 5 | Almanac spec 충돌 | **출시 후 재구조화** | spec/aggregator-fixes 무중단, v1.0 출시 게이트 후 plugin화 |

→ 본 spec은 위 5개를 **모두 구현 단계로** 풀어쓴다.

---

## 2. Next.js 라우트 구조

### 2.1 디렉토리 트리 (목표 상태)

```
src/app/api/v1/
├── (글로벌 — 운영자 전용, withAuth/withRole 사용, 무수정)
│   ├── auth/
│   │   ├── login/route.ts
│   │   ├── logout/route.ts
│   │   └── refresh/route.ts
│   ├── api-keys/                         ← 글로벌 운영자 키 관리 UI
│   │   ├── route.ts                      (GET/POST)
│   │   └── [id]/route.ts                 (DELETE/PATCH)
│   ├── members/                          ← 글로벌 User 테이블
│   │   ├── route.ts
│   │   └── [id]/route.ts
│   ├── admin/                            ← 글로벌 ADMIN 전용
│   │   ├── tenants/route.ts              (POST 신규 tenant 등록)
│   │   ├── tenants/[id]/route.ts         (PATCH/DELETE)
│   │   └── audit/route.ts                (감사 로그 조회)
│   ├── health/route.ts                   ← 글로벌 헬스체크 (가드 없음)
│   └── (기타 무변경 라우트)
│
└── t/                                     ← BaaS 컨슈머 라우트 (withTenant 사용)
    └── [tenant]/                          ← Next.js dynamic segment
        ├── [...path]/route.ts             ← catch-all dispatcher (Phase 0~1)
        │
        └── (Phase 2+ 명시적 라우트로 점진 분해)
            ├── contents/
            │   ├── route.ts               (GET/POST)
            │   └── [id]/route.ts          (GET/PATCH/DELETE)
            ├── api-keys/route.ts          ← tenant 운영자 키 관리
            ├── functions/[id]/run/route.ts
            ├── auth/                      ← tenant 사용자 회원가입 (ADR-026 Q-3)
            │   ├── login/route.ts
            │   └── signup/route.ts
            └── health/route.ts            ← tenant 헬스체크
```

### 2.2 catch-all vs 명시적 라우트 — 단계별 사용

| Phase | catch-all 사용 | 명시적 라우트 |
|-------|----------------|---------------|
| Phase 0~1 | ✅ 단일 catch-all로 모든 path 흡수 | (없음) |
| Phase 2+ | △ 미정의 path만 fallback | ✅ `contents/`, `api-keys/` 등 점진 추가 |
| Phase 6 | ❌ catch-all 제거 또는 404로 대체 | ✅ 모든 라우트 명시화 |

→ catch-all은 **마이그레이션 도중의 임시 디스패처**이며, Phase 6에서는 모든 tenant 라우트가 명시적 파일로 존재해야 한다.

### 2.3 정적/동적 라우트 충돌 회피

Next.js App Router 규칙:
- `/api/v1/auth/login/route.ts` (정적) vs `/api/v1/t/[tenant]/[...path]/route.ts` (동적) — **충돌 없음**, prefix `/api/v1/t/`로 격리됨
- `/api/v1/t/[tenant]/contents/route.ts` (구체) vs `/api/v1/t/[tenant]/[...path]/route.ts` (catch-all) — Next.js가 **구체 라우트 우선**

→ Phase 2+에서 명시적 라우트를 추가하면 자동으로 우선 매칭, catch-all은 unmatched path만 흡수.

---

## 3. catch-all dispatcher 코드

`src/app/api/v1/t/[tenant]/[...path]/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { withTenant } from "@/lib/api-guard-tenant";
import { dispatchTenantRoute } from "@/lib/tenant-router/dispatch";

type RouteParams = { params: Promise<{ tenant: string; path: string[] }> };

async function handle(method: string) {
  return withTenant(async (request, user, tenant, context) => {
    const params = await context!.params;
    const subPath = (params.path ?? []).join("/");
    return dispatchTenantRoute({
      method,
      tenant,
      user,
      subPath,
      request,
    });
  });
}

export async function GET(request: NextRequest, context: RouteParams) {
  return handle("GET")(request, context);
}
export async function POST(request: NextRequest, context: RouteParams) {
  return handle("POST")(request, context);
}
export async function PATCH(request: NextRequest, context: RouteParams) {
  return handle("PATCH")(request, context);
}
export async function PUT(request: NextRequest, context: RouteParams) {
  return handle("PUT")(request, context);
}
export async function DELETE(request: NextRequest, context: RouteParams) {
  return handle("DELETE")(request, context);
}
```

`src/lib/tenant-router/dispatch.ts` (Phase 0~1 임시 — Phase 2부터 명시 라우트가 흡수):

```typescript
import { errorResponse } from "@/lib/api-response";
import type { ResolvedTenant } from "@/lib/tenant-router/types";
import type { AccessTokenPayload } from "@/lib/jwt-v1";

interface DispatchInput {
  method: string;
  tenant: ResolvedTenant;
  user: AccessTokenPayload;
  subPath: string;
  request: Request;
}

const HANDLER_TABLE: Record<string, Record<string, Handler>> = {
  contents: {
    GET: (ctx) => import("./handlers/contents-list").then(m => m.handle(ctx)),
    POST: (ctx) => import("./handlers/contents-create").then(m => m.handle(ctx)),
  },
  // Phase 2+ 명시 라우트로 이전됨에 따라 이 테이블은 점진 축소
};

type Handler = (ctx: DispatchInput) => Promise<Response>;

export async function dispatchTenantRoute(input: DispatchInput): Promise<Response> {
  const [resource, ...rest] = input.subPath.split("/");
  const table = HANDLER_TABLE[resource];
  if (!table) {
    return errorResponse("ROUTE_NOT_FOUND", `${input.subPath} 미정의`, 404);
  }
  const handler = table[input.method];
  if (!handler) {
    return errorResponse("METHOD_NOT_ALLOWED", `${input.method} 미지원`, 405);
  }
  return handler(input);
}
```

**비고**: 위 dispatch 테이블은 **임시 측면**이다. Phase 2부터는 `src/app/api/v1/t/[tenant]/contents/route.ts` 같은 명시 라우트가 자동 매칭하므로 catch-all로 들어오는 경로는 점차 줄어든다.

---

## 4. `withTenant()` 가드 전체 코드

### 4.1 파일 위치 + import

`src/lib/api-guard-tenant.ts` (신규):

```typescript
import type { NextRequest } from "next/server";
import type { AccessTokenPayload } from "@/lib/jwt-v1";
import type { Role } from "@/generated/prisma/client";
import { withAuth, type AuthenticatedHandler } from "@/lib/api-guard";
import { errorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { resolveTenantFromSlug } from "@/lib/tenant-router/manifest";
import { verifyApiKeyForTenant } from "@/lib/auth/keys-tenant";
import { auditLogSafe } from "@/lib/audit/safe";
import type { ResolvedTenant } from "@/lib/tenant-router/types";
```

### 4.2 `TenantAuthenticatedHandler` 타입 + `withTenant()` 본체

```typescript
export type TenantAuthenticatedHandler = (
  request: NextRequest,
  user: AccessTokenPayload,
  tenant: ResolvedTenant,
  context?: { params: Promise<Record<string, string | string[]>> }
) => Promise<Response>;

function extractBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

function isApiKeyToken(token: string): boolean {
  return token.startsWith("pub_") || token.startsWith("srv_");
}

export function withTenant(handler: TenantAuthenticatedHandler) {
  return withAuth(async (request, user, context) => {
    // ─── 1. URL params에서 tenant slug 추출 ───
    const params = await context?.params;
    const pathTenantSlug = (params?.tenant as string | undefined)?.toLowerCase();
    if (!pathTenantSlug) {
      return errorResponse("TENANT_MISSING", "tenant param 필요", 400);
    }
    if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(pathTenantSlug)) {
      return errorResponse("TENANT_INVALID_SLUG", "slug 형식 오류", 400);
    }

    // ─── 2. Tenant Manifest 조회 (ADR-026) ───
    const tenant = await resolveTenantFromSlug(pathTenantSlug);
    if (!tenant) {
      await auditLogSafe({
        event: "tenant_not_found",
        actor: user.email,
        details: { pathTenant: pathTenantSlug },
      });
      return errorResponse("TENANT_NOT_FOUND", `${pathTenantSlug} 미등록`, 404);
    }
    if (!tenant.active) {
      return errorResponse("TENANT_DISABLED", `${pathTenantSlug} 비활성`, 410);
    }

    // ─── 3. 인증 경로별 cross-validation ───
    const bearer = extractBearerToken(request);

    if (bearer && isApiKeyToken(bearer)) {
      // ─── 3a. API key 경로 — K3 검증 ───
      const result = await verifyApiKeyForTenant(bearer, tenant);
      if (!result.ok) {
        if (result.reason === "CROSS_TENANT_FORBIDDEN") {
          await auditLogSafe({
            event: "cross_tenant_attempt",
            actor: user.email,
            details: {
              pathTenant: tenant.slug,
              keyTenant: result.keyTenantSlug,
              keyId: result.keyId,
            },
          });
          return errorResponse("FORBIDDEN", "cross-tenant 차단", 403);
        }
        if (result.reason === "TENANT_MISMATCH_INTERNAL") {
          await auditLogSafe({
            event: "key_prefix_mismatch",
            actor: user.email,
            details: { keyId: result.keyId, severity: "high" },
          });
          return errorResponse("INVALID_KEY", "키 무결성 위반", 401);
        }
        return errorResponse(result.reason, "API key 검증 실패", 401);
      }
      // K3 검증 통과 → 핸들러 실행
      return handler(request, user, tenant, context);
    }

    // ─── 3b. Cookie/JWT 경로 — Membership 검증 ───
    if (user.sub === "legacy") {
      // 레거시 토큰은 글로벌 운영자로 간주 → tenant 멤버십 강제
      await auditLogSafe({
        event: "tenant_membership_missing",
        actor: user.email,
        details: { reason: "legacy-token-no-membership" },
      });
      return errorResponse("FORBIDDEN", "tenant 멤버 아님", 403);
    }

    const membership = await prisma.tenantMembership.findUnique({
      where: {
        tenantId_userId: { tenantId: tenant.id, userId: user.sub },
      },
      select: { role: true },
    });

    if (!membership) {
      await auditLogSafe({
        event: "tenant_membership_missing",
        actor: user.email,
        details: { pathTenant: tenant.slug, userId: user.sub },
      });
      return errorResponse("FORBIDDEN", "tenant 멤버 아님", 403);
    }

    return handler(request, user, tenant, context);
  });
}
```

### 4.3 `withTenantRole()` — tenant 내부 역할 체크

```typescript
export type TenantRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export function withTenantRole(
  roles: TenantRole[],
  handler: TenantAuthenticatedHandler
) {
  return withTenant(async (request, user, tenant, context) => {
    // API key 경로에서는 ApiKey.scope를 tenant role로 간주
    const bearer = request.headers.get("authorization")?.slice(7) ?? "";
    if (isApiKeyToken(bearer)) {
      // verifyApiKeyForTenant 결과 caching 또는 재조회 필요 — Phase 1에서 AsyncLocalStorage 도입
      // (간략화: 본 spec에서는 항상 ADMIN으로 가정, Phase 1에서 정밀화)
      return handler(request, user, tenant, context);
    }

    // Cookie 경로 — TenantMembership.role 조회
    const membership = await prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.sub } },
      select: { role: true },
    });
    if (!membership || !roles.includes(membership.role as TenantRole)) {
      return errorResponse("FORBIDDEN", "tenant 권한 부족", 403);
    }
    return handler(request, user, tenant, context);
  });
}
```

### 4.4 AsyncLocalStorage로 tenant 컨텍스트 주입 (Phase 1 강화)

```typescript
// src/lib/tenant-router/context.ts
import { AsyncLocalStorage } from "node:async_hooks";
import type { ResolvedTenant } from "./types";

const tenantStore = new AsyncLocalStorage<ResolvedTenant>();

export function runWithTenant<T>(tenant: ResolvedTenant, fn: () => Promise<T>): Promise<T> {
  return tenantStore.run(tenant, fn);
}

export function getCurrentTenant(): ResolvedTenant | undefined {
  return tenantStore.getStore();
}
```

`withTenant()` 본체에서 핸들러 호출 시:
```typescript
return runWithTenant(tenant, () => handler(request, user, tenant, context));
```

→ 핸들러가 깊이 호출하는 service/repository 레이어가 `getCurrentTenant()`로 tenantId를 얻어 자동 WHERE 주입 가능 (ADR-023 RLS와 별도로 작동).

---

## 5. K3 매칭 로직

### 5.1 ApiKey 토큰 형식

```
pub_<tenant_slug>_<random_base64url_32>      예: pub_almanac_a1B2c3D4e5F6...
srv_<tenant_slug>_<random_base64url_32>      예: srv_recipe_z9Y8x7W6v5U4...
```

규칙:
- `pub_` = publishable (브라우저 노출 가능, 권한 제한)
- `srv_` = server (백엔드 전용, 광범위 권한)
- `<tenant_slug>` = ADR-026 manifest의 `id`/`slug` (소문자, 영숫자+`-`, 1~31자)
- `<random>` = `crypto.randomBytes(24).toString("base64url")` (=32자)

### 5.2 prefix 컬럼에 저장되는 식별자

```
prefix = "<scope>_<slug>_<random.slice(0,8)>"  ← DB unique
keyHash = bcrypt.hash(plaintext, 10)
```

→ `findUnique({ where: { prefix } })`로 빠른 lookup 가능. random의 첫 8자만 prefix에 포함하여 충돌 회피 + 운영자 식별 용이.

### 5.3 `verifyApiKeyForTenant()` 전체 코드

`src/lib/auth/keys-tenant.ts` (신규):

```typescript
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import type { ApiKey, Tenant } from "@/generated/prisma/client";
import type { ResolvedTenant } from "@/lib/tenant-router/types";

const KEY_RE = /^(pub|srv)_([a-z0-9][a-z0-9-]{1,30})_([A-Za-z0-9_-]{32})$/;

export type VerifyResult =
  | { ok: true; key: ApiKey & { tenant: Tenant }; scope: "pub" | "srv" }
  | {
      ok: false;
      reason:
        | "INVALID_FORMAT"
        | "NOT_FOUND"
        | "INVALID_HASH"
        | "REVOKED"
        | "TENANT_MISMATCH_INTERNAL"
        | "CROSS_TENANT_FORBIDDEN";
      keyId?: string;
      keyTenantSlug?: string;
    };

export async function verifyApiKeyForTenant(
  rawKey: string,
  pathTenant: ResolvedTenant
): Promise<VerifyResult> {
  // ─── 1. Prefix 파싱 ───
  const m = rawKey.match(KEY_RE);
  if (!m) return { ok: false, reason: "INVALID_FORMAT" };
  const [, scope, prefixSlug, random] = m;
  const dbPrefix = `${scope}_${prefixSlug}_${random.slice(0, 8)}`;

  // ─── 2. DB lookup (prefix unique) ───
  const dbKey = await prisma.apiKey.findUnique({
    where: { prefix: dbPrefix },
    include: { tenant: true },
  });
  if (!dbKey) return { ok: false, reason: "NOT_FOUND" };
  if (dbKey.revokedAt) return { ok: false, reason: "REVOKED", keyId: dbKey.id };

  // ─── 3. Hash 검증 (bcrypt — 차후 argon2id 마이그레이션 예정 SP-011) ───
  const hashOk = await bcrypt.compare(rawKey, dbKey.keyHash);
  if (!hashOk) {
    return { ok: false, reason: "INVALID_HASH", keyId: dbKey.id };
  }

  // ─── 4. Cross-validation 1: prefix slug == DB tenant slug ───
  if (!dbKey.tenant || dbKey.tenant.slug !== prefixSlug) {
    // 키 위변조 또는 데이터 무결성 침해 — 즉시 audit alert
    return {
      ok: false,
      reason: "TENANT_MISMATCH_INTERNAL",
      keyId: dbKey.id,
      keyTenantSlug: dbKey.tenant?.slug,
    };
  }

  // ─── 5. Cross-validation 2: path tenant == DB tenant slug ───
  if (dbKey.tenant.slug !== pathTenant.slug) {
    return {
      ok: false,
      reason: "CROSS_TENANT_FORBIDDEN",
      keyId: dbKey.id,
      keyTenantSlug: dbKey.tenant.slug,
    };
  }

  // ─── 6. lastUsedAt 갱신 (best-effort) ───
  prisma.apiKey
    .update({ where: { id: dbKey.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { ok: true, key: dbKey, scope: scope as "pub" | "srv" };
}
```

### 5.4 prefix 생성 함수

`src/lib/auth/keys-tenant-issue.ts`:

```typescript
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";

export interface IssueTenantKeyInput {
  tenantId: string;
  tenantSlug: string;
  scope: "pub" | "srv";
  name: string;
  scopes: string[];
  ownerId: string;
}

export async function issueTenantApiKey(input: IssueTenantKeyInput) {
  const random = randomBytes(24).toString("base64url"); // 32자
  const plaintext = `${input.scope}_${input.tenantSlug}_${random}`;
  const prefix = `${input.scope}_${input.tenantSlug}_${random.slice(0, 8)}`;
  const keyHash = await bcrypt.hash(plaintext, 10);

  const created = await prisma.apiKey.create({
    data: {
      name: input.name,
      prefix,
      keyHash,
      type: input.scope === "pub" ? "PUBLISHABLE" : "SECRET",
      scopes: input.scopes,
      ownerId: input.ownerId,
      tenantId: input.tenantId, // ← 신규 컬럼
    },
    select: {
      id: true,
      prefix: true,
      tenantId: true,
      createdAt: true,
    },
  });

  return { plaintext, apiKey: created };
}
```

→ slug는 ADR-026에서 immutable로 고정되어야 본 함수의 prefix 보장이 유지된다.

---

## 6. ApiKey 모델 변경

### 6.1 Prisma 스키마 diff

```prisma
// prisma/schema.prisma

model ApiKey {
  id          String      @id @default(cuid())
  name        String
  prefix      String      @unique
  keyHash     String
  type        ApiKeyType
  scopes      String[]
  ownerId     String
  owner       User        @relation(fields: [ownerId], references: [id], onDelete: Cascade)

  // ─── 신규 필드 (ADR-027) ───
  tenantId    String?                                  // nullable: 글로벌 키 호환
  tenant      Tenant?     @relation(fields: [tenantId], references: [id], onDelete: SetNull)

  createdAt   DateTime    @default(now())
  lastUsedAt  DateTime?
  revokedAt   DateTime?

  // ─── 신규 인덱스 ───
  @@index([tenantId, prefix])
  @@index([tenantId, revokedAt])
}

// ─── ADR-026에서 정의 (참고용) ───
model Tenant {
  id          String      @id @default(cuid())
  slug        String      @unique  // immutable per ADR-026
  name        String
  active      Boolean     @default(true)
  createdAt   DateTime    @default(now())

  apiKeys     ApiKey[]
  memberships TenantMembership[]
}

model TenantMembership {
  id          String      @id @default(cuid())
  tenantId    String
  userId      String
  role        TenantRole  @default(MEMBER)

  tenant      Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([tenantId, userId])
  @@index([userId])
}

enum TenantRole {
  OWNER
  ADMIN
  MEMBER
  VIEWER
}
```

### 6.2 마이그레이션 SQL (수동 검토용)

```sql
-- 001_add_apikey_tenantid.sql
ALTER TABLE "ApiKey" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "ApiKey_tenantId_prefix_idx" ON "ApiKey"("tenantId", "prefix");
CREATE INDEX "ApiKey_tenantId_revokedAt_idx" ON "ApiKey"("tenantId", "revokedAt");
ALTER TABLE "ApiKey"
  ADD CONSTRAINT "ApiKey_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE SET NULL;
```

→ nullable로 시작하여 기존 글로벌 키 무중단 유지. Phase 5+에서 모든 키가 tenant 바인딩되면 NOT NULL로 승격 검토.

### 6.3 데이터 백필 정책

- 기존 키(예: 운영자가 발급한 dashboard-internal 키): tenantId NULL 유지 → withAuth/withRole 경로에서만 사용 가능
- 신규 키: 발급 UI에서 tenant 강제 선택 → tenantId 필수
- prefix 형식: 기존 `sb_publishable_xxx` / `sb_secret_xxx`는 그대로 유지 (legacy로 분류, withAuth 경로에서만 매칭). 신규 `pub_<slug>_xxx` / `srv_<slug>_xxx`만 withTenant K3 경로 진입.

---

## 7. 기존 라우트 마이그레이션 (Phase 0~6, 8~10주)

| Phase | 기간 | 작업 항목 | 산출 |
|-------|------|----------|------|
| **Phase 0** | 1주 | ADR-026 Tenant 모델 + ApiKey.tenantId 컬럼 추가 + 마이그레이션 SQL 적용 + Tenant seed (`almanac` 1행) | DB 준비 |
| **Phase 1** | 1주 | `withTenant()` + `verifyApiKeyForTenant()` + catch-all dispatcher 구현 + 단위 테스트 | 가드 가동 |
| **Phase 2** | 2~3주 | Almanac v1.0 출시 (현 spec `/api/v1/almanac/*` 그대로) — withAuth 경로 사용. 동시에 `/api/v1/t/almanac/contents/route.ts` 명시 라우트 작성하여 dual serving 시작 | 병행 가동 |
| **Phase 3** | 1주 | Almanac 컨슈머 SDK base URL 변경 (`/api/v1/` → `/api/v1/t/almanac/`) + 신규 `pub_almanac_xxx` 키 발급 | SDK 마이그레이션 |
| **Phase 4** | 2주 | 기존 `/api/v1/almanac/*`에 `Sunset: <date>` 헤더 + deprecation 로그. 6개월 grace 시작 | deprecation |
| **Phase 5** | 1주 | 두 번째 tenant `recipe` 추가 — Phase 0~3 반복 (DB seed → 명시 라우트 → SDK) | 2nd tenant |
| **Phase 6** | 1~2주 | grace 만료 후 글로벌 `/api/v1/<resource>/*` 라우트 제거 또는 default tenant로 흡수. catch-all 제거 | cleanup |

**Phase 0의 기존 라우트 무수정 보장**:
- catch-all 도입은 `src/app/api/v1/t/` 신규 경로에만 적용 → 기존 `src/app/api/v1/auth/` 등 라우트는 한 줄도 변경하지 않음
- withAuth/withRole 시그니처 무변경 → 기존 핸들러 import 경로 그대로 동작
- ApiKey.tenantId nullable → 기존 키 검증 경로(`verifyApiKey()`) 그대로 동작

---

## 8. cross-tenant 침범 차단 7가지 시나리오

| # | 공격 시나리오 | 차단 메커니즘 | 차단 위치 | HTTP | audit 이벤트 |
|---|---------------|---------------|-----------|------|--------------|
| 1 | tenant_a 키(`pub_almanac_xxx`)로 `/api/v1/t/recipe/contents` 호출 | K3 step 5: prefix slug=almanac, path=recipe → CROSS_TENANT_FORBIDDEN | `verifyApiKeyForTenant()` | 403 | `cross_tenant_attempt` |
| 2 | tenant slug 위조 (`pub_recipe_<almanac의 random>`) — DB에 없는 prefix | K3 step 2: `findUnique({ where: { prefix } })` → null | `verifyApiKeyForTenant()` | 401 | (없음 — NOT_FOUND는 일반 인증 실패) |
| 3 | API key hash 위조 (random 부분 추측) | K3 step 3: `bcrypt.compare()` 실패 | `verifyApiKeyForTenant()` | 401 | (없음) |
| 4 | DB 직접 INSERT로 ApiKey 위조 (prefix slug != tenantId의 slug) | K3 step 4: `dbKey.tenant.slug !== prefixSlug` → TENANT_MISMATCH_INTERNAL + 즉시 alert | `verifyApiKeyForTenant()` | 401 | `key_prefix_mismatch` (severity high) |
| 5 | 정상 키로 인증 통과 후 핸들러에서 `WHERE tenantId` 누락된 raw SQL 실행 | ADR-023 RLS 또는 핸들러 자동 tenantId 주입 (AsyncLocalStorage) | data layer | 500 또는 빈 결과 | (별도 ADR) |
| 6 | Bearer 토큰 없이 익명 호출로 `/api/v1/t/almanac/contents` | `withTenant` → `withAuth` → UNAUTHORIZED | `withAuth` | 401 | (없음) |
| 7 | 쿠키 세션이지만 tenant 멤버 아님 (예: 운영자 A가 tenant B 컨슈머 라우트 접근) | `withTenant` step 3b: `tenantMembership.findUnique()` null | `withTenant` | 403 | `tenant_membership_missing` |

**핵심 차단 3 (가장 빈번한 위협)**:
- **시나리오 1** (정상 키의 cross-tenant) — K3 step 5가 1차 방어선
- **시나리오 4** (DB 위조) — K3 step 4의 prefix-vs-FK 무결성 검증, 위변조 즉시 감지
- **시나리오 7** (멤버십 누락) — 쿠키 경로의 명시적 membership 강제

---

## 9. ADR-021 audit 통합 — 신규 이벤트 3종

ADR-021 §amendment-1의 `audit-failure` 카운터 메트릭 + `auditLogSafe()` fail-soft 인프라를 그대로 재활용한다. 신규 이벤트:

| 이벤트 명 | 트리거 | severity | Slack alert |
|-----------|--------|----------|-------------|
| `cross_tenant_attempt` | 시나리오 1 (정상 키의 cross-tenant) | medium | 1분당 5회 이상 시 |
| `key_prefix_mismatch` | 시나리오 4 (DB 위조 의심) | **high** | **즉시** |
| `tenant_membership_missing` | 시나리오 7 (멤버 아닌 cookie) | low | 1시간당 50회 이상 시 |

기존 audit 콜사이트 11개 + 신규 3개 = 총 14개. ADR-021 fail-soft 보장으로 audit 실패가 본 요청 처리에 영향 없음.

`auditLogSafe()` 시그니처 (기존):
```typescript
auditLogSafe({
  event: string;
  actor: string;     // user.email
  details: Record<string, unknown>;
}): Promise<void>; // throws X
```

---

## 10. `withAuth`/`withRole` 무수정 공존

| 라우트 그룹 | 가드 | 위치 | tenant 인식 |
|------------|------|------|------------|
| `/api/v1/auth/login` | `withAuth` (무수정) | `src/lib/api-guard.ts` | ❌ 글로벌 |
| `/api/v1/api-keys/*` | `withRole(["ADMIN"])` (무수정) | 동일 | ❌ 글로벌 |
| `/api/v1/admin/tenants` | `withRole(["ADMIN"])` (무수정) | 동일 | ❌ 글로벌 (tenant 관리 자체) |
| `/api/v1/health` | 가드 없음 | — | ❌ 글로벌 |
| `/api/v1/t/<tenant>/contents` | `withTenant` (신규) | `src/lib/api-guard-tenant.ts` | ✅ tenant scope |
| `/api/v1/t/<tenant>/admin/keys` | `withTenantRole(["ADMIN"])` (신규) | 동일 | ✅ tenant scope |

**보장**:
- 두 가드 시그니처 무변경 (`AuthenticatedHandler` vs `TenantAuthenticatedHandler`로 분리)
- 신규 가드는 내부적으로 기존 `withAuth()`를 wrapping (인증 자체 로직 단일 진실 소스 유지)
- `verifyApiKey()` (기존, `src/lib/auth/keys.ts`)는 글로벌 `sb_publishable_*`/`sb_secret_*` 키 검증용으로 무수정 유지 — 신규 K3 검증은 `verifyApiKeyForTenant()`로 분리

**가드 선택 가이드** (Phase 1에서 `docs/rules/coding-stacks/typescript-react.md`에 추가):
```
- 운영자 dashboard 라우트 → withAuth / withRole
- BaaS 컨슈머 라우트 (/api/v1/t/<tenant>/) → withTenant / withTenantRole
- 가드 없음 → /health, public webhook (CSRF-safe path만)
```

---

## 11. Open Questions

| Q# | 질문 | 임시 결정 | 후속 ADR |
|----|------|----------|----------|
| Q-1 | 글로벌 운영자(김도영)가 모든 tenant 데이터에 접근해야 하나? | `super_admin` Role + `withTenantRole` bypass 옵션 — Phase 1에서 정의 | ADR-026 §멤버십 |
| Q-2 | tenant 간 데이터 공유 (예: almanac → recipe export)는? | out of scope — plugin/integration ADR 별도 | ADR-024 후속 |
| Q-3 | `/api/v1/t/<tenant>/auth/login` (tenant별 사용자 회원가입)? | tenant 자체 사용자 풀은 ADR-026에서 결정 | ADR-026 |
| Q-4 | API key 발급 UI 위치 — 글로벌 vs tenant 별 대시보드 | 글로벌 dashboard 유지 + tenant 선택 dropdown (Phase 3) | UI 결정 |
| Q-5 | Bearer가 `pub_`/`srv_` 아닌 일반 JWT일 때 tenant 결정? | §4.2 step 3b cookie 경로와 동일 — JWT.sub로 membership 조회 | 본 spec |
| Q-6 | API key 회전(rotation) 시 점진 마이그레이션 — 구 키 grace 기간 | 발급 시 `expiresAt` 옵션 + dual key 지원 (구·신 동시 유효) | 별도 작업 |
| Q-7 | tenant 삭제 시 ApiKey 처리 — cascade vs SetNull | 본 spec §6.1: `onDelete: SetNull` 채택 (key 자체는 보존, tenant 분리) | 본 spec |
| Q-8 | catch-all dispatch 테이블의 운영 부담 | Phase 2부터 명시 라우트로 흡수 → Phase 6에 catch-all 제거 | 본 spec §2.2 |

---

## 12. 후속 작업 (Phase 1 즉시 착수 항목)

| F# | 작업 | 공수 | 우선 |
|----|------|------|------|
| F-1 | `prisma/schema.prisma` 스키마 변경 + 마이그레이션 SQL 생성 | 2h | 즉시 |
| F-2 | `src/lib/tenant-router/manifest.ts` (`resolveTenantFromSlug`) 구현 | 3h | 높음 |
| F-3 | `src/lib/auth/keys-tenant.ts` (`verifyApiKeyForTenant`) 구현 + 단위 테스트 (7 시나리오 모두 커버) | 6h | 높음 |
| F-4 | `src/lib/api-guard-tenant.ts` (`withTenant`/`withTenantRole`) 구현 + 단위 테스트 | 4h | 높음 |
| F-5 | `src/app/api/v1/t/[tenant]/[...path]/route.ts` catch-all + dispatch 테이블 | 4h | 높음 |
| F-6 | `auditLogSafe()`에 신규 이벤트 3종 (`cross_tenant_attempt` 등) 등록 + 메트릭 카운터 | 3h | 중 |
| F-7 | AsyncLocalStorage `runWithTenant` + `getCurrentTenant` 헬퍼 | 2h | 중 |
| F-8 | `docs/rules/coding-stacks/typescript-react.md`에 가드 선택 가이드 추가 | 1h | 중 |
| F-9 | e2e 테스트: cross-tenant 7 시나리오 모두 차단 확인 (Playwright) | 8h | 중 |
| F-10 | 컨슈머 SDK 마이그레이션 가이드 (Phase 3 직전) | 4h | 낮음 |

---

## 13. 변경 이력

| 버전 | 날짜 | 작성자 | 요약 |
|------|------|--------|------|
| 0.1 | 2026-04-26 | sub-agent #6 (Opus 4.7 1M, baas-foundation Architecture Wave) | 초안 — ADR-027 5 부속 결정의 구현 명세 (코드/스키마/마이그레이션/시나리오) |

---

> **문서 끝**. 본 spec은 ADR-027 ACCEPTED 결정의 **구현 직진 가능 명세**이다. Phase 1 착수 전 ADR-026 (Tenant Manifest) 모델 확정 필수.
