-- T1.4 sweep: 호출 사이트 일괄 전환 완료 후 글로벌 @unique 제거.
-- User.email, EdgeFunction.name, CronJob.name 의 글로벌 unique constraint 삭제.
-- (tenantId, X) composite unique 가 유일성 보장을 대체.
--
-- User: users_email_key 제거. users_tenant_id_email_key 는 Phase 1.4 Stage 3(20260427110000) 에서 생성.
-- EdgeFunction: edge_functions_name_key 제거. edge_functions_tenant_id_name_key 는 동일 마이그레이션.
-- CronJob: cron_jobs_name_key 제거. cron_jobs_tenant_id_name_key 는 동일 마이그레이션.

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_email_key";
ALTER TABLE "edge_functions" DROP CONSTRAINT IF EXISTS "edge_functions_name_key";
ALTER TABLE "cron_jobs" DROP CONSTRAINT IF EXISTS "cron_jobs_name_key";
