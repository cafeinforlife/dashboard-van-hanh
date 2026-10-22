// Service worker: cài sẵn toàn bộ app + thư viện nhận diện để dùng khi mất mạng.
// - vendor/, data/, assets/: lấy từ bộ nhớ đệm trước (ít thay đổi)
// - còn lại: ưu tiên mạng (luôn bản mới nhất), mất mạng thì dùng bản đã lưu
const CACHE = 'kiemke-v4';
const PRECACHE = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/config.js', 'js/io.js', 'js/ocr.js', 'js/store.js', 'js/theme.js', 'js/util.js',
  'data/locations.json', 'data/items.json', 'data/staff.json',
  'vendor/xlsx.full.min.js', 'vendor/tesseract.min.js', 'vendor/worker.min.js',
  'vendor/core/tesseract-core-simd-lstm.wasm.js', 'vendor/core/tesseract-core-lstm.wasm.js', 'vendor/lang/eng.traineddata.gz',
  'assets/icon.svg', 'assets/logo-kingsport.svg', 'assets/logo-kingsport-dark.svg', 'assets/logo-xedienmove.png',
  'assets/logo-dongduong.svg', 'assets/logo-dongduong-icon.svg',
  'assets/icons/xe-dien.png', 'assets/icons/ghe-massage.png', 'assets/icons/may-chay-bo.png', 'assets/icons/xe-dap-tap.png',
  'assets/icons/sung-massage.png', 'assets/icons/thiet-bi-y-te.svg', 'assets/icons/qua-tang.svg', 'assets/icons/hang-hoa.svg',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET' || request.url.includes('script.google') || request.url.includes('docs.google')) return;
  const url = new URL(request.url);
  const stable = url.origin === location.origin && /\/(vendor|data|assets)\//.test(url.pathname);
  if (stable) {
    e.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(request, copy)); }
      return res;
    })));
    return;
  }
  e.respondWith(
    fetch(request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(request, copy)); }
      return res;
    }).catch(() => caches.match(request, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html')))
  );
});
