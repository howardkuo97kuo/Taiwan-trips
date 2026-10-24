// 地點照片：Google Places (New) 即時載入，不存檔（SPEC「地點照片」）。
// 照片參照只放 sessionStorage；畫面可見或開啟詳情才查；沒有金鑰或查不到就留分類圖示。
import { catIcon } from './icons.js';

const API = 'https://places.googleapis.com/v1';
const MAX_PHOTOS = 10; // Places API 一次最多回 10 張
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

// ── 放大檢視：整頁蓋上去，← → 換張、Esc 或點背景關閉 ──
function openLightbox(ctx, p, list, key, start) {
  const { h } = ctx;
  const back = document.activeElement;
  let i = start;
  const img = h('img', { alt: '', decoding: 'async' });
  const cap = h('p', { class: 'tw-lightbox-cap' });
  const count = h('span', { class: 'tw-lightbox-count' });
  const close = () => { document.removeEventListener('keydown', onKey); box.remove(); document.body.classList.remove('tw-noscroll'); back?.focus?.(); };
  const go = (d) => { i = (i + d + list.length) % list.length; show(); };
  const show = () => {
    const x = list[i];
    img.src = src(x.name, key, 2000);
    img.alt = `${p.n} 照片 ${i + 1}`;
    count.textContent = `${i + 1} / ${list.length}`;
    cap.replaceChildren('照片：', x.uri ? h('a', { href: x.uri, target: '_blank', rel: 'noopener' }, x.by || 'Google 使用者') : (x.by || 'Google 使用者'));
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
  };
  const closeBtn = h('button', { type: 'button', class: 'tw-lightbox-x', 'aria-label': '關閉', onclick: close }, '×');
  const box = h('div', { class: 'tw-lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${p.n}的照片`, onclick: (e) => { if (e.target === box) close(); } },
    closeBtn, img,
    list.length > 1 && h('button', { type: 'button', class: 'tw-lightbox-nav is-prev', 'aria-label': '上一張', onclick: () => go(-1) }, '‹'),
    list.length > 1 && h('button', { type: 'button', class: 'tw-lightbox-nav is-next', 'aria-label': '下一張', onclick: () => go(1) }, '›'),
    h('div', { class: 'tw-lightbox-bar' }, count, cap));
  show();
  document.body.append(box);
  document.body.classList.add('tw-noscroll');
  document.addEventListener('keydown', onKey);
  closeBtn.focus();
}

// 卡片縮圖：進入畫面才查。count > 1 時並排顯示前幾張（卡片用 3 張，快速選擇用 1 張）
export function thumb(ctx, p, { count = 1 } = {}) {
  const key = ctx.config?.google?.placesKey;
  if (!key || !p.pid) return null;
  const { h } = ctx;
  const first = h('div', { class: 'tw-thumb', 'aria-hidden': 'true' }, catIcon(p.c));
  const box = count > 1 ? h('div', { class: 'tw-thumbs', 'aria-hidden': 'true' }, first) : first;
  const fill = (el, item, w) => {
    const img = h('img', { alt: '', decoding: 'async', src: src(item.name, key, w) });
    img.onload = () => { el.append(img); el.classList.add('is-loaded'); };
  };
  const go = () => placePhotos(p.pid, key).then((list) => {
    if (!list[0]) return;
    fill(first, list[0], count > 1 ? 480 : 360);
    for (let i = 1; i < Math.min(count, list.length); i++) {
      const t = h('div', { class: 'tw-thumb' });
      box.append(t);
      fill(t, list[i], 480);
    }
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
        h('button', { type: 'button', class: 'tw-gallery-zoom', 'aria-label': `放大看第 ${i + 1} 張照片`, onclick: () => openLightbox(ctx, p, list, key, i) },
          h('img', { alt: `${p.n} 照片 ${i + 1}`, loading: i ? 'lazy' : 'eager', decoding: 'async', src: src(x.name, key, 1600) })),
        x.by && h('figcaption', {}, '照片：', x.uri ? h('a', { href: x.uri, target: '_blank', rel: 'noopener' }, x.by) : x.by))));
    const strip = list.length > 1 && h('div', { class: 'tw-gallery-strip', role: 'group', 'aria-label': '照片縮圖' }, list.map((x, i) =>
      h('button', { type: 'button', class: 'tw-gallery-chip', 'aria-label': `看第 ${i + 1} 張`, onclick: () => track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' }) },
        h('img', { alt: '', loading: 'lazy', decoding: 'async', src: src(x.name, key, 240) }))));
    const dots = h('div', { class: 'tw-gallery-dots', 'aria-hidden': 'true' }, list.map(() => h('i', {})));
    const mark = () => {
      const i = Math.round(track.scrollLeft / (track.clientWidth || 1));
      [...dots.children].forEach((d, j) => d.classList.toggle('is-on', j === i));
      strip && [...strip.children].forEach((c, j) => c.classList.toggle('is-on', j === i));
    };
    const step = (dir) => track.scrollBy({ left: dir * track.clientWidth, behavior: 'smooth' });
    track.addEventListener('scroll', mark, { passive: true });
    root.replaceChildren(track,
      list.length > 1 && h('button', { type: 'button', class: 'tw-gallery-nav is-prev', 'aria-label': '上一張', onclick: () => step(-1) }, '‹'),
      list.length > 1 && h('button', { type: 'button', class: 'tw-gallery-nav is-next', 'aria-label': '下一張', onclick: () => step(1) }, '›'),
      list.length > 1 && dots,
      strip);
    mark();
  }).catch((e) => {
    if (alive) ph.lastChild.textContent = `照片查詢失敗（${e.message}）`;
  });
  root.destroy = () => { alive = false; };
  return root;
}
