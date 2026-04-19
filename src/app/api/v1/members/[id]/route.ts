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

    // 세션 43: Date 필드는 raw SELECT + ::text 로 직접 읽어 Prisma 7 adapter-pg
    // parsing-side +9h KST 시프트 회피 (CK orm-date-filter-audit-sweep 패턴 B/C).
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        email: string;
        name: string | null;
        phone: string | null;
        role: string;
        is_active: boolean;
        last_login_at_text: string | null;
        created_at_text: string;
        updated_at_text: string;
      }>
    >`
      SELECT id, email, name, phone, role, is_active,
        (last_login_at::text) AS last_login_at_text,
        (created_at::text)    AS created_at_text,
        (updated_at::text)    AS updated_at_text
      FROM users
      WHERE id = ${id}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) {
      return errorResponse("NOT_FOUND", "회원을 찾을 수 없습니다", 404);
    }
    return successResponse({
      id: row.id,
      email: row.email,
      name: row.name,
      phone: row.phone,
      role: row.role,
      isActive: row.is_active,
      lastLoginAt: row.last_login_at_text ? new Date(row.last_login_at_text).toISOString() : null,
      createdAt: new Date(row.created_at_text).toISOString(),
      updatedAt: new Date(row.updated_at_text).toISOString(),
    });
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
      const message = parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다";
      return errorResponse("VALIDATION_ERROR", message, 400);
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse("NOT_FOUND", "회원을 찾을 수 없습니다", 404);
    }

    await prisma.user.update({
      where: { id },
      data: parsed.data,
    });

    // 세션 43: update 직후 Date 는 raw SELECT ::text 로 재조회 (parsing-side 시프트 회피).
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        email: string;
        name: string | null;
        phone: string | null;
        role: string;
        is_active: boolean;
        updated_at_text: string;
      }>
    >`
      SELECT id, email, name, phone, role, is_active,
        (updated_at::text) AS updated_at_text
      FROM users
      WHERE id = ${id}
      LIMIT 1
    `;
    const row = rows[0]!;
    return successResponse({
      id: row.id,
      email: row.email,
      name: row.name,
      phone: row.phone,
      role: row.role,
      isActive: row.is_active,
      updatedAt: new Date(row.updated_at_text).toISOString(),
    });
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
