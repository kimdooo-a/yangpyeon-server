#!/bin/bash
# SessionStart hook - 세션 시작 시 프로젝트 컨텍스트 자동 로드
# current.md + 최신 handover 파일 내용을 Claude에게 전달

OUTPUT=""

# 1. current.md 로드
if [ -f "docs/status/current.md" ]; then
  CURRENT=$(cat "docs/status/current.md")
  OUTPUT="${OUTPUT}## 현재 프로젝트 상태\n\n${CURRENT}\n\n"
fi

# 2. 최신 handover 파일 로드
LATEST_HANDOVER=$(ls -t docs/handover/2*.md 2>/dev/null | head -1)
if [ -n "$LATEST_HANDOVER" ]; then
  HANDOVER=$(cat "$LATEST_HANDOVER")
  OUTPUT="${OUTPUT}## 최신 인수인계 ($(basename "$LATEST_HANDOVER"))\n\n${HANDOVER}\n\n"
fi

# 3. next-dev-prompt.md 로드
if [ -f "docs/handover/next-dev-prompt.md" ]; then
  NEXT_PROMPT=$(cat "docs/handover/next-dev-prompt.md")
  OUTPUT="${OUTPUT}## 다음 개발 프롬프트\n\n${NEXT_PROMPT}\n\n"
fi

# JSON으로 출력 (content 필드에 컨텍스트 주입)
if [ -n "$OUTPUT" ]; then
  # JSON-safe 이스케이프
  ESCAPED=$(echo -e "$OUTPUT" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo "\"$OUTPUT\"")
  echo "{\"content\": ${ESCAPED}}"
fi

exit 0
