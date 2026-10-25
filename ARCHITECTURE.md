# 架構說明

胖寶寶台灣行的程式怎麼分層、資料怎麼流動、哪些地方有限制。**資料格式與產品決策以 [`docs/SPEC.md`](docs/SPEC.md) 為準**（那份是契約），模組介面見 [`docs/MODULES.md`](docs/MODULES.md)，怎麼跟 Howard 合作與固定值見 [`CLAUDE.md`](CLAUDE.md)。本檔描述「現在的樣子」，每次結構有變就一起更新（規則見最後一節）。行號只是指引，請用函式名稱搜尋。

最後更新：2026-10-24（刪除 `sync.js` 沒人用的 `marksOf`、`stopSync`、`isConfigured`；刪除已匯入的 `data/staging/visited-*.json`；清單加「現在營業」篩選與評分排序；地區樹補上 75 個區域（由地址推出，`regions.json` 的 `districts`）；收件匣規則改為只能新增；文件對齊現況；直覺性調整：導覽加圖示並把「收件匣」顯示為「新增地點」，身分鈕顯示「我是○○」，首次進站有三步說明；路由與檔案不變；B、C、D 已合併：樣式「環島郵路」完成，風格小樣已移除，已用真實標記資料驗證；A 資料進行中；E 收件匣與離線已合併；F 尚未開始）

## 一句話

一個沒有建置步驟的靜態網站（GitHub Pages 直接發佈 `main`），瀏覽器載入 `data/*.json` 當地點庫，並用 REST／SSE 讀寫 Firebase Realtime Database 上兩人的標記；Claude 與排程工具則在瀏覽器之外，透過 GitHub Actions 讀寫同一份 Firebase。行程推薦由 Claude 產生成 JSON 檔，網站只負責顯示。

```
        瀏覽器（阿胖、寶寶）                       GitHub（main，受保護）
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
| A 資料 | `data/places.json` 與補欄位、匯入、地區細項 | 進行中；`regions.json` 已有五大區與 22 縣市，`places.json` 已匯入 Google 清單 395 筆與去過紀錄 127 筆（共 522 筆；座標、縣市、`pid` 由 Places 查詢補齊，座標標 `llsrc: google`）；暫存清單的 `q` 欄位可指定查詢字串，去過的標記（`been`、年月、心得、喜歡程度）已寫入 Firebase，暫存檔 `visited-*.json` 已刪除（git 歷史找得回） |
| C 介面 | `css/*.css` | 已完成：設計變數、外殼、首頁、清單、標記樣式（`tokens.css`、`app.css`、`home.css`、`places.css`、`marks.css`），手機與電腦版、深淺色已驗證；E、F 模組上線時再補 `tw-inbox-`、`tw-trip-` 樣式 |
| D 地圖與地點庫 | `js/map.js`、`js/places.js`、`js/marks.js` | 已完成並驗證（真實資料：522 筆地點皆有 `ll` 且落在台灣，兩人各 127 筆去過，點亮 10／22 縣市）：首頁地圖、地區頁、篩選、地點詳情、標記、兩人對照、點亮台灣；樣式由 C 的 `css/home.css`、`places.css`、`marks.css` 提供；只用 `tw-map-`、`tw-place-`、`tw-mark-` 開頭的 class |
| E 收件匣與離線 | `js/inbox.js`、`tools/`、`sw.js`、`manifest.webmanifest` | 第一版已合併：收件匣頁、離線補送、Service Worker、加到主畫面、收件匣轉查詢清單與上架工具；`index.html`、`js/app.js` 各加了幾行接線（B 的檔案，已在 PR 說明） |
| F 行程推薦 | `js/itinerary.js`、`data/itineraries/` | 未開始，導覽列不顯示 |

## 檔案與責任

每個檔案只有一個模組能改（完整歸屬表在 `CLAUDE.md`）。

| 檔案 | 責任 | 模組 |
| --- | --- | --- |
| `index.html` | 外殼容器（`.tw-top` 包住頂列與導覽：桌面捲動時縮成一排固定在上方，靠 `app.js` 在 body 加 `is-stuck`；手機導覽固定在底部、頂列縮成一列（站名、同步圓點、⚙、身分；動畫與深色收進 ⚙ 面板，`app.js` 的 `prefsOpen`）；主畫面、身分選擇層）、載入 Leaflet 與 `js/app.js`；不放資料 | B |
| `js/app.js` | 啟動、路由表 `ROUTES`、模組掛載、頂列（同步狀態、動畫與深淺色按鈕）與導覽、身分選擇 | B |
| `js/prefs.js` | 深淺色（localStorage `twTheme`）、動畫開關（`twMotion`，預設跟系統的減少動態，`?motion=on` 可覆蓋）、背景照片的視差與遮罩 | B |
| `js/state.js` | 單一 store：`get`／`set`／`subscribe`、身分、載入 `data/*.json` | B |
| `js/sync.js` | Firebase REST 與兩條 `/marks` 串流、`setMark` | B |
| `js/util.js` | `h`（建 DOM）、`clear`、`ymNow`、`debounce`、`loadJson` | B |
| `data/config.json` | 站名、前綴、時區、身分、分類、Firebase 網址、Google 金鑰欄位、地圖預設視角 | A |
| `data/regions.json` | 地區樹：大區 → 縣市 → 區域（含中心點與縮放） | A（契約檔，改動先回報總管） |
| `data/places.json` | 唯一的地點來源 | A |
| `data/geo/counties.json` | 22 縣市邊界（GeoJSON FeatureCollection，已簡化約 150 KB）；每個 feature 的 `properties.id` 對應 `regions.json` 的縣市 id，`n` 為縣市名；給首頁地圖點亮台灣用 | A |
| `data/staging/import-list.json` | Google 清單匯入的暫存清單（店名、分類、備註、歇業狀態），查到座標前不進 `places.json` | A |
| `tools/places-lookup.mjs`、`.github/workflows/lookup-places.yml` | 用 Places API 查暫存清單的座標、縣市、`pid`，結果存到 `snapshot` 分支的 `lookup/`；需 repo secret `GOOGLE_PLACES_KEY`（經總管同意，這兩檔歸 A） | A |
| `js/map.js` | 首頁「環島郵路」：最上面一條「快速選擇」橫幅（顯示目前身分還有幾個地點沒表態，連到 `#/quick`；沒選身分時改成「選身分」），窄螢幕時地圖排在最前面；用 `data/geo/counties.json` 的真實縣市邊界畫成 SVG，橘線繞一圈串起各縣市，泡泡大小是地點數，去過的縣市蓋郵戳（紅雙圈、邊界塗色），金色小牌是雙人票數；選到縣市後下方出現 Leaflet 縣市地圖（個別地點）與篩選、列表；地圖只畫目前篩選出的地點並自動縮放，圖釘顏色：金＝兩人都想去、橘＝有人想去、紅＝去過、淺灰＝還沒標（左下有圖例），點圖釘出現 Google 風格資訊卡（照片、評分、營業狀態、今天時間、AI 評語、想去／詳情／Google 地圖）；全站捲離頂端後右下角有「回到頂端」按鈕（`app.js` 的 `mountToTop`）。只畫有 `ll` 的地點；沒有邊界檔時退回只畫泡泡 | D |
| `js/places.js` | 地區頁 `#/r/<id>`（往下一層只列有地點的）、地點詳情 `#/p/<id>`；輸出 `findRegion`、`inRegion`、`countIn`、`placeCard`、`listView`（分類、標記、搜尋篩選，條件換頁保留）；Google 評分與營業時間在 `google.placesKey` 有填時即時查，只放 `sessionStorage`（30 分鐘內有效）；清單的「現在營業」篩選與評分排序只看已查過的地點，按「查詢這批」才替目前清單前 40 筆查（同時 4 個請求，控制 Places 費用） | D |
| `js/marks.js` | `#/compare` 兩人對照四組（預設停在第一個有地點的分組）與點亮台灣；輸出 `markBar`（想去、去過、想再去、年月、星等、喜歡程度 `like`、好吃 `good`、雷點 `avoid`、備註 `note`，寫入走 `sync.setMark`）、`markCompare`（兩人並排顯示全部欄位）、`LIKES`／`likeOf`、`statusOf`、`litCounties`；地點卡片上顯示兩人的喜歡程度 | D |
| `img/bg/`、`img/og.jpg` | 12 張背景照片（輪播，取自交通部觀光署桌布，已裁掉月曆，來源寫在頁尾）與分享預覽圖 | C |
| `js/photos.js`、`css/photos.css` | 地點照片（Howard 2026-10-24 要求）：`google.placesKey` 有填且地點有 `pid` 時，Places (New) 即時查 `photos`，卡片與詳情頁都用同一個可左右滑的輪播（`carousel(ctx,p,{card:true})`：卡片版較矮、進入畫面才載、不放縮圖列；有箭頭、圓點，點圖放大）；地點列表：電腦（≥900px）是表格列（想去愛心｜照片 292px，左上角貼另一方「去過／想去」小章｜名稱與評分｜AI 評語｜去過郵戳，附欄位標題列；想去是中華民國郵票（`img/stamp-alishan.png`，寶寶用色相旋轉成藍色；貼上時蓋圓郵戳：縣市、民國日期、誰）；去過是台鐵舊紙車票（程式用 SVG 畫：藍綠色直書民國年月、臺灣 → 縣市、座位、兩人都去過是米黃色全票、一人去過是淡藍色半票（票邊深藍、右上角剪角）、山與小火車、票孔；標了想再去會蓋紅色「再訪」）；卡片有紙紋、12px 分類色條與頂端分類圖示標籤；切換縣市時 `app.js` 的 `stationSign` 滑進站名牌；導覽列下方有一條細鐵軌（`.tw-rail`），阿里山小火車圖（去背版 `img/train-cut.webp`）開過一次，不經過紅白藍郵戳條，動畫都跟「動畫：開關」）；窄螢幕是左圖右文卡（想去／去過併成同一列），並分三層精簡：評分＋營業狀態＋兩行 AI 評語永遠顯示，「更多資訊」就地展開地址、營業時間與更新時間（`places.js` 的 `compactContent`，資料來自 Firebase `/google`）；詳情頁橫向輪播（最多 10 張、1600 寬）加縮圖列，點圖開放大檢視（← → 換張、Esc 關閉）並顯示作者；照片參照只放 `sessionStorage` 鍵 `tw-photos:<pid>`，不存檔；沒有金鑰或沒圖就留分類圖示。輸出 `thumb`、`carousel`。詳情頁的「Google 即時資料」（`places.js` 的 `liveBox`）即時查 Google 地址、營業時間（標出今天）、評分與最多 5 則最相關評論，只放 `sessionStorage` 鍵 `twLiveD:<pid>`，不存檔 | 新增（D 的 `places.js` 呼叫） |
| `js/icons.js` | 分類圖示（`catIcon(分類)` 回傳內嵌 SVG，顏色跟文字）；`places.js` 的分類按鈕、車票、詳情使用 | C |
| `css/fx.css` | 圖示尺寸、導覽圖示（CSS mask）、換頁與車票進場、按鈕回饋、載入／空狀態插圖；動態受 `app.css` 的減少動態規則管轄 | C |
| `css/*.css` | 樣式（`tokens.css` 設計變數、`app.css` 外殼、`home.css`／`places.css`／`marks.css` 各畫面）；模組自己的 class 用前綴（`tw-map-`、`tw-place-`、`tw-mark-`、`tw-inbox-`、`tw-trip-`） | C |
| `js/quick.js`、`css/quick.css` | `#/quick` 快速選擇（卡片有可滑的照片輪播、評分與營業狀態、兩行 AI 評語、米其林、今天營業時間、地址、「更多資訊」展開、另一方狀態與兩則 Google 評論；按鈕固定在畫面下緣）：一次一張尚未標記的地點（沒有 `want`、`been`、`skip`、`neutral`），按鈕／滑動（右想去、左不想去）／鍵盤（→ ← ↓ 退格）；可依大區、縣市、分類、狀態篩選；「沒意見」存成 `neutral`（看過但沒決定，不再出現在待選，用「狀態」篩選挑出來重選）；底部列出自己標了不想去的並可改回；寫入走 `sync.setMark`，`want`、`skip`、`neutral` 互斥 | 新增（B 的路由表、D 的 `marks.js` 配合） |
| `js/inbox.js` | `#/inbox`：新增／修正／網站意見三種送件（寫 `/inbox`，≤ 500 字；網站意見前綴【意見】，每週由 Claude 排程任務整理成修改方向，站主決定後才執行，處理完標 `done` 顯示為「已處理」），每 30 秒輪詢 `/inbox` 與 `/places`（頁面隱藏時暫停），顯示處理狀態與「已查好、等併回」的地點；自己送的待處理項目可收回；離線送件先存 localStorage `twInboxQueue`，連上網路後補送。狀態：`new` 待處理、`done` 已上架、`dup` 已經有了、`skip` 不收錄 | E |
| `sw.js`、`manifest.webmanifest`、`img/icons/` | Service Worker：快取名 `tw-v2`（圖磚 `tw-tiles-v1`，最多 400 張）；同網域檔案網路優先（3 秒逾時退回快取），離線也能開；Leaflet、字型、OSM 圖磚先用快取再背景更新；Firebase 與 Places API 不攔截。`SHELL` 列出要預先快取的檔案，新增同網域檔案要加進去。manifest 與圖示供加到主畫面（`start_url` 與 `scope` 用相對路徑，Pages 子路徑也能用） | E |
| `tools/inbox-to-list.mjs` | 把 `live/inbox.json` 的待處理項目轉成暫存清單（短網址會跟著轉址取店名；【修正】的不轉，列出給人工處理） | E |
| `js/google.js` | Google 地點資料（預存版）：進站時從 Firebase `/google` 抓一次（讀進記憶體），提供 `googleOf(pid)`、`isOpenNow`（用預存的營業時段算）、`updatedLabel`、`staleDays`、`ago`；畫面一定要顯示「上次更新」，超過 10 天加警語 | D |
| `tools/google-refresh.mjs`、`.github/workflows/refresh-google.yml` | 每週一凌晨（台北 03:00）也可手動：用伺服器端金鑰 `GOOGLE_PLACES_KEY` 向 Places API 查全部地點的評分、評論數、地址、營業時間、最多 5 則評論，PATCH 進 Firebase `/google/{pid}`；失敗的保留舊資料；需 secret `GOOGLE_PLACES_KEY`、`FIREBASE_SECRET` | E |
| `tools/takeout-compare.mjs` | 比對 Google Takeout「已儲存」資料夾的清單與 `places.json`：網址裡的 `!1s0x…:0x…` 直接換算成 pid（不用名稱猜），已有的略過，台灣新地點寫進 `data/staging/takeout-new.json`；接著用 `lookup-places.yml`（暫存清單有 pid 就直接查詳細資料）與 `merge-places.mjs` 併入，標記用 `write-marks-batch.yml` | A／E |
| `tools/write-google-ai.mjs`、`.github/workflows/write-google-ai.yml` | 把 AI 整理的一小段評語寫進 Firebase `/google/{pid}/ai`（`{t, n, at}`，只寫這個欄位、每筆最多 200 字、pid 必須在 `places.json`）；`refresh-google` 改成逐欄位更新，所以每週更新不會蓋掉評語；網站卡片只顯示這段評語，詳情頁另外直接展開 Google 實際評論 | E |
| `tools/merge-places.mjs` | 把 `lookup-places` 的結果併進 `data/places.json`（只收吻合的、pid 重複的略過、id 規則同 A），並印出要把收件匣標成 `done`／`dup` 的 id | E |
| `css/inbox.css` | 收件匣的基本樣式（E 先放一份，只用 `tw-inbox-` class，C 可接手調整） | E（C 可改） |
| `js/itinerary.js`、`data/itineraries/` | 行程顯示與行程資料 | F |
| `scripts/validate.mjs` | 資料格式驗證（CI 守門員，契約檔） | B |
| `scripts/mobile-check.js` | 手機寬度掃描：在網站頁面的瀏覽器主控台貼上執行，用 320／360／390／430px 的 iframe 檢查每個頁面有沒有橫向捲動或內容超出卡片；改卡片、頁首或手機版面後要跑一次 | B |
| `scripts/fb-env.sh`、`scripts/snapshot-commit.sh` | workflow 共用：讀資料庫網址與密鑰、提交到 `snapshot` 分支 | B |
| `.github/workflows/` | `ci`、`read-firebase`、`write-data`、`snapshot` | B |
| `firebase-rules.json` | Firebase 規則存檔（契約檔；需 Howard 手動貼到主控台） | B |
| `docs/SPEC.md`、`docs/MODULES.md`、`CLAUDE.md`、`ARCHITECTURE.md` | 規格（契約）、模組介面、工作說明、本檔 | B |

## 前端分層

沒有框架，沒有建置。`index.html` 以 `<script type="module">` 載入 `js/app.js`，其餘模組由路由表按需 `import()`。

1. **外殼（`app.js`）**：頂列顯示站名、連線狀態、目前身分；底部導覽依路由表產生；選身分的對話層。
2. **狀態（`state.js`）**：模組之間唯一的溝通管道。鍵：`config`、`regions`、`places`（`data/places.json` 加上 Firebase `/places` 還沒併回的新地點，repo 的優先：`id` 或 `pid` 重複就略過遠端那筆；遠端格式不合——缺 `id`／`n`／`region`／`ll`、分類不在清單——也略過；未過濾，顯示請用 `store.isVisible(p)`，預設只顯示 `status: open`）、`marks`（`{apong: {…}, baobao: {…}}`，即時更新）、`who`、`route`、`online`、`synced`。
3. **同步（`sync.js`）**：啟動時先一次性讀 `/marks` 當後備，再開兩條 SSE（各一人）；寫入一律走 `setMark`，只能寫目前身分自己那條，先更新畫面，失敗就回復並丟錯。
4. **功能模組（D、E、F）**：各自 `export function mount(el, ctx)`，回傳清理函式。`ctx` 帶 `route`、`store`、`sync`、`navigate`、`h`、`clear`、`config`。檔案不存在或沒有 `mount` 時畫面顯示「尚未完成」，可選模組（E、F）的導覽項目不顯示。

### 路由（網址 hash）

| hash | 載入 | 模組 |
| --- | --- | --- |
| `#/` | `js/map.js` | D |
| `#/r/<regionId>` | `js/places.js` | D |
| `#/p/<placeId>` | `js/places.js` | D |
| `#/compare` | `js/marks.js` | D |
| `#/quick` | `js/quick.js` | 新增 |
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
- 之後新增：網站的收件匣把連結或店名寫到 Firebase `/inbox`。Claude 的處理流程（沒有新 workflow，沿用既有的）：
  1. `read-firebase`（`inbox`）→ 從 `snapshot` 分支讀 `live/inbox.json`；
  2. `node tools/inbox-to-list.mjs live/inbox.json data/staging/inbox-<日期>.json`，人工看過分類與店名；
  3. `lookup-places`（`list` 填該檔）查座標、縣市、`pid`；
  4. `node tools/merge-places.mjs <結果> <清單>` 併進 `places.json`，走 PR；
  5. PR 合併後用 `write-data` 把對應收件匣的 `status` 改成 `done`／`dup`／`skip`。
  `/places` 由 `sync.js` 每 60 秒輪詢（頁面隱藏時暫停），經 `store.setRemotePlaces` 併進全站地點列表（見下），收件匣頁另外讀來顯示「已查好、等併回」。
- 修正地點本身（分類、縣市、備註）：走收件匣的「修正」，由 Claude 確認後改 `places.json`；網站只能改自己的標記。
- 歇業或搬遷：`status` 設為 `closed` 或 `moved`，保留紀錄但預設不顯示、不排進行程。

### Firebase 路徑

| 路徑 | 誰寫 | 內容 |
| --- | --- | --- |
| `/marks/{apong\|baobao}/{placeId}` | 網站（各寫自己那條）、Claude（write-data） | `{want?, been?, again?, skip?, ym?, stars?, like?, good?, avoid?, note?, ts}` |
| `/inbox/{id}` | 網站（只能新增，或收回狀態仍是 `new` 的項目；不能覆寫）、Claude（write-data 改狀態） | `{text, by, ts, status}` |
| `/places`、`/removed` | 只有排程工具與 write-data | 新增的地點、被移除的地點（定期併回 `places.json`） |
| `/google/{pid}` | 只有 `refresh-google` 排程（網站只讀） | Google 評分、評論數、地址、營業時間、最多 5 則評論與更新時間 `u`；Howard 2026-10-25 決定存入，需手動把 `firebase-rules.json` 貼到主控台才讀得到 |
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
| `write-marks-batch.yml` | 批次合併寫入 `/marks/{apong\|baobao}`（模組 A 匯入「去過」用）。輸入 `file`（`data/staging/*.json`）或 `payload`，形狀 `{apong:{placeId:mark}, baobao:{…}}`，加 `mode`：`skip`（預設，現場已有的 placeId 不動）或 `overwrite`。邏輯在 `scripts/write-marks-batch.sh`：先驗每筆欄位（同 `firebase-rules.json`），備份現場到 `snapshot` 分支的 `backup/`，PATCH，讀回確認寫入的與沒動的都正確 |
| `lookup-places.yml` | 模組 A 的一次性匯入工具：用 Places API 查暫存清單的座標、縣市、`pid`，結果存到 `snapshot` 分支的 `lookup/`（需 repo secret `GOOGLE_PLACES_KEY`） |
| `write-google-ai.yml` | 輸入 `payload`（`{pid: {t, n}}`），只寫 `/google/{pid}/ai` |
| `refresh-google.yml` | 每週更新 Firebase `/google`（見 `tools/google-refresh.mjs`），可輸入 `limit`、`offset` 手動分批 |
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
| Google Places 金鑰（瀏覽器用） | `data/config.json` 的 `google.placesKey`（公開） | 靠 Google Cloud 限制 API 與來源網址保護；已填並運作（評分、營業時間、地點照片都用它）；建議在 Google Cloud 設每日配額與預算警示 |
| Google Places 金鑰（伺服器端） | GitHub Secret `GOOGLE_PLACES_KEY` | 給 `lookup-places`（匯入）與 `refresh-google`（每週更新 Firebase `/google`）用；由 Howard 自己放進 Settings，不 commit、不印出、不貼聊天 |

## 已知限制與取捨

- **資料庫不登入**：任何知道網址的人理論上能在規則允許的範圍內寫入；靠規則限制路徑與格式，並由每日快照還原。
- **身分只是前端區分**：記在瀏覽器 localStorage，不是安全機制。
- **公開資料**：repo 與網站公開，去過只記年月，不放電話、訂位代號與個人資訊。
- **Places 資料不快取在 repo**：離線時看不到評分與營業時間；離線時標記寫入不會排隊，會回復並提示（收件匣則會排隊補送）。
- **串流連線數上限**：新增即時路徑前先算。
- **規則要手動貼**：`firebase-rules.json` 與主控台可能不同步，改規則時要確認 Howard 已貼上。

## 維護本檔

- 任何改變結構的 PR 都要在同一個 PR 更新本檔：新增或改名檔案、路由、store 鍵、Firebase 路徑、workflow、金鑰位置、模組狀態。純粹修 bug 或調樣式不用。
- 更新時順手改最上面的「最後更新」與「模組狀態」。
- PR 範本（`.github/pull_request_template.md`）有一項勾選提醒；審查者看到結構有變但沒改本檔，請退回。
- 本檔與 `docs/SPEC.md` 不一致時以 SPEC 為準；發現不一致，先修本檔，若是 SPEC 過時就回報總管。
