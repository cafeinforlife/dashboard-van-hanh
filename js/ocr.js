// Camera + nhận diện mã hàng bằng OCR (Tesseract.js chạy ngay trên điện thoại, không tốn phí API)
import { CONFIG } from './config.js';
import { normCode, fold } from './util.js';

/* ---------- Camera ---------- */
export class Camera {
  constructor(video) { this.video = video; this.stream = null; this.track = null; }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error('Trình duyệt không hỗ trợ camera. Trên iPhone hãy mở bằng Safari và truy cập qua https.');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
    this.track = this.stream.getVideoTracks()[0];
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    this.video.srcObject = this.stream;
    await this.video.play();
    // Lấy nét liên tục nếu thiết bị hỗ trợ
    try { await this.track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch { /* ok */ }
  }

  get torchSupported() { return !!this.track?.getCapabilities?.().torch; }

  // Zoom: ưu tiên zoom phần cứng của camera (iPhone/Android hỗ trợ "zoom" trong MediaTrack);
  // máy không hỗ trợ thì phóng to số (cắt ảnh) — vẫn đọc được nhưng kém nét hơn.
  get hardwareZoom() { return !!this.track?.getCapabilities?.().zoom; }
  zoomLevels() {
    const z = this.track?.getCapabilities?.().zoom;
    const max = z ? Math.min(z.max, 5) : 3;
    return [1, 2, 3, 5].filter((x) => x <= max);
  }
  async setZoom(level) {
    const z = this.track?.getCapabilities?.().zoom;
    if (z) {
      this.digital = 1; this.video.style.transform = '';
      try { await this.track.applyConstraints({ advanced: [{ zoom: Math.max(z.min, Math.min(z.max, level)) }] }); return; } catch { /* rơi về zoom số */ }
    }
    this.digital = level;
    this.video.style.transform = level > 1 ? `scale(${level})` : '';
  }
  async torch(on) { try { await this.track.applyConstraints({ advanced: [{ torch: on }] }); return true; } catch { return false; } }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null; this.track = null;
    if (this.video) this.video.srcObject = null;
  }

  // Cắt vùng khung ngắm (tỉ lệ theo khung hiển thị) và tiền xử lý ảnh
  capture(box = { x: 0.06, y: 0.25, w: 0.88, h: 0.5 }) {
    const v = this.video;
    const vw = v.videoWidth, vh = v.videoHeight;
    if (!vw) return null;
    // Video hiển thị kiểu object-fit: cover → quy đổi vùng nhìn thấy sang tọa độ thật
    // Kích thước khung hiển thị (không tính transform của zoom số)
    const el = { width: v.offsetWidth, height: v.offsetHeight };
    const dz = this.digital || 1;
    if (dz > 1) box = { x: 0.5 + (box.x - 0.5) / dz, y: 0.5 + (box.y - 0.5) / dz, w: box.w / dz, h: box.h / dz };
    const scale = Math.max(el.width / vw, el.height / vh);
    const visW = el.width / scale, visH = el.height / scale;
    const offX = (vw - visW) / 2, offY = (vh - visH) / 2;
    const sx = offX + box.x * visW, sy = offY + box.y * visH, sw = box.w * visW, sh = box.h * visH;

    const targetW = Math.min(1600, Math.max(900, sw));
    const k = targetW / sw;
    const c = document.createElement('canvas');
    c.width = Math.round(sw * k); c.height = Math.round(sh * k);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
    // Bản xám (không nhị phân) dùng cho lượt đọc thứ 2 khi nền màu / tương phản thấp
    const g = document.createElement('canvas'); g.width = c.width; g.height = c.height;
    const gctx = g.getContext('2d', { willReadFrequently: true });
    gctx.drawImage(c, 0, 0);
    preprocess(gctx, g.width, g.height, false);
    preprocess(ctx, c.width, c.height);
    c.alt = g;
    return c;
  }
}

// Xám hóa → kéo giãn tương phản → nhị phân hóa Otsu
export function preprocess(ctx, w, h, binarize = true) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const gray = new Uint8ClampedArray(w * h);
  let min = 255, max = 0;
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    gray[j] = g; if (g < min) min = g; if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  const hist = new Array(256).fill(0);
  for (let j = 0; j < gray.length; j++) { gray[j] = ((gray[j] - min) * 255) / range; hist[gray[j]]++; }
  // Otsu
  let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = gray.length - wB; if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; thr = t; }
  }
  // Không tự đảo màu: tem trắng dán trên thân máy màu đen sẽ bị đảo sai.
  // Tesseract tự xử lý được dòng chữ sáng trên nền tối.
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const b = binarize ? (gray[j] < thr ? 0 : 255) : gray[j];
    d[i] = d[i + 1] = d[i + 2] = b; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/* ---------- OCR engine ---------- */
let workerP = null;
export function ocrReady() { return !!workerP; }
export function initOcr(onProgress) {
  if (workerP) return workerP;
  workerP = (async () => {
    if (!window.Tesseract) throw new Error('Chưa tải được thư viện OCR, kiểm tra kết nối mạng.');
    // Thư viện + dữ liệu nhận diện đóng gói trong app (vendor/) → chạy được khi mất mạng
    const abs = (p) => new URL(p, document.baseURI).href;
    const w = await window.Tesseract.createWorker('eng', 1, {
      workerPath: abs('vendor/worker.min.js'),
      corePath: abs('vendor/core'),
      langPath: abs('vendor/lang'),
      workerBlobURL: false,
      logger: (m) => onProgress?.(m),
    });
    await w.setParameters({
      tessedit_char_whitelist: CONFIG.ocr.whitelist,
      tessedit_pageseg_mode: '6',
      preserve_interword_spaces: '1',
    });
    return w;
  })();
  workerP.catch(() => { workerP = null; });
  return workerP;
}

export async function recognize(canvas) {
  const w = await initOcr();
  const { data } = await w.recognize(canvas);
  return { text: data.text || '', confidence: data.confidence || 0 };
}

/* ---------- Đối chiếu văn bản với danh mục mã hàng ---------- */
// Các ký tự OCR hay nhầm lẫn → quy về một dạng chung
const CONFUSE = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6' };
const skel = (s) => s.replace(/[OQDILZSBG]/g, (c) => CONFUSE[c]);

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
const sim = (a, b) => 1 - lev(a, b) / Math.max(a.length, b.length);

// Khoảng cách sửa nhỏ nhất của mã `a` so với một đoạn bất kỳ trong chuỗi `b`
// (dùng khi OCR dính liền nhiều chữ: "B10KMCOT10PRD" chứa "KMC0T10PRD").
function semiLev(a, b) {
  const m = a.length, n = b.length;
  let prev = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return Math.min(...prev);
}
const bigrams = (s) => { const o = new Set(); for (let i = 0; i < s.length - 1; i++) o.add(s.slice(i, i + 2)); return o; };

// Tách văn bản OCR thành các "ứng viên": từng từ, cặp từ liền kề, cả dòng.
export function tokens(text) {
  const out = new Set();
  for (const line of String(text).toUpperCase().split(/\n+/)) {
    const words = line.split(/\s+/).map((w) => w.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, '')).filter(Boolean);
    words.forEach((w, i) => {
      out.add(w);
      if (words[i + 1]) out.add(w + words[i + 1]);
      if (words[i + 2]) out.add(w + words[i + 1] + words[i + 2]);
    });
    if (words.length) out.add(words.join(''));
  }
  return [...out].map(normCode).filter((t) => t.length >= 3);
}

/**
 * Xây chỉ mục tra cứu.
 * @param entries [{sku, name, keys:[mã phụ/barcode/alias], expected:boolean}]
 */
export function buildIndex(entries) {
  return entries.map((e) => {
    const keys = [e.sku, ...(e.keys || [])].map(normCode).filter((k) => k.length >= 3);
    const skeys = keys.map(skel);
    return { ...e, nkeys: keys, skeys, bkeys: skeys.map((k) => [...bigrams(k)]), models: itemModels(e.sku, e.name) };
  });
}

/* ---------- Lớp 2: đối chiếu theo NHÓM SẢN PHẨM + MÃ MODEL ----------
 * Dùng khi mã in trên tem không khớp ERP (VD tem B10 in KMC0T10PRD, ERP là KMC0B10T1PRD):
 * tem có chữ "GHẾ MASSAGE" + model "B10" → tìm hàng cùng nhóm + cùng model, ưu tiên hàng trong phiếu tồn kho. */

// Model của 1 mã hàng: lấy từ "model: …" trong tên ERP, từ cấu trúc mã thành phẩm KMC…, hoặc mã dạng chữ+số trong tên.
export function itemModels(sku, name) {
  const out = new Set();
  const add = (t) => { t = normCode(t); if (/^[A-Z]{1,3}\d{1,3}[A-Z]{0,3}$/.test(t)) { out.add(t); out.add(t.replace(/(NEW|SONIC|PRO|PLUS)$/, '')); } };
  const n = String(name || '').toUpperCase();
  const m = n.match(/MODEL\s*:?\s*([^,(;]+)/);
  for (const w of (m ? m[1] : n).split(/[\s/]+/)) if (/\d/.test(w) && /[A-Z]/.test(w)) add(w);
  const k = String(sku || '').toUpperCase().match(/^KMC[0V]*([GB])0*(\d{1,3})/);   // KMC0B10T1PRD → B10
  if (k) add(k[1] + k[2]);
  return [...out].filter((t) => t.length >= 2);
}

// Nhóm sản phẩm đọc được trên tem (OCR không dấu, có thể dính liền: "GHEMASSAGEDUNGDIEN")
export function textCategory(text) {
  const t = fold(text).replace(/[^a-z0-9]/g, '');
  return CONFIG.categories.find((c) => c.words.some((w) => w.length >= 5 && t.includes(w.replace(/\s/g, ''))))?.key || '';
}

let modelCache = null;
export function matchByModel(text, index, limit = 5) {
  const T = normCode(text), sT = skel(T);
  const words = new Set(String(text).toUpperCase().split(/\s+/).map(normCode));
  if (modelCache?.index !== index) {
    const all = new Set(); index.forEach((it) => it.models.forEach((x) => all.add(x)));
    modelCache = { index, models: [...all].sort((a, b) => b.length - a.length) };
  }
  // Model xuất hiện trên tem: ≥3 ký tự cho phép nằm lẫn trong chuỗi dính liền; 2 ký tự (G9, B7) phải đứng riêng
  const found = modelCache.models.filter((x) => (x.length >= 3 ? T.includes(x) || sT.includes(skel(x)) : words.has(x)));
  if (!found.length) return [];
  const cat = textCategory(text);
  const best = found[0].length;
  const res = [];
  for (const it of index) {
    const hit = found.find((x) => it.models.includes(x));
    if (!hit) continue;
    if (cat && it.cat !== cat) continue;
    let score = 0.78 + (cat ? 0.06 : 0) + (hit.length === best ? 0.03 : 0) + (it.expected ? 0.02 : 0);
    // Không rõ nhóm: ưu tiên thành phẩm (mã không có gạch ngang) hơn linh kiện (KGMB10-A23…)
    if (!cat && (it.sku.includes('-') || !it.cat || it.cat === 'hang-hoa')) score -= 0.08;
    res.push({ ...it, score: Math.min(0.89, score), reason: `${cat ? CONFIG.categories.find((c) => c.key === cat).label + ' + ' : ''}model ${hit}` });
  }
  return res.sort((a, b) => b.score - a.score || b.expected - a.expected).slice(0, limit);
}

// Thêm mã phụ vào 1 mục của chỉ mục (dùng khi app vừa học được mã tem mới)
export function addKey(entry, key) {
  const k = normCode(key);
  if (k.length < 3 || entry.nkeys.includes(k)) return;
  const sk = skel(k);
  entry.nkeys.push(k); entry.skeys.push(sk); entry.bkeys.push([...bigrams(sk)]);
}

// Chuỗi trông giống mã hàng trong văn bản OCR (có cả chữ và số, ≥6 ký tự, không phải serial)
export function codeLike(text) {
  return String(text).toUpperCase().split(/\s+/).map(normCode)
    .filter((w) => w.length >= 6 && /\d/.test(w) && /[A-Z]/.test(w) && !findSerial(w))
    .sort((a, b) => b.length - a.length)[0] || '';
}

export function matchText(text, index, limit = 5) {
  const toks = tokens(text);
  if (!toks.length) return [];
  const stoks = toks.map(skel);
  const btoks = stoks.map(bigrams);
  const res = [];
  for (const it of index) {
    let best = 0;
    it.nkeys.forEach((k, ki) => {
      const sk = it.skeys[ki];
      toks.forEach((t, ti) => {
        let s;
        if (t === k) s = 1;
        else if (stoks[ti] === sk) s = 0.96;
        else if (k.length >= 5 && stoks[ti].includes(sk)) s = 0.93; // mã nằm trong chuỗi dài hơn
        else {
          s = Math.abs(t.length - k.length) <= 3 ? sim(stoks[ti], sk) * 0.95 : 0;
          // Mã nằm lẫn trong chuỗi dài, có lỗi nhận dạng: lọc nhanh bằng cặp ký tự trước khi tính
          if (k.length >= 6 && t.length > k.length) {
            const bk = it.bkeys[ki];
            let hit = 0; for (const g of bk) if (btoks[ti].has(g)) hit++;
            if (hit >= bk.length * 0.5) s = Math.max(s, (1 - semiLev(sk, stoks[ti]) / k.length) * 0.92);
          }
        }
        if (s > best) best = s;
      });
    });
    if (best >= CONFIG.ocr.minScore) res.push({ ...it, score: Math.min(1, best + (it.expected ? 0.02 : 0)) });
  }
  return res.sort((a, b) => b.score - a.score || (b.expected - a.expected)).slice(0, limit);
}

// Mã phụ suy ra từ tên hàng trong ERP: "… model: G89NEW (KMCVG89T5NGY)" → G89NEW, KMCVG89T5NGY.
// Giúp nhận đúng khi tem in tên model thay vì mã hệ thống (VD tem "PREMIUM B10" ↔ mã KMC0B10T1PRD).
export function modelKeys(name) {
  const s = String(name || '');
  const out = [];
  const m = s.match(/model\s*:?\s*([^,(;]+)/i);
  if (m) out.push(m[1]);
  for (const p of s.matchAll(/\(([A-Za-z0-9-]{5,})\)/g)) out.push(p[1]);
  return out.map(normCode).filter((k) => k.length >= 4);
}

// Số serial trên tem dán (VD 302510280211, OYL2604220077): 0–4 chữ cái + ≥9 chữ số.
export function findSerial(text) {
  for (const w of String(text).toUpperCase().split(/\s+/)) {
    const t = w.replace(/[^A-Z0-9]/g, '');
    const m = t.match(/^([A-Z]{0,4})([0-9OIL]{9,15})$/);
    if (m) return m[1] + m[2].replace(/O/g, '0').replace(/[IL]/g, '1');
  }
  return '';
}
