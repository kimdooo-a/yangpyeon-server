/**
 * notification-prefs.ts — TDD (M6 알림 설정).
 *
 * HHMM 검증 + DnD 윈도우 활성 여부 (UI 표시용 보조).
 */
import { describe, it, expect } from "vitest";
import {
  isValidHHMM,
  normalizeHHMM,
  isInDndWindow,
} from "./notification-prefs";

describe("isValidHHMM", () => {
  it("00:00 → true", () => {
    expect(isValidHHMM("00:00")).toBe(true);
  });
  it("23:59 → true", () => {
    expect(isValidHHMM("23:59")).toBe(true);
  });
  it("24:00 → false", () => {
    expect(isValidHHMM("24:00")).toBe(false);
  });
  it("9:00 → false (앞자리 0 필요)", () => {
    expect(isValidHHMM("9:00")).toBe(false);
  });
  it("12:60 → false", () => {
    expect(isValidHHMM("12:60")).toBe(false);
  });
  it("빈 문자열 → false", () => {
    expect(isValidHHMM("")).toBe(false);
  });
});

describe("normalizeHHMM", () => {
  it("정상 → 그대로", () => {
    expect(normalizeHHMM("09:30")).toBe("09:30");
  });
  it("앞뒤 공백 trim", () => {
    expect(normalizeHHMM("  09:30  ")).toBe("09:30");
  });
});

describe("isInDndWindow", () => {
  it("dndStart=null → false", () => {
    expect(isInDndWindow("12:00", null, "08:00")).toBe(false);
  });
  it("dndEnd=null → false", () => {
    expect(isInDndWindow("12:00", "22:00", null)).toBe(false);
  });
  it("야간 wrap (22:00~07:00) — 23:00 → true", () => {
    expect(isInDndWindow("23:00", "22:00", "07:00")).toBe(true);
  });
  it("야간 wrap (22:00~07:00) — 06:00 → true", () => {
    expect(isInDndWindow("06:00", "22:00", "07:00")).toBe(true);
  });
  it("야간 wrap (22:00~07:00) — 12:00 → false", () => {
    expect(isInDndWindow("12:00", "22:00", "07:00")).toBe(false);
  });
  it("주간 윈도 (09:00~17:00) — 12:00 → true", () => {
    expect(isInDndWindow("12:00", "09:00", "17:00")).toBe(true);
  });
  it("주간 윈도 (09:00~17:00) — 18:00 → false", () => {
    expect(isInDndWindow("18:00", "09:00", "17:00")).toBe(false);
  });
  it("dndStart=dndEnd → 항상 false (의미 없는 0폭 윈도)", () => {
    expect(isInDndWindow("10:00", "10:00", "10:00")).toBe(false);
  });
});
