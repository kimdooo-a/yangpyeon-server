import { NextRequest } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureStarted, addJob } from "@/lib/cron/registry";

export const runtime = "nodejs";

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
  const rows = await prisma.cronJob.findMany({ orderBy: { createdAt: "desc" } });
  return successResponse(rows);
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
    const row = await prisma.cronJob.create({
      data: {
        name: parsed.data.name,
        schedule: parsed.data.schedule,
        kind: parsed.data.kind,
        payload: parsed.data.payload as object,
        enabled: parsed.data.enabled,
      },
    });
    if (row.enabled) await addJob(row.id);
    return successResponse(row, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "생성 실패";
    return errorResponse("CREATE_FAILED", msg, 400);
  }
});
