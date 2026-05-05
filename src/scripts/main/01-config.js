// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════
const SUPABASE_URL = 'https://pfagqvfteqzfhkbxtnwp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmYWdxdmZ0ZXF6ZmhrYnh0bndwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMjU4MDMsImV4cCI6MjA5MjYwMTgwM30.jDYXky2ga-o_02uWWrqqwti_HfHm8K_61IHPV81YBoA';

// 사용자 명시 2026-05-05 ultrathink (Phase 0): Cloudflare Turnstile site key — 게스트 chat 진입 시 봇 검증.
// 공개 OK (frontend 에 박혀도 안전). secret key 는 Cloudflare Pages env (TURNSTILE_SECRET_KEY) 에 별도 저장.
// 사용처: Phase 1 게스트 모드 활성화 시 invisible widget 으로 토큰 발급 → /api/chat 헤더 X-Turnstile-Token.
const TURNSTILE_SITE_KEY = '0x4AAAAAADJh3vgSfSXeGNkj';

// 사용자 명시 2026-05-06: PortOne V2 채널 키 (KG이니시스) + Store ID. 둘 다 공개 OK — frontend 결제창 호출 시 사용.
// REST API Key (V2) + Webhook Secret 은 Cloudflare env (PORTONE_API_KEY_V2 / PORTONE_WEBHOOK_SECRET) 에 별도.
const PORTONE_CHANNEL_KEY = 'channel-key-19a298fa-d855-4e4e-9eae-42d60448848e';
const PORTONE_STORE_ID = 'store-d59c417a-3e7b-4316-8385-238fe8ff54d0';

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

