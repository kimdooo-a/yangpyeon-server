// @vitest-environment jsdom
/**
 * INFRA-2 Task #2 — useMessages SWR 마이그레이션 TDD.
 *
 * 검증 범위:
 *   1. 마운트 시 messages + hasMore 로드 (SWR 초기 fetch)
 *   2. sendOptimistic happy path — prepend → server response 로 swap
 *   3. sendOptimistic 5xx — _optimistic.status='failed' + error 메시지 노출
 *   4. SWR dedup — 같은 conversationId 다중 호출자 = fetch 1회
 *   5. conversationId="" → 마운트 fetch 0 (SWR null key)
 *
 * useSse 는 vi.mock 으로 차단 (jsdom EventSource 실연결 회피).
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { renderHook, waitFor, act } from "@testing-library/react";
import { SWRConfig } from "swr";
import type { ReactNode } from "react";
import { server } from "@/test/msw/server";
import type { MessageRow } from "@/lib/messenger/optimistic-messages";

vi.mock("./use-sse", () => ({
  useSse: () => ({ connected: false }),
}));

import { useMessages } from "./useMessages";

const CONVERSATION_ID = "conv-1";
const MESSAGES_PATH = `/api/v1/t/default/messenger/conversations/${CONVERSATION_ID}/messages`;

function makeServerMessage(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: "server-msg-1",
    kind: "TEXT",
    body: "안녕",
    senderId: "user-1",
    replyToId: null,
    clientGeneratedId: "cgid-existing",
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

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
  );
}

describe("useMessages (SWR)", () => {
  beforeEach(() => {
    server.use(
      http.get(MESSAGES_PATH, () =>
        HttpResponse.json({
          success: true,
          data: {
            items: [makeServerMessage({ id: "msg-existing" })],
            nextCursor: null,
            hasMore: true,
          },
        }),
      ),
    );
  });

  it("loads messages and hasMore on mount", async () => {
    const { result } = renderHook(() => useMessages(CONVERSATION_ID), {
      wrapper,
    });

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.id).toBe("msg-existing");
    expect(result.current.hasMore).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("does not fetch when conversationId is empty", async () => {
    let fetchCount = 0;
    server.use(
      http.get(MESSAGES_PATH, () => {
        fetchCount++;
        return HttpResponse.json({
          success: true,
          data: { items: [], nextCursor: null, hasMore: false },
        });
      }),
    );

    renderHook(() => useMessages(""), { wrapper });
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchCount).toBe(0);
  });

  it("sendOptimistic prepends then swaps with server response", async () => {
    server.use(
      http.post(MESSAGES_PATH, () =>
        HttpResponse.json(
          {
            success: true,
            data: {
              message: makeServerMessage({
                id: "server-msg-new",
                clientGeneratedId: "cgid-new",
                body: "낙관적",
              }),
              created: true,
            },
          },
          { status: 201 },
        ),
      ),
    );

    const { result } = renderHook(() => useMessages(CONVERSATION_ID), {
      wrapper,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let sendResult: { ok: boolean; error?: string } = { ok: false };
    await act(async () => {
      sendResult = await result.current.sendOptimistic(
        {
          kind: "TEXT",
          body: "낙관적",
          clientGeneratedId: "cgid-new",
        },
        "user-1",
      );
    });

    expect(sendResult.ok).toBe(true);
    // 서버 응답으로 swap 된 후 — items 에 server-msg-new 가 존재.
    const newMsg = result.current.messages.find(
      (m) => m.clientGeneratedId === "cgid-new",
    );
    expect(newMsg).toBeDefined();
    expect(newMsg?.id).toBe("server-msg-new");
    expect(newMsg?._optimistic).toBeUndefined();
  });

  it("sendOptimistic marks failed on 5xx", async () => {
    server.use(
      http.post(MESSAGES_PATH, () =>
        HttpResponse.json(
          { success: false, error: { message: "서버 오류" } },
          { status: 500 },
        ),
      ),
    );

    const { result } = renderHook(() => useMessages(CONVERSATION_ID), {
      wrapper,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let sendResult: { ok: boolean; error?: string } = { ok: false };
    await act(async () => {
      sendResult = await result.current.sendOptimistic(
        {
          kind: "TEXT",
          body: "실패",
          clientGeneratedId: "cgid-fail",
        },
        "user-1",
      );
    });

    expect(sendResult.ok).toBe(false);
    expect(sendResult.error).toBe("서버 오류");

    const failedMsg = result.current.messages.find(
      (m) => m.clientGeneratedId === "cgid-fail",
    );
    expect(failedMsg?._optimistic?.status).toBe("failed");
    expect(failedMsg?._optimistic?.error).toBe("서버 오류");
  });

  it("dedupes parallel hook instances for same conversationId", async () => {
    let fetchCount = 0;
    server.use(
      http.get(MESSAGES_PATH, () => {
        fetchCount++;
        return HttpResponse.json({
          success: true,
          data: { items: [], nextCursor: null, hasMore: false },
        });
      }),
    );

    renderHook(
      () => {
        useMessages(CONVERSATION_ID);
        useMessages(CONVERSATION_ID);
        useMessages(CONVERSATION_ID);
      },
      { wrapper },
    );

    await waitFor(() => expect(fetchCount).toBeGreaterThanOrEqual(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchCount).toBe(1);
  });
});
