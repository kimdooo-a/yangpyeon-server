// =============================================================================
// 모듈: aggregator/runner
// 역할: cron AGGREGATOR 분기 진입점 — module 디스패처
//
// PLUGIN-MIG-2 (S98) 추출 후:
//   - 6 almanac 핸들러 본체는 packages/tenant-almanac/src/handlers/ 로 이전 완료.
//   - 본 파일은 PLUGIN-MIG-5 까지 thin dispatcher 로 잔존 (cron/runner.ts 가 호출).
//   - messenger-attachments-deref 는 almanac 외 도메인 — 본 dispatcher 에 잔존
//     (PLUGIN-MIG-5 에서 core handler map 으로 분리 예정).
//
// PLUGIN-MIG-5 시점에 본 파일은 packages/core/src/tenant/dispatcher.ts (또는 동등) 로
// 흡수되거나 단순 re-export shim 으로 축소 가능.
// =============================================================================

import type { TenantContext } from "@/lib/db/prisma-tenant-client";
import type { AggregatorModule, AggregatorRunResult } from "./types";
import {
  runRssFetcher,
  runHtmlScraper,
  runApiPoller,
  runClassifierHandler,
  runPromoterHandler,
  runCleanupHandler,
} from "@yangpyeon/tenant-almanac";
import { runMessengerAttachmentCleanup } from "@/lib/messenger/attachment-cleanup";

interface RunnerPayload {
  module: AggregatorModule;
  /** classifier/promoter 배치 크기 */
  batch?: number;
}

/**
 * cron AGGREGATOR 분기에서 호출되는 단일 진입점.
 * payload.module 에 따라 6 almanac 핸들러 + messenger 핸들러로 분기.
 */
export async function runAggregatorModule(
  ctx: TenantContext,
  payload: RunnerPayload,
): Promise<AggregatorRunResult> {
  const dispatchStart = Date.now();
  try {
    switch (payload.module) {
      case "rss-fetcher":
        return await runRssFetcher(ctx);
      case "html-scraper":
        return await runHtmlScraper(ctx);
      case "api-poller":
        return await runApiPoller(ctx);
      case "classifier":
        return await runClassifierHandler(ctx, { batch: payload.batch });
      case "promoter":
        return await runPromoterHandler(ctx, { batch: payload.batch });
      case "cleanup":
        return await runCleanupHandler(ctx);
      case "messenger-attachments-deref":
        return await runMessengerAttachmentDerefHandler(ctx);
      default:
        return {
          status: "FAILURE",
          durationMs: Date.now() - dispatchStart,
          message: `알 수 없는 module: ${String(payload.module)}`,
        };
    }
  } catch (err) {
    return {
      status: "FAILURE",
      durationMs: Date.now() - dispatchStart,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * messenger-attachments-deref 모듈 — 회수된 메시지의 첨부 30일 경과 시 deref.
 * ADR-030 §Q8 (b), S96 M5-ATTACH-2.
 *
 * almanac 이 아닌 messenger 도메인이라 packages/tenant-almanac 으로 이전하지 않고
 * 본 파일에 inline 유지. PLUGIN-MIG-5 에서 core handler map 으로 분리 예정.
 */
async function runMessengerAttachmentDerefHandler(
  ctx: TenantContext,
): Promise<AggregatorRunResult> {
  const startedAt = Date.now();
  const result = await runMessengerAttachmentCleanup(ctx);
  return {
    status: "SUCCESS",
    durationMs: Date.now() - startedAt,
    message: `dereferenced=${result.dereferenced}`,
  };
}
