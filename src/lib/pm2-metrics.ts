/**
 * PM2 프로세스 메트릭 수집 공통 유틸
 * - PM2 프로세스 목록 및 로그 수집
 * - SSE 엔드포인트와 REST API에서 공통으로 사용
 */
import { execFileSync } from "child_process";

// ── PM2 프로세스 목록 ──────────────────────────────────────

export interface Pm2Process {
  name: string;
  pm_id: number;
  status: string;
  cpu: number;
  memory: number;
  uptime: number;
  restarts: number;
}

export function getPm2List(): Pm2Process[] {
  try {
    const output = execFileSync("pm2", ["jlist"], {
      encoding: "utf-8",
      timeout: 5000,
    });
    const processes = JSON.parse(output);
    if (!Array.isArray(processes)) return [];
    return processes.map((p: Record<string, unknown>) => {
      const env = p.pm2_env as Record<string, unknown> | undefined;
      const monit = p.monit as Record<string, unknown> | undefined;
      return {
        name: String(p.name ?? ""),
        pm_id: Number(p.pm_id ?? 0),
        status: String(env?.status ?? "unknown"),
        cpu: (monit?.cpu as number) ?? 0,
        memory: (monit?.memory as number) ?? 0,
        uptime: env?.pm_uptime ? Date.now() - (env.pm_uptime as number) : 0,
        restarts: (env?.restart_time as number) ?? 0,
      };
    });
  } catch {
    return [];
  }
}

// ── PM2 로그 수집 ───────────────────────────────────────────

export interface Pm2LogsOptions {
  processName: string;
  lines: number;
}

export function getPm2Logs(options: Pm2LogsOptions): string[] {
  const { processName, lines } = options;
  try {
    const args = ["logs", "--nostream", "--lines", String(lines)];
    if (processName !== "all") {
      args.splice(1, 0, processName);
    }
    const output = execFileSync("pm2", args, {
      encoding: "utf-8",
      timeout: 5000,
    });
    return output.split("\n").filter((line) => line.trim().length > 0);
  } catch {
    return [];
  }
}
