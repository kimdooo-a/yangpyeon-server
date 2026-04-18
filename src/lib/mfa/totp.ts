import { authenticator } from "otplib";
import { HashAlgorithms } from "@otplib/core";
import { randomBytes } from "node:crypto";
import { toDataURL as qrToDataURL } from "qrcode";
import { hashRecoveryCode } from "./crypto";

// RFC 6238 표준 (30초 타임스텝, SHA-1, 6자리). authenticator 기본값 = 이 값.
authenticator.options = {
  step: 30,
  window: 1, // 직전·직후 1 step 허용 (총 3 step = 90초) — 시계 드리프트 관용
  digits: 6,
  algorithm: HashAlgorithms.SHA1,
};

export const TOTP_ISSUER = "Yangpyeong Dashboard";
export const RECOVERY_CODE_COUNT = 10;
export const RECOVERY_CODE_LENGTH = 10; // base32 10자 = 50bit 엔트로피

/**
 * 새로운 TOTP secret 생성 (base32 인코딩).
 */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/**
 * Authenticator 앱용 otpauth:// URL.
 * 예: otpauth://totp/Yangpyeong%20Dashboard:kimdooo%40stylelucky4u.com?secret=...&issuer=Yangpyeong%20Dashboard
 */
export function buildOtpAuthUrl(email: string, secret: string): string {
  return authenticator.keyuri(email, TOTP_ISSUER, secret);
}

export async function buildOtpAuthQrDataUrl(email: string, secret: string): Promise<string> {
  const url = buildOtpAuthUrl(email, secret);
  return qrToDataURL(url, { margin: 1, width: 256 });
}

/**
 * 6자리 OTP 코드 검증. window 설정으로 ±30초 허용.
 * authenticator.check 는 내부적으로 timing-safe 비교 사용.
 */
export function verifyTotpCode(token: string, secret: string): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  try {
    return authenticator.check(token, secret);
  } catch {
    return false;
  }
}

/**
 * 10개 recovery code 평문 생성. 사용자에게 1회만 표시, DB에는 SHA-256 hash만 저장.
 * 포맷: XXXX-XXXX (base32 대문자 10자, 가독성을 위해 하이픈 삽입).
 */
export function generateRecoveryCodes(count: number = RECOVERY_CODE_COUNT): string[] {
  const out: string[] = [];
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 혼동 문자(O/0/I/1) 제외 — 32자
  for (let i = 0; i < count; i++) {
    const buf = randomBytes(RECOVERY_CODE_LENGTH);
    let code = "";
    for (let j = 0; j < RECOVERY_CODE_LENGTH; j++) {
      code += alphabet[buf[j] % alphabet.length];
    }
    out.push(`${code.slice(0, 5)}-${code.slice(5)}`);
  }
  return out;
}

/**
 * 입력된 recovery code 정규화 후 SHA-256 hash 반환 (대소문자 무시, 하이픈 제거).
 */
export function normalizeAndHashRecoveryCode(input: string): string {
  const normalized = input.replace(/[^A-Z2-9]/gi, "").toUpperCase();
  return hashRecoveryCode(normalized);
}
