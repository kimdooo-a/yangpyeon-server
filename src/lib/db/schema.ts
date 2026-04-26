import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Phase 0.4 (T0.4) ADR-021 amendment-2 — audit/metrics/ip_whitelist 의 tenant 차원 도입.
// Stage 1 additive: nullable + DEFAULT 'default'.
//   - 기존 11 콜사이트 (safeAudit 사용처) 무수정 — TenantContext 도입은 Phase 1.7.
//   - audit_logs.tenant_id 는 slug ('default' / 'almanac' / ...) — PG Tenant.id (UUID) 와 별개 식별자.
//   - cardinality cap (MAX_BUCKETS=200, ADR-021 §amendment-1) 은 tenant 차원 도입 후에도 유지.
// Phase 1.7 에서 AsyncLocalStorage 자동 주입 활성화.

export const auditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  action: text('action').notNull(),
  ip: text('ip').notNull(),
  path: text('path'),
  method: text('method'),
  statusCode: integer('status_code'),
  userAgent: text('user_agent'),
  detail: text('detail'),
  // Phase 0.4 Stage 1 additive — slug 기반 ('default' / 'almanac' / ...). Phase 1.7 자동 주입.
  tenantId: text('tenant_id').default('default'),
});

export const metricsHistory = sqliteTable('metrics_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  cpuUsage: integer('cpu_usage'),
  memoryUsed: integer('memory_used'),
  memoryTotal: integer('memory_total'),
  // Phase 0.4 Stage 1 additive
  tenantId: text('tenant_id').default('default'),
});

export const ipWhitelist = sqliteTable('ip_whitelist', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ip: text('ip').notNull().unique(),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  // Phase 0.4 Stage 1 additive — IP whitelist 가 per-tenant 인지 글로벌인지는 Phase 3 ADR-029 결정.
  tenantId: text('tenant_id').default('default'),
});
