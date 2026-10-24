// 格式驗證（CI 守門員）。契約見 docs/SPEC.md；沒有的資料檔會略過，等 A 模組補上後自動生效。
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const errors = [];
const err = (file, msg) => errors.push(`${file}: ${msg}`);

const load = (rel) => {
  const p = join(root, rel);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    err(rel, `不是合法的 JSON（${e.message}）`);
    return null;
  }
};

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const STATUS = ['open', 'closed', 'moved'];
const MODES = ['drive', 'transit', 'walk', 'bike'];
// 含金門、馬祖、澎湖、蘭嶼
const BBOX = { latMin: 21.5, latMax: 26.5, lngMin: 118.0, lngMax: 122.5 };
// Google 資料不得存進 repo（Places 條款），見 SPEC「Google 資料」
const FORBIDDEN_PLACE_KEYS = ['h', 'oh', 'rt', 'rv'];

// config.json
const config = load('data/config.json');
if (!config) err('data/config.json', '缺少或無法讀取');
else {
  for (const k of ['siteName', 'prefix', 'tz', 'who', 'categories']) {
    if (config[k] == null) err('data/config.json', `缺少欄位 ${k}`);
  }
  if (config.tz && config.tz !== 'Asia/Taipei') err('data/config.json', 'tz 必須是 Asia/Taipei');
  if (config.prefix && config.prefix !== 'tw') err('data/config.json', 'prefix 必須是 tw');
  const whoIds = (config.who ?? []).map((w) => w.id).sort().join(',');
  if (whoIds !== 'apong,baobao') err('data/config.json', 'who 只能是 apong 與 baobao');
}
const categories = new Set(config?.categories ?? []);

// regions.json：形狀由 A 模組決定，這裡只收集所有 id 並檢查格式與重複
const regionIds = new Set();
const regions = load('data/regions.json');
if (regions) {
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      if (typeof node.id === 'string') {
        if (!ID_RE.test(node.id)) err('data/regions.json', `地區 id 格式不合：${node.id}`);
        if (regionIds.has(node.id)) err('data/regions.json', `地區 id 重複：${node.id}`);
        regionIds.add(node.id);
      }
      Object.values(node).forEach(walk);
    }
  };
  walk(regions);
}

// places.json
const placeIds = new Map();
const places = load('data/places.json');
if (places) {
  const list = Array.isArray(places) ? places : places.places;
  if (!Array.isArray(list)) err('data/places.json', '必須是陣列，或含 places 陣列的物件');
  else {
    const pids = new Set();
    list.forEach((p, i) => {
      const at = `places[${i}]${p?.id ? ` (${p.id})` : ''}`;
      const bad = (msg) => err('data/places.json', `${at} ${msg}`);
      for (const k of ['id', 'n', 'c', 'region', 'll']) if (p[k] == null) bad(`缺少必填欄位 ${k}`);
      if (typeof p.id === 'string') {
        if (!ID_RE.test(p.id)) bad('id 格式不合（英文小寫、數字、連字號）');
        if (placeIds.has(p.id)) bad('id 重複');
        placeIds.set(p.id, p);
      }
      if (p.c != null && !categories.has(p.c)) bad(`分類不在清單內：${p.c}`);
      if (p.c2 != null) {
        if (!Array.isArray(p.c2) || p.c2.length > 2) bad('c2 必須是最多 2 個的陣列');
        else for (const c of p.c2) if (!categories.has(c)) bad(`副分類不在清單內：${c}`);
      }
      if (p.region != null && regionIds.size && !regionIds.has(p.region)) bad(`region 不是合法地區 id：${p.region}`);
      if (p.ll != null) {
        const ok = Array.isArray(p.ll) && p.ll.length === 2 && p.ll.every((x) => typeof x === 'number');
        if (!ok) bad('ll 必須是 [緯度, 經度]');
        else {
          const [lat, lng] = p.ll;
          if (lat < BBOX.latMin || lat > BBOX.latMax || lng < BBOX.lngMin || lng > BBOX.lngMax) bad(`座標不在台灣範圍：${p.ll}`);
        }
      }
      if (p.llsrc != null && !['osm', 'manual'].includes(p.llsrc)) bad('llsrc 必須是 osm 或 manual');
      if (p.status != null && !STATUS.includes(p.status)) bad(`status 必須是 ${STATUS.join('、')}`);
      if (p.pid) {
        if (pids.has(p.pid)) bad(`pid 重複：${p.pid}`);
        pids.add(p.pid);
      }
      for (const k of FORBIDDEN_PLACE_KEYS) if (k in p) bad(`不得存放 ${k}（Google 資料不存入 repo）`);
    });
  }
}

// itineraries
const itDir = join(root, 'data/itineraries');
if (existsSync(itDir)) {
  for (const f of readdirSync(itDir).filter((f) => f.endsWith('.json'))) {
    const rel = `data/itineraries/${f}`;
    const it = load(rel);
    if (!it) continue;
    for (const k of ['id', 'title', 'region', 'days']) if (it[k] == null) err(rel, `缺少欄位 ${k}`);
    if (!Array.isArray(it.days)) { err(rel, 'days 必須是陣列'); continue; }
    it.days.forEach((d, di) => {
      const stops = d.stops ?? [];
      stops.forEach((s, si) => {
        const at = `days[${di}].stops[${si}]`;
        const pl = placeIds.get(s.place);
        if (placeIds.size && !pl) err(rel, `${at} 地點不存在：${s.place}`);
        else if (pl && (pl.status ?? 'open') !== 'open') err(rel, `${at} 地點不是 open：${s.place}`);
        const last = si === stops.length - 1;
        if (last) {
          if (s.next) err(rel, `${at} 最後一站不應有 next`);
        } else if (!s.next || !MODES.includes(s.next.mode) || typeof s.next.min !== 'number') {
          err(rel, `${at} 每段 next 都要有 mode（${MODES.join('、')}）與 min`);
        }
      });
    });
  }
}

// 不得殘留清邁站的內容（docs、CLAUDE.md 與本腳本會合法提到，不掃）
const LEFTOVER = /\b(cnx|Thailand|Bangkok)\b|清邁/;
const skip = new Set(['.git', 'node_modules', 'docs', 'scripts']);
const scan = (dir) => {
  for (const name of readdirSync(dir)) {
    if (skip.has(name) || name === 'CLAUDE.md') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) scan(p);
    else if (/\.(json|html|js|mjs|css|yml|yaml|md|webmanifest)$/.test(name) && LEFTOVER.test(readFileSync(p, 'utf8'))) {
      err(relative(root, p), '殘留清邁站內容（cnx／Thailand／Bangkok／清邁）');
    }
  }
};
scan(root);

if (errors.length) {
  console.error(`驗證失敗，共 ${errors.length} 個問題：`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`驗證通過（地點 ${placeIds.size}、地區 ${regionIds.size}）`);
