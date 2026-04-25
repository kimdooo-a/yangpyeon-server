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

# 기동 헬퍼(start.sh / README.md / ecosystem.config.cjs / install-native-linux.sh /
# .env.production.example)는 Git 에 커밋되어 standalone/ 안에 상존하지만,
# 이후 rsync(--delete-excluded) 가 source(.next/standalone/) 에 없는 파일을 삭제하므로
# 임시 디렉토리로 백업 → 패키징 후 복원한다.
HELPERS=(start.sh README.md ecosystem.config.cjs .env.production.example install-native-linux.sh)
TMP_HELPERS="$(mktemp -d -t standalone-helpers.XXXXXX)"
trap 'rm -rf "$TMP_HELPERS"' EXIT

echo "[1/5] 기존 standalone/ 정리 (헬퍼 백업 후 클린)"
# 첫 빌드(WSL clone 등)에서 standalone/ 자체가 없으면 find 가 실패하므로 선제 생성.
mkdir -p "$DEST"
for f in "${HELPERS[@]}"; do
  [[ -f "$DEST/$f" ]] && cp -p "$DEST/$f" "$TMP_HELPERS/"
done
find "$DEST" -mindepth 1 -maxdepth 1 -exec rm -rf {} +

echo "[2/5] .next/standalone/* 복사 (server.js + NFT 추적 node_modules)"
# cp -a 대신 rsync 권장 (더 큰 프로젝트에서 빠름). rsync 없을 시 cp fallback.
# 주의 — `/standalone/` exclude:
#   NFT 가 프로젝트 루트의 standalone/ 디렉토리를 재귀적으로 트레이스하여
#   `.next/standalone/standalone/` 이 생성되는 부작용이 있다. 이를 그대로 옮기면
#   매 빌드마다 한 단계씩 깊어지는 nested 디렉토리가 누적되므로 차단한다.
#   leading slash(`/`) 는 source root 기준 anchor 라 top-level 만 제외한다.
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
    --exclude='/standalone/' \
    "$SRC/" "$DEST/"
else
  cp -a "$SRC/." "$DEST/"
  # rsync 없을 때 수동 제거 (실패해도 무시)
  rm -rf "$DEST/docs" "$DEST/spikes" "$DEST/.playwright-mcp" "$DEST/tsconfig.tsbuildinfo" "$DEST/standalone" || true
  find "$DEST" -maxdepth 1 -name '*.png' -delete || true
  find "$DEST" -maxdepth 1 -name '*.md' -delete || true
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

# 헬퍼 복원 — 정적/공개 자산 복사 전 시점이라면 어디든 OK
echo "  ↳ 기동 헬퍼 복원 ($DEST)"
for f in "${HELPERS[@]}"; do
  if [[ -f "$TMP_HELPERS/$f" ]]; then
    cp -p "$TMP_HELPERS/$f" "$DEST/$f"
  fi
done

echo "[5/5] prisma + drizzle 마이그레이션 복사 (운영 시 마이그레이션 실행용)"
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

# Drizzle (SQLite) 마이그레이션 — instrumentation.ts 의 applyPendingMigrations() 가
# 우선 탐색하는 경로 `db-migrations/` 로 복사. ADR-021 self-heal 안전망.
if [[ -d "$ROOT/src/lib/db/migrations" ]]; then
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$ROOT/src/lib/db/migrations/" "$DEST/db-migrations/"
  else
    rm -rf "$DEST/db-migrations"
    cp -a "$ROOT/src/lib/db/migrations" "$DEST/db-migrations"
  fi
  echo "  ↳ drizzle migrations → $DEST/db-migrations/"
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
