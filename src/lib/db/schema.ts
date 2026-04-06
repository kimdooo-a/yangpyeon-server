import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

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
});

export const metricsHistory = sqliteTable('metrics_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  cpuUsage: integer('cpu_usage'),
  memoryUsed: integer('memory_used'),
  memoryTotal: integer('memory_total'),
});

export const ipWhitelist = sqliteTable('ip_whitelist', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ip: text('ip').notNull().unique(),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
