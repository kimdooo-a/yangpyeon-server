import { NextRequest } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateWebhookUrl } from "@/lib/webhooks/deliver";
import { writeAuditLog } from "@/lib/audit-log";
import { fetchDateFieldsText, toIsoOrNull } from "@/lib/date-fields";
import { runWithTenant } from "@yangpyeon/core/tenant/context";
import { prismaWithTenant } from "@/lib/db/prisma-tenant-client";

// 운영 콘솔 — default tenant 로 RLS bypass (ADR-023 §5 운영자 BYPASS_RLS)
const DEFAULT_TENANT_UUID = "00000000-0000-0000-0000-000000000000";

type RouteContext = { params: Promise<{ id: string }> };

type WebhookRow = {
  id: string;
  name: string;
  sourceTable: string;
  event: string;
  url: string;
  headers: Record<string, string>;
  secret: string | null;
  enabled: boolean;
  failureCount: number;
  lastTriggeredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

async function withWebhookDates<T extends { id: string }>(row: T) {
  // 세션 44: Prisma 7 parsing-side +9h 시프트 회피 (CK orm-date-filter-audit-sweep)
  const dateMap = await fetchDateFieldsText("webhooks", [row.id], [
    "created_at",
    "updated_at",
    "last_triggered_at",
  ]);
  const d = dateMap.get(row.id);
  return {
    ...row,
    createdAt: toIsoOrNull(d?.created_at),
    updatedAt: toIsoOrNull(d?.updated_at),
    lastTriggeredAt: toIsoOrNull(d?.last_triggered_at),
  };
}

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
  const wh = (await runWithTenant({ tenantId: DEFAULT_TENANT_UUID, bypassRls: true }, () =>
    prismaWithTenant.webhook.findUnique({ where: { id } })
  )) as WebhookRow | null;
  if (!wh) return errorResponse("NOT_FOUND", "웹훅을 찾을 수 없습니다", 404);
  return successResponse(await withWebhookDates(wh));
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

  const updated = (await runWithTenant({ tenantId: DEFAULT_TENANT_UUID, bypassRls: true }, async () => {
    const existing = (await prismaWithTenant.webhook.findUnique({ where: { id } })) as WebhookRow | null;
    if (!existing) return null;

    return prismaWithTenant.webhook.update({
      where: { id },
      data: parsed.data,
    });
  })) as WebhookRow | null;

  if (!updated) return errorResponse("NOT_FOUND", "웹훅을 찾을 수 없습니다", 404);

  writeAuditLog({
    timestamp: new Date().toISOString(),
    method: "PATCH",
    path: `/api/v1/webhooks/${id}`,
    ip: request.headers.get("x-forwarded-for") ?? "unknown",
    action: "WEBHOOK_UPDATE",
    detail: `${user.email} -> ${updated.name}`,
  });

  return successResponse(await withWebhookDates(updated));
});

export const DELETE = withRole(["ADMIN", "MANAGER"], async (request, user, context) => {
  const { id } = await (context as RouteContext).params;

  const existing = (await runWithTenant({ tenantId: DEFAULT_TENANT_UUID, bypassRls: true }, async () => {
    const wh = (await prismaWithTenant.webhook.findUnique({ where: { id } })) as WebhookRow | null;
    if (!wh) return null;
    await prismaWithTenant.webhook.delete({ where: { id } });
    return wh;
  })) as WebhookRow | null;

  if (!existing) return errorResponse("NOT_FOUND", "웹훅을 찾을 수 없습니다", 404);

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
