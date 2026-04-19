#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# Windows 빌드 산출물을 WSL/Linux 에서 기동할 때 native 모듈 교체
#
# 배경: next build 를 Windows 에서 수행하면 NFT 가 다음을 포함함:
#   - better-sqlite3 (Windows 빌드된 .node 바이너리)
#   - @node-rs/argon2-win32-x64-msvc
# Linux 에서 require 시 "invalid ELF header" 또는 플랫폼 불일치로 크래시.
#
# 이 스크립트는 Linux 용 plugin 을 현재 node_modules 에 덧씌웁니다.
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "[ERROR] 이 스크립트는 Linux 전용입니다. (현재: $(uname -s))" >&2
  exit 1
fi

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

echo "[1/3] better-sqlite3 재빌드 (node-gyp 필요)"
npm rebuild better-sqlite3 --build-from-source || {
  echo "[WARN] 소스 재빌드 실패 — prebuilt 바이너리로 폴백"
  npm install --no-save better-sqlite3
}

echo "[2/3] @node-rs/argon2 Linux 네이티브 플러그인 설치"
# npm 이 플랫폼에 맞는 optional deps 를 자동 선택. 강제:
npm install --no-save --force "@node-rs/argon2-linux-x64-gnu"

# Windows 플러그인 잔재 제거 (공간 절약 + 혼동 방지)
rm -rf "node_modules/@node-rs/argon2-win32-x64-msvc" 2>/dev/null || true

echo "[3/3] Prisma client 재생성 (Linux OpenSSL 대응)"
if [[ -f prisma/schema.prisma ]]; then
  npx -y prisma generate --schema=prisma/schema.prisma || {
    echo "[WARN] prisma generate 실패 — @prisma/client 를 재설치하여 빌트인 엔진 사용"
    npm install --no-save @prisma/client @prisma/adapter-pg
  }
fi

echo ""
echo "✅ Linux native 모듈 교체 완료"
echo "   → 'bash start.sh' 로 기동하거나 'pm2 start ecosystem.config.cjs' 로 등록하세요."
