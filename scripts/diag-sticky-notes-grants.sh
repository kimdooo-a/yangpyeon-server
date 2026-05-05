#!/usr/bin/env bash
# 진단용 임시 스크립트 — sticky_notes 권한/RLS 상태 + 비교 패턴 확인
set -euo pipefail

ENV_FILE="${1:-$HOME/ypserver/.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ENV not found: $ENV_FILE" >&2
  exit 1
fi

# DATABASE_URL 추출 (= 이후 전체, quote 제거)
RAW_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | sed -E 's/^DATABASE_URL=//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/')
# psql 가 거부하는 Prisma 특화 query param (schema, connection_limit 등) 제거
DATABASE_URL=$(echo "$RAW_URL" | sed -E 's/\?.*$//')
export DATABASE_URL

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL empty after extraction" >&2
  exit 1
fi

echo "=== current identity ==="
psql "$DATABASE_URL" -c "SELECT current_user, current_database();"

echo
echo "=== sticky_notes table existence ==="
psql "$DATABASE_URL" -c "SELECT to_regclass('public.sticky_notes') AS sticky_notes_exists;"

echo
echo "=== sticky_notes column list ==="
psql "$DATABASE_URL" -c "\d public.sticky_notes"

echo
echo "=== sticky_notes ACL (relacl + RLS) ==="
psql "$DATABASE_URL" -c "
SELECT c.relname,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced,
       pg_catalog.array_to_string(c.relacl, E'\n  ') AS acl
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'sticky_notes';
"

echo
echo "=== sticky_notes RLS policies ==="
psql "$DATABASE_URL" -c "SELECT * FROM pg_policies WHERE schemaname='public' AND tablename='sticky_notes';"

echo
echo "=== compare: sample of other multi-tenant tables ACL ==="
psql "$DATABASE_URL" -c "
SELECT c.relname,
       c.relrowsecurity AS rls,
       pg_catalog.array_to_string(c.relacl, E'\n  ') AS acl
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('audit_log','tenants','users','rate_limits','content_sources','aggregator_items','sticky_notes')
ORDER BY c.relname;
"

echo
echo "=== app_tenant role list (RLS enforced roles) ==="
psql "$DATABASE_URL" -c "SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname LIKE 'app_%' OR rolname IN ('postgres','luckystyle4u') ORDER BY rolname;"

echo
echo "=== recent prisma migrations ==="
psql "$DATABASE_URL" -c "SELECT migration_name, finished_at, applied_steps_count, rolled_back_at FROM _prisma_migrations ORDER BY finished_at DESC NULLS LAST LIMIT 12;"
