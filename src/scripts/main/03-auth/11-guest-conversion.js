// ═══════════════════════════════════════════════════════════════
// GUEST CONVERSION (Phase 1c)
// ═══════════════════════════════════════════════════════════════
// 사용자 명시 2026-05-05 ultrathink: 게스트 → 가입자 전환 흐름.
// trigger: chat 402 + code='GUEST_LIMIT' (한도 도달) OR 사용자 직접 (설정/CTA).
// 흐름:
//   step 1: 이메일 + PIPA 동의 4종 → updateUser({email}) → OTP 발송
//   step 2: OTP 입력 → verifyOtp(type='email_change') → session 갱신 (is_anonymous=false, 같은 uid)
//   step 3: E2EE 비밀번호 (12자+) → _e2eeSetupNewUser → state 암호화 → saveToCloudNow 첫 호출
//   step 4: 완료 — billing 자동 승격 (다음 chat/usage 호출 시 backend 가 promoteGuestToEarlyLight)
//
// 핵심: uid 영속 — chat 기록 / billing row / 4단 분석 결과 모두 같은 uid 에 묶여 자동 마이그레이션.

let _guestConvState = null;  // { email, password, sentAt }

function showGuestConversionModal(opts) {
  const reason = (opts && opts.reason) || 'limit';  // 'limit' | 'manual'
  _guestConvState = {};
  _renderGuestConvModal('email', { reason });
}

function _renderGuestConvModal(step, ctx) {
  // 기존 모달 제거
  const existing = document.getElementById('guestConvModal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'guestConvModal';
  overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:10000; display:flex; align-items:center; justify-content:center; padding:20px;';

  const card = document.createElement('div');
  card.style.cssText = 'background:var(--surface); border-radius:16px; max-width:420px; width:100%; max-height:90vh; overflow-y:auto; padding:24px; box-shadow:0 20px 60px rgba(0,0,0,0.5);';
  overlay.appendChild(card);

  if (step === 'email') {
    const reasonText = (ctx && ctx.reason === 'limit')
      ? `<div style="background:rgba(212,167,106,0.08); border-left:3px solid var(--accent); padding:12px 14px; border-radius:0 8px 8px 0; margin-bottom:18px; font-size:13px; color:var(--text); line-height:1.7;">잠깐 — 게스트 한도 다 썼어.</div>`
      : '';
    card.innerHTML = `
      <div style="font-family:'Gowun Batang',serif; font-size:20px; color:var(--accent); margin-bottom:6px;">🔒 종단간 암호화 로그인</div>
      <div style="font-size:12px; color:var(--text-soft); margin-bottom:18px; line-height:1.7;">데이터 안 잃어버리려면 + 아무도 못 보게 하려면 (개발자도 포함) 로그인 필요.</div>
      ${reasonText}
      <input type="email" id="guestConvEmail" placeholder="이메일" style="width:100%; padding:12px 14px; border-radius:10px; background:var(--surface2); border:1px solid var(--border-strong); color:var(--text); font-size:14px; margin-bottom:14px;">

      <div style="font-size:11px; color:var(--text-soft); margin-bottom:8px;">필수 동의 (PIPA):</div>
      <label style="display:flex; align-items:flex-start; gap:8px; padding:8px 0; font-size:11px; color:var(--text); cursor:pointer; line-height:1.5;">
        <input type="checkbox" id="guestConsentTerms" style="margin-top:3px;">
        <span><b>약관 · 개인정보 처리방침</b> 동의 (필수)</span>
      </label>
      <label style="display:flex; align-items:flex-start; gap:8px; padding:8px 0; font-size:11px; color:var(--text); cursor:pointer; line-height:1.5;">
        <input type="checkbox" id="guestConsentSensitive" style="margin-top:3px;">
        <span><b>민감정보 처리</b> 동의 — 정신건강 관련 대화 처리 (필수, PIPA §23)</span>
      </label>
      <label style="display:flex; align-items:flex-start; gap:8px; padding:8px 0; font-size:11px; color:var(--text); cursor:pointer; line-height:1.5;">
        <input type="checkbox" id="guestConsentCrossBorder" style="margin-top:3px;">
        <span><b>국외 이전</b> 동의 — Anthropic API (미국) 처리 (필수, PIPA §17)</span>
      </label>
      <label style="display:flex; align-items:flex-start; gap:8px; padding:8px 0 14px; font-size:11px; color:var(--text); cursor:pointer; line-height:1.5;">
        <input type="checkbox" id="guestConsentAdult" style="margin-top:3px;">
        <span><b>만 19세 이상</b> 자기 선언 (필수)</span>
      </label>

      <div style="display:flex; gap:8px;">
        <button onclick="_closeGuestConvModal()" style="flex:1; padding:11px; background:transparent; border:1px solid var(--border-strong); color:var(--text-dim); border-radius:10px; cursor:pointer; font-size:13px;">나중에</button>
        <button onclick="_guestConvSendOtp()" class="btn-primary" style="flex:2; padding:11px; font-size:13px; font-weight:600;">인증 코드 받기 →</button>
      </div>
      <div style="font-size:10.5px; color:var(--text-soft); margin-top:14px; line-height:1.6; text-align:center;">로그인 후 ~30일 무료. 만료 후 원하면 직접 light/premium.</div>
    `;
  } else if (step === 'otp') {
    card.innerHTML = `
      <div style="font-family:'Gowun Batang',serif; font-size:20px; color:var(--accent); margin-bottom:6px;">인증 코드 ✦</div>
      <div style="font-size:13px; color:var(--text); margin-bottom:14px; line-height:1.7;"><b>${escapeHtml(_guestConvState.email)}</b> 로 6자리 코드 보냈어. 메일함 (스팸함도) 확인.</div>
      <input type="text" id="guestConvOtp" placeholder="6자리 코드" maxlength="6" inputmode="numeric" style="width:100%; padding:12px 14px; border-radius:10px; background:var(--surface2); border:1px solid var(--border-strong); color:var(--text); font-size:18px; letter-spacing:8px; text-align:center; margin-bottom:14px;">
      <div style="display:flex; gap:8px;">
        <button onclick="_renderGuestConvModal('email', {reason:'limit'})" style="flex:1; padding:11px; background:transparent; border:1px solid var(--border-strong); color:var(--text-dim); border-radius:10px; cursor:pointer; font-size:13px;">← 이메일 다시</button>
        <button onclick="_guestConvVerifyOtp()" class="btn-primary" style="flex:2; padding:11px; font-size:13px; font-weight:600;">확인 →</button>
      </div>
      <div style="font-size:11px; color:var(--text-soft); margin-top:14px; text-align:center;">코드 안 와? <a href="javascript:void(0)" onclick="_guestConvSendOtp()" style="color:var(--accent);">다시 보내기</a></div>
    `;
    setTimeout(() => { const el = document.getElementById('guestConvOtp'); if (el) el.focus(); }, 100);
  } else if (step === 'password') {
    card.innerHTML = `
      <div style="font-family:'Gowun Batang',serif; font-size:20px; color:var(--accent); margin-bottom:6px;">비밀번호 만들기 ✦</div>
      <div style="font-size:12px; color:var(--text-soft); margin-bottom:14px; line-height:1.7;">네 데이터는 <b>이 비밀번호로 암호화</b>돼서 저장돼. 다른 기기에서 열려면 같은 비밀번호 필요. <b>잊으면 복구 불가능</b> — 안전한 곳에 적어둬.</div>
      <input type="password" id="guestConvPass1" placeholder="비밀번호 (12자 이상)" style="width:100%; padding:12px 14px; border-radius:10px; background:var(--surface2); border:1px solid var(--border-strong); color:var(--text); font-size:14px; margin-bottom:10px;">
      <input type="password" id="guestConvPass2" placeholder="비밀번호 다시" style="width:100%; padding:12px 14px; border-radius:10px; background:var(--surface2); border:1px solid var(--border-strong); color:var(--text); font-size:14px; margin-bottom:14px;">
      <button onclick="_guestConvSetupE2EE()" class="btn-primary" style="width:100%; padding:12px; font-size:14px; font-weight:600;">저장하고 시작하기 ✦</button>
    `;
    setTimeout(() => { const el = document.getElementById('guestConvPass1'); if (el) el.focus(); }, 100);
  } else if (step === 'syncing') {
    card.innerHTML = `
      <div style="text-align:center; padding:30px 20px;">
        <div style="font-size:32px; margin-bottom:14px;">🌊</div>
        <div style="font-family:'Gowun Batang',serif; font-size:18px; color:var(--accent); margin-bottom:8px;">암호화하고 있어...</div>
        <div style="font-size:12px; color:var(--text-soft); line-height:1.7;">네 데이터를 안전하게 클라우드로 옮기는 중.<br>잠시만.</div>
      </div>
    `;
  } else if (step === 'done') {
    card.innerHTML = `
      <div style="text-align:center; padding:20px 12px;">
        <div style="font-size:36px; margin-bottom:14px;">🔒</div>
        <div style="font-family:'Gowun Batang',serif; font-size:20px; color:var(--accent); margin-bottom:10px;">암호화 완료</div>
        <div style="font-size:13px; color:var(--text); line-height:1.8; margin-bottom:18px;">이제 데이터는 너만 풀 수 있어.<br>기존 대화 + 분석 그대로 이어가.</div>
        <button onclick="_closeGuestConvModal()" class="btn-primary" style="width:100%; padding:12px; font-size:14px; font-weight:600;">계속하기</button>
      </div>
    `;
  }

  document.body.appendChild(overlay);
}

function _closeGuestConvModal() {
  const m = document.getElementById('guestConvModal');
  if (m) m.remove();
  _guestConvState = null;
}

async function _guestConvSendOtp() {
  const email = (document.getElementById('guestConvEmail')?.value || '').trim().toLowerCase();
  if (_guestConvState && _guestConvState.email && !email) {
    // 'OTP 다시 보내기' 케이스 — 이전 이메일 재사용
  } else {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert('올바른 이메일을 입력해줘.');
      return;
    }
    // PIPA 동의 검증 (state.preferences.consentLog 도 동시 stash)
    const cTerms = document.getElementById('guestConsentTerms')?.checked;
    const cSensitive = document.getElementById('guestConsentSensitive')?.checked;
    const cCross = document.getElementById('guestConsentCrossBorder')?.checked;
    const cAdult = document.getElementById('guestConsentAdult')?.checked;
    if (!cTerms || !cSensitive || !cCross || !cAdult) {
      alert('필수 동의 4종 모두 체크해야 가입 가능해 (PIPA 의무).');
      return;
    }
    _guestConvState = { email, consents: { cTerms, cSensitive, cCross, cAdult } };
  }

  if (!session || !session.access_token) {
    alert('세션 끊김 — 페이지 새로고침');
    return;
  }
  try {
    // Supabase: PUT /auth/v1/user with email → OTP 발송 (email_change confirmation).
    const _fetch = window._anthropicOrigFetch || fetch;
    const resp = await _fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + session.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: _guestConvState.email })
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      console.error('[guest conv] updateUser fail:', resp.status, err);
      let msg = '인증 코드 전송 실패.';
      if (resp.status === 422) msg = '이미 사용 중인 이메일이거나 이메일 형식 오류.';
      alert(msg);
      return;
    }
    _guestConvState.sentAt = Date.now();
    _renderGuestConvModal('otp');
  } catch (e) {
    console.error('[guest conv] updateUser throw:', e);
    alert('네트워크 오류 — 잠시 후 다시');
  }
}

async function _guestConvVerifyOtp() {
  const otp = (document.getElementById('guestConvOtp')?.value || '').trim();
  if (!/^\d{6}$/.test(otp)) {
    alert('6자리 숫자 코드를 입력해줘.');
    return;
  }
  try {
    // Supabase: POST /auth/v1/verify with type='email_change' → session 갱신 (is_anonymous=false, 같은 uid).
    const _fetch = window._anthropicOrigFetch || fetch;
    const resp = await _fetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: _guestConvState.email,
        token: otp,
        type: 'email_change'
      })
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      console.error('[guest conv] verify fail:', resp.status, err);
      let msg = '코드가 맞지 않아.';
      if (resp.status === 401 || resp.status === 403) msg = '코드 만료 또는 잘못됨 — 다시 요청해줘.';
      alert(msg);
      return;
    }
    const data = await resp.json();
    if (!data?.access_token || !data?.user?.id) {
      alert('인증 응답 형식 오류');
      return;
    }
    // session 갱신 — 같은 uid 유지 (linkIdentity 효과).
    session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user: data.user
    };
    authUserId = data.user.id;
    state.isGuest = false;  // 더 이상 게스트 아님
    localStorage.setItem('soragodong_session', JSON.stringify(session));
    // PIPA 동의 stash → state.preferences.consentLog 로 (기존 패턴 따라).
    if (state.preferences) {
      state.preferences.consentLog = {
        email: _guestConvState.email,
        terms: true, sensitive: true, crossBorder: true, adult: true,
        loginMethod: 'guest_conv',
        at: new Date().toISOString(),
        versions: { terms: '1.1', privacy: '1.1', crossBorder: '2.1', refund: '1.1' }
      };
    }
    saveState();
    _renderGuestConvModal('password');
  } catch (e) {
    console.error('[guest conv] verify throw:', e);
    alert('네트워크 오류 — 잠시 후 다시');
  }
}

async function _guestConvSetupE2EE() {
  const p1 = document.getElementById('guestConvPass1')?.value || '';
  const p2 = document.getElementById('guestConvPass2')?.value || '';
  if (p1.length < 12) {
    alert('비밀번호는 12자 이상이어야 해.');
    return;
  }
  if (p1 !== p2) {
    alert('두 비밀번호가 달라.');
    return;
  }
  _renderGuestConvModal('syncing');
  try {
    // E2EE 셋업 — 마스터 키 생성, password 로 wrap, recovery blob 저장.
    if (typeof _e2eeSetupNewUser !== 'function') {
      alert('E2EE 모듈 로드 실패 — 페이지 새로고침');
      return;
    }
    await _e2eeSetupNewUser(p1);
    // E2EE enabled 마커
    if (typeof _e2eeEnabled !== 'undefined') _e2eeEnabled = true;

    // 첫 cloud upload — state 암호화 후 me_v4 row 로 저장.
    if (typeof saveToCloudNow === 'function') {
      await saveToCloudNow();
    }
    _renderGuestConvModal('done');
    if (typeof showToast === 'function') showToast('🔒 암호화 완료 — 데이터 안전');
  } catch (e) {
    console.error('[guest conv] e2ee setup fail:', e);
    alert('암호화 셋업 실패: ' + (e?.message || e));
    _renderGuestConvModal('password');
  }
}
