import { NextRequest, NextResponse } from "next/server";
import { getAuditLogsPaginated } from "@/lib/audit-log-db";
import { auditQuerySchema } from "@/lib/schemas";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const parsed = auditQuerySchema.safeParse({
    page: searchParams.get("page") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    action: searchParams.get("action") ?? undefined,
    ip: searchParams.get("ip") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "잘못된 쿼리 파라미터", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = getAuditLogsPaginated(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    console.error("감사 로그 조회 실패:", err);
    return NextResponse.json(
      { error: "감사 로그 조회 실패", logs: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } },
      { status: 500 }
    );
  }
}
