/**
 * @yangpyeon/core — 멀티테넌트 BaaS 플랫폼 코어
 *
 * Phase 0.2 (T0.2) 골격 신설. 실제 코드 추출은 Phase 1.x 에서 점진 진행:
 *   - Phase 1.1: TenantContext (AsyncLocalStorage) → ./tenant/context.ts
 *   - Phase 1.2: withTenant() 가드 → ./tenant/with-tenant.ts
 *   - Phase 1.3: ApiKey K3 매칭 → ./auth/api-key.ts
 *   - Phase 1.4: RLS 정책 + Prisma extension → ./db/with-tenant.ts
 *   - Phase 1.5: TenantWorkerPool → ./cron/worker-pool.ts
 *   - Phase 1.7: audit-metrics tenant 차원 → ./audit/metrics.ts
 *
 * 4 불변 인터페이스 (변경 시 ADR amendment 필수):
 *   - withTenant(handler): Route → tenant 컨텍스트 주입
 *   - withTenantTx(fn): 트랜잭션 + RLS SET LOCAL
 *   - dispatchTenantJob(payload): cron worker pool 위임
 *   - computeEffectiveConfig(tenantId): manifest + DB override 병합
 *
 * 참조: docs/research/baas-foundation/04-architecture-wave/01-architecture/00-system-overview-5-plane.md
 */

export const CORE_VERSION = "0.0.1";

// Phase 1.1: TenantContext (AsyncLocalStorage)
export {
  getCurrentTenant,
  getCurrentTenantOrNull,
  runWithTenant,
  type TenantContext,
} from "./tenant";

// Phase 1.5: Cron pure logic (lock key, circuit breaker state)
export {
  tenantJobLockKey,
  decideTransition,
  isCooldownElapsed,
  type CircuitState,
  type TransitionInput,
  type TransitionResult,
} from "./cron";
