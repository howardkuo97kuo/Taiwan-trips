# 模組介面（B 提供給 C、D、E、F）

骨架已經跑得起來：打開 `index.html` 會載入資料、選身分、連 Firebase、依網址 hash 掛上各模組。各模組只要在自己的檔案裡 `export function mount(el, ctx)`，不需要改 `index.html` 或 `app.js`。格式以 `docs/SPEC.md` 為準。

## 路由（網址 hash）

| hash | route.name | 載入的檔案 | 負責 |
|---|---|---|---|
| `#/` | `home` | `js/map.js` | D |
| `#/r/<regionId>` | `region` | `js/places.js` | D |
| `#/p/<placeId>` | `place` | `js/places.js` | D |
| `#/compare` | `compare` | `js/marks.js` | D |
| `#/inbox` | `inbox` | `js/inbox.js` | E（檔案不存在時導覽列不顯示） |
| `#/trips` | `trips` | `js/itinerary.js` | F（同上） |

檔案不存在或沒有 `mount`，畫面顯示「尚未完成」，不會壞掉。要新增路由，回報 B 改 `app.js` 的 `ROUTES`。

## 模組合約

```js
// js/places.js 之類
export function mount(el, ctx) {
  // el：主畫面容器 #tw-view，進來時是空的
  // ctx.route = { name, params }   例如 #/r/north-taipei → { name:'region', params:['north-taipei'] }
  // ctx.store、ctx.sync、ctx.navigate(hash)、ctx.h、ctx.clear、ctx.config
  return () => { /* 離開這個畫面時的清理（可省略）：取消訂閱、移除 Leaflet map 等 */ };
}
```

- 每次換頁都會重新 `mount`，離開時呼叫回傳的清理函式。
- 輸出 DOM 用 `ctx.h(tag, attrs, ...children)`，文字一律當 textContent；不要把使用者輸入塞進 `innerHTML`。
- Leaflet 以全域 `L` 提供（index.html 已載入）；先 `setView` 再加標記。

## 共用狀態（`js/state.js`）

| 讀取 | 內容 |
|---|---|
| `store.get('config')` | `data/config.json` |
| `store.get('regions')` | `data/regions.json` 原樣，形狀由 A 決定 |
| `store.get('places')` | `data/places.json` 的陣列，**未過濾**；顯示請用 `store.isVisible(p)`（預設只顯示 `open`） |
| `store.get('marks')` | `{ apong: {placeId: mark}, baobao: {placeId: mark} }`，即時更新 |
| `store.get('who')` | `'apong'` / `'baobao'` / `null` |
| `store.get('route')`、`'online'`、`'synced'` | 目前路由、串流是否連著、標記是否已到 |

`store.subscribe(key, fn)` 回傳取消函式（key 用 `'*'` 聽全部）。其他：`store.placeById(id)`、`store.whoName(id)`、`store.otherWho()`、`store.setWho(id)`。資料檔還沒建好（`regions.json`、`places.json`）時給 `null` / `[]`，網站照樣能開。

## 同步（`js/sync.js`）

| 函式 | 用途 |
|---|---|
| `sync.setMark(placeId, patch)` | 寫**目前身分**自己的標記。`patch` 併進現有標記，值為 `null` 的欄位移除，全空就刪除整筆；`ts` 自動補。先更新畫面，失敗會回復並丟錯，呼叫端請 `catch` 後提示 |
| `sync.marksOf(placeId)` | `{apong, baobao}` 兩人在這個地點的標記 |
| `sync.fbGet / fbPut / fbPush / fbDelete(path, …)` | 低階 REST，給 E 的收件匣用（`/inbox/…`）。規則外的路徑會被 Firebase 拒絕 |

標記格式：`{want?, been?, again?, ym?('YYYY-MM'), stars?(1–5 整數), note?(≤200 字), ts}`。兩條串流（兩人的 `/marks`）由 B 開，D 不要自己開串流；`/places`、`/inbox` 用輪詢（E 自行處理）。

## 外殼的 class 與結構（給 C）

`index.html` 預留 `css/app.css`（C 建立；`css/*.css` 都是 C 的）。骨架只用 class，沒有內建樣式：

| 元素 | class / 結構 |
|---|---|
| 頂列 `#tw-header.tw-header` | `a.tw-title`、`span.tw-sync.is-online/.is-offline`、`button.tw-who-btn` |
| 主畫面 `#tw-view.tw-view` | 各模組自己的內容；`p.tw-loading`、`p.tw-empty` |
| 底部導覽 `#tw-nav.tw-nav` | `a.tw-nav-item`（目前頁多 `.is-active`） |
| 身分選擇 `#tw-overlay.tw-overlay`（`[hidden]` 隱藏） | `div.tw-dialog > h2、p.tw-hint、div.tw-who-choices > button.tw-who-choice(.is-current)[data-who]、button.tw-cancel` |

模組自己的 class 請用模組前綴（D：`tw-map-`、`tw-place-`、`tw-mark-`；E：`tw-inbox-`；F：`tw-trip-`），避免撞名。

## 檔案歸屬提醒

- 新增同網域檔案要加進 `sw.js` 的 `SHELL`（E）。
- `js/util.js` 屬於 B（`h`、`clear`、`ymNow`、`debounce`、`loadJson`），需要新工具先回報 B。
