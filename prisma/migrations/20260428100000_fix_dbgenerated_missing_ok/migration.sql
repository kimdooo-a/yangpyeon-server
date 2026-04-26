-- ─────────────────────────────────────────────────────────────────────────────
-- 세션 63 — T1.4 dbgenerated default 결함 정정
-- ─────────────────────────────────────────────────────────────────────────────
-- 문제:
--   T1.4 RLS Stage 3 마이그레이션이 모든 tenant_id 컬럼의 DEFAULT 를
--   `(current_setting('app.tenant_id'))::uuid` 로 정의했으나
--   `current_setting` 의 두 번째 인자(missing_ok) 누락.
--   → SET LOCAL app.tenant_id 가 없는 base prisma 호출 시 INSERT 평가 실패:
--      ERROR: unrecognized configuration parameter "app.tenant_id"
--
-- 영향 범위:
--   - 운영 콘솔 라우트 전반 (filebox / cron / sql / members / log-drains 등)
--   - prismaWithTenant 미통과 라우트 = base prisma 호출 = INSERT 시 500 에러
--
-- 해결:
--   COALESCE 로 fallback 추가 — SET 없으면 default tenant 자동 사용:
--     COALESCE(
--       (current_setting('app.tenant_id', true))::uuid,
--       '00000000-0000-0000-0000-000000000000'::uuid
--     )
--   - missing_ok=true (두 번째 인자) → 변수 부재 시 NULL 반환
--   - COALESCE → NULL 이면 default tenant UUID 사용
--   - prismaWithTenant + SET LOCAL 호출은 그대로 정상 동작 (variable 우선)
--
-- 영향 21 테이블 (T1.4 + T1.6 + sticky_notes 합산).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'api_keys', 'content_categories', 'content_ingested_items',
    'content_item_metrics', 'content_items', 'content_sources',
    'cron_jobs', 'edge_function_runs', 'edge_functions',
    'files', 'folders', 'log_drains',
    'mfa_enrollments', 'mfa_recovery_codes', 'rate_limit_buckets',
    'sessions', 'sql_queries', 'sticky_notes',
    'users', 'webauthn_authenticators', 'webhooks'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- 테이블 존재 시에만 ALTER (sticky_notes 등 별도 마이그레이션 트랙 호환)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = t
        AND column_name = 'tenant_id'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN tenant_id SET DEFAULT '
        'COALESCE((current_setting(''app.tenant_id'', true))::uuid, '
        '''00000000-0000-0000-0000-000000000000''::uuid)',
        t
      );
    END IF;
  END LOOP;
END $$;
