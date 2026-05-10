/**
 * @yangpyeon/core/tenant/manifest TDD — TenantManifest 타입 + defineTenant helper.
 *
 * 본 테스트는 런타임 동작보다 type 표면을 검증한다 (compile-time safety).
 * 실패 시 RED 는 type error 형태 (.test.ts 파일이 tsc include 에 잡혀있음).
 */
import { describe, it, expect } from "vitest";
import { defineTenant, type TenantManifest } from "./manifest";

describe("defineTenant", () => {
  it("returns the manifest unchanged (identity helper)", () => {
    const manifest = defineTenant({
      id: "test-tenant",
      version: "0.0.1",
      displayName: "Test",
      enabled: true,
    });
    expect(manifest.id).toBe("test-tenant");
    expect(manifest.enabled).toBe(true);
  });

  it("supports optional cronHandlers / routes / adminPages / prismaFragment / envVarsRequired", () => {
    const manifest: TenantManifest = {
      id: "almanac",
      version: "0.0.1",
      displayName: "Almanac (Aggregator)",
      enabled: true,
      cronHandlers: {
        "rss-fetcher": async () => ({ ok: true, processedCount: 0 }),
      },
      routes: [
        {
          // PLUGIN-MIG-3 (S99): tenant-relative path 패턴 + 메서드별 핸들러.
          path: "contents",
          methods: {
            GET: async () => new Response("ok", { status: 200 }),
          },
        },
      ],
      adminPages: [
        {
          slug: "sources",
          page: async () => ({ default: () => null }),
        },
      ],
      prismaFragment: "./prisma/fragment.prisma",
      envVarsRequired: ["GEMINI_API_KEY"],
      dataApiAllowlist: {
        ContentItem: { read: true, list: true, write: false },
      },
    };
    expect(manifest.cronHandlers?.["rss-fetcher"]).toBeDefined();
    expect(manifest.routes).toHaveLength(1);
    expect(manifest.envVarsRequired).toEqual(["GEMINI_API_KEY"]);
  });

  it("cronHandler 시그니처가 ok=true 반환 시 result.processedCount 표면", async () => {
    const handler = async () => ({ ok: true as const, processedCount: 42 });
    const result = await handler();
    expect(result.ok).toBe(true);
    expect(result.processedCount).toBe(42);
  });
});
