#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# Next.js standalone 산출물을 프로젝트 루트 standalone/ 폴더로 패키징
#
# 전제: 이미 `npm run build` 가 완료되어 .next/standalone 이 존재
# 호출: bash scripts/pack-standalone.sh
#
# NFT(Node File Trace) 가 누락하는 항목을 수동 복사:
#   - .next/static         → standalone/.next/static
#   - public/              → standalone/public
#   - prisma/migrations/   → standalone/prisma/migrations  (drizzle/prisma 런타임 마이그레이션용)
#   - src/generated/prisma → 이미 NFT 가 추적하여 .next/standalone 에 포함
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/.next/standalone"
DEST="$ROOT/standalone"

if [[ ! -d "$SRC" ]]; then
  echo "[ERROR] .next/standalone 이 없습니다. 먼저 'npm run build' 를 실행하세요." >&2
  exit 1
fi

echo "[1/5] 기존 standalone/ 정리"
# 기동 헬퍼(start.sh, README, ecosystem)는 보존
find "$DEST" -mindepth 1 -maxdepth 1 \
  ! -name 'start.sh' \
  ! -name 'README.md' \
  ! -name 'ecosystem.config.cjs' \
  ! -name '.env.production.example' \
  ! -name 'install-native-linux.sh' \
  -exec rm -rf {} +

echo "[2/5] .next/standalone/* 복사 (server.js + NFT 추적 node_modules)"
# cp -a 대신 rsync 권장 (더 큰 프로젝트에서 빠름). rsync 없을 시 cp fallback.
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete-excluded \
    --exclude='docs/' \
    --exclude='spikes/' \
    --exclude='.playwright-mcp/' \
    --exclude='tsconfig.tsbuildinfo' \
    --exclude='*.png' \
    --exclude='*.md' \
    --exclude='playwright.config.ts' \
    --exclude='vitest.config.ts' \
    --exclude='drizzle.config.ts' \
    "$SRC/" "$DEST/"
else
  cp -a "$SRC/." "$DEST/"
  # rsync 없을 때 수동 제거 (실패해도 무시)
  rm -rf "$DEST/docs" "$DEST/spikes" "$DEST/.playwright-mcp" "$DEST/tsconfig.tsbuildinfo" || true
  find "$DEST" -maxdepth 1 -name '*.png' -delete || true
  find "$DEST" -maxdepth 1 -name '*.md' ! -name 'README.md' -delete || true
fi

# 런타임에 불필요한 dev/test/lock 파일 제거 (rsync 제외가 누락된 경우 방어)
rm -f "$DEST/playwright.config.ts" \
      "$DEST/vitest.config.ts" \
      "$DEST/drizzle.config.ts" \
      "$DEST/postcss.config.mjs" \
      "$DEST/prisma.config.ts" \
      "$DEST/tailwind.config.ts" \
      "$DEST/components.json" \
      "$DEST/package-lock.json" \
      "$DEST/tsconfig.json" \
      "$DEST/next.config.ts"

# ⚠️ 보안: NFT 가 프로젝트 루트의 .env / data / scripts 를 끌어올 수 있음 — 제거
rm -f "$DEST/.env"                      # 실제 시크릿 유출 방지 (.env.production.example 참조)
rm -rf "$DEST/data"                     # 로컬 SQLite 산출물 제거
rm -rf "$DEST/scripts"                  # 프로젝트 스크립트(pack-standalone 등) 제거

# logs 디렉토리 선제 생성 (PM2 로그 경로)
mkdir -p "$DEST/logs"

echo "[3/5] .next/static 복사 (클라이언트 JS/CSS 번들)"
mkdir -p "$DEST/.next"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$ROOT/.next/static/" "$DEST/.next/static/"
else
  rm -rf "$DEST/.next/static"
  cp -a "$ROOT/.next/static" "$DEST/.next/static"
fi

echo "[4/5] public/ 복사 (정적 자산)"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$ROOT/public/" "$DEST/public/"
else
  rm -rf "$DEST/public"
  cp -a "$ROOT/public" "$DEST/public"
fi

echo "[5/5] prisma 마이그레이션 복사 (운영 시 마이그레이션 실행용)"
if [[ -d "$ROOT/prisma/migrations" ]]; then
  mkdir -p "$DEST/prisma"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$ROOT/prisma/migrations/" "$DEST/prisma/migrations/"
  else
    rm -rf "$DEST/prisma/migrations"
    cp -a "$ROOT/prisma/migrations" "$DEST/prisma/migrations"
  fi
  cp "$ROOT/prisma/schema.prisma" "$DEST/prisma/schema.prisma"
fi

# 크기 보고
SIZE=$(du -sh "$DEST" 2>/dev/null | awk '{print $1}')
echo ""
echo "✅ 패키징 완료: $DEST  ($SIZE)"
echo ""
echo "다음 단계:"
echo "  1) WSL/Linux 로 전송:   rsync -av standalone/ <host>:/opt/ypserver/"
echo "  2) 타겟에서 native 교체:  cd /opt/ypserver && bash install-native-linux.sh"
echo "  3) 환경변수 배치:         cp .env.production.example .env && vi .env"
echo "  4) 기동:                 bash start.sh   또는   pm2 start ecosystem.config.cjs"
