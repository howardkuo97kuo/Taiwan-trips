// Google 地點資料（預存版）。模組 D。
// 排程 refresh-google 定期把評分、地址、營業時間、評論寫進 Firebase /google/{pid}；網站只讀，不再逐筆即時查。
// 決定與格式見 docs/SPEC.md「Google 資料」。每筆都有更新時間 u，畫面一定要顯示「上次更新」。
//
// /google/{pid} = {
//   u: 更新時間（ms）, status?: 'OPERATIONAL'|'CLOSED_TEMPORARILY'|'CLOSED_PERMANENTLY'|'NOT_FOUND',
//   rating?, n?（評論數）, addr?, maps?,
//   hours?: ['星期一: …', …共 7 行], periods?: [{ o:{d,h,m}, c:{d,h,m} }]（d: 0=週日）,
//   reviews?: [{ r, t, o?, by, uri?, at? }]（at = 發表時間 ISO；Google 只給最相關的最多 5 則）,
//   ai?: { t: AI 整理的一小段評語, n: 整理自幾則評論, at: 整理時間（ms） }（由 write-google-ai 工作流程另外寫入，每週更新不會蓋掉）
// }
import { fbGet } from './sync.js';

let all = null; // null = 還沒載入
let pending = null;
let failed = null;
const subs = new Set();

// 整包只抓一次（約數百 KB），之後清單、卡片、詳情都從記憶體讀
export function loadGoogle() {
  pending ??= fbGet('google')
    .then((d) => { all = d ?? {}; })
    .catch((e) => { failed = e; all = {}; })
    .finally(() => subs.forEach((fn) => fn()));
  return pending;
}
export const googleOf = (pid) => (pid && all ? all[pid] ?? null : null);
export const googleReady = () => all !== null;
export const googleError = () => failed;
export const onGoogle = (fn) => { subs.add(fn); return () => subs.delete(fn); };

// ── 時間（台北時區）──
const TZ = 'Asia/Taipei';
const taipeiParts = (date) => {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const v = (t) => f.find((x) => x.type === t).value;
  return { d: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(v('weekday')), m: Number(v('hour')) * 60 + Number(v('minute')) };
};

// 現在是否營業：用預存的營業時段算。沒有時段資料回 null（不知道）；國定假日與臨時公休無法得知
export function isOpenNow(g, date = new Date()) {
  if (!g?.periods?.length) return null;
  if (g.status === 'CLOSED_PERMANENTLY' || g.status === 'CLOSED_TEMPORARILY') return false;
  const { d, m } = taipeiParts(date);
  const now = d * 1440 + m;
  for (const p of g.periods) {
    const o = p.o.d * 1440 + p.o.h * 60 + p.o.m;
    if (!p.c) return true; // 24 小時營業
    let c = p.c.d * 1440 + p.c.h * 60 + p.c.m;
    if (c <= o) c += 7 * 1440;
    if ((now >= o && now < c) || (now + 7 * 1440 >= o && now + 7 * 1440 < c)) return true;
  }
  return false;
}

const DAY_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
export const todayZh = (date = new Date()) => DAY_ZH[taipeiParts(date).d];

// 「2026-10-24 17:30」
export function updatedLabel(g) {
  if (!g?.u) return '';
  const f = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return f.format(new Date(g.u));
}
// 「2026-10-25」
export const dateLabel = (ms) => (ms ? new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)) : '');
export const staleDays = (g) => (g?.u ? Math.floor((Date.now() - g.u) / 86400000) : null);
export const STALE_AFTER_DAYS = 10;

// 評論「N 個月前」：用發表時間算，不存會過期的相對時間
export function ago(iso) {
  const t = Date.parse(iso ?? '');
  if (!t) return '';
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days < 1) return '今天';
  if (days < 14) return `${days} 天前`;
  if (days < 60) return `${Math.floor(days / 7)} 週前`;
  if (days < 730) return `${Math.floor(days / 30)} 個月前`;
  return `${Math.floor(days / 365)} 年前`;
}
