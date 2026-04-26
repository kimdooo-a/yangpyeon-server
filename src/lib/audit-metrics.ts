// safeAudit 인메모리 카운터 — ADR-021 §결과·부정 잔류 위험 완화 (세션 56 후속).
//
// 목적: "지금 audit 가 silently 실패 중인가?" 를 즉시 답한다.
// PM2 reload 시 리셋 — 누적 추세는 audit_logs 테이블 자체가 source of truth.
//
// 운영 노출: GET /api/admin/audit/health (admin only).
// 외부 스크래퍼(prometheus/loki) 통합은 별도 트랙 — 본 모듈은 in-process 만.
//
// 호출 정책:
//   - safeAudit 의 try/catch 양 분기에서 매번 recordAuditOutcome 호출
//   - recordAuditOutcome 자체는 절대 throw 하지 않음 (cross-cutting 의 cross-cutting)
//
// Phase 1.7 (T1.7) ADR-029 §2.2.5 — byTenant 차원 추가:
//   - 기존 total / byBucket 보존 (회귀 0 — audit-metrics.test.ts 9 케이스 PASS).
//   - 신규 byTenant: tenantId → { total, byBucket } per-tenant 차원.
//   - MAX_TENANTS=50, MAX_BUCKETS_PER_TENANT=100 (FIFO evict).
//   - 메모리 부담: 50 × 100 × ~200B = ~1MB (ADR-029 §1.6.2 산정).

const MAX_BUCKETS = 200;

// Phase 1.7 — per-tenant 차원 캡.
const MAX_TENANTS = 50;
const MAX_BUCKETS_PER_TENANT = 100;

interface AuditBucket {
  success: number;
  failure: number;
  lastFailureAt?: number;
  lastFailureMessage?: string;
}

interface AuditTenantState {
  total: { success: number; failure: number };
  byBucket: Map<string, AuditBucket>;
}

interface AuditState {
  total: { success: number; failure: number };
  // Map insertion-order 이용 — 캡 도달 시 가장 오래 들어온 버킷 evict.
  byBucket: Map<string, AuditBucket>;
  // Phase 1.7 — per-tenant 차원.
  byTenant: Map<string, AuditTenantState>;
  startedAt: number;
}

function freshState(): AuditState {
  return {
    total: { success: 0, failure: 0 },
    byBucket: new Map(),
    byTenant: new Map(),
    startedAt: Date.now(),
  };
}

let state: AuditState = freshState();

/**
 * context 의 카디널리티 폭주 방지 — 첫 2 세그먼트(`:` 구분)만 버킷명으로 사용.
 *
 * 예: "cleanup-scheduler:SESSION_EXPIRE:abc-uuid" → "cleanup-scheduler:SESSION_EXPIRE"
 *     "SESSION_LOGIN" → "SESSION_LOGIN"
 */
function bucketName(context: string): string {
  return context.split(":", 2).join(":");
}

/**
 * tenant state 조회 (없으면 생성, MAX_TENANTS 초과 시 FIFO evict).
 */
function ensureTenantState(tenantId: string): AuditTenantState {
  let ts = state.byTenant.get(tenantId);
  if (ts) return ts;
  if (state.byTenant.size >= MAX_TENANTS) {
    // FIFO evict — Map keys 는 insertion order
    const oldestKey = state.byTenant.keys().next().value;
    if (oldestKey !== undefined) state.byTenant.delete(oldestKey);
  }
  ts = { total: { success: 0, failure: 0 }, byBucket: new Map() };
  state.byTenant.set(tenantId, ts);
  return ts;
}

/**
 * tenant state 의 byBucket 갱신 (MAX_BUCKETS_PER_TENANT FIFO evict).
 */
function recordTenantBucket(
  ts: AuditTenantState,
  name: string,
  success: boolean,
  error?: unknown,
): void {
  let bucket = ts.byBucket.get(name);
  if (!bucket) {
    if (ts.byBucket.size >= MAX_BUCKETS_PER_TENANT) {
      const oldestKey = ts.byBucket.keys().next().value;
      if (oldestKey !== undefined) ts.byBucket.delete(oldestKey);
    }
    bucket = { success: 0, failure: 0 };
    ts.byBucket.set(name, bucket);
  }
  if (success) bucket.success += 1;
  else {
    bucket.failure += 1;
    bucket.lastFailureAt = Date.now();
    bucket.lastFailureMessage =
      error instanceof Error ? error.message : String(error);
  }
}

/**
 * safeAudit 결과를 카운터에 반영. 절대 throw 하지 않는다.
 *
 * Phase 1.7: tenantId 옵션 추가 (default 'default' — T0.4 invariant 와 일치).
 * 기존 콜사이트는 tenantId 미지정 시 'default' 로 폴백 (회귀 0).
 */
export function recordAuditOutcome(
  success: boolean,
  context: string,
  error?: unknown,
  tenantId: string = "default",
): void {
  try {
    if (success) state.total.success += 1;
    else state.total.failure += 1;

    const name = bucketName(context);

    // 기존 byBucket 차원 (테넌트 무관) — 후방 호환.
    let bucket = state.byBucket.get(name);
    if (!bucket) {
      if (state.byBucket.size >= MAX_BUCKETS) {
        // FIFO evict — Map keys 는 insertion order
        const oldestKey = state.byBucket.keys().next().value;
        if (oldestKey !== undefined) state.byBucket.delete(oldestKey);
      }
      bucket = { success: 0, failure: 0 };
      state.byBucket.set(name, bucket);
    }
    if (success) {
      bucket.success += 1;
    } else {
      bucket.failure += 1;
      bucket.lastFailureAt = Date.now();
      bucket.lastFailureMessage =
        error instanceof Error ? error.message : String(error);
    }

    // Phase 1.7 — per-tenant 차원.
    const ts = ensureTenantState(tenantId);
    if (success) ts.total.success += 1;
    else ts.total.failure += 1;
    recordTenantBucket(ts, name, success, error);
  } catch {
    // 메트릭은 도메인 흐름을 깨뜨리지 않는다 — 한 측정 손실은 허용.
  }
}

export interface AuditMetricsBucket {
  name: string;
  success: number;
  failure: number;
  failureRate: number;
  lastFailureAt: string | null;
  lastFailureMessage: string | null;
}

export interface AuditMetricsTenant {
  tenantId: string;
  total: {
    success: number;
    failure: number;
    failureRate: number;
  };
  byBucket: AuditMetricsBucket[];
}

export interface AuditMetricsSnapshot {
  startedAt: string;
  uptimeSeconds: number;
  total: {
    success: number;
    failure: number;
    failureRate: number;
  };
  byBucket: AuditMetricsBucket[];
  // Phase 1.7 — per-tenant 차원.
  byTenant: AuditMetricsTenant[];
}

function bucketToView(name: string, b: AuditBucket): AuditMetricsBucket {
  const c = b.success + b.failure;
  return {
    name,
    success: b.success,
    failure: b.failure,
    failureRate: c === 0 ? 0 : b.failure / c,
    lastFailureAt: b.lastFailureAt
      ? new Date(b.lastFailureAt).toISOString()
      : null,
    lastFailureMessage: b.lastFailureMessage ?? null,
  };
}

function sortBuckets(buckets: AuditMetricsBucket[]): AuditMetricsBucket[] {
  return buckets.sort(
    (a, b) =>
      b.failure - a.failure ||
      b.success + b.failure - (a.success + a.failure),
  );
}

export function getAuditMetrics(): AuditMetricsSnapshot {
  const now = Date.now();
  const totalCount = state.total.success + state.total.failure;
  const failureRate = totalCount === 0 ? 0 : state.total.failure / totalCount;

  const buckets: AuditMetricsBucket[] = sortBuckets(
    [...state.byBucket.entries()].map(([name, b]) => bucketToView(name, b)),
  );

  const byTenant: AuditMetricsTenant[] = [...state.byTenant.entries()]
    .map(([tenantId, ts]) => {
      const c = ts.total.success + ts.total.failure;
      return {
        tenantId,
        total: {
          success: ts.total.success,
          failure: ts.total.failure,
          failureRate: c === 0 ? 0 : ts.total.failure / c,
        },
        byBucket: sortBuckets(
          [...ts.byBucket.entries()].map(([name, b]) =>
            bucketToView(name, b),
          ),
        ),
      };
    })
    // 실패 많은 tenant 가 상단 — Operator Console 빨간 ROW 정렬 (ADR-029 §5).
    .sort(
      (a, b) =>
        b.total.failure - a.total.failure ||
        b.total.success +
          b.total.failure -
          (a.total.success + a.total.failure),
    );

  return {
    startedAt: new Date(state.startedAt).toISOString(),
    uptimeSeconds: Math.floor((now - state.startedAt) / 1000),
    total: {
      success: state.total.success,
      failure: state.total.failure,
      failureRate,
    },
    byBucket: buckets,
    byTenant,
  };
}

/**
 * 테스트 전용 — 모든 카운터를 0 으로 리셋.
 */
export function resetAuditMetrics(): void {
  state = freshState();
}
