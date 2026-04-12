import { NextRequest } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

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
  const fn = await prisma.edgeFunction.findUnique({ where: { id } });
  if (!fn) return null;
  if (fn.ownerId !== userId) return "forbidden" as const;
  return fn;
}

export const GET = withRole(["ADMIN"], async (_req, user, context) => {
  const id = await getId(context);
  const fn = await ensureOwner(id, user.sub);
  if (fn === null) return errorResponse("NOT_FOUND", "함수를 찾을 수 없습니다", 404);
  if (fn === "forbidden") return errorResponse("FORBIDDEN", "소유자만 조회할 수 있습니다", 403);
  return successResponse(fn);
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
  const updated = await prisma.edgeFunction.update({
    where: { id },
    data: parsed.data,
  });
  return successResponse({ id: updated.id, updatedAt: updated.updatedAt });
});

export const DELETE = withRole(["ADMIN"], async (_req, user, context) => {
  const id = await getId(context);
  const fn = await ensureOwner(id, user.sub);
  if (fn === null) return errorResponse("NOT_FOUND", "함수를 찾을 수 없습니다", 404);
  if (fn === "forbidden") return errorResponse("FORBIDDEN", "소유자만 삭제할 수 있습니다", 403);
  await prisma.edgeFunction.delete({ where: { id } });
  return successResponse({ deleted: true });
});
