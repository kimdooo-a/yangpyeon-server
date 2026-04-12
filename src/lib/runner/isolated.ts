import * as vm from "node:vm";
import { setTimeout as delay } from "node:timers/promises";
import type { EdgeFunctionContext, EdgeFunctionRunResult } from "@/lib/types/supabase-clone";

/**
 * 세션 14: Edge Functions / Cron lite 실행기
 *
 * 보안 가드레일(ADR-002):
 * - node:vm Context 격리(전역 없음) — child_process, fs, net 모두 차단
 * - 타임아웃(기본 30s) + CPU 제한(vm.runInContext `timeout`)
 * - 네트워크: safeFetch 화이트리스트만 주입 (사설 IP/localhost/169.254 차단)
 * - 코드 크기: 256KB 제한
 * - require/import 금지 (sandbox에 주입 안 함)
 *
 * Why: vm2는 DEPRECATED 취약. isolated-vm 도입은 v2. v1은 node:vm + 화이트리스트.
 * How to apply: ADMIN 전용 UI에서만 호출. 외부 요청 경로 금지.
 */

const MAX_CODE_SIZE = 256 * 1024;
const DEFAULT_TIMEOUT = 30_000;

const PRIVATE_IP_REGEX =
  /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1|fe80::|fc00:)/;

function isSafeHost(host: string, allowed: string[]): boolean {
  if (PRIVATE_IP_REGEX.test(host)) return false;
  if (host === "localhost") return false;
  if (allowed.length === 0) return false;
  return allowed.some((a) => host === a || host.endsWith(`.${a}`));
}

function buildSafeFetch(allowedHosts: string[]) {
  return async (input: string, init?: RequestInit): Promise<Response> => {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      throw new Error("유효하지 않은 URL");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("http/https만 허용됨");
    }
    if (!isSafeHost(url.hostname, allowedHosts)) {
      throw new Error(`호스트 차단: ${url.hostname} (화이트리스트 확인 필요)`);
    }
    return fetch(url, init);
  };
}

/**
 * 코드를 격리 컨텍스트에서 실행.
 * 코드는 `async function run(input) { ... }` 형태여야 하며 반환값이 결과.
 * stdout/stderr는 console.log/error 캡처.
 */
export async function runIsolatedFunction(
  code: string,
  ctx: EdgeFunctionContext
): Promise<EdgeFunctionRunResult> {
  const started = Date.now();
  if (code.length > MAX_CODE_SIZE) {
    return {
      status: "FAILURE",
      durationMs: 0,
      stdout: "",
      stderr: `코드 크기 초과(${code.length}B > ${MAX_CODE_SIZE}B)`,
    };
  }

  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  const timeoutMs = ctx.timeoutMs ?? DEFAULT_TIMEOUT;

  const sandbox = {
    fetch: buildSafeFetch(ctx.allowedFetchHosts),
    console: {
      log: (...args: unknown[]) => stdoutLines.push(args.map(formatArg).join(" ")),
      error: (...args: unknown[]) => stderrLines.push(args.map(formatArg).join(" ")),
      warn: (...args: unknown[]) => stderrLines.push(args.map(formatArg).join(" ")),
      info: (...args: unknown[]) => stdoutLines.push(args.map(formatArg).join(" ")),
    },
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, Math.min(ms, timeoutMs)),
    JSON,
    Math,
    Date,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    Buffer: {
      from: Buffer.from.bind(Buffer),
    },
    crypto: globalThis.crypto,
  };

  const context = vm.createContext(sandbox, {
    name: "edge-function-lite",
    codeGeneration: { strings: false, wasm: false },
  });

  const wrapped = `(async () => { ${code}\nif (typeof run === "function") { return await run(__INPUT__); } })()`;

  try {
    const script = new vm.Script(wrapped.replace("__INPUT__", JSON.stringify(ctx.input ?? null)), {
      filename: "edge-function.js",
    });
    const execution = script.runInContext(context, { timeout: timeoutMs, displayErrors: true });
    const returnValue = await Promise.race([
      execution,
      delay(timeoutMs + 500).then(() => {
        throw new Error(`실행 타임아웃(${timeoutMs}ms)`);
      }),
    ]);
    return {
      status: "SUCCESS",
      durationMs: Date.now() - started,
      stdout: stdoutLines.join("\n"),
      stderr: stderrLines.join("\n"),
      returnValue,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.includes("타임아웃") || msg.toLowerCase().includes("timeout");
    return {
      status: isTimeout ? "TIMEOUT" : "FAILURE",
      durationMs: Date.now() - started,
      stdout: stdoutLines.join("\n"),
      stderr: [...stderrLines, msg].join("\n"),
    };
  }
}

function formatArg(a: unknown): string {
  if (typeof a === "string") return a;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}
