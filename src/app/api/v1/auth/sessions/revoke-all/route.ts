import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-guard";
import {
  revokeAllExceptCurrent,
  findSessionByToken,
} from "@/lib/sessions/tokens";
import { V1_REFRESH_COOKIE } from "@/lib/jwt-v1";
import { writeAuditLogDb } from "@/lib/audit-log-db";
import { extractClientIp } from "@/lib/audit-log";

/**
 * POST /api/v1/auth/sessions/revoke-all — 현재 세션을 제외한 모든 세션 종료 (Phase 15-D, 세션 37).
 *
 * 쿠키 v1_refresh_token 으로 현재 세션 식별 → 해당 세션만 보존.
 * 쿠키가 없거나 active 가 아닌 경우 current=null → 모든 세션 revoke (이 요청 자체는 Bearer 로 인증됨).
 *
 * 감사: SESSION_REVOKE_ALL + reason=self + preservedCurrent bool.
 */
export const POST = withAuth(async (request: NextRequest, user) => {
  const token = request.cookies.get(V1_REFRESH_COOKIE)?.value;
  let currentSessionId: string | null = null;
  if (token) {
    const lookup = await findSessionByToken(token);
    if (
      lookup.status === "active" &&
      lookup.session &&
      lookup.session.userId === user.sub
    ) {
      currentSessionId = lookup.session.id;
    }
  }

  const count = await revokeAllExceptCurrent(user.sub, currentSessionId);

  writeAuditLogDb({
    timestamp: new Date().toISOString(),
    method: "POST",
    path: request.nextUrl.pathname,
    ip: extractClientIp(request.headers),
    action: "SESSION_REVOKE_ALL",
    userAgent: request.headers.get("user-agent") ?? undefined,
    detail: JSON.stringify({
      userId: user.sub,
      reason: "self",
      preservedCurrent: Boolean(currentSessionId),
      revokedCount: count,
    }),
  });

  return NextResponse.json({
    success: true,
    data: { revokedCount: count, preservedCurrent: Boolean(currentSessionId) },
  });
});
