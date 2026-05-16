// =============================================================================
// 모듈: aggregator/cleanup
// 역할: content_ingested_items 의 30일 경과 rejected/duplicate 행 삭제
// 배경:
//   기존에는 cron kind=SQL 의 payload.sql 로 raw DELETE 를 실행했으나,
//   src/lib/cron/runner.ts:46-65 의 SQL 핸들러가 의도적으로 readonly 풀 사용
//   (07-adr-028-impl-spec §2.3 — connection 안정성). DELETE 는 "cannot execute
//   DELETE in a read-only transaction" 으로 매번 FAILURE.
//   → AGGREGATOR module=cleanup 으로 이전. tenant-scoped + writable + 통계 보고.
//
// 핵심 정책:
//   - status IN (rejected, duplicate) 만 삭제 (promoted/ready/pending 은 보존)
//   - fetched_at < NOW() - retentionDays 일 (기본 30일)
//   - withTenantTx 로 single transaction + tenant 격리
//   - WHERE tenantId 명시 (S84-D defense-in-depth, BYPASSRLS 회피)
// =============================================================================

import {
  withTenantTx,
  type TenantContext,
} from "@/lib/db/prisma-tenant-client";

const DEFAULT_RETENTION_DAYS = 30;

export interface CleanupOptions {
  /** retention 일수 (기본 30) */
  retentionDays?: number;
}

export interface CleanupResult {
  deleted: number;
  durationMs: number;
}

/**
 * 30일 경과 rejected/duplicate ingested 행 삭제. promoted 는 보존 (FK 무결성).
 *
 * cron payload 예: { kind: "AGGREGATOR", module: "cleanup" }
 * runner.ts:dispatchAggregatorOnMain 이 ctx 와 함께 호출.
 */
export async function runCleanup(
  ctx: TenantContext,
  options?: CleanupOptions,
): Promise<CleanupResult> {
  const started = Date.now();
  const retentionDays = options?.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const result = await withTenantTx(ctx.tenantId, async (tx) => {
    return tx.contentIngestedItem.deleteMany({
      where: {
        // S84-D: BYPASSRLS prod 회피 — RLS 외 explicit tenantId 필터 강제.
        tenantId: ctx.tenantId,
        status: { in: ["rejected", "duplicate"] },
        fetchedAt: { lt: cutoff },
      },
    });
  });

  return {
    deleted: result.count,
    durationMs: Date.now() - started,
  };
}
