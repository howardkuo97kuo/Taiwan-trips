// 地區瀏覽、篩選、地點詳情（路由 #/r/<regionId>、#/p/<placeId>）。模組 D。
// 輸出 placeCard、listView、findRegion、inRegion 給 map.js 用。
import { catIcon } from './icons.js';
import { thumb, carousel } from './photos.js';
import { markBar, markCompare, statusOf, quickMark, takeFx, likeOf } from './marks.js';

// ── 地區工具 ──
// 回傳 { level:'zone'|'county'|'district', node, zone, county, trail:[{id,n}] }；找不到回 null
export function findRegion(regions, id) {
  for (const z of regions?.zones ?? []) {
    if (z.id === id) return { level: 'zone', node: z, zone: z, county: null, trail: [z] };
    for (const c of z.counties ?? []) {
      if (c.id === id) return { level: 'county', node: c, zone: z, county: c, trail: [z, c] };
      for (const d of c.districts ?? []) {
        if (d.id === id) return { level: 'district', node: d, zone: z, county: c, trail: [z, c, d] };
      }
    }
  }
  return null;
}

// 地點的 region 是否落在 regionId 底下（含自己）
export const inRegion = (p, regionId) => p.region === regionId || p.region?.startsWith(`${regionId}-`);

// 地區底下可見地點數
export const countIn = (store, regionId) =>
  store.get('places').filter((p) => store.isVisible(p) && inRegion(p, regionId)).length;

// ── 篩選 ──
const MARK_FILTERS = [
  ['all', '不限標記'],
  ['mine-want', '我想去'],
  ['both-want', '兩人都想去'],
  ['one-want', '只有一人想去'],
  ['not-been', '我還沒去過'],
  ['mine-been', '我去過'],
];

// 篩選條件在換頁時保留（只存記憶體）
const filters = { cats: new Set(), mark: 'all', q: '', live: 'all', sort: 'default' };

// 一次最多替目前清單查幾筆 Google 即時資料（控制 Places 費用）、同時幾個請求
const LIVE_BATCH = 40;
const LIVE_PARALLEL = 4;
const LIVE_TTL = 30 * 60 * 1000; // 營業中會隨時間變，超過 30 分鐘就當沒查過

function passMark(store, p) {
  if (filters.mark === 'all') return true;
  const me = store.get('who');
  const s = statusOf(store, p.id);
  const mine = me ? s[me] : { want: false, been: false };
  switch (filters.mark) {
    case 'mine-want': return mine.want;
    case 'mine-been': return mine.been;
    case 'not-been': return !mine.been;
    case 'both-want': return s.apong.want && s.baobao.want;
    case 'one-want': return s.apong.want !== s.baobao.want;
    default: return true;
  }
}

function passFilters(store, p, { skipLive = false } = {}) {
  if (filters.cats.size && ![p.c, p.c2].flat().some((c) => c && filters.cats.has(c))) return false;
  if (!passMark(store, p)) return false;
  if (!skipLive && filters.live === 'open' && cachedLive(p.pid)?.currentOpeningHours?.openNow !== true) return false;
  const q = filters.q.trim().toLowerCase();
  if (q && !`${p.n} ${p.a ?? ''} ${p.note ?? ''}`.toLowerCase().includes(q)) return false;
  return true;
}

// ── 卡片：一張鐵路車票 ──
// 左邊票根（分類、縣市），中間店名與地址，右邊兩人的「想去」圓點與「蓋章」。
// 兩人都想去時，票上多一個「雙人票」小牌；剛蓋章時蓋章動畫播一次（takeFx）。
const stampSVG = (ym) => `<svg viewBox="0 0 90 90" aria-hidden="true"><circle cx="45" cy="45" r="41" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="45" cy="45" r="34" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 3"/><text x="45" y="44" text-anchor="middle" font-size="22">去過</text><text x="45" y="62" text-anchor="middle" font-size="12" class="ym">${/^\d{4}-\d{2}$/.test(ym ?? '') ? ym.replace('-', '·') : ''}</text></svg>`;

export function placeCard(ctx, p) {
  const { h, store } = ctx;
  const who = store.get('who');
  const other = store.otherWho(who);
  const s = statusOf(store, p.id);
  const me = who ? s[who] : null;
  const ot = who ? s[other] : null;
  const county = findRegion(store.get('regions'), p.region)?.county?.n ?? '';
  const pair = s.apong.want && s.baobao.want;
  const fx = takeFx(p.id);
  let media;
  const name = (id) => store.whoName(id);

  const dot = (id, mine) => {
    const on = s[id].want;
    return mine
      ? h('button', { type: 'button', class: `tw-mark-dot${on ? ' is-on' : ''}`, 'aria-pressed': on ? 'true' : 'false',
        'aria-label': `${name(id)}想去：${p.n}`, onclick: () => quickMark(ctx, p.id, 'want') })
      : h('span', { class: `tw-mark-dot is-ghost${on ? ' is-on' : ''}`, role: 'img', 'aria-label': `${name(id)}${on ? '想去' : '沒有標想去'}` });
  };
  // 沒選身分時兩個都只讀，點了會提示先選身分
  const wantRow = who
    ? [h('span', { class: 'tw-mark-wb' }, dot(who, true), name(who)), h('span', { class: 'tw-mark-wb' }, dot(other, false), name(other))]
    : ['apong', 'baobao'].map((id) => h('span', { class: 'tw-mark-wb' }, h('button', {
      type: 'button', class: `tw-mark-dot${s[id].want ? ' is-on' : ''}`, 'aria-label': `${name(id)}${s[id].want ? '想去' : '沒有標想去'}（先選身分才能標記）`,
      onclick: () => quickMark(ctx, p.id, 'want') }), name(id)));

  const beenMark = who ? me.mark : (s.apong.mark?.been ? s.apong.mark : s.baobao.mark);
  const stamped = who ? me.been : (s.apong.been || s.baobao.been);
  const stampBtn = stamped
    ? h('button', { type: 'button', class: `tw-mark-stamp${fx.slam ? ' is-slam' : ''}`, 'aria-pressed': 'true',
      'aria-label': `取消蓋章：${p.n}`, onclick: () => quickMark(ctx, p.id, 'been') })
    : h('button', { type: 'button', class: 'tw-mark-stamp-empty', 'aria-pressed': 'false', 'aria-label': `蓋章去過：${p.n}`,
      onclick: () => quickMark(ctx, p.id, 'been') }, '標去過');
  if (stamped) stampBtn.innerHTML = stampSVG(beenMark?.ym);

  const ghostBits = (id, m) => [name(id), m.want && '想去', m.skip && '不想去', m.been && `去過${m.mark?.ym ? ` ${m.mark.ym}` : ''}`].filter(Boolean).join(' ');
  // 卡片上簡短顯示兩人的喜歡程度（只有去過且有填才出現）
  const likeTags = ['apong', 'baobao'].map((id) => {
    const lk = likeOf(s[id].mark?.like);
    return lk && h('span', { class: `tw-place-like is-${lk.id}`, title: `${name(id)}：${lk.label}` }, `${lk.icon} ${name(id)}`);
  }).filter(Boolean);
  const ghost = who
    ? `${ghostBits(other, ot)}${!ot.want && !ot.been ? ' 還沒標' : ''}`
    : '';

  return h('article', { class: `tw-place-card${pair ? ' is-pair' : ''}${me?.skip ? ' is-skipped' : ''}`, dataset: { pid: p.id } },
    pair && h('span', { class: `tw-place-pair${fx.pair ? ' is-fresh' : ''}` }, '兩人都想去'),
    h('a', { class: 'tw-place-stub', href: `#/p/${p.id}`, 'aria-hidden': 'true', tabindex: '-1' },
      catIcon(p.c), h('span', { class: 'tw-place-c' }, p.c), h('span', { class: 'tw-place-z' }, county.replace(/[縣市]$/, ''))),
    h('div', { class: 'tw-place-mid' },
      h('a', { class: 'tw-place-name', href: `#/p/${p.id}` }, p.n),
      p.a && h('div', { class: 'tw-place-addr' }, p.a),
      who && ghost && h('div', { class: 'tw-place-ghost' }, ghost),
      likeTags.length > 0 && h('div', { class: 'tw-place-likes' }, likeTags)),
    h('div', { class: 'tw-mark-want', role: 'group', 'aria-label': `${p.n}的想去` }, h('div', { class: 'tw-mark-wrow' }, wantRow), h('span', { class: 'tw-mark-wl' }, '標想去'),
      h('button', { type: 'button', class: 'tw-mark-skip', 'aria-pressed': me?.skip ? 'true' : 'false', 'aria-label': `不想去：${p.n}`,
        onclick: () => quickMark(ctx, p.id, 'skip') }, me?.skip ? '已標：不想去' : '不想去')),
    h('div', { class: 'tw-mark-stampzone' }, stampBtn,
      stamped && who && h('button', { type: 'button', class: 'tw-mark-again', 'aria-pressed': me.again ? 'true' : 'false',
        onclick: () => quickMark(ctx, p.id, 'again') }, me.again ? '已標：想再去' : '標成想再去')),
    (media = thumb(ctx, p, { count: 3 })) && h('div', { class: 'tw-place-media' }, media),
    googleDetails(ctx, p));
}

// 卡片上的「Google 地址・評分・評論」：點開才查（一次一個地點，不佔批次額度），開著的會在清單重畫時保持開著
const openG = new Set();
function googleDetails(ctx, p) {
  const key = ctx.config?.google?.placesKey;
  if (!key || !p.pid) return null;
  const { h } = ctx;
  const cached = cachedDetail(p.pid);
  const sum = h('summary', {}, h('span', { class: 'tw-gd-title' }, 'Google 地址・評分・評論'),
    cached?.rating && h('span', { class: 'tw-gd-rating' }, `★ ${cached.rating.toFixed(1)}（${(cached.userRatingCount ?? 0).toLocaleString('zh-TW')}）`));
  const body = h('div', { class: 'tw-gd-body' });
  const det = h('details', { class: 'tw-place-gd' }, sum, body);
  let loaded = false;
  const load = () => {
    if (loaded) return;
    loaded = true;
    body.append(h('p', { class: 'tw-hint' }, '查詢 Google 地址、評分與評論…'));
    liveDetail(p.pid, key).then((d) => {
      ctx.clear(body).append(...liveContent(ctx, p, d));
      if (d.rating && !sum.querySelector('.tw-gd-rating')) sum.append(h('span', { class: 'tw-gd-rating' }, `★ ${d.rating.toFixed(1)}（${(d.userRatingCount ?? 0).toLocaleString('zh-TW')}）`));
    }).catch((e) => { loaded = false; ctx.clear(body).append(h('p', { class: 'tw-hint' }, `暫時查不到 Google 資料（${e.message}），再按一次收合後展開試試。`)); });
  };
  det.addEventListener('toggle', () => { if (det.open) { openG.add(p.id); load(); } else openG.delete(p.id); });
  if (openG.has(p.id)) { det.open = true; load(); }
  return det;
}

// 篩選列＋清單。places 是已限定地區的可見地點。
// 回傳 { el, destroy }：標記更新時只重畫清單，不動篩選列（輸入框才不會失焦）。
export function listView(ctx, places, { limit = 60 } = {}) {
  const { h, clear, store } = ctx;
  const cats = ctx.config?.categories ?? [];
  const root = h('div', { class: 'tw-place-browser' });
  const listEl = h('div', { class: 'tw-place-list' });
  let shown = limit;

  const drawList = () => {
    clear(listEl);
    const rows = places.filter((p) => passFilters(store, p));
    if (filters.sort === 'rating') {
      const r = (p) => cachedLive(p.pid)?.rating ?? -1;
      rows.sort((a, b) => r(b) - r(a));
    }
    const head = h('p', { class: 'tw-hint tw-place-count' }, `${rows.length} 個地點`);
    if (!rows.length) {
      listEl.append(head, h('p', { class: 'tw-empty' }, '沒有符合的地點，換個篩選看看。'));
      return;
    }
    listEl.append(head, ...rows.slice(0, shown).map((p) => placeCard(ctx, p)));
    if (rows.length > shown) {
      listEl.append(h('button', { type: 'button', class: 'tw-place-more', onclick: () => { shown += limit; drawList(); } },
        `再顯示 ${Math.min(limit, rows.length - shown)} 個`));
    }
  };

  const catRow = h('div', { class: 'tw-place-filter-cats', role: 'group', 'aria-label': '分類' });
  const drawCats = () => {
    clear(catRow);
    for (const c of cats) {
      const n = places.filter((p) => p.c === c || (Array.isArray(p.c2) ? p.c2.includes(c) : p.c2 === c)).length;
      if (!n) continue;
      catRow.append(h('button', {
        type: 'button', class: `tw-place-chip${filters.cats.has(c) ? ' is-on' : ''}`,
        'aria-pressed': filters.cats.has(c) ? 'true' : 'false',
        onclick: () => { filters.cats.has(c) ? filters.cats.delete(c) : filters.cats.add(c); shown = limit; drawCats(); drawList(); },
      }, catIcon(c), `${c} ${n}`));
    }
  };

  const search = h('input', { type: 'search', class: 'tw-place-search', placeholder: '搜尋名稱、地址、備註', 'aria-label': '搜尋' });
  search.value = filters.q;
  search.addEventListener('input', () => { filters.q = search.value; shown = limit; drawList(); });
  const markSel = h('select', { class: 'tw-place-mark-filter', 'aria-label': '標記篩選' },
    MARK_FILTERS.map(([v, label]) => h('option', { value: v, selected: v === filters.mark }, label)));
  markSel.addEventListener('change', () => { filters.mark = markSel.value; shown = limit; drawList(); });

  const liveSel = h('select', { class: 'tw-place-mark-filter', 'aria-label': '營業狀態篩選' },
    [['all', '不限營業'], ['open', '現在營業（已查詢的）']].map(([v, label]) => h('option', { value: v, selected: v === filters.live }, label)));
  liveSel.addEventListener('change', () => { filters.live = liveSel.value; shown = limit; drawList(); });
  const sortSel = h('select', { class: 'tw-place-mark-filter', 'aria-label': '排序' },
    [['default', '預設排序'], ['rating', '評分高到低（已查詢的）']].map(([v, label]) => h('option', { value: v, selected: v === filters.sort }, label)));
  sortSel.addEventListener('change', () => { filters.sort = sortSel.value; shown = limit; drawList(); });

  // 營業中與評分要向 Google 即時查；不自動全查，按了才替目前清單前 LIVE_BATCH 筆查（只放這次瀏覽）
  const key = ctx.config?.google?.placesKey;
  const liveBtn = key && h('button', { type: 'button', class: 'tw-place-more tw-place-livebtn' }, '查詢這批的營業狀態與評分');
  let busy = false;
  if (liveBtn) liveBtn.addEventListener('click', async () => {
    if (busy) return;
    const todo = places.filter((p) => p.pid && passFilters(store, p, { skipLive: true }) && !cachedLive(p.pid)).slice(0, LIVE_BATCH);
    if (!todo.length) { liveBtn.textContent = '這批都查過了'; return; }
    busy = true;
    let done = 0;
    const tick = () => { liveBtn.textContent = `查詢中 ${done}／${todo.length}…`; };
    tick();
    const queue = [...todo];
    await Promise.all(Array.from({ length: LIVE_PARALLEL }, async () => {
      while (queue.length) {
        const p = queue.shift();
        try { await livePlace(p.pid, key); } catch { /* 單筆失敗略過 */ }
        done++; tick();
      }
    }));
    busy = false;
    liveBtn.textContent = `已查 ${todo.length} 筆，可用「現在營業」篩選或評分排序（最多一次 ${LIVE_BATCH} 筆，會用到 Google 查詢額度）`;
    drawList();
  });
  if (liveBtn) liveBtn.textContent = `查詢這批的營業狀態與評分（一次最多 ${LIVE_BATCH} 筆，會用到 Google 查詢額度）`;

  root.append(h('div', { class: 'tw-place-filters' }, search, markSel, liveSel, sortSel), catRow, liveBtn || '', listEl);
  drawCats();
  drawList();
  const off = store.subscribe('marks', drawList);
  return { el: root, destroy: off };
}

// ── 地區頁 ──
function mountRegion(el, ctx) {
  const { h, store } = ctx;
  const id = ctx.route.params[0];
  const found = findRegion(store.get('regions'), id);
  if (!found) {
    el.append(h('p', { class: 'tw-empty' }, '找不到這個地區。'), h('a', { href: '#/' }, '回地圖'));
    return;
  }
  const { node, trail } = found;
  const places = store.get('places').filter((p) => store.isVisible(p) && inRegion(p, id));

  // 往下一層（沒有地點的不顯示）
  const kids = found.level === 'zone' ? node.counties : found.level === 'county' ? node.districts ?? [] : [];
  const kidLinks = kids.map((k) => [k, countIn(store, k.id)]).filter(([, n]) => n > 0);

  el.append(h('div', { class: 'tw-place-view' },
    h('nav', { class: 'tw-place-crumbs', 'aria-label': '路徑' },
      h('a', { href: '#/' }, '全台'),
      trail.flatMap((t, i) => [' › ', i === trail.length - 1 ? h('span', {}, t.n) : h('a', { href: `#/r/${t.id}` }, t.n)])),
    h('h1', {}, node.n),
    h('p', { class: 'tw-hint' }, `${places.length} 個地點`),
    kidLinks.length > 0 && h('div', { class: 'tw-place-kids' }, kidLinks.map(([k, n]) =>
      h('a', { class: 'tw-place-kid', href: `#/r/${k.id}` }, `${k.n} ${n}`)))));

  if (!places.length) {
    el.append(h('p', { class: 'tw-empty' }, '這個地區還沒有地點。'));
    return;
  }
  const lv = listView(ctx, places);
  el.append(lv.el);
  return lv.destroy;
}

// ── Google 即時資料（評分、營業時間）──
// 條款不允許長期保存，只放 sessionStorage；沒填瀏覽器用金鑰就只給 Google 地圖連結。
// 讀已查過且還新鮮的結果（沒有就回 null）；清單的「現在營業」篩選與評分排序只看這些。
function cachedLive(pid) {
  if (!pid) return null;
  try {
    const hit = JSON.parse(sessionStorage.getItem(`twLive:${pid}`) ?? 'null');
    return hit && Date.now() - (hit._t ?? 0) < LIVE_TTL ? hit : null;
  } catch { return null; }
}

async function livePlace(pid, key) {
  const ck = `twLive:${pid}`;
  try {
    const hit = cachedLive(pid);
    if (hit) return hit;
  } catch { /* 無痕模式等 */ }
  const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(pid)}?languageCode=zh-TW`, {
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'rating,userRatingCount,currentOpeningHours.openNow,regularOpeningHours.weekdayDescriptions',
    },
  });
  if (!r.ok) throw new Error(`places ${r.status}`);
  const d = await r.json();
  d._t = Date.now();
  try { sessionStorage.setItem(ck, JSON.stringify(d)); } catch { /* 略過 */ }
  return d;
}

// 詳情頁用的完整即時資料：地址、營業時間、評分、評論。
// Google 只提供「最相關的最多 5 則」評論，看全部要開 Google 地圖；全部只放 sessionStorage，不存進 repo。
const DETAIL_MASK = ['rating', 'userRatingCount', 'formattedAddress', 'googleMapsUri', 'currentOpeningHours.openNow',
  'regularOpeningHours.weekdayDescriptions', 'reviews.rating', 'reviews.text', 'reviews.originalText',
  'reviews.relativePublishTimeDescription', 'reviews.authorAttribution'].join(',');

function cachedDetail(pid) {
  try {
    const hit = JSON.parse(sessionStorage.getItem(`twLiveD:${pid}`) ?? 'null');
    return hit && Date.now() - (hit._t ?? 0) < LIVE_TTL ? hit : cachedLive(pid);
  } catch { return null; }
}

async function liveDetail(pid, key) {
  const ck = `twLiveD:${pid}`;
  try {
    const hit = JSON.parse(sessionStorage.getItem(ck) ?? 'null');
    if (hit && Date.now() - (hit._t ?? 0) < LIVE_TTL) return hit;
  } catch { /* 無痕模式等 */ }
  const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(pid)}?languageCode=zh-TW`, {
    headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': DETAIL_MASK },
  });
  if (!r.ok) throw new Error(`places ${r.status}`);
  const d = await r.json();
  d._t = Date.now();
  try { sessionStorage.setItem(ck, JSON.stringify(d)); } catch { /* 略過 */ }
  return d;
}

const DAY_ZH = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
const todayZh = () => {
  const w = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', weekday: 'short' }).format(new Date());
  return DAY_ZH[['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(w)];
};
const starText = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));

// 評分、地址、營業時間、評論的內容（詳情頁與卡片展開共用）。回傳元素陣列。
function liveContent(ctx, p, d) {
  const { h } = ctx;
  const open = d.currentOpeningHours?.openNow;
  const today = todayZh();
  const gmap = d.googleMapsUri ?? (p.pid ? `https://www.google.com/maps/place/?q=place_id:${p.pid}` : null);
  const addr = d.formattedAddress ?? '';
  const copy = h('button', { type: 'button', class: 'tw-live-copy', onclick: async () => {
    try { await navigator.clipboard.writeText(addr); copy.textContent = '已複製'; } catch { copy.textContent = '複製失敗'; }
    setTimeout(() => { copy.textContent = '複製地址'; }, 1800);
  } }, '複製地址');

  const rating = d.rating && h('div', { class: 'tw-live-card tw-live-rating' },
    h('div', { class: 'tw-live-big' }, d.rating.toFixed(1)),
    h('div', {}, h('div', { class: 'tw-live-stars', role: 'img', 'aria-label': `${d.rating} 顆星` }, starText(d.rating)),
      h('div', { class: 'tw-hint' }, `${(d.userRatingCount ?? 0).toLocaleString('zh-TW')} 則 Google 評論`)));
  const address = addr && h('div', { class: 'tw-live-card' },
    h('h3', {}, '地址'), h('p', {}, addr),
    h('p', { class: 'tw-live-actions' }, copy, gmap && h('a', { href: gmap, target: '_blank', rel: 'noopener' }, '在 Google 地圖開啟')));
  const hours = d.regularOpeningHours?.weekdayDescriptions && h('div', { class: 'tw-live-card' },
    h('h3', {}, '營業時間', open != null && h('span', { class: `tw-live-open${open ? ' is-open' : ''}` }, open ? '現在營業中' : '現在休息中')),
    h('ul', { class: 'tw-place-hours' }, d.regularOpeningHours.weekdayDescriptions.map((t) =>
      h('li', { class: t.startsWith(today) ? 'is-today' : '' }, t))));

  const reviews = d.reviews ?? [];
  const revEls = reviews.map((r) => {
    const text = r.text?.text ?? r.originalText?.text ?? '';
    const orig = r.originalText?.text && r.originalText.text !== text ? r.originalText.text : '';
    const body = h('p', { class: `tw-review-text${text.length > 140 ? ' is-clamped' : ''}` }, text || '（這則評論沒有文字）');
    const more = text.length > 140 && h('button', { type: 'button', class: 'tw-live-link', onclick: () => {
      const on = body.classList.toggle('is-clamped'); more.textContent = on ? '展開' : '收合';
    } }, '展開');
    const origEl = orig && h('p', { class: 'tw-review-orig', hidden: true }, orig);
    const origBtn = orig && h('button', { type: 'button', class: 'tw-live-link', onclick: () => {
      origEl.hidden = !origEl.hidden; origBtn.textContent = origEl.hidden ? '看原文' : '隱藏原文';
    } }, '看原文');
    const who = r.authorAttribution?.displayName ?? 'Google 使用者';
    return h('article', { class: 'tw-review' },
      h('header', {},
        r.authorAttribution?.uri ? h('a', { href: r.authorAttribution.uri, target: '_blank', rel: 'noopener', class: 'tw-review-by' }, who) : h('span', { class: 'tw-review-by' }, who),
        r.rating && h('span', { class: 'tw-live-stars', role: 'img', 'aria-label': `${r.rating} 顆星` }, starText(r.rating)),
        r.relativePublishTimeDescription && h('span', { class: 'tw-hint' }, r.relativePublishTimeDescription)),
      body, h('div', { class: 'tw-review-acts' }, more, origBtn), origEl);
  });

  return [
    h('div', { class: 'tw-live-grid' }, rating, address, hours),
    h('h3', { class: 'tw-live-h3' }, '大家怎麼說'),
    revEls.length ? h('div', { class: 'tw-reviews' }, revEls) : h('p', { class: 'tw-hint' }, 'Google 沒有提供這個地點的評論文字。'),
    h('p', { class: 'tw-hint' }, 'Google 只提供最相關的最多 5 則評論，想看全部請', gmap ? h('a', { href: gmap, target: '_blank', rel: 'noopener' }, '到 Google 地圖') : '到 Google 地圖', '。'),
    h('p', { class: 'tw-hint' }, '資料來自 Google 地圖，即時查詢，只存在這次瀏覽，不寫進網站資料。'),
  ];
}

function liveBox(ctx, p) {
  const { h, clear } = ctx;
  const key = ctx.config?.google?.placesKey;
  const box = h('section', { class: 'tw-place-live', 'aria-label': 'Google 即時資料' });
  if (!p.pid || !key) return box;
  box.append(h('p', { class: 'tw-hint' }, '查詢 Google 評分、營業時間與評論…'));
  let alive = true;
  liveDetail(p.pid, key).then((d) => {
    if (!alive) return;
    clear(box);
    box.append(h('h2', {}, 'Google 即時資料'), ...liveContent(ctx, p, d));
  }).catch((e) => {
    if (!alive) return;
    clear(box).append(h('p', { class: 'tw-hint' }, `暫時查不到 Google 資料（${e.message}），請用上面的連結看。`));
  });
  box.destroy = () => { alive = false; };
  return box;
}

// ── 地點詳情 ──
function mountPlace(el, ctx) {
  const { h, clear, store } = ctx;
  const p = store.placeById(ctx.route.params[0]);
  if (!p) {
    el.append(h('p', { class: 'tw-empty' }, '找不到這個地點。'), h('a', { href: '#/' }, '回地圖'));
    return;
  }
  const regions = store.get('regions');
  const found = findRegion(regions, p.region);
  const cats = [p.c, ...(Array.isArray(p.c2) ? p.c2 : [p.c2])].filter(Boolean);
  const gurl = p.gurl || (p.pid ? `https://www.google.com/maps/place/?q=place_id:${p.pid}` : null);
  // OSM 座標才有意義；沒有座標就不出地圖連結
  const osm = p.ll ? `https://www.openstreetmap.org/?mlat=${p.ll[0]}&mlon=${p.ll[1]}#map=17/${p.ll[0]}/${p.ll[1]}` : null;

  const compareEl = h('div', {});
  const barEl = h('div', {});
  const drawCompare = () => clear(compareEl).append(markCompare(ctx, p.id));
  const drawBar = () => {
    const me = store.get('who');
    clear(barEl).append(h('h2', { class: 'tw-place-h2' }, me ? `${store.whoName(me)}的標記` : '標記'), markBar(ctx, p.id));
  };
  drawCompare();
  drawBar();
  const live = liveBox(ctx, p);
  const gallery = carousel(ctx, p);

  el.append(h('div', { class: 'tw-place-view' },
    h('nav', { class: 'tw-place-crumbs', 'aria-label': '路徑' },
      h('a', { href: '#/' }, '全台'),
      (found?.trail ?? []).flatMap((t) => [' › ', h('a', { href: `#/r/${t.id}` }, t.n)])),
    gallery,
    h('h1', {}, p.n),
    store.isVisible(p) ? null : h('p', { class: 'tw-place-status' }, p.status === 'moved' ? '已搬遷' : '已歇業'),
    h('div', { class: 'tw-place-cats' }, cats.map((c) => h('span', { class: 'tw-place-cat' }, catIcon(c), c))),
    p.a && h('p', { class: 'tw-place-addr' }, p.a),
    p.note && h('p', { class: 'tw-place-note' }, p.note),
    h('p', { class: 'tw-place-links' },
      gurl && h('a', { href: gurl, target: '_blank', rel: 'noopener' }, '在 Google 地圖開啟'),
      gurl && osm && '　',
      osm && h('a', { href: osm, target: '_blank', rel: 'noopener' }, '在 OpenStreetMap 看位置')),
    compareEl, barEl, live));

  const offs = [
    store.subscribe('marks', () => {
      drawCompare();
      // 正在打字時不重畫，免得游標跑掉
      if (!barEl.contains(document.activeElement) || document.activeElement.tagName !== 'TEXTAREA') drawBar();
    }),
    store.subscribe('who', () => { drawBar(); drawCompare(); }),
  ];
  return () => { offs.forEach((off) => off()); live.destroy?.(); gallery.destroy?.(); };
}

export function mount(el, ctx) {
  return ctx.route.name === 'place' ? mountPlace(el, ctx) : mountRegion(el, ctx);
}
