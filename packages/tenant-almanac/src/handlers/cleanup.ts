/**
 * cleanup handler — 30일 경과 rejected/duplicate ingested 행 삭제.
 *
 * PLUGIN-MIG-2 (S98): src/lib/aggregator/runner.ts:runCleanupModule(ctx, startedAt) 추출.
 */
import type { TenantContext } from "@/lib/db/prisma-tenant-client";
import type { AggregatorRunResult } from "@/lib/aggregator/types";
import { runCleanup } from "@/lib/aggregator/cleanup";

export async function runCleanupHandler(
  ctx: TenantContext,
): Promise<AggregatorRunResult> {
  const startedAt = Date.now();
  const result = await runCleanup(ctx);
  return {
    status: "SUCCESS",
    durationMs: Date.now() - startedAt,
    message: `deleted=${result.deleted}`,
  };
}
