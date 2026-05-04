// ═══════════════════════════════════════════════════════════════
// AUTH (Supabase magic link)
// ═══════════════════════════════════════════════════════════════
async function checkSession() {
  // Check if returning from magic link (URL hash contains tokens)
  if (window.location.hash.includes('access_token')) {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (access_token) {
      session = { access_token, refresh_token };
      // Get user info
      const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
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
    }
  }
  // Check stored session
  const stored = localStorage.getItem('soragodong_session');
  if (stored) {
    try {
      session = JSON.parse(stored);
      // Verify token still valid
      const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${session.access_token}` }
      });
      if (userResp.ok) {
        const user = await userResp.json();
        session.user = user;
        authUserId = user.id;
        return true;
      } else {
        // Try refresh
        if (session.refresh_token) {
          const refreshResp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
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

