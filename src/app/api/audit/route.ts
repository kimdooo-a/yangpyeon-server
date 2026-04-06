import { NextRequest, NextResponse } from "next/server";
import { getAuditLogs } from "@/lib/audit-log";
import { auditQuerySchema } from "@/lib/schemas";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parsed = auditQuerySchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
  });
  const limit = parsed.success ? parsed.data.limit : 100;

  return NextResponse.json({ logs: getAuditLogs(limit) });
}
