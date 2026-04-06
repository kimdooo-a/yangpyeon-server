import { NextRequest } from "next/server";
import { withAuth } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { renameFolder, deleteFolder } from "@/lib/filebox-db";
import { uuidParamSchema, renameFolderSchema } from "@/lib/schemas/filebox";

export const runtime = "nodejs";

// 폴더 이름 변경
export const PUT = withAuth(async (request: NextRequest, user, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const idParsed = uuidParamSchema.safeParse({ id });
  if (!idParsed.success) return errorResponse("INVALID_ID", "잘못된 폴더 ID", 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
  }

  const parsed = renameFolderSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다";
    return errorResponse("VALIDATION_ERROR", message, 400);
  }

  try {
    const folder = await renameFolder(id, parsed.data.name, user.sub);
    return successResponse(folder);
  } catch (err) {
    const message = err instanceof Error ? err.message : "이름 변경 실패";
    return errorResponse("RENAME_FAILED", message, 400);
  }
});

// 폴더 삭제
export const DELETE = withAuth(async (_request: NextRequest, user, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const idParsed = uuidParamSchema.safeParse({ id });
  if (!idParsed.success) return errorResponse("INVALID_ID", "잘못된 폴더 ID", 400);

  try {
    await deleteFolder(id, user.sub);
    return successResponse({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "삭제 실패";
    return errorResponse("DELETE_FAILED", message, 400);
  }
});
