/**
 * search-query.ts — TDD (M5 검색).
 *
 * 검증 영역:
 *   - normalizeQuery: trim + 빈 문자열 정규화
 *   - validateQuery: backend searchMessagesSchema (1~100자) 정합 검증
 *   - canSearch: validate 결과 boolean shortcut
 *   - highlightMatches: 결과 본문의 매칭 영역을 segments 로 분리 (대소문자 X)
 */
import { describe, it, expect } from "vitest";
import {
  normalizeQuery,
  validateQuery,
  canSearch,
  highlightMatches,
} from "./search-query";

describe("normalizeQuery", () => {
  it("앞뒤 공백 제거", () => {
    expect(normalizeQuery("  hello  ")).toBe("hello");
  });

  it("개행/탭도 trim", () => {
    expect(normalizeQuery("\n hi \t")).toBe("hi");
  });

  it("빈 문자열 → 빈 문자열", () => {
    expect(normalizeQuery("   ")).toBe("");
  });
});

describe("validateQuery", () => {
  it("정상 query → ok=true", () => {
    expect(validateQuery("hello")).toEqual({ ok: true });
  });

  it("trim 후 빈 문자열 → reason=empty", () => {
    expect(validateQuery("   ")).toEqual({ ok: false, reason: "empty" });
  });

  it("100자 정확 → ok=true (backend zod max 100)", () => {
    expect(validateQuery("a".repeat(100))).toEqual({ ok: true });
  });

  it("101자 → reason=too_long", () => {
    expect(validateQuery("a".repeat(101))).toEqual({
      ok: false,
      reason: "too_long",
    });
  });
});

describe("canSearch", () => {
  it("정상 query → true", () => {
    expect(canSearch("hi")).toBe(true);
  });

  it("빈 문자열 → false", () => {
    expect(canSearch("")).toBe(false);
  });

  it("100자 초과 → false", () => {
    expect(canSearch("a".repeat(101))).toBe(false);
  });
});

describe("highlightMatches", () => {
  it("매칭 없으면 단일 텍스트 segment 반환", () => {
    const r = highlightMatches("hello world", "xyz");
    expect(r).toEqual([{ text: "hello world", match: false }]);
  });

  it("매칭 1건 → [pre, match, post]", () => {
    const r = highlightMatches("hello world", "world");
    expect(r).toEqual([
      { text: "hello ", match: false },
      { text: "world", match: true },
    ]);
  });

  it("대소문자 무시 매칭", () => {
    const r = highlightMatches("Hello World", "world");
    expect(r).toEqual([
      { text: "Hello ", match: false },
      { text: "World", match: true },
    ]);
  });

  it("다중 매칭 모두 표시", () => {
    const r = highlightMatches("foo bar foo", "foo");
    expect(r).toEqual([
      { text: "foo", match: true },
      { text: " bar ", match: false },
      { text: "foo", match: true },
    ]);
  });

  it("빈 query → 단일 텍스트 segment", () => {
    const r = highlightMatches("hello", "");
    expect(r).toEqual([{ text: "hello", match: false }]);
  });

  it("정규식 메타문자 안전 (이스케이프)", () => {
    const r = highlightMatches("a.b.c", ".");
    // '.' 매칭 3개 — 정규식 . (any char) 가 아니라 literal '.'
    expect(r).toEqual([
      { text: "a", match: false },
      { text: ".", match: true },
      { text: "b", match: false },
      { text: ".", match: true },
      { text: "c", match: false },
    ]);
  });
});
