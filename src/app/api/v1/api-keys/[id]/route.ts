import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit-log";

type RouteContext = { params: Promise<{ id: string }> };

export const DELETE = withRole(["ADMIN"], async (request: NextRequest, user, context) => {
  const { id } = await (context as RouteContext).params;
  const existing = await prisma.apiKey.findUnique({ where: { id } });
  if (!existing) return errorResponse("NOT_FOUND", "API 키를 찾을 수 없습니다", 404);
  if (existing.revokedAt) return errorResponse("ALREADY_REVOKED", "이미 폐기된 키입니다", 400);

  const updated = await prisma.apiKey.update({
    where: { id },
    data: { revokedAt: new Date() },
    select: { id: true, name: true, prefix: true, revokedAt: true },
  });

  writeAuditLog({
    timestamp: new Date().toISOString(),
    method: "DELETE",
    path: `/api/v1/api-keys/${id}`,
    ip: request.headers.get("x-forwarded-for") ?? "unknown",
    action: "API_KEY_REVOKE",
    detail: `${user.email} -> ${updated.name} (${updated.prefix})`,
  });

  return successResponse(updated);
});
