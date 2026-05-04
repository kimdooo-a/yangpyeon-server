#!/usr/bin/env bash
# setup-githooks.sh — `.githooks/` 디렉토리를 git hooks 경로로 등록 (1회 실행)
#
# 신규 clone 또는 hook 비활성 상태에서 1회 실행.
# 별도 dev dep (husky 등) 없이 git native `core.hooksPath` 사용.

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -d .githooks ]]; then
  echo "[setup-githooks] ERR — .githooks 디렉토리 없음. 저장소 루트에서 실행 중인지 확인" >&2
  exit 1
fi

# Linux/macOS 측 실행권한 부여 (Windows 측은 Git Bash 가 무시하지만 안전망)
chmod +x .githooks/* 2>/dev/null || true

git config core.hooksPath .githooks

echo "[setup-githooks] core.hooksPath = $(git config core.hooksPath)"
echo "[setup-githooks] 등록된 hook:"
ls -1 .githooks/ | sed 's/^/  - /'
echo ""
echo "  비활성화: git config --unset core.hooksPath"
echo "  우회 (1회 commit): SKIP_SECRET_HOOK=1 git commit ... 또는 git commit --no-verify"
