// Service Worker
// 전략:
//  - HTML 네비게이션 요청 → network-first (오프라인 시 캐시 폴백)
//    → iOS PWA가 stale HTML 잡고 있는 문제 방지
//  - 정적 자산 (JS/CSS/이미지) → stale-while-revalidate
//  - API/Supabase/Anthropic → 항상 네트워크 패스스루
//  - 업데이트는 즉시 활성화 (skipWaiting + clients.claim)
const CACHE_VERSION = 'sq-v9-nanum-myeongjo';
const STATIC_ASSETS = [
  '/assets/login.js',
  '/assets/dashboard.js',
  '/assets/library.js',
  '/assets/quiz.js',
  '/assets/supabase-client.js',
  '/assets/auth-utils.js',
  '/assets/pwa.js',
  '/m/assets/m-app.js',
  '/m/icons/icon.svg',
  '/m/icons/icon-book-192.png',
  '/m/icons/icon-book-512.png',
  '/m/icons/apple-touch-icon-book.png',
  '/manifest.webmanifest',
  '/manifest-admin.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      // 미리 캐시 (실패해도 install 계속)
      await Promise.all(
        STATIC_ASSETS.map((url) => cache.add(url).catch(() => {}))
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      );
      await self.clients.claim();
      // 모든 열린 클라이언트에게 "갱신됨" 알림
      const clientsList = await self.clients.matchAll({ type: 'window' });
      clientsList.forEach((c) => c.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION }));
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // API / Supabase / Anthropic → 절대 캐시 안 함
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase') ||
    url.hostname.includes('anthropic')
  ) {
    return;
  }

  // HTML 네비게이션 요청 → network-first
  const isNavigation = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');
  if (isNavigation) {
    event.respondWith(networkFirst(req));
    return;
  }

  // 그 외 정적 자산 → stale-while-revalidate
  event.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(req) {
  try {
    const fresh = await fetch(req, { cache: 'no-store' });
    // 성공 시 백그라운드로 캐시 업데이트 (오프라인 폴백용)
    if (fresh && fresh.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(req, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch {
    // 네트워크 실패 — 캐시 폴백
    const cached = await caches.match(req);
    if (cached) return cached;
    // 그것도 없으면 index 폴백
    if (req.url.includes('/m/')) {
      const mIndex = await caches.match('/m/index.html');
      if (mIndex) return mIndex;
    }
    return caches.match('/index.html');
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(req);
  const networkPromise = fetch(req).then((res) => {
    if (res && res.status === 200 && res.type === 'basic') {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  }).catch(() => null);
  return cached || (await networkPromise) || new Response('', { status: 504 });
}
