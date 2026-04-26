-- Phase 1.7 (T1.7) ADR-029 §2.1 — per-tenant Metrics 차원 추가 (M1).
-- 작성: 2026-04-26 세션 59 (G1b 병렬)
-- Stage: additive only. 기존 동작 0 회귀.
--
-- 1. metrics_history 에 per-tenant 인덱스 추가 (tenant_id 컬럼 자체는 Phase 0.4 T0.4 에서 추가됨).
-- 2. tenant_metrics_history 신규 테이블 — application metric (api_calls / cron_success / ...).
--
-- self-heal: applyPendingMigrations() 가 부팅 시 자동 적용 (ADR-021 §2.2).
-- 빌드 게이트: scripts/verify-schema.cjs 가 tenant_metrics_history 존재 검증.

CREATE INDEX IF NOT EXISTS `idx_metrics_tenant_time` ON `metrics_history` (`tenant_id`, `timestamp`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tenant_metrics_history` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `timestamp` integer,
  `tenant_id` text NOT NULL,
  `metric_name` text NOT NULL,
  `value` real NOT NULL,
  `bucket_key` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tenant_metrics` ON `tenant_metrics_history` (`tenant_id`, `metric_name`, `timestamp`);
