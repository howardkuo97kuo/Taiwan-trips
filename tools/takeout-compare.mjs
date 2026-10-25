// 比對 Google Takeout「已儲存」資料夾的清單（CSV）與 data/places.json。
// 用法：node tools/takeout-compare.mjs <Takeout 已儲存資料夾> [輸出暫存清單，預設 data/staging/takeout-new.json]
// 網址裡的 !1s0x…:0x… 可直接換算成 Places API 的 pid（ChIJ…），不用靠名稱猜；
// 台灣的新地點寫進暫存清單，之後用 lookup-places.yml（暫存清單有 pid 就直接查詳細資料）→ merge-places.mjs 併入。
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const out = process.argv[3] ?? 'data/staging/takeout-new.json';
if (!dir) { console.error('用法：node tools/takeout-compare.mjs <Takeout 已儲存資料夾> [輸出檔]'); process.exit(1); }

function parseCSV(t) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const le = (h) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt('0x' + h)); return b; };
const ftidToPid = (hi, lo) => Buffer.concat([Buffer.from([0x0a, 0x12, 0x09]), le(hi), Buffer.from([0x11]), le(lo)]).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const places = JSON.parse(readFileSync('data/places.json', 'utf8'));
const have = new Set(places.map((p) => p.pid).filter(Boolean));
const haveName = new Set(places.map((p) => p.n.replace(/\s+/g, '').toLowerCase()));

const news = [], seen = new Set();
let total = 0, inDb = 0, nonTw = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.csv'))) {
  if (!/^台灣|^吃過即可/.test(f)) continue; // 只看台灣的清單與「吃過即可」；其他國家的清單略過
  const rows = parseCSV(readFileSync(join(dir, f), 'utf8').replace(/^\uFEFF/, ''));
  rows.shift();
  for (const [title, note, url] of rows) {
    if (!title && !url) continue;
    const m = /!1s0x([0-9a-f]+):0x([0-9a-f]+)/.exec(url ?? '');
    if (!m) continue;
    total++;
    const pid = ftidToPid(m[1], m[2]);
    if (have.has(pid) || seen.has(pid)) { inDb++; continue; }
    if (haveName.has(title.replace(/\s+/g, '').toLowerCase())) { inDb++; continue; } // 同名視為已有（Google 可能換過 ID）
    seen.add(pid);
    // 台灣的 ftid 高位大約落在 0x3440–0x3480；真正的國別由 lookup 的縣市判斷（查不到縣市會被略過）
    const hi = parseInt(m[1].slice(0, 4), 16);
    if (hi < 0x3440 || hi > 0x3480) { nonTw++; continue; }
    news.push({ n: title.replace(/\s*查詢休假日請加Line.*$/i, '').trim(), c: '美食', ...((note ?? '').trim() ? { note: note.trim().replace(/\s*\n+\s*/g, '；') } : {}), pid, grp: f.replace(/\.csv$/, '') });
  }
}
writeFileSync(out, JSON.stringify(news, null, 1) + '\n');
console.log(`清單共 ${total} 筆：已在資料庫 ${inDb}、非台灣 ${nonTw}、新的台灣地點 ${news.length}（已寫入 ${out}）`);
console.log('下一步：gh workflow run lookup-places.yml -f list=' + out + ' -f limit=200，再用 tools/merge-places.mjs 併入。');
