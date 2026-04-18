#!/usr/bin/env bash
# Cloudflare Tunnel 안정성 측정 v2 (세션 25-C 보정)
# v1 문제점: / 는 미로그인 시 307 리다이렉트 → 25-A 프로토콜 "200 비율"로는 redirect도 fail로 잡힘
# v2: /login (200 정적 페이지) 호출 + "edge→connector 도달 성공" 기준 = 2xx/3xx/4xx 성공, 5xx 및 curl error 실패
set -u
HOST=${1:-https://stylelucky4u.com/login}
TRIALS=${2:-14}
INTERVAL=${3:-5}
echo "=== Tunnel stability v2: $HOST, $TRIALS trials, ${INTERVAL}s interval ==="
echo "=== Success = edge→connector reach (HTTP 2xx/3xx/4xx). Fail = 5xx or curl error ==="
ok=0
fail=0
for i in $(seq -w 1 "$TRIALS"); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$HOST")
  [ -z "$code" ] && code='ERR'
  ts=$(date +%H:%M:%S)
  case "$code" in
    2??|3??|4??) ok=$((ok+1)); status='OK' ;;
    *)           fail=$((fail+1)); status='FAIL' ;;
  esac
  printf '[%s] %s code=%-4s %s ok=%-2d fail=%d\n' "$i" "$ts" "$code" "$status" "$ok" "$fail"
  [ "$i" = "$TRIALS" ] || sleep "$INTERVAL"
done
echo
echo "SUMMARY ok=$ok fail=$fail total=$TRIALS ratio=$((ok*100/TRIALS))%"
