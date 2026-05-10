/**
 * promoter handler — ready ingested 아이템 → ContentItem 으로 promote.
 *
 * PLUGIN-MIG-2 (S98): src/lib/aggregator/runner.ts:runPromoter(ctx, batch, startedAt) 추출.
 */
import type { TenantContext } from "@/lib/db/prisma-tenant-client";
import type { AggregatorRunResult } from "@/lib/aggregator/types";
import { promotePending } from "@/lib/aggregator/promote";

const DEFAULT_BATCH = 50;

export async function runPromoterHandler(
  ctx: TenantContext,
  payload?: { batch?: number },
): Promise<AggregatorRunResult> {
  const startedAt = Date.now();
  const batch = payload?.batch ?? DEFAULT_BATCH;
  const result = await promotePending(ctx, batch);
  return {
    status:
      result.errors > 0 && result.promoted === 0 ? "FAILURE" : "SUCCESS",
    durationMs: Date.now() - startedAt,
    message: `promoted=${result.promoted} errors=${result.errors}`,
  };
}
