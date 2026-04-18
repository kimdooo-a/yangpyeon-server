/**
 * Phase 15 Auth Advanced Step 6 — MFA 챌린지 잠금 정책.
 *
 * 참조: docs/research/2026-04-supabase-parity/02-architecture/03-auth-advanced-blueprint.md (FR-6.3)
 *
 * 정책: 단순 임계 락. 실패 카운터가 임계값(기본 5) 도달 즉시 lockDuration(기본 15분) 동안 잠금.
 *   락 해제 후 카운터는 검증 성공 시에만 0으로 리셋. 다음 N회 실패 시 다시 락.
 *
 * 환경변수 오버라이드:
 *   MFA_MAX_FAILED_ATTEMPTS  (기본 5, 양의 정수)
 *   MFA_LOCK_DURATION_SECONDS (기본 900, 양의 정수)
 *
 * 향후 확장: lockTier 컬럼 + 지수 백오프(1m → 5m → 30m → 24h)로 변경 가능.
 *   본 구현은 Step 6 1차 — 단순 임계로 시작 (블루프린트 §FR-6.3 권장 시작점).
 */

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LOCK_SECONDS = 15 * 60;

export interface LockPolicy {
  maxFailedAttempts: number;
  lockDurationMs: number;
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getLockPolicy(): LockPolicy {
  return {
    maxFailedAttempts: readPositiveInt(
      process.env.MFA_MAX_FAILED_ATTEMPTS,
      DEFAULT_MAX_ATTEMPTS,
    ),
    lockDurationMs:
      readPositiveInt(process.env.MFA_LOCK_DURATION_SECONDS, DEFAULT_LOCK_SECONDS) *
      1000,
  };
}

/**
 * 실패 후의 카운터 값을 받아 잠금 만료 시각을 계산.
 * 임계값 미만이면 null (잠금 없음).
 *
 * @param failedAttemptsAfterIncrement - increment 직후의 카운터 값 (1부터 시작)
 * @param now - 기준 시각 (대개 new Date())
 * @param policy - 정책 (생략 시 환경변수에서 읽음)
 */
export function computeLockedUntil(
  failedAttemptsAfterIncrement: number,
  now: Date,
  policy: LockPolicy = getLockPolicy(),
): Date | null {
  if (failedAttemptsAfterIncrement >= policy.maxFailedAttempts) {
    return new Date(now.getTime() + policy.lockDurationMs);
  }
  return null;
}
