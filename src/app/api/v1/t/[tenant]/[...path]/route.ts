/**
 * /api/v1/t/[tenant]/[...path] — multi-tenant catch-all 라우터.
 *
 * Phase 1.2 (T1.2) ADR-027 §3. URL `/api/v1/t/<slug>/<resource>/...` 형태의
 * 모든 요청을 흡수하여 withTenant 가드 → dispatchTenantRoute 로 이행한다.
 *
 * Next.js App Router 의 정적 우선 매칭 규칙에 의해, Phase 2+ 부터는 명시적
 * 라우트(예: `src/app/api/v1/t/[tenant]/contents/route.ts`) 가 추가될 때마다
 * 본 catch-all 의 흡수 범위는 자동으로 줄어든다 (ADR-027 §2.2).
 *
 * 본 파일은 메서드 5종(GET/POST/PATCH/PUT/DELETE) 을 동일한 흐름으로 위임한다.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/api-guard-tenant";
import { dispatchTenantRoute } from "@/lib/tenant-router/dispatch";

type RouteContext = {
  params: Promise<{ tenant: string; path: string[] }>;
};

// withAuth (src/lib/api-guard.ts) 의 context 시그니처는 params: Record<string,string>.
// catch-all 은 path: string[] 을 노출하므로, route handler 진입점에서만 좁은
// 형태로 캐스팅하여 통과시킨다 (런타임에는 동일한 객체 구조).
type RelaxedContext = { params: Promise<Record<string, string>> };

function buildHandler(method: string) {
  return withTenant(async (request, user, tenant, context) => {
    const params = (await context?.params) ?? {};
    const rawPath = (params as { path?: string[] | string }).path;
    const segments = Array.isArray(rawPath)
      ? rawPath
      : typeof rawPath === "string"
        ? [rawPath]
        : [];
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
