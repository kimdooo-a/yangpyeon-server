/**
 * Phase 14b: DB 식별자 검증 + 안전한 인용 처리.
 * 값이 아닌 식별자(테이블명·컬럼명)는 파라미터 바인딩이 불가능해
 * 수동 이스케이프가 필요하다. 사용 지점은 반드시 DB 화이트리스트 대조와 결합한다.
 */

const IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function isValidIdentifier(name: string): boolean {
  return typeof name === "string" && IDENTIFIER_REGEX.test(name);
}

/**
 * PostgreSQL `quote_ident` 동등 동작.
 * 입력은 이미 `isValidIdentifier` 통과 + DB 화이트리스트 대조된 값이어야 한다.
 */
export function quoteIdent(name: string): string {
  if (!isValidIdentifier(name)) {
    throw new Error(`invalid identifier: ${name}`);
  }
  return `"${name.replace(/"/g, '""')}"`;
}
