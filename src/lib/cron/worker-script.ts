/**
 * Cron worker entry point — 07-adr-028-impl-spec §2.2.
 *
 * 본 스크립트는 build 후 .js 로 컴파일되어 `new Worker(...)` 의 entry path 로 사용된다.
 * (현재는 standalone 빌드/Next.js worker 통합 미정 — Phase 1.5 후속 PR 에서 빌드 체인 확정.)
 *
 * 책임:
 *   - workerData 로 받은 job 을 kind 별로 실행 (FUNCTION / WEBHOOK).
 *   - SQL kind 는 main thread 처리 — worker 진입 시 throw.
 *   - parentPort 로 결과 메시지 송신 (SUCCESS / FAILURE / TIMEOUT).
 *   - shutdown 신호(메인의 1차 graceful) 수신 시 abortController.abort().
 *   - structured log: stdout JSON 1줄 (CK-38 + ADR-021 패턴, PM2 logrotate 호환).
 *
 * 격리 한계 (spike-baas-002 §3.1):
 *   - V8 heap 만 격리. native binding/FD/process env 는 공유.
 *   - resourceLimits 는 caller(TenantWorkerPool) 가 Worker 생성 옵션으로 적용.
 */
import { parentPort, workerData } from "node:worker_threads";

interface WorkerInput {
  job: {
    id: string;
    name: string;
    kind: "SQL" | "FUNCTION" | "WEBHOOK";
    payload: unknown;
  };
  policy: {
    jobTimeoutMs: number;
    allowedFetchHosts: string[];
    webhookTimeoutMs: number;
  };
}

const { job, policy } = workerData as WorkerInput;
const abortController = new AbortController();

/** CK-38 패턴: structured log (stdout JSON 1줄, PM2 logrotate 자동 수집). */
function log(
  level: "info" | "warn" | "error",
  event: string,
  extra: Record<string, unknown> = {},
): void {
  process.stdout.write(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      worker: "cron",
      jobId: job.id,
      jobKind: job.kind,
      event,
      ...extra,
    }) + "\n",
  );
}

parentPort?.on("message", (msg: { type?: string }) => {
  if (msg?.type === "shutdown") {
    log("warn", "worker.shutdown-requested");
    abortController.abort();
  }
});

/**
 * WEBHOOK 실행 — fetch + AbortController + allowedFetchHosts 검증.
 *
 * 07-adr-028-impl-spec §4.2 + §6.2 — webhookTimeoutMs 정책 적용.
 * payload 형태:
 *   { url: string, headers?: Record<string,string>, body?: unknown, event?: string }
 *
 * 보안: allowedFetchHosts 가 비어 있으면 모든 호스트 허용 (Stage 1 기본값).
 *       Stage 3 부터는 빈 리스트 = 거부 정책으로 격상 (별도 PR).
 */
async function runWebhook(
  payload: unknown,
  pol: WorkerInput["policy"],
  signal: AbortSignal,
): Promise<string> {
  const p = (payload ?? {}) as {
    url?: string;
    headers?: Record<string, string>;
    body?: unknown;
    event?: string;
  };
  if (!p.url || typeof p.url !== "string") {
    throw new Error("webhook payload.url 누락");
  }

  // allowedFetchHosts 검증 (비어있으면 통과 — Stage 1).
  if (pol.allowedFetchHosts.length > 0) {
    let host: string;
    try {
      host = new URL(p.url).host;
    } catch {
      throw new Error(`webhook url 형식 오류: ${p.url}`);
    }
    if (!pol.allowedFetchHosts.includes(host)) {
      throw new Error(`webhook host 차단: ${host} (allowedFetchHosts 외)`);
    }
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(p.headers ?? {}),
  };

  // 외부 abort 와 webhookTimeoutMs 모두 결합.
  const localAc = new AbortController();
  const t = setTimeout(() => localAc.abort(), pol.webhookTimeoutMs);
  const onParentAbort = () => localAc.abort();
  signal.addEventListener("abort", onParentAbort, { once: true });

  try {
    const res = await fetch(p.url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        cron: job.name,
        event: p.event,
        payload: p.body,
        at: new Date().toISOString(),
      }),
      signal: localAc.signal,
    });
    if (!res.ok) {
      return `HTTP ${res.status}`;
    }
    return `HTTP ${res.status}`;
  } finally {
    clearTimeout(t);
    signal.removeEventListener("abort", onParentAbort);
  }
}

/**
 * FUNCTION 실행 — TODO Phase 1.6+ : isolated-vm v6 통합 (ADR-009 L1).
 *
 * 본 PR 에서는 placeholder 만. 실 구현 시:
 *   - main thread RPC 로 EdgeFunction 코드 fetch.
 *   - isolated-vm Isolate 생성 + script.run({ timeout: jobTimeoutMs }).
 *   - allowedFetchHosts 를 Isolate 환경에 주입.
 */
async function runFunction(
  _payload: unknown,
  _pol: WorkerInput["policy"],
  _signal: AbortSignal,
): Promise<string> {
  // 의도적 throw — 본 Phase 에서는 미지원 표시.
  throw new Error(
    "isolated-vm 통합은 별도 PR (Phase 1.6+) — runFunction 미구현",
  );
}

(async () => {
  const started = Date.now();
  try {
    log("info", "worker.start");
    let message: string | undefined;

    if (job.kind === "WEBHOOK") {
      message = await runWebhook(job.payload, policy, abortController.signal);
    } else if (job.kind === "FUNCTION") {
      message = await runFunction(job.payload, policy, abortController.signal);
    } else if (job.kind === "SQL") {
      throw new Error(
        "SQL kind 는 main thread 에서 처리해야 함 (dispatchCron 라우팅 오류)",
      );
    } else {
      throw new Error(`unknown kind: ${job.kind as string}`);
    }

    log("info", "worker.success", { durationMs: Date.now() - started });
    parentPort?.postMessage({ status: "SUCCESS", message });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout =
      abortController.signal.aborted ||
      msg.toLowerCase().includes("timeout") ||
      msg.toLowerCase().includes("aborted");
    log(isTimeout ? "warn" : "error", "worker.fail", {
      durationMs: Date.now() - started,
      error: msg,
      stack: err instanceof Error ? err.stack : undefined,
    });
    parentPort?.postMessage({
      status: isTimeout ? "TIMEOUT" : "FAILURE",
      message: msg,
    });
  }
})();
