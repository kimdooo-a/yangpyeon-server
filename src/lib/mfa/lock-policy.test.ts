import { describe, it, expect, afterEach } from "vitest";
import { computeLockedUntil, getLockPolicy } from "./lock-policy";

// Phase 15 Auth Advanced Step 6 — MFA 잠금 정책 단위 테스트.

describe("getLockPolicy", () => {
  const snapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...snapshot };
  });

  it("기본값: 5회 시도 / 900초 잠금", () => {
    delete process.env.MFA_MAX_FAILED_ATTEMPTS;
    delete process.env.MFA_LOCK_DURATION_SECONDS;
    expect(getLockPolicy()).toEqual({
      maxFailedAttempts: 5,
      lockDurationMs: 900 * 1000,
    });
  });

  it("환경변수로 오버라이드 가능", () => {
    process.env.MFA_MAX_FAILED_ATTEMPTS = "3";
    process.env.MFA_LOCK_DURATION_SECONDS = "60";
    expect(getLockPolicy()).toEqual({
      maxFailedAttempts: 3,
      lockDurationMs: 60_000,
    });
  });

  it("음수/0/비정수 입력은 기본값으로 fallback (방어)", () => {
    process.env.MFA_MAX_FAILED_ATTEMPTS = "-1";
    process.env.MFA_LOCK_DURATION_SECONDS = "abc";
    expect(getLockPolicy()).toEqual({
      maxFailedAttempts: 5,
      lockDurationMs: 900 * 1000,
    });

    process.env.MFA_MAX_FAILED_ATTEMPTS = "0";
    expect(getLockPolicy().maxFailedAttempts).toBe(5);
  });
});

describe("computeLockedUntil", () => {
  const now = new Date("2026-04-19T12:00:00.000Z");
  const policy = { maxFailedAttempts: 5, lockDurationMs: 60_000 };

  it("임계값 미만은 null (잠금 없음)", () => {
    expect(computeLockedUntil(1, now, policy)).toBeNull();
    expect(computeLockedUntil(4, now, policy)).toBeNull();
  });

  it("임계값 정확히 도달 시 lockDuration 후 시각 반환", () => {
    const locked = computeLockedUntil(5, now, policy);
    expect(locked).not.toBeNull();
    expect(locked!.getTime() - now.getTime()).toBe(60_000);
  });

  it("임계값 초과 시도 동일하게 lockDuration 후 (단순 정책)", () => {
    const locked = computeLockedUntil(10, now, policy);
    expect(locked!.getTime() - now.getTime()).toBe(60_000);
  });

  it("policy 인자 생략 시 환경변수 정책 사용", () => {
    const snapshot = { ...process.env };
    process.env.MFA_MAX_FAILED_ATTEMPTS = "2";
    process.env.MFA_LOCK_DURATION_SECONDS = "120";
    try {
      expect(computeLockedUntil(1, now)).toBeNull();
      const locked = computeLockedUntil(2, now);
      expect(locked!.getTime() - now.getTime()).toBe(120_000);
    } finally {
      process.env = { ...snapshot };
    }
  });
});
