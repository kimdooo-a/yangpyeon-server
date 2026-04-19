import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/api-guard";
import { errorResponse } from "@/lib/api-response";
import { writeAuditLogDb } from "@/lib/audit-log-db";
import { extractClientIp } from "@/lib/audit-log";
import { revokeAllUserSessions } from "@/lib/sessions/tokens";

/**
 * DELETE /api/admin/users/[id]/sessions — 관리자 강제 세션 일괄 revoke (세션 39).
 *
 * 대상 사용자의 모든 활성 세션(`revokedAt IS NULL`)을 `revokedReason="admin"` 으로 태깅.
 * 세션 37 refresh route `isRotationReuse` 분기에서 "admin" 은 reuse 탐지 미발동 →
 * 대상 사용자 브라우저의 stale /refresh 는 조용히 `SESSION_REFRESH_REJECTED` 401.
 *
 * 감사 로그: `SESSION_ADMIN_REVOKE_ALL` (actor + target + revokedCount).
 * 즉시 DB 기록(`writeAuditLogDb`) 으로 버퍼 flush 대기 없이 영속화.
 */
export const DELETE = withRole(
  ["ADMIN"],
  async (request: NextRequest, actor, context) => {
    const params = await context?.params;
    const targetId = params?.id;
    if (!targetId) {
      return errorResponse("VALIDATION_ERROR", "대상 사용자 id 가 필요합니다", 400);
    }

    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, email: true },
    });
    if (!target) {
      return errorResponse("USER_NOT_FOUND", "사용자를 찾을 수 없습니다", 404);
    }

    const revokedCount = await revokeAllUserSessions(target.id, "admin");

    writeAuditLogDb({
      timestamp: new Date().toISOString(),
      method: request.method,
      path: request.nextUrl.pathname,
      ip: extractClientIp(request.headers),
      action: "SESSION_ADMIN_REVOKE_ALL",
      detail: JSON.stringify({
        actorUserId: actor.sub,
        actorEmail: actor.email,
        targetUserId: target.id,
        targetEmail: target.email,
        revokedCount,
      }),
    });

    return NextResponse.json({
      success: true,
      data: {
        targetUserId: target.id,
        targetEmail: target.email,
        revokedCount,
      },
    });
  },
);
