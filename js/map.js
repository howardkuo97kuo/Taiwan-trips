// 首頁（路由 #/）。模組 D。
// 環島郵路：用真實縣市邊界畫台灣，一條橘線繞一圈串起各縣市，泡泡大小是地點數，去過的縣市蓋郵戳。
// 點縣市往下展開：縣市地圖（Leaflet）加地點清單。位置只用地點的 ll（OSM 或手動）；沒有 ll 的地點不畫圖釘，清單照樣有。
import { findRegion, inRegion, countIn, listView } from './places.js';
import { litCounties, statusOf } from './marks.js';
import { loadJson } from './util.js';

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

// 環島順序（順時針）；南投另接一條支線
const LOOP = ['north-taipei', 'north-taoyuan', 'north-hsinchu-city', 'north-hsinchu-county', 'central-miaoli', 'central-taichung',
  'central-changhua', 'central-yunlin', 'south-chiayi-county', 'south-chiayi-city', 'south-tainan', 'south-kaohsiung', 'south-pingtung',
  'east-taitung', 'east-hualien', 'east-yilan', 'north-keelung', 'north-newtaipei'];
const BRANCH = [['central-nantou', 'central-taichung']];

// 投影：等距圓柱，經度乘上緯度 23.5° 的 cos
const K = 128, COS = 0.917, LNG0 = 118.0, LAT0 = 26.5;
const px = (lng) => (lng - LNG0) * K * COS;
const py = (lat) => (LAT0 - lat) * K;
const VB = '0 0 480 600';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';

// 邊界資料只抓一次
let geoPromise = null;
function loadGeo() {
  geoPromise ??= loadJson('data/geo/counties.json', null).then((fc) => {
    if (!fc?.features) return null;
    const paths = {}, anchors = {};
    for (const f of fc.features) {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      let d = '', best = null;
      for (const poly of polys) {
        for (const ring of poly) {
          const pts = ring.map(([lng, lat]) => [px(lng), py(lat)]);
          d += pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('') + 'Z';
        }
        // 錨點：最大外環的形心
        const outer = poly[0].map(([lng, lat]) => [px(lng), py(lat)]);
        let a = 0, cx = 0, cy = 0;
        for (let i = 0; i < outer.length - 1; i++) {
          const [x0, y0] = outer[i], [x1, y1] = outer[i + 1], c = x0 * y1 - x1 * y0;
          a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
        }
        if (a && (!best || Math.abs(a) > best.area)) best = { area: Math.abs(a), x: cx / (3 * a), y: cy / (3 * a) };
      }
      paths[f.properties.id] = d;
      if (best) anchors[f.properties.id] = [best.x, best.y];
    }
    return { paths, anchors };
  });
  return geoPromise;
}

// 一次進站只播一次的開場；以及上次畫面上已點亮的縣市（用來播「新蓋章」動畫）
let introPlayed = false;
let seenLit = null;

export async function mount(el, ctx) {
  const { h, clear, store } = ctx;
  const regions = store.get('regions');
  if (!regions?.zones?.length) {
    el.append(h('p', { class: 'tw-empty' }, '地區資料還沒準備好。'));
    return;
  }
  const geo = await loadGeo();
  const counties = regions.zones.flatMap((z) => z.counties.map((c) => ({ ...c, zone: z.id })));
  const anchorOf = (c) => geo?.anchors[c.id] ?? (c.center ? [px(c.center[1]), py(c.center[0])] : null);

  let sel = 'all'; // 'all' | 大區 id | 縣市 id
  let browser = null, leaflet = null, pinLayer = null;
  let layout = null;

  const hero = h('section', { class: 'tw-map-hero', 'aria-label': '環島郵路' });
  const panelL = h('div', { class: 'tw-map-panel' });
  const mapBox = h('div', { class: 'tw-map-box' });
  const panelR = h('div', { class: 'tw-map-panel is-right' });
  hero.append(panelL, mapBox, panelR);
  const zoneBar = h('div', { class: 'tw-map-zones', role: 'group', 'aria-label': '大區' });
  const below = h('section', { class: 'tw-map-below', id: 'tw-map-below' });
  el.append(hero, zoneBar, below);

  // ── 泡泡位置：從縣市形心出發，互相擠開，再用虛線連回原位 ──
  function place() {
    if (layout) return layout;
    const nodes = counties.map((c) => {
      const a = anchorOf(c) ?? [240, 300];
      const n = countIn(store, c.id);
      return { c, n, tx: a[0], ty: a[1], x: a[0], y: a[1], r: n ? Math.min(34, 12 + Math.sqrt(n) * 1.9) : 5 };
    });
    const live = nodes.filter((n) => n.n);
    for (let k = 0; k < 100; k++) {
      for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01, min = a.r + b.r + 5;
        if (d < min) { const m = (min - d) / 2; dx /= d; dy /= d; a.x -= dx * m; a.y -= dy * m; b.x += dx * m; b.y += dy * m; }
      }
    }
    layout = Object.fromEntries(nodes.map((n) => [n.c.id, n]));
    return layout;
  }

  // ── 首屏地圖 ──
  function mapSVG(lit, newly, intro) {
    const S = place();
    const zoneOf = (id) => S[id]?.c.zone;
    const dimmed = (id) => (sel === 'all' ? false : (findRegion(regions, sel)?.level === 'zone' ? zoneOf(id) !== sel : id !== sel && !id.startsWith(`${sel}-`)));

    const land = geo ? counties.map((c) => {
      const d = geo.paths[c.id]; if (!d) return '';
      const cls = ['tw-land', lit.any.has(c.id) ? 'is-lit' : '', S[c.id].n ? '' : 'is-empty', sel === c.id ? 'is-sel' : '', dimmed(c.id) ? 'is-dim' : ''].filter(Boolean).join(' ');
      return `<path class="${cls}" d="${d}"${S[c.id].n ? ` data-county="${esc(c.id)}"` : ''}/>`;
    }).join('') : '';

    const seg = (a, b, i, branch) => {
      if (!S[a] || !S[b]) return '';
      const cls = branch ? 'br' : lit.any.has(a) && lit.any.has(b) ? 'on' : lit.any.has(a) || lit.any.has(b) ? 'half' : 'off';
      const lay = cls === 'on' && seenLit && !(seenLit.has(a) && seenLit.has(b)) && !intro;
      return `<line class="tw-seg is-${cls}${lay ? ' is-lay' : ''}" pathLength="1" style="--i:${i}" x1="${S[a].tx.toFixed(1)}" y1="${S[a].ty.toFixed(1)}" x2="${S[b].tx.toFixed(1)}" y2="${S[b].ty.toFixed(1)}"/>`;
    };
    const segs = LOOP.map((id, i) => seg(id, LOOP[(i + 1) % LOOP.length], i, false)).join('') + BRANCH.map(([a, b]) => seg(a, b, 0, true)).join('');

    const nodes = Object.values(S);
    const leads = nodes.filter((n) => n.n && Math.hypot(n.x - n.tx, n.y - n.ty) > 7)
      .map((n) => `<line x1="${n.tx.toFixed(1)}" y1="${n.ty.toFixed(1)}" x2="${n.x.toFixed(1)}" y2="${n.y.toFixed(1)}"/><circle cx="${n.tx.toFixed(1)}" cy="${n.ty.toFixed(1)}" r="2.5"/>`).join('');
    const order = (id) => Math.max(0, LOOP.indexOf(id));

    const stns = nodes.map((n) => {
      const id = n.c.id, name = n.c.n.replace(/[縣市]$/, '');
      if (!n.n) return `<g class="tw-stn is-zero" style="--i:${order(id)}"><title>${esc(n.c.n)}（還沒有地點）</title><circle class="tw-dot0" cx="${n.tx.toFixed(1)}" cy="${n.ty.toFixed(1)}" r="5"/></g>`;
      const both = store.get('places').filter((p) => store.isVisible(p) && inRegion(p, id)
        && statusOf(store, p.id).apong.want && statusOf(store, p.id).baobao.want).length;
      const big = n.r > 19;
      const cls = ['tw-stn', lit.any.has(id) ? 'is-lit' : '', sel === id ? 'is-sel' : '', dimmed(id) ? 'is-dim' : '', newly.has(id) ? 'is-new' : ''].filter(Boolean).join(' ');
      const label = big
        ? `<text y="-2" class="n">${n.n}</text><text y="14">${esc(name)}</text>`
        : `<text y="5" class="n">${n.n}</text><text y="${n.r + 16}">${esc(name)}</text>`;
      const tag = both ? `<g class="tw-tag"><circle cx="${(n.r * 0.72).toFixed(1)}" cy="${(-n.r * 0.72).toFixed(1)}" r="10"/><text x="${(n.r * 0.72).toFixed(1)}" y="${(-n.r * 0.72 + 4).toFixed(1)}">${both}</text></g>` : '';
      return `<g class="${cls}" style="--i:${order(id)}" tabindex="0" role="button" data-county="${esc(id)}" aria-label="${esc(n.c.n)}，${n.n} 個地點${lit.any.has(id) ? '，已蓋郵戳' : ''}${both ? `，${both} 個兩人都想去` : ''}" transform="translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})">
        <circle class="tw-pulse" r="${n.r}"/><circle class="tw-body" r="${n.r}"/><circle class="tw-ring" r="${(n.r - 6).toFixed(1)}"/>${label}${tag}</g>`;
    }).join('');

    return `<svg viewBox="${VB}" class="tw-map-svg${intro ? ' is-intro' : ''}" role="group" aria-label="環島郵路：各縣市地點數與蓋章">
      <g class="tw-lands">${land}</g><g class="tw-leads" aria-hidden="true">${leads}</g>${segs}${stns}</svg>`;
  }

  function postmark(n, cls) {
    return `<svg class="tw-postmark ${cls}" viewBox="0 0 112 112" role="img" aria-label="已蓋 ${n} 個縣市，共 ${counties.length} 個">
      <circle cx="56" cy="56" r="52" fill="none" stroke="currentColor" stroke-width="3"/>
      <circle cx="56" cy="56" r="44" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 4"/>
      <text class="n" x="56" y="63" text-anchor="middle" font-size="32">${n}/${counties.length}</text>
      <text x="56" y="83" text-anchor="middle" font-size="12">已蓋郵戳</text></svg>`;
  }

  let prevCount = null;
  function drawHero() {
    const { lit, total } = litCounties(store);
    const intro = !introPlayed && !seenLit;
    const newly = new Set(seenLit ? [...lit.any].filter((id) => !seenLit.has(id)) : []);
    const focusId = document.activeElement?.dataset?.county;

    const who = store.get('who');
    const filled = counties.filter((c) => countIn(store, c.id) > 0).length;
    const bothAll = store.get('places').filter((p) => store.isVisible(p) && statusOf(store, p.id).apong.want && statusOf(store, p.id).baobao.want).length;
    const changed = prevCount !== null && prevCount !== lit.any.size;

    panelL.innerHTML = postmark(lit.any.size, `${intro ? 'is-slam' : ''} ${changed ? 'is-bump' : ''}`) +
      `<p class="tw-map-facts"><strong>${who ? `${esc(store.whoName(who))}，今天往哪站走？` : '今天往哪站走？'}</strong>` +
      `${esc(store.whoName('apong'))}蓋了 <b>${lit.apong.size}</b> 站，${esc(store.whoName('baobao'))} <b>${lit.baobao.size}</b> 站。<br>` +
      `${store.get('places').filter((p) => store.isVisible(p)).length} 個地點，分在 ${filled} 個縣市；還有 ${total - filled} 個縣市等地點進來。<br><span class="tw-map-cta">👆 點地圖上的縣市，看那裡有哪些地點</span></p>`;
    panelR.innerHTML = `<div class="tw-map-pair"><b>${bothAll}</b><span>個地點：兩個人都想去</span><a href="#/compare">看清單</a></div>
      <ul class="tw-map-legend"><li><i class="lg-b"></i>泡泡越大，地點越多</li><li><i class="lg-s"></i>紅雙圈：有人蓋過郵戳</li><li><i class="lg-g"></i>金色小牌：兩人都想去的數量</li><li><i class="lg-l"></i>橘色實線：兩站都蓋過，鐵軌鋪好了</li></ul>`;
    mapBox.innerHTML = mapSVG(lit, newly, intro);
    if (focusId) mapBox.querySelector(`[data-county="${CSS.escape(focusId)}"]`)?.focus?.({ preventScroll: true });

    introPlayed = true; seenLit = new Set(lit.any); prevCount = lit.any.size;
  }

  // ── 縣市圖釘（Leaflet） ──
  function drawPins() {
    pinLayer?.clearLayers();
    if (!leaflet) return;
    const rail = cssVar('--rail'), ink = cssVar('--ink'), gold = cssVar('--gold'), stamp = cssVar('--stamp'), muted = cssVar('--muted');
    for (const p of store.get('places').filter((x) => store.isVisible(x) && x.ll && inRegion(x, sel))) {
      const s = statusOf(store, p.id);
      const both = s.apong.want && s.baobao.want, any = s.apong.want || s.baobao.want, been = s.apong.been || s.baobao.been;
      const color = both ? gold : any ? rail : been ? stamp : muted;
      const m = window.L.circleMarker(p.ll, { radius: both ? 9 : 6, color: ink, weight: both ? 2.5 : 1.5, fillColor: color, fillOpacity: 0.95 });
      m.bindPopup(h('div', { class: 'tw-map-pop' }, h('strong', {}, p.n), h('br', {}), h('a', { href: `#/p/${p.id}` }, '看詳情')));
      m.addTo(pinLayer);
    }
  }

  // ── 下方內容 ──
  const countyButtons = (list) => h('div', { class: 'tw-map-counties' }, list
    .map((c) => [c, countIn(store, c.id)]).filter(([, n]) => n > 0)
    .map(([c, n]) => h('button', { type: 'button', class: 'tw-map-county', onclick: () => select(c.id) },
      c.n, h('span', {}, String(n)))));

  function drawBelow() {
    browser?.destroy?.(); browser = null;
    leaflet?.remove(); leaflet = null; pinLayer = null;
    clear(below);
    const found = sel === 'all' ? null : findRegion(regions, sel);
    if (!found) {
      below.append(h('h2', {}, '各縣市'), countyButtons(counties));
      return;
    }
    if (found.level === 'zone') {
      below.append(h('h2', {}, found.node.n), countyButtons(found.node.counties));
      return;
    }
    const places = store.get('places').filter((p) => store.isVisible(p) && inRegion(p, sel));
    below.append(
      h('h2', {}, `${found.node.n}　${places.length} 個地點`),
      h('p', { class: 'tw-hint' }, h('a', { href: `#/r/${sel}` }, '開啟完整頁面（可再依區域看）'), '　', h('button', { type: 'button', class: 'tw-map-back', onclick: () => select('all') }, '回全台灣')));
    if (typeof window.L !== 'undefined') {
      const canvas = h('div', { class: 'tw-map-canvas' });
      below.append(canvas);
      const cfg = ctx.config?.map ?? {};
      leaflet = window.L.map(canvas, { zoomControl: true }).setView(found.node.center ?? cfg.center ?? [23.7, 120.96], found.node.zoom ?? 11);
      window.L.tileLayer(TILES, { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(leaflet);
      pinLayer = window.L.layerGroup().addTo(leaflet);
      requestAnimationFrame(() => leaflet?.invalidateSize());
      drawPins();
    }
    browser = listView(ctx, places);
    below.append(browser.el);
  }

  function drawZones() {
    clear(zoneBar).append(
      h('button', { type: 'button', class: `tw-map-zone${sel === 'all' ? ' is-active' : ''}`, onclick: () => select('all') }, '全台'),
      ...regions.zones.map((z) => h('button', {
        type: 'button',
        class: `tw-map-zone${sel === z.id || sel.startsWith(`${z.id}-`) ? ' is-active' : ''}`,
        onclick: () => select(z.id),
      }, z.n)));
  }

  function select(id) {
    sel = id;
    drawHero(); drawZones(); drawBelow();
    if (id !== 'all') below.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // 點地圖上的縣市（泡泡或邊界）
  const onClick = (e) => {
    const t = e.target.closest?.('[data-county]');
    if (t) select(sel === t.dataset.county ? 'all' : t.dataset.county);
  };
  const onKey = (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-county]')) { e.preventDefault(); onClick(e); }
  };
  mapBox.addEventListener('click', onClick);
  mapBox.addEventListener('keydown', onKey);

  drawHero(); drawZones(); drawBelow();

  // 標記更新：只重畫地圖與圖釘，不重畫清單（清單自己會更新）
  const offs = [store.subscribe('marks', () => { drawHero(); drawPins(); }), store.subscribe('who', drawHero)];
  return () => {
    offs.forEach((off) => off());
    browser?.destroy?.();
    leaflet?.remove();
  };
}
