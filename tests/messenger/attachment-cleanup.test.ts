/**
 * tests/messenger/attachment-cleanup.test.ts
 *
 * M5-ATTACH-2 (S96) — 30일 message_attachments dereference cron.
 *
 * 분류:
 *   - runMessengerAttachmentCleanup (5) — withTenantTx mocked, deleteMany 호출 + WHERE 검증
 *   - 회귀 (1) — 30 days cutoff 정확성
 *
 * spec (ADR-030 §Q8 (b)):
 *   - 메시지 회수 (deletedAt IS NOT NULL) 후 30일 경과 시 첨부 dereference
 *   - WHERE 조건: tenantId 명시 + message.deletedAt < cutoff
 *   - 회수 안된 메시지 (deletedAt IS NULL) 의 첨부는 보존
 *
 * 테스트 패턴: aggregator/cleanup.test.ts 와 동일 (withTenantTx 모킹).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// withTenantTx 모킹 — cleanup 이 호출하는 외부 의존만 격리.
// ─────────────────────────────────────────────────────────────────────────────
const deleteManyMock = vi.fn();

vi.mock("@/lib/db/prisma-tenant-client", () => ({
  withTenantTx: vi.fn(async (_tenantId: string, fn: (tx: unknown) => unknown) => {
    return fn({
      messageAttachment: {
        deleteMany: deleteManyMock,
      },
    });
  }),
}));

import { runMessengerAttachmentCleanup } from "@/lib/messenger/attachment-cleanup";

const FAKE_TENANT_CTX = {
  tenantId: "00000000-0000-0000-0000-000000000001",
};

beforeEach(() => {
  deleteManyMock.mockReset();
});

describe("runMessengerAttachmentCleanup — M5-ATTACH-2 30일 deref cron", () => {
  it("1. message.deletedAt IS NOT NULL + lt(cutoff) 만 삭제", async () => {
    deleteManyMock.mockResolvedValueOnce({ count: 4 });
    await runMessengerAttachmentCleanup(FAKE_TENANT_CTX);

    const callArgs = deleteManyMock.mock.calls[0][0];
    expect(callArgs.where.message.deletedAt.not).toBeNull();
    expect(callArgs.where.message.deletedAt.lt).toBeInstanceOf(Date);
  });

  it("2. cutoff = NOW() - 30 days (default)", async () => {
    deleteManyMock.mockResolvedValueOnce({ count: 0 });
    const before = Date.now();
    await runMessengerAttachmentCleanup(FAKE_TENANT_CTX);
    const after = Date.now();

    const callArgs = deleteManyMock.mock.calls[0][0];
    const cutoff = callArgs.where.message.deletedAt.lt as Date;
    const expectedMin = before - 30 * 24 * 60 * 60 * 1000;
    const expectedMax = after - 30 * 24 * 60 * 60 * 1000;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(cutoff.getTime()).toBeLessThanOrEqual(expectedMax);
  });

  it("3. options.retentionDays 로 cutoff 조정 가능", async () => {
    deleteManyMock.mockResolvedValueOnce({ count: 0 });
    const before = Date.now();
    await runMessengerAttachmentCleanup(FAKE_TENANT_CTX, { retentionDays: 7 });
    const after = Date.now();

    const callArgs = deleteManyMock.mock.calls[0][0];
    const cutoff = callArgs.where.message.deletedAt.lt as Date;
    const expectedMin = before - 7 * 24 * 60 * 60 * 1000;
    const expectedMax = after - 7 * 24 * 60 * 60 * 1000;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(cutoff.getTime()).toBeLessThanOrEqual(expectedMax);
  });

  it("4. tenantId 명시 WHERE (S84-D defense-in-depth, BYPASSRLS 회피)", async () => {
    deleteManyMock.mockResolvedValueOnce({ count: 0 });
    await runMessengerAttachmentCleanup(FAKE_TENANT_CTX);
    const callArgs = deleteManyMock.mock.calls[0][0];
    expect(callArgs.where.tenantId).toBe(FAKE_TENANT_CTX.tenantId);
  });

  it("5. 결과 = { dereferenced: count, durationMs }", async () => {
    deleteManyMock.mockResolvedValueOnce({ count: 11 });
    const result = await runMessengerAttachmentCleanup(FAKE_TENANT_CTX);
    expect(result.dereferenced).toBe(11);
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("6. withTenantTx 가 ctx.tenantId 와 함께 호출됨", async () => {
    deleteManyMock.mockResolvedValueOnce({ count: 0 });
    const { withTenantTx } = await import("@/lib/db/prisma-tenant-client");
    await runMessengerAttachmentCleanup(FAKE_TENANT_CTX);
    expect(withTenantTx).toHaveBeenCalledWith(
      FAKE_TENANT_CTX.tenantId,
      expect.any(Function),
    );
  });
});
