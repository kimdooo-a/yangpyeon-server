#!/usr/bin/env bash
# Test DB role 셋업 — app_test_runtime 에 새 random password 적용 + login 검증.
# 출력 PWD 는 RLS_TEST_DATABASE_URL 구성에 사용.
set -euo pipefail

PWD_NEW=$(openssl rand -base64 24 | tr '+/' '-_' | tr -d '=')
export PGPASSWORD=<DB_PASSWORD>

echo "GENERATED_PWD=$PWD_NEW"

psql -U postgres -h localhost -d postgres <<EOF
ALTER ROLE app_test_runtime WITH LOGIN PASSWORD '$PWD_NEW';
EOF

echo "--- verify login + access:"
PGPASSWORD="$PWD_NEW" psql -U app_test_runtime -h localhost -d luckystyle4u_test -tAc \
  "SELECT current_user, count(*) FROM tenants;"

echo ""
echo "PWD_FOR_ENV=$PWD_NEW"
