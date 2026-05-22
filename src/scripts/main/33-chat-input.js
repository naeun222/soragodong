// ═══════════════════════════════════════════════════════════════
// CHAT INPUT
// ═══════════════════════════════════════════════════════════════

// 사용자 보고 2026-05-09 ultrathink: bottom-nav 실측 동적 sync — chat-input-bar / reflection-input-bar 가 nav 위 정확히 붙음.
// 원인: emoji 폰트마다 line-height 변동 (22px → 28-35px 실 ascent/descent) → nav-item content > min-height 56 → nav 실측 82+ N px.
// CSS calc 만으론 디바이스/폰트마다 다른 N 못 맞춤. JS 동적 측정으로 --chat-input-bottom CSS variable 동기화.
// 사용자 명시 2026-05-09: nav 위 3px 추가 buffer (시각적 여유).
// 사용자 명시 2026-05-09 (재정정): 입력창 3px 만 아래로 → buffer 0 (옛 3px → 0px = 입력창 nav 에 바로 붙음).
const _CHAT_INPUT_NAV_BUFFER_PX = 0;
function _syncChatInputBottomToNav() {
  const nav = document.querySelector('.bottom-nav');
  if (!nav) {
    document.documentElement.style.removeProperty('--chat-input-bottom');
    return;
  }
  const h = nav.getBoundingClientRect().height;
  if (h > 0) {
    document.documentElement.style.setProperty('--chat-input-bottom', (h + _CHAT_INPUT_NAV_BUFFER_PX) + 'px');
  }
}
window.addEventListener('load', _syncChatInputBottomToNav);
window.addEventListener('resize', _syncChatInputBottomToNav);
window.addEventListener('orientationchange', () => setTimeout(_syncChatInputBottomToNav, 200));
// nav 가 fonts 로드 / 사용자 로그인 후 등장 / orientation 변경 등으로 size 변경 시 자동 재측정.
if (typeof ResizeObserver !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const nav = document.querySelector('.bottom-nav');
    if (nav) {
      try {
        const _navObs = new ResizeObserver(_syncChatInputBottomToNav);
        _navObs.observe(nav);
      } catch (e) { console.warn('[chat-input] nav ResizeObserver 실패:', e); }
    }
    // 초기 1회 sync (nav display:none → block 전환 직후)
    setTimeout(_syncChatInputBottomToNav, 100);
    setTimeout(_syncChatInputBottomToNav, 500);  // fonts 로드 후 emoji line-height 변동 대비
  });
} else {
  // ResizeObserver 미지원 (구형 브라우저) — DOMContentLoaded + 5초 polling.
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(_syncChatInputBottomToNav, 100);
    setInterval(_syncChatInputBottomToNav, 5000);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // V4 (사용자 명시 2026-05-04 ultrathink V181 근본 해결): 모바일 입력창 렉 다층 해결
  // 근본 원인 4가지:
  //  1. _resizeTextarea: style.height='auto' set + scrollHeight read + height set = 매 keystroke 2~3회 강제 reflow (1.6MB DOM 에서 누적 → 모바일 lag 체감)
  //  2. IME composition 미처리 — 한글 자모(ㅎ→하→한) 입력마다 input event 발생 → 자모 단위 resize
  //  3. textarea 자체에 contain 미적용 → height 변경이 fixed chat-input-bar 외부로 layout 전파
  //  4. 동일 높이여도 무조건 set → 불필요한 repaint
  // 해결 다층 (CSS + JS):
  //  ① compositionstart/end flag — IME 한글 입력 중 resize skip, end 시 1회 final
  //  ② height 변화량 1px 미만이면 set skip (max 도달 후 매 keystroke 무동작)
  //  ③ rAF coalesce 보존 (frame당 1회)
  //  ④ CSS .chat-textarea { contain: layout style; field-sizing: content; } — Chrome 123+/Safari 17+ native auto-size, 미지원 브라우저는 JS fallback
  const _resizeTextarea = (el, max) => {
    if (el._composing) return;            // ① IME 한글 입력 중 skip
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, max);
    if (Math.abs(next - el.offsetHeight) >= 1) {  // ② 동일 높이 skip
      el.style.height = next + 'px';
    }
  };
  const _makeRafResizer = (el, max) => {
    let raf = 0;
    return () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; _resizeTextarea(el, max); });
    };
  };
  const _bindAutoResize = (el, max) => {
    if (!el) return;
    const resize = _makeRafResizer(el, max);
    el.addEventListener('compositionstart', () => { el._composing = true; });
    el.addEventListener('compositionend',   () => { el._composing = false; resize(); });
    el.addEventListener('input', resize);
  };
  const ta = document.getElementById('chatInput');
  _bindAutoResize(ta, 140);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isMobile()) {
      e.preventDefault(); sendChat();
    }
  });
  // V4 cleanup 2026-05-23 — updateChatEmptyState 폐기 (empty entry chatMessages 안 통합). textarea input listener 제거.
  // 사용자 요청 2026-04-29: 숙고 입력바도 메인 chat 처럼 자동 높이 (max 140px)
  const reflTa = document.getElementById('reflectionInput');
  if (reflTa) {
    _bindAutoResize(reflTa, 140);
    reflTa.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !isMobile()) {
        e.preventDefault(); sendReflectionChat();
      }
    });
  }
  ['sleepStart', 'sleepEnd'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updateSleepDuration);
  });
  // Enter key on login email
  const loginEmail = document.getElementById('loginEmail');
  if (loginEmail) {
    loginEmail.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); handleSendCode(); }
    });
  }
  // Enter key on login code
  const loginCode = document.getElementById('loginCode');
  if (loginCode) {
    loginCode.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); handleVerifyCode(); }
    });
    // Auto-submit when full code entered
    loginCode.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, ''); // numeric only
      if (e.target.value.length >= 8) {
        setTimeout(() => handleVerifyCode(), 100);
      }
    });
  }
});

function isMobile() {
  return /Android|iPhone|iPad/i.test(navigator.userAgent);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// V4 fix (사용자 보고 2026-05-18) — PWA 무한 로딩 (splash 사라진 후 빈 화면) fallback.
//   원인: init() 가 await 안에서 uncaught throw → .app / login-screen 둘 다 display:none 유지 → blank.
//   fix: init() catch 안 login-screen 명시 노출 + splash 강제 hide. 진짜 원인 (network / corrupt localStorage / fetch throw 등) 별도 진단 가능 — fallback 으로 dead-end 회피.
// V4 fix (사용자 보고 2026-05-18 ultrathink Phase 2) — hang 도 잡는 30s 안전망 추가.
//   ec3cc79 catch 는 reject 만 잡지 await hang 은 X. supabase 정지/지연 시 어떤 fetch 가 timeout wrapper 안 거치고 hang 하면 init 영구 대기 → 빈 화면.
//   _fetchWithTimeout 으로 critical path (checkSession / loadFromCloud / saveToCloudNow) 는 12s 안 reject 되지만 — 이중 안전망으로 30s 후 init 안 끝났으면 강제 showLoginScreen.
let _initSettled = false;
const _initShowLoginFallback = (e) => {
  if (e) console.error('[init] fatal/timeout — login screen fallback:', e);
  try { if (typeof _hideBootSplash === 'function') _hideBootSplash(); } catch {}
  try { if (typeof showLoginScreen === 'function') showLoginScreen(); } catch {
    // showLoginScreen 도 throw 면 마지막 안전망 — 직접 DOM 조작.
    try {
      const ls = document.getElementById('loginScreen');
      if (ls) ls.style.display = 'flex';
    } catch {}
  }
};
init()
  .then(() => { _initSettled = true; })
  .catch(e => { _initSettled = true; _initShowLoginFallback(e); });
setTimeout(() => {
  if (_initSettled) return;
  console.warn('[init] 30s 안전망 — hang 감지, login screen 강제 fallback');
  _initSettled = true;  // 이후 catch 가 또 호출돼도 idempotent.
  _initShowLoginFallback(new Error('init 30s 안전망 trigger'));
}, 30000);
