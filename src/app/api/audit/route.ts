import { NextRequest, NextResponse } from "next/server";
import { getAuditLogs } from "@/lib/audit-log-db";
import { auditQuerySchema } from "@/lib/schemas";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parsed = auditQuerySchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
  });
  const limit = parsed.success ? parsed.data.limit : 100;

  try {
    const logs = getAuditLogs(limit);
    return NextResponse.json({ logs });
  } catch (err) {
    console.error("감사 로그 조회 실패:", err);
    return NextResponse.json(
      { error: "감사 로그 조회 실패", logs: [] },
      { status: 500 }
    );
  }
}
