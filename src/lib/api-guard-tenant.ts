/**
 * api-guard-tenant — withTenant() / withTenantRole() 가드.
 *
 * Phase 1.2 (T1.2) ADR-027 §4 의 구현. URL path `/api/v1/t/<tenant>/...` 에 진입하는
 * 모든 요청에 대해:
 *
 *   1. URL slug 추출 + 정규식 검증
 *   2. ResolvedTenant DB 조회 (manifest.ts)
 *   3. active 토글 확인
 *   4. 인증 경로별 cross-validation
 *      - Bearer pub_/srv_ 토큰: K3 검증 (T1.3 verifyApiKeyForTenant)
 *      - Cookie/JWT: TenantMembership 조회 (T1.5 prisma.tenantMembership)
 *   5. runWithTenant 로 TenantContext 주입 후 핸들러 실행
 *
 * 본 가드는 기존 withAuth (src/lib/api-guard.ts) 를 wrap 하여 인증 자체 로직을
 * 단일 진실 소스로 유지한다 (ADR-027 §10).
 *
 * 의존성:
 *   - @/lib/auth/keys-tenant — T1.3 병렬 진행 중. 머지 전까지 .stub 모듈 사용.
 *   - @/lib/tenant-router/membership — T1.5 schema 통합 전까지 항상 null 반환 (fail-closed).
 */
import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/api-guard";
import { errorResponse } from "@/lib/api-response";
import { resolveTenantFromSlug } from "@/lib/tenant-router/manifest";
import { findTenantMembership } from "@/lib/tenant-router/membership";
import type { TenantRole } from "@/lib/tenant-router/roles";
import type { ResolvedTenant } from "@/lib/tenant-router/types";
import { auditLogSafe } from "@/lib/audit/safe";
import { verifyApiKeyForTenant } from "@/lib/auth/keys-tenant";
// TenantContext 주입 — packages/core 의 AsyncLocalStorage (T1.1).
// pnpm workspace 가 npm 빌드와 공존하는 동안은 상대 경로 사용.
import { runWithTenant } from "../../packages/core/src/tenant/context";
import type { AccessTokenPayload } from "@/lib/jwt-v1";

const TENANT_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;

/**
 * tenant-scoped 핸들러 시그니처.
 *
 * 기존 AuthenticatedHandler 와 동일한 위치에 tenant 파라미터가 추가된다.
 * 핸들러 내부에서 `getCurrentTenant()` (T1.1) 호출 시에도 동일한 tenantId 가
 * AsyncLocalStorage 로 노출된다.
 */
export type TenantAuthenticatedHandler = (
  request: NextRequest,
  user: AccessTokenPayload,
  tenant: ResolvedTenant,
  context?: { params: Promise<Record<string, string | string[]>> },
) => Promise<Response>;

function extractBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

function isApiKeyToken(token: string): boolean {
  return token.startsWith("pub_") || token.startsWith("srv_");
}

/**
 * /api/v1/t/<tenant>/... 진입 가드.
 *
 * ADR-027 §4.2 의 전체 흐름을 구현한다. 가드 통과 시 핸들러는
 * `runWithTenant({ tenantId: tenant.id }, ...)` 안에서 실행되어
 * 모든 후속 호출(`getCurrentTenant()`)이 동일한 tenantId 를 본다.
 */
export function withTenant(handler: TenantAuthenticatedHandler) {
  return withAuth(async (request, user, context) => {
    // ─── 1. URL params 에서 tenant slug 추출 ───
    const params = await context?.params;
    const rawTenant = params?.tenant;
    const pathTenantSlug =
      typeof rawTenant === "string" ? rawTenant.toLowerCase() : undefined;

    if (!pathTenantSlug) {
      return errorResponse("TENANT_MISSING", "tenant param 필요", 400);
    }
    if (!TENANT_SLUG_RE.test(pathTenantSlug)) {
      return errorResponse("TENANT_INVALID_SLUG", "slug 형식 오류", 400);
    }

    // ─── 2. Tenant Manifest 조회 (ADR-026) ───
    const tenant = await resolveTenantFromSlug(pathTenantSlug);
    if (!tenant) {
      await auditLogSafe({
        event: "tenant_not_found",
        actor: user.email,
        details: { pathTenant: pathTenantSlug },
        request,
      });
      return errorResponse(
        "TENANT_NOT_FOUND",
        `${pathTenantSlug} 미등록`,
        404,
      );
    }

    if (!tenant.active) {
      return errorResponse(
        "TENANT_DISABLED",
        `${pathTenantSlug} 비활성`,
        410,
      );
    }

    // ─── 3. 인증 경로별 cross-validation ───
    const bearer = extractBearerToken(request);

    if (bearer && isApiKeyToken(bearer)) {
      // ─── 3a. API key 경로 — K3 검증 (T1.3) ───
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
            request,
          });
          return errorResponse("FORBIDDEN", "cross-tenant 차단", 403);
        }
        if (result.reason === "TENANT_MISMATCH_INTERNAL") {
          await auditLogSafe({
            event: "key_prefix_mismatch",
            actor: user.email,
            details: { keyId: result.keyId, severity: "high" },
            request,
          });
          return errorResponse("INVALID_KEY", "키 무결성 위반", 401);
        }
        return errorResponse(result.reason, "API key 검증 실패", 401);
      }
      // K3 검증 통과 → TenantContext 주입 후 핸들러 실행.
      return runWithTenant({ tenantId: tenant.id }, () =>
        handler(request, user, tenant, context),
      );
    }

    // ─── 3b. Cookie/JWT 경로 — Membership 검증 ───
    if (user.sub === "legacy") {
      // 레거시 토큰은 글로벌 운영자로 간주 → tenant 멤버십 강제.
      await auditLogSafe({
        event: "tenant_membership_missing",
        actor: user.email,
        details: { reason: "legacy-token-no-membership" },
        request,
      });
      return errorResponse("FORBIDDEN", "tenant 멤버 아님", 403);
    }

    const membership = await findTenantMembership({
      tenantId: tenant.id,
      userId: user.sub,
    });

    if (!membership) {
      await auditLogSafe({
        event: "tenant_membership_missing",
        actor: user.email,
        details: { pathTenant: tenant.slug, userId: user.sub },
        request,
      });
      return errorResponse("FORBIDDEN", "tenant 멤버 아님", 403);
    }

    // 가드 통과 → TenantContext 주입 후 핸들러 실행.
    return runWithTenant({ tenantId: tenant.id }, () =>
      handler(request, user, tenant, context),
    );
  });
}

/**
 * tenant 내부 역할 가드.
 *
 * ADR-027 §4.3. API key 경로의 정밀 role 매핑은 Phase 1.3 에서 정밀화될 예정이며,
 * 현 단계에서는 K3 검증을 통과한 모든 키를 tenant 내부 ADMIN 으로 간주한다.
 * Cookie 경로는 TenantMembership.role 을 직접 검증한다.
 */
export function withTenantRole(
  roles: TenantRole[],
  handler: TenantAuthenticatedHandler,
) {
  return withTenant(async (request, user, tenant, context) => {
    const bearer = extractBearerToken(request);
    if (bearer && isApiKeyToken(bearer)) {
      // TODO(T1.3): verifyApiKeyForTenant 결과의 scope 를 role 로 매핑.
      // 현 단계: K3 통과 자체가 tenant 내부 권한 보장으로 간주.
      return handler(request, user, tenant, context);
    }

    const membership = await findTenantMembership({
      tenantId: tenant.id,
      userId: user.sub,
    });

    if (!membership || !roles.includes(membership.role)) {
      return errorResponse("FORBIDDEN", "tenant 권한 부족", 403);
    }
    return handler(request, user, tenant, context);
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 1.4 (T1.4) — Prisma RLS 통합 re-export.
//
// 핸들러에서 DB 접근 시:
//   1. 단발 read/write → `prismaWithTenant.<model>.<op>()`
//      (TenantContext 가 withTenant() 가드에서 이미 주입되어 있다.)
//   2. multi-statement 트랜잭션 → `withTenantTx(tenant.id, async tx => { ... })`
//      (1 회 SET LOCAL 로 전체 트랜잭션 커버 — Extension 의 매-query SET 회피.)
//
// `withTenant` 가드 본체는 본 파일의 위쪽 함수 — runWithTenant 로 TenantContext 주입까지만 담당.
// PG 세션 변수 (app.tenant_id) 주입은 prismaWithTenant Extension 이 수행.
//
// 기존 src/lib/prisma.ts 는 변경 없음 — system 작업 / migration runner 가 계속 사용.
// 컨슈머 라우트는 prismaWithTenant 만 사용해야 한다 (ESLint rule no-raw-prisma-without-tenant 가 강제).
// ─────────────────────────────────────────────────────────────────────────
export {
  prismaWithTenant,
  withTenantTx,
  withTenantQuery,
} from "@/lib/db/prisma-tenant-client";
export type { AppPrismaClient } from "@/lib/db/prisma-tenant-client";
