import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPasswordHash, needsRehash, hashPassword } from "@/lib/password";
import { loginSchema } from "@/lib/schemas/auth";
import {
  createAccessToken,
  createRefreshToken,
  V1_REFRESH_COOKIE,
  REFRESH_MAX_AGE,
} from "@/lib/jwt-v1";
import { errorResponse } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다";
    return errorResponse("VALIDATION_ERROR", message, 400);
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    return errorResponse("INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다", 401);
  }

  const valid = await verifyPasswordHash(password, user.passwordHash);
  if (!valid) {
    return errorResponse("INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다", 401);
  }

  // lastLoginAt 업데이트 + (bcrypt → argon2id 점진 마이그레이션) Phase 17 / SP-011 / ADR-019
  const updateData: { lastLoginAt: Date; passwordHash?: string } = {
    lastLoginAt: new Date(),
  };
  if (needsRehash(user.passwordHash)) {
    updateData.passwordHash = await hashPassword(password);
  }
  await prisma.user.update({
    where: { id: user.id },
    data: updateData,
  });

  const accessToken = await createAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });
  const refreshToken = await createRefreshToken(user.id);

  const response = NextResponse.json(
    {
      success: true,
      data: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
    },
    { status: 200 }
  );

  response.cookies.set(V1_REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: REFRESH_MAX_AGE,
    path: "/api/v1/",
  });

  return response;
}
