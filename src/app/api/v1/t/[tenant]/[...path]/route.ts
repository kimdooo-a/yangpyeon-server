/**
 * /api/v1/t/[tenant]/[...path] — multi-tenant catch-all 라우터.
 *
 * Phase 1.2 (T1.2) ADR-027 §3 + PLUGIN-MIG-3 (S99 Chunk C).
 *
 * URL `/api/v1/t/<slug>/<resource>/...` 형태의 모든 요청을 흡수하여
 * tenant manifest.routes (PLUGIN-MIG-3) 또는 HANDLER_TABLE legacy 경로로 위임.
 *
 * Next.js 정적 우선 매칭 규칙:
 *   - `src/app/api/v1/t/[tenant]/messenger/.../route.ts` 등 명시 라우트가 살아있는
 *     동안에는 본 catch-all 의 흡수 범위가 자동으로 줄어든다 (ADR-027 §2.2).
 *   - PLUGIN-MIG-3 Chunk C 시점에 5 almanac 라우트가 삭제되어 본 catch-all 이
 *     manifest dispatch 의 단일 진입점으로 전환됨.
 *
 * Tenant manifest 등록은 `@/lib/tenant-bootstrap` 가 import 시점 side-effect 로
 * 수행 — 본 모듈이 부팅 시 1회 import 함으로써 dispatcher 의 lookup 이 비어있지 않음을 보장.
 */
import type { NextRequest } from "next/server";
import "@/lib/tenant-bootstrap";
import { withTenant } from "@/lib/api-guard-tenant";
import { dispatchTenantRoute } from "@/lib/tenant-router/dispatch";
import { resolveTenantFromSlug } from "@/lib/tenant-router/manifest";
import type { AccessTokenPayload } from "@/lib/jwt-v1";

type RouteContext = {
  params: Promise<{ tenant: string; path: string[] }>;
};

// withAuth (src/lib/api-guard.ts) 의 context 시그니처는 params: Record<string,string>.
// catch-all 은 path: string[] 을 노출하므로, route handler 진입점에서만 좁은
// 형태로 캐스팅하여 통과시킨다 (런타임에는 동일한 객체 구조).
type RelaxedContext = { params: Promise<Record<string, string>> };

const TENANT_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;

/**
 * OPTIONS preflight 전용 anonymous user.
 * 인증 없이 plugin OPTIONS 핸들러로 dispatch 되며, 핸들러는 user 필드를 읽지 않는다.
 * 만약 plugin 이 OPTIONS 에서 user 를 사용하려 시도하면 anonymous 식별자가 노출된다.
 */
const ANONYMOUS_PREFLIGHT_USER: AccessTokenPayload = {
  sub: "anonymous-preflight",
  email: "",
  role: "USER",
  type: "access",
};

function extractSegments(rawPath: string[] | string | undefined): string[] {
  if (Array.isArray(rawPath)) return rawPath;
  if (typeof rawPath === "string") return [rawPath];
  return [];
}

function buildHandler(method: string) {
  return withTenant(async (request, user, tenant, context) => {
    const params = (await context?.params) ?? {};
    const segments = extractSegments(
      (params as { path?: string[] | string }).path,
    );
    const subPath = segments.join("/");

    return dispatchTenantRoute({
      method,
      tenant,
      user,
      subPath,
      request,
    });
  });
}

const GET_HANDLER = buildHandler("GET");
const POST_HANDLER = buildHandler("POST");
const PATCH_HANDLER = buildHandler("PATCH");
const PUT_HANDLER = buildHandler("PUT");
const DELETE_HANDLER = buildHandler("DELETE");

export async function GET(request: NextRequest, context: RouteContext) {
  return GET_HANDLER(request, context as unknown as RelaxedContext);
}
export async function POST(request: NextRequest, context: RouteContext) {
  return POST_HANDLER(request, context as unknown as RelaxedContext);
}
export async function PATCH(request: NextRequest, context: RouteContext) {
  return PATCH_HANDLER(request, context as unknown as RelaxedContext);
}
export async function PUT(request: NextRequest, context: RouteContext) {
  return PUT_HANDLER(request, context as unknown as RelaxedContext);
}
export async function DELETE(request: NextRequest, context: RouteContext) {
  return DELETE_HANDLER(request, context as unknown as RelaxedContext);
}

/**
 * OPTIONS preflight — 인증 우회 + 실패 graceful degradation.
 *
 * CORS preflight 는 브라우저가 자동으로 보내는 무인증 요청이므로 withTenant 를
 * 거치지 않는다. tenant slug 만 검증하여 manifest 의 OPTIONS 핸들러로 위임;
 * 매니페스트 미등록/path 미매치/DB 오류 시 204 (CORS 헤더 없이) 반환 — 브라우저가
 * 후속 요청을 자체 거부 (preflight 실패 시 실제 요청 차단).
 *
 * 모든 예외를 swallow 하여 204 로 폴백 — preflight 가 500 으로 실패하면
 * 브라우저가 모호한 CORS 에러를 표시하고 운영자가 디버깅하기 어렵다.
 * 인증/권한 검증은 후속 실제 요청의 GET/POST 핸들러가 담당.
 */
export async function OPTIONS(request: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const tenantSlug =
      typeof params.tenant === "string" ? params.tenant.toLowerCase() : "";

    if (!tenantSlug || !TENANT_SLUG_RE.test(tenantSlug)) {
      return new Response(null, { status: 204 });
    }

    const tenant = await resolveTenantFromSlug(tenantSlug);
    if (!tenant || !tenant.active) {
      return new Response(null, { status: 204 });
    }

    const segments = extractSegments(params.path);
    const subPath = segments.join("/");

    return dispatchTenantRoute({
      method: "OPTIONS",
      tenant,
      user: ANONYMOUS_PREFLIGHT_USER,
      subPath,
      request,
    });
  } catch (err) {
    console.error("[OPTIONS catch-all] preflight failed", err);
    return new Response(null, { status: 204 });
  }
}
