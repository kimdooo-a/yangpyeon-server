import { prisma } from "@/lib/prisma";
import { runReadonly } from "@/lib/pg/pool";
import { runIsolatedFunction } from "@/lib/runner/isolated";
import type { CronKindPayload } from "@/lib/types/supabase-clone";

/**
 * 세션 14 Cluster B: Cron 실행 디스패처.
 * Phase 1.5 (T1.5) — 07-adr-028-impl-spec §2.3:
 *   - SQL: main thread (PG connection 안정성 + advisory lock 호환).
 *   - FUNCTION/WEBHOOK: TenantWorkerPool 위임 (격리 + timeout + memory cap).
 *
 * 본 함수는 main thread 에서 호출되며 tenantId 를 명시적 인자로 받는다.
 * 라우팅 결정은 Phase 1.5 시작점 — Phase 3 pg-boss 진입 시 본 함수가 boss.work handler 로 이동.
 */

export interface CronRunResult {
  status: "SUCCESS" | "FAILURE" | "TIMEOUT";
  durationMs: number;
  message?: string;
}

// TODO(Phase 1.6, ADR-024 옵션 D + ADR-026): tenant manifest의 allowedFetchHosts로 이전.
// 멀티테넌트 전환 시 컨슈머별 manifest.ts 의 allowedFetchHosts[]가 우선, 본 fallback 은 글로벌 cron 전용.
function loadAllowedFetchHosts(): string[] {
  const env = process.env.CRON_ALLOWED_FETCH_HOSTS;
  if (env && env.trim()) {
    return env
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean);
  }
  return ["api.github.com", "stylelucky4u.com"];
}

const DEFAULT_ALLOWED_FETCH = loadAllowedFetchHosts();

// WEBHOOK fetch 호출 timeout — spike-baas-002 §3.X 부수 발견.
// 60초+ hang 위험 방지. 환경변수 override 가능.
const WEBHOOK_FETCH_TIMEOUT_MS =
  Number(process.env.CRON_WEBHOOK_FETCH_TIMEOUT_MS) > 0
    ? Number(process.env.CRON_WEBHOOK_FETCH_TIMEOUT_MS)
    : 30_000;

/**
 * SQL kind 실행 — main thread 에서 직접.
 * 07-adr-028-impl-spec §2.3 + §10.3 — worker 가 PG connection 잡으면 압박 위험,
 * SQL 은 main 의 readonly 풀로만 처리.
 */
async function dispatchSqlOnMain(
  job: { name: string; payload: unknown },
  started: number,
): Promise<CronRunResult> {
  const payload = (job.payload ?? {}) as Partial<CronKindPayload> &
    Record<string, unknown>;
  const sql = typeof payload.sql === "string" ? payload.sql : null;
  if (!sql) return failure(started, "payload.sql 누락");
  const result = await runReadonly(sql, [], { timeoutMs: 10_000 });
  return {
    status: "SUCCESS",
    durationMs: Date.now() - started,
    message: `${result.rowCount} rows`,
  };
}

/**
 * FUNCTION kind — main thread 에서 isolated-vm 호출 (현행 유지).
 * Phase 1.5 후속 PR (Phase 1.6+) 에서 worker pool 진입 + isolated-vm 결합 (07-adr-028-impl-spec §6).
 */
async function dispatchFunctionOnMain(
  payload: Partial<CronKindPayload> & Record<string, unknown>,
  started: number,
): Promise<CronRunResult> {
  const functionId =
    typeof payload.functionId === "string" ? payload.functionId : null;
  if (!functionId) return failure(started, "payload.functionId 누락");
  const fn = await prisma.edgeFunction.findUnique({
    where: { id: functionId },
  });
  if (!fn || !fn.enabled) {
    return failure(started, "함수를 찾을 수 없거나 비활성화");
  }
  const result = await runIsolatedFunction(fn.code, {
    input: payload.input ?? null,
    timeoutMs: 30_000,
    allowedFetchHosts: DEFAULT_ALLOWED_FETCH,
  });
  return {
    status: result.status,
    durationMs: result.durationMs,
    message: result.stderr || undefined,
  };
}

/**
 * WEBHOOK kind — main thread 에서 fetch (현행 유지).
 * Phase 1.5 후속에서 worker pool 진입 가능 (worker-script 의 runWebhook 사용).
 */
async function dispatchWebhookOnMain(
  job: { name: string; payload: unknown },
  started: number,
): Promise<CronRunResult> {
  const payload = (job.payload ?? {}) as Partial<CronKindPayload> &
    Record<string, unknown>;
  const webhookId =
    typeof payload.webhookId === "string" ? payload.webhookId : null;
  if (!webhookId) return failure(started, "payload.webhookId 누락");
  const hook = await prisma.webhook.findUnique({
    where: { id: webhookId },
  });
  if (!hook || !hook.enabled) {
    return failure(started, "웹훅을 찾을 수 없거나 비활성화");
  }
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (hook.headers && typeof hook.headers === "object") {
    for (const [k, v] of Object.entries(
      hook.headers as Record<string, unknown>,
    )) {
      if (typeof v === "string") headers[k] = v;
    }
  }
  const controller = new AbortController();
  const timeoutHandle = setTimeout(
    () => controller.abort(),
    WEBHOOK_FETCH_TIMEOUT_MS,
  );
  try {
    const res = await fetch(hook.url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        cron: job.name,
        event: hook.event,
        at: new Date().toISOString(),
      }),
      signal: controller.signal,
    });
    return {
      status: res.ok ? "SUCCESS" : "FAILURE",
      durationMs: Date.now() - started,
      message: `HTTP ${res.status}`,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        status: "TIMEOUT",
        durationMs: Date.now() - started,
        message: `webhook fetch timeout (${WEBHOOK_FETCH_TIMEOUT_MS}ms)`,
      };
    }
    throw err;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * dispatchCron — Phase 1.5 시그니처: (job, tenantId).
 *
 * 라우팅:
 *   - SQL: main thread (07-adr-028-impl-spec §2.3 — connection 안정성).
 *   - FUNCTION/WEBHOOK: 현 PR 에서는 main thread 유지 (현행 회귀 0).
 *     후속 PR 에서 TenantWorkerPool 로 격리 진입.
 *
 * 인자 변경 — registry.ts/runNow 가 tenantId 명시 전달.
 * 본 PR 의 worker pool/worker-script 는 별도 PR 에서 통합 (graceful migration).
 *
 * NOTE: tenantId 는 현재 SQL/FUNCTION/WEBHOOK 라우팅 결정에 사용되지 않음 —
 *       후속 PR 에서 TenantCronPolicy 기반 allowedFetchHosts 적용 시 사용.
 */
export async function dispatchCron(
  job: {
    id: string;
    name: string;
    kind: "SQL" | "FUNCTION" | "WEBHOOK";
    payload: unknown;
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _tenantId: string,
): Promise<CronRunResult> {
  const started = Date.now();
  try {
    const payload = (job.payload ?? {}) as Partial<CronKindPayload> &
      Record<string, unknown>;

    if (job.kind === "SQL") {
      return await dispatchSqlOnMain(job, started);
    }
    if (job.kind === "FUNCTION") {
      return await dispatchFunctionOnMain(payload, started);
    }
    if (job.kind === "WEBHOOK") {
      return await dispatchWebhookOnMain(job, started);
    }
    return failure(started, `지원하지 않는 kind: ${job.kind as string}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout =
      msg.toLowerCase().includes("timeout") || msg.includes("타임아웃");
    return {
      status: isTimeout ? "TIMEOUT" : "FAILURE",
      durationMs: Date.now() - started,
      message: msg,
    };
  }
}

function failure(started: number, message: string): CronRunResult {
  return { status: "FAILURE", durationMs: Date.now() - started, message };
}
