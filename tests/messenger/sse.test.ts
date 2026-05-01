/**
 * tests/messenger/sse.test.ts
 *
 * M3 SSE 채널 — publish helper 단위 테스트.
 *
 * 시나리오:
 *   1. convChannelKey: tenant/conversation 조합 결과는 멱등 + cross-tenant 격리.
 *   2. userChannelKey: tenant/user 조합도 동일.
 *   3. publishConvEvent: bus.subscribe 가 받는 RealtimeMessage 의 channel/event/payload 일치.
 *   4. publishConvEvent: payload 에 conversationId 자동 주입.
 *   5. publishUserEvent: payload pass-through (자동 주입 없음).
 *   6. publishConvEvent: bus.publish 예외 swallow (fail-soft).
 *   7. cross-tenant 격리: 같은 conversationId 가 다른 tenant 채널 구독자에 도달하지 않음.
 */
import { describe, it, expect } from "vitest";
import { subscribe } from "@/lib/realtime/bus";
import type { RealtimeMessage } from "@/lib/types/supabase-clone";
import {
  convChannelKey,
  userChannelKey,
  publishConvEvent,
  publishUserEvent,
} from "@/lib/messenger/sse";

const T1 = "11111111-1111-1111-1111-111111111111";
const T2 = "22222222-2222-2222-2222-222222222222";
const C1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const U1 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("messenger/sse — channel keys", () => {
  it("convChannelKey: tenant + conv 조합", () => {
    expect(convChannelKey(T1, C1)).toBe(`t:${T1}:conv:${C1}`);
    // 멱등
    expect(convChannelKey(T1, C1)).toBe(convChannelKey(T1, C1));
  });

  it("convChannelKey: cross-tenant 격리", () => {
    expect(convChannelKey(T1, C1)).not.toBe(convChannelKey(T2, C1));
  });

  it("userChannelKey: tenant + user 조합", () => {
    expect(userChannelKey(T1, U1)).toBe(`t:${T1}:user:${U1}`);
  });
});

describe("messenger/sse — publishConvEvent", () => {
  it("subscribe 가 RealtimeMessage 를 channel/event/payload 그대로 수신", () => {
    const received: RealtimeMessage[] = [];
    const unsub = subscribe(convChannelKey(T1, C1), (msg) => {
      received.push(msg);
    });
    publishConvEvent(T1, C1, "message.created", {
      message: { id: "msg-1", body: "hello" },
    });
    unsub();

    expect(received).toHaveLength(1);
    expect(received[0].channel).toBe(`t:${T1}:conv:${C1}`);
    expect(received[0].event).toBe("message.created");
    expect(received[0].payload).toMatchObject({
      conversationId: C1,
      message: { id: "msg-1" },
    });
  });

  it("payload 에 conversationId 자동 주입", () => {
    const received: RealtimeMessage[] = [];
    const unsub = subscribe(convChannelKey(T1, C1), (msg) => {
      received.push(msg);
    });
    publishConvEvent(T1, C1, "typing.started", {
      userId: U1,
      expiresAt: "2026-05-02T00:00:00.000Z",
    });
    unsub();

    expect(received).toHaveLength(1);
    expect(received[0].payload).toMatchObject({
      conversationId: C1,
      userId: U1,
    });
  });

  it("cross-tenant 격리: T2 구독자는 T1 publish 를 받지 않음", () => {
    const t1: RealtimeMessage[] = [];
    const t2: RealtimeMessage[] = [];
    const u1 = subscribe(convChannelKey(T1, C1), (m) => t1.push(m));
    const u2 = subscribe(convChannelKey(T2, C1), (m) => t2.push(m));

    publishConvEvent(T1, C1, "message.created", { message: { id: "m1" } });

    u1();
    u2();
    expect(t1).toHaveLength(1);
    expect(t2).toHaveLength(0);
  });

  it("subscriber callback 예외는 호출자(publisher)로 전파되지 않음", () => {
    // publisher 가 안전하게 fire-and-forget 동작하는지 검증.
    // EventEmitter 는 listener 예외를 'error' 이벤트로 전파하지만, 우리 wrapper 는
    // try/catch 로 감싸서 publisher 가 throw 하지 않도록 보호한다.
    const unsub = subscribe(convChannelKey(T1, C1), () => {
      throw new Error("listener boom");
    });
    expect(() =>
      publishConvEvent(T1, C1, "message.created", { messageId: "x" }),
    ).not.toThrow();
    unsub();
  });
});

describe("messenger/sse — publishUserEvent", () => {
  it("payload pass-through (자동 주입 없음)", () => {
    const received: RealtimeMessage[] = [];
    const unsub = subscribe(userChannelKey(T1, U1), (msg) => {
      received.push(msg);
    });
    publishUserEvent(T1, U1, "mention.received", {
      messageId: "msg-1",
      conversationId: C1,
      sender: "alice",
    });
    unsub();

    expect(received).toHaveLength(1);
    expect(received[0].channel).toBe(`t:${T1}:user:${U1}`);
    expect(received[0].event).toBe("mention.received");
    expect(received[0].payload).toEqual({
      messageId: "msg-1",
      conversationId: C1,
      sender: "alice",
    });
  });
});
