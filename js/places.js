// 地區瀏覽、篩選、地點詳情（路由 #/r/<regionId>、#/p/<placeId>）。模組 D。
// 輸出 placeCard、listView、findRegion、inRegion 給 map.js 用。
import { catIcon } from './icons.js';
import { carousel } from './photos.js';
import { markBar, markCompare, statusOf, quickMark, takeFx, likeOf } from './marks.js';
import { loadGoogle, googleOf, googleReady, onGoogle, isOpenNow, todayZh, updatedLabel, dateLabel, staleDays, STALE_AFTER_DAYS, ago } from './google.js';

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

function passFilters(store, p) {
  if (filters.cats.size && ![p.c, p.c2].flat().some((c) => c && filters.cats.has(c))) return false;
  if (!passMark(store, p)) return false;
  if (filters.live === 'open' && isOpenNow(googleOf(p.pid)) !== true) return false;
  const q = filters.q.trim().toLowerCase();
  if (q && !`${p.n} ${p.a ?? ''} ${p.note ?? ''}`.toLowerCase().includes(q)) return false;
  return true;
}

// ── 米其林標示 ──
// p.mich = { t: 'bib' | 'star1' | 'star2' | 'star3', y: 年份 }：台灣米其林指南該年的必比登推介或星級（資料見 docs/SPEC.md）
const MICH = { bib: ['必比登推介', 0], star1: ['米其林一星', 1], star2: ['米其林二星', 2], star3: ['米其林三星', 3] };
export function michBadge(ctx, p) {
  const m = p.mich && MICH[p.mich.t];
  if (!m) return null;
  const { h } = ctx;
  const icons = m[1] ? Array.from({ length: m[1] }, () => h('i', { class: 'tw-mich-ico is-star', 'aria-hidden': 'true' })) : [h('i', { class: 'tw-mich-ico is-bib', 'aria-hidden': 'true' })];
  return h('span', { class: `tw-mich is-${p.mich.t}`, title: `${p.mich.y} 年台灣米其林指南：${m[0]}` }, icons, h('span', { class: 'tw-mich-t' }, `${m[0]}　${p.mich.y}`));
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
      michBadge(ctx, p),
      p.a && h('div', { class: 'tw-place-addr' }, p.a),
      who && ghost && h('div', { class: 'tw-place-ghost' }, ghost),
      likeTags.length > 0 && h('div', { class: 'tw-place-likes' }, likeTags)),
    h('div', { class: 'tw-mark-want', role: 'group', 'aria-label': `${p.n}的想去` }, h('div', { class: 'tw-mark-wrow' }, wantRow), h('span', { class: 'tw-mark-wl' }, '標想去'),
      h('button', { type: 'button', class: 'tw-mark-skip', 'aria-pressed': me?.skip ? 'true' : 'false', 'aria-label': `不想去：${p.n}`,
        onclick: () => quickMark(ctx, p.id, 'skip') }, me?.skip ? '已標：不想去' : '不想去')),
    h('div', { class: 'tw-mark-stampzone' }, stampBtn,
      stamped && who && h('button', { type: 'button', class: 'tw-mark-again', 'aria-pressed': me.again ? 'true' : 'false',
        onclick: () => quickMark(ctx, p.id, 'again') }, me.again ? '已標：想再去' : '標成想再去')),
    p.pid && ctx.config?.google?.placesKey && h('div', { class: 'tw-place-media' }, carousel(ctx, p, { card: true })),
    googleBlock(ctx, p));
}

// 卡片上直接顯示 Google 地址、評分、今天營業時間與評論（資料由排程預存在 Firebase /google，見 js/google.js）
function googleBlock(ctx, p) {
  if (!p.pid) return null;
  const { h } = ctx;
  const box = h('div', { class: 'tw-place-g' });
  if (!googleReady()) { box.append(h('p', { class: 'tw-hint' }, '載入 Google 資料…')); return box; }
  const g = googleOf(p.pid);
  if (!g) { box.append(h('p', { class: 'tw-hint' }, '還沒有這個地點的 Google 資料（每週更新一次）。')); return box; }
  box.append(...liveContent(ctx, p, g, { compact: true }).filter(Boolean));
  return box;
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
      const r = (p) => googleOf(p.pid)?.rating ?? -1;
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
    [['all', '不限營業'], ['open', '現在營業（依預存時段推算）']].map(([v, label]) => h('option', { value: v, selected: v === filters.live }, label)));
  liveSel.addEventListener('change', () => { filters.live = liveSel.value; shown = limit; drawList(); });
  const sortSel = h('select', { class: 'tw-place-mark-filter', 'aria-label': '排序' },
    [['default', '預設排序'], ['rating', 'Google 評分高到低']].map(([v, label]) => h('option', { value: v, selected: v === filters.sort }, label)));
  sortSel.addEventListener('change', () => { filters.sort = sortSel.value; shown = limit; drawList(); });

  root.append(h('div', { class: 'tw-place-filters' }, search, markSel, liveSel, sortSel), catRow, listEl);
  drawCats();
  drawList();
  // Google 資料進站抓一次，到了就重畫（評分排序與營業篩選才有資料）
  loadGoogle();
  const offs = [store.subscribe('marks', drawList), onGoogle(drawList)];
  return { el: root, destroy: () => offs.forEach((off) => off()) };
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

// ── Google 資料（預存版）──
// 評分、地址、營業時間、評論由排程寫進 Firebase /google/{pid}（js/google.js）；這裡只負責顯示，並標出上次更新時間。
const starText = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));

// 內容：回傳元素陣列。compact（卡片）只先顯示 2 則評論，其餘收進「更多評論」
function liveContent(ctx, p, g, { compact = false } = {}) {
  const { h } = ctx;
  const days = staleDays(g);
  const stale = days != null && days >= STALE_AFTER_DAYS;
  const note = h('p', { class: `tw-gd-updated${stale ? ' is-stale' : ''}` },
    `上次更新：${updatedLabel(g)}`,
    stale ? `（已 ${days} 天沒更新，營業時間與評論可能已變動，請以 Google 地圖為準）` : '（資料可能已變動，請以 Google 地圖為準）');
  const gmap = g.maps ?? `https://www.google.com/maps/place/?q=place_id:${p.pid}`;
  if (g.status === 'NOT_FOUND') return [h('p', { class: 'tw-hint' }, 'Google 找不到這個地點，可能已搬遷或歇業。'), note];

  const open = isOpenNow(g);
  const today = todayZh();
  const addr = g.addr ?? '';
  const copy = h('button', { type: 'button', class: 'tw-live-copy', onclick: async () => {
    try { await navigator.clipboard.writeText(addr); copy.textContent = '已複製'; } catch { copy.textContent = '複製失敗'; }
    setTimeout(() => { copy.textContent = '複製地址'; }, 1800);
  } }, '複製地址');
  const closed = g.status === 'CLOSED_PERMANENTLY' ? '已永久歇業' : g.status === 'CLOSED_TEMPORARILY' ? '暫時休息' : '';

  const rating = g.rating && h('div', { class: 'tw-live-card tw-live-rating' },
    h('div', { class: 'tw-live-big' }, g.rating.toFixed(1)),
    h('div', {}, h('div', { class: 'tw-live-stars', role: 'img', 'aria-label': `${g.rating} 顆星` }, starText(g.rating)),
      h('div', { class: 'tw-hint' }, `${(g.n ?? 0).toLocaleString('zh-TW')} 則 Google 評論`)));
  const address = addr && h('div', { class: 'tw-live-card' },
    h('h3', {}, '地址'), h('p', {}, addr),
    h('p', { class: 'tw-live-actions' }, copy, h('a', { href: gmap, target: '_blank', rel: 'noopener' }, '在 Google 地圖開啟')));
  const hours = g.hours?.length && h('div', { class: 'tw-live-card' },
    h('h3', {}, '營業時間',
      closed ? h('span', { class: 'tw-live-open' }, closed)
        : open != null && h('span', { class: `tw-live-open${open ? ' is-open' : ''}`, title: '依預存的營業時段推算，沒有計入國定假日與臨時公休' }, open ? '現在營業中' : '現在休息中')),
    h('ul', { class: 'tw-place-hours' }, g.hours.map((t) => h('li', { class: t.startsWith(today) ? 'is-today' : '' }, t))));

  const review = (r) => {
    const text = r.t || '（這則評論沒有文字）';
    const body = h('p', { class: `tw-review-text${text.length > 140 ? ' is-clamped' : ''}` }, text);
    const more = text.length > 140 && h('button', { type: 'button', class: 'tw-live-link', onclick: () => {
      const on = body.classList.toggle('is-clamped'); more.textContent = on ? '展開' : '收合';
    } }, '展開');
    const origEl = r.o && h('p', { class: 'tw-review-orig', hidden: true }, r.o);
    const origBtn = r.o && h('button', { type: 'button', class: 'tw-live-link', onclick: () => {
      origEl.hidden = !origEl.hidden; origBtn.textContent = origEl.hidden ? '看原文' : '隱藏原文';
    } }, '看原文');
    const who = r.by || 'Google 使用者';
    return h('article', { class: 'tw-review' },
      h('header', {},
        r.uri ? h('a', { href: r.uri, target: '_blank', rel: 'noopener', class: 'tw-review-by' }, who) : h('span', { class: 'tw-review-by' }, who),
        r.r && h('span', { class: 'tw-live-stars', role: 'img', 'aria-label': `${r.r} 顆星` }, starText(r.r)),
        r.at && h('span', { class: 'tw-hint' }, ago(r.at))),
      body, h('div', { class: 'tw-review-acts' }, more, origBtn), origEl);
  };
  const revs = g.reviews ?? [];
  // AI 評語：把 Google 最相關的幾則評論整理成一小段；卡片只放這個，詳情頁另外收著原始評論
  const ai = g.ai?.t && h('div', { class: 'tw-ai' },
    h('span', { class: 'tw-ai-tag' }, 'AI 評語'),
    h('p', { class: 'tw-ai-text' }, g.ai.t),
    h('p', { class: 'tw-hint' }, `AI 依 Google 最相關的 ${g.ai.n || revs.length} 則評論整理（${dateLabel(g.ai.at)}），僅供參考`));
  const aiOrHint = ai || (revs.length ? h('p', { class: 'tw-hint' }, 'AI 評語整理中，下次更新後會出現。') : h('p', { class: 'tw-hint' }, 'Google 沒有提供這個地點的評論文字。'));
  const original = !compact && revs.length > 0 ? h('section', { class: 'tw-review-original' },
    h('h3', {}, `Google 實際評論（${revs.length} 則）`), h('div', { class: 'tw-reviews' }, revs.map(review))) : null;

  if (compact) return compactContent(ctx, { g, closed, open, rating, address, hours, aiOrHint, note, gmap });

  return [
    closed ? h('p', { class: 'tw-live-warn' }, `Google 標示這裡「${closed}」，出發前請先確認。`) : null,
    h('div', { class: 'tw-live-grid' }, rating, address, hours),
    aiOrHint,
    original,
    note,
    h('p', { class: 'tw-hint' }, '想看全部評論請', h('a', { href: gmap, target: '_blank', rel: 'noopener' }, '到 Google 地圖'), '。資料來自 Google 地圖。'),
  ];
}

// 卡片版三層：第一層（評分、營業狀態、兩行評語）永遠顯示，其餘點「更多資訊」就地展開
function compactContent(ctx, { g, closed, open, rating, address, hours, aiOrHint, note, gmap }) {
  const { h } = ctx;
  const state = closed ? h('span', { class: 'tw-live-open' }, closed)
    : open != null && h('span', { class: `tw-live-open${open ? ' is-open' : ''}`, title: '依預存的營業時段推算，沒有計入國定假日與臨時公休' }, open ? '現在營業中' : '現在休息中');
  const sum = g.rating ? h('div', { class: 'tw-live-sum' },
    h('strong', { class: 'tw-live-sum-n' }, g.rating.toFixed(1)),
    h('span', { class: 'tw-live-stars', role: 'img', 'aria-label': `${g.rating} 顆星` }, starText(g.rating)),
    h('span', { class: 'tw-hint' }, `${(g.n ?? 0).toLocaleString('zh-TW')} 則`), state)
    : state && h('div', { class: 'tw-live-sum' }, state);
  const more = h('div', { class: 'tw-live-more', hidden: true },
    h('div', { class: 'tw-live-grid' }, address, hours), note,
    h('p', { class: 'tw-hint' }, '想看全部評論請', h('a', { href: gmap, target: '_blank', rel: 'noopener' }, '到 Google 地圖'), '。資料來自 Google 地圖。'));
  const ai = aiOrHint.classList?.contains('tw-ai') ? aiOrHint : null;
  if (ai) ai.classList.add('is-clamp');
  const btn = h('button', { type: 'button', class: 'tw-live-link tw-live-toggle', 'aria-expanded': 'false', onclick: () => {
    const on = more.hidden; more.hidden = !on; ai?.classList.toggle('is-clamp', !on);
    btn.textContent = on ? '收合' : '更多資訊'; btn.setAttribute('aria-expanded', on ? 'true' : 'false');
  } }, '更多資訊');
  return [closed ? h('p', { class: 'tw-live-warn' }, `Google 標示這裡「${closed}」，出發前請先確認。`) : null, sum, aiOrHint, btn, more];
}

// 詳情頁：完整顯示
function liveBox(ctx, p) {
  const { h, clear } = ctx;
  const box = h('section', { class: 'tw-place-live', 'aria-label': 'Google 資料' });
  if (!p.pid) return box;
  const draw = () => {
    clear(box);
    if (!googleReady()) { box.append(h('p', { class: 'tw-hint' }, '載入 Google 資料…')); return; }
    const g = googleOf(p.pid);
    if (!g) { box.append(h('p', { class: 'tw-hint' }, '還沒有這個地點的 Google 資料（每週更新一次），可先用上面的連結看。')); return; }
    box.append(h('h2', {}, 'Google 資料'), ...liveContent(ctx, p, g).filter(Boolean));
  };
  draw();
  loadGoogle();
  const off = onGoogle(draw);
  box.destroy = off;
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
    michBadge(ctx, p),
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
