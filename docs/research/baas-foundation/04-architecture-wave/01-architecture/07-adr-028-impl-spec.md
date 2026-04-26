# 07 — ADR-028 (Worker Pool + Tenant Isolation) Implementation Spec

- **상태**: DRAFT (구현 가이드)
- **작성일**: 2026-04-26 (baas-foundation Wave §04 Architecture Cluster)
- **상위 결정**: ADR-028 §10 옵션 D (ACCEPTED 2026-04-26)
- **상위 spike**: spike-baas-002 (worker pool isolation 검증 완료)
- **선행 검증**: spike-010 (PM2 cluster:4 + advisory lock), spike-012 (isolated-vm v6)
- **목표**: ADR-028이 채택한 Phase 1(자체 worker_threads pool) + Phase 3(pg-boss 결합) 구현 명세 + spike-baas-002 부수 fix 3건 일정화

---

## 1. 결정 요약

ADR-028 §10에서 옵션 D(하이브리드)가 ACCEPTED. 본 spec은 그 결정을 코드 가능한 명세로 풀어쓴다.

| 차원 | Phase 1 (즉시) | Phase 3 (N≥10 트리거 시) |
|---|---|---|
| 큐/락/리트라이 | 자체 (Map + advisory lock) | **pg-boss 위임** (queue + retryLimit + DLQ) |
| 실행 격리 | `node:worker_threads` per-job | `node:worker_threads` per-job (변경 없음) |
| Memory cap | `resourceLimits.maxOldGenerationSizeMb` | 동일 |
| Timeout | `worker.terminate()` + 5s grace | pg-boss `expireInSeconds` + worker.terminate() 이중 |
| Lock holder | **main thread** (worker terminate 시 lock 자동 해제 함정 회피) | pg-boss SKIP LOCKED (advisory lock 불필요) |
| 외부 의존 | zero | pg-boss 1개 추가 (PG 사용, 인프라 추가 zero) |

**핵심 설계 원칙**:

1. **Phase 1과 Phase 3는 dispatcher 인터페이스 호환** — `TenantWorkerPool.dispatch(job, tenantId)` 시그니처는 두 단계에서 동일. Phase 3에서 호출자만 `boss.work()` handler로 이동.
2. **lock holder = main thread 고정** — spike-baas-002 §3.7 결론. worker thread 자체 connection으로 lock 잡으면 terminate 시 lock 풀려 중복 실행 위험.
3. **per-job worker 모델 우선** — 격리 강화 우선, 재사용 시 상태 누수 위험. 처리량 임계 시 fixed pool reuse 전환 가능 (Phase 2 옵션).
4. **부수 fix 3건은 Phase 0/1 즉시** — ADR-028 채택 여부와 무관하게 명백한 결함이므로 본 Wave 내 처리.

---

## 2. Phase 1 — 자체 worker_threads pool

### 2.1 TenantWorkerPool 클래스 (전체 코드)

`src/lib/cron/worker-pool.ts` (신규).

```typescript
import { Worker } from "node:worker_threads";
import path from "node:path";
import { audit } from "@/lib/audit";
import type { ScheduledJob } from "./registry";
import type { TenantCronPolicy } from "./policy";
import { loadTenantCronPolicy, DEFAULT_POLICY } from "./policy";

const WORKER_SCRIPT_PATH = path.resolve(__dirname, "worker-script.js");

export type DispatchStatus = "SUCCESS" | "FAILURE" | "TIMEOUT" | "SKIPPED";

export interface DispatchResult {
  status: DispatchStatus;
  durationMs: number;
  message?: string;
  reason?: string;
}

/**
 * spike-baas-002 §3.2 기반 per-tenant worker pool.
 * - main thread가 게이트키퍼 (concurrency cap)
 * - per-job worker 생성 (격리 우선, 재사용 X)
 * - resourceLimits로 약한 메모리 cap
 * - worker.terminate() + 5s grace로 timeout 강제
 */
export class TenantWorkerPool {
  /** tenantId → 현재 in-flight 작업 수 (메인 스레드 게이트) */
  private readonly inFlight = new Map<string, number>();
  /** tenantId → policy (LRU 캐시 또는 전체 적재) */
  private readonly policies = new Map<string, TenantCronPolicy>();
  /** 글로벌 하드 캡 — pool 전체 동시 worker 한도 (PG conn 보호) */
  private readonly globalMaxConcurrent: number;
  private globalInFlight = 0;

  constructor(opts: { globalMaxConcurrent?: number } = {}) {
    this.globalMaxConcurrent = opts.globalMaxConcurrent ?? 8;
  }

  async dispatch(job: ScheduledJob, tenantId: string): Promise<DispatchResult> {
    const started = Date.now();
    const policy = await this.resolvePolicy(tenantId);

    // 1. 글로벌 캡 (PG connection 압박 방지)
    if (this.globalInFlight >= this.globalMaxConcurrent) {
      await audit("cron.skip.pool-saturated", { tenantId, jobId: job.id });
      return {
        status: "SKIPPED",
        durationMs: Date.now() - started,
        reason: "pool-saturated",
      };
    }

    // 2. tenant 캡 (TenantCronPolicy.maxConcurrentJobs)
    const current = this.inFlight.get(tenantId) ?? 0;
    if (current >= policy.maxConcurrentJobs) {
      await audit("cron.skip.concurrency-cap", { tenantId, jobId: job.id, cap: policy.maxConcurrentJobs });
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

  private async resolvePolicy(tenantId: string): Promise<TenantCronPolicy> {
    const cached = this.policies.get(tenantId);
    if (cached) return cached;
    const loaded = await loadTenantCronPolicy(tenantId).catch(() => DEFAULT_POLICY);
    this.policies.set(tenantId, loaded);
    return loaded;
  }

  /** 정책 캐시 무효화 (TenantCronPolicy 변경 후 호출) */
  invalidate(tenantId: string): void {
    this.policies.delete(tenantId);
  }

  private runInWorker(job: ScheduledJob, policy: TenantCronPolicy): Promise<DispatchResult> {
    const started = Date.now();
    return new Promise((resolve) => {
      const worker = new Worker(WORKER_SCRIPT_PATH, {
        // spike-baas-002 §3.4: heap만 cap (native binding은 추적 X)
        resourceLimits: {
          maxOldGenerationSizeMb: policy.jobMemoryLimitMb,
          maxYoungGenerationSizeMb: Math.max(16, Math.floor(policy.jobMemoryLimitMb / 4)),
          codeRangeSizeMb: 16,
          stackSizeMb: 4,
        },
        workerData: {
          job: { id: job.id, kind: job.kind, payload: job.payload, name: job.name },
          policy: {
            jobTimeoutMs: policy.jobTimeoutMs,
            allowedFetchHosts: policy.allowedFetchHosts,
          },
        },
      });

      let settled = false;
      const settle = (r: DispatchResult) => {
        if (settled) return;
        settled = true;
        resolve(r);
      };

      // spike-baas-002 §3.3: 1차 우아한 종료 → 5s 후 강제
      const hardTimeout = setTimeout(() => {
        worker.postMessage({ type: "shutdown" });
        setTimeout(() => void worker.terminate(), 5_000);
        settle({
          status: "TIMEOUT",
          durationMs: Date.now() - started,
          message: `timeout after ${policy.jobTimeoutMs}ms`,
        });
      }, policy.jobTimeoutMs);

      worker.once("message", (msg: { status: string; message?: string }) => {
        clearTimeout(hardTimeout);
        void worker.terminate(); // per-job worker, 항상 정리
        const status: DispatchStatus =
          msg.status === "SUCCESS" ? "SUCCESS" : msg.status === "TIMEOUT" ? "TIMEOUT" : "FAILURE";
        settle({ status, durationMs: Date.now() - started, message: msg.message });
      });

      worker.once("error", (err) => {
        clearTimeout(hardTimeout);
        void worker.terminate();
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

// 싱글톤 (registry처럼 globalThis 캐시)
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
```

### 2.2 worker-script.ts (워커 측)

`src/lib/cron/worker-script.ts` (신규). build 시 `worker-script.js`로 컴파일.

```typescript
import { parentPort, workerData } from "node:worker_threads";

interface WorkerInput {
  job: { id: string; name: string; kind: "SQL" | "FUNCTION" | "WEBHOOK"; payload: unknown };
  policy: { jobTimeoutMs: number; allowedFetchHosts: string[] };
}

const { job, policy } = workerData as WorkerInput;
const abortController = new AbortController();

// CK-38 패턴: structured log (stdout JSON 1줄)
function log(level: "info" | "warn" | "error", event: string, extra: Record<string, unknown> = {}): void {
  process.stdout.write(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      worker: "cron",
      jobId: job.id,
      jobKind: job.kind,
      event,
      ...extra,
    }) + "\n"
  );
}

parentPort?.on("message", (msg: { type?: string }) => {
  if (msg.type === "shutdown") {
    log("warn", "worker.shutdown-requested");
    abortController.abort();
  }
});

(async () => {
  const started = Date.now();
  try {
    log("info", "worker.start");
    let message: string | undefined;

    if (job.kind === "WEBHOOK") {
      // WEBHOOK은 worker에서 fetch (main에 부담 떠넘기지 않음)
      message = await runWebhook(job.payload, policy, abortController.signal);
    } else if (job.kind === "FUNCTION") {
      // FUNCTION = isolated-vm 호출. main에서도 가능하나 격리 강화 위해 worker 내부에서.
      message = await runFunction(job.payload, policy, abortController.signal);
    } else if (job.kind === "SQL") {
      // SQL은 main thread에서 처리 권고 (advisory lock + connection pool 안정성).
      // worker로 진입하면 안 됨 — dispatcher가 라우팅.
      throw new Error("SQL kind는 main thread에서 처리해야 함");
    } else {
      throw new Error(`unknown kind: ${job.kind}`);
    }

    log("info", "worker.success", { durationMs: Date.now() - started });
    parentPort?.postMessage({ status: "SUCCESS", message });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = abortController.signal.aborted || msg.toLowerCase().includes("timeout");
    log(isTimeout ? "warn" : "error", "worker.fail", {
      durationMs: Date.now() - started,
      error: msg,
      stack: err instanceof Error ? err.stack : undefined,
    });
    parentPort?.postMessage({
      status: isTimeout ? "TIMEOUT" : "FAILURE",
      message: msg,
    });
  }
})();

// --- helpers (실 구현 별도 파일로 분리 권고) ---

async function runWebhook(
  _payload: unknown,
  _policy: WorkerInput["policy"],
  _signal: AbortSignal,
): Promise<string> {
  // TODO: prisma 호출은 main에 RPC 위임. 여기서는 fetch만.
  // 본 spec은 구조 가이드만 제공. 구현 PR에서 구체화.
  throw new Error("runWebhook 구현 필요 (main RPC 패턴)");
}

async function runFunction(
  _payload: unknown,
  _policy: WorkerInput["policy"],
  _signal: AbortSignal,
): Promise<string> {
  // TODO: isolated-vm v6 Isolate 생성. allowedFetchHosts 전달.
  throw new Error("runFunction 구현 필요");
}
```

**핵심 설계 결정**:
- `parentPort`로 양방향 메시지 (shutdown 1차 신호 + 결과)
- `process.stdout.write` JSON 1줄 = CK-38 audit silent failure 패턴 호환 (PM2 logrotate가 그대로 수집)
- AbortController는 fetch + isolated-vm 둘 다에 전파 가능

### 2.3 dispatcher 통합

`src/lib/cron/runner.ts` 변경:

```typescript
// Before (현재)
export async function dispatchCron(job: { ... }): Promise<CronRunResult> {
  if (job.kind === "SQL") { /* main thread */ }
  if (job.kind === "FUNCTION") { /* main thread + isolated-vm */ }
  if (job.kind === "WEBHOOK") { /* main thread fetch */ }
}

// After (Phase 1)
export async function dispatchCron(job: ScheduledJob, tenantId: string): Promise<CronRunResult> {
  // SQL은 main에서 직접 처리 (worker에 넘기면 PG connection 압박)
  if (job.kind === "SQL") return dispatchSqlOnMain(job);

  // FUNCTION/WEBHOOK은 worker pool로
  const result = await getWorkerPool().dispatch(job, tenantId);
  return {
    status: result.status === "SKIPPED" ? "FAILURE" : result.status,
    durationMs: result.durationMs,
    message: result.message ?? result.reason,
  };
}
```

`src/lib/cron/registry.ts` 변경 — globalThis 싱글톤 → tenant 차원 Map:

```typescript
interface RegistryState {
  started: boolean;
  tickHandle: NodeJS.Timeout | null;
  /** tenantId → jobId → job */
  jobsByTenant: Map<string, Map<string, ScheduledJob>>;
  lastTickMinute: Map<string, number>; // key = `${tenantId}:${jobId}`
  running: Set<string>;                  // key = `${tenantId}:${jobId}`
}

interface ScheduledJob {
  id: string;
  tenantId: string;          // ← NEW (ADR-024 통합)
  name: string;
  schedule: string;
  kind: "SQL" | "FUNCTION" | "WEBHOOK";
  payload: unknown;
}

async function tick(): Promise<void> {
  const s = state();
  const now = new Date();
  const minuteKey = Math.floor(now.getTime() / 60_000);

  // PM2 cluster leader election (옵션 — Phase 1 후반)
  // const isLeader = await tryAdvisoryLock(SCHEDULER_LEADER_KEY);
  // if (!isLeader) return;

  for (const [tenantId, jobs] of s.jobsByTenant) {
    for (const job of jobs.values()) {
      const key = `${tenantId}:${job.id}`;
      if (s.running.has(key)) continue;
      if (s.lastTickMinute.get(key) === minuteKey) continue;
      try {
        if (!matchesSchedule(job.schedule, now)) continue;
      } catch { continue; }
      s.lastTickMinute.set(key, minuteKey);

      // circuit breaker check
      if (!await shouldDispatch(job.id)) continue;

      // per-(tenant,job) advisory lock (lock holder = main thread)
      const lockKey = tenantJobLockKey(tenantId, job.id);
      const got = await tryAdvisoryLock(lockKey);
      if (!got) continue;

      // dispatch — fire-and-forget but tracked
      void runJob(job, tenantId, lockKey);
    }
  }
}

async function runJob(job: ScheduledJob, tenantId: string, lockKey: bigint): Promise<void> {
  const s = state();
  const key = `${tenantId}:${job.id}`;
  s.running.add(key);
  try {
    const result = await dispatchCron(job, tenantId);
    await prisma.cronJob.update({
      where: { id: job.id },
      data: {
        lastRunAt: new Date(),
        lastStatus: `${result.status}${result.message ? `: ${result.message}` : ""}`,
      },
    });
    await recordResult(job.id, result.status === "SUCCESS");
  } catch (err) {
    // §4.3 부수 fix 3: structured log + audit
    log.error({
      event: "cron.runJob.unhandled",
      jobId: job.id,
      tenantId,
      err: {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
    });
    await audit("cron.runJob.unhandled-error", { jobId: job.id, tenantId });
  } finally {
    s.running.delete(key);
    await releaseAdvisoryLock(lockKey);
  }
}
```

### 2.4 Lock holder = main thread (spike-baas-002 §3.7)

핵심 함정: PG advisory lock은 **PG connection 단위**로 해제됨. worker thread 자체 connection으로 lock 잡고 `worker.terminate()` 시 connection 죽음 → lock 즉시 해제 → 다른 PM2 worker가 같은 job 중복 실행 가능.

**확정 패턴**:

```
[main thread]
  ├─ tryAdvisoryLock(tenantJobLockKey(t, j))  ← main의 PG conn으로 잡음
  ├─ workerPool.dispatch(job, t)              ← worker 생성/실행/종료
  └─ releaseAdvisoryLock(key)                  ← finally 블록에서 해제
```

worker는 격리된 코드만 실행 (fetch, isolated-vm). DB 쓰기/읽기는 main에 RPC 위임 (또는 worker 내부에서 별도 short-lived connection — 단 lock과 무관한 작업만).

`src/lib/cron/lock.ts` (신규):

```typescript
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

/** spike-baas-002 §3.7 전략 1: tenant+job → BIGINT */
export function tenantJobLockKey(tenantId: string, jobId: string): bigint {
  const h = createHash("sha256").update(`tenant:${tenantId}:job:${jobId}`).digest();
  return h.readBigInt64BE(0);
}

export async function tryAdvisoryLock(key: bigint): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ got: boolean }>>`
    SELECT pg_try_advisory_lock(${key}::bigint) AS got
  `;
  return rows[0]?.got === true;
}

export async function releaseAdvisoryLock(key: bigint): Promise<void> {
  await prisma.$queryRaw`SELECT pg_advisory_unlock(${key}::bigint)`;
}
```

→ 충돌 위험: 64bit hash, 200 jobs × 1.5 cluster worker = 300 entry, 충돌 확률 ~10⁻¹⁵.

---

## 3. Phase 3 — pg-boss 결합 (N≥10 트리거 시)

### 3.1 트리거 조건 (Phase 3 발동)

다음 중 1개라도 충족하면 Phase 3 마이그레이션 검토:

- 활성 tenant 수 ≥ 10
- 분당 dispatch ≥ 200
- 자체 retry/DLQ 자체 구현 부담이 임계 도달 (예: cronJob 컬럼 5개 이상 추가, retry 로직 100줄 이상)
- 운영 중 "scheduler tick 부담 4× (cluster:4)" 이슈 발생

### 3.2 변경 범위

| 파일 | Phase 1 | Phase 3 |
|---|---|---|
| `worker-pool.ts` | 직접 호출됨 | pg-boss handler 내부에서 호출됨 (코드 변경 zero) |
| `lock.ts` | tryAdvisoryLock 사용 | pg-boss SKIP LOCKED 사용 → advisory lock 제거 가능 |
| `registry.ts` | tick → dispatch | tick → boss.send (enqueue만) |
| `queue.ts` | — (없음) | **신규**: pg-boss 초기화 + handler 등록 |

### 3.3 pg-boss 통합 코드

`src/lib/cron/queue.ts` (Phase 3 신규):

```typescript
import PgBoss from "pg-boss";
import { getWorkerPool } from "./worker-pool";
import { recordResult } from "./circuit-breaker";

let boss: PgBoss | null = null;

export async function startQueue(): Promise<void> {
  if (boss) return;
  boss = new PgBoss({
    connectionString: process.env.DATABASE_URL!,
    schema: "pgboss", // 별도 스키마, ADR-023 multi-tenant 모델과 분리
    archiveCompletedAfterSeconds: 7 * 86_400,
    deleteAfterDays: 30,
  });
  await boss.start();

  // worker pool은 그대로 — handler 안에서 격리 위해 호출
  await boss.work(
    "cron-jobs",
    { teamSize: 8, teamConcurrency: 1, batchSize: 1 },
    async (jobs) => {
      const pgJob = jobs[0];
      const { job, tenantId } = pgJob.data as { job: ScheduledJob; tenantId: string };
      const result = await getWorkerPool().dispatch(job, tenantId);
      await recordResult(job.id, result.status === "SUCCESS");
      if (result.status !== "SUCCESS" && result.status !== "SKIPPED") {
        throw new Error(result.message ?? "cron failure"); // pg-boss retry 트리거
      }
      return result;
    },
  );
}

export async function enqueueDue(jobs: Array<{ job: ScheduledJob; tenantId: string }>): Promise<void> {
  if (!boss) throw new Error("pg-boss not started");
  const minute = Math.floor(Date.now() / 60_000);
  for (const { job, tenantId } of jobs) {
    await boss.send(
      "cron-jobs",
      { job, tenantId },
      {
        // 분 단위 dedupe — cluster:4 × scheduler tick 4회 모두에서 같은 minute key 생성 → 1회만 enqueue
        singletonKey: `${tenantId}:${job.id}:${minute}`,
        expireInSeconds: 300,
        retryLimit: 3,
        retryBackoff: true,
      },
    );
  }
}

export async function stopQueue(): Promise<void> {
  if (!boss) return;
  await boss.stop({ graceful: true, timeout: 30_000 });
  boss = null;
}
```

### 3.4 마이그레이션 절차

1. **Phase 1 안정화 확인** — 운영 4주 이상 무중단, audit 이벤트 정상.
2. **shadow 모드** (1주) — pg-boss 도입 + enqueue만 수행, handler는 no-op (실제 실행은 Phase 1 dispatcher가 계속). pg-boss 큐 적체/처리량 메트릭 수집.
3. **switchover** — feature flag (`CRON_USE_PGBOSS=true`) 로 dispatcher 우회 + handler 활성화. registry.ts tick은 enqueue만.
4. **advisory lock 제거** — pg-boss `singletonKey`가 dedupe 보장. Phase 1의 `tryAdvisoryLock` 호출 제거.
5. **rollback 계획** — flag false로 즉시 복귀. shadow 모드 유지로 데이터 손실 zero.

---

## 4. spike-baas-002 부수 fix 3건 (Phase 0/1 즉시)

본 ADR-028 결정과 무관하게 명백한 결함. **Phase 0** (worker pool 도입 전, 단독 patch) 또는 Phase 1 초반 처리.

### 4.1 runner.ts:21 DEFAULT_ALLOWED_FETCH 정책화

**현재 결함**:
```typescript
// src/lib/cron/runner.ts:21
const DEFAULT_ALLOWED_FETCH = ["api.github.com", "stylelucky4u.com"];
```

전역 상수. 멀티테넌트 전환 시 모든 tenant가 동일 화이트리스트 → 격리 위반.

**수정 방향** (ADR-024 의존):
```typescript
// 새 흐름
const policy = await loadTenantCronPolicy(tenantId);
const allowedFetchHosts = policy.allowedFetchHosts; // tenant manifest에서 로드
await runIsolatedFunction(fn.code, {
  input: payload.input ?? null,
  timeoutMs: 30_000,
  allowedFetchHosts,
});
```

`TenantCronPolicy.allowedFetchHosts: string[]` — DB 또는 tenant manifest YAML에서 로드. ADR-024 (Plugin/도메인 코드 격리)에서 tenant manifest 스키마 확정 후 통합.

**즉시 처리 가능 부분**: Phase 0에서는 환경변수로 `CRON_ALLOWED_FETCH=host1,host2` 노출하여 하드코딩 제거. ADR-024 확정 후 tenant 차원으로 격상.

### 4.2 runner.ts:72 WEBHOOK fetch AbortController

**현재 결함**:
```typescript
// src/lib/cron/runner.ts:72
const res = await fetch(hook.url, {
  method: "POST",
  headers,
  body: JSON.stringify(...),
});
```

timeout 없음. webhook 응답 60초+ hang 시 cron tick 전체 push back.

**즉시 patch** (Phase 0):
```typescript
const timeoutMs = Number(process.env.AGGREGATOR_FETCH_TIMEOUT ?? 60_000);
const ac = new AbortController();
const t = setTimeout(() => ac.abort(), timeoutMs);
try {
  const res = await fetch(hook.url, {
    method: "POST",
    headers,
    body: JSON.stringify({ cron: job.name, event: hook.event, at: new Date().toISOString() }),
    signal: ac.signal,
  });
  return {
    status: res.ok ? "SUCCESS" : "FAILURE",
    durationMs: Date.now() - started,
    message: `HTTP ${res.status}`,
  };
} catch (err) {
  if (err instanceof Error && err.name === "AbortError") {
    return { status: "TIMEOUT", durationMs: Date.now() - started, message: `webhook timeout ${timeoutMs}ms` };
  }
  throw err;
} finally {
  clearTimeout(t);
}
```

환경변수 `AGGREGATOR_FETCH_TIMEOUT` 기본 60_000 (60s). tenant policy 도입 후에는 `policy.webhookTimeoutMs`로 격상.

### 4.3 registry.ts:135 runJob catch structured log

**현재 결함**:
```typescript
// src/lib/cron/registry.ts:135
} catch {
  // 무시 — 루프 지속
}
```

CK-38 (audit silent failure) 패턴 그대로. 실패 원인 추적 불가.

**즉시 patch** (Phase 0):
```typescript
} catch (err) {
  log.error({
    event: "cron.runJob.unhandled",
    jobId: job.id,
    tenantId: job.tenantId,
    err: {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    },
  });
  await audit("cron.runJob.unhandled-error", { jobId: job.id, tenantId: job.tenantId, errorMessage: err instanceof Error ? err.message : String(err) }).catch(() => {});
}
```

`log` = pino 또는 stdout JSON. audit 호출은 `catch(() => {})` 로 fail-soft (ADR-021 §amendment-1 cross-cutting 패턴).

### 4.4 부수 fix 3건 PR 일정

| Fix | 의존 | 예상 공수 | 순서 |
|---|---|---|---|
| 4.2 WEBHOOK AbortController | 없음 (env var만) | 1h | **즉시 (단독 PR)** |
| 4.3 runJob catch structured log | log 인프라 (pino) | 2h | **즉시 (단독 PR)** |
| 4.1 ALLOWED_FETCH 정책화 | env var 단계 → 즉시 / tenant 단계 → ADR-024 | 1h + 4h | env 단계 즉시, tenant 단계 ADR-024 후 |

→ 4.2, 4.3은 **본 Wave 내 별도 minor patch PR** 권고.

---

## 5. spike-010 advisory lock 호환성

### 5.1 단일 lock key → (tenantId, jobId) 복합 키

spike-010이 검증한 패턴:
```typescript
const lockKey = hashToBigInt("cleanup-sessions-job"); // 고정 BIGINT
```

→ 멀티테넌트 확장:
```typescript
const lockKey = tenantJobLockKey(tenantId, jobId); // (t, j) → BIGINT
```

spike-010 결과는 **무효화되지 않음**. `pg_try_advisory_lock(BIGINT)` PG 12+ 보증은 그대로 적용. 키 생성 함수만 추가.

### 5.2 3가지 전략 비교

spike-baas-002 §3.7 + ADR-028 §5.2 종합:

| 전략 | 충돌 확률 | 가독성 | 성능 | 권고 |
|---|---|---|---|---|
| **1. BIGINT 단일 (sha256 첫 8 bytes)** | ~10⁻¹⁵ (200 jobs × 1.5 cluster) | 중간 | 동일 | ⭐⭐⭐⭐⭐ |
| 2. PG 2-key (`pg_try_advisory_lock(int4, int4)`) | 더 낮음 | 명시적 | 동일 | ⭐⭐⭐⭐ |
| 3. PG row-level lock (cron_jobs UPDATE) | 0 | 가장 명시적 | hot path 됨 (분당 240 UPDATE @ cluster:4) | ⭐⭐ |

**채택**: 전략 1. spike-baas-002 §3.7에서 권고. 충돌 확률이 통계적으로 무시 가능 + 단일 BIGINT 키가 PG 함수 호출 1회로 끝남.

### 5.3 cluster:4 + worker_threads pool 시뮬레이션

ADR-028 §5.3 도식 그대로:
```
[PM2 worker 0~3] scheduler tick → for each due job: tryAdvisoryLock
  → 1명만 winner (전략 1 BIGINT 키 동일)
winner:
  ├─ TenantWorkerPool.dispatch(job, tenantId)
  │    └─ worker_thread 1개 슬롯 점유
  │    └─ resourceLimits 적용 + timeout
  ├─ 결과 받음
  └─ pg_advisory_unlock(key)
```

→ **호환 ✅**. lock holder = main thread 원칙 준수 (워커 terminate에도 lock 유지).

---

## 6. EdgeFunction (isolated-vm v6) 통합

### 6.1 3중 격리 (ADR-028 §8.2)

| 층 | 메커니즘 | 책임 |
|---|---|---|
| L1 (process) | PM2 cluster:4 | 전체 프로세스 격리 (Phase 16+ 옵션) |
| L2 (thread) | `node:worker_threads` per-job | tenant cron 격리 (본 spec Phase 1) |
| L3 (V8 isolate) | isolated-vm v6 Isolate per FUNCTION | EdgeFunction 코드 격리 (ADR-009 L1, spike-012 검증) |

FUNCTION 실행 흐름:
```
main thread
  └─ workerPool.dispatch(job, tenantId)
       └─ worker_thread (resourceLimits 128MB heap)
            └─ runIsolatedFunction(fn.code, { allowedFetchHosts, timeoutMs: 30_000 })
                 └─ ivm.Isolate.script.run({ timeout: 30_000 })  ← 1차 timeout
            ← worker_thread.terminate() 5s 후                    ← 2차 escape hatch
```

### 6.2 allowedFetchHosts 전역 → per-tenant DB 정책

`runner.ts:21` 부수 fix와 동일 (§4.1). 코드 측면:

```typescript
// Before
allowedFetchHosts: DEFAULT_ALLOWED_FETCH

// After (Phase 1)
allowedFetchHosts: policy.allowedFetchHosts // TenantCronPolicy에서 로드
```

ADR-024 (Plugin 격리) 합의 후:
- `TenantNetworkPolicy` 모델 분리 가능 (egress allowlist, denylist, SSRF 방지)
- `TenantCronPolicy.allowedFetchHosts` → `TenantNetworkPolicy.egressAllowlist`로 격상

### 6.3 isolated-vm v6 cold start 누적 비용

spike-012 검증: cold start p95 0.909ms. worker_thread 생성 ~10~30ms와 합쳐도 30~50ms/dispatch. N=200 jobs/min × 50ms = 10s/min overhead. 수용 가능.

→ 단 처리량 임계 도달 시 fixed pool reuse + isolated-vm Isolate reuse 검토 (Phase 2 옵션).

---

## 7. CronJob 모델 변경

### 7.1 Prisma schema 변경

```prisma
model CronJob {
  id                  String    @id @default(cuid())
  tenantId            String                                  // ← NEW (FK)
  name                String
  schedule            String
  kind                String                                  // SQL | FUNCTION | WEBHOOK
  payload             Json
  enabled             Boolean   @default(true)
  lastRunAt           DateTime?
  lastStatus          String?

  // ADR-028 추가 컬럼
  consecutiveFailures Int       @default(0)
  circuitState        String    @default("CLOSED")           // CLOSED | OPEN | HALF_OPEN
  circuitOpenedAt     DateTime?
  lastSuccessAt       DateTime?

  tenant              Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, enabled])
  @@index([circuitState, circuitOpenedAt])
}

model TenantCronPolicy {
  tenantId                      String   @id
  maxConcurrentJobs             Int      @default(3)
  jobTimeoutMs                  Int      @default(30_000)
  jobMemoryLimitMb              Int      @default(128)
  consecutiveFailureThreshold   Int      @default(5)
  ticksPerDay                   Int      @default(1440)
  allowedFetchHosts             String[]
  webhookTimeoutMs              Int      @default(60_000)

  tenant                        Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}
```

### 7.2 TENANT kind 신설 (ADR-024 통합)

ADR-024가 plugin/domain 코드를 격리할 때 `kind = TENANT`를 도입할 가능성. 본 spec은 그 인터페이스만 예약:

```typescript
type CronKind = "SQL" | "FUNCTION" | "WEBHOOK" | "TENANT";

// TENANT kind: ADR-024 plugin manifest에서 정의된 cron entry 호출
//   payload: { pluginId: string, entryName: string, args: unknown }
```

ADR-024 합의 전까지 TENANT는 enum reserved 상태 유지.

### 7.3 마이그레이션 sequence

1. **migration 1** (Phase 1): `CronJob.tenantId` 추가 (nullable로 도입 → 기존 row 백필 → not null로 격상). `consecutiveFailures`, `circuitState`, `circuitOpenedAt`, `lastSuccessAt` 추가.
2. **migration 2** (Phase 1): `TenantCronPolicy` 테이블 생성. 기존 tenant마다 DEFAULT row 삽입.
3. **migration 3** (ADR-024 후): `CronJob.kind` enum에 TENANT 추가. payload 스키마 업데이트.
4. **migration 4** (Phase 3): `pgboss.*` 스키마 자동 생성 (pg-boss `boss.start()` 가 처리).

---

## 8. Circuit breaker 패턴

spike-baas-002 §3.5 sketch 기반.

`src/lib/cron/circuit-breaker.ts` (신규):

```typescript
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

const COOLDOWN_MS = 60 * 60_000;       // 1h (ADR-028 §6.2 명시 권고)
const FAILURE_THRESHOLD = 5;            // TenantCronPolicy.consecutiveFailureThreshold로 override 가능

export async function shouldDispatch(jobId: string): Promise<boolean> {
  const c = await prisma.cronJob.findUnique({
    where: { id: jobId },
    select: { circuitState: true, circuitOpenedAt: true },
  });
  if (!c) return false;

  if (c.circuitState === "OPEN") {
    const elapsed = Date.now() - (c.circuitOpenedAt?.getTime() ?? 0);
    if (elapsed < COOLDOWN_MS) {
      await audit("cron.skip.circuit-open", { jobId, elapsed }).catch(() => {});
      return false;
    }
    // cooldown 경과 → HALF_OPEN 1회 허용
    await prisma.cronJob.update({
      where: { id: jobId },
      data: { circuitState: "HALF_OPEN" },
    });
    await audit("cron.circuit.half-open", { jobId }).catch(() => {});
  }
  return true;
}

export async function recordResult(jobId: string, success: boolean): Promise<void> {
  if (success) {
    const before = await prisma.cronJob.findUnique({
      where: { id: jobId },
      select: { circuitState: true, consecutiveFailures: true },
    });
    await prisma.cronJob.update({
      where: { id: jobId },
      data: {
        circuitState: "CLOSED",
        consecutiveFailures: 0,
        circuitOpenedAt: null,
        lastSuccessAt: new Date(),
      },
    });
    if (before?.circuitState !== "CLOSED") {
      await audit("cron.circuit.closed", { jobId }).catch(() => {});
    }
    return;
  }

  const updated = await prisma.cronJob.update({
    where: { id: jobId },
    data: { consecutiveFailures: { increment: 1 } },
    select: { consecutiveFailures: true, tenantId: true },
  });

  // policy에서 threshold 가져옴 (없으면 default)
  const policy = await prisma.tenantCronPolicy.findUnique({
    where: { tenantId: updated.tenantId },
    select: { consecutiveFailureThreshold: true },
  });
  const threshold = policy?.consecutiveFailureThreshold ?? FAILURE_THRESHOLD;

  if (updated.consecutiveFailures >= threshold) {
    await prisma.cronJob.update({
      where: { id: jobId },
      data: { circuitState: "OPEN", circuitOpenedAt: new Date() },
    });
    await audit("cron.circuit.opened", {
      jobId,
      failures: updated.consecutiveFailures,
      threshold,
    }).catch(() => {});
  }
}
```

**상태 전이**:
```
CLOSED ──(consecutive_failures ≥ threshold)──→ OPEN
OPEN ──(elapsed ≥ COOLDOWN_MS)──→ HALF_OPEN
HALF_OPEN ──(success)──→ CLOSED
HALF_OPEN ──(failure)──→ OPEN (cooldown 재시작)
```

---

## 9. 7원칙 매핑

baas-foundation Wave §00 7원칙 (`docs/research/baas-foundation/00-context/03-seven-principles.md`).

| 원칙 | 본 spec의 기여 |
|---|---|
| 원칙 1 — 단일 진실 소스 | TenantCronPolicy 모델이 cron 실행 정책의 단일 진실 소스 |
| 원칙 2 — 격리 우선 | 3중 격리 (process/thread/Isolate) 명시. 신뢰 경계 설명 |
| **원칙 3 — 한 컨슈머 실패가 다른 컨슈머에 닿지 않음** | **worker pool isolation으로 직접 충족** (worker.terminate, resourceLimits, circuit breaker, per-tenant cap) |
| 원칙 4 — Audit fail-soft | runJob catch + circuit breaker 모든 transition이 audit (ADR-021 패턴, `.catch(() => {})`) |
| 원칙 5 — 점진 마이그레이션 | Phase 1 → Phase 3 인터페이스 호환 보장. ADR-005/015/024 amendment로 역사 보존 |
| 원칙 6 — 외부 의존 최소화 | Phase 1은 외부 의존 zero. Phase 3 도입 시도 PG만 사용 (Redis 거부) |
| 원칙 7 — 1인 운영 적합 | scheduler/dispatcher 모두 PG로 backed → 백업/모니터링 단일 |

---

## 10. Open Questions

본 spec이 답하지 못한 사항. 후속 ADR 또는 Phase 1 구현 PR에서 결정.

### 10.1 Graceful shutdown 패턴 (PM2 reload 시 in-flight job)

ADR-028 §12.3 Open Question 그대로.

**선택지**:
- (a) `worker.terminate()` 즉시 — 작업 손실 가능, 재실행은 다음 tick에서
- (b) 30s grace — `process.on('SIGTERM', ...)` 에서 in-flight worker 완료 대기
- (c) Phase 3 pg-boss로 위임 — pg-boss `boss.stop({ graceful: true, timeout: 30_000 })` 가 자동 처리

**잠정 권고**: Phase 1은 (b), Phase 3는 (c). PM2 `--listen-timeout 35000` 설정 필요.

### 10.2 Scheduler leader election (PM2 cluster:4 시 중복 방지)

ADR-028 §12.6 Open Question 그대로.

현재 `setInterval(tick, 60_000)` × cluster:4 = 4개 worker가 모두 tick → advisory lock으로 dispatch 중복은 막지만 `prisma.cronJob.findMany` 4회/분 발생.

**선택지**:
- (a) 무시 — 4 query/min은 부담 없음
- (b) PG `pg_advisory_lock("cron-scheduler-leader")` 로 1개만 leader → 나머지는 1분 sleep
- (c) Phase 3 pg-boss leader election 사용

**잠정 권고**: Phase 1 시작 시 (a). cluster:4 도입 + 운영 모니터링 후 부담 발견 시 (b) 추가.

### 10.3 Prisma connection 압박 (worker 수 × pool size)

ADR-028 §12.1 Risk-1.

8 worker × 5 conn = 40 conn vs PG `max_connections=100`. 추가 cluster:4면 4 × 8 × 5 = 160 → **초과**.

**완화 안**:
- (a) worker는 Prisma 인스턴스 만들지 않음. main에 RPC 위임 (DB 작업은 main thread만).
- (b) worker별 connection 1개로 제한 (`?connection_limit=1`)
- (c) PgBouncer 도입 (transaction-pooling 모드)

**잠정 권고**: (a) + (b) 조합. SQL kind는 main thread 처리 (이미 §2.3 결정), FUNCTION/WEBHOOK은 worker에서 DB 접근 최소화. 그래도 필요하면 worker 자체 short-lived Prisma 인스턴스 + connection_limit=1.

### 10.4 SQLite audit_logs 동시 쓰기

ADR-028 §12.2. spike-010 §3에서 200 writes/s까지 SQLITE_BUSY 0% 검증. 본 시나리오 (max 200 events/min) 안전.

→ **결론**: 추가 조치 불필요. PRAGMA journal_mode=WAL 유지.

---

## 11. 산출물 체크리스트 (Phase 1 구현 PR 시)

신규 파일:
- [ ] `src/lib/cron/policy.ts` — TenantCronPolicy 로드/캐시
- [ ] `src/lib/cron/worker-pool.ts` — TenantWorkerPool 클래스
- [ ] `src/lib/cron/worker-script.ts` — worker entry point
- [ ] `src/lib/cron/circuit-breaker.ts` — shouldDispatch / recordResult
- [ ] `src/lib/cron/lock.ts` — tenantJobLockKey + try/release helper
- [ ] `src/lib/cron/audit.ts` — 6종 cron 이벤트 wrapper (ADR-029 연계)

수정 파일:
- [ ] `src/lib/cron/registry.ts` — Map<tenantId, ...>로 차원 추가, lock holder 통합
- [ ] `src/lib/cron/runner.ts` — dispatchCron(job, tenantId), worker pool 위임, 부수 fix 3건
- [ ] `prisma/schema.prisma` — CronJob 컬럼 추가, TenantCronPolicy 모델

마이그레이션:
- [ ] `prisma/migrations/2026MMDD_cron_tenant_isolation/migration.sql`

테스트 (TDD 우선):
- [ ] dispatcher 단위 테스트 — cap/timeout/circuit 분기 (모킹 worker)
- [ ] worker-script integration — 실제 worker 1개 띄우고 echo job 실행
- [ ] circuit breaker 상태 전이 테스트 (CLOSED → OPEN → HALF_OPEN → CLOSED)
- [ ] lock holder 테스트 — worker terminate 시 main lock 유지 검증

부수 fix 3건 (별도 minor PR 가능):
- [ ] §4.2 WEBHOOK AbortController + AGGREGATOR_FETCH_TIMEOUT
- [ ] §4.3 runJob catch structured log + audit
- [ ] §4.1 ALLOWED_FETCH env var 단계 (tenant 단계는 ADR-024 후)

---

## 12. References

- ADR-028 — `docs/research/baas-foundation/01-adrs/ADR-028-cron-worker-pool-and-per-tenant-isolation.md`
- spike-baas-002 — `docs/research/baas-foundation/03-spikes/spike-baas-002-worker-pool-isolation.md`
- spike-010 — `docs/research/spikes/spike-010-pm2-cluster-result.md`
- spike-012 — `docs/research/spikes/spike-012-isolated-vm-v6-result.md`
- ADR-005 (node-cron + advisory lock) — amendment 대상
- ADR-009 (Edge Functions 3층 하이브리드) — L1 isolated-vm 통합
- ADR-015 (PM2 cluster:4 + advisory lock) — amendment 대상 (key 분리)
- ADR-021 (audit fail-soft) — `.catch(() => {})` 패턴
- ADR-022 (1인-N프로젝트 BaaS 정체성) — 본 spec의 전제
- ADR-023 (데이터 격리 모델) — pgboss 스키마 위치 결정
- ADR-024 (Plugin/도메인 코드 격리) — TenantCronPolicy.allowedFetchHosts 합의
- ADR-029 (Per-tenant Observability) — cron audit 6종 이벤트 정의
- 현재 코드:
  - `src/lib/cron/registry.ts:33-49` (globalThis 싱글톤)
  - `src/lib/cron/registry.ts:125-139` (runJob, §4.3 fix 위치)
  - `src/lib/cron/runner.ts:21` (DEFAULT_ALLOWED_FETCH, §4.1 fix 위치)
  - `src/lib/cron/runner.ts:72` (WEBHOOK fetch, §4.2 fix 위치)

외부:
- pg-boss — https://github.com/timgit/pg-boss (Phase 3)
- Node `worker_threads` — https://nodejs.org/api/worker_threads.html
- isolated-vm v6 — https://www.npmjs.com/package/isolated-vm
- PG advisory locks — https://www.postgresql.org/docs/16/explicit-locking.html#ADVISORY-LOCKS

---

> **본 spec은 ADR-028 §10 옵션 D 결정의 구현 가이드.** Phase 1 PR 작성 시 §11 체크리스트 따라 진행. 부수 fix 3건(§4)은 본 Wave 내 별도 minor PR 권고.
