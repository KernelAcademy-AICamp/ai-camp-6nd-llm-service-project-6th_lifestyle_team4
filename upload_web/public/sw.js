// Service Worker — 정적 자산 캐시 + 오프라인 폴백
// 캐시 버전은 배포 때마다 올려야 새 파일이 적용됩니다.
const CACHE_VERSION = 'sq-v6-book-icon';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/library.html',
  '/quiz.html',
  '/m/',
  '/m/index.html',
  '/m/assets/m-app.js',
  '/m/icons/icon.svg',
  '/m/icons/icon-192.png',
  '/m/icons/icon-512.png',
  '/m/icons/apple-touch-icon.png',
  '/assets/login.js',
  '/assets/dashboard.js',
  '/assets/library.js',
  '/assets/quiz.js',
  '/assets/supabase-client.js',
  '/assets/auth-utils.js',
  '/assets/pwa.js',
  '/manifest.webmanifest',
  '/manifest-admin.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Supabase / Anthropic API / Vercel functions — 항상 네트워크
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase') ||
    url.hostname.includes('anthropic')
  ) {
    return; // 기본 네트워크 처리에 맡김
  }

  // 정적 자산: cache-first, miss 시 네트워크 후 캐시
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => {
          // 오프라인이고 캐시도 없을 때 — HTML 요청은 index 폴백
          if (req.headers.get('accept')?.includes('text/html')) {
            return caches.match('/index.html');
          }
        });
    })
  );
});
