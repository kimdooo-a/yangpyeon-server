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

const MAX_BUCKETS = 200;

interface AuditBucket {
  success: number;
  failure: number;
  lastFailureAt?: number;
  lastFailureMessage?: string;
}

interface AuditState {
  total: { success: number; failure: number };
  // Map insertion-order 이용 — 캡 도달 시 가장 오래 들어온 버킷 evict.
  byBucket: Map<string, AuditBucket>;
  startedAt: number;
}

function freshState(): AuditState {
  return {
    total: { success: 0, failure: 0 },
    byBucket: new Map(),
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
 * safeAudit 결과를 카운터에 반영. 절대 throw 하지 않는다.
 */
export function recordAuditOutcome(
  success: boolean,
  context: string,
  error?: unknown,
): void {
  try {
    if (success) state.total.success += 1;
    else state.total.failure += 1;

    const name = bucketName(context);
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

export interface AuditMetricsSnapshot {
  startedAt: string;
  uptimeSeconds: number;
  total: {
    success: number;
    failure: number;
    failureRate: number;
  };
  byBucket: AuditMetricsBucket[];
}

export function getAuditMetrics(): AuditMetricsSnapshot {
  const now = Date.now();
  const totalCount = state.total.success + state.total.failure;
  const failureRate = totalCount === 0 ? 0 : state.total.failure / totalCount;

  const buckets: AuditMetricsBucket[] = [...state.byBucket.entries()]
    .map(([name, b]) => {
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
    })
    // 실패 많은 순 → 호출량 많은 순.
    .sort(
      (a, b) =>
        b.failure - a.failure ||
        b.success + b.failure - (a.success + a.failure),
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
  };
}

/**
 * 테스트 전용 — 모든 카운터를 0 으로 리셋.
 */
export function resetAuditMetrics(): void {
  state = freshState();
}
