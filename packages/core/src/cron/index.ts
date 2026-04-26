/**
 * @yangpyeon/core/cron — 멀티테넌트 cron 격리 핵심 (pure logic).
 *
 * Phase 1.5 (T1.5) — 07-adr-028-impl-spec §11 체크리스트 §packages/core/src/cron/.
 *
 * 본 서브모듈은 DB/IO 의존이 0인 pure function 만 담는다:
 *   - lock-key.ts: tenantJobLockKey (sha256 → BIGINT)
 *   - circuit-breaker-state.ts: decideTransition + isCooldownElapsed
 *
 * Prisma 호출 wrapper 는 src/lib/cron/* 에 별도 (app-side wiring).
 *
 * 4 불변 인터페이스 중 `dispatchTenantJob(payload)` 의 토대.
 * 시그니처 변경 시 ADR-028 amendment 필수.
 */
export { tenantJobLockKey } from "./lock-key";
export {
  decideTransition,
  isCooldownElapsed,
  type CircuitState,
  type TransitionInput,
  type TransitionResult,
} from "./circuit-breaker-state";
