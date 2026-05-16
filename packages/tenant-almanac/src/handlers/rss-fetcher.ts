/**
 * rss-fetcher handler — RSS 소스 fetch + dedupe + INSERT(pending) 사이클.
 *
 * PLUGIN-MIG-2 (S98): src/lib/aggregator/runner.ts:runFetchersByKind(ctx, ["RSS"]) 추출.
 */
import type { TenantContext } from "@/lib/db/prisma-tenant-client";
import type { AggregatorRunResult } from "@yangpyeon/tenant-almanac/lib/types";
import { runFetchersByKind } from "../lib/fetcher-pipeline";

export async function runRssFetcher(
  ctx: TenantContext,
): Promise<AggregatorRunResult> {
  return runFetchersByKind(ctx, ["RSS"]);
}
