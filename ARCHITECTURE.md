# 架構說明

胖寶寶台灣行的程式怎麼分層、資料怎麼流動、哪些地方有限制。**資料格式與產品決策以 [`docs/SPEC.md`](docs/SPEC.md) 為準**（那份是契約），模組介面見 [`docs/MODULES.md`](docs/MODULES.md)，怎麼跟 Howard 合作與固定值見 [`CLAUDE.md`](CLAUDE.md)。本檔描述「現在的樣子」，每次結構有變就一起更新（規則見最後一節）。行號只是指引，請用函式名稱搜尋。

最後更新：2026-10-24（骨架 B 已合併；A 已合併暫存清單與 Places 查詢工具，地點尚未進 `places.json`；D 已開 PR；C、E、F 尚未合併）

## 一句話

一個沒有建置步驟的靜態網站（GitHub Pages 直接發佈 `main`），瀏覽器載入 `data/*.json` 當地點庫，並用 REST／SSE 讀寫 Firebase Realtime Database 上兩人的標記；Claude 與排程工具則在瀏覽器之外，透過 GitHub Actions 讀寫同一份 Firebase。行程推薦由 Claude 產生成 JSON 檔，網站只負責顯示。

```
        手機瀏覽器（阿胖、寶寶）                       GitHub（main，受保護）
   index.html + js/*.js（ES modules） ◄── Pages ──── data/*.json  js/  css/  docs/
        │   │                                         │
        │   └─ REST ──► Places API（評分、營業時間，即時查，不存）
        │
        │  /marks：SSE 串流 ×2        /inbox、/places：輪詢
        ▼
   Firebase Realtime DB  ◄──────── GitHub Actions（read-firebase / write-data / snapshot）
                                           ▲                 │ 備份
                                           │                 ▼
                              雲端的 Claude（GitHub API）   snapshot 分支（live/、backup/）
```

## 模組狀態

| 模組 | 範圍 | 狀態 |
| --- | --- | --- |
| B 骨架與同步 | 外殼、路由、身分、Firebase 連線、CI、workflow | 已合併 |
| A 資料 | `data/places.json` 與補欄位、匯入、地區細項 | 進行中；`regions.json` 已有五大區與 22 縣市，`places.json` 已匯入 Google 清單 392 筆（座標、縣市、`pid` 由 Places 查詢補齊） |
| C 介面 | `css/*.css` | 未開始（`index.html` 已預留 `css/app.css`） |
| D 地圖與地點庫 | `js/map.js`、`js/places.js`、`js/marks.js` | 已完成第一版（PR 待合併）：首頁地圖、地區頁、篩選、地點詳情、標記、兩人對照、點亮台灣；沒有樣式（等 C），只用 `tw-map-`、`tw-place-`、`tw-mark-` 開頭的 class |
| E 收件匣與離線 | `js/inbox.js`、`tools/`、`sw.js` | 未開始，導覽列不顯示 |
| F 行程推薦 | `js/itinerary.js`、`data/itineraries/` | 未開始，導覽列不顯示 |

## 檔案與責任

每個檔案只有一個模組能改（完整歸屬表在 `CLAUDE.md`）。

| 檔案 | 責任 | 模組 |
| --- | --- | --- |
| `index.html` | 外殼容器（頂列、主畫面、底部導覽、身分選擇層）、載入 Leaflet 與 `js/app.js`；不放資料 | B |
| `js/app.js` | 啟動、路由表 `ROUTES`、模組掛載、頂列與導覽、身分選擇 | B |
| `js/state.js` | 單一 store：`get`／`set`／`subscribe`、身分、載入 `data/*.json` | B |
| `js/sync.js` | Firebase REST 與兩條 `/marks` 串流、`setMark`、`marksOf` | B |
| `js/util.js` | `h`（建 DOM）、`clear`、`ymNow`、`debounce`、`loadJson` | B |
| `data/config.json` | 站名、前綴、時區、身分、分類、Firebase 網址、Google 金鑰欄位、地圖預設視角 | A |
| `data/regions.json` | 地區樹：大區 → 縣市 → 區域（含中心點與縮放） | A（契約檔，改動先回報總管） |
| `data/places.json` | 唯一的地點來源 | A |
| `data/staging/import-list.json` | Google 清單匯入的暫存清單（店名、分類、備註、歇業狀態），查到座標前不進 `places.json` | A |
| `tools/places-lookup.mjs`、`.github/workflows/lookup-places.yml` | 用 Places API 查暫存清單的座標、縣市、`pid`，結果存到 `snapshot` 分支的 `lookup/`；需 repo secret `GOOGLE_PLACES_KEY`（經總管同意，這兩檔歸 A） | A |
| `js/map.js` | 首頁：Leaflet 地圖，每縣市一個計數圓點（點亮的縣市變綠），選到縣市後畫出個別地點；下方接篩選與卡片。只畫有 `ll` 的地點，座標更新後自動套用 | D |
| `js/places.js` | 地區頁 `#/r/<id>`（往下一層只列有地點的）、地點詳情 `#/p/<id>`；輸出 `findRegion`、`inRegion`、`countIn`、`placeCard`、`listView`（分類、標記、搜尋篩選，條件換頁保留）；Google 評分與營業時間在 `google.placesKey` 有填時即時查，只放 `sessionStorage` | D |
| `js/marks.js` | `#/compare` 兩人對照四組與點亮台灣；輸出 `markBar`（想去、去過、想再去、年月、星等、心得，寫入走 `sync.setMark`）、`markSummary`、`markCompare`、`statusOf`、`litCounties` | D |
| `css/*.css` | 樣式；模組自己的 class 用前綴（`tw-map-`、`tw-place-`、`tw-mark-`、`tw-inbox-`、`tw-trip-`） | C |
| `js/inbox.js`、`tools/`、`sw.js`、`manifest.webmanifest` | 收件匣、排程查資料工具、離線與加到主畫面 | E |
| `js/itinerary.js`、`data/itineraries/` | 行程顯示與行程資料 | F |
| `scripts/validate.mjs` | 資料格式驗證（CI 守門員，契約檔） | B |
| `scripts/fb-env.sh`、`scripts/snapshot-commit.sh` | workflow 共用：讀資料庫網址與密鑰、提交到 `snapshot` 分支 | B |
| `.github/workflows/` | `ci`、`read-firebase`、`write-data`、`snapshot` | B |
| `firebase-rules.json` | Firebase 規則存檔（契約檔；需 Howard 手動貼到主控台） | B |
| `docs/SPEC.md`、`docs/MODULES.md`、`CLAUDE.md`、`ARCHITECTURE.md` | 規格（契約）、模組介面、工作說明、本檔 | B |

## 前端分層

沒有框架，沒有建置。`index.html` 以 `<script type="module">` 載入 `js/app.js`，其餘模組由路由表按需 `import()`。

1. **外殼（`app.js`）**：頂列顯示站名、連線狀態、目前身分；底部導覽依路由表產生；選身分的對話層。
2. **狀態（`state.js`）**：模組之間唯一的溝通管道。鍵：`config`、`regions`、`places`（未過濾，顯示請用 `store.isVisible(p)`，預設只顯示 `status: open`）、`marks`（`{apong: {…}, baobao: {…}}`，即時更新）、`who`、`route`、`online`、`synced`。
3. **同步（`sync.js`）**：啟動時先一次性讀 `/marks` 當後備，再開兩條 SSE（各一人）；寫入一律走 `setMark`，只能寫目前身分自己那條，先更新畫面，失敗就回復並丟錯。
4. **功能模組（D、E、F）**：各自 `export function mount(el, ctx)`，回傳清理函式。`ctx` 帶 `route`、`store`、`sync`、`navigate`、`h`、`clear`、`config`。檔案不存在或沒有 `mount` 時畫面顯示「尚未完成」，可選模組（E、F）的導覽項目不顯示。

### 路由（網址 hash）

| hash | 載入 | 模組 |
| --- | --- | --- |
| `#/` | `js/map.js` | D |
| `#/r/<regionId>` | `js/places.js` | D |
| `#/p/<placeId>` | `js/places.js` | D |
| `#/compare` | `js/marks.js` | D |
| `#/inbox` | `js/inbox.js` | E |
| `#/trips` | `js/itinerary.js` | F |

新增路由要改 `app.js` 的 `ROUTES`，由 B 處理。

### 啟動順序

`boot()`：讀身分（localStorage `twWho`）→ 畫頂列 → `loadData()` 並行載入三個 json → 設定標題 → `startSync()` → 沒有身分就跳出選擇 → 監聽 `hashchange` → `render()` 掛上目前路由的模組。資料檔缺少時給 `null` 或 `[]`，網站照樣能開；`config.firebase.dbUrl` 沒填就略過連線，維持唯讀瀏覽。

## 資料流

### 地點
`data/places.json` 是唯一來源，隨網站一起發佈，啟動時載入。評分、評論數、營業時間**不存進 repo**（Places 條款限制長期保存，CI 會擋 `rt`、`rv`、`h`、`oh`），打開地點時由瀏覽器向 Places API 即時查詢，結果只放瀏覽器暫存。

### 新增與修正地點
- 初次匯入：Google 地圖清單先放進 `data/staging/import-list.json`（只有店名、分類、備註、歇業標記），由 `lookup-places` 向 Places API 查出座標、縣市、`pid`（Google 查不到座標時才用 OSM 或手動），A 確認後轉成統一格式寫進 `places.json`；「去過」紀錄同樣由 A 轉入。
- 之後新增：網站的收件匣把連結或店名寫到 Firebase `/inbox`；排程工具查好資料後寫入 `/places`（網站輪詢後合併顯示）；Claude 定期把 `/places` 併回 `places.json`（走 PR）並清掉 Firebase 那份。
- 修正地點本身（分類、縣市、備註）：走收件匣的「修正」，由 Claude 確認後改 `places.json`；網站只能改自己的標記。
- 歇業或搬遷：`status` 設為 `closed` 或 `moved`，保留紀錄但預設不顯示、不排進行程。

### Firebase 路徑

| 路徑 | 誰寫 | 內容 |
| --- | --- | --- |
| `/marks/{apong\|baobao}/{placeId}` | 網站（各寫自己那條）、Claude（write-data） | `{want?, been?, again?, ym?, stars?, note?, ts}` |
| `/inbox/{id}` | 網站 | `{text, by, ts, status}` |
| `/places`、`/removed` | 只有排程工具與 write-data | 新增的地點、被移除的地點（定期併回 `places.json`） |
| `/trips/` | 無 | 預留，規則不開放 |

規則存在 `firebase-rules.json`：預設全部不可讀寫，只開放上表的路徑，並檢查欄位型別與大小（星等 1 到 5、心得 ≤ 200 字、`ym` 為 `YYYY-MM`、不允許多餘欄位）。身分只是前端區分，不是安全機制。

### 即時更新與連線數
瀏覽器對同一主機約允許 6 條連線，所以網站只用 2 條 SSE（兩人的 `/marks`），其餘（`/inbox`、`/places`）用輪詢。新增即時路徑前先算連線數。串流連不上時退回一次性讀取。

### 行程推薦
行程由 Claude 在專案裡依想去／去過資料產生，存成 `data/itineraries/<id>.json`，網站只顯示。每個停靠點有 `place` 與 `stayMin`，相鄰兩站之間的 `next` 各自標 `mode`（`drive`、`transit`、`walk`、`bike`）與 `min`，所以一天可以混搭交通方式；不設交通工具與距離上限。`scripts/validate.mjs` 檢查結構、地點存在且為 `open`、每段都有 `mode` 與 `min`。

## Claude 的讀寫橋接

雲端環境通常連不到 Firebase，所以 Claude 透過 GitHub Actions，用 REST，不用 `gh run` 與 GraphQL：

| Workflow | 做什麼 |
| --- | --- |
| `read-firebase.yml` | 輸入 `path`（`marks`、`inbox`、`places`、`removed` 或 `all`），把資料放到 `snapshot` 分支的 `live/`，再從該分支讀回 |
| `write-data.yml` | 輸入 `path`、`expect_ts`、`payload`。只允許約定好的路徑；先備份到 `snapshot` 分支的 `backup/`；現場 `ts` 與 `expect_ts` 不符就拒絕；寫完讀回比對 |
| `lookup-places.yml` | 模組 A 的一次性匯入工具：用 Places API 查暫存清單的縣市、`pid`（不取座標），結果存到 `snapshot` 分支的 `lookup/`（需 repo secret `GOOGLE_PLACES_KEY`） |
| `snapshot.yml` | 每天 03:17（台灣時間）把整個資料庫備份到 `snapshot` 分支，也可手動觸發 |
| `ci.yml` | 每個 PR 與 `main` 推送：資料格式驗證、`node --check`、規則 JSON 檢查、shell 腳本語法 |

`read-firebase` 與 `write-data` 共用 `concurrency: firebase-io`，不會同時跑。

## 協作與發佈

- `main` 受保護，不直接推。每個模組開自己的分支與 PR，CI 全綠、Howard 確認才合併，合併順序由專案聊天的總管決定。
- 推上 `main` 約一分鐘後 Pages 上線。
- 契約檔（`docs/SPEC.md`、`firebase-rules.json`、`scripts/validate.mjs`、`data/regions.json`）要改，先回報總管。

## 金鑰與服務位置

| 項目 | 放哪裡 | 備註 |
| --- | --- | --- |
| Firebase 資料庫網址 | `data/config.json` 的 `firebase.dbUrl` | 公開 |
| Firebase 密鑰 | GitHub Secret `FIREBASE_SECRET` | 由 Howard 自己放進 Settings；不 commit、不印出、不貼聊天 |
| Firebase 規則 | repo 的 `firebase-rules.json` 存檔，主控台才是生效的那份 | 改了要由 Howard 手動貼上 |
| Google Places 金鑰（瀏覽器用） | `data/config.json` 的 `google.placesKey`（公開） | 靠 Google Cloud 限制 API 與來源網址保護；目前尚未填 |
| Google Places 金鑰（匯入工具用） | GitHub Secret `GOOGLE_PLACES_KEY` | 只給 `lookup-places` workflow 用；由 Howard 自己放進 Settings，不 commit、不印出、不貼聊天 |

## 已知限制與取捨

- **資料庫不登入**：任何知道網址的人理論上能在規則允許的範圍內寫入；靠規則限制路徑與格式，並由每日快照還原。
- **身分只是前端區分**：記在瀏覽器 localStorage，不是安全機制。
- **公開資料**：repo 與網站公開，去過只記年月，不放電話、訂位代號與個人資訊。
- **Places 資料不快取在 repo**：離線時看不到評分與營業時間。
- **串流連線數上限**：新增即時路徑前先算。
- **規則要手動貼**：`firebase-rules.json` 與主控台可能不同步，改規則時要確認 Howard 已貼上。

## 維護本檔

- 任何改變結構的 PR 都要在同一個 PR 更新本檔：新增或改名檔案、路由、store 鍵、Firebase 路徑、workflow、金鑰位置、模組狀態。純粹修 bug 或調樣式不用。
- 更新時順手改最上面的「最後更新」與「模組狀態」。
- PR 範本（`.github/pull_request_template.md`）有一項勾選提醒；審查者看到結構有變但沒改本檔，請退回。
- 本檔與 `docs/SPEC.md` 不一致時以 SPEC 為準；發現不一致，先修本檔，若是 SPEC 過時就回報總管。
