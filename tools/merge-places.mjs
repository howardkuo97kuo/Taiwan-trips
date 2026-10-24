// 把 lookup-places 的查詢結果併進 data/places.json（模組 E，收件匣的「上架」步驟）。
// 用法：node tools/merge-places.mjs <result.json> <暫存清單.json> [--src 收件匣] [--all]
// 只收 ok 為 true 的吻合結果（--all 連待確認的也收，請先人工看過）；pid 已存在的略過，
// id 規則同 A：'p' + sha1(pid) 前 10 碼。不寫評分、評論數、營業時間。
// 結尾印出已併入的 inboxId，供 write-data 把收件匣狀態改成 done（已有的改 dup）。
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const flag = (k) => args.includes(k);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const files = args.filter((a, i) => !a.startsWith('--') && !(i && args[i - 1] === '--src'));
const [resultFile, listFile] = files;
if (!resultFile || !listFile) {
  console.error('用法：node tools/merge-places.mjs <result.json> <暫存清單.json> [--src 收件匣] [--all]');
  process.exit(1);
}
const src = opt('--src', '收件匣');
const results = JSON.parse(readFileSync(resultFile, 'utf8'));
const list = JSON.parse(readFileSync(listFile, 'utf8'));
const config = JSON.parse(readFileSync('data/config.json', 'utf8'));
const placesPath = 'data/places.json';
const places = JSON.parse(readFileSync(placesPath, 'utf8'));
const pids = new Set(places.map((p) => p.pid).filter(Boolean));

const added = [], dup = [], skipped = [];
for (const r of results) {
  const item = list[r.i];
  const m = r.match;
  if (!item || r.error || !m || !m.ll || !m.region || !(r.ok || flag('--all'))) {
    skipped.push(`${r.n ?? item?.n}${r.error ? `（${r.error}）` : '（沒對上或缺座標、縣市）'}`);
    continue;
  }
  if (pids.has(m.pid)) { dup.push(item.inboxId); continue; }
  if (!config.categories.includes(item.c)) { skipped.push(`${item.n}（分類 ${item.c} 不在 config.categories）`); continue; }
  const place = {
    id: 'p' + createHash('sha1').update(m.pid).digest('hex').slice(0, 10),
    n: m.name ?? item.n,
    c: item.c,
    region: m.region,
    a: m.addr ?? undefined,
    ll: m.ll,
    pid: m.pid,
    gurl: m.gurl ?? `https://www.google.com/maps/place/?q=place_id:${m.pid}`,
    src,
    ...(item.note ? { note: item.note } : {}),
    llsrc: 'google',
    ...(m.business && m.business !== 'OPERATIONAL' ? { status: m.business === 'CLOSED_PERMANENTLY' ? 'closed' : 'open' } : {}),
  };
  places.push(place);
  pids.add(m.pid);
  added.push({ name: place.n, id: place.id, inboxId: item.inboxId });
}
writeFileSync(placesPath, JSON.stringify(places, null, 1) + '\n');
console.log(`新增 ${added.length}、已經有了 ${dup.length}、略過 ${skipped.length}`);
for (const a of added) console.log(`  + ${a.name} (${a.id}) 收件匣 ${a.inboxId}`);
if (dup.length) console.log(`已存在的收件匣 id（狀態改 dup）：${dup.join(', ')}`);
for (const s of skipped) console.log(`  略過：${s}`);
console.log(`done 的收件匣 id：${added.map((a) => a.inboxId).filter(Boolean).join(', ')}`);
