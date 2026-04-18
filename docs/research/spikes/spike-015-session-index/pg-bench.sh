#!/usr/bin/env bash
# SP-015 PostgreSQL Session Index Benchmark
# - 10만 행 Session 삽입
# - 일반 인덱스 vs partial index EXPLAIN
# - 활성 세션 조회 지연 측정
set -euo pipefail

# DATABASE_URL은 wsl 내부 .env에서 로드
ENVFILE="/mnt/e/00_develop/260406_luckystyle4u_server/.env"
if [ -f "$ENVFILE" ]; then
  export $(grep '^DATABASE_URL=' "$ENVFILE" | tr -d '"')
fi
# ?schema=public 제거
PG_URL="${DATABASE_URL//\?schema=public/}"
export PSQL_URL="$PG_URL"

echo "=== SP-015 PostgreSQL bench ==="
echo "URL: ${PG_URL%%:*}://***"

psql "$PSQL_URL" <<'EOF'
DROP TABLE IF EXISTS "_test_session";

CREATE TABLE "_test_session" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 일반 복합 인덱스
CREATE INDEX idx_session_user_exp ON "_test_session" ("userId", "expiresAt");
EOF

echo ""
echo "[Insert] 100,000 rows..."
TIME_START=$(date +%s%3N)
psql "$PSQL_URL" -q <<'EOF'
INSERT INTO "_test_session" (id, "userId", "expiresAt", "createdAt")
SELECT
  encode(sha256(random()::text::bytea), 'hex'),
  'user-' || LPAD((floor(random() * 1000))::text, 5, '0'),
  CASE WHEN random() < 0.8 THEN NOW() + INTERVAL '7 days' ELSE NOW() - INTERVAL '1 hour' END,
  NOW() - (random() * INTERVAL '1 day')
FROM generate_series(1, 100000);

ANALYZE "_test_session";
EOF
TIME_END=$(date +%s%3N)
echo "Insert: $((TIME_END - TIME_START))ms"

echo ""
echo "[EXPLAIN] 일반 인덱스 — 활성 세션 조회"
psql "$PSQL_URL" -c "EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM \"_test_session\" WHERE \"userId\" = 'user-00001' AND \"expiresAt\" > NOW() LIMIT 100;"

echo ""
echo "[Bench] 일반 인덱스 — 1000 쿼리 순차"
psql "$PSQL_URL" -q <<'EOF'
\timing on
DO $$
DECLARE
  i INT;
  uid TEXT;
  t0 TIMESTAMP;
  t1 TIMESTAMP;
  durs BIGINT[] := ARRAY[]::BIGINT[];
BEGIN
  FOR i IN 1..1000 LOOP
    uid := 'user-' || LPAD((floor(random() * 1000))::int::text, 5, '0');
    t0 := clock_timestamp();
    PERFORM * FROM "_test_session" WHERE "userId" = uid AND "expiresAt" > NOW() LIMIT 100;
    t1 := clock_timestamp();
    durs := array_append(durs, EXTRACT(MICROSECONDS FROM (t1 - t0))::BIGINT);
  END LOOP;
  RAISE NOTICE 'p50=% us, p95=% us, p99=% us, max=% us',
    (SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY u) FROM unnest(durs) u),
    (SELECT percentile_disc(0.95) WITHIN GROUP (ORDER BY u) FROM unnest(durs) u),
    (SELECT percentile_disc(0.99) WITHIN GROUP (ORDER BY u) FROM unnest(durs) u),
    (SELECT max(u) FROM unnest(durs) u);
END $$;
EOF

echo ""
echo "[Partial Index] 활성 세션만 인덱싱"
psql "$PSQL_URL" <<'EOF'
DROP INDEX idx_session_user_exp;
CREATE INDEX idx_session_user_partial ON "_test_session" ("userId", "expiresAt")
  WHERE "expiresAt" > NOW();
ANALYZE "_test_session";
EOF

echo ""
echo "[EXPLAIN] partial index — 동일 쿼리"
psql "$PSQL_URL" -c "EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM \"_test_session\" WHERE \"userId\" = 'user-00001' AND \"expiresAt\" > NOW() LIMIT 100;"

echo ""
echo "[Bench] partial index — 1000 쿼리 순차"
psql "$PSQL_URL" -q <<'EOF'
DO $$
DECLARE
  i INT;
  uid TEXT;
  t0 TIMESTAMP;
  t1 TIMESTAMP;
  durs BIGINT[] := ARRAY[]::BIGINT[];
BEGIN
  FOR i IN 1..1000 LOOP
    uid := 'user-' || LPAD((floor(random() * 1000))::int::text, 5, '0');
    t0 := clock_timestamp();
    PERFORM * FROM "_test_session" WHERE "userId" = uid AND "expiresAt" > NOW() LIMIT 100;
    t1 := clock_timestamp();
    durs := array_append(durs, EXTRACT(MICROSECONDS FROM (t1 - t0))::BIGINT);
  END LOOP;
  RAISE NOTICE 'p50=% us, p95=% us, p99=% us, max=% us',
    (SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY u) FROM unnest(durs) u),
    (SELECT percentile_disc(0.95) WITHIN GROUP (ORDER BY u) FROM unnest(durs) u),
    (SELECT percentile_disc(0.99) WITHIN GROUP (ORDER BY u) FROM unnest(durs) u),
    (SELECT max(u) FROM unnest(durs) u);
END $$;
EOF

echo ""
echo "[Index Size]"
psql "$PSQL_URL" -c "SELECT pg_size_pretty(pg_relation_size('idx_session_user_partial')) AS partial_idx, pg_size_pretty(pg_relation_size('_test_session')) AS table_size;"

# teardown
psql "$PSQL_URL" -c "DROP TABLE \"_test_session\";" > /dev/null
echo ""
echo "=== 완료 ==="
