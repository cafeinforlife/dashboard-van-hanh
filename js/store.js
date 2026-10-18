// Lớp dữ liệu: cùng một API cho 2 chế độ
//  - demo:   lưu trong localStorage của trình duyệt (dùng thử, không cần máy chủ)
//  - remote: Google Apps Script + Google Sheets (miễn phí, dùng chung nhiều máy)
import { CONFIG } from './config.js';
import { ls, sha256, uid } from './util.js';

export const TABLES = {
  users:     ['username', 'fullname', 'role', 'location', 'active', 'password_hash'],
  locations: ['code', 'name', 'type', 'branch', 'region', 'address', 'manager', 'active'], // mã = Location Code trong ERP
  items:     ['sku', 'name', 'unit', 'category', 'price', 'barcode', 'alias'],
  staff:     ['code', 'name', 'phone', 'location', 'branch', 'dept', 'title', 'active'],
  aliases:   ['alias', 'sku', 'created_by', 'ts'], // mã in trên tem ↔ mã hệ thống (app tự học)
  sessions:  ['id', 'name', 'location', 'date', 'status', 'team', 'note', 'created_by', 'created_at', 'closed_at'],
  expected:  ['session_id', 'sku', 'name', 'unit', 'qty', 'price', 'bin', 'note'],
  counts:    ['id', 'session_id', 'sku', 'name', 'qty', 'method', 'raw', 'user', 'staff', 'bin', 'note', 'ts', 'in_list', 'serial'],
};
export const MASTER_TABLES = ['users', 'locations', 'items', 'staff', 'aliases'];
export const ROLES = { admin: 'Quản trị', manager: 'Quản lý', staff: 'Nhân viên kiểm kê' };

const K_DB = 'kk_db_v1', K_AUTH = 'kk_auth', K_QUEUE = 'kk_queue', K_API = 'kk_api_url';

const apiUrl = () => ls.get(K_API) || CONFIG.apiUrl || '';
const isActive = (v) => !(v === false || String(v).toLowerCase() === 'false' || v === 0 || v === '0');
const publicUser = ({ password_hash, ...u }) => u;

/* ---------------- Demo adapter ---------------- */
// Danh sách kho/cửa hàng theo mã Location của ERP (data/locations.json, tạo từ file Locations.xlsx)
const LOC_VER = 2;
async function erpLocations() {
  try { const r = await fetch('data/locations.json', { cache: 'no-cache' }); if (r.ok) return await r.json(); } catch { /* offline */ }
  return null;
}

async function seedDb() {
  const h = await sha256('admin:admin123');
  const locs = [
    ['DNA', 'CN Đồng Nai', 'Đông Nam Bộ'], ['BDU', 'CN Bình Dương', 'Đông Nam Bộ'],
    ['BRVT', 'CN Bà Rịa - Vũng Tàu', 'Đông Nam Bộ'], ['TNI', 'CN Tây Ninh', 'Đông Nam Bộ'],
    ['LAN', 'CN Long An - Đức Hòa', 'Đông Nam Bộ'], ['CCI', 'CN Củ Chi', 'HCM'],
    ['DTR', 'CN Đức Trọng - Lâm Đồng', 'Tây Nguyên'], ['BTH', 'CN Bình Thuận', 'Nam Trung Bộ'],
    ['NTH', 'CN Ninh Thuận', 'Nam Trung Bộ'],
  ];
  const items = [
    ['MCB-BOARD-01', 'Bo mạch điều khiển máy chạy bộ', 'Cái', 'Máy chạy bộ', 1250000],
    ['MCB-MOTOR-2HP', 'Motor DC 2HP', 'Cái', 'Máy chạy bộ', 2100000],
    ['MCB-BELT-450', 'Băng tải 450mm', 'Cái', 'Máy chạy bộ', 650000],
    ['MCB-SAFE-KEY', 'Khóa an toàn từ tính', 'Cái', 'Máy chạy bộ', 45000],
    ['MSG-RLR-08', 'Con lăn ghế massage', 'Bộ', 'Ghế massage', 380000],
    ['MV-CTRL-48V', 'IC điều khiển xe điện 48V', 'Cái', 'Xe điện Move', 890000],
    ['MV-BAT-4820', 'Pin Lithium 48V-20Ah', 'Khối', 'Xe điện Move', 5400000],
    ['MV-CHG-48V', 'Sạc 48V 3A', 'Cái', 'Xe điện Move', 420000],
    ['MV-TIRE-1625', 'Lốp 16x2.5', 'Cái', 'Xe điện Move', 260000],
    ['MV-BRK-PAD', 'Má phanh đĩa', 'Bộ', 'Xe điện Move', 95000],
  ];
  return {
    users: [{ username: 'admin', fullname: 'Quản trị hệ thống', role: 'admin', location: '', active: true, password_hash: h }],
    locations: (await erpLocations()) || locs.map(([code, name, region]) => ({ code, name, type: 'Kho', branch: '', region, address: '', manager: '', active: true })),
    meta: { locVer: LOC_VER },
    items: items.map(([sku, name, unit, category, price]) => ({ sku, name, unit, category, price, barcode: '', alias: '' })),
    staff: [], // đồng bộ từ Google Sheet nhân sự (Danh mục → Nhân sự)
    sessions: [], expected: [], counts: [],
  };
}

let _db = null;
async function db() {
  if (_db) return _db;
  _db = ls.get(K_DB) || await seedDb();
  for (const t of Object.keys(TABLES)) _db[t] ||= [];
  await migrateLocations(_db);
  ls.set(K_DB, _db);
  return _db;
}
const saveDb = () => ls.set(K_DB, _db);

// Máy đã chạy bản DEMO cũ: nạp danh sách Location ERP, bỏ các địa điểm mẫu chưa dùng
async function migrateLocations(d) {
  if ((d.meta?.locVer || 0) >= LOC_VER) return;
  const erp = await erpLocations();
  if (!erp) return;
  const SAMPLE = { DNA: 'BH01', BDU: 'BD01', BRVT: 'BR01', DTR: 'DT01' };
  for (const s of d.staff) if (SAMPLE[s.location]) s.location = SAMPLE[s.location];
  const used = new Set([...d.sessions, ...d.users, ...d.staff].map((x) => x.location));
  const sample = new Set(['DNA', 'BDU', 'BRVT', 'TNI', 'LAN', 'CCI', 'DTR', 'BTH', 'NTH']);
  const by = new Map(d.locations.filter((l) => !(sample.has(l.code) && !used.has(l.code))).map((l) => [l.code, l]));
  for (const e of erp) by.set(e.code, { ...by.get(e.code), ...e });
  d.locations = [...by.values()];
  d.meta = { ...d.meta, locVer: LOC_VER };
}

const demo = {
  async login({ username, password }) {
    const d = await db();
    const u = d.users.find((x) => x.username.toLowerCase() === String(username).toLowerCase().trim());
    if (!u || !isActive(u.active) || u.password_hash !== await sha256(`${u.username}:${password}`))
      throw new Error('Sai tài khoản hoặc mật khẩu');
    return { token: 'demo-' + u.username, user: publicUser(u) };
  },
  async getMaster() {
    const d = await db();
    return { users: d.users.map(publicUser), locations: d.locations, items: d.items, staff: d.staff, aliases: d.aliases };
  },
  async addAlias({ alias, sku }) {
    const d = await db();
    d.aliases = d.aliases.filter((a) => a.alias !== alias);
    d.aliases.push({ alias, sku, created_by: Store.user?.username, ts: Date.now() });
    saveDb();
    return { ok: true };
  },
  async saveTable({ table, rows }) {
    if (!MASTER_TABLES.includes(table)) throw new Error('Bảng không hợp lệ');
    const d = await db();
    if (table === 'users') rows = await mergeUsers(d.users, rows);
    d[table] = rows; saveDb();
    return { ok: true, count: rows.length };
  },
  async listSessions() {
    const d = await db();
    return d.sessions.map((s) => ({ ...s, ...sessionStats(s.id, d.expected, d.counts) }))
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  },
  async createSession({ session, expected }) {
    const d = await db();
    const s = { ...session, id: uid('S'), status: 'open', created_at: Date.now(), closed_at: '' };
    d.sessions.push(s);
    d.expected.push(...expected.map((e) => ({ ...e, session_id: s.id })));
    saveDb();
    return s;
  },
  async getSession({ id }) {
    const d = await db();
    const session = d.sessions.find((s) => s.id === id);
    if (!session) throw new Error('Không tìm thấy đợt kiểm kê');
    return { session, expected: d.expected.filter((e) => e.session_id === id), counts: d.counts.filter((c) => c.session_id === id) };
  },
  async addCounts({ counts }) {
    const d = await db();
    const ids = new Set(d.counts.map((c) => c.id));
    d.counts.push(...counts.filter((c) => !ids.has(c.id)));
    saveDb();
    return { ok: true };
  },
  async deleteCount({ id }) {
    const d = await db();
    d.counts = d.counts.filter((c) => c.id !== id); saveDb();
    return { ok: true };
  },
  async updateSession({ id, patch }) {
    const d = await db();
    const s = d.sessions.find((x) => x.id === id);
    if (!s) throw new Error('Không tìm thấy đợt kiểm kê');
    Object.assign(s, patch); saveDb();
    return s;
  },
  async deleteSession({ id }) {
    const d = await db();
    d.sessions = d.sessions.filter((s) => s.id !== id);
    d.expected = d.expected.filter((e) => e.session_id !== id);
    d.counts = d.counts.filter((c) => c.session_id !== id);
    saveDb();
    return { ok: true };
  },
};

// Giữ mật khẩu cũ nếu không nhập mới; băm mật khẩu mới.
async function mergeUsers(old, rows) {
  const out = [];
  for (const r of rows) {
    const { password, ...u } = r;
    u.username = String(u.username || '').trim();
    if (!u.username) continue;
    const prev = old.find((o) => o.username === u.username);
    u.password_hash = password ? await sha256(`${u.username}:${password}`) : prev?.password_hash || '';
    out.push(u);
  }
  if (!out.some((u) => u.role === 'admin' && isActive(u.active))) throw new Error('Phải còn ít nhất 1 tài khoản Quản trị đang hoạt động');
  return out;
}

export function sessionStats(id, expected, counts) {
  const exp = expected.filter((e) => e.session_id === id);
  const cnt = counts.filter((c) => c.session_id === id);
  const skus = new Set(cnt.map((c) => c.sku));
  return {
    exp_skus: exp.length,
    counted_skus: exp.filter((e) => skus.has(e.sku)).length,
    scans: cnt.length,
  };
}

/* ---------------- Remote adapter (Google Apps Script) ---------------- */
async function remoteCall(action, payload = {}) {
  const url = apiUrl();
  // Content-Type text/plain để tránh CORS preflight với Apps Script
  const res = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({ action, token: ls.get(K_AUTH)?.token, ...payload }),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Máy chủ lỗi ${res.status}`);
  const data = await res.json();
  if (data.error) {
    if (data.code === 'AUTH') { ls.del(K_AUTH); location.hash = '#/login'; }
    throw Object.assign(new Error(data.error), { server: true });
  }
  return data.result;
}
const remote = new Proxy({}, { get: (_, action) => (payload) => remoteCall(action, payload) });

/* ---------------- Public API ---------------- */
const impl = () => (apiUrl() ? remote : demo);

export const Store = {
  get mode() { return apiUrl() ? 'remote' : 'demo'; },
  get apiUrl() { return apiUrl(); },
  setApiUrl(u) { u ? ls.set(K_API, u.trim()) : ls.del(K_API); ls.del(K_AUTH); },
  get auth() { return ls.get(K_AUTH); },
  get user() { return ls.get(K_AUTH)?.user || null; },
  can(perm) {
    const r = this.user?.role;
    if (perm === 'admin') return r === 'admin';
    if (perm === 'manage') return r === 'admin' || r === 'manager';
    return !!r;
  },

  async login(username, password) {
    const r = await impl().login({ username, password });
    ls.set(K_AUTH, r);
    return r.user;
  },
  logout() { ls.del(K_AUTH); },

  _master: null,
  async master(force = false) {
    if (!this._master || force) this._master = await impl().getMaster();
    return this._master;
  },
  async saveTable(table, rows) { const r = await impl().saveTable({ table, rows }); this._master = null; return r; },
  listSessions: () => impl().listSessions(),
  createSession: (session, expected) => impl().createSession({ session, expected }),
  updateSession: (id, patch) => impl().updateSession({ id, patch }),
  deleteSession: (id) => impl().deleteSession({ id }),
  deleteCount: (id) => impl().deleteCount({ id }),
  async addAlias(alias, sku) {
    await impl().addAlias({ alias, sku });
    if (this._master) this._master.aliases = [...(this._master.aliases || []).filter((a) => a.alias !== alias), { alias, sku }];
  },

  async getSession(id) {
    const r = await impl().getSession({ id });
    // Gộp các lượt quét còn chờ đồng bộ để giao diện luôn đủ dữ liệu
    const have = new Set(r.counts.map((c) => c.id));
    r.counts.push(...this.queue().filter((c) => c.session_id === id && !have.has(c.id)));
    return r;
  },

  // Ghi nhận lượt quét. Ở chế độ remote, nếu mất mạng sẽ xếp hàng chờ gửi lại.
  async addCounts(counts) {
    if (this.mode === 'demo') return demo.addCounts({ counts });
    ls.set(K_QUEUE, [...this.queue(), ...counts]);
    await this.flush();
  },
  queue: () => ls.get(K_QUEUE, []),
  _flushing: false,
  async flush() {
    if (this.mode !== 'remote' || this._flushing) return;
    const q = this.queue();
    if (!q.length) return;
    this._flushing = true;
    try {
      await remoteCall('addCounts', { counts: q });
      const sent = new Set(q.map((c) => c.id));
      ls.set(K_QUEUE, this.queue().filter((c) => !sent.has(c.id)));
    } catch (e) {
      if (e.server) throw e; // lỗi nghiệp vụ: báo ra ngoài; lỗi mạng: giữ hàng đợi
    } finally {
      this._flushing = false;
      window.dispatchEvent(new CustomEvent('queuechange'));
    }
  },
};

setInterval(() => Store.flush().catch(() => {}), 15000);
window.addEventListener('online', () => Store.flush().catch(() => {}));
