function authHeaders() {
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${session.access_token}`
  };
}

// 사용자 요청 2026-04-28: 서버 시간 동기화 — 디바이스 시계 잘못돼도 정확한 시간 사용
let _serverTimeOffset = 0;  // serverTime - localTime (ms)
async function syncServerTime() {
  try {
    // 사용자 보고 2026-05-01: Supabase /rest/v1/ HEAD 가 401 ('No API key found' 오해 메시지) — apikey 보내도 root endpoint 가 HEAD 거부.
    // → 우리 own origin /version.txt HEAD (Cloudflare 시간, NTP 동기, 인증 X).
    const start = Date.now();
    const resp = await fetch('/version.txt?_t=' + start, { method: 'HEAD', cache: 'no-store' });
    const end = Date.now();
    const dateHeader = resp.headers.get('Date');
    if (dateHeader) {
      const serverMs = new Date(dateHeader).getTime();
      const networkLag = (end - start) / 2;  // 절반은 응답 받는 시간
      const adjustedLocal = (start + end) / 2;  // request 평균 시점
      _serverTimeOffset = serverMs - adjustedLocal;
      if (Math.abs(_serverTimeOffset) > 60000) {  // 1분 이상 차이
        console.log(`[serverTime] offset: ${Math.round(_serverTimeOffset / 60000)}분 차이 (디바이스 시계 부정확)`);
      }
    }
  } catch (e) { console.warn('serverTime sync failed:', e); }
}
function getServerNow() {
  return new Date(Date.now() + _serverTimeOffset);
}
function getServerNowMs() {
  return Date.now() + _serverTimeOffset;
}

// ═══════════════════════════════════════════════════════════════
// E2EE (Stage 2) — 사용자 요청 2026-04-30 / Phase 0 강화 2026-05-02
