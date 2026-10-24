# 胖寶寶台灣行（Taiwan-trips）

阿胖和寶寶兩個人用的公開網站（手機優先）：全台地點庫，依地區瀏覽，兩人各自標記想去／去過。完整規格見 [`docs/SPEC.md`](docs/SPEC.md)，**那份是契約，與本檔不一致時以它為準**；要改格式，先改 SPEC 並回報總管，再改程式。

## 給 Claude 的規則

- 用**繁體中文**回覆，結論先行，細節放表格。
- 要使用者選的，一律用**可點選的選擇題並附推薦**，不要用文字編號題。
- 涉及檔案或多步驟任務，先用選擇題釐清再動手；使用者說「執行」、「全部都做」才直接做。
- 只在被要求時 commit 與 push。
- **`main` 受保護，不直接推。** 每個模組開自己的分支與 PR，CI 全綠、Howard 確認才合併；合併順序由專案聊天的總管決定。推送前先 `git pull --rebase`。
- 電話、訂位代號、個人資訊不放進公開網站或 repo；去過只記年月（`YYYY-MM`）。
- 金鑰（`FIREBASE_SECRET`、Google 金鑰）不貼聊天、不 commit、不印出；`FIREBASE_SECRET` 由 Howard 自己放進 repo Settings > Secrets and variables > Actions。
- 回報「誰標了想去」之前，先重新讀取最新的 Firebase 資料。
- **結構有變就更新 [`ARCHITECTURE.md`](ARCHITECTURE.md)**：新增或改名檔案、路由、store 鍵、Firebase 路徑、workflow、金鑰位置、模組狀態，都在同一個 PR 一起改；它描述「現在的樣子」，與 `docs/SPEC.md` 不一致時以 SPEC 為準。

## 固定值

| 項目 | 值 |
|---|---|
| 站名 | 胖寶寶台灣行 |
| 前綴 | `tw`（localStorage `twWho`、快取 `tw-v1`） |
| 時區 | `Asia/Taipei` |
| 身分 | `apong`（阿胖）、`baobao`（寶寶）；只有這兩個，不登入 |
| 分類 | 景點、美食、小吃夜市、咖啡甜點、溫泉、住宿、購物市集 |
| 大區 | `north`、`central`、`south`、`east`、`island`（22 縣市，宜蘭暫歸東部） |

## 檔案歸屬

每個檔案只有一個模組能改。契約檔：`docs/SPEC.md`、`firebase-rules.json`、`scripts/validate.mjs`、`data/regions.json`，要改先回報總管。

| 模組 | 檔案 |
|---|---|
| A 資料 | `data/*.json`、`data/geo/`、`data/staging/`、`tools/places-lookup.mjs`、`.github/workflows/lookup-places.yml` |
| B 骨架與同步 | `index.html`、`js/app.js`、`js/state.js`、`js/sync.js`、`js/util.js`、`scripts/`、`.github/`、`firebase-rules.json`、`docs/`、`CLAUDE.md`、`ARCHITECTURE.md`（各模組改到自己的部分時要在同一個 PR 更新） |
| C 介面 | `css/*.css` |
| D 地圖與地點庫 | `js/map.js`、`js/places.js`、`js/marks.js` |
| E 收件匣與離線 | `js/inbox.js`、`tools/`、`sw.js`、`manifest.webmanifest` |
| F 行程推薦 | `js/itinerary.js`、`data/itineraries/` |

## 資料契約（摘要）

- `data/places.json` 是唯一的地點來源。欄位：`id`（永不改名）、`n`、`c`、`c2`（最多 2 個，選填）、`region`（最底層地區 id）、`a`、`ll`（`[緯度, 經度]`，可取自 Google Places，Howard 已知條款風險後決定）、`llsrc`（`google|osm|manual`）、`pid`、`gurl`、`note`、`src`、`status`（`open|closed|moved`，預設只顯示 `open`）。
- **不存** Google 的評分、評論數、營業時間（`rt`、`rv`、`h`、`oh`），Places 條款限制長期保存；網站打開地點時即時查詢，只放瀏覽器暫存。CI 會擋。
- 地區 id 格式 `{大區}-{縣市}-{區域}`，英文小寫；定義在 `data/regions.json`。
- Firebase：`/marks/{apong|baobao}/{placeId}`（網站可寫）、`/inbox/{id}`（網站可寫）、`/places`、`/removed`（只有 write-data）、`/trips/`（預留，不開放）。規則在 `firebase-rules.json`，需 Howard 手動貼到主控台。
- 地點本身的修正走收件匣，由 Claude 確認後改 `places.json`；網站只改自己的標記。
- 行程存 `data/itineraries/<id>.json`；每段 `next` 各自標 `mode`（`drive|transit|walk|bike`）與 `min`。

## 指令

```sh
node scripts/validate.mjs        # 格式驗證（CI 守門員）
node --check js/<file>.js        # 每個改過的腳本都要檢查
```

CI（`.github/workflows/ci.yml`）在每個 PR 與 `main` 推送時跑驗證與語法檢查，PR 必須全綠才能合併。

## Claude 讀寫 Firebase（GitHub Actions 橋接）

雲端環境通常連不到 Firebase 與 github.io，所以走 Actions，用 REST，不用 `gh run` 與 GraphQL：

- **讀**：`read-firebase.yml`（輸入 `path`：`marks`、`inbox`、`places`、`removed` 或 `all`）把資料放到 `snapshot` 分支的 `live/`，再從該分支讀回。
- **寫**：`write-data.yml`（輸入 `path`、`expect_ts`、`payload`）。先備份到 `snapshot` 分支的 `backup/`，現場的 `ts` 與 `expect_ts` 不符就拒絕，寫完讀回比對。同一件事的改動先合併，一次寫入。
- **快照**：`snapshot.yml` 每天把整個資料庫備份到 `snapshot` 分支，也可手動觸發。
- **匯入查詢**（模組 A）：`lookup-places.yml`（輸入 `offset`、`limit`）用 Places API 查 `data/staging/import-list.json` 的座標、縣市、`pid`，結果存到 `snapshot` 分支的 `lookup/`；需 repo secret `GOOGLE_PLACES_KEY`。
- 需要 repo secret `FIREBASE_SECRET`；資料庫網址讀自 `data/config.json` 的 `firebase.dbUrl`，沒填就會明確失敗。

## 安全修改程序

- 用小型修補腳本替換精確字串並斷言命中次數；改完用 `node --check`。
- 刪程式前列出它定義的所有識別字，grep 確認沒有其他地方在用。
- 測試標記寫入時，把 `window.fetch` 對 `/marks/` 的寫入換成假的，避免動到真資料。
- Leaflet 要先設定地圖視角，再加標記；讀文字用 `textContent`，不要 `innerHTML` 塞使用者輸入。
- 新增同網域檔案要加進 `sw.js` 的 `SHELL`，改了快取規則把版本號加一。
- commit 訊息依環境指示加上 Claude 的共同作者行。

## 開放項目

見 `docs/SPEC.md`「開放問題」與「上線前清單」。基礎設施（repo、Pages、Firebase 專案與規則、`FIREBASE_SECRET`、`firebase.dbUrl`）已完成。尚待 Howard 確認的項目：repo secret `GOOGLE_PLACES_KEY`（匯入查詢用）是否已設定，以及 `data/config.json` 的 `google.placesKey`（瀏覽器用，需限制 API 與來源網址）。
