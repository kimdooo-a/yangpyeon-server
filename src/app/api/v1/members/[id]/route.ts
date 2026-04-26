import { NextRequest } from "next/server";
import { withRole } from "@/lib/api-guard";
import { updateMemberSchema } from "@/lib/schemas/member";
import { successResponse, errorResponse } from "@/lib/api-response";
import { runWithTenant } from "@yangpyeon/core/tenant/context";
import { prismaWithTenant } from "@/lib/db/prisma-tenant-client";

// 운영 콘솔 — default tenant 로 RLS bypass (ADR-023 §5 운영자 BYPASS_RLS)
const DEFAULT_TENANT_UUID = "00000000-0000-0000-0000-000000000000";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withRole(
  ["ADMIN", "MANAGER"],
  async (_request: NextRequest, _user, context) => {
    const { id } = await (context as RouteContext).params;

    // 세션 43: Date 필드는 raw SELECT + ::text 로 직접 읽어 Prisma 7 adapter-pg
    // parsing-side +9h KST 시프트 회피 (CK orm-date-filter-audit-sweep 패턴 B/C).
    type UserRow = {
      id: string;
      email: string;
      name: string | null;
      phone: string | null;
      role: string;
      is_active: boolean;
      last_login_at_text: string | null;
      created_at_text: string;
      updated_at_text: string;
    };
    const rows = (await runWithTenant({ tenantId: DEFAULT_TENANT_UUID, bypassRls: true }, () =>
      prismaWithTenant.$queryRaw`
        SELECT id, email, name, phone, role, is_active,
          (last_login_at::text) AS last_login_at_text,
          (created_at::text)    AS created_at_text,
          (updated_at::text)    AS updated_at_text
        FROM users
        WHERE id = ${id}
        LIMIT 1
      `
    )) as UserRow[];
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

    const row = await runWithTenant({ tenantId: DEFAULT_TENANT_UUID, bypassRls: true }, async () => {
      const existing = await prismaWithTenant.user.findUnique({ where: { id } });
      if (!existing) return null;

      await prismaWithTenant.user.update({
        where: { id },
        data: parsed.data,
      });

      // 세션 43: update 직후 Date 는 raw SELECT ::text 로 재조회 (parsing-side 시프트 회피).
      type UpdatedRow = {
        id: string;
        email: string;
        name: string | null;
        phone: string | null;
        role: string;
        is_active: boolean;
        updated_at_text: string;
      };
      const rows = (await prismaWithTenant.$queryRaw`
        SELECT id, email, name, phone, role, is_active,
          (updated_at::text) AS updated_at_text
        FROM users
        WHERE id = ${id}
        LIMIT 1
      `) as UpdatedRow[];
      return rows[0] ?? null;
    });

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

    const found = await runWithTenant({ tenantId: DEFAULT_TENANT_UUID, bypassRls: true }, async () => {
      const existing = await prismaWithTenant.user.findUnique({ where: { id } });
      if (!existing) return false;

      await prismaWithTenant.user.update({
        where: { id },
        data: { isActive: false },
      });
      return true;
    });

    if (!found) {
      return errorResponse("NOT_FOUND", "회원을 찾을 수 없습니다", 404);
    }

    return successResponse({ message: "회원이 비활성화되었습니다" });
  }
);
