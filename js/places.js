// 地區瀏覽、篩選、地點詳情（路由 #/r/<regionId>、#/p/<placeId>）。模組 D。
// 輸出 placeCard、listView、findRegion、inRegion 給 map.js 用。
import { catIcon } from './icons.js';
import { markBar, markCompare, statusOf, quickMark, takeFx } from './marks.js';

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
  ['all', '全部'],
  ['mine-want', '我想去'],
  ['both-want', '兩人都想去'],
  ['one-want', '只有一人想去'],
  ['not-been', '我還沒去過'],
  ['mine-been', '我去過'],
];

// 篩選條件在換頁時保留（只存記憶體）
const filters = { cats: new Set(), mark: 'all', q: '' };

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
      onclick: () => quickMark(ctx, p.id, 'been') }, '蓋章');
  if (stamped) stampBtn.innerHTML = stampSVG(beenMark?.ym);

  const ghostBits = (id, m) => [name(id), m.want && '想去', m.been && `去過${m.mark?.ym ? ` ${m.mark.ym}` : ''}`].filter(Boolean).join(' ');
  const ghost = who
    ? `${ghostBits(other, ot)}${!ot.want && !ot.been ? ' －' : ''}`
    : '';

  return h('article', { class: `tw-place-card${pair ? ' is-pair' : ''}`, dataset: { pid: p.id } },
    pair && h('span', { class: `tw-place-pair${fx.pair ? ' is-fresh' : ''}` }, '雙人票'),
    h('a', { class: 'tw-place-stub', href: `#/p/${p.id}`, 'aria-hidden': 'true', tabindex: '-1' },
      catIcon(p.c), h('span', { class: 'tw-place-c' }, p.c), h('span', { class: 'tw-place-z' }, county.replace(/[縣市]$/, ''))),
    h('div', { class: 'tw-place-mid' },
      h('a', { class: 'tw-place-name', href: `#/p/${p.id}` }, p.n),
      p.a && h('div', { class: 'tw-place-addr' }, p.a),
      who && ghost && h('div', { class: 'tw-place-ghost' }, ghost)),
    h('div', { class: 'tw-mark-want', role: 'group', 'aria-label': `${p.n}的想去` }, h('div', { class: 'tw-mark-wrow' }, wantRow), h('span', { class: 'tw-mark-wl' }, '想去')),
    h('div', { class: 'tw-mark-stampzone' }, stampBtn,
      stamped && who && h('button', { type: 'button', class: 'tw-mark-again', 'aria-pressed': me.again ? 'true' : 'false',
        onclick: () => quickMark(ctx, p.id, 'again') }, me.again ? '已標：想再去' : '標成想再去')));
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

  root.append(h('div', { class: 'tw-place-filters' }, search, markSel), catRow, listEl);
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
async function livePlace(pid, key) {
  const ck = `twLive:${pid}`;
  try {
    const hit = JSON.parse(sessionStorage.getItem(ck) ?? 'null');
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
  try { sessionStorage.setItem(ck, JSON.stringify(d)); } catch { /* 略過 */ }
  return d;
}

function liveBox(ctx, p) {
  const { h, clear } = ctx;
  const key = ctx.config?.google?.placesKey;
  const box = h('section', { class: 'tw-place-live' });
  if (!p.pid || !key) return box;
  box.append(h('p', { class: 'tw-hint' }, '查詢 Google 評分與營業時間…'));
  let alive = true;
  livePlace(p.pid, key).then((d) => {
    if (!alive) return;
    clear(box);
    const open = d.currentOpeningHours?.openNow;
    box.append(
      h('h2', {}, 'Google 即時資料'),
      d.rating && h('p', {}, `★ ${d.rating}（${d.userRatingCount ?? 0} 則評論）`),
      open != null && h('p', {}, open ? '現在營業中' : '現在休息中'),
      d.regularOpeningHours?.weekdayDescriptions && h('ul', { class: 'tw-place-hours' },
        d.regularOpeningHours.weekdayDescriptions.map((t) => h('li', {}, t))),
      h('p', { class: 'tw-hint' }, '即時查詢，只存在這次瀏覽，不寫進網站資料。'));
  }).catch(() => {
    if (!alive) return;
    clear(box).append(h('p', { class: 'tw-hint' }, '暫時查不到 Google 資料，請用上面的連結看。'));
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
  const drawBar = () => clear(barEl).append(markBar(ctx, p.id));
  drawCompare();
  drawBar();
  const live = liveBox(ctx, p);

  el.append(h('div', { class: 'tw-place-view' },
    h('nav', { class: 'tw-place-crumbs', 'aria-label': '路徑' },
      h('a', { href: '#/' }, '全台'),
      (found?.trail ?? []).flatMap((t) => [' › ', h('a', { href: `#/r/${t.id}` }, t.n)])),
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
  return () => { offs.forEach((off) => off()); live.destroy?.(); };
}

export function mount(el, ctx) {
  return ctx.route.name === 'place' ? mountPlace(el, ctx) : mountRegion(el, ctx);
}
