import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-guard";
import { errorResponse } from "@/lib/api-response";
import { decryptSecret } from "@/lib/mfa/crypto";
import {
  verifyTotpCode,
  generateRecoveryCodes,
  normalizeAndHashRecoveryCode,
} from "@/lib/mfa/totp";
import { mfaConfirmSchema } from "@/lib/schemas/mfa";

/**
 * POST /api/auth/mfa/confirm — QR 스캔 후 첫 TOTP 코드 검증.
 * 검증 성공 시:
 *   - MfaEnrollment.confirmedAt 기록
 *   - User.mfaEnabled = true
 *   - Recovery code 10개 생성 + hash 저장 (평문은 1회만 응답)
 * 응답에 표시된 recovery codes 는 이후 재조회 불가 — 사용자 즉시 저장 안내.
 */
export const POST = withAuth(async (request: NextRequest, user) => {
  if (user.sub === "legacy") {
    return errorResponse("LEGACY_SESSION", "실제 사용자로 로그인 후 설정하세요", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
  }

  const parsed = mfaConfirmSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다";
    return errorResponse("VALIDATION_ERROR", message, 400);
  }

  // eslint-disable-next-line tenant/no-raw-prisma-without-tenant -- 인증 인프라: TOTP 1차 확인 흐름에서 enrollment 조회, 글로벌 auth 라우트 (tenant-bypass 정당화)
  const enrollment = await prisma.mfaEnrollment.findUnique({
    where: { userId: user.sub },
  });
  if (!enrollment) {
    return errorResponse("NO_ENROLLMENT", "먼저 MFA 설정을 시작하세요", 400);
  }

  const secret = await decryptSecret(enrollment.secretCiphertext);
  if (!verifyTotpCode(parsed.data.code, secret)) {
    return errorResponse("INVALID_CODE", "코드가 올바르지 않습니다", 401);
  }

  // recovery code 10개 생성 + 기존 미사용 코드 삭제 후 교체
  const codes = generateRecoveryCodes();
  const hashes = codes.map((c) => normalizeAndHashRecoveryCode(c));

  // eslint-disable-next-line tenant/no-raw-prisma-without-tenant -- 인증 인프라: MFA 확인 트랜잭션 (enrollment/user/recovery code 갱신), 글로벌 auth 라우트
  await prisma.$transaction(async (tx) => {
    await tx.mfaEnrollment.update({
      where: { userId: user.sub },
      data: { confirmedAt: new Date(), failedAttempts: 0, lockedUntil: null },
    });
    await tx.user.update({
      where: { id: user.sub },
      data: { mfaEnabled: true },
    });
    await tx.mfaRecoveryCode.deleteMany({ where: { userId: user.sub } });
    await tx.mfaRecoveryCode.createMany({
      data: hashes.map((h) => ({ userId: user.sub, codeHash: h })),
    });
  });

  return NextResponse.json({
    success: true,
    data: {
      recoveryCodes: codes,
      message: "복구 코드 10개가 발급되었습니다. 안전한 곳에 보관하세요 (재표시 불가).",
    },
  });
});
