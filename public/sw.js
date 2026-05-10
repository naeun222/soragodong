// 소라고동 V4 — Service Worker
// 사용자 요청 2026-04-29: 오프라인 fallback + Chrome 설치 배너 활성 + Phase C 푸시 인프라 준비.
// 진짜 푸시는 Phase C 백엔드 들어간 후 활성. 현재는 SW 등록 + cache-first 전략만.

// 사용자 보고 2026-04-30: 큰 변경 (E2EE / API 마이그/암호화) 박힐 때마다 v 숫자 올리기.
// activate에서 옛 캐시 자동 삭제 → stale 평문/구조 캐시 노출 차단.
// v3 (2026-04-30 ultrathink): /api/* cache-first 버그 fix — SW 가 GET /api/usage 등을 캐싱해서 잔액 stale 노출되던 critical 버그.
// v4 (2026-05-01 agent audit): E2EE 11 키 sensitiveKeys 추가 / decision 14일 hardcap / 광범위 워딩 정정 / phase 정리. 옛 캐시 stale 차단.
// v5 (2026-05-05 perf ultrathink): HTML 전략 network-first → stale-while-revalidate. 재방문 첫 페인트가 네트워크 RTT 안 기다림 (캐시 즉시) + 백그라운드 fetch → 다음 진입 부터 새 버전. version.txt 는 그대로 fresh.
// v6 (2026-05-06 사용자 보고): 모바일 SW 가 /startlite 옛 broken HTML/이미지 캐시 stuck → cache name 올려서 옛 캐시 강제 invalidate.
// v7 (2026-05-06 사용자 보고: PC OK / 모바일만 사진 X): jsDelivr → same-origin 회귀 + 모바일 SW 가 옛 catch-all rewrite 결과 (HTML 을 PNG 로 캐싱) stuck 가능성 → 또 한번 강제 invalidate.
// v8 (2026-05-06 사용자 보고): 로그인 화면에 옛 이메일/코드 받기 input 칸 stuck — src/빌드 둘 다 이미 제거됐는데 SW 가 옛 index.html cache-first 로 들고 있음. cache name 올려서 강제 invalidate.
// v9 (2026-05-06 사용자 보고): 실행 탭 추적 항목 헤더 버튼 + collapse 변경. PWA 옛 HTML stale-while-revalidate stuck 회피용 강제 invalidate.
// v10 (2026-05-10 사용자 보고): 영상 자르기 modal 안 옛 미리보기 ("미리보기 만드는 중..." + 썸네일 8장) 가 사용자 PWA 캐시에 stuck.
//   src 는 이미 trim modal 미리보기 제거됐는데 SW stale-while-revalidate 때문에 옛 index.html 노출. 강제 invalidate.
// v11 (2026-05-10 사용자 명시): trim modal 의 video preview (controls) 만 복구 (썸네일 strip 은 영구 제거 유지).
// v12 (2026-05-10 사용자 보고): 5 큐 fix — deeper 첫 클릭 잠김 / 결제 modal padding 잔존 / chat-prompt 우회 / 4단 아닌데 proposal chip / 미션 완료 카드 description.
// v13 (2026-05-10 사용자 보고 ultrathink 13큐): 운세 한 문장 + 다양성 / 내가 텍스트 / 통찰 버튼 / 진주 모달 텍스트.
// v14 (2026-05-10 사용자 보고 audit): '나 탭' 갱신 안 됨 — 짧은 챕터 case_analysis filter `>= 6` → `>= 3` 일관 + 시뮬 한마디 라벨.
// v15 (2026-05-10 사용자 보고 ultrathink): _processExtractChapterAnalysis THRESHOLD 0.6→0.5 + 디버그 stash + 진주 AI 정리 input skip.
// v16 (2026-05-10 audit batch 3): pendingBatch stuck 단일 root cause — _runDailyExtractInline `>= 6` → `>= 3` / fail count 3회 timeout / 6h not-ended timeout / fallback 후 홈 카드 갱신.
// v17 (2026-05-10 진단): _diagnoseExtract 함수 — 강제 회복 후에도 안 되는 케이스 console 진단.
// v18 (2026-05-10 root cause 확정): extractChapterCaseAnalysis boolean return / fail 시 _pendingExtract 보존 / _runReviewExtractInline 으로 weekly 강제.
// v19 (2026-05-10 진단 결과 확정): 큰 챕터 응답 truncation fix (max_tokens 1500→3000 + partial JSON repair) / quiz source 통째 제거.
// v20 (2026-05-10 weekly weekKey + 128 msgs): weekly weekKey cutoffEnd 기준 (W19 mismatch fix) / max_tokens 3000→4000.
const CACHE_NAME = 'soragodong-v4-cache-v20';
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

  // 사용자 보고 2026-04-30 ultrathink (CRITICAL): /api/* 는 캐시 절대 X — 인증·잔액·사용량 실시간 데이터.
  // 옛 버그: GET /api/usage 응답 SW 캐시 → 잔액 갱신 시 stale 데이터 (1$ 고정) 노출.
  // 추가 bonus: Authorization header 무시한 SW 캐시 = cross-user 데이터 누수 risk 도 차단.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(req));
    return;
  }

  // HTML 문서는 stale-while-revalidate (사용자 명시 2026-05-05 perf ultrathink):
  // 1) 캐시 있으면 즉시 반환 (첫 페인트 = 디스크 속도, 네트워크 RTT 안 기다림).
  // 2) 백그라운드로 fetch → 캐시 갱신 (다음 진입부터 새 버전).
  // 3) 캐시 없으면 네트워크 fallback.
  // 새 버전 감지·자동 reload 는 클라이언트 32-billing/19-app-version-banner.js (version.txt 폴링) 가 담당.
  // 사용자 보고 2026-04-30 review (agent P2-2): 5xx 응답도 cache.put 했음 → 옛 좋은 캐시 덮음. ok 상태만 캐시.
  const isHTML = req.headers.get('accept')?.includes('text/html')
    || url.pathname === '/' || url.pathname.endsWith('.html');
  if (isHTML) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const networkPromise = fetch(req)
          .then((resp) => {
            if (resp && resp.ok) {
              const respClone = resp.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, respClone)).catch(() => {});
            }
            return resp;
          })
          .catch(() => null);
        if (cached) {
          // 캐시 즉시 반환 + 백그라운드 갱신 (revalidate)
          networkPromise.catch(() => {});
          return cached;
        }
        // 캐시 X — 네트워크 결과 기다림, 그것도 실패면 index.html fallback
        return networkPromise.then((resp) => resp || caches.match('./index.html'));
      })
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
