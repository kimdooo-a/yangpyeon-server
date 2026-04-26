/**
 * TenantContext — AsyncLocalStorage 기반 요청-범위 테넌트 식별자.
 *
 * Phase 1.1 (T1.1) 1차 산출. ADR-023 §5.1 시그니처 준수.
 *
 * 역할:
 *   - 모든 핸들러는 요청 진입 시 `runWithTenant(ctx, fn)` 으로 감싸진다.
 *   - 핸들러 내부 어디서든 `getCurrentTenant()` 로 동기 조회 가능.
 *   - Prisma Client Extension(Phase 1.4) 가 이 값을 SET LOCAL 로 PG 세션에 주입.
 *
 * 4 불변 인터페이스 중 `withTenant(handler)`/`withTenantTx(fn)` 의 토대.
 * 시그니처 변경 시 ADR-023 amendment 필수.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface TenantContext {
  /** 테넌트 식별자(URL slug 또는 UUID — Phase 1.2 에서 확정). */
  tenantId: string;
  /**
   * 운영자 BYPASS_RLS 모드.
   * true 일 경우 Prisma Extension 이 `SET LOCAL ROLE app_admin` 으로 RLS 우회.
   * 운영 콘솔(`/dashboard/*`) 전용 — 컨슈머 라우트(`/api/v1/t/*`) 에서는 항상 false.
   */
  bypassRls?: boolean;
}

const tenantStorage = new AsyncLocalStorage<TenantContext>();

/**
 * 현재 요청의 TenantContext 를 반환.
 * 컨텍스트 외부 호출 시 throw — fail-loud 가드.
 */
export function getCurrentTenant(): TenantContext {
  const ctx = tenantStorage.getStore();
  if (!ctx) {
    throw new Error(
      "Tenant context missing. Did you wrap your handler in withTenant()?"
    );
  }
  return ctx;
}

/**
 * 컨텍스트가 없을 수 있는 코드(예: 부트스트랩, 시스템 cron) 용 안전 조회.
 */
export function getCurrentTenantOrNull(): TenantContext | null {
  return tenantStorage.getStore() ?? null;
}

/**
 * 주어진 컨텍스트로 비동기 함수를 실행.
 * AsyncLocalStorage 가 await/Promise/setTimeout 경계를 가로질러 컨텍스트를 전파한다.
 */
export function runWithTenant<T>(
  ctx: TenantContext,
  fn: () => Promise<T>,
): Promise<T> {
  return tenantStorage.run(ctx, fn);
}
