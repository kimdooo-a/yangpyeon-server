#!/usr/bin/env bash
# 모든 public 테이블에서 app_admin 권한 누락 전수 조사 + 비교군
set -euo pipefail
RAW_URL=$(grep -E '^DATABASE_URL=' "$HOME/ypserver/.env" | head -1 | sed -E 's/^DATABASE_URL=//; s/^"(.*)"$/\1/')
DB_URL=$(echo "$RAW_URL" | sed -E 's/\?.*$//')

echo "=== app_admin SELECT 권한 누락 테이블 (public schema 전체) ==="
psql "$DB_URL" -c "
SELECT
  c.relname,
  has_table_privilege('app_admin', c.oid, 'SELECT') AS sel,
  has_table_privilege('app_admin', c.oid, 'INSERT') AS ins,
  has_table_privilege('app_admin', c.oid, 'UPDATE') AS upd,
  has_table_privilege('app_admin', c.oid, 'DELETE') AS del
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname NOT LIKE '_prisma%'
  AND NOT has_table_privilege('app_admin', c.oid, 'SELECT')
ORDER BY c.relname;
"

echo
echo "=== app_admin SELECT 가 가능한 테이블 (정상 working 군) ==="
psql "$DB_URL" -c "
SELECT
  c.relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname NOT LIKE '_prisma%'
  AND has_table_privilege('app_admin', c.oid, 'SELECT')
ORDER BY c.relname;
"

echo
echo "=== sequences 도 누락 가능성 점검 (app_admin USAGE 권한) ==="
psql "$DB_URL" -c "
SELECT c.relname,
       has_sequence_privilege('app_admin', c.oid, 'USAGE') AS usage
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'S'
ORDER BY c.relname;
"

echo
echo "=== DEFAULT PRIVILEGES (향후 객체 자동 GRANT) ==="
psql "$DB_URL" -c "
SELECT pg_catalog.pg_get_userbyid(d.defaclrole) AS grantor,
       n.nspname,
       d.defaclobjtype,
       pg_catalog.array_to_string(d.defaclacl, E', ') AS default_acl
FROM pg_default_acl d
LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
ORDER BY grantor, nspname;
"
