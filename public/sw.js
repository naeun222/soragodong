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
// v21 (2026-05-10 batch 5 mass): weekly 가드 + yesterdayCard chatArchive / review-archive weekly hide / model 시뮬 filter / raw 100턴 / 시뮬→대화 + isSimulation 격리.
// v22 (2026-05-10 batch 6 큐 7+8 main): weekly 카드 inline 펼침 + 4 섹션 (MOMENTUM / 장면 / 흐름 / 부드러운 알림). 옛 schema 매핑.
// v23 (2026-05-10 batch 7): weekly schema 4 섹션만 출력 / monthly+ 추적 항목 inject / 시뮬 챕터 별도 추출 path.
// v24 (2026-05-10 batch 8): autoBackup chatArchive messages + 큰 dataURL 제외 (Supabase statement timeout fix) / quarterly 추적 항목 inject.
// v25 (2026-05-10 batch 9): main row size monitoring (4MB+ 알림) / saveReview + batch path weekly 신 schema 4 섹션만 store.
// v26 (2026-05-10 batch 10): cutoffEnd ReferenceError fix / autoBackup 옛 snapshots lazy sanitize / extractChapter max_tokens 동적.
// v27 (2026-05-10 402 진단): extractChapter 의 402 reason 본문 로깅.
// v28 (2026-05-10 admin 무한 plan): backend checkBudget + Opus 가드 admin (env.ADMIN_USER_ID) 우회.
// v29 (2026-05-10 audit-backend fix): is_deeper_analysis client hint 폐기 / askDeeper 별도 endpoint analyze_4stage / admin chargeUsage skip.
// v30 (2026-05-10 audit-billing fix + 사용자 보고): 시뮬 system prompt 격리 (큐 11 정정) + system prompt traits/values/patterns 의 simulation 항목 hide / sim continue 더블클릭 가드.
// v31 (2026-05-10 batch 11): 5 카드 (어제 기록 / weekly / monthly / quarterly / annual review) 회전 카드 source 흡수. ADMIN_USER_ID 정식 타입. 게스트 force-analyze Sonnet fallback.
// v32 (2026-05-10 batch 12): 시뮬 격리 메시지 단위 — 챕터 안 시뮬/일반 혼재 분리 추출. review/miniReview/topic isSimulationContext 필터. archive UI ✨ 라벨.
// v33 (2026-05-10 batch 13 잔여 audit 4건): autoBackup 복원 알림 / refund tier_upgrade 비례 / chat messages 크기 상한 / account delete auth 명시 응답.
// v34 (2026-05-10 큐 11 재정정 토론 프레임 UX): system prompt 시뮬 가드 톤 = 토론 톤 + archive UI badge = '💭 토론한 시나리오'. 격리 (cf X) 는 유지.
// v35 (2026-05-10 옵션 A): 나 탭 '🧹 정리' 버튼 (설정 왼쪽 작게). 사용자 컨펌 dedup — AI 호출 X. similarity 0.7+ 후보 페어 한 개씩 [합치기/놔두기].
// v36 (2026-05-10 검증 결과 fix): 시뮬 가드 강화 (구체 X-list) / 회전 카드 우선순위 재정의 (review 1-4, 그 외 동급) / unconfirmed 우선 폐기 / chat 시나리오 토론 스티커.
// v37 (2026-05-10): weekly schema 확장 (momentum_line + cycles + 활력기분 차트 inline) / review id backfill (월간 '리뷰 못 찾음' fix) / 테스트 계정 자동 설정.
// v38 (2026-05-10): 시뮬 topicCard 'source: simulation' 마킹 + 도서관 일기·대화 chip 의 day modal '💭 시나리오' 라벨 표시.
// v39 (2026-05-10): _forceWeeklyReview() 명령어 + 통합 분석 (cf 5차원) 정렬 — 새 내용 (미컨펌 + 최근) 먼저.
// v40 (2026-05-10): 주간 리뷰 inline 펼침 안 '🗑 삭제' 버튼. 기존 deleteReview() 재사용.
// v41 (2026-05-10): generateReviewArchiveMetaSummary key fallback (옛 id 누락 review 도 weekKey/monthKey/quarterKey 매칭) + button onclick fallback + backfill 후 renderArchiveReviews 호출.
// v42 (2026-05-10 ultrathink): _collectReviewData('weekly') cutoffEnd = 이번 일요일 04:00 강제 (4AM 이전/이후 무관). 옛 일요일 4AM 이전 진입 시 저번 주 (W18) 데이터 가져오던 버그 fix.
// v43 (2026-05-10 ultrathink REAL ROOT CAUSE): KST timezone shift fix (toISOString = UTC 변환 → 04:00 KST = 19:00 UTC 전날 → 1일 앞당겨짐) + AI 통찰 요약 버튼 → quote 직접 DOM 교체.
// v44 (2026-05-10): 회전 카드 weekly source click → showArchiveReviews() 으로 '리뷰 모음' 직진 + 카드 inline 펼침 / _forceWeeklyReview 가 push 후 auto:false (사용자 manual) / monthly cutoff = 이번 달 메커니즘 일관.
// v45 (2026-05-10 메커니즘 일관 batch 14): 사용자 click 흐름 = quarterly current quarter / annual current year (자동 batch = 끝난 사이클 prev 그대로). _build* prompt 에 quarterKey/year idempotent skip 추가.
// v46 (2026-05-11 사용자 보고): 회전 카드 godongDiary source 의 godong-sleepy.svg 가 옛 캐시 stuck.
//   character/ 폴더 신규 디자인 = public/character/ byte-identical 로 배포됨에도 PWA cache-first 가 옛 SVG 노출.
//   SVG 자산 변경 시 강제 invalidate.
// v47 (2026-05-11): character/ 21개 SVG 새 디자인 → public/character/ 일괄 교체. 옛 캐시 강제 invalidate.
const CACHE_NAME = 'soragodong-v4-cache-v47';
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
