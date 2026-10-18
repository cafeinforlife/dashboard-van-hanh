// Nhập / xuất Excel (SheetJS) và tính toán đối chiếu kiểm kê
import { CONFIG } from './config.js';
import { fold, num, fmtDate, pct } from './util.js';

const X = () => {
  if (!window.XLSX) throw new Error('Chưa tải được thư viện Excel, kiểm tra kết nối mạng.');
  return window.XLSX;
};

// Đọc file xlsx/xls/csv → mảng các dòng (mảng ô)
export async function readSheet(file) {
  const buf = await file.arrayBuffer();
  const wb = X().read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return X().utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: false });
}

// Tìm dòng tiêu đề + tự nhận diện cột theo bảng tên tương đương.
// Hỗ trợ tiêu đề song ngữ nhiều dòng kiểu báo cáo ERP: "Mã hàng (Item)", "Số lượng cuối kỳ (Ending Balance)".
const EXCLUDE = { qty: ['dau ky', 'beginning', 'nhap', 'xuat', 'input', 'output', 'in period', 'minimum'] };
const headKey = (cell) => ' ' + fold(cell).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';

function scoreHeader(h, field, names) {
  if ((EXCLUDE[field] || []).some((x) => h.includes(' ' + x + ' '))) return Infinity;
  let best = Infinity;
  names.forEach((a, i) => {
    const t = ' ' + a + ' ';
    const s = h === t ? 0 : h.startsWith(t) ? 0.3 : h.includes(t) ? 0.6 : Infinity;
    best = Math.min(best, i + s);
  });
  return best;
}

export function detectColumns(rows, aliases = CONFIG.template.aliases) {
  let best = { row: 0, map: {}, hits: 0 };
  rows.slice(0, 20).forEach((r, ri) => {
    const heads = r.map(headKey);
    const cands = [];
    for (const [field, names] of Object.entries(aliases))
      heads.forEach((h, ci) => { if (h.trim()) { const sc = scoreHeader(h, field, names); if (sc < Infinity) cands.push([sc, field, ci]); } });
    cands.sort((a, b) => a[0] - b[0]);
    const map = {}, used = new Set();
    for (const [, field, ci] of cands) if (map[field] == null && !used.has(ci)) { map[field] = ci; used.add(ci); }
    const hits = Object.keys(map).length + (map.sku != null ? 2 : 0);
    if (hits > best.hits) best = { row: ri, map, hits };
  });
  // Mã kho ghi ở phần đầu báo cáo, VD "Kho (Location): BR01"
  let warehouse = '';
  for (const r of rows.slice(0, best.row + 3)) for (const c of r) {
    const m = String(c).match(/(?:kho|location)[^:]*:\s*([A-Z0-9_.-]{2,})/i);
    if (m && !warehouse) warehouse = m[1].toUpperCase();
  }
  return { headerRow: best.row, map: best.map, headers: (rows[best.row] || []).map((h) => String(h).replace(/\s+/g, ' ').trim()), warehouse };
}

// Chuyển dòng thô → bản ghi theo map cột. Gộp các mã trùng (cộng số lượng).
export function rowsToRecords(rows, headerRow, map) {
  const bySku = new Map();
  for (const r of rows.slice(headerRow + 1)) {
    const get = (f) => (map[f] == null || map[f] === '' ? '' : r[map[f]]);
    const sku = String(get('sku')).trim();
    if (!sku) continue;
    const rec = bySku.get(sku);
    if (rec) { rec.qty += num(get('qty')); continue; }
    bySku.set(sku, {
      sku, name: String(get('name')).trim(), unit: String(get('unit')).trim(),
      qty: num(get('qty')), price: num(get('price')), bin: String(get('bin')).trim(), note: String(get('note')).trim(),
    });
  }
  return [...bySku.values()];
}

export function downloadTemplate() {
  const cols = CONFIG.template.columns;
  const sample = [
    ['MCB-BOARD-01', 'Bo mạch điều khiển máy chạy bộ', 'Cái', 5, 1250000, 'Kệ A1', ''],
    ['MV-CTRL-48V', 'IC điều khiển xe điện 48V', 'Cái', 3, 890000, 'Kệ B2', ''],
  ].map((r) => r.slice(0, cols.length));
  const ws = X().utils.aoa_to_sheet([cols, ...sample]);
  ws['!cols'] = cols.map((c) => ({ wch: Math.max(12, c.length + 4) }));
  ws['!cols'][1] = { wch: 36 };
  const wb = X().utils.book_new();
  X().utils.book_append_sheet(wb, ws, 'Mau kiem ke');
  X().writeFile(wb, 'Mau_kiem_ke.xlsx');
}

/* ---------- Đối chiếu ---------- */
export const STATUS = {
  ok:    { label: 'Khớp', cls: 'ok' },
  short: { label: 'Thiếu', cls: 'short' },
  over:  { label: 'Thừa', cls: 'over' },
  extra: { label: 'Ngoài DS', cls: 'extra' },
  none:  { label: 'Chưa kiểm', cls: 'none' },
};

export function reconcile(expected, counts, items = []) {
  const itemBy = new Map(items.map((i) => [i.sku, i]));
  const counted = new Map();
  for (const c of counts) counted.set(c.sku, (counted.get(c.sku) || 0) + num(c.qty));
  // Bỏ các mã tồn sổ sách = 0 mà không quét thấy (hàng đã xuất hết) — không cần kiểm
  expected = expected.filter((e) => num(e.qty) !== 0 || counted.has(e.sku));
  const rows = expected.map((e) => {
    const got = counted.get(e.sku) || 0;
    const exp = num(e.qty);
    const diff = got - exp;
    const status = !counted.has(e.sku) && exp > 0 ? 'none' : diff === 0 ? 'ok' : diff < 0 ? 'short' : 'over';
    const price = num(e.price) || num(itemBy.get(e.sku)?.price);
    return { sku: e.sku, name: e.name || itemBy.get(e.sku)?.name || '', unit: e.unit, bin: e.bin, exp, got, diff, status, price, value: diff * price };
  });
  const expSet = new Set(expected.map((e) => e.sku));
  for (const [sku, got] of counted) {
    if (expSet.has(sku)) continue;
    const it = itemBy.get(sku);
    const c = counts.find((x) => x.sku === sku);
    const price = num(it?.price);
    rows.push({ sku, name: it?.name || c?.name || '', unit: it?.unit || '', bin: '', exp: 0, got, diff: got, status: 'extra', price, value: got * price });
  }
  const sum = (f, pred = () => true) => rows.filter(pred).reduce((a, r) => a + f(r), 0);
  const cnt = (s) => rows.filter((r) => r.status === s).length;
  const summary = {
    totalSku: expected.length,
    countedSku: rows.filter((r) => r.status !== 'none' && r.status !== 'extra').length,
    ok: cnt('ok'), short: cnt('short'), over: cnt('over'), extra: cnt('extra'), none: cnt('none'),
    expQty: sum((r) => r.exp), gotQty: sum((r) => r.got),
    shortQty: sum((r) => -r.diff, (r) => r.diff < 0), overQty: sum((r) => r.diff, (r) => r.diff > 0),
    shortValue: sum((r) => -r.value, (r) => r.value < 0), overValue: sum((r) => r.value, (r) => r.value > 0),
    expValue: sum((r) => r.exp * r.price), scans: counts.length,
  };
  summary.progress = pct(summary.countedSku, summary.totalSku);
  summary.accuracy = pct(summary.ok, summary.totalSku + summary.extra);
  return { rows, summary };
}

export function exportReport({ session, locationName, rows, summary, counts, staffNames }) {
  const XL = X();
  const s = summary;
  const info = [
    ['BÁO CÁO KIỂM KÊ LINH KIỆN'],
    [CONFIG.company],
    [],
    ['Đợt kiểm kê', session.name],
    ['Chi nhánh / địa điểm', locationName],
    ['Ngày kiểm kê', session.date],
    ['Nhân sự kiểm kê', staffNames],
    ['Trạng thái', session.status === 'closed' ? 'Đã chốt' : 'Đang kiểm'],
    ['Xuất lúc', fmtDate(Date.now())],
    [],
    ['CHỈ SỐ', 'GIÁ TRỊ'],
    ['Số mã theo sổ sách', s.totalSku],
    ['Số mã đã kiểm', s.countedSku],
    ['Tiến độ (%)', s.progress],
    ['Mã khớp', s.ok],
    ['Mã thiếu', s.short],
    ['Mã thừa', s.over],
    ['Mã chưa kiểm', s.none],
    ['Mã ngoài danh sách', s.extra],
    ['Độ chính xác (%)', s.accuracy],
    ['Tổng SL sổ sách', s.expQty],
    ['Tổng SL thực tế', s.gotQty],
    ['SL thiếu', s.shortQty],
    ['SL thừa', s.overQty],
    ['Giá trị sổ sách (đ)', s.expValue],
    ['Giá trị thiếu (đ)', s.shortValue],
    ['Giá trị thừa (đ)', s.overValue],
    ['Chênh lệch ròng (đ)', s.overValue - s.shortValue],
    ['Tổng lượt quét', s.scans],
    [],
    ['Người kiểm kê', '', 'Thủ kho', '', 'Quản lý chi nhánh'],
  ];
  const ws1 = XL.utils.aoa_to_sheet(info);
  ws1['!cols'] = [{ wch: 26 }, { wch: 36 }, { wch: 16 }, { wch: 6 }, { wch: 20 }];
  ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];

  const head = ['STT', 'Mã hàng', 'Tên hàng', 'ĐVT', 'Vị trí', 'SL sổ sách', 'SL thực tế', 'Chênh lệch', 'Đơn giá', 'Giá trị chênh lệch', 'Kết quả'];
  const body = rows.map((r, i) => [i + 1, r.sku, r.name, r.unit, r.bin, r.exp, r.got, r.diff, r.price, r.value, STATUS[r.status].label]);
  const ws2 = XL.utils.aoa_to_sheet([head, ...body]);
  ws2['!cols'] = [5, 18, 38, 7, 10, 11, 11, 11, 12, 16, 11].map((wch) => ({ wch }));
  ws2['!autofilter'] = { ref: `A1:K${body.length + 1}` };

  const inList = new Set(rows.filter((r) => r.status !== 'extra').map((r) => r.sku));
  const ws3 = XL.utils.aoa_to_sheet([
    ['Thời gian', 'Mã hàng', 'Tên hàng', 'SL', 'Serial', 'Cách ghi nhận', 'Người quét', 'Nhân sự', 'Trong DS', 'Văn bản OCR', 'Ghi chú'],
    ...[...counts].sort((a, b) => a.ts - b.ts).map((c) => [fmtDate(c.ts), c.sku, c.name, num(c.qty), c.serial || '',
      c.method === 'ocr' ? 'Camera OCR' : 'Nhập tay', c.user, c.staff, inList.has(c.sku) ? 'Có' : 'Không', c.raw, c.note]),
  ]);
  ws3['!cols'] = [16, 18, 34, 6, 16, 13, 14, 18, 8, 30, 20].map((wch) => ({ wch }));

  const wb = XL.utils.book_new();
  XL.utils.book_append_sheet(wb, ws1, 'Tong hop');
  XL.utils.book_append_sheet(wb, ws2, 'Doi chieu');
  XL.utils.book_append_sheet(wb, ws3, 'Nhat ky quet');
  const safe = fold(`${session.name}_${session.date}`).replace(/[^a-z0-9]+/g, '_');
  XL.writeFile(wb, `Kiem_ke_${safe}.xlsx`);
}

export function exportTable(name, columns, rows) {
  const ws = X().utils.aoa_to_sheet([columns, ...rows.map((r) => columns.map((c) => r[c] ?? ''))]);
  const wb = X().utils.book_new();
  X().utils.book_append_sheet(wb, ws, name.slice(0, 30));
  X().writeFile(wb, `${name}.xlsx`);
}
