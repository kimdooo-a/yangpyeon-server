import { NextRequest, NextResponse } from "next/server";
import { getPm2Logs } from "@/lib/pm2-metrics";
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
  const logs = getPm2Logs({ processName, lines });
  return NextResponse.json({ logs });
}
