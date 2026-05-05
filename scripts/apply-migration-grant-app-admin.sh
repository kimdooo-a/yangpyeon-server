#!/usr/bin/env bash
# 20260505000000_grant_app_admin_all_public 마이그레이션을 prod DB 에 적용.
# psql 로 SQL 직접 실행 + _prisma_migrations 메타 row 삽입 (prisma migrate deploy
# 와 동일 결과 — node/cross-mount 의존 없이).
set -euo pipefail

MIG_NAME="20260505000000_grant_app_admin_all_public"
MIG_SQL="/mnt/e/00_develop/260406_luckystyle4u_server/prisma/migrations/${MIG_NAME}/migration.sql"

if [[ ! -f "$MIG_SQL" ]]; then
  echo "Migration SQL not found: $MIG_SQL" >&2
  exit 1
fi

ENV_FILE="${1:-$HOME/ypserver/.env}"
RAW_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | sed -E 's/^DATABASE_URL=//; s/^"(.*)"$/\1/')
DB_URL=$(echo "$RAW_URL" | sed -E 's/\?.*$//')

CHECKSUM=$(sha256sum "$MIG_SQL" | awk '{print $1}')
MIG_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)

echo "=== 마이그레이션 적용: $MIG_NAME ==="
echo "checksum: $CHECKSUM"
echo "id:       $MIG_ID"
echo

# 이미 적용 여부 체크 (idempotent)
ALREADY=$(psql "$DB_URL" -tA -c "SELECT count(*) FROM _prisma_migrations WHERE migration_name = '$MIG_NAME' AND finished_at IS NOT NULL;")
if [[ "$ALREADY" == "1" ]]; then
  echo "이미 적용됨 — skip."
  exit 0
fi

echo "=== 1. SQL 본체 적용 (transaction) ==="
psql "$DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f "$MIG_SQL"

echo
echo "=== 2. _prisma_migrations 메타 row 삽입 ==="
psql "$DB_URL" -v ON_ERROR_STOP=1 -c "
INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
VALUES ('$MIG_ID', '$CHECKSUM', '$MIG_NAME', now(), now(), 1);
"

echo
echo "=== 3. 라이브 검증 — SET ROLE app_admin 으로 4개 broken 테이블 SELECT ==="
psql "$DB_URL" <<'SQL'
BEGIN;
SET LOCAL ROLE app_admin;
SELECT 'sticky_notes' AS tbl, count(*) AS rows FROM sticky_notes
UNION ALL
SELECT 'webhooks', count(*) FROM webhooks
UNION ALL
SELECT 'sql_queries', count(*) FROM sql_queries
UNION ALL
SELECT 'cron_jobs', count(*) FROM cron_jobs;
ROLLBACK;
SQL

echo
echo "=== 4. 후 검증 — 모든 user 테이블에 app_admin ALL 권한 ==="
psql "$DB_URL" -c "
SELECT
  count(*) FILTER (WHERE has_table_privilege('app_admin', c.oid, 'SELECT')
                   AND has_table_privilege('app_admin', c.oid, 'INSERT')
                   AND has_table_privilege('app_admin', c.oid, 'UPDATE')
                   AND has_table_privilege('app_admin', c.oid, 'DELETE')) AS granted,
  count(*) AS total
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname NOT LIKE '\_prisma%' ESCAPE '\';
"

echo
echo "=== 적용 완료 ==="
