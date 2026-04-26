/**
 * Circuit breaker — shouldDispatch / recordResult.
 *
 * Phase 1.5 (T1.5) — 07-adr-028-impl-spec §8.
 *
 * 책임:
 *   - shouldDispatch(jobId): 현재 circuit 상태 확인 + cooldown 경과 시 HALF_OPEN 회복.
 *   - recordResult(jobId, success): 실행 결과 반영 (consecutive_failures 갱신 + state 전이).
 *
 * 순수 상태 전이 로직은 @yangpyeon/core/cron (decideTransition + isCooldownElapsed).
 * 본 모듈은 prisma + audit 호출 wrapper 만.
 *
 * audit 패턴 (ADR-021 §amendment-1 cross-cutting fail-soft):
 *   - safeAudit 자체가 throw 하지 않음.
 *   - 추가 보호로 .catch(() => {}) — 본 모듈도 audit 실패가 cron 실패로 전파되지 않도록.
 */
import { prisma } from "@/lib/prisma";
import { safeAudit } from "@/lib/audit-log-db";
import { decideTransition, isCooldownElapsed } from "@yangpyeon/core";

/** OPEN 상태에서 HALF_OPEN 으로 회복하기까지 cooldown — 07-adr-028-impl-spec §8 권고 1h. */
const COOLDOWN_MS = 60 * 60_000;

/** TenantCronPolicy.consecutiveFailureThreshold 미설정 시 fallback. */
const DEFAULT_THRESHOLD = 5;

/** safeAudit wrapper — cron 이벤트 표준 형식 (action 만 다름). */
function emitAudit(action: string, detail: Record<string, unknown>): void {
  try {
    safeAudit(
      {
        timestamp: new Date().toISOString(),
        method: "CRON",
        path: action,
        ip: "system",
        action,
        detail: JSON.stringify(detail),
      },
      action,
    );
  } catch {
    // ADR-021 cross-cutting — audit 실패가 cron 실패로 전파되지 않게.
  }
}

/**
 * dispatch 가능 여부 판정.
 *   - OPEN + cooldown 미경과 → false (skip).
 *   - OPEN + cooldown 경과 → HALF_OPEN 으로 전이 후 true (1회 시도 허용).
 *   - CLOSED / HALF_OPEN → true.
 *
 * 비고: HALF_OPEN 상태에서 실행 결과는 recordResult 가 다음 전이를 결정.
 */
export async function shouldDispatch(jobId: string): Promise<boolean> {
  const c = await prisma.cronJob.findUnique({
    where: { id: jobId },
    select: { circuitState: true, circuitOpenedAt: true },
  });
  if (!c) return false;

  if (c.circuitState === "OPEN") {
    const elapsed = isCooldownElapsed(c.circuitOpenedAt, new Date(), COOLDOWN_MS);
    if (!elapsed) {
      emitAudit("cron.skip.circuit-open", {
        jobId,
        openedAt: c.circuitOpenedAt?.toISOString(),
      });
      return false;
    }
    // cooldown 경과 → HALF_OPEN 으로 사전 전이 (다음 실행 1회 시도 허용).
    await prisma.cronJob.update({
      where: { id: jobId },
      data: { circuitState: "HALF_OPEN" },
    });
    emitAudit("cron.circuit.half-open", { jobId });
  }
  return true;
}

/**
 * 실행 결과 기록 + circuit 상태 전이.
 *
 * 동작:
 *   1. cronJob 의 현재 상태 + tenantId 조회.
 *   2. 성공/실패에 따라 consecutive_failures 갱신.
 *   3. tenantCronPolicy.consecutiveFailureThreshold 조회 (없으면 default 5).
 *   4. decideTransition() 으로 다음 상태 결정.
 *   5. 변경 시 update + audit.
 */
export async function recordResult(
  jobId: string,
  success: boolean,
): Promise<void> {
  const before = await prisma.cronJob.findUnique({
    where: { id: jobId },
    select: {
      circuitState: true,
      consecutiveFailures: true,
      tenantId: true,
    },
  });
  if (!before) return;

  const failuresAfter = success ? 0 : before.consecutiveFailures + 1;

  // threshold 는 tenantCronPolicy 에서 (없으면 default).
  let threshold = DEFAULT_THRESHOLD;
  if (before.tenantId) {
    const policy = await prisma.tenantCronPolicy
      .findUnique({
        where: { tenantId: before.tenantId },
        select: { consecutiveFailureThreshold: true },
      })
      .catch(() => null);
    if (policy?.consecutiveFailureThreshold) {
      threshold = policy.consecutiveFailureThreshold;
    }
  }

  const transition = decideTransition({
    current: before.circuitState as "CLOSED" | "OPEN" | "HALF_OPEN",
    success,
    failuresAfter,
    threshold,
    now: new Date(),
  });

  // DB 갱신 — 성공이면 모든 carry 컬럼 리셋, 실패면 카운터/상태만.
  if (success) {
    await prisma.cronJob.update({
      where: { id: jobId },
      data: {
        consecutiveFailures: 0,
        circuitState: transition.nextState,
        circuitOpenedAt: null,
        lastSuccessAt: new Date(),
      },
    });
  } else {
    await prisma.cronJob.update({
      where: { id: jobId },
      data: {
        consecutiveFailures: failuresAfter,
        circuitState: transition.nextState,
        // openedAt: 새 OPEN 진입 시만 갱신, OPEN 유지면 보존.
        ...(transition.openedAt
          ? { circuitOpenedAt: transition.openedAt }
          : {}),
      },
    });
  }

  // audit 이벤트 — circuit 전이 시점만 (CLOSED 유지/OPEN 유지는 noise).
  if (transition.opened) {
    emitAudit("cron.circuit.opened", {
      jobId,
      tenantId: before.tenantId,
      failures: failuresAfter,
      threshold,
    });
  } else if (transition.closed) {
    emitAudit("cron.circuit.closed", {
      jobId,
      tenantId: before.tenantId,
    });
  }
}
