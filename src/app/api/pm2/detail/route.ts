import { NextRequest, NextResponse } from "next/server";
import { execFileSync } from "child_process";
import { pm2DetailQuerySchema } from "@/lib/schemas";
import { requireSessionApi } from "@/lib/auth-guard";

export async function GET(request: NextRequest) {
  const auth = await requireSessionApi(request);
  if (auth.response) return auth.response;

  const parsed = pm2DetailQuerySchema.safeParse({
    name: request.nextUrl.searchParams.get("name"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "잘못된 프로세스 이름" }, { status: 400 });
  }
  const { name } = parsed.data;

  try {
    const output = execFileSync("pm2", ["jlist"], {
      encoding: "utf-8",
      timeout: 5000,
    });
    const processes = JSON.parse(output);
    const proc = processes.find((p: Record<string, unknown>) => String(p.name) === name);
    if (!proc) {
      return NextResponse.json({ error: "프로세스를 찾을 수 없음" }, { status: 404 });
    }

    const env = proc.pm2_env as Record<string, unknown> | undefined;
    const monit = proc.monit as Record<string, unknown> | undefined;

    const detail = {
      name: String(proc.name),
      pm_id: Number(proc.pm_id),
      status: String(env?.status ?? "unknown"),
      cpu: (monit?.cpu as number) ?? 0,
      memory: (monit?.memory as number) ?? 0,
      uptime: env?.pm_uptime ? Date.now() - (env.pm_uptime as number) : 0,
      restarts: (env?.restart_time as number) ?? 0,
      pm_exec_path: String(env?.pm_exec_path ?? ""),
      pm_cwd: String(env?.pm_cwd ?? ""),
      node_version: String(env?.node_version ?? ""),
      exec_mode: String(env?.exec_mode ?? ""),
      instances: Number(env?.instances ?? 1),
      pm_out_log_path: String(env?.pm_out_log_path ?? ""),
      pm_err_log_path: String(env?.pm_err_log_path ?? ""),
      created_at: env?.created_at ? new Date(env.created_at as number).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "",
    };

    return NextResponse.json(detail);
  } catch {
    return NextResponse.json({ error: "PM2 정보 조회 실패" }, { status: 500 });
  }
}
