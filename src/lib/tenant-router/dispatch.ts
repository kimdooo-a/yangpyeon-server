/**
 * tenant-router/dispatch — catch-all 라우터의 임시 핸들러 디스패처.
 *
 * Phase 1.2 (T1.2) ADR-027 §3. catch-all 은 마이그레이션 도중의 임시 디스패처이며,
 * Phase 2+ 부터는 명시적 라우트(`src/app/api/v1/t/[tenant]/contents/route.ts` 등)가
 * Next.js 의 구체 라우트 우선 매칭에 의해 자동 흡수한다.
 *
 * 본 단계 (Phase 0~1) 의 HANDLER_TABLE 은 빈 객체로 시작한다. 신규 리소스는
 * 가능한 한 명시 라우트로 추가하고, 정말 catch-all 만으로 처리해야 하는 경우에만
 * 본 테이블에 등록한다. ADR-027 §2.2 의 단계별 사용 가이드 참조.
 */
import { errorResponse } from "@/lib/api-response";
import type { AccessTokenPayload } from "@/lib/jwt-v1";
import type { ResolvedTenant } from "./types";

export interface DispatchInput {
  method: string;
  tenant: ResolvedTenant;
  user: AccessTokenPayload;
  subPath: string;
  request: Request;
}

type Handler = (ctx: DispatchInput) => Promise<Response>;

/**
 * resource → method → handler 매핑 테이블.
 *
 * Phase 0~1 에서는 비어 있으며, 모든 path 는 ROUTE_NOT_FOUND (404) 로 응답한다.
 * 신규 핸들러 추가 시 lazy import 패턴을 권장한다 (ADR-027 §3 예시):
 *
 *   contents: {
 *     GET: (ctx) => import("./handlers/contents-list").then(m => m.handle(ctx)),
 *   }
 */
const HANDLER_TABLE: Record<string, Record<string, Handler>> = {
  // Phase 2+ 등록 — 현 시점 의도적 빈 테이블.
};

/**
 * subPath 의 첫 segment 를 resource 로 보고 HANDLER_TABLE 에서 lookup.
 * 미정의 resource → 404, 미정의 method → 405.
 */
export async function dispatchTenantRoute(
  input: DispatchInput,
): Promise<Response> {
  const segments = input.subPath.split("/");
  const resource = segments[0] ?? "";
  const table = HANDLER_TABLE[resource];
  if (!table) {
    return errorResponse(
      "ROUTE_NOT_FOUND",
      `${input.subPath} 미정의`,
      404,
    );
  }
  const handler = table[input.method];
  if (!handler) {
    return errorResponse(
      "METHOD_NOT_ALLOWED",
      `${input.method} 미지원`,
      405,
    );
  }
  return handler(input);
}
