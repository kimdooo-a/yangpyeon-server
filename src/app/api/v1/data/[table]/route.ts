import { NextRequest } from "next/server";
import { withAuth } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import {
  checkReadAccess,
  checkWriteAccess,
  runList,
  runCreate,
} from "@/lib/data-api/handler";

export const runtime = "nodejs";

// 테이블 목록 조회
export const GET = withAuth(async (request: NextRequest, user, context) => {
  const params = await context?.params;
  const table = params?.table;
  if (!table) return errorResponse("VALIDATION_ERROR", "table 누락", 400);

  const check = checkReadAccess(table, user.role);
  if (!check.ok && check.error) {
    return errorResponse(check.error.code, check.error.message, check.error.status);
  }

  try {
    const result = await runList(table, request.nextUrl.searchParams, {
      role: user.role,
      userId: user.sub,
    });
    return successResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "조회 실패";
    return errorResponse("QUERY_ERROR", message, 400);
  }
});

// 테이블 레코드 생성 (ADMIN만)
export const POST = withAuth(async (request: NextRequest, user, context) => {
  const params = await context?.params;
  const table = params?.table;
  if (!table) return errorResponse("VALIDATION_ERROR", "table 누락", 400);

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
    const created = await runCreate(table, body as Record<string, unknown>);
    return successResponse(created, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "생성 실패";
    return errorResponse("CREATE_ERROR", message, 400);
  }
});
