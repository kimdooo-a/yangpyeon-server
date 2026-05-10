/**
 * tenant-almanac manifest TDD — PLUGIN-MIG-2 (S98) 핸들러 본체 이전 후 갱신.
 *
 * 검증 범위:
 *   - alias `@yangpyeon/tenant-almanac` 동작 (tsconfig + vitest 동기화)
 *   - manifest 가 TenantManifest satisfies + 6 cron handler 선언
 *   - enabled=true (PLUGIN-MIG-2 핸들러 본체 이전 완료)
 *   - 5 dataApiAllowlist 모델 명시 (PLUGIN-MIG-3 정합)
 *   - 핸들러는 실제 runRssFetcher 등을 invoke (todoHandler stub 제거)
 *
 * 핸들러 호출 자체의 비즈니스 로직 (DB IO) 은 별도 테스트
 * (tests/aggregator/runner.test.ts + handlers/*.test.ts) 에서 mock 으로 검증.
 * 본 파일은 manifest 의 형태/구조만 검증.
 */
import { describe, it, expect, vi } from "vitest";

// 핸들러를 mock — manifest import 시 DB 의존성 회피.
vi.mock("../src/handlers/rss-fetcher", () => ({
  runRssFetcher: vi.fn().mockResolvedValue({
    status: "SUCCESS",
    durationMs: 1,
    message: "mock-rss",
  }),
}));
vi.mock("../src/handlers/html-scraper", () => ({
  runHtmlScraper: vi.fn().mockResolvedValue({
    status: "SUCCESS",
    durationMs: 1,
  }),
}));
vi.mock("../src/handlers/api-poller", () => ({
  runApiPoller: vi.fn().mockResolvedValue({
    status: "SUCCESS",
    durationMs: 1,
  }),
}));
vi.mock("../src/handlers/classifier", () => ({
  runClassifierHandler: vi.fn().mockResolvedValue({
    status: "FAILURE",
    durationMs: 1,
    message: "mock-classifier-fail",
  }),
}));
vi.mock("../src/handlers/promoter", () => ({
  runPromoterHandler: vi.fn().mockResolvedValue({
    status: "SUCCESS",
    durationMs: 1,
  }),
}));
vi.mock("../src/handlers/cleanup", () => ({
  runCleanupHandler: vi.fn().mockResolvedValue({
    status: "SUCCESS",
    durationMs: 1,
  }),
}));

// PLUGIN-MIG-3 Chunk B: 5 route handler 모듈은 lazy invocation 이므로 mock 불필요.
// 단, app-side import 체인 (`@/lib/db/prisma-tenant-client` → Prisma client)
// 의 무거운 의존성을 회피하기 위해 import-time side-effect 가 가벼운지만 확인.

const { manifest } = await import("@yangpyeon/tenant-almanac");

describe("tenant-almanac manifest (PLUGIN-MIG-2)", () => {
  it("identifier 가 'almanac' + Complex tenant 표시", () => {
    expect(manifest.id).toBe("almanac");
    expect(manifest.displayName).toContain("Almanac");
    // PLUGIN-MIG-2: 핸들러 본체 이전 완료 → enabled=true.
    expect(manifest.enabled).toBe(true);
  });

  it("6 cron 핸들러 선언 (rss/html/api/classify/promote/cleanup)", () => {
    const keys = Object.keys(manifest.cronHandlers ?? {});
    expect(keys).toContain("rss-fetcher");
    expect(keys).toContain("html-scraper");
    expect(keys).toContain("api-poller");
    expect(keys).toContain("classifier");
    expect(keys).toContain("promoter");
    expect(keys).toContain("cleanup");
    expect(keys.length).toBe(6);
  });

  it("rss-fetcher 핸들러: SUCCESS adapter 가 ok=true 변환", async () => {
    const handler = manifest.cronHandlers?.["rss-fetcher"];
    expect(handler).toBeDefined();
    const result = await handler!(
      {},
      { tenantId: "almanac", userId: null, source: "test" },
    );
    expect(result.ok).toBe(true);
    expect(result.errorMessage).toBeUndefined();
  });

  it("classifier 핸들러: FAILURE adapter 가 ok=false + errorMessage 전달", async () => {
    const handler = manifest.cronHandlers?.["classifier"];
    expect(handler).toBeDefined();
    const result = await handler!(
      {},
      { tenantId: "almanac", userId: null, source: "test" },
    );
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toBe("mock-classifier-fail");
  });

  it("5 ContentXxx 모델 dataApiAllowlist read-only 노출", () => {
    const allowlist = manifest.dataApiAllowlist ?? {};
    const expected = [
      "ContentCategory",
      "ContentSource",
      "ContentIngestedItem",
      "ContentItem",
      "ContentItemMetric",
    ];
    for (const model of expected) {
      expect(allowlist[model]).toEqual({
        read: true,
        list: true,
        write: false,
      });
    }
  });

  it("envVarsRequired = GEMINI_API_KEY + ALMANAC_ALLOWED_ORIGINS", () => {
    expect(manifest.envVarsRequired).toEqual([
      "GEMINI_API_KEY",
      "ALMANAC_ALLOWED_ORIGINS",
    ]);
  });

  // ─── PLUGIN-MIG-3 Chunk B: 5 route 등록 검증 ───
  it("5 라우트 등록 (categories/sources/today-top/items/:slug/contents)", () => {
    const routes = manifest.routes ?? [];
    const paths = routes.map((r) => r.path).sort();
    expect(paths).toEqual([
      "categories",
      "contents",
      "items/:slug",
      "sources",
      "today-top",
    ]);
  });

  it("각 라우트는 GET + OPTIONS 메서드 핸들러 보유", () => {
    const routes = manifest.routes ?? [];
    expect(routes.length).toBe(5);
    for (const reg of routes) {
      expect(typeof reg.methods.GET).toBe("function");
      expect(typeof reg.methods.OPTIONS).toBe("function");
    }
  });

  it("라우트 메서드 핸들러는 기타 변경 메서드 미지원 (POST/PATCH/DELETE)", () => {
    const routes = manifest.routes ?? [];
    for (const reg of routes) {
      expect(reg.methods.POST).toBeUndefined();
      expect(reg.methods.PATCH).toBeUndefined();
      expect(reg.methods.DELETE).toBeUndefined();
      expect(reg.methods.PUT).toBeUndefined();
    }
  });
});
