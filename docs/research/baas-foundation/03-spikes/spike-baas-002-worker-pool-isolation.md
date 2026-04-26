# Spike-BaaS-002: Worker Pool Per-tenant Isolation 기술 검증

- **상태**: COMPLETED (문서/API 분석 기반, PoC 코드 작성 X)
- **작성일**: 2026-04-26
- **트랙**: Micro spike (≤4h)
- **결정 의존**: ADR-028 §10 — 옵션 A (worker_threads 자체) / C (pg-boss) / D (하이브리드)
- **선행 검증**: spike-010 (PM2 cluster:4 + advisory lock) §4
- **후속 트리거**: 본 spike 결과로 ADR-028 결정 가능 → 결정 후 PoC 코드 작성 별도 PR

---

## 1. 스파이크 목적

ADR-028이 제기한 핵심 질문: "Node.js `node:worker_threads`만으로 N=10~20 tenant × 5~10 cron = 50~200 cron job의 per-tenant isolation을 어디까지 강제할 수 있는가?"

이 질문에 답하기 위해 다음 4가지를 검증한다:

1. **격리 능력의 정확한 한계** — worker_threads가 V8 isolate 수준의 강한 격리를 제공하는가? (스포일러: 아니다)
2. **API 표면** — concurrency cap, timeout enforcement, memory limit, circuit breaker를 어떻게 구현하는가
3. **외부 의존 없는 옵션** — pg-boss 도입 없이 옵션 D (자체 worker pool)만으로 충분한 격리가 가능한가
4. **PoC 코드 sketch** — 실 구현 시 코드 구조 (실제 코드 작성 X, 결정 후 별도 PR)

**범위 외 (out-of-scope)**:
- 실제 worker pool 구현
- 부하 테스트 (벤치마크는 결정 후 PoC 단계에서)
- pg-boss 라이브러리 자체의 내부 구조 분석 (옵션 C 선택 시 별도 spike-baas-003 권고)
- isolated-vm v6와의 결합 디테일 (spike-012에서 이미 검증)

---

## 2. 검증 질문 (ADR-028 §6.3, §12 기반)

| ID | 질문 | 1줄 답 |
|---|---|---|
| Q1 | `node:worker_threads`로 tenant별 concurrency cap을 어떻게? | main thread Map<tenantId, count> + dispatcher 게이트 (워커 자체엔 cap 없음) |
| Q2 | per-job timeout 강제 (SIGTERM/SIGKILL 등가) 가능 한도? | `worker.terminate()` = 즉시 강제 (cleanup X). 우아한 종료는 message + grace |
| Q3 | memory limit 강제는? V8 isolate 수준 강한 격리 가능한가? | **불가**. `resourceLimits.maxOldGenerationSizeMb` = 약한 힙 cap만 (heap만, native/RSS 포함 X) |
| Q4 | circuit breaker (연속 실패 자동 비활성)는? | DB 컬럼 `consecutiveFailures` + dispatcher 분기 + cooldown |
| Q5 | pg-boss와 결합은? | pg-boss = 분산 lock + retry/DLQ만. 실행 격리는 worker_threads pool이 별도 책임 |
| Q6 | spike-010 advisory lock과 호환? | ✅ 호환. lock holder는 main thread 권고 (worker thread 종료 시 lock 자동 해제 위험) |

---

## 3. 발견 사항

### 3.1 `node:worker_threads` 격리 능력의 정확한 한계

#### 무엇이 격리되는가 (가능)
- **JS heap 분리**: 각 worker는 독립된 V8 Isolate를 갖는다 (Node 공식 문서 `worker_threads` §"Workers (threads)"). 따라서 글로벌 변수, 모듈 상태, 클로저는 worker 간 공유되지 않는다.
- **이벤트 루프 분리**: worker 내 무한 루프가 main thread 이벤트 루프를 막지 않는다 (옵션 D의 핵심 가치).
- **`resourceLimits` 옵션** (Node 12+):
  - `maxOldGenerationSizeMb`: 메인 V8 old generation heap 한도 (MB)
  - `maxYoungGenerationSizeMb`: young generation 한도
  - `codeRangeSizeMb`: JIT 코드 영역 한도
  - `stackSizeMb`: thread stack 한도 (기본 4MB)
  - 한도 초과 시 worker가 `'exit'` 이벤트 발생 (uncaught `RangeError: WORKERS_LIMIT_EXCEEDED`).
- **`worker.terminate()`**: 즉시 강제 종료. JavaScript 실행 중간이라도 가능 (단 native code 실행 중에는 native 함수 반환 후 종료).

#### 무엇이 격리되지 않는가 (불가)
- **process 자원**: file descriptor, network socket, OS handle은 같은 프로세스 내 공유. 한 worker가 fd leak 시 전체 프로세스 영향.
- **native bindings 메모리**: `bcrypt`, `argon2`, `better-sqlite3`, `isolated-vm` 등 N-API 모듈은 native heap 사용 → `resourceLimits`에 잡히지 않음. native OOM 시 프로세스 전체 죽음.
- **파일 시스템**: 모든 worker가 같은 fs 권한. tenant별 chroot 등은 별도 메커니즘 필요.
- **환경 변수**: `process.env`는 main에서 분리 가능 (`Worker({ env: { ... } })`)하지만, 같은 PID라 OS-level 격리 아님.
- **CPU**: V8 thread pool, libuv worker pool은 공유. 한 worker의 CPU-bound 작업이 다른 worker의 async I/O callback을 push back할 수 있다 (실제로는 OS scheduler가 어느 정도 균등 분배).

> **결론**: worker_threads = "**같은 process 내 thread 격리**". V8 Isolate 수준의 강한 격리(예: isolated-vm v6, ADR-009 L1)와는 다르다. **신뢰할 수 없는 코드 실행에는 부적합**, **하지만 우리(테넌트 cron)** 는 신뢰할 수 있는 코드(EdgeFunction은 내부에서 isolated-vm으로 한 층 더 격리)이므로 worker_threads 격리로 충분.

#### V8 isolate (isolated-vm) vs worker_thread 격리 정도 비교

| 차원 | isolated-vm Isolate | worker_thread | process (fork) |
|---|---|---|---|
| JS heap 분리 | ✅ 완전 | ✅ 완전 | ✅ 완전 |
| 메모리 cap 강제 | ✅ hard limit (memory_limit) | ⚠️ soft (resourceLimits, heap만) | ⚠️ ulimit/cgroup OS 의존 |
| timeout 강제 | ✅ script.run({ timeout }) | ✅ worker.terminate() | ✅ process.kill |
| native binding 격리 | ❌ Isolate 내 native call 불가 | ❌ 같은 process 공유 | ✅ 완전 분리 |
| FD/socket 격리 | ✅ Isolate 내 fetch 등 wrap | ❌ 공유 | ✅ 완전 분리 |
| 비용 (생성 시간) | ~1ms (spike-012 cold start p95 0.909ms) | ~10~30ms | ~50~200ms |
| 비용 (메모리) | ~1MB/Isolate | ~5~20MB/worker | ~30~50MB/process |

→ ADR-028 §8 "3중 격리"의 정당성: **process(PM2) > thread(worker) > isolate(isolated-vm)** 각 층마다 다른 위협 모델 방어.

### 3.2 Per-tenant concurrency cap 구현 패턴

worker_threads 자체에는 "tenant별 cap" 개념이 없다. **main thread의 dispatcher가 게이트키퍼 역할**을 해야 한다.

```typescript
// src/lib/cron/worker-pool.ts (sketch — 실 구현 X)
import { Worker } from "node:worker_threads";

interface TenantCronPolicy {
  maxConcurrentJobs: number;       // 기본 3, FREE 1, PRO 5
  jobTimeoutMs: number;             // 기본 30_000
  jobMemoryLimitMb: number;         // 기본 128
  consecutiveFailureThreshold: number;
  allowedFetchHosts: string[];
}

class TenantWorkerPool {
  private inFlight = new Map<string, number>();   // tenantId → 현재 실행 수
  private policies = new Map<string, TenantCronPolicy>();
  private readonly poolSize = 8;
  private idleWorkers: Worker[] = [];

  async dispatch(job: CronJob, tenantId: string): Promise<DispatchResult> {
    const policy = this.policies.get(tenantId) ?? DEFAULT_POLICY;

    // Q1 답: main thread Map으로 cap 강제
    const current = this.inFlight.get(tenantId) ?? 0;
    if (current >= policy.maxConcurrentJobs) {
      // skip + audit (ADR-021 cross-cutting)
      await audit("cron.skip.concurrency-cap", { tenantId, jobId: job.id });
      return { status: "skipped", reason: "tenant cap" };
    }

    this.inFlight.set(tenantId, current + 1);
    try {
      return await this.runInWorker(job, policy);
    } finally {
      const after = (this.inFlight.get(tenantId) ?? 1) - 1;
      if (after <= 0) this.inFlight.delete(tenantId);
      else this.inFlight.set(tenantId, after);
    }
  }

  private async runInWorker(job: CronJob, policy: TenantCronPolicy): Promise<DispatchResult> {
    // Q3 답: resourceLimits로 약한 메모리 격리
    const worker = new Worker(WORKER_SCRIPT_PATH, {
      resourceLimits: {
        maxOldGenerationSizeMb: policy.jobMemoryLimitMb,
        maxYoungGenerationSizeMb: Math.floor(policy.jobMemoryLimitMb / 4),
      },
      workerData: {
        job: { id: job.id, kind: job.kind, payload: job.payload },
        policy: {
          jobTimeoutMs: policy.jobTimeoutMs,
          allowedFetchHosts: policy.allowedFetchHosts,
        },
      },
    });

    // Q2 답: setTimeout + worker.terminate()
    return new Promise((resolve, reject) => {
      const hardTimeout = setTimeout(() => {
        // 1차: 우아한 종료 시도
        worker.postMessage({ type: "shutdown" });
        // 2차: grace 5s 후 강제
        setTimeout(() => void worker.terminate(), 5_000);
        reject(new Error(`timeout after ${policy.jobTimeoutMs}ms`));
      }, policy.jobTimeoutMs);

      worker.once("message", (result) => {
        clearTimeout(hardTimeout);
        void worker.terminate();          // 항상 정리 (재사용 X — 격리 강화 우선)
        resolve(result);
      });
      worker.once("error", (err) => {
        clearTimeout(hardTimeout);
        void worker.terminate();
        reject(err);
      });
      worker.once("exit", (code) => {
        clearTimeout(hardTimeout);
        if (code !== 0) reject(new Error(`worker exited ${code}`));
      });
    });
  }
}
```

#### Worker 풀링 전략 비교

| 전략 | 장점 | 단점 | 권고 |
|---|---|---|---|
| **per-job worker** (위 코드) | 완전 격리, 상태 누수 zero | 생성 비용 ~10~30ms × 200 jobs/min = ~6s overhead/min | Phase 1 (간단함) |
| **fixed pool reuse** (Node 공식 예제) | 생성 비용 amortize | worker 내부 상태 누수 위험 (글로벌 변수, fd) | Phase 2 (성능 임계 시) |
| **per-tenant pool** | tenant 격리 + reuse | 메모리 폭발 (20 tenant × 4 worker = 80) | 거부 |

→ **권고**: Phase 1 = per-job worker (옵션 D 시작). N=20 tenant × 분당 ~5 jobs = 100/min × 30ms = 3s/min overhead. 충분히 수용 가능.

### 3.3 SIGTERM/terminate 차이 (Q2 상세)

worker_threads는 `SIGKILL` 등가지만 process signal과 다르다:

| 동작 | 효과 | 사용 |
|---|---|---|
| `worker.postMessage({ type: 'shutdown' })` | worker 측에서 message 핸들러로 받아 자체 cleanup 후 `parentPort.close()` 또는 `process.exit(0)` | **1차 — 우아한 종료** |
| `worker.terminate()` | 즉시 강제 종료. JS 실행 중간이라도 중단. 단 native binding 실행 중이면 native 함수 반환 후 종료 | **2차 — grace 만료 후** |
| `process.exit()` (worker 내부) | worker만 종료, main 영향 없음 | worker 자체 cleanup 후 |

**중요한 함정**: `worker.terminate()`는 native module의 cleanup callback을 부르지 않는다. 예: better-sqlite3 connection은 process exit handler에서만 정리됨. → **worker thread에서 DB connection을 잡으면 위험**. 12.1 §Risk-1 참조.

권고 패턴 (graceful shutdown):
```typescript
// worker side (worker-script.ts — sketch)
parentPort.on("message", async (msg) => {
  if (msg.type === "shutdown") {
    // 진행 중 작업 중단 신호 (AbortController.abort())
    abortController.abort();
    // grace 동안 in-flight 종료 대기
    await Promise.race([
      currentJob,
      new Promise(r => setTimeout(r, 4_000)),
    ]);
    parentPort.close();
  }
});
```

### 3.4 Memory limit의 실제 강제 정도 (Q3 상세)

`resourceLimits.maxOldGenerationSizeMb = 128` 설정 시:

| 시나리오 | 강제 가능? | 비고 |
|---|---|---|
| JS heap (Array, Object) 누수 | ✅ V8가 OOM 발생 → worker `'exit'` event (code != 0) | 가장 흔한 케이스 |
| Buffer (allocUnsafeSlow 외) | ✅ external memory도 V8 GC 추적 (Node 18+ 개선) | OK |
| native module 내 alloc (예: bcrypt) | ❌ V8 외부 → 추적 불가 | **위험** |
| FFI ArrayBuffer (transferred) | ⚠️ 부분적 | 주의 |

**결론**: Q3 답 — "약한 격리만 가능". JS-heavy 코드에는 충분, native-heavy 코드에는 부족.

→ **운영 권고**: cron job이 native module heavy (e.g., 이미지 처리)면 process-level 격리 (옵션 B의 Redis worker process or 별도 PM2 process) 별도 검토 필요. 본 시스템 cron 3 kind (SQL/FUNCTION/WEBHOOK)는 모두 JS-heavy or 외부 위임 → worker_threads로 충분.

### 3.5 Circuit breaker 패턴 (Q4 상세)

worker_threads와 무관한 **dispatcher-level** 패턴. 표준 Hystrix/Polly 패턴 그대로 적용.

```typescript
// src/lib/cron/circuit-breaker.ts (sketch)
type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitStatus {
  state: CircuitState;
  consecutiveFailures: number;
  openedAt: Date | null;
}

const COOLDOWN_MS = 5 * 60_000;  // 5분
const FAILURE_THRESHOLD = 5;

async function shouldDispatch(jobId: string): Promise<boolean> {
  const c = await prisma.cronJob.findUnique({
    where: { id: jobId },
    select: { circuitState: true, circuitOpenedAt: true, consecutiveFailures: true },
  });
  if (!c) return false;

  if (c.circuitState === "OPEN") {
    const elapsed = Date.now() - (c.circuitOpenedAt?.getTime() ?? 0);
    if (elapsed < COOLDOWN_MS) {
      await audit("cron.skip.circuit-open", { jobId });
      return false;
    }
    // cooldown 경과 → HALF_OPEN 1회 시도 허용
    await prisma.cronJob.update({
      where: { id: jobId },
      data: { circuitState: "HALF_OPEN" },
    });
  }
  return true;
}

async function recordResult(jobId: string, success: boolean): Promise<void> {
  if (success) {
    await prisma.cronJob.update({
      where: { id: jobId },
      data: { circuitState: "CLOSED", consecutiveFailures: 0, circuitOpenedAt: null },
    });
    return;
  }
  // 실패 — 카운터 증가
  const updated = await prisma.cronJob.update({
    where: { id: jobId },
    data: { consecutiveFailures: { increment: 1 } },
    select: { consecutiveFailures: true },
  });
  if (updated.consecutiveFailures >= FAILURE_THRESHOLD) {
    await prisma.cronJob.update({
      where: { id: jobId },
      data: { circuitState: "OPEN", circuitOpenedAt: new Date() },
    });
    await audit("cron.circuit.opened", { jobId, failures: updated.consecutiveFailures });
  }
}
```

#### Schema 추가 사항 (Prisma)

```prisma
model CronJob {
  // ... 기존 필드
  consecutiveFailures Int      @default(0)
  circuitState        String   @default("CLOSED")  // CLOSED | OPEN | HALF_OPEN
  circuitOpenedAt     DateTime?
  lastSuccessAt       DateTime?
}
```

→ migration 비용: 1개 (Phase 1 자체 마이그레이션 1번).

### 3.6 pg-boss와의 결합 (Q5 상세)

**오해 방지**: pg-boss는 polling-based **queue**다. **worker pool이 아니다**.

#### pg-boss 책임 vs worker_threads 책임

| 책임 | pg-boss | worker_threads pool |
|---|---|---|
| 분산 lock (cluster:4 dedupe) | ✅ `SELECT ... FOR UPDATE SKIP LOCKED` | ❌ |
| Retry with backoff | ✅ `retryLimit`, `retryDelay` | ❌ (자체 구현 필요) |
| DLQ (dead letter queue) | ✅ `archive` schema 자동 | ❌ |
| Scheduled jobs (cron-like) | ✅ `boss.schedule()` | ❌ |
| Per-job timeout | ✅ `expireInSeconds` (자동 stall→retry) | ✅ `worker.terminate()` |
| **실행 격리** | ❌ handler는 main process | ✅ worker thread |
| Memory limit per job | ❌ | ✅ `resourceLimits` |
| Concurrency cap | ✅ queue별 `teamConcurrency` | ✅ in-flight Map |

→ **결론**: pg-boss와 worker_threads는 **책임이 직교**. ADR-028 §6.3 마지막 줄 "옵션 C + worker_threads 결합 변종도 고려"가 정확.

#### 옵션 D → 옵션 C 진화 시 결합 패턴 (sketch)

```typescript
// Phase 3 (queue 도입 시)
const boss = new PgBoss({ connectionString: DATABASE_URL });
await boss.start();

// scheduler tick (1개 PM2 worker만 leader, advisory lock으로 election)
await boss.work("cron-jobs",
  { teamSize: 8, teamConcurrency: 1 },     // queue concurrency
  async (jobs) => {
    // pg-boss handler 안에서 worker_threads 격리 추가
    const job = jobs[0];
    return await tenantWorkerPool.dispatch(job.data.job, job.data.tenantId);
  }
);

// scheduler가 due jobs를 enqueue
async function enqueueDue() {
  const dueJobs = await findDueJobs();
  for (const j of dueJobs) {
    await boss.send("cron-jobs", { job: j, tenantId: j.tenantId }, {
      singletonKey: `${j.tenantId}:${j.id}:${currentMinute()}`,  // 분 단위 dedupe
      expireInSeconds: 300,
      retryLimit: 3,
      retryBackoff: true,
    });
  }
}
```

→ **점진 마이그레이션 가능**: Phase 1에서 만든 `TenantWorkerPool`은 Phase 3에서 그대로 재사용 (handler 내부에서 호출).

### 3.7 spike-010 advisory lock과의 호환성 (Q6 상세)

#### 핵심 함정: lock holder는 어느 thread여야 하는가?

PG advisory lock은 **PostgreSQL connection** 단위로 잡힌다. 따라서:

- `pg_try_advisory_lock(key)` 호출한 connection이 닫히면 lock 자동 해제.
- worker thread가 자신의 connection으로 lock을 잡고, 작업 중 main이 `worker.terminate()` 하면? → worker가 죽으면서 connection도 죽음 → lock 해제됨. 하지만 이 시점에 다른 worker가 lock을 가져가서 **중복 실행** 가능.

**권고 패턴** (안전):

```
main thread: advisory lock 획득
  └─ dispatch to worker (workerData에 jobId만 전달)
       └─ worker: 작업만 수행 (DB connection 새로 만들지 X, RPC로 main에 위임)
  └─ worker 완료/timeout
  └─ main thread: advisory lock 해제
```

이렇게 하면:
- lock holder = main thread connection → worker terminate에도 lock 유지
- worker는 격리된 코드만 실행, DB는 main thread가 담당
- 격리는 약간 약화 (worker가 직접 DB 접근 못함) but lock 안전성 우위

**대안 패턴** (격리 우선, lock 위험 감수):
- worker thread가 자체 connection으로 lock 획득
- worker terminate 시 lock 해제 → 즉시 다음 tick에서 재실행 가능 (어차피 timeout=실패였으니 retry 의도)
- **단** 실패한 job이 transactional side effect를 남겼다면 중복 실행 위험

→ **본 시스템 권고**: **lock holder = main thread**. ADR-028 §12.1 Risk-1과도 정합 ("worker_thread는 Prisma client 새로 생성하지 말고 main thread에 RPC 위임").

#### Lock key 분리 (spike-010 §5.2 전략 1 채택)

```typescript
// src/lib/cron/lock.ts
import { createHash } from "node:crypto";

export function tenantJobLockKey(tenantId: string, jobId: string): bigint {
  const h = createHash("sha256").update(`tenant:${tenantId}:job:${jobId}`).digest();
  // 첫 8 bytes를 BIGINT로
  return h.readBigInt64BE(0);
}
```

→ 충돌 위험: 64bit hash, 200 jobs × 1.5 cluster worker = 300 entry, 충돌 확률 ~10⁻¹⁵ (무시 가능).

#### cluster:4 + worker_threads pool 시뮬레이션

```
[PM2 worker 0]  scheduler tick → for each due job: try advisory_lock
[PM2 worker 1]  scheduler tick → for each due job: try advisory_lock
[PM2 worker 2]  scheduler tick → for each due job: try advisory_lock  ← 1명 winner
[PM2 worker 3]  scheduler tick → for each due job: try advisory_lock

winner (예: worker 2):
  ├─ TenantWorkerPool.dispatch(job, tenantId)
  │    └─ worker_thread 8개 풀에서 1개 슬롯 점유
  │    └─ resourceLimits 적용 + timeout
  ├─ 결과 받음
  └─ pg_advisory_unlock(key)
```

→ ADR-028 §5.3 도식 그대로. **호환 ✅**.

---

## 4. 한계점 (정직한 fail mode 목록)

본 spike가 **다루지 않은 / 다룰 수 없는** 한계:

### 4.1 worker_threads의 본질적 한계
- **process OOM = 모두 죽음**: 한 worker가 native heap leak 시 process 전체 죽음. PM2 cluster:4가 부분 완화 (1/4 worker만 영향).
- **native binding race**: bcrypt, argon2 등을 여러 worker가 동시 사용 시 (특히 single-threaded native lib) race condition 위험. 라이브러리별 thread-safety 문서 확인 필수.
- **WebAssembly 공유**: 현 시스템 미사용. 향후 도입 시 재검토.

### 4.2 본 spike에서 검증 안 한 사항
- **부하 테스트**: N=10 tenant × 5 cron 동시 실행 시 실측 latency, throughput, memory profile. **PoC 단계 필수**.
- **graceful shutdown 검증**: PM2 reload 시 in-flight job 처리 동작. ADR-028 §12.3 Open Question.
- **Prisma client per-worker connection 압박**: 8 worker × 5 conn = 40 conn vs PG max_connections (기본 100). ADR-028 §12.1.
- **pg-boss 자체의 부하 한계**: 옵션 C 선택 시 별도 spike-baas-003 권고.
- **isolated-vm v6와의 cold start 누적 효과**: spike-012는 cold start만 검증. worker_thread → isolated-vm Isolate 생성까지 이중 비용.

### 4.3 의도적 단순화
- per-job worker 모델 채택 시 worker reuse 안 함. 이는 격리 강화 우선의 결정. 처리량 임계 도달 시 fixed pool reuse로 전환 가능 (격리 트레이드오프).

---

## 5. 권고

### 5.1 ADR-028 §10 옵션 평가 (본 spike 기반)

| 옵션 | 본 spike 결론 | 권고도 |
|---|---|---|
| A (worker_threads 자체) | 기술적으로 가능. 단 retry/DLQ/scheduled jobs 자체 구현 부담 80~120h | ⭐⭐ |
| C (pg-boss 즉시) | 가능. 단 실행 격리 위해 worker_threads 결합 필수 (위 §3.6) | ⭐⭐⭐ |
| **D (하이브리드)** | **본 spike가 권고**. Phase 1 자체 worker_threads pool로 시작, Phase 3 pg-boss 추가 | ⭐⭐⭐⭐⭐ |
| B (BullMQ + Redis) | 본 spike 범위 외 (ADR-002 위반으로 ADR-028이 거부 권고) | ⭐ |

### 5.2 옵션 D 채택 시 구현 우선순위

**Phase 1 (즉시, ~40h 예상)**:
1. `src/lib/cron/policy.ts` — `TenantCronPolicy` 타입 + DB 로드/캐시
2. `src/lib/cron/worker-pool.ts` — `TenantWorkerPool` 클래스 (per-job worker 모델)
3. `src/lib/cron/circuit-breaker.ts` — CLOSED/OPEN/HALF_OPEN
4. `src/lib/cron/lock.ts` — `tenantJobLockKey()` (spike-010 §5.2 전략 1)
5. `src/lib/cron/registry.ts` 리팩토링 — `Map<tenantId, RegistryState>`로 변경, dispatch는 worker pool로 위임
6. Prisma migration — `CronJob.tenantId`, `consecutiveFailures`, `circuitState`, `circuitOpenedAt`
7. 테스트 — TDD로 dispatcher 단위 테스트 (특히 cap/timeout/circuit 분기)

**Phase 2 (advisory lock 분리, ~10h)**:
- 기존 단일 lock key 사용처 (현재 `runner.ts`에는 advisory lock 미적용 — spike-010이 권고만 했음) → 새 dispatcher에 lock 통합

**Phase 3 (pg-boss 도입, ~30h, N≥10 tenant 또는 200 jobs/min 임계 시)**:
- `pg-boss` 의존성 추가 (ADR-002 + amendment 필요)
- scheduler가 due jobs를 `boss.send()` 로 enqueue
- handler 내부에서 `TenantWorkerPool.dispatch()` 호출 (Phase 1 코드 재사용)

### 5.3 즉시 적용 권고 (옵션 결정과 무관하게)

본 spike 분석 중 발견된 **현재 코드의 명백한 결함** — ADR-028 결정 전이라도 fix 권고:

1. **`runner.ts:72` WEBHOOK timeout 미적용**: `fetch()` 호출에 AbortController 없음. 60초+ hang 가능.
   ```typescript
   // 현재 (위험)
   const res = await fetch(hook.url, { method: "POST", headers, body: ... });

   // 권고 (즉시 적용 가능)
   const ac = new AbortController();
   const t = setTimeout(() => ac.abort(), 30_000);
   try {
     const res = await fetch(hook.url, { method: "POST", headers, body: ..., signal: ac.signal });
     // ...
   } finally {
     clearTimeout(t);
   }
   ```

2. **`registry.ts:135` 에러 무시**: `runJob` catch 블록이 `// 무시`. 실패 원인 추적 불가. 최소 audit 권고.

3. **`runner.ts:21` `DEFAULT_ALLOWED_FETCH` 하드코딩**: 멀티테넌트 전환 시 tenant policy로 이동 (Phase 1 §6.1).

→ 이 3개는 별도 minor patch PR로 본 ADR 결정 전 처리 가능.

### 5.4 강한 격리가 필요한 경우 (참고)

ADR-028 결정 후에도 **신뢰할 수 없는 코드 실행**이 필요하면 (예: 사용자 작성 EdgeFunction):
- worker_thread 격리 → **불충분** (위 §3.1)
- isolated-vm v6 (ADR-009 L1) → **충분** (이미 결정됨, spike-012 검증)
- 본 worker pool과 isolated-vm은 **3중 격리**의 다른 층 (ADR-028 §8.2)

---

## 6. PoC 코드 sketch (실 구현 X)

### 6.1 디렉터리 구조 (옵션 D Phase 1)

```
src/lib/cron/
├── registry.ts        ← 기존 — Map<tenantId, RegistryState>로 리팩토링
├── runner.ts          ← 기존 — dispatchCron 단일 책임만 유지
├── policy.ts          ← NEW — TenantCronPolicy 로드/캐시
├── worker-pool.ts     ← NEW — TenantWorkerPool 클래스
├── worker-script.ts   ← NEW — worker thread entry point
├── circuit-breaker.ts ← NEW — shouldDispatch / recordResult
├── lock.ts            ← NEW — tenantJobLockKey + with-lock helper
└── audit.ts           ← NEW — 6종 cron 이벤트 (ADR-029 연계)
```

### 6.2 `worker-script.ts` 예시 (sketch)

```typescript
// src/lib/cron/worker-script.ts (sketch — 실 구현 X)
import { parentPort, workerData } from "node:worker_threads";

interface WorkerInput {
  job: { id: string; kind: string; payload: unknown };
  policy: { jobTimeoutMs: number; allowedFetchHosts: string[] };
}

const { job, policy } = workerData as WorkerInput;
const abortController = new AbortController();

parentPort?.on("message", (msg) => {
  if (msg.type === "shutdown") abortController.abort();
});

(async () => {
  try {
    let result;
    if (job.kind === "WEBHOOK") {
      result = await runWebhookInWorker(job.payload, policy.allowedFetchHosts, abortController.signal);
    } else if (job.kind === "FUNCTION") {
      // isolated-vm v6 Isolate 생성은 main에서 (spike-012 cold start 비용 분담)
      // 또는 worker 내에서 spawn — 트레이드오프 별도 검토
      result = await runFunctionInWorker(job.payload, policy);
    } else if (job.kind === "SQL") {
      // SQL은 main에서 RPC 위임 권고 (advisory lock + connection pool 안정성)
      throw new Error("SQL kind은 main thread에서 처리");
    }
    parentPort?.postMessage({ status: "SUCCESS", result });
  } catch (err) {
    parentPort?.postMessage({
      status: "FAILURE",
      message: err instanceof Error ? err.message : String(err),
    });
  }
})();
```

### 6.3 dispatcher 통합 (sketch)

```typescript
// src/lib/cron/registry.ts (리팩토링 sketch)
async function tick(): Promise<void> {
  const s = state();
  const now = new Date();
  const minuteKey = Math.floor(now.getTime() / 60_000);

  // 1. PM2 cluster leader election (옵션)
  const isLeader = await tryAdvisoryLock(SCHEDULER_LEADER_KEY);
  if (!isLeader) return;

  try {
    for (const job of s.jobs.values()) {
      // 2. dedup (분 단위)
      if (s.lastTickMinute.get(job.id) === minuteKey) continue;
      if (!matchesSchedule(job.schedule, now)) continue;
      s.lastTickMinute.set(job.id, minuteKey);

      // 3. circuit breaker check
      if (!await shouldDispatch(job.id)) continue;

      // 4. per-job advisory lock (multi-tenant)
      const lockKey = tenantJobLockKey(job.tenantId, job.id);
      const got = await tryAdvisoryLock(lockKey);
      if (!got) continue;

      // 5. dispatch (fire-and-forget but tracked)
      void tenantWorkerPool.dispatch(job, job.tenantId)
        .then((r) => recordResult(job.id, r.status === "SUCCESS"))
        .finally(() => releaseLock(lockKey));
    }
  } finally {
    await releaseLock(SCHEDULER_LEADER_KEY);
  }
}
```

→ **실 구현 X** — ADR-028 결정 후 별도 PR.

---

## 7. 다음 단계

본 spike 결론을 받아 **ADR-028 §10 결정자(프로젝트 오너)** 가 다음을 수행:

- [ ] **결정**: 옵션 A/B/C/D/E 중 1개 선택, ADR-028 §10에 결정 + 근거 기재
- [ ] **결정이 D인 경우** (본 spike 권고):
  - [ ] ADR-005 amendment 작성 (node-cron singleton → worker pool)
  - [ ] ADR-015 amendment 작성 (advisory lock key 분리, spike-010 §5.2 전략 1)
  - [ ] ADR-024 합의 (TenantCronPolicy.allowedFetchHosts 스키마)
  - [ ] ADR-029 작성 (cron audit 6종 이벤트)
  - [ ] **PoC 작성 (3일)**: §6.1 구조 + Almanac cron 5개를 worker pool로 실행
  - [ ] **부하 테스트**: N=10 tenant × 5 cron 동시 실행, latency/throughput/memory 측정
  - [ ] 테스트 결과 → ADR-028 §10에 부록 추가
- [ ] **결정이 C인 경우**:
  - [ ] **선행 spike-baas-003** 권고: pg-boss 자체 검증 (singletonKey, retry, expireInSeconds 동작 확인)
  - [ ] 위 §3.6 결합 패턴대로 PoC

본 spike와 무관하게:
- [ ] **즉시 minor patch**: WEBHOOK fetch timeout 추가 (§5.3 #1)
- [ ] **즉시 minor patch**: registry.ts 에러 audit 추가 (§5.3 #2)

---

## 8. References

### 8.1 내부 참조

- ADR-028 (본 spike의 직접 모) — `docs/research/baas-foundation/01-adrs/ADR-028-cron-worker-pool-and-per-tenant-isolation.md`
- spike-010 (PM2 cluster:4 + advisory lock) — `docs/research/spikes/spike-010-pm2-cluster-result.md` §4, §5.2
- spike-012 (isolated-vm v6 Node 24 검증) — `docs/research/spikes/spike-012-isolated-vm-v6-result.md`
- ADR-009 (Edge Functions 3층 하이브리드, isolated-vm L1)
- ADR-015 (PM2 cluster:4 + advisory lock)
- ADR-022 (1인-N프로젝트 BaaS 정체성)
- 현재 코드 — `src/lib/cron/registry.ts`, `src/lib/cron/runner.ts`
- isolated runner — `src/lib/runner/isolated.ts`

### 8.2 외부 참조

- Node.js `worker_threads` 공식 문서 — https://nodejs.org/api/worker_threads.html
  - 특히 `new Worker(filename, options)` §`resourceLimits`, `worker.terminate()`, `parentPort`
- pg-boss GitHub — https://github.com/timgit/pg-boss
  - 특히 README §"Concurrency", §"Singleton jobs", §"Scheduling"
- PostgreSQL Advisory Locks — https://www.postgresql.org/docs/16/explicit-locking.html#ADVISORY-LOCKS
- isolated-vm v6 — https://www.npmjs.com/package/isolated-vm

### 8.3 Compound Knowledge 후보

본 spike에서 도출된, 향후 재사용 가능한 일반화 지식:

1. **"worker_threads ≠ V8 isolate"**: 격리 정도는 isolated-vm < worker_thread < process. 신뢰할 수 없는 코드는 isolated-vm 필수.
2. **"advisory lock holder는 안정적인 thread/connection"**: worker thread에서 lock 잡으면 worker 죽을 때 lock 풀려 중복 실행 위험.
3. **"pg-boss는 queue, worker pool 아님"**: 실행 격리(메모리/timeout)는 별도 메커니즘 필요. 두 책임 분리.

→ `docs/solutions/2026-04-26-worker-threads-isolation-limits.md` 작성 권고.

---

> Spike-BaaS-002 완료 · 판정: **옵션 D 권고** · 소요: 분석 ~3h · 2026-04-26
> 본 spike는 ADR-028 결정 입력. 결정 후 PoC는 별도 PR.
