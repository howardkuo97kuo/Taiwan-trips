// 共用狀態：單一 store，模組透過 get / set / subscribe 溝通。只有 B 能改。
//
// 欄位（契約，改動先改 docs/MODULES.md）：
//   config    data/config.json
//   regions   data/regions.json 原樣（形狀由 A 決定）
//   places    data/places.json 加上 Firebase /places（排程查好、等併回的新地點）的合併陣列，未過濾
//   marks     { apong: {placeId: mark}, baobao: {placeId: mark} }，即時同步
//   who       'apong' | 'baobao' | null，記在 localStorage twWho
//   route     { name, params }，目前畫面
//   online    Firebase 串流是否連著
//   synced    第一次標記資料是否已到
import { loadJson } from './util.js';

const WHO_KEY = 'twWho';
const WHO_IDS = ['apong', 'baobao'];

const state = {
  config: null,
  regions: null,
  places: [], // data/places.json 與 Firebase /places 合併後的結果
  marks: { apong: {}, baobao: {} },
  who: null,
  route: { name: 'home', params: [] },
  online: false,
  synced: false,
};

const subs = new Map(); // key -> Set<fn>

export const get = (key) => state[key];

export function set(key, value) {
  state[key] = value;
  for (const fn of subs.get(key) ?? []) fn(value, key);
  for (const fn of subs.get('*') ?? []) fn(value, key);
}

// subscribe('marks', fn)；key 用 '*' 聽全部。回傳取消函式。
export function subscribe(key, fn) {
  if (!subs.has(key)) subs.set(key, new Set());
  subs.get(key).add(fn);
  return () => subs.get(key).delete(fn);
}

// ── 身分 ──
export const whoIds = () => WHO_IDS.slice();

export function whoName(id) {
  return state.config?.who?.find((w) => w.id === id)?.name ?? id;
}

export function otherWho(id = state.who) {
  return id === 'apong' ? 'baobao' : id === 'baobao' ? 'apong' : null;
}

export function setWho(id) {
  if (!WHO_IDS.includes(id)) return;
  try { localStorage.setItem(WHO_KEY, id); } catch { /* 無痕模式等 */ }
  set('who', id);
}

export function readWho() {
  try {
    const v = localStorage.getItem(WHO_KEY);
    return WHO_IDS.includes(v) ? v : null;
  } catch {
    return null;
  }
}

// ── 資料載入 ──
// places.json 可以是陣列，或 { places: [...] }
export async function loadData() {
  const [config, regions, places] = await Promise.all([
    loadJson('data/config.json', {}),
    loadJson('data/regions.json', null),
    loadJson('data/places.json', []),
  ]);
  set('config', config);
  set('regions', regions);
  basePlaces = Array.isArray(places) ? places : places?.places ?? [];
  mergePlaces();
}

// ── 地點合併點 ──
// data/places.json 是唯一來源；Firebase /places 裡還沒併回 repo 的新地點補在後面。
// repo 的地點優先：id 或 pid 已在 repo 就略過（併回之後遠端那筆自然失效）。
let basePlaces = [];
let remotePlaces = [];
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function validRemote(p) {
  return p && typeof p === 'object'
    && typeof p.id === 'string' && ID_RE.test(p.id)
    && typeof p.n === 'string' && p.n
    && typeof p.region === 'string'
    && Array.isArray(p.ll) && p.ll.length === 2 && p.ll.every((x) => typeof x === 'number')
    && (state.config?.categories ?? []).includes(p.c);
}

function mergePlaces() {
  const ids = new Set(basePlaces.map((p) => p.id));
  const pids = new Set(basePlaces.map((p) => p.pid).filter(Boolean));
  const extra = remotePlaces.filter((p) => !ids.has(p.id) && !(p.pid && pids.has(p.pid)));
  set('places', extra.length ? [...basePlaces, ...extra] : basePlaces);
}

// 給 sync.js 用：傳入 /places 的原始內容（物件或陣列），格式不合的略過
export function setRemotePlaces(raw) {
  const seen = new Set();
  remotePlaces = Object.values(raw ?? {}).filter((p) => {
    if (!validRemote(p) || seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  mergePlaces();
}

// 預設只顯示 open（契約）
export const isVisible = (p) => (p.status ?? 'open') === 'open';

export const placeById = (id) => state.places.find((p) => p.id === id) ?? null;
