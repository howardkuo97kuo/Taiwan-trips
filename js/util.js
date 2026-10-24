// 共用小工具。所有模組都可以 import；只有 B 能改。
// 安全慣例：使用者輸入一律走 textContent（透過 h() 的子節點），不用 innerHTML。

// 建 DOM：h('div', {class: 'card', onclick: fn}, '文字', 子節點)
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// 清空容器
export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// 台北時間的 YYYY-MM（去過只記年月）
export function ymNow(date = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit' })
    .formatToParts(date);
  const get = (t) => p.find((x) => x.type === t).value;
  return `${get('year')}-${get('month')}`;
}

// 去抖
export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// 取 JSON；失敗回 fallback（資料檔還沒建好時網站也要能開）
export async function loadJson(url, fallback = null) {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) return fallback;
    return await r.json();
  } catch {
    return fallback;
  }
}

// 底部提示：toast('已標想去', { action: '復原', onAction: fn, tone: 'bad', ms: 5000 })
// 回傳關閉函式。沒有 #tw-toast 容器（例如測試頁）就什麼都不做。
export function toast(message, { action, onAction, tone, ms = 5000 } = {}) {
  const host = document.getElementById('tw-toast');
  if (!host) return () => {};
  const el = h('div', { class: `tw-toast${tone === 'bad' ? ' is-bad' : ''}` }, h('span', {}, message));
  let timer;
  const close = () => { clearTimeout(timer); el.remove(); };
  if (action) el.append(h('button', { type: 'button', onclick: () => { close(); onAction?.(); } }, action));
  host.append(el);
  while (host.children.length > 3) host.firstChild.remove();
  timer = setTimeout(close, ms);
  return close;
}
