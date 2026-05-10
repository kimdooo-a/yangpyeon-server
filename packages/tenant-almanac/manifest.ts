/**
 * @yangpyeon/tenant-almanac/manifest — Almanac (RSS aggregator) tenant 매니페스트.
 *
 * ADR-024 옵션 D (Hybrid: Complex=workspace) 의 첫 적용 사례.
 * PLUGIN-MIG-1 (S98) 골격 — schema-first 정의, 본 핸들러 본체는 추후 chunk 에서 이전.
 *
 * 마이그레이션 단계:
 *   - PLUGIN-MIG-1 (S98, 본 chunk): 골격만 — manifest.ts + 빈 src/handlers/ 디렉토리
 *   - PLUGIN-MIG-2 (Phase 16): src/lib/aggregator/* → packages/tenant-almanac/src/handlers/*
 *   - PLUGIN-MIG-3: src/app/api/v1/almanac/* (alias) + 정식 routes 본체 이전
 *   - PLUGIN-MIG-4: prisma/schema.prisma 의 5 Content* 모델 → packages/tenant-almanac/prisma/fragment.prisma
 *   - PLUGIN-MIG-5: src/lib/cron/runner.ts 의 AGGREGATOR kind 분기 제거 → manifest dispatch
 *
 * 본 단계의 핸들러는 모두 "미이전" stub — cron runner 가 본 매니페스트로 dispatch 되기
 * 전까지는 기존 `src/lib/aggregator/runner.ts:runAggregatorModule` 가 계속 사용됨.
 */
import { defineTenant, type TenantCronHandler } from "@yangpyeon/core";

/** 핸들러 본체 미이전 placeholder — PLUGIN-MIG-2 에서 실제 import 로 교체. */
function todoHandler(moduleName: string): TenantCronHandler {
  return async () => ({
    ok: false,
    errorMessage: `tenant-almanac '${moduleName}' 핸들러 본체 미이전 (PLUGIN-MIG-2 에서 src/lib/aggregator/${moduleName}.ts 본체 → packages/tenant-almanac/src/handlers/${moduleName}.ts 이전 필요)`,
  });
}

export default defineTenant({
  id: "almanac",
  version: "0.0.1",
  displayName: "Almanac (RSS Aggregator)",
  /** 본격 dispatch 전까지 false — cron runner 가 본 manifest 를 무시하고 기존 AGGREGATOR 분기 사용. */
  enabled: false,

  cronHandlers: {
    "rss-fetcher": todoHandler("rss-fetcher"),
    "html-scraper": todoHandler("html-scraper"),
    "api-poller": todoHandler("api-poller"),
    classifier: todoHandler("classifier"),
    promoter: todoHandler("promoter"),
    cleanup: todoHandler("cleanup"),
  },

  /**
   * Phase 1.6 (T1.6) 시점에 src/app/api/v1/almanac/[...path]/route.ts 가 308 alias 로
   * /api/v1/t/almanac/* 으로 redirect 만 한다. 정식 핸들러 본체는 PLUGIN-MIG-3 에서 이전.
   */
  routes: [
    // PLUGIN-MIG-3 에서 본격 추가:
    // { path: "/api/v1/t/almanac/contents", handler: () => import("./src/routes/contents") },
    // { path: "/api/v1/t/almanac/categories", handler: () => import("./src/routes/categories") },
    // { path: "/api/v1/t/almanac/sources", handler: () => import("./src/routes/sources") },
    // { path: "/api/v1/t/almanac/items", handler: () => import("./src/routes/items") },
    // { path: "/api/v1/t/almanac/today-top", handler: () => import("./src/routes/today-top") },
  ],

  /**
   * 현재 admin UI (현 코드베이스) — src/app/(protected)/admin/aggregator/* 에 존재 안 함.
   * 본 컨슈머의 운영자 대시보드는 차후 구현 (PLUGIN-MIG-3 와 동시 또는 그 후).
   */
  adminPages: [
    // PLUGIN-MIG-3 또는 후속에서 본격 추가:
    // { slug: "sources", page: () => import("./src/admin/sources/page") },
    // { slug: "categories", page: () => import("./src/admin/categories/page") },
    // { slug: "items", page: () => import("./src/admin/items/page") },
    // { slug: "dashboard", page: () => import("./src/admin/dashboard/page") },
  ],

  /** PLUGIN-MIG-4 에서 본격 채택. 현재는 prisma/schema.prisma 본체에 5 Content* 모델 그대로. */
  prismaFragment: "./prisma/fragment.prisma",

  envVarsRequired: ["GEMINI_API_KEY", "ALMANAC_ALLOWED_ORIGINS"],

  /** PLUGIN-MIG-3 시점에 src/lib/data-api/allowlist.ts 의 Content* 분리. */
  dataApiAllowlist: {
    ContentCategory: { read: true, list: true, write: false },
    ContentSource: { read: true, list: true, write: false },
    ContentIngestedItem: { read: true, list: true, write: false },
    ContentItem: { read: true, list: true, write: false },
    ContentItemMetric: { read: true, list: true, write: false },
  },
});
