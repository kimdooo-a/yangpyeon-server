import { prisma } from "@/lib/prisma";
import { safeAudit } from "@/lib/audit-log-db";
import { dispatchCron } from "./runner";
import { shouldDispatch, recordResult } from "./circuit-breaker";
import {
  tryAdvisoryLock,
  releaseAdvisoryLock,
  tenantJobLockKey,
} from "./lock";

/**
 * 세션 14 Cluster B: 프로세스 내 Cron 레지스트리.
 * Phase 1.5 (T1.5): 멀티테넌트 차원 추가 + advisory lock + circuit breaker 통합.
 *
 * 전략:
 * - 매분(60초) tick. 각 CronJob의 schedule을 간이 파서로 해석.
 * - 지원 schedule:
 *   - "* * * * *" (분/시/일/월/요일) — 숫자/와일드카드/쉼표 목록만 지원
 *   - "every Nm" / "every Nh" (커스텀 짧은 표기)
 * - enable/disable 은 addJob/removeJob/updateJob 으로 반영.
 * - `ensureStarted()` 는 멱등.
 *
 * 멀티테넌트 차원 (07-adr-028-impl-spec §2.3):
 *   - jobsByTenant: tenantId → jobId → ScheduledJob.
 *   - lastTickMinute / running 키: `${tenantId}:${jobId}`.
 *   - tenantId 미설정(legacy) job 은 "default" 로 fallback.
 *   - tick 마다 (1) shouldDispatch (2) tryAdvisoryLock (3) dispatchCron (4) recordResult (5) release.
 *   - lock holder = main thread (worker terminate 시 lock 자동 해제 함정 회피).
 */

export interface ScheduledJob {
  id: string;
  /** Phase 1.5: tenant 차원. row 의 tenantId 가 null 이면 "default" fallback. */
  tenantId: string;
  name: string;
  schedule: string;
  kind: "SQL" | "FUNCTION" | "WEBHOOK";
  payload: unknown;
}

interface RegistryState {
  started: boolean;
  tickHandle: NodeJS.Timeout | null;
  /** tenantId → jobId → job */
  jobsByTenant: Map<string, Map<string, ScheduledJob>>;
  /** key = `${tenantId}:${jobId}` → minute key */
  lastTickMinute: Map<string, number>;
  /** key = `${tenantId}:${jobId}` */
  running: Set<string>;
}

/** legacy(tenantId NULL) job 의 fallback tenant. Phase 0.3 default tenant 시드와 정합. */
const DEFAULT_TENANT = "default";

declare global {
  // eslint-disable-next-line no-var
  var __cronRegistry: RegistryState | undefined;
}

function state(): RegistryState {
  if (!globalThis.__cronRegistry) {
    globalThis.__cronRegistry = {
      started: false,
      tickHandle: null,
      jobsByTenant: new Map(),
      lastTickMinute: new Map(),
      running: new Set(),
    };
  }
  return globalThis.__cronRegistry;
}

function key(tenantId: string, jobId: string): string {
  return `${tenantId}:${jobId}`;
}

function setJob(s: RegistryState, job: ScheduledJob): void {
  let bucket = s.jobsByTenant.get(job.tenantId);
  if (!bucket) {
    bucket = new Map();
    s.jobsByTenant.set(job.tenantId, bucket);
  }
  bucket.set(job.id, job);
}

function deleteJob(s: RegistryState, tenantId: string, jobId: string): void {
  const bucket = s.jobsByTenant.get(tenantId);
  if (!bucket) return;
  bucket.delete(jobId);
  if (bucket.size === 0) s.jobsByTenant.delete(tenantId);
}

/**
 * 단순 cron 표현식 매치.
 * 분(0-59), 시(0-23), 일(1-31), 월(1-12), 요일(0-6)
 * 각 필드: "*" 또는 숫자 쉼표 목록 (예: "0,15,30,45")
 * 별도로 "every Nm" / "every Nh"도 지원.
 */
export function matchesSchedule(schedule: string, now: Date): boolean {
  const trimmed = schedule.trim();
  const everyMatch = /^every\s+(\d+)\s*([mh])$/i.exec(trimmed);
  if (everyMatch) {
    const n = Number(everyMatch[1]);
    const unit = everyMatch[2].toLowerCase();
    if (!Number.isFinite(n) || n <= 0) return false;
    if (unit === "m") {
      return now.getSeconds() < 60 && now.getMinutes() % n === 0;
    }
    if (unit === "h") {
      return now.getMinutes() === 0 && now.getHours() % n === 0;
    }
    return false;
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length !== 5) return false;
  const [m, h, dom, mon, dow] = parts;
  return (
    fieldMatch(m, now.getMinutes()) &&
    fieldMatch(h, now.getHours()) &&
    fieldMatch(dom, now.getDate()) &&
    fieldMatch(mon, now.getMonth() + 1) &&
    fieldMatch(dow, now.getDay())
  );
}

function fieldMatch(field: string, value: number): boolean {
  if (field === "*") return true;
  return field.split(",").some((chunk) => {
    const n = Number(chunk);
    return Number.isFinite(n) && n === value;
  });
}

interface CronRow {
  id: string;
  name: string;
  schedule: string;
  kind: string;
  payload: unknown;
  tenantId: string | null;
  enabled: boolean;
}

function rowToJob(row: CronRow): ScheduledJob {
  return {
    id: row.id,
    tenantId: row.tenantId ?? DEFAULT_TENANT,
    name: row.name,
    schedule: row.schedule,
    kind: row.kind as "SQL" | "FUNCTION" | "WEBHOOK",
    payload: row.payload,
  };
}

async function loadAll(): Promise<void> {
  const s = state();
  const rows = await prisma.cronJob.findMany({ where: { enabled: true } });
  s.jobsByTenant.clear();
  for (const r of rows) {
    setJob(s, rowToJob(r as unknown as CronRow));
  }
}

async function tick(): Promise<void> {
  const s = state();
  const now = new Date();
  const minuteKey = Math.floor(now.getTime() / 60_000);

  for (const [, jobs] of s.jobsByTenant) {
    for (const job of jobs.values()) {
      const k = key(job.tenantId, job.id);
      if (s.running.has(k)) continue;
      if (s.lastTickMinute.get(k) === minuteKey) continue;
      try {
        if (!matchesSchedule(job.schedule, now)) continue;
      } catch {
        continue;
      }
      s.lastTickMinute.set(k, minuteKey);

      // circuit breaker check (실패 누적 시 skip).
      // shouldDispatch 내부에서 OPEN 상태 + cooldown 도 처리.
      let allowed = false;
      try {
        allowed = await shouldDispatch(job.id);
      } catch {
        // circuit-breaker DB 호출 실패는 fail-open (원래 동작 유지).
        allowed = true;
      }
      if (!allowed) continue;

      // per-(tenant,job) advisory lock — main thread 가 holder.
      const lockKey = tenantJobLockKey(job.tenantId, job.id);
      let got = false;
      try {
        got = await tryAdvisoryLock(lockKey);
      } catch {
        // lock 획득 실패는 다음 tick 에서 재시도.
        got = false;
      }
      if (!got) continue;

      // dispatch — fire-and-forget, 결과는 runJob 내부에서 처리.
      void runJob(job, lockKey);
    }
  }
}

async function runJob(job: ScheduledJob, lockKey: bigint): Promise<void> {
  const s = state();
  const k = key(job.tenantId, job.id);
  s.running.add(k);
  try {
    const result = await dispatchCron(job, job.tenantId);
    await prisma.cronJob.update({
      where: { id: job.id },
      data: {
        lastRunAt: new Date(),
        lastStatus: `${result.status}${result.message ? `: ${result.message}` : ""}`,
      },
    });
    // circuit-breaker 결과 반영 — SUCCESS/FAILURE/TIMEOUT 만 카운터 영향.
    if (
      result.status === "SUCCESS" ||
      result.status === "FAILURE" ||
      result.status === "TIMEOUT"
    ) {
      await recordResult(job.id, result.status === "SUCCESS").catch(() => {
        // ADR-021 cross-cutting: circuit-breaker 실패가 cron 루프를 멈추면 안 됨.
      });
    }
  } catch (err) {
    // CK-38 + 07-adr-028-impl-spec §4.3: 루프는 지속하되 실패는 추적 가능해야 한다.
    console.warn("[cron] runJob failed (loop continues)", {
      jobId: job.id,
      tenantId: job.tenantId,
      name: job.name,
      kind: job.kind,
      error:
        err instanceof Error
          ? { message: err.message, stack: err.stack }
          : err,
    });
    safeAudit(
      {
        timestamp: new Date().toISOString(),
        method: "CRON",
        path: `/cron/${job.name}`,
        ip: "system",
        action: "cron.runjob.failure",
        detail:
          err instanceof Error
            ? `${err.message} (tenant=${job.tenantId})`
            : `${String(err)} (tenant=${job.tenantId})`,
      },
      "cron.runJob",
    );
  } finally {
    s.running.delete(k);
    // lock holder 해제 — main thread 가 책임 (07-adr-028-impl-spec §2.4).
    try {
      await releaseAdvisoryLock(lockKey);
    } catch {
      // lock 이미 해제됐거나 connection 죽음 — silent (PG 가 알아서 정리).
    }
  }
}

/** 멱등 초기화 — 처음 호출 시만 로드 + tick 시작 */
export function ensureStarted(): void {
  const s = state();
  if (s.started) return;
  s.started = true;
  void loadAll();
  s.tickHandle = setInterval(() => {
    void tick();
  }, 60_000);
  // 즉시 한번 체크(최초 로드 후 다음 분까지 기다리지 않음)
  setTimeout(() => void tick(), 1_000);
}

export async function addJob(id: string): Promise<void> {
  const s = state();
  const row = (await prisma.cronJob.findUnique({ where: { id } })) as
    | CronRow
    | null;
  if (!row || !row.enabled) return;
  setJob(s, rowToJob(row));
}

export async function updateJob(id: string): Promise<void> {
  const s = state();
  const row = (await prisma.cronJob.findUnique({ where: { id } })) as
    | CronRow
    | null;
  if (!row || !row.enabled) {
    // 모든 tenant bucket 에서 삭제 (tenant 변경된 경우 대응).
    for (const [tid, bucket] of s.jobsByTenant) {
      if (bucket.has(id)) deleteJob(s, tid, id);
    }
    return;
  }
  // 기존 위치에서 제거 후 새 tenant 로 재등록 (tenant 변경 안전).
  for (const [tid, bucket] of s.jobsByTenant) {
    if (bucket.has(id)) deleteJob(s, tid, id);
  }
  setJob(s, rowToJob(row));
}

export function removeJob(id: string): void {
  const s = state();
  for (const [tid, bucket] of s.jobsByTenant) {
    if (bucket.has(id)) deleteJob(s, tid, id);
  }
}

/** ADMIN 의 수동 실행 — schedule 무시, 즉시 1회. circuit/lock 무시 (운영자 의도 우선). */
export async function runNow(
  id: string,
): Promise<{ status: string; message?: string }> {
  const row = (await prisma.cronJob.findUnique({ where: { id } })) as
    | CronRow
    | null;
  if (!row) throw new Error("존재하지 않는 Cron Job");
  const tenantId = row.tenantId ?? DEFAULT_TENANT;
  const result = await dispatchCron(
    {
      id: row.id,
      name: row.name,
      kind: row.kind as "SQL" | "FUNCTION" | "WEBHOOK",
      payload: row.payload,
    },
    tenantId,
  );
  await prisma.cronJob.update({
    where: { id: row.id },
    data: {
      lastRunAt: new Date(),
      lastStatus: `${result.status}${result.message ? `: ${result.message}` : ""}`,
    },
  });
  return { status: result.status, message: result.message };
}
