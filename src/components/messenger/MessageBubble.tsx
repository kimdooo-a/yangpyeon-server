"use client";

/**
 * MessageBubble — 단일 메시지 버블.
 *
 * variant 분류는 lib/bubble-variant.ts (4 단위 테스트 PASS).
 * F2-2: pending/failed 시각 표식 — optimistic 송신 상태 분기.
 * F2-3: replyTo (parent message 미리보기) + onReply 콜백 (hover 답장 버튼).
 */
import {
  getMessageBubbleVariant,
  type MessageVariantInput,
} from "./lib/bubble-variant";
import { CornerUpLeft } from "lucide-react";
import {
  formatReplyPreview,
  type MessageKindForQuote,
} from "@/lib/messenger/reply-quote";

export interface MessageBubbleProps {
  message: {
    id: string;
    kind: "TEXT" | "IMAGE" | "FILE" | "SYSTEM";
    body: string | null;
    senderId: string;
    replyToId?: string | null;
    deletedAt: string | Date | null;
    createdAt: string | Date;
  };
  isOwn: boolean;
  showTime?: boolean;
  pending?: boolean;
  failed?: boolean;
  failureReason?: string;
  /** F2-3 — 답장 인용 부모 메시지 (page 가 indexBy(id) 로 lookup) */
  replyTo?: {
    body: string | null;
    kind: MessageKindForQuote;
    senderName?: string | null;
    deletedAt?: string | Date | null;
  } | null;
  /** F2-3 — 답장 버튼 클릭 (메시지 회수/시스템 메시지에서는 비활성) */
  onReply?: () => void;
}

function formatHHMM(at: string | Date): string {
  const d = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function MessageBubble({
  message,
  isOwn,
  showTime = true,
  pending = false,
  failed = false,
  failureReason,
  replyTo,
  onReply,
}: MessageBubbleProps) {
  const v = getMessageBubbleVariant({
    kind: message.kind,
    deletedAt: message.deletedAt,
    isOwn,
  } satisfies MessageVariantInput);

  const displayBody = (() => {
    if (v.variant === "recalled") return "🚫 회수된 메시지입니다";
    if (v.variant === "system") return message.body ?? "";
    return message.body ?? "";
  })();

  const time = formatHHMM(message.createdAt);
  const ariaLabel = `${isOwn ? "내 메시지" : "상대 메시지"}: ${displayBody.slice(0, 80)}, ${time}${
    pending ? " (전송 중)" : failed ? " (전송 실패)" : ""
  }`;

  const wrapperClass = `${v.containerClass} px-3 py-1${pending ? " opacity-60" : ""}`;

  // 답장 가능 = 회수 X + 시스템 X + pending X (서버 ack 후만 답장 가능)
  const canReply =
    onReply && v.variant !== "recalled" && v.variant !== "system" && !pending;

  // replyTo 가 있고 message.replyToId 가 가리키는 부모가 lookup 됐을 때만 인용 표시
  const replyPreview =
    message.replyToId && replyTo
      ? formatReplyPreview({
          body: replyTo.body,
          kind: replyTo.kind,
          deletedAt: replyTo.deletedAt,
          senderName: replyTo.senderName,
        })
      : null;

  // replyToId 가 있는데 lookup 실패 (부모가 같은 페이지 밖) → fallback 라벨
  const replyFallback =
    message.replyToId && !replyTo ? { senderLabel: "이전 메시지", snippet: "" } : null;

  return (
    <div
      className={wrapperClass}
      data-status={pending ? "pending" : failed ? "failed" : undefined}
    >
      <div className="group relative inline-flex flex-col">
        {(replyPreview || replyFallback) && v.variant !== "system" && (
          <div
            className={`text-[11px] mb-0.5 px-2 py-1 rounded-md border-l-2 ${
              isOwn
                ? "border-primary/40 bg-surface-200/70 text-gray-600"
                : "border-primary/40 bg-surface-200 text-gray-600"
            } max-w-[260px]`}
            aria-label="답장 인용"
          >
            <div className="font-semibold text-primary truncate">
              ↪ {(replyPreview ?? replyFallback)!.senderLabel}
            </div>
            <div className="truncate">
              {(replyPreview ?? replyFallback)!.snippet || "(미리보기 없음)"}
            </div>
          </div>
        )}
        <div
          className={v.bubbleClass}
          aria-label={ariaLabel}
          data-variant={v.variant}
        >
          <div className={v.textClass}>{displayBody}</div>
          {showTime && v.variant !== "system" && (
            <div
              className={`text-[10px] mt-1 ${isOwn ? "text-white/70 text-right" : "text-gray-500"}`}
            >
              {time}
              {failed && (
                <span
                  className="ml-1.5 text-red-400"
                  title={failureReason ?? "전송 실패"}
                  aria-label={`전송 실패: ${failureReason ?? ""}`}
                >
                  ⚠ 실패
                </span>
              )}
            </div>
          )}
        </div>
        {canReply && (
          <button
            type="button"
            onClick={onReply}
            aria-label="답장"
            title="답장"
            className={`opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity absolute top-1 ${
              isOwn ? "-left-7" : "-right-7"
            } p-1 rounded-full bg-surface-100 border border-border text-gray-500 hover:text-primary hover:bg-surface-200`}
          >
            <CornerUpLeft size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
