import { beforeEach, describe, expect, it } from "vitest";
import {
  getAuditMetrics,
  recordAuditOutcome,
  resetAuditMetrics,
} from "./audit-metrics";

describe("audit-metrics — safeAudit 카운터", () => {
  beforeEach(() => resetAuditMetrics());

  it("초기 상태는 0/0/0 + 빈 byBucket", () => {
    const m = getAuditMetrics();
    expect(m.total.success).toBe(0);
    expect(m.total.failure).toBe(0);
    expect(m.total.failureRate).toBe(0);
    expect(m.byBucket).toEqual([]);
    expect(m.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it("성공/실패 카운트 + failureRate 계산", () => {
    recordAuditOutcome(true, "SESSION_LOGIN");
    recordAuditOutcome(true, "SESSION_LOGIN");
    recordAuditOutcome(false, "SESSION_LOGIN", new Error("DB locked"));
    const m = getAuditMetrics();
    expect(m.total.success).toBe(2);
    expect(m.total.failure).toBe(1);
    expect(m.total.failureRate).toBeCloseTo(1 / 3);
    expect(m.byBucket).toHaveLength(1);
    expect(m.byBucket[0].name).toBe("SESSION_LOGIN");
    expect(m.byBucket[0].failure).toBe(1);
    expect(m.byBucket[0].success).toBe(2);
    expect(m.byBucket[0].lastFailureMessage).toBe("DB locked");
    expect(m.byBucket[0].lastFailureAt).not.toBeNull();
  });

  it("context 정규화 — 3+ segment 는 first 2 로 버킷팅 (카디널리티 캡)", () => {
    recordAuditOutcome(false, "cleanup-scheduler:SESSION_EXPIRE:id-1", new Error("X"));
    recordAuditOutcome(false, "cleanup-scheduler:SESSION_EXPIRE:id-2", new Error("Y"));
    recordAuditOutcome(true, "cleanup-scheduler:SESSION_EXPIRE:id-3");
    const m = getAuditMetrics();
    expect(m.byBucket).toHaveLength(1);
    expect(m.byBucket[0].name).toBe("cleanup-scheduler:SESSION_EXPIRE");
    expect(m.byBucket[0].failure).toBe(2);
    expect(m.byBucket[0].success).toBe(1);
    expect(m.byBucket[0].lastFailureMessage).toBe("Y");
  });

  it("byBucket 정렬 — 실패 많은 순 → 호출량 많은 순", () => {
    recordAuditOutcome(false, "A", new Error("e"));
    recordAuditOutcome(true, "B");
    recordAuditOutcome(true, "B");
    recordAuditOutcome(false, "C", new Error("e"));
    recordAuditOutcome(false, "C", new Error("e"));
    const m = getAuditMetrics();
    expect(m.byBucket.map((b) => b.name)).toEqual(["C", "A", "B"]);
  });

  it("Error 가 아닌 throw 도 String() 으로 변환되어 lastFailureMessage 에 기록", () => {
    recordAuditOutcome(false, "X", "weird non-Error throw");
    const m = getAuditMetrics();
    expect(m.byBucket[0].lastFailureMessage).toBe("weird non-Error throw");
  });

  it("recordAuditOutcome 은 절대 throw 하지 않음 — invalid context 입력도 무시", () => {
    expect(() =>
      recordAuditOutcome(true, undefined as unknown as string),
    ).not.toThrow();
    expect(() =>
      recordAuditOutcome(false, null as unknown as string, new Error("e")),
    ).not.toThrow();
    // 첫 호출은 try 내부에서 throw → catch 후 카운터 안 올라감.
    // 두 번째 호출도 마찬가지. 어떤 카운터 값이든 valid (구현에 따라).
    const m = getAuditMetrics();
    expect(typeof m.total.success).toBe("number");
    expect(typeof m.total.failure).toBe("number");
  });

  it("실패 없으면 failureRate = 0 (NaN 회피)", () => {
    recordAuditOutcome(true, "OK_ONLY");
    recordAuditOutcome(true, "OK_ONLY");
    const m = getAuditMetrics();
    expect(m.total.failureRate).toBe(0);
    expect(m.byBucket[0].failureRate).toBe(0);
  });

  it("성공만 0 + 실패만 1 → failureRate 1.0", () => {
    recordAuditOutcome(false, "FAIL_ONLY", new Error("x"));
    const m = getAuditMetrics();
    expect(m.total.failureRate).toBe(1);
    expect(m.byBucket[0].failureRate).toBe(1);
  });

  it("resetAuditMetrics 후 startedAt 갱신 + 버킷 비움", async () => {
    recordAuditOutcome(false, "BEFORE", new Error("e"));
    const before = getAuditMetrics();
    await new Promise((r) => setTimeout(r, 10));
    resetAuditMetrics();
    const after = getAuditMetrics();
    expect(after.total.success).toBe(0);
    expect(after.total.failure).toBe(0);
    expect(after.byBucket).toEqual([]);
    expect(new Date(after.startedAt).getTime()).toBeGreaterThan(
      new Date(before.startedAt).getTime(),
    );
  });
});
