export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = (p = '') =>
  p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// Bỏ dấu tiếng Việt, chữ thường, gọn khoảng trắng — dùng để so khớp tiêu đề cột, tìm kiếm.
export const fold = (s) =>
  String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/\s+/g, ' ').trim();

// Chuẩn hóa mã hàng: in hoa, bỏ khoảng trắng và dấu phân cách.
export const normCode = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export const num = (v) => {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(/,/g, '.'));
  return Number.isFinite(n) ? n : 0;
};

const nf = new Intl.NumberFormat('vi-VN');
export const fmt = (n) => nf.format(Math.round((n || 0) * 100) / 100);
export const fmtMoney = (n) => nf.format(Math.round(n || 0)) + ' ₫';
export const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

export const fmtDate = (ts, withTime = true) => {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (x) => String(x).padStart(2, '0');
  const date = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  return withTime ? `${date} ${p(d.getHours())}:${p(d.getMinutes())}` : date;
};

export const debounce = (fn, ms = 250) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function toast(msg, type = 'info', ms = 2600) {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.append(box); }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  box.append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}

// Hộp thoại đơn giản. Trả về Promise với giá trị của nút được bấm (hoặc null khi đóng).
export function modal({ title, body, actions = [{ label: 'Đóng', value: null }], wide = false, onMount }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `
      <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">
        <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Đóng">✕</button></div>
        <div class="modal-body"></div>
        <div class="modal-foot">${actions.map((a, i) =>
          `<button class="btn ${a.kind || (i === actions.length - 1 ? 'btn-primary' : 'btn-ghost')}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div>
      </div>`;
    const bodyEl = $('.modal-body', wrap);
    if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.append(body);
    const close = (v) => { wrap.remove(); resolve(v); };
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.closest('[data-close]')) return close(null);
      const b = e.target.closest('[data-i]');
      if (!b) return;
      const a = actions[+b.dataset.i];
      if (a.validate && a.validate(wrap) === false) return;
      close(typeof a.value === 'function' ? a.value(wrap) : a.value);
    });
    document.body.append(wrap);
    onMount?.(wrap);
    setTimeout(() => $('input,select,textarea', bodyEl)?.focus(), 50);
  });
}

export const confirmBox = (title, text, okLabel = 'Đồng ý', danger = false) =>
  modal({ title, body: `<p>${esc(text)}</p>`, actions: [
    { label: 'Hủy', value: false },
    { label: okLabel, value: true, kind: danger ? 'btn-danger' : 'btn-primary' },
  ] });

export function beep(freq = 1100, ms = 90) {
  try {
    const ctx = (beep.ctx ||= new (window.AudioContext || window.webkitAudioContext)());
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = freq; o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    o.start(); o.stop(ctx.currentTime + ms / 1000);
  } catch { /* âm thanh không bắt buộc */ }
  navigator.vibrate?.(60);
}

// localStorage an toàn (chế độ riêng tư trên Safari có thể ném lỗi)
export const ls = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bỏ qua */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* bỏ qua */ } },
};
