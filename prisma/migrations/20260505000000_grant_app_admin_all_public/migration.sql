-- ============================================================
-- Migration: grant_app_admin_all_public
-- ADR: ADR-023 §5 (운영자 BYPASS_RLS) + S82 4 latent bug 패턴 후속
-- 작성: Claude Code 세션 87 (2026-05-05)
-- 트리거: prod 서버 PM2 stderr 에 `permission denied for table sticky_notes`
--         외 webhooks/sql_queries/cron_jobs 동시 발생 (사용자 보고 — iPhone Safari
--         /notes 미작동, 데스크톱도 동일).
-- ============================================================
--
-- 근본 원인:
--   `prisma-tenant-client.ts` 의 `tenantPrismaFor({bypassRls: true})` 경로가
--   `SET LOCAL ROLE app_admin` 을 호출. app_admin role 은 BYPASSRLS=t 라
--   RLS 는 우회하지만, PostgreSQL ACL 검사는 RLS 보다 먼저 실행된다.
--   app_admin role 생성 시점부터 GRANT 가 한 번도 부여되지 않아 public schema
--   의 모든 37개 테이블 + 1개 시퀀스에 0 권한 → 모든 운영 콘솔 기능이 latent
--   broken (사용자가 sticky_notes/webhooks/sql_queries/cron_jobs 도달 시 노출).
--
-- Fix 전략:
--   1. public schema 의 모든 현재 테이블/시퀀스 에 app_admin GRANT (idempotent).
--   2. ALTER DEFAULT PRIVILEGES 로 향후 신설 객체 자동 GRANT — 동일 latent bug
--      재발 차단.
--   3. 검증 블록: 모든 user 테이블 (NOT _prisma%) 에 SELECT 권한 확인. 실패 시
--      RAISE EXCEPTION 으로 마이그레이션 자동 롤백.
--
-- 안전성:
--   - app_admin = BYPASSRLS=t (이미 RLS 통과 가능). GRANT ALL 추가는 권한
--     축소 아닌 확대로, 운영 콘솔(BaaS operator)의 의도된 정체성 ("절대 권한")
--     과 일치. 컨슈머 코드 가 app_admin 으로 SET ROLE 하지 않는 한 영향 없음.
--   - DEFAULT PRIVILEGES 는 postgres role 이 만든 향후 객체에만 적용. Prisma
--     마이그레이션이 postgres user 로 실행되므로 자동 적용.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. 기존 public schema 객체 일괄 GRANT (idempotent)
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
        RAISE EXCEPTION 'app_admin role 이 존재하지 않습니다. 본 마이그레이션은 app_admin 생성 마이그레이션 이후에 실행되어야 합니다.';
    END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_admin;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO app_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_admin;

-- ────────────────────────────────────────────────────────────
-- 2. DEFAULT PRIVILEGES — 향후 마이그레이션이 만드는 신규 객체 자동 GRANT.
--    postgres role 이 owner 인 모든 향후 객체에 적용 (Prisma 마이그레이션
--    실행 user = postgres 가정. ypserver/.env 의 DATABASE_URL 와 일치).
-- ────────────────────────────────────────────────────────────
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT ALL PRIVILEGES ON TABLES TO app_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO app_admin;

-- ────────────────────────────────────────────────────────────
-- 3. 검증 — 모든 user 테이블에 app_admin SELECT 권한 보장.
--    실패 시 RAISE EXCEPTION → 마이그레이션 자동 롤백 (postgres transaction).
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
    total_tables INT;
    granted_tables INT;
    missing_tables TEXT;
BEGIN
    SELECT count(*) INTO total_tables
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname NOT LIKE '\_prisma%' ESCAPE '\';

    SELECT count(*) INTO granted_tables
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname NOT LIKE '\_prisma%' ESCAPE '\'
      AND has_table_privilege('app_admin', c.oid, 'SELECT')
      AND has_table_privilege('app_admin', c.oid, 'INSERT')
      AND has_table_privilege('app_admin', c.oid, 'UPDATE')
      AND has_table_privilege('app_admin', c.oid, 'DELETE');

    IF granted_tables <> total_tables THEN
        SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO missing_tables
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND c.relname NOT LIKE '\_prisma%' ESCAPE '\'
          AND NOT (has_table_privilege('app_admin', c.oid, 'SELECT')
                AND has_table_privilege('app_admin', c.oid, 'INSERT')
                AND has_table_privilege('app_admin', c.oid, 'UPDATE')
                AND has_table_privilege('app_admin', c.oid, 'DELETE'));
        RAISE EXCEPTION 'app_admin GRANT 검증 실패: %/% 테이블만 ALL 권한. 누락: %',
            granted_tables, total_tables, missing_tables;
    END IF;

    RAISE NOTICE 'app_admin GRANT 검증 통과: % 테이블 모두 ALL 권한 부여 + DEFAULT PRIVILEGES 등록.', total_tables;
END $$;
