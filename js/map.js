// 首頁地圖（路由 #/）。模組 D。
// 台灣地圖，每個縣市一個計數標記；點大區或縣市往下展開，下面接地點卡片。
// 位置只用地點的 ll（OSM 或手動）；沒有 ll 的地點不畫在地圖上，但清單照樣有。
import { findRegion, inRegion, countIn, listView } from './places.js';
import { litCounties, statusOf } from './marks.js';

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export function mount(el, ctx) {
  const { h, clear, store } = ctx;
  const regions = store.get('regions');
  if (!regions?.zones?.length) {
    el.append(h('p', { class: 'tw-empty' }, '地區資料還沒準備好。'));
    return;
  }
  if (typeof L === 'undefined') {
    el.append(h('p', { class: 'tw-empty' }, '地圖元件載入失敗，檢查網路後重新整理。'));
    return;
  }

  let sel = 'all'; // 'all' | 大區 id | 縣市 id
  let browser = null;

  const mapEl = h('div', { class: 'tw-map-canvas', style: 'height:55vh;min-height:320px' });
  const zoneBar = h('div', { class: 'tw-map-zones', role: 'group', 'aria-label': '大區' });
  const litEl = h('p', { class: 'tw-map-lit' });
  const below = h('div', { class: 'tw-map-below' });
  el.append(zoneBar, mapEl, litEl, below);

  const cfg = ctx.config?.map ?? {};
  const map = L.map(mapEl, { zoomControl: true }).setView(regions.center ?? cfg.center ?? [23.7, 120.96], regions.zoom ?? cfg.zoom ?? 7);
  L.tileLayer(TILES, { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
  const countyLayer = L.layerGroup().addTo(map);
  const pinLayer = L.layerGroup().addTo(map);

  const visible = () => store.get('places').filter((p) => store.isVisible(p));

  // ── 縣市計數標記 ──
  function drawCounties() {
    countyLayer.clearLayers();
    const { lit, total } = litCounties(store);
    litEl.textContent = `已點亮 ${lit.any.size}／${total} 縣市`;
    for (const z of regions.zones) {
      for (const c of z.counties) {
        const n = countIn(store, c.id);
        if (!n || !c.center) continue; // 沒有地點的縣市不顯示
        const m = L.circleMarker(c.center, {
          radius: Math.min(26, 10 + Math.sqrt(n) * 2),
          color: lit.any.has(c.id) ? '#2e7d32' : '#c2571a',
          fillColor: lit.any.has(c.id) ? '#66bb6a' : '#ff8a50',
          fillOpacity: 0.75,
          weight: 2,
        });
        m.bindTooltip(String(n), { permanent: true, direction: 'center', className: 'tw-map-label' });
        m.on('click', () => select(c.id));
        m.addTo(countyLayer);
      }
    }
  }

  // ── 選到縣市時畫出個別地點 ──
  function drawPins() {
    pinLayer.clearLayers();
    const found = findRegion(regions, sel);
    if (!found || found.level === 'zone') return;
    for (const p of visible()) {
      if (!p.ll || !inRegion(p, sel)) continue;
      const s = statusOf(store, p.id);
      const both = s.apong.want && s.baobao.want;
      const any = s.apong.want || s.baobao.want;
      const been = s.apong.been || s.baobao.been;
      const color = both ? '#d81b60' : any ? '#f9a825' : been ? '#2e7d32' : '#1565c0';
      const m = L.circleMarker(p.ll, { radius: both ? 8 : 6, color, fillColor: color, fillOpacity: 0.85, weight: 1 });
      const pop = h('div', { class: 'tw-map-pop' }, h('strong', {}, p.n), h('br', {}),
        h('a', { href: `#/p/${p.id}` }, '看詳情'));
      m.bindPopup(pop);
      m.addTo(pinLayer);
    }
  }

  // ── 下方內容 ──
  function drawBelow() {
    browser?.destroy?.();
    browser = null;
    clear(below);
    const found = sel === 'all' ? null : findRegion(regions, sel);

    if (!found) {
      below.append(h('h2', {}, '各縣市'),
        h('div', { class: 'tw-map-counties' }, regions.zones.flatMap((z) => z.counties
          .map((c) => [c, countIn(store, c.id)]).filter(([, n]) => n > 0)
          .map(([c, n]) => h('button', { type: 'button', class: 'tw-map-county', onclick: () => select(c.id) }, `${c.n} ${n}`)))));
      return;
    }
    if (found.level === 'zone') {
      below.append(h('h2', {}, `${found.node.n}`),
        h('div', { class: 'tw-map-counties' }, found.node.counties
          .map((c) => [c, countIn(store, c.id)]).filter(([, n]) => n > 0)
          .map(([c, n]) => h('button', { type: 'button', class: 'tw-map-county', onclick: () => select(c.id) }, `${c.n} ${n}`))));
      return;
    }
    const places = visible().filter((p) => inRegion(p, sel));
    below.append(
      h('h2', {}, `${found.node.n}　${places.length} 個地點`),
      h('p', {}, h('a', { href: `#/r/${sel}` }, '開啟完整頁面（可再依區域看）')));
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
    const found = id === 'all' ? null : findRegion(regions, id);
    const target = found?.node ?? regions;
    if (target.center) map.setView(target.center, target.zoom ?? 8, { animate: false });
    drawZones();
    drawPins();
    drawBelow();
  }

  drawCounties();
  drawZones();
  drawBelow();

  // 標記更新：只更新計數與圖釘，不重畫清單（清單自己會更新）
  const offs = [
    store.subscribe('marks', () => { drawCounties(); drawPins(); }),
  ];
  // 容器剛放進頁面，等一個 frame 讓 Leaflet 量到正確大小
  const raf = requestAnimationFrame(() => map.invalidateSize());

  return () => {
    cancelAnimationFrame(raf);
    offs.forEach((off) => off());
    browser?.destroy?.();
    map.remove();
  };
}
