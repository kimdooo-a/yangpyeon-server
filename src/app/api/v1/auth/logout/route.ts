import { NextRequest, NextResponse } from "next/server";
import { V1_REFRESH_COOKIE } from "@/lib/jwt-v1";
import { findSessionByToken, revokeSession } from "@/lib/sessions/tokens";
import { writeAuditLogDb } from "@/lib/audit-log-db";
import { extractClientIp } from "@/lib/audit-log";

/**
 * POST /api/v1/auth/logout — 서버측 Session revoke + 쿠키 제거 (Phase 15-D).
 *
 * 세션 36 이전: 쿠키 삭제만 (stateless JWT 는 자연 만료까지 살아있음).
 * 세션 36 이후: Session.revokedAt 설정 → refresh 재사용 탐지 + 감사 로그 완결.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(V1_REFRESH_COOKIE)?.value;

  if (token) {
    const lookup = await findSessionByToken(token);
    if (lookup.session && lookup.status !== "not_found") {
      try {
        await revokeSession(lookup.session.id);
      } catch {
        // 동시성 race — 이미 revoke 된 경우 무시
      }
      writeAuditLogDb({
        timestamp: new Date().toISOString(),
        method: "POST",
        path: request.nextUrl.pathname,
        ip: extractClientIp(request.headers),
        action: "SESSION_REVOKE",
        userAgent: request.headers.get("user-agent") ?? undefined,
        detail: JSON.stringify({
          userId: lookup.session.userId,
          sessionId: lookup.session.id,
          reason: "logout",
        }),
      });
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(V1_REFRESH_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/api/v1/",
  });
  return response;
}
