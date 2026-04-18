import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import bcrypt from "bcrypt";

// Phase 17 / SP-011 / ADR-019 — argon2id 기본 채택.
// 참조: docs/research/2026-04-supabase-parity/02-architecture/03-auth-advanced-blueprint.md §7.2.3
//       docs/solutions/2026-04-19-napi-prebuilt-native-modules.md
//
// 점진 마이그레이션 — 기존 bcrypt 해시($2-prefix)는 verifyPasswordHash가 자동 분기.
// 검증 성공 시 호출자(login route)가 needsRehash() true면 재해시 후 DB 업데이트.

const ARGON2ID_ALGORITHM = 2;

export async function hashPassword(plain: string): Promise<string> {
  return argonHash(plain, { algorithm: ARGON2ID_ALGORITHM });
}

export async function verifyPasswordHash(
  plain: string,
  hash: string,
): Promise<boolean> {
  if (hash.startsWith("$2")) {
    return bcrypt.compare(plain, hash);
  }
  return argonVerify(hash, plain);
}

/** bcrypt 해시면 argon2id로 재해시가 필요 (점진 마이그레이션). */
export function needsRehash(hash: string): boolean {
  return hash.startsWith("$2");
}
