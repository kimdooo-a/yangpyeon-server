import os from "os";
import { getDb } from "@/lib/db";
import { metricsHistory, tenantMetricsHistory } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import {
  isWithinCardinalityCap,
  SAMPLING_RATE_HIGH_VOLUME,
} from "./cardinality-guard";

// 프로세스 수준 싱글톤 — 중복 시작 방지
let _intervalId: ReturnType<typeof setInterval> | null = null;
let _started = false;

/** CPU 사용률 계산 (os.cpus 기반) */
function getCpuUsage(): number {
  const cpus = os.cpus();
  const avg = cpus.reduce((acc, cpu) => {
    const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
    return acc + ((total - cpu.times.idle) / total) * 100;
  }, 0);
  return Math.round(avg / cpus.length);
}

/** 30일 이상 된 메트릭 데이터 자동 삭제 */
function pruneOldData() {
  const db = getDb();
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
  db.delete(metricsHistory)
    .where(sql`${metricsHistory.timestamp} < ${thirtyDaysAgo}`)
    .run();
  // Phase 1.7 (T1.7) — tenant_metrics_history 도 30일 retention 동시 적용.
  db.delete(tenantMetricsHistory)
    .where(sql`${tenantMetricsHistory.timestamp} < ${thirtyDaysAgo}`)
    .run();
}

/**
 * 메트릭 한 번 수집하여 DB에 저장.
 *
 * Phase 1.7 (T1.7) ADR-029 §2.1.3 — tenantId 옵션 (default 'default').
 * 시스템 메트릭은 'default' sentinel — 다중 테넌트 인스턴스 메트릭 분리는 Phase 4.
 */
export function collectOnce(tenantId: string = "default") {
  const db = getDb();
  const cpuUsage = getCpuUsage();
  const memoryTotal = os.totalmem();
  const memoryUsed = memoryTotal - os.freemem();

  db.insert(metricsHistory)
    .values({
      timestamp: new Date(),
      tenantId,
      cpuUsage: Math.round(cpuUsage),
      // 바이트 → MB 단위로 저장 (정수)
      memoryUsed: Math.round(memoryUsed / 1024 / 1024),
      memoryTotal: Math.round(memoryTotal / 1024 / 1024),
    })
    .run();

  // 매 수집 시 오래된 데이터 정리 (부하 적음)
  pruneOldData();
}

/**
 * Phase 1.7 (T1.7) ADR-029 §2.1.3 — per-tenant application metric 기록.
 *
 * 정책:
 *   - C1 cardinality guard — 100 series/tenant 캡 (cardinality-guard.ts).
 *   - C2 sampling — 캡 초과 시 raw event 10% 샘플링 후 기록.
 *   - fail-soft — DB 에러는 console.warn 로그만 (도메인 흐름 무중단, ADR-021 정신).
 *
 * @param tenantId  tenant slug ('almanac' / 'default' / ...).
 * @param metricName  api_calls / query_duration_p95 / cron_success / edge_fn_invocations / error_count.
 * @param value  실수 (latency ms, count, ratio 등).
 * @param bucketKey  옵션 — route_path / status_class 등 추가 차원 (cardinality 검사 대상).
 */
export function recordTenantMetric(
  tenantId: string,
  metricName: string,
  value: number,
  bucketKey?: string,
): void {
  if (!isWithinCardinalityCap(tenantId, metricName, bucketKey)) {
    // C2 sampling — quota 초과 시 down-sample (10% 통과).
    if (Math.random() > SAMPLING_RATE_HIGH_VOLUME) return;
  }
  try {
    const db = getDb();
    db.insert(tenantMetricsHistory)
      .values({
        timestamp: new Date(),
        tenantId,
        metricName,
        value,
        bucketKey: bucketKey ?? null,
      })
      .run();
  } catch (err) {
    // 메트릭은 도메인 흐름을 깨뜨리지 않는다 (ADR-021 fail-soft 정신 동일).
    console.warn("[metrics] recordTenantMetric failed", {
      tenantId,
      metricName,
      bucketKey,
      error:
        err instanceof Error
          ? { message: err.message, stack: err.stack }
          : err,
    });
  }
}

/** 수집기 시작 — 1분마다 메트릭 수집 */
export function startCollector() {
  if (_started) return;
  _started = true;

  // 즉시 1회 수집
  collectOnce();

  // 1분 간격 수집
  _intervalId = setInterval(() => {
    try {
      collectOnce();
    } catch {
      // 수집 실패 시 다음 주기에 재시도
    }
  }, 60_000);
}

/** 수집기 중지 (테스트/정리용) */
export function stopCollector() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
  _started = false;
}
