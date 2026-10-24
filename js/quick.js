// 快速選擇 #/quick：一次一張卡，想去／不想去／之後再說。可滑動、鍵盤 ←（不想去）→（想去）。
// 寫入走 sync.setMark，想去與不想去互斥（skip 欄位見 docs/SPEC.md）。
import { statusOf } from './marks.js';
import { findRegion } from './places.js';
import { thumb } from './photos.js';
import { catIcon } from './icons.js';

const SWIPE_PX = 90;

export function mount(el, ctx) {
  const { h, clear, store, sync, toast } = ctx;
  let who = store.get('who');
  const later = new Set(); // 這次先跳過的，離開頁面就忘
  const hist = []; // { id, prev }
  const f = { zone: '', cat: '' };
  let queue = [];
  let idx = 0;
  let cardEl = null;

  const mark = (id) => store.get('marks')[who]?.[id] ?? null;
  const undecided = (p) => { const m = mark(p.id); return !m?.want && !m?.been && !m?.skip; };
  const zoneOf = (p) => (store.get('regions')?.zones ?? []).find((z) => p.region?.startsWith(`${z.id}-`))?.id ?? '';
  const pool = () => store.get('places').filter((p) => store.isVisible(p)
    && (!f.zone || zoneOf(p) === f.zone) && (!f.cat || p.c === f.cat || [p.c2].flat().includes(f.cat)));
  const buildQueue = () => { queue = pool().filter((p) => undecided(p) && !later.has(p.id)).map((p) => p.id); idx = 0; };

  async function decide(kind) {
    const p = store.placeById(queue[idx]);
    if (!p) return;
    const prev = mark(p.id);
    hist.push({ id: p.id, prev });
    idx += 1;
    render();
    try {
      if (kind === 'later') later.add(p.id);
      else await sync.setMark(p.id, kind === 'want' ? { want: true, skip: null } : { skip: true, want: null });
    } catch (e) {
      console.warn(e);
      hist.pop(); idx -= 1; render();
      toast('沒存成功，網路好了再試一次。', { tone: 'bad' });
    }
  }

  async function undo() {
    const last = hist.pop();
    if (!last) return;
    later.delete(last.id);
    const back = { want: last.prev?.want ?? null, skip: last.prev?.skip ?? null };
    idx = Math.max(0, idx - 1);
    if (queue[idx] !== last.id) { queue.splice(idx, 0, last.id); }
    render();
    try { await sync.setMark(last.id, back); } catch (e) {
      console.warn(e);
      toast('復原沒成功，網路好了再試一次。', { tone: 'bad' });
    }
  }

  function filters() {
    const zones = store.get('regions')?.zones ?? [];
    const cats = store.get('config')?.categories ?? [];
    const sel = (key, label, opts) => h('label', { class: 'tw-quick-filter' }, h('span', {}, label),
      h('select', { onchange: (e) => { f[key] = e.target.value; buildQueue(); render(); } },
        h('option', { value: '' }, '全部'),
        opts.map(([v, n]) => h('option', { value: v, selected: f[key] === v ? '' : null }, n))));
    return h('div', { class: 'tw-quick-filters' },
      sel('zone', '地區', zones.map((z) => [z.id, z.n])),
      sel('cat', '分類', cats.map((c) => { const n = typeof c === 'string' ? c : c.n ?? c.id; return [n, n]; })));
  }

  function cardFor(p) {
    const m = statusOf(store, p.id);
    const other = store.otherWho(who);
    const county = findRegion(store.get('regions'), p.region)?.county?.n ?? '';
    const otherBits = [m[other].want && '想去', m[other].been && '去過', m[other].mark?.skip && '不想去'].filter(Boolean);
    const card = h('article', { class: 'tw-quick-card' },
      h('div', { class: 'tw-quick-stub' }, catIcon(p.c), h('span', {}, p.c), county && h('span', {}, county)),
      thumb(ctx, p),
      h('h2', { class: 'tw-quick-name' }, p.n),
      p.a && h('p', { class: 'tw-quick-addr' }, p.a),
      p.note && h('p', { class: 'tw-quick-note' }, p.note),
      h('p', { class: 'tw-quick-other' }, `${store.whoName(other)}：${otherBits.join('、') || '還沒標'}`),
      p.gurl && h('a', { class: 'tw-quick-map', href: p.gurl, target: '_blank', rel: 'noopener' }, 'Google 地圖'),
      h('span', { class: 'tw-quick-badge is-no' }, '不想去'),
      h('span', { class: 'tw-quick-badge is-yes' }, '想去'));
    // 滑動：左不想去、右想去；沒超過門檻就彈回
    let x0 = null; let y0 = 0; let dx = 0;
    card.addEventListener('pointerdown', (e) => {
      if (e.target.closest('a,button')) return;
      x0 = e.clientX; y0 = e.clientY; dx = 0; card.setPointerCapture?.(e.pointerId);
    });
    card.addEventListener('pointermove', (e) => {
      if (x0 == null) return;
      dx = e.clientX - x0;
      if (Math.abs(e.clientY - y0) > Math.abs(dx) * 1.5) return;
      card.style.transform = `translateX(${dx}px) rotate(${dx / 30}deg)`;
      card.dataset.dir = dx > 20 ? 'yes' : dx < -20 ? 'no' : '';
    });
    const end = () => {
      if (x0 == null) return;
      x0 = null;
      card.style.transform = ''; card.dataset.dir = '';
      if (dx > SWIPE_PX) decide('want'); else if (dx < -SWIPE_PX) decide('skip');
    };
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);
    return card;
  }

  function render() {
    clear(el);
    if (!who) {
      el.append(h('p', { class: 'tw-empty' }, '先在右上角選身分，才能快速選擇。'));
      return;
    }
    const total = pool().length;
    const decided = pool().filter((p) => !undecided(p)).length;
    const p = store.placeById(queue[idx]);
    const mine = store.get('marks')[who] ?? {};
    const skipped = pool().filter((x) => mine[x.id]?.skip);
    el.append(
      h('h1', {}, '快速選擇'),
      h('p', { class: 'tw-hint' }, `${store.whoName(who)}已選 ${decided}／${total}。右滑或按 → 想去，左滑或按 ← 不想去。`),
      filters());
    cardEl = null;
    if (p) {
      cardEl = cardFor(p);
      el.append(cardEl,
        h('div', { class: 'tw-quick-actions' },
          h('button', { type: 'button', class: 'tw-quick-btn is-no', onclick: () => decide('skip') }, '✕ 不想去'),
          h('button', { type: 'button', class: 'tw-quick-btn is-later', onclick: () => decide('later') }, '之後再說'),
          h('button', { type: 'button', class: 'tw-quick-btn is-yes', onclick: () => decide('want') }, '♥ 想去')),
        h('p', { class: 'tw-hint tw-quick-foot' },
          h('button', { type: 'button', class: 'tw-quick-undo', disabled: hist.length ? null : '', onclick: undo }, '↶ 上一步'),
          `　第 ${idx + 1}／${queue.length} 個`));
    } else {
      el.append(h('section', { class: 'tw-quick-done' },
        h('h2', {}, queue.length ? '這一批看完了' : '沒有還沒選的地點了'),
        h('p', {}, later.size ? `有 ${later.size} 個先跳過，` : '', '想去的到「兩人對照」看。'),
        later.size > 0 && h('button', { type: 'button', class: 'tw-quick-btn', onclick: () => { later.clear(); buildQueue(); render(); } }, '把跳過的再看一輪'),
        h('a', { class: 'tw-quick-link', href: '#/compare' }, '去兩人對照')));
    }
    if (skipped.length) {
      el.append(h('details', { class: 'tw-quick-skipped' },
        h('summary', {}, `我標了不想去（${skipped.length}）`),
        h('ul', {}, skipped.map((x) => h('li', {}, h('a', { href: `#/p/${x.id}` }, x.n),
          h('button', { type: 'button', onclick: () => sync.setMark(x.id, { skip: null }).catch(() => toast('沒存成功，網路好了再試一次。', { tone: 'bad' })) }, '改回未選'))))));
    }
  }

  const onKey = (e) => {
    if (e.target.closest?.('input,select,textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight') decide('want');
    else if (e.key === 'ArrowLeft') decide('skip');
    else if (e.key === 'ArrowDown') decide('later');
    else if (e.key === 'Backspace') undo();
  };
  document.addEventListener('keydown', onKey);

  buildQueue();
  render();
  // 標記更新（含另一人或另一台裝置）時只重畫清單說明，不打斷目前這張卡
  const off = store.subscribe('marks', () => { if (!cardEl) render(); });
  const offWho = store.subscribe('who', (w) => { who = w; hist.length = 0; buildQueue(); render(); });
  return () => { document.removeEventListener('keydown', onKey); off(); offWho(); };
}
