import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-guard";
import { updateProfileSchema } from "@/lib/schemas/auth";
import { successResponse, errorResponse } from "@/lib/api-response";

export const GET = withAuth(async (_request, user) => {
  const dbUser = await prisma.user.findUnique({
    where: { id: user.sub },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!dbUser) {
    return errorResponse("NOT_FOUND", "사용자를 찾을 수 없습니다", 404);
  }

  return successResponse(dbUser);
});

export const PUT = withAuth(async (request: NextRequest, user) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
  }

  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다";
    return errorResponse("VALIDATION_ERROR", message, 400);
  }

  const updated = await prisma.user.update({
    where: { id: user.sub },
    data: parsed.data,
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      updatedAt: true,
    },
  });

  return successResponse(updated);
});
