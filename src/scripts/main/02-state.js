// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// V4: 데이터 분리 (V3 prod와 완전 분리)
// ───────────────────────────────────────────────────────────────
// 같은 auth_user_id 안에서 user_id 컬럼으로 V3/V4 구분.
// V3은 user_id=email, V4는 user_id='me_v4'. localStorage 키도 분리.
// V4 prod URL은 'me_v4' row만 읽고 씀 → V3 데이터(`me`)는 영원히 안전.
// ═══════════════════════════════════════════════════════════════
// 사용자 요청 2026-04-29: Phase C swap point — Anthropic API 호출 통합 helper.
// 사용자 요청 2026-04-30 (Phase C 활성): fetch interceptor로 자동 swap.
// state.apiKey 들어가 있으면 → 직접 Anthropic 호출 (사용자 본인 키 결제)
// state.apiKey 비어있고 session 활성이면 → /api/chat 백엔드 프록시 (앱 결제 모델)
// 모든 28개 LLM call 위치 자동 redirect — 코드 변경 X.
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// V4 fix (사용자 보고 2026-05-18 ultrathink) — 카카오 로그인 후 빈 화면 stuck root cause 방어.
//   모든 supabase fetch 가 timeout 없이 hang 가능 → init() 가 await 에서 영구 대기 →
//   _hideBootSplash 7s 안전망만 splash 사라지고 .app / loginScreen 둘 다 display:none 유지 → blank.
//   ec3cc79 의 init().catch 는 reject 만 잡지 hang 은 X. 이 wrapper 가 12s 후 강제 abort → reject → catch fallback.
// 사용 패턴: supabase / 인증 / cloud sync 같은 짧은 RTT REST 호출만. 챗 streaming 같은 long fetch 에는 X.
async function _fetchWithTimeout(url, init, timeoutMs) {
  const ms = (typeof timeoutMs === 'number' && timeoutMs > 0) ? timeoutMs : 12000;
  const ac = new AbortController();
  const orig = init && init.signal;
  if (orig) {
    if (orig.aborted) ac.abort();
    else { try { orig.addEventListener('abort', () => ac.abort(), { once: true }); } catch {} }
  }
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...(init || {}), signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

// 사용자 보고 2026-04-30 ultrathink-2: 401 시 session 자동 refresh + retry helper.
// JWT 만료 (1h) 도중 AI call 시 401 발생 → 자동 refresh + 한 번 retry → 사용자에게 안 보이게.
let _sessionRefreshInflight = null;
async function _refreshSessionForApi() {
  if (!session || !session.refresh_token) return false;
  if (_sessionRefreshInflight) return _sessionRefreshInflight;
  _sessionRefreshInflight = (async () => {
    // V4 fix (사용자 보고 2026-05-18 ultrathink) — refresh token fetch 도 timeout. interceptor 우회 위해 _anthropicOrigFetch 유지 + inline AbortController.
    const _ac = new AbortController();
    const _t = setTimeout(() => _ac.abort(), 10000);
    try {
      const r = await window._anthropicOrigFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
        signal: _ac.signal
      });
      clearTimeout(_t);
      if (!r.ok) return false;
      const ns = await r.json();
      if (!ns || !ns.access_token) return false;
      session = { ...session, access_token: ns.access_token, refresh_token: ns.refresh_token || session.refresh_token, user: ns.user || session.user };
      if (ns.user && ns.user.id) authUserId = ns.user.id;
      try { localStorage.setItem('soragodong_session', JSON.stringify(session)); } catch {}
      return true;
    } catch { return false; }
    finally {
      clearTimeout(_t);
      // 사용자 명시 2026-05-01 (agent audit): setTimeout 100ms race window 제거 — try/finally 즉시 nullify.
      _sessionRefreshInflight = null;
    }
  })();
  return _sessionRefreshInflight;
}

// 사용자 명시 2026-05-01 (agent audit): 모든 /api/* 호출 공통 wrapper. 401 자동 refresh + 1회 retry.
// 이전 = interceptor (line 9750~) 가 ANTHROPIC_API_URL swap 만 → /api/billing /api/admin /api/feedback 등 25곳 401 시 사용자 alert.
async function _authedFetch(url, init) {
  init = Object.assign({}, init || {});
  init.headers = Object.assign({}, init.headers || {});
  if (typeof session !== 'undefined' && session && session.access_token && !init.headers['Authorization']) {
    init.headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  // V4 fix (사용자 보고 2026-05-18 ultrathink) — timeout wrapper. supabase 정지 시 fetch hang → 빈 화면 stuck root cause.
  let resp = await _fetchWithTimeout(url, init);
  if (resp.status === 401 && typeof _refreshSessionForApi === 'function') {
    const refreshed = await _refreshSessionForApi();
    if (refreshed && session && session.access_token) {
      init.headers['Authorization'] = `Bearer ${session.access_token}`;
      resp = await _fetchWithTimeout(url, init);
    }
  }
  return resp;
}

// 사용자 보고 2026-05-05: 5xx + network 1회 자동 재시도 (1.5s backoff). saveToCloudNow / 다른 idempotent fetch 에서 사용.
// 이전 = "자동 재시도" 토스트 띄우면서 실제 재시도 코드 X (거짓 메시지) → 진짜 재시도로 회복.
// V4 fix (사용자 보고 2026-05-18) — 401 자동 refresh 누락 → "인증 만료" 토스트 매 cold start 마다 fire 했던 버그 fix.
//   saveToCloudNow 가 이 헬퍼 쓰는데 옛 path 는 5xx + network 만 처리, 401 은 _handleCloudSyncResponse 가 토스트로 던짐.
//   fix: 401 받으면 _refreshSessionForApi 한 번 시도 → 성공 시 Authorization 헤더 갱신 + retry.
//   refresh 후에도 401 = 진짜 stale refresh_token → 토스트 정상 (그땐 사용자가 새로고침해야 맞음).
async function _fetchWithRetry5xx(url, init) {
  let resp;
  // V4 fix (사용자 보고 2026-05-18 ultrathink) — fetch 4곳 모두 _fetchWithTimeout 으로. timeout abort 도 catch 가 잡아 1.5s 후 retry.
  try {
    resp = await _fetchWithTimeout(url, init);
  } catch (e) {
    await new Promise(r => setTimeout(r, 1500));
    try { resp = await _fetchWithTimeout(url, init); } catch { throw e; }
  }
  if (resp.status === 401 && typeof _refreshSessionForApi === 'function') {
    const refreshed = await _refreshSessionForApi();
    if (refreshed && typeof session !== 'undefined' && session && session.access_token && init && init.headers) {
      // 헤더 객체 / Headers 인스턴스 / array 셋 다 대응 — Authorization 만 새 토큰으로 교체.
      try {
        if (init.headers instanceof Headers) {
          init.headers.set('Authorization', `Bearer ${session.access_token}`);
          init.headers.set('apikey', SUPABASE_ANON_KEY);
        } else if (Array.isArray(init.headers)) {
          init.headers = init.headers.filter(([k]) => k.toLowerCase() !== 'authorization');
          init.headers.push(['Authorization', `Bearer ${session.access_token}`]);
        } else {
          init.headers = { ...init.headers, 'Authorization': `Bearer ${session.access_token}` };
        }
      } catch (e) { console.warn('[fetchWithRetry5xx] header rewrite', e); }
      try { return await _fetchWithTimeout(url, init); } catch { return resp; }
    }
  }
  if (resp.status >= 500 && resp.status < 600) {
    await new Promise(r => setTimeout(r, 1500));
    try { return await _fetchWithTimeout(url, init); } catch { return resp; }
  }
  return resp;
}

(function installAnthropicProxyInterceptor() {
  if (typeof window === 'undefined') return;
  if (window._anthropicProxyInstalled) return;
  window._anthropicProxyInstalled = true;
  const _origFetch = window.fetch.bind(window);
  window._anthropicOrigFetch = _origFetch;  // refresh helper에서 무한 인터셉트 안 걸리게
  window.fetch = async function(input, init) {
    const url = (typeof input === 'string') ? input : (input && input.url) || '';
    if (url !== ANTHROPIC_API_URL) return _origFetch(input, init);
    // V4 (사용자 보고 2026-05-11 ultrathink): BYOK 모드 영구 비활성.
    //   옛 분기 = state.apiKey 있으면 직접 anthropic.com 호출. 단 Phase C 이후 'anthropic-dangerous-direct-browser-access' 헤더 제거 →
    //   직접 호출 시 무조건 CORS block. state.apiKey 가 어떤 이유로든 set 되면 chat 전체 fail.
    //   → 분기 제거. 항상 backend /api/chat proxy 사용. state.apiKey 잔존해도 무시.
    // session 없으면 그대로 (오류 발생 → 사용자에게 표시)
    if (typeof session === 'undefined' || !session || !session.access_token) {
      return _origFetch(input, init);
    }
    // 백엔드 프록시로 swap
    const buildHeaders = () => {
      let headers = {};
      if (init && init.headers) {
        if (init.headers instanceof Headers) {
          init.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
        } else if (Array.isArray(init.headers)) {
          init.headers.forEach(([k, v]) => { headers[k.toLowerCase()] = v; });
        } else {
          Object.keys(init.headers).forEach(k => { headers[k.toLowerCase()] = init.headers[k]; });
        }
      }
      delete headers['x-api-key'];
      delete headers['anthropic-version'];
      delete headers['anthropic-dangerous-direct-browser-access'];
      headers['authorization'] = 'Bearer ' + session.access_token;
      headers['content-type'] = 'application/json';
      return headers;
    };
    // 사용자 명시 2026-05-05 (Phase 1): 게스트 = Turnstile 토큰 발급 후 헤더 X-Turnstile-Token 으로 chat 호출.
    // 토큰 = single-use, 5분 유효. 매 chat 호출마다 새로 발급.
    let _turnstileToken = null;
    if (state && state.isGuest && typeof getTurnstileToken === 'function') {
      try {
        _turnstileToken = await getTurnstileToken();
      } catch (e) {
        console.warn('[turnstile] 토큰 발급 실패:', e);
        // 토큰 없으면 backend 가 403 TURNSTILE_FAIL 반환 → 사용자에게 새로고침 안내.
      }
    }
    const _withTurnstile = (h) => {
      if (_turnstileToken) h['x-turnstile-token'] = _turnstileToken;
      return h;
    };
    let resp = await _origFetch('/api/chat', Object.assign({}, init || {}, { headers: _withTurnstile(buildHeaders()) }));
    // 사용자 보고 2026-04-30 ultrathink-2: 401 시 session refresh + 한 번 retry
    if (resp.status === 401 && session && session.refresh_token) {
      const refreshed = await _refreshSessionForApi();
      if (refreshed) {
        // retry 시 Turnstile 토큰 재발급 (이전 토큰 단일사용 소진)
        if (state && state.isGuest && typeof getTurnstileToken === 'function') {
          try { _turnstileToken = await getTurnstileToken(); } catch {}
        }
        resp = await _origFetch('/api/chat', Object.assign({}, init || {}, { headers: _withTurnstile(buildHeaders()) }));
      }
    }
    return resp;
  };
})();
// 사용자 명시 2026-05-01 (agent audit): Phase C 후 'x-api-key' 헤더는 interceptor (line 9750~) 가 즉시 strip.
// state.apiKey 영구 wipe (마이그레이션 13276) 라 항상 빈 문자열. 헤더 자리 단순화 — 명확성.
// 사용자 보고 2026-05-05 (audit Low): 'anthropic-dangerous-direct-browser-access' 헤더 제거 — Phase C 이후 직접 브라우저 호출 X (interceptor 가 /api/chat 으로 swap), 백엔드 프록시 경로엔 strip 됨. 코드 혼란 야기 → 제거.
function _anthropicHeaders(extraHeaders) {
  return Object.assign({
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01'
  }, extraHeaders || {});
}
// 사용자 보고 2026-05-05 ultrathink: 5xx 또는 network throw 시 1회 자동 재시도 (1.5s backoff).
// /api/chat 프록시 cold start / Anthropic 일시 과부하 (overloaded_error) 케이스 user-facing "AI 서버 일시 과부하" 토스트 빈도 ↓.
// stream 응답이라도 status 5xx 는 stream 시작 전이라 안전하게 재요청 가능. opts._noRetry=true 시 비활성.
// Backend (functions/api/chat.ts) 도 자체 1회 재시도 — 총 최대 4회 시도 (backend 2 + client 2). 일반 케이스 1-2회 안 회복.
async function callAnthropic(body, options) {
  const opts = options || {};
  const init = {
    method: 'POST',
    headers: _anthropicHeaders(opts.extraHeaders),
    body: typeof body === 'string' ? body : JSON.stringify(body),
    signal: opts.signal
  };
  let resp;
  try {
    resp = await fetch(ANTHROPIC_API_URL, init);
  } catch (e) {
    if (opts._noRetry) throw e;
    console.warn('[callAnthropic] network throw — 1.5s 후 재시도:', e && e.message);
    await new Promise(r => setTimeout(r, 1500));
    return fetch(ANTHROPIC_API_URL, init);
  }
  if (!opts._noRetry && resp.status >= 500 && resp.status < 600) {
    console.warn(`[callAnthropic] ${resp.status} — 1.5s 후 1회 재시도`);
    await new Promise(r => setTimeout(r, 1500));
    try {
      const retry = await fetch(ANTHROPIC_API_URL, init);
      if (retry.status >= 500) console.warn(`[callAnthropic] retry 도 ${retry.status}`);
      return retry;
    } catch (e) {
      console.warn('[callAnthropic] retry throw:', e && e.message);
      return resp;
    }
  }
  return resp;
}

// 사용자 보고 2026-04-30 (Phase C 전수 조사 fix): AI 호출 가능 여부 헬퍼.
// 개인 apiKey 비웠을 때도 session 활성이면 백엔드 프록시로 동작 가능 → fetch interceptor가 자동 라우팅.
// 모든 'if (state.apiKey)' 게이트를 이 헬퍼로 교체 — 한 곳에서 통제.
function _canAI() {
  if (typeof state === 'undefined' || !state) return false;
  if (state.apiKey) return true;
  if (typeof session !== 'undefined' && session && session.access_token) return true;
  return false;
}

// 사용자 요청 2026-04-30: admin 헬퍼. Soragodong (jade6679@naver.com) 전용 UI 노출 조건.
// 백엔드 admin endpoint은 server-side ADMIN_USER_ID env로 강제 검증 — 이 클라이언트 헬퍼는 UI 숨김 용도일 뿐.
// 사용자 보고 2026-04-30 review (agent P0-4): email 비교는 console 우회 가능 (session.user.email 직접 변경). UID 비교로 강화.
// UID 가 클라이언트에 hardcoded 노출되어도 OK — 서버는 별도 ADMIN_USER_ID env 검증, 이 헬퍼는 UI 노출 분기일 뿐.
const ADMIN_EMAIL = 'jade6679@naver.com';
const ADMIN_UID = '4ba0a92e-7f79-45ec-8c48-b339d259382e';
function _isAdmin() {
  if (typeof session === 'undefined' || !session || !session.user) return false;
  if (session.user.id !== ADMIN_UID) return false;
  // V4 (사용자 명시 2026-05-13): 어드민 overlay 잠시 끄기 (Plus 구독 관리 화면 등 *일반 사용자 시각* 으로 보기).
  //   state.preferences._adminOff=true 면 일반 사용자처럼 동작 — settings 의 admin 분기 / dev tool / 자동 분석 skip 등 모두 off.
  //   토글: `toggleAdminOverlay()` console 명령 (또는 별도 버튼 추가 가능).
  if (typeof state !== 'undefined' && state && state.preferences && state.preferences._adminOff) return false;
  return true;
}

// V4 (사용자 명시 2026-05-13): 어드민 overlay 토글 — 일반 사용자 시각 디버깅용.
//   `toggleAdminOverlay()` console 호출 → state.preferences._adminOff 토글 + 화면 갱신.
//   UID 검증은 진짜 admin 만 토글 가능 (overlay off 상태에서도). _isAdmin() 의 caching 우회 위해 raw UID 비교.
function toggleAdminOverlay() {
  if (typeof session === 'undefined' || !session?.user || session.user.id !== ADMIN_UID) {
    if (typeof showToast === 'function') showToast('어드민 계정만');
    return;
  }
  state.preferences = state.preferences || {};
  const next = !state.preferences._adminOff;
  state.preferences._adminOff = next;
  try { saveState(); } catch {}
  if (typeof showToast === 'function') {
    showToast(next ? '🧑 일반 사용자 모드 — 어드민 overlay off' : '🛡️ 어드민 overlay 복귀');
  }
  // 즉시 화면 반영 — billing status / dev tool 표시 등 갱신.
  if (typeof refreshBillingStatus === 'function') {
    try { refreshBillingStatus(true); } catch {}
  }
  // settings 화면이 열려 있으면 dev tool 가시성도 재계산.
  const devSection = document.getElementById('devToolsSection');
  if (devSection) devSection.style.display = _isAdmin() ? 'block' : 'none';
}

const V4_USER_ID = 'me_v4';
const V4_BACKUP_USER_ID = 'backup_v6_pre_v7';  // V3→V4 마이그레이션 1회 백업
const V4_TESTER_BACKUP_USER_ID = 'me_v4_backup';  // testerMode ON 시점 cloud 백업 (사용자 요청 2026-04-28)
const V4_AUTO_BACKUP_USER_ID = 'me_v4_auto_backup';  // 주 1회 + APP_VERSION 변경 시 자동 백업 (rolling 5개) (사용자 요청 2026-04-28)
// 사용자 요청 2026-04-29: 수동 클라우드 백업 (rolling 10개) — 사용자가 명시적으로 적용하는 체크포인트
const V4_MANUAL_BACKUP_USER_ID = 'me_v4_manual_backup';
const MANUAL_BACKUP_KEEP_N = 10;
const AUTO_BACKUP_KEEP_N = 5;
const AUTO_BACKUP_INTERVAL_MS = 7 * 86400000;  // 7일
const V4_LOCAL_STORAGE_KEY = 'soragodong_v4';
const V4_LAST_USER_KEY = 'soragodong_v4_last_user_id';
// 사용자 명시 2026-05-06: 게스트 → 로그인 자동 이주. 게스트가 '카카오로 시작' 클릭 시
// state snapshot 저장 → 새 uid 로 로그인 후 loadFromCloud 끝에서 자동 머지.
const V4_GUEST_MIGRATE_KEY = 'soragodong_v4_guest_migrate_snapshot';
const V4_GUEST_MIGRATE_BACKUP_USER_ID = 'me_v4_pre_guest_merge';  // 머지 직전 cloud 백업 (롤백용)
const V4_GUEST_MIGRATE_TTL_MS = 30 * 86400000;  // 30일

const DEFAULT_STATE = {
  // 사용자 명시 2026-05-05 ultrathink (Phase 1): 게스트 모드 (Supabase anonymous) 사용자 마커.
  // signInAnonymouslyForGuest 후 true. linkIdentity (가입 전환) 후 false.
  // saveToCloudNow / loadFromCloud 분기 + Turnstile 토큰 발급 트리거.
  isGuest: false,
  // Phase 1
  entries: [],
  chatMessages: [],
  traits: [],
  values: [],
  patterns: [],
  // V4: 8 차원 (V3 problems/mechanisms/strengths + goals/growth 신규).
  // unverified는 미컨펌 텍스트 풀 — 자동 추출 결과는 여기로, 사용자 확인하면 실제 배열로.
  caseFormulation: {
    version: 0, lastUpdated: null,
    problems: [], mechanisms: [], strengths: [],
    goals: [], growth: [],
    unverified: { problems: [], mechanisms: [], strengths: [], goals: [], growth: [] }
  },
  archive: [],
  activeStrategies: [],
  modes: { exam: false, travel: false, sick: false, rest: false, period: false },
  periodStart: null,
  apiKey: '',
  profile: '',
  // 사용자 명시 2026-05-11: AI 호칭용. 비어있으면 prompt 가 fallback ('지우' placeholder).
  userName: '',
  lastSync: null,
  // Phase 2
  missions: [],
  shellCollection: [],
  // Phase 3
  decisions: [],
  // Phase 4
  weeklyReviews: [],
  monthlyReviews: [],
  // legacy — 옛 회전 카드 source (사용자 명시 2026-05-18 폐기). data preserve 위해 array 만 보존.
  miniReviews: [],          // [{id, content, generatedAt, source:'haiku-3day'}]
  godongDiary: [],          // [{id, date, weekday, note?, body, iso, substrateRefs[]}] — 옛 schema
  // hook-system spec (2026-05-18) — backend cron + 챗 탭 inline 큐. 메커니즘/프롬프트는 옛 godongDiary 동일.
  godongDiaryQueue: [],     // [{id, body, generatedAt, triggerDayK, readAt, dismissedAt}] — max 30, FIFO prune
  askedHooks: [],           // [{id, body, source, trigger_dayK, hook_type, askedAt, answered, answeredAt, delivered}] — max 50
  lastAbsenceAcknowledgedAt: null,  // 부재 후속 placeholder 5일 cooldown
  predictionFollowups: [],
  // Phase 5
  questionHistory: [],
  questionPreferences: { dismissed: [], favorites: [], customQuestions: [] },

  // === V6 NEW ===
  // 1. 실행 탭 (Execution)
  tasks: [],              // [{id, title, status, priority, energy, due, source, createdAt, completedAt, weight, project_id?}]
  projects: [],           // [{id, name, deadline?, status, createdAt}]
  areas: [],              // [{id, name, createdAt}] — 다이어트, 운동, 연구, 관계
  memoryVault: [],        // [{id, content, source: 'chat'|'manual', extractedAt, processed}]
  dayPlan: [],            // [{date, blocks: { morning: [], afternoon1: [], afternoon2: [], evening: [], night: [] }}]
  starts: [],             // [{id, taskId, location, woop, startedAt, returnedAt, outcome}]
  
  // 2. 아카이브 V6 (3 Lens)
  insights: [],           // [{id, type:'pattern'|'causal', content, supportingEntryIds, confidence, discoveredAt, dismissed}]
  pearls: [],             // [{id, content, category?, photo?, createdAt}] — 진주 바구니 (취향, 살아있는 순간)
  
  // V3.8: 챕터 토픽 카드 — 4시간 비활성으로 끊긴 챕터를 AI가 토픽 단위로 정리
  topicCards: [],         // [{id, chapterStartedAt, chapterEndedAt, title, summary, category, messageCount, createdAt}]

  // 3. Today's Shell 캐시
  todaysShell: { date: null, content: null, generatedAt: null },

  // 4. 환영 투어
  hasSeenV3Tour: false,
  hasSeenWelcomeTutorial: false,

  // V4 코어 튜토리얼 잠금 시스템 (사용자 요청 2026-04-29)
  // 각 코어 완료 시 해당 키 true. 기존 사용자는 마이그레이션에서 모두 true로 적용됨.
  // testerMode ON이면 잠금 우회.
  unlocked: {
    core1: false,  // 시작/체크인/대화 (한 바퀴) — 업데이트 배너 보기 → 코어 튜토리얼
    core2: false,  // 소라의 부름 → 모래사장 → 양생방
    core3: false,  // 실행 탭 — 고동에게 맡기기 + 몰입
    core4: false,  // 나 탭 — 분석 결과
    core5: false,  // 도서관 탭 5 카테고리 + 리뷰
    core6: false,  // 숙고 질문
    core8: false   // 마법고동
  },

  // 5. 모드 활성 시 표시용
  modeActiveSince: {},   // {exam: '2026-04-20', ...}

  // 6. 커스텀 설정
  preferences: {
    nightModeManual: null,  // null = auto, 'on' | 'off' = manual override
    hookFrequency: 'daily',       // 'daily'|'every-other-day'|'thrice-week'|'off'
    hookNotificationTime: 21,     // 시 (0-23), default 21시
    lastChatTabEntryAt: null,     // 부재 계산 + 챕터 마무리 5분 가드 (hook-system spec)
    pearlBasketCategories: ['음악', '음식', '장소', '순간', '사람'],
    // V4 (사용자 명시 2026-05-14 ultrathink): 진주 '티켓' 카테고리 sub-type — 사용자 customizable.
    //   default 6개. settings 에서 ON/OFF + 추가/제거 가능.
    ticketSubTypes: [
      { id: 'movie',      label: '영화',   emoji: '🎬', enabled: true },
      { id: 'baseball',   label: '야구',   emoji: '⚾', enabled: true },
      { id: 'concert',    label: '콘서트', emoji: '🎤', enabled: true },
      { id: 'musical',    label: '뮤지컬', emoji: '🎭', enabled: true },
      { id: 'exhibition', label: '전시',   emoji: '🎨', enabled: true },
      { id: 'travel',     label: '여행',   emoji: '✈️', enabled: true }
    ],
    starRitualSettings: { useShortcut: true, shortcutName: 'SoraRitual' },
    // V4 신규
    tutorialVersion: null,        // 'full' | 'update' | 'core' | null (어떤 튜토리얼 버전 봤나)
    tutorialCompleted: false,
    miniTutorialsSeen: [],        // ['yangsaeng','galpi','sukgo',...] 화면별 미니 도움
    progressiveUnlockLevel: null,  // 'week1' | 'month1' | 'month3' (코어 선택 시 점진 노출)
    // 사용자 요청 2026-04-30: 메인 chat 일일 cap. 0 = 무제한. default 100/일 (헤비 사용자 본인이 풀 수 있게 settings 조절).
    dailyChatCap: 100,
    // 사용자 요청 2026-04-30 (변호사 검수): 동의 audit trail. PIPA / 전자상거래법 의무 — 모든 동의 시점·버전 기록.
    // 첫 진입 시 적용됨. 정책 버전 변경 시 재동의.
    consentLog: [],
    // 자동 갱신 default OFF (다크 패턴 회피, terms 4.4)
    autoRenew: false,
    // V4 (사용자 명시 2026-05-18): RAG default ON. Plus/Premium 결제 시 자동 작동 — 사용자가 button 안 눌러도 옛 챕터 기억 켜짐.
    //   plan 게이트는 _ragGetTopN (light/premium 만 active). Light/게스트 = effective OFF.
    //   _ragToggleSeen default true — default ON 시점 = 첫 클릭 설명 모달 skip. button 누르면 즉시 OFF/ON 토글.
    useRag: true,
    _ragToggleSeen: true
  },

  // 7. V3.3: 대화 일별 아카이브
  chatArchive: [],          // [{date, messageCount, messages, generatedAt}]  ※ V191 폐기로 summary 필드 제거

  // 사용자 명시 2026-04-30 ultrathink: 코어 #1 첫 관찰 worry 데이터. testerMode OFF / 시드 sweep / backup restore 영향 X.
  // 별도 array — chatMessages 와 격리 (회의 결정 B). traits/values/patterns 자동 합류 input.
  // 형식: [{role:'user'|'assistant', content, ts, kind?:'first'|'deepen_q'|'detailed'|'analysis'}]
  intakeWorry: [],

  // === V7 (V4) 신규 ===
  reflectionQuestions: [],  // 사고 질문 시스템 (anchor 30): [{id, text, status, conclusion, chatMessages, ...}]
  todaySchedule: [],        // 타임테이블: [{id, title, start, end, source:'manual'|'ai'|'gcal'|'task', taskId}]
  diagnoses: [],            // V4 비전 9.5 관찰 5종: [{id, type, confidence, evidence, detectedAt, status:'active'|'shown'|'dismissed'}]
  quarterlyReviews: [],     // V4 비전 7.9 분기 리뷰: [{id, quarterKey:'2026-Q2', completedAt, summary, sections, stats, auto, deepDive}]
  annualReviews: [],        // 사용자 명시 2026-04-30 ultrathink: 연간 리뷰 (10 카드 시퀀스). [{id, year, yearRange, completedAt, oneWord, persona, personaReason, stats, finding1, finding2, tree, beach, moments_card, best_pearl, realizations, deep, oneLine, songs, auto}]
  lastForceAnalyzeAt: null, // 사용자 요청 2026-04-30: forceAnalyze 일주일 자동화 — 마지막 실행 시각.
  // 사용자 요청 2026-04-30: 자동 분석 4단계 (매일/매주/매월/매분기/매년 새벽 4시 cutoff).
  lastDailyChapterExtractAt: null,    // 매일 4AM
  lastWeeklyAnalyzeAt: null,           // 매주 일요일 4AM
  lastMonthlyAnalyzeAt: null,          // 매월 1일 4AM
  lastQuarterlyAnalyzeAt: null,        // 매분기 첫째달 1일 4AM
  lastYearlyAnalyzeAt: null,           // 매년 1월 1일 4AM
  // 사용자 요청 2026-04-30: 메인 chat 일일 메시지 cap (비용 폭발 방지). 4시 cutoff 기준 reset.
  dailyChatCount: { date: null, count: 0 },
  // 사용자 명시 2026-05-01: 신규 가입자 빠른 추출 카운터 — 옛 chat pair 기반 (폐기 — 보존 호환만).
  chatPairsCount: 0,
  newUserExtractTriggers: 0,
  // 사용자 명시 2026-05-01 ultrathink: 챕터 마무리 카운터 — ✓ + 자동 5h+ 둘 다 카운트. 첫 3챕터만 즉시 case_analysis.
  chapterCompletedCount: 0,
  // hook-system spec (2026-05-18): 챕터 마무리 시점 ISO. 5분 안 = empty placeholder default 만 (일기/부재 후속 X). 새 메시지 입력 시 null clear.
  _chatChapterEndedAt: null,

  // 사용자 요청 2026-04-29 (Q2): 더 깊은 사용자 모델 — 발달 맥락 / 관계 맵 / 자기서사·핵심 신념.
  // 시스템 프롬프트 stable 부분에 적용돼서 cache_control 적용 → cache_read만 (사실상 무료).
  // 점진 입력 (한 번에 다 X). 각 필드는 사용자가 직접 입력 또는 임시대화 추출에서 채워짐.
  userDeepProfile: {
    version: 0,
    lastUpdated: null,
    // 1. 발달·역사 맥락
    development: {
      childhood: '',          // 어린 시절·가족 구조·양육 톤
      schoolYears: '',        // 학창 시절 핵심 사건
      adhdDiscovery: '',      // ADHD 발견 시점 + 그 전 어떻게 살았는지
      turningPoints: []       // [{id, when:'YYYY-MM-DD'|free, title, description, impact}]
    },
    // 2. 관계 맵
    relationships: [],         // [{id, name, relation:'가족|친구|연인|동료|전문가|기타', tone:'안전|자극|혼합', influence:'positive|negative|mixed', notes}]
    // 5. 자기서사·핵심 신념
    selfNarrative: {
      selfStory: '',          // 한 단락 자기소개
      coreBeliefs: {
        aboutSelf: [],         // ["나는 ..." 형태]
        aboutWorld: [],        // ["세상은 ..." 형태]
        aboutFuture: []        // ["미래는 ..." 형태]
      },
      howWantToBeSeen: '',    // 어떻게 보이고 싶은지
      identityKeywords: []     // 정체성 키워드 (예: queer, 연구자)
    }
  },

  // 사용자 명시 2026-05-09 (회전 카드 spec final): 홈 회전 카드 source — 진주 / 시뮬레이션 / 어제 / weekly~annual review.
  // _ensureRotatingCardState() 가 누락 필드 자동 보완.
  rotatingCardState: {
    // 진주 — 4시간 stay
    pearlWindowStart: null,    // ISO — 4시간 stay 시작
    pearlCurrentId: null,      // 그 4시간 stay 진주 id
    lastPearlShownDate: null,  // 'YYYY-MM-DD' — 오늘 진주 1번 노출 여부
    // 새로 본 너 — unseen insights 큐
    unseenInsights: [],         // [{id, kind, name, copy, contentHash, evidence, addedAt}]
    unseenInsightsHistory: [],  // [{id, verdict:'correct'|'wrong', at}]
    // 미니 리뷰 (Haiku 3일 stay) — 사용자 보고 2026-05-09: 재진입 시 손실 X
    lastMiniReviewAt: null,     // ISO — Haiku 호출 성공 시점
    miniReviewContentId: null,  // state.miniReviews[].id 매칭 (재진입 stash)
    // Quiz — case formulation user_verified 기반
    quizDay: null,              // 'YYYY-MM-DD' 4AM cutoff
    quizProgress: null,         // {questionIds, currentIdx, answers:{id:'correct'|'wrong'|'skip'}}
    quizDeniedCooldown: {},     // {itemId: unlockMs} — 14일
    quizSkippedCooldown: {},    // {itemId: unlockMs} — 1일
    quizScoreBefore: null,      // % — 끝 화면 변화 표시
    // 디버깅 / 호환
    history: [],                // [{sourceId, contentHash, seenAt}] — 옛 호환
  },

  version: 7
};

let state = { ...DEFAULT_STATE };
let currentCheckin = {};
let syncStatus = 'offline';
let syncTimeout = null;

// V4.0: localStorage 동기 저장 디바운스 (400ms). cloud는 saveToCloud 안에서 1초 디바운스.
// force=true면 즉시 (토글/critical save). beforeunload에서도 강제 flush.
let _localSaveTimer = null;

// 사용자 요청 2026-04-29 (perf #1): JSON.stringify replacer — transient/임시 필드 strip해서 직렬화 부하 ↓
// 메모리 state는 그대로 유지, 저장/네트워크 페이로드만 가벼워짐.
const _SERIALIZE_TRANSIENT_KEYS = new Set([
  '_dnaMatched',           // shellCollection 임시 매칭 마커
  '_crystallizePromptShown', // topicCard 결정화 prompt 한 번만
  '_followupAsked',        // mission UI flag
  'typing',                // chatMessages AI 응답 진행 중 placeholder
  'testerMode',            // preferences flag (방어적 — 이미 별도 strip 있지만 race 대비)
  '_strategyChapterSurfacedIds'  // 전략 resurface 챕터 1장 가드 — 5h+ gap archive 시 reset, cloud strip
]);
function _serializeReplacer(key, value) {
  if (_SERIALIZE_TRANSIENT_KEYS.has(key)) return undefined;
  return value;
}

// 사용자 명시 2026-05-01: 100+ 사용자 대비 backup 효율 최적화 — 변경 없는 state 의 중복 backup skip.
// hash 계산 시 자동 변하는 메타 (lastSync / _lastAutoBackupAt 등) 제외 — 실제 사용자 데이터 변경만 감지.
const _BACKUP_HASH_EXCLUDED_KEYS = new Set([
  'lastSync',
  '_lastAutoBackupAt',
  '_lastAutoBackupVersion'
]);
function _backupHashReplacer(key, value) {
  if (_SERIALIZE_TRANSIENT_KEYS.has(key)) return undefined;
  if (_BACKUP_HASH_EXCLUDED_KEYS.has(key)) return undefined;
  return value;
}
function _computeStateHash(stateObj) {
  let json;
  try { json = JSON.stringify(stateObj, _backupHashReplacer); } catch { return null; }
  if (!json) return null;
  // djb2 — 빠르고 collision 충분히 낮음 (length 도 같이 넣어 추가 안전)
  let h = 5381;
  for (let i = 0; i < json.length; i++) {
    h = (((h << 5) + h) + json.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36) + '_' + json.length.toString(36);
}

// 사용자 명시 2026-05-01 (100+ 사용자 egress 50% 절감): state JSON gzip 압축 (native CompressionStream).
// 적용 자리: 평문 (E2EE off) cloud row 저장. E2EE on 은 _encryptedBody 가 high-entropy 라 압축 효과 X — 별도.
// Wrapper: { _compressed: true, _format: 'gzip-base64-v1', _payload: '<base64>' }.
// Backwards-compat: 옛 plain row 도 그대로 읽힘 (wrapper 미감지 시 plain 으로 처리).
const _COMPRESSED_FORMAT = 'gzip-base64-v1';
function _isCompressedWrapper(obj) {
  return !!(obj && typeof obj === 'object' && obj._compressed === true
    && obj._format === _COMPRESSED_FORMAT && typeof obj._payload === 'string');
}
async function _gzipB64Encode(jsonString) {
  const stream = new Blob([jsonString]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
async function _gzipB64Decode(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}
async function _packStateForCloud(stateObj) {
  if (typeof CompressionStream === 'undefined') return stateObj;
  try {
    const json = JSON.stringify(stateObj, _serializeReplacer);
    const payload = await _gzipB64Encode(json);
    if (payload.length >= json.length * 0.85) return stateObj;
    return { _compressed: true, _format: _COMPRESSED_FORMAT, _payload: payload };
  } catch (e) {
    console.warn('[gzip pack] 실패 — plain fallback:', e);
    return stateObj;
  }
}
async function _unpackStateFromCloud(rowData) {
  if (!_isCompressedWrapper(rowData)) return rowData;
  try {
    const json = await _gzipB64Decode(rowData._payload);
    return JSON.parse(json);
  } catch (e) {
    console.error('[gzip unpack] 실패 — cloud 데이터 복호 불가:', e);
    throw new Error('Cloud 압축 데이터 복원 실패');
  }
}

function _flushLocalSave(opts) {
  if (_localSaveTimer) { clearTimeout(_localSaveTimer); _localSaveTimer = null; }
  if (!authUserId) return;
  // 사용자 보고 2026-04-28: testerMode ON이면 localStorage 저장도 차단.
  if (state.preferences && state.preferences.testerMode) return;
  let payload;
  try {
    // 사용자 요청 2026-04-29 (perf #1): replacer로 transient 필드 strip
    payload = JSON.stringify(state, _serializeReplacer);
  } catch (e) {
    console.warn('localStorage stringify failed:', e);
    return;
  }
  const writeFn = () => {
    try {
      localStorage.setItem(V4_LOCAL_STORAGE_KEY, payload);
    } catch (e) {
      console.warn('localStorage save failed:', e);
      if (e && (e.name === 'QuotaExceededError' || e.code === 22 || /quota/i.test(e.message || ''))) {
        if (!window._localStorageQuotaWarned) {
          window._localStorageQuotaWarned = true;
          if (typeof showToast === 'function') {
            showToast('⚠️ 로컬 저장 공간 가득 — 홈 → 이전 대화 정리하면 공간 확보 (cloud는 정상)');
          }
        }
      }
    }
  };
  // 사용자 요청 2026-04-29 (perf #2): localStorage 동기 write를 idle callback으로 — 메인스레드 안 막음
  // beforeunload + opts.sync 시엔 즉시 flush (데이터 손실 방지)
  if (opts && opts.sync) {
    writeFn();
    return;
  }
  if ('requestIdleCallback' in window) {
    requestIdleCallback(writeFn, { timeout: 1500 });
  } else {
    writeFn();
  }
}
function saveState(force) {
  // V4 (사용자 명시 2026-05-16 cowork ultrathink): _e2eePendingRecovery 가드 — 데이터 손실 root cause fix.
  //   원인: cloud E2EE decrypt 실패 시 loadFromCloud (05-supabase.js:111/121/137) 가 state = DEFAULT (빈) 처리 + window._e2eePendingRecovery 에 옛 cloudData 보관.
  //   recovery modal (init 1500ms 후 fire) 이전에 init 의 자동 saveState 들 (_firstAppDayKey:30-36 / 사용자 미션·진주·mood 입력 등) 이 fire 하면
  //   _e2eeMasterKey=null 상태에서 saveToCloud 가 *평문 빈 state* 를 cloud 에 push → 옛 encrypted state 영구 손실 (어드민 jade6679 실제 사고).
  //   이미 13-auto-backup.js / 14-manual-backup.js / 09-e2ee-password.js / 11-guest-conversion.js 패턴 — saveState 자체에도 동일 가드.
  //   recovery 모달 통한 복호화 성공 후 07-e2ee-recovery-modal.js:227 가 _e2eePendingRecovery=null clear → 정상 saveState 재개.
  if (typeof window !== 'undefined' && window._e2eePendingRecovery) {
    console.warn('[saveState] _e2eePendingRecovery active — saveState 차단. recovery 후 재시도.');
    return;
  }
  // V4 (사용자 명시): 도서관 탭 dot 갱신 — 데이터 변경 매 cycle 마다 자연 갱신
  if (typeof updateLibraryTabNewDot === 'function') updateLibraryTabNewDot();
  // V4 (사용자 명시 2026-05-08 ultrathink): 홈 / 나 탭 batch dot 갱신
  if (typeof updateNavBatchDots === 'function') updateNavBatchDots();
  if (!authUserId) return; // Don't save if not logged in
  // 사용자 요청 2026-04-28: 테스터 모드면 force여도 cloud/localStorage 저장 X
  if (state.preferences && state.preferences.testerMode) return;
  if (force) {
    _flushLocalSave();
    saveToCloud();
    return;
  }
  if (_localSaveTimer) clearTimeout(_localSaveTimer);
  _localSaveTimer = setTimeout(_flushLocalSave, 400);
  saveToCloud();
}
// 사용자 요청 2026-04-29 (perf #2): beforeunload에선 동기 flush 강제 (idle callback 큐 못 비우므로)
window.addEventListener('beforeunload', () => _flushLocalSave({ sync: true }));

