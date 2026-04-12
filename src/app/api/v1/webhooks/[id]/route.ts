import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateWebhookUrl } from "@/lib/webhooks/deliver";
import { writeAuditLog } from "@/lib/audit-log";

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  secret: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  event: z.enum(["INSERT", "UPDATE", "DELETE", "ANY"]).optional(),
});

export const GET = withRole(["ADMIN", "MANAGER"], async (_req, _user, context) => {
  const { id } = await (context as RouteContext).params;
  const wh = await prisma.webhook.findUnique({ where: { id } });
  if (!wh) return errorResponse("NOT_FOUND", "웹훅을 찾을 수 없습니다", 404);
  return successResponse(wh);
});

export const PATCH = withRole(["ADMIN", "MANAGER"], async (request: NextRequest, user, context) => {
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
  if (parsed.data.url) {
    const v = validateWebhookUrl(parsed.data.url);
    if (!v.ok) return errorResponse("INVALID_URL", v.error, 400);
  }
  const existing = await prisma.webhook.findUnique({ where: { id } });
  if (!existing) return errorResponse("NOT_FOUND", "웹훅을 찾을 수 없습니다", 404);

  const updated = await prisma.webhook.update({
    where: { id },
    data: parsed.data,
  });

  writeAuditLog({
    timestamp: new Date().toISOString(),
    method: "PATCH",
    path: `/api/v1/webhooks/${id}`,
    ip: request.headers.get("x-forwarded-for") ?? "unknown",
    action: "WEBHOOK_UPDATE",
    detail: `${user.email} -> ${updated.name}`,
  });

  return successResponse(updated);
});

export const DELETE = withRole(["ADMIN", "MANAGER"], async (request, user, context) => {
  const { id } = await (context as RouteContext).params;
  const existing = await prisma.webhook.findUnique({ where: { id } });
  if (!existing) return errorResponse("NOT_FOUND", "웹훅을 찾을 수 없습니다", 404);
  await prisma.webhook.delete({ where: { id } });

  writeAuditLog({
    timestamp: new Date().toISOString(),
    method: "DELETE",
    path: `/api/v1/webhooks/${id}`,
    ip: request.headers.get("x-forwarded-for") ?? "unknown",
    action: "WEBHOOK_DELETE",
    detail: `${user.email} -> ${existing.name}`,
  });

  return successResponse({ message: "삭제되었습니다" });
});
