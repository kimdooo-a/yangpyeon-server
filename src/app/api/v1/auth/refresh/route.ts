import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-response";
import { createAccessToken, V1_REFRESH_COOKIE } from "@/lib/jwt-v1";
import {
  findSessionByToken,
  rotateSession,
  revokeAllUserSessions,
  REFRESH_TOKEN_MAX_AGE_SEC,
} from "@/lib/sessions/tokens";
import { safeAudit } from "@/lib/audit-log-db";
import { extractClientIp } from "@/lib/audit-log";
import { applyRateLimit } from "@/lib/rate-limit-guard";

/**
 * POST /api/v1/auth/refresh — Refresh Token Rotation (Phase 15-D / Blueprint §7.2.2).
 *
 * 흐름:
 *   1. v1_refresh_token 쿠키 읽기 → SHA-256 hash → Session row 조회
 *   2. revoked → reuse 탐지 → 사용자의 모든 활성 세션 revoke + 401 (defense-in-depth)
 *   3. active → 구 세션 revoke + 신 세션 insert (단일 트랜잭션)
 *   4. 새 access(15m) + 신 opaque 토큰 쿠키
 *
 * 감사 로그:
 *   - SESSION_ROTATE (정상 회전)
 *   - SESSION_REUSE_DETECTED (구 토큰 재사용 시도)
 */
export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, {
    scope: "v1Refresh",
    maxRequests: 60,
    windowMs: 60 * 1000,
  });
  if (blocked) return blocked;

  const ip = extractClientIp(request.headers);
  const userAgent = request.headers.get("user-agent") ?? null;
  const token = request.cookies.get(V1_REFRESH_COOKIE)?.value;

  if (!token) {
    return errorResponse("NO_REFRESH_TOKEN", "refresh 토큰이 없습니다", 401);
  }

  const lookup = await findSessionByToken(token);

  if (lookup.status === "revoked" && lookup.session) {
    // 세션 37 — revokedReason 분기:
    //   - "rotation": 진짜 reuse 의심 → 모든 세션 revoke + SESSION_REUSE_DETECTED
    //   - 나머지(self/self_except_current/logout/reuse_detected/admin): 사용자가 이미
    //     종료한 세션의 stale 호출 → 조용히 401, defense-in-depth 미발동
    const isRotationReuse = lookup.session.revokedReason === "rotation";

    if (isRotationReuse) {
      const revoked = await revokeAllUserSessions(lookup.session.userId);
      safeAudit({
        timestamp: new Date().toISOString(),
        method: "POST",
        path: request.nextUrl.pathname,
        ip,
        action: "SESSION_REUSE_DETECTED",
        userAgent: userAgent ?? undefined,
        detail: JSON.stringify({
          userId: lookup.session.userId,
          revokedSessionsCount: revoked,
          trigger: "rotation_token_reuse",
        }),
      });
    } else {
      safeAudit({
        timestamp: new Date().toISOString(),
        method: "POST",
        path: request.nextUrl.pathname,
        ip,
        action: "SESSION_REFRESH_REJECTED",
        userAgent: userAgent ?? undefined,
        detail: JSON.stringify({
          userId: lookup.session.userId,
          revokedReason: lookup.session.revokedReason,
        }),
      });
    }

    const response = errorResponse(
      "SESSION_REVOKED",
      "세션이 만료되었습니다. 다시 로그인하세요",
      401,
    );
    response.cookies.set(V1_REFRESH_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/api/v1/",
    });
    return response;
  }

  if (lookup.status !== "active" || !lookup.session || !lookup.session.user) {
    const response = errorResponse(
      "INVALID_REFRESH_TOKEN",
      "refresh 토큰이 유효하지 않습니다",
      401,
    );
    response.cookies.set(V1_REFRESH_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/api/v1/",
    });
    return response;
  }

  const oldSessionId = lookup.session.id;
  const user = lookup.session.user;

  const rotated = await rotateSession({
    oldSessionId,
    userId: user.id,
    ip,
    userAgent,
  });

  const accessToken = await createAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  safeAudit({
    timestamp: new Date().toISOString(),
    method: "POST",
    path: request.nextUrl.pathname,
    ip,
    action: "SESSION_ROTATE",
    userAgent: userAgent ?? undefined,
    detail: JSON.stringify({
      userId: user.id,
      oldSessionId,
      newSessionId: rotated.sessionId,
    }),
  });

  const response = NextResponse.json({
    success: true,
    data: {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    },
  });

  response.cookies.set(V1_REFRESH_COOKIE, rotated.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: REFRESH_TOKEN_MAX_AGE_SEC,
    path: "/api/v1/",
  });

  return response;
}
