import { NextRequest } from "next/server";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export const GET = withRole(["ADMIN"], async (_req: NextRequest, user, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const fn = await prisma.edgeFunction.findUnique({ where: { id }, select: { ownerId: true } });
  if (!fn) return errorResponse("NOT_FOUND", "함수를 찾을 수 없습니다", 404);
  if (fn.ownerId !== user.sub)
    return errorResponse("FORBIDDEN", "소유자만 조회할 수 있습니다", 403);

  const runs = await prisma.edgeFunctionRun.findMany({
    where: { functionId: id },
    orderBy: { startedAt: "desc" },
    take: 20,
  });
  return successResponse(runs);
});
