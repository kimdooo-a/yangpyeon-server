import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-guard";
import { errorResponse } from "@/lib/api-response";

/**
 * GET /api/v1/auth/mfa/status
 *
 * 현재 인증된 사용자의 MFA 상태 + 등록된 Passkey 목록.
 * 클라이언트(/account/security 페이지)가 enroll/disable 흐름 분기 판단용.
 */
export const GET = withAuth(async (_request: NextRequest, user) => {
  if (user.sub === "legacy") {
    return errorResponse("LEGACY_SESSION", "실제 사용자로 로그인 후 조회하세요", 401);
  }

  const [enrollment, passkeys, recoveryRemaining] = await Promise.all([
    prisma.mfaEnrollment.findUnique({
      where: { userId: user.sub },
      select: { confirmedAt: true, lockedUntil: true },
    }),
    prisma.webAuthnAuthenticator.findMany({
      where: { userId: user.sub },
      select: {
        id: true,
        friendlyName: true,
        deviceType: true,
        backedUp: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.mfaRecoveryCode.count({
      where: { userId: user.sub, usedAt: null },
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      totp: {
        enrolled: Boolean(enrollment),
        confirmed: Boolean(enrollment?.confirmedAt),
        lockedUntil: enrollment?.lockedUntil ?? null,
      },
      passkeys: passkeys.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
        lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
      })),
      recoveryCodesRemaining: recoveryRemaining,
    },
  });
});
