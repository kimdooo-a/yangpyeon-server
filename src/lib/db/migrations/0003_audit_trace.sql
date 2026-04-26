-- Phase 1.7 (T1.7) ADR-029 §2.2 — audit_logs.trace_id (T3) 추가.
-- 작성: 2026-04-26 세션 59 (G1b 병렬)
-- Stage: additive only. 기존 동작 0 회귀.
--
-- tenant_id 는 Phase 0.4 T0.4 에서 이미 추가됨 (ADR-021 §amendment-2 stage 1).
-- 본 마이그레이션은 trace_id 컬럼만 추가 + 인덱스 2종 (tenant+time, trace_id).
--
-- trace_id: request-context AsyncLocalStorage 자동 주입 (X-Request-Id 헤더 또는 crypto.randomUUID()).
-- Phase 4 OTel 도입 시 W3C Trace Context 와 호환 (16-hex char).

ALTER TABLE `audit_logs` ADD `trace_id` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_audit_logs_tenant_time` ON `audit_logs` (`tenant_id`, `timestamp`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_audit_logs_trace_id` ON `audit_logs` (`trace_id`);
