import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateWebhookUrl } from "@/lib/webhooks/deliver";
import { writeAuditLog } from "@/lib/audit-log";

const ALLOWED_TABLES = [
  "users",
  "folders",
  "files",
  "sql_queries",
  "webhooks",
  "cron_jobs",
] as const;

const createSchema = z.object({
  name: z.string().min(1).max(100),
  sourceTable: z.enum(ALLOWED_TABLES),
  event: z.enum(["INSERT", "UPDATE", "DELETE", "ANY"]),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional().default({}),
  secret: z.string().optional().nullable(),
  enabled: z.boolean().optional().default(true),
});

export const GET = withRole(["ADMIN", "MANAGER"], async () => {
  const webhooks = await prisma.webhook.findMany({
    orderBy: { createdAt: "desc" },
  });
  return successResponse(webhooks);
});

export const POST = withRole(["ADMIN", "MANAGER"], async (request: NextRequest, user) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다",
      400
    );
  }

  const validation = validateWebhookUrl(parsed.data.url);
  if (!validation.ok) {
    return errorResponse("INVALID_URL", validation.error, 400);
  }

  const created = await prisma.webhook.create({
    data: {
      name: parsed.data.name,
      sourceTable: parsed.data.sourceTable,
      event: parsed.data.event,
      url: parsed.data.url,
      headers: parsed.data.headers,
      secret: parsed.data.secret ?? null,
      enabled: parsed.data.enabled,
    },
  });

  writeAuditLog({
    timestamp: new Date().toISOString(),
    method: "POST",
    path: "/api/v1/webhooks",
    ip: request.headers.get("x-forwarded-for") ?? "unknown",
    action: "WEBHOOK_CREATE",
    detail: `${user.email} -> ${created.name} (${created.sourceTable}/${created.event})`,
  });

  return successResponse(created, 201);
});
