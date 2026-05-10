// =============================================================================
// 모듈: aggregator/runner
// 역할: cron AGGREGATOR 분기 진입점 — module 디스패처
// 출처: docs/assets/yangpyeon-aggregator-spec/code/src/lib/aggregator/runner.ts
// 변경 (multi-tenant 적응):
//   - import { prisma } → import { tenantPrismaFor, type TenantContext }
//   - 시그니처: runAggregatorModule({module,batch}) → runAggregatorModule(ctx, {module,batch})
//   - 모든 contentSource/contentIngestedItem 호출 → tenantPrismaFor(ctx)
//   - dedupeAgainstDb(items, ctx) — B2 시그니처
//   - promotePending(ctx, batch) — B5 시그니처
//   - memory rule project_workspace_singleton_globalthis: tenantPrismaFor 매 호출
//     마다 fresh 인스턴스 (Prisma 7 ALS propagation 깨짐 방지)
// 흐름:
//   1) fetcher (rss/html/api/firecrawl) → INSERT(status='pending')
//   2) classifier → 규칙 + LLM → status='ready'
//   3) promoter   → content_items INSERT, status='promoted'
// 실패 정책:
//   - 소스 단위 try-catch (cross-source 격리)
//   - 연속 실패 5회 도달 시 source.active=false 자동 전환
//   - 성공 시 consecutiveFailures=0, lastSuccessAt 갱신
// =============================================================================

import {
  tenantPrismaFor,
  type TenantContext,
} from "@/lib/db/prisma-tenant-client";
import type { ContentSource, Prisma } from "@/generated/prisma/client";
import type {
  AggregatorModule,
  AggregatorRunResult,
  RawItem,
  FetchReport,
} from "./types";
import { fetchSource } from "./fetchers";
import { dedupeAgainstDb, urlHash } from "./dedupe";
import { enrichItem } from "./llm";
import { promotePending } from "./promote";
import { runCleanup } from "./cleanup";
import { runMessengerAttachmentCleanup } from "@/lib/messenger/attachment-cleanup";

const FAILURE_THRESHOLD = 5;
const DEFAULT_CLASSIFIER_BATCH = 50;

interface RunnerPayload {
  module: AggregatorModule;
  /** classifier/promoter 배치 크기 */
  batch?: number;
}

/**
 * cron AGGREGATOR 분기에서 호출되는 단일 진입점.
 * payload.module 에 따라 5개 서브 러너로 분기.
 */
export async function runAggregatorModule(
  ctx: TenantContext,
  payload: RunnerPayload,
): Promise<AggregatorRunResult> {
  const started = Date.now();
  try {
    switch (payload.module) {
      case "rss-fetcher":
        return await runFetchersByKind(ctx, ["RSS"], started);
      case "html-scraper":
        return await runFetchersByKind(ctx, ["HTML"], started);
      case "api-poller":
        return await runFetchersByKind(ctx, ["API", "FIRECRAWL"], started);
      case "classifier":
        return await runClassifier(
          ctx,
          payload.batch ?? DEFAULT_CLASSIFIER_BATCH,
          started,
        );
      case "promoter":
        return await runPromoter(
          ctx,
          payload.batch ?? DEFAULT_CLASSIFIER_BATCH,
          started,
        );
      case "cleanup":
        return await runCleanupModule(ctx, started);
      case "messenger-attachments-deref":
        return await runMessengerAttachmentCleanupModule(ctx, started);
      default:
        return {
          status: "FAILURE",
          durationMs: Date.now() - started,
          message: `알 수 없는 module: ${String(payload.module)}`,
        };
    }
  } catch (err) {
    return {
      status: "FAILURE",
      durationMs: Date.now() - started,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

// ----------------------------------------------------------------------------
// fetcher 러너 — 공통 로직
// ----------------------------------------------------------------------------

/**
 * kind 별 활성 소스를 순회하며 fetch → dedupe → INSERT(pending) 반복.
 * 소스마다 try-catch 로 감싸 한 소스 실패가 다른 소스를 막지 않도록 함.
 */
async function runFetchersByKind(
  ctx: TenantContext,
  kinds: ContentSource["kind"][],
  startedAt: number,
): Promise<AggregatorRunResult> {
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

/** 단일 소스의 fetch + dedupe + INSERT 사이클 */
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

    // url 또는 title 비어있는 항목 제거
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

    // 성공 갱신 — consecutiveFailures reset + lastSuccessAt
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
      `[runner] source #${source.id} (${source.slug}) 실패:`,
      message,
    );
    await markSourceFailure(ctx, source, message);
  }

  report.durationMs = Date.now() - start;
  return report;
}

/** RawItem → ContentIngestedItem.createMany 입력 변환 */
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

/** 실패 시 consecutiveFailures 증가 + 5 도달하면 active=false */
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
      `[runner] source #${source.id} (${source.slug}) 연속 실패 ${next}회 — active=false 비활성화`,
    );
  }
}

// ----------------------------------------------------------------------------
// classifier / promoter
// ----------------------------------------------------------------------------

/**
 * pending 아이템을 batch 만큼 가져와 LLM 보강 → ready 로 전환.
 * LLM 한도 초과 시 enrichItem 이 규칙 결과만 반환 (graceful).
 */
async function runClassifier(
  ctx: TenantContext,
  batch: number,
  startedAt: number,
): Promise<AggregatorRunResult> {
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
        `[classifier] ingested #${row.id} 분류 실패:`,
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

async function runPromoter(
  ctx: TenantContext,
  batch: number,
  startedAt: number,
): Promise<AggregatorRunResult> {
  const result = await promotePending(ctx, batch);
  return {
    status:
      result.errors > 0 && result.promoted === 0 ? "FAILURE" : "SUCCESS",
    durationMs: Date.now() - startedAt,
    message: `promoted=${result.promoted} errors=${result.errors}`,
  };
}

/**
 * cleanup 모듈 — 30일 경과 rejected/duplicate ingested 행 삭제.
 * 기존 SQL kind 의 readonly 풀 한계 회피용 (S84+ 부채 해소).
 */
async function runCleanupModule(
  ctx: TenantContext,
  startedAt: number,
): Promise<AggregatorRunResult> {
  const result = await runCleanup(ctx);
  return {
    status: "SUCCESS",
    durationMs: Date.now() - startedAt,
    message: `deleted=${result.deleted}`,
  };
}

/**
 * messenger-attachments-deref 모듈 — 회수된 메시지의 첨부 30일 경과 시 deref.
 * ADR-030 §Q8 (b), S96 M5-ATTACH-2.
 */
async function runMessengerAttachmentCleanupModule(
  ctx: TenantContext,
  startedAt: number,
): Promise<AggregatorRunResult> {
  const result = await runMessengerAttachmentCleanup(ctx);
  return {
    status: "SUCCESS",
    durationMs: Date.now() - startedAt,
    message: `dereferenced=${result.dereferenced}`,
  };
}
