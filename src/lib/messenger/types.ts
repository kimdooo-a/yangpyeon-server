/**
 * src/lib/messenger/types.ts
 *
 * 메신저 도메인 공유 타입 + 에러 코드 단일 진실 소스.
 *
 * 모든 헬퍼는 비즈니스 룰 위반 시 MessengerError 를 throw 한다.
 * 라우트 layer 가 코드별로 HTTP status 매핑 (errorResponse(code, message, status)).
 *
 * 코드 네이밍:
 *   - SCREAMING_SNAKE
 *   - 도메인 prefix 없이 짧게 (메신저 코드는 모두 이 enum 안에)
 *   - 외부 API 응답에 노출되므로 안정적 (변경 시 클라이언트 영향)
 */

export const MESSENGER_ERROR_CODES = {
  // 공통 가드 ─────────────────────────────────────
  /** 같은 tenant 의 멤버가 아닌 사용자 (cookie 경로 cross-validation 실패). */
  TENANT_MEMBERSHIP_REQUIRED: "TENANT_MEMBERSHIP_REQUIRED",
  /** 대화의 멤버 아님 (leftAt IS NOT NULL 또는 row 없음). */
  CONVERSATION_NOT_MEMBER: "CONVERSATION_NOT_MEMBER",
  /** 대화 OWNER/ADMIN 권한 필요. */
  CONVERSATION_FORBIDDEN: "CONVERSATION_FORBIDDEN",
  /** 일반 권한 부족 (sender 본인 아님 등). */
  FORBIDDEN: "FORBIDDEN",
  /** 대상 리소스 미존재 (cross-tenant 침투 방어 — RLS 가 0 row 반환). */
  NOT_FOUND: "NOT_FOUND",

  // Conversation ─────────────────────────────────
  /** GROUP 멤버 수 초과 (≤100, ADR-030 부속결정 #5). */
  GROUP_MEMBER_LIMIT_EXCEEDED: "GROUP_MEMBER_LIMIT_EXCEEDED",
  /** GROUP 생성 시 차단 관계 사용자 포함. */
  GROUP_MEMBER_BLOCKED: "GROUP_MEMBER_BLOCKED",

  // Messages ─────────────────────────────────────
  /** 편집 윈도우 (15분) 경과. */
  EDIT_WINDOW_EXPIRED: "EDIT_WINDOW_EXPIRED",
  /** 자기 회수 윈도우 (24h) 경과 — 운영자만 회수 가능. */
  DELETE_WINDOW_EXPIRED: "DELETE_WINDOW_EXPIRED",
  /** replyToId 가 다른 conversation. */
  REPLY_CROSS_CONVERSATION: "REPLY_CROSS_CONVERSATION",
  /** 첨부 fileId.owner 가 sender 가 아님. */
  ATTACHMENT_NOT_OWNED: "ATTACHMENT_NOT_OWNED",
  /** 첨부 파일 자체 미존재 또는 cross-tenant. */
  ATTACHMENT_NOT_FOUND: "ATTACHMENT_NOT_FOUND",
  /** 송신자 차단됨 (피수신자가 송신자를 차단). */
  USER_BLOCKED: "USER_BLOCKED",

  // Blocks ───────────────────────────────────────
  /** 자기 자신 차단 시도. */
  BLOCK_SELF: "BLOCK_SELF",
  /** 이미 차단된 사용자 (UNIQUE 위반). */
  DUPLICATE_BLOCK: "DUPLICATE_BLOCK",

  // Reports ──────────────────────────────────────
  /** 동일 (reporter, targetKind, targetId) 의 신고 이미 존재. */
  DUPLICATE_REPORT: "DUPLICATE_REPORT",
  /** 신고 대상이 이미 다른 액션으로 처리됨. */
  REPORT_ALREADY_RESOLVED: "REPORT_ALREADY_RESOLVED",
  /** resolve action 이 targetKind 와 부합하지 않음 (예: USER target 에 DELETE_MESSAGE). */
  REPORT_ACTION_INVALID: "REPORT_ACTION_INVALID",
} as const;

export type MessengerErrorCode =
  (typeof MESSENGER_ERROR_CODES)[keyof typeof MESSENGER_ERROR_CODES];

/**
 * 메신저 도메인 비즈니스 룰 위반.
 *
 * 라우트 layer 가 catch 후 errorResponse(code, message, statusFor(code)).
 * 일반 Error 는 500 으로 처리되므로 룰 위반은 반드시 본 클래스 사용.
 */
export class MessengerError extends Error {
  readonly code: MessengerErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: MessengerErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "MessengerError";
    this.code = code;
    this.details = details;
  }
}

/**
 * 헬퍼 호출 결과 — 라우트가 추가 메타데이터 (예: created flag) 를 사용할 때.
 */
export interface SkippedReason {
  userId: string;
  reason: string;
}

/**
 * keyset cursor — base64(JSON({createdAt, id})). desc 정렬.
 */
export interface KeysetCursor {
  createdAt: string;
  id: string;
}

export function encodeCursor(cursor: KeysetCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf-8").toString("base64");
}

export function decodeCursor(raw: string): KeysetCursor | null {
  try {
    const json = Buffer.from(raw, "base64").toString("utf-8");
    const parsed = JSON.parse(json);
    if (
      typeof parsed?.createdAt === "string" &&
      typeof parsed?.id === "string"
    ) {
      return { createdAt: parsed.createdAt, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}
