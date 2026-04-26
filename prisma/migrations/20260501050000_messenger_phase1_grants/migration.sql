-- ============================================================
-- Migration: messenger_phase1_grants
-- ADR: ADR-029 (RLS) + ADR-022 §1 (cross-tenant 차단)
-- 작성: Claude Code 세션 64 (2026-04-26)
-- Stage: enforce (RLS 활성화). 9 메신저 테이블 일괄 처리.
-- 의존: 20260501010000 ~ 20260501030000 (모든 메신저 테이블 생성 완료).
-- 근거: data-model.md §4.1 정확 복사 + 명시 GRANT (idempotent).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. ENABLE / FORCE ROW LEVEL SECURITY + tenant_isolation 정책 (9 테이블)
--    Phase 1.4 Stage 3 패턴 동일 (DO $$ FOREACH).
--    USING + WITH CHECK = SELECT/UPDATE/DELETE/INSERT 전 차원 차단.
--    FORCE ROW LEVEL SECURITY = table owner 도 정책 적용 (BYPASSRLS role 만 우회).
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
    tbl TEXT;
    messenger_tables TEXT[] := ARRAY[
        'conversations', 'conversation_members', 'messages',
        'message_attachments', 'message_mentions', 'message_receipts',
        'user_blocks', 'abuse_reports', 'notification_preferences'
    ];
BEGIN
    FOREACH tbl IN ARRAY messenger_tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
        EXECUTE format($pol$
            CREATE POLICY tenant_isolation ON %I
                USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
                WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
        $pol$, tbl);
    END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- 2. 명시 GRANT (idempotent — ALTER DEFAULT PRIVILEGES 가 자동 적용하지만 안전)
--    Phase 1.4 의 ALTER DEFAULT PRIVILEGES 이 신설 테이블에 자동 적용되지만,
--    sticky_notes 패턴 따라 명시 GRANT 로 idempotent 보장.
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
    tbl TEXT;
    messenger_tables TEXT[] := ARRAY[
        'conversations', 'conversation_members', 'messages',
        'message_attachments', 'message_mentions', 'message_receipts',
        'user_blocks', 'abuse_reports', 'notification_preferences'
    ];
BEGIN
    FOREACH tbl IN ARRAY messenger_tables LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_runtime', tbl);
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_migration') THEN
            EXECUTE format('GRANT ALL PRIVILEGES ON %I TO app_migration', tbl);
        END IF;
    END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- 3. 검증 쿼리 (마이그레이션 적용 후 자동 실행되는 self-check).
--    실패 시 ASSERT FAILED 로 마이그 rollback 트리거.
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
    rls_count INT;
    policy_count INT;
BEGIN
    -- 9 테이블 모두 RLS enabled + force.
    SELECT count(*) INTO rls_count
    FROM pg_class
    WHERE relname IN ('conversations','conversation_members','messages',
                      'message_attachments','message_mentions','message_receipts',
                      'user_blocks','abuse_reports','notification_preferences')
      AND relrowsecurity = true
      AND relforcerowsecurity = true;

    IF rls_count <> 9 THEN
        RAISE EXCEPTION 'RLS 검증 실패: 9 테이블 중 % 만 enabled+force', rls_count;
    END IF;

    -- 9 정책 모두 tenant_isolation 으로 생성됨.
    SELECT count(*) INTO policy_count
    FROM pg_policies
    WHERE policyname = 'tenant_isolation'
      AND tablename IN ('conversations','conversation_members','messages',
                        'message_attachments','message_mentions','message_receipts',
                        'user_blocks','abuse_reports','notification_preferences');

    IF policy_count <> 9 THEN
        RAISE EXCEPTION 'Policy 검증 실패: 9 테이블 중 % 만 tenant_isolation 정책', policy_count;
    END IF;

    RAISE NOTICE '메신저 RLS 검증 통과: 9 테이블 enabled+force, 9 tenant_isolation 정책 생성.';
END $$;
