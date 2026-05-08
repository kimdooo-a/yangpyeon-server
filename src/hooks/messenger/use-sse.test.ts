// @vitest-environment jsdom

/**
 * use-sse — TDD (M4 Phase 2 F2-4 + INFRA-1).
 *
 * jsdom 환경 + EventSource mock 으로 react hook 동작 검증.
 *
 * 검증 영역:
 *   - url=null → EventSource 미생성
 *   - url=string → EventSource 생성 + 이벤트 listener 등록
 *   - dispatch → onEvent 콜백 호출 + parseSseEvent 변환
 *   - unmount → close
 *   - url 변경 → 이전 close + 새 EventSource
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSse } from "./use-sse";
import type { RealtimeEvent } from "@/lib/messenger/sse-events";

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  withCredentials: boolean;
  readyState = 0;
  listeners: Record<string, Array<(e: { data: string }) => void>> = {};
  closed = false;
  constructor(url: string, init?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = init?.withCredentials ?? false;
    MockEventSource.instances.push(this);
  }
  addEventListener(name: string, fn: (e: { data: string }) => void) {
    (this.listeners[name] ??= []).push(fn);
  }
  removeEventListener(name: string, fn: (e: { data: string }) => void) {
    this.listeners[name] = (this.listeners[name] ?? []).filter((f) => f !== fn);
  }
  close() {
    this.closed = true;
  }
  dispatch(name: string, data: string) {
    for (const fn of this.listeners[name] ?? []) fn({ data });
  }
  static reset() {
    MockEventSource.instances = [];
  }
}

beforeEach(() => {
  MockEventSource.reset();
  vi.stubGlobal("EventSource", MockEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useSse", () => {
  it("url=null → EventSource 미생성", () => {
    const onEvent = vi.fn();
    renderHook(() => useSse(null, onEvent));
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("url=string → EventSource 생성 + connected=false 초기상태", () => {
    const onEvent = vi.fn();
    const { result } = renderHook(() => useSse("/api/sse", onEvent));
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe("/api/sse");
    expect(result.current.connected).toBe(false);
  });

  it("ready 이벤트 dispatch → connected=true + onEvent 호출", () => {
    const onEvent = vi.fn();
    const { result } = renderHook(() => useSse("/api/sse", onEvent));
    act(() => {
      MockEventSource.instances[0].dispatch(
        "ready",
        JSON.stringify({ channel: "x", conversationId: "c1" }),
      );
    });
    expect(result.current.connected).toBe(true);
    expect(onEvent).toHaveBeenCalledTimes(1);
    const arg = onEvent.mock.calls[0][0] as RealtimeEvent;
    expect(arg.type).toBe("ready");
  });

  it("message.created dispatch → onEvent 에 typed event 전달", () => {
    const onEvent = vi.fn();
    renderHook(() => useSse("/api/sse", onEvent));
    act(() => {
      MockEventSource.instances[0].dispatch(
        "message.created",
        JSON.stringify({
          message: {
            id: "m1",
            kind: "TEXT",
            body: "hi",
            senderId: "u1",
            replyToId: null,
            clientGeneratedId: "c1",
            editedAt: null,
            editCount: 0,
            deletedAt: null,
            deletedBy: null,
            createdAt: "2026-05-09T00:00:00.000Z",
            attachments: [],
            mentions: [],
          },
        }),
      );
    });
    expect(onEvent).toHaveBeenCalledTimes(1);
    const arg = onEvent.mock.calls[0][0] as RealtimeEvent;
    expect(arg.type).toBe("message.created");
  });

  it("unmount → close() 호출", () => {
    const onEvent = vi.fn();
    const { unmount } = renderHook(() => useSse("/api/sse", onEvent));
    expect(MockEventSource.instances[0].closed).toBe(false);
    unmount();
    expect(MockEventSource.instances[0].closed).toBe(true);
  });

  it("url 변경 → 이전 close + 새 EventSource 생성", () => {
    const onEvent = vi.fn();
    const { rerender } = renderHook(({ url }) => useSse(url, onEvent), {
      initialProps: { url: "/api/sse/1" as string | null },
    });
    expect(MockEventSource.instances).toHaveLength(1);
    rerender({ url: "/api/sse/2" });
    expect(MockEventSource.instances).toHaveLength(2);
    expect(MockEventSource.instances[0].closed).toBe(true);
    expect(MockEventSource.instances[1].url).toBe("/api/sse/2");
  });

  it("url=null 로 변경 → 이전 close, 새 EventSource 미생성", () => {
    const onEvent = vi.fn();
    const { rerender } = renderHook(({ url }) => useSse(url, onEvent), {
      initialProps: { url: "/api/sse/1" as string | null },
    });
    rerender({ url: null });
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].closed).toBe(true);
  });
});
