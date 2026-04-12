/**
 * JWT Signing Key Rotation — MVP 스켈레톤
 *
 * 현재는 env 기반(AUTH_SECRET, AUTH_SECRET_NEXT)으로 2키 운영을 지원한다.
 * 향후 DB 모델(SigningKey) 도입 시 이 모듈만 교체하면 된다.
 */

export interface SigningKey {
  id: string;
  secret: Uint8Array;
  createdAt: string;
  current: boolean;
}

function toKey(raw: string, id: string, current: boolean): SigningKey {
  return {
    id,
    secret: new TextEncoder().encode(raw),
    createdAt: new Date(0).toISOString(),
    current,
  };
}

/** 현재 서명용 키 (SignJWT에서 사용) */
export function getCurrentSigningKey(): SigningKey {
  const current = process.env.AUTH_SECRET;
  if (!current || current.length < 16) {
    throw new Error("AUTH_SECRET 환경변수가 설정되지 않았거나 너무 짧습니다");
  }
  return toKey(current, "primary", true);
}

/** 검증 시 허용되는 모든 키(primary + next) — 롤오버 기간에 둘 다 허용 */
export function listSigningKeys(): SigningKey[] {
  const keys: SigningKey[] = [];
  const current = process.env.AUTH_SECRET;
  const next = process.env.AUTH_SECRET_NEXT;
  if (current && current.length >= 16) {
    keys.push(toKey(current, "primary", true));
  }
  if (next && next.length >= 16) {
    keys.push(toKey(next, "next", false));
  }
  return keys;
}
