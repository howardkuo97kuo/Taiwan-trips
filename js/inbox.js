// 收件匣（模組 E）：貼 Google 地圖連結或店名，由 Claude 查好再上架；也可以送「修正」與「網站意見」。
// 網站意見前綴【意見】，每週由排程整理成修改方向，站主決定後才執行。
// 寫入 /inbox/{id} = { text, by, ts, status }（規則見 firebase-rules.json）；
// 讀取用輪詢（不佔 SSE 連線），頁面看不到時暫停。離線時先存 localStorage，連上後補送。
// status：new 待處理、done 已上架、dup 已經有了、skip 不收錄（Claude 處理後用 write-data 更新）。

const QUEUE_KEY = 'twInboxQueue';
const POLL_MS = 30000;
const MAX_LEN = 500;
const IDEA = '【意見】';
const KINDS = [
  { id: 'add', label: '新增地點', prefix: '', ph: '貼上 Google 地圖連結，或直接寫店名與縣市' },
  { id: 'fix', label: '修正地點', prefix: '【修正】', ph: '哪一間要改什麼？例如：○○ 搬到新北市，或歇業了' },
  { id: 'idea', label: '網站意見', prefix: IDEA, ph: '哪裡不好用、想要什麼功能、哪裡看不懂都可以寫', hint: '送出後每週會整理一次，由站主決定要不要改；這裡看得到處理進度。' },
];
const STATUS = {
  new: ['待處理', 'is-new'],
  done: ['已上架', 'is-done'],
  dup: ['已經有了', 'is-dup'],
  skip: ['不收錄', 'is-skip'],
};

const readQueue = () => {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]'); } catch { return []; }
};
const writeQueue = (q) => {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* 無痕模式等 */ }
};

const timeText = (ts) => new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(ts));

export function mount(el, ctx) {
  const { h, clear, store, sync, toast } = ctx;
  let kind = KINDS[0];
  let items = null; // null＝還沒讀到；[]＝空
  let published = [];
  let loadError = false;
  let sending = false;
  let timer = null;
  let alive = true;

  const input = h('textarea', {
    class: 'tw-inbox-input', rows: '3', maxlength: String(MAX_LEN), placeholder: kind.ph,
    'aria-label': '內容',
  });
  const kindBox = h('div', { class: 'tw-inbox-kinds', role: 'group', 'aria-label': '類型' });
  const hint = h('p', { class: 'tw-hint tw-inbox-hint' });
  const submit = h('button', { class: 'tw-inbox-send', type: 'button', onclick: () => send() }, '送出');
  const listBox = h('div', { class: 'tw-inbox-list' });
  const pubBox = h('div', { class: 'tw-inbox-pub' });

  const drawKinds = () => {
    clear(kindBox).append(...KINDS.map((k) => h('button', {
      class: `tw-inbox-kind${k === kind ? ' is-active' : ''}`, type: 'button', 'aria-pressed': String(k === kind),
      onclick: () => { kind = k; input.placeholder = k.ph; drawKinds(); drawHint(); },
    }, k.label)));
  };

  const drawHint = () => {
    const who = store.get('who');
    const queued = readQueue().length;
    hint.textContent = !who ? '先在右上角選身分，才知道是誰送的。'
      : queued ? `有 ${queued} 筆還沒送出（目前離線），連上網路後會自動補送。`
        : kind.hint ?? '送出後 Claude 會查地址與座標再上架，通常要等一下；這裡看得到處理進度。';
    submit.disabled = !who || sending;
  };

  const entry = (it) => {
    const [label, cls] = it.status === 'done' && it.text.startsWith(IDEA) ? ['已處理', 'is-done'] : STATUS[it.status] ?? [it.status, 'is-new'];
    const mine = it.by === store.get('who') && it.status === 'new' && !it.pending;
    return h('article', { class: `tw-inbox-item${it.pending ? ' is-pending' : ''}` },
      h('p', { class: 'tw-inbox-text' }, it.text),
      h('footer', { class: 'tw-inbox-meta' },
        h('span', { class: `tw-inbox-status ${cls}` }, it.pending ? '等待送出' : label),
        h('span', {}, `${store.whoName(it.by)} · ${timeText(it.ts)}`),
        mine && h('button', { class: 'tw-inbox-undo', type: 'button', onclick: () => retract(it) }, '收回')));
  };

  const drawList = () => {
    const queued = readQueue().map((q) => ({ ...q, pending: true, status: 'new' }));
    const rows = [...queued, ...(items ?? [])];
    clear(listBox);
    if (items === null && !queued.length) {
      listBox.append(h('p', { class: loadError ? 'tw-empty' : 'tw-loading' }, loadError ? '讀不到送件紀錄（可能離線），稍後會再試。' : '載入中…'));
    } else if (!rows.length) {
      listBox.append(h('p', { class: 'tw-empty' }, '還沒有東西。貼一個想去的地方，或寫下對網站的想法吧。'));
    } else {
      listBox.append(...rows.map(entry));
    }
    clear(pubBox);
    if (published.length) {
      pubBox.append(
        h('h3', { class: 'tw-inbox-sub' }, `已查好、等併回地點庫（${published.length}）`),
        h('p', { class: 'tw-inbox-names' }, published.map((p) => p.n).join('、')));
    }
    drawHint();
  };

  async function load() {
    try {
      const [inbox, places] = await Promise.all([sync.fbGet('inbox'), sync.fbGet('places')]);
      items = Object.entries(inbox ?? {})
        .map(([id, v]) => ({ id, ...v }))
        .filter((v) => typeof v.text === 'string')
        .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
      published = Object.values(places ?? {}).filter((p) => p && typeof p.n === 'string');
      loadError = false;
    } catch {
      loadError = true;
    }
    if (alive) drawList();
  }

  async function flush() {
    const q = readQueue();
    if (!q.length || !navigator.onLine) return;
    const left = [];
    for (const it of q) {
      try { await sync.fbPush('inbox', { text: it.text, by: it.by, ts: it.ts, status: 'new' }); } catch { left.push(it); }
    }
    writeQueue(left);
    if (left.length < q.length) toast('離線時存的地點已送出');
    if (alive) await load();
  }

  async function send() {
    const who = store.get('who');
    const text = (kind.prefix + input.value.trim()).slice(0, MAX_LEN);
    if (!who || text === kind.prefix || sending) return;
    sending = true;
    drawHint();
    const rec = { text, by: who, ts: Date.now(), status: 'new' };
    try {
      if (!navigator.onLine) throw new Error('offline');
      await sync.fbPush('inbox', rec);
      input.value = '';
      toast('已送出，Claude 會處理');
      await load();
    } catch {
      writeQueue([...readQueue(), { text: rec.text, by: rec.by, ts: rec.ts }]);
      input.value = '';
      toast('現在連不上，先存在這台裝置，連上後自動補送');
    }
    sending = false;
    drawList();
  }

  async function retract(it) {
    try {
      await sync.fbDelete(`inbox/${it.id}`);
      items = items.filter((x) => x.id !== it.id);
      drawList();
      toast('已收回');
    } catch {
      toast('收回失敗，稍後再試', { tone: 'bad' });
    }
  }

  const poll = () => {
    clearTimeout(timer);
    if (!alive) return;
    timer = setTimeout(async () => {
      if (!document.hidden) { await flush(); await load(); }
      poll();
    }, POLL_MS);
  };
  const onVisible = () => { if (!document.hidden) { flush().then(load); } };
  const onOnline = () => { flush(); drawHint(); };

  el.append(h('section', { class: 'tw-inbox' },
    h('h2', { class: 'tw-inbox-title' }, '收件匣'),
    h('p', { class: 'tw-inbox-lead' }, '想加的地點、要修正的資料、對網站的意見，丟進來就好。'),
    kindBox, input, h('div', { class: 'tw-inbox-actions' }, submit), hint,
    h('h3', { class: 'tw-inbox-sub' }, '送過的紀錄'), listBox, pubBox));

  drawKinds();
  drawList();
  const unsubWho = store.subscribe('who', drawList);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  flush().then(load);
  poll();

  return () => {
    alive = false;
    clearTimeout(timer);
    unsubWho();
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onOnline);
  };
}
