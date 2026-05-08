/**
 * Optimistic message pure logic — TDD (F2-2, M4 Phase 2).
 *
 * UI 컴포넌트 / hook 의 mutation 직전 변환 함수 단위 테스트.
 * vitest 환경 = node, jsdom 미도입 (S87-INFRA-1 미진행) — UI 통합은 수동 검증.
 */
import { describe, it, expect } from "vitest";
import {
  buildOptimisticMessage,
  prependOptimistic,
  replaceOptimisticWithServer,
  markOptimisticFailed,
  removeOptimistic,
  findByClientGeneratedId,
  isOptimisticPending,
  isOptimisticFailed,
  type MessageRow,
} from "./optimistic-messages";

function makeServerMessage(overrides: Partial<MessageRow>): MessageRow {
  return {
    id: "00000000-0000-7000-8000-000000000001",
    kind: "TEXT",
    body: "기존 server 메시지",
    senderId: "user-server",
    replyToId: null,
    clientGeneratedId: "cgid-server-1",
    editedAt: null,
    editCount: 0,
    deletedAt: null,
    deletedBy: null,
    createdAt: "2026-05-08T10:00:00.000Z",
    attachments: [],
    mentions: [],
    ...overrides,
  };
}

describe("buildOptimisticMessage", () => {
  it("기본 shape — id=clientGeneratedId, kind, body, senderId, _optimistic.status='pending'", () => {
    const cgid = "01927aaa-1234-7abc-8def-000000000001";
    const fixedNow = new Date("2026-05-08T12:34:56.000Z");
    const msg = buildOptimisticMessage({
      payload: { kind: "TEXT", body: "안녕하세요", clientGeneratedId: cgid },
      senderId: "user-1",
      now: fixedNow,
    });

    expect(msg.id).toBe(cgid);
    expect(msg.clientGeneratedId).toBe(cgid);
    expect(msg.kind).toBe("TEXT");
    expect(msg.body).toBe("안녕하세요");
    expect(msg.senderId).toBe("user-1");
    expect(msg.createdAt).toBe("2026-05-08T12:34:56.000Z");
    expect(msg._optimistic).toEqual({ status: "pending" });
    expect(msg.attachments).toEqual([]);
    expect(msg.mentions).toEqual([]);
  });

  it("now 미지정 시 현재 시각 ISO 사용", () => {
    const before = Date.now();
    const msg = buildOptimisticMessage({
      payload: { kind: "TEXT", body: "x", clientGeneratedId: "cgid-x" },
      senderId: "user-1",
    });
    const after = Date.now();
    const ts = new Date(msg.createdAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe("findByClientGeneratedId", () => {
  it("match 시 row 반환", () => {
    const a = makeServerMessage({ clientGeneratedId: "cgid-a" });
    const b = makeServerMessage({ clientGeneratedId: "cgid-b" });
    expect(findByClientGeneratedId([a, b], "cgid-b")).toBe(b);
  });

  it("match 없음 → null", () => {
    const a = makeServerMessage({ clientGeneratedId: "cgid-a" });
    expect(findByClientGeneratedId([a], "cgid-z")).toBeNull();
  });
});

describe("prependOptimistic", () => {
  it("빈 배열 → 길이 1 + index 0 위치", () => {
    const opt = buildOptimisticMessage({
      payload: { kind: "TEXT", body: "안녕", clientGeneratedId: "cgid-1" },
      senderId: "user-1",
    });
    const next = prependOptimistic([], opt);
    expect(next).toHaveLength(1);
    expect(next[0]).toBe(opt);
  });

  it("기존 메시지 앞에 push (desc 정렬 보존)", () => {
    const existing = makeServerMessage({ clientGeneratedId: "cgid-old" });
    const opt = buildOptimisticMessage({
      payload: { kind: "TEXT", body: "x", clientGeneratedId: "cgid-new" },
      senderId: "user-1",
    });
    const next = prependOptimistic([existing], opt);
    expect(next).toHaveLength(2);
    expect(next[0].clientGeneratedId).toBe("cgid-new");
    expect(next[1].clientGeneratedId).toBe("cgid-old");
  });

  it("중복 clientGeneratedId → 멱등 (배열 변화 없음)", () => {
    const opt = buildOptimisticMessage({
      payload: { kind: "TEXT", body: "x", clientGeneratedId: "cgid-dup" },
      senderId: "user-1",
    });
    const first = prependOptimistic([], opt);
    const second = prependOptimistic(first, opt);
    expect(second).toBe(first);
    expect(second).toHaveLength(1);
  });
});

describe("replaceOptimisticWithServer", () => {
  it("match: 같은 index 자리에 server swap, _optimistic 제거", () => {
    const older = makeServerMessage({ clientGeneratedId: "cgid-older" });
    const opt = buildOptimisticMessage({
      payload: { kind: "TEXT", body: "x", clientGeneratedId: "cgid-pending" },
      senderId: "user-1",
    });
    const messages = prependOptimistic([older], opt); // [opt, older]
    const server = makeServerMessage({
      id: "real-server-id",
      clientGeneratedId: "cgid-pending",
      body: "x",
      senderId: "user-1",
      createdAt: "2026-05-08T12:35:00.123Z",
    });
    const next = replaceOptimisticWithServer(messages, "cgid-pending", server);

    expect(next).toHaveLength(2);
    expect(next[0].id).toBe("real-server-id");
    expect(next[0].clientGeneratedId).toBe("cgid-pending");
    expect(next[0]._optimistic).toBeUndefined();
    expect(next[1].clientGeneratedId).toBe("cgid-older");
  });

  it("match 없음 → defensive prepend", () => {
    const older = makeServerMessage({ clientGeneratedId: "cgid-older" });
    const server = makeServerMessage({
      id: "real-id",
      clientGeneratedId: "cgid-stranger",
    });
    const next = replaceOptimisticWithServer([older], "cgid-stranger", server);
    expect(next).toHaveLength(2);
    expect(next[0].clientGeneratedId).toBe("cgid-stranger");
    expect(next[0]._optimistic).toBeUndefined();
  });
});

describe("markOptimisticFailed", () => {
  it("optimistic match: status='failed' + error 설정", () => {
    const opt = buildOptimisticMessage({
      payload: { kind: "TEXT", body: "x", clientGeneratedId: "cgid-fail" },
      senderId: "user-1",
    });
    const next = markOptimisticFailed([opt], "cgid-fail", "송신 실패 (500)");
    expect(next[0]._optimistic).toEqual({
      status: "failed",
      error: "송신 실패 (500)",
    });
  });

  it("server 메시지(_optimistic 없음)는 protect — 변경 안 함 (참조 유지)", () => {
    const server = makeServerMessage({ clientGeneratedId: "cgid-server" });
    const arr = [server];
    const next = markOptimisticFailed(arr, "cgid-server", "x");
    expect(next).toBe(arr);
  });

  it("match 없음 → 배열 변화 없음 (참조 유지)", () => {
    const opt = buildOptimisticMessage({
      payload: { kind: "TEXT", body: "x", clientGeneratedId: "cgid-1" },
      senderId: "user-1",
    });
    const arr = [opt];
    const next = markOptimisticFailed(arr, "cgid-not-exist", "x");
    expect(next).toBe(arr);
  });
});

describe("removeOptimistic", () => {
  it("optimistic match → 제거", () => {
    const opt = buildOptimisticMessage({
      payload: { kind: "TEXT", body: "x", clientGeneratedId: "cgid-rm" },
      senderId: "user-1",
    });
    const older = makeServerMessage({ clientGeneratedId: "cgid-old" });
    const next = removeOptimistic([opt, older], "cgid-rm");
    expect(next).toHaveLength(1);
    expect(next[0].clientGeneratedId).toBe("cgid-old");
  });

  it("server 메시지는 protect — 변경 안 함", () => {
    const server = makeServerMessage({ clientGeneratedId: "cgid-srv" });
    const arr = [server];
    const next = removeOptimistic(arr, "cgid-srv");
    expect(next).toBe(arr);
  });

  it("match 없음 → 변화 없음", () => {
    const arr = [makeServerMessage({ clientGeneratedId: "cgid-a" })];
    const next = removeOptimistic(arr, "cgid-z");
    expect(next).toBe(arr);
  });
});

describe("discriminator helpers", () => {
  it("isOptimisticPending — pending 만 true", () => {
    const opt = buildOptimisticMessage({
      payload: { kind: "TEXT", body: "x", clientGeneratedId: "c1" },
      senderId: "u1",
    });
    const failed = markOptimisticFailed([opt], "c1", "err")[0];
    const server = makeServerMessage({});
    expect(isOptimisticPending(opt)).toBe(true);
    expect(isOptimisticPending(failed)).toBe(false);
    expect(isOptimisticPending(server)).toBe(false);
  });

  it("isOptimisticFailed — failed 만 true", () => {
    const opt = buildOptimisticMessage({
      payload: { kind: "TEXT", body: "x", clientGeneratedId: "c1" },
      senderId: "u1",
    });
    const failed = markOptimisticFailed([opt], "c1", "err")[0];
    const server = makeServerMessage({});
    expect(isOptimisticFailed(failed)).toBe(true);
    expect(isOptimisticFailed(opt)).toBe(false);
    expect(isOptimisticFailed(server)).toBe(false);
  });
});
