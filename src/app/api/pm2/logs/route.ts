import { NextRequest, NextResponse } from "next/server";
import { execFileSync } from "child_process";
import { pm2LogsQuerySchema } from "@/lib/schemas";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parsed = pm2LogsQuerySchema.safeParse({
    process: searchParams.get("process") ?? undefined,
    lines: searchParams.get("lines") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 파라미터" }, { status: 400 });
  }
  const { process: processName, lines } = parsed.data;

  try {
    const args = ["logs", "--nostream", "--lines", String(lines)];

    if (processName !== "all") {
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
