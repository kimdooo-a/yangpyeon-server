/**
 * fetcher-pipeline — RSS / HTML / API 패치커가 공유하는 단일 소스 처리 사이클.
 *
 * PLUGIN-MIG-2 (S98) 추출: src/lib/aggregator/runner.ts 의 private helper
 *   - runFetchersByKind
 *   - processSingleSource
 *   - markSourceFailure
 *   - buildPendingRow
 * 를 본 모듈로 이전. handlers/{rss,html,api}-* 가 호출.
 *
 * 외부 의존 (PLUGIN-MIG-4 까지 src/lib/aggregator 잔존):
 *   - fetchSource: src/lib/aggregator/fetchers
 *   - dedupeAgainstDb / urlHash: src/lib/aggregator/dedupe
 *   - ContentSource, Prisma: @/generated/prisma/client (PLUGIN-MIG-4 에서 fragment 분리)
 *
 * 시그니처: runFetchersByKind(ctx, kinds) → AggregatorRunResult
 *   - startedAt 인자 제거 — 본 함수 내부에서 Date.now() 캡처 (handler 분리 후 단일 진입점)
 */
import {
  tenantPrismaFor,
  type TenantContext,
} from "@/lib/db/prisma-tenant-client";
import type { ContentSource, Prisma } from "@/generated/prisma/client";
import type {
  AggregatorRunResult,
  RawItem,
  FetchReport,
} from "@yangpyeon/tenant-almanac/lib/types";
import { fetchSource } from "@yangpyeon/tenant-almanac/lib/fetchers";
import { dedupeAgainstDb, urlHash } from "@yangpyeon/tenant-almanac/lib/dedupe";

const FAILURE_THRESHOLD = 5;

export async function runFetchersByKind(
  ctx: TenantContext,
  kinds: ContentSource["kind"][],
): Promise<AggregatorRunResult> {
  const startedAt = Date.now();
  const prisma = tenantPrismaFor(ctx);
  const sources = await prisma.contentSource.findMany({
    where: { kind: { in: kinds }, active: true },
    orderBy: { id: "asc" },
  });

  const reports: FetchReport[] = [];
  for (const source of sources) {
    reports.push(await processSingleSource(ctx, source));
  }

  const totalFetched = reports.reduce((s, r) => s + r.fetched, 0);
  const totalInserted = reports.reduce((s, r) => s + r.inserted, 0);
  const totalDuplicates = reports.reduce((s, r) => s + r.duplicates, 0);
  const totalErrors = reports.reduce((s, r) => s + r.errors.length, 0);

  return {
    status: "SUCCESS",
    durationMs: Date.now() - startedAt,
    message:
      `sources=${sources.length} fetched=${totalFetched} inserted=${totalInserted} ` +
      `duplicates=${totalDuplicates} errors=${totalErrors}`,
  };
}

async function processSingleSource(
  ctx: TenantContext,
  source: ContentSource,
): Promise<FetchReport> {
  const start = Date.now();
  const report: FetchReport = {
    sourceId: source.id,
    sourceSlug: source.slug,
    fetched: 0,
    inserted: 0,
    duplicates: 0,
    errors: [],
    durationMs: 0,
  };

  try {
    const raw = await fetchSource(source);
    report.fetched = raw.length;

    const valid = raw.filter((i): i is RawItem => Boolean(i.url && i.title));

    const { fresh, duplicates } = await dedupeAgainstDb(valid, ctx);
    report.duplicates = duplicates;

    if (fresh.length > 0) {
      const rows = fresh.map((i) => buildPendingRow(source.id, i));
      const prisma = tenantPrismaFor(ctx);
      const result = await prisma.contentIngestedItem.createMany({
        data: rows,
        skipDuplicates: true,
      });
      report.inserted = result.count;
    }

    const prisma = tenantPrismaFor(ctx);
    await prisma.contentSource.update({
      where: { id: source.id },
      data: {
        consecutiveFailures: 0,
        lastSuccessAt: new Date(),
        lastFetchedAt: new Date(),
        lastError: null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    report.errors.push(message);
    console.error(
      `[tenant-almanac/fetcher-pipeline] source #${source.id} (${source.slug}) 실패:`,
      message,
    );
    await markSourceFailure(ctx, source, message);
  }

  report.durationMs = Date.now() - start;
  return report;
}

function buildPendingRow(
  sourceId: number,
  item: RawItem,
): Prisma.ContentIngestedItemCreateManyInput {
  return {
    sourceId,
    url: item.url,
    urlHash: urlHash(item.url),
    title: item.title.slice(0, 500),
    summary: item.summary?.slice(0, 5000) ?? null,
    contentHtml: item.contentHtml?.slice(0, 50_000) ?? null,
    author: item.author?.slice(0, 200) ?? null,
    imageUrl: item.imageUrl?.slice(0, 1000) ?? null,
    publishedAt: item.publishedAt ?? null,
    status: "pending",
  };
}

async function markSourceFailure(
  ctx: TenantContext,
  source: ContentSource,
  message: string,
): Promise<void> {
  const next = (source.consecutiveFailures ?? 0) + 1;
  const prisma = tenantPrismaFor(ctx);
  await prisma.contentSource.update({
    where: { id: source.id },
    data: {
      consecutiveFailures: next,
      lastFetchedAt: new Date(),
      lastError: message.slice(0, 500),
      ...(next >= FAILURE_THRESHOLD ? { active: false } : {}),
    },
  });
  if (next >= FAILURE_THRESHOLD) {
    console.error(
      `[tenant-almanac/fetcher-pipeline] source #${source.id} (${source.slug}) 연속 실패 ${next}회 — active=false 비활성화`,
    );
  }
}
