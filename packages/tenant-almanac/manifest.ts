/**
 * @yangpyeon/tenant-almanac/manifest — Almanac (RSS aggregator) tenant 매니페스트.
 *
 * ADR-024 옵션 D (Hybrid: Complex=workspace) 의 첫 적용 사례.
 * PLUGIN-MIG-2 (S98) 본격 적용 — 6 핸들러 본체 이전 + adapter 적용.
 *
 * 마이그레이션 단계:
 *   - PLUGIN-MIG-1 (S98 1차): 골격만 — manifest.ts + 빈 src/handlers/ 디렉토리
 *   - PLUGIN-MIG-2 (S98 2차, 본 chunk): src/lib/aggregator/* 핸들러 6개 → packages/tenant-almanac/src/handlers/* 이전
 *   - PLUGIN-MIG-3: src/app/api/v1/t/[tenant]/{categories,sources,today-top,items,contents}/route.ts → packages/tenant-almanac/src/routes/*
 *   - PLUGIN-MIG-4: prisma/schema.prisma 의 5 Content* 모델 → packages/tenant-almanac/prisma/fragment.prisma + tenantId backfill + RLS
 *   - PLUGIN-MIG-5: src/lib/cron/runner.ts 의 AGGREGATOR kind 분기 제거 → manifest dispatch
 *
 * 핸들러는 본격 이전 완료. 단, cron runner 가 본 매니페스트로 dispatch 되기 전까지 (PLUGIN-MIG-5)
 * 기존 `src/lib/aggregator/runner.ts:runAggregatorModule` 가 thin wrapper 로 동일 핸들러를 호출.
 */
import { defineTenant, type TenantCronHandler } from "@yangpyeon/core";
import type { AggregatorRunResult } from "@/lib/aggregator/types";
import { runRssFetcher } from "./src/handlers/rss-fetcher";
import { runHtmlScraper } from "./src/handlers/html-scraper";
import { runApiPoller } from "./src/handlers/api-poller";
import { runClassifierHandler } from "./src/handlers/classifier";
import { runPromoterHandler } from "./src/handlers/promoter";
import { runCleanupHandler } from "./src/handlers/cleanup";
import type { TenantContext } from "@/lib/db/prisma-tenant-client";

/**
 * AggregatorRunResult → TenantCronResult adapter.
 *
 * AggregatorRunResult: { status: "SUCCESS"|"FAILURE"|"TIMEOUT", durationMs, message? }
 * TenantCronResult:    { ok, processedCount?, errorMessage? }
 *
 * 매핑:
 *   - ok = (status === "SUCCESS")
 *   - errorMessage = (status !== "SUCCESS") 시 message
 *   - processedCount = undefined (message 가 freeform 이라 안전한 파싱 어려움;
 *     향후 enhancement 필요 시 AggregatorRunResult 에 structured count 필드 추가)
 */
function adapt(
  fn: (
    ctx: TenantContext,
    payload?: Record<string, unknown>,
  ) => Promise<AggregatorRunResult>,
): TenantCronHandler {
  return async (payload, ctx) => {
    const result = await fn(ctx, payload);
    return {
      ok: result.status === "SUCCESS",
      errorMessage:
        result.status === "SUCCESS" ? undefined : result.message,
    };
  };
}

export default defineTenant({
  id: "almanac",
  version: "0.1.0",
  displayName: "Almanac (RSS Aggregator)",
  /**
   * PLUGIN-MIG-2: 핸들러 본체 이전 완료 → enabled=true.
   * cron runner 가 manifest dispatch 채널을 사용하도록 PLUGIN-MIG-5 에서 전환.
   * 그 전까지는 src/lib/aggregator/runner.ts 가 동일 핸들러를 호출 (호환 경로).
   */
  enabled: true,

  cronHandlers: {
    "rss-fetcher": adapt(runRssFetcher),
    "html-scraper": adapt(runHtmlScraper),
    "api-poller": adapt(runApiPoller),
    classifier: adapt(runClassifierHandler),
    promoter: adapt(runPromoterHandler),
    cleanup: adapt(runCleanupHandler),
  },

  /**
   * PLUGIN-MIG-3 에서 본격 추가 — 현재는 src/app/api/v1/t/[tenant]/{...}/route.ts 가
   * 직접 처리. manifest.routes 는 [tenant]/[...path] catch-all dispatcher 가 사용 예정.
   */
  routes: [],

  /**
   * 현재 admin UI (현 코드베이스) — src/app/(protected)/admin/aggregator/* 에 존재.
   * PLUGIN-MIG-3 또는 후속에서 본 manifest 의 adminPages 에 등록.
   */
  adminPages: [],

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
