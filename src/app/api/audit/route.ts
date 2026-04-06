import { NextRequest, NextResponse } from "next/server";
import { getAuditLogs } from "@/lib/audit-log";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);

  return NextResponse.json({ logs: getAuditLogs(limit) });
}
