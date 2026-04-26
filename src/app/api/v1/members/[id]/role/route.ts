import { NextRequest } from "next/server";
import { withRole } from "@/lib/api-guard";
import { changeRoleSchema } from "@/lib/schemas/member";
import { successResponse, errorResponse } from "@/lib/api-response";
import { runWithTenant } from "@yangpyeon/core/tenant/context";
import { prismaWithTenant } from "@/lib/db/prisma-tenant-client";

// 운영 콘솔 — default tenant 로 RLS bypass (ADR-023 §5 운영자 BYPASS_RLS)
const DEFAULT_TENANT_UUID = "00000000-0000-0000-0000-000000000000";

type RouteContext = { params: Promise<{ id: string }> };

export const PUT = withRole(
  ["ADMIN"],
  async (request: NextRequest, user, context) => {
    const { id } = await (context as RouteContext).params;

    if (id === user.sub) {
      return errorResponse("SELF_ROLE_CHANGE", "자기 자신의 역할을 변경할 수 없습니다", 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
    }

    const parsed = changeRoleSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다";
      return errorResponse("VALIDATION_ERROR", message, 400);
    }

    const updated = await runWithTenant({ tenantId: DEFAULT_TENANT_UUID, bypassRls: true }, async () => {
      const existing = await prismaWithTenant.user.findUnique({ where: { id } });
      if (!existing) return null;

      return prismaWithTenant.user.update({
        where: { id },
        data: { role: parsed.data.role },
        select: { id: true, email: true, name: true, role: true },
      });
    });

    if (!updated) {
      return errorResponse("NOT_FOUND", "회원을 찾을 수 없습니다", 404);
    }

    return successResponse(updated);
  }
);
