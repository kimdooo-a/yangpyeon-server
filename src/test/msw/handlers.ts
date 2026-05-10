/**
 * INFRA-2 — MSW 글로벌 default handlers.
 *
 * 비어 있는 배열로 시작 — 각 테스트가 `server.use(...)` 로 per-test handler 를 추가.
 * `onUnhandledRequest: "error"` 설정 하 mocking 누락은 테스트 실패로 잡힘.
 *
 * 운영 시 공통으로 mock 해야 하는 endpoint (예: /api/auth/me 401 fallback) 가
 * 생기면 여기 추가. 현재는 per-test 명시 정책 우선.
 */
import type { HttpHandler } from "msw";

export const defaultHandlers: HttpHandler[] = [];
