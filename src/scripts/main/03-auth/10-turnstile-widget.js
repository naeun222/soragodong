// ═══════════════════════════════════════════════════════════════
// TURNSTILE WIDGET (Phase 1)
// ═══════════════════════════════════════════════════════════════
// 사용자 명시 2026-05-05 ultrathink: Cloudflare Turnstile invisible widget.
// 게스트 chat 호출 직전 토큰 발급 → /api/chat 헤더 X-Turnstile-Token.
// Site key (frontend 공개): TURNSTILE_SITE_KEY (01-config.js).
// Secret key (server env): TURNSTILE_SECRET_KEY (Pages env).
// Widget mode = Managed — 일반 사용자 invisible 통과, 의심 트래픽만 챌린지 노출.
// Token = single-use, 5분 유효 — 매 chat 호출마다 새로 발급.

let _turnstileLoaded = false;
let _turnstileLoadPromise = null;

function _loadTurnstileScript() {
  if (_turnstileLoaded) return Promise.resolve();
  if (_turnstileLoadPromise) return _turnstileLoadPromise;
  _turnstileLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    // Turnstile JS API — explicit render mode (직접 turnstile.render 호출).
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.defer = true;
    s.onload = () => {
      _turnstileLoaded = true;
      resolve();
    };
    s.onerror = () => {
      _turnstileLoadPromise = null;  // retry 가능하게 reset
      reject(new Error('Turnstile 스크립트 로드 실패'));
    };
    document.head.appendChild(s);
  });
  return _turnstileLoadPromise;
}

function _ensureTurnstileContainer() {
  let container = document.getElementById('turnstileContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'turnstileContainer';
    // fixed bottom-right, hidden by default. 챌린지 시 widget 자동 visible.
    container.style.cssText = 'position:fixed; bottom:8px; right:8px; z-index:9999; display:none;';
    document.body.appendChild(container);
  }
  return container;
}

// 사용자 명시 2026-05-05: 매 호출 = 새 widget render → callback 으로 token 받음 → widget remove.
// Promise pattern + 30s safety timeout.
async function getTurnstileToken() {
  if (typeof TURNSTILE_SITE_KEY === 'undefined' || !TURNSTILE_SITE_KEY) {
    throw new Error('TURNSTILE_SITE_KEY 미설정');
  }
  await _loadTurnstileScript();
  if (!window.turnstile) throw new Error('Turnstile 객체 없음 — 스크립트 로드 실패');
  const container = _ensureTurnstileContainer();
  // 챌린지 표시 가능성 — 컨테이너 visible.
  container.style.display = 'block';
  return new Promise((resolve, reject) => {
    let resolved = false;
    let widgetId = null;
    const cleanup = () => {
      try { if (widgetId !== null) window.turnstile.remove(widgetId); } catch {}
      container.style.display = 'none';
    };
    const _safetyTimer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new Error('Turnstile 30초 timeout'));
      }
    }, 30000);
    try {
      widgetId = window.turnstile.render(container, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token) => {
          if (resolved) return;
          resolved = true;
          clearTimeout(_safetyTimer);
          cleanup();
          resolve(token);
        },
        'error-callback': (err) => {
          if (resolved) return;
          resolved = true;
          clearTimeout(_safetyTimer);
          cleanup();
          reject(new Error('Turnstile error: ' + (err || 'unknown')));
        },
        'timeout-callback': () => {
          if (resolved) return;
          resolved = true;
          clearTimeout(_safetyTimer);
          cleanup();
          reject(new Error('Turnstile widget timeout'));
        }
      });
    } catch (e) {
      resolved = true;
      clearTimeout(_safetyTimer);
      cleanup();
      reject(e);
    }
  });
}
