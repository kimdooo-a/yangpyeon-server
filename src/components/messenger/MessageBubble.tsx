"use client";

/**
 * MessageBubble — 단일 메시지 버블.
 *
 * variant 분류는 lib/bubble-variant.ts (4 단위 테스트 PASS).
 * Phase 1: TEXT/SYSTEM/recalled 만. 첨부 (IMAGE/FILE) variant 는 Phase 2.
 */
import {
  getMessageBubbleVariant,
  type MessageVariantInput,
} from "./lib/bubble-variant";

export interface MessageBubbleProps {
  message: {
    id: string;
    kind: "TEXT" | "IMAGE" | "FILE" | "SYSTEM";
    body: string | null;
    senderId: string;
    deletedAt: string | Date | null;
    createdAt: string | Date;
  };
  /** 본인이 작성한 메시지인지 (정렬/색상 분기). */
  isOwn: boolean;
  /** 같은 분 묶음의 마지막 메시지에만 시각 표시. */
  showTime?: boolean;
}

function formatHHMM(at: string | Date): string {
  const d = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function MessageBubble({ message, isOwn, showTime = true }: MessageBubbleProps) {
  const v = getMessageBubbleVariant({
    kind: message.kind,
    deletedAt: message.deletedAt,
    isOwn,
  } satisfies MessageVariantInput);

  // 회수된 메시지 본문 = 고정 안내. 시스템 메시지 본문 = body 그대로.
  const displayBody = (() => {
    if (v.variant === "recalled") return "🚫 회수된 메시지입니다";
    if (v.variant === "system") return message.body ?? "";
    return message.body ?? "";
  })();

  const time = formatHHMM(message.createdAt);
  const ariaLabel = `${isOwn ? "내 메시지" : "상대 메시지"}: ${displayBody.slice(0, 80)}, ${time}`;

  return (
    <div className={`${v.containerClass} px-3 py-1`}>
      <div
        className={v.bubbleClass}
        aria-label={ariaLabel}
        data-variant={v.variant}
      >
        <div className={v.textClass}>{displayBody}</div>
        {showTime && v.variant !== "system" && (
          <div className={`text-[10px] mt-1 ${isOwn ? "text-white/70 text-right" : "text-gray-500"}`}>
            {time}
          </div>
        )}
      </div>
    </div>
  );
}
