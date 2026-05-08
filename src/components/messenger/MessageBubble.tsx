"use client";

/**
 * MessageBubble — 단일 메시지 버블.
 *
 * variant 분류는 lib/bubble-variant.ts (4 단위 테스트 PASS).
 * F2-2 (M4 Phase 2): pending/failed 시각 표식 추가 — optimistic 송신 상태 분기.
 *   pending → opacity-60 (서버 ack 전)
 *   failed → 빨간 점 + 실패 사유 title attribute (재시도 UI 는 F2-3+)
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
  /** F2-2 — 낙관적 송신 중 (서버 ack 대기) */
  pending?: boolean;
  /** F2-2 — 낙관적 송신 실패 */
  failed?: boolean;
  /** F2-2 — 실패 사유 (title 툴팁 노출) */
  failureReason?: string;
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

  return (
    <div className={wrapperClass} data-status={pending ? "pending" : failed ? "failed" : undefined}>
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
    </div>
  );
}
