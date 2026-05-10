/**
 * tenant-almanac manifest TDD — PLUGIN-MIG-1 (S98) 골격 검증.
 *
 * 검증 범위:
 *   - alias `@yangpyeon/tenant-almanac` 가 동작 (tsconfig + vitest 동기화)
 *   - manifest 가 TenantManifest satisfies + 6 cron handler 선언
 *   - enabled=false (cron runner 가 manifest dispatch 채택 전 의도적 OFF)
 *   - 5 dataApiAllowlist 모델 명시 (PLUGIN-MIG-3 정합)
 *   - todoHandler 가 ok=false + 마이그레이션 안내 메시지 (PLUGIN-MIG-2 미완 노출)
 */
import { describe, it, expect } from "vitest";
import { manifest } from "@yangpyeon/tenant-almanac";

describe("tenant-almanac manifest (PLUGIN-MIG-1 골격)", () => {
  it("identifier 가 'almanac' + Complex tenant 표시", () => {
    expect(manifest.id).toBe("almanac");
    expect(manifest.displayName).toContain("Almanac");
    // 골격 단계에서는 enabled=false — cron runner 의 manifest dispatch 미채택.
    expect(manifest.enabled).toBe(false);
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

  it("핸들러 본체는 미이전 stub (ok=false + 안내 메시지)", async () => {
    const handler = manifest.cronHandlers?.["rss-fetcher"];
    expect(handler).toBeDefined();
    const result = await handler!(
      {},
      { tenantId: "almanac", userId: null, source: "test" },
    );
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain("PLUGIN-MIG-2");
    expect(result.errorMessage).toContain("rss-fetcher");
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
      expect(allowlist[model]).toEqual({ read: true, list: true, write: false });
    }
  });

  it("envVarsRequired = GEMINI_API_KEY + ALMANAC_ALLOWED_ORIGINS", () => {
    expect(manifest.envVarsRequired).toEqual([
      "GEMINI_API_KEY",
      "ALMANAC_ALLOWED_ORIGINS",
    ]);
  });
});
