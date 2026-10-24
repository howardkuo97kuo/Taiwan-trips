// 把 Google 地點資料（評分、地址、營業時間、評論）更新進 Firebase /google/{pid}。
// 由 .github/workflows/refresh-google.yml 每週執行，也可手動執行：
//   GOOGLE_PLACES_KEY=… FIREBASE_SECRET=… node tools/google-refresh.mjs [--limit N] [--offset N] [--dry]
// 金鑰只從環境變數讀，不印出。資料庫網址讀自 data/config.json 的 firebase.dbUrl。
// 格式與決定見 docs/SPEC.md「Google 資料」與 js/google.js 開頭。
import { readFileSync } from 'node:fs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1];
};
const DRY = process.argv.includes('--dry');
const LIMIT = Number(arg('limit', 0)) || Infinity;
const OFFSET = Number(arg('offset', 0)) || 0;
const PARALLEL = 4;

const KEY = process.env.GOOGLE_PLACES_KEY;
const SECRET = process.env.FIREBASE_SECRET;
if (!KEY) { console.error('缺少環境變數 GOOGLE_PLACES_KEY'); process.exit(1); }
if (!SECRET && !DRY) { console.error('缺少環境變數 FIREBASE_SECRET'); process.exit(1); }

const config = JSON.parse(readFileSync(new URL('../data/config.json', import.meta.url), 'utf8'));
const DB = (config.firebase?.dbUrl ?? '').replace(/\/+$/, '');
if (!DB && !DRY) { console.error('data/config.json 的 firebase.dbUrl 尚未填寫'); process.exit(1); }

const places = JSON.parse(readFileSync(new URL('../data/places.json', import.meta.url), 'utf8'));
const list = (Array.isArray(places) ? places : places.places ?? []).filter((p) => p.pid && (p.status ?? 'open') === 'open');
const todo = [...new Map(list.map((p) => [p.pid, p])).values()].slice(OFFSET, OFFSET + LIMIT);

const MASK = ['rating', 'userRatingCount', 'formattedAddress', 'googleMapsUri', 'businessStatus',
  'regularOpeningHours.weekdayDescriptions', 'regularOpeningHours.periods',
  'reviews.rating', 'reviews.text', 'reviews.originalText', 'reviews.publishTime', 'reviews.authorAttribution'].join(',');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPlace(pid) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(pid)}?languageCode=zh-TW`, {
      headers: { 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': MASK },
    });
    if (r.ok) return r.json();
    if (r.status === 404) return { _notFound: true };
    if (r.status === 429 || r.status >= 500) { await sleep(1500 * 2 ** attempt); continue; }
    throw new Error(`HTTP ${r.status}`);
  }
  throw new Error('重試後仍失敗');
}

// 只留網站要用的欄位，並壓成短鍵（省空間）
function shape(d) {
  const out = { u: Date.now() };
  if (d._notFound) { out.status = 'NOT_FOUND'; return out; }
  if (d.businessStatus) out.status = d.businessStatus;
  if (d.rating != null) out.rating = d.rating;
  if (d.userRatingCount != null) out.n = d.userRatingCount;
  if (d.formattedAddress) out.addr = d.formattedAddress;
  if (d.googleMapsUri) out.maps = d.googleMapsUri;
  const oh = d.regularOpeningHours;
  if (oh?.weekdayDescriptions?.length) out.hours = oh.weekdayDescriptions;
  if (oh?.periods?.length) {
    out.periods = oh.periods.map((p) => ({
      o: { d: p.open.day, h: p.open.hour ?? 0, m: p.open.minute ?? 0 },
      ...(p.close ? { c: { d: p.close.day, h: p.close.hour ?? 0, m: p.close.minute ?? 0 } } : {}),
    }));
  }
  if (d.reviews?.length) {
    out.reviews = d.reviews.slice(0, 5).map((r) => {
      const t = r.text?.text ?? r.originalText?.text ?? '';
      const o = r.originalText?.text && r.originalText.text !== t ? r.originalText.text : undefined;
      return {
        r: r.rating, t: t.slice(0, 1200), ...(o ? { o: o.slice(0, 1200) } : {}),
        by: r.authorAttribution?.displayName ?? '', ...(r.authorAttribution?.uri ? { uri: r.authorAttribution.uri } : {}),
        ...(r.publishTime ? { at: r.publishTime } : {}),
      };
    });
  }
  return out;
}

// 逐欄位寫入（多路徑更新），這樣 /google/{pid}/ai（AI 評語，另外寫入）不會被每週更新蓋掉；
// 這次沒有的欄位明確設成 null，避免留下過期資料。
const FIELDS = ['u', 'status', 'rating', 'n', 'addr', 'maps', 'hours', 'periods', 'reviews'];
function flatten(result) {
  const out = {};
  for (const [pid, rec] of Object.entries(result)) for (const f of FIELDS) out[`${pid}/${f}`] = rec[f] ?? null;
  return out;
}

async function patch(batch) {
  const r = await fetch(`${DB}/google.json?auth=${encodeURIComponent(SECRET)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(batch),
  });
  if (!r.ok) throw new Error(`Firebase PATCH ${r.status}`);
}

console.log(`要更新 ${todo.length} 個地點${DRY ? '（dry run，不寫入）' : ''}`);
const result = {};
let ok = 0, fail = 0, notFound = 0;
const queue = [...todo];
await Promise.all(Array.from({ length: PARALLEL }, async () => {
  while (queue.length) {
    const p = queue.shift();
    try {
      const d = await fetchPlace(p.pid);
      result[p.pid] = shape(d);
      if (d._notFound) notFound++; else ok++;
    } catch (e) {
      fail++;
      console.warn(`略過 ${p.id}：${e.message}`); // 失敗的保留舊資料，不覆蓋
    }
  }
}));

const keys = Object.keys(result);
if (!DRY) {
  for (let i = 0; i < keys.length; i += 100) {
    await patch(flatten(Object.fromEntries(keys.slice(i, i + 100).map((k) => [k, result[k]]))));
  }
}
console.log(`完成：成功 ${ok}、查無 ${notFound}、失敗 ${fail}${DRY ? '' : `；已寫入 ${keys.length} 筆`}`);
if (fail > todo.length / 2) process.exit(1); // 超過一半失敗就讓排程變紅
