import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-guard";
import { hashPassword, verifyPasswordHash } from "@/lib/password";
import { changePasswordSchema } from "@/lib/schemas/auth";
import { successResponse, errorResponse } from "@/lib/api-response";

export const PUT = withAuth(async (request: NextRequest, user) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
  }

  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다";
    return errorResponse("VALIDATION_ERROR", message, 400);
  }

  // eslint-disable-next-line tenant/no-raw-prisma-without-tenant -- 인증 인프라: 비밀번호 변경 전 재인증 목적 사용자 lookup, 글로벌 auth 라우트
  const dbUser = await prisma.user.findUnique({ where: { id: user.sub } });
  if (!dbUser) {
    return errorResponse("NOT_FOUND", "사용자를 찾을 수 없습니다", 404);
  }

  const valid = await verifyPasswordHash(
    parsed.data.currentPassword,
    dbUser.passwordHash
  );
  if (!valid) {
    return errorResponse("WRONG_PASSWORD", "현재 비밀번호가 올바르지 않습니다", 400);
  }

  const newHash = await hashPassword(parsed.data.newPassword);
  // eslint-disable-next-line tenant/no-raw-prisma-without-tenant -- 인증 인프라: 비밀번호 해시 갱신, 글로벌 auth 라우트
  await prisma.user.update({
    where: { id: user.sub },
    data: { passwordHash: newHash },
  });

  return successResponse({ message: "비밀번호가 변경되었습니다" });
});
