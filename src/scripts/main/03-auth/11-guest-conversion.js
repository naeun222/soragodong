// ═══════════════════════════════════════════════════════════════
// GUEST CONVERSION (Phase 1c) — 사용자 명시 2026-05-06: 카카오 linkIdentity 만 (이메일 OTP 폐기)
// ═══════════════════════════════════════════════════════════════
// trigger: chat 402 + code='GUEST_LIMIT' (한도 도달) OR 사용자 직접 (설정 / '나' 탭 배너).
// 흐름:
//   1. PIPA 동의 4종 + 비밀번호 설정 = 카카오 callback 후 E2EE setup 모달 (showE2EEPasswordSetupModal) 안에서 일괄.
//   2. 모달 = 단일 step "카카오로 시작" 버튼 + 안내문.
//   3. 클릭 → linkIdentity (POST /auth/v1/user/identities/authorize) 로 Kakao OAuth 진입 → redirect.
//   4. callback 후 같은 uid 유지 (is_anonymous=false). state.isGuest=false 자동.
//   5. init() 의 maybeShowE2EESetupForNewUser → E2EE 비밀번호 + 동의 모달 (state.isGuest=false 라 통과).
//   6. _e2eeSetupNewUser 가 pending_e2ee_setup 플래그 정리 → 첫 cloud 업로드 (암호화).

function showGuestConversionModal(opts) {
  const reason = (opts && opts.reason) || 'limit';
  _renderGuestConvModal({ reason });
}

function _renderGuestConvModal(ctx) {
  // 기존 모달 제거
  const existing = document.getElementById('guestConvModal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'guestConvModal';
  overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:10000; display:flex; align-items:center; justify-content:center; padding:20px;';

  const card = document.createElement('div');
  card.style.cssText = 'background:var(--surface); border-radius:16px; max-width:420px; width:100%; max-height:90vh; overflow-y:auto; padding:24px; box-shadow:0 20px 60px rgba(0,0,0,0.5);';
  overlay.appendChild(card);

  const reasonText = (ctx && ctx.reason === 'limit')
    ? `<div style="background:rgba(212,167,106,0.08); border-left:3px solid var(--accent); padding:12px 14px; border-radius:0 8px 8px 0; margin-bottom:18px; font-size:13px; color:var(--text); line-height:1.7;">잠깐 — 게스트 한도 다 썼어. 여기까지 한 대화는 이 기기에만 있어.</div>`
    : '';

  card.innerHTML = `
    <div style="font-family:'Gowun Batang',serif; font-size:20px; color:var(--accent); margin-bottom:6px;">🔒 안전하게 이어가자</div>
    <div style="font-size:13px; color:var(--text); margin-bottom:18px; line-height:1.75;">너의 데이터, <b>너만 풀 수 있게</b> 종단간 암호화로 보관할게. 잃어버릴 일도 없고, 나도 못 봐.</div>
    ${reasonText}

    <button type="button" class="sns-login-btn kakao" onclick="_guestConvKakaoLink()" style="margin-bottom:14px;">
      <svg class="sns-login-icon" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true"><path d="M9 1.5C4.86 1.5 1.5 4.18 1.5 7.5c0 2.13 1.42 4 3.55 5.06l-.7 2.61c-.07.27.23.49.46.34l3.06-2.04c.38.04.76.07 1.13.07 4.14 0 7.5-2.68 7.5-6S13.14 1.5 9 1.5z"/></svg>
      <span>카카오로 시작하기</span>
    </button>

    <button onclick="_closeGuestConvModal()" style="width:100%; padding:10px; background:transparent; border:1px solid var(--border-strong); color:var(--text-dim); border-radius:10px; cursor:pointer; font-size:13px;">나중에</button>
  `;

  document.body.appendChild(overlay);
}

function _closeGuestConvModal() {
  const m = document.getElementById('guestConvModal');
  if (m) m.remove();
}

// 사용자 명시 2026-05-06: 게스트 → 가입 = Supabase linkIdentity 패턴 (uid 영속).
// 옛 ?provider=kakao 단순 OAuth = 신규 user 생성 (uid 변경 → 데이터 마이그레이션 필요).
// linkIdentity REST = `/auth/v1/user/identities/authorize` (Bearer auth) — 같은 uid 유지하고 identity 추가.
async function _guestConvKakaoLink() {
  if (!session?.access_token) {
    alert('세션 끊김 — 페이지 새로고침');
    return;
  }

  // 카카오 callback 후 E2EE setup 모달 뜨기 전 saveToCloudNow 평문 업로드 차단 (06-backup-migration.js 의 가드 호환).
  try { localStorage.setItem('soragodong_v4_pending_e2ee_setup', '1'); } catch {}
  // loginMethod marker — E2EE setup 모달이 동의 stash 식별용.
  try {
    localStorage.setItem('soragodong_pending_consent', JSON.stringify({
      email: '',
      loginMethod: 'kakao_link',
      at: new Date().toISOString()
    }));
  } catch {}

  try {
    const _fetch = window._anthropicOrigFetch || fetch;
    const params = new URLSearchParams({
      provider: 'kakao',
      redirect_to: window.location.origin,
      scopes: 'account_email'
    });
    const url = `${SUPABASE_URL}/auth/v1/user/identities/authorize?${params.toString()}`;

    const resp = await _fetch(url, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + session.access_token
      }
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      console.error('[guest conv kakao] fail:', resp.status, err);
      try { localStorage.removeItem('soragodong_v4_pending_e2ee_setup'); } catch {}
      alert('카카오 연결 실패 (' + resp.status + ') — 잠시 후 다시');
      return;
    }
    const data = await resp.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      console.error('[guest conv kakao] no url in response:', data);
      try { localStorage.removeItem('soragodong_v4_pending_e2ee_setup'); } catch {}
      alert('카카오 연결 응답 형식 오류');
    }
  } catch (e) {
    console.error('[guest conv kakao] throw:', e);
    try { localStorage.removeItem('soragodong_v4_pending_e2ee_setup'); } catch {}
    alert('네트워크 오류 — 잠시 후 다시');
  }
}
