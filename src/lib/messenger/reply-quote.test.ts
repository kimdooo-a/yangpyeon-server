/**
 * reply-quote.ts — TDD (M4 Phase 2 F2-3).
 *
 * 검증 영역:
 *   - truncateQuoteBody: 80자 컷 + ellipsis (M3 buildSnippet 정합)
 *   - formatReplyPreview: kind 별 변형 (TEXT / IMAGE / FILE / SYSTEM / 회수)
 */
import { describe, it, expect } from "vitest";
import { truncateQuoteBody, formatReplyPreview } from "./reply-quote";

describe("truncateQuoteBody", () => {
  it("80자 미만 → 그대로", () => {
    expect(truncateQuoteBody("hello")).toBe("hello");
  });

  it("정확히 80자 → 그대로", () => {
    const s = "a".repeat(80);
    expect(truncateQuoteBody(s)).toBe(s);
  });

  it("81자 → 80자 + ellipsis", () => {
    const s = "a".repeat(81);
    expect(truncateQuoteBody(s)).toBe("a".repeat(80) + "…");
  });

  it("커스텀 max 적용", () => {
    expect(truncateQuoteBody("abcdef", 3)).toBe("abc…");
  });

  it("빈 문자열 → 빈 문자열", () => {
    expect(truncateQuoteBody("")).toBe("");
  });
});

describe("formatReplyPreview", () => {
  it("kind=TEXT body=hello → snippet=hello variant=text", () => {
    const r = formatReplyPreview({
      body: "hello",
      kind: "TEXT",
      senderName: "alice",
    });
    expect(r.variant).toBe("text");
    expect(r.snippet).toBe("hello");
    expect(r.senderLabel).toBe("alice");
  });

  it("kind=TEXT 긴 본문 → 80자컷", () => {
    const r = formatReplyPreview({
      body: "a".repeat(100),
      kind: "TEXT",
      senderName: "alice",
    });
    expect(r.snippet).toBe("a".repeat(80) + "…");
  });

  it("kind=TEXT body=null → snippet 빈 문자열", () => {
    const r = formatReplyPreview({
      body: null,
      kind: "TEXT",
      senderName: "alice",
    });
    expect(r.snippet).toBe("");
    expect(r.variant).toBe("text");
  });

  it("kind=IMAGE → 사진 라벨", () => {
    const r = formatReplyPreview({
      body: null,
      kind: "IMAGE",
      senderName: "alice",
    });
    expect(r.variant).toBe("image");
    expect(r.snippet).toBe("📷 사진");
  });

  it("kind=FILE → 파일 라벨", () => {
    const r = formatReplyPreview({
      body: null,
      kind: "FILE",
      senderName: "alice",
    });
    expect(r.variant).toBe("file");
    expect(r.snippet).toBe("📎 파일");
  });

  it("kind=SYSTEM → 시스템 메시지 라벨", () => {
    const r = formatReplyPreview({
      body: "joined",
      kind: "SYSTEM",
      senderName: null,
    });
    expect(r.variant).toBe("system");
    expect(r.snippet).toBe("(시스템 메시지)");
  });

  it("deletedAt 있음 → 회수 variant (kind 무관)", () => {
    const r = formatReplyPreview({
      body: "hidden",
      kind: "TEXT",
      deletedAt: new Date(),
      senderName: "alice",
    });
    expect(r.variant).toBe("recalled");
    expect(r.snippet).toBe("🚫 회수된 메시지");
  });

  it("senderName=null → 알 수 없음 라벨", () => {
    const r = formatReplyPreview({
      body: "hi",
      kind: "TEXT",
      senderName: null,
    });
    expect(r.senderLabel).toBe("알 수 없음");
  });
});
