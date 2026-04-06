import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/api-guard";
import { updateMemberSchema } from "@/lib/schemas/member";
import { successResponse, errorResponse } from "@/lib/api-response";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withRole(
  ["ADMIN", "MANAGER"],
  async (_request: NextRequest, _user, context) => {
    const { id } = await (context as RouteContext).params;

    const member = await prisma.user.findUnique({
      where: { id },
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

    if (!member) {
      return errorResponse("NOT_FOUND", "회원을 찾을 수 없습니다", 404);
    }

    return successResponse(member);
  }
);

export const PUT = withRole(
  ["ADMIN", "MANAGER"],
  async (request: NextRequest, _user, context) => {
    const { id } = await (context as RouteContext).params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
    }

    const parsed = updateMemberSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.errors[0]?.message ?? "입력값이 올바르지 않습니다";
      return errorResponse("VALIDATION_ERROR", message, 400);
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse("NOT_FOUND", "회원을 찾을 수 없습니다", 404);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: parsed.data,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        updatedAt: true,
      },
    });

    return successResponse(updated);
  }
);

export const DELETE = withRole(
  ["ADMIN"],
  async (_request: NextRequest, user, context) => {
    const { id } = await (context as RouteContext).params;

    if (id === user.sub) {
      return errorResponse("SELF_DELETE", "자기 자신을 비활성화할 수 없습니다", 400);
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse("NOT_FOUND", "회원을 찾을 수 없습니다", 404);
    }

    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    return successResponse({ message: "회원이 비활성화되었습니다" });
  }
);
