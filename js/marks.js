// 個人標記與兩人對照（路由 #/compare）。模組 D。
// 輸出的共用函式給 places.js、map.js 用：markBar、markSummary、statusOf、litCounties。
import { ymNow, debounce } from './util.js';

// ── 共用：兩人在某地點的狀態 ──
// want / been 以「有沒有標」為準；回傳 {apong:{want,been}, baobao:{…}}
export function statusOf(store, placeId) {
  const marks = store.get('marks');
  const pick = (who) => {
    const m = marks[who]?.[placeId];
    return { want: !!m?.want, been: !!m?.been, again: !!m?.again, mark: m ?? null };
  };
  return { apong: pick('apong'), baobao: pick('baobao') };
}

// 喜歡程度：存 love／ok／meh
export const LIKES = [
  { id: 'love', icon: '😍', label: '超愛' },
  { id: 'ok', icon: '🙂', label: '還行' },
  { id: 'meh', icon: '😕', label: '不推' },
];
export const likeOf = (id) => LIKES.find((l) => l.id === id) ?? null;

// 兩人對照的分組
export const GROUPS = [
  { id: 'both-want', label: '兩人都想去', test: (a, b) => a.want && b.want },
  { id: 'one-want', label: '只有一人想去', test: (a, b) => a.want !== b.want },
  { id: 'one-been', label: '一人去過、另一人沒去過', test: (a, b) => a.been !== b.been },
  { id: 'both-been', label: '兩人都去過', test: (a, b) => a.been && b.been },
];

// ── 點亮台灣 ──
// 回傳 { counties: [{id,n}], lit: {apong:Set, baobao:Set, any:Set}, total }
export function litCounties(store) {
  const regions = store.get('regions');
  const counties = (regions?.zones ?? []).flatMap((z) => z.counties.map((c) => ({ id: c.id, n: c.n })));
  const lit = { apong: new Set(), baobao: new Set(), any: new Set() };
  const marks = store.get('marks');
  for (const p of store.get('places')) {
    if (!store.isVisible(p)) continue;
    const county = countyIdOf(counties, p.region);
    if (!county) continue;
    for (const who of ['apong', 'baobao']) {
      if (marks[who]?.[p.id]?.been) { lit[who].add(county); lit.any.add(county); }
    }
  }
  return { counties, lit, total: counties.length };
}

// 縣市 id 可能含 '-'（north-hsinchu-city），所以用最長前綴比對
export function countyIdOf(counties, regionId) {
  let best = null;
  for (const c of counties) {
    if ((regionId === c.id || regionId?.startsWith(`${c.id}-`)) && (!best || c.id.length > best.length)) best = c.id;
  }
  return best;
}

// ── 卡片上的快速標記：想去、蓋章（去過）、想再去 ──
// 標完會跳 Toast 並提供「復原」；剛蓋章或剛變成雙人票時，卡片下一次重畫會播一次動畫（takeFx）。
const fx = { slam: null, pair: null };
export function takeFx(placeId) {
  const out = { slam: fx.slam === placeId, pair: fx.pair === placeId };
  if (out.slam) fx.slam = null;
  if (out.pair) fx.pair = null;
  return out;
}

const KEY_LABEL = { want: '想去', been: '去過', again: '想再去' };

export async function quickMark(ctx, placeId, key) {
  const { store, sync, toast } = ctx;
  const who = store.get('who');
  if (!who) {
    toast?.('先選一下你是誰，才能標記', { action: '選身分', onAction: () => document.querySelector('.tw-who-btn')?.click() });
    return;
  }
  const prev = store.get('marks')[who]?.[placeId] ?? null;
  const on = !!prev?.[key];
  let patch;
  if (key === 'been') patch = on ? { been: null, ym: null, again: null, stars: null } : { been: true, ym: prev?.ym ?? ymNow() };
  else if (key === 'again') patch = on ? { again: null } : { again: true, been: true, ym: prev?.ym ?? ymNow() };
  else patch = { [key]: on ? null : true };

  // 動畫旗標要在寫入前設好：setMark 會先更新畫面
  if (key === 'been' && !on) fx.slam = placeId;
  if (key === 'want' && !on && statusOf(store, placeId)[store.otherWho(who)]?.want) fx.pair = placeId;

  const name = store.placeById(placeId)?.n ?? '';
  const undo = () => {
    const back = {};
    for (const k of new Set([...Object.keys(prev ?? {}), ...Object.keys(patch)])) if (k !== 'ts') back[k] = prev?.[k] ?? null;
    sync.setMark(placeId, back).catch(() => toast('復原沒成功，網路好了再試一次。', { tone: 'bad' }));
  };
  try {
    await sync.setMark(placeId, patch);
  } catch (e) {
    console.warn(e);
    fx.slam = fx.pair = null;
    toast('沒存成功，網路好了再試一次。', { tone: 'bad' });
    return;
  }
  const msg = key === 'been' ? (on ? `取消蓋章：${name}` : `已蓋章：${name}`) : `${on ? '取消' : '已標'}「${KEY_LABEL[key]}」：${name}`;
  toast(msg, { action: '復原', onAction: undo });
}

// ── 小標記列（卡片上用，只讀） ──
export function markSummary(ctx, placeId) {
  const { h, store } = ctx;
  const s = statusOf(store, placeId);
  const chips = [];
  for (const who of ['apong', 'baobao']) {
    const name = store.whoName(who);
    if (s[who].want) chips.push(h('span', { class: `tw-mark-chip is-want is-${who}` }, `♥ ${name}`));
    if (s[who].been) chips.push(h('span', { class: `tw-mark-chip is-been is-${who}` }, `✓ ${name}`));
  }
  if (s.apong.want && s.baobao.want) chips.unshift(h('span', { class: 'tw-mark-chip is-both' }, '兩人都想去'));
  return h('div', { class: 'tw-mark-summary' }, chips);
}

// ── 標記編輯（地點詳情用）：想去／去過／想再去／年月／星等／心得 ──
export function markBar(ctx, placeId) {
  const { h, sync, store } = ctx;
  const who = store.get('who');
  const root = h('div', { class: 'tw-mark-bar' });
  if (!who) {
    root.append(h('p', { class: 'tw-hint' }, '先在右上角選身分，才能標記。'));
    return root;
  }
  const mine = store.get('marks')[who]?.[placeId] ?? {};
  const msg = h('p', { class: 'tw-mark-msg', role: 'status' });
  const save = async (patch) => {
    msg.textContent = '';
    try { await sync.setMark(placeId, patch); } catch (e) {
      console.warn(e);
      msg.textContent = '沒存成功，網路好了再試一次。';
    }
  };
  const toggle = (key, label, on) => h('button', {
    type: 'button',
    class: `tw-mark-toggle is-${key}${on ? ' is-on' : ''}`,
    'aria-pressed': on ? 'true' : 'false',
    onclick: () => {
      const patch = { [key]: on ? null : true };
      if (key === 'been' && !on) patch.ym = mine.ym ?? ymNow(); // 剛標去過，預設這個月
      if (key === 'been' && on) { patch.ym = null; patch.again = null; patch.stars = null; }
      save(patch);
    },
  }, label);

  root.append(
    h('div', { class: 'tw-mark-row' },
      toggle('want', '♥ 想去', !!mine.want),
      toggle('been', '✓ 去過', !!mine.been)),
  );

  if (mine.been) {
    const stars = h('div', { class: 'tw-mark-stars', role: 'group', 'aria-label': '星等' },
      [1, 2, 3, 4, 5].map((n) => h('button', {
        type: 'button',
        class: `tw-mark-star${(mine.stars ?? 0) >= n ? ' is-on' : ''}`,
        'aria-label': `${n} 顆星`,
        onclick: () => save({ stars: mine.stars === n ? null : n }),
      }, '★')));
    const ym = h('input', { type: 'month', class: 'tw-mark-ym', value: mine.ym ?? '', max: ymNow(),
      'aria-label': '去過的年月',
      onchange: (e) => save({ ym: /^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value) ? e.target.value : null }) });
    const likes = h('div', { class: 'tw-mark-likes', role: 'group', 'aria-label': '喜不喜歡' },
      LIKES.map((l) => h('button', {
        type: 'button',
        class: `tw-mark-like is-${l.id}${mine.like === l.id ? ' is-on' : ''}`,
        'aria-pressed': mine.like === l.id ? 'true' : 'false',
        onclick: () => save({ like: mine.like === l.id ? null : l.id }),
      }, `${l.icon} ${l.label}`)));
    // 文字欄：打字停 600ms 後存；空白視為清掉
    const field = (key, max, label, ph) => {
      const ta = h('textarea', { class: `tw-mark-note is-${key}`, rows: '2', maxlength: String(max), placeholder: ph, 'aria-label': label });
      ta.value = mine[key] ?? '';
      ta.addEventListener('input', debounce(() => save({ [key]: ta.value.trim() || null }), 600));
      return h('label', { class: 'tw-mark-field' }, h('span', {}, label), ta);
    };
    root.append(
      h('div', { class: 'tw-mark-row' }, toggle('again', '↻ 想再去', !!mine.again), ym),
      stars, likes,
      field('good', 300, '👍 好吃／推薦', '例如：某道菜特別好吃、值得再點'),
      field('avoid', 300, '⚠️ 雷點／要避開', '例如：某道很雷、哪個時段別來'),
      field('note', 200, '備註', '其他想記的（最多 200 字，別放電話與訂位代號）'));
  }
  root.append(msg);
  return root;
}

// ── 兩人並排（地點詳情用） ──
export function markCompare(ctx, placeId) {
  const { h, store } = ctx;
  const s = statusOf(store, placeId);
  const col = (who) => {
    const m = s[who].mark;
    const bits = [];
    if (m?.want) bits.push('♥ 想去');
    if (m?.been) bits.push(`✓ 去過${m.ym ? `（${m.ym}）` : ''}`);
    if (m?.again) bits.push('↻ 想再去');
    if (m?.stars) bits.push('★'.repeat(m.stars));
    const lk = likeOf(m?.like);
    if (lk) bits.push(`${lk.icon} ${lk.label}`);
    return h('div', { class: `tw-mark-col is-${who}` },
      h('strong', {}, store.whoName(who)),
      h('p', {}, bits.length ? bits.join('　') : '還沒標'),
      m?.good && h('p', { class: 'tw-mark-good' }, h('b', {}, '👍 '), m.good),
      m?.avoid && h('p', { class: 'tw-mark-avoid' }, h('b', {}, '⚠️ '), m.avoid),
      m?.note && h('p', { class: 'tw-mark-quote' }, m.note));
  };
  return h('div', { class: 'tw-mark-compare' }, col('apong'), col('baobao'));
}

// ── 路由 #/compare ──
export async function mount(el, ctx) {
  const { h, clear, store } = ctx;
  const { placeCard } = await import('./places.js');
  // 預設停在第一個有地點的分組，不要一進來就是空的
  const countOf = (g) => store.get('places').filter((p) => {
    if (!store.isVisible(p)) return false;
    const s = statusOf(store, p.id);
    return g.test(s.apong, s.baobao);
  }).length;
  let group = (GROUPS.find((g) => countOf(g) > 0) ?? GROUPS[0]).id;

  const render = () => {
    clear(el);
    const { counties, lit, total } = litCounties(store);

    const tabs = h('div', { class: 'tw-mark-tabs', role: 'tablist' }, GROUPS.map((g) => h('button', {
      type: 'button', role: 'tab', class: `tw-mark-tab${g.id === group ? ' is-active' : ''}`,
      'aria-selected': g.id === group ? 'true' : 'false',
      onclick: () => { group = g.id; render(); },
    }, g.label)));

    const g = GROUPS.find((x) => x.id === group);
    const list = store.get('places').filter((p) => {
      if (!store.isVisible(p)) return false;
      const s = statusOf(store, p.id);
      return g.test(s.apong, s.baobao);
    });

    const litBox = h('section', { class: 'tw-mark-lit' },
      h('h2', {}, `點亮台灣：已點亮 ${lit.any.size}／${total} 縣市`),
      h('p', {}, `${store.whoName('apong')} ${lit.apong.size}　${store.whoName('baobao')} ${lit.baobao.size}　` +
        `兩人都去過 ${counties.filter((c) => lit.apong.has(c.id) && lit.baobao.has(c.id)).length}`),
      h('div', { class: 'tw-mark-lit-list' }, counties.map((c) => h('a', {
        class: `tw-mark-lit-chip${lit.any.has(c.id) ? ' is-lit' : ''}`,
        href: `#/r/${c.id}`,
      }, c.n))),
      lit.any.size === 0 && h('p', { class: 'tw-hint' }, '還沒有人標過「去過」，標了就會亮起來。'));

    el.append(
      h('h1', {}, '兩人對照'),
      tabs,
      h('p', { class: 'tw-hint' }, `${g.label}：${list.length} 個`),
      list.length
        ? h('div', { class: 'tw-place-list' }, list.map((p) => placeCard(ctx, p)))
        : h('p', { class: 'tw-empty' }, '這一類還沒有地點。到', h('a', { href: '#/' }, '地圖'), '點縣市，幫地點標「想去」或「去過」，就會出現在這裡。'),
      litBox);
  };

  render();
  const offs = [store.subscribe('marks', render), store.subscribe('places', render)];
  return () => offs.forEach((off) => off());
}
