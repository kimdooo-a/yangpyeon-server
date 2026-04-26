/**
 * TenantWorkerPool 단위 테스트.
 *
 * 검증 대상 (07-adr-028-impl-spec §2.1):
 *   1. dispatch — Worker 인스턴스 생성 + workerData 정확히 주입.
 *   2. tenant cap 강제 — TenantCronPolicy.maxConcurrentJobs 초과 시 SKIPPED + reason="tenant-cap".
 *   3. global cap 강제 — globalMaxConcurrent 초과 시 SKIPPED + reason="pool-saturated".
 *
 * 전략:
 *   - node:worker_threads 의 Worker 를 vi.mock 으로 대체.
 *   - mock Worker 는 setImmediate 후 message='SUCCESS' 송신 (echo).
 *   - 실제 worker_threads integration 테스트는 별도 트랙 (vitest 내 flaky).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

// ─────────────────────────────────────────────────────────────
// Worker 모킹 — postMessage 호출 후 'message' 이벤트 발사 (echo).
// ─────────────────────────────────────────────────────────────
class MockWorker extends EventEmitter {
  public readonly workerData: unknown;
  /** 테스트 검증용 — 가장 최근 생성된 mock instance. */
  public terminated = false;
  /** 다음 echo 결과 — 기본 SUCCESS. tests 가 변경 가능. */
  public static nextResult: { status: string; message?: string } = {
    status: "SUCCESS",
  };
  /** 'message' 발사 지연 (ms). 기본 0 (즉시). */
  public static messageDelayMs = 0;
  /** 마지막 생성 인스턴스 — 검증용. */
  public static lastInstance: MockWorker | null = null;

  constructor(_path: string, options: { workerData: unknown }) {
    super();
    this.workerData = options.workerData;
    MockWorker.lastInstance = this;
    // setImmediate 로 'message' 발사 — Promise resolve 기회 확보.
    setTimeout(() => {
      this.emit("message", MockWorker.nextResult);
    }, MockWorker.messageDelayMs);
  }

  postMessage(_msg: unknown): void {
    /* no-op — shutdown 시그널은 본 mock 에서 인식 X */
  }

  async terminate(): Promise<number> {
    this.terminated = true;
    return 0;
  }
}

vi.mock("node:worker_threads", () => ({
  Worker: MockWorker,
}));

// policy 모킹 — TenantWorkerPool 의 resolvePolicy 가 사용.
const loadPolicyFn = vi.fn();
vi.mock("./policy", async () => {
  const actual = await vi.importActual<typeof import("./policy")>("./policy");
  return {
    ...actual,
    loadTenantCronPolicy: (...args: unknown[]) => loadPolicyFn(...args),
  };
});

// 모킹 후 import.
const { TenantWorkerPool, _resetWorkerPoolForTesting } = await import(
  "./worker-pool"
);

beforeEach(() => {
  _resetWorkerPoolForTesting();
  vi.clearAllMocks();
  MockWorker.nextResult = { status: "SUCCESS" };
  MockWorker.messageDelayMs = 0;
  MockWorker.lastInstance = null;
});

describe("TenantWorkerPool — 07-adr-028-impl-spec §2.1", () => {
  it("dispatch — Worker 생성 + SUCCESS 결과 + workerData 주입 검증", async () => {
    loadPolicyFn.mockResolvedValueOnce({
      maxConcurrentJobs: 3,
      jobTimeoutMs: 30_000,
      jobMemoryLimitMb: 128,
      consecutiveFailureThreshold: 5,
      ticksPerDay: 1440,
      allowedFetchHosts: ["api.example.com"],
      webhookTimeoutMs: 60_000,
    });

    const pool = new TenantWorkerPool({ globalMaxConcurrent: 4 });
    const result = await pool.dispatch(
      {
        id: "job-1",
        name: "test-webhook",
        kind: "WEBHOOK",
        payload: { url: "https://api.example.com/hook" },
      },
      "tenant-a",
    );

    expect(result.status).toBe("SUCCESS");
    expect(MockWorker.lastInstance).not.toBeNull();
    const wd = (MockWorker.lastInstance as MockWorker).workerData as {
      job: { id: string; kind: string };
      policy: { jobTimeoutMs: number; allowedFetchHosts: string[] };
    };
    expect(wd.job.id).toBe("job-1");
    expect(wd.job.kind).toBe("WEBHOOK");
    expect(wd.policy.jobTimeoutMs).toBe(30_000);
    expect(wd.policy.allowedFetchHosts).toEqual(["api.example.com"]);
  });

  it("tenant cap 초과 → SKIPPED reason=tenant-cap", async () => {
    // maxConcurrentJobs=2 — 즉시 cap 도달.
    loadPolicyFn.mockResolvedValue({
      maxConcurrentJobs: 2,
      jobTimeoutMs: 30_000,
      jobMemoryLimitMb: 128,
      consecutiveFailureThreshold: 5,
      ticksPerDay: 1440,
      allowedFetchHosts: [],
      webhookTimeoutMs: 60_000,
    });
    // worker 가 message 보낼 때까지 잠시 대기 — 그래야 inFlight 가 동시에 잡힘.
    MockWorker.messageDelayMs = 50;

    const pool = new TenantWorkerPool({ globalMaxConcurrent: 8 });
    const job = (i: number) => ({
      id: `job-${i}`,
      name: `n-${i}`,
      kind: "WEBHOOK" as const,
      payload: { url: "https://x" },
    });

    // 동시에 3개 dispatch — 3번째는 tenant-cap.
    const promises = [
      pool.dispatch(job(1), "tenant-a"),
      pool.dispatch(job(2), "tenant-a"),
      pool.dispatch(job(3), "tenant-a"),
    ];
    const results = await Promise.all(promises);

    const skipped = results.filter((r) => r.status === "SKIPPED");
    expect(skipped.length).toBe(1);
    expect(skipped[0].reason).toBe("tenant-cap");
    const success = results.filter((r) => r.status === "SUCCESS");
    expect(success.length).toBe(2);
  });

  it("global cap 초과 → SKIPPED reason=pool-saturated", async () => {
    // maxConcurrentJobs=10(여유), globalMaxConcurrent=2.
    loadPolicyFn.mockResolvedValue({
      maxConcurrentJobs: 10,
      jobTimeoutMs: 30_000,
      jobMemoryLimitMb: 128,
      consecutiveFailureThreshold: 5,
      ticksPerDay: 1440,
      allowedFetchHosts: [],
      webhookTimeoutMs: 60_000,
    });
    MockWorker.messageDelayMs = 50;

    const pool = new TenantWorkerPool({ globalMaxConcurrent: 2 });
    const job = (i: number, t: string) => ({
      id: `job-${t}-${i}`,
      name: `n-${i}`,
      kind: "WEBHOOK" as const,
      payload: { url: "https://x" },
    });

    // 다른 tenant 분산 — tenant-cap 회피, global-cap 만 작동.
    const promises = [
      pool.dispatch(job(1, "a"), "tenant-a"),
      pool.dispatch(job(1, "b"), "tenant-b"),
      pool.dispatch(job(1, "c"), "tenant-c"),
    ];
    const results = await Promise.all(promises);

    const skipped = results.filter((r) => r.status === "SKIPPED");
    expect(skipped.length).toBe(1);
    expect(skipped[0].reason).toBe("pool-saturated");
  });
});
