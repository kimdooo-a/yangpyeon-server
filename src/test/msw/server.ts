/**
 * INFRA-2 — MSW Node 서버 (vitest + node + jsdom 공통).
 *
 * setupFiles (`src/test/setup.ts`) 가 server.listen / resetHandlers / close 라이프사이클을
 * 수행. 테스트 안에서는 `server.use(...)` 로 per-test handler 추가.
 */
import { setupServer } from "msw/node";
import { defaultHandlers } from "./handlers";

export const server = setupServer(...defaultHandlers);
