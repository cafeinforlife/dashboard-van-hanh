/**
 * Backend miễn phí cho app Kiểm Kê Linh Kiện — Google Apps Script + Google Sheets.
 * Cách cài đặt: xem backend/README.md
 */
const TABLES = {
  users:     ['username', 'fullname', 'role', 'location', 'active', 'password_hash'],
  locations: ['code', 'name', 'type', 'branch', 'region', 'address', 'manager', 'active'], // mã = Location Code trong ERP
  items:     ['sku', 'name', 'unit', 'category', 'price', 'barcode', 'alias'],
  staff:     ['code', 'name', 'phone', 'location', 'branch', 'dept', 'title', 'active'],
  aliases:   ['alias', 'sku', 'created_by', 'ts'], // mã in trên tem ↔ mã hệ thống (app tự học)
  sessions:  ['id', 'name', 'location', 'date', 'status', 'team', 'note', 'created_by', 'created_at', 'closed_at'],
  expected:  ['session_id', 'sku', 'name', 'unit', 'qty', 'price', 'bin', 'note'],
  counts:    ['id', 'session_id', 'sku', 'name', 'qty', 'method', 'raw', 'user', 'staff', 'bin', 'note', 'ts', 'in_list', 'serial'],
};
const MASTER = ['users', 'locations', 'items', 'staff', 'aliases'];
const NUMERIC = ['qty', 'price', 'ts', 'created_at', 'closed_at'];
const TOKEN_TTL = 21600; // 6 giờ, tự gia hạn mỗi lần gọi

/** Chạy hàm này 1 lần sau khi dán code (Run ▶ setup) để tạo các sheet + tài khoản admin/admin123 */
function setup() {
  Object.keys(TABLES).forEach(sheet_);
  if (!readTable_('users').length) {
    writeTable_('users', [{ username: 'admin', fullname: 'Quản trị hệ thống', role: 'admin', location: '', active: true, password_hash: hash_('admin', 'admin123') }]);
  }
  // Nạp danh sách kho/cửa hàng theo mã Location ERP
  if (!readTable_('locations').length) {
    const res = UrlFetchApp.fetch('https://cafeinforlife.github.io/dashboard-van-hanh/data/locations.json');
    writeTable_('locations', JSON.parse(res.getContentText()));
  }
}

function doGet() {
  return json_({ result: { ok: true, app: 'kiem-ke', time: new Date().toISOString() } });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents || '{}');
    const fn = ACTIONS[req.action];
    if (!fn) throw new Error('Hành động không hợp lệ: ' + req.action);
    const user = req.action === 'login' ? null : auth_(req.token);
    return json_({ result: fn(req, user) });
  } catch (err) {
    return json_({ error: String(err.message || err), code: err.code || '' });
  }
}

const ACTIONS = {
  login(req) {
    const u = readTable_('users').find((x) => String(x.username).toLowerCase() === String(req.username || '').trim().toLowerCase());
    if (!u || !isActive_(u.active) || u.password_hash !== hash_(u.username, req.password)) throw new Error('Sai tài khoản hoặc mật khẩu');
    const token = Utilities.getUuid();
    const pub = publicUser_(u);
    CacheService.getScriptCache().put('t_' + token, JSON.stringify(pub), TOKEN_TTL);
    return { token, user: pub };
  },

  getMaster() {
    return {
      users: readTable_('users').map(publicUser_),
      locations: readTable_('locations'), items: readTable_('items'), staff: readTable_('staff'), aliases: readTable_('aliases'),
    };
  },

  saveTable(req, user) {
    need_(user, 'admin');
    if (MASTER.indexOf(req.table) < 0) throw new Error('Bảng không hợp lệ');
    return withLock_(() => {
      let rows = req.rows || [];
      if (req.table === 'users') {
        const old = readTable_('users');
        rows = rows.filter((r) => String(r.username || '').trim()).map((r) => {
          const u = Object.assign({}, r); u.username = String(u.username).trim();
          const prev = old.find((o) => o.username === u.username);
          u.password_hash = r.password ? hash_(u.username, r.password) : (prev ? prev.password_hash : '');
          delete u.password;
          return u;
        });
        if (!rows.some((u) => u.role === 'admin' && isActive_(u.active))) throw new Error('Phải còn ít nhất 1 tài khoản Quản trị đang hoạt động');
      }
      writeTable_(req.table, rows);
      return { ok: true, count: rows.length };
    });
  },

  listSessions() {
    const exp = readTable_('expected'), cnt = readTable_('counts');
    return readTable_('sessions').map((s) => {
      const e = exp.filter((x) => x.session_id === s.id);
      const c = cnt.filter((x) => x.session_id === s.id);
      const skus = {}; c.forEach((x) => { skus[x.sku] = 1; });
      return Object.assign({}, s, { exp_skus: e.length, counted_skus: e.filter((x) => skus[x.sku]).length, scans: c.length });
    }).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  },

  createSession(req, user) {
    need_(user, 'manage');
    return withLock_(() => {
      const s = Object.assign({}, req.session, { id: 'S' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), status: 'open', created_at: Date.now(), closed_at: '' });
      appendRows_('sessions', [s]);
      appendRows_('expected', (req.expected || []).map((e) => Object.assign({}, e, { session_id: s.id })));
      return s;
    });
  },

  getSession(req) {
    const session = readTable_('sessions').find((s) => s.id === req.id);
    if (!session) throw new Error('Không tìm thấy đợt kiểm kê');
    return {
      session,
      expected: readTable_('expected').filter((e) => e.session_id === req.id),
      counts: readTable_('counts').filter((c) => c.session_id === req.id),
    };
  },

  addCounts(req) {
    return withLock_(() => {
      const sessions = readTable_('sessions');
      const have = {}; readColumn_('counts', 'id').forEach((id) => { have[id] = 1; });
      const rows = (req.counts || []).filter((c) => {
        if (have[c.id]) return false;
        const s = sessions.find((x) => x.id === c.session_id);
        return s && s.status !== 'closed';
      });
      appendRows_('counts', rows);
      return { ok: true, added: rows.length };
    });
  },

  addAlias(req, user) {
    return withLock_(() => {
      const alias = String(req.alias || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (alias.length < 4 || !req.sku) throw new Error('Mã tem không hợp lệ');
      deleteWhere_('aliases', (r) => r.alias === alias);
      appendRows_('aliases', [{ alias, sku: req.sku, created_by: user.username, ts: Date.now() }]);
      return { ok: true };
    });
  },

  deleteCount(req) {
    return withLock_(() => { deleteWhere_('counts', (r) => r.id === req.id); return { ok: true }; });
  },

  updateSession(req, user) {
    need_(user, 'manage');
    return withLock_(() => {
      const rows = readTable_('sessions');
      const s = rows.find((x) => x.id === req.id);
      if (!s) throw new Error('Không tìm thấy đợt kiểm kê');
      Object.assign(s, req.patch);
      writeTable_('sessions', rows);
      return s;
    });
  },

  setExpected(req, user) {
    need_(user, 'manage');
    return withLock_(() => {
      deleteWhere_('expected', (r) => r.session_id === req.id);
      appendRows_('expected', (req.expected || []).map((e) => Object.assign({}, e, { session_id: req.id })));
      return { ok: true, count: (req.expected || []).length };
    });
  },

  deleteSession(req, user) {
    need_(user, 'admin');
    return withLock_(() => {
      ['sessions', 'expected', 'counts'].forEach((t) => deleteWhere_(t, (r) => (t === 'sessions' ? r.id : r.session_id) === req.id));
      return { ok: true };
    });
  },
};

/* ---------- Helpers ---------- */
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function hash_(u, p) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, u + ':' + p, Utilities.Charset.UTF_8);
  return raw.map((b) => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}
function isActive_(v) { return !(v === false || String(v).toLowerCase() === 'false' || v === 0 || v === '0'); }
function publicUser_(u) { const o = Object.assign({}, u); delete o.password_hash; return o; }
function err_(msg, code) { const e = new Error(msg); e.code = code; return e; }

function auth_(token) {
  if (!token) throw err_('Vui lòng đăng nhập', 'AUTH');
  const cache = CacheService.getScriptCache();
  const v = cache.get('t_' + token);
  if (!v) throw err_('Phiên đăng nhập đã hết hạn', 'AUTH');
  cache.put('t_' + token, v, TOKEN_TTL);
  return JSON.parse(v);
}
function need_(user, perm) {
  const ok = perm === 'admin' ? user.role === 'admin' : user.role === 'admin' || user.role === 'manager';
  if (!ok) throw new Error('Bạn không có quyền thực hiện thao tác này');
}
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function sheet_(name) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  const cols = TABLES[name];
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#CC2338').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    // Cột chữ để dạng Text để mã "00123" không bị mất số 0, ngày không bị đổi định dạng
    cols.forEach((c, i) => { if (NUMERIC.indexOf(c) < 0) sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@'); });
  }
  return sh;
}
function readTable_(name) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  const head = values.shift() || [];
  return values.filter((r) => r.some((v) => v !== '')).map((r) => {
    const o = {};
    head.forEach((h, i) => { if (h) o[h] = NUMERIC.indexOf(h) >= 0 ? (r[i] === '' ? '' : Number(r[i])) : (r[i] === true || r[i] === false ? r[i] : String(r[i])); });
    return o;
  });
}
function readColumn_(name, col) {
  const sh = sheet_(name);
  const i = TABLES[name].indexOf(col);
  const n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, i + 1, n, 1).getValues().map((r) => String(r[0])) : [];
}
function toRow_(name, o) { return TABLES[name].map((c) => (o[c] === undefined || o[c] === null ? '' : o[c])); }
function appendRows_(name, rows) {
  if (!rows.length) return;
  const sh = sheet_(name);
  const start = sh.getLastRow() + 1, max = sh.getMaxRows();
  if (start + rows.length - 1 > max) {
    const add = start + rows.length - 1 - max + 500;
    sh.insertRowsAfter(max, add);
    TABLES[name].forEach((c, i) => { if (NUMERIC.indexOf(c) < 0) sh.getRange(max + 1, i + 1, add, 1).setNumberFormat('@'); });
  }
  sh.getRange(start, 1, rows.length, TABLES[name].length).setValues(rows.map((r) => toRow_(name, r)));
}
function writeTable_(name, rows) {
  const sh = sheet_(name);
  const n = sh.getLastRow() - 1;
  if (n > 0) sh.getRange(2, 1, n, sh.getLastColumn()).clearContent();
  appendRows_(name, rows);
}
function deleteWhere_(name, pred) {
  const rows = readTable_(name);
  const keep = rows.filter((r) => !pred(r));
  if (keep.length !== rows.length) writeTable_(name, keep);
}
