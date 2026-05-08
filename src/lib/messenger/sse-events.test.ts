/**
 * sse-events.ts — TDD (M4 Phase 2 F2-4).
 *
 * 검증 영역:
 *   - parseSseEvent: SSE event name + raw JSON 문자열 → typed event
 *   - applyEventToMessages: 이벤트 누적 → MessageRow[] 변형 (prepend / soft-delete / body update)
 */
import { describe, it, expect } from "vitest";
import { parseSseEvent, applyEventToMessages } from "./sse-events";
import type { MessageRow } from "./optimistic-messages";

const buildMsg = (
  partial: Partial<MessageRow> & { id: string; clientGeneratedId: string },
): MessageRow => ({
  kind: "TEXT",
  body: "hello",
  senderId: "u1",
  replyToId: null,
  editedAt: null,
  editCount: 0,
  deletedAt: null,
  deletedBy: null,
  createdAt: "2026-05-09T00:00:00.000Z",
  attachments: [],
  mentions: [],
  ...partial,
});

describe("parseSseEvent", () => {
  it("message.created — 정상 JSON → typed event", () => {
    const r = parseSseEvent("message.created", JSON.stringify({ message: buildMsg({ id: "m1", clientGeneratedId: "c1" }) }));
    expect(r.type).toBe("message.created");
    if (r.type === "message.created") {
      expect(r.payload.message.id).toBe("m1");
    }
  });

  it("message.deleted — payload.messageId 추출", () => {
    const r = parseSseEvent("message.deleted", JSON.stringify({ messageId: "m1" }));
    expect(r.type).toBe("message.deleted");
    if (r.type === "message.deleted") {
      expect(r.payload.messageId).toBe("m1");
    }
  });

  it("message.updated — payload.message 추출", () => {
    const m = buildMsg({ id: "m1", clientGeneratedId: "c1", body: "updated" });
    const r = parseSseEvent("message.updated", JSON.stringify({ message: m }));
    expect(r.type).toBe("message.updated");
    if (r.type === "message.updated") {
      expect(r.payload.message.body).toBe("updated");
    }
  });

  it("ready — 시작 이벤트", () => {
    const r = parseSseEvent("ready", JSON.stringify({ channel: "x", conversationId: "c1" }));
    expect(r.type).toBe("ready");
  });

  it("알 수 없는 이벤트 → unknown", () => {
    const r = parseSseEvent("typing.started", JSON.stringify({ userId: "u1" }));
    expect(r.type).toBe("unknown");
  });

  it("malformed JSON → unknown (throw 안 함)", () => {
    const r = parseSseEvent("message.created", "not json");
    expect(r.type).toBe("unknown");
  });

  it("message.created — payload.message 누락 → unknown", () => {
    const r = parseSseEvent("message.created", JSON.stringify({ noMessage: true }));
    expect(r.type).toBe("unknown");
  });
});

describe("applyEventToMessages", () => {
  const m1 = buildMsg({ id: "m1", clientGeneratedId: "c1", body: "first" });
  const m2 = buildMsg({ id: "m2", clientGeneratedId: "c2", body: "second" });

  it("message.created → desc 정렬 prepend (새 메시지가 앞)", () => {
    const events = [
      {
        type: "message.created" as const,
        payload: { message: buildMsg({ id: "m3", clientGeneratedId: "c3", body: "new" }) },
      },
    ];
    const r = applyEventToMessages(events, [m2, m1]);
    expect(r[0].id).toBe("m3");
    expect(r).toHaveLength(3);
  });

  it("message.created — 이미 존재하면 dedupe (id 기준)", () => {
    const events = [
      {
        type: "message.created" as const,
        payload: { message: buildMsg({ id: "m1", clientGeneratedId: "c1", body: "dup" }) },
      },
    ];
    const r = applyEventToMessages(events, [m2, m1]);
    expect(r).toHaveLength(2);
  });

  it("message.created — clientGeneratedId 가 같은 optimistic 메시지를 server 메시지로 swap", () => {
    const optimistic = buildMsg({
      id: "c-temp",
      clientGeneratedId: "cgid-1",
      body: "pending",
      _optimistic: { status: "pending" },
    });
    const serverMsg = buildMsg({
      id: "real-id",
      clientGeneratedId: "cgid-1",
      body: "pending",
    });
    const events = [{ type: "message.created" as const, payload: { message: serverMsg } }];
    const r = applyEventToMessages(events, [optimistic]);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("real-id");
    expect(r[0]._optimistic).toBeUndefined();
  });

  it("message.deleted → 해당 id 의 deletedAt SET, body=null 보존", () => {
    const events = [
      {
        type: "message.deleted" as const,
        payload: { messageId: "m1", deletedAt: "2026-05-09T01:00:00.000Z" },
      },
    ];
    const r = applyEventToMessages(events, [m2, m1]);
    const target = r.find((m) => m.id === "m1");
    expect(target?.deletedAt).toBe("2026-05-09T01:00:00.000Z");
    expect(target?.body).toBeNull();
  });

  it("message.updated → 해당 id 의 body / editedAt 갱신", () => {
    const events = [
      {
        type: "message.updated" as const,
        payload: {
          message: buildMsg({
            id: "m1",
            clientGeneratedId: "c1",
            body: "edited",
            editedAt: "2026-05-09T02:00:00.000Z",
            editCount: 1,
          }),
        },
      },
    ];
    const r = applyEventToMessages(events, [m2, m1]);
    const target = r.find((m) => m.id === "m1");
    expect(target?.body).toBe("edited");
    expect(target?.editedAt).toBe("2026-05-09T02:00:00.000Z");
    expect(target?.editCount).toBe(1);
  });

  it("ready / unknown → 변형 없음", () => {
    const events = [
      { type: "ready" as const, payload: { channel: "x", conversationId: "c1" } },
      { type: "unknown" as const, payload: null },
    ];
    const r = applyEventToMessages(events, [m2, m1]);
    expect(r).toEqual([m2, m1]);
  });
});
