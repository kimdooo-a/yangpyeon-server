#!/usr/bin/env bash
# app_runtime role 로 sticky_notes 직접 SELECT 가능한지 검증
set -euo pipefail

ENV_FILE="${1:-$HOME/ypserver/.env}"
RAW_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | sed -E 's/^DATABASE_URL=//; s/^"(.*)"$/\1/')
DB_URL=$(echo "$RAW_URL" | sed -E 's/\?.*$//')
export PGOPTIONS=""

echo "=== as postgres (BYPASSRLS), no tenant_id ==="
psql "$DB_URL" -c "SELECT count(*) FROM sticky_notes;" 2>&1 || true

echo
echo "=== SET ROLE app_runtime, no tenant_id ==="
psql "$DB_URL" -c "SET ROLE app_runtime; SELECT count(*) FROM sticky_notes;" 2>&1 || true

echo
echo "=== SET ROLE app_runtime, tenant_id set ==="
psql "$DB_URL" <<'SQL' 2>&1 || true
SET ROLE app_runtime;
SET app.tenant_id = '00000000-0000-0000-0000-000000000000';
SELECT count(*) AS sticky_count FROM sticky_notes;
SQL

echo
echo "=== app_runtime explicit SELECT privilege ==="
psql "$DB_URL" -c "SELECT has_table_privilege('app_runtime', 'public.sticky_notes', 'SELECT') AS can_select_sticky, has_table_privilege('app_runtime', 'public.users', 'SELECT') AS can_select_users, has_table_privilege('app_runtime', 'public.content_sources', 'SELECT') AS can_select_content;"

echo
echo "=== check StickyNoteVisibility enum USAGE permission ==="
psql "$DB_URL" -c "SELECT n.nspname, t.typname, pg_catalog.array_to_string(t.typacl, E'\n  ') AS acl FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='StickyNoteVisibility' OR t.typname ILIKE '%visibility%';"
