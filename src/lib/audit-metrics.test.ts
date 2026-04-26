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
    expect(after.byTenant).toEqual([]);
    expect(new Date(after.startedAt).getTime()).toBeGreaterThan(
      new Date(before.startedAt).getTime(),
    );
  });
});

// Phase 1.7 (T1.7) ADR-029 §2.2.5 — per-tenant 차원 추가 검증.
describe("audit-metrics — byTenant 차원 (Phase 1.7)", () => {
  beforeEach(() => resetAuditMetrics());

  it("tenantId 미지정 시 'default' 로 폴백 + byTenant array 에 등장", () => {
    recordAuditOutcome(true, "SESSION_LOGIN");
    recordAuditOutcome(false, "SESSION_LOGIN", new Error("err"));
    const m = getAuditMetrics();
    expect(m.byTenant).toHaveLength(1);
    expect(m.byTenant[0].tenantId).toBe("default");
    expect(m.byTenant[0].total.success).toBe(1);
    expect(m.byTenant[0].total.failure).toBe(1);
    expect(m.byTenant[0].total.failureRate).toBeCloseTo(0.5);
    expect(m.byTenant[0].byBucket).toHaveLength(1);
    expect(m.byTenant[0].byBucket[0].name).toBe("SESSION_LOGIN");
  });

  it("tenantId 별 카운터 분리 — almanac 과 default 가 독립 집계", () => {
    recordAuditOutcome(true, "SESSION_LOGIN", undefined, "almanac");
    recordAuditOutcome(true, "SESSION_LOGIN", undefined, "almanac");
    recordAuditOutcome(false, "SESSION_LOGIN", new Error("e"), "default");

    const m = getAuditMetrics();
    expect(m.byTenant).toHaveLength(2);
    const almanac = m.byTenant.find((t) => t.tenantId === "almanac");
    const def = m.byTenant.find((t) => t.tenantId === "default");
    expect(almanac?.total.success).toBe(2);
    expect(almanac?.total.failure).toBe(0);
    expect(def?.total.success).toBe(0);
    expect(def?.total.failure).toBe(1);
  });

  it("byTenant 정렬 — 실패 많은 tenant 가 상단 (Operator Console 빨간 ROW)", () => {
    // tenant-A: 1 success
    recordAuditOutcome(true, "X", undefined, "tenant-A");
    // tenant-B: 3 failures
    recordAuditOutcome(false, "X", new Error("e"), "tenant-B");
    recordAuditOutcome(false, "X", new Error("e"), "tenant-B");
    recordAuditOutcome(false, "X", new Error("e"), "tenant-B");
    // tenant-C: 1 failure
    recordAuditOutcome(false, "X", new Error("e"), "tenant-C");

    const m = getAuditMetrics();
    // 실패 개수: B(3) > C(1) > A(0).
    expect(m.byTenant.map((t) => t.tenantId)).toEqual([
      "tenant-B",
      "tenant-C",
      "tenant-A",
    ]);
  });

  it("MAX_TENANTS=50 — 51번째 tenant 진입 시 가장 오래 들어온 tenant FIFO evict", () => {
    // 50 tenant 채움
    for (let i = 0; i < 50; i += 1) {
      recordAuditOutcome(true, "X", undefined, `tenant-${i}`);
    }
    let m = getAuditMetrics();
    expect(m.byTenant).toHaveLength(50);

    // 51번째 — 첫 번째 tenant evict 되어야 함
    recordAuditOutcome(true, "X", undefined, "tenant-overflow");
    m = getAuditMetrics();
    expect(m.byTenant).toHaveLength(50);
    expect(m.byTenant.find((t) => t.tenantId === "tenant-0")).toBeUndefined();
    expect(
      m.byTenant.find((t) => t.tenantId === "tenant-overflow"),
    ).toBeDefined();
  });

  it("MAX_BUCKETS_PER_TENANT=100 — 동일 tenant 의 101번째 bucket FIFO evict", () => {
    // tenant 'almanac' 에 100 bucket 채움
    for (let i = 0; i < 100; i += 1) {
      recordAuditOutcome(true, `BUCKET_${i}`, undefined, "almanac");
    }
    let m = getAuditMetrics();
    let almanac = m.byTenant.find((t) => t.tenantId === "almanac");
    expect(almanac?.byBucket).toHaveLength(100);

    // 101번째 bucket — BUCKET_0 evict
    recordAuditOutcome(true, "BUCKET_OVERFLOW", undefined, "almanac");
    m = getAuditMetrics();
    almanac = m.byTenant.find((t) => t.tenantId === "almanac");
    expect(almanac?.byBucket).toHaveLength(100);
    expect(almanac?.byBucket.find((b) => b.name === "BUCKET_0")).toBeUndefined();
    expect(
      almanac?.byBucket.find((b) => b.name === "BUCKET_OVERFLOW"),
    ).toBeDefined();
  });

  it("기존 byBucket (tenant-agnostic) 차원도 동시에 갱신됨 — 회귀 0", () => {
    // 같은 bucket 을 두 tenant 가 호출 → byBucket 은 합산, byTenant 는 분리.
    recordAuditOutcome(true, "SHARED", undefined, "tenant-A");
    recordAuditOutcome(false, "SHARED", new Error("e"), "tenant-B");

    const m = getAuditMetrics();
    // byBucket (tenant-agnostic) — 두 tenant 합산
    const shared = m.byBucket.find((b) => b.name === "SHARED");
    expect(shared?.success).toBe(1);
    expect(shared?.failure).toBe(1);
    // byTenant — 분리.
    expect(
      m.byTenant.find((t) => t.tenantId === "tenant-A")?.total.success,
    ).toBe(1);
    expect(
      m.byTenant.find((t) => t.tenantId === "tenant-B")?.total.failure,
    ).toBe(1);
  });
});
