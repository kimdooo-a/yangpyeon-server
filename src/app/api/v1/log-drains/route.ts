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

const LOG_DRAIN_DATE_FIELDS = [
  "created_at",
  "updated_at",
  "last_delivered_at",
] as const;

async function attachLogDrainDates<T extends { id: string }>(rows: T[]) {
  // 세션 44: Prisma 7 parsing-side +9h 시프트 회피 (CK orm-date-filter-audit-sweep)
  const dateMap = await fetchDateFieldsText(
    "log_drains",
    rows.map((r) => r.id),
    LOG_DRAIN_DATE_FIELDS,
  );
  return rows.map((r) => {
    const d = dateMap.get(r.id);
    return {
      ...r,
      createdAt: toIsoOrNull(d?.created_at),
      updatedAt: toIsoOrNull(d?.updated_at),
      lastDeliveredAt: toIsoOrNull(d?.last_delivered_at),
    };
  });
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["HTTP", "LOKI", "WEBHOOK"]),
  url: z.string().url(),
  authHeader: z.string().optional().nullable(),
  filters: z.record(z.string(), z.unknown()).optional().default({}),
  enabled: z.boolean().optional().default(true),
});

export const GET = withRole(["ADMIN"], async () => {
  const drains = await tenantPrismaFor(OPS_CTX).logDrain.findMany({
    orderBy: { createdAt: "desc" },
  });
  return successResponse(await attachLogDrainDates(drains));
});

export const POST = withRole(["ADMIN"], async (request: NextRequest, user) => {
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

  const created = await tenantPrismaFor(OPS_CTX).logDrain.create({
    data: {
      name: parsed.data.name,
      type: parsed.data.type,
      url: parsed.data.url,
      authHeader: parsed.data.authHeader ?? null,
      filters: parsed.data.filters as Prisma.InputJsonValue,
      enabled: parsed.data.enabled,
    },
  });

  writeAuditLog({
    timestamp: new Date().toISOString(),
    method: "POST",
    path: "/api/v1/log-drains",
    ip: request.headers.get("x-forwarded-for") ?? "unknown",
    action: "LOG_DRAIN_CREATE",
    detail: `${user.email} -> ${created.name} (${created.type})`,
  });

  const [withDates] = await attachLogDrainDates([created]);
  return successResponse(withDates, 201);
});
