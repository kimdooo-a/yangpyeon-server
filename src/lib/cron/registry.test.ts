/**
 * Cron registry — runNow 의 결과 반영(P2 fix) 단위 테스트.
 *
 * 배경:
 *   세션 85 prod 라이브 검증에서 ADMIN runNow(`almanac-cleanup` 등) 가 SUCCESS 후에도
 *   `consecutive_failures=1, last_success_at=NULL` 이 잔존하는 문제 발견.
 *   원인: 자연 tick 경로(`runJob`)는 `recordResult` 를 호출하지만, 수동 `runNow` 경로는
 *   해당 호출이 통째로 누락되어 circuit-breaker carry 컬럼이 갱신되지 않음.
 *
 * 검증:
 *   - SUCCESS  → recordResult(jobId, true)   1회 호출 (cf=0 + lastSuccessAt 갱신 trigger).
 *   - FAILURE  → recordResult(jobId, false)  1회 호출 (cf+1 + 임계값 도달 시 OPEN).
 *   - TIMEOUT  → recordResult(jobId, false)  1회 호출 (FAILURE 와 동일 카운터 영향).
 *   - recordResult 가 throw 해도 runNow 응답은 보존 (ADR-021 cross-cutting fail-soft).
 *   - Cron row 미존재 → throw, recordResult 호출 없음.
 *
 * 전략: prisma / dispatchCron / circuit-breaker / lock 을 vi.mock 으로 격리 — runNow
 *       의 결과 반영 로직만 검증. circuit-breaker 내부 상태 전이는 circuit-breaker.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────
// 1. 모킹 설정 — import 보다 먼저.
// ─────────────────────────────────────────────────────────────
const findUniqueCron = vi.fn();
const updateCron = vi.fn();
const dispatchCronFn = vi.fn();
const recordResultFn = vi.fn();
const safeAuditFn = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cronJob: {
      findUnique: (...args: unknown[]) => findUniqueCron(...args),
      update: (...args: unknown[]) => updateCron(...args),
    },
  },
}));

vi.mock("@/lib/audit-log-db", () => ({
  safeAudit: (...args: unknown[]) => safeAuditFn(...args),
}));

vi.mock("./runner", () => ({
  dispatchCron: (...args: unknown[]) => dispatchCronFn(...args),
}));

vi.mock("./circuit-breaker", () => ({
  recordResult: (...args: unknown[]) => recordResultFn(...args),
  shouldDispatch: vi.fn().mockResolvedValue(true),
}));

vi.mock("./lock", () => ({
  tryAdvisoryLock: vi.fn().mockResolvedValue(true),
  releaseAdvisoryLock: vi.fn().mockResolvedValue(undefined),
  tenantJobLockKey: vi.fn().mockReturnValue(BigInt(0)),
}));

const { runNow } = await import("./registry");

// ─────────────────────────────────────────────────────────────
// 2. 공통 setup
// ─────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  findUniqueCron.mockReset();
  updateCron.mockReset();
  dispatchCronFn.mockReset();
  recordResultFn.mockReset();
  safeAuditFn.mockReset();
});

// ─────────────────────────────────────────────────────────────
// 3. runNow — circuit-breaker 결과 반영
// ─────────────────────────────────────────────────────────────
describe("registry.runNow — circuit-breaker 결과 반영 (P2 fix)", () => {
  it("SUCCESS → recordResult(jobId, true) 1회 호출", async () => {
    findUniqueCron.mockResolvedValueOnce({
      id: "job-1",
      tenantId: "almanac",
      name: "almanac-cleanup",
      schedule: "0 3 * * *",
      kind: "AGGREGATOR",
      payload: { module: "cleanup" },
      enabled: true,
    });
    dispatchCronFn.mockResolvedValueOnce({ status: "SUCCESS", durationMs: 24 });
    updateCron.mockResolvedValueOnce({});
    recordResultFn.mockResolvedValueOnce(undefined);

    const result = await runNow("job-1");

    expect(result.status).toBe("SUCCESS");
    expect(recordResultFn).toHaveBeenCalledOnce();
    expect(recordResultFn).toHaveBeenCalledWith("job-1", true);
  });

  it("FAILURE → recordResult(jobId, false) 1회 호출", async () => {
    findUniqueCron.mockResolvedValueOnce({
      id: "job-2",
      tenantId: null,
      name: "almanac-rss-fetch",
      schedule: "0 * * * *",
      kind: "AGGREGATOR",
      payload: { module: "rss" },
      enabled: true,
    });
    dispatchCronFn.mockResolvedValueOnce({
      status: "FAILURE",
      durationMs: 12,
      message: "boom",
    });
    updateCron.mockResolvedValueOnce({});
    recordResultFn.mockResolvedValueOnce(undefined);

    const result = await runNow("job-2");

    expect(result.status).toBe("FAILURE");
    expect(result.message).toBe("boom");
    expect(recordResultFn).toHaveBeenCalledOnce();
    expect(recordResultFn).toHaveBeenCalledWith("job-2", false);
  });

  it("TIMEOUT → recordResult(jobId, false) 1회 호출", async () => {
    findUniqueCron.mockResolvedValueOnce({
      id: "job-3",
      tenantId: "almanac",
      name: "x",
      schedule: "* * * * *",
      kind: "FUNCTION",
      payload: {},
      enabled: true,
    });
    dispatchCronFn.mockResolvedValueOnce({
      status: "TIMEOUT",
      durationMs: 30000,
    });
    updateCron.mockResolvedValueOnce({});
    recordResultFn.mockResolvedValueOnce(undefined);

    await runNow("job-3");

    expect(recordResultFn).toHaveBeenCalledOnce();
    expect(recordResultFn).toHaveBeenCalledWith("job-3", false);
  });

  it("recordResult 실패해도 runNow 흐름 보존 (ADR-021 cross-cutting fail-soft)", async () => {
    findUniqueCron.mockResolvedValueOnce({
      id: "job-5",
      tenantId: "almanac",
      name: "x",
      schedule: "* * * * *",
      kind: "AGGREGATOR",
      payload: {},
      enabled: true,
    });
    dispatchCronFn.mockResolvedValueOnce({ status: "SUCCESS", durationMs: 5 });
    updateCron.mockResolvedValueOnce({});
    recordResultFn.mockRejectedValueOnce(new Error("circuit-breaker DB down"));

    const result = await runNow("job-5");
    expect(result.status).toBe("SUCCESS");
  });

  it("Cron row 미존재 → throw + recordResult 호출 없음", async () => {
    findUniqueCron.mockResolvedValueOnce(null);
    await expect(runNow("nope")).rejects.toThrow("존재하지 않는 Cron Job");
    expect(recordResultFn).not.toHaveBeenCalled();
  });

  it("legacy tenantId=null → DEFAULT_TENANT 'default' 로 dispatch", async () => {
    findUniqueCron.mockResolvedValueOnce({
      id: "job-6",
      tenantId: null,
      name: "legacy-job",
      schedule: "* * * * *",
      kind: "FUNCTION",
      payload: {},
      enabled: true,
    });
    dispatchCronFn.mockResolvedValueOnce({ status: "SUCCESS", durationMs: 1 });
    updateCron.mockResolvedValueOnce({});
    recordResultFn.mockResolvedValueOnce(undefined);

    await runNow("job-6");

    // dispatchCron(job, tenantId) — 두번째 인자 = "default".
    expect(dispatchCronFn).toHaveBeenCalledOnce();
    expect(dispatchCronFn.mock.calls[0][1]).toBe("default");
    expect(recordResultFn).toHaveBeenCalledWith("job-6", true);
  });
});
