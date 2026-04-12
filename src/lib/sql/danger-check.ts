/**
 * 세션 14: SQL Editor 위험 키워드 1차 방어 (서버 사이드)
 * 메인 방어는 PG 롤(app_readonly) + READ ONLY 트랜잭션. 이 파일은 보조 가드.
 */

const DANGER_KEYWORDS = [
  "DROP",
  "TRUNCATE",
  "ALTER",
  "GRANT",
  "REVOKE",
  "CREATE ROLE",
  "COPY",
  "INSERT",
  "UPDATE",
  "DELETE",
] as const;

export interface DangerCheckResult {
  blocked: boolean;
  keyword?: string;
}

/**
 * SQL 문자열에서 위험 키워드를 탐지합니다.
 * - 단어 경계 기반 매칭 (대소문자 무시)
 * - 문자열/주석 내부도 단순 탐지 (1차 방어이므로 엄격하게)
 */
export function checkDangerousSql(sql: string): DangerCheckResult {
  const normalized = sql.toUpperCase();
  for (const keyword of DANGER_KEYWORDS) {
    // 단어 경계 매칭 (키워드 앞뒤가 알파벳/숫자가 아닌 경우)
    const pattern = new RegExp(`(^|[^A-Z0-9_])${keyword.replace(/ /g, "\\s+")}([^A-Z0-9_]|$)`);
    if (pattern.test(normalized)) {
      return { blocked: true, keyword };
    }
  }
  return { blocked: false };
}
