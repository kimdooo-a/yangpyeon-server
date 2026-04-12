import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { deliver } from "@/lib/webhooks/deliver";
import { writeAuditLog } from "@/lib/audit-log";

type RouteContext = { params: Promise<{ id: string }> };

const schema = z.object({
  samplePayload: z.unknown().optional(),
});

export const POST = withRole(["ADMIN", "MANAGER"], async (request: NextRequest, user, context) => {
  const { id } = await (context as RouteContext).params;

  const wh = await prisma.webhook.findUnique({ where: { id } });
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

  await prisma.webhook.update({
    where: { id },
    data: {
      lastTriggeredAt: new Date(),
      failureCount: result.ok ? 0 : wh.failureCount + 1,
    },
  });

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
