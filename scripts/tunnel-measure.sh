#!/usr/bin/env bash
# 세션 25-C — Cloudflare Tunnel 안정성 14-trial 측정 (5s 간격, 10s timeout)
# 세션 25-A 동일 프로토콜. 기대: sysctl 적용 후 ~50% → 개선 여부 확인
set -u
HOST=${1:-https://stylelucky4u.com}
TRIALS=${2:-14}
INTERVAL=${3:-5}
echo "=== Tunnel stability test: $HOST, $TRIALS trials, ${INTERVAL}s interval ==="
ok=0
fail=0
for i in $(seq -w 1 "$TRIALS"); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$HOST")
  [ -z "$code" ] && code='ERR'
  ts=$(date +%H:%M:%S)
  if [ "$code" = "200" ]; then
    ok=$((ok+1))
  else
    fail=$((fail+1))
  fi
  printf '[%s] %s code=%-4s ok=%-2d fail=%d\n' "$i" "$ts" "$code" "$ok" "$fail"
  [ "$i" = "$TRIALS" ] || sleep "$INTERVAL"
done
echo
echo "SUMMARY ok=$ok fail=$fail total=$TRIALS ratio=$((ok*100/TRIALS))%"
