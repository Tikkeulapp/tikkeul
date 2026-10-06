#!/bin/bash
# TDD Guard Hook — PreToolUse[Edit|Write]
# src/lib/ 구현 파일을 작성하려 할 때, 같은 폴더에 테스트 파일이 먼저 있는지 체크.
# 대상을 src/lib/로 한정하는 이유: 금액·날짜·자격 판정을 정하는 순수 함수가 모이는 곳이라
# TDD가 가장 의미 있고, 컴포넌트·라우트·서비스(I/O)는 유닛 테스트 강제 시 마찰만 크다.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

case "$FILE_PATH" in
  */src/lib/*.ts|*/src/lib/*.tsx) ;;
  *) exit 0 ;;
esac

# 테스트 파일 자체를 수정하는 건 허용
case "$FILE_PATH" in
  *.test.*|*.spec.*) exit 0 ;;
esac

DIR=$(dirname "$FILE_PATH")
BASENAME=$(basename "$FILE_PATH" | sed -E 's/\.(ts|tsx)$//')

for EXT in ts tsx; do
  if [ -f "${DIR}/${BASENAME}.test.${EXT}" ]; then
    exit 0
  fi
done

cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "TDD GUARD: '${BASENAME}'에 대한 테스트 파일이 존재하지 않습니다. 구현 코드를 작성하기 전에 테스트를 먼저 작성하세요. (테스트 파일 예: ${DIR}/${BASENAME}.test.ts)"
  }
}
EOF
exit 0
