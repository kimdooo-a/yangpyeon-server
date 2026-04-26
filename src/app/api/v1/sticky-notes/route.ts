import { NextRequest } from "next/server";
import { withAuth } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { runWithTenant } from "@yangpyeon/core/tenant/context";
import { prismaWithTenant } from "@/lib/db/prisma-tenant-client";
import { createStickyNoteSchema } from "@/lib/schemas/sticky-notes";

export const runtime = "nodejs";

// 운영 콘솔 — default tenant 로 RLS bypass (ADR-023 §5 운영자 BYPASS_RLS)
const DEFAULT_TENANT_UUID = "00000000-0000-0000-0000-000000000000";

// 메모 목록: 본인 PRIVATE + tenant 내 모든 SHARED.
export const GET = withAuth(async (_request: NextRequest, user) => {
  const rows = await runWithTenant(
    { tenantId: DEFAULT_TENANT_UUID, bypassRls: true },
    () =>
      prismaWithTenant.stickyNote.findMany({
        where: {
          OR: [{ ownerId: user.sub }, { visibility: "SHARED" }],
        },
        orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      }),
  );
  return successResponse(rows);
});

// 메모 생성.
export const POST = withAuth(async (request: NextRequest, user) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
  }

  const parsed = createStickyNoteSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다";
    return errorResponse("VALIDATION_ERROR", message, 400);
  }

  const created = await runWithTenant(
    { tenantId: DEFAULT_TENANT_UUID, bypassRls: true },
    () =>
      prismaWithTenant.stickyNote.create({
        data: { ...parsed.data, ownerId: user.sub },
      }),
  );
  return successResponse(created, 201);
});
