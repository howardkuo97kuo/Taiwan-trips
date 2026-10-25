// 快速選擇 #/quick：一次一張卡，想去／不想去／沒意見。可滑動、鍵盤 ←（不想去）→（想去）。
// 寫入走 sync.setMark，想去、不想去、沒意見三者互斥（skip、neutral 欄位見 docs/SPEC.md）。
// 沒意見是「看過但沒決定」，不會再出現在預設的待選清單，可用「狀態」篩選挑出來重選。
import { statusOf } from './marks.js';
import { findRegion, michBadge, googleBlock } from './places.js';
import { carousel } from './photos.js';
import { loadGoogle, googleOf, onGoogle, todayZh } from './google.js';
import { catIcon } from './icons.js';

const SWIPE_PX = 90;

export function mount(el, ctx) {
  const { h, clear, store, sync, toast } = ctx;
  let who = store.get('who');
  const hist = []; // { id, prev }
  const f = { zone: '', county: '', cat: '', st: '' };
  let queue = [];
  let idx = 0;
  let cardEl = null;

  const mark = (id) => store.get('marks')[who]?.[id] ?? null;
  const undecided = (p) => { const m = mark(p.id); return !m?.want && !m?.been && !m?.skip && !m?.neutral; };
  const isNeutral = (p) => { const m = mark(p.id); return !!m?.neutral && !m?.want && !m?.been && !m?.skip; };
  const zoneOf = (p) => (store.get('regions')?.zones ?? []).find((z) => p.region?.startsWith(`${z.id}-`))?.id ?? '';
  const pool = () => store.get('places').filter((p) => store.isVisible(p)
    && (!f.zone || zoneOf(p) === f.zone) && (!f.county || p.region === f.county || p.region?.startsWith(`${f.county}-`)) && (!f.cat || p.c === f.cat || [p.c2].flat().includes(f.cat)));
  const buildQueue = () => { queue = pool().filter((p) => (f.st === 'neutral' ? isNeutral(p) : undecided(p))).map((p) => p.id); idx = 0; };

  async function decide(kind) {
    const p = store.placeById(queue[idx]);
    if (!p) return;
    const prev = mark(p.id);
    hist.push({ id: p.id, prev });
    idx += 1;
    render();
    try {
      await sync.setMark(p.id, kind === 'want' ? { want: true, skip: null, neutral: null } : kind === 'skip' ? { skip: true, want: null, neutral: null } : { neutral: true, want: null, skip: null });
    } catch (e) {
      console.warn(e);
      hist.pop(); idx -= 1; render();
      toast('沒存成功，網路好了再試一次。', { tone: 'bad' });
    }
  }

  async function undo() {
    const last = hist.pop();
    if (!last) return;
    const back = { want: last.prev?.want ?? null, skip: last.prev?.skip ?? null, neutral: last.prev?.neutral ?? null };
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
    const counties = zones.filter((z) => !f.zone || z.id === f.zone).flatMap((z) => z.counties ?? []);
    const sel = (key, label, opts, all = '全部') => h('label', { class: 'tw-quick-filter' }, h('span', {}, label),
      h('select', { onchange: (e) => { f[key] = e.target.value; if (key === 'zone') f.county = ''; buildQueue(); render(); } },
        h('option', { value: '' }, all),
        opts.map(([v, n]) => h('option', { value: v, selected: f[key] === v ? '' : null }, n))));
    return h('div', { class: 'tw-quick-filters' },
      sel('zone', '地區', zones.map((z) => [z.id, z.n])),
      sel('county', '縣市', counties.map((x) => [x.id, x.n])),
      sel('cat', '分類', cats.map((c) => { const n = typeof c === 'string' ? c : c.n ?? c.id; return [n, n]; })),
      sel('st', '狀態', [['neutral', '沒意見']], '還沒選'));
  }

  function cardFor(p) {
    const m = statusOf(store, p.id);
    const other = store.otherWho(who);
    const county = findRegion(store.get('regions'), p.region)?.county?.n ?? '';
    const g = googleOf(p.pid);
    const sumSlot = h('div', { class: 'tw-place-sumslot' });
    const gb = p.pid ? googleBlock(ctx, p, sumSlot) : null;
    const today = g?.hours?.find((t) => t.startsWith(todayZh()));
    const revs = (g?.reviews ?? []).slice(0, 2).map((rv) => h('blockquote', { class: 'tw-quick-rev' },
      h('span', {}, `${rv.by || 'Google 使用者'}　${'★'.repeat(Math.round(rv.r || 0))}`),
      h('p', {}, (rv.t || '').length > 110 ? `${rv.t.slice(0, 110)}…` : rv.t || '（沒有文字）')));
    const otherBits = [m[other].want && '想去', m[other].been && '去過', m[other].mark?.skip && '不想去'].filter(Boolean);
    const card = h('article', { class: 'tw-quick-card' },
      h('div', { class: 'tw-quick-stub' }, catIcon(p.c), h('span', {}, p.c), county && h('span', {}, county)),
      ctx.config?.google?.placesKey && p.pid && h('div', { class: 'tw-quick-media' }, carousel(ctx, p, { card: true })),
      h('h2', { class: 'tw-quick-name' }, p.n),
      michBadge(ctx, p),
      sumSlot,
      today && h('p', { class: 'tw-quick-today' }, `今天 ${today.replace(/^[^:：]*[:：]\s*/, '')}`),
      p.a && h('p', { class: 'tw-quick-addr' }, p.a),
      gb,
      p.note && h('p', { class: 'tw-quick-note' }, p.note),
      h('p', { class: 'tw-quick-other' }, `${store.whoName(other)}：${otherBits.join('、') || '還沒標'}`),
      revs.length > 0 && h('div', { class: 'tw-quick-revs' }, revs),
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
    const neutralN = pool().filter(isNeutral).length;
    const skipped = pool().filter((x) => mine[x.id]?.skip);
    el.append(
      h('h1', {}, '快速選擇'),
      h('p', { class: 'tw-hint' }, `${store.whoName(who)}已選 ${decided}／${total}。右滑或按 → 想去，左滑或按 ← 不想去，按 ↓ 沒意見。`),
      filters());
    cardEl = null;
    if (p) {
      cardEl = cardFor(p);
      el.append(cardEl,
        h('div', { class: 'tw-quick-actions' },
          h('button', { type: 'button', class: 'tw-quick-btn is-no', onclick: () => decide('skip') }, '✕ 不想去'),
          h('button', { type: 'button', class: 'tw-quick-btn is-later', onclick: () => decide('neutral') }, '沒意見'),
          h('button', { type: 'button', class: 'tw-quick-btn is-yes', onclick: () => decide('want') }, '♥ 想去')),
        h('p', { class: 'tw-hint tw-quick-foot' },
          h('button', { type: 'button', class: 'tw-quick-undo', disabled: hist.length ? null : '', onclick: undo }, '↶ 上一步'),
          `　第 ${idx + 1}／${queue.length} 個`));
    } else {
      el.append(h('section', { class: 'tw-quick-done' },
        h('h2', {}, queue.length ? '這一批看完了' : f.st === 'neutral' ? '沒有沒意見的地點了' : '沒有還沒選的地點了'),
        h('p', {}, f.st !== 'neutral' && neutralN ? `有 ${neutralN} 個標了沒意見，` : '', '想去的到「兩人對照」看。'),
        f.st !== 'neutral' && neutralN > 0 && h('button', { type: 'button', class: 'tw-quick-btn', onclick: () => { f.st = 'neutral'; buildQueue(); render(); } }, '把沒意見的再選一輪'),
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
    else if (e.key === 'ArrowDown') decide('neutral');
    else if (e.key === 'Backspace') undo();
  };
  document.addEventListener('keydown', onKey);

  buildQueue();
  render();
  loadGoogle();
  const offG = onGoogle(() => render());
  // 標記更新（含另一人或另一台裝置）時只重畫清單說明，不打斷目前這張卡
  const off = store.subscribe('marks', () => { if (!cardEl) render(); });
  const offWho = store.subscribe('who', (w) => { who = w; hist.length = 0; buildQueue(); render(); });
  return () => { document.removeEventListener('keydown', onKey); off(); offWho(); offG(); };
}
