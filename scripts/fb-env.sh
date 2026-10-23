#!/usr/bin/env bash
# 讀取 Firebase 網址與密鑰，供 workflow 的步驟 source 使用；缺少時明確失敗。
set -euo pipefail

DB="$(jq -r '.firebase.dbUrl // empty' data/config.json)"
if [ -z "$DB" ]; then
  echo "::error::data/config.json 的 firebase.dbUrl 尚未填寫"
  exit 1
fi
if [ -z "${FIREBASE_SECRET:-}" ]; then
  echo "::error::repo secret FIREBASE_SECRET 尚未設定（Settings > Secrets and variables > Actions）"
  exit 1
fi
DB="${DB%/}"
export DB
