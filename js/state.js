// 共用狀態：單一 store，模組透過 get / set / subscribe 溝通。只有 B 能改。
//
// 欄位（契約，改動先改 docs/MODULES.md）：
//   config    data/config.json
//   regions   data/regions.json 原樣（形狀由 A 決定）
//   places    data/places.json 的地點陣列（已含 status，未過濾）
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
  places: [],
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
  set('places', Array.isArray(places) ? places : places?.places ?? []);
}

// 預設只顯示 open（契約）
export const isVisible = (p) => (p.status ?? 'open') === 'open';

export const placeById = (id) => state.places.find((p) => p.id === id) ?? null;
