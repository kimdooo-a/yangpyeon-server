import { describe, it, expect, beforeAll } from "vitest";
import { authenticator } from "otplib";
import {
  generateTotpSecret,
  buildOtpAuthUrl,
  verifyTotpCode,
  generateRecoveryCodes,
  normalizeAndHashRecoveryCode,
} from "./totp";
import { encryptSecret, decryptSecret, hashRecoveryCode, safeEqualHash } from "./crypto";

// Phase 15 Auth Advanced Step 4 — TOTP MFA (FR-6.1)
// 참조: docs/research/2026-04-supabase-parity/02-architecture/03-auth-advanced-blueprint.md

beforeAll(() => {
  // 32 byte hex = AES-256 key
  process.env.MFA_MASTER_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
});

describe("TOTP secret & URL", () => {
  it("base32 16자 이상 secret 을 생성한다", () => {
    const s = generateTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]+$/);
    expect(s.length).toBeGreaterThanOrEqual(16);
  });

  it("otpauth:// URL 에 issuer, account, secret 이 포함된다", () => {
    const s = generateTotpSecret();
    const url = buildOtpAuthUrl("kimdooo@x.com", s);
    expect(url).toMatch(/^otpauth:\/\/totp\//);
    expect(url).toContain("Yangpyeong");
    expect(url).toContain("kimdooo%40x.com");
    expect(url).toContain(`secret=${s}`);
  });
});

describe("verifyTotpCode", () => {
  it("현재 코드를 검증한다", () => {
    const secret = generateTotpSecret();
    const token = authenticator.generate(secret);
    expect(verifyTotpCode(token, secret)).toBe(true);
  });

  it("잘못된 코드를 거부한다", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode("000000", secret)).toBe(false);
  });

  it("6자리가 아닌 입력을 거부한다 (format guard)", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode("12345", secret)).toBe(false);
    expect(verifyTotpCode("1234567", secret)).toBe(false);
    expect(verifyTotpCode("abcdef", secret)).toBe(false);
  });
});

describe("Recovery codes", () => {
  it("10개 고유 코드를 생성한다 (XXXXX-XXXXX 포맷)", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) {
      expect(c).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    }
  });

  it("정규화 해시는 대소문자/하이픈 무시", () => {
    const h1 = normalizeAndHashRecoveryCode("ABCDE-FGHJ2");
    const h2 = normalizeAndHashRecoveryCode("abcde-fghj2");
    const h3 = normalizeAndHashRecoveryCode("abcdefghj2");
    expect(h1).toBe(h2);
    expect(h1).toBe(h3);
  });
});

describe("AES-256-GCM encryption", () => {
  it("암호화 → 복호화 round-trip", () => {
    const plain = generateTotpSecret();
    const ct = encryptSecret(plain);
    expect(ct).not.toBe(plain);
    expect(decryptSecret(ct)).toBe(plain);
  });

  it("같은 평문도 매번 다른 ciphertext 를 생성 (nonce)", () => {
    const plain = "JBSWY3DPEHPK3PXP";
    const a = encryptSecret(plain);
    const b = encryptSecret(plain);
    expect(a).not.toBe(b);
  });

  it("변조된 ciphertext 를 거부한다 (GCM auth tag)", () => {
    const ct = encryptSecret("JBSWY3DPEHPK3PXP");
    // 마지막 문자 뒤집기
    const tampered = ct.slice(0, -1) + (ct.endsWith("A") ? "B" : "A");
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describe("safeEqualHash", () => {
  it("같은 hash 는 true", () => {
    const h = hashRecoveryCode("ABCDE12345");
    expect(safeEqualHash(h, h)).toBe(true);
  });
  it("다른 hash 는 false", () => {
    const a = hashRecoveryCode("ABCDE12345");
    const b = hashRecoveryCode("ZZZZZ99999");
    expect(safeEqualHash(a, b)).toBe(false);
  });
  it("길이가 다르면 false (크래시 없음)", () => {
    expect(safeEqualHash("abcd", "abcdef")).toBe(false);
    expect(safeEqualHash("", "")).toBe(false);
  });
});
