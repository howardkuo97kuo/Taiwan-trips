// 把 AI 整理的評語寫進 Firebase /google/{pid}/ai。由 .github/workflows/write-google-ai.yml 執行。
// 輸入（環境變數 INPUT_PAYLOAD）：{ "<pid>": { "t": "一小段評語", "n": 整理自幾則評論 }, … }
// 只允許 data/places.json 裡有的 pid；每筆最多 200 字；只寫 /google/{pid}/ai，不動其他欄位。
import { readFileSync } from 'node:fs';

const SECRET = process.env.FIREBASE_SECRET;
if (!SECRET) { console.error('缺少環境變數 FIREBASE_SECRET'); process.exit(1); }
const config = JSON.parse(readFileSync(new URL('../data/config.json', import.meta.url), 'utf8'));
const DB = (config.firebase?.dbUrl ?? '').replace(/\/+$/, '');
if (!DB) { console.error('data/config.json 的 firebase.dbUrl 尚未填寫'); process.exit(1); }

let payload;
try { payload = JSON.parse(process.env.INPUT_PAYLOAD ?? ''); } catch { console.error('payload 不是合法 JSON'); process.exit(1); }
if (!payload || typeof payload !== 'object' || Array.isArray(payload)) { console.error('payload 必須是物件'); process.exit(1); }

const places = JSON.parse(readFileSync(new URL('../data/places.json', import.meta.url), 'utf8'));
const known = new Set((Array.isArray(places) ? places : places.places ?? []).map((p) => p.pid).filter(Boolean));

const at = Date.now();
const updates = {};
let bad = 0;
for (const [pid, v] of Object.entries(payload)) {
  const ok = known.has(pid) && v && typeof v.t === 'string' && v.t.trim().length > 0 && v.t.length <= 200
    && Number.isInteger(v.n ?? 0) && (v.n ?? 0) >= 0 && (v.n ?? 0) <= 20;
  if (!ok) { bad++; console.warn(`略過不合格的項目：${pid.slice(0, 12)}…`); continue; }
  updates[`${pid}/ai`] = { t: v.t.trim(), n: v.n ?? 0, at };
}
const n = Object.keys(updates).length;
if (!n) { console.error('沒有可寫入的項目'); process.exit(1); }

const r = await fetch(`${DB}/google.json?auth=${encodeURIComponent(SECRET)}`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
});
if (!r.ok) { console.error(`Firebase PATCH ${r.status}`); process.exit(1); }
console.log(`已寫入 ${n} 筆評語${bad ? `，略過 ${bad} 筆不合格` : ''}`);
if (bad) process.exit(1);
