import { NextRequest } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { runWithTenant } from "@yangpyeon/core/tenant/context";
import { prismaWithTenant } from "@/lib/db/prisma-tenant-client";
import { fetchDateFieldsText, toIsoOrNull } from "@/lib/date-fields";

export const runtime = "nodejs";

// 글로벌 운영자 콘솔 — default tenant UUID 사용 (ADR-023 §5)
const DEFAULT_TENANT_UUID = "00000000-0000-0000-0000-000000000000";

async function withFunctionDates<T extends { id: string }>(row: T) {
  // 세션 44: Prisma 7 parsing-side +9h 시프트 회피 (CK orm-date-filter-audit-sweep)
  const dateMap = await fetchDateFieldsText("edge_functions", [row.id], [
    "created_at",
    "updated_at",
  ]);
  const d = dateMap.get(row.id);
  return {
    ...row,
    createdAt: toIsoOrNull(d?.created_at),
    updatedAt: toIsoOrNull(d?.updated_at),
  };
}

const MAX_CODE_SIZE = 256 * 1024;

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
  code: z.string().min(1).max(MAX_CODE_SIZE).optional(),
  runtime: z.enum(["NODE_VM", "WORKER_THREAD"]).optional(),
  enabled: z.boolean().optional(),
});

async function getId(context: unknown): Promise<string> {
  return (await (context as { params: Promise<{ id: string }> }).params).id;
}

async function ensureOwner(id: string, userId: string) {
  const fn = await runWithTenant({ tenantId: DEFAULT_TENANT_UUID }, async () => {
    return prismaWithTenant.edgeFunction.findUnique({ where: { id } });
  });
  if (!fn) return null;
  if (fn.ownerId !== userId) return "forbidden" as const;
  return fn;
}

export const GET = withRole(["ADMIN"], async (_req, user, context) => {
  const id = await getId(context);
  const fn = await ensureOwner(id, user.sub);
  if (fn === null) return errorResponse("NOT_FOUND", "함수를 찾을 수 없습니다", 404);
  if (fn === "forbidden") return errorResponse("FORBIDDEN", "소유자만 조회할 수 있습니다", 403);
  return successResponse(await withFunctionDates(fn));
});

export const PATCH = withRole(["ADMIN"], async (request: NextRequest, user, context) => {
  const id = await getId(context);
  const fn = await ensureOwner(id, user.sub);
  if (fn === null) return errorResponse("NOT_FOUND", "함수를 찾을 수 없습니다", 404);
  if (fn === "forbidden") return errorResponse("FORBIDDEN", "소유자만 수정할 수 있습니다", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식", 400);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "검증 실패", 400);
  }
  const updated = await runWithTenant({ tenantId: DEFAULT_TENANT_UUID }, async () => {
    return prismaWithTenant.edgeFunction.update({
      where: { id },
      data: parsed.data,
    });
  });
  // 세션 44: Prisma 7 parsing-side +9h 시프트 회피 (CK orm-date-filter-audit-sweep)
  const dateMap = await fetchDateFieldsText("edge_functions", [updated.id], ["updated_at"]);
  const d = dateMap.get(updated.id);
  return successResponse({ id: updated.id, updatedAt: toIsoOrNull(d?.updated_at) });
});

export const DELETE = withRole(["ADMIN"], async (_req, user, context) => {
  const id = await getId(context);
  const fn = await ensureOwner(id, user.sub);
  if (fn === null) return errorResponse("NOT_FOUND", "함수를 찾을 수 없습니다", 404);
  if (fn === "forbidden") return errorResponse("FORBIDDEN", "소유자만 삭제할 수 있습니다", 403);
  await runWithTenant({ tenantId: DEFAULT_TENANT_UUID }, async () => {
    return prismaWithTenant.edgeFunction.delete({ where: { id } });
  });
  return successResponse({ deleted: true });
});
