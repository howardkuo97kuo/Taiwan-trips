# 胖寶寶台灣行：規格（契約）

來源：「台灣站規格」文件 2026-10-23 版。這份檔案是各模組共同遵守的契約；格式要改，先改這裡再改程式，並先回報總管。`CLAUDE.md` 的資料格式與檔案歸屬從這裡來，兩邊不一致時以本檔為準。

## 結論

**胖寶寶台灣行**是阿胖和寶寶兩個人用的公開網站（網站優先：桌面瀏覽器為主，手機也要好用）：把全台想去、去過的地點集中成一個可依地區瀏覽的地圖庫，兩人各自標記，一眼看出「兩人都想去」，再由 Claude 依地區產生一日遊、兩日遊等行程。

分三批上線：

1. **第一批：地點庫。** 地圖首頁、五大區與縣市瀏覽、篩選、想去／去過／心得／星等、兩人對照、點亮台灣、去過紀錄匯入。
2. **第二批：收件匣與離線。** 網站上貼連結新增地點、離線與加到主畫面。
3. **第三批：行程推薦。** 依地區與天數產生的行程，網站負責顯示。

旅程規劃（訂房、訂位、每日行程編輯）與問 AI 聊天視窗這次不做，資料上只預留 `/trips/` 路徑與永不改名的地點 `id`。

## 已定案決策

| 項目 | 決定 |
|---|---|
| 定位 | 地點庫優先，先不做旅程規劃；不照搬清邁站，用新的想像設計 |
| 名稱與 repo | 胖寶寶台灣行；`howardkuo97kuo/Taiwan-trips`，公開；程式前綴 `tw` |
| 使用者 | 阿胖、寶寶兩人；進站選身分，不登入 |
| 分類 | 景點、美食、小吃夜市、咖啡甜點、溫泉、住宿、購物市集；一個主分類加最多兩個副分類 |
| 地區 | 五大區 → 22 縣市 → 區域；區域等地點進來再補，沒有地點的縣市不顯示 |
| 個人標記 | 想去（愛心）、去過、想再去、1 到 5 顆星、一句心得；兩人各一份，互相看得到 |
| 地點資料 | 名稱、分類、縣市、地址、座標、Google 連結、備註；`places.json` 不存照片檔，也不存評分／評論／營業時間（這些存在 Firebase `/google`，見「Google 資料」列；照片見「地點照片」列） |
| 共用資料 | Firebase Realtime DB，規則存在 repo；唯一的地點來源是 `data/places.json` |
| 新增地點 | 先匯入 Google 地圖清單；之後從收件匣新增，或直接請 Claude 加；收件匣的地點先放 Firebase，再併回 `places.json` |
| Claude 讀寫 | GitHub Actions：`read-firebase`、`write-data`（寫前備份、比對時間戳、讀回確認），`FIREBASE_SECRET` 由 Howard 自己放進 Secrets |
| 行程推薦 | 由 Claude 產生，存成 `data/itineraries/*.json`，網站顯示；不在網站即時呼叫 AI |
| 資料庫防護 | 規則限制可寫路徑與欄位格式、快照備份到 `snapshot` 分支；不做 Firebase 登入 |
| 協作 | 規格放進 repo 的 `docs/SPEC.md`，契約寫進 `CLAUDE.md`，由總管統籌；格式驗證腳本與 CI 當守門員 |
| 地點照片 | Howard 2026-10-24 新要求：每個地點要讓使用者看到照片。用 Google Places (New) 以 `pid` 即時查 photos，在瀏覽器載入，不把圖片檔或照片參照存進 repo 或 Firebase（只放 `sessionStorage`）；須顯示作者歸屬；用瀏覽器金鑰 `google.placesKey`；只在畫面可見或開啟詳情時才載入；沒有圖時用分類圖示替代 |
| 不做 | 登入、問 AI 聊天視窗、旅程編輯 |
| 隱私 | 接受公開但設限：去過只記年月、心得不放個人資訊、不放電話與訂位代號；之後想更私密再加簡單存取密碼 |
| Google 資料 | **Howard 2026-10-25 決定（已知 Places 條款不允許長期保存評分、評論、營業時間，風險由 Howard 承擔）**：評分、評論數、地址、營業時間、最多 5 則最相關評論，由排程 `refresh-google`（每週一次，可手動觸發；用伺服器端金鑰 `GOOGLE_PLACES_KEY`）寫進 Firebase `/google/{pid}`；網站只讀，不再逐筆即時查。每筆都有更新時間，畫面一定要顯示「上次更新」，超過 10 天加警語「資料可能已變動，以 Google 地圖為準」。不存進 repo（`places.json` 仍禁止 `rt`、`rv`、`h`、`oh`，CI 會擋）；仍要顯示 Google 地圖資料來源與評論作者歸屬；評論數量是 Google API 的上限（最多 5 則）。照片仍即時載入、不存（參照會過期）。**AI 評語**：卡片不放原始評論，改顯示 `/google/{pid}/ai`——由 Claude 依該筆最相關的 5 則評論整理的一小段評語，以 `write-google-ai` 寫入；畫面須標示「AI 依 Google 最相關的 N 則評論整理」與整理日期，僅供參考；實際評論只在詳情頁直接展開顯示；評論更新後評語不會自動重寫 |
| 修正地點 | 網站只改自己的標記；地點本身的修正走收件匣，由 Claude 確認後改 `places.json` |
| 歇業與搬遷 | 地點有 `status`（`open`、`closed`、`moved`），預設只顯示 `open`，`closed` 保留紀錄但不顯示也不排進行程 |
| 合併方式 | 每個模組開自己的分支與 PR，CI 全綠、Howard 確認才合併；`main` 設保護規則，不直接推 |
| 第一批完成標準 | (1) Google 清單地點全部匯入並歸好縣市；(2) 桌面瀏覽器與手機都能開、選身分、標想去／去過並互相看到；(3) 兩人對照與點亮台灣可用；(4) CI 全綠；(5) 兩人實際用過一次，沒有擋住使用的問題 |
| 視覺風格 | C 模組先做 2 到 3 個首頁風格小樣供阿胖與寶寶點選，選定後再全面製作 |

## 使用方式與功能

四條主線：

1. **兩人對照**：針對每個地點各自標「想去」，可篩出「兩人都想去」、「只有一人想去」、「一人去過另一人沒去過」。
2. **完整地圖庫**：全台地點可用五大區、縣市、區域分類瀏覽，首頁是台灣地圖。
3. **行程推薦**：選地區與天數，看 Claude 產生的一日遊、兩日遊等行程。
4. **去過的紀錄**：Howard 提供過去去過的地方，由 Claude 轉成統一格式匯入。

| 功能 | 說明 | 批次 |
|---|---|---|
| 首頁地圖 | 台灣地圖，每個縣市標出地點數，點區域或縣市往下展開地點卡片 | 第一批 |
| 地點庫 | 依分類、地區、評分、現在營業、想去、去過篩選；地點詳情 | 第一批 |
| 個人標記 | 想去、去過、想再去、星等、心得 | 第一批 |
| 兩人對照 | 兩人都想去、只有一人想去、一人去過另一人沒去過 | 第一批 |
| 點亮台灣 | 去過的縣市在地圖上亮起，顯示「已點亮 N／22 縣市」 | 第一批 |
| 去過紀錄匯入 | 形式不限，轉成統一格式；不在地點庫的地點自動新增並標記 `src: 去過` | 第一批 |
| 收件匣 | 網站上貼 Google 地圖連結或店名，由排程查好資料再上架 | 第二批 |
| 離線與主畫面 | 頁面與地點資料網路優先，地圖圖磚快取 | 第二批 |
| 行程推薦 | 依縣市或區域、天數顯示行程 | 第三批 |
| 抽一間、匯出 Google 地圖清單或 KML、自訂標籤 | 上線後再評估 | 之後 |

（評分、現在營業等篩選依賴即時向 Places API 查詢的結果，不依賴 repo 內資料。）

## 地區結構

地區分三層，每一層都有永不改名的 `id`，格式為 `{大區}-{縣市}-{區域}`（英文小寫，例如 `north-taipei-daan`）。地點只記最底層的 `region`，上層由 `data/regions.json` 推算；資料只填到縣市也可以用，區域等地點進來再補。沒有地點的縣市和區域不顯示。

| 大區 | 縣市 |
|---|---|
| 北部（6） | 台北市、新北市、基隆市、桃園市、新竹市、新竹縣 |
| 中部（5） | 苗栗縣、台中市、彰化縣、南投縣、雲林縣 |
| 南部（5） | 嘉義市、嘉義縣、台南市、高雄市、屏東縣 |
| 東部（3） | 宜蘭縣、花蓮縣、台東縣 |
| 離島（3） | 澎湖縣、金門縣、連江縣 |

- 宜蘭暫定歸在東部，若想歸北部再調整。
- 地址可自動判斷縣市；Google 清單匯入時先自動歸縣市，再人工確認區域。
- 地圖視角跟著層級走：大區看全台、縣市看城市、區域看街區，各層的中心點與縮放存在 `regions.json`。
- `regions.json` 的形狀：`{ note, center, zoom, zones: [ { id, n, center, zoom, counties: [ { id, n, center, zoom, districts: [] } ] } ] }`；大區 id 為 `north`、`central`、`south`、`east`、`island`，縣市 id 為 `{大區}-{縣市}`（例如 `north-taipei`、`island-lienchiang`）。

## 資料格式與 Firebase

所有模組都依這一節溝通，它是契約的核心。縣市、店家的時區一律 `Asia/Taipei`。

**`data/places.json`（唯一的地點來源）**

| 欄位 | 說明 |
|---|---|
| `id` | 穩定、永不改名，標記和行程都靠它 |
| `n` | 名稱 |
| `c`、`c2` | 主分類；副分類（最多 2 個，選填） |
| `region` | 最底層的地區 id |
| `a`、`ll` | 地址、座標 `[緯度, 經度]`。座標可取自 Google Places 回傳的位置（Places 條款只明確允許長期保存 `place_id`，座標有快取期限；Howard 已知此風險後決定存入，2026-10-24），查不到時用 OSM（Nominatim）或由 Howard 手動點位置 |
| `llsrc` | 座標來源：`google`、`osm` 或 `manual`（選填） |
| `h`、`oh`、`rt`、`rv` | 不存入 `places.json`：營業時間、評分、評論數存在 Firebase `/google/{pid}`（見下方「Firebase 路徑」） |
| `pid`、`gurl` | Google Place ID、Google 地圖連結 |
| `mich` | 選填：米其林標示 `{ t, y }`，`t` 為 `bib`（必比登推介）、`star1`、`star2`、`star3`，`y` 為台灣米其林指南的年份（目前是 2026 年版）；網站在卡片與詳情頁用米其林圖示標出。資料依該年官方名單比對店名與地址，有疑義的不標 |
| `note` | 備註 |
| `src` | 來源：清單、收件匣、去過、手動 |
| `status` | `open`、`closed`、`moved`；預設只顯示 `open` |

**初次匯入流程**：Google 地圖清單先放進 `data/staging/import-list.json`（只有 `n`、`c`、選填 `note`，歇業的標 `status`）；`lookup-places` workflow 用 Places API 查出座標、縣市、`pid`、`gurl`，結果存到 `snapshot` 分支的 `lookup/`（不取評分、評論數、營業時間）；Google 查不到座標的，改用 OSM 地址查詢（Nominatim 每秒最多 1 次、要帶說明用途的 User-Agent）或手動點位置；A 確認後轉成上表格式寫進 `places.json`。`data/staging/` 不受 `validate.mjs` 檢查，也不會被網站載入。

**Firebase 路徑**

| 路徑 | 用途 | 誰能寫 |
|---|---|---|
| `/marks/{apong\|baobao}/{placeId}` | `{want?, been?, again?, skip?, ym?, stars?, like?, good?, avoid?, note?, ts}`：想去、去過、想再去、不想去 `skip`（與 `want` 互斥，網站寫入時會清掉另一個）、年月（`YYYY-MM`）、1 到 5 星、喜歡程度 `like`（`love`｜`ok`｜`meh`）、好吃／推薦 `good`（≤ 300 字）、雷點／要避開 `avoid`（≤ 300 字）、一般備註 `note`（≤ 200 字） | 網站（分別寫自己那條）、Claude（write-data） |
| `/inbox/{id}` | 收件匣：連結或店名、誰送的、時間、狀態 | 網站 |
| `/places`、`/removed` | 排程查好後的新地點、被移除的地點（定期併回 `places.json`） | 只有排程工具與 write-data |
| `/google/{pid}` | Google 地點資料：`{u 更新時間 ms, status?, rating?, n 評論數?, addr?, maps?, hours? 七行文字, periods? 營業時段, reviews? 最多 5 則 {r, t, o?, by, uri?, at?}, ai? {t 評語（最多 200 字）, n 整理自幾則評論, at 時間 ms}}`；格式與用法見 `js/google.js` 開頭 | 排程 `refresh-google` 寫其餘欄位（`tools/google-refresh.mjs`，只改自己的欄位、不動 `ai`）；`ai` 只由 `write-google-ai` 工作流程寫（`tools/write-google-ai.mjs`）；網站只讀 |
| `/trips/` | 預留，現在不寫、規則不開放 | 無 |

- 身分用 `apong`（阿胖）和 `baobao`（寶寶）；第一次進站選身分，記在 localStorage `twWho`，可隨時切換。這只是前端區分，不是安全機制。
- `firebase-rules.json` 存在 repo，限制可寫路徑與欄位型別、大小（星等 1 到 5、備註 ≤ 200 字、好吃與雷點各 ≤ 300 字、喜歡程度只能是 love｜ok｜meh），其餘一律拒絕；需由 Howard 手動貼到主控台。
- 即時連線數：網站只用 2 條串流（兩人的 `/marks`），其餘（`/places`、`/inbox`、`/google`）用輪詢或進站時抓一次。
- 快照：排程用 Actions 把 Firebase 備份到 `snapshot` 分支，被亂寫或誤刪可以還原。
- 「只有擁有者能同意」這類限制不做；兩人皆平等。

## 行程推薦

行程由 Claude 在專案裡產生、存成 `data/itineraries/<id>.json`，網站只負責顯示，所以沒有 API 金鑰、費用與盜用問題，內容也能人工調整。即時在網站上呼叫 AI 等這個模式跑順了再評估。

**輸入**：縣市或區域、天數（1 到 3 天）。交通方式不先選定：一天可以混搭，例如騎腳踏車一個多小時到淡水，再步行逐站，最後搭大眾運輸回家。因此不設交通工具與距離上限。

**每段路程自己標交通方式**：行程中相鄰兩站之間的「段」各自標 `mode`（`drive`、`transit`、`walk`、`bike`）和預估分鐘 `min`，網站直接顯示每段的方式與時間。

| 欄位 | 說明 |
|---|---|
| `id`、`title`、`region`、`days` | 行程編號、標題、地區 id、天數 |
| `assumptions` | 出發時間等假設 |
| `days[].stops[]` | `{place, stayMin, next:{mode, min}}`，最後一站沒有 `next` |
| `basedOn` | 產生時用的想去／去過資料時間 |

**合理性規則**（每個行程都要通過）：

- **順路**：依座標排出先後，不來回折返。
- **營業時間**：每站都落在營業時間內，公休日自動排除；夜市與酒類放傍晚以後。
- **節奏**：每天 3 到 5 站，中午和晚上各安排一個「美食」或「小吃夜市」，溫泉放最後一站，多日行程最後一天不排太遠的點。
- **挑地點的優先順序**：兩人都想去 → 單人想去 → 評分高且沒去過；「去過」預設排除，除非標了「想再去」。
- **資料不足不排**：沒有座標的地點不排入；營業時間由產生行程的 Claude 當下向 Places 查。
- **標示**：注明假設，並標出哪些站是「兩人都想去」。
- **驗收**：驗證腳本檢查結構、每段都有 `mode` 和 `min`、地點存在且為 `open`；營業時間、順路與節奏由產生行程的 Claude 與 Howard 審核。

## 技術架構與 repo

沿用清邁站驗證過的做法：靜態網站放在 GitHub Pages，不需要建置，推上 `main` 約一分鐘上線；地圖用 Leaflet 和 OpenStreetMap 圖磚；即時資料用 Firebase Realtime DB 的 REST。差別是程式一開始就拆成 ES modules（`<script type="module">`），資料全部在 `data/`，每個模組只管自己的檔案。

| 路徑 | 內容 | 模組 |
|---|---|---|
| `index.html`、`js/app.js`、`js/state.js`、`js/sync.js`、`js/util.js` | 骨架、啟動、共用狀態、Firebase 連線、身分選擇 | B |
| `css/*.css` | 介面樣式、網站優先（桌面版面為主，向下相容手機）、深淺色 | C |
| `js/map.js`、`js/places.js`、`js/marks.js` | 首頁地圖、地區瀏覽、篩選、地點詳情、個人標記、兩人對照、點亮台灣 | D |
| `js/inbox.js`、`tools/`、`sw.js`、`manifest.webmanifest` | 收件匣、排程查資料工具、離線、加到主畫面 | E |
| `js/itinerary.js`、`data/itineraries/` | 行程顯示與行程資料 | F |
| `data/config.json`、`data/regions.json`、`data/places.json`、`data/geo/`、`data/staging/`、`tools/places-lookup.mjs`、`.github/workflows/lookup-places.yml` | 設定、地區樹、地點庫、縣市邊界、匯入暫存清單與 Places 查詢工具 | A |
| `scripts/validate.mjs`、`.github/workflows/`、`firebase-rules.json` | 格式驗證、CI、Firebase 讀寫與快照、規則存檔 | B |
| `docs/SPEC.md`、`docs/MODULES.md`、`CLAUDE.md`、`ARCHITECTURE.md`、`.github/pull_request_template.md` | 規格（契約）、模組介面、工作說明、架構說明（結構有變就在同一個 PR 更新）、PR 範本 | B |

`data/config.json` 放站名、時區 `Asia/Taipei`、前綴 `tw`、分類清單、Firebase 與 Google 金鑰（金鑰限制 API 與來源網址）。localStorage 鍵與快取名都用 `tw` 開頭（`twWho`、`tw-v1`）；新增同網域檔案要加進 `sw.js` 的 `SHELL`，改了快取規則要把版本號加一。

## Orchestration 與協作

多個 thread 平行做同一個網站，最容易出問題的是各自假設不同的資料格式，不是程式本身。所以加一層很薄的「契約」，由專案聊天的總管負責，不另開長期 thread。

| 機制 | 做法 |
|---|---|
| 契約 | 本檔；`CLAUDE.md` 的資料格式與檔案歸屬從它來，兩邊以 SPEC 為準，要改規格就改 SPEC |
| 守門 | `scripts/validate.mjs` 加 GitHub Action，每次推送檢查：必填欄位、`region` 是合法 id、座標在台灣範圍、分類在清單內、沒有重複 `pid`、行程結構；格式錯了 CI 就紅 |
| 檔案歸屬 | 上表每個檔案只有一個模組能改；`docs/SPEC.md`、`firebase-rules.json`、`scripts/validate.mjs`、`data/regions.json` 屬於契約檔，要改先回報總管 |
| 合併順序 | 各模組做完回報，由總管決定合併與整合測試順序，不各自推 `main`；推送前一律 `git pull --rebase` |
| 備份 | 寫入 Firebase 前先備份、比對時間戳、寫完讀回確認（`write-data`） |
| 上線後 | 全部收斂成單一「維護」thread，新需求都從那裡進 |

協作習慣沿用 Thailand-2026 的 `CLAUDE.md`：繁體中文、結論先行、要選的用可點選的選擇題並附推薦、先建議再執行、只在被要求時 commit 與 push、電話與訂位代號不放公開網站、金鑰不貼聊天。

## 模組與 thread 切分

六個模組，各管自己的檔案。

| 模組 | 負責的檔案 | 產出 | 前置 |
|---|---|---|---|
| A 資料 | `data/*.json`、`data/geo/`、`data/staging/`、`tools/places-lookup.mjs`、`.github/workflows/lookup-places.yml` | `config.json`、五區與 22 縣市地區樹、縣市邊界、地點庫（含 Google 清單匯入與補欄位）、去過紀錄匯入 | 無 |
| B 骨架與同步 | `index.html`、`js/app.js`、`state.js`、`sync.js`、`util.js`、`scripts/`、`.github/`、`firebase-rules.json`、`docs/`、`CLAUDE.md` | 新 repo、Pages 上線、模組載入、Firebase 連線與身分選擇、規則存檔、讀寫與快照 workflow、驗證腳本與 CI | 無（先用假資料） |
| C 介面 | `css/*.css` | 「胖寶寶台灣行」視覺、網站優先版面（桌面為主，手機可用）、卡片、篩選列、深淺色 | A 的資料格式、B 的頁面結構 |
| D 地圖與地點庫 | `js/map.js`、`places.js`、`marks.js` | 首頁地圖、地區瀏覽、篩選、地點詳情、想去／去過／心得／星等、兩人對照、點亮台灣 | A、B |
| E 收件匣與離線 | `js/inbox.js`、`tools/`、`sw.js`、`manifest.webmanifest` | 收件匣、排程查資料、併回 `places.json`、離線、備份、上線前檢查與手機測試 | B、D |
| F 行程推薦 | `js/itinerary.js`、`data/itineraries/` | 行程頁、行程資料格式驗證、第一批示範行程 | A、D |

「Google 地圖清單地點」那個 thread 的結果直接交給 A，不重做。

## 開放問題

- [x] 宜蘭歸東部（2026-10-23 確認）
- [x] 基礎設施：repo、Pages、Firebase 專案與規則、`FIREBASE_SECRET`、`firebase.dbUrl` 已完成；模組啟動順序為基礎設施 → A、B → C、D、E → F（B 已合併，A 進行中）
- [ ] Google 地圖清單：暫存清單 395 筆已用 Places 查詢並併進 `places.json`（共 522 筆含去過）；「已作廢」與老街懷舊便當兩間縣市待補
- [x] 座標來源（2026-10-24 Howard 最終決定）：座標存 Google Places 回傳的位置；OSM 在台灣資料不足，只當備援。Howard 已知 Places 條款對座標快取的限制並接受風險；評分、評論數、營業時間仍不存 repo
- [x] 地址 `a` 同理，沿用 Google 的 `formattedAddress`（同一風險決定）
- [x] 去過紀錄：127 筆已匯入並寫入 Firebase
- [ ] Google 金鑰有兩把：匯入工具用的 repo secret `GOOGLE_PLACES_KEY`，與瀏覽器用的 `google.placesKey`（限制 API 與來源網址）；皆由 Howard 自己設定，不貼聊天
- [x] 縣市邊界 `data/geo/counties.json` 已有（taiwan-atlas，MIT；原始資料授權未逐項查證）
- [ ] 行程的「長途段」要不要在畫面上特別標示（目前不設上限，只顯示每段方式與時間）

## 上線前清單

- [x] `data/config.json` 欄位全填、沒有殘留 `cnx`、`Thailand`、`Bangkok`、`清邁`
- [ ] Firebase 規則已貼上並存檔（收件匣改為只能新增的版本，需 Howard 重新貼上）
- [ ] 讀寫 workflow 用空操作驗證
- [ ] 金鑰已限制
- [x] `sw.js` 的版本號已更新
- [x] CI 全綠
- [ ] 手機上測試離線與加到主畫面
