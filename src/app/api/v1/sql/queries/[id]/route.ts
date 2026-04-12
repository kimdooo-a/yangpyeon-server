import { NextRequest } from "next/server";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// 저장된 쿼리 단건 조회 (소유자 또는 SHARED만)
export const GET = withRole(
  ["ADMIN", "MANAGER"],
  async (_req: NextRequest, user, context) => {
    const params = await context?.params;
    const id = params?.id;
    if (!id) return errorResponse("VALIDATION_ERROR", "id 누락", 400);

    const row = await prisma.sqlQuery.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        sql: true,
        scope: true,
        ownerId: true,
        lastRunAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!row) return errorResponse("NOT_FOUND", "쿼리를 찾을 수 없습니다", 404);
    if (row.ownerId !== user.sub && row.scope !== "SHARED") {
      return errorResponse("FORBIDDEN", "접근 권한이 없습니다", 403);
    }
    return successResponse(row);
  }
);

// 저장된 쿼리 삭제 (소유자만)
export const DELETE = withRole(
  ["ADMIN", "MANAGER"],
  async (_req: NextRequest, user, context) => {
    const params = await context?.params;
    const id = params?.id;
    if (!id) return errorResponse("VALIDATION_ERROR", "id 누락", 400);

    const row = await prisma.sqlQuery.findUnique({ where: { id }, select: { ownerId: true } });
    if (!row) return errorResponse("NOT_FOUND", "쿼리를 찾을 수 없습니다", 404);
    if (row.ownerId !== user.sub) {
      return errorResponse("FORBIDDEN", "본인 쿼리만 삭제할 수 있습니다", 403);
    }

    await prisma.sqlQuery.delete({ where: { id } });
    return successResponse({ id });
  }
);
