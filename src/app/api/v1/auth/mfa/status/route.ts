import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-guard";
import { errorResponse } from "@/lib/api-response";
import { fetchDateFieldsText, toIsoOrNull } from "@/lib/date-fields";

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
    // eslint-disable-next-line tenant/no-raw-prisma-without-tenant -- 인증 인프라: 인증된 사용자 자신의 MFA enrollment 조회, 글로벌 auth 라우트
    prisma.mfaEnrollment.findUnique({
      where: { userId: user.sub },
      select: { id: true, confirmedAt: true, lockedUntil: true },
    }),
    // eslint-disable-next-line tenant/no-raw-prisma-without-tenant -- 인증 인프라: 인증된 사용자 자신의 Passkey 목록 조회, 글로벌 auth 라우트
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
    // eslint-disable-next-line tenant/no-raw-prisma-without-tenant -- 인증 인프라: 인증된 사용자 자신의 recovery code 카운트, 글로벌 auth 라우트
    prisma.mfaRecoveryCode.count({
      where: { userId: user.sub, usedAt: null },
    }),
  ]);

  // 세션 44: Prisma 7 parsing-side +9h 시프트 회피 (CK orm-date-filter-audit-sweep)
  const enrollmentDateMap = enrollment
    ? await fetchDateFieldsText(
        "mfa_enrollments",
        [enrollment.id],
        ["confirmed_at", "locked_until"],
      )
    : null;
  const enrollmentDates = enrollment
    ? enrollmentDateMap?.get(enrollment.id) ?? null
    : null;
  const passkeyDateMap = await fetchDateFieldsText(
    "webauthn_authenticators",
    passkeys.map((p) => p.id),
    ["created_at", "last_used_at"],
  );

  return NextResponse.json({
    success: true,
    data: {
      totp: {
        enrolled: Boolean(enrollment),
        confirmed: Boolean(enrollment?.confirmedAt),
        lockedUntil: toIsoOrNull(enrollmentDates?.locked_until),
      },
      passkeys: passkeys.map((p) => {
        const d = passkeyDateMap.get(p.id);
        return {
          ...p,
          createdAt: toIsoOrNull(d?.created_at),
          lastUsedAt: toIsoOrNull(d?.last_used_at),
        };
      }),
      recoveryCodesRemaining: recoveryRemaining,
    },
  });
});
