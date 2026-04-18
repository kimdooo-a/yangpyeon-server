import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual, createHash } from "node:crypto";

/**
 * MFA secret 암호화 (AES-256-GCM).
 * 포맷: base64url(nonce(12) || authTag(16) || ciphertext).
 *
 * 환경변수 MFA_MASTER_KEY — 32 byte (hex 64자 또는 base64 44자). DB 유출 시에도 평문 복원 불가.
 * /etc/luckystyle4u/secrets.env (PM2 env_file) 또는 Vercel 환경에 저장. PM2 복원 후 재기동 필수.
 */

function getMasterKey(): Buffer {
  const raw = process.env.MFA_MASTER_KEY;
  if (!raw) {
    throw new Error("MFA_MASTER_KEY 환경변수가 설정되지 않았습니다 (32 byte hex/base64)");
  }
  // hex 64자 우선, 실패 시 base64 시도
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  const b = Buffer.from(raw, "base64");
  if (b.length !== 32) {
    throw new Error("MFA_MASTER_KEY 길이가 32 byte가 아닙니다");
  }
  return b;
}

export function encryptSecret(plain: string): string {
  const key = getMasterKey();
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, tag, ct]).toString("base64url");
}

export function decryptSecret(ciphertext: string): string {
  const key = getMasterKey();
  const buf = Buffer.from(ciphertext, "base64url");
  if (buf.length < 12 + 16 + 1) {
    throw new Error("MFA ciphertext 포맷이 올바르지 않습니다");
  }
  const nonce = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/**
 * Recovery code hash (SHA-256 hex, 평문 미저장).
 * timingSafeEqual 비교에 사용.
 */
export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

/**
 * 해시 2개를 timing-safe 비교 (둘 다 hex string, 같은 길이).
 */
export function safeEqualHash(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}
