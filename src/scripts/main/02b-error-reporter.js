// 사용자 명시 2026-05-05 ultrathink-3: 에러 자동 개발자 보고 + 1h dedupe.
// 호출: reportError({ signature, detail, stack, ...meta })
// signature = dedupe key. localStorage 에 시간 stamp 저장 — 같은 signature 1h 안 다시 안 보냄.
// 30일 이상 된 dedupe 항목 자동 cleanup (localStorage 누적 방지).
//
// backend = /api/error-report → Resend API → soragodongapp@gmail.com.
// RESEND_API_KEY 가 backend env 에 없으면 silent skip (코드 batch 안 깨짐).
//
// 글로벌 후킹: window 'error' / 'unhandledrejection' 자동 캡처. 일부 noise 필터.
const _REPORTED_ERRORS_KEY = '_sora_reported_errors';
const _REPORT_DEDUPE_MS = 60 * 60 * 1000;        // 1h
const _REPORT_RETAIN_MS = 30 * 24 * 60 * 60 * 1000;  // 30d

function _loadReportedErrors() {
  try { return JSON.parse(localStorage.getItem(_REPORTED_ERRORS_KEY) || '{}') || {}; }
  catch { return {}; }
}
function _saveReportedErrors(map) {
  try { localStorage.setItem(_REPORTED_ERRORS_KEY, JSON.stringify(map)); } catch {}
}

async function reportError(errorInfo) {
  if (!errorInfo || !errorInfo.signature) return;
  const sig = String(errorInfo.signature).slice(0, 200);
  const now = Date.now();
  const sent = _loadReportedErrors();
  // dedupe — 1h 안 같은 signature 재전송 X
  if (sent[sig] && (now - sent[sig]) < _REPORT_DEDUPE_MS) return;
  // 30일 지난 항목 cleanup
  for (const k in sent) {
    if (now - sent[k] > _REPORT_RETAIN_MS) delete sent[k];
  }
  sent[sig] = now;
  _saveReportedErrors(sent);

  const payload = {
    signature: sig,
    detail: String(errorInfo.detail || '').slice(0, 4000),
    stack: String(errorInfo.stack || '').slice(0, 4000),
    time: new Date().toISOString(),
    userId: (typeof session !== 'undefined' && session && session.user && session.user.id) || 'anonymous',
    appVersion: (typeof window !== 'undefined' && window.APP_VERSION) || 'unknown',
    userAgent: (typeof navigator !== 'undefined' && navigator.userAgent) || '',
    url: (typeof location !== 'undefined' && location.href) || ''
  };

  try {
    await fetch('/api/error-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true  // 페이지 종료 직전에도 발송 가능 (unhandledrejection 등)
    });
  } catch {} // 보고 자체 실패는 silent — 사용자 경험에 영향 X
}

// dedupe 무시 강제 보고 (테스터 / 디버그)
function _reportErrorForce(errorInfo) {
  const sent = _loadReportedErrors();
  delete sent[errorInfo?.signature];
  _saveReportedErrors(sent);
  return reportError(errorInfo);
}

// 글로벌 후킹 — JS uncaught error / unhandled promise rejection
(function _initGlobalErrorHooks() {
  if (typeof window === 'undefined') return;

  const _isNoise = (msg) => {
    const s = String(msg || '');
    // 사용자 영향 X / 노이즈 — extension / aborted fetch / network 일시 / etc
    if (!s) return true;
    if (s === 'Script error.') return true;  // CORS-blocked 3rd party
    if (/ResizeObserver loop/.test(s)) return true;
    if (/Load failed/.test(s)) return true;
    if (/AbortError/.test(s)) return true;
    if (/Failed to fetch/.test(s)) return true;
    if (/NetworkError/.test(s)) return true;
    // 사용자 보고 2026-05-06: 인스티즈 / 카톡 등 inApp browser 가 페이지 line:1 col:9 위치에
    // 자체 JS 를 inject — `shakehot` 등 자기네 글로벌 참조해서 ReferenceError. 우리 코드 X.
    // pattern: 변수명 (kakao / shake / webkit_messageHandlers / __naver / instiz / iamfinder ...)
    if (/Can't find variable: (?:shakehot|memno|kakao|__naver|instiz|iamfinder|webkit_messageHandlers|FB|fbq|gtag|gaplugin|_caplugin|__bizm|__line)/i.test(s)) return true;
    if (/(?:shakehot|memno|webkit_messageHandlers|window\.kakao) is not defined/i.test(s)) return true;
    // 빈 객체 / null / undefined reason — 디버깅 불가.
    if (s === '{}' || s === 'null' || s === 'undefined' || s === '[object Object]') return true;
    return false;
  };

  // inApp browser 가 line:1 (HTML doctype) 에 inject 한 ReferenceError = 우리 코드 X.
  // filename = page URL 이거나 빈 문자열, lineno = 1~3, msg 가 ReferenceError 패턴이면 noise.
  const _isInjectedThirdParty = (filename, lineno, msg) => {
    const s = String(msg || '');
    if (lineno && lineno > 5) return false;
    if (!/ReferenceError|Can't find variable|is not defined/i.test(s)) return false;
    const f = String(filename || '');
    // page URL 자체 (path = '/' 또는 '/start' 같은 우리 HTML route) 또는 빈 문자열.
    if (!f || f === location.href || /\/(?:start|startlite|info|index)?\/?$/.test(f.replace(location.origin, ''))) return true;
    return false;
  };

  window.addEventListener('error', (e) => {
    const msg = (e && e.message) || '';
    if (_isNoise(msg)) return;
    const file = (e && e.filename) || 'unknown';
    const line = (e && e.lineno) || 0;
    if (_isInjectedThirdParty(file, line, msg)) return;
    const sig = `js-error|${file.split('/').pop()}:${line}|${msg.slice(0, 80)}`;
    reportError({
      signature: sig,
      detail: msg,
      stack: (e && e.error && e.error.stack) || ''
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    const r = e && e.reason;
    const msg = (r && r.message) || (typeof r === 'string' ? r : '') || String(r);
    if (_isNoise(msg)) return;
    const sig = `promise-reject|${msg.slice(0, 100)}`;
    reportError({
      signature: sig,
      detail: msg,
      stack: (r && r.stack) || ''
    });
  });
})();

