/**
 * tests/cron/cron-aggregator-dispatch.test.ts
 *
 * Track B / B6 commit — cron AGGREGATOR dispatcher TDD (5 케이스 / 15 중).
 *
 * dispatchCron 의 새 분기:
 *   - job.kind='AGGREGATOR' → dispatchAggregatorOnMain(payload, tenantId, started)
 *   - payload.module 누락 → failure
 *   - 정상 호출 → runAggregatorModule 결과 그대로 반환
 *
 * Spec: docs/research/baas-foundation/05-aggregator-migration/2026-04-26-plan.md §2.1
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// 1) runAggregatorModule 모킹 — cron dispatcher 가 호출하는 boundary
// ─────────────────────────────────────────────────────────────────────────────
const { runAggregatorModuleMock } = vi.hoisted(() => ({
  runAggregatorModuleMock: vi.fn(),
}));

vi.mock("@/lib/aggregator/runner", () => ({
  runAggregatorModule: runAggregatorModuleMock,
}));

import { dispatchCron } from "@/lib/cron/runner";

const FAKE_TENANT_ID = "00000000-0000-0000-0000-000000000001";

beforeEach(() => {
  runAggregatorModuleMock.mockReset();
});

// =============================================================================
// dispatchCron AGGREGATOR (5 케이스)
// =============================================================================

describe("dispatchCron — AGGREGATOR kind 분기", () => {
  it("11. job.kind='AGGREGATOR' + payload.module → runAggregatorModule 호출", async () => {
    runAggregatorModuleMock.mockResolvedValue({
      status: "SUCCESS",
      durationMs: 100,
      message: "ok",
    });

    const result = await dispatchCron(
      {
        id: "cron-1",
        name: "almanac-rss-fetch",
        kind: "AGGREGATOR",
        payload: { module: "rss-fetcher" },
      },
      FAKE_TENANT_ID,
    );

    expect(runAggregatorModuleMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("SUCCESS");
    expect(result.message).toBe("ok");
  });

  it("12. payload.module 누락 → status FAILURE + 'payload.module' 메시지", async () => {
    const result = await dispatchCron(
      {
        id: "cron-2",
        name: "broken",
        kind: "AGGREGATOR",
        payload: {},
      },
      FAKE_TENANT_ID,
    );

    expect(result.status).toBe("FAILURE");
    expect(result.message).toMatch(/payload\.module/);
    expect(runAggregatorModuleMock).not.toHaveBeenCalled();
  });

  it("13. job.tenantId 가 ctx.tenantId 로 전달된다", async () => {
    runAggregatorModuleMock.mockResolvedValue({ status: "SUCCESS", durationMs: 10 });
    const otherTenant = "11111111-1111-1111-1111-111111111111";

    await dispatchCron(
      {
        id: "cron-3",
        name: "tenant-test",
        kind: "AGGREGATOR",
        payload: { module: "promoter" },
      },
      otherTenant,
    );

    const ctxArg = runAggregatorModuleMock.mock.calls[0]?.[0] as {
      tenantId: string;
    };
    expect(ctxArg.tenantId).toBe(otherTenant);
  });

  it("14. payload.batch 가 runAggregatorModule 두 번째 인자에 전달", async () => {
    runAggregatorModuleMock.mockResolvedValue({ status: "SUCCESS", durationMs: 5 });

    await dispatchCron(
      {
        id: "cron-4",
        name: "batch-test",
        kind: "AGGREGATOR",
        payload: { module: "classifier", batch: 25 },
      },
      FAKE_TENANT_ID,
    );

    const payloadArg = runAggregatorModuleMock.mock.calls[0]?.[1] as {
      module: string;
      batch?: number;
    };
    expect(payloadArg.module).toBe("classifier");
    expect(payloadArg.batch).toBe(25);
  });

  it("15. runAggregatorModule 결과의 status/durationMs/message 가 그대로 반환된다", async () => {
    runAggregatorModuleMock.mockResolvedValue({
      status: "FAILURE",
      durationMs: 999,
      message: "rss feed 다운",
    });

    const result = await dispatchCron(
      {
        id: "cron-5",
        name: "fail-test",
        kind: "AGGREGATOR",
        payload: { module: "rss-fetcher" },
      },
      FAKE_TENANT_ID,
    );

    expect(result.status).toBe("FAILURE");
    expect(result.message).toBe("rss feed 다운");
  });
});
