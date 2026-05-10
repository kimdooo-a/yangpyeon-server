// @vitest-environment jsdom
/**
 * INFRA-2 Task #4 — MessageBubble 렌더 TDD (G-NEW-12 해소).
 *
 * 검증 범위:
 *   1. TEXT body 렌더 + 시간 표시
 *   2. pending 시 data-status="pending" + opacity-60
 *   3. failed 시 "⚠ 실패" 표식 + failureReason aria
 *   4. recalled 분기 ("🚫 회수된 메시지입니다")
 *   5. onReply 핸들러 — 답장 버튼 클릭 시 호출
 *   6. recalled 시 답장 버튼 hidden
 *   7. attachments 가 있으면 MessageAttachment 위임 렌더
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { MessageBubbleProps } from "./MessageBubble";
import { MessageBubble } from "./MessageBubble";

const baseMessage: MessageBubbleProps["message"] = {
  id: "msg-1",
  kind: "TEXT",
  body: "안녕하세요",
  senderId: "user-1",
  replyToId: null,
  deletedAt: null,
  createdAt: "2026-05-10T08:00:00.000Z",
};

function render_(props: Partial<MessageBubbleProps> = {}) {
  return render(
    <MessageBubble message={baseMessage} isOwn={false} {...props} />,
  );
}

describe("MessageBubble", () => {
  it("renders TEXT body", () => {
    render_();
    expect(screen.getByText("안녕하세요")).toBeInTheDocument();
  });

  it("pending state sets data-status='pending' and opacity-60", () => {
    const { container } = render_({ pending: true });
    const wrapper = container.querySelector("[data-status='pending']");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).toContain("opacity-60");
  });

  it("failed state shows '⚠ 실패' marker with failureReason", () => {
    render_({ failed: true, failureReason: "네트워크 오류" });
    const marker = screen.getByText(/⚠ 실패/);
    expect(marker).toBeInTheDocument();
    expect(marker).toHaveAttribute("aria-label", "전송 실패: 네트워크 오류");
  });

  it("recalled (deletedAt non-null) shows '🚫 회수된 메시지입니다'", () => {
    render_({
      message: { ...baseMessage, deletedAt: "2026-05-10T09:00:00.000Z" },
    });
    expect(screen.getByText("🚫 회수된 메시지입니다")).toBeInTheDocument();
  });

  it("onReply fires when reply button clicked", () => {
    const onReply = vi.fn();
    render_({ onReply });
    const btn = screen.getByRole("button", { name: "답장" });
    fireEvent.click(btn);
    expect(onReply).toHaveBeenCalledTimes(1);
  });

  it("recalled message hides reply button", () => {
    const onReply = vi.fn();
    render_({
      onReply,
      message: { ...baseMessage, deletedAt: "2026-05-10T09:00:00.000Z" },
    });
    expect(screen.queryByRole("button", { name: "답장" })).not.toBeInTheDocument();
  });

  it("delegates attachments to MessageAttachment", () => {
    render_({
      message: {
        ...baseMessage,
        attachments: [
          {
            id: "att-1",
            fileId: "img-1",
            kind: "IMAGE",
            displayOrder: 0,
          },
        ],
      },
    });
    expect(screen.getByRole("img", { name: "첨부 이미지" })).toBeInTheDocument();
  });
});
