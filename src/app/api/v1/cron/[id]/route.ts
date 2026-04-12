import { NextRequest } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureStarted, updateJob, removeJob } from "@/lib/cron/registry";
import { writeAuditLog, extractClientIp } from "@/lib/audit-log";

export const runtime = "nodejs";

const patchSchemaAdmin = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  schedule: z.string().trim().min(1).max(80).optional(),
  kind: z.enum(["SQL", "FUNCTION", "WEBHOOK"]).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

async function getId(context: unknown): Promise<string> {
  return (await (context as { params: Promise<{ id: string }> }).params).id;
}

export const GET = withRole(["ADMIN", "MANAGER"], async (_req, _user, context) => {
  const id = await getId(context);
  const row = await prisma.cronJob.findUnique({ where: { id } });
  if (!row) return errorResponse("NOT_FOUND", "Cron Job을 찾을 수 없습니다", 404);
  return successResponse(row);
});

export const PATCH = withRole(["ADMIN", "MANAGER"], async (request: NextRequest, user, context) => {
  const id = await getId(context);
  const existing = await prisma.cronJob.findUnique({ where: { id } });
  if (!existing) return errorResponse("NOT_FOUND", "Cron Job을 찾을 수 없습니다", 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식", 400);
  }

  const parsed = patchSchemaAdmin.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "검증 실패", 400);
  }

  // 비ADMIN이 enabled 필드를 보냈다면 거부
  if (user.role !== "ADMIN" && parsed.data.enabled !== undefined) {
    return errorResponse("FORBIDDEN", "enable/disable은 ADMIN만 가능합니다", 403);
  }

  const updated = await prisma.cronJob.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.schedule !== undefined && { schedule: parsed.data.schedule }),
      ...(parsed.data.kind !== undefined && { kind: parsed.data.kind }),
      ...(parsed.data.payload !== undefined && { payload: parsed.data.payload as object }),
      ...(parsed.data.enabled !== undefined && { enabled: parsed.data.enabled }),
    },
  });

  ensureStarted();
  await updateJob(id);

  if (parsed.data.enabled !== undefined) {
    writeAuditLog({
      timestamp: new Date().toISOString(),
      method: "PATCH",
      path: `/api/v1/cron/${id}`,
      ip: extractClientIp(request.headers),
      action: parsed.data.enabled ? "CRON_ENABLE" : "CRON_DISABLE",
      detail: updated.name,
      status: 200,
    });
  }

  return successResponse(updated);
});

export const DELETE = withRole(["ADMIN", "MANAGER"], async (_req, _user, context) => {
  const id = await getId(context);
  const row = await prisma.cronJob.findUnique({ where: { id } });
  if (!row) return errorResponse("NOT_FOUND", "Cron Job을 찾을 수 없습니다", 404);
  await prisma.cronJob.delete({ where: { id } });
  removeJob(id);
  return successResponse({ deleted: true });
});
