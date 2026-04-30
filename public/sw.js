// 소라고동 V4 — Service Worker
// 사용자 요청 2026-04-29: 오프라인 fallback + Chrome 설치 배너 활성 + Phase C 푸시 인프라 준비.
// 진짜 푸시는 Phase C 백엔드 박힌 후 활성. 현재는 SW 등록 + cache-first 전략만.

// 사용자 보고 2026-04-30: 큰 변경 (E2EE / API 마이그/암호화) 박힐 때마다 v 숫자 올리기.
// activate에서 옛 캐시 자동 삭제 → stale 평문/구조 캐시 노출 차단.
const CACHE_NAME = 'soragodong-v4-cache-v2';
const PRECACHE_URLS = [
  './',
  './index.html',
  './icon-192.png',
  './icon-512.png',
  './icon-180.png'
];

// install — 핵심 자원 미리 캐싱
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => null))
      .then(() => self.skipWaiting())
  );
});

// activate — 옛 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// fetch — network-first for HTML (always fresh), cache-first for assets
self.addEventListener('fetch', (event) => {
  const req = event.request;
  // GET만 다룸 (POST 등은 통과)
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Anthropic / Supabase / iTunes / 기타 외부 API는 캐시 X — pass-through
  if (url.origin !== self.location.origin) return;

  // version.txt는 항상 fresh (배포 감지)
  if (url.pathname.endsWith('/version.txt')) {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // HTML 문서는 network-first (최신 우선, 오프라인 시 캐시 fallback)
  const isHTML = req.headers.get('accept')?.includes('text/html')
    || url.pathname === '/' || url.pathname.endsWith('.html');
  if (isHTML) {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          // 성공 시 캐시 갱신.
          // 사용자 보고 2026-04-30 review (agent P2-2): 5xx 응답도 cache.put 했음 → 옛 좋은 캐시 덮음. ok 상태만 캐시.
          if (resp && resp.ok) {
            const respClone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, respClone)).catch(() => {});
          }
          return resp;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  // 정적 자원 (icon, png, css, js) — cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const respClone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, respClone)).catch(() => {});
        }
        return resp;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

// 사용자 요청 2026-04-29: Phase C 시점에 push event handler 활성 예정.
// self.addEventListener('push', (event) => { ... });
// self.addEventListener('notificationclick', (event) => { ... });
