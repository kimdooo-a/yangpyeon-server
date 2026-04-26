-- P0-membership Rollback (세션 61).
-- migration.sql 의 정확한 역방향. 참고용 — prisma migrate 는 자동 rollback 미지원.

-- ────────────────────────────────────────────────────────────
-- 1. Index drop (CASCADE 로 자동 drop 되지만 명시).
-- ────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS "tenant_memberships_user_id_idx";
DROP INDEX IF EXISTS "tenant_memberships_tenant_id_user_id_key";

-- ────────────────────────────────────────────────────────────
-- 2. Table drop.
--    FK 와 시드 row 모두 함께 제거됨.
-- ────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS "tenant_memberships";
