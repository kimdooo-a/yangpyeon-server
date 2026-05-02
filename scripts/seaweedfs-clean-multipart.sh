#!/usr/bin/env bash
#
# SeaweedFS multipart upload cleanup — S78-B/H 부채 해소 (S82, 2026-05-02).
#
# 24h 이상 미완료 multipart upload 회수. weed shell 의 s3.clean.uploads
# 명령을 1회 호출하고 결과를 ~/logs/seaweedfs-clean.log 에 누적 기록.
#
# 호출:
#   ./seaweedfs-clean-multipart.sh           # 24h timeAgo (기본)
#   ./seaweedfs-clean-multipart.sh 12h       # 12h timeAgo (수동 정리 시)
#
# crontab (주 1회 일요일 KST 04:00):
#   0 4 * * 0 /home/smart/scripts/seaweedfs-clean-multipart.sh >> /home/smart/logs/seaweedfs-clean.log 2>&1
set -euo pipefail

TIME_AGO="${1:-24h}"
LOG_DIR="${HOME}/logs"
WEED_BIN="${HOME}/bin/weed"

mkdir -p "${LOG_DIR}"

if [[ ! -x "${WEED_BIN}" ]]; then
  echo "[$(date -Iseconds)] ERROR: weed not found at ${WEED_BIN}" >&2
  exit 2
fi

echo "[$(date -Iseconds)] === s3.clean.uploads -timeAgo=${TIME_AGO} ==="
echo "s3.clean.uploads -timeAgo=${TIME_AGO}" | "${WEED_BIN}" shell 2>&1
echo "[$(date -Iseconds)] === done ==="
