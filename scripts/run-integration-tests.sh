#!/usr/bin/env bash
# Messenger M2 통합 테스트 라이브 실행 — env-gated 92 케이스 활성화.
#
# 사전 조건 (S82 셋업 후 영구):
#   - WSL postgres 의 `luckystyle4u_test` DB 존재 (schema clone 완료)
#   - app_test_runtime role + RLS GRANTs 적용
#   - app_test_runtime password 가 .env.test.local 의 RLS_TEST_RUNTIME_PASSWORD
#
# 사용:
#   bash scripts/run-integration-tests.sh                    # 전체
#   bash scripts/run-integration-tests.sh tests/messenger/   # 메신저만
#
# ⚠️ WSL bash 환경 제약:
#   `npx` 가 Windows 측 (/mnt/c/Program Files/nodejs/npx) 에 있으면 WSL bash 에서
#   export 한 env 가 Windows interop 경계를 넘으며 손실 (특히 URL 의 `?`/`%`/`=`).
#   증상: 92 케이스 중 76 skip + 16 pass (env-gate 비활성).
#
#   회피책 2종:
#   1. PowerShell 에서 직접 env 설정 후 npx 호출 (현재 권장 — S82 검증 완료):
#        $env:RLS_TEST_DATABASE_URL='...?options=-c%20TimeZone%3DUTC'
#        $env:RLS_TEST_ADMIN_DATABASE_URL='...'
#        $env:DATABASE_URL=$env:RLS_TEST_DATABASE_URL
#        npx vitest run --no-file-parallelism tests/messenger/
#   2. WSL 내 Linux Node 설치 (`nvm install 24` 등) 후 본 스크립트 실행.
#
# Asia/Seoul timezone 으로 PrismaPg adapter 가 +9hr 시프트하는 문제 회피 위해
# 연결 문자열에 ?options=-c TimeZone=UTC 강제. (s82 발견 — prod 영향 가시화 별도 필요).
set -euo pipefail

# .env.test.local 에서 password 로드 (없으면 fail-loud)
if [[ -f .env.test.local ]]; then
  # shellcheck disable=SC1091
  set -a; source .env.test.local; set +a
fi

if [[ -z "${RLS_TEST_RUNTIME_PASSWORD:-}" ]]; then
  echo "ERROR: RLS_TEST_RUNTIME_PASSWORD 미설정. .env.test.local 에 추가하거나 export 하세요." >&2
  echo "  새 패스워드 발급: bash scripts/setup-test-db-role.sh" >&2
  exit 1
fi

if [[ -z "${RLS_TEST_ADMIN_PASSWORD:-}" ]]; then
  echo "ERROR: RLS_TEST_ADMIN_PASSWORD 미설정. .env.test.local 에 추가하세요 (보통 prod postgres 와 동일)." >&2
  exit 1
fi

# UTC 옵션은 PrismaPg adapter timezone 함정 회피. admin pool 은 raw pg 라 영향 없음.
export RLS_TEST_DATABASE_URL="postgresql://app_test_runtime:${RLS_TEST_RUNTIME_PASSWORD}@localhost:5432/luckystyle4u_test?options=-c%20TimeZone%3DUTC"
export RLS_TEST_ADMIN_DATABASE_URL="postgresql://postgres:${RLS_TEST_ADMIN_PASSWORD}@localhost:5432/luckystyle4u_test"
# Prisma client 가 RLS_TEST_DATABASE_URL 을 사용하도록 DATABASE_URL 도 동일하게 셋팅.
export DATABASE_URL="${RLS_TEST_DATABASE_URL}"

# vitest 가 file-parallelism 모드로 작동하면 여러 worker 가 같은 test DB 의 같은
# tenant rows 를 동시에 mutate 하여 race condition 발생. --no-file-parallelism 강제.
echo "▶ vitest --no-file-parallelism (live DB: luckystyle4u_test)"
exec npx vitest run --no-file-parallelism "${@:-tests/messenger/}"
