#!/bin/bash
# PostToolUse(Write|Edit) 후 자동 코드 포맷팅 hook
# 변경된 파일에 prettier/eslint 자동 실행
# 입력: $1 = tool input JSON (file_path 포함)

TOOL_INPUT="$1"

# tool input에서 파일 경로 추출
FILE_PATH=$(echo "$TOOL_INPUT" | grep -oP '"file_path"\s*:\s*"([^"]+)"' | sed 's/"file_path"\s*:\s*"//;s/"$//' || true)

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# 파일 확장자 확인
EXT="${FILE_PATH##*.}"

# JS/TS/JSX/TSX/CSS/JSON/MD 파일만 포맷
case "$EXT" in
  js|jsx|ts|tsx|css|scss|json|md|mdx|html|vue|svelte)
    # prettier가 있으면 실행
    if command -v npx &> /dev/null && [ -f "node_modules/.bin/prettier" ]; then
      npx prettier --write "$FILE_PATH" 2>/dev/null
    fi

    # eslint가 있으면 fix 실행 (JS/TS 계열만)
    case "$EXT" in
      js|jsx|ts|tsx)
        if command -v npx &> /dev/null && [ -f "node_modules/.bin/eslint" ]; then
          npx eslint --fix "$FILE_PATH" 2>/dev/null || true
        fi
        ;;
    esac
    ;;
  py)
    # Python: ruff 또는 black
    if command -v ruff &> /dev/null; then
      ruff format "$FILE_PATH" 2>/dev/null
      ruff check --fix "$FILE_PATH" 2>/dev/null || true
    elif command -v black &> /dev/null; then
      black "$FILE_PATH" 2>/dev/null
    fi
    ;;
esac

exit 0
