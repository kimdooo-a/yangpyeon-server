import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { getVault } from "@/lib/vault";

/**
 * MFA secret 암호화 (AES-256-GCM).
 * 포맷: base64url(nonce(12) || authTag(16) || ciphertext).
 *
 * Phase 16a — MASTER_KEY 로딩을 Vault(SecretItem: "mfa.master_key") 로 이관.
 * 이전: process.env.MFA_MASTER_KEY (평문)
 * 이후: VaultService.decrypt("mfa.master_key") (AES-256-GCM envelope, KEK=MASTER_KEY_PATH)
 *
 * 호환성: Vault 에 저장된 평문은 기존 env 값 그대로 이관 (hex 64 또는 base64 44).
 * 캐시: 프로세스 lifetime 동안 1회만 복호화 (getMfaMasterKey 내부).
 */

let cachedKey: Buffer | null = null;

async function getMfaMasterKey(): Promise<Buffer> {
  if (cachedKey) return cachedKey;
  const vault = await getVault();
  const raw = await vault.decrypt("mfa.master_key");
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    cachedKey = Buffer.from(raw, "hex");
  } else {
    const b = Buffer.from(raw, "base64");
    if (b.length !== 32) {
      throw new Error("mfa.master_key 길이가 32 byte가 아닙니다");
    }
    cachedKey = b;
  }
  return cachedKey;
}

/**
 * 테스트용 캐시 초기화 (Vault mock 변경 후 재로딩). 프로덕션 코드 호출 금지.
 */
export function __resetMfaKeyCache(): void {
  cachedKey = null;
}

export async function encryptSecret(plain: string): Promise<string> {
  const key = await getMfaMasterKey();
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, tag, ct]).toString("base64url");
}

export async function decryptSecret(ciphertext: string): Promise<string> {
  const key = await getMfaMasterKey();
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
