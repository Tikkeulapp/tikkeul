#!/usr/bin/env bash
# 팀원 브랜치를 본인 계정 머지 커밋으로 미러링해 Vercel 프리뷰를 만든다 (Hobby 플랜: 팀원 커밋은 배포 차단).
# 사용: scripts/mirror-preview.sh feature/agent-architecture preview/agent
#  → https://tikle-git-<preview-branch>-cau-et.vercel.app
set -euo pipefail
SRC="${1:?팀원 브랜치명 (예: feature/agent-architecture)}"
DST="${2:?프리뷰 브랜치명 (예: preview/agent)}"
cur=$(git branch --show-current)
# 어떤 경로로 끝나도 원래 브랜치로 돌아온다 (실패 시 preview/*에 남아 이후 커밋이 잘못 들어가는 사고 방지)
trap 'git merge --abort >/dev/null 2>&1 || true; git checkout -q "$cur" 2>/dev/null || true' EXIT
git fetch -q origin
git checkout -q -B "$DST" "origin/$SRC"
if ! git merge --no-ff -q origin/main -m "merge: main → $SRC 프리뷰 미러"; then
  echo "❌ 충돌 발생 — 아래 파일을 해결한 뒤 'git commit && git push -f -u origin $DST'"; git diff --name-only --diff-filter=U; exit 1
fi
# 팀원이 이미 main을 머지해 둔 경우 위 머지는 커밋을 만들지 않는다 → 맨 위 커밋 작성자가 팀원이면 Vercel(Hobby)이 배포를 차단.
# 본인 계정 커밋이 항상 맨 위에 오도록 빈 커밋을 하나 얹는다.
if [ "$(git log -1 --format=%ae)" != "$(git config user.email)" ]; then
  git commit -q --allow-empty -m "chore: $SRC 프리뷰 미러 (본인 계정 커밋으로 배포 트리거)"
fi
git push -q -f -u origin "$DST"
echo "✅ pushed $DST ($(git rev-parse --short HEAD)) → https://tikle-git-$(echo "$DST" | tr '/' '-')-cau-et.vercel.app"
