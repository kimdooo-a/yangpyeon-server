/**
 * html-scraper handler — HTML 소스 fetch + dedupe + INSERT(pending) 사이클.
 *
 * PLUGIN-MIG-2 (S98): src/lib/aggregator/runner.ts:runFetchersByKind(ctx, ["HTML"]) 추출.
 */
import type { TenantContext } from "@/lib/db/prisma-tenant-client";
import type { AggregatorRunResult } from "@/lib/aggregator/types";
import { runFetchersByKind } from "../lib/fetcher-pipeline";

export async function runHtmlScraper(
  ctx: TenantContext,
): Promise<AggregatorRunResult> {
  return runFetchersByKind(ctx, ["HTML"]);
}
