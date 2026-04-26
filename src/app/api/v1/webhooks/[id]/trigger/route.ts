import { NextRequest } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { deliver } from "@/lib/webhooks/deliver";
import { writeAuditLog } from "@/lib/audit-log";
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
  failureCount: number;
};

const schema = z.object({
  samplePayload: z.unknown().optional(),
});

export const POST = withRole(["ADMIN", "MANAGER"], async (request: NextRequest, user, context) => {
  const { id } = await (context as RouteContext).params;

  const wh = (await runWithTenant({ tenantId: DEFAULT_TENANT_UUID, bypassRls: true }, () =>
    prismaWithTenant.webhook.findUnique({ where: { id } })
  )) as WebhookRow | null;
  if (!wh) return errorResponse("NOT_FOUND", "웹훅을 찾을 수 없습니다", 404);

  let parsedBody: { samplePayload?: unknown } = {};
  try {
    const raw = await request.json();
    parsedBody = schema.parse(raw);
  } catch {
    // body 없이도 허용
  }

  const payload = parsedBody.samplePayload ?? {
    event: wh.event,
    table: wh.sourceTable,
    record: { test: true, triggeredAt: new Date().toISOString() },
  };

  const result = await deliver(wh, payload);

  await runWithTenant({ tenantId: DEFAULT_TENANT_UUID, bypassRls: true }, () =>
    prismaWithTenant.webhook.update({
      where: { id },
      data: {
        lastTriggeredAt: new Date(),
        failureCount: result.ok ? 0 : wh.failureCount + 1,
      },
    })
  );

  writeAuditLog({
    timestamp: new Date().toISOString(),
    method: "POST",
    path: `/api/v1/webhooks/${id}/trigger`,
    ip: request.headers.get("x-forwarded-for") ?? "unknown",
    action: "WEBHOOK_TRIGGER",
    status: result.status,
    detail: `${user.email} -> ${wh.name} ok=${result.ok} ${result.error ?? ""}`,
  });

  return successResponse(result);
});
