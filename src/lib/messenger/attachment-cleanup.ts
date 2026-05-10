/**
 * 모듈: messenger/attachment-cleanup
 * 역할: 회수된 메시지(deletedAt IS NOT NULL)의 첨부를 30일 경과 시 dereference.
 *
 * 배경 (ADR-030 §Q8 (b), S96 M5-ATTACH-2):
 *   - 메시지는 회수 시 hard-delete 가 아닌 soft-delete (deletedAt + body=NULL).
 *   - MessageAttachment.message Cascade 는 hard-delete 만 처리하므로
 *     soft-delete 된 메시지의 첨부는 명시 cron 으로 정리해야 한다.
 *   - dereference 후 filebox 측 cleanup cron 이 owner 회수 시점에 File 자체를
 *     자연 GC. 본 모듈은 message_attachments row 만 삭제 (File 직접 미터치).
 *
 * 정책:
 *   - WHERE message.deletedAt IS NOT NULL AND deletedAt < NOW() - retentionDays
 *   - tenantId 명시 (S84-D defense-in-depth, BYPASSRLS 회피)
 *   - withTenantTx 로 single transaction + tenant 격리
 *   - 기본 retentionDays = 30
 *
 * cron payload 예: { kind: "AGGREGATOR", module: "messenger-attachments-deref" }
 * runner.ts:dispatchAggregatorOnMain 이 ctx 와 함께 호출.
 */
import {
  withTenantTx,
  type TenantContext,
} from "@/lib/db/prisma-tenant-client";

const DEFAULT_RETENTION_DAYS = 30;

export interface MessengerAttachmentCleanupOptions {
  /** retention 일수 (기본 30). */
  retentionDays?: number;
}

export interface MessengerAttachmentCleanupResult {
  /** dereference (DELETE) 된 message_attachments row 수. */
  dereferenced: number;
  durationMs: number;
}

export async function runMessengerAttachmentCleanup(
  ctx: TenantContext,
  options?: MessengerAttachmentCleanupOptions,
): Promise<MessengerAttachmentCleanupResult> {
  const started = Date.now();
  const retentionDays = options?.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const result = await withTenantTx(ctx.tenantId, async (tx) => {
    return tx.messageAttachment.deleteMany({
      where: {
        // S84-D: BYPASSRLS prod 회피 — RLS 외 explicit tenantId 필터 강제.
        tenantId: ctx.tenantId,
        message: {
          deletedAt: { not: null, lt: cutoff },
        },
      },
    });
  });

  return {
    dereferenced: result.count,
    durationMs: Date.now() - started,
  };
}
