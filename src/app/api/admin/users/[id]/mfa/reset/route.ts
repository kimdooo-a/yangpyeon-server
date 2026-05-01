import { NextRequest, NextResponse } from "next/server";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";
import { withRole } from "@/lib/api-guard";
import { errorResponse } from "@/lib/api-response";
import { writeAuditLog, extractClientIp } from "@/lib/audit-log";

/** 관리자 운영 콘솔 — 기본 테넌트(default) UUID */
// 2026-05-01: ALS propagation 깨짐 회피 — tenantPrismaFor 직접 closure 캡처 사용.
const DEFAULT_TENANT_UUID = "00000000-0000-0000-0000-000000000000";
const OPS_CTX = { tenantId: DEFAULT_TENANT_UUID, bypassRls: true } as const;

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

    const db = tenantPrismaFor(OPS_CTX);
    const target = await db.user.findUnique({
      where: { id: targetId },
      select: { id: true, email: true, mfaEnabled: true },
    });
    if (!target) {
      return errorResponse("USER_NOT_FOUND", "사용자를 찾을 수 없습니다", 404);
    }

    // 관리자 강제 MFA 해제: TOTP 비활성화 + 복구 코드 + 등록 정보 전체 삭제
    await db.user.update({ where: { id: target.id }, data: { mfaEnabled: false } });
    await db.mfaRecoveryCode.deleteMany({ where: { userId: target.id } });
    await db.mfaEnrollment.deleteMany({ where: { userId: target.id } });

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
