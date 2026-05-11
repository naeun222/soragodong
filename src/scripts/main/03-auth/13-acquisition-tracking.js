// 사용자 요청 2026-05-11: 영상 마케팅 유입 추적 — first-touch URL params 캡처 + 가입 후 1회 업로드.
// 익명 가입자 / 실가입자 모두 대상. 첫 방문 URL 의 utm + referer + UA 를 localStorage 에 영구 캡처.
// 가입 후 (또는 첫 인증된 진입 시) soragodong_acquisition 테이블에 PRIMARY KEY=user_id 로 1회 insert.
// 재 insert 충돌 시 'Prefer: resolution=ignore-duplicates' 헤더로 silent skip — 첫 attribution 보존.
//
// 호출 지점: 07-init/01-init-fn.js 에서 await loadFromCloud() 뒤에 fire-and-forget.

// ── 부팅 시점에 즉시 캡처 (인증 / 동의 무관). 이미 있으면 skip. ──
(function captureFirstTouch() {
  try {
    if (localStorage.getItem('sora_first_touch')) return;
    const params = new URLSearchParams(window.location.search);
    const touch = {
      referer: document.referrer || null,
      utm_source: params.get('utm_source') || null,
      utm_medium: params.get('utm_medium') || null,
      utm_campaign: params.get('utm_campaign') || null,
      utm_content: params.get('utm_content') || null,
      utm_term: params.get('utm_term') || null,
      user_agent: (navigator && navigator.userAgent) || null,
      captured_at: new Date().toISOString(),
    };
    localStorage.setItem('sora_first_touch', JSON.stringify(touch));
  } catch (_) { /* 어떤 환경에서든 silent fail — 마케팅 데이터는 best-effort */ }
})();

async function maybeUploadAcquisition() {
  try {
    if (localStorage.getItem('sora_acquisition_uploaded')) return;
    if (typeof session === 'undefined' || !session || !session.access_token || !session.user || !session.user.id) return;
    const raw = localStorage.getItem('sora_first_touch');
    if (!raw) return;
    let ft;
    try { ft = JSON.parse(raw); } catch { return; }
    if (!ft) return;

    const resp = await fetch(`${SUPABASE_URL}/rest/v1/soragodong_acquisition`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        // 이미 row 있으면 (재방문 등) PRIMARY KEY conflict → silent skip. 첫 attribution 보존.
        'Prefer': 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify({
        user_id: session.user.id,
        signup_referer: ft.referer,
        signup_utm_source: ft.utm_source,
        signup_utm_medium: ft.utm_medium,
        signup_utm_campaign: ft.utm_campaign,
        signup_utm_content: ft.utm_content,
        signup_utm_term: ft.utm_term,
        signup_user_agent: ft.user_agent,
      }),
    });
    // 2xx 또는 409 (conflict, ignore-duplicates 가 처리) 모두 성공으로 간주.
    if (resp.ok || resp.status === 409) {
      localStorage.setItem('sora_acquisition_uploaded', '1');
    }
    // 4xx (RLS / table 없음 등) / 5xx 는 silent — 다음 진입 시 자동 재시도.
  } catch (_) { /* silent — 네트워크 / 테이블 없음 / 권한 모두 best-effort */ }
}
