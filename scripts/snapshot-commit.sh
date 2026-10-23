#!/usr/bin/env bash
# 把一個資料夾的內容 commit 到 snapshot 分支（孤立分支，不含網站程式）。
# 用法：scripts/snapshot-commit.sh <來源資料夾> <commit 訊息>
set -euo pipefail

src="$1"
msg="$2"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

wt="$(mktemp -d)"
if git ls-remote --exit-code --heads origin snapshot >/dev/null 2>&1; then
  git fetch --no-tags origin snapshot
  git worktree add "$wt" -B snapshot origin/snapshot
else
  git worktree add --detach "$wt"
  (cd "$wt" && git checkout --orphan snapshot && git rm -rf . >/dev/null 2>&1 || true)
fi

cp -R "$src"/. "$wt"/
cd "$wt"
git add -A
if git diff --cached --quiet; then
  echo "snapshot 沒有變動"
  exit 0
fi
git commit -m "$msg"

for attempt in 1 2 3; do
  if git push origin snapshot; then
    exit 0
  fi
  git pull --rebase origin snapshot
done
echo "::error::推送 snapshot 分支失敗"
exit 1
