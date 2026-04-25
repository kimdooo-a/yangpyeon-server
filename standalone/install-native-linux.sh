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

echo "[3/4] Prisma client 재생성 (Linux OpenSSL 대응)"
if [[ -f prisma/schema.prisma ]]; then
  npx -y prisma generate --schema=prisma/schema.prisma || {
    echo "[WARN] prisma generate 실패 — @prisma/client 를 재설치하여 빌트인 엔진 사용"
    npm install --no-save @prisma/client @prisma/adapter-pg
  }
fi

echo "[4/4] NFT 해시 디렉토리 .node 자가치유 (Windows 빌드 산출물 방어)"
# 배경: Next.js 16 의 NFT(Node File Trace) 는 standalone 산출물에 packageName-<hash>/
#       구조로 네이티브 패키지를 복사한다. Windows 에서 next build 를 수행하면
#       이 해시 디렉토리에 Windows .node 가 들어가고, npm rebuild 는 정규
#       node_modules/ 만 갱신하므로 NFT 해시 디렉토리는 수동 동기화가 필요.
#
#       이 블록은 Linux 에서 빌드한 경우(L2 권장 경로)에는 동일 바이너리 덮어쓰기로
#       사실상 no-op, Windows 에서 빌드된 잔재가 들어온 경우(L0/L1 사고 경로)에는
#       자가치유.
sync_native_to_nft() {
  local pkg="$1"
  local rel_path="$2"   # 예: build/Release/better_sqlite3.node
  local src="node_modules/$pkg/$rel_path"
  if [[ ! -f "$src" ]]; then
    echo "  ⚠️  $src 없음 — 동기화 스킵"
    return 0
  fi
  local matched=0
  for nft_dir in .next/node_modules/${pkg}-*; do
    [[ -d "$nft_dir" ]] || continue
    local target="$nft_dir/$rel_path"
    # NFT 가 hardlink 로 이미 동일 inode 를 가리키는 경우(Linux 빌드 정상 경로)는
    # cp 가 "are the same file" 로 실패하므로 사전 차단. -ef 는 inode 동등성 비교.
    if [[ -f "$target" && "$src" -ef "$target" ]]; then
      echo "  = $target (이미 동일 inode — 스킵)"
    else
      mkdir -p "$(dirname "$target")"
      cp -f "$src" "$target"
      echo "  ✓ $target"
    fi
    matched=1
  done
  if [[ $matched -eq 0 ]]; then
    echo "  ℹ️  .next/node_modules/${pkg}-* 매칭 없음 (NFT 미사용 또는 패키지명 변경)"
  fi
}
sync_native_to_nft "better-sqlite3" "build/Release/better_sqlite3.node"

echo ""
echo "✅ Linux native 모듈 교체 완료"
echo "   → 'bash start.sh' 로 기동하거나 'pm2 start ecosystem.config.cjs' 로 등록하세요."
