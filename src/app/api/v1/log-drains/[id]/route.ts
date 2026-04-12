import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit-log";

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  authHeader: z.string().nullable().optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

export const GET = withRole(["ADMIN"], async (_req, _user, context) => {
  const { id } = await (context as RouteContext).params;
  const drain = await prisma.logDrain.findUnique({ where: { id } });
  if (!drain) return errorResponse("NOT_FOUND", "로그 드레인을 찾을 수 없습니다", 404);
  return successResponse(drain);
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
  const existing = await prisma.logDrain.findUnique({ where: { id } });
  if (!existing) return errorResponse("NOT_FOUND", "로그 드레인을 찾을 수 없습니다", 404);

  const { filters, ...rest } = parsed.data;
  const data: Prisma.LogDrainUpdateInput = {
    ...rest,
    ...(filters !== undefined ? { filters: filters as Prisma.InputJsonValue } : {}),
  };
  const updated = await prisma.logDrain.update({ where: { id }, data });

  writeAuditLog({
    timestamp: new Date().toISOString(),
    method: "PATCH",
    path: `/api/v1/log-drains/${id}`,
    ip: request.headers.get("x-forwarded-for") ?? "unknown",
    action: "LOG_DRAIN_UPDATE",
    detail: `${user.email} -> ${updated.name}`,
  });

  return successResponse(updated);
});

export const DELETE = withRole(["ADMIN"], async (request, user, context) => {
  const { id } = await (context as RouteContext).params;
  const existing = await prisma.logDrain.findUnique({ where: { id } });
  if (!existing) return errorResponse("NOT_FOUND", "로그 드레인을 찾을 수 없습니다", 404);
  await prisma.logDrain.delete({ where: { id } });

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
