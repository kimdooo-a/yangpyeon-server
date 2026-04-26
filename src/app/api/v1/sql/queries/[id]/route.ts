import { NextRequest } from "next/server";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { runWithTenant } from "@yangpyeon/core/tenant/context";
import { prismaWithTenant } from "@/lib/db/prisma-tenant-client";

export const runtime = "nodejs";

// 운영 콘솔 — default tenant 로 RLS bypass (ADR-023 §5 운영자 BYPASS_RLS)
const DEFAULT_TENANT_UUID = "00000000-0000-0000-0000-000000000000";

type SqlQueryRow = {
  id: string;
  name: string;
  sql: string;
  scope: string;
  ownerId: string;
  lastRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// 저장된 쿼리 단건 조회 (소유자 또는 SHARED만)
export const GET = withRole(
  ["ADMIN", "MANAGER"],
  async (_req: NextRequest, user, context) => {
    const params = await context?.params;
    const id = params?.id;
    if (!id) return errorResponse("VALIDATION_ERROR", "id 누락", 400);

    const row = (await runWithTenant({ tenantId: DEFAULT_TENANT_UUID, bypassRls: true }, () =>
      prismaWithTenant.sqlQuery.findUnique({
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
      })
    )) as SqlQueryRow | null;

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

    const result = await runWithTenant({ tenantId: DEFAULT_TENANT_UUID, bypassRls: true }, async () => {
      const row = (await prismaWithTenant.sqlQuery.findUnique({
        where: { id },
        select: { ownerId: true },
      })) as { ownerId: string } | null;
      if (!row) return "NOT_FOUND" as const;
      if (row.ownerId !== user.sub) return "FORBIDDEN" as const;

      await prismaWithTenant.sqlQuery.delete({ where: { id } });
      return "OK" as const;
    });

    if (result === "NOT_FOUND") return errorResponse("NOT_FOUND", "쿼리를 찾을 수 없습니다", 404);
    if (result === "FORBIDDEN") return errorResponse("FORBIDDEN", "본인 쿼리만 삭제할 수 있습니다", 403);
    return successResponse({ id });
  }
);
