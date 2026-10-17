// Giao diện sáng/tối + màu chủ đạo / màu phối (lưu theo từng thiết bị)
import { CONFIG } from './config.js';
import { ls } from './util.js';

const KEY = 'kk_theme';
const DEFAULT = { mode: 'auto', palette: 'kingsport', primary: '', accent: '' };

export const getTheme = () => ({ ...DEFAULT, ...ls.get(KEY, {}) });

export function applyTheme(t = getTheme()) {
  const root = document.documentElement;
  const dark = t.mode === 'dark' || (t.mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  const p = CONFIG.palettes[t.palette] || CONFIG.palettes.kingsport;
  root.style.setProperty('--primary', t.primary || p.primary);
  root.style.setProperty('--accent', t.accent || p.accent);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f1115' : (t.primary || p.primary));
}

export function setTheme(patch) {
  const t = { ...getTheme(), ...patch };
  ls.set(KEY, t);
  applyTheme(t);
  return t;
}

matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());
