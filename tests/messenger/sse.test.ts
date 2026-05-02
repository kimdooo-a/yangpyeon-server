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
  encodeSseEvent,
  encodeSseComment,
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

describe("messenger/sse — wire format (EventSource spec)", () => {
  it("encodeSseEvent: `event: <name>\\ndata: <json>\\n\\n` 형식", () => {
    const out = encodeSseEvent("message.created", {
      messageId: "m-1",
      body: "hello",
    });
    expect(out).toBe(
      `event: message.created\ndata: {"messageId":"m-1","body":"hello"}\n\n`,
    );
    // EventSource parser 가 인식하는 핵심: `\n\n` 종결자.
    expect(out.endsWith("\n\n")).toBe(true);
  });

  it("encodeSseEvent: payload 가 nested 객체 — JSON.stringify 동등", () => {
    const payload = { user: { id: "u-1", name: "Alice" }, ts: 1234567890 };
    const out = encodeSseEvent("typing.started", payload);
    expect(out).toBe(`event: typing.started\ndata: ${JSON.stringify(payload)}\n\n`);
  });

  it("encodeSseComment: `: <text>\\n\\n` 형식 (EventSource 가 무시)", () => {
    expect(encodeSseComment("keepalive")).toBe(": keepalive\n\n");
  });

  it("encodeSseEvent: payload 의 한글/이모지 unescape 보존", () => {
    const out = encodeSseEvent("dm.received", { snippet: "안녕 👋" });
    // JSON.stringify 가 한글/이모지는 그대로 출력.
    expect(out).toContain("안녕 👋");
  });
});

describe("messenger/sse — bus → stream end-to-end (EventSource simulation)", () => {
  it("subscribe + publish + encode → SSE wire bytes 가 EventSource parser 가 읽을 형식", async () => {
    const T = "11111111-1111-1111-1111-111111111111";
    const C = "ccccccc-cccc-cccc-cccc-cccccccccccc";
    const collected: string[] = [];

    // route.ts 와 동일한 구독 + 인코딩 흐름.
    const unsub = subscribe(convChannelKey(T, C), (msg) => {
      collected.push(encodeSseEvent(msg.event, msg.payload));
    });

    publishConvEvent(T, C, "message.created", {
      message: { id: "m-1", body: "live" },
    });
    publishConvEvent(T, C, "typing.started", { userId: "u-2" });
    publishConvEvent(T, C, "receipt.updated", { lastReadMessageId: "m-1" });

    unsub();

    expect(collected).toHaveLength(3);
    // EventSource 가 `event:` 와 `data:` 를 라인 단위로 파싱.
    expect(collected[0]).toMatch(/^event: message\.created\ndata: \{.*"id":"m-1".*\}\n\n$/);
    expect(collected[1]).toMatch(/^event: typing\.started\n/);
    expect(collected[2]).toMatch(/^event: receipt\.updated\n/);
  });

  it("ReadableStream + TextEncoder 통합: 1 publish → 1 chunk decoded back to event", async () => {
    const T = "11111111-1111-1111-1111-111111111111";
    const C = "ddddddd-dddd-dddd-dddd-dddddddddddd";
    const encoder = new TextEncoder();

    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });

    const unsub = subscribe(convChannelKey(T, C), (msg) => {
      controller.enqueue(encoder.encode(encodeSseEvent(msg.event, msg.payload)));
    });

    publishConvEvent(T, C, "message.created", { message: { id: "m-2" } });
    controller.close();
    unsub();

    // stream 으로부터 raw bytes 읽기.
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value));
    }
    const wire = chunks.join("");

    // EventSource 파싱 시뮬레이션 (단순화 — 첫 event 만 파싱).
    const eventLine = wire.split("\n").find((l) => l.startsWith("event: "));
    const dataLine = wire.split("\n").find((l) => l.startsWith("data: "));
    expect(eventLine).toBe("event: message.created");
    expect(dataLine).toBeDefined();
    const data = JSON.parse(dataLine!.slice("data: ".length));
    expect(data).toEqual({
      conversationId: C,
      message: { id: "m-2" },
    });
  });

  it("multiple concurrent subscribers: 같은 채널 구독자 N 명 동시 수신", () => {
    const T = "11111111-1111-1111-1111-111111111111";
    const C = "eeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
    const a: string[] = [];
    const b: string[] = [];
    const c: string[] = [];

    const ua = subscribe(convChannelKey(T, C), (m) =>
      a.push(encodeSseEvent(m.event, m.payload)),
    );
    const ub = subscribe(convChannelKey(T, C), (m) =>
      b.push(encodeSseEvent(m.event, m.payload)),
    );
    const uc = subscribe(convChannelKey(T, C), (m) =>
      c.push(encodeSseEvent(m.event, m.payload)),
    );

    publishConvEvent(T, C, "message.created", { message: { id: "broadcast" } });

    ua();
    ub();
    uc();

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(c).toHaveLength(1);
    expect(a[0]).toBe(b[0]);
    expect(b[0]).toBe(c[0]);
  });
});
