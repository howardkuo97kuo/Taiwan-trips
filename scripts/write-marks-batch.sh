#!/usr/bin/env bash
# 批次合併寫入 /marks/{apong|baobao}：備份現場、驗證每筆格式、PATCH、讀回比對。
# 用法：scripts/write-marks-batch.sh <payload.json> <skip|overwrite> <備份資料夾>
# payload 形狀：{ "apong": {placeId: mark}, "baobao": {…} }（可只有一人）
# 需要環境變數 DB、FIREBASE_SECRET（workflow 先 source scripts/fb-env.sh）。
# skip：現場已有的 placeId 一律不動（預設，避免蓋掉網站上的標記）；overwrite：整筆取代。
set -euo pipefail

payload="$1"
mode="$2"
backup_dir="$3"
work="$(mktemp -d)"

case "$mode" in skip|overwrite) ;; *) echo "::error::mode 必須是 skip 或 overwrite"; exit 1 ;; esac

# 形狀與欄位驗證（對應 firebase-rules.json）
jq -e '
  type == "object" and (keys | all(. == "apong" or . == "baobao")) and (keys | length > 0)
  and ([.[] | to_entries[]] | all(
    (.key | test("^[A-Za-z0-9_-]+$")) and
    (.value | type == "object" and (.ts | type == "number")
      and (keys | all(IN("want","been","again","ym","stars","like","good","avoid","note","ts")))
      and ((.want // false) | type == "boolean") and ((.been // false) | type == "boolean") and ((.again // false) | type == "boolean")
      and ((.ym // "0000-01") | type == "string" and test("^[0-9]{4}-(0[1-9]|1[0-2])$"))
      and ((.stars // 1) | type == "number" and . >= 1 and . <= 5 and . == floor)
      and ((.like // "love") | IN("love","ok","meh"))
      and ((.good // "") | type == "string" and length <= 300)
      and ((.avoid // "") | type == "string" and length <= 300)
      and ((.note // "") | type == "string" and length <= 200))
  ))
' "$payload" > /dev/null || { echo "::error::payload 格式不符（只能有 apong／baobao，每筆欄位須符合 firebase-rules.json）"; exit 1; }

mkdir -p "$backup_dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
for who in $(jq -r 'keys[]' "$payload"); do
  url="$DB/marks/$who.json?auth=$FIREBASE_SECRET"
  curl -fsS --max-time 60 "$url" | jq -S . > "$work/live-$who.json"
  cp "$work/live-$who.json" "$backup_dir/$stamp-marks_$who.json"

  # 決定實際要寫的內容
  if [ "$mode" = skip ]; then
    WHO=$who jq -S --slurpfile live "$work/live-$who.json" \
      '.[env.WHO] | with_entries(select(.key as $k | (($live[0] // {}) | has($k)) | not))' "$payload" > "$work/write-$who.json"
  else
    WHO=$who jq -S '.[env.WHO]' "$payload" > "$work/write-$who.json"
  fi
  n="$(jq 'length' "$work/write-$who.json")"
  echo "$who：payload $(WHO=$who jq '.[env.WHO] | length' "$payload") 筆，實際寫入 $n 筆（mode=$mode）"
  [ "$n" -gt 0 ] || continue

  curl -fsS --max-time 120 -X PATCH -H 'Content-Type: application/json' --data @"$work/write-$who.json" "$url" > /dev/null

  # 讀回：寫入的每筆都要一致，原有的其他筆不能變
  curl -fsS --max-time 60 "$url" | jq -S . > "$work/after-$who.json"
  jq -S --slurpfile w "$work/write-$who.json" --slurpfile before "$work/live-$who.json" -n \
    --slurpfile after "$work/after-$who.json" '
      ($before[0] // {}) as $b | ($after[0] // {}) as $a | $w[0] as $w
      | ($b * {} | with_entries(select(.key as $k | ($w | has($k)) | not))) as $untouched
      | ($w | to_entries | all(. as $e | $a[$e.key] == $e.value))
        and ($untouched | to_entries | all(. as $e | $a[$e.key] == $e.value))' > "$work/ok-$who.json"
  if [ "$(cat "$work/ok-$who.json")" != true ]; then
    echo "::error::$who 讀回的資料與寫入的不一致"
    exit 1
  fi
  echo "$who：已寫入 $n 筆並讀回確認"
done
