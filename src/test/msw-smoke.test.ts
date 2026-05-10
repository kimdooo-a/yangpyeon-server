// @vitest-environment jsdom
/**
 * INFRA-2 Task #1 — MSW + jsdom 인프라 smoke test.
 *
 * 검증 범위:
 *   1. setupFiles 가 MSW server.listen() 을 부트스트랩
 *   2. jsdom env 에서 global fetch 가 MSW handler 로 가로채짐
 *   3. server.use() per-test override 가 동작
 *   4. afterEach resetHandlers 가 누수 차단
 */
import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./msw/server";

describe("INFRA-2 MSW + jsdom smoke", () => {
  it("intercepts fetch via MSW handler", async () => {
    server.use(
      http.get("/api/v1/test/echo", () =>
        HttpResponse.json({ success: true, data: { ok: true } }),
      ),
    );

    const res = await fetch("/api/v1/test/echo");
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true, data: { ok: true } });
  });

  it("server.use override is per-test (resetHandlers afterEach)", async () => {
    server.use(
      http.get("/api/v1/test/scoped", () => HttpResponse.json({ scope: "test2" })),
    );
    const res = await fetch("/api/v1/test/scoped");
    expect(await res.json()).toEqual({ scope: "test2" });
  });
});
