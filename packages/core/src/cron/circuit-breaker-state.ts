/**
 * circuit-breaker-state — 순수 상태 전이 로직 (DB 비의존).
 *
 * 07-adr-028-impl-spec §8 의 상태 전이도를 pure function 으로 분리:
 *
 *   CLOSED ──(consecutive_failures ≥ threshold)──→ OPEN
 *   OPEN ──(elapsed ≥ COOLDOWN_MS)──→ HALF_OPEN  (외부 caller 가 cooldown 판정)
 *   HALF_OPEN ──(success)──→ CLOSED
 *   HALF_OPEN ──(failure)──→ OPEN (cooldown 재시작)
 *   CLOSED ──(success)──→ CLOSED
 *
 * Wrapper(`src/lib/cron/circuit-breaker.ts`) 가 본 모듈을 호출해서 DB 갱신.
 * 본 모듈 자체는 Prisma/Audit 의존 0 — packages/core 에서 격리 보존.
 *
 * 시그니처 변경 시 ADR-028 amendment 필수.
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface TransitionInput {
  /** 현재 circuit 상태 */
  current: CircuitState;
  /** 이번 실행이 성공했는가 */
  success: boolean;
  /**
   * 실패 카운터 누적 후 값.
   *   - success=true 면 caller 가 0 으로 리셋한 값 전달.
   *   - success=false 면 caller 가 +1 적용 후 전달.
   */
  failuresAfter: number;
  /** OPEN 진입 임계 (TenantCronPolicy.consecutiveFailureThreshold). */
  threshold: number;
  /**
   * 현재 시각.
   *   - CLOSED→OPEN, HALF_OPEN→OPEN 으로 전이 시 openedAt 으로 사용.
   *   - 호출자가 주입(test 결정성).
   */
  now: Date;
}

export interface TransitionResult {
  /** 다음 circuit 상태 */
  nextState: CircuitState;
  /**
   * 새로 OPEN 진입할 경우 OPEN 진입 시각.
   *   - 그 외엔 undefined (caller 가 기존 값 보존).
   */
  openedAt?: Date;
  /**
   * CLOSED → OPEN 또는 HALF_OPEN → OPEN 전이 시 true.
   * caller 가 audit 이벤트 발사 여부 결정에 사용.
   */
  opened: boolean;
  /** OPEN/HALF_OPEN → CLOSED 회복 시 true (audit 'cron.circuit.closed'). */
  closed: boolean;
}

/**
 * 다음 circuit 상태를 결정 — 순수 함수.
 *
 * 주의: OPEN→HALF_OPEN 전이는 본 함수가 결정하지 않는다.
 * cooldown 경과 판정은 외부(`shouldDispatch`) 책임 — DB read 가 필요하기 때문.
 * 본 함수는 "이번 실행 결과" 가 들어왔을 때의 상태 전이만 계산.
 */
export function decideTransition(input: TransitionInput): TransitionResult {
  const { current, success, failuresAfter, threshold, now } = input;

  if (success) {
    // 성공 — 모든 상태에서 CLOSED 로 회복.
    return {
      nextState: "CLOSED",
      opened: false,
      closed: current !== "CLOSED",
    };
  }

  // 실패 처리.
  if (current === "HALF_OPEN") {
    // HALF_OPEN 상태에서 실패 → 즉시 OPEN 재진입 (cooldown 재시작).
    return {
      nextState: "OPEN",
      openedAt: now,
      opened: true,
      closed: false,
    };
  }

  if (current === "OPEN") {
    // OPEN 상태에서 실패 → 변화 없음 (cooldown 진행 중, openedAt 유지).
    return {
      nextState: "OPEN",
      opened: false,
      closed: false,
    };
  }

  // CLOSED — 실패 누적이 threshold 도달 시 OPEN.
  if (failuresAfter >= threshold) {
    return {
      nextState: "OPEN",
      openedAt: now,
      opened: true,
      closed: false,
    };
  }

  // CLOSED 유지.
  return {
    nextState: "CLOSED",
    opened: false,
    closed: false,
  };
}

/**
 * cooldown 경과 판정 — pure helper.
 * shouldDispatch 가 OPEN 상태에서 호출.
 *
 * @param openedAt    OPEN 진입 시각.
 * @param now         현재 시각.
 * @param cooldownMs  cooldown 기간 (ms). 기본 60min.
 */
export function isCooldownElapsed(
  openedAt: Date | null,
  now: Date,
  cooldownMs: number,
): boolean {
  if (!openedAt) return true; // 정합성 깨진 경우 — caller 가 HALF_OPEN 으로 회복 시도.
  return now.getTime() - openedAt.getTime() >= cooldownMs;
}
