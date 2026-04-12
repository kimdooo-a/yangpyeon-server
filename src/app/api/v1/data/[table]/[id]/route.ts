import { NextRequest } from "next/server";
import { withAuth } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import {
  checkReadAccess,
  checkWriteAccess,
  runGetOne,
  runUpdate,
  runDelete,
} from "@/lib/data-api/handler";

export const runtime = "nodejs";

// 단건 조회
export const GET = withAuth(async (_req: NextRequest, user, context) => {
  const params = await context?.params;
  const table = params?.table;
  const id = params?.id;
  if (!table || !id) return errorResponse("VALIDATION_ERROR", "파라미터 누락", 400);

  const check = checkReadAccess(table, user.role);
  if (!check.ok && check.error) {
    return errorResponse(check.error.code, check.error.message, check.error.status);
  }

  try {
    const row = await runGetOne(table, id, { role: user.role, userId: user.sub });
    if (!row) return errorResponse("NOT_FOUND", "레코드를 찾을 수 없습니다", 404);
    return successResponse(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : "조회 실패";
    return errorResponse("QUERY_ERROR", message, 400);
  }
});

// 부분 수정 (ADMIN만)
export const PATCH = withAuth(async (request: NextRequest, user, context) => {
  const params = await context?.params;
  const table = params?.table;
  const id = params?.id;
  if (!table || !id) return errorResponse("VALIDATION_ERROR", "파라미터 누락", 400);

  const check = checkWriteAccess(table, user.role);
  if (!check.ok && check.error) {
    return errorResponse(check.error.code, check.error.message, check.error.status);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
  }
  if (typeof body !== "object" || body === null) {
    return errorResponse("VALIDATION_ERROR", "객체 형태의 본문이 필요합니다", 400);
  }

  try {
    const updated = await runUpdate(table, id, body as Record<string, unknown>);
    return successResponse(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "수정 실패";
    return errorResponse("UPDATE_ERROR", message, 400);
  }
});

// 삭제 (ADMIN만)
export const DELETE = withAuth(async (_req: NextRequest, user, context) => {
  const params = await context?.params;
  const table = params?.table;
  const id = params?.id;
  if (!table || !id) return errorResponse("VALIDATION_ERROR", "파라미터 누락", 400);

  const check = checkWriteAccess(table, user.role);
  if (!check.ok && check.error) {
    return errorResponse(check.error.code, check.error.message, check.error.status);
  }

  try {
    await runDelete(table, id);
    return successResponse({ id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "삭제 실패";
    return errorResponse("DELETE_ERROR", message, 400);
  }
});
