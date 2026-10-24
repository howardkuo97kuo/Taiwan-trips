// 把收件匣的待處理項目轉成暫存清單，交給 lookup-places 查座標（模組 E）。
// 用法：node tools/inbox-to-list.mjs <inbox.json> <輸出清單.json>
// inbox.json 是 read-firebase 的 `live/inbox.json`（{id: {text, by, ts, status}}）。
// 連結：短網址會跟著轉址，從 /maps/place/<店名>/ 或 ?q= 取店名；其餘文字原樣當查詢字串。
// 【修正】開頭的不轉，只列出來，由 Claude 人工處理。Google 評分與營業時間一律不碰。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [inFile, outFile] = process.argv.slice(2);
if (!inFile || !outFile) {
  console.error('用法：node tools/inbox-to-list.mjs <inbox.json> <輸出清單.json>');
  process.exit(1);
}
const inbox = JSON.parse(readFileSync(inFile, 'utf8')) ?? {};
const URL_RE = /https?:\/\/[^\s]+/g;
const MAPS_HOST = /(^|\.)(google\.[a-z.]+|goo\.gl|maps\.app\.goo\.gl)$/;

async function nameFromLink(link) {
  let u;
  try { u = new URL(link); } catch { return null; }
  if (!MAPS_HOST.test(u.hostname)) return null;
  let final = link;
  try {
    const r = await fetch(link, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (taiwan-trips inbox)' } });
    final = r.url;
  } catch { /* 沿用原網址 */ }
  const f = new URL(final);
  const m = f.pathname.match(/\/maps\/place\/([^/]+)/);
  const raw = m ? m[1] : f.searchParams.get('q');
  if (!raw) return null;
  try { return decodeURIComponent(raw.replace(/\+/g, ' ')).trim(); } catch { return raw.replace(/\+/g, ' ').trim(); }
}

const list = [];
const manual = [];
const entries = Object.entries(inbox).filter(([, v]) => v?.status === 'new' && typeof v.text === 'string')
  .sort((a, b) => a[1].ts - b[1].ts);
for (const [id, v] of entries) {
  if (v.text.startsWith('【修正】')) { manual.push({ id, by: v.by, text: v.text }); continue; }
  const links = v.text.match(URL_RE) ?? [];
  const rest = v.text.replace(URL_RE, ' ').replace(/\s+/g, ' ').trim();
  let name = null;
  for (const l of links) { name = await nameFromLink(l); if (name) break; }
  const q = [name, rest].filter(Boolean).join(' ') || null;
  if (!q) { manual.push({ id, by: v.by, text: v.text, why: '看不出店名' }); continue; }
  list.push({ n: name ?? rest, q, c: '景點', note: '', inboxId: id, by: v.by, srcText: v.text });
}
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(list, null, 1) + '\n');
console.log(`待查 ${list.length} 筆，需人工處理 ${manual.length} 筆 → ${outFile}`);
for (const m of manual) console.log(`  人工：${m.id}（${m.by}）${m.why ? `[${m.why}] ` : ''}${m.text}`);
