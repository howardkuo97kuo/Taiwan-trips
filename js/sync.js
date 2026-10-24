// Firebase Realtime DB（REST）：標記即時同步，其餘輪詢。只有 B 能改。
// 規則見 firebase-rules.json；網站只能寫 /marks/{自己}/ 與 /inbox/。
// 資料庫網址讀自 config.firebase.dbUrl；沒填就不連線，網站仍可唯讀瀏覽。
import * as store from './state.js';

const WHO = store.whoIds();
let base = '';
const streams = [];

const url = (path, q = '') => `${base}/${path}.json${q}`;

// ── 基本 REST（也給 E 的收件匣用）──
export async function fbGet(path) {
  if (!base) throw new Error('Firebase 未設定');
  const r = await fetch(url(path), { cache: 'no-store' });
  if (!r.ok) throw new Error(`GET ${path} ${r.status}`);
  return r.json();
}

export async function fbPut(path, value) {
  if (!base) throw new Error('Firebase 未設定');
  const r = await fetch(url(path), { method: 'PUT', body: JSON.stringify(value) });
  if (!r.ok) throw new Error(`PUT ${path} ${r.status}`);
  return r.json();
}

export async function fbDelete(path) {
  if (!base) throw new Error('Firebase 未設定');
  const r = await fetch(url(path), { method: 'DELETE' });
  if (!r.ok) throw new Error(`DELETE ${path} ${r.status}`);
}

// 新增一筆（用於 /inbox），回傳新 id
export async function fbPush(path, value) {
  if (!base) throw new Error('Firebase 未設定');
  const r = await fetch(url(path), { method: 'POST', body: JSON.stringify(value) });
  if (!r.ok) throw new Error(`POST ${path} ${r.status}`);
  return (await r.json()).name;
}

// ── 標記 ──
// mark = {want?, been?, again?, ym?, stars?, like?, good?, avoid?, note?, ts}
// setMark 只寫目前身分自己那條；patch 併進現有標記，值為 null/undefined 的欄位會被拿掉，
// 沒有任何內容了就整筆刪除。先更新畫面再寫入，失敗時回復並丟出錯誤。
export async function setMark(placeId, patch) {
  const who = store.get('who');
  if (!who) throw new Error('尚未選擇身分');
  const mine = store.get('marks')[who] ?? {};
  const before = mine[placeId];
  const next = { ...(before ?? {}), ...patch };
  for (const k of Object.keys(next)) if (next[k] == null) delete next[k];
  delete next.ts;
  const empty = Object.keys(next).length === 0;
  if (!empty) next.ts = Date.now();

  const apply = (m) => {
    const marks = { ...store.get('marks') };
    const copy = { ...(marks[who] ?? {}) };
    if (m) copy[placeId] = m; else delete copy[placeId];
    marks[who] = copy;
    store.set('marks', marks);
  };
  apply(empty ? null : next);
  try {
    if (empty) await fbDelete(`marks/${who}/${placeId}`);
    else await fbPut(`marks/${who}/${placeId}`, next);
  } catch (e) {
    apply(before ?? null);
    throw e;
  }
}

// ── 即時串流（只開兩條：兩人的 /marks）──
function setMarks(who, value) {
  const marks = { ...store.get('marks') };
  marks[who] = value ?? {};
  store.set('marks', marks);
}

function applyEvent(who, type, data) {
  const { path, data: val } = JSON.parse(data);
  if (type === 'put') {
    if (path === '/') return setMarks(who, val);
    const id = path.slice(1).split('/')[0];
    const cur = { ...(store.get('marks')[who] ?? {}) };
    if (path.slice(1).includes('/')) {
      const [, ...rest] = path.slice(1).split('/');
      const m = { ...(cur[id] ?? {}) };
      if (val == null) delete m[rest.join('/')]; else m[rest.join('/')] = val;
      cur[id] = m;
    } else if (val == null) delete cur[id];
    else cur[id] = val;
    setMarks(who, cur);
  } else if (type === 'patch') {
    const cur = { ...(store.get('marks')[who] ?? {}) };
    for (const [k, v] of Object.entries(val ?? {})) {
      if (v == null) delete cur[k]; else cur[k] = v;
    }
    setMarks(who, cur);
  }
}

function openStream(who) {
  const es = new EventSource(url(`marks/${who}`));
  let first = false;
  const handler = (type) => (ev) => {
    try {
      applyEvent(who, type, ev.data);
      if (!first) { first = true; refreshSynced(); }
    } catch (e) {
      console.warn('[sync] 解析失敗', e);
    }
  };
  es.addEventListener('put', handler('put'));
  es.addEventListener('patch', handler('patch'));
  es.onopen = () => { opened.add(who); store.set('online', true); };
  es.onerror = () => { opened.delete(who); store.set('online', opened.size > 0); };
  streams.push(es);
}
const opened = new Set();
function refreshSynced() {
  // 任一邊到了就算同步，另一邊晚到會自動補上
  if (!store.get('synced')) store.set('synced', true);
}

// 串流連不上時退回一次性讀取，讓畫面至少有資料
async function fallbackLoad() {
  try {
    const all = (await fbGet('marks')) ?? {};
    for (const w of WHO) setMarks(w, all[w]);
    store.set('synced', true);
  } catch (e) {
    console.warn('[sync] 讀取標記失敗', e);
  }
}

// ── /places 輪詢：Claude 查好、還沒併回 places.json 的新地點，併進全站地點列表 ──
const PLACES_POLL_MS = 60_000;
let placesTimer = null;

async function pollPlaces() {
  if (document.hidden) return;
  try {
    store.setRemotePlaces(await fbGet('places'));
  } catch (e) {
    console.warn('[sync] 讀取 /places 失敗', e);
  }
}

export function startSync() {
  base = (store.get('config')?.firebase?.dbUrl ?? '').replace(/\/+$/, '');
  if (!base) {
    console.warn('[sync] config.firebase.dbUrl 沒填，略過連線');
    store.set('synced', true);
    return;
  }
  fallbackLoad();
  pollPlaces();
  placesTimer = setInterval(pollPlaces, PLACES_POLL_MS);
  document.addEventListener('visibilitychange', pollPlaces);
  if (typeof EventSource === 'undefined') return;
  for (const w of WHO) openStream(w);
}
