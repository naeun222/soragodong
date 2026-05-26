// ═══════════════════════════════════════════════════════════════
// ANONYMOUS GUEST SIGN-IN (Phase 1)
// ═══════════════════════════════════════════════════════════════
// 사용자 명시 2026-05-05 ultrathink: Supabase anonymous sign-in 으로 게스트 진입.
// 첫 진입자 (세션 X) 자동 anonymous user 가입 → /api/chat verifyAuth 통과 (실제 JWT).
// linkIdentity (가입 전환) 시 같은 uid 유지 → 마이그레이션 코드 X (uid 영속).
// Anonymous Sign-Ins 토글 비활성 시 폴백 = login 화면 노출.

async function signInAnonymouslyForGuest() {
  try {
    // _anthropicOrigFetch 사용 — fetch interceptor 우회 (chat URL 아니라 안 swap 되긴 하지만 안전)
    const _fetch = (typeof window !== 'undefined' && window._anthropicOrigFetch) || fetch;
    const resp = await _fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      // body 비우면 anonymous sign-in (Anonymous Sign-Ins 토글 ON 필요).
      body: JSON.stringify({ data: {} })
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.error('[anonymous signup] fail:', resp.status, errText);
      // 422 / 400 = anonymous 비활성. 503 = Supabase 다운.
      if (resp.status === 422 || resp.status === 400) {
        return { ok: false, reason: 'anonymous_disabled', detail: errText.slice(0, 200) };
      }
      return { ok: false, reason: 'network', status: resp.status, detail: errText.slice(0, 200) };
    }
    const data = await resp.json();
    // V4 fix (사용자 명시 2026-05-26 ultrathink — refresh_token 검증): refresh_token 누락 시 access_token 만 박혀도 1시간 후 silent 로그아웃.
    //   _refreshSessionForApi 는 refresh_token 없으면 false return — 게스트는 자동 갱신 권리 X.
    if (!data?.access_token || !data?.user?.id || !data?.refresh_token) {
      return { ok: false, reason: 'invalid_response' };
    }
    session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user: data.user
    };
    authUserId = data.user.id;
    if (typeof state !== 'undefined' && state) {
      state.isGuest = true;
    }
    localStorage.setItem('soragodong_session', JSON.stringify(session));
    console.log('[guest] anonymous user 생성 — uid=' + authUserId);
    return { ok: true };
  } catch (e) {
    console.error('[anonymous signup] throw:', e);
    return { ok: false, reason: 'throw', detail: String(e?.message || e).slice(0, 200) };
  }
}
