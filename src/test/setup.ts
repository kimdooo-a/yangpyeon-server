/**
 * INFRA-2 — vitest 글로벌 setupFile.
 *
 * 모든 환경(node + jsdom)에서 공통:
 *   - MSW 서버 부트스트랩 + reset + close 라이프사이클
 *   - `onUnhandledRequest: "error"` 로 mocking 누락 = 테스트 실패 (silent network call 차단)
 *
 * jsdom 전용 (window 가 정의된 경우만):
 *   - @testing-library/jest-dom matchers 등록 (toBeInTheDocument 등)
 *
 * node-only 테스트는 jest-dom matcher 영향 0 — import 만 일어나고 window 부재로 사용 불가.
 */
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw/server";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

if (typeof window !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
  // @testing-library/react auto-cleanup 은 globals=true 일 때만 동작.
  // 본 프로젝트는 globals 미사용 → 명시 등록.
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => cleanup());
  // jsdom 29 미구현 API 보강 — 컴포넌트가 호출해도 throw 하지 않도록 noop.
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}
