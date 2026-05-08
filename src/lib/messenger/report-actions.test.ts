/**
 * report-actions.ts — TDD (M6 운영자 패널).
 *
 * resolve action enum 의 표시 라벨 + 영향 범위 설명 + status 필터 라벨.
 */
import { describe, it, expect } from "vitest";
import {
  formatResolveAction,
  describeResolveImpact,
  formatReportStatus,
  type ResolveAction,
  type ReportStatus,
} from "./report-actions";

describe("formatResolveAction", () => {
  it("DELETE_MESSAGE → 메시지 삭제", () => {
    expect(formatResolveAction("DELETE_MESSAGE")).toBe("메시지 회수");
  });
  it("BLOCK_USER → 사용자 차단", () => {
    expect(formatResolveAction("BLOCK_USER")).toBe("사용자 차단");
  });
  it("DISMISS → 기각", () => {
    expect(formatResolveAction("DISMISS")).toBe("기각");
  });
});

describe("describeResolveImpact", () => {
  const cases: Array<[ResolveAction, string]> = [
    ["DELETE_MESSAGE", "신고된 메시지를 회수합니다 (body=null + 회수 표시)."],
    ["BLOCK_USER", "신고 대상 사용자를 신고자로부터 차단합니다 (양방향)."],
    ["DISMISS", "신고만 종결합니다 (메시지/사용자 변경 없음)."],
  ];
  for (const [action, expected] of cases) {
    it(`${action} 영향 설명`, () => {
      expect(describeResolveImpact(action)).toBe(expected);
    });
  }
});

describe("formatReportStatus", () => {
  const cases: Array<[ReportStatus, string]> = [
    ["OPEN", "처리 대기"],
    ["RESOLVED", "처리됨"],
    ["DISMISSED", "기각됨"],
  ];
  for (const [status, expected] of cases) {
    it(`${status} → ${expected}`, () => {
      expect(formatReportStatus(status)).toBe(expected);
    });
  }
});
