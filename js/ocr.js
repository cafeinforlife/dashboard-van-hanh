// Camera + nhận diện mã hàng bằng OCR (Tesseract.js chạy ngay trên điện thoại, không tốn phí API)
import { CONFIG } from './config.js';
import { normCode } from './util.js';

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
  async torch(on) { try { await this.track.applyConstraints({ advanced: [{ torch: on }] }); return true; } catch { return false; } }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null; this.track = null;
    if (this.video) this.video.srcObject = null;
  }

  // Cắt vùng khung ngắm (tỉ lệ theo khung hiển thị) và tiền xử lý ảnh
  capture(box = { x: 0.08, y: 0.36, w: 0.84, h: 0.28 }) {
    const v = this.video;
    const vw = v.videoWidth, vh = v.videoHeight;
    if (!vw) return null;
    // Video hiển thị kiểu object-fit: cover → quy đổi vùng nhìn thấy sang tọa độ thật
    const el = v.getBoundingClientRect();
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
    preprocess(ctx, c.width, c.height);
    return c;
  }
}

// Xám hóa → kéo giãn tương phản → nhị phân hóa Otsu (tự đảo màu nếu chữ sáng trên nền tối)
export function preprocess(ctx, w, h) {
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
  let dark = 0; for (let j = 0; j < gray.length; j++) if (gray[j] < thr) dark++;
  const invert = dark > gray.length / 2; // đa số pixel tối → nền tối, chữ sáng
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    let b = gray[j] < thr ? 0 : 255;
    if (invert) b = 255 - b;
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
    const w = await window.Tesseract.createWorker('eng', 1, {
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
    return { ...e, nkeys: keys, skeys: keys.map(skel) };
  });
}

export function matchText(text, index, limit = 5) {
  const toks = tokens(text);
  if (!toks.length) return [];
  const stoks = toks.map(skel);
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
        else if (Math.abs(t.length - k.length) <= 3) s = sim(stoks[ti], sk) * 0.95;
        else s = 0;
        if (s > best) best = s;
      });
    });
    if (best >= CONFIG.ocr.minScore) res.push({ ...it, score: Math.min(1, best + (it.expected ? 0.02 : 0)) });
  }
  return res.sort((a, b) => b.score - a.score || (b.expected - a.expected)).slice(0, limit);
}
