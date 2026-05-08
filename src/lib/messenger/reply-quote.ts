/**
 * Reply quote pure logic — F2-3 (M4 Phase 2).
 *
 * 답장 인용 미리보기 텍스트/라벨 빌더. M3 user-channel `buildSnippet`
 * (`messages/route.ts:30`) 와 80자 컷 정합 (서버 알림 snippet 과 같은 룰).
 */

const DEFAULT_MAX = 80;

export function truncateQuoteBody(body: string, max: number = DEFAULT_MAX): string {
  if (body.length <= max) return body;
  return body.slice(0, max) + "…";
}

export type MessageKindForQuote = "TEXT" | "IMAGE" | "FILE" | "SYSTEM";

export interface ReplyPreviewInput {
  body: string | null;
  kind: MessageKindForQuote;
  deletedAt?: string | Date | null;
  senderName?: string | null;
}

export interface ReplyPreview {
  senderLabel: string;
  snippet: string;
  variant: "text" | "image" | "file" | "system" | "recalled";
}

/**
 * 답장 인용 미리보기 — sender 라벨 + 본문 snippet + variant.
 *
 * 분기:
 *   - deletedAt 있음 → "🚫 회수된 메시지"
 *   - kind=SYSTEM → "(시스템 메시지)"
 *   - kind=IMAGE → "📷 사진"
 *   - kind=FILE → "📎 파일"
 *   - kind=TEXT → 80자컷 본문 (null 이면 빈 문자열)
 */
export function formatReplyPreview(input: ReplyPreviewInput): ReplyPreview {
  const senderLabel = input.senderName ?? "알 수 없음";
  if (input.deletedAt) {
    return { senderLabel, snippet: "🚫 회수된 메시지", variant: "recalled" };
  }
  switch (input.kind) {
    case "IMAGE":
      return { senderLabel, snippet: "📷 사진", variant: "image" };
    case "FILE":
      return { senderLabel, snippet: "📎 파일", variant: "file" };
    case "SYSTEM":
      return { senderLabel, snippet: "(시스템 메시지)", variant: "system" };
    case "TEXT":
    default:
      return {
        senderLabel,
        snippet: input.body ? truncateQuoteBody(input.body) : "",
        variant: "text",
      };
  }
}
