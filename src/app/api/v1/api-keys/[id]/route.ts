import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit-log";
import { fetchDateFieldsText, toIsoOrNull } from "@/lib/date-fields";

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

  // 세션 44: Prisma 7 parsing-side +9h 시프트 회피 (CK orm-date-filter-audit-sweep)
  const dateMap = await fetchDateFieldsText("api_keys", [updated.id], ["revoked_at"]);
  const d = dateMap.get(updated.id);

  writeAuditLog({
    timestamp: new Date().toISOString(),
    method: "DELETE",
    path: `/api/v1/api-keys/${id}`,
    ip: request.headers.get("x-forwarded-for") ?? "unknown",
    action: "API_KEY_REVOKE",
    detail: `${user.email} -> ${updated.name} (${updated.prefix})`,
  });

  return successResponse({
    id: updated.id,
    name: updated.name,
    prefix: updated.prefix,
    revokedAt: toIsoOrNull(d?.revoked_at),
  });
});
