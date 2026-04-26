import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-guard";
import { errorResponse } from "@/lib/api-response";
import { verifyPasswordHash } from "@/lib/password";
import { mfaDisableSchema } from "@/lib/schemas/mfa";
import { verifyMfaSecondFactor } from "@/lib/mfa/service";

/**
 * DELETE /api/auth/mfa/disable — 자신의 MFA 해제.
 *
 * 강력 재인증: { password, code } 둘 다 검증. TOTP 검증이 lockedUntil 갱신하므로
 * 시도 한도 우회 방지됨.
 */
export const DELETE = withAuth(async (request: NextRequest, sessionUser) => {
  if (sessionUser.sub === "legacy") {
    return errorResponse("LEGACY_SESSION", "실제 사용자로 로그인 후 설정하세요", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
  }

  const parsed = mfaDisableSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다";
    return errorResponse("VALIDATION_ERROR", message, 400);
  }

  // eslint-disable-next-line tenant/no-raw-prisma-without-tenant -- 인증 인프라: MFA 해제 전 재인증(password 검증) 목적 사용자 lookup, 글로벌 auth 라우트
  const user = await prisma.user.findUnique({ where: { id: sessionUser.sub } });
  if (!user) return errorResponse("INVALID_CREDENTIALS", "사용자 없음", 401);

  const passOk = await verifyPasswordHash(parsed.data.password, user.passwordHash);
  if (!passOk) return errorResponse("INVALID_CREDENTIALS", "비밀번호가 올바르지 않습니다", 401);

  const mfaResult = await verifyMfaSecondFactor(user.id, { code: parsed.data.code });
  if (!mfaResult.ok) {
    return errorResponse("INVALID_CODE", "TOTP 코드가 올바르지 않습니다", 401);
  }

  // eslint-disable-next-line tenant/no-raw-prisma-without-tenant -- 인증 인프라: MFA 해제 트랜잭션 (user/recovery code/enrollment 삭제), 글로벌 auth 라우트
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { mfaEnabled: false } });
    await tx.mfaRecoveryCode.deleteMany({ where: { userId: user.id } });
    await tx.mfaEnrollment.deleteMany({ where: { userId: user.id } });
  });

  return NextResponse.json({ success: true, data: { message: "MFA 가 해제되었습니다" } });
});
