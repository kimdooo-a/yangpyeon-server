// Phase 1.7 (T1.7) ADR-029 §3 — Cardinality 정책 가드 (C1 + C2).
//
// 정책:
//   - C1: per_tenant_per_metric_max_series — 100 unique label combo / tenant.
//   - C2: auto sampling — tenant 호출량 > 10K/min 시 raw event 10% sampling.
//   - C3: aggregate 우선 — retention cron 의 영역 (본 모듈은 아님).
//
// 한계 검증 (ADR-029 §3.2):
//   - effective cap = 20 tenant × 50 metric × 100 series = 100K series → SQLite 단독 가능.
//   - 한계 도달 시 cardinality_drop_count 카운터 증가 (audit-metrics 별도 카운터).
//
// 본 모듈은 in-process state (PM2 reload 시 reset). 누적 분석은 audit_logs / tenant_metrics_history.

/** C1 — tenant 당 metric 별 (또는 metric:bucket 별) 최대 series 수. */
export const MAX_SERIES_PER_TENANT = 100;

/** C2 — sampling 임계 (tenant 의 분당 호출 수). */
export const THRESHOLD_CALLS_PER_MIN = 10_000;

/** C2 — 임계 초과 시 적용되는 샘플링 비율 (0.1 = 10%). */
export const SAMPLING_RATE_HIGH_VOLUME = 0.1;

const tenantSeries = new Map<string, Set<string>>();

/** 운영자 모니터링 용 — 누적 drop 횟수. PM2 reload 시 reset. */
let cardinalityDropCount = 0;

/**
 * series 가 cardinality cap 안에 들어오는지 검사.
 *
 * @returns true — 기존 series 또는 cap 미만의 신규 series → 기록 진행.
 *          false — cap 초과 신규 series → drop 또는 sampling 적용 (호출자 결정).
 *
 * series 키는 `metricName:bucketKey` (bucketKey 미지정 시 `metricName:`).
 */
export function isWithinCardinalityCap(
  tenantId: string,
  metricName: string,
  bucketKey?: string,
): boolean {
  const seriesKey = `${metricName}:${bucketKey ?? ""}`;
  let set = tenantSeries.get(tenantId);
  if (!set) {
    set = new Set();
    tenantSeries.set(tenantId, set);
  }
  if (set.has(seriesKey)) return true; // 기존 series — OK
  if (set.size >= MAX_SERIES_PER_TENANT) {
    cardinalityDropCount += 1;
    return false; // C1 위반
  }
  set.add(seriesKey);
  return true;
}

/**
 * 누적 drop 횟수 — 운영자가 cardinality 폭주 인지하는 단일 카운터.
 *
 * 본 카운터는 audit-metrics 의 byBucket "cardinality_drop" 등으로 표면화 가능
 * (Phase 2 Operator Console).
 */
export function getCardinalityDropCount(): number {
  return cardinalityDropCount;
}

/**
 * 테스트 전용 — 모든 state 초기화.
 */
export function resetCardinalityGuard(): void {
  tenantSeries.clear();
  cardinalityDropCount = 0;
}

/**
 * 운영 진단 — 현재 추적 중인 tenant 별 series 수.
 */
export function getCardinalitySnapshot(): Array<{
  tenantId: string;
  seriesCount: number;
}> {
  return [...tenantSeries.entries()].map(([tenantId, set]) => ({
    tenantId,
    seriesCount: set.size,
  }));
}
