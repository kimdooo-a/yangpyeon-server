/**
 * TenantWorkerPool — per-tenant cron 격리 풀.
 *
 * Phase 1.5 (T1.5) — 07-adr-028-impl-spec §2.1 + spike-baas-002 §3.2 채택.
 *
 * 핵심 설계:
 *   - main thread 가 게이트키퍼 (concurrency cap — global + tenant 양 차원).
 *   - per-job worker 모델 (재사용 X — 격리 강화 우선, 상태 누수 방지).
 *   - resourceLimits 로 약한 V8 heap cap (native binding 격리 X — spike-baas-002 §3.4).
 *   - 1차 graceful shutdown (postMessage) → 5s grace → worker.terminate() escape hatch.
 *   - lock holder = main thread (registry.ts 가 잡음, 본 모듈은 dispatch 만).
 *
 * 본 모듈 자체는 advisory lock 호출하지 않음 — caller(`registry.ts`) 가 책임.
 */
import { Worker } from "node:worker_threads";
import path from "node:path";
import {
  loadTenantCronPolicy,
  DEFAULT_POLICY,
  type TenantCronPolicy,
} from "./policy";

/**
 * worker-script 의 빌드 산출 경로.
 * 본 PR 에서는 빌드 체인이 미정 — Phase 1.5 후속에서 standalone/Next.js 통합 시 확정.
 * 운영 환경: PM2 가 .js 직접 실행하므로 `worker-script.js` 등으로 transpile 필요.
 * 환경변수 override 가능 (`CRON_WORKER_SCRIPT`).
 */
const WORKER_SCRIPT_PATH =
  process.env.CRON_WORKER_SCRIPT ??
  path.resolve(__dirname, "worker-script.js");

export type DispatchStatus = "SUCCESS" | "FAILURE" | "TIMEOUT" | "SKIPPED";

export interface DispatchJob {
  id: string;
  name: string;
  kind: "SQL" | "FUNCTION" | "WEBHOOK";
  payload: unknown;
}

export interface DispatchResult {
  status: DispatchStatus;
  durationMs: number;
  message?: string;
  /** SKIPPED 시 사유: "pool-saturated" | "tenant-cap". */
  reason?: string;
}

/**
 * spike-baas-002 §3.2 + 07-adr-028-impl-spec §2.1 — per-tenant worker pool.
 *   - main thread 게이트 (concurrency cap)
 *   - per-job worker 생성 (재사용 X)
 *   - resourceLimits 약한 cap
 *   - worker.terminate() + 5s grace
 */
export class TenantWorkerPool {
  /** tenantId → 현재 in-flight 작업 수. */
  private readonly inFlight = new Map<string, number>();
  /** tenantId → policy (단순 Map 캐시 — invalidate() 로 무효화). */
  private readonly policies = new Map<string, TenantCronPolicy>();
  /** 글로벌 하드 캡 — pool 전체 동시 worker 한도 (PG conn 보호). */
  private readonly globalMaxConcurrent: number;
  private globalInFlight = 0;

  constructor(opts: { globalMaxConcurrent?: number } = {}) {
    this.globalMaxConcurrent = opts.globalMaxConcurrent ?? 8;
  }

  /**
   * 작업 dispatch. main thread 가 lock 잡은 상태에서 호출.
   *
   * 흐름:
   *   1. policy 해석 (캐시 → DB → DEFAULT).
   *   2. 글로벌 캡 체크 → 초과 시 SKIPPED + audit (caller).
   *   3. tenant 캡 체크 → 초과 시 SKIPPED + audit (caller).
   *   4. inFlight 증가 → runInWorker() → finally 감소.
   */
  async dispatch(
    job: DispatchJob,
    tenantId: string,
  ): Promise<DispatchResult> {
    const started = Date.now();
    const policy = await this.resolvePolicy(tenantId);

    if (this.globalInFlight >= this.globalMaxConcurrent) {
      return {
        status: "SKIPPED",
        durationMs: Date.now() - started,
        reason: "pool-saturated",
      };
    }

    const current = this.inFlight.get(tenantId) ?? 0;
    if (current >= policy.maxConcurrentJobs) {
      return {
        status: "SKIPPED",
        durationMs: Date.now() - started,
        reason: "tenant-cap",
      };
    }

    this.inFlight.set(tenantId, current + 1);
    this.globalInFlight += 1;
    try {
      return await this.runInWorker(job, policy);
    } finally {
      const after = (this.inFlight.get(tenantId) ?? 1) - 1;
      if (after <= 0) this.inFlight.delete(tenantId);
      else this.inFlight.set(tenantId, after);
      this.globalInFlight = Math.max(0, this.globalInFlight - 1);
    }
  }

  /** 정책 캐시 무효화 (운영 콘솔에서 TenantCronPolicy 변경 후 호출). */
  invalidate(tenantId: string): void {
    this.policies.delete(tenantId);
  }

  /** 진행 중 worker 수 — 운영 모니터링용. */
  get inFlightSnapshot(): { global: number; perTenant: Map<string, number> } {
    return {
      global: this.globalInFlight,
      perTenant: new Map(this.inFlight),
    };
  }

  private async resolvePolicy(tenantId: string): Promise<TenantCronPolicy> {
    const cached = this.policies.get(tenantId);
    if (cached) return cached;
    const loaded = await loadTenantCronPolicy(tenantId).catch(
      () => DEFAULT_POLICY,
    );
    this.policies.set(tenantId, loaded);
    return loaded;
  }

  private runInWorker(
    job: DispatchJob,
    policy: TenantCronPolicy,
  ): Promise<DispatchResult> {
    const started = Date.now();
    return new Promise((resolve) => {
      const worker = new Worker(WORKER_SCRIPT_PATH, {
        // spike-baas-002 §3.4: heap 만 cap (native binding 격리 X).
        resourceLimits: {
          maxOldGenerationSizeMb: policy.jobMemoryLimitMb,
          maxYoungGenerationSizeMb: Math.max(
            16,
            Math.floor(policy.jobMemoryLimitMb / 4),
          ),
          codeRangeSizeMb: 16,
          stackSizeMb: 4,
        },
        workerData: {
          job: {
            id: job.id,
            kind: job.kind,
            payload: job.payload,
            name: job.name,
          },
          policy: {
            jobTimeoutMs: policy.jobTimeoutMs,
            allowedFetchHosts: policy.allowedFetchHosts,
            webhookTimeoutMs: policy.webhookTimeoutMs,
          },
        },
      });

      let settled = false;
      const settle = (r: DispatchResult): void => {
        if (settled) return;
        settled = true;
        resolve(r);
      };

      // spike-baas-002 §3.3: 1차 우아한 종료 → 5s 후 강제.
      const hardTimeout = setTimeout(() => {
        try {
          worker.postMessage({ type: "shutdown" });
        } catch {
          // worker 가 이미 죽었을 가능성 — 무시.
        }
        setTimeout(() => {
          void worker.terminate().catch(() => {
            /* already dead */
          });
        }, 5_000);
        settle({
          status: "TIMEOUT",
          durationMs: Date.now() - started,
          message: `timeout after ${policy.jobTimeoutMs}ms`,
        });
      }, policy.jobTimeoutMs);

      worker.once(
        "message",
        (msg: { status: string; message?: string }) => {
          clearTimeout(hardTimeout);
          void worker.terminate().catch(() => {
            /* expected after success */
          });
          const status: DispatchStatus =
            msg.status === "SUCCESS"
              ? "SUCCESS"
              : msg.status === "TIMEOUT"
                ? "TIMEOUT"
                : "FAILURE";
          settle({
            status,
            durationMs: Date.now() - started,
            message: msg.message,
          });
        },
      );

      worker.once("error", (err) => {
        clearTimeout(hardTimeout);
        void worker.terminate().catch(() => {
          /* already errored */
        });
        settle({
          status: "FAILURE",
          durationMs: Date.now() - started,
          message: err instanceof Error ? err.message : String(err),
        });
      });

      worker.once("exit", (code) => {
        clearTimeout(hardTimeout);
        if (!settled && code !== 0) {
          settle({
            status: "FAILURE",
            durationMs: Date.now() - started,
            message: `worker exited code=${code} (likely OOM)`,
          });
        }
      });
    });
  }
}

/** singleton — registry tick 마다 같은 인스턴스 사용. */
declare global {
  // eslint-disable-next-line no-var
  var __tenantWorkerPool: TenantWorkerPool | undefined;
}

export function getWorkerPool(): TenantWorkerPool {
  if (!globalThis.__tenantWorkerPool) {
    globalThis.__tenantWorkerPool = new TenantWorkerPool({
      globalMaxConcurrent: Number(process.env.CRON_POOL_SIZE ?? 8),
    });
  }
  return globalThis.__tenantWorkerPool;
}

/** 테스트용 — singleton 리셋. */
export function _resetWorkerPoolForTesting(): void {
  globalThis.__tenantWorkerPool = undefined;
}
