// 分類圖示（24×24 線條，顏色跟文字）。模組 C。
// catIcon(c) 回傳 <span class="tw-ico">；沒有對應分類就回 null。
const PATHS = {
  景點: '<path d="M3 20h18M5 20l5-9 3 5 2-3 4 7"/><circle cx="16.5" cy="6.5" r="2"/>',
  美食: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2.2 1.2-3 4-3 7 0 1.6 1 2.5 3 3"/>',
  小吃夜市: '<path d="M4 10h16l-1.5-5h-13zM5 10v10M19 10v10M9 20v-5h6v5M3 20h18"/><path d="M8 10c0 1.7 1.8 2 2 2s2-.3 2-2c0 1.7 1.8 2 2 2s2-.3 2-2"/>',
  咖啡甜點: '<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3c-1 1 1 2 0 3M12 3c-1 1 1 2 0 3"/>',
  溫泉: '<path d="M3 15c2 2 3 2 5 0s3-2 5 0 3 2 5 0M3 20c2 2 3 2 5 0s3-2 5 0 3 2 5 0M8 3c-1.4 1.6 1.4 3.2 0 5M13 3c-1.4 1.6 1.4 3.2 0 5M18 3c-1.4 1.6 1.4 3.2 0 5"/>',
  住宿: '<path d="M3 20V6M3 17h18v3M21 17v-4a3 3 0 0 0-3-3h-7v7"/><circle cx="7" cy="12" r="2"/>',
  購物市集: '<path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2"/>',
};

export function catIcon(c) {
  const d = PATHS[c];
  if (!d) return null;
  const s = document.createElement('span');
  s.className = 'tw-ico';
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  return s;
}
