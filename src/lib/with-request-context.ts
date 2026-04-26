// Phase 1.7 (T1.7) ADR-029 §2.3.2 — API Route 진입점에서 RequestContext 진입.
//
// 사용 예:
//   export const POST = withRequestContext(async (req: Request) => {
//     // safeAudit/recordTenantMetric 자동으로 traceId/tenantId 주입
//     return Response.json({ ok: true });
//   });
//
// Next.js 16 App Router (Node Runtime) 에서 작동.
// Edge Runtime 라우트 (`runtime: 'edge'`) 는 AsyncLocalStorage 미지원 — 별도 처리 필요 (OQ-6).

import { runWithContext, type RequestContext } from "./request-context";

/**
 * 요청에서 tenantId 해석.
 *
 * Phase 1.7 시점 stub — Phase 1.2 (T1.2 multi-tenant router + withTenant 가드)
 * 통합 후 정식 구현 (URL path `/api/v1/t/<tenant>/...` 또는 JWT `aud` claim 추출).
 *
 * 현재는 항상 undefined 반환 — safeAudit/recordTenantMetric 는 fail-soft 로
 * 'default' (또는 호출자 명시값) 사용.
 *
 * @internal
 */
async function resolveTenantId(_req: Request): Promise<string | undefined> {
  // TODO (T1.2 통합): URL path slug 추출 + JWT aud claim 검증.
  // 현재는 stub — request-context 는 traceId 만 보장.
  return undefined;
}

/**
 * X-Request-Id 헤더 표준 — Cloudflare/Vercel/AWS 모두 호환.
 * 헤더 부재 시 server-side crypto.randomUUID() 발급.
 */
function extractTraceId(req: Request): string {
  return req.headers.get("x-request-id") ?? crypto.randomUUID();
}

/**
 * API Route 핸들러를 RequestContext 로 감싼다.
 *
 * 핸들러 시그니처는 Next.js 16 App Router 표준 — `(req: Request, context?: { params: ... }) => Promise<Response>`.
 * 리턴 타입은 핸들러 그대로 보존.
 */
export function withRequestContext<
  T extends (req: Request, ...rest: any[]) => Promise<Response> | Response,
>(handler: T): T {
  const wrapped = async (req: Request, ...rest: any[]) => {
    const traceId = extractTraceId(req);
    const tenantId = await resolveTenantId(req);
    const ctx: RequestContext = {
      traceId,
      tenantId,
      startedAt: Date.now(),
    };
    return runWithContext(ctx, () => handler(req, ...rest));
  };
  return wrapped as T;
}

/**
 * 테스트/시스템 cron 용 직접 진입 헬퍼.
 *
 * cron 작업에서 명시적 traceId 와 tenantId 로 RequestContext 를 시작하고 싶을 때 사용.
 * 미사용 시 safeAudit 는 'default' sentinel + traceId undefined 로 fail-soft.
 */
export function withRequestContextManual<T>(
  ctx: Partial<RequestContext> & { traceId?: string },
  fn: () => T,
): T {
  const full: RequestContext = {
    traceId: ctx.traceId ?? crypto.randomUUID(),
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    startedAt: ctx.startedAt ?? Date.now(),
  };
  return runWithContext(full, fn);
}
