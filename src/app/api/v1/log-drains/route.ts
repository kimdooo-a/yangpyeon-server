import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit-log";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["HTTP", "LOKI", "WEBHOOK"]),
  url: z.string().url(),
  authHeader: z.string().optional().nullable(),
  filters: z.record(z.string(), z.unknown()).optional().default({}),
  enabled: z.boolean().optional().default(true),
});

export const GET = withRole(["ADMIN"], async () => {
  const drains = await prisma.logDrain.findMany({
    orderBy: { createdAt: "desc" },
  });
  return successResponse(drains);
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

  const created = await prisma.logDrain.create({
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

  return successResponse(created, 201);
});
