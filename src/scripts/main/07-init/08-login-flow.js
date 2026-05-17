
function showLoginScreen() {
  document.querySelector('.app').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  if (typeof _hideBootSplash === 'function') _hideBootSplash();
}

// 사용자 명시 2026-05-06 ultrathink (perf): boot splash hide — init/showLoginScreen 진입 시 호출.
// 5초 안전망 (어떤 init 경로 fail 이라도 자동 hide) 은 init-fn.js 안 setTimeout 으로 별도.
function _hideBootSplash() {
  const s = document.getElementById('bootSplash');
  if (!s) return;
  s.classList.add('fade-out');
  setTimeout(() => { try { s.remove(); } catch {} }, 320);
  // 사용자 명시 2026-05-09 ultrathink (perf 측정): 첫 진입 timing 한 번만 콘솔 출력 (재진입 시 noop).
  try {
    if (window._perfReported) return;
    window._perfReported = true;
    const splashHideAt = performance.now();
    const marks = performance.getEntriesByType('mark').reduce((acc, m) => { acc[m.name] = m.startTime; return acc; }, {});
    const navEntry = performance.getEntriesByType('navigation')[0] || {};
    const ttfb = Math.round(navEntry.responseStart || 0);
    const htmlDownload = Math.round((navEntry.responseEnd || 0) - (navEntry.responseStart || 0));
    const dcl = Math.round(navEntry.domContentLoadedEventEnd || 0);
    const fcp = Math.round((performance.getEntriesByType('paint').find(p => p.name === 'first-contentful-paint') || {}).startTime || 0);
    console.group('🐚 [perf] 첫 진입 timing (모두 ms)');
    console.log('TTFB (서버 응답):', ttfb);
    console.log('HTML download:', htmlDownload);
    console.log('FCP (첫 페인트):', fcp);
    console.log('DOMContentLoaded:', dcl);
    if (marks.bootStart) console.log('bootStart (body 시작 inline):', Math.round(marks.bootStart));
    if (marks.initStart) console.log('initStart (init 첫줄):', Math.round(marks.initStart));
    if (marks.sessionEnd) console.log('sessionEnd (checkSession 후):', Math.round(marks.sessionEnd));
    if (marks.cloudEnd) console.log('cloudEnd (loadFromCloud 후):', Math.round(marks.cloudEnd));
    console.log('splashHide (boot splash 사라짐):', Math.round(splashHideAt));
    console.log('— 구간별 차이 —');
    if (marks.bootStart && marks.initStart) console.log('JS parse 끝 → init 진입:', Math.round(marks.initStart - marks.bootStart));
    if (marks.initStart && marks.sessionEnd) console.log('checkSession RTT:', Math.round(marks.sessionEnd - marks.initStart));
    if (marks.sessionEnd && marks.cloudEnd) console.log('loadFromCloud RTT:', Math.round(marks.cloudEnd - marks.sessionEnd));
    if (marks.cloudEnd) console.log('cloudEnd → splashHide:', Math.round(splashHideAt - marks.cloudEnd));
    console.groupEnd();
  } catch (e) { /* perf 측정 실패해도 splash hide 는 그대로 */ }
}

// 사용자 명시 2026-05-02 ultrathink: 동의 검증 + pending consent 저장 helper (이메일 OTP / SNS 로그인 둘 다 사용).
// PIPA §22 / §23 / §17 별도 동의 의무 충족 — 4 분리 체크박스 (약관/민감/국외/만14세).
function _checkLoginConsentsAndSavePending(emailOrEmpty, loginMethod) {
  const consentTerms = document.getElementById('loginConsentTerms')?.checked;
  const consentSensitive = document.getElementById('loginConsentSensitive')?.checked;
  const consentCrossBorder = document.getElementById('loginConsentCrossBorder')?.checked;
  const consentAdult = document.getElementById('loginConsentAdult')?.checked;
  if (!consentTerms || !consentSensitive || !consentCrossBorder || !consentAdult) {
    const missing = [];
    if (!consentTerms) missing.push('약관·privacy');
    if (!consentSensitive) missing.push('민감정보 처리 (§23)');
    if (!consentCrossBorder) missing.push('국외이전 (§17)');
    if (!consentAdult) missing.push('만 14세 이상 자기 선언');
    alert('필수 동의 항목 모두 체크해야 시작 가능해.\n\n미체크: ' + missing.join(' / ') + '\n\n거부 시 서비스 이용 불가.');
    return false;
  }
  try {
    localStorage.setItem('soragodong_pending_consent', JSON.stringify({
      email: emailOrEmpty || '',
      consentTerms: !!consentTerms,
      consentSensitive: !!consentSensitive,
      consentCrossBorder: !!consentCrossBorder,
      consentAdult: !!consentAdult,
      loginMethod: loginMethod || 'email',
      at: new Date().toISOString(),
      versions: { terms: '1.1', privacy: '1.1', crossBorder: '2.1', refund: '1.1' }
    }));
  } catch (e) { console.warn('[consent] pending save:', e); }
  return true;
}

// 사용자 명시 2026-05-02 ultrathink: SNS 로그인 (카카오만 V4) — Supabase OAuth redirect 흐름.
// E2EE master password layer 보존 — SNS 인증 후 기존 비밀번호 모달이 자동 trigger.
// 사용자 명시 2026-05-02: 네이버 = V5 — 네이버 정책상 SNS 가입 시 '별도 비밀번호 요구 X' 의무 → E2EE 강제 흐름과 충돌. V5 휴대폰 본인 인증과 함께 재검토.
async function loginWithProvider(provider) {
  if (!['kakao'].includes(provider)) {
    alert('지원하지 않는 로그인: ' + provider);
    return;
  }
  // 사용자 명시 2026-05-06: 동의 검증은 비밀번호 설정 모달 (showE2EEPasswordSetupModal) 에서 일괄 처리.
  // 로그인 화면 = SNS button 만, 동의 X. callback 후 신규 사용자 식별 위해 loginMethod 만 stash.
  try {
    localStorage.setItem('soragodong_pending_consent', JSON.stringify({
      email: '', loginMethod: provider, at: new Date().toISOString()
    }));
  } catch {}
  // Supabase OAuth redirect — /auth/v1/authorize?provider=X&redirect_to=Y
  // 사용자 명시 2026-05-02: 카카오 = 이메일만 (PIPA 데이터 최소 수집). Supabase default scope (profile_nickname/profile_image) 제외 — scopes=account_email 명시.
  // V4 fix (사용자 보고 2026-05-18 ultrathink): Capacitor native 환경 분기.
  //   web = 기존 동일 (window.location.href).
  //   Capacitor = redirect_to 를 custom scheme 으로 + @capacitor/browser 외부 Chrome Custom Tabs 호출.
  //   Custom Tabs 안에서 카카오 OAuth → 카카오톡 앱 SSO deep link OK → 인증 완료 → custom scheme redirect → AndroidManifest intent-filter 캡처 → 03-auth/10-capacitor-oauth-deeplink.js 의 appUrlOpen listener 가 token 처리.
  //   USER ACTION 필요: Supabase Dashboard > Authentication > URL Configuration > Redirect URLs 에 'com.soragodong.app://oauth-callback' 추가.
  const isNative = (typeof isCapacitorNative === 'function' && isCapacitorNative());
  const redirectTo = isNative ? 'com.soragodong.app://oauth-callback' : window.location.origin;
  const scopeMap = { kakao: 'account_email' };
  const scopes = scopeMap[provider] || '';
  const scopeParam = scopes ? `&scopes=${encodeURIComponent(scopes)}` : '';
  const url = `${SUPABASE_URL}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectTo)}${scopeParam}`;
  if (isNative && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
    try {
      await window.Capacitor.Plugins.Browser.open({ url, presentationStyle: 'popover' });
      return;
    } catch (e) {
      console.warn('[oauth native] Browser.open fail, fallback:', e);
    }
  }
  // 사용자가 SNS 로그인 페이지로 이동 — redirect 후 Supabase callback → app session listener 자동 처리
  window.location.href = url;
}

