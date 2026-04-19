#!/bin/bash
# SP-018 — symlink atomic swap 검증
# 1000 read 중에 100 swap 을 동시 수행하여 실패율 측정
set -e
TMP=/tmp/sp-018
rm -rf $TMP
mkdir -p $TMP/a $TMP/b
echo "version-a" > $TMP/a/version.txt
echo "version-b" > $TMP/b/version.txt
ln -sfn $TMP/a $TMP/current

# Reader: 1000회 연속 읽기
(for i in $(seq 1 1000); do
  cat $TMP/current/version.txt 2>&1
done) > /tmp/sp018-reads.log &
READER_PID=$!

# Swapper: 100회 symlink 교체 (10ms 간격)
for i in $(seq 1 100); do
  if [ $((i % 2)) -eq 0 ]; then
    TARGET=a
  else
    TARGET=b
  fi
  ln -sfn $TMP/$TARGET $TMP/current
  sleep 0.01
done

wait $READER_PID

FAILS=$(grep -c "No such file" /tmp/sp018-reads.log || true)
TOTAL=$(wc -l < /tmp/sp018-reads.log)
VERSION_A=$(grep -c "version-a" /tmp/sp018-reads.log || true)
VERSION_B=$(grep -c "version-b" /tmp/sp018-reads.log || true)

echo "{\"test\":\"symlink_swap\",\"total_reads\":$TOTAL,\"fails\":$FAILS,\"version_a\":$VERSION_A,\"version_b\":$VERSION_B,\"pass\":$([ $FAILS -lt 10 ] && echo true || echo false)}"
