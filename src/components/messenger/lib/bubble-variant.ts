/**
 * MessageBubble 시각 variant — 순수 함수.
 *
 * (kind, deletedAt, isOwn) 입력으로 4 variant 분류:
 *   - own:     본인 송신 (brand 배경, 오른쪽 정렬)
 *   - other:   상대 송신 (surface-200 배경, 왼쪽 정렬)
 *   - system:  시스템 메시지 (가운데 정렬, 작은 회색)
 *   - recalled: 회수된 메시지 (italic 회색, deletedAt IS NOT NULL 우선)
 *
 * Phase 1 = 텍스트/시스템/회수 분기만. 첨부 (IMAGE/FILE) variant 는 Phase 2.
 */

export type BubbleVariant = "own" | "other" | "system" | "recalled";

export interface MessageVariant {
  variant: BubbleVariant;
  /** 좌/우/중앙 정렬용 flex container. */
  containerClass: string;
  /** 버블 자체의 배경 + 색상 + 모서리. */
  bubbleClass: string;
  /** 텍스트 size. */
  textClass: string;
  /** long-press / 답장 / 회수 메뉴 활성화 여부 — 회수 메시지는 비활성. */
  isInteractive: boolean;
}

export interface MessageVariantInput {
  kind: "TEXT" | "IMAGE" | "FILE" | "SYSTEM";
  deletedAt: Date | string | null;
  isOwn: boolean;
}

export function getMessageBubbleVariant(
  input: MessageVariantInput,
): MessageVariant {
  const { kind, deletedAt, isOwn } = input;

  // 회수 우선 — kind 와 무관.
  if (deletedAt !== null) {
    return {
      variant: "recalled",
      containerClass: isOwn ? "flex justify-end" : "flex justify-start",
      bubbleClass:
        "rounded-xl px-4 py-2 max-w-[70%] bg-surface-300 italic text-gray-500",
      textClass: "text-sm",
      isInteractive: false,
    };
  }

  if (kind === "SYSTEM") {
    return {
      variant: "system",
      containerClass: "flex justify-center",
      bubbleClass: "px-3 py-1 text-[11px] text-gray-500",
      textClass: "",
      isInteractive: false,
    };
  }

  if (isOwn) {
    return {
      variant: "own",
      containerClass: "flex justify-end",
      bubbleClass: "rounded-xl px-4 py-2 max-w-[70%] bg-brand text-white",
      textClass: "text-sm",
      isInteractive: true,
    };
  }

  return {
    variant: "other",
    containerClass: "flex justify-start",
    bubbleClass: "rounded-xl px-4 py-2 max-w-[70%] bg-surface-200 text-gray-800",
    textClass: "text-sm",
    isInteractive: true,
  };
}
