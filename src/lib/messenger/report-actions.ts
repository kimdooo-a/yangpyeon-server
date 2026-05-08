/**
 * Report admin pure logic — M6 운영자 패널.
 *
 * Backend `resolveReportActionEnum` (DELETE_MESSAGE / BLOCK_USER / DISMISS) +
 * AbuseReport status (OPEN / RESOLVED / DISMISSED) 의 한국어 라벨/영향 설명.
 */

export type ResolveAction = "DELETE_MESSAGE" | "BLOCK_USER" | "DISMISS";
export type ReportStatus = "OPEN" | "RESOLVED" | "DISMISSED";

export function formatResolveAction(action: ResolveAction): string {
  switch (action) {
    case "DELETE_MESSAGE":
      return "메시지 회수";
    case "BLOCK_USER":
      return "사용자 차단";
    case "DISMISS":
      return "기각";
  }
}

export function describeResolveImpact(action: ResolveAction): string {
  switch (action) {
    case "DELETE_MESSAGE":
      return "신고된 메시지를 회수합니다 (body=null + 회수 표시).";
    case "BLOCK_USER":
      return "신고 대상 사용자를 신고자로부터 차단합니다 (양방향).";
    case "DISMISS":
      return "신고만 종결합니다 (메시지/사용자 변경 없음).";
  }
}

export function formatReportStatus(status: ReportStatus): string {
  switch (status) {
    case "OPEN":
      return "처리 대기";
    case "RESOLVED":
      return "처리됨";
    case "DISMISSED":
      return "기각됨";
  }
}

export const ALL_RESOLVE_ACTIONS: ResolveAction[] = [
  "DELETE_MESSAGE",
  "BLOCK_USER",
  "DISMISS",
];

export const ALL_REPORT_STATUSES: ReportStatus[] = [
  "OPEN",
  "RESOLVED",
  "DISMISSED",
];
