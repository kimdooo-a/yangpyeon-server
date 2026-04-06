import os from "os";
import { getDb } from "@/lib/db";
import { metricsHistory } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

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
}

/** 메트릭 한 번 수집하여 DB에 저장 */
export function collectOnce() {
  const db = getDb();
  const cpuUsage = getCpuUsage();
  const memoryTotal = os.totalmem();
  const memoryUsed = memoryTotal - os.freemem();

  db.insert(metricsHistory)
    .values({
      timestamp: new Date(),
      cpuUsage: Math.round(cpuUsage),
      // 바이트 → MB 단위로 저장 (정수)
      memoryUsed: Math.round(memoryUsed / 1024 / 1024),
      memoryTotal: Math.round(memoryTotal / 1024 / 1024),
    })
    .run();

  // 매 수집 시 오래된 데이터 정리 (부하 적음)
  pruneOldData();
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
