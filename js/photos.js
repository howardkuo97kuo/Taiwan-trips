// 地點照片：Google Places (New) 即時載入，不存檔（SPEC「地點照片」）。
// 照片參照只放 sessionStorage；畫面可見或開啟詳情才查；沒有金鑰或查不到就留分類圖示。
import { catIcon } from './icons.js';

const API = 'https://places.googleapis.com/v1';
const MAX_PHOTOS = 6;
const pending = new Map(); // pid → Promise，同一地點同時只查一次
let active = 0;
const queue = [];

function throttle(fn) {
  return new Promise((resolve, reject) => {
    const run = () => {
      active += 1;
      fn().then(resolve, reject).finally(() => { active -= 1; queue.shift()?.(); });
    };
    if (active < 4) run(); else queue.push(run);
  });
}

// opts.strict：失敗時丟錯（詳情頁要顯示原因）；預設失敗回空陣列（縮圖安靜略過）
export function placePhotos(pid, key, { strict = false } = {}) {
  if (!pid || !key) return Promise.resolve([]);
  const ck = `tw-photos:${pid}`;
  try {
    const hit = sessionStorage.getItem(ck);
    if (hit) return Promise.resolve(JSON.parse(hit));
  } catch { /* 無痕模式等 */ }
  if (pending.has(pid)) return strict ? pending.get(pid) : pending.get(pid).catch(() => []);
  const req = throttle(async () => {
    const r = await fetch(`${API}/places/${encodeURIComponent(pid)}?languageCode=zh-TW`, {
      headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'photos.name,photos.authorAttributions' },
    });
    if (!r.ok) throw new Error(`photos ${r.status}`);
    const list = ((await r.json()).photos ?? []).slice(0, MAX_PHOTOS).map((x) => ({
      name: x.name, by: x.authorAttributions?.[0]?.displayName ?? '', uri: x.authorAttributions?.[0]?.uri ?? '',
    }));
    try { sessionStorage.setItem(ck, JSON.stringify(list)); } catch { /* 略過 */ }
    return list;
  }).finally(() => pending.delete(pid));
  pending.set(pid, req);
  return strict ? req : req.catch(() => []);
}

const src = (name, key, w) => `${API}/${name}/media?maxWidthPx=${w}&key=${encodeURIComponent(key)}`;

// 卡片縮圖：進入畫面才查
export function thumb(ctx, p) {
  const key = ctx.config?.google?.placesKey;
  if (!key || !p.pid) return null;
  const { h } = ctx;
  const box = h('div', { class: 'tw-thumb', 'aria-hidden': 'true' }, catIcon(p.c));
  const go = () => placePhotos(p.pid, key).then((list) => {
    if (!list[0]) return;
    const img = h('img', { alt: '', decoding: 'async', src: src(list[0].name, key, 240) });
    img.onload = () => { box.append(img); box.classList.add('is-loaded'); };
  });
  if (!('IntersectionObserver' in window)) { go(); return box; }
  const io = new IntersectionObserver((es) => {
    if (es.some((e) => e.isIntersecting)) { io.disconnect(); go(); }
  }, { rootMargin: '200px' });
  io.observe(box);
  return box;
}

// 詳情輪播：橫向捲動貼齊，附左右鈕、頁點與作者歸屬
export function carousel(ctx, p) {
  const key = ctx.config?.google?.placesKey;
  const { h } = ctx;
  const root = h('section', { class: 'tw-gallery', 'aria-label': `${p.n}的照片` });
  const ph = h('div', { class: 'tw-gallery-empty' }, catIcon(p.c), h('span', {}, key ? (p.pid ? '照片載入中…' : '這個地點沒有 Google 地點代碼') : '尚未設定 Google 金鑰'));
  root.append(ph);
  if (!key || !p.pid) return root;
  let alive = true;
  placePhotos(p.pid, key, { strict: true }).then((list) => {
    if (!alive) return;
    if (!list.length) { ph.lastChild.textContent = '這個地點沒有 Google 照片'; return; }
    const track = h('div', { class: 'tw-gallery-track', tabindex: '0' }, list.map((x, i) =>
      h('figure', { class: 'tw-gallery-item' },
        h('img', { alt: `${p.n} 照片 ${i + 1}`, loading: i ? 'lazy' : 'eager', decoding: 'async', src: src(x.name, key, 900) }),
        x.by && h('figcaption', {}, '照片：', x.uri ? h('a', { href: x.uri, target: '_blank', rel: 'noopener' }, x.by) : x.by))));
    const dots = h('div', { class: 'tw-gallery-dots', 'aria-hidden': 'true' }, list.map(() => h('i', {})));
    const mark = () => {
      const i = Math.round(track.scrollLeft / (track.clientWidth || 1));
      [...dots.children].forEach((d, j) => d.classList.toggle('is-on', j === i));
    };
    const step = (dir) => track.scrollBy({ left: dir * track.clientWidth, behavior: 'smooth' });
    track.addEventListener('scroll', mark, { passive: true });
    root.replaceChildren(track,
      list.length > 1 && h('button', { type: 'button', class: 'tw-gallery-nav is-prev', 'aria-label': '上一張', onclick: () => step(-1) }, '‹'),
      list.length > 1 && h('button', { type: 'button', class: 'tw-gallery-nav is-next', 'aria-label': '下一張', onclick: () => step(1) }, '›'),
      list.length > 1 && dots);
    mark();
  }).catch((e) => {
    if (alive) ph.lastChild.textContent = `照片查詢失敗（${e.message}）`;
  });
  root.destroy = () => { alive = false; };
  return root;
}
