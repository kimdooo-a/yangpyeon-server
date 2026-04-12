import { prisma } from "@/lib/prisma";
import { dispatchCron } from "./runner";

/**
 * 세션 14 Cluster B: 프로세스 내 Cron 레지스트리.
 *
 * 전략:
 * - 매분(60초) tick. 각 CronJob의 schedule을 간이 파서로 해석하여 "지금 실행할지" 판정.
 * - 지원 schedule:
 *   - "* * * * *" (분/시/일/월/요일) — 숫자/와일드카드/쉼표 목록만 지원
 *   - "every Nm" / "every Nh" (커스텀 짧은 표기)
 * - enable/disable은 addJob/removeJob/updateJob으로 반영.
 * - `ensureStarted()`는 멱등. API route 첫 호출에서 한 번만 tick을 시작.
 */

interface ScheduledJob {
  id: string;
  name: string;
  schedule: string;
  kind: "SQL" | "FUNCTION" | "WEBHOOK";
  payload: unknown;
}

interface RegistryState {
  started: boolean;
  tickHandle: NodeJS.Timeout | null;
  jobs: Map<string, ScheduledJob>;
  /** 마지막 실행 분 단위 타임스탬프 (중복 방지) */
  lastTickMinute: Map<string, number>;
  running: Set<string>;
}

declare global {
  // eslint-disable-next-line no-var
  var __cronRegistry: RegistryState | undefined;
}

function state(): RegistryState {
  if (!globalThis.__cronRegistry) {
    globalThis.__cronRegistry = {
      started: false,
      tickHandle: null,
      jobs: new Map(),
      lastTickMinute: new Map(),
      running: new Set(),
    };
  }
  return globalThis.__cronRegistry;
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

async function loadAll(): Promise<void> {
  const s = state();
  const rows = await prisma.cronJob.findMany({ where: { enabled: true } });
  s.jobs.clear();
  for (const r of rows) {
    s.jobs.set(r.id, {
      id: r.id,
      name: r.name,
      schedule: r.schedule,
      kind: r.kind as "SQL" | "FUNCTION" | "WEBHOOK",
      payload: r.payload,
    });
  }
}

async function tick(): Promise<void> {
  const s = state();
  const now = new Date();
  const minuteKey = Math.floor(now.getTime() / 60_000);
  for (const job of s.jobs.values()) {
    if (s.running.has(job.id)) continue;
    if (s.lastTickMinute.get(job.id) === minuteKey) continue;
    try {
      if (!matchesSchedule(job.schedule, now)) continue;
    } catch {
      continue;
    }
    s.lastTickMinute.set(job.id, minuteKey);
    void runJob(job);
  }
}

async function runJob(job: ScheduledJob): Promise<void> {
  const s = state();
  s.running.add(job.id);
  try {
    const result = await dispatchCron(job);
    await prisma.cronJob.update({
      where: { id: job.id },
      data: { lastRunAt: new Date(), lastStatus: `${result.status}${result.message ? `: ${result.message}` : ""}` },
    });
  } catch {
    // 무시 — 루프 지속
  } finally {
    s.running.delete(job.id);
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
  const row = await prisma.cronJob.findUnique({ where: { id } });
  if (!row || !row.enabled) return;
  s.jobs.set(row.id, {
    id: row.id,
    name: row.name,
    schedule: row.schedule,
    kind: row.kind as "SQL" | "FUNCTION" | "WEBHOOK",
    payload: row.payload,
  });
}

export async function updateJob(id: string): Promise<void> {
  const s = state();
  const row = await prisma.cronJob.findUnique({ where: { id } });
  if (!row || !row.enabled) {
    s.jobs.delete(id);
    return;
  }
  s.jobs.set(row.id, {
    id: row.id,
    name: row.name,
    schedule: row.schedule,
    kind: row.kind as "SQL" | "FUNCTION" | "WEBHOOK",
    payload: row.payload,
  });
}

export function removeJob(id: string): void {
  state().jobs.delete(id);
}

/** ADMIN의 수동 실행 — schedule 무시, 즉시 1회 */
export async function runNow(id: string): Promise<{ status: string; message?: string }> {
  const row = await prisma.cronJob.findUnique({ where: { id } });
  if (!row) throw new Error("존재하지 않는 Cron Job");
  const result = await dispatchCron({
    id: row.id,
    name: row.name,
    kind: row.kind as "SQL" | "FUNCTION" | "WEBHOOK",
    payload: row.payload,
  });
  await prisma.cronJob.update({
    where: { id: row.id },
    data: {
      lastRunAt: new Date(),
      lastStatus: `${result.status}${result.message ? `: ${result.message}` : ""}`,
    },
  });
  return { status: result.status, message: result.message };
}
