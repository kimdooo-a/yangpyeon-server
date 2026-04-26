-- Phase 0.4 (T0.4) ADR-021 amendment-2 — audit_logs/metrics_history/ip_whitelist tenant_id 추가.
-- 작성: 2026-04-26 세션 59
-- Stage: 1 of 5 (additive). 기존 동작 0 회귀.
--
-- ADR-021 cross-cutting fail-soft 의 multi-tenant 차원 도입.
-- safeAudit 시그니처는 무수정 (11 콜사이트 영향 0) — Phase 1.7 에서 AsyncLocalStorage 자동 주입 활성화.
-- tenant_id 는 slug ('default'/'almanac'/...) — PG Tenant.id (UUID) 와 의도적 별개.
--   slug 가 자연스러운 audit dashboard 키 (사람이 읽음). UUID 는 PG 트랜잭션 컨텍스트.

ALTER TABLE `audit_logs` ADD `tenant_id` text DEFAULT 'default';
--> statement-breakpoint
ALTER TABLE `metrics_history` ADD `tenant_id` text DEFAULT 'default';
--> statement-breakpoint
ALTER TABLE `ip_whitelist` ADD `tenant_id` text DEFAULT 'default';
