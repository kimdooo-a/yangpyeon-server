# 04 — ADR-025 (Single Instance + Abstraction Boundaries) Implementation Spec

> **출처**: ADR-025 (옵션 A ACCEPTED, 2026-04-26 세션 58) §5.2 코드 추상화 격리 경계 5종 즉시 도입.
> **위치**: Sub-wave A · Agent A5 산출물 (`04-architecture-wave/01-architecture/04-adr-025-impl-spec.md`).
> **포지션**: 본 spec 은 "Phase 1~3 동안 인프라 변경 0, 코드 격리 경계만 즉시 도입"의 구현 사양서.

---

## 1. 결정 요약

### 1.1 ADR-025 핵심 결정 (재확인, 본 spec 의 입력)

- **옵션 A 채택**: 단일 인스턴스 (WSL2 Ubuntu + PM2 fork + 단일 PostgreSQL + 단일 SQLite + 단일 SeaweedFS + 단일 Cloudflare Tunnel) — Phase 1~3 (N=1~5) 1차 배포 토폴로지.
- **옵션 D/B/C 진화 보류**: Phase 4+ (N=10 도달) 데이터 보고 트리거.
- **§5.2 코드 추상화 격리 경계 5종 즉시 도입**: tenant context / plugin 인터페이스 / cron worker pool 추상화 / `getPool(tenantId)` / observability tenantId 차원.

### 1.2 본 spec 의 두 가지 책임

본 문서는 다음 두 가지를 동시에 정의한다:

1. **1차 배포 토폴로지** (§2) — 옵션 A 의 Phase 1~3 운영 형태. ADR-020 standalone + rsync + pm2 reload 흐름 그대로.
2. **코드 추상화 격리 경계 5종** (§3) — 미래 옵션 D (worker pool tier) / 옵션 B (Tier 분리) / 옵션 C (per-consumer) 진화를 무비용으로 가능케 하는 인터페이스 계층.

### 1.3 결정 의미 (재확인)

옵션 A 채택은 **"단일 인스턴스 영구 락인"이 아니라 "코드 추상화 격리 경계의 하한"**. §3 의 5종 추상화가 Phase 1 에 도입되어야:

- **옵션 D**: cron/EdgeFunction 을 worker_threads 로 옮길 때 인터페이스 무수정.
- **옵션 B**: VIP tenant 를 별도 PM2 인스턴스로 분리할 때 plugin/manifest 만 라우팅.
- **옵션 C**: 특정 컨슈머만 별도 호스트로 분리할 때 standalone 패키지 구성 변경 없음.

추상화가 없으면 Phase 4+ 에서 옵션 D/B/C 진화 비용이 폭증한다. ADR-024 (plugin)/ADR-028 (cron worker pool)/ADR-029 (per-tenant observability) 가 본 spec 의 §3 인터페이스를 공유한다.

---

## 2. 1차 배포 토폴로지 (Phase 1~3)

### 2.1 인프라 변경 0 — 현재 운영 그대로

| 차원 | 현재 (Phase 1) | Phase 2 (N=2~3) | Phase 3 (N=4~5) |
|------|---------------|-----------------|-----------------|
| 호스트 | WSL2 Ubuntu (단일) | 동일 | 동일 |
| Node 프로세스 | PM2 fork × 1 (`ypserver`) | 동일 | 동일 |
| PostgreSQL | 단일 인스턴스 (port 5432) | 동일 | 동일 (connection pool 모니터링) |
| SQLite | `audit_logs` (drizzle) 1개 | 동일 | 동일 |
| SeaweedFS | 단일 마스터/볼륨 | 동일 | 동일 |
| Cloudflare Tunnel | 단일 hostname `stylelucky4u.com` | 동일 (path 기반 라우팅 ADR-027) | 동일 |
| PM2 cluster:4 진입 | ❌ (보류) | ❌ (SP-010 임계값 미도달) | ❌ (조건부 Go) |

**핵심**: 본 spec 채택으로 인프라 파일 변경 0. 추상화 코드만 추가.

### 2.2 ADR-020 호환 — standalone + rsync + pm2 reload 흐름 그대로

세션 56 운영 진화 반영 (`standalone/README.md` 시나리오 A/B/C):

```
[Windows src] →  scripts/wsl-build-deploy.sh (8단계 파이프라인)
              →  ADR-021 빌드 게이트 (drizzle migrate + verify-schema)
              →  rsync to /home/smart/ypserver
              →  pm2 reload ypserver
              →  헬스체크 4단계
```

본 spec §3 의 추상화 5종이 standalone 번들에 포함되어도 위 흐름은 변경 없음:

- TenantContext (AsyncLocalStorage) → `src/lib/tenant-context.ts` (새 파일, 80줄)
- Plugin 인터페이스 → `src/lib/plugin/registry.ts` (새 파일, 120줄)
- CronWorkerPool 추상화 → `src/lib/cron/worker-pool.ts` (새 파일, 200줄, 구현은 main thread fallback)
- `getPool(tenantId)` → `src/lib/db/pool-factory.ts` (새 파일, 60줄, 단일 PrismaClient 반환)
- ObservabilityCollector → `src/lib/obs/collector.ts` (새 파일, 150줄, ADR-029 amendment 통합)

**총 신규 코드**: ~610줄, 5개 파일. standalone 번들 크기 영향: < 0.1%.

### 2.3 SP-010 (PM2 cluster:4) 진입 보류 명시

SP-010 (세션 29, 2026-04-19) 결과:

- cluster:4 = 76,489 RPS (fork 54,692 RPS × 1.40)
- advisory lock 충돌 0건 (WAL 모드 SQLite)
- **판정**: 조건부 Go — Phase 16 (p95 200ms / CPU 70% / 503 0.1%) 도달 시 전환.

**Phase 1~3 동안**: fork 모드 유지. 본 spec §3 의 추상화는 cluster:4 전환과 독립 — cluster 워커 간에도 동일한 추상화 인터페이스가 작동한다 (워커 내부에 별도 TenantContext 인스턴스).

### 2.4 단일 PostgreSQL 운영 가드

ADR-025 §4.2 단일 DB 한계 완화책을 본 spec 에서 코드화:

| 한계 | 1차 가드 (Phase 1~3) | 진화 옵션 (Phase 4+) |
|------|---------------------|---------------------|
| connection pool 고갈 | `getPool(tenantId)` 인터페이스 도입 (단일 client 반환). tenant별 max_connections cap 추후. | pgbouncer transaction pool 또는 옵션 B-2 (DB 인스턴스 2개) |
| statement_timeout 차등 | `SET LOCAL statement_timeout` per request (TenantContext 에서 주입) | 옵션 D 워커별 prepared statement 정책 |
| autovacuum lag | 모니터링만 (ObservabilityCollector 에 PG slot lag 메트릭) | 옵션 B-2 분리 후 tenant별 autovacuum 설정 |
| WAL bloat (SP-013) | slot lag 알림 + 임계 초과 시 slot drop 매뉴얼 | 옵션 B-2 분리 후 slot 격리 |

---

## 3. 추상화 격리 경계 5종 (즉시 도입)

본 spec 의 핵심. 각 추상화는 **(a) 인터페이스 정의, (b) Phase 1~3 구현체, (c) Phase 4+ 진화 시 교체 지점** 3 항목으로 정형화.

### 3.1 TenantContext (AsyncLocalStorage 기반)

**책임**: 모든 요청 처리 경로에서 `tenantId` 를 자동 전파. 글로벌 state / 함수 시그니처 추가 없이 핸들러/서비스/repo 깊은 곳까지 도달.

**인터페이스**:

```typescript
// src/lib/tenant-context.ts
import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  readonly tenantId: string;
  readonly userId?: string;
  readonly requestId: string;
  readonly traceId?: string;
  readonly statementTimeoutMs?: number;  // PG SET LOCAL 주입용
}

const storage = new AsyncLocalStorage<TenantContext>();

export function runWithTenant<T>(ctx: TenantContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

export function getTenantContext(): TenantContext {
  const ctx = storage.getStore();
  if (!ctx) throw new TenantContextMissingError('TenantContext not active');
  return ctx;
}

export function tryGetTenantContext(): TenantContext | undefined {
  return storage.getStore();
}

export class TenantContextMissingError extends Error {}
```

**진입 지점**: Next.js middleware (ADR-027 router 결정에 따라 path 기반 / subdomain / JWT 추출):

```typescript
// src/middleware.ts (개념 sketch)
export async function middleware(req: NextRequest) {
  const tenantId = await resolveTenantFromRequest(req);  // ADR-027
  return runWithTenant(
    { tenantId, requestId: crypto.randomUUID(), userId: extractUserId(req) },
    () => NextResponse.next()
  );
}
```

**Phase 1~3 구현체**: 단일 tenant (`tenantId = 'default'`) 라도 항상 컨텍스트 진입. 다중 tenant 도입(ADR-026 manifest) 시 resolver 만 교체.

**Phase 4+ 진화**: 옵션 D worker_threads 진화 시 — main thread → worker 전달 시 `MessagePort` 로 컨텍스트 직렬화. 인터페이스 무수정.

**금지 사항**: 글로벌 변수 / module-level mutable state 에 tenantId 보관 금지. cluster:4 전환 시 worker 간 누설 방지.

### 3.2 Plugin Interface (ADR-024 통합)

**책임**: 도메인 코드(EdgeFunction / SQL Editor / Cron / 컨슈머 도메인)를 core 와 격리. 미래 옵션 B/D 진화 시 plugin 단위로 별도 instance/worker 배치 가능.

**인터페이스**:

```typescript
// src/lib/plugin/registry.ts
export interface PluginManifest {
  readonly name: string;            // 'almanac', 'jobboard', ...
  readonly version: string;          // semver
  readonly tenantId: string;          // 1 plugin = 1 tenant (Phase 1) — 미래 다중 tenant 공유는 manifest hint
  readonly capabilities: PluginCapability[];
  readonly resourceCaps: ResourceCaps;  // CPU%, RSS MB, ms/req
}

export type PluginCapability =
  | { type: 'cron'; jobs: CronJobDef[] }
  | { type: 'http'; routes: RouteDef[] }
  | { type: 'edge-function'; functions: EdgeFnDef[] }
  | { type: 'prisma-models'; modelNames: string[] };

export interface ResourceCaps {
  readonly cpuPercentMax: number;
  readonly rssMbMax: number;
  readonly requestMsMax: number;
}

export interface PluginAPI {
  registerCron(jobs: CronJobDef[]): void;
  registerRoutes(routes: RouteDef[]): void;
  registerEdgeFunction(fn: EdgeFnDef): void;
  getPool(): Promise<TenantPool>;     // §3.4 와 통합
  getCollector(): ObservabilityCollector;  // §3.5 와 통합
}

export interface PluginRegistry {
  register(manifest: PluginManifest, init: (api: PluginAPI) => Promise<void>): Promise<void>;
  resolveByTenant(tenantId: string): PluginManifest[];
  resolveByName(name: string): PluginManifest | undefined;
}
```

**Phase 1~3 구현체**: 단일 process 내 in-memory registry. 모든 plugin 이 같은 Node process 에 로드. ADR-024 hybrid (pnpm workspace + dynamic import) 채택.

**Phase 4+ 진화**:
- **옵션 D**: `init(api)` 가 worker_threads 안에서 호출. core ↔ plugin 통신 = MessagePort.
- **옵션 B**: VIP plugin 만 `:3001` 인스턴스에 로드. Tier 라우팅은 ADR-027 router 가 결정.
- **옵션 C**: plugin 을 별도 npm package + Docker image 로 분리. registry interface 유지.

**금지 사항**: plugin 이 core 의 internal API 를 직접 import 금지 (ADR-024 ESLint 가드). 모든 의존은 `PluginAPI` 를 통해.

### 3.3 CronWorkerPool 추상화 (ADR-028 통합)

**책임**: cron 실행을 main thread 와 분리할 수 있는 인터페이스. Phase 1~3 에서는 main thread fallback, Phase 4+ 에서 worker_threads 또는 pg-boss 로 교체.

**인터페이스**:

```typescript
// src/lib/cron/worker-pool.ts
export interface CronJob {
  readonly jobId: string;
  readonly tenantId: string;
  readonly schedule: string;        // cron expression
  readonly kind: 'sql' | 'function' | 'webhook';
  readonly payload: unknown;
  readonly timeoutMs: number;
  readonly resourceCaps?: ResourceCaps;
}

export interface CronJobResult {
  readonly jobId: string;
  readonly tenantId: string;
  readonly startedAt: number;
  readonly durationMs: number;
  readonly status: 'success' | 'timeout' | 'error' | 'rejected';
  readonly error?: { message: string; stack?: string };
}

export interface CronWorkerPool {
  dispatch(job: CronJob, ctx: TenantContext): Promise<CronJobResult>;
  drain(): Promise<void>;
  stats(): { activeWorkers: number; queuedJobs: number; perTenant: Map<string, number> };
}
```

**Phase 1~3 구현체** (`MainThreadCronPool`): `dispatch(job, ctx)` 가 `runWithTenant(ctx, async () => { ... })` 안에서 `AbortController` + `setTimeout(ctrl.abort, job.timeoutMs)` + 기존 `dispatchCron(job, signal)` 로직을 호출하고 success/timeout/error 분기 결과를 반환. `active` Map 으로 `drain()` 지원. cron registry tick 이 due job 을 모아 `dispatch` 호출.

**Phase 4+ 진화**:
- **옵션 D 1단계**: `WorkerThreadCronPool` — `worker_threads` × N pool. job 직렬화 → worker 실행 → 결과 직렬화 반환.
- **옵션 D 2단계 (필요 시)**: `PgBossCronPool` — pg-boss 도입, 진정한 큐 기반 (ADR-002 의존성 최소 원칙 위반 정당화 필요).

**advisory lock 통합**: `dispatch` 내부에서 `pg_try_advisory_lock(hash(tenantId, jobId))` 호출. cluster:4 전환 시에도 정확히 1번 실행 보장 (SP-010 검증).

### 3.4 `getPool(tenantId): Promise<TenantPool>`

**책임**: DB 접근을 tenant 차원으로 추상화. 현재는 단일 PrismaClient 반환, Phase 4+ 옵션 B-2 진화 시 tenant별 client 분리.

**인터페이스**:

```typescript
// src/lib/db/pool-factory.ts
export interface TenantPool {
  readonly tenantId: string;
  prisma(): PrismaClient;             // RLS 가 tenantId 자동 주입 (ADR-023)
  rawQuery<T>(sql: string, params?: unknown[]): Promise<T[]>;
  withTransaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T>;
  release(): void;                     // pool 반납 (Phase 1: no-op)
}

export interface PoolFactory {
  getPool(tenantId: string): Promise<TenantPool>;
  getStats(): { activePools: number; perTenant: Map<string, PoolStats> };
}
```

**Phase 1~3 구현체** (`SharedPoolFactory`): 모든 tenantId 에 대해 단일 `PrismaClient` 를 반환하되 `prisma()` 호출 시점에 `client.$extends(rlsExtension(tenantId))` 를 wrapping (ADR-023). `rawQuery` 는 `runReadonlyWithTenant(sql, params, tenantId)` 로 `SET LOCAL app.tenant_id` 주입 후 실행. `release()` 는 no-op.

**Phase 4+ 진화**:
- **옵션 B-2**: `TierPoolFactory` — free tier client / vip tier client 분리. `tenantId` 로 routing.
- **옵션 D**: worker thread 별 client 분리. `release()` 가 thread-local pool 반납.

**금지 사항**: 코드 어디에서도 `import { prisma } from '@/lib/prisma'` 직접 사용 금지. 항상 `await getTenantContext().pool()` 또는 `await poolFactory.getPool(tenantId)` 경유.

### 3.5 ObservabilityCollector (ADR-029 통합)

**책임**: 모든 metric/log/trace 에 `tenantId` 를 1급 차원으로 자동 주입. Phase 1~3 에서는 SQLite + in-process counter, Phase 4+ 에서 OpenTelemetry 진화.

**인터페이스**:

```typescript
// src/lib/obs/collector.ts
export interface MetricRecord {
  readonly name: string;            // 'http.request.duration', 'cron.run.success', ...
  readonly value: number;
  readonly unit: 'ms' | 'count' | 'bytes' | 'percent';
  readonly tags: Record<string, string>;
  readonly timestamp?: number;
}

export interface LogRecord {
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly message: string;
  readonly fields?: Record<string, unknown>;
  readonly error?: Error;
}

export interface SpanContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
}

export interface ObservabilityCollector {
  // 모든 메서드가 TenantContext 에서 tenantId 자동 주입
  metric(record: MetricRecord): void;
  log(record: LogRecord): void;
  startSpan(name: string, attrs?: Record<string, unknown>): SpanContext;
  endSpan(ctx: SpanContext, status: 'ok' | 'error'): void;
  audit(entry: AuditEntry): Promise<void>;  // ADR-021 safeAudit 통합
}
```

**Phase 1~3 구현체** (`SqliteCollector`):
- `metric(record)`: `tryGetTenantContext()?.tenantId ?? 'unknown'` 을 tags 에 자동 주입 → in-memory buffer → 5초 batch flush → SQLite `metrics_history` (tenant_id 컬럼 포함, ADR-029 amendment).
- `log(record)`: tenant_id + request_id 자동 주입 → JSON 구조화 stdout (Pino 도입 보류, `console.log` 임시 사용).
- `audit(entry)`: `safeAudit({ ...entry, tenantId })` 로 ADR-021 fail-soft 에 tenantId 자동 주입 위임.
- `startSpan/endSpan`: Phase 1~3 에서 no-op (ADR-029 stage 2 OTel 진화 시 활성화).

**Phase 4+ 진화**:
- **ADR-029 stage 2**: `OtelCollector` — OpenTelemetry SDK + OTLP exporter. tenantId 가 `Resource.attributes` 에 자동 매핑.
- **옵션 D**: worker thread 별 collector 인스턴스, 메인으로 batch flush.

**금지 사항**: `console.log/warn/error` 직접 호출 금지 (ESLint rule). 모든 로깅은 `collector.log()` 경유.

---

## 4. Phase 4 진화 옵션 (조건부)

본 spec 의 5종 추상화는 Phase 4+ 의 다음 진화 옵션을 무비용으로 가능케 한다.

### 4.1 옵션 D — worker pool tier (ADR-028 본격 활성화)

**트리거**:
- N=10 도달 + cron 부하 측정 (1분 tick 당 평균 5+ jobs 동시 due)
- p95 응답 지연 > 200ms 가 PM2 cluster:4 적용 후에도 1주 이상 지속
- 단일 cron hang 으로 다른 cron push back 사례 1회 이상 (ObservabilityCollector 의 cron metric 으로 자동 탐지)

**추정 공수**: 5~7 작업일 — `WorkerThreadCronPool` 구현(2일) + 직렬화 protocol(1일) + supervisor(1일) + 부하 검증(1~2일) + ADR-028 amendment(0.5일).

**데이터 수집 항목** (Phase 1~3 에서 ObservabilityCollector 가 미리 수집): cron.run.duration / cron.queue.depth / cron.timeout.count / cron.exception.count / node.eventloop.lag / node.heap.used (모두 per tenant).

### 4.2 옵션 B — Tier 분리 (free / vip 인스턴스)

**트리거**: VIP 컨슈머 1~2개 트래픽이 전체의 30% 초과 + free tier 응답 영향 측정. 또는 VIP 컨슈머가 SLA / 데이터 주권 / 보안 격리를 명시적으로 요구. ObservabilityCollector 의 tenant-level p95 가 free / vip 그룹 간 명확한 차이 보임.

**추정 공수**: 8~12 작업일 — `ecosystem.config.cjs` 2 app(1일) + Tunnel ingress + ADR-027 router 갱신(2일) + Tier 환경변수 + standalone dual-deploy(2일) + DB 옵션 (B-1 schema 3일 / B-2 instance 5~7일) + VIP tenant 마이그레이션(2~3일).

**데이터 수집 항목**: HTTP duration p95 per tenant / DB query duration per tenant / 매출 기여 (manifest tier 필드) / error rate per tenant.

### 4.3 옵션 C — per-consumer 인스턴스

**트리거**: 특정 컨슈머가 SLA / multi-region / 데이터 주권을 계약 수준으로 요구 + 운영 부담 분담 의사 있음. 또는 단일 호스트 RAM/CPU 한도 초과 (옵션 B 로 부족).

**추정 공수**: 15~20 작업일 (1 컨슈머당) — npm package + Docker image 화(5~7일) + IaC(3~5일) + DB 신규 + 마이그레이션(3~5일) + Tunnel hostname + cert(2일) + 운영 매뉴얼(2~3일).

**데이터 수집 항목**: 옵션 B 와 동일 + 비용 (VM/네트워크/DB 인스턴스 단가).

### 4.4 진화 결정 매트릭스

| 트리거 | 1차 검토 옵션 | 2차 옵션 | 보류 |
|--------|--------------|---------|-----|
| p95 200ms 지속 | PM2 cluster:4 (옵션 A 안의 진화) | 옵션 D | 옵션 B/C |
| cron hang 사례 발생 | 옵션 D | — | — |
| VIP tenant SLA 요구 | 옵션 B | 옵션 C | — |
| 단일 호스트 RAM 한계 | 옵션 B (또는 vertical 머신 업그레이드) | 옵션 C | — |
| 데이터 주권 / multi-region | 옵션 C | — | 옵션 B |

---

## 5. ADR-020 호환성

### 5.1 standalone + rsync + pm2 reload 흐름 무수정

ADR-020 (세션 50 standalone 패키징) + 세션 56 운영 진화 (`wsl-build-deploy.sh` 8단계 + ADR-021 빌드 게이트) 흐름은 본 spec 채택 후에도 변경 없음:

```
[1/8] git pull
[2/8] pnpm install --frozen-lockfile
[3/8] prisma generate
[4/8] prisma migrate deploy (Postgres)
[5/8] next build
[6/8] node scripts/run-migrations.cjs (drizzle migrate)   ← ADR-021 게이트
[7/8] node scripts/verify-schema.cjs                      ← ADR-021 게이트
[8/8] pack-standalone.sh + rsync + pm2 reload ypserver
```

본 spec §3 의 5종 추상화 코드는 [5/8] next build 산출물에 자동 포함되며, [6/8]~[8/8] 변경 0.

### 5.2 모노레포 (ADR-024) 적용 시 변경 사항

ADR-024 hybrid plugin (pnpm workspace) 채택 시 standalone 패키징에 다음 변경:

| 단계 | 현재 | ADR-024 적용 후 |
|------|------|----------------|
| [2/8] pnpm install | `--frozen-lockfile` | `--frozen-lockfile --filter ./packages/...` (workspace 전체) |
| [5/8] next build | `next build` | `pnpm --filter @yangpyeon/core build` |
| pack-standalone.sh | `src/lib/db/migrations/ → bundle/db-migrations/` | + `packages/*/dist/ → bundle/plugins/` |
| ecosystem.config.cjs | 단일 entry | + plugin entry list (env var) |

본 spec 은 ADR-024 와 호환되는 인터페이스만 정의 — 실제 모노레포 도구 도입 시점은 ADR-024 의 sprint plan 에서 결정.

### 5.3 ADR-021 audit fail-soft 와 §3.5 ObservabilityCollector

ADR-021 의 `safeAudit(entry)` 는 본 spec §3.5 의 `collector.audit(entry)` 로 wrapping:

```typescript
async audit(entry: AuditEntry): Promise<void> {
  const tenantId = tryGetTenantContext()?.tenantId ?? 'unknown';
  return safeAudit({ ...entry, tenantId });  // ADR-021 fail-soft 호출 + tenantId 자동 주입
}
```

기존 11개 도메인 콜사이트는 `safeAudit` 직접 호출 → `collector.audit` 로 점진 마이그레이션 (Phase 1 sprint plan 항목). ADR-021 §amendment-1 (audit-failure 카운터)는 collector 의 metric 으로 자연 통합.

### 5.4 시나리오 A/B/C 영향

`standalone/README.md` 시나리오:

| 시나리오 | 본 spec 채택 후 영향 |
|---------|---------------------|
| **A. 본 운영 호스트 단순 재기동** | 변경 0 — `pm2 start ypserver && pm2 save` 그대로 |
| **B. Windows src → WSL build → 운영 반영** | 변경 0 — `wsl-build-deploy.sh` 8단계 그대로 (5종 추상화 코드 포함) |
| **C. 새 호스트 standalone 배포** | 변경 0 — rsync → install-native → .env → migrate → pm2 start. 5종 추상화는 번들에 자동 포함 |

---

## 6. Open Questions

### 6.1 Phase 4 진입 결정의 자동화

§4 진화 트리거 (p95 200ms 1주 지속, cron hang 사례) 발생 시 자동 알림 vs 수동 검토?

- **A. 수동 검토** (Phase 1~3 권장): 주간 운영 리뷰에서 ObservabilityCollector dashboard 확인. 1인 운영 적합.
- **B. 자동 알림**: PM2 + Telegram bot 임계 도달 시 즉시 알림. 24/7 대응 부담.
- **C. 단계별 게이트**: warning (이메일) → alert (Telegram) → page (전화), severity 별.

**잠정 결론**: A 채택 (Phase 1~3). N=10 도달 시 ADR 신설로 B/C 결정.

### 6.2 VIP 컨슈머 정의

옵션 B 진화 시 어떤 컨슈머가 "VIP" 인가? 기준 후보: 트래픽 N% 이상 / 매출 기여 (ADR-026 manifest tier) / SLA 계약 / 데이터 주권 / 컨슈머 본인 운영 부담 분담 의사. **잠정 결론**: ADR-026 에서 `tier: 'free' | 'vip' | 'enterprise'` 필드 정의. 본 spec 은 tier 라우팅 인터페이스만 §3.2 plugin manifest 에 hint.

### 6.3 cluster:4 전환 시 TenantContext 동작

PM2 cluster:4 전환 시 worker 간 AsyncLocalStorage 정상 작동? AsyncLocalStorage 는 process-local 이므로 worker 간 자연 격리. cluster:4 전환 시 신규 spike 1회 (SP-014 후보, 별도 검증 권장).

### 6.4 RLS 통합 시점 + SQLite 폭주 방지

- `getPool(tenantId).prisma()` 의 RLS extension 적용은 Phase 1 즉시 (default tenant SELECT all 정책, 성능 영향 0).
- ObservabilityCollector SQLite metrics_history: Phase 1~3 (N=1~5) 에서는 5초 batch flush + 30일 retention 충분. N=10 도달 시 pre-aggregation 또는 ADR-029 stage 2 (OTel) 조기 진화 재측정.

---

## 7. 구현 체크리스트 (Phase 1 Sprint 입력)

본 spec 채택 시 Phase 1 sprint 에 추가될 task:

- [ ] **T-025-01** TenantContext 도입 (`src/lib/tenant-context.ts` + middleware) — 1일
- [ ] **T-025-02** PluginRegistry 인터페이스 정의 (`src/lib/plugin/registry.ts`) — 0.5일
- [ ] **T-025-03** CronWorkerPool 인터페이스 + MainThreadCronPool 구현 (`src/lib/cron/`) — 2일
- [ ] **T-025-04** PoolFactory + SharedPoolFactory (`src/lib/db/pool-factory.ts`) — 1일
- [ ] **T-025-05** ObservabilityCollector + SqliteCollector (`src/lib/obs/`) — 2일
- [ ] **T-025-06** safeAudit 11개 콜사이트 → `collector.audit` 점진 마이그레이션 — 1일
- [ ] **T-025-07** ESLint rule: `no-direct-prisma-import`, `no-console` — 0.5일
- [ ] **T-025-08** 통합 테스트: TenantContext propagation 5 case — 1일
- [ ] **T-025-09** ADR-029 amendment: `audit_logs.tenant_id`, `metrics_history.tenant_id` 마이그레이션 — 1일
- [ ] **T-025-10** Phase 4 진화 트리거 dashboard (관측 메트릭 표 + alert 룰 초안) — 0.5일

**총 추정**: ~10.5 작업일.

---

## 8. 결론

본 spec 은 ADR-025 §5.2 의 "코드 추상화 격리 경계 5종 즉시 도입" 을 구체적 인터페이스 + Phase 1~3 구현체 + Phase 4+ 진화 지점으로 정형화했다.

**핵심 invariant**:

1. Phase 1~3 인프라 변경 0 — ADR-020 standalone 흐름 그대로.
2. 모든 추상화는 단일 tenant (`'default'`) 에서도 작동 — 다중 tenant 도입 시 인터페이스 무수정.
3. Phase 4+ 옵션 D/B/C 진화 시 §3 의 인터페이스가 교체점 — 호출자 코드 변경 0.
4. ADR-021/023/024/026/027/028/029 와의 통합 지점 명시 — 본 spec 이 architecture wave 의 hub.
5. SP-010 (cluster:4) 진입 보류 — Phase 16 트리거 도달 시 별도 게이트.

> ADR-025 impl spec (옵션 A + 추상화 5종) · ACCEPTED 2026-04-26 · Phase 1 sprint 입력 준비 완료
