/**
 * tenant-router/roles — tenant 내부 역할 정의.
 *
 * ADR-027 §4.3 + ADR-026 §멤버십. Stage 3 enforce 시점에 prisma enum
 * (TenantRole) 으로 승격될 예정. 현재는 string literal union 으로 유지하여
 * schema 미존재 시점에도 타입 검사 가능.
 */
export type TenantRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export const TENANT_ROLE_VALUES: readonly TenantRole[] = [
  "OWNER",
  "ADMIN",
  "MEMBER",
  "VIEWER",
] as const;
