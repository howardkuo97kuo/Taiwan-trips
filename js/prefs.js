// 外觀偏好：深淺色、動態開關、背景照片的視差與遮罩。只有 B 能改。
// 動態預設跟著系統的「減少動態」；使用者可以手動開或關，記在 localStorage（twMotion、twTheme）。
import { debounce } from './util.js';

const root = document.documentElement;
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 無痕模式等 */ } };
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

// 訂閱偏好變更（頂列的按鈕文字要跟著更新）
export const onPrefs = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

// ── 深淺色 ──
export const isDark = () => (root.dataset.theme
  ? root.dataset.theme === 'dark'
  : matchMedia('(prefers-color-scheme: dark)').matches);

export function toggleTheme() {
  const next = isDark() ? 'light' : 'dark';
  root.dataset.theme = next;
  write('twTheme', next);
  notify();
}

// ── 動態 ──
export const motionOn = () => root.dataset.motion === 'on'
  || (root.dataset.motion !== 'off' && !matchMedia('(prefers-reduced-motion: reduce)').matches);
export const systemReducesMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function toggleMotion() {
  root.dataset.motion = motionOn() ? 'off' : 'on';
  write('twMotion', root.dataset.motion);
  onScroll();
  notify();
}

// ── 捲動：照片比內容慢，遮罩越捲越深 ──
let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const y = window.scrollY;
    root.style.setProperty('--sy', motionOn() ? y.toFixed(0) : '0');
    const dark = isDark();
    const base = dark ? 0.4 : 0.26;
    root.style.setProperty('--veil', Math.min(0.92, base + (y / 1000) * 0.62).toFixed(3));
    ticking = false;
  });
}

export function initPrefs() {
  const theme = read('twTheme');
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  // ?motion=on|off 方便驗收；沒有就用記住的值
  const m = new URLSearchParams(location.search).get('motion') ?? read('twMotion');
  if (m === 'on' || m === 'off') root.dataset.motion = m;
  addEventListener('scroll', onScroll, { passive: true });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', debounce(() => { onScroll(); notify(); }, 100));
  onScroll();
}
