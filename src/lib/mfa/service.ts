import { prisma } from "@/lib/prisma";
import { decryptSecret, safeEqualHash } from "./crypto";
import { verifyTotpCode, normalizeAndHashRecoveryCode } from "./totp";
import { computeLockedUntil } from "./lock-policy";

export type MfaVerificationResult =
  | { ok: true; method: "totp" | "recovery" }
  | {
      ok: false;
      reason: "NO_ENROLLMENT" | "NOT_CONFIRMED" | "LOCKED" | "INVALID";
      lockedUntil?: Date;
    };

/**
 * MFA 2차 인증 검증 (TOTP 또는 recovery code).
 * 성공 시 결과의 method 로 구분. recovery 사용은 usedAt 즉시 기록 (재사용 방지).
 *
 * 실패 카운터(`failedAttempts`)가 임계값 도달 시 `lockedUntil` 자동 설정.
 * 락 정책: src/lib/mfa/lock-policy.ts (Step 6 / FR-6.3)
 */
export async function verifyMfaSecondFactor(
  userId: string,
  input: { code?: string; recoveryCode?: string },
): Promise<MfaVerificationResult> {
  const enrollment = await prisma.mfaEnrollment.findUnique({ where: { userId } });
  if (!enrollment) return { ok: false, reason: "NO_ENROLLMENT" };
  if (!enrollment.confirmedAt) return { ok: false, reason: "NOT_CONFIRMED" };

  const now = new Date();
  if (enrollment.lockedUntil && enrollment.lockedUntil > now) {
    return { ok: false, reason: "LOCKED", lockedUntil: enrollment.lockedUntil };
  }

  if (input.code) {
    const secret = decryptSecret(enrollment.secretCiphertext);
    const valid = verifyTotpCode(input.code, secret);
    if (!valid) {
      const lockedUntil = await registerFailure(userId, now);
      return lockedUntil
        ? { ok: false, reason: "LOCKED", lockedUntil }
        : { ok: false, reason: "INVALID" };
    }
    await prisma.mfaEnrollment.update({
      where: { userId },
      data: { failedAttempts: 0, lockedUntil: null },
    });
    return { ok: true, method: "totp" };
  }

  if (input.recoveryCode) {
    const hash = normalizeAndHashRecoveryCode(input.recoveryCode);
    const candidates = await prisma.mfaRecoveryCode.findMany({
      where: { userId, usedAt: null },
    });
    const match = candidates.find((c) => safeEqualHash(c.codeHash, hash));
    if (!match) {
      const lockedUntil = await registerFailure(userId, now);
      return lockedUntil
        ? { ok: false, reason: "LOCKED", lockedUntil }
        : { ok: false, reason: "INVALID" };
    }
    await prisma.mfaRecoveryCode.update({
      where: { id: match.id },
      data: { usedAt: now },
    });
    await prisma.mfaEnrollment.update({
      where: { userId },
      data: { failedAttempts: 0, lockedUntil: null },
    });
    return { ok: true, method: "recovery" };
  }

  return { ok: false, reason: "INVALID" };
}

/**
 * 실패 카운터 atomic increment 후 임계값 도달 시 lockedUntil 설정.
 * 반환값: 새로 설정된 lockedUntil (락 없으면 null).
 *
 * Prisma `increment` 가 race-safe 라서 동시 실패 요청도 안전하게 카운트.
 * 임계 도달 시 2차 update 라운드트립이 발생하지만, 임계 도달은 드문 사건이라 영향 미미.
 */
async function registerFailure(userId: string, now: Date): Promise<Date | null> {
  const after = await prisma.mfaEnrollment.update({
    where: { userId },
    data: { failedAttempts: { increment: 1 } },
    select: { failedAttempts: true },
  });
  const lockedUntil = computeLockedUntil(after.failedAttempts, now);
  if (lockedUntil) {
    await prisma.mfaEnrollment.update({
      where: { userId },
      data: { lockedUntil },
    });
  }
  return lockedUntil;
}
