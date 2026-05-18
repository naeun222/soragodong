// ═══════════════════════════════════════════════════════════════
// AUTH (Supabase magic link)
// ═══════════════════════════════════════════════════════════════

// V4 fix (사용자 명시 2026-05-18 ultrathink): 카카오 OAuth deeplink 흐름 (14-capacitor-oauth-deeplink.js) 의 user_metadata.name → state.userName 매핑이 stored session 흐름엔 fire 안 함.
//   영향: 카카오 reload 후 checkSession() 가 stored session 으로 빠지면 state.userName='' 영구 → _hookOnbShouldShow 옛 가드 등에 잡힘 + 호명 fallback ('있잖아 ✦') 만 사용.
//   fix: checkSession 의 두 success branch (JWT 빠른 path / 풀 fetch path / refresh path) 모두 통과 후 호출.
function _mapUserMetadataNameToState(user) {
  try {
    if (typeof state === 'undefined' || !state) return;
    if (state.userName && String(state.userName).trim()) return;
    const _md = (user && user.user_metadata) || {};
    const _cands = [_md.name, _md.full_name, _md.preferred_username, _md.nickname, _md.given_name, _md.user_name];
    for (const c of _cands) {
      if (c && typeof c === 'string') {
        const v = c.trim();
        if (v.length >= 1 && v.length <= 20) {
          state.userName = v.slice(0, 20);
          if (typeof saveState === 'function') {
            try { saveState(true); } catch {}
          }
          break;
        }
      }
    }
  } catch {}
}

async function checkSession() {
  // Check if returning from magic link (URL hash contains tokens)
  if (window.location.hash.includes('access_token')) {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (access_token) {
      session = { access_token, refresh_token };
      // Get user info
      // V4 fix (사용자 보고 2026-05-18 ultrathink) — supabase 정지 시 hang 차단. timeout → throw → init().catch → showLoginScreen.
      try {
        const userResp = await _fetchWithTimeout(`${SUPABASE_URL}/auth/v1/user`, {
          headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${access_token}` }
        });
        if (userResp.ok) {
          const user = await userResp.json();
          session.user = user;
          authUserId = user.id;
          localStorage.setItem('soragodong_session', JSON.stringify(session));
          // Clean URL
          history.replaceState({}, document.title, window.location.pathname);
          return true;
        }
      } catch (e) {
        // timeout / network throw — 그대로 fall through 하여 stored session 또는 로그인 화면.
        console.warn('[checkSession hash] fetch fail/timeout:', e && e.message || e);
        // 옛 session 잔재 정리 — 같은 hash 로 무한 retry 회피.
        session = null;
      }
    }
  }
  // Check stored session
  const stored = localStorage.getItem('soragodong_session');
  if (stored) {
    try {
      session = JSON.parse(stored);
      // 사용자 명시 2026-05-05 (perf ultrathink): JWT exp 클라이언트 검증 — 만료 임박 X 면 /auth/v1/user RTT skip.
      // 효과: 앱 진입 첫 Supabase RTT (200-700ms) 절약. 토큰 만료/refresh 는 fetch interceptor 가 401 응답으로 자동 처리.
      // exp 마진 60s = clock skew 안전 영역. session.user 가 stored 에 있으면 즉시 인증된 것으로 처리.
      try {
        const _payloadB64 = (session.access_token || '').split('.')[1];
        if (_payloadB64 && session.user && session.user.id) {
          const _b64 = _payloadB64.replace(/-/g, '+').replace(/_/g, '/');
          const _payload = JSON.parse(decodeURIComponent(escape(atob(_b64))));
          const _now = Math.floor(Date.now() / 1000);
          if (_payload.exp && _payload.exp > _now + 60 && _payload.sub === session.user.id) {
            authUserId = session.user.id;
            // 사용자 명시 2026-05-05 (Phase 1): anonymous 사용자 detect — state.isGuest 마커.
            if (session.user.is_anonymous && typeof state !== 'undefined' && state) {
              state.isGuest = true;
            }
            return true;
          }
        }
      } catch (_jwtE) { /* JWT 디코드 실패 시 fallback fetch */ }
      // Verify token still valid
      // V4 fix (사용자 보고 2026-05-18 ultrathink) — timeout 박힌 wrapper. supabase 정지 시 hang 차단.
      const userResp = await _fetchWithTimeout(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${session.access_token}` }
      });
      if (userResp.ok) {
        const user = await userResp.json();
        session.user = user;
        authUserId = user.id;
        // 사용자 명시 2026-05-05 (Phase 1): anonymous 사용자 detect — state.isGuest 마커.
        if (user.is_anonymous && typeof state !== 'undefined' && state) {
          state.isGuest = true;
        }
        return true;
      } else {
        // 사용자 보고 2026-05-05 (audit High): _refreshSessionForApi 와 동일 inflight 가드 공유 — refresh_token rotation race 차단.
        // 이전 = checkSession 의 refresh 가 별도 fetch → 동시에 다른 fetch interceptor 의 _refreshSessionForApi 와 같은 refresh_token 두 번 사용 → 두 번째 invalid → 강제 로그아웃.
        if (session.refresh_token && typeof _refreshSessionForApi === 'function') {
          const refreshed = await _refreshSessionForApi();
          if (refreshed) return true;
        } else if (session.refresh_token) {
          // _refreshSessionForApi 미정의 (init 순서 race) — fallback 기존 직접 fetch
          // V4 fix (사용자 보고 2026-05-18 ultrathink) — timeout 박힌 wrapper.
          const refreshResp = await _fetchWithTimeout(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: session.refresh_token })
          });
          if (refreshResp.ok) {
            const newSession = await refreshResp.json();
            session = { ...session, access_token: newSession.access_token, refresh_token: newSession.refresh_token, user: newSession.user };
            authUserId = newSession.user.id;
            localStorage.setItem('soragodong_session', JSON.stringify(session));
            return true;
          }
        }
        // Refresh failed
        localStorage.removeItem('soragodong_session');
        session = null; authUserId = null;
        return false;
      }
    } catch (e) {
      console.error('Session check error:', e);
      localStorage.removeItem('soragodong_session');
      return false;
    }
  }
  return false;
}

async function sendOTP(email) {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      create_user: true,
      // No emailRedirectTo → user gets a code AND a link, we use the code
    })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.msg || err.error_description || err.message || '코드 전송 실패');
  }
  return true;
}

async function verifyOTP(email, token) {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      token,
      type: 'email'
    })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.msg || err.error_description || err.message || '코드가 틀렸어');
  }
  const data = await resp.json();
  // Returns { access_token, refresh_token, user }
  session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    user: data.user
  };
  authUserId = data.user.id;
  localStorage.setItem('soragodong_session', JSON.stringify(session));
  return true;
}

