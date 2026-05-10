/**
 * tenant-router/dispatch — catch-all 라우터의 핸들러 디스패처.
 *
 * Phase 1.2 (T1.2) ADR-027 §3 + PLUGIN-MIG-3 (S99) 확장.
 *
 * 우선순위:
 *   1. Tenant manifest.routes — `@yangpyeon/core` registry 에서 tenant 별 plugin
 *      라우트를 lookup. ADR-024 옵션 D 의 정상 경로.
 *   2. HANDLER_TABLE — 플랫폼-레벨 catch-all 전용 (현 시점 비어 있음).
 *
 * Path 매칭:
 *   - manifest 루트는 정적 segment + `:param` 만 지원 (간이 segment 매칭).
 *   - HANDLER_TABLE 은 첫 segment 를 resource key 로 사용 (legacy).
 */
import { getTenantManifest, type HttpMethod } from "@yangpyeon/core";
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
 * Phase 0~1 의 명시적 catch-all-only 핸들러 테이블 (PLUGIN-MIG-3 후에도 보존).
 * 모든 plugin 도메인 라우트는 manifest.routes 로 등록 — 본 테이블은
 * 플랫폼-레벨 catch-all 전용이며 현 시점 비어 있다.
 */
const HANDLER_TABLE: Record<string, Record<string, Handler>> = {};

/**
 * Path 패턴 매칭 — 정적 segment + `:name` 동적 segment.
 * 매칭 시 params 맵 반환, 미매칭 시 null.
 *
 * 예) pattern="items/:slug", subPath="items/foo" → { slug: "foo" }
 *     pattern="contents",    subPath="contents"  → {}
 *     pattern="contents",    subPath="other"     → null
 *     pattern="items/:slug", subPath="items"     → null (segment 수 불일치)
 */
export function matchRoute(
  pattern: string,
  subPath: string,
): Record<string, string> | null {
  const patternSegs = pattern.split("/").filter(Boolean);
  const pathSegs = subPath.split("/").filter(Boolean);
  if (patternSegs.length !== pathSegs.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternSegs.length; i++) {
    const p = patternSegs[i];
    const v = pathSegs[i];
    if (p.startsWith(":")) {
      params[p.slice(1)] = decodeURIComponent(v);
    } else if (p !== v) {
      return null;
    }
  }
  return params;
}

/**
 * dispatch 진입점. catch-all route handler 가 호출.
 *
 * Manifest 의 routes 가 우선이며, 없으면 HANDLER_TABLE, 그래도 없으면 404.
 * Method 미지원은 405 (manifest path 매칭 후에만 의미를 가짐).
 */
export async function dispatchTenantRoute(
  input: DispatchInput,
): Promise<Response> {
  // 1. Manifest plugin route lookup
  const manifest = getTenantManifest(input.tenant.id);
  if (manifest?.enabled && manifest.routes) {
    for (const reg of manifest.routes) {
      const params = matchRoute(reg.path, input.subPath);
      if (params === null) continue;

      const handler = reg.methods[input.method as HttpMethod];
      if (!handler) {
        return errorResponse(
          "METHOD_NOT_ALLOWED",
          `${input.method} 미지원`,
          405,
        );
      }
      return handler({
        request: input.request,
        tenant: input.tenant,
        user: input.user,
        params,
        subPath: input.subPath,
      });
    }
  }

  // 2. Legacy HANDLER_TABLE fallback (플랫폼-레벨 catch-all 전용)
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
