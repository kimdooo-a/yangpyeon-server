import { NextResponse } from "next/server";
import { execFileSync } from "child_process";

interface TunnelStatus {
  running: boolean;
  connections: number;
}

function getTunnelStatus(): TunnelStatus {
  let running = false;
  let connections = 0;

  try {
    const output = execFileSync("pgrep", ["-c", "-f", "cloudflared"], {
      encoding: "utf-8",
      timeout: 3000,
    });
    connections = parseInt(output.trim(), 10) || 0;
    running = connections > 0;
  } catch {
    // 프로세스 미실행
  }

  return { running, connections };
}

export async function GET() {
  // Tunnel ID, 설정 경로 등 민감 정보는 노출하지 않음
  return NextResponse.json(getTunnelStatus());
}
