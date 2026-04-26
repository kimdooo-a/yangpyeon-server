/**
 * Circuit breaker (app-side wrapper) 단위 테스트.
 *
 * 검증 대상:
 *   1. shouldDispatch — CLOSED/HALF_OPEN 통과, OPEN+cooldown 미경과 차단,
 *      OPEN+cooldown 경과 시 HALF_OPEN 으로 사전 전이.
 *   2. recordResult — 성공 시 카운터 0 + lastSuccessAt + state CLOSED 회복.
 *      실패 시 카운터 +1, threshold 도달 시 OPEN + circuitOpenedAt 설정.
 *   3. audit 호출 — emitAudit 가 silent 실패해도 cron 흐름 보존.
 *
 * 전략: prisma 와 audit 을 vi.mock 으로 가짜 처리 — 순수 wrapper 동작만 검증.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────
// 1. 모킹 설정 — import 보다 먼저.
// ─────────────────────────────────────────────────────────────
const findUniqueCron = vi.fn();
const updateCron = vi.fn();
const findUniquePolicy = vi.fn();
const safeAuditFn = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cronJob: {
      findUnique: (...args: unknown[]) => findUniqueCron(...args),
      update: (...args: unknown[]) => updateCron(...args),
    },
    tenantCronPolicy: {
      findUnique: (...args: unknown[]) => findUniquePolicy(...args),
    },
  },
}));

vi.mock("@/lib/audit-log-db", () => ({
  safeAudit: (...args: unknown[]) => safeAuditFn(...args),
}));

// 모킹 후 import.
const { shouldDispatch, recordResult } = await import("./circuit-breaker");

// ─────────────────────────────────────────────────────────────
// 2. 공통 setup
// ─────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  findUniqueCron.mockReset();
  updateCron.mockReset();
  findUniquePolicy.mockReset();
  safeAuditFn.mockReset();
});

// ─────────────────────────────────────────────────────────────
// 3. shouldDispatch 케이스
// ─────────────────────────────────────────────────────────────
describe("shouldDispatch (07-adr-028-impl-spec §8)", () => {
  it("CLOSED 상태 → true (정상 dispatch)", async () => {
    findUniqueCron.mockResolvedValueOnce({
      circuitState: "CLOSED",
      circuitOpenedAt: null,
    });
    const result = await shouldDispatch("job-1");
    expect(result).toBe(true);
    expect(updateCron).not.toHaveBeenCalled();
  });

  it("OPEN 상태 + cooldown 미경과 → false + audit", async () => {
    findUniqueCron.mockResolvedValueOnce({
      circuitState: "OPEN",
      circuitOpenedAt: new Date(),
    });
    const result = await shouldDispatch("job-1");
    expect(result).toBe(false);
    expect(updateCron).not.toHaveBeenCalled();
    expect(safeAuditFn).toHaveBeenCalledOnce();
    expect(safeAuditFn.mock.calls[0][0].action).toBe("cron.skip.circuit-open");
  });

  it("OPEN 상태 + cooldown 경과 → HALF_OPEN 으로 전이 + true", async () => {
    const longAgo = new Date(Date.now() - 2 * 60 * 60_000); // 2h 전 (cooldown 1h)
    findUniqueCron.mockResolvedValueOnce({
      circuitState: "OPEN",
      circuitOpenedAt: longAgo,
    });
    updateCron.mockResolvedValueOnce({});
    const result = await shouldDispatch("job-1");
    expect(result).toBe(true);
    expect(updateCron).toHaveBeenCalledOnce();
    expect(updateCron.mock.calls[0][0].data.circuitState).toBe("HALF_OPEN");
    expect(safeAuditFn).toHaveBeenCalled();
    const actions = safeAuditFn.mock.calls.map((c) => c[0].action);
    expect(actions).toContain("cron.circuit.half-open");
  });

  it("CronJob row 부재 → false (방어적)", async () => {
    findUniqueCron.mockResolvedValueOnce(null);
    const result = await shouldDispatch("nonexistent");
    expect(result).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// 4. recordResult 케이스
// ─────────────────────────────────────────────────────────────
describe("recordResult (07-adr-028-impl-spec §8)", () => {
  it("성공 → consecutive_failures=0, state=CLOSED, lastSuccessAt 갱신", async () => {
    findUniqueCron.mockResolvedValueOnce({
      circuitState: "CLOSED",
      consecutiveFailures: 0,
      tenantId: "tenant-a",
    });
    findUniquePolicy.mockResolvedValueOnce({ consecutiveFailureThreshold: 5 });
    updateCron.mockResolvedValueOnce({});

    await recordResult("job-1", true);

    expect(updateCron).toHaveBeenCalledOnce();
    const data = updateCron.mock.calls[0][0].data;
    expect(data.consecutiveFailures).toBe(0);
    expect(data.circuitState).toBe("CLOSED");
    expect(data.circuitOpenedAt).toBeNull();
    expect(data.lastSuccessAt).toBeInstanceOf(Date);
  });

  it("HALF_OPEN 에서 성공 → CLOSED 회복 + audit 'cron.circuit.closed'", async () => {
    findUniqueCron.mockResolvedValueOnce({
      circuitState: "HALF_OPEN",
      consecutiveFailures: 5,
      tenantId: "tenant-a",
    });
    findUniquePolicy.mockResolvedValueOnce({ consecutiveFailureThreshold: 5 });
    updateCron.mockResolvedValueOnce({});

    await recordResult("job-1", true);

    const actions = safeAuditFn.mock.calls.map((c) => c[0].action);
    expect(actions).toContain("cron.circuit.closed");
  });

  it("실패 + threshold 미만 → carry, state=CLOSED 유지, audit 없음", async () => {
    findUniqueCron.mockResolvedValueOnce({
      circuitState: "CLOSED",
      consecutiveFailures: 2,
      tenantId: "tenant-a",
    });
    findUniquePolicy.mockResolvedValueOnce({ consecutiveFailureThreshold: 5 });
    updateCron.mockResolvedValueOnce({});

    await recordResult("job-1", false);

    const data = updateCron.mock.calls[0][0].data;
    expect(data.consecutiveFailures).toBe(3);
    expect(data.circuitState).toBe("CLOSED");
    // 새 OPEN 진입 아님 → audit 'opened' 없음.
    const actions = safeAuditFn.mock.calls.map((c) => c[0].action);
    expect(actions).not.toContain("cron.circuit.opened");
  });

  it("실패 + threshold 도달 → OPEN 진입 + circuitOpenedAt 설정 + audit 'cron.circuit.opened'", async () => {
    findUniqueCron.mockResolvedValueOnce({
      circuitState: "CLOSED",
      consecutiveFailures: 4,
      tenantId: "tenant-a",
    });
    findUniquePolicy.mockResolvedValueOnce({ consecutiveFailureThreshold: 5 });
    updateCron.mockResolvedValueOnce({});

    await recordResult("job-1", false);

    const data = updateCron.mock.calls[0][0].data;
    expect(data.consecutiveFailures).toBe(5);
    expect(data.circuitState).toBe("OPEN");
    expect(data.circuitOpenedAt).toBeInstanceOf(Date);

    const actions = safeAuditFn.mock.calls.map((c) => c[0].action);
    expect(actions).toContain("cron.circuit.opened");
  });

  it("CronJob row 부재 → no-op (update 호출 안 됨)", async () => {
    findUniqueCron.mockResolvedValueOnce(null);
    await recordResult("nonexistent", true);
    expect(updateCron).not.toHaveBeenCalled();
  });

  it("policy 없으면 default threshold(5) 사용", async () => {
    findUniqueCron.mockResolvedValueOnce({
      circuitState: "CLOSED",
      consecutiveFailures: 4,
      tenantId: "tenant-a",
    });
    findUniquePolicy.mockResolvedValueOnce(null); // 정책 row 없음
    updateCron.mockResolvedValueOnce({});

    await recordResult("job-1", false);

    // 기본 threshold=5, failures+1=5 → OPEN.
    const data = updateCron.mock.calls[0][0].data;
    expect(data.circuitState).toBe("OPEN");
  });
});
