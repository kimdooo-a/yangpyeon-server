/**
 * tests/cron/cron-aggregator-dispatch.test.ts
 *
 * Track B / B6 commit — cron AGGREGATOR dispatcher TDD (5 케이스 / 15 중).
 *
 * PLUGIN-MIG-5 (S98) 갱신: cron/runner.ts 가 더 이상 runAggregatorModule 을
 * 직접 부르지 않고 @yangpyeon/core 의 dispatchTenantHandler 를 호출.
 *
 * dispatchCron 의 AGGREGATOR 분기:
 *   - job.kind='AGGREGATOR' + payload.module → dispatchTenantHandler(name, payload, ctx)
 *   - payload.module 누락 → dispatcher 호출 없이 즉시 FAILURE
 *   - dispatcher 의 TenantCronResult({ ok, errorMessage }) → CronRunResult({ status, message })
 *     로 매핑.
 *
 * Spec: docs/research/baas-foundation/05-aggregator-migration/2026-04-26-plan.md §2.1
 *       packages/core/src/tenant/dispatcher.ts (PLUGIN-MIG-5)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// 1) dispatchTenantHandler 모킹 — cron dispatcher 가 호출하는 boundary
// ─────────────────────────────────────────────────────────────────────────────
const { dispatchTenantHandlerMock } = vi.hoisted(() => ({
  dispatchTenantHandlerMock: vi.fn(),
}));

// @yangpyeon/core 의 dispatchTenantHandler 만 mock 하고 나머지(defineTenant,
// registerTenant 등) 는 actual export 유지 — bootstrap 이 manifest import 시
// defineTenant 를 사용하기 때문.
vi.mock("@yangpyeon/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@yangpyeon/core")>();
  return {
    ...actual,
    dispatchTenantHandler: dispatchTenantHandlerMock,
  };
});

// tenant-bootstrap 이 import 하는 messenger cleanup 도 mock — 실제 실행은 발생하지
// 않으므로 빈 stub 으로 충분.
vi.mock("@/lib/messenger/attachment-cleanup", () => ({
  runMessengerAttachmentCleanup: vi.fn(),
}));

// almanac manifest 가 trigger 하는 prisma-tenant-client 의 lazy import 는 안전
// (모듈 로드 시 DB 접근 없음, getter proxy 만 생성됨). 별도 mock 불필요.

import { dispatchCron } from "@/lib/cron/runner";

const FAKE_TENANT_ID = "00000000-0000-0000-0000-000000000001";

beforeEach(() => {
  dispatchTenantHandlerMock.mockReset();
});

// =============================================================================
// dispatchCron AGGREGATOR (5 케이스)
// =============================================================================

describe("dispatchCron — AGGREGATOR kind 분기 (PLUGIN-MIG-5)", () => {
  it("11. job.kind='AGGREGATOR' + payload.module → dispatchTenantHandler 호출", async () => {
    dispatchTenantHandlerMock.mockResolvedValue({ ok: true });

    const result = await dispatchCron(
      {
        id: "cron-1",
        name: "almanac-rss-fetch",
        kind: "AGGREGATOR",
        payload: { module: "rss-fetcher" },
      },
      FAKE_TENANT_ID,
    );

    expect(dispatchTenantHandlerMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("SUCCESS");
  });

  it("12. payload.module 누락 → status FAILURE + 'payload.module' 메시지 (dispatcher 호출 X)", async () => {
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
    expect(dispatchTenantHandlerMock).not.toHaveBeenCalled();
  });

  it("13. tenantId 가 dispatchTenantHandler ctx 로 전달된다", async () => {
    dispatchTenantHandlerMock.mockResolvedValue({ ok: true });
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

    const [name, payload, ctx] = dispatchTenantHandlerMock.mock.calls[0] as [
      string,
      Record<string, unknown>,
      { tenantId: string },
    ];
    expect(name).toBe("promoter");
    expect(payload.module).toBe("promoter");
    expect(ctx.tenantId).toBe(otherTenant);
  });

  it("14. payload 전체가 dispatchTenantHandler 두 번째 인자로 전달 (batch 등 plumbing)", async () => {
    dispatchTenantHandlerMock.mockResolvedValue({
      ok: true,
      processedCount: 25,
    });

    const result = await dispatchCron(
      {
        id: "cron-4",
        name: "batch-test",
        kind: "AGGREGATOR",
        payload: { module: "classifier", batch: 25 },
      },
      FAKE_TENANT_ID,
    );

    const [, payloadArg] = dispatchTenantHandlerMock.mock.calls[0] as [
      string,
      { module: string; batch?: number },
      unknown,
    ];
    expect(payloadArg.module).toBe("classifier");
    expect(payloadArg.batch).toBe(25);
    // processedCount 가 message 에 노출되어 운영 콘솔이 처리 수량 확인 가능.
    expect(result.message).toBe("processed=25");
  });

  it("15. ok=false TenantCronResult → status FAILURE + errorMessage 그대로 노출", async () => {
    dispatchTenantHandlerMock.mockResolvedValue({
      ok: false,
      errorMessage: "rss feed 다운",
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
