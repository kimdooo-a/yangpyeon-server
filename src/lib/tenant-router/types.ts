/**
 * tenant-router/types — multi-tenant URL path 라우터 공유 타입.
 *
 * Phase 1.2 (T1.2) ADR-027 §4.1 reference. ResolvedTenant 는 URL slug 로부터
 * 매핑된 tenant 의 최소 식별 정보를 캡슐화한다. Manifest loader (Phase 2)
 * 단계에서는 effective config 까지 포함하도록 확장될 수 있다.
 *
 * 참조: docs/research/baas-foundation/04-architecture-wave/01-architecture/06-adr-027-impl-spec.md
 */

/**
 * URL slug → DB row 매핑 결과.
 *
 * id: Tenant.id (UUID — TenantContext.tenantId 로 그대로 주입)
 * slug: URL path 식별자 (immutable — ADR-026 §3 결정)
 * displayName: 운영 콘솔/감사 로그 표기용 사람 친화 이름
 * active: 운영 토글 — false 면 410 Gone 반환 (ADR-027 §4.2 step 2)
 *
 * status 원본 문자열 ("active" | "suspended" | "archived") 도 보존하여 향후
 * 세분 분기를 가능하게 한다 (현재는 active boolean 만 사용).
 */
export interface ResolvedTenant {
  id: string;
  slug: string;
  displayName: string;
  active: boolean;
  status: string;
}
