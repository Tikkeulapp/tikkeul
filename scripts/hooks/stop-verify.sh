#!/bin/bash
# Stop Verify Hook — Stop
# 응답 종료 시 src/ 변경이 있으면 lint·typecheck·test를 돌린다.
# 실패하면 exit 2로 Claude에게 결과를 돌려줘 스스로 고치게 한다.
# 빌드는 PR의 Vercel 프리뷰가 검증하므로 여기선 생략.

INPUT=$(cat)

# 이미 Stop 훅 때문에 이어서 작업 중이면 한 번 더 막지 않는다 (무한 루프 방지)
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active // false')" = "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" || exit 0

# src/ 변경이 없으면(질문·문서 작업 등) 검증 생략
if [ -z "$(git status --porcelain -- src)" ]; then
  exit 0
fi

for TASK in lint typecheck test; do
  if ! OUT=$(npm run "$TASK" 2>&1); then
    echo "STOP VERIFY: npm run $TASK 실패 — 수정 후 종료하세요." >&2
    echo "$OUT" | tail -40 >&2
    exit 2
  fi
done

exit 0
