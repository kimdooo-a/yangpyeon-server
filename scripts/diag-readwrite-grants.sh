#!/usr/bin/env bash
# app_readonly / app_readwrite role 의 GRANT 매트릭스 audit.
# 트리거: S88 GRANT 핫픽스 후속 audit — app_admin 외 다른 PG role 에도
# 동일 latent bug 가능성 점검 (src/lib/pg/pool.ts 가 SQL Editor 용 raw
# pg client 에서 SET LOCAL ROLE app_readonly / app_readwrite 사용).
set -euo pipefail

ENV_FILE="${1:-$HOME/ypserver/.env}"
RAW_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | sed -E 's/^DATABASE_URL=//; s/^"(.*)"$/\1/')
DB_URL=$(echo "$RAW_URL" | sed -E 's/\?.*$//')

for role in app_readonly app_readwrite; do
  echo "=== $role GRANT 매트릭스 (public schema, NOT _prisma) ==="
  psql "$DB_URL" -c "
SELECT
  count(*) FILTER (WHERE has_table_privilege('$role', c.oid, 'SELECT')) AS sel,
  count(*) FILTER (WHERE has_table_privilege('$role', c.oid, 'INSERT')) AS ins,
  count(*) FILTER (WHERE has_table_privilege('$role', c.oid, 'UPDATE')) AS upd,
  count(*) FILTER (WHERE has_table_privilege('$role', c.oid, 'DELETE')) AS del,
  count(*) AS total
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname NOT LIKE '\_prisma%' ESCAPE '\';
"
done

echo
echo "=== 누락 테이블 (app_readonly SELECT 또는 app_readwrite INSERT 결손) ==="
psql "$DB_URL" -c "
SELECT c.relname,
       has_table_privilege('app_readonly', c.oid, 'SELECT')  AS ro_sel,
       has_table_privilege('app_readwrite', c.oid, 'SELECT') AS rw_sel,
       has_table_privilege('app_readwrite', c.oid, 'INSERT') AS rw_ins,
       has_table_privilege('app_readwrite', c.oid, 'UPDATE') AS rw_upd,
       has_table_privilege('app_readwrite', c.oid, 'DELETE') AS rw_del
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname NOT LIKE '\_prisma%' ESCAPE '\'
  AND (NOT has_table_privilege('app_readonly', c.oid, 'SELECT')
       OR NOT has_table_privilege('app_readwrite', c.oid, 'INSERT')
       OR NOT has_table_privilege('app_readwrite', c.oid, 'UPDATE')
       OR NOT has_table_privilege('app_readwrite', c.oid, 'DELETE'))
ORDER BY c.relname;
"

echo
echo "=== role 정의 (BYPASSRLS 여부) ==="
psql "$DB_URL" -c "SELECT rolname, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname LIKE 'app_%' ORDER BY rolname;"

echo
echo "=== DEFAULT PRIVILEGES — app_readonly / app_readwrite 자동 GRANT 등록 여부 ==="
psql "$DB_URL" -c "
SELECT pg_catalog.pg_get_userbyid(d.defaclrole) AS grantor,
       n.nspname,
       d.defaclobjtype,
       pg_catalog.array_to_string(d.defaclacl, E', ') AS default_acl
FROM pg_default_acl d
LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE n.nspname = 'public'
ORDER BY grantor;
"
