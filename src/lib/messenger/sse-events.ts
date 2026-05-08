/**
 * SSE event parser + reducer — F2-4 (M4 Phase 2).
 *
 * Backend `events/route.ts` 가 publish 하는 이벤트를 typed shape 로 변환 + MessageRow[] 변형.
 *
 * 다루는 이벤트:
 *   message.created / message.updated / message.deleted
 *   ready (구독 시작)
 *   기타 (typing.started/stopped, receipt.updated, member.joined/left) → unknown 으로 무시
 *
 * 정책:
 *   - message.created 의 dedupe key = (1) clientGeneratedId 우선 (optimistic swap), (2) server id
 *   - parse 실패 시 throw 대신 `{ type: "unknown" }` 반환 → 재연결/스트림 중단 회피
 */
import type { MessageRow } from "./optimistic-messages";

export type RealtimeEvent =
  | { type: "message.created"; payload: { message: MessageRow } }
  | { type: "message.updated"; payload: { message: MessageRow } }
  | {
      type: "message.deleted";
      payload: { messageId: string; deletedAt?: string };
    }
  | { type: "ready"; payload: { channel: string; conversationId: string } }
  | { type: "unknown"; payload: unknown };

export function parseSseEvent(eventName: string, raw: string): RealtimeEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { type: "unknown", payload: raw };
  }

  if (eventName === "ready" && isRecord(parsed)) {
    return {
      type: "ready",
      payload: {
        channel: String(parsed.channel ?? ""),
        conversationId: String(parsed.conversationId ?? ""),
      },
    };
  }

  if (
    (eventName === "message.created" || eventName === "message.updated") &&
    isRecord(parsed) &&
    isRecord(parsed.message) &&
    typeof parsed.message.id === "string"
  ) {
    return {
      type: eventName,
      payload: { message: parsed.message as unknown as MessageRow },
    };
  }

  if (
    eventName === "message.deleted" &&
    isRecord(parsed) &&
    typeof parsed.messageId === "string"
  ) {
    return {
      type: "message.deleted",
      payload: {
        messageId: parsed.messageId,
        deletedAt:
          typeof parsed.deletedAt === "string" ? parsed.deletedAt : undefined,
      },
    };
  }

  return { type: "unknown", payload: parsed };
}

/**
 * SSE 이벤트 시퀀스를 현재 messages 상태에 누적 적용.
 *
 * 정렬: backend 가 desc(createdAt) 보장 → message.created 는 prepend.
 * Dedupe: clientGeneratedId 우선 (optimistic swap), 다음 server id.
 */
export function applyEventToMessages(
  events: RealtimeEvent[],
  current: MessageRow[],
): MessageRow[] {
  let next = current;
  for (const e of events) {
    if (e.type === "message.created") {
      next = applyCreated(next, e.payload.message);
    } else if (e.type === "message.deleted") {
      next = applyDeleted(next, e.payload.messageId, e.payload.deletedAt);
    } else if (e.type === "message.updated") {
      next = applyUpdated(next, e.payload.message);
    }
    // ready / unknown → no-op
  }
  return next;
}

function applyCreated(messages: MessageRow[], incoming: MessageRow): MessageRow[] {
  // clientGeneratedId 매칭 → optimistic swap (id 갱신 + _optimistic 제거)
  const cgIdx = messages.findIndex(
    (m) => m.clientGeneratedId === incoming.clientGeneratedId,
  );
  if (cgIdx >= 0) {
    const swapped: MessageRow = { ...incoming };
    delete swapped._optimistic;
    return messages.map((m, i) => (i === cgIdx ? swapped : m));
  }
  // server id 매칭 → 중복 무시
  if (messages.some((m) => m.id === incoming.id)) {
    return messages;
  }
  // prepend (desc 정렬 유지)
  return [incoming, ...messages];
}

function applyDeleted(
  messages: MessageRow[],
  messageId: string,
  deletedAt?: string,
): MessageRow[] {
  let changed = false;
  const next = messages.map((m) => {
    if (m.id !== messageId) return m;
    changed = true;
    return {
      ...m,
      deletedAt: deletedAt ?? new Date().toISOString(),
      body: null,
    };
  });
  return changed ? next : messages;
}

function applyUpdated(
  messages: MessageRow[],
  incoming: MessageRow,
): MessageRow[] {
  let changed = false;
  const next = messages.map((m) => {
    if (m.id !== incoming.id) return m;
    changed = true;
    return {
      ...m,
      body: incoming.body,
      editedAt: incoming.editedAt,
      editCount: incoming.editCount,
    };
  });
  return changed ? next : messages;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}
