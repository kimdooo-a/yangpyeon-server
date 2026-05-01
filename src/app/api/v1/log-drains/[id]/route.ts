import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit-log";
import { fetchDateFieldsText, toIsoOrNull } from "@/lib/date-fields";

// 글로벌 운영자 콘솔 — default tenant UUID 사용 (ADR-023 §5)
// 2026-05-01: ALS propagation 깨짐 회피 — tenantPrismaFor 직접 closure 캡처 사용.
const DEFAULT_TENANT_UUID = "00000000-0000-0000-0000-000000000000";
const OPS_CTX = { tenantId: DEFAULT_TENANT_UUID } as const;

type RouteContext = { params: Promise<{ id: string }> };

async function withLogDrainDates<T extends { id: string }>(row: T) {
  // 세션 44: Prisma 7 parsing-side +9h 시프트 회피 (CK orm-date-filter-audit-sweep)
  const dateMap = await fetchDateFieldsText("log_drains", [row.id], [
    "created_at",
    "updated_at",
    "last_delivered_at",
  ]);
  const d = dateMap.get(row.id);
  return {
    ...row,
    createdAt: toIsoOrNull(d?.created_at),
    updatedAt: toIsoOrNull(d?.updated_at),
    lastDeliveredAt: toIsoOrNull(d?.last_delivered_at),
  };
}

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  authHeader: z.string().nullable().optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

export const GET = withRole(["ADMIN"], async (_req, _user, context) => {
  const { id } = await (context as RouteContext).params;
  const drain = await tenantPrismaFor(OPS_CTX).logDrain.findUnique({ where: { id } });
  if (!drain) return errorResponse("NOT_FOUND", "로그 드레인을 찾을 수 없습니다", 404);
  return successResponse(await withLogDrainDates(drain));
});

export const PATCH = withRole(["ADMIN"], async (request: NextRequest, user, context) => {
  const { id } = await (context as RouteContext).params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "입력 오류", 400);
  }
  const db = tenantPrismaFor(OPS_CTX);
  const existing = await db.logDrain.findUnique({ where: { id } });
  if (!existing) return errorResponse("NOT_FOUND", "로그 드레인을 찾을 수 없습니다", 404);

  const { filters, ...rest } = parsed.data;
  const data: Prisma.LogDrainUpdateInput = {
    ...rest,
    ...(filters !== undefined ? { filters: filters as Prisma.InputJsonValue } : {}),
  };
  const updated = await db.logDrain.update({ where: { id }, data });

  writeAuditLog({
    timestamp: new Date().toISOString(),
    method: "PATCH",
    path: `/api/v1/log-drains/${id}`,
    ip: request.headers.get("x-forwarded-for") ?? "unknown",
    action: "LOG_DRAIN_UPDATE",
    detail: `${user.email} -> ${updated.name}`,
  });

  return successResponse(await withLogDrainDates(updated));
});

export const DELETE = withRole(["ADMIN"], async (request, user, context) => {
  const { id } = await (context as RouteContext).params;
  const db = tenantPrismaFor(OPS_CTX);
  const existing = await db.logDrain.findUnique({ where: { id } });
  if (!existing) return errorResponse("NOT_FOUND", "로그 드레인을 찾을 수 없습니다", 404);
  await db.logDrain.delete({ where: { id } });

  writeAuditLog({
    timestamp: new Date().toISOString(),
    method: "DELETE",
    path: `/api/v1/log-drains/${id}`,
    ip: request.headers.get("x-forwarded-for") ?? "unknown",
    action: "LOG_DRAIN_DELETE",
    detail: `${user.email} -> ${existing.name}`,
  });

  return successResponse({ message: "삭제되었습니다" });
});
