import { NextRequest, NextResponse } from "next/server";
import { execFileSync } from "child_process";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const processName = searchParams.get("process") || "all";
  const linesParam = parseInt(searchParams.get("lines") || "100", 10);
  const lines = isNaN(linesParam) ? 100 : Math.max(1, Math.min(linesParam, 500));

  try {
    const args = ["logs", "--nostream", "--lines", String(lines)];

    if (processName !== "all") {
      if (!/^[\w-]+$/.test(processName) || processName.length > 64) {
        return NextResponse.json({ error: "잘못된 프로세스 이름" }, { status: 400 });
      }
      args.splice(1, 0, processName);
    }

    // execFileSync: 쉘 해석 없이 직접 실행
    const output = execFileSync("pm2", args, {
      encoding: "utf-8",
      timeout: 5000,
    });

    const logLines = output
      .split("\n")
      .filter((line) => line.trim().length > 0);

    return NextResponse.json({ logs: logLines });
  } catch {
    return NextResponse.json({ logs: [] });
  }
}
