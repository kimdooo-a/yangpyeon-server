import { NextRequest } from "next/server";
import { withAuth } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";
import { updateStickyNoteSchema } from "@/lib/schemas/sticky-notes";

export const runtime = "nodejs";

const DEFAULT_TENANT_UUID = "00000000-0000-0000-0000-000000000000";
const OPS_CTX = { tenantId: DEFAULT_TENANT_UUID, bypassRls: true };

type StickyNoteRow = { ownerId: string; visibility: "PRIVATE" | "SHARED" };

// 메모 수정 — 소유자만.
export const PATCH = withAuth(async (request: NextRequest, user, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) return errorResponse("VALIDATION_ERROR", "id 누락", 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
  }

  const parsed = updateStickyNoteSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다";
    return errorResponse("VALIDATION_ERROR", message, 400);
  }

  const db = tenantPrismaFor(OPS_CTX);
  const row = (await db.stickyNote.findUnique({
    where: { id },
    select: { ownerId: true, visibility: true },
  })) as StickyNoteRow | null;
  if (!row) return errorResponse("NOT_FOUND", "메모를 찾을 수 없습니다", 404);
  if (row.ownerId !== user.sub) {
    return errorResponse("FORBIDDEN", "본인 메모만 수정할 수 있습니다", 403);
  }
  const updated = await db.stickyNote.update({
    where: { id },
    data: parsed.data,
  });
  return successResponse(updated);
});

// 메모 삭제 — 소유자만.
export const DELETE = withAuth(async (_req: NextRequest, user, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) return errorResponse("VALIDATION_ERROR", "id 누락", 400);

  const db = tenantPrismaFor(OPS_CTX);
  const row = (await db.stickyNote.findUnique({
    where: { id },
    select: { ownerId: true },
  })) as { ownerId: string } | null;
  if (!row) return errorResponse("NOT_FOUND", "메모를 찾을 수 없습니다", 404);
  if (row.ownerId !== user.sub) {
    return errorResponse("FORBIDDEN", "본인 메모만 삭제할 수 있습니다", 403);
  }
  await db.stickyNote.delete({ where: { id } });
  return successResponse({ id });
});
