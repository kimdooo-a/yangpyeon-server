/**
 * @yangpyeon/core/tenant — 멀티테넌트 컨텍스트 인터페이스.
 *
 * 진행 단계:
 *   - Phase 1.1 (현재): context.ts (AsyncLocalStorage)
 *   - Phase 1.2: with-tenant.ts (HOC + tenantId 추출)
 *   - Phase 1.4: with-tenant-tx.ts (트랜잭션 래퍼)
 *   - Phase 2.1: manifest.ts (defineTenant + Zod schema)
 */
export {
  getCurrentTenant,
  getCurrentTenantOrNull,
  runWithTenant,
  type TenantContext,
} from "./context";
