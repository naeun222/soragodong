// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════
const SUPABASE_URL = 'https://pfagqvfteqzfhkbxtnwp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmYWdxdmZ0ZXF6ZmhrYnh0bndwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMjU4MDMsImV4cCI6MjA5MjYwMTgwM30.jDYXky2ga-o_02uWWrqqwti_HfHm8K_61IHPV81YBoA';

// 사용자 명시 2026-05-05 ultrathink (Phase 0): Cloudflare Turnstile site key — 게스트 chat 진입 시 봇 검증.
// 공개 OK (frontend 에 박혀도 안전). secret key 는 Cloudflare Pages env (TURNSTILE_SECRET_KEY) 에 별도 저장.
// 사용처: Phase 1 게스트 모드 활성화 시 invisible widget 으로 토큰 발급 → /api/chat 헤더 X-Turnstile-Token.
const TURNSTILE_SITE_KEY = '0x4AAAAAADJh3vgSfSXeGNkj';

// V4 (사용자 명시 2026-05-17): Hook 시스템 Phase B — Web Push VAPID public key.
//   USER_TODO 참조: `npx web-push generate-vapid-keys` 로 생성. PRIVATE 는 Cloudflare env (VAPID_PRIVATE_KEY) 에.
//   PUBLIC 만 frontend 에 박힘 (PushManager.subscribe applicationServerKey 형식).
//   미설정 시 빈 문자열 — push subscription 시도 silent skip (frontend dead code OK).
window._VAPID_PUBLIC_KEY = '';

// 사용자 명시 2026-05-06: PortOne V2 채널 키 + Store ID. 공개 OK — frontend 결제창 호출 시 사용.
// REST API Key (V2) + Webhook Secret 은 Cloudflare env (PORTONE_API_KEY_V2 / PORTONE_WEBHOOK_SECRET) 에 별도.
// 사용자 명시 2026-05-11: KG이니시스 / 카카오페이 / 토스페이 결제 채널 5종 추가.
// 사용자 명시 2026-05-14: 가계약 모드 KG이니시스 단건 채널 (PORTONE_CHANNEL_KEY) = PortOne 콘솔에서 실제 운영 모드. 카드명 'INIpayTest' 는 PortOne 콘솔 channel name 이며 운영/테스트 모드 자체는 콘솔 설정 기준.

// V4 (사용자 명시 2026-05-11 — 가계약 단계): 정기결제 PG 계약 미승인 상태 → 일반결제 (1개월 이용권) 로 임시 운영.
//   false: subscribe modal 의 모든 tier (Light/Plus/Premium) 가 *일회성 1개월* 결제 (자동 갱신 X, 만료 7일 전 알림 후 재구매).
//          빌링키 등록 / cron 자동 결제 / Plus 첫 달 무료 trial 흐름 전부 우회. backend cron 도 가드.
//   true:  옛 정기결제 흐름 (requestIssueBillingKey + portone-register-recurring + cron 매월 갱신) 으로 복귀. 계약 승인 후 변경.
const BILLING_RECURRING_ENABLED = false;

// V4 (사용자 명시 2026-05-13): Google Play TWA 환경 감지 + 결제 진입점 가드 (하이브리드 옵션 C).
//   document.referrer 가 `android-app://<package>` 로 시작 = TWA 가 launch 한 신호 (Chrome Custom Tabs / TWA spec).
//   첫 진입 시점 cache (sessionStorage) — SPA navigation 으로 referrer 잃어도 유지.
//   결제 CTA 마다 _isTWAEnv() 가드 → showTwaPaymentNoticeModal() 로 안내 + 외부 브라우저 redirect.
//   목적: Google Play Billing 30% 회피 + 외부 결제 노골 안내 회피 (Play 정책 risk ↓).
function _isTWAEnv() {
  try {
    // sessionStorage 캐시 — 한 세션 내내 유지 (SPA 라 페이지 이동 X 이지만 안전 차원).
    if (sessionStorage.getItem('_isTWA') === '1') return true;
    if (sessionStorage.getItem('_isTWA') === '0') return false;
    const ref = (document.referrer || '').toLowerCase();
    const isTwa = ref.startsWith('android-app://com.soragodong.twa');
    sessionStorage.setItem('_isTWA', isTwa ? '1' : '0');
    return isTwa;
  } catch { return false; }
}

// V4 (사용자 명시 2026-05-13 — 토스페이 심사용 임시 mockup):
//   토스페이 빌링키 채널이 아직 발급 심사 중 → 정기결제 picker / 동의 모달에 토스페이 노출 X (`excludeToss: true`).
//   심사관에게 결제 흐름 시연 목적으로 *임시* 노출 — picker / 동의 모달에 토스페이 카드 표시.
//   사용자가 토스 선택 후 동의해도 SDK 호출 직전 가드에서 "빌링키 채널 = 토스 심사 중" 친절 alert 표시.
//   ⚠ 빌링키 채널 발급 완료 후 `false` 로 복귀 (또는 진짜 channelKey set 후 flag 자체 폐기).
const TOSS_PAY_REVIEW_MOCK = true;

const PORTONE_STORE_ID                  = 'store-d59c417a-3e7b-4316-8385-238fe8ff54d0';
const PORTONE_CHANNEL_KEY               = 'channel-key-f323504c-0f76-48c5-95df-0a8b0ab22a3a'; // KG이니시스 일반 (INIpayTest)
const PORTONE_BILLING_CHANNEL_KEY       = 'channel-key-f5129f79-9380-4f3c-8221-2cf84f52ee18'; // KG이니시스 정기/빌링키 (INIBillTst)
const PORTONE_KAKAO_CHANNEL_KEY         = 'channel-key-604b3716-b099-4fb2-95f2-826e77b0ce77'; // 카카오페이 일반 (TC0ONETIME)
const PORTONE_KAKAO_BILLING_CHANNEL_KEY = 'channel-key-4bd55870-5272-45bc-8dae-b1de5e74df31'; // 카카오페이 정기/빌링키 (TCSUBSCRIP)
const PORTONE_TOSS_CHANNEL_KEY          = 'channel-key-fe52cf1c-bfc1-4809-b814-ecb773206c3c'; // 토스페이 일반 (tosstest)

// 사용자 명시 2026-05-01 (100명 대비): Sentry error tracking placeholder.
// DSN 빈 값 = SDK 로드 X (네트워크 / bundle 영향 0). 사용자가 sentry.io 가입 후 DSN 발급해서 적용하면 자동 활성.
// 가입 단계: USER_TODO P2-X 참고. Free tier 5K errors/월.
const SENTRY_DSN = '';  // 예: 'https://abc@oXXXX.ingest.sentry.io/YYYY'
(function _initSentry() {
  if (!SENTRY_DSN) return;  // DSN 없으면 noop
  const s = document.createElement('script');
  s.src = 'https://browser.sentry-cdn.com/8.55.0/bundle.min.js';
  s.crossOrigin = 'anonymous';
  s.async = true;
  s.onload = function() {
    if (typeof window.Sentry === 'undefined') return;
    try {
      window.Sentry.init({
        dsn: SENTRY_DSN,
        // release tag — APP_VERSION (window 으로 노출, line 39535 정의 후) 가 있으면 사용, 없으면 'v4'
        release: (typeof window.APP_VERSION === 'string') ? window.APP_VERSION : 'v4',
        environment: location.hostname.includes('soragodong.com') ? 'production' : 'preview',
        tracesSampleRate: 0,        // perf trace X (free tier quota 안전)
        sendDefaultPii: false,      // PII 자동 수집 X (개인정보 보호)
        beforeSend: function(event) {
          // 사용자 영향 X 노이즈 필터 — 네트워크 리소스 로드 실패 / aborted fetch 등
          const msg = (event.exception?.values?.[0]?.value || event.message || '').toString();
          if (msg.includes('Load failed')) return null;
          if (msg.includes('NetworkError')) return null;
          if (msg.includes('AbortError')) return null;
          if (msg.includes('Failed to fetch')) return null;
          return event;
        }
      });
    } catch (e) { console.warn('[sentry init]', e); }
  };
  document.head.appendChild(s);
})();

// Auth state — populated after login
let session = null;       // { access_token, refresh_token, user: { id, email } }
let authUserId = null;    // UUID

// Shell types for collection
const SHELL_TYPES = ['🐚', '🌀', '🐌', '✨', '🌟', '💫', '⭐', '🔮', '🌊', '🐠', '🐡', '🦐', '🪸', '🌺', '🌸', '🌼', '🌻', '🌷', '🍀', '🌱'];

// 사용자 명시 2026-05-10: 고동이 표정 mascot SVG (21종, public/character/godong-{mood}.svg).
// 기존 godong-serious.svg / godongicon.png 인라인 자리에 점진 적용. ES module X — 인라인 onclick 패턴 유지.
// 사용 예: innerHTML 에 godongImg('happy', 32) 삽입. mood 미존재면 default 폴백.
const GODONG_MOODS = [
  'default','happy','wink','inspired','love','soras-call','thinking','hello',
  'shy','down','surprised','sleepy','proud','listening','dreaming','focused',
  'blushing-thanks','growing','storming','calm','whispering','wizard'
];
function godongImg(mood, size, cls) {
  const safe = GODONG_MOODS.indexOf(mood) >= 0 ? mood : 'default';
  const px = (typeof size === 'number' && size > 0) ? size : 24;
  const klass = cls || 'godong-icon';
  return `<img src="/character/godong-${safe}.svg" alt="" class="${klass} godong-mood-${safe}" width="${px}" height="${px}" decoding="async">`;
}

