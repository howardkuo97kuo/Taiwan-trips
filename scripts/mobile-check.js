// 手機寬度掃描：在網站任一頁的瀏覽器主控台貼上整段執行（不需要安裝任何東西）。
// 用 320／360／390／430 四種寬度的 iframe 載入每個頁面，回報：
//   scrollW 比寬度大（出現橫向捲動），或有元素超出卡片或畫面右緣。
// 結果印在主控台（console.table），全部通過時回傳 "OK"。
(async () => {
  const WIDTHS = [320, 360, 390, 430];
  const ROUTES = ['#/', '#/r/north-taipei', '#/compare', '#/quick', '#/inbox'];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const problems = [];
  for (const w of WIDTHS) {
    const fr = document.createElement('iframe');
    fr.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:800px;border:0;visibility:hidden;pointer-events:none`;
    fr.src = location.pathname;
    document.body.append(fr);
    await new Promise((r) => { fr.onload = r; });
    await wait(1500);
    for (const route of ROUTES) {
      fr.contentWindow.location.hash = route;
      await wait(2500);
      const d = fr.contentDocument;
      const bad = new Set();
      d.querySelectorAll('.tw-view *, .tw-header *, .tw-nav *').forEach((e) => {
        const r = e.getBoundingClientRect();
        if (!r.width || getComputedStyle(e).position === 'fixed') return;
        const card = e.closest('.tw-place-card');
        const limit = card ? card.getBoundingClientRect().right + 2 : w + 1;
        if (r.right > limit) bad.add(`${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}`);
      });
      const sw = d.documentElement.scrollWidth;
      if (sw > w || bad.size) problems.push({ width: w, route, scrollW: sw, overflow: [...bad].slice(0, 6).join(' ') });
    }
    fr.remove();
  }
  if (problems.length) { console.table(problems); return problems; }
  console.log('手機寬度檢查通過');
  return 'OK';
})();
