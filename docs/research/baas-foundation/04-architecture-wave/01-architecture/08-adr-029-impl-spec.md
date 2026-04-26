# 08 — ADR-029 (Per-tenant Observability) Implementation Spec

> 작성: 2026-04-26 세션 58 / Sub-wave A — Agent A9
> 입력: ADR-029 (ACCEPTED 2026-04-26) + ADR-021 (Accepted §amendment-1) + 현 코드 (`audit-log.ts`, `audit-log-db.ts`, `audit-metrics.ts`, `metrics-collector.ts`, `db/schema.ts`)
> 산출 의도: ADR-029 Phase 1 (M1+L1+T3 SQLite-only, 18h) 즉시 구현 가능한 코드-레벨 spec + Phase 4 OTel 진화 트리거 + Wave 4 04-observability-blueprint.md 와의 호환 매핑.

---

## 1. 결정 요약

ADR-029 채택 결정 (2026-04-26 세션 58):

| 차원 | Phase 1~3 (즉시) | Phase 4 (트리거) |
|------|-----------------|-----------------|
| Metrics (M) | **M1** — SQLite metrics 확장 + tenant_id | **M3** — OpenTelemetry SDK + collector |
| Logs (L) | **L1** — audit_logs 확장 + tenant_id | L1 유지 (audit는 SQLite 계속) |
| Traces (T) | **T3** — 자체 trace ID + correlation ID 패턴 | **T2** — Jaeger/Tempo 분산 trace |
| 인프라 추가 | **0** (SQLite 재사용) | +1 (OTel collector 또는 Jaeger) |

**핵심 invariant** (ADR-029 §1.1): 모든 metric/log/trace의 첫 dimension은 `tenant_id`. 1인 운영자가 30초 안에 "지금 어느 tenant가 아픈가" 답할 수 있어야 한다.

**부수 결정**:
- Cardinality 정책 C1+C2+C3 (§3) — 100K series 한도, 자동 sampling, aggregate 우선
- SLO yaml 양식 + `tenant_slos` 테이블 (§4)
- **Operator Console 즉시 18h 구축** (Phase 14.5, §5) — 1순위 화면 `/dashboard/operator/health`
- ADR-021 §amendment-2 추가 1줄 (§2.2) — safeAudit 자동 주입, 11 콜사이트 변경 0건

---

## 2. Phase 1~3 (SQLite-only) 구현 spec

### 2.1 M1 — Metrics 확장 (per-tenant SQLite)

#### 2.1.1 schema 변경 (drizzle SQLite)

`src/lib/db/schema.ts` 변경:

```ts
// 기존 metricsHistory 에 tenant_id 컬럼 추가
export const metricsHistory = sqliteTable('metrics_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  tenantId: text('tenant_id').notNull().default('_system'),  // ★ 추가
  cpuUsage: integer('cpu_usage'),
  memoryUsed: integer('memory_used'),
  memoryTotal: integer('memory_total'),
}, (table) => ({
  idxTenantTime: index('idx_metrics_tenant_time').on(table.tenantId, table.timestamp),  // ★
}));

// 신규 tenant_metrics_history (per-tenant application metric)
export const tenantMetricsHistory = sqliteTable('tenant_metrics_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  tenantId: text('tenant_id').notNull(),
  metricName: text('metric_name').notNull(),  // api_calls / query_duration_p95 / cron_success / edge_fn_invocations / error_count
  value: real('value').notNull(),
  bucketKey: text('bucket_key'),               // 옵션: 라벨 차원 (예: route_path, status_class)
}, (table) => ({
  idxTenantMetricTime: index('idx_tenant_metrics').on(table.tenantId, table.metricName, table.timestamp),
}));
```

> `real()` import 추가 필요 (drizzle-orm/sqlite-core).

#### 2.1.2 마이그레이션 SQL

신규 파일 `src/lib/db/migrations/0003_tenant_metrics.sql`:

```sql
-- ADR-029 Phase 1: per-tenant metrics 차원 추가
ALTER TABLE metrics_history ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '_system';
CREATE INDEX IF NOT EXISTS idx_metrics_tenant_time ON metrics_history(tenant_id, timestamp);

CREATE TABLE IF NOT EXISTS tenant_metrics_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  tenant_id TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  value REAL NOT NULL,
  bucket_key TEXT
);
CREATE INDEX IF NOT EXISTS idx_tenant_metrics ON tenant_metrics_history(tenant_id, metric_name, timestamp);
```

ADR-021 §2.2 self-heal 메커니즘 (`applyPendingMigrations()`)이 그대로 적용 — 빌드 게이트(`scripts/verify-schema.cjs`)에 `tenant_metrics_history` 존재 검증 1줄 추가.

#### 2.1.3 metrics-collector.ts 확장

```ts
// 기존 collectOnce() 는 _system tenant 로 기록 (호환 유지)
export function collectOnce(tenantId: string = '_system') {
  // ... 기존 로직 + tenantId 컬럼 채움
  db.insert(metricsHistory).values({
    timestamp: new Date(),
    tenantId,
    cpuUsage: ...,
    memoryUsed: ...,
    memoryTotal: ...,
  }).run();
}

// 신규: per-tenant application metric 기록 (cardinality 정책 C1 적용)
export function recordTenantMetric(
  tenantId: string,
  metricName: string,
  value: number,
  bucketKey?: string
): void {
  if (!isWithinCardinalityCap(tenantId, metricName, bucketKey)) {
    // C2 sampling — quota 초과 시 down-sample
    if (Math.random() > SAMPLING_RATE_HIGH_VOLUME) return;
  }
  try {
    getDb().insert(tenantMetricsHistory).values({
      timestamp: new Date(),
      tenantId,
      metricName,
      value,
      bucketKey: bucketKey ?? null,
    }).run();
  } catch (err) {
    // 메트릭은 도메인 흐름을 깨뜨리지 않는다 (ADR-021 fail-soft 정신 동일 적용)
    console.warn('[metrics] recordTenantMetric failed', { tenantId, metricName, error: err });
  }
}
```

`pruneOldData()` 는 `tenantMetricsHistory` 도 30일 retention 적용 (raw event는 정책 C3에 따라 7일도 가능 — 운영 중 결정).

### 2.2 L1 — Audit Logs 확장 (ADR-021 §amendment-2)

#### 2.2.1 schema 변경

```ts
export const auditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  tenantId: text('tenant_id').notNull().default('_system'),  // ★ 추가
  traceId: text('trace_id'),                                 // ★ T3 (Phase 1 후반)
  action: text('action').notNull(),
  ip: text('ip').notNull(),
  path: text('path'),
  method: text('method'),
  statusCode: integer('status_code'),
  userAgent: text('user_agent'),
  detail: text('detail'),
}, (table) => ({
  idxTenantTime: index('idx_audit_logs_tenant_time').on(table.tenantId, table.timestamp),
  idxTraceId: index('idx_audit_logs_trace_id').on(table.traceId),
}));
```

#### 2.2.2 마이그레이션 SQL

신규 파일 `src/lib/db/migrations/0004_audit_tenant_trace.sql`:

```sql
ALTER TABLE audit_logs ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '_system';
ALTER TABLE audit_logs ADD COLUMN trace_id TEXT;
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_time ON audit_logs(tenant_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_trace_id ON audit_logs(trace_id);
```

#### 2.2.3 safeAudit() 자동 주입 (시그니처 불변)

`src/lib/audit-log.ts` AuditEntry 인터페이스 확장 (선택적):

```ts
export interface AuditEntry {
  timestamp: string;
  method: string;
  path: string;
  ip: string;
  status?: number;
  action?: string;
  userAgent?: string;
  detail?: string;
  tenantId?: string;   // ★ 자동 주입 가능 (호출자가 지정 시 우선)
  traceId?: string;    // ★ AsyncLocalStorage 자동 주입
}
```

`src/lib/audit-log-db.ts` `safeAudit()` 내부 자동 주입:

```ts
import { getRequestContext } from './request-context';  // ★ 신규 (T3 §2.3)

export function safeAudit(entry: AuditEntry, context?: string): void {
  const ctx = context ?? entry.action ?? `${entry.method} ${entry.path}`;
  const reqCtx = getRequestContext();  // AsyncLocalStorage
  const enriched: AuditEntry = {
    ...entry,
    tenantId: entry.tenantId ?? reqCtx?.tenantId ?? '_system',
    traceId: entry.traceId ?? reqCtx?.traceId,
  };
  try {
    writeAuditLogDb(enriched);
    recordAuditOutcome(true, ctx, undefined, enriched.tenantId);  // §2.4 byTenant 차원
  } catch (err) {
    recordAuditOutcome(false, ctx, err, enriched.tenantId);
    console.warn('[audit] write failed', {
      context: ctx,
      tenantId: enriched.tenantId,
      traceId: enriched.traceId,
      error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
    });
  }
}
```

`writeAuditLogDb()` 의 `db.insert(auditLogs).values()` 에 `tenantId`, `traceId` 컬럼 매핑 추가.

#### 2.2.4 11 콜사이트 변경 0건 — 검증 매트릭스

ADR-021 §2.3 sweep된 11 콜사이트 (시그니처 `safeAudit(entry, context?)`)는 **변경 0건**. 다음 매트릭스로 검증:

| 콜사이트 | tenantId 출처 | 변경 |
|---------|-------------|-----|
| `src/lib/sessions/login-finalizer.ts` | request-context (cookie session) | 0 |
| `src/app/api/v1/auth/{login,logout,refresh,...}/route.ts` (5건) | request-context (Cookie/JWT 인증 후) | 0 |
| `src/app/api/admin/users/[id]/sessions/route.ts` | request-context (admin) | 0 |
| `src/app/api/v1/tables/[table]{,/[pk],/composite}/route.ts` (3건) | request-context (테이블 ACL 컨텍스트) | 0 |
| `src/lib/cleanup-scheduler.ts` | `_system` sentinel (cron) | 0 |

**전제**: ADR-026 (Tenant Manifest) + ADR-027 (path router) 결정으로 request-context에 tenantId가 들어와야 함. 본 spec은 그 전제 위에 작성. 미결정 시 `_system` fallback으로 안전하게 작동.

#### 2.2.5 audit-metrics.ts byTenant 차원 추가

```ts
// MAX_BUCKETS=200 → byTenant 분리
const MAX_TENANTS = 50;
const MAX_BUCKETS_PER_TENANT = 100;

interface AuditState {
  total: { success: number; failure: number };
  byTenant: Map<string, {
    total: { success: number; failure: number };
    byBucket: Map<string, AuditBucket>;
  }>;
  startedAt: number;
}

export function recordAuditOutcome(
  success: boolean,
  context: string,
  error?: unknown,
  tenantId: string = '_system',  // ★ 추가
): void {
  try {
    if (success) state.total.success += 1; else state.total.failure += 1;

    let tenantState = state.byTenant.get(tenantId);
    if (!tenantState) {
      if (state.byTenant.size >= MAX_TENANTS) {
        // FIFO evict tenant
        const oldestKey = state.byTenant.keys().next().value;
        if (oldestKey !== undefined) state.byTenant.delete(oldestKey);
      }
      tenantState = { total: { success: 0, failure: 0 }, byBucket: new Map() };
      state.byTenant.set(tenantId, tenantState);
    }

    if (success) tenantState.total.success += 1;
    else tenantState.total.failure += 1;

    const name = bucketName(context);
    let bucket = tenantState.byBucket.get(name);
    if (!bucket) {
      if (tenantState.byBucket.size >= MAX_BUCKETS_PER_TENANT) {
        const oldestKey = tenantState.byBucket.keys().next().value;
        if (oldestKey !== undefined) tenantState.byBucket.delete(oldestKey);
      }
      bucket = { success: 0, failure: 0 };
      tenantState.byBucket.set(name, bucket);
    }
    if (success) bucket.success += 1;
    else { bucket.failure += 1; bucket.lastFailureAt = Date.now(); bucket.lastFailureMessage = error instanceof Error ? error.message : String(error); }
  } catch {
    // never throw
  }
}
```

`getAuditMetrics()` snapshot 에 `byTenant` array 추가:

```ts
export interface AuditMetricsSnapshot {
  startedAt: string;
  uptimeSeconds: number;
  total: { success: number; failure: number; failureRate: number };
  byTenant: Array<{
    tenantId: string;
    total: { success: number; failure: number; failureRate: number };
    byBucket: AuditMetricsBucket[];
  }>;
}
```

**메모리 부담**: 50 tenant × 100 bucket × ~200 byte/bucket = ~1MB (ADR-029 §1.6.2 산정 일치).

### 2.3 T3 — Trace ID + Correlation ID 패턴

#### 2.3.1 신규 모듈 `src/lib/request-context.ts`

```ts
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  traceId: string;          // X-Request-Id 또는 server-side crypto.randomUUID()
  tenantId?: string;        // ADR-026/027 인증 후 주입
  userId?: string;          // 옵션 (audit detail 평문 회피)
  startedAt: number;        // ms
}

const storage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}
```

#### 2.3.2 Next.js middleware 패턴

**제약**: Next.js Edge Middleware 는 AsyncLocalStorage 미지원 (Edge Runtime). 따라서 다음 2단 구조:

1. **Edge Middleware** (`src/middleware.ts`): X-Request-Id 헤더만 발급/전달 (response header 추가)
2. **Server Component / API Route** (Node Runtime): route handler 또는 instrumentation hook 에서 `runWithContext()` 로 ALS 진입

```ts
// src/middleware.ts (Edge — 헤더 발급만)
import { NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const traceId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  const res = NextResponse.next();
  res.headers.set('x-request-id', traceId);
  // request 객체 자체에 헤더로 다음 단계로 전파 (Next.js는 response header만 전파, 다음 노드에서 다시 읽어야 함)
  return res;
}
```

```ts
// src/lib/with-request-context.ts (Node Runtime — API Route 래퍼)
import { runWithContext } from './request-context';

export function withRequestContext<T extends (...args: any[]) => any>(handler: T): T {
  return (async (req: Request, ...rest: any[]) => {
    const traceId = req.headers.get('x-request-id') ?? crypto.randomUUID();
    const tenantId = await resolveTenantId(req);  // ADR-027 path router or JWT aud
    return runWithContext(
      { traceId, tenantId, startedAt: Date.now() },
      () => handler(req, ...rest)
    );
  }) as T;
}
```

API Route 사용 예:

```ts
// src/app/api/v1/auth/login/route.ts
import { withRequestContext } from '@/lib/with-request-context';

export const POST = withRequestContext(async (req: Request) => {
  // safeAudit() 호출 시 자동으로 traceId/tenantId 주입됨
  safeAudit({ method: 'POST', path: '/api/v1/auth/login', ip, action: 'SESSION_LOGIN' });
  // ...
});
```

#### 2.3.3 console.warn 통합

ADR-021 §2.1 `console.warn` 도 traceId 주입:

```ts
function logWarn(msg: string, fields: Record<string, unknown> = {}) {
  const ctx = getRequestContext();
  console.warn(msg, { ...fields, traceId: ctx?.traceId, tenantId: ctx?.tenantId });
}
```

차후 Phase 2 Pino 도입 시 child logger 패턴으로 자동화 가능 (Wave 4 04-observability-blueprint.md §3.4).

---

## 3. Cardinality 정책 (C1+C2+C3)

### 3.1 정책 정의

| 정책 | 한도/규칙 | 적용 위치 |
|------|---------|---------|
| **C1** per_tenant_per_metric_max_series | 100 unique label combo | `recordTenantMetric()` 호출 직전 검사 |
| C1' global_max_unique_metrics | 50 metric 종류 | 디자인 타임 (코드 리뷰 게이트) |
| **C2** auto sampling | tenant 호출량 > 10K/min 시 raw event 10% sampling | `recordTenantMetric()` |
| **C3** aggregate 우선 | raw 7~30d / per-min agg 30d / per-hour 1y / per-day 5y | retention cron |

**effective cap**: 20 tenant × 50 metric × 100 series = **100,000 series**.

### 3.2 SQLite vs Prometheus 비교 분석

| N | SQLite (M1) | Prometheus (M2) |
|---|-----------|----------------|
| **N=10** | 1.7M row / 30d. p95 쿼리 ~30ms (인덱스 사용 시) | 50K series. 가벼움. 운영 부담 +1 |
| **N=20** | 1.7M × 2 = **3.4M row / 30d**. p95 쿼리 ~50ms (테스트 필요) | 100K series. 본업. 운영 부담 +1 |
| **N=50+** | 8.5M row / 30d. **p95 > 100ms 가능 → 한계** | 250K series. 본업. 안정 |

**결정**:
- **N ≤ 20: SQLite 단독 가능** — 인프라 추가 0. ADR-021 self-heal 그대로 재사용
- **N=20~50: SQLite + aggregate 강화** (raw retention 7d로 단축 + per-hour aggregate 의무화)
- **N ≥ 50 또는 트리거 A 발동: Prometheus 전환** (별도 ADR)

### 3.3 cardinality 가드 구현

```ts
// src/lib/cardinality-guard.ts
const tenantSeries = new Map<string, Set<string>>();   // tenantId -> Set<metricName:bucketKey>
const tenantCallRate = new Map<string, { count: number; windowStart: number }>();

const SAMPLING_RATE_HIGH_VOLUME = 0.1;
const THRESHOLD_CALLS_PER_MIN = 10_000;

export function isWithinCardinalityCap(
  tenantId: string,
  metricName: string,
  bucketKey?: string,
): boolean {
  const seriesKey = `${metricName}:${bucketKey ?? ''}`;
  let set = tenantSeries.get(tenantId);
  if (!set) { set = new Set(); tenantSeries.set(tenantId, set); }

  if (set.has(seriesKey)) return true;     // 기존 series — OK
  if (set.size >= 100) return false;        // C1 위반 — drop or warn
  set.add(seriesKey);
  return true;
}
```

`isWithinCardinalityCap` 가 false 반환 시 `recordTenantMetric()` 은 audit-metrics에 `cardinality_drop_count` 별도 카운터 증가 (운영자가 폭주 인지).

---

## 4. SLO 정의 양식

### 4.1 yaml 정의 (소스)

```yaml
# /config/slos/almanac.yml
tenant: almanac
slos:
  - name: api-availability
    target: 99.5%
    indicator: success_rate          # 1 - (5xx / total)
    window: 30d
    breach_alert: warn               # warn | page | none
  - name: cron-success-rate
    target: 95%
    indicator: cron_job_success / cron_job_total
    window: 7d
    breach_alert: warn
  - name: api-latency-p95
    target: 200ms
    indicator: api_duration_p95
    window: 7d
    breach_alert: page
  - name: edge-fn-error-rate
    target: <1%
    indicator: edge_fn_error / edge_fn_total
    window: 1d
    breach_alert: warn
```

### 4.2 tenant_slos Drizzle 모델

```ts
export const tenantSlos = sqliteTable('tenant_slos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  target: real('target').notNull(),         // 0.995 = 99.5%
  indicator: text('indicator').notNull(),   // SQL fragment 또는 enum
  windowSeconds: integer('window_seconds').notNull(),
  breachAlert: text('breach_alert').notNull().default('warn'),  // warn | page | none
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => ({
  idxTenant: index('idx_tenant_slos_tenant').on(table.tenantId),
  unqTenantName: uniqueIndex('unq_tenant_slos_tenant_name').on(table.tenantId, table.name),
}));
```

### 4.3 breach detection (Phase 2)

`src/lib/cron/slo-breach-detector.ts` — 1분 간격 cron:
- 각 SLO 별로 indicator 계산 (tenant_metrics_history 집계)
- target 미달 시:
  - `breach_alert: warn` → audit_logs `SLO_BREACH_WARN` action 기록 + Operator Console에 빨간 ROW
  - `breach_alert: page` → (Phase 3) webhook 발사

---

## 5. Operator Console (Phase 14.5 즉시 18h)

### 5.1 화면 spec

URL: `/dashboard/operator/health` (ADMIN-only, `withRole(['ADMIN'])` 가드)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  TENANT HEALTH OVERVIEW                                Last refresh: 12:34:56   │
├─────────┬────────┬───────────┬────────────┬──────────────┬──────────────────────┤
│ tenant  │ status │ err_rate  │ p95_lat    │ cron_success │ last_error           │
│         │        │ (1h)      │ (1h)       │ (24h)        │ (timestamp + msg)    │
├─────────┼────────┼───────────┼────────────┼──────────────┼──────────────────────┤
│ almanac │ 🔴 BAD │ 12.3%     │ 1,200ms    │ 78%          │ 12:30 cron timeout   │
│ kdy     │ 🟢 OK  │ 0.1%      │ 45ms       │ 100%         │ -                    │
│ blog    │ 🟡 WRN │ 0.8%      │ 230ms      │ 100%         │ 11:45 SQL slow query │
│ shop    │ 🟢 OK  │ 0.0%      │ 38ms       │ 100%         │ -                    │
│ ...                                                                             │
└─────────┴────────┴───────────┴────────────┴──────────────┴──────────────────────┘
Summary: 1 BAD / 1 WRN / 18 OK    [Click 🔴 ROW → /dashboard/operator/tenants/<id>]
```

### 5.2 구현 구조

- **Server Component** (`src/app/dashboard/operator/health/page.tsx`)
  - `tenant_metrics_history` + `audit_logs` + `tenantSlos` 조인 쿼리 1회
  - 5초 자동 새로고침 (`<meta http-equiv="refresh" content="5">` 또는 client-side `useEffect` 폴링)
  - status 색깔 결정: SLO breach ≥1 → 🔴 BAD / target 80~100% 사이 → 🟡 WRN / 정상 → 🟢 OK
  - 빨간 ROW 자동 상단 정렬

- **API endpoint** (`src/app/api/admin/operator/health/route.ts`)
  - 내부 호출 가능한 JSON aggregate (Server Component 가 직접 DB 호출이지만, 외부 모니터링/CLI 용으로도 노출)

### 5.3 18h breakdown

| # | 작업 | 공수 |
|---|------|------|
| 1 | drizzle migration: audit_logs.tenant_id + tenant_metrics_history (§2.1.2 + §2.2.2) | 1h |
| 2 | safeAudit 자동 주입 + AuditEntry tenantId/traceId (§2.2.3) | 2h |
| 3 | request-context.ts + withRequestContext 래퍼 (§2.3.1, §2.3.2) | 3h |
| 4 | metrics-collector.ts recordTenantMetric() + cardinality-guard (§2.1.3, §3.3) | 3h |
| 5 | audit-metrics.ts byTenant 차원 추가 (§2.2.5) | 2h |
| 6 | `/api/admin/audit/health` tenant query param 지원 + `/api/admin/operator/health` 신규 endpoint | 2h |
| 7 | `/dashboard/operator/health` Server Component UI (10~20 ROW + 5초 새로고침) | 4h |
| 8 | 통합 테스트 + 문서 업데이트 (status/current.md, ADR-021 §amendment-2) | 1h |
| **합계** | | **18h** |

> **3개 핵심 묶음** (보고용):
> - **묶음 A (6h)**: schema migration + safeAudit 자동 주입 + AuditEntry 확장 (#1+#2+#5 부분)
> - **묶음 B (6h)**: request-context AsyncLocalStorage + per-tenant metric 수집 + cardinality guard (#3+#4)
> - **묶음 C (6h)**: Operator Console endpoint + UI + 통합 검증 (#6+#7+#8)

### 5.4 "30초 안에 어느 tenant?" 검증 시나리오

1. **시나리오 1**: almanac cron 실패 폭주 → 1h 동안 cron_success_rate 50% → SLO `cron-success-rate 95%` breach → 🔴 BAD ROW 상단 → 30초 안에 식별 ✅
2. **시나리오 2**: blog SQL slow query → p95 latency 230ms (target 200ms breach) → 🟡 WRN → 식별 ✅
3. **시나리오 3**: 인프라 전반 장애 (PG down) → 모든 tenant 🔴 → "단일 tenant 문제 아님" 즉시 분리 ✅

---

## 6. Tenant Console (Phase 3 옵션)

### 6.1 화면 spec

URL: `/t/<tenant>/observability` 또는 `/dashboard/operator/tenants/[tenantId]`

- 권한: 해당 tenant 멤버만 (ADR-026 멤버십) — 운영자 본인 소유 N개 프로젝트 운영 단계에서는 우선순위 낮음
- 표시: 자기 tenant SLO + 최근 24h 오류 + cron 이력 + 최근 100 audit log (tenantId 필터)

### 6.2 운영자 전용 drill-down (Phase 1.5)

운영자가 Operator Console에서 빨간 ROW 클릭 → drill-down:
- 같은 tenant의 audit_logs 최근 100건
- tenant_metrics_history 24h 시계열 (Chart.js or Recharts)
- 활성 SLO breach 리스트

→ Phase 1 18h 에는 포함 안 함. 본 spec 의 Phase 1.5 (추가 +6h) 또는 Phase 3 본격 Tenant Console 의 일부로 흡수.

---

## 7. Phase 4 OTel 진화 트리거

ADR-029 §6 트리거 D 발동 시 Phase 4 진입. 본 spec 이 정의하는 진입 조건:

| 트리거 | 조건 | 측정 |
|--------|------|------|
| **D1: tenant 수 도달** | N ≥ 10 (실제 active tenant) | `SELECT COUNT(DISTINCT tenant_id) FROM audit_logs WHERE timestamp > NOW() - 30d` |
| **D2: cross-tenant 인시던트** | 1+ 발생 (audit_logs 또는 PIR) | 인시던트 로그 |
| **D3: trace correlation 부재로 인한 RCA 실패** | 월 3건+ (1인 운영자 디버깅 세션 수기 기록) | handover/ session 기록 |
| **D4: SaaS 비용 정당화** | 본 spec Phase 4 자체 운영 30h × 시급 > Datadog $180/년 | 산정 시점 결정 |

**Phase 4 진입 시 변경 범위** (ADR-029 §4 Phase 4 표):
- `@opentelemetry/sdk-node` + auto-instrumentation 도입 (4h)
- OTel collector PM2 별도 앱 또는 내장 모드 (6h)
- SQLite custom exporter 또는 Jaeger 도입 (8h)
- `tenant_id` 를 OTel `ResourceAttribute` 로 주입 (3h)
- audit-metrics → OTel metric 마이그레이션 (병기 → 전환, 6h)
- Operator Console에 OTel data source 통합 (3h)
- **합계 30h**

본 spec Phase 1~3 에서 정의한 인터페이스 (`recordTenantMetric`, `safeAudit`, `request-context`) 는 Phase 4 OTel 도입 시 **내부 구현만 교체**하고 콜사이트는 유지. T3 → T2 전환은 traceId 호환 (W3C Trace Context 표준 적용).

---

## 8. Wave 4 04-observability-blueprint.md 와의 호환

기존 청사진 (Phase 16, ~20h):

| 청사진 항목 | 본 spec 영향 |
|----------|------------|
| VaultService (envelope encryption) | 직교 — 변경 없음 (ADR-013) |
| JWKSService (ES256) | 직교 — ADR-027 종속 |
| **LoggingService (Pino)** | **+12h** — Pino child logger 에 tenantId/traceId 자동 차원 추가 (Phase 2) |
| **MetricsService (SQLite metrics_history)** | **+12h** — per-tenant 확장. 본 spec §2.1 |
| Infrastructure 페이지 (PM2/PG/디스크/Tunnel SSE) | 그대로 — 시스템 신호는 `_system` tenant |

**합산**: 청사진 20h + 본 spec Phase 1 18h = **Phase 16 합계 38h**. ADR-029 §1.7 결론 일치.

**청사진 폐기 0** — 본 spec 은 청사진을 per-tenant 차원으로 확장만. Pino, MetricsService 모듈명/책임 그대로.

---

## 9. 7원칙 매핑

ADR-022 §1.5 7원칙 (멀티테넌트 BaaS 1인 운영) 중 본 spec이 충족하는 항목:

| 원칙 | 충족 방식 | 본 spec 위치 |
|------|---------|------------|
| **#5 셀프 격리 + 자동 복구 + 관측성 3종 동시** | T3 (correlation) + auto-recovery (ADR-028 circuit breaker) + L1 (audit_logs.tenantId) 통합 | §2.2 + §2.3 |
| #1 모든 신호의 tenant_id 1급 | M1 + L1 + T3 모두 tenantId 차원 필수 | §2 전체 |
| #4 1인 운영 30초 응답 시간 | Operator Console 1순위 화면 | §5 |
| #6 데이터 주권 100% (외부 SaaS 회피) | M1+L1+T3 모두 SQLite 단독, 외부 의존성 0 | §1, §3.2 |
| #7 점진적 진화 (트리거 기반 OTel 전환) | Phase 4 OTel 진화 경로 명시 | §7 |

원칙 #2 (multi-tenant 명시), #3 (RLS), #5 의 cron 격리 부분은 ADR-023/028 별도 ADR/spec 에서 충족.

---

## 10. Open Questions

| Q# | 질문 | 의사결정 시점 |
|----|------|-------------|
| **OQ-1** | Prometheus/Grafana 도입 시점 — Phase 4 (트리거 D 발동) vs Phase 5 (별도 트랙)? | N=20 도달 시 또는 M1 SQLite p95 > 100ms 측정 시 |
| **OQ-2** | log retention — tenant별 정책 (e.g., almanac 90d, blog 30d) vs 글로벌 (90d 통일)? | Phase 2 (tenant_slos 와 함께 결정) |
| **OQ-3** | alert routing — Telegram / Email / Slack webhook? 다중 채널 매핑은? | Phase 3 (Tenant Console + 외부 알림) |
| **OQ-4** | tenant_id `_system` sentinel — 모든 시스템 cron이 같은 tenant ID 공유 vs cron job 별 의사 tenant (`_cron:cleanup`)? | Phase 1 구현 중 결정 (cron 차원 분리 필요성에 따라) |
| **OQ-5** | trace_id 무한 저장 — audit_logs.trace_id 인덱스가 90일 retention과 함께 회전될 때 cross-day 디버깅 가능 윈도우? | Phase 1 후반 (운영 중 RCA 시도 시 결정) |
| **OQ-6** | request-context AsyncLocalStorage — Edge Runtime API 라우트 (`runtime: 'edge'`) 라우트는 ALS 미지원. 해당 라우트는 traceId만 보존하고 tenantId 자동 주입 포기? | 인증 메커니즘 (ADR-027) 결정과 함께 |
| **OQ-7** | tenant_metrics_history bucket_key 카디널리티 — `route_path` 같은 high-cardinality label 허용 vs 정규화 (route pattern 만)? | Phase 1 운영 중 cardinality_drop_count 모니터링 후 결정 |
| **OQ-8** | Operator Console 5초 새로고침 — Server Component re-render vs SSE? | Phase 1 구현 중 (Wave 4 04-observability-blueprint §3.6 SSE 통합 시 결정) |

---

## 11. ADR-021 §amendment-2 추가 1줄 (필수 후속 작업)

ADR-021 본문 §2.1 다음 줄 추가 (ADR-029 §7.1 명시):

```diff
 - 실패 시 `console.warn` 으로 err 객체(message/stack) 노출 + 호출자에게는 throw 안 함.
+- **(ADR-029 §amendment-2)** safeAudit 내부에서 인증 컨텍스트(`request-context` AsyncLocalStorage)
+  로부터 `tenantId`/`traceId` 자동 주입. 미인증/시스템 cron 호출 시 `_system` sentinel.
+  11개 콜사이트 시그니처 불변, 변경 0건.
```

---

## 12. 변경 파일 매트릭스 (Phase 1 18h)

| 파일 | 종류 | 변경 |
|------|------|------|
| `src/lib/db/schema.ts` | 수정 | auditLogs.tenantId/traceId, metricsHistory.tenantId, +tenantMetricsHistory |
| `src/lib/db/migrations/0003_tenant_metrics.sql` | 신규 | per-tenant metrics + index |
| `src/lib/db/migrations/0004_audit_tenant_trace.sql` | 신규 | audit_logs.tenant_id + trace_id |
| `src/lib/audit-log.ts` | 수정 | AuditEntry에 tenantId?/traceId? 추가 |
| `src/lib/audit-log-db.ts` | 수정 | safeAudit 내부 자동 주입 + writeAuditLogDb 컬럼 매핑 |
| `src/lib/audit-metrics.ts` | 수정 | byTenant 차원 + MAX_TENANTS/MAX_BUCKETS_PER_TENANT |
| `src/lib/metrics-collector.ts` | 수정 | recordTenantMetric() + tenantId 옵션 |
| `src/lib/cardinality-guard.ts` | 신규 | C1+C2 정책 가드 |
| `src/lib/request-context.ts` | 신규 | AsyncLocalStorage RequestContext |
| `src/lib/with-request-context.ts` | 신규 | API Route 래퍼 (T3) |
| `src/middleware.ts` | 수정 | X-Request-Id 헤더 발급 (Edge) |
| `src/app/api/admin/audit/health/route.ts` | 수정 | tenant query param 지원 |
| `src/app/api/admin/operator/health/route.ts` | 신규 | 전체 tenant aggregate endpoint |
| `src/app/dashboard/operator/health/page.tsx` | 신규 | Operator Console 1순위 UI |
| `scripts/verify-schema.cjs` | 수정 | tenant_metrics_history 검증 1줄 추가 |
| `docs/research/decisions/ADR-021-...md` | 수정 | §amendment-2 추가 (§11) |

신규 6 + 수정 9 + ADR 갱신 1 = **16 파일 영향**.

테스트:
- `src/lib/audit-metrics.test.ts` — byTenant 시나리오 추가 (3+ test)
- `src/lib/request-context.test.ts` — 신규 (5+ test)
- `src/lib/cardinality-guard.test.ts` — 신규 (3+ test)
- `src/app/api/admin/operator/health/route.test.ts` — 신규 (2+ test)

---

## 13. 검증 게이트 (구현 진입 전 체크)

| # | 게이트 | 통과 조건 |
|---|--------|---------|
| G1 | ADR-026/027 결정 완료 | tenantId 발급/해석 메커니즘 명세 존재 |
| G2 | ADR-021 §amendment-2 본문 추가 | git diff 로 1줄 추가 확인 |
| G3 | drizzle migration self-heal | `applyPendingMigrations()` 가 0003+0004 적용 후 `verify-schema.cjs` PASS |
| G4 | 11 콜사이트 변경 0건 | `git diff src/lib/sessions/ src/app/api/v1/auth/` 의 safeAudit 라인 변경 0 |
| G5 | 5초 새로고침 + 빨간 ROW 정렬 | playwright e2e — almanac 의도적 5xx 폭주 → 5초 내 빨간 ROW 상단 등장 |
| G6 | cardinality 100 series 한도 | 단일 tenant에 101 series 입력 → 101번째 drop + cardinality_drop_count++ |

---

## 14. 결론

**Phase 1 18h 즉시 구현 가능**. 신규 인프라 0 (SQLite 재사용). ADR-021 invariant 100% 보존 (11 콜사이트 변경 0). Operator Console 로 30초 답 시나리오 충족. Phase 4 OTel 진화 경로는 트리거 D1~D4 명시 — 본 spec 의 인터페이스를 Phase 4에서도 그대로 활용 (T3 → T2 W3C Trace Context 호환).

**다음 단계**:
1. ADR-021 §amendment-2 추가 (1 commit)
2. drizzle migration 0003 + 0004 작성 + self-heal 검증
3. request-context.ts + withRequestContext 래퍼 (T3 기반)
4. safeAudit 자동 주입 + audit-metrics byTenant 확장 (L1)
5. recordTenantMetric + cardinality-guard (M1)
6. Operator Console endpoint + UI (5초 SSE 또는 meta refresh)
7. e2e 검증 게이트 G1~G6 PASS 확인

---

> 작성: Architecture Wave Sub-wave A — Agent A9
> 본 spec 은 ADR-029 (ACCEPTED 2026-04-26) Phase 1 (M1+L1+T3, 18h) 의 코드-레벨 spec.
> ADR-026/027 결정 완료 후 즉시 구현 진입 가능 (G1 게이트).
