// Phase 1.7+P1 path 기반 구현 — API Route 진입점에서 RequestContext 진입.
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
import { resolveTenantFromSlug } from "./tenant-router/manifest";

/**
 * `/api/v1/t/<slug>/...` 경로에서 tenant slug 를 추출하는 정규식.
 *
 * ADR-026 §3 immutable 규칙: slug 길이 2~31 (첫 글자 + 최대 30자 추가 = 총 2~31).
 * 패턴: `[a-z0-9]` 첫 글자 + `[a-z0-9-]{1,30}` 이후 1~30자 → 총 길이 2~31.
 * slug 가 한 글자이거나 규칙 위반 시 정규식이 매칭되지 않아 undefined 반환.
 */
const TENANT_PATH_RE = /^\/api\/v1\/t\/([a-z0-9][a-z0-9-]{1,30})(\/|$)/;

/**
 * 요청에서 tenantId 해석 (URL path 기반 정식 구현 — P1 단계).
 *
 * 1. URL path 에서 `/api/v1/t/<slug>/...` 패턴 추출.
 * 2. slug → DB row 조회 (`resolveTenantFromSlug`).
 * 3. 존재하는 tenant 이면 `tenant.id` 반환 (active 여부 무관).
 *
 * **suspended/archived tenant 처리 결정 (P1 확정)**:
 * `tenant.active === false` 인 경우에도 `tenant.id` 를 반환한다.
 * 근거: `resolveTenantId` 는 관측성(observability) 맥락 확립 담당이며,
 * 인가(authorization) 담당이 아니다. `withTenant` 가드 (T1.3 keys-tenant) 가
 * active=false 인 경우 410 Gone 응답을 책임진다.
 * tenant.id 를 주입함으로써 감사 로그가 실제 tenant UUID 를 기록할 수 있어
 * "누가 정지된 테넌트를 호출하는지" 추적이 가능하다.
 * undefined 반환 시 audit 는 'default' sentinel 로 기록되어 (어느 tenant 인지) 추적성이 저하된다.
 *
 * **JWT `aud` claim 검증**: 본 단계에서 구현하지 않음.
 * `withTenant` 가드 (T1.3 keys-tenant) 가 책임진다.
 *
 * DB 장애 또는 잘못된 URL 은 fail-soft — undefined 반환으로 request-context 는
 * traceId 만 보장하며, safeAudit 는 'default' sentinel 로 기록한다.
 *
 * @internal
 */
async function resolveTenantId(req: Request): Promise<string | undefined> {
  // 1. URL path slug 추출 (`/api/v1/t/<slug>/...`)
  let pathname: string;
  try {
    pathname = new URL(req.url).pathname;
  } catch {
    // 잘못된 URL — fail-soft
    return undefined;
  }

  const m = pathname.match(TENANT_PATH_RE);
  if (!m) {
    // 글로벌 라우트 또는 slug 길이 위반 — tenantId 없음
    return undefined;
  }
  const slug = m[1];

  // 2. slug → DB row 조회 (캐시 미적용, 추후 LRU 도입 가능)
  try {
    const tenant = await resolveTenantFromSlug(slug);
    // tenant 미등록이면 undefined. 등록된 경우 active 여부 무관하게 id 반환.
    // (active=false 인 경우 410 처리는 withTenant 가드 책임 — 위 JSDoc 참조)
    return tenant?.id;
  } catch {
    // DB 장애 시 fail-soft — request-context 는 traceId 만 보장
    return undefined;
  }
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
