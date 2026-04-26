import {
  sqliteTable,
  text,
  integer,
  real,
  index,
} from "drizzle-orm/sqlite-core";

// Phase 0.4 (T0.4) ADR-021 amendment-2 — audit/metrics/ip_whitelist 의 tenant 차원 도입.
// Stage 1 additive: nullable + DEFAULT 'default'.
//   - 기존 11 콜사이트 (safeAudit 사용처) 무수정 — TenantContext 도입은 Phase 1.7.
//   - audit_logs.tenant_id 는 slug ('default' / 'almanac' / ...) — PG Tenant.id (UUID) 와 별개 식별자.
//   - cardinality cap (MAX_BUCKETS=200, ADR-021 §amendment-1) 은 tenant 차원 도입 후에도 유지.
//
// Phase 1.7 (T1.7) ADR-029 §2 — per-tenant Observability (M1 + L1 + T3) 추가:
//   - audit_logs.trace_id (T3 — request-context AsyncLocalStorage 자동 주입)
//   - tenant_metrics_history (M1 — per-tenant application metric 신규 테이블)
//   - 기존 컬럼 default('default') 는 보존 (T0.4 invariant). 시스템/미인증 호출은 동일 sentinel 'default'.

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    timestamp: integer("timestamp", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
    action: text("action").notNull(),
    ip: text("ip").notNull(),
    path: text("path"),
    method: text("method"),
    statusCode: integer("status_code"),
    userAgent: text("user_agent"),
    detail: text("detail"),
    // Phase 0.4 Stage 1 additive — slug 기반 ('default' / 'almanac' / ...). Phase 1.7 자동 주입.
    tenantId: text("tenant_id").default("default"),
    // Phase 1.7 (T1.7) — T3 correlation ID. request-context AsyncLocalStorage 자동 주입.
    // X-Request-Id 헤더 또는 server-side crypto.randomUUID(). null 허용 (시스템 cron 등).
    traceId: text("trace_id"),
  },
  (table) => ({
    idxTenantTime: index("idx_audit_logs_tenant_time").on(
      table.tenantId,
      table.timestamp,
    ),
    idxTraceId: index("idx_audit_logs_trace_id").on(table.traceId),
  }),
);

export const metricsHistory = sqliteTable(
  "metrics_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    timestamp: integer("timestamp", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
    cpuUsage: integer("cpu_usage"),
    memoryUsed: integer("memory_used"),
    memoryTotal: integer("memory_total"),
    // Phase 0.4 Stage 1 additive
    tenantId: text("tenant_id").default("default"),
  },
  (table) => ({
    // Phase 1.7 (T1.7) — per-tenant 시계열 조회 인덱스.
    idxTenantTime: index("idx_metrics_tenant_time").on(
      table.tenantId,
      table.timestamp,
    ),
  }),
);

export const ipWhitelist = sqliteTable("ip_whitelist", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ip: text("ip").notNull().unique(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  // Phase 0.4 Stage 1 additive — IP whitelist 가 per-tenant 인지 글로벌인지는 Phase 3 ADR-029 결정.
  tenantId: text("tenant_id").default("default"),
});

// Phase 1.7 (T1.7) ADR-029 §2.1 M1 — per-tenant application metric 신규 테이블.
//   - metricName: api_calls / query_duration_p95 / cron_success / edge_fn_invocations / error_count 등.
//   - bucketKey: 옵션 라벨 차원 (route_path, status_class 등). cardinality-guard 로 100 series/tenant 캡.
//   - retention: 30d (raw) — pruneOldData() 가 적용. C3 정책으로 운영 중 단축 가능.
export const tenantMetricsHistory = sqliteTable(
  "tenant_metrics_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    timestamp: integer("timestamp", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
    tenantId: text("tenant_id").notNull(),
    metricName: text("metric_name").notNull(),
    value: real("value").notNull(),
    bucketKey: text("bucket_key"),
  },
  (table) => ({
    idxTenantMetricTime: index("idx_tenant_metrics").on(
      table.tenantId,
      table.metricName,
      table.timestamp,
    ),
  }),
);
