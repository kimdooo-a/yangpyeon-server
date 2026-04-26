import { prisma } from "@/lib/prisma";
import { runReadonly } from "@/lib/pg/pool";
import { runIsolatedFunction } from "@/lib/runner/isolated";
import type { CronKindPayload } from "@/lib/types/supabase-clone";

/**
 * 세션 14 Cluster B: Cron 실행 디스패처.
 * CronJob 한 건을 kind별로 실행한다.
 *
 * - SQL: 읽기 전용 풀에서 실행 (app_readonly 롤 + statement_timeout)
 * - FUNCTION: EdgeFunction 코드 로드 → node:vm 격리 실행
 * - WEBHOOK: Webhook 레코드 로드 → POST 호출 (AbortController + timeout)
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

export async function dispatchCron(job: {
  id: string;
  name: string;
  kind: "SQL" | "FUNCTION" | "WEBHOOK";
  payload: unknown;
}): Promise<CronRunResult> {
  const started = Date.now();
  try {
    const payload = (job.payload ?? {}) as Partial<CronKindPayload> & Record<string, unknown>;

    if (job.kind === "SQL") {
      const sql = typeof payload.sql === "string" ? payload.sql : null;
      if (!sql) return failure(started, "payload.sql 누락");
      const result = await runReadonly(sql, [], { timeoutMs: 10_000 });
      return {
        status: "SUCCESS",
        durationMs: Date.now() - started,
        message: `${result.rowCount} rows`,
      };
    }

    if (job.kind === "FUNCTION") {
      const functionId = typeof payload.functionId === "string" ? payload.functionId : null;
      if (!functionId) return failure(started, "payload.functionId 누락");
      const fn = await prisma.edgeFunction.findUnique({ where: { id: functionId } });
      if (!fn || !fn.enabled) return failure(started, "함수를 찾을 수 없거나 비활성화");
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

    if (job.kind === "WEBHOOK") {
      const webhookId = typeof payload.webhookId === "string" ? payload.webhookId : null;
      if (!webhookId) return failure(started, "payload.webhookId 누락");
      const hook = await prisma.webhook.findUnique({ where: { id: webhookId } });
      if (!hook || !hook.enabled) return failure(started, "웹훅을 찾을 수 없거나 비활성화");
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (hook.headers && typeof hook.headers === "object") {
        for (const [k, v] of Object.entries(hook.headers as Record<string, unknown>)) {
          if (typeof v === "string") headers[k] = v;
        }
      }
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), WEBHOOK_FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(hook.url, {
          method: "POST",
          headers,
          body: JSON.stringify({ cron: job.name, event: hook.event, at: new Date().toISOString() }),
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

    return failure(started, `지원하지 않는 kind: ${job.kind}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.toLowerCase().includes("timeout") || msg.includes("타임아웃");
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
