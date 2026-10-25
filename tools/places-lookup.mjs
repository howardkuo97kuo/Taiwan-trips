// 用 Google Places API (New) 查 data/staging/import-list.json 的地點，輸出座標、縣市、pid 與營業狀態。
// 只在 GitHub Actions 跑（lookup-places.yml）；金鑰讀自環境變數 GOOGLE_PLACES_KEY，不印出。
// 用法：node tools/places-lookup.mjs <offset> <limit> <輸出檔> [暫存清單檔]
// 不取評分、評論數、營業時間（SPEC：Google 資料不存進 repo）。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const key = process.env.GOOGLE_PLACES_KEY;
if (!key) {
  console.error('::error::repo secret GOOGLE_PLACES_KEY 尚未設定（Settings > Secrets and variables > Actions）');
  process.exit(1);
}
// offset 可以是逗號分隔的筆數編號（例如 43,109,301），只查那幾筆
const pick = String(process.argv[2] ?? '0').includes(',') ? process.argv[2].split(',').map(Number) : null;
const offset = pick ? 0 : Number(process.argv[2] ?? 0);
const limit = Number(process.argv[3] ?? 50);
const outFile = process.argv[4] ?? 'out/lookup/result.json';

const listFile = process.argv[5] ?? 'data/staging/import-list.json';
const list = JSON.parse(readFileSync(listFile, 'utf8'));
const regions = JSON.parse(readFileSync('data/regions.json', 'utf8'));

// 縣市名稱（台／臺不分）對應到縣市 id
const norm = (s) => s.replace(/臺/g, '台');
const countyId = new Map();
for (const z of regions.zones) for (const c of z.counties) countyId.set(norm(c.n), c.id);

const FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.businessStatus',
  'places.googleMapsUri',
  'places.addressComponents',
  'places.types',
  'places.primaryType',
].join(',');

const summarize = (p) => {
  const lvl1 = (p.addressComponents ?? []).find((a) => a.types?.includes('administrative_area_level_1'));
  const county = lvl1 ? norm(lvl1.longText) : null;
  return {
    pid: p.id,
    name: p.displayName?.text ?? null,
    addr: p.formattedAddress ?? null,
    ll: p.location ? [p.location.latitude, p.location.longitude] : null,
    business: p.businessStatus ?? null,
    gurl: p.googleMapsUri ?? null,
    county,
    region: county ? (countyId.get(county) ?? null) : null,
    types: p.types ?? [],
    primary: p.primaryType ?? null,
  };
};

// 名稱互相包含（去掉空白與標點）就算吻合；其餘留給人工確認
const squash = (s) => norm(s).toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
const similar = (a, b) => {
  const x = squash(a), y = squash(b);
  return x.length > 0 && y.length > 0 && (x.includes(y) || y.includes(x));
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(q) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS },
      body: JSON.stringify({ textQuery: q, languageCode: 'zh-TW', regionCode: 'TW', maxResultCount: 3 }),
    });
    if (res.ok) return (await res.json()).places ?? [];
    if (res.status === 429 || res.status >= 500) { await sleep(1000 * attempt); continue; }
    throw new Error(`Places API ${res.status}：${(await res.text()).slice(0, 200)}`);
  }
  throw new Error('Places API 多次重試仍失敗');
}

// 清單項目有 pid（例如從 Google Takeout 的網址換算出來的）就直接用 ID 查詳細資料，不再用名稱搜尋
async function details(pid) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(pid)}?languageCode=zh-TW&regionCode=TW`, {
      headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS.replace(/places\./g, '') },
    });
    if (res.ok) return await res.json();
    if (res.status === 429 || res.status >= 500) { await sleep(1000 * attempt); continue; }
    throw new Error(`Places API ${res.status}：${(await res.text()).slice(0, 200)}`);
  }
  throw new Error('Places API 多次重試仍失敗');
}

const results = [];
const idx = pick ?? list.slice(offset, offset + limit).map((_, k) => offset + k);
const slice = idx;
for (const i of idx) {
  const item = list[i];
  try {
    const found = item.pid ? [summarize(await details(item.pid))] : (await search(item.q ?? item.n)).map(summarize);
    const top = found[0] ?? null;
    results.push({
      i,
      n: item.n,
      c: item.c,
      ...(item.note ? { note: item.note } : {}),
      ...(item.status ? { status: item.status } : {}),
      match: top,
      alts: found.slice(1),
      // 吻合：名稱相近、座標與縣市都查得到
      ok: !!(top && top.ll && top.region && (item.pid || similar(item.n, top.name ?? ''))),
    });
  } catch (e) {
    results.push({ i, n: item.n, error: String(e.message ?? e) });
  }
  await sleep(120);
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(results, null, 1) + '\n');
const okN = results.filter((r) => r.ok).length;
const errN = results.filter((r) => r.error).length;
console.log(`已查 ${results.length} 筆（${pick ? '指定 ' + pick.join('、') : `第 ${offset} 到 ${offset + slice.length - 1}`} 筆）：吻合 ${okN}、待確認 ${results.length - okN - errN}、錯誤 ${errN}`);
