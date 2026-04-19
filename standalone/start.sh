#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# 양평 부엌 대시보드 standalone 패키지 — 포그라운드 기동
#
# 사용:
#   bash start.sh                 # 기본 포트 3000 / 0.0.0.0 바인딩
#   PORT=3001 bash start.sh       # 포트 오버라이드
#   HOSTNAME=127.0.0.1 bash start.sh
#
# 환경변수(.env) 는 동일 디렉토리의 .env 에서 Next.js 가 자동 로드합니다.
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

if [[ ! -f "$HERE/.env" ]]; then
  echo "[WARN] .env 파일이 없습니다. .env.production.example 을 참조하여 .env 를 작성하세요." >&2
fi

export NODE_ENV=production
export PORT="${PORT:-3000}"
export HOSTNAME="${HOSTNAME:-0.0.0.0}"

echo "▶ ypserver standalone 기동  (PORT=$PORT, HOST=$HOSTNAME)"
exec node server.js
