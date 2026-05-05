#!/usr/bin/env bash
# 가설 검증: app_admin 이 ops-only 테이블 (sticky_notes/webhooks/sql_queries/cron_jobs)
# 에 SELECT 권한이 없어 bypassRls=true 경로 (SET LOCAL ROLE app_admin) 가 42501 발생.
# 비교군: app_admin 이 정상 작동하는 테이블 (users/tenants/audit_log).
set -euo pipefail

ENV_FILE="${1:-$HOME/ypserver/.env}"
RAW_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | sed -E 's/^DATABASE_URL=//; s/^"(.*)"$/\1/')
DB_URL=$(echo "$RAW_URL" | sed -E 's/\?.*$//')

echo "=== app_admin 의 broken 4개 테이블 권한 ==="
psql "$DB_URL" -c "
SELECT
  t.tbl,
  has_table_privilege('app_admin', t.tbl, 'SELECT') AS sel,
  has_table_privilege('app_admin', t.tbl, 'INSERT') AS ins,
  has_table_privilege('app_admin', t.tbl, 'UPDATE') AS upd,
  has_table_privilege('app_admin', t.tbl, 'DELETE') AS del
FROM (VALUES
  ('public.sticky_notes'),
  ('public.webhooks'),
  ('public.sql_queries'),
  ('public.cron_jobs')
) AS t(tbl);
"

echo
echo "=== app_admin 의 working 비교군 테이블 권한 ==="
psql "$DB_URL" -c "
SELECT
  t.tbl,
  has_table_privilege('app_admin', t.tbl, 'SELECT') AS sel,
  has_table_privilege('app_admin', t.tbl, 'INSERT') AS ins,
  has_table_privilege('app_admin', t.tbl, 'UPDATE') AS upd,
  has_table_privilege('app_admin', t.tbl, 'DELETE') AS del
FROM (VALUES
  ('public.users'),
  ('public.tenants'),
  ('public.audit_log'),
  ('public.content_sources'),
  ('public.aggregator_items')
) AS t(tbl);
"

echo
echo "=== app_admin role 의 멤버십 ==="
psql "$DB_URL" -c "
SELECT r.rolname AS role, m.rolname AS member_of
FROM pg_auth_members am
JOIN pg_roles r ON r.oid = am.member
JOIN pg_roles m ON m.oid = am.roleid
WHERE r.rolname = 'app_admin' OR m.rolname = 'app_admin';
"

echo
echo "=== public schema 의 모든 테이블에서 app_admin 권한 누락 전수 조사 ==="
psql "$DB_URL" -c "
SELECT
  c.relname,
  has_table_privilege('app_admin', c.oid, 'SELECT') AS app_admin_select
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT has_table_privilege('app_admin', c.oid, 'SELECT')
ORDER BY c.relname;
"

echo
echo "=== 실제 SET ROLE 시뮬레이션 — sticky_notes ==="
psql "$DB_URL" <<'SQL' 2>&1 || true
BEGIN;
SET LOCAL ROLE app_admin;
SELECT count(*) AS sticky_count FROM sticky_notes;
ROLLBACK;
SQL

echo
echo "=== 실제 SET ROLE 시뮬레이션 — users (working) ==="
psql "$DB_URL" <<'SQL' 2>&1 || true
BEGIN;
SET LOCAL ROLE app_admin;
SELECT count(*) AS users_count FROM users;
ROLLBACK;
SQL
