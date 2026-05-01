import { NextRequest } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { validateWebhookUrl } from "@/lib/webhooks/deliver";
import { writeAuditLog } from "@/lib/audit-log";
import { fetchDateFieldsText, toIsoOrNull } from "@/lib/date-fields";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";

// 운영 콘솔 — default tenant 로 RLS bypass (ADR-023 §5 운영자 BYPASS_RLS)
// 2026-05-01: ALS propagation 깨짐 회피 — tenantPrismaFor 직접 closure 캡처 사용.
const DEFAULT_TENANT_UUID = "00000000-0000-0000-0000-000000000000";
const OPS_CTX = { tenantId: DEFAULT_TENANT_UUID, bypassRls: true } as const;

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

const WEBHOOK_DATE_FIELDS = ["created_at", "updated_at", "last_triggered_at"] as const;

async function attachWebhookDates<T extends { id: string }>(rows: T[]) {
  // 세션 44: Prisma 7 parsing-side +9h 시프트 회피 (CK orm-date-filter-audit-sweep)
  const dateMap = await fetchDateFieldsText(
    "webhooks",
    rows.map((r) => r.id),
    WEBHOOK_DATE_FIELDS,
  );
  return rows.map((r) => {
    const d = dateMap.get(r.id);
    return {
      ...r,
      createdAt: toIsoOrNull(d?.created_at),
      updatedAt: toIsoOrNull(d?.updated_at),
      lastTriggeredAt: toIsoOrNull(d?.last_triggered_at),
    };
  });
}

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
  const webhooks = (await tenantPrismaFor(OPS_CTX).webhook.findMany({
    orderBy: { createdAt: "desc" },
  })) as WebhookRow[];
  return successResponse(await attachWebhookDates(webhooks));
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

  const created = (await tenantPrismaFor(OPS_CTX).webhook.create({
    data: {
      name: parsed.data.name,
      sourceTable: parsed.data.sourceTable,
      event: parsed.data.event,
      url: parsed.data.url,
      headers: parsed.data.headers,
      secret: parsed.data.secret ?? null,
      enabled: parsed.data.enabled,
    },
  })) as WebhookRow;

  writeAuditLog({
    timestamp: new Date().toISOString(),
    method: "POST",
    path: "/api/v1/webhooks",
    ip: request.headers.get("x-forwarded-for") ?? "unknown",
    action: "WEBHOOK_CREATE",
    detail: `${user.email} -> ${created.name} (${created.sourceTable}/${created.event})`,
  });

  const [withDates] = await attachWebhookDates([created]);
  return successResponse(withDates, 201);
});
