# ADR-028 — Cron Worker Pool & Per-Tenant Isolation

- **상태**: PROPOSED · **결정**: ACCEPTED (2026-04-26, 옵션 D)
- **날짜**: 2026-04-26 (baas-foundation Wave, Sub-agent #6)
- **작성자**: Sub-agent #6 (ADR drafter)
- **결정 권한**: 프로젝트 오너 (smartkdy7@naver.com)
- **수정 보류 영역**: spike-010 advisory lock 결과 (PG `pg_try_advisory_lock`은 본 ADR에서도 옵션으로 유지)
- **상위 정렬**: ADR-022 (정체성 재정의 — 1인-N프로젝트 BaaS), ADR-024 (Plugin/도메인 코드 격리)
- **하위 영향**: ADR-005 amendment (node-cron 기반 → worker pool 확장), ADR-015 amendment (cluster:4 advisory lock key 분리), ADR-029 (per-tenant observability)

---

## 1. 컨텍스트 (Why now)

### 1.1 현재 구조의 한계

현재 cron 시스템은 단일 테넌트 가정에서 설계되었다 (`docs/research/baas-foundation/00-context/02-current-code-audit.md` §4):

```typescript
// src/lib/cron/registry.ts (요약)
declare global {
  var __cronRegistry: RegistryState | undefined;  // ← globalThis 싱글톤
}

interface RegistryState {
  jobs: Map<string, ScheduledJob>;       // ← tenantId 차원 없음
  lastTickMinute: Map<string, number>;
  running: Set<string>;
}

async function tick() {
  for (const job of s.jobs.values()) {
    if (!matchesSchedule(job.schedule, now)) continue;
    void runJob(job);   // ← fire-and-forget, 격리/timeout 없음
  }
}
```

`src/lib/cron/runner.ts`의 `dispatchCron()`은:

- SQL: `runReadonly(sql, [], { timeoutMs: 10_000 })` — 하드코딩 timeout, app_readonly 롤만 의존.
- FUNCTION: `runIsolatedFunction(fn.code, { timeoutMs: 30_000, allowedFetchHosts: ['api.github.com', 'stylelucky4u.com'] })` — **테넌트별 정책 분리 불가**, 화이트리스트 전역 상수.
- WEBHOOK: `fetch(hook.url, ...)` — timeout 없음, AbortController 미사용.

### 1.2 멀티테넌트 전환 시의 폭발적 부하

ADR-022 결정: **1인-N프로젝트(N=10~20) BaaS**. 각 테넌트가 5~10개 cron job을 운영하면:

- 동시 cron job 수: **50~200개**
- 1분 tick 당 실행 후보: 평균 5~10개 (실제 주기는 분산되지만 0분/15분/30분 같은 시각에 집중)
- **단일 프로세스 fire-and-forget**으로 처리 시:
  - 한 cron의 hang(예: SQL 90초 무한 루프, EdgeFunction 메모리 누수, Webhook 응답 지연 60초)이 **다른 cron 실행을 push back**
  - registry.ts의 `s.running` Set은 중복 방지만 할 뿐 동시성 cap 없음 → 모든 due job이 동시 실행 → Node 이벤트 루프 포화
  - 한 EdgeFunction 예외(unhandled rejection)가 프로세스 전체를 위험에 빠뜨림 (Node v18+ 정책상 termination 가능)

### 1.3 spike-010과의 정렬

spike-010 (PM2 cluster:4 검증, 2026-04-19) 결과:

- cluster:4 모드 +39.9% throughput (`docs/research/spikes/spike-010-pm2-cluster-result.md`)
- node-cron 중복 방지: PG `pg_try_advisory_lock(key)` (PG 12+ 공식 보증)
- **단일 lock key 가정**: `cleanup-sessions-job` 같은 고정 BIGINT
- 멀티테넌트로 전환 시: lock key를 어떻게 분리할 것인가? → 본 ADR이 답해야 할 질문 #1

### 1.4 ADR-002 호환 제약

ADR-002 (Yangpyeong 정체성, 2026-04-18 Wave 1):

> "Next.js 단일 앱 + 의존성 4~5개 추가만"
> "전체 스택 자체 호스팅 거부 — 핵심 OSS만 도입"

→ Redis 같은 **별도 인프라 도입에는 명시적 정당화 필요**.

---

## 2. 의사결정 과제 (Decision Question)

> **Q.** N=10~20 tenant × 5~10 cron = 50~200개 cron job을, 한 cron의 hang/exception이 다른 cron에 영향을 주지 않도록 격리하면서, advisory lock 중복 방지(spike-010)와 ADR-002 의존성 최소 원칙을 모두 충족하려면 어떤 worker pool 아키텍처를 채택해야 하는가?

세부 결정 항목:

1. **워커 모델**: 단일 프로세스 fire-and-forget (현재) / `node:worker_threads` pool / 외부 queue (BullMQ/Redis) / DB 기반 queue (pg-boss, graphile-worker) / 하이브리드
2. **Per-tenant isolation 메커니즘**: concurrency cap, timeout enforcement, memory limit, circuit breaker
3. **Advisory lock key 분리 전략**: `hash(jobId)` 단일 vs `hash(tenantId, jobId)` 복합
4. **EdgeFunction (isolated-vm v6) 통합 경로**: cron이 EdgeFunction을 호출할 때 isolation 계층이 어떻게 협력하는가
5. **마이그레이션 경로**: 기존 `src/lib/cron/registry.ts`에서 새 구조로의 점진적 전환

---

## 3. 옵션 매트릭스

### 옵션 A: `node:worker_threads` pool (자체 구현)

```
┌─────────────── main process ───────────────┐
│  scheduler (60s tick)                      │
│  ├── due jobs queue                        │
│  └── dispatcher                            │
│        ↓                                   │
│  worker pool (8 worker_threads)            │
│  ├── worker-0  [tenant A: job-1]           │
│  ├── worker-1  [tenant A: job-2]           │
│  ├── worker-2  [tenant B: job-1]           │
│  ├── ...                                   │
│  └── worker-7  [idle]                      │
└────────────────────────────────────────────┘
```

- **워커 수**: 고정 N (예: 8 = WSL2 4 vCPU × 2)
- **Per-tenant cap**: tenant당 동시 실행 ≤ M (예: 3)
- **Per-job timeout**: `worker.terminate()` 5초 후 강제 (worker_threads는 SIGKILL 등가)
- **장점**:
  - Node 표준, **외부 의존성 zero**
  - 단일 프로세스 내 격리 (process 분리보다 가벼움)
  - `resourceLimits.maxOldGenerationSizeMb` 로 worker별 heap cap
- **단점**:
  - **직접 구현 부담 大**: 우선순위 큐, retry, DLQ, 메트릭 수집, graceful shutdown, restart-on-crash 등 모두 자체 구현
  - DB transaction 통합 (Prisma client) 매 worker 별도 연결 → connection pool 압박 (8개 worker × 5 conn = 40 conn)
  - 처음 구현은 **80~120h** 추정 (BullMQ/pg-boss 도입 대비 4~6배)

### 옵션 B: BullMQ (Redis 기반 큐)

- Redis (또는 KeyDB) 도입 — **현 인프라에 없는 새 컴포넌트**
- BullMQ가 worker pool, retry, DLQ, rate limit, priority queue, repeatable jobs 모두 제공
- Bull Board / Arena 같은 **운영 대시보드 즉시 활용 가능**
- **장점**:
  - 검증된 라이브러리 (Sidekiq/Resque 패턴의 Node 포팅, GitHub 6.5k stars, 수많은 프로덕션 사례)
  - 풍부한 기능: per-queue concurrency, rate limiter, priority, delayed, retry with backoff, DLQ
  - 모니터링 UI 풍부
- **단점**:
  - **Redis 인프라 추가 필요** → ADR-002 "의존성 4~5개만" 원칙 명시적 위반
    - 현재 의존성: PostgreSQL, SQLite, Prisma, isolated-vm v6, jose, SeaweedFS — 이미 6개
  - WSL2에서 Redis 운영 = 추가 PM2 프로세스 + 메모리 ~80MB + persistence 설정
  - **장애 도메인 추가**: Redis crash 시 전체 cron stall (PG는 시스템 핵심이라 어차피 살아 있어야 함)
  - 1인 운영 부담 증가 (Redis 백업, 모니터링 별도)

### 옵션 C: PostgreSQL 기반 큐 (pg-boss / graphile-worker)

- 기존 PostgreSQL 활용, **외부 인프라 추가 없음**
- pg-boss: schema-managed (`pgboss.*` 테이블), `SELECT FOR UPDATE SKIP LOCKED` 패턴
- graphile-worker: 더 가볍고, LISTEN/NOTIFY로 실시간 dispatch
- **장점**:
  - 인프라 추가 zero — ADR-002 호환 ✅
  - **PG transaction 통합** — cron job과 비즈니스 로직을 하나의 트랜잭션으로 묶을 수 있음
  - advisory lock과 자연스럽게 공존 (둘 다 PG 기능)
  - retry, scheduled jobs, archive (DLQ 등가) 모두 라이브러리가 제공
  - 1인 운영 친화 (백업/모니터링 단일 PG)
- **단점**:
  - 처리량 한계: pg-boss ~1k jobs/sec, graphile-worker ~10k jobs/sec (Redis는 100k+) — **본 시스템 50~200 jobs/min에는 200× 여유**
  - DB 부하 증가 (큐 폴링 또는 LISTEN/NOTIFY) — 작은 부담
  - schema 추가 (`pgboss.*` 또는 `graphile_worker.*` 스키마) → multi-tenant schema-per-tenant 모델 (ADR-023)과 충돌 가능
    - **완화**: 큐 스키마는 `public` 또는 별도 `_system` 스키마에 두고, payload에 `tenantId` 포함

### 옵션 D: 하이브리드 (스케줄링 자체 + 실행 worker_threads)

- 옵션 A의 변종. 외부 라이브러리 zero에서 점진적 시작.
- **scheduler**: 현재 `registry.ts`의 60s tick + `matchesSchedule()` 유지
- **executor**: `node:worker_threads` pool (예: 8 worker)
- **upgrade path**: Phase N에서 옵션 C로 자연스럽게 전환 가능 (queue를 schedule layer 뒤에 삽입)
- **장점**:
  - **즉시 시작 가능** — 마이그레이션 비용 최소
  - 옵션 A의 격리 이점 + queue 미도입의 단순성
  - 처음 N=10까지는 충분한 처리량
- **단점**:
  - retry, DLQ는 자체 구현 (또는 cronJob 테이블에 컬럼 추가로 DB 기반 retry)
  - 처리량 확장 시 옵션 C로 옮겨야 함 (옵션 C 구조와 worker_threads 큐를 동시에 운영하는 경우 복잡도 증가)

### 옵션 E: 현재 유지 (no-op)

- registry.ts singleton + fire-and-forget 그대로
- **장점**: 변경 비용 zero
- **단점**: §1.2 한계 그대로 — **거부 권고**. 본 ADR의 목적과 정면 배치.

---

## 4. 비교 매트릭스

| 차원 | A worker_threads | B BullMQ (Redis) | C pg-boss/graphile | D 하이브리드 | E 현재 |
|---|---|---|---|---|---|
| 인프라 추가 | 없음 | **Redis 추가** | 없음 | 없음 | 없음 |
| 구현 부담 | 高 (80~120h) | 低 (20~30h) | 中 (40~60h) | 中 (40~60h) | 0h |
| Throughput (jobs/min) | 中 (~수천) | 매우 高 (~10k+) | 中 (~수천) | 中 (~수천) | 中 (제어 안됨) |
| Per-tenant 격리 | ✅ worker별 | ✅ queue별 | ✅ queue/policy별 | ✅ worker별 | ❌ |
| Per-job timeout | ✅ terminate | ✅ 라이브러리 | ✅ 라이브러리 | ✅ terminate | ⚠️ runReadonly만 |
| Memory limit | ✅ resourceLimits | ⚠️ Redis 외부 | ⚠️ DB 외부 | ✅ resourceLimits | ❌ |
| Circuit breaker | 자체 구현 | 자체 구현 | 자체 구현 | 자체 구현 | ❌ |
| 모니터링 UI | 자체 구현 | **Bull Board** | DB 쿼리/자체 UI | 자체 구현 | 자체 구현 |
| Advisory lock 호환 | ✅ (PG 별도) | ⚠️ Redis와 PG 중복 | ✅ 동일 PG | ✅ (PG 별도) | ✅ |
| ADR-002 호환 | ✅ | ❌ 위반 | ✅ | ✅ | ✅ |
| 장애 도메인 | 1 (Node) | 2 (Node + Redis) | 1 (Node + PG) | 1 (Node) | 1 |
| 1인 운영 적합 | △ (자체구현 부담) | △ (Redis 부담) | ✅ | ✅ | ❌ |
| 점진 마이그레이션 | △ | △ | ○ | ✅ | — |

---

## 5. spike-010 PM2 cluster:4 + advisory lock 와의 관계

### 5.1 현재 spike-010이 해결한 것

```typescript
// 단일 lock key 패턴 (spike-010 §4)
cron.schedule("0 * * * *", async () => {
  const lockKey = hashToBigInt("cleanup-sessions-job");  // ← 고정 BIGINT
  const r = await client.query("SELECT pg_try_advisory_lock($1) AS got", [lockKey]);
  if (!r.rows[0].got) return;
  await doCleanup();
});
```

cluster:4 환경에서 4개 worker가 동시에 같은 cron handler를 호출해도 **lock holder는 1명**. 다른 worker는 즉시 false 반환 후 종료. **검증 완료** (PG 12+ 공식 보증).

### 5.2 멀티테넌트로 확장 시 lock key 전략

**전략 1: 단순 복합 (권장)**
```typescript
// (tenantId, jobId) → BIGINT
const lockKey = hashToBigInt(`tenant:${tenantId}:job:${jobId}`);
```
- 동일 tenant 동일 job은 cluster 내 1개 worker만 실행
- 다른 tenant는 독립적으로 동시 실행 가능
- BIGINT 공간 충돌 위험: 64bit hash 충돌 ~2^32 entry에서 1% (현재 200 jobs × 1.5 cluster worker 충돌 = 무시 가능)

**전략 2: PG 2-key advisory lock**
```sql
SELECT pg_try_advisory_lock($1::int4, $2::int4)
-- $1 = tenantHash, $2 = jobHash
```
- PG가 두 int4를 받아 내부 합성. 충돌 더욱 낮음
- **단점**: BIGINT 단일보다 명시적이라 가독성 우위, 성능 차이 없음

**전략 3: PG row-level lock (advisory 대신)**
```sql
UPDATE cron_jobs SET locked_at = NOW(), locked_by = $worker
WHERE id = $jobId AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '5 min')
RETURNING id;
```
- transaction 보장, audit 가능
- **단점**: cron_jobs 테이블 hot path가 됨 (1분 tick × cluster 4 = 분당 240 UPDATE 시도)

→ **권고**: 전략 1 또는 2. 옵션 C/D 채택 시 pg-boss 등 라이브러리는 내부적으로 SKIP LOCKED 패턴 사용하므로 추가 advisory lock 불필요.

### 5.3 cluster:4 + worker_threads 결합 시

PM2 cluster:4 (Phase 16 발동 시) × Node 프로세스 내 worker_threads 8 = **총 32개 실행 슬롯**. spike-010이 검증한 cluster 격리 위에 worker_threads 격리가 한 층 더 쌓이는 구조.

- 4개 PM2 worker 모두 scheduler tick 실행 → 동일 (tenantId, jobId) 에 대해 advisory lock 시도
- lock 1개만 winner → 그 PM2 worker만 dispatch (나머지 3개는 즉시 false 반환)
- winner 내부 worker_thread pool (8개)에서 격리 실행

→ **호환 ✅**. 단 scheduler 자체의 부담은 4× (§12.6 Open Question 3 참조).

---

## 6. Per-tenant isolation 정책 (필수 정의)

### 6.1 정책 타입

```typescript
// src/lib/cron/policy.ts (new)
export interface TenantCronPolicy {
  /** 동시 실행 한도 (이 tenant 내에서) */
  maxConcurrentJobs: number;          // 기본 3, FREE 1, PRO 5

  /** 개별 job timeout (millis) */
  jobTimeoutMs: number;                // 기본 30_000, SQL 10_000

  /** worker thread heap 한도 (MB) */
  jobMemoryLimitMb: number;            // 기본 128, FREE 64

  /** 연속 실패 시 자동 비활성화 임계 */
  consecutiveFailureThreshold: number; // 기본 5

  /** 일일 tick 예산 (rate limit) */
  ticksPerDay: number;                 // 기본 1440 (분당 1회 × 24h), FREE 144

  /** Webhook fetch 화이트리스트 */
  allowedFetchHosts: string[];         // tenant DB 정책에서 로드

  /** Circuit breaker 상태 */
  circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';

  /** OPEN 상태 진입 시각 (cooldown 계산용) */
  circuitOpenedAt: Date | null;
}
```

### 6.2 정책 적용 흐름 (5단계)

`dispatchTenantJob(tenantId, job)`:

1. **Circuit breaker 체크** — `OPEN` 상태이고 cooldown(5분) 미경과 시 `audit('cron.skip.circuit-open')` 후 return. cooldown 경과 시 `HALF_OPEN` 으로 1회 시도 허용.
2. **Concurrency cap** — `countRunningJobs(tenantId) >= maxConcurrentJobs` 면 `audit('cron.skip.concurrency-cap')` 후 return.
3. **Daily budget** — `countTicksToday(tenantId) >= ticksPerDay` 면 `audit('cron.skip.budget')` 후 return.
4. **Dispatch** — `runOnWorker(job, { timeoutMs, memoryLimitMb, allowedFetchHosts })`.
5. **Circuit update** — 실패/타임아웃 시 `consecutiveFailures++`. 임계 도달하면 `OPEN` 진입 + `audit('cron.circuit.opened')`. 성공 시 카운터 reset, `HALF_OPEN` → `CLOSED` 복귀.

→ 모든 skip/transition은 audit_logs에 기록 (ADR-021 cross-cutting fail-soft 패턴).

### 6.3 격리 메커니즘 비교

| 메커니즘 | 옵션 A/D (worker_threads) | 옵션 C (pg-boss) | 옵션 B (BullMQ) |
|---|---|---|---|
| Concurrency cap | per-tenant Map<tenantId, runningCount> | queue per tenant + concurrency option | queue per tenant + concurrency option |
| Timeout enforcement | `worker.terminate()` 후 5s SIGKILL | `expireInSeconds` (자동 stall→retry) | `job.timeout` |
| Memory limit (heap) | `resourceLimits.maxOldGenerationSizeMb` | ❌ (DB에서 강제 불가, Node 외부) | ❌ (Redis 외부) |
| Circuit breaker | DB 컬럼 + custom logic | DB 컬럼 + custom logic | redis flag + custom logic |
| Audit hook | dispatcher에서 호출 | pg-boss event handler | bullmq event handler |

→ Memory limit은 옵션 A/D만이 강제 가능. 옵션 B/C는 worker process 내부에서 추가 격리 (예: 옵션 B + worker_threads 결합) 필요. 본 ADR 권고는 **옵션 C + worker_threads 결합** 변종도 고려 가능.

---

## 7. 기존 코드 마이그레이션 경로

### 7.1 단계별 전환 (옵션 D 기준, 옵션 C로 진화)

```
[Phase 0] 현재 (sub-agent 작성 시점)
  src/lib/cron/registry.ts  globalThis singleton
  src/lib/cron/runner.ts    fire-and-forget

[Phase 1] 격리 계층 도입 (옵션 D)
  + src/lib/cron/policy.ts          ← TenantCronPolicy 로드/저장
  + src/lib/cron/worker-pool.ts     ← node:worker_threads 8개 pool
  + src/lib/cron/circuit-breaker.ts ← OPEN/CLOSED/HALF_OPEN
  ~ src/lib/cron/registry.ts        ← Map<tenantId, RegistryState> 로 변경
  ~ src/lib/cron/runner.ts          ← dispatchTenantJob() 사용
  + prisma schema:
      - CronJob.tenantId String     ← FK to Tenant
      - CronJob.consecutiveFailures Int @default(0)
      - TenantCronPolicy 모델 신규

[Phase 2] Advisory lock 분리 (spike-010 확장)
  ~ src/lib/cron/lock.ts            ← hashToBigInt(`tenant:${t}:job:${j}`)
  + 마이그레이션: 기존 단일 lock key 사용처 → 새 키 변환

[Phase 3] queue 도입 (옵션 C, 처리량 임계 도달 시)
  + pg-boss 또는 graphile-worker 도입
  ~ scheduler는 due job을 queue에 enqueue
  ~ worker는 queue에서 dequeue + worker_threads 실행
  + DLQ, retry policy 라이브러리 활용

[Phase 4] 모니터링 / 운영 UI
  + /admin/cron/tenants 페이지 — tenant별 cron 상태
  + /admin/cron/circuits   — 회로 차단 상태
  + audit_logs 통합 (ADR-021 cross-cutting)
```

### 7.2 점진적 전환의 핵심 (역사 보존)

ADR-005 (node-cron + advisory lock)는 **deprecated 아님**:
- Phase 1~2: ADR-005 패턴 유지 + per-tenant 차원 추가 (amendment)
- Phase 3: ADR-005를 옵션 C가 supersede (new ADR로 명시)

`src/lib/cron/registry.ts`의 `matchesSchedule()` 등 cron 표현식 파싱은 **재사용**. globalThis singleton만 분해.

---

## 8. EdgeFunction (isolated-vm v6) 통합

### 8.1 현재 통합 (ADR-009 + spike-012)

```typescript
// src/lib/cron/runner.ts → kind === 'FUNCTION'
const result = await runIsolatedFunction(fn.code, {
  input: payload.input ?? null,
  timeoutMs: 30_000,
  allowedFetchHosts: DEFAULT_ALLOWED_FETCH,  // ← 전역 상수
});
```

`runIsolatedFunction` (`src/lib/runner/isolated.ts`) 내부에서 isolated-vm v6 Isolate 생성. ADR-009의 L1 layer.

### 8.2 멀티테넌트 + worker pool 통합 시

각 worker_thread가 kind별로 분기:
- `SQL` → `runReadonly()` (PG `app_readonly` 롤 + statement_timeout)
- `FUNCTION` → `runIsolatedFunction()` (isolated-vm v6 Isolate per call) + tenant policy 화이트리스트
- `WEBHOOK` → `fetch()` (AbortController + tenant `allowedFetchHosts`)

**3중 격리**:
1. **Process**: PM2 cluster (선택적, Phase 16+)
2. **Thread**: worker_thread per dispatch (옵션 A/D)
3. **V8 Isolate**: isolated-vm Isolate per FUNCTION (ADR-009 L1)

→ FUNCTION 실행 중 isolated-vm v6 timeout (Isolate `script.run({ timeout })`)이 1차, worker_thread `terminate()` 5초 후가 2차 (escape hatch). spike-012 결과 (cold start p95 0.909ms) 그대로 적용 가능.

### 8.3 fetch 화이트리스트 정책 분리

현재 `DEFAULT_ALLOWED_FETCH = ["api.github.com", "stylelucky4u.com"]` 하드코딩 → **per-tenant DB 정책으로 이동**:

```typescript
// TenantCronPolicy.allowedFetchHosts: string[]
// 또는 더 세밀하게:
// TenantNetworkPolicy 모델 (egress allowlist, denylist, SSRF 방지)
const policy = await loadTenantCronPolicy(tenantId);
await runIsolatedFunction(fn.code, {
  allowedFetchHosts: policy.allowedFetchHosts,
  ...
});
```

ADR-024 (Plugin/도메인 코드 격리)에서 정의될 EdgeFunction 테넌트 정책과 통합.

---

## 9. 권고안

### 9.1 1차 권고: **옵션 D → 옵션 C 단계적 전환** (저자 의견)

**Phase 1 (즉시, ~40h)**: 옵션 D = 자체 worker_threads pool + per-tenant policy.
- 외부 의존성 zero, ADR-002 호환
- spike-010 advisory lock 그대로 + key 분리만
- 기존 registry.ts/runner.ts 점진 리팩토링

**Phase 3 (N≥10 tenant 또는 200 jobs/min 초과 시, ~30h)**: 옵션 C = pg-boss 도입.
- 처리량 한계 도달 또는 retry/DLQ 자체 구현 부담 임계 도달 시
- worker_threads pool은 유지 (pg-boss handler 내부에서 격리)

### 9.2 2차 권고: **옵션 C 즉시 도입**

만약 자체 worker pool 구현 부담을 회피하고 싶다면:
- pg-boss를 처음부터 도입 — 외부 인프라 추가 zero
- worker_threads 격리는 pg-boss handler 내부에서 추가 (memory limit 강제 위해)
- 구현 부담 ~30h

### 9.3 거부: 옵션 B (BullMQ + Redis)

ADR-002 의존성 최소 원칙과 정면 충돌. 다음 조건 모두 충족 시에만 재검토:
- 처리량 > 10k jobs/min
- pg-boss/graphile-worker가 실측 부족
- 1인 운영자가 Redis 운영 학습 비용 수용

→ 본 시스템 (50~200 jobs/min)에는 **8~10× 과잉**.

### 9.4 거부: 옵션 E (현재 유지)

§1.2 한계가 multi-tenant 도입과 양립 불가능. 본 ADR 목적과 정면 배치.

---

## 10. 결정 (ACCEPTED 2026-04-26)

> **ACCEPTED (2026-04-26 세션 58): 옵션 D (하이브리드)**
>
> - **Phase 1**: 자체 `node:worker_threads` pool 구현 (~40h)
>   - per-tenant concurrency cap, jobTimeoutMs, jobMemoryLimitMb
>   - circuit breaker (consecutive_failures 카운터, 자동 비활성)
>   - lock holder = main thread (worker terminate 시 lock 자동 해제 함정 회피, spike-002 §3.6)
> - **Phase 3**: pg-boss 단계적 결합 (~30h, N≥10 tenant 임계 시)
>   - pg-boss = queue/lock/retry/DLQ 위임
>   - worker_threads pool = 실행 격리 유지
>
> **spike-baas-002 부수 발견 즉시 적용** (Phase 0 또는 Phase 1 초반):
> - `runner.ts:72` WEBHOOK fetch에 AbortController + AGGREGATOR_FETCH_TIMEOUT (60s 기본)
> - `registry.ts:135` runJob catch에 structured log (CK-38 audit silent failure 패턴 적용)
> - `runner.ts:21` DEFAULT_ALLOWED_FETCH 하드코딩 → tenant manifest의 allowedFetchHosts로 이전 (ADR-024 의존)
>
> **참조**: docs/research/baas-foundation/03-spikes/spike-baas-002-worker-pool-isolation.md

| 선택지 | 의미 | 예상 공수 | 권고도 |
|---|---|---|---|
| **A** | worker_threads pool 자체 구현 | 80~120h | ⭐⭐ |
| **B** | BullMQ + Redis | 20~30h | ⭐ (ADR-002 위반) |
| **C** | pg-boss 즉시 도입 | 30~40h | ⭐⭐⭐⭐ |
| **D** | 하이브리드 (옵션 D → 옵션 C 단계적) | 40h + 30h (later) | ⭐⭐⭐⭐⭐ |
| **E** | 현재 유지 | 0h | ❌ (multi-tenant 불가) |

---

## 11. 결정 시 즉시 발생하는 후속 ADR/amendment

### 11.1 결정이 D 또는 C일 경우 [ACTIVATED 2026-04-26 — 옵션 D 채택]

- **ADR-005 amendment**: node-cron singleton → worker pool 패턴 명시. "Phase 1 = 자체 worker_threads / Phase 3 = pg-boss" 또는 "처음부터 pg-boss" 명시.
- **ADR-015 amendment**: cluster:4 + advisory lock key를 `hash(tenantId, jobId)` 복합 키로 변경. spike-010 §5.2 전략 1 또는 2 채택.
- **ADR-024 (Plugin 격리, sub-agent #4)**: TenantCronPolicy.allowedFetchHosts 스키마 합의.
- **ADR-029 (Per-tenant Observability, sub-agent #7)**: cron audit 이벤트 6종 (`cron.dispatch`, `cron.complete`, `cron.timeout`, `cron.skip.circuit-open`, `cron.skip.concurrency-cap`, `cron.skip.budget`) 정의.

### 11.2 결정이 B일 경우

- **ADR-002 amendment**: "의존성 4~5개" 원칙에 Redis 추가 정당화 + 운영 비용 수치 명시.
- 위 11.1의 ADR-005, ADR-015, ADR-024, ADR-029 amendment도 모두 필요.

### 11.3 결정이 A일 경우

- ADR-005, ADR-015 amendment 위와 동일.
- 추가: queue 라이브러리를 도입하지 않음으로 인한 retry/DLQ 자체 구현 명세 (별도 ADR 또는 본 ADR §11에 부록 추가).

---

## 12. 위험 / 미해결 사항

### 12.1 Risk-1: worker_thread 내부 Prisma client 연결

8개 worker_thread × 5 conn = 40 conn. 현재 `DATABASE_POOL_MAX` 확인 필요. 옵션 A/D 채택 시 PG max_connections (기본 100) 압박 가능.
- **완화**: worker_thread는 Prisma client 새로 생성하지 말고 main thread에 RPC 위임 (worker는 격리된 코드만 실행, DB 작업은 main process에서) → 격리도 약화 가능
- **완화 2**: worker_thread당 connection 1개로 제한 (`?connection_limit=1`)

### 12.2 Risk-2: SQLite 동시 쓰기

`audit_logs`는 SQLite. 8 worker × 분당 다수 audit 이벤트. spike-010 §3에서 SQLITE_BUSY 0% 검증 (200 writes/s 부하). 본 시나리오 (max 50~200 events/min)는 문제 없을 것으로 추정.

### 12.3 Risk-3: graceful shutdown

PM2 reload 시 worker_thread를 안전하게 종료해야 함. 진행 중 cron job은:
- 옵션 A/D: `worker.terminate()` 즉시 (작업 손실 가능) vs 30초 grace
- 옵션 C: pg-boss는 자동으로 dequeue 중단, in-flight job 완료 대기

→ **권고**: 옵션 C가 graceful shutdown에서도 우위.

### 12.4 Open Question 1: SQL kind의 격리 수준

현재 `runReadonly()` (PG `app_readonly` 롤 + statement_timeout)가 1차 격리. worker_thread에서 실행해도 PG 부담은 그대로. **PG 측 connection limit per tenant** 별도 ADR 필요 (ADR-023 관련).

### 12.5 Open Question 2: WEBHOOK kind의 timeout

현재 코드 (`runner.ts:72`)에서 `fetch(hook.url, { method, headers, body })`에 timeout 없음. AbortController 미사용. **본 ADR과 별개로 fix 필요** (즉시 적용 가능한 minor patch).

### 12.6 Open Question 3: Tick 자체의 분산

현재 `setInterval(tick, 60_000)` — PM2 cluster:4면 4개 worker가 각자 tick. advisory lock으로 dispatch 충돌은 막지만, **scheduler 자체의 부담**은 4× 됨 (`prisma.cronJob.findMany` 4회/분). 본 ADR 결정 후 별도 ADR 또는 본 ADR §13 부록에서 "scheduler leader election" 다루어야 함 (예: `pg_advisory_lock("cron-scheduler-leader")`).

---

## 13. References

### 13.1 내부 참조

- `docs/research/baas-foundation/00-context/01-existing-decisions-audit.md` §1.6, §2 (멀티테넌트 영향)
- `docs/research/baas-foundation/00-context/02-current-code-audit.md` §4 (Cron 실행 모델)
- `docs/research/spikes/spike-010-pm2-cluster-result.md` §4 (advisory lock), §7 (운영 주의)
- `docs/research/spikes/spike-005-edge-functions.md` (worker_threads + isolated-vm 비교)
- `docs/research/spikes/spike-012-isolated-vm-v6-result.md` (isolated-vm v6 Node 24 검증)
- `docs/research/2026-04-supabase-parity/02-architecture/01-adr-log.md` ADR-005, ADR-009, ADR-015
- `src/lib/cron/registry.ts`, `src/lib/cron/runner.ts`
- `src/lib/runner/isolated.ts`

### 13.2 외부 참조

- BullMQ: https://docs.bullmq.io/
- pg-boss: https://github.com/timgit/pg-boss
- graphile-worker: https://github.com/graphile/worker
- Node `worker_threads`: https://nodejs.org/api/worker_threads.html
- isolated-vm v6: https://www.npmjs.com/package/isolated-vm
- PG `pg_try_advisory_lock`: https://www.postgresql.org/docs/16/explicit-locking.html#ADVISORY-LOCKS

### 13.3 Related ADRs

| ADR | 관계 | 영향 |
|---|---|---|
| ADR-002 | 의존성 최소 원칙 | 옵션 B 채택 시 amendment 필요 |
| ADR-005 | node-cron + wal-g | amendment 또는 supersede (결정에 따라) |
| ADR-009 | Edge Functions 3층 하이브리드 | L1 (isolated-vm) 통합 — §8 |
| ADR-015 | PM2 cluster:4 + advisory lock | amendment (key 분리) |
| ADR-021 | audit fail-soft | cron audit 6종 추가 (sub-agent #7 ADR-029와 연계) |
| ADR-022 | 1인-N프로젝트 BaaS 정체성 | 본 ADR의 전제 |
| ADR-023 | 데이터 격리 모델 | scheduler 스키마 위치 결정 |
| ADR-024 | Plugin/도메인 코드 격리 | TenantCronPolicy.allowedFetchHosts 합의 |
| ADR-029 | Per-tenant Observability | cron metric/log 차원 정의 |

---

## 14. 부록 — 구현 sketch 요약

### 14.1 옵션 D (worker_threads pool) 핵심 구조

```typescript
// src/lib/cron/worker-pool.ts (new)
const slots: WorkerSlot[] = [];          // 8개 fixed pool
const POOL_SIZE = 8;

// init: new Worker(runtime, { resourceLimits: { maxOldGenerationSizeMb: 128, ... } })
// runOnWorker(job, policy):
//   1) tenant concurrency cap 체크 (slots.filter(s => s.currentTenantId === t).length)
//   2) idle slot 선택 (없으면 throw 'no-idle-worker')
//   3) postMessage({ type:'run', job, policy }) + setTimeout(jobTimeoutMs)
//   4) timeout 시 'stop' message → 5s 후 worker.terminate() → 새 worker로 교체
```

→ 실 구현은 retry, metric emit, graceful shutdown (SIGTERM 시 in-flight 30s grace), restart-on-crash, Prisma client per-worker connection 1개 제한 추가 필요.

### 14.2 옵션 C (pg-boss) 핵심 구조

```typescript
// src/lib/cron/queue.ts (new)
const boss = new PgBoss({ connectionString, schema: 'pgboss' });
// boss.work('cron-jobs', { teamSize: 8, teamConcurrency: 1 }, handler)
//   → handler에서 loadTenantCronPolicy + runIsolatedDispatch (worker_thread로 격리)

// scheduler tick:
//   1) pg_try_advisory_lock('cron-scheduler-leader')  ← 단일 PM2 worker만 enqueue
//   2) due jobs → boss.send('cron-jobs', { tenantId, jobId },
//                          { singletonKey: `${t}:${j}:${minute}`, expireInSeconds: 300 })
//   3) pg_advisory_unlock
```

→ pg-boss `singletonKey` 가 분 단위 dedupe를 자동 처리. retry, DLQ, archive 모두 라이브러리 제공.

---

> **본 ADR은 ACCEPTED (2026-04-26 세션 58).** 옵션 D 채택. §1~§9는 historical context로 보존, §10에 결정+근거 추가됨. spike-baas-002 부수 발견 3건 즉시 적용 트리거.
