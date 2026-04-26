import { NextRequest } from "next/server";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { runWithTenant } from "@yangpyeon/core/tenant/context";
import { prismaWithTenant } from "@/lib/db/prisma-tenant-client";
import { fetchDateFieldsText, toIsoOrNull } from "@/lib/date-fields";

export const runtime = "nodejs";

// 글로벌 운영자 콘솔 — default tenant UUID 사용 (ADR-023 §5)
const DEFAULT_TENANT_UUID = "00000000-0000-0000-0000-000000000000";

export const GET = withRole(["ADMIN"], async (_req: NextRequest, user, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;

  const fn = await runWithTenant({ tenantId: DEFAULT_TENANT_UUID }, async () => {
    return prismaWithTenant.edgeFunction.findUnique({ where: { id }, select: { ownerId: true } });
  });
  if (!fn) return errorResponse("NOT_FOUND", "함수를 찾을 수 없습니다", 404);
  if (fn.ownerId !== user.sub)
    return errorResponse("FORBIDDEN", "소유자만 조회할 수 있습니다", 403);

  const runs = await runWithTenant({ tenantId: DEFAULT_TENANT_UUID }, async () => {
    return prismaWithTenant.edgeFunctionRun.findMany({
      where: { functionId: id },
      orderBy: { startedAt: "desc" },
      take: 20,
    });
  });
  // 세션 44: Prisma 7 parsing-side +9h 시프트 회피 (CK orm-date-filter-audit-sweep)
  const dateMap = await fetchDateFieldsText(
    "edge_function_runs",
    runs.map((r) => r.id),
    ["started_at", "finished_at"],
  );
  const withDates = runs.map((r) => {
    const d = dateMap.get(r.id);
    return {
      ...r,
      startedAt: toIsoOrNull(d?.started_at),
      finishedAt: toIsoOrNull(d?.finished_at),
    };
  });
  return successResponse(withDates);
});
