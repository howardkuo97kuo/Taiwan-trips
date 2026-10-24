// 啟動、外殼、路由、身分選擇。只有 B 能改。
// 各功能模組在 js/ 下以 `export function mount(el, ctx)` 接進來，詳見 docs/MODULES.md。
import * as store from './state.js';
import * as sync from './sync.js';
import { h, clear, toast } from './util.js';
import * as prefs from './prefs.js';

// 路由表：hash 第一段 → 模組與導覽。模組還沒做好（檔案不存在）時，畫面顯示「尚未完成」。
const ROUTES = {
  '': { name: 'home', module: './map.js', label: '地圖', nav: true },
  r: { name: 'region', module: './places.js' }, // #/r/<regionId>
  p: { name: 'place', module: './places.js' }, // #/p/<placeId>
  compare: { name: 'compare', module: './marks.js', label: '兩人對照', nav: true },
  inbox: { name: 'inbox', module: './inbox.js', label: '新增地點', nav: true, optional: true },
  trips: { name: 'trips', module: './itinerary.js', label: '行程', nav: true, optional: true },
};

const $ = (id) => document.getElementById(id);
const viewEl = $('tw-view');
let cleanup = null;
let navToken = 0;
const modules = new Map(); // module path -> Promise<module|null>

const loadModule = (path) => {
  if (!modules.has(path)) modules.set(path, import(path).catch(() => null));
  return modules.get(path);
};

// ── 路由 ──
export function navigate(hash) {
  location.hash = hash.startsWith('#') ? hash : `#${hash}`;
}

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const key = parts[0] ?? '';
  return { key: ROUTES[key] ? key : '', params: parts.slice(1) };
}

function context() {
  return { store, sync, navigate, h, clear, toast, prefs, config: store.get('config') };
}

async function render() {
  const token = ++navToken;
  const { key, params } = parseHash();
  const route = ROUTES[key];
  store.set('route', { name: route.name, params });
  document.body.dataset.route = route.name; // CSS 用：首頁以外的頁面把背景照片壓淡，文字才清楚
  if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { console.warn(e); } }
  cleanup = null;
  clear(viewEl);
  const mod = await loadModule(route.module);
  if (token !== navToken) return; // 期間又換頁了
  if (!mod || typeof mod.mount !== 'function') {
    viewEl.append(h('p', { class: 'tw-empty' }, `「${route.label ?? route.name}」尚未完成。`));
  } else {
    try {
      cleanup = (await mod.mount(viewEl, { ...context(), route: { name: route.name, params } })) ?? null;
    } catch (e) {
      console.error(e);
      clear(viewEl);
      viewEl.append(h('p', { class: 'tw-empty' }, '這個畫面出錯了，重新整理看看。'));
    }
  }
  renderNav();
  window.scrollTo(0, 0);
}

// ── 外殼 ──
function renderHeader() {
  const who = store.get('who');
  const online = store.get('online');
  // 三種狀態：已同步／連線中（還沒拿到任何資料）／離線（顯示的是上次拿到的資料）
  const st = online ? ['is-online', '已同步', '標記會即時同步'] : store.get('synced')
    ? ['is-offline', '離線', '目前連不上，顯示的是上次的標記'] : ['is-pending', '連線中', '正在連線'];
  clear($('tw-header')).append(
    h('a', { class: 'tw-title', href: '#/' }, store.get('config')?.siteName ?? '胖寶寶台灣行'),
    h('span', { class: `tw-sync ${st[0]}`, title: st[2], role: 'status' },
      h('i', { class: 'tw-dot', 'aria-hidden': 'true' }), st[1]),
    h('button', {
      class: 'tw-pill tw-motion-btn', type: 'button', onclick: prefs.toggleMotion,
      title: prefs.systemReducesMotion() && !document.documentElement.dataset.motion
        ? '你的系統設定了減少動態，所以預設是關的；點一下可以開啟' : '開關背景與蓋章動畫',
    }, prefs.motionOn() ? '動畫：開' : '動畫：關'),
    h('button', { class: 'tw-pill tw-theme-btn', type: 'button', onclick: prefs.toggleTheme },
      prefs.isDark() ? '淺色' : '深色'),
    h('button', { class: 'tw-who-btn', type: 'button', onclick: () => pickWho(), title: '切換身分' },
      who ? `我是${store.whoName(who)} ▾` : '我是誰？'),
  );
}

async function renderNav() {
  const cur = store.get('route').name;
  const items = [];
  for (const [key, r] of Object.entries(ROUTES)) {
    if (!r.nav) continue;
    if (r.optional && !(await loadModule(r.module))) continue; // 模組還沒上線就不顯示
    items.push(h('a', {
      class: `tw-nav-item${r.name === cur ? ' is-active' : ''}`,
      href: `#/${key}`,
      'aria-current': r.name === cur ? 'page' : null,
    }, r.label));
  }
  clear($('tw-nav')).append(...items);
}

// ── 身分選擇 ──
export function pickWho() {
  const overlay = $('tw-overlay');
  const current = store.get('who');
  clear(overlay).append(
    h('div', { class: 'tw-dialog', role: 'dialog', 'aria-modal': 'true' },
      h('h2', {}, '你是誰？'),
      h('p', { class: 'tw-hint' }, '只是用來記你的標記，不需要登入，之後可以隨時切換。'),
      !current && h('ol', { class: 'tw-guide' },
        h('li', {}, '在地圖點一個縣市，看那裡的地點'),
        h('li', {}, '每個地點標「想去」，去過就蓋章'),
        h('li', {}, '到「兩人對照」看兩個人都想去哪些')),
      h('div', { class: 'tw-who-choices' },
        store.whoIds().map((id) => h('button', {
          class: `tw-who-choice${id === current ? ' is-current' : ''}`,
          type: 'button',
          dataset: { who: id },
          onclick: () => { store.setWho(id); overlay.hidden = true; },
        }, store.whoName(id)))),
      current && h('button', { class: 'tw-cancel', type: 'button', onclick: () => { overlay.hidden = true; } }, '取消'),
    ),
  );
  overlay.hidden = false;
}

// ── 啟動 ──
async function boot() {
  prefs.initPrefs();
  // 切換偏好會重畫頂列，把鍵盤焦點留在剛按的那顆
  prefs.onPrefs(() => {
    const was = ['tw-motion-btn', 'tw-theme-btn'].find((c) => document.activeElement?.classList.contains(c));
    renderHeader();
    if (was) document.querySelector(`.${was}`)?.focus();
  });
  store.set('who', store.readWho());
  renderHeader();
  await store.loadData();
  document.title = store.get('config')?.siteName ?? document.title;
  renderHeader();
  store.subscribe('who', renderHeader);
  store.subscribe('online', renderHeader);
  store.subscribe('synced', renderHeader);
  sync.startSync();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch((e) => console.warn('[sw]', e)); // 離線快取（E）
  if (!store.get('who')) pickWho();
  window.addEventListener('hashchange', render);
  await render();
}

boot();
