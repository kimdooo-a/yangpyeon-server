/**
 * tests/aggregator/cleanup.test.ts
 *
 * Track B / S84-? — almanac-cleanup cron 이 SQL kind (readonly 풀) 에서 FAILURE
 * 상태였던 부채 해소. AGGREGATOR module=cleanup 으로 이전.
 *
 * 분류:
 *   - runCleanup (5) — withTenantTx mocked, deleteMany 호출 + WHERE 검증
 *   - 회귀 (1) — 30 days cutoff 정확성
 *
 * spec:
 *   - 기존 SQL: DELETE FROM content_ingested_items
 *               WHERE status IN ('rejected','duplicate')
 *                 AND fetched_at < NOW() - INTERVAL '30 days'
 *   - 수정 후: tenant-scoped + AGGREGATOR module
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// withTenantTx 모킹 — cleanup 이 호출하는 외부 의존만 격리.
// ─────────────────────────────────────────────────────────────────────────────
const deleteManyMock = vi.fn();

vi.mock("@/lib/db/prisma-tenant-client", () => ({
  withTenantTx: vi.fn(async (_tenantId: string, fn: (tx: unknown) => unknown) => {
    return fn({
      contentIngestedItem: {
        deleteMany: deleteManyMock,
      },
    });
  }),
}));

import { runCleanup } from "@yangpyeon/tenant-almanac/lib/cleanup";

const FAKE_TENANT_CTX = {
  tenantId: "00000000-0000-0000-0000-000000000001",
};

beforeEach(() => {
  deleteManyMock.mockReset();
});

describe("runCleanup — AGGREGATOR module=cleanup", () => {
  it("1. status IN (rejected, duplicate) 만 삭제", async () => {
    deleteManyMock.mockResolvedValueOnce({ count: 7 });
    await runCleanup(FAKE_TENANT_CTX);
    const callArgs = deleteManyMock.mock.calls[0][0];
    expect(callArgs.where.status.in).toEqual(["rejected", "duplicate"]);
  });

  it("2. fetched_at < NOW() - 30 days (default)", async () => {
    deleteManyMock.mockResolvedValueOnce({ count: 0 });
    const before = Date.now();
    await runCleanup(FAKE_TENANT_CTX);
    const after = Date.now();

    const callArgs = deleteManyMock.mock.calls[0][0];
    const cutoff = callArgs.where.fetchedAt.lt as Date;
    expect(cutoff).toBeInstanceOf(Date);
    const expectedMin = before - 30 * 24 * 60 * 60 * 1000;
    const expectedMax = after - 30 * 24 * 60 * 60 * 1000;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(cutoff.getTime()).toBeLessThanOrEqual(expectedMax);
  });

  it("3. options.retentionDays 로 cutoff 조정 가능", async () => {
    deleteManyMock.mockResolvedValueOnce({ count: 0 });
    const before = Date.now();
    await runCleanup(FAKE_TENANT_CTX, { retentionDays: 7 });
    const after = Date.now();

    const callArgs = deleteManyMock.mock.calls[0][0];
    const cutoff = callArgs.where.fetchedAt.lt as Date;
    const expectedMin = before - 7 * 24 * 60 * 60 * 1000;
    const expectedMax = after - 7 * 24 * 60 * 60 * 1000;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(cutoff.getTime()).toBeLessThanOrEqual(expectedMax);
  });

  it("4. tenantId 명시 WHERE (S84-D defense-in-depth, BYPASSRLS 회피)", async () => {
    deleteManyMock.mockResolvedValueOnce({ count: 0 });
    await runCleanup(FAKE_TENANT_CTX);
    const callArgs = deleteManyMock.mock.calls[0][0];
    expect(callArgs.where.tenantId).toBe(FAKE_TENANT_CTX.tenantId);
  });

  it("5. 결과 = { deleted: count, durationMs }", async () => {
    deleteManyMock.mockResolvedValueOnce({ count: 13 });
    const result = await runCleanup(FAKE_TENANT_CTX);
    expect(result.deleted).toBe(13);
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("6. withTenantTx 가 ctx.tenantId 와 함께 호출됨", async () => {
    deleteManyMock.mockResolvedValueOnce({ count: 0 });
    const { withTenantTx } = await import("@/lib/db/prisma-tenant-client");
    await runCleanup(FAKE_TENANT_CTX);
    expect(withTenantTx).toHaveBeenCalledWith(
      FAKE_TENANT_CTX.tenantId,
      expect.any(Function),
    );
  });
});
