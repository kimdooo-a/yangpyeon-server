/**
 * Message composer pure logic — F2-1 (M4 Phase 2).
 *
 * UI 컴포넌트(`MessageComposer.tsx`) 가 사용하는 검증/페이로드 빌드 로직 분리.
 * vitest 환경 = node, jsdom 미도입 (S87-INFRA-1 미진행) — UI 렌더 테스트 불가.
 * 따라서 로직만 분리해서 단위 테스트, UI 통합은 수동 검증.
 *
 * 책임:
 *   - canSend: 송신 가능 여부 판정 (trim 후 1~5000자, kind=TEXT 한정 — F2-1)
 *   - prepareSendPayload: 송신 직전 payload 빌드 (clientGeneratedId UUIDv7 + body trim)
 *   - shouldSubmitOnEnter: Enter 키 송신 분기 (Shift/IME composing 검증)
 */
import { describe, it, expect } from "vitest";
import {
  canSendText,
  canSendMessage,
  inferMessageKind,
  prepareSendPayload,
  shouldSubmitOnEnter,
  type SendAttachment,
} from "./composer-logic";

describe("canSendText", () => {
  it("빈 문자열 → false", () => {
    expect(canSendText("")).toBe(false);
  });

  it("공백만 → false (trim 후 0자)", () => {
    expect(canSendText("   \n\t  ")).toBe(false);
  });

  it("일반 텍스트 → true", () => {
    expect(canSendText("안녕")).toBe(true);
  });

  it("앞뒤 공백 + 본문 → true (trim 후 1자 이상)", () => {
    expect(canSendText("  hi  ")).toBe(true);
  });

  it("5000자 정확 → true (zod schema max 5000)", () => {
    expect(canSendText("a".repeat(5000))).toBe(true);
  });

  it("5001자 → false (zod schema max 위반)", () => {
    expect(canSendText("a".repeat(5001))).toBe(false);
  });
});

describe("prepareSendPayload", () => {
  it("body trim + clientGeneratedId UUIDv7 + kind=TEXT", () => {
    const payload = prepareSendPayload("  hello  ");
    expect(payload.kind).toBe("TEXT");
    expect(payload.body).toBe("hello");
    expect(payload.clientGeneratedId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("같은 입력에 대해 매번 다른 clientGeneratedId 발급 (idempotency key 역할)", () => {
    const a = prepareSendPayload("x");
    const b = prepareSendPayload("x");
    expect(a.clientGeneratedId).not.toBe(b.clientGeneratedId);
  });

  // F2-3 — replyToId / mentions 추가
  it("opts 없으면 replyToId / mentions 모두 undefined", () => {
    const p = prepareSendPayload("hi");
    expect(p.replyToId).toBeUndefined();
    expect(p.mentions).toBeUndefined();
  });

  it("opts.replyToId → payload.replyToId 포함", () => {
    const id = "11111111-1111-7111-8111-111111111111";
    const p = prepareSendPayload("hi", { replyToId: id });
    expect(p.replyToId).toBe(id);
  });

  it("opts.replyToId=null → payload.replyToId undefined (정규화)", () => {
    const p = prepareSendPayload("hi", { replyToId: null });
    expect(p.replyToId).toBeUndefined();
  });

  it("opts.mentions=[] → payload.mentions undefined (빈 배열 생략)", () => {
    const p = prepareSendPayload("hi", { mentions: [] });
    expect(p.mentions).toBeUndefined();
  });

  it("opts.mentions=[u1,u2] → payload.mentions=[u1,u2]", () => {
    const p = prepareSendPayload("hi", { mentions: ["u1", "u2"] });
    expect(p.mentions).toEqual(["u1", "u2"]);
  });

  it("mentions 중복 dedup", () => {
    const p = prepareSendPayload("hi", { mentions: ["u1", "u1", "u2"] });
    expect(p.mentions).toEqual(["u1", "u2"]);
  });
});

// M5-ATTACH-3 — 첨부 송신 분기 (S96)
const fid = (n: number) =>
  `${n.toString().padStart(8, "0")}-0000-0000-0000-000000000000`;

const imageAttachment = (fileId: string, displayOrder = 0): SendAttachment => ({
  fileId,
  kind: "IMAGE",
  displayOrder,
});

const fileAttachment = (fileId: string, displayOrder = 0): SendAttachment => ({
  fileId,
  kind: "FILE",
  displayOrder,
});

describe("canSendMessage (M5-ATTACH-3)", () => {
  it("첨부 0건 + 빈 본문 → false (TEXT 1자 미만)", () => {
    expect(canSendMessage("")).toBe(false);
  });

  it("첨부 0건 + 본문 1+ → true (canSendText 와 동등)", () => {
    expect(canSendMessage("hi")).toBe(true);
  });

  it("첨부 1건 + 빈 본문 → true (캡션 0자 OK)", () => {
    expect(canSendMessage("", [imageAttachment(fid(1))])).toBe(true);
  });

  it("첨부 1건 + 본문 1+ → true (캡션 정상)", () => {
    expect(canSendMessage("사진 캡션", [imageAttachment(fid(1))])).toBe(true);
  });

  it("첨부 5건 → true (max 경계)", () => {
    const list = [1, 2, 3, 4, 5].map((n) => imageAttachment(fid(n), n - 1));
    expect(canSendMessage("", list)).toBe(true);
  });

  it("첨부 6건 → false (max 위반)", () => {
    const list = [1, 2, 3, 4, 5, 6].map((n) => imageAttachment(fid(n), n - 1));
    expect(canSendMessage("", list)).toBe(false);
  });

  it("첨부 1건 + 본문 5001자 → false (캡션 max 위반)", () => {
    expect(canSendMessage("a".repeat(5001), [imageAttachment(fid(1))])).toBe(
      false,
    );
  });
});

describe("inferMessageKind (M5-ATTACH-3)", () => {
  it("모든 첨부가 IMAGE → 'IMAGE'", () => {
    expect(inferMessageKind([imageAttachment(fid(1)), imageAttachment(fid(2))])).toBe(
      "IMAGE",
    );
  });

  it("FILE 1건 포함 → 'FILE'", () => {
    expect(inferMessageKind([imageAttachment(fid(1)), fileAttachment(fid(2))])).toBe(
      "FILE",
    );
  });

  it("FILE 단독 → 'FILE'", () => {
    expect(inferMessageKind([fileAttachment(fid(1))])).toBe("FILE");
  });

  it("VOICE 포함 → 'FILE' (현 시점 분기 단순화 — 향후 VOICE kind 분리 시 변경)", () => {
    expect(
      inferMessageKind([{ fileId: fid(1), kind: "VOICE", displayOrder: 0 }]),
    ).toBe("FILE");
  });
});

describe("prepareSendPayload — M5-ATTACH-3 첨부 분기", () => {
  it("첨부 IMAGE 2장 + 캡션 → kind=IMAGE, body=캡션, attachments 배열", () => {
    const attachments = [imageAttachment(fid(1), 0), imageAttachment(fid(2), 1)];
    const p = prepareSendPayload("사진 두 장", { attachments });
    expect(p.kind).toBe("IMAGE");
    expect(p.body).toBe("사진 두 장");
    expect(p.attachments).toHaveLength(2);
    expect(p.attachments?.[0]).toMatchObject({
      fileId: fid(1),
      kind: "IMAGE",
      displayOrder: 0,
    });
    expect(p.attachments?.[1]).toMatchObject({
      fileId: fid(2),
      kind: "IMAGE",
      displayOrder: 1,
    });
  });

  it("첨부 IMAGE 1장 + 빈 본문 → kind=IMAGE, body=null (캡션 0자 → null)", () => {
    const p = prepareSendPayload("", {
      attachments: [imageAttachment(fid(1))],
    });
    expect(p.kind).toBe("IMAGE");
    expect(p.body).toBeNull();
  });

  it("첨부 IMAGE + FILE 혼합 → kind=FILE", () => {
    const p = prepareSendPayload("", {
      attachments: [imageAttachment(fid(1), 0), fileAttachment(fid(2), 1)],
    });
    expect(p.kind).toBe("FILE");
  });

  it("첨부 displayOrder 미지정 → 배열 index 자동 부여", () => {
    const p = prepareSendPayload("", {
      attachments: [
        { fileId: fid(1), kind: "IMAGE" },
        { fileId: fid(2), kind: "IMAGE" },
        { fileId: fid(3), kind: "IMAGE" },
      ],
    });
    expect(p.attachments?.map((a) => a.displayOrder)).toEqual([0, 1, 2]);
  });

  it("첨부 0건 + 본문 → kind=TEXT, attachments 미포함 (회귀 검증)", () => {
    const p = prepareSendPayload("hi");
    expect(p.kind).toBe("TEXT");
    expect(p.body).toBe("hi");
    expect(p.attachments).toBeUndefined();
  });

  it("첨부 + replyToId + mentions 동시 — 모두 포함", () => {
    const p = prepareSendPayload("@u1 캡션", {
      attachments: [imageAttachment(fid(1))],
      replyToId: fid(9),
      mentions: ["u1"],
    });
    expect(p.kind).toBe("IMAGE");
    expect(p.body).toBe("@u1 캡션");
    expect(p.replyToId).toBe(fid(9));
    expect(p.mentions).toEqual(["u1"]);
    expect(p.attachments).toHaveLength(1);
  });
});

describe("shouldSubmitOnEnter", () => {
  it("Enter (no modifier, no IME) → true", () => {
    expect(
      shouldSubmitOnEnter({ key: "Enter", shiftKey: false, isComposing: false }),
    ).toBe(true);
  });

  it("Shift+Enter → false (줄바꿈 의도)", () => {
    expect(
      shouldSubmitOnEnter({ key: "Enter", shiftKey: true, isComposing: false }),
    ).toBe(false);
  });

  it("IME composition 중 Enter → false (한글 조합 확정)", () => {
    expect(
      shouldSubmitOnEnter({ key: "Enter", shiftKey: false, isComposing: true }),
    ).toBe(false);
  });

  it("Enter 외 다른 키 → false", () => {
    expect(
      shouldSubmitOnEnter({ key: "a", shiftKey: false, isComposing: false }),
    ).toBe(false);
  });
});
