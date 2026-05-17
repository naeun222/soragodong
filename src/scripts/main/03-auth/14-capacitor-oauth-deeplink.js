// ═══════════════════════════════════════════════════════════════
// V4 fix (사용자 보고 2026-05-18 ultrathink) — Capacitor native OAuth deep link.
//
// 흐름:
//   1. loginWithProvider('kakao') 가 Capacitor 환경 감지 → @capacitor/browser 의 Browser.open() 으로
//      외부 Chrome Custom Tabs 띄움. URL = Supabase /auth/v1/authorize?redirect_to=com.soragodong.app://oauth-callback
//   2. Chrome Custom Tabs 안에서 카카오 OAuth (카카오톡 앱 SSO deep link 가능).
//   3. 인증 후 Supabase 가 com.soragodong.app://oauth-callback#access_token=...&refresh_token=... 으로 redirect.
//   4. AndroidManifest 의 custom scheme intent-filter 가 캡처 → MainActivity 가 받아 appUrlOpen event fire.
//   5. 아래 listener 가 URL hash 의 token 파싱 → Supabase /auth/v1/user 로 user 조회 → session 글로벌 set
//      → Browser.close() (Custom Tabs 닫기) → location.reload() (게스트 → 로그인 상태 reload).
//
// USER ACTION:
//   Supabase Dashboard > Authentication > URL Configuration > Redirect URLs 에
//   `com.soragodong.app://oauth-callback` 추가 필수.
// ═══════════════════════════════════════════════════════════════

(function _initCapacitorOAuthDeepLink() {
  try {
    if (typeof window === 'undefined' || !window.Capacitor) return;
    if (typeof window.Capacitor.getPlatform !== 'function') return;
    const platform = window.Capacitor.getPlatform();
    if (platform !== 'android' && platform !== 'ios') return;
    const App = window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (!App || typeof App.addListener !== 'function') {
      console.warn('[capacitor oauth] @capacitor/app plugin 미설치 — deep link listener skip');
      return;
    }
    App.addListener('appUrlOpen', async (event) => {
      try {
        const rawUrl = (event && event.url) || '';
        if (!rawUrl) return;
        if (rawUrl.indexOf('com.soragodong.app://oauth-callback') !== 0) return;
        // hash 파싱 — custom scheme URL 도 URL() 가 처리. fallback: 수동 split.
        let hash = '';
        try {
          const u = new URL(rawUrl);
          hash = u.hash || '';
        } catch {
          const idx = rawUrl.indexOf('#');
          hash = idx >= 0 ? rawUrl.substring(idx) : '';
        }
        if (!hash || hash.indexOf('access_token') < 0) {
          console.warn('[capacitor oauth] callback URL 에 access_token 없음:', rawUrl);
          return;
        }
        const params = new URLSearchParams(hash.charAt(0) === '#' ? hash.substring(1) : hash);
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');
        if (!access_token) return;
        // Browser 닫기 (Custom Tabs) — background 로 가있음. 사용자 시각 정리.
        try {
          const Browser = window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
          if (Browser && Browser.close) await Browser.close();
        } catch (e) { console.warn('[capacitor oauth] Browser.close:', e); }
        // user 조회 — 01-session-otp.js 와 같은 방식
        const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
          headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${access_token}` }
        });
        if (!userResp.ok) {
          console.warn('[capacitor oauth] user fetch fail:', userResp.status);
          return;
        }
        const user = await userResp.json();
        // session 글로벌 set + localStorage 저장.
        // V4 fix (사용자 보고 2026-05-18 ultrathink): 01-session-otp.js 의 checkSession() 가 'soragodong_session' key 로 읽음 —
        //   포맷 { access_token, refresh_token, user } 동일 (line 20 의 setItem 과 일치).
        //   기존엔 'sb-<ref>-auth-token' 으로 잘못 저장 → reload 후 stored session 못 찾고 로그인 화면 다시 표시되던 버그.
        const newSession = { access_token, refresh_token, user };
        try {
          localStorage.setItem('soragodong_session', JSON.stringify(newSession));
        } catch (e) { console.warn('[capacitor oauth] localStorage:', e); }
        // 전역 session 도 즉시 set — reload 직전 다른 코드 race 대비.
        try {
          session = newSession;
          authUserId = user.id;
          // 게스트 마커 명시 제거 — user.is_anonymous=false 이므로.
          if (typeof state !== 'undefined' && state && state.isGuest) {
            state.isGuest = false;
          }
          // V4 fix (사용자 보고 2026-05-18 ultrathink): 카카오 user_metadata.name → state.userName 매핑.
          //   _hookOnbShouldShow (07-init/15-hook-onboarding.js:30) 가 userName 비어있으면 푸시 prompt 영구 skip.
          //   OTP 흐름은 onboarding 모달이 userName 채우지만, 카카오 OAuth 는 onboarding 우회 → 영구 ''.
          //   beforeunload listener 가 reload() 직후 _flushLocalSave({sync:true}) 호출 → localStorage 안전 박힘.
          if (typeof state !== 'undefined' && state && (!state.userName || !state.userName.trim())) {
            const _md = (user && user.user_metadata) || {};
            const _cands = [_md.name, _md.full_name, _md.preferred_username, _md.nickname, _md.given_name, _md.user_name];
            for (const c of _cands) {
              if (c && typeof c === 'string') {
                const v = c.trim();
                if (v.length >= 1 && v.length <= 20) { state.userName = v.slice(0, 20); break; }
              }
            }
            if (state.userName && typeof saveState === 'function') {
              try { saveState(true); } catch (e) { console.warn('[capacitor oauth] saveState:', e); }
            }
          }
        } catch {}
        // location.reload() — 게스트 모드로 떠있는 UI 전체 → 로그인 사용자 흐름으로 재초기화.
        try { window.location.reload(); } catch {}
      } catch (e) {
        console.warn('[capacitor oauth] appUrlOpen handler:', e);
      }
    });
    console.log('[capacitor oauth] deep link listener registered');
  } catch (e) {
    console.warn('[capacitor oauth] init:', e);
  }
})();
