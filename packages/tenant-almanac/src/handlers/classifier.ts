/**
 * classifier handler — pending ingested 아이템을 LLM/규칙으로 보강 → ready 전환.
 *
 * PLUGIN-MIG-2 (S98): src/lib/aggregator/runner.ts:runClassifier(ctx, batch, startedAt) 추출.
 * - startedAt 인자 제거 (handler 내부에서 캡처)
 * - default batch = 50 (DEFAULT_CLASSIFIER_BATCH 와 정합)
 */
import {
  tenantPrismaFor,
  type TenantContext,
} from "@/lib/db/prisma-tenant-client";
import type { AggregatorRunResult } from "@/lib/aggregator/types";
import { enrichItem } from "@/lib/aggregator/llm";

const DEFAULT_BATCH = 50;

export async function runClassifierHandler(
  ctx: TenantContext,
  payload?: { batch?: number },
): Promise<AggregatorRunResult> {
  const startedAt = Date.now();
  const batch = payload?.batch ?? DEFAULT_BATCH;
  const prisma = tenantPrismaFor(ctx);
  const pending = await prisma.contentIngestedItem.findMany({
    where: { status: "pending" },
    take: batch,
    orderBy: { id: "asc" },
  });

  let classified = 0;
  let errors = 0;

  for (const row of pending) {
    try {
      const enriched = await enrichItem({
        url: row.url,
        title: row.title,
        summary: row.summary ?? undefined,
        contentHtml: row.contentHtml ?? undefined,
        author: row.author ?? undefined,
        imageUrl: row.imageUrl ?? undefined,
        publishedAt: row.publishedAt ?? undefined,
      });

      const writePrisma = tenantPrismaFor(ctx);
      await writePrisma.contentIngestedItem.update({
        where: { id: row.id },
        data: {
          suggestedTrack: enriched.suggestedTrack ?? null,
          suggestedCategorySlug: enriched.suggestedCategorySlug ?? null,
          aiSummary: enriched.aiSummary ?? null,
          aiTags: enriched.aiTags ?? [],
          aiLanguage: enriched.aiLanguage ?? null,
          status: "ready",
        },
      });
      classified += 1;
    } catch (err) {
      console.error(
        `[tenant-almanac/classifier] ingested #${row.id} 분류 실패:`,
        (err as Error).message,
      );
      errors += 1;
    }
  }

  return {
    status: "SUCCESS",
    durationMs: Date.now() - startedAt,
    message: `pending=${pending.length} classified=${classified} errors=${errors}`,
  };
}
