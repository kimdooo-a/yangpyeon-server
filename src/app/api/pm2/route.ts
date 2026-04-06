import { NextResponse } from "next/server";
import { execFileSync } from "child_process";

export interface Pm2Process {
  name: string;
  pm_id: number;
  status: string;
  cpu: number;
  memory: number;
  uptime: number;
  restarts: number;
}

function getPm2List(): Pm2Process[] {
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

export async function GET() {
  return NextResponse.json({ processes: getPm2List() });
}
