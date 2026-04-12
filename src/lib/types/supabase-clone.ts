/**
 * 세션 14: Supabase 관리 체계 이식 — 공용 타입
 * 참고: docs/research/decisions/ADR-002-supabase-adaptation-strategy.md
 */

// ─────────────────────────────────────────────────────────────
// Advisors
// ─────────────────────────────────────────────────────────────

export type AdvisorSeverity = "error" | "warn" | "info";

export interface AdvisorFinding {
  ruleId: string;
  severity: AdvisorSeverity;
  title: string;
  detail: string;
  remediation?: string;
  targetObject?: string;
}

export interface AdvisorRule {
  id: string;
  category: "security" | "performance";
  title: string;
  description: string;
  run: (ctx: AdvisorRunContext) => Promise<AdvisorFinding[]>;
}

export interface AdvisorRunContext {
  query: <T = unknown>(sql: string) => Promise<T[]>;
}

// ─────────────────────────────────────────────────────────────
// Data API
// ─────────────────────────────────────────────────────────────

export type DataApiOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "like"
  | "ilike"
  | "in";

export interface DataApiFilter {
  column: string;
  op: DataApiOperator;
  value: string | number | (string | number)[];
}

export interface DataApiQueryOptions {
  select?: string[];
  filters: DataApiFilter[];
  orderBy?: { column: string; direction: "asc" | "desc" }[];
  limit?: number;
  offset?: number;
}

export interface TableAllowlistEntry {
  table: string;
  readRoles: ("ADMIN" | "MANAGER" | "USER")[];
  writeRoles: ("ADMIN" | "MANAGER")[];
  exposedColumns: string[];
  forcedWhere?: (role: "ADMIN" | "MANAGER" | "USER", userId: string) => Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────
// SQL Editor
// ─────────────────────────────────────────────────────────────

export interface SqlRunResult {
  rows: Record<string, unknown>[];
  fields: { name: string; dataType: string }[];
  rowCount: number;
  durationMs: number;
  truncated: boolean;
}

// ─────────────────────────────────────────────────────────────
// Edge Functions (lite)
// ─────────────────────────────────────────────────────────────

export interface EdgeFunctionRunResult {
  status: "SUCCESS" | "FAILURE" | "TIMEOUT";
  durationMs: number;
  stdout: string;
  stderr: string;
  returnValue?: unknown;
}

export interface EdgeFunctionContext {
  input: unknown;
  timeoutMs: number;
  allowedFetchHosts: string[];
}

// ─────────────────────────────────────────────────────────────
// Realtime Channels
// ─────────────────────────────────────────────────────────────

export interface RealtimeMessage {
  channel: string;
  event: string;
  payload: unknown;
  timestamp: number;
}

// ─────────────────────────────────────────────────────────────
// Cron
// ─────────────────────────────────────────────────────────────

export type CronKindPayload =
  | { kind: "SQL"; sql: string }
  | { kind: "FUNCTION"; functionId: string; input?: unknown }
  | { kind: "WEBHOOK"; webhookId: string };

// ─────────────────────────────────────────────────────────────
// Webhooks
// ─────────────────────────────────────────────────────────────

export interface WebhookDeliveryResult {
  ok: boolean;
  status?: number;
  error?: string;
  durationMs: number;
}

// ─────────────────────────────────────────────────────────────
// API Keys
// ─────────────────────────────────────────────────────────────

export interface ApiKeyIssuedPayload {
  /** 발급 시점에만 1회 반환되는 평문 키 */
  plaintext: string;
  prefix: string;
  keyHash: string;
}

// ─────────────────────────────────────────────────────────────
// Log Drains
// ─────────────────────────────────────────────────────────────

export interface LogDrainEntry {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface LogDrainDeliveryResult {
  delivered: number;
  failed: number;
  error?: string;
}

// ─────────────────────────────────────────────────────────────
// Schema Visualizer
// ─────────────────────────────────────────────────────────────

export interface SchemaNodeColumn {
  name: string;
  dataType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  references?: { table: string; column: string };
}

export interface SchemaNode {
  id: string;
  table: string;
  schema: string;
  columns: SchemaNodeColumn[];
  source: "prisma" | "drizzle" | "information_schema";
}

export interface SchemaEdge {
  id: string;
  source: string;
  target: string;
  sourceColumn: string;
  targetColumn: string;
}

export interface SchemaGraph {
  nodes: SchemaNode[];
  edges: SchemaEdge[];
}
