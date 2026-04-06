#!/bin/bash
# .env, .env.local 등 환경변수 파일 커밋 방지 hook
# PreToolUse(Bash) 에서 실행됨
# 입력: $1 = tool input (command string)

TOOL_INPUT="$1"

# git add 명령에서 .env 파일 포함 여부 확인
if echo "$TOOL_INPUT" | grep -qE 'git\s+add.*\.env'; then
  # JSON 형식으로 차단 메시지 출력
  cat <<'EOF'
{
  "decision": "block",
  "reason": "🚫 .env 파일은 커밋할 수 없습니다. .gitignore에 추가하세요."
}
EOF
  exit 2
fi

# git commit -a 등으로 .env가 staged 상태인지 확인
if echo "$TOOL_INPUT" | grep -qE 'git\s+commit'; then
  # staged 파일 중 .env 확인
  STAGED_ENV=$(git diff --cached --name-only 2>/dev/null | grep -E '\.env(\.local|\.production|\.development)?$' || true)
  if [ -n "$STAGED_ENV" ]; then
    cat <<EOF
{
  "decision": "block",
  "reason": "🚫 staged 파일에 환경변수 파일이 포함되어 있습니다: ${STAGED_ENV}. git reset HEAD <file>로 제거하세요."
}
EOF
    exit 2
  fi
fi

exit 0
