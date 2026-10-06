#!/bin/bash
# Bash Guard Hook — PreToolUse[Bash]
# 되돌리기 어려운 명령을 차단한다. 훅 입력은 stdin JSON(.tool_input.command), 차단은 exit 2.

CMD=$(jq -r '.tool_input.command // empty')

if echo "$CMD" | grep -qiE 'rm\s+-(rf|fr)\b|git\s+push\s+(.*\s)?(--force|-f)\b|git\s+reset\s+--hard|drop\s+table'; then
  echo "BLOCKED: 위험한 명령어가 감지되었습니다 — 사용자에게 직접 실행을 요청하세요: $CMD" >&2
  exit 2
fi

# 비밀값 파일을 출력하는 명령 차단 (키가 컨텍스트에 남는다). 스크립트가 내부에서 읽는 건 허용.
if echo "$CMD" | grep -qE '\b(cat|head|tail|less|more|grep|sed|awk|bat|xxd|strings)\b[^|;&]*(^|[[:space:]"'"'"'/])\.env(\.local)?([[:space:]"'"'"']|$)'; then
  echo "BLOCKED: .env 파일 내용 출력은 금지 — 필요한 키 이름만 .env.example에서 확인하세요." >&2
  exit 2
fi

exit 0
