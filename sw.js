// Service worker: ưu tiên mạng (luôn lấy bản mới nhất), mất mạng thì dùng bản đã lưu.
const CACHE = 'kiemke-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET' || request.url.includes('script.google')) return;
  e.respondWith(
    fetch(request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(request, copy)); }
      return res;
    }).catch(() => caches.match(request))
  );
});
