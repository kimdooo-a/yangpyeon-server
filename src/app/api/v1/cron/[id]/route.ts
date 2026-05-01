import { NextRequest } from "next/server";
import { z } from "zod";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { ensureStarted, updateJob, removeJob } from "@/lib/cron/registry";
import { writeAuditLog, extractClientIp } from "@/lib/audit-log";
import { fetchDateFieldsText, toIsoOrNull } from "@/lib/date-fields";

/** Cron 관리 — operator console, 기본 테넌트(default) UUID */
// 2026-05-01: ALS propagation 깨짐 회피 — tenantPrismaFor 직접 closure 캡처 사용.
const DEFAULT_TENANT_UUID = "00000000-0000-0000-0000-000000000000";
const OPS_CTX = { tenantId: DEFAULT_TENANT_UUID, bypassRls: true } as const;

export const runtime = "nodejs";

async function withCronDates<T extends { id: string }>(row: T) {
  // 세션 44: Prisma 7 parsing-side +9h 시프트 회피 (CK orm-date-filter-audit-sweep)
  const dateMap = await fetchDateFieldsText("cron_jobs", [row.id], [
    "created_at",
    "updated_at",
    "last_run_at",
  ]);
  const d = dateMap.get(row.id);
  return {
    ...row,
    createdAt: toIsoOrNull(d?.created_at),
    updatedAt: toIsoOrNull(d?.updated_at),
    lastRunAt: toIsoOrNull(d?.last_run_at),
  };
}

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
  const row = await tenantPrismaFor(OPS_CTX).cronJob.findUnique({ where: { id } });
  if (!row) return errorResponse("NOT_FOUND", "Cron Job을 찾을 수 없습니다", 404);
  return successResponse(await withCronDates(row));
});

export const PATCH = withRole(["ADMIN", "MANAGER"], async (request: NextRequest, user, context) => {
  const id = await getId(context);
  const db = tenantPrismaFor(OPS_CTX);
  const existing = await db.cronJob.findUnique({ where: { id } });
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

  const updated = await db.cronJob.update({
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

  return successResponse(await withCronDates(updated));
});

export const DELETE = withRole(["ADMIN", "MANAGER"], async (_req, _user, context) => {
  const id = await getId(context);
  const db = tenantPrismaFor(OPS_CTX);
  const row = await db.cronJob.findUnique({ where: { id } });
  if (!row) return errorResponse("NOT_FOUND", "Cron Job을 찾을 수 없습니다", 404);
  await db.cronJob.delete({ where: { id } });
  removeJob(id);
  return successResponse({ deleted: true });
});
