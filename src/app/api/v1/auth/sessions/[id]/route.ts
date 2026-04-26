import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-guard";
import { errorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { revokeSession } from "@/lib/sessions/tokens";
import { safeAudit } from "@/lib/audit-log-db";
import { extractClientIp } from "@/lib/audit-log";

/**
 * DELETE /api/v1/auth/sessions/[id] — 사용자가 자기 세션 1건 revoke (Phase 15-D).
 *
 * userId 매칭 강제: 타 사용자 세션 삭제 불가 (404 로 존재 여부 은폐).
 * 이미 revoked 된 세션은 멱등 처리 (200 OK).
 * 감사: SESSION_REVOKE detail.reason = "self".
 */
export const DELETE = withAuth(
  async (request: NextRequest, user, context) => {
    const params = await context?.params;
    const sessionId = params?.id;
    if (!sessionId) {
      return errorResponse("VALIDATION_ERROR", "세션 id 가 필요합니다", 400);
    }

    // eslint-disable-next-line tenant/no-raw-prisma-without-tenant -- 인증 인프라: 사용자 자신의 세션 revoke — userId 소유권 확인 목적, 글로벌 auth 라우트
    const row = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, revokedAt: true },
    });
    if (!row || row.userId !== user.sub) {
      return errorResponse("NOT_FOUND", "세션을 찾을 수 없습니다", 404);
    }

    if (!row.revokedAt) {
      try {
        await revokeSession(sessionId);
      } catch {
        // race — 이미 revoke 된 경우 무시
      }
      safeAudit({
        timestamp: new Date().toISOString(),
        method: "DELETE",
        path: request.nextUrl.pathname,
        ip: extractClientIp(request.headers),
        action: "SESSION_REVOKE",
        userAgent: request.headers.get("user-agent") ?? undefined,
        detail: JSON.stringify({
          userId: user.sub,
          sessionId,
          reason: "self",
        }),
      });
    }

    return NextResponse.json({ success: true });
  },
);
