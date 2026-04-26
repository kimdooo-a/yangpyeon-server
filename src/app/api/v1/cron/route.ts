import { NextRequest } from "next/server";
import { z } from "zod";
import { runWithTenant } from "@yangpyeon/core/tenant/context";
import { prismaWithTenant } from "@/lib/db/prisma-tenant-client";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { ensureStarted, addJob } from "@/lib/cron/registry";
import { fetchDateFieldsText, toIsoOrNull } from "@/lib/date-fields";

/** Cron 관리 — operator console, 기본 테넌트(default) UUID */
const DEFAULT_TENANT_UUID = "00000000-0000-0000-0000-000000000000";

export const runtime = "nodejs";

const CRON_DATE_FIELDS = ["created_at", "updated_at", "last_run_at"] as const;

async function attachCronDates<T extends { id: string }>(rows: T[]) {
  const dateMap = await fetchDateFieldsText(
    "cron_jobs",
    rows.map((r) => r.id),
    CRON_DATE_FIELDS,
  );
  return rows.map((r) => {
    const d = dateMap.get(r.id);
    return {
      ...r,
      createdAt: toIsoOrNull(d?.created_at),
      updatedAt: toIsoOrNull(d?.updated_at),
      lastRunAt: toIsoOrNull(d?.last_run_at),
    };
  });
}

const scheduleRegex = /^(\*|[\d,\-\/\s]+|every\s+\d+\s*[mh])$/i;

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  schedule: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine((v) => scheduleRegex.test(v) || v.split(/\s+/).length === 5, {
      message: "schedule 형식이 올바르지 않습니다",
    }),
  kind: z.enum(["SQL", "FUNCTION", "WEBHOOK"]),
  payload: z.record(z.string(), z.unknown()).default({}),
  enabled: z.boolean().default(true),
});

// GET: Cron 목록 (MANAGER 이상)
export const GET = withRole(["ADMIN", "MANAGER"], async () => {
  ensureStarted();
  const rows = await runWithTenant(
    { tenantId: DEFAULT_TENANT_UUID, bypassRls: true },
    () => prismaWithTenant.cronJob.findMany({ orderBy: { createdAt: "desc" } }),
  );
  // 세션 44: Prisma 7 parsing-side +9h 시프트 회피 (CK orm-date-filter-audit-sweep)
  return successResponse(await attachCronDates(rows));
});

// POST: 신규 (MANAGER 이상)
export const POST = withRole(["ADMIN", "MANAGER"], async (request: NextRequest) => {
  ensureStarted();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식", 400);
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "검증 실패", 400);
  }
  try {
    const row = await runWithTenant(
      { tenantId: DEFAULT_TENANT_UUID, bypassRls: true },
      () =>
        prismaWithTenant.cronJob.create({
          data: {
            name: parsed.data.name,
            schedule: parsed.data.schedule,
            kind: parsed.data.kind,
            payload: parsed.data.payload as object,
            enabled: parsed.data.enabled,
          },
        }),
    );
    if (row.enabled) await addJob(row.id);
    const [withDates] = await attachCronDates([row]);
    return successResponse(withDates, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "생성 실패";
    return errorResponse("CREATE_FAILED", msg, 400);
  }
});
