#!/bin/bash
# Bash Guard Hook — PreToolUse[Bash]
# 되돌리기 어려운 명령을 차단한다. 훅 입력은 stdin JSON(.tool_input.command), 차단은 exit 2.

CMD=$(jq -r '.tool_input.command // empty')

if echo "$CMD" | grep -qiE 'rm\s+-(rf|fr)\b|git\s+push\s+(.*\s)?(--force|-f)\b|git\s+reset\s+--hard|drop\s+table'; then
  echo "BLOCKED: 위험한 명령어가 감지되었습니다 — 사용자에게 직접 실행을 요청하세요: $CMD" >&2
  exit 2
fi

exit 0
