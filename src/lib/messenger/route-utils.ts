/**
 * src/lib/messenger/route-utils.ts
 *
 * 메신저 라우트 공용 유틸:
 *   - MessengerError → HTTP status 매핑
 *   - 도메인 헬퍼 호출 catch 후 errorResponse 변환
 *   - audit 이벤트 fail-soft 발화
 */
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-response";
import { MessengerError, type MessengerErrorCode } from "./types";
import { auditLogSafe } from "@/lib/audit/safe";

const STATUS_FOR_CODE: Record<MessengerErrorCode, number> = {
  // 공통
  TENANT_MEMBERSHIP_REQUIRED: 403,
  CONVERSATION_NOT_MEMBER: 403,
  CONVERSATION_FORBIDDEN: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  // Conversation
  GROUP_MEMBER_LIMIT_EXCEEDED: 422,
  GROUP_MEMBER_BLOCKED: 422,
  // Messages
  EDIT_WINDOW_EXPIRED: 422,
  DELETE_WINDOW_EXPIRED: 422,
  REPLY_CROSS_CONVERSATION: 422,
  ATTACHMENT_NOT_OWNED: 403,
  ATTACHMENT_NOT_FOUND: 404,
  USER_BLOCKED: 403,
  // Blocks
  BLOCK_SELF: 422,
  DUPLICATE_BLOCK: 409,
  // Reports
  DUPLICATE_REPORT: 409,
  REPORT_ALREADY_RESOLVED: 422,
  REPORT_ACTION_INVALID: 422,
};

/**
 * MessengerError 또는 일반 에러를 HTTP 응답으로 변환.
 * 일반 Error 는 500. ZodError 는 400 (호출자에서 직접 처리 권장).
 */
export function messengerErrorResponse(err: unknown): NextResponse {
  if (err instanceof MessengerError) {
    const status = STATUS_FOR_CODE[err.code] ?? 400;
    return NextResponse.json(
      {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
        },
      },
      { status },
    );
  }
  console.error("[messenger] unhandled error", err);
  return errorResponse("INTERNAL_ERROR", "서버 오류가 발생했습니다", 500);
}

/**
 * 메신저 audit 이벤트 fail-soft 발화 — m2-detailed-plan §2 결정 6 게이트.
 *
 * actor 는 user.email 또는 user.sub. 라우트가 명시 전달.
 */
export async function emitMessengerAudit(input: {
  event: string;
  actor: string;
  request: Request;
  details?: Record<string, unknown>;
}): Promise<void> {
  await auditLogSafe({
    event: input.event,
    actor: input.actor,
    request: input.request,
    details: input.details,
  });
}
