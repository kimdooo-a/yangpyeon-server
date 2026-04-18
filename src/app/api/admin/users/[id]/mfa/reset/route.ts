import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/api-guard";
import { errorResponse } from "@/lib/api-response";
import { writeAuditLog, extractClientIp } from "@/lib/audit-log";

/**
 * POST /api/admin/users/[id]/mfa/reset — 관리자 강제 MFA 해제.
 *
 * 사용자 분실·이직 등으로 TOTP 접근 불가 시 ADMIN 이 강제 해제.
 * 감사 로그: MFA_ADMIN_RESET + 대상 userId + 작업자 sub.
 */
export const POST = withRole(
  ["ADMIN"],
  async (request: NextRequest, actor, context) => {
    const params = await context?.params;
    const targetId = params?.id;
    if (!targetId) {
      return errorResponse("VALIDATION_ERROR", "대상 사용자 id 가 필요합니다", 400);
    }

    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, email: true, mfaEnabled: true },
    });
    if (!target) {
      return errorResponse("USER_NOT_FOUND", "사용자를 찾을 수 없습니다", 404);
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: target.id }, data: { mfaEnabled: false } });
      await tx.mfaRecoveryCode.deleteMany({ where: { userId: target.id } });
      await tx.mfaEnrollment.deleteMany({ where: { userId: target.id } });
    });

    writeAuditLog({
      timestamp: new Date().toISOString(),
      method: request.method,
      path: request.nextUrl.pathname,
      ip: extractClientIp(request.headers),
      action: "MFA_ADMIN_RESET",
      detail: JSON.stringify({
        actorUserId: actor.sub,
        targetUserId: target.id,
        targetEmail: target.email,
      }),
    });

    return NextResponse.json({ success: true, data: { message: "대상 사용자의 MFA 가 해제되었습니다" } });
  },
);
