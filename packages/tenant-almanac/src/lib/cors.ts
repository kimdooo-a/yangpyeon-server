/**
 * Almanac plugin — CORS helper.
 *
 * 5 라우트 (categories/sources/today-top/items/contents) 가 동일한 origin
 * 검증 + preflight 응답을 사용하므로 본 모듈에서 1회 정의하여 중복 제거
 * (PLUGIN-MIG-3, S99 Chunk B).
 *
 * Origin 정책:
 *   - `process.env.ALMANAC_ALLOWED_ORIGINS` 콤마 구분 목록.
 *   - manifest.envVarsRequired 에 등록되어 부팅 시 검증.
 *
 * 보안 원칙:
 *   - `Allow-Methods`/`Allow-Headers` 는 GET 전용 5 routes 의 공통 집합.
 *     POST 등 변경 메서드 추가 시 본 helper 또는 라우트별 override 검토.
 *   - origin 미일치 시 빈 객체 — 브라우저가 자체 CORS 거부.
 *   - 운영 토글: `ALMANAC_ALLOWED_ORIGINS` 미설정 또는 빈 문자열 → 모든 origin 거부.
 */

const ALLOW_METHODS = "GET, OPTIONS";
const ALLOW_HEADERS = "authorization, x-api-key, content-type";

function getAllowedOrigins(): string[] {
  return (process.env.ALMANAC_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Origin 매치 시 CORS 응답 헤더 객체. 미매치 시 빈 객체.
 */
export function buildCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  if (!origin) return {};
  const allowed = getAllowedOrigins();
  if (!allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": ALLOW_METHODS,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    Vary: "Origin",
  };
}

/**
 * 응답에 CORS 헤더를 append. 미매치 origin 이면 헤더 추가 없음.
 */
export function applyCors(request: Request, response: Response): Response {
  const headers = buildCorsHeaders(request);
  for (const [k, v] of Object.entries(headers)) {
    response.headers.set(k, v);
  }
  return response;
}

/**
 * OPTIONS preflight 응답 — 204 + CORS 헤더.
 * 인증 없이 catch-all 에서 직접 호출 가능 (anonymous user 컨텍스트).
 */
export function preflightResponse(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: buildCorsHeaders(request),
  });
}
