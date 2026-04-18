import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-guard";
import { errorResponse } from "@/lib/api-response";
import { generateTotpSecret, buildOtpAuthUrl, buildOtpAuthQrDataUrl } from "@/lib/mfa/totp";
import { encryptSecret } from "@/lib/mfa/crypto";

/**
 * POST /api/auth/mfa/enroll — 인증된 사용자의 TOTP 1차 설정.
 * 응답: { otpauthUrl, qrDataUrl } — 사용자는 Authenticator 앱으로 스캔 후 /confirm 호출.
 *
 * 이미 confirmedAt=not null 인 enrollment가 있으면 400.
 * 기존 미확정(confirmedAt=null) enrollment 는 새 secret 으로 덮어씀.
 */
export const POST = withAuth(async (_request: NextRequest, user) => {
  if (user.sub === "legacy") {
    return errorResponse("LEGACY_SESSION", "실제 사용자로 로그인 후 설정하세요", 401);
  }

  const existing = await prisma.mfaEnrollment.findUnique({ where: { userId: user.sub } });
  if (existing?.confirmedAt) {
    return errorResponse("ALREADY_ENROLLED", "이미 MFA 가 활성화되어 있습니다", 400);
  }

  const secret = generateTotpSecret();
  const secretCiphertext = encryptSecret(secret);

  await prisma.mfaEnrollment.upsert({
    where: { userId: user.sub },
    update: { secretCiphertext, confirmedAt: null, failedAttempts: 0, lockedUntil: null },
    create: { userId: user.sub, secretCiphertext },
  });

  const otpauthUrl = buildOtpAuthUrl(user.email, secret);
  const qrDataUrl = await buildOtpAuthQrDataUrl(user.email, secret);

  return NextResponse.json({
    success: true,
    data: { otpauthUrl, qrDataUrl },
  });
});
