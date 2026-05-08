/**
 * mention-search.ts — TDD (M4 Phase 2 F2-3).
 *
 * 검증 영역:
 *   - detectMentionTrigger: @ 토큰 활성 감지 + query 추출 + startPos
 *   - filterMentionCandidates: query 매칭 + 자기 자신 제외 + 정확 매치 우선
 *   - applyMentionSelection: 선택된 후보를 text 에 inject + cursor 위치
 */
import { describe, it, expect } from "vitest";
import {
  detectMentionTrigger,
  filterMentionCandidates,
  applyMentionSelection,
  type MentionCandidate,
} from "./mention-search";

describe("detectMentionTrigger", () => {
  it("빈 입력 → 비활성", () => {
    expect(detectMentionTrigger("", 0).active).toBe(false);
  });

  it("커서 위치가 @ 직후 → active, query 빈 문자열", () => {
    const r = detectMentionTrigger("@", 1);
    expect(r.active).toBe(true);
    expect(r.query).toBe("");
    expect(r.startPos).toBe(0);
  });

  it("문장 시작 @alice → active, query=alice, startPos=0", () => {
    const r = detectMentionTrigger("@alice", 6);
    expect(r.active).toBe(true);
    expect(r.query).toBe("alice");
    expect(r.startPos).toBe(0);
  });

  it("공백 뒤 @ → active", () => {
    const r = detectMentionTrigger("hello @al", 9);
    expect(r.active).toBe(true);
    expect(r.query).toBe("al");
    expect(r.startPos).toBe(6);
  });

  it("이메일 안의 @ (앞이 영문자) → 비활성", () => {
    expect(detectMentionTrigger("hello@alice", 11).active).toBe(false);
  });

  it("토큰 직후 공백이 오면 비활성 (커서가 공백 뒤)", () => {
    expect(detectMentionTrigger("hello @alice ", 13).active).toBe(false);
  });

  it("커서가 토큰 안에 있으면 active (토큰 끝 정확히)", () => {
    const r = detectMentionTrigger("hello @alice", 12);
    expect(r.active).toBe(true);
    expect(r.query).toBe("alice");
    expect(r.startPos).toBe(6);
  });

  it("다중 @ — 가장 가까운 @ 토큰 사용", () => {
    const r = detectMentionTrigger("@alice @bo", 10);
    expect(r.active).toBe(true);
    expect(r.query).toBe("bo");
    expect(r.startPos).toBe(7);
  });

  it("한글 query 지원", () => {
    // "안녕 @홍길동" length=7 (각 char 1 unit)
    const r = detectMentionTrigger("안녕 @홍길동", 7);
    expect(r.active).toBe(true);
    expect(r.query).toBe("홍길동");
    expect(r.startPos).toBe(3);
  });

  it("커서가 @ 토큰 앞에 있으면 비활성", () => {
    expect(detectMentionTrigger("hello @alice", 5).active).toBe(false);
  });
});

describe("filterMentionCandidates", () => {
  const candidates: MentionCandidate[] = [
    { userId: "u1", email: "alice@example.com", role: "OWNER" },
    { userId: "u2", email: "bob@example.com", role: "ADMIN" },
    { userId: "u3", email: "carol@other.com", role: "MEMBER" },
    { userId: "u4", email: "alpha@example.com", role: "MEMBER" },
  ];

  it("빈 query → 전체 반환", () => {
    expect(filterMentionCandidates("", candidates)).toHaveLength(4);
  });

  it("query 가 email 일부 매칭 (대소문자 구분 X)", () => {
    const r = filterMentionCandidates("ALI", candidates);
    expect(r.map((c) => c.userId)).toEqual(["u1"]);
  });

  it("앞부분 매칭 우선 정렬", () => {
    const r = filterMentionCandidates("al", candidates);
    expect(r.map((c) => c.userId).slice(0, 2)).toEqual(["u1", "u4"]);
  });

  it("excludeUserId 옵션 — 자기 자신 제외", () => {
    const r = filterMentionCandidates("", candidates, "u2");
    expect(r.map((c) => c.userId)).not.toContain("u2");
    expect(r).toHaveLength(3);
  });

  it("매칭 없음 → 빈 배열", () => {
    expect(filterMentionCandidates("zzzzz", candidates)).toEqual([]);
  });
});

describe("applyMentionSelection", () => {
  const candidate: MentionCandidate = {
    userId: "u1",
    email: "alice@example.com",
  };

  it("토큰을 email 로 치환 + 공백 추가 + cursor 이동", () => {
    const text = "hello @al";
    const trigger = { active: true, query: "al", startPos: 6 };
    const r = applyMentionSelection(text, trigger, candidate);
    expect(r.text).toBe("hello @alice@example.com ");
    expect(r.cursorPos).toBe(r.text.length);
    expect(r.mentionToken).toBe("@alice@example.com");
  });

  it("뒤에 텍스트가 있으면 그 사이에 inject", () => {
    const text = "hi @al world";
    const trigger = { active: true, query: "al", startPos: 3 };
    const r = applyMentionSelection(text, trigger, candidate);
    expect(r.text).toBe("hi @alice@example.com  world");
    expect(r.cursorPos).toBe("hi @alice@example.com ".length);
  });

  it("query 가 빈 문자열일 때 (사용자가 @ 만 입력)", () => {
    const text = "@";
    const trigger = { active: true, query: "", startPos: 0 };
    const r = applyMentionSelection(text, trigger, candidate);
    expect(r.text).toBe("@alice@example.com ");
    expect(r.mentionToken).toBe("@alice@example.com");
  });
});
