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

describe("messenger/sse — user-channel 이벤트 4종 PRD payload 계약 (api-surface §4.3)", () => {
  it("mention.received: {messageId, conversationId, sender, snippet} 형식 + 자동 주입 없음", () => {
    const received: RealtimeMessage[] = [];
    const unsub = subscribe(userChannelKey(T1, U1), (m) => received.push(m));
    publishUserEvent(T1, U1, "mention.received", {
      messageId: "msg-mention-1",
      conversationId: C1,
      sender: "user-sender",
      snippet: "hi @bob 회의 시작합니다",
    });
    unsub();
    expect(received).toHaveLength(1);
    expect(received[0].event).toBe("mention.received");
    expect(received[0].payload).toEqual({
      messageId: "msg-mention-1",
      conversationId: C1,
      sender: "user-sender",
      snippet: "hi @bob 회의 시작합니다",
    });
    // conv 채널과 달리 conversationId 자동 주입 안 함 — payload 그대로.
    expect(Object.keys(received[0].payload as object).sort()).toEqual(
      ["conversationId", "messageId", "sender", "snippet"].sort(),
    );
  });

  it("dm.received: {messageId, conversationId, sender, snippet} 형식", () => {
    const received: RealtimeMessage[] = [];
    const unsub = subscribe(userChannelKey(T1, U1), (m) => received.push(m));
    publishUserEvent(T1, U1, "dm.received", {
      messageId: "msg-dm-1",
      conversationId: C1,
      sender: "user-sender",
      snippet: "안녕",
    });
    unsub();
    expect(received[0].event).toBe("dm.received");
    expect(received[0].payload).toEqual({
      messageId: "msg-dm-1",
      conversationId: C1,
      sender: "user-sender",
      snippet: "안녕",
    });
  });

  it("report.resolved: {reportId, action, note} 형식 — note 는 null 허용", () => {
    const received: RealtimeMessage[] = [];
    const unsub = subscribe(userChannelKey(T1, U1), (m) => received.push(m));
    publishUserEvent(T1, U1, "report.resolved", {
      reportId: "report-1",
      action: "DELETE_MESSAGE",
      note: null,
    });
    publishUserEvent(T1, U1, "report.resolved", {
      reportId: "report-2",
      action: "DISMISS",
      note: "운영자 검토 완료",
    });
    unsub();
    expect(received).toHaveLength(2);
    expect(received[0].payload).toEqual({
      reportId: "report-1",
      action: "DELETE_MESSAGE",
      note: null,
    });
    expect(received[1].payload).toEqual({
      reportId: "report-2",
      action: "DISMISS",
      note: "운영자 검토 완료",
    });
  });

  it("block.created: {blockId, blockedUserId} 형식 — blocker 본인 채널 (cross-device sync)", () => {
    const received: RealtimeMessage[] = [];
    // blocker 본인 채널 구독.
    const unsub = subscribe(userChannelKey(T1, U1), (m) => received.push(m));
    // 차단당한 사람 채널은 별개 — 격리 검증.
    const blockedReceived: RealtimeMessage[] = [];
    const U2 = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const unsubBlocked = subscribe(userChannelKey(T1, U2), (m) =>
      blockedReceived.push(m),
    );

    publishUserEvent(T1, U1, "block.created", {
      blockId: "block-1",
      blockedUserId: U2,
    });
    unsub();
    unsubBlocked();

    expect(received).toHaveLength(1);
    expect(received[0].payload).toEqual({
      blockId: "block-1",
      blockedUserId: U2,
    });
    // 차단당한 사람에게는 publish 되지 않음 — stalker risk 차단.
    expect(blockedReceived).toHaveLength(0);
  });

  it("cross-tenant 격리: T2 의 같은 userId 구독자는 T1 user-channel publish 를 받지 않음", () => {
    const t1: RealtimeMessage[] = [];
    const t2: RealtimeMessage[] = [];
    const u1 = subscribe(userChannelKey(T1, U1), (m) => t1.push(m));
    const u2 = subscribe(userChannelKey(T2, U1), (m) => t2.push(m));
    publishUserEvent(T1, U1, "mention.received", {
      messageId: "x",
      conversationId: C1,
      sender: "s",
      snippet: "",
    });
    u1();
    u2();
    expect(t1).toHaveLength(1);
    expect(t2).toHaveLength(0);
  });
});
