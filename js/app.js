import { CONFIG } from './config.js';
import { Store, ROLES } from './store.js';
import { applyTheme, getTheme, setTheme } from './theme.js';
import { Camera, initOcr, ocrReady, recognize, buildIndex, matchText, modelKeys, findSerial, addKey, codeLike } from './ocr.js';
import { readSheet, detectColumns, rowsToRecords, downloadTemplate, reconcile, exportReport, exportTable, STATUS } from './io.js';
import { $, $$, esc, fold, num, fmt, fmtMoney, fmtDate, pct, uid, toast, modal, confirmBox, beep, debounce, ls } from './util.js';

applyTheme();

const app = $('#app');
let cleanup = null;

/* ================= Khung giao diện ================= */
const logos = () => `
  <img src="${CONFIG.logos.dongduongIcon}" alt="Tập đoàn Đông Dương" title="Tập đoàn Đông Dương" class="logo logo-dd">
  <span class="logo-sep"></span>
  <img src="${CONFIG.logos.kingsport}" alt="Kingsport" class="logo only-light">
  <img src="${CONFIG.logos.kingsportDark}" alt="Kingsport" class="logo only-dark">
  <span class="logo-sep"></span>
  <img src="${CONFIG.logos.move}" alt="Xe điện MOVE" class="logo logo-move">`;

function shell(active, title, inner) {
  const u = Store.user;
  const nav = [
    ['#/', '▦', 'Đợt kiểm kê', 'home'],
    Store.can('manage') && ['#/new', '＋', 'Tạo đợt', 'new'],
    Store.can('admin') && ['#/admin', '☰', 'Danh mục', 'admin'],
    ['#/settings', '⚙', 'Cài đặt', 'settings'],
  ].filter(Boolean);
  const q = Store.queue().length;
  return `
  <header class="topbar">
    <a href="#/" class="brand">${logos()}</a>
    <nav class="topnav">${nav.map(([h, , l, k]) => `<a href="${h}" class="${k === active ? 'on' : ''}">${l}</a>`).join('')}</nav>
    <div class="top-right">
      ${Store.mode === 'demo' ? '<span class="pill pill-warn" title="Dữ liệu chỉ lưu trên máy này">DEMO</span>' : ''}
      <span class="pill pill-info sync ${q ? '' : 'hide'}" title="Lượt quét chờ đồng bộ">⟳ ${q}</span>
      <button class="icon-btn" id="themeToggle" title="Đổi sáng/tối">◐</button>
      <span class="who"><b>${esc(u?.fullname || u?.username)}</b><small>${esc(ROLES[u?.role] || '')}</small></span>
    </div>
  </header>
  <main class="page">
    ${title ? `<div class="page-head"><h1>${title}</h1></div>` : ''}
    ${inner}
  </main>
  <nav class="bottomnav">${nav.map(([h, i, l, k]) => `<a href="${h}" class="${k === active ? 'on' : ''}"><i>${i}</i><span>${l}</span></a>`).join('')}</nav>`;
}

document.addEventListener('click', (e) => {
  if (e.target.closest('#themeToggle')) {
    const dark = document.documentElement.dataset.theme === 'dark';
    setTheme({ mode: dark ? 'light' : 'dark' });
  }
});
window.addEventListener('queuechange', () => {
  const el = $('.sync'); if (!el) return;
  const q = Store.queue().length;
  el.textContent = `⟳ ${q}`; el.classList.toggle('hide', !q);
});

// Icon ngành hàng (ảnh mặt nạ, tô theo màu chủ đạo)
const catOf = (name, category) => {
  const f = fold(`${category || ''} ${name || ''}`);
  return CONFIG.categories.find((c) => c.key === category || c.words.some((w) => f.includes(w)));
};
function catIcon(name, category) {
  const c = catOf(name, category);
  return c ? `<i class="cat" title="${esc(c.label)}" style="--ic:url(${new URL(`assets/icons/${c.key}.png`, location.href).href})"></i>` : '';
}
// Danh sách địa điểm nhóm theo khu vực · chi nhánh (hơn 300 kho/cửa hàng)
function locOptions(locs, selected) {
  const groups = new Map();
  for (const l of locs) { const g = l.region || 'Khác'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(l); }
  const rank = (g) => { const i = CONFIG.regionOrder.findIndex((r) => g.startsWith(r)); return i < 0 ? 99 : i; };
  return [...groups].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, 'vi')).map(([g, ls]) => `<optgroup label="${esc(g)}">${
    ls.sort((a, b) => (a.type === 'Kho' ? 0 : 1) - (b.type === 'Kho' ? 0 : 1) || a.code.localeCompare(b.code))
      .map((l) => `<option value="${esc(l.code)}" ${selected === l.code ? 'selected' : ''}>${esc(l.code)} · ${esc(l.name)}</option>`).join('')
  }</optgroup>`).join('');
}
const locName = (m, code) => m.locations.find((l) => l.code === code)?.name || code || '';
const active = (r) => !(r.active === false || String(r.active).toLowerCase() === 'false');
const loading = () => { app.innerHTML = '<div class="center-load"><div class="spinner"></div></div>'; };
const errorView = (e) => { app.innerHTML = shell('', 'Có lỗi', `<div class="card"><p>${esc(e.message)}</p><a class="btn" href="#/">Về trang chủ</a></div>`); };

/* ================= Router ================= */
const routes = [
  [/^#\/login$/, viewLogin, true],
  [/^#\/?$/, viewHome],
  [/^#\/new$/, viewNew, false, 'manage'],
  [/^#\/s\/([^/]+)\/count$/, viewCount],
  [/^#\/s\/([^/]+)\/report$/, viewReport],
  [/^#\/admin(?:\/(\w+))?$/, viewAdmin, false, 'admin'],
  [/^#\/settings$/, viewSettings],
];

async function route() {
  cleanup?.(); cleanup = null;
  const hash = location.hash || '#/';
  for (const [re, fn, pub, perm] of routes) {
    const m = hash.match(re);
    if (!m) continue;
    if (!pub && !Store.user) { location.hash = '#/login'; return; }
    if (perm && !Store.can(perm)) { location.hash = '#/'; return; }
    try { await fn(...m.slice(1)); } catch (e) { console.error(e); errorView(e); }
    window.scrollTo(0, 0);
    return;
  }
  location.hash = '#/';
}
window.addEventListener('hashchange', route);

/* ================= Đăng nhập ================= */
function viewLogin() {
  app.innerHTML = `
  <div class="login">
    <div class="login-card">
      <img src="${CONFIG.logos.dongduong}" alt="Tập đoàn Đông Dương" class="login-parent">
      <div class="login-logos">${logos().replace(/^[\s\S]*?logo-sep"><\/span>/, '')}</div>
      <div class="cat-strip">${CONFIG.categories.map((c) => catIcon('', c.key)).join('')}</div>
      <h1>${esc(CONFIG.appName)}</h1>
      <p class="muted">Kiểm kê linh kiện tại chi nhánh bằng camera</p>
      <form id="f">
        <label>Tài khoản<input name="u" autocomplete="username" required autocapitalize="none"></label>
        <label>Mật khẩu<input name="p" type="password" autocomplete="current-password" required></label>
        <button class="btn btn-primary btn-block">Đăng nhập</button>
      </form>
      ${Store.mode === 'demo' ? '<p class="hint">Chế độ DEMO — tài khoản mặc định: <b>admin / admin123</b></p>' : ''}
      <p class="tiny muted">${esc(CONFIG.company)} · v${CONFIG.version}</p>
    </div>
  </div>`;
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = $('button', e.target); b.disabled = true; b.textContent = 'Đang đăng nhập…';
    try {
      await Store.login(e.target.u.value, e.target.p.value);
      location.hash = '#/';
    } catch (err) { toast(err.message, 'error'); b.disabled = false; b.textContent = 'Đăng nhập'; }
  });
}

/* ================= Trang chủ: danh sách đợt ================= */
async function viewHome() {
  loading();
  const [m, sessions] = await Promise.all([Store.master(), Store.listSessions()]);
  const f = ls.get('kk_home_filter', { q: '', loc: '', st: '' });
  const open = sessions.filter((s) => s.status !== 'closed');
  const scans = sessions.reduce((a, s) => a + (s.scans || 0), 0);

  app.innerHTML = shell('home', 'Đợt kiểm kê', `
    <section class="kpis">
      <div class="kpi"><span>Đang kiểm</span><b>${open.length}</b></div>
      <div class="kpi"><span>Đã chốt</span><b>${sessions.length - open.length}</b></div>
      <div class="kpi"><span>Chi nhánh</span><b>${new Set(sessions.map((s) => s.location)).size}</b></div>
      <div class="kpi"><span>Tổng lượt quét</span><b>${fmt(scans)}</b></div>
    </section>
    <div class="toolbar">
      <input id="q" placeholder="Tìm theo tên đợt…" value="${esc(f.q)}">
      <select id="loc"><option value="">Tất cả địa điểm</option>${locOptions(m.locations.filter((l) => sessions.some((x) => x.location === l.code)), f.loc)}</select>
      <select id="st"><option value="">Mọi trạng thái</option><option value="open" ${f.st === 'open' ? 'selected' : ''}>Đang kiểm</option><option value="closed" ${f.st === 'closed' ? 'selected' : ''}>Đã chốt</option></select>
      ${Store.can('manage') ? '<a class="btn btn-primary" href="#/new">＋ Tạo đợt mới</a>' : ''}
    </div>
    <div id="list" class="session-grid"></div>`);

  const draw = () => {
    const q = fold($('#q').value), loc = $('#loc').value, st = $('#st').value;
    ls.set('kk_home_filter', { q: $('#q').value, loc, st });
    const rows = sessions.filter((s) => (!q || fold(s.name).includes(q)) && (!loc || s.location === loc) && (!st || (st === 'closed') === (s.status === 'closed')));
    $('#list').innerHTML = rows.length ? rows.map((s) => {
      const p = pct(s.counted_skus, s.exp_skus);
      return `
      <article class="card session">
        <div class="session-top">
          <span class="pill ${s.status === 'closed' ? 'pill-muted' : 'pill-ok'}">${s.status === 'closed' ? 'Đã chốt' : 'Đang kiểm'}</span>
          <small class="muted">${esc(s.date)}</small>
        </div>
        <h3>${esc(s.name)}</h3>
        <p class="muted">${esc(locName(m, s.location))}</p>
        <div class="progress"><i style="width:${p}%"></i></div>
        <div class="session-meta"><span><b>${s.counted_skus}</b>/${s.exp_skus} mã</span><span>${p}%</span><span>${s.scans} lượt quét</span></div>
        <div class="session-actions">
          ${s.status !== 'closed' ? `<a class="btn btn-primary" href="#/s/${esc(s.id)}/count">📷 Kiểm kê</a>` : ''}
          <a class="btn" href="#/s/${esc(s.id)}/report">📊 Báo cáo</a>
        </div>
      </article>`;
    }).join('') : `<div class="empty">Chưa có đợt kiểm kê nào. ${Store.can('manage') ? '<a href="#/new">Tạo đợt đầu tiên →</a>' : ''}</div>`;
  };
  ['#q', '#loc', '#st'].forEach((s) => $(s).addEventListener('input', debounce(draw, 150)));
  draw();
}

/* ================= Tạo đợt kiểm kê ================= */
async function viewNew() {
  loading();
  const m = await Store.master();
  const locs = m.locations.filter(active);
  const me = Store.user;
  const today = new Date().toISOString().slice(0, 10);
  let parsed = null; // {rows, headerRow, map, headers, fileName}

  app.innerHTML = shell('new', 'Tạo đợt kiểm kê', `
  <form id="f" class="grid-2">
    <section class="card">
      <h2>1. Thông tin đợt</h2>
      <label>Chi nhánh / địa điểm
        <select name="location" required>${locOptions(locs, me.location)}</select></label>
      <label>Tên đợt<input name="name" required></label>
      <label>Ngày kiểm kê<input type="date" name="date" value="${today}" required></label>
      <label>Ghi chú<textarea name="note" rows="2" placeholder="VD: Kiểm kê định kỳ cuối tháng"></textarea></label>
      <div class="field"><span>Nhân sự tham gia</span><div id="team" class="chips"></div></div>
    </section>
    <section class="card">
      <h2>2. Dữ liệu sổ sách (file đầu vào)</h2>
      <p class="muted">File Excel/CSV gồm tối thiểu cột <b>Mã hàng</b> và <b>Số lượng</b>. Các tên cột tương đương được tự nhận diện.</p>
      <div class="row-btns"><button type="button" class="btn" id="tpl">⬇ Tải file mẫu</button></div>
      <label class="drop" id="drop">
        <input type="file" id="file" accept=".xlsx,.xls,.csv" hidden>
        <b>Chọn file hoặc kéo thả vào đây</b><small>.xlsx · .xls · .csv</small>
      </label>
      <div id="mapping"></div>
    </section>
    <section class="card span-2" id="previewCard" hidden>
      <h2>3. Xem trước</h2>
      <div id="stats" class="kpis small"></div>
      <div id="preview" class="table-wrap"></div>
    </section>
    <div class="span-2 form-actions">
      <a class="btn btn-ghost" href="#/">Hủy</a>
      <button class="btn btn-primary" id="create">Tạo đợt kiểm kê</button>
    </div>
  </form>`);

  const f = $('#f');
  const syncName = () => {
    const l = locs.find((x) => x.code === f.location.value);
    const d = new Date(f.date.value || today);
    if (!f.name.dataset.touched) f.name.value = `Kiểm kê ${l?.name || ''} T${d.getMonth() + 1}/${d.getFullYear()}`;
    const st = m.staff.filter(active);
    const pref = st.filter((s) => s.location === f.location.value);
    const rest = st.filter((s) => s.location !== f.location.value);
    $('#team').innerHTML = [...pref, ...rest].map((s) =>
      `<label class="chip ${s.location === f.location.value ? '' : 'dim'}"><input type="checkbox" value="${esc(s.name)}" ${s.location === f.location.value ? 'checked' : ''}>${esc(s.name)}</label>`).join('') || '<small class="muted">Chưa có danh sách nhân sự</small>';
  };
  f.name.addEventListener('input', () => { f.name.dataset.touched = 1; });
  f.location.addEventListener('change', syncName);
  f.date.addEventListener('change', syncName);
  syncName();

  $('#tpl').onclick = () => { try { downloadTemplate(); } catch (e) { toast(e.message, 'error'); } };

  const FIELDS = [['sku', 'Mã hàng *'], ['qty', 'Số lượng *'], ['name', 'Tên hàng'], ['unit', 'ĐVT'], ['price', 'Đơn giá'], ['bin', 'Vị trí'], ['note', 'Ghi chú']];
  const drawPreview = () => {
    if (!parsed) return;
    $('#mapping').innerHTML = `
      <p class="ok-text">✔ ${esc(parsed.fileName)} — dòng tiêu đề: ${parsed.headerRow + 1}${parsed.warehouse ? ` — kho <b>${esc(parsed.warehouse)}</b>` : ''}</p>
      <div class="map-grid">${FIELDS.map(([k, l]) => `
        <label>${l}<select data-k="${k}"><option value="">— không có —</option>
        ${parsed.headers.map((h, i) => `<option value="${i}" ${parsed.map[k] === i ? 'selected' : ''}>${esc(h || `Cột ${i + 1}`)}</option>`).join('')}</select></label>`).join('')}</div>`;
    const recs = parsed.map.sku != null ? rowsToRecords(parsed.rows, parsed.headerRow, parsed.map) : [];
    parsed.records = recs;
    const known = new Set(m.items.map((i) => i.sku));
    const unknown = recs.filter((r) => !known.has(r.sku)).length;
    $('#previewCard').hidden = false;
    $('#stats').innerHTML = `
      <div class="kpi"><span>Số mã hàng</span><b>${fmt(recs.length)}</b></div>
      <div class="kpi"><span>Tổng số lượng</span><b>${fmt(recs.reduce((a, r) => a + r.qty, 0))}</b></div>
      <div class="kpi"><span>Giá trị</span><b>${fmtMoney(recs.reduce((a, r) => a + r.qty * r.price, 0))}</b></div>
      <div class="kpi ${unknown ? 'warn' : ''}"><span>Mã chưa có trong danh mục</span><b>${unknown}</b></div>`;
    $('#preview').innerHTML = recs.length ? `<table class="tbl"><thead><tr><th>Mã hàng</th><th>Tên hàng</th><th>ĐVT</th><th class="r">SL</th><th class="r">Đơn giá</th><th>Vị trí</th></tr></thead><tbody>
      ${recs.slice(0, 50).map((r) => `<tr><td class="mono">${esc(r.sku)}${known.has(r.sku) ? '' : ' <span class="pill pill-warn">mới</span>'}</td><td>${esc(r.name)}</td><td>${esc(r.unit)}</td><td class="r">${fmt(r.qty)}</td><td class="r">${r.price ? fmt(r.price) : ''}</td><td>${esc(r.bin)}</td></tr>`).join('')}
      </tbody></table>${recs.length > 50 ? `<p class="muted tiny">… và ${recs.length - 50} dòng khác</p>` : ''}` : '<p class="warn-text">Chọn cột "Mã hàng" để xem dữ liệu.</p>';
  };
  $('#mapping').addEventListener('change', (e) => {
    const s = e.target.closest('select[data-k]'); if (!s) return;
    parsed.map[s.dataset.k] = s.value === '' ? null : +s.value;
    drawPreview();
  });

  const loadFile = async (file) => {
    if (!file) return;
    try {
      const rows = await readSheet(file);
      const det = detectColumns(rows);
      parsed = { rows, ...det, fileName: file.name };
      if (det.warehouse && locs.some((l) => l.code === det.warehouse) && f.location.value !== det.warehouse) {
        f.location.value = det.warehouse; syncName();
        toast(`Đã chọn địa điểm theo mã kho ${det.warehouse} trong file`, 'info');
      }
      drawPreview();
    } catch (e) { toast('Không đọc được file: ' + e.message, 'error'); }
  };
  $('#file').addEventListener('change', (e) => loadFile(e.target.files[0]));
  const drop = $('#drop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); loadFile(e.dataTransfer.files[0]); });

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const recs = parsed?.records || [];
    if (!recs.length && !await confirmBox('Chưa có file đầu vào', 'Tạo đợt kiểm kê "mù" (không có số liệu sổ sách)? Mọi mã quét được sẽ ghi nhận là "Ngoài DS".', 'Vẫn tạo')) return;
    const btn = $('#create'); btn.disabled = true; btn.textContent = 'Đang tạo…';
    try {
      const s = await Store.createSession({
        name: f.name.value.trim(), location: f.location.value, date: f.date.value, note: f.note.value.trim(),
        team: $$('#team input:checked').map((i) => i.value).join(', '), created_by: me.username,
      }, recs);
      toast('Đã tạo đợt kiểm kê', 'ok');
      location.hash = `#/s/${s.id}/count`;
    } catch (err) { toast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Tạo đợt kiểm kê'; }
  });
}

/* ================= Màn hình kiểm kê (camera) ================= */
async function viewCount(id) {
  loading();
  const [m, data] = await Promise.all([Store.master(), Store.getSession(id)]);
  const { session, expected } = data;
  const counts = data.counts;
  const itemBy = new Map(m.items.map((i) => [i.sku, i]));
  const expBy = new Map(expected.map((e) => [e.sku, e]));
  const learned = new Map();
  for (const a of m.aliases || []) learned.set(a.sku, [...(learned.get(a.sku) || []), a.alias]);
  const keysOf = (sku, name) => { const it = itemBy.get(sku); return [it?.barcode, ...String(it?.alias || '').split(/[,;|]/), ...modelKeys(it?.name || name), ...(learned.get(sku) || [])].filter(Boolean); };
  const index = buildIndex([
    ...expected.map((e) => ({ sku: e.sku, name: e.name || itemBy.get(e.sku)?.name || '', keys: keysOf(e.sku, e.name), expected: true })),
    ...m.items.filter((i) => !expBy.has(i.sku)).map((i) => ({ sku: i.sku, name: i.name, keys: keysOf(i.sku, i.name), expected: false })),
  ]);
  const closed = session.status === 'closed';
  const team = String(session.team || '').split(',').map((s) => s.trim()).filter(Boolean);
  const st = { staff: ls.get('kk_staff_' + id, team[0] || ''), auto: false, busy: false, last: null, tab: 'scan', filter: 'todo' };

  const gotOf = (sku) => counts.filter((c) => c.sku === sku).reduce((a, c) => a + num(c.qty), 0);

  app.innerHTML = shell('home', '', `
  <div class="count-head">
    <a href="#/" class="icon-btn" title="Quay lại">←</a>
    <div class="grow"><h1>${esc(session.name)}</h1><small class="muted">${esc(locName(m, session.location))} · ${esc(session.date)}</small></div>
    <a class="btn btn-sm" href="#/s/${esc(id)}/report">📊</a>
  </div>
  <div class="progress big"><i id="pbar"></i></div>
  <div class="count-stats" id="cstats"></div>
  ${closed ? '<div class="banner">Đợt kiểm kê đã chốt — chỉ xem. Quản lý có thể mở lại trong trang Báo cáo.</div>' : ''}
  <div class="tabs" id="tabs">
    <button data-t="scan" class="on">📷 Quét</button><button data-t="list">📋 Danh sách</button><button data-t="log">🕘 Đã quét</button>
  </div>
  <section id="tab-scan" class="tab">
    <div class="scan-opts">
      <label>Người kiểm<select id="staff"><option value="">— chọn —</option>${[...new Set([...team, ...m.staff.filter(active).map((s) => s.name)])].map((n) => `<option ${n === st.staff ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      <label>SL mặc định<input id="defQty" type="number" inputmode="decimal" min="0" step="any" value="1"></label>
    </div>
    <div class="camera" id="cam">
      <video id="video" playsinline muted autoplay></video>
      <div class="guide"><span></span><em id="camMsg">Đưa mã hàng vào khung</em></div>
      <div class="cam-start" id="camStart"><button class="btn btn-primary btn-lg" ${closed ? 'disabled' : ''}>Bật camera</button><small>Cho phép quyền camera khi Safari hỏi</small></div>
    </div>
    <div class="scan-actions">
      <button class="btn" id="torch" hidden>🔦</button>
      <label class="switch"><input type="checkbox" id="auto"><span>Quét liên tục</span></label>
      <button class="btn btn-primary btn-lg grow" id="shot" ${closed ? 'disabled' : ''}>◉ Chụp &amp; nhận diện</button>
      <button class="btn" id="manual" ${closed ? 'disabled' : ''}>⌨ Nhập</button>
    </div>
    <div id="ocrOut" class="ocr-out"></div>
  </section>
  <section id="tab-list" class="tab" hidden>
    <div class="toolbar"><input id="lq" placeholder="Tìm mã / tên…">
      <div class="seg" id="lf"><button data-f="todo" class="on">Chưa đủ</button><button data-f="all">Tất cả</button><button data-f="done">Đã đủ</button></div></div>
    <div id="lst"></div>
  </section>
  <section id="tab-log" class="tab" hidden><div id="log"></div></section>`);

  const cam = new Camera($('#video'));
  let timer = null;
  cleanup = () => { st.auto = false; clearTimeout(timer); cam.stop(); };

  const drawStats = () => {
    const done = expected.filter((e) => gotOf(e.sku) >= num(e.qty) && num(e.qty) > 0).length;
    const touched = new Set(counts.map((c) => c.sku));
    const extra = [...touched].filter((s) => !expBy.has(s)).length;
    const p = pct(expected.filter((e) => touched.has(e.sku)).length, expected.length);
    $('#pbar').style.width = p + '%';
    $('#cstats').innerHTML = `<span><b>${p}%</b> tiến độ</span><span><b>${done}</b>/${expected.length} mã đủ SL</span><span><b>${extra}</b> ngoài DS</span><span><b>${counts.length}</b> lượt</span>`;
  };

  const drawList = () => {
    const q = fold($('#lq').value);
    const rows = expected.map((e) => ({ ...e, got: gotOf(e.sku) }))
      .filter((r) => !q || fold(r.sku + ' ' + r.name).includes(q))
      .filter((r) => st.filter === 'all' || (st.filter === 'done' ? r.got >= num(r.qty) : r.got < num(r.qty)));
    $('#lst').innerHTML = rows.length ? `<div class="item-list">${rows.slice(0, 300).map((r) => `
      <button class="item-row" data-sku="${esc(r.sku)}" ${closed ? 'disabled' : ''}>
        <div><b class="mono">${catIcon(r.name, itemBy.get(r.sku)?.category)}${esc(r.sku)}</b><small>${esc(r.name)}${r.bin ? ' · ' + esc(r.bin) : ''}</small></div>
        <span class="qty ${r.got === num(r.qty) ? 'ok' : r.got > num(r.qty) ? 'over' : r.got ? 'short' : ''}">${fmt(r.got)}<small>/${fmt(r.qty)}</small></span>
      </button>`).join('')}</div>` : '<div class="empty">Không có mã nào.</div>';
  };

  const drawLog = () => {
    const rows = [...counts].sort((a, b) => b.ts - a.ts);
    $('#log').innerHTML = rows.length ? `<div class="item-list">${rows.slice(0, 200).map((c) => `
      <div class="item-row">
        <div><b class="mono">${esc(c.sku)}</b> ${c.in_list ? '' : '<span class="pill pill-warn">Ngoài DS</span>'}<small>${c.serial ? `SN ${esc(c.serial)} · ` : ''}${esc(c.name)} · ${fmtDate(c.ts)} · ${esc(c.staff || c.user)} · ${c.method === 'ocr' ? '📷' : '⌨'}</small></div>
        <span class="qty">+${fmt(c.qty)}</span>
        ${closed ? '' : `<button class="icon-btn" data-del="${esc(c.id)}" title="Xóa lượt này">🗑</button>`}
      </div>`).join('')}</div>` : '<div class="empty">Chưa có lượt quét nào.</div>';
  };

  const redraw = () => { drawStats(); if (st.tab === 'list') drawList(); if (st.tab === 'log') drawLog(); };

  async function addCount(sku, qty, method, raw = '', serial = '') {
    serial = String(serial || '').trim().toUpperCase();
    const dupe = serial && counts.find((c) => c.serial === serial);
    if (dupe) {
      if (st.auto) { toast(`Serial ${serial} đã quét rồi — bỏ qua`, 'warn'); return; }
      if (!await confirmBox('Serial đã được quét', `Serial ${serial} đã ghi nhận lúc ${fmtDate(dupe.ts)} bởi ${dupe.staff || dupe.user} (mã ${dupe.sku}). Vẫn ghi nhận thêm?`, 'Vẫn ghi', true)) return;
    }
    if (!st.staff) toast('Nên chọn "Người kiểm" để báo cáo rõ trách nhiệm', 'warn');
    const e = expBy.get(sku), it = itemBy.get(sku);
    const c = {
      id: uid('C'), session_id: id, sku, name: e?.name || it?.name || '', qty: num(qty), method, raw: String(raw).slice(0, 120), serial,
      user: Store.user.username, staff: st.staff, bin: e?.bin || '', note: '', ts: Date.now(), in_list: !!e,
    };
    counts.push(c);
    st.last = { sku, ts: Date.now() };
    beep(e ? 1200 : 700);
    redraw();
    toast(`+${fmt(c.qty)} ${sku}${e ? ` (${fmt(gotOf(sku))}/${fmt(e.qty)})` : ' — ngoài danh sách'}`, e ? 'ok' : 'warn', 1800);
    try { await Store.addCounts([c]); } catch (err) { toast('Chưa lưu được: ' + err.message, 'error'); }
    window.dispatchEvent(new CustomEvent('queuechange'));
  }

  // Hộp xác nhận: chọn mã + số lượng
  async function confirmItem(cands, raw = '', method = 'ocr') {
    const defQty = num($('#defQty').value) || 1;
    const body = document.createElement('div');
    body.innerHTML = `
      ${raw ? `<p class="tiny muted">Văn bản đọc được: <code>${esc(raw.replace(/\s+/g, ' ').slice(0, 100))}</code></p>` : ''}
      <input id="mq" placeholder="Tìm mã / tên hàng…" autocomplete="off" autocapitalize="characters">
      <div id="mc" class="cand-list"></div>
      <label>Số serial (nếu có tem serial)<input id="mser" value="${esc(findSerial(raw))}" autocapitalize="characters" placeholder="VD: OYL2604220077"></label>
      <label>Số lượng<div class="stepper"><button type="button" data-s="-1">−</button><input id="mqty" type="number" inputmode="decimal" step="any" min="0" value="${defQty}"><button type="button" data-s="1">＋</button></div></label>`;
    const tem = method === 'ocr' ? codeLike(raw) : '';
    if (tem && (!cands[0] || cands[0].score < 0.95)) body.insertAdjacentHTML('beforeend',
      `<label class="switch learn"><input type="checkbox" id="mlearn" checked><span>Ghi nhớ: tem in <code>${esc(tem)}</code> = mã đã chọn (lần sau nhận ngay)</span></label>`);
    let sel = cands[0]?.sku || '';
    const drawC = (list) => {
      $('#mc', body).innerHTML = list.length ? list.map((c) => `
        <button type="button" class="cand ${c.sku === sel ? 'on' : ''}" data-sku="${esc(c.sku)}">
          <b class="mono">${esc(c.sku)}</b>${c.expected ? '' : ' <span class="pill pill-warn">Ngoài DS</span>'}
          <small>${esc(c.name)}${expBy.has(c.sku) ? ` · đã đếm ${fmt(gotOf(c.sku))}/${fmt(expBy.get(c.sku).qty)}` : ''}</small>
          ${c.score != null ? `<em>${Math.round(c.score * 100)}%</em>` : ''}
        </button>`).join('') : '<p class="muted">Không tìm thấy mã phù hợp. Gõ để tìm, hoặc nhập mã mới rồi bấm Ghi nhận.</p>';
    };
    drawC(cands);
    body.addEventListener('click', (e) => {
      const c = e.target.closest('.cand');
      if (c) { sel = c.dataset.sku; $$('.cand', body).forEach((x) => x.classList.toggle('on', x === c)); }
      const s = e.target.closest('[data-s]');
      if (s) { const q = $('#mqty', body); q.value = Math.max(0, num(q.value) + +s.dataset.s); }
    });
    $('#mq', body).addEventListener('input', debounce((e) => {
      const q = fold(e.target.value);
      if (!q) return drawC(cands);
      const list = index.filter((i) => fold(i.sku + ' ' + i.name).includes(q)).slice(0, 12);
      if (!list.some((l) => l.sku === sel)) sel = list[0]?.sku || '';
      drawC(list);
    }, 120));
    const r = await modal({
      title: method === 'ocr' ? 'Kết quả nhận diện' : 'Nhập mã hàng',
      body,
      actions: [{ label: 'Hủy', value: null }, {
        label: 'Ghi nhận', value: () => ({ sku: sel || $('#mq', body).value.trim().toUpperCase(), qty: $('#mqty', body).value, serial: $('#mser', body).value, learn: $('#mlearn', body)?.checked }),
      }],
    });
    if (r?.learn && r.sku && tem && tem !== r.sku.replace(/[^A-Z0-9]/g, '')) {
      const entry = index.find((i) => i.sku === r.sku);
      if (entry) addKey(entry, tem);
      Store.addAlias(tem, r.sku).then(() => toast(`Đã ghi nhớ tem ${tem} → ${r.sku}`, 'ok')).catch((e) => toast('Chưa lưu được mã tem: ' + e.message, 'warn'));
    }
    if (r?.sku && num(r.qty) > 0) await addCount(r.sku, r.qty, method, raw, r.serial);
  }

  async function scanOnce() {
    if (st.busy || !cam.stream) return;
    st.busy = true;
    const msg = $('#camMsg');
    try {
      if (!ocrReady()) msg.textContent = 'Đang tải bộ nhận diện (lần đầu ~10 giây)…';
      await initOcr();
      msg.textContent = 'Đang nhận diện…';
      $('#cam').classList.add('busy');
      const canvas = cam.capture();
      if (!canvas) return;
      let { text } = await recognize(canvas);
      let cands = matchText(text, index);
      if (!cands.length && canvas.alt) { // lượt 2: ảnh xám cho nền màu / chữ mờ
        const r2 = await recognize(canvas.alt);
        const c2 = matchText(r2.text, index);
        if (c2.length || !text.trim()) { text = r2.text; cands = c2; }
      }
      const top = cands[0];
      $('#ocrOut').innerHTML = `<img src="${canvas.toDataURL('image/png')}" alt=""><div><small class="muted">OCR:</small> <code>${esc(text.trim().replace(/\s+/g, ' ').slice(0, 80) || '(không đọc được)')}</code>
        ${top ? `<br><b class="mono">${esc(top.sku)}</b> <small>${Math.round(top.score * 100)}%</small>` : ''}</div>`;
      if (st.auto) {
        const clear = top && top.score >= CONFIG.ocr.autoAcceptScore && (!cands[1] || top.score - cands[1].score >= 0.05);
        const cooldown = st.last && st.last.sku === top?.sku && Date.now() - st.last.ts < 3000;
        if (clear && !cooldown) await addCount(top.sku, num($('#defQty').value) || 1, 'ocr', text, findSerial(text));
        msg.textContent = 'Quét liên tục — đưa mã hàng vào khung';
      } else {
        msg.textContent = 'Đưa mã hàng vào khung';
        if (!cands.length) toast('Không nhận ra mã hàng. Thử lại gần hơn / đủ sáng hơn, hoặc nhập tay.', 'warn');
        await confirmItem(cands, text, 'ocr');
      }
    } catch (e) {
      toast(e.message, 'error'); st.auto = false; $('#auto').checked = false;
    } finally {
      st.busy = false; $('#cam')?.classList.remove('busy');
    }
  }
  const loop = async () => {
    if (!st.auto) return;
    await scanOnce();
    if (st.auto) timer = setTimeout(loop, CONFIG.ocr.scanIntervalMs);
  };

  async function startCam() {
    try {
      await cam.start();
      $('#camStart').hidden = true;
      $('#torch').hidden = !cam.torchSupported;
      initOcr().catch(() => {}); // tải trước bộ OCR
    } catch (e) {
      toast(e.name === 'NotAllowedError' ? 'Bạn đã chặn quyền camera. Vào Cài đặt > Safari > Camera để cho phép.' : e.message, 'error', 5000);
    }
  }

  $('#camStart button').onclick = startCam;
  $('#shot').onclick = async () => { if (!cam.stream) await startCam(); scanOnce(); };
  $('#manual').onclick = () => confirmItem([], '', 'manual');
  $('#auto').onchange = async (e) => {
    st.auto = e.target.checked;
    if (st.auto) { if (!cam.stream) await startCam(); loop(); }
  };
  let torchOn = false;
  $('#torch').onclick = async () => { torchOn = !torchOn; await cam.torch(torchOn); };
  $('#staff').onchange = (e) => { st.staff = e.target.value; ls.set('kk_staff_' + id, st.staff); };
  $('#tabs').onclick = (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    st.tab = b.dataset.t;
    $$('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
    ['scan', 'list', 'log'].forEach((t) => { $('#tab-' + t).hidden = t !== st.tab; });
    if (st.tab !== 'scan') { st.auto = false; $('#auto').checked = false; }
    redraw();
  };
  $('#lq').addEventListener('input', debounce(drawList, 150));
  $('#lf').onclick = (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    st.filter = b.dataset.f; $$('#lf button').forEach((x) => x.classList.toggle('on', x === b)); drawList();
  };
  $('#lst').onclick = (e) => {
    const r = e.target.closest('[data-sku]'); if (!r) return;
    const e2 = expBy.get(r.dataset.sku);
    confirmItem([{ sku: e2.sku, name: e2.name, expected: true }], '', 'manual');
  };
  $('#log').onclick = async (e) => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    if (!await confirmBox('Xóa lượt quét', 'Xóa lượt ghi nhận này?', 'Xóa', true)) return;
    try {
      await Store.deleteCount(b.dataset.del);
      counts.splice(counts.findIndex((c) => c.id === b.dataset.del), 1);
      redraw();
    } catch (err) { toast(err.message, 'error'); }
  };
  drawStats();
}

/* ================= Báo cáo ================= */
async function viewReport(id) {
  loading();
  const [m, { session, expected, counts }] = await Promise.all([Store.master(), Store.getSession(id)]);
  const { rows, summary: s } = reconcile(expected, counts, m.items);
  const itemCat = new Map(m.items.map((i) => [i.sku, i.category]));
  const staffNames = session.team || [...new Set(counts.map((c) => c.staff).filter(Boolean))].join(', ');
  const closed = session.status === 'closed';
  let filter = '';

  const bars = ['ok', 'short', 'over', 'none', 'extra'].map((k) => [k, s[k]]).filter(([, v]) => v);
  const tot = bars.reduce((a, [, v]) => a + v, 0) || 1;

  app.innerHTML = shell('home', '', `
  <div class="count-head">
    <a href="#/" class="icon-btn">←</a>
    <div class="grow"><h1>Báo cáo: ${esc(session.name)}</h1>
      <small class="muted">${esc(locName(m, session.location))} · ${esc(session.date)} · ${closed ? `Đã chốt ${fmtDate(session.closed_at)}` : 'Đang kiểm'}</small></div>
  </div>
  <div class="toolbar no-print">
    ${!closed ? `<a class="btn btn-primary" href="#/s/${esc(id)}/count">📷 Tiếp tục kiểm</a>` : ''}
    <button class="btn" id="xls">⬇ Xuất Excel</button>
    <button class="btn" id="print">🖨 In</button>
    ${Store.can('manage') ? `<button class="btn" id="toggle">${closed ? '↺ Mở lại đợt' : '✔ Chốt kiểm kê'}</button>` : ''}
    ${Store.can('admin') ? '<button class="btn btn-danger-ghost" id="del">🗑 Xóa đợt</button>' : ''}
  </div>
  <section class="kpis">
    <div class="kpi"><span>Tiến độ</span><b>${s.progress}%</b><small>${s.countedSku}/${s.totalSku} mã</small></div>
    <div class="kpi"><span>Độ chính xác</span><b>${s.accuracy}%</b><small>${s.ok} mã khớp</small></div>
    <div class="kpi"><span>SL sổ sách / thực tế</span><b>${fmt(s.expQty)} / ${fmt(s.gotQty)}</b><small>${s.scans} lượt quét</small></div>
    <div class="kpi bad"><span>Thiếu</span><b>${fmt(s.shortQty)}</b><small>${fmtMoney(s.shortValue)}</small></div>
    <div class="kpi good"><span>Thừa</span><b>${fmt(s.overQty)}</b><small>${fmtMoney(s.overValue)}</small></div>
    <div class="kpi"><span>Chênh lệch ròng</span><b class="${s.overValue - s.shortValue < 0 ? 'neg' : ''}">${fmtMoney(s.overValue - s.shortValue)}</b><small>trên ${fmtMoney(s.expValue)}</small></div>
  </section>
  <section class="card">
    <div class="stack-bar">${bars.map(([k, v]) => `<i class="st-${STATUS[k].cls}" style="flex:${v}" title="${STATUS[k].label}: ${v}"></i>`).join('')}</div>
    <div class="legend" id="chips">
      <button data-f="" class="on">Tất cả <b>${rows.length}</b></button>
      ${['ok', 'short', 'over', 'none', 'extra'].map((k) => `<button data-f="${k}"><i class="dot st-${STATUS[k].cls}"></i>${STATUS[k].label} <b>${s[k]}</b> <small>${pct(s[k], tot)}%</small></button>`).join('')}
    </div>
    <div class="toolbar"><input id="q" placeholder="Tìm mã / tên…"></div>
    <div class="table-wrap" id="tbl"></div>
  </section>`);

  const draw = () => {
    const q = fold($('#q').value);
    const list = rows.filter((r) => (!filter || r.status === filter) && (!q || fold(r.sku + ' ' + r.name).includes(q)))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || Math.abs(b.diff) - Math.abs(a.diff));
    $('#tbl').innerHTML = `<table class="tbl"><thead><tr><th>Mã hàng</th><th>Tên hàng</th><th class="r">Sổ sách</th><th class="r">Thực tế</th><th class="r">Chênh lệch</th><th class="r">Giá trị CL</th><th>Kết quả</th></tr></thead>
      <tbody>${list.map((r) => `<tr><td class="mono">${catIcon(r.name, itemCat.get(r.sku))}${esc(r.sku)}</td><td>${esc(r.name)}<small class="muted">${r.bin ? ' · ' + esc(r.bin) : ''}</small></td>
        <td class="r">${fmt(r.exp)}</td><td class="r">${fmt(r.got)}</td><td class="r ${r.diff < 0 ? 'neg' : r.diff > 0 ? 'pos' : ''}">${r.diff > 0 ? '+' : ''}${fmt(r.diff)}</td>
        <td class="r ${r.value < 0 ? 'neg' : r.value > 0 ? 'pos' : ''}">${r.value ? fmt(r.value) : ''}</td>
        <td><span class="badge st-${STATUS[r.status].cls}">${STATUS[r.status].label}</span></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Không có dòng nào</td></tr>'}</tbody></table>`;
  };
  $('#chips').onclick = (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    filter = b.dataset.f; $$('#chips button').forEach((x) => x.classList.toggle('on', x === b)); draw();
  };
  $('#q').addEventListener('input', debounce(draw, 150));
  $('#xls').onclick = () => {
    try { exportReport({ session, locationName: locName(m, session.location), rows, summary: s, counts, staffNames }); }
    catch (e) { toast(e.message, 'error'); }
  };
  $('#print').onclick = () => window.print();
  $('#toggle')?.addEventListener('click', async () => {
    const ok = await confirmBox(closed ? 'Mở lại đợt' : 'Chốt kiểm kê',
      closed ? 'Mở lại để tiếp tục ghi nhận?' : `Chốt đợt kiểm kê? Còn ${s.none} mã chưa kiểm. Sau khi chốt sẽ không ghi nhận thêm.`);
    if (!ok) return;
    await Store.updateSession(id, closed ? { status: 'open', closed_at: '' } : { status: 'closed', closed_at: Date.now() });
    route();
  });
  $('#del')?.addEventListener('click', async () => {
    if (!await confirmBox('Xóa đợt kiểm kê', 'Xóa vĩnh viễn đợt này cùng toàn bộ dữ liệu quét?', 'Xóa', true)) return;
    await Store.deleteSession(id); location.hash = '#/';
  });
  draw();
}

/* ================= Danh mục (quản trị) ================= */
const ADMIN = {
  locations: { title: 'Địa điểm', key: 'code', cols: [['code', 'Code'], ['name', 'Name'], ['type', 'Loại'], ['branch', 'Mã chi nhánh'], ['region', 'Khu vực · Chi nhánh'], ['address', 'Địa chỉ'], ['manager', 'Phụ trách'], ['active', 'Hoạt động', 'bool']] },
  items: { title: 'Hàng hóa / linh kiện', key: 'sku', cols: [['sku', 'Mã hàng'], ['name', 'Tên hàng'], ['unit', 'ĐVT'], ['category', 'Nhóm hàng'], ['price', 'Đơn giá', 'num'], ['barcode', 'Mã vạch / mã phụ'], ['alias', 'Mã khác (cách nhau dấu ,)']] },
  staff: { title: 'Nhân sự kiểm kê', key: 'code', cols: [['code', 'Mã NV'], ['name', 'Họ tên'], ['phone', 'SĐT'], ['location', 'Chi nhánh', 'loc'], ['title', 'Chức danh'], ['active', 'Hoạt động', 'bool']] },
  aliases: { title: 'Mã tem đã học', key: 'alias', cols: [['alias', 'Chữ in trên tem'], ['sku', 'Mã hàng hệ thống'], ['created_by', 'Người dạy']] },
  users: { title: 'Tài khoản', key: 'username', cols: [['username', 'Tài khoản'], ['fullname', 'Họ tên'], ['role', 'Vai trò', 'role'], ['location', 'Chi nhánh', 'loc'], ['active', 'Hoạt động', 'bool'], ['password', 'Mật khẩu mới', 'pw']] },
};

async function viewAdmin(tab = 'items') {
  if (!ADMIN[tab]) tab = 'items';
  loading();
  const m = await Store.master(true);
  const def = ADMIN[tab];
  let rows = (m[tab] || []).map((r) => ({ ...r }));
  let page = 0, q = '', dirty = false;
  const PER = 50;

  app.innerHTML = shell('admin', 'Danh mục', `
  <div class="tabs wrap">${Object.entries(ADMIN).map(([k, v]) => `<a href="#/admin/${k}" class="${k === tab ? 'on' : ''}">${v.title}</a>`).join('')}</div>
  <section class="card">
    <div class="toolbar">
      <input id="q" placeholder="Tìm…">
      <button class="btn" id="add">＋ Thêm dòng</button>
      <label class="btn">⬆ Nhập Excel<input type="file" id="imp" accept=".xlsx,.xls,.csv" hidden></label>
      <button class="btn" id="exp">⬇ Xuất Excel</button>
      <button class="btn btn-primary" id="save">💾 Lưu</button>
    </div>
    <p class="muted tiny">${tab === 'users' ? 'Để trống "Mật khẩu mới" nếu giữ nguyên mật khẩu cũ. ' : ''}Nhập Excel: dòng đầu là tiêu đề cột giống bảng dưới. Mã trùng sẽ được cập nhật.</p>
    <div class="table-wrap" id="grid"></div>
    <div class="pager" id="pager"></div>
  </section>`);

  const cell = (r, i, [k, , type]) => {
    const v = r[k] ?? '';
    if (type === 'bool') return `<input type="checkbox" data-i="${i}" data-k="${k}" ${active(r) ? 'checked' : ''}>`;
    if (type === 'role') return `<select data-i="${i}" data-k="${k}">${Object.entries(ROLES).map(([rk, rl]) => `<option value="${rk}" ${v === rk ? 'selected' : ''}>${rl}</option>`).join('')}</select>`;
    if (type === 'loc') return `<select data-i="${i}" data-k="${k}"><option value="">—</option>${locOptions(m.locations, v)}</select>`;
    return `<input data-i="${i}" data-k="${k}" value="${esc(v)}" ${type === 'num' ? 'inputmode="decimal"' : ''} ${type === 'pw' ? 'type="password" autocomplete="new-password" placeholder="••••"' : ''}>`;
  };
  const draw = () => {
    const f = fold(q);
    const idx = rows.map((r, i) => i).filter((i) => !f || fold(def.cols.map(([k]) => rows[i][k]).join(' ')).includes(f));
    const pages = Math.max(1, Math.ceil(idx.length / PER));
    page = Math.min(page, pages - 1);
    $('#grid').innerHTML = `<table class="tbl edit"><thead><tr>${def.cols.map(([, l]) => `<th>${l}</th>`).join('')}<th></th></tr></thead><tbody>
      ${idx.slice(page * PER, page * PER + PER).map((i) => `<tr>${def.cols.map((c) => `<td>${cell(rows[i], i, c)}</td>`).join('')}<td><button class="icon-btn" data-rm="${i}" title="Xóa">✕</button></td></tr>`).join('')}
      </tbody></table>`;
    $('#pager').innerHTML = `<span class="muted">${fmt(idx.length)} dòng${dirty ? ' · <b class="warn-text">chưa lưu</b>' : ''}</span>
      ${pages > 1 ? `<button class="btn btn-sm" data-p="-1" ${page ? '' : 'disabled'}>‹</button><span>${page + 1}/${pages}</span><button class="btn btn-sm" data-p="1" ${page < pages - 1 ? '' : 'disabled'}>›</button>` : ''}`;
  };
  const mark = () => { if (!dirty) { dirty = true; draw(); } };

  $('#grid').addEventListener('change', (e) => {
    const el = e.target.closest('[data-k]'); if (!el) return;
    const r = rows[+el.dataset.i];
    const type = def.cols.find(([k]) => k === el.dataset.k)[2];
    r[el.dataset.k] = el.type === 'checkbox' ? el.checked : type === 'num' ? num(el.value) : el.value.trim();
    mark();
  });
  $('#grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    rows.splice(+b.dataset.rm, 1); dirty = true; draw();
  });
  $('#pager').onclick = (e) => { const b = e.target.closest('[data-p]'); if (b) { page += +b.dataset.p; draw(); } };
  $('#q').addEventListener('input', debounce((e) => { q = e.target.value; page = 0; draw(); }, 150));
  $('#add').onclick = () => {
    const r = Object.fromEntries(def.cols.map(([k, , t]) => [k, t === 'bool' ? true : t === 'role' ? 'staff' : '']));
    rows.unshift(r); q = ''; $('#q').value = ''; page = 0; dirty = true; draw();
    $('#grid input[data-k]')?.focus();
  };
  $('#exp').onclick = () => {
    try {
      const cols = def.cols.filter(([, , t]) => t !== 'pw');
      exportTable(`Danh_muc_${tab}`, cols.map(([, l]) => l), rows.map((r) => Object.fromEntries(cols.map(([k, l]) => [l, r[k]]))));
    } catch (e) { toast(e.message, 'error'); }
  };
  $('#imp').onchange = async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      const raw = await readSheet(file);
      const aliases = Object.fromEntries(def.cols.map(([k, l]) => [k, [fold(l).replace(/[^a-z0-9 ]/g, '').trim(), k, ...(tab === 'items' ? CONFIG.template.aliases[k] || [] : [])]]));
      const { headerRow, map } = detectColumns(raw, aliases);
      if (map[def.key] == null) throw new Error(`Không thấy cột "${def.cols[0][1]}"`);
      let added = 0, updated = 0, dupes = 0;
      const seen = new Set();
      for (const line of raw.slice(headerRow + 1)) {
        const rec = {};
        for (const [k, , t] of def.cols) {
          if (map[k] == null) continue;
          let v = line[map[k]];
          if (t === 'num') v = num(v); else if (t === 'bool') v = !/^(0|false|khong|không|no|x)$/i.test(String(v).trim()) || v === ''; else v = String(v ?? '').trim();
          rec[k] = v;
        }
        if (!rec[def.key]) continue;
        if (seen.has(String(rec[def.key]))) { dupes++; continue; } // bảng giá nhiều nhóm giá: lấy dòng đầu
        seen.add(String(rec[def.key]));
        const ex = rows.find((r) => String(r[def.key]) === String(rec[def.key]));
        if (ex) { Object.assign(ex, rec); updated++; } else { rows.push({ ...Object.fromEntries(def.cols.map(([k, , t]) => [k, t === 'bool' ? true : t === 'role' ? 'staff' : ''])), ...rec }); added++; }
      }
      dirty = true; draw();
      toast(`Đã nhập: ${added} mới, ${updated} cập nhật${dupes ? `, bỏ ${dupes} dòng trùng mã` : ''}. Bấm Lưu để ghi.`, 'ok', 5000);
    } catch (err) { toast(err.message, 'error'); }
  };
  $('#save').onclick = async () => {
    const keys = rows.map((r) => String(r[def.key] || '').trim());
    if (keys.some((k) => !k)) return toast(`Có dòng thiếu "${def.cols[0][1]}"`, 'error');
    const dup = keys.find((k, i) => keys.indexOf(k) !== i);
    if (dup) return toast(`Trùng mã: ${dup}`, 'error');
    const b = $('#save'); b.disabled = true;
    try {
      await Store.saveTable(tab, rows);
      rows.forEach((r) => delete r.password);
      dirty = false; draw(); toast('Đã lưu', 'ok');
    } catch (e) { toast(e.message, 'error'); } finally { b.disabled = false; }
  };
  const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', warn);
  cleanup = () => window.removeEventListener('beforeunload', warn);
  draw();
}

/* ================= Cài đặt ================= */
function viewSettings() {
  const t = getTheme();
  const u = Store.user;
  const pal = CONFIG.palettes[t.palette] || CONFIG.palettes.kingsport;
  app.innerHTML = shell('settings', 'Cài đặt', `
  <div class="grid-2">
    <section class="card">
      <h2>Giao diện</h2>
      <div class="field"><span>Chế độ</span>
        <div class="seg" id="mode">${[['light', '☀ Sáng'], ['dark', '☾ Tối'], ['auto', '◐ Theo máy']].map(([k, l]) => `<button data-m="${k}" class="${t.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="field"><span>Bộ màu</span>
        <div class="swatches" id="pal">${Object.entries(CONFIG.palettes).map(([k, p]) => `
          <button data-p="${k}" class="${t.palette === k && !t.primary ? 'on' : ''}" title="${esc(p.name)}"><i style="background:${p.primary}"></i><i style="background:${p.accent}"></i><small>${esc(p.name)}</small></button>`).join('')}</div></div>
      <div class="row-2">
        <label>Màu chủ đạo<input type="color" id="cp" value="${t.primary || pal.primary}"></label>
        <label>Màu phối<input type="color" id="ca" value="${t.accent || pal.accent}"></label>
      </div>
      <button class="btn btn-ghost btn-sm" id="reset">Khôi phục mặc định</button>
      <div class="preview-strip"><span class="btn btn-primary">Nút chính</span><span class="pill pill-ok">Khớp</span><span class="pill pill-warn">Ngoài DS</span><span class="accent-chip">Màu phối</span></div>
    </section>
    <section class="card">
      <h2>Tài khoản</h2>
      <p><b>${esc(u.fullname || u.username)}</b> · ${esc(ROLES[u.role] || u.role)}</p>
      <p class="muted">Tên đăng nhập: ${esc(u.username)}</p>
      <button class="btn" id="logout">Đăng xuất</button>
    </section>
    <section class="card">
      <h2>Máy chủ dữ liệu</h2>
      <p class="muted">Chế độ hiện tại: <b>${Store.mode === 'demo' ? 'DEMO (lưu trên máy này)' : 'Google Sheets'}</b>.
      Dán URL Web App của Google Apps Script để dùng chung dữ liệu cho mọi người (xem hướng dẫn trong README).</p>
      <label>URL Apps Script<input id="api" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(Store.apiUrl)}"></label>
      <div class="row-btns"><button class="btn btn-primary" id="saveApi">Lưu &amp; đăng nhập lại</button></div>
      ${Store.queue().length ? `<p class="warn-text">Còn ${Store.queue().length} lượt quét chưa đồng bộ.</p><button class="btn" id="flush">Đồng bộ ngay</button>` : ''}
    </section>
    <section class="card">
      <h2>Mẹo dùng camera trên iPhone</h2>
      <ul class="tips">
        <li>Mở bằng <b>Safari</b>, bấm Chia sẻ → <b>Thêm vào MH chính</b> để dùng như app.</li>
        <li>Giữ mã hàng nằm ngang trong khung, cách 10–20 cm, đủ sáng, tránh lóa.</li>
        <li>Lần đầu quét cần tải bộ nhận diện (~10 giây), các lần sau dùng bộ nhớ đệm.</li>
        <li>Bật <b>Quét liên tục</b> khi đếm nhiều linh kiện cùng mã: mỗi lần nhận diện chắc chắn sẽ tự cộng SL mặc định.</li>
        <li>Thêm mã vạch / mã phụ của nhà cung cấp vào Danh mục hàng hóa để tăng tỉ lệ nhận đúng.</li>
      </ul>
    </section>
  </div>`);

  $('#mode').onclick = (e) => { const b = e.target.closest('[data-m]'); if (b) { setTheme({ mode: b.dataset.m }); viewSettings(); } };
  $('#pal').onclick = (e) => { const b = e.target.closest('[data-p]'); if (b) { setTheme({ palette: b.dataset.p, primary: '', accent: '' }); viewSettings(); } };
  $('#cp').oninput = (e) => setTheme({ primary: e.target.value });
  $('#ca').oninput = (e) => setTheme({ accent: e.target.value });
  $('#reset').onclick = () => { setTheme({ mode: 'auto', palette: 'kingsport', primary: '', accent: '' }); viewSettings(); };
  $('#logout').onclick = () => { Store.logout(); location.hash = '#/login'; };
  $('#saveApi').onclick = () => { Store.setApiUrl($('#api').value); Store._master = null; location.hash = '#/login'; };
  $('#flush')?.addEventListener('click', async () => { await Store.flush().catch((e) => toast(e.message, 'error')); viewSettings(); });
}

route();

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
