// @vitest-environment jsdom
/**
 * INFRA-2 Task #4 — MessageList 렌더 TDD (G-NEW-12 해소).
 *
 * 검증 범위:
 *   1. loading=true → skeleton placeholder + aria-busy
 *   2. error 가 set → 에러 텍스트
 *   3. messages 빈 배열 → 안내 텍스트 ("아직 주고받은 메시지가 없습니다")
 *   4. 메시지 reverse asc 표시 (backend desc 입력)
 *   5. isOwn 분기 — currentUserId 일치 시 own, 그 외 상대
 *   6. onReplyMessage 콜백 — 답장 버튼 클릭 시 호출
 *   7. pending 메시지 data-status="pending"
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { MessageRow } from "@/lib/messenger/optimistic-messages";
import { MessageList } from "./MessageList";

function msg(id: string, overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id,
    kind: "TEXT",
    body: `body-${id}`,
    senderId: "other-user",
    replyToId: null,
    clientGeneratedId: `cgid-${id}`,
    editedAt: null,
    editCount: 0,
    deletedAt: null,
    deletedBy: null,
    createdAt: "2026-05-10T08:00:00.000Z",
    attachments: [],
    mentions: [],
    ...overrides,
  };
}

describe("MessageList", () => {
  it("loading state shows skeleton with aria-busy", () => {
    const { container } = render(
      <MessageList
        messages={[]}
        loading
        error={null}
        currentUserId="me"
      />,
    );
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.getByLabelText("메시지 로딩 중")).toBeInTheDocument();
  });

  it("error state shows fallback text", () => {
    render(
      <MessageList
        messages={[]}
        loading={false}
        error="네트워크 오류"
        currentUserId="me"
      />,
    );
    expect(screen.getByText("메시지를 불러오지 못했습니다.")).toBeInTheDocument();
  });

  it("empty messages → guidance text", () => {
    render(
      <MessageList
        messages={[]}
        loading={false}
        error={null}
        currentUserId="me"
      />,
    );
    expect(
      screen.getByText("아직 주고받은 메시지가 없습니다"),
    ).toBeInTheDocument();
  });

  it("reverses backend desc → screen asc", () => {
    // backend: 최신 먼저 (desc) → screen: 오래된 위 (asc)
    const list = [
      msg("m3", { body: "third" }),
      msg("m2", { body: "second" }),
      msg("m1", { body: "first" }),
    ];
    render(
      <MessageList
        messages={list}
        loading={false}
        error={null}
        currentUserId="me"
      />,
    );

    const log = screen.getByRole("log");
    const bubbles = log.querySelectorAll("[data-variant]");
    // 첫 bubble = first (가장 오래된)
    expect(bubbles[0]?.getAttribute("aria-label")).toMatch(/first/);
    expect(bubbles[2]?.getAttribute("aria-label")).toMatch(/third/);
  });

  it("isOwn branches by currentUserId match", () => {
    const list = [
      msg("m1", { senderId: "me", body: "내 메시지" }),
      msg("m2", { senderId: "other-user", body: "상대 메시지" }),
    ];
    render(
      <MessageList
        messages={list}
        loading={false}
        error={null}
        currentUserId="me"
      />,
    );
    expect(
      screen.getByLabelText(/내 메시지: 내 메시지/),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/상대 메시지: 상대 메시지/),
    ).toBeInTheDocument();
  });

  it("onReplyMessage fires with target shape", () => {
    const onReplyMessage = vi.fn();
    const list = [msg("m1", { senderId: "other-user", body: "답장 대상" })];
    render(
      <MessageList
        messages={list}
        loading={false}
        error={null}
        currentUserId="me"
        onReplyMessage={onReplyMessage}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "답장" }));
    expect(onReplyMessage).toHaveBeenCalledWith({
      id: "m1",
      body: "답장 대상",
      kind: "TEXT",
      deletedAt: null,
      senderName: null,
    });
  });

  it("pending optimistic message shows data-status='pending'", () => {
    const list = [
      msg("m1", {
        body: "전송 중",
        senderId: "me",
        _optimistic: { status: "pending" },
      }),
    ];
    const { container } = render(
      <MessageList
        messages={list}
        loading={false}
        error={null}
        currentUserId="me"
      />,
    );
    expect(container.querySelector("[data-status='pending']")).not.toBeNull();
  });
});
