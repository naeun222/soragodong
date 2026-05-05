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
    return false;
  };

  window.addEventListener('error', (e) => {
    const msg = (e && e.message) || '';
    if (_isNoise(msg)) return;
    const file = (e && e.filename) || 'unknown';
    const line = (e && e.lineno) || 0;
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

