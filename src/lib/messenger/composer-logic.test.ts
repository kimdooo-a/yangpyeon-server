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
  prepareSendPayload,
  shouldSubmitOnEnter,
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
