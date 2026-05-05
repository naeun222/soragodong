
function showLoginScreen() {
  document.querySelector('.app').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
}

// 사용자 명시 2026-05-02 ultrathink: 동의 검증 + pending consent 저장 helper (이메일 OTP / SNS 로그인 둘 다 사용).
// PIPA §22 / §23 / §17 별도 동의 의무 충족 — 4 분리 체크박스 (약관/민감/국외/만19세).
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
    if (!consentAdult) missing.push('만 19세 이상 자기 선언');
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
  const redirectTo = window.location.origin;
  const scopeMap = { kakao: 'account_email' };
  const scopes = scopeMap[provider] || '';
  const scopeParam = scopes ? `&scopes=${encodeURIComponent(scopes)}` : '';
  const url = `${SUPABASE_URL}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectTo)}${scopeParam}`;
  // 사용자가 SNS 로그인 페이지로 이동 — redirect 후 Supabase callback → app session listener 자동 처리
  window.location.href = url;
}

