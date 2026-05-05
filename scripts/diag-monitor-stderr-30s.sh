#!/usr/bin/env bash
set -euo pipefail
LOG="$HOME/ypserver/logs/ypserver-err.log"

echo "=== before snapshot ==="
LINES_BEFORE=$(wc -l < "$LOG")
echo "lines: $LINES_BEFORE"
echo

echo "=== watching 30s ==="
sleep 30
LINES_AFTER=$(wc -l < "$LOG")
NEW_LINES=$((LINES_AFTER - LINES_BEFORE))
echo "new stderr lines in 30s: $NEW_LINES"

if [[ $NEW_LINES -gt 0 ]]; then
  COUNT_42501=$(tail -n $NEW_LINES "$LOG" | grep -cE "permission denied|42501" || true)
  echo "of which 42501 errors: $COUNT_42501"
  echo
  echo "--- last $NEW_LINES lines ---"
  tail -n "$NEW_LINES" "$LOG"
else
  echo "no new stderr lines — clean."
fi
