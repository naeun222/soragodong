// 사용자 명시 2026-05-02: 통합 모달 — 동의 4개 + 비밀번호 + 분실 경고 + Q&A. allowCancel 옵션 (자발적 활성 vs 강제).
function showE2EEPasswordSetupModal(opts) {
  opts = opts || {};
  const allowCancel = opts.allowCancel !== false;  // default true (Settings 자발적). false = 강제 (가입/legacy)
  if (document.getElementById('e2eeSetupOverlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay show';
  overlay.style.zIndex = '10001';
  overlay.id = 'e2eeSetupOverlay';
  overlay.dataset.allowCancel = allowCancel ? '1' : '0';
  const cancelButton = allowCancel ? `<button class="btn-secondary" onclick="cancelE2EESetup()" style="flex:1;">취소</button>` : '';
  // 사용자 명시 2026-05-02: 체크박스 = 동의 toggle 만 / 텍스트 + ▾ click = 자세히 펼침 토글.
  const _row = (id, label, detailHTML, extra) => `
    <div class="setup-consent-row">
      <input type="checkbox" id="${id}" onclick="event.stopPropagation()" onchange="_syncSetupAllConsent()">
      <button type="button" class="setup-consent-text" onclick="_toggleSetupConsent(this)">
        <span>${label}</span>
        <span class="setup-consent-caret">▾</span>
      </button>
    </div>
    ${extra || ''}
    <div class="setup-consent-detail" hidden>${detailHTML}</div>
  `;
  const consentSection = `
      <style>
        .setup-consent-card { margin-bottom:14px; padding:10px 14px; background:var(--surface); border:1px solid var(--border); border-radius:10px; }
        .setup-consent-card-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; }
        .setup-consent-card-title { font-size:12px; color:var(--text); font-weight:600; }
        .setup-consent-all { display:flex; gap:6px; align-items:center; cursor:pointer; font-size:11.5px; color:var(--text-dim); user-select:none; }
        .setup-consent-all input { width:13px; height:13px; accent-color:var(--accent); cursor:pointer; margin:0; }
        .setup-consent-all:hover { color:var(--text); }
        .setup-consent-row { display:flex; gap:8px; align-items:center; padding:8px 0; }
        .setup-consent-row + .setup-consent-row,
        .setup-consent-detail + .setup-consent-row { border-top:1px solid rgba(255,255,255,0.04); }
        .setup-consent-row input[type=checkbox] { margin:0; width:13px; height:13px; accent-color:var(--accent); flex-shrink:0; cursor:pointer; }
        .setup-consent-text { flex:1; display:flex; align-items:center; justify-content:space-between; gap:8px; background:transparent; border:0; padding:0; text-align:left; cursor:pointer; font-family:inherit; font-size:12.5px; color:var(--text-dim); line-height:1.55; }
        .setup-consent-text:hover { color:var(--text); }
        .setup-consent-text b { color:var(--text); }
        .setup-consent-caret { font-size:11px; color:var(--text-soft); flex-shrink:0; transition:opacity 0.15s; }
        .setup-consent-text:hover .setup-consent-caret { color:var(--accent); }
        .setup-consent-detail { margin-left:21px; margin-top:4px; margin-bottom:6px; padding:9px 12px; background:rgba(255,255,255,0.02); border-left:2px solid rgba(212,167,106,0.30); border-radius:0 6px 6px 0; font-size:11px; color:var(--text-dim); line-height:1.75; }
        .setup-consent-detail b, .setup-consent-detail strong { color:var(--text); }
        .setup-consent-detail a { color:var(--accent); }
        .setup-consent-warn { margin-left:21px; margin-top:2px; font-size:10.5px; color:#e8a3a3; padding:5px 9px; background:rgba(232,163,163,0.06); border-left:2px solid rgba(232,163,163,0.45); border-radius:0 4px 4px 0; line-height:1.55; }
      </style>
      <div class="setup-consent-card">
        <div class="setup-consent-card-header">
          <span class="setup-consent-card-title">필수 동의</span>
          <label class="setup-consent-all">
            <input type="checkbox" id="setupConsentAll" onchange="_toggleAllSetupConsents(this)">
            <span>모두 동의</span>
          </label>
        </div>
        ${_row('setupConsentTerms',
          '<span style="color:var(--accent); font-weight:600;">(필수)</span> 이용약관·개인정보처리',
          '· <a href="/terms" target="_blank">이용약관 →</a><br>· <a href="/privacy" target="_blank">개인정보처리방침 →</a>'
        )}
        ${_row('setupConsentSensitive',
          '<span style="color:var(--accent); font-weight:600;">(필수)</span> 민감정보 처리',
          '· 기분·감정·자기관찰 기록 = 법률상 민감정보 (PIPA §23)<br>· 목적: AI 자기관찰 / 패턴 정리 / 개인 모델<br>· 보유: 회원 탈퇴 시 즉시 삭제<br>· <b>E2EE 암호화</b> — 회사도 평문 접근 X'
        )}
        ${_row('setupConsentCrossBorder',
          '<span style="color:var(--accent); font-weight:600;">(필수)</span> 국외이전 (Anthropic 미국)',
          '· 이전 항목: 사용자 입력 텍스트 (체크인·일기·대화)<br>· 이전 시기: AI 호출 시점 (실시간 처리, 저장 X)<br>· 수신자: Anthropic (미국) / Supabase (미국) / Cloudflare<br>· <b>AI 학습·재활용 X</b> — Zero Data Retention (처리 후 즉시 폐기)<br>· 30일 후 자동 삭제<br>· <a href="/cross-border" target="_blank">자세히 →</a>'
        )}
        ${_row('setupConsentAdult',
          '<span style="color:var(--accent); font-weight:600;">(필수)</span> <b>만 14세 이상입니다</b>',
          '· PIPA §22-2 — 만 14세 미만은 법정대리인 동의 필요 (현재 미지원)<br>· 만 14세 미만 친권자 동의 폼 도입 전까지 가입 X',
          '<div class="setup-consent-warn">⚠ 허위 시 모든 책임은 본인 (및 법정대리인)에게. 회사 즉시 계정 정지 + 데이터 삭제.</div>'
        )}
        <div style="margin-top:10px; padding:9px 12px; background:rgba(255,255,255,0.02); border-left:2px solid rgba(212,167,106,0.30); border-radius:0 6px 6px 0;">
          <label for="setupBirthYear" style="display:block; font-size:11.5px; color:var(--text-dim); margin-bottom:6px; line-height:1.55;">
            <span style="color:var(--accent); font-weight:600;">(필수)</span> <b style="color:var(--text);">출생년도</b> <span style="color:var(--text-soft); font-size:10.5px;">— PIPA §22-2 만 14세 검증</span>
          </label>
          <input type="number" id="setupBirthYear" placeholder="예: 1995" min="1900" max="${new Date().getFullYear()}" maxlength="4" inputmode="numeric"
                 style="width:100%; font-family:inherit; padding:7px 10px; font-size:13px; background:rgba(0,0,0,0.20); border:1px solid var(--border); border-radius:6px; color:var(--text);"
                 oninput="_setupBirthYearValidate()">
          <div id="setupBirthYearStatus" style="margin-top:5px; font-size:10.5px; color:var(--text-soft); min-height:13px; line-height:1.4;"></div>
        </div>
        <div style="margin-top:10px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.04); font-size:10.5px; color:var(--text-soft); line-height:1.6;">
          ※ 4개 동의 + 출생년도 입력 모두 완료해야 시작 가능. 거부 시 정신건강 자기관찰 + AI 기능 이용 X (인프라 특성상 어쩔 수 없어).
        </div>
      </div>
  `;
  const qaSection = `
      <details style="margin-bottom:14px; padding:10px 12px; background:linear-gradient(135deg, rgba(126,200,227,0.06), rgba(143,200,143,0.04)); border:1px solid rgba(126,200,227,0.12); border-radius:10px;">
        <summary style="font-size:12px; color:var(--accent2); font-weight:600; cursor:pointer;">🛡️ 데이터 어떻게 다뤄?</summary>
        <div style="font-size:11.5px; color:var(--text-dim); line-height:1.7; margin-top:10px;">
          <div style="margin-bottom:8px;"><b style="color:var(--text);">Q. 내 일기가 AI 학습에 들어가?</b><br>A. <b>절대 X.</b> Anthropic Zero Data Retention — 학습·재판매·연구 등 외부 사용 불가. 30일 후 자동 삭제.</div>
          <div style="margin-bottom:8px;"><b style="color:var(--text);">Q. 개발자가 내 일기 볼 수 있어?</b><br>A. 본인 비밀번호로 잠그면 X. 단 분실 시 복구 X.</div>
          <div style="margin-bottom:8px;"><b style="color:var(--text);">Q. 광고로 팔리거나 외부에 새는 거 아냐?</b><br>A. 절대 X. 구독제로 운영.</div>
          <div style="margin-bottom:8px;"><b style="color:var(--text);">Q. 통신은 안전해?</b><br>A. HTTPS + Anthropic 보안 인증 (SOC 2 Type II / ISO 27001).</div>
          <div><b style="color:var(--text);">Q. 이거 의료·상담 앱이야?</b><br>A. 아니 — 의료·심리상담 대체 X. 위기 시 1393 / 1577-0199.</div>
        </div>
      </details>
  `;
  overlay.innerHTML = `
    <div class="input-modal" style="max-width:420px; padding:24px; max-height:90vh; overflow-y:auto;">
      <div style="font-size:18px; font-weight:700; color:var(--text); margin-bottom:8px;">🔐 비밀번호 설정</div>
      <div style="font-size:12px; color:var(--text-dim); line-height:1.7; margin-bottom:14px;">
        활성화 후 <strong>회사도 본인 데이터를 볼 수 없어</strong>.<br>
        본인이 외울 수 있는 비밀번호를 입력해줘. 다른 기기에서도 같은 비밀번호로 복원 가능.
      </div>
      ${consentSection}
      <div style="margin-bottom:10px; position:relative;">
        <input type="password" id="e2eePasswordInput" placeholder="비밀번호 (12자 이상)" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false" style="width:100%; font-family:inherit; padding-right:40px;">
        <button type="button" onclick="_togglePwView('e2eePasswordInput', this)" title="보기 / 숨기기" style="position:absolute; right:6px; top:50%; transform:translateY(-50%); background:transparent; border:none; cursor:pointer; padding:6px 8px; color:var(--text-soft); font-size:16px;">👁</button>
      </div>
      <div style="margin-bottom:10px; position:relative;">
        <input type="password" id="e2eePasswordConfirmInput" placeholder="비밀번호 다시 입력" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false" style="width:100%; font-family:inherit; padding-right:40px;">
        <button type="button" onclick="_togglePwView('e2eePasswordConfirmInput', this)" title="보기 / 숨기기" style="position:absolute; right:6px; top:50%; transform:translateY(-50%); background:transparent; border:none; cursor:pointer; padding:6px 8px; color:var(--text-soft); font-size:16px;">👁</button>
      </div>
      <div id="e2eePasswordStatus" style="font-size:11px; color:var(--text-soft); margin-bottom:14px; min-height:14px;"></div>
      <div style="font-size:10px; color:var(--text-soft); line-height:1.6; margin-bottom:14px; padding:8px; background:rgba(220,80,80,0.05); border-left:3px solid rgba(220,80,80,0.40); border-radius:4px;">
        ⚠️ 비밀번호 분실 시 데이터를 영구 복구할 수 없어. 회사도 복원 X. 안전한 곳에 보관해줘 (카톡 나에게 보내기 / 폰 메모 / 손글씨).
      </div>
      ${qaSection}
      <div style="display:flex; gap:8px;">
        <button class="btn-primary" onclick="submitE2EESetup()" style="flex:1;">활성화</button>
        ${cancelButton}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('e2eePasswordInput')?.focus(), 100);
}

// 사용자 명시 2026-05-08 ultrathink (audit WARN #5 strengthen): 출생년도 실시간 검증 — 만 14세 미만 가입 차단.
function _setupBirthYearValidate() {
  const el = document.getElementById('setupBirthYear');
  const status = document.getElementById('setupBirthYearStatus');
  if (!el || !status) return;
  const y = parseInt(el.value, 10);
  if (!Number.isFinite(y) || y < 1900 || y > new Date().getFullYear()) {
    status.textContent = '';
    status.style.color = 'var(--text-soft)';
    return;
  }
  const age = new Date().getFullYear() - y;
  if (age < 14) {
    status.innerHTML = `만 ${age}세 — <b style="color:#e89090;">가입 불가</b> (PIPA §22-2 만 14세 미만 차단)`;
    status.style.color = '#e89090';
  } else if (age >= 100) {
    status.textContent = `(만 ${age}세 — 입력 다시 확인)`;
    status.style.color = '#e89090';
  } else {
    status.innerHTML = `만 ${age}세 ✓ 가입 가능`;
    status.style.color = '#7ec88e';
  }
}

async function submitE2EESetup() {
  const pw1 = document.getElementById('e2eePasswordInput')?.value || '';
  const pw2 = document.getElementById('e2eePasswordConfirmInput')?.value || '';
  const status = document.getElementById('e2eePasswordStatus');
  if (!status) return;
  // 사용자 명시 2026-05-02: 동의 4개 검증 (모달 안 통합).
  const consentTerms = document.getElementById('setupConsentTerms')?.checked;
  const consentSensitive = document.getElementById('setupConsentSensitive')?.checked;
  const consentCrossBorder = document.getElementById('setupConsentCrossBorder')?.checked;
  const consentAdult = document.getElementById('setupConsentAdult')?.checked;
  if (!consentTerms || !consentSensitive || !consentCrossBorder || !consentAdult) {
    status.textContent = '필수 동의 4개를 모두 체크해줘';
    status.style.color = '#e89090';
    return;
  }
  // 사용자 명시 2026-05-08 ultrathink (PIPA §22-2 강화): 출생년도 입력 + 만 14세 검증.
  const birthYearStr = document.getElementById('setupBirthYear')?.value || '';
  const birthYear = parseInt(birthYearStr, 10);
  if (!Number.isFinite(birthYear) || birthYear < 1900 || birthYear > new Date().getFullYear()) {
    status.textContent = '출생년도를 입력해줘 (4자리 숫자)';
    status.style.color = '#e89090';
    return;
  }
  const age = new Date().getFullYear() - birthYear;
  if (age < 14) {
    status.textContent = `만 ${age}세 — 가입 불가 (PIPA §22-2 만 14세 미만 차단)`;
    status.style.color = '#e89090';
    return;
  }
  if (age >= 100) {
    status.textContent = '출생년도를 다시 확인해줘';
    status.style.color = '#e89090';
    return;
  }
  if (pw1 !== pw2) {
    status.textContent = '비밀번호가 일치하지 않습니다';
    status.style.color = '#e89090';
    return;
  }
  const validation = _e2eeValidatePassword(pw1);
  if (!validation.ok) {
    status.textContent = validation.reason;
    status.style.color = '#e89090';
    return;
  }
  status.textContent = '활성화 중...';
  status.style.color = 'var(--text-soft)';
  try {
    await _e2eeSetupNewUser(pw1);
    _e2eeEnabled = true;
    // 사용자 명시 2026-05-02: 동의 timestamp 넣음 (PIPA 준수).
    if (!state.preferences) state.preferences = {};
    state.preferences.consentTerms = true;
    state.preferences.consentSensitive = true;
    state.preferences.consentCrossBorder = true;
    state.preferences.consentAdult = true;
    state.preferences.consentAt = new Date().toISOString();
    state.preferences.consentVersion = '2.0';
    // 사용자 명시 2026-05-08 ultrathink (audit WARN #5 + PIPA §22-2 강화): 출생년도 + 만 14세 검증 결과 기록.
    state.preferences.birthYear = birthYear;
    state.preferences.ageAtConsent = age;
    // 사용자 명시 2026-05-08 ultrathink (audit WARN #13 fix): 카카오 신규 가입자 consentLog 미기록 — 4종 type 별 entry push.
    // 옛: consentAt + consentVersion 만 있어 분쟁 시 *어떤 항목*에 동의했는지 증거 X.
    // 신: terms / sensitive / crossBorder / age14 4종 + birthYear 기록.
    if (!Array.isArray(state.preferences.consentLog)) state.preferences.consentLog = [];
    const _at = state.preferences.consentAt;
    const _hasLog = (t, v) => state.preferences.consentLog.some(c => c.type === t && c.version === v && c.confirmed);
    if (!_hasLog('terms', '1.3')) state.preferences.consentLog.push({ type: 'terms', version: '1.3', confirmed: true, at: _at, basis: '약관 동의 모달' });
    if (!_hasLog('privacy', '1.4')) state.preferences.consentLog.push({ type: 'privacy', version: '1.4', confirmed: true, at: _at, basis: '약관 동의 모달' });
    if (!_hasLog('sensitive', '1.4')) state.preferences.consentLog.push({ type: 'sensitive', version: '1.4', confirmed: true, at: _at, basis: 'PIPA §23' });
    if (!_hasLog('crossBorder', '2.3')) state.preferences.consentLog.push({ type: 'crossBorder', version: '2.3', confirmed: true, at: _at, basis: 'PIPA §17' });
    if (!_hasLog('age14', '1.2')) state.preferences.consentLog.push({ type: 'age14', version: '1.2', confirmed: true, at: _at, basis: `PIPA §22-2 자기 선언 — 출생년도 ${birthYear} (만 ${age}세)` });
    // 결제 시 법정대리인 동의 필요 여부 — 만 14세 이상이면 X.
    state.preferences.requiresLegalGuardianForPayment = age < 14;
    await saveToCloudNow();
    refreshE2EEStatus();
    const overlay = document.getElementById('e2eeSetupOverlay');
    if (overlay) overlay.remove();
    showToast('🔐 E2EE 활성화 완료 — 회사조차 귀하의 데이터를 열람할 수 없습니다');
    // 사용자 보고 2026-04-30 + V203 (chooser 폐기): E2EE setup 닫힌 후 firstTimeIntro 재트리거 (silent 환영 보너스 + 자동 코어 튜토리얼 진입).
    // 사용자 명시 2026-05-06 ultrathink: E2EE 비밀번호 설정 직후 V8 시작 튜토 fire (카카오 신규 가입자 — 게스트 이력 X).
    // shouldRunStartTutorialV8 의 _e2eePending 가드가 init 시 V8 fire 막았으므로 여기서 직접 trigger.
    // 게스트 promote 케이스는 hasAnyData=true 또는 tutorialVersion='v8-start' 라 자동 skip → 게스트 진행도 그대로.
    setTimeout(() => {
      // 사용자 명시 2026-05-06 ultrathink: 게스트 → 카카오 promote 사용자 = 비밀번호 설정 직후 PWA 설치 유도.
      // _wasGuestPromoted 마커는 init() 에서 sessionStorage 'soragodong_was_guest' → state 영속화.
      try {
        if (state.preferences && state.preferences._wasGuestPromoted
            && typeof renderPwaInstallInlineCard === 'function') {
          setTimeout(() => renderPwaInstallInlineCard({ target: 'floating' }), 1200);
        }
      } catch (e) { console.warn('[pwa after e2ee]', e); }
      if (typeof shouldRunStartTutorialV8 === 'function' && shouldRunStartTutorialV8()) {
        runStartTutorialV8().catch(e => console.warn('[v8 after e2ee]', e));
        return;
      }
      if (typeof maybeShowFirstTimeIntro === 'function') {
        maybeShowFirstTimeIntro().catch(e => console.warn('firstTimeIntro after e2ee:', e));
      }
    }, 700);
  } catch (e) {
    status.textContent = '실패: ' + (e.message || e);
    status.style.color = '#e89090';
  }
}

function cancelE2EESetup() {
  const overlay = document.getElementById('e2eeSetupOverlay');
  if (overlay) overlay.remove();
  // dismiss 적용됨 — 다음 진입 시 자동 권유 X (Settings에서 명시 활성 가능)
  try { localStorage.setItem('soragodong_v4_e2ee_setup_dismissed', new Date().toISOString()); } catch {}
  // 사용자 보고 2026-04-30 + V203 (chooser 폐기): cancel 후에도 firstTimeIntro 재트리거 (silent 환영 보너스 + 자동 코어 튜토리얼 진입).
  setTimeout(() => {
    if (typeof maybeShowFirstTimeIntro === 'function') {
      maybeShowFirstTimeIntro().catch(e => console.warn('firstTimeIntro after e2ee cancel:', e));
    }
  }, 600);
}

// 비밀번호 안내 (이미 활성된 사용자) — 사용자 요청 2026-04-30 password 단순화 후 wording.
async function showE2EERecoveryInfo() {
  try {
    const recovery = JSON.parse(localStorage.getItem('soragodong_v4_e2ee_recovery') || 'null');
    if (!recovery) {
      alert('아직 종단간 암호화(E2EE)가 활성화되지 않았어요.\n\n위의 [🔐 E2EE 활성화] 버튼을 먼저 눌러주세요.');
      return;
    }
    alert(
      '비밀번호는 보안상 이 기기에 그대로 저장되어 있지 않습니다.\n\n' +
      '활성화하실 때 본인이 직접 입력하신 비밀번호를 기억해두셔야 합니다.\n' +
      '추천: 카톡 나에게 보내기 / 폰 메모 앱 / 손글씨 메모.\n\n' +
      '✓ 비밀번호 기억하시면:\n' +
      '   다른 기기에서 같은 이메일로 로그인 후 비밀번호 입력 → 데이터 복원.\n\n' +
      '⚠️ 비밀번호 분실 시:\n' +
      '   새 기기에서는 본인의 데이터에 접근하실 수 없습니다 (회사도 복구해드릴 수 없습니다).\n' +
      '   현재 사용 중인 이 기기에서는 계속 사용 가능합니다.\n\n' +
      '안전을 위해 [📁 파일로 백업] 도 권장드립니다.'
    );
  } catch (e) {
    alert('확인 실패: ' + (e.message || e));
  }
}

// E2EE 상태 표시 갱신
function refreshE2EEStatus() {
  const status = document.getElementById('e2eeStatus');
  if (!status) return;
  if (_e2eeEnabled && _e2eeMasterKey) {
    status.innerHTML = '✅ <b style="color:#9ed4a0;">활성화됨</b> — 회사도 본인 데이터 볼 수 없음';
  } else {
    status.innerHTML = '⚠️ 미활성 — 회사 (관리자 1명)가 시스템상 데이터 접근 가능';
  }
}

// password 입력 → 암호화된 마스터 키 복호화 → 마스터 키 복원 (새 device 진입 시).
async function _e2eeRestoreFromPassphrase(password) {
  // 사용자 보고 2026-04-30 ultrathink 진단: localStorage e2ee_recovery 만 보면 cloud sync 분기 / 비번 변경 부분-갱신 / mk rotate 잔여 케이스에서 unwrap 실패.
  // multi-source fallback — localStorage + cloud(me_v4 / me_v4_backup / auto_backup / manual_backup) 의 _e2eeRecovery 다 시도.
  // 어느 한 source 가 사용자 비번 + cloud body decrypt 둘 다 통과하면 그게 truth → master key 넣음.
  const candidates = [];
  // (a) localStorage
  try {
    const local = JSON.parse(localStorage.getItem('soragodong_v4_e2ee_recovery') || 'null');
    if (local && local.salt && local.encryptedMasterKey) {
      candidates.push({ source: 'localStorage', salt: local.salt, encryptedMasterKey: local.encryptedMasterKey });
    }
  } catch {}
  // (b) cloud rows — main + backup 들
  if (typeof authUserId === 'string' && authUserId && typeof SUPABASE_URL === 'string') {
    const cloudIds = [V4_USER_ID, V4_TESTER_BACKUP_USER_ID, V4_AUTO_BACKUP_USER_ID, V4_MANUAL_BACKUP_USER_ID];
    for (const uid of cloudIds) {
      try {
        const resp = await fetch(
          `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${uid}&select=data&limit=1`,
          { headers: authHeaders() }
        );
        if (!resp.ok) continue;
        const rows = await resp.json();
        const rec = rows[0] && rows[0].data && rows[0].data._e2eeRecovery;
        if (rec && rec.salt && rec.encryptedMasterKey) {
          const dup = candidates.some(c => c.salt === rec.salt && c.encryptedMasterKey === rec.encryptedMasterKey);
          if (!dup) candidates.push({ source: 'cloud:' + uid, salt: rec.salt, encryptedMasterKey: rec.encryptedMasterKey });
        }
      } catch (e) { console.warn('[e2ee] cloud recovery fetch 실패 (' + uid + '):', e); }
    }
  }
  if (candidates.length === 0) {
    const err = new Error('NO_RECOVERY');
    err.code = 'NO_RECOVERY';
    throw err;
  }
  console.log('[e2ee] recovery 후보 ' + candidates.length + '개:', candidates.map(c => c.source));
  // 각 후보 시도 — 비번 unwrap + cloud body decrypt 둘 다 통과해야 truth.
  // 사용자 보고 2026-04-30 review (agent): unwrap 만 성공한 fallback 적용 시 stale master key 가 localStorage 에 영구 저장 → reload 사이클 무한 반복 risk. 제거.
  // unwrap OK + cloud body 실패 = master key 와 cloud body 가 별도 wrap 된 상태 — 평문 backup 복원 (forgot-password) 흐름으로 유도가 안전.
  const cloudBody = window._e2eePendingRecovery && window._e2eePendingRecovery._encryptedBody;
  for (const cand of candidates) {
    try {
      const passwordKey = await _e2eePassphraseToKey(password, cand.salt);
      const masterKeyB64 = await _e2eeDecrypt(cand.encryptedMasterKey, passwordKey);
      if (!masterKeyB64) continue;  // 이 source 비번 mismatch
      const masterKey = await _e2eeImportKey(masterKeyB64);
      // cloud body verify — 통과해야만 valid
      if (cloudBody) {
        let bodyOk = false;
        try {
          const test = await _e2eeDecrypt(cloudBody, masterKey);
          bodyOk = !!test;
        } catch (e) {
          console.warn('[e2ee] ' + cand.source + ' cloud body decrypt 예외:', e);
        }
        if (!bodyOk) {
          console.warn('[e2ee] ' + cand.source + ' unwrap OK 인데 cloud body decrypt 실패. 다음 후보 시도. (이 master key 는 저장 X — stale risk 회피)');
          continue;
        }
      }
      // 성공 — master key 저장하고 recovery 도 best source 로 갱신.
      // 사용자 보고 2026-05-02 ultrathink: PWA standalone 의 sessionStorage 매 진입 cleanup → localStorage 으로 후퇴.
      _e2eeMasterKey = masterKey;
      localStorage.setItem(_E2EE_LOCAL_KEY, masterKeyB64);
      sessionStorage.removeItem(_E2EE_LOCAL_KEY);  // Phase 0 잔여 정리
      localStorage.setItem('soragodong_v4_e2ee_recovery', JSON.stringify({ salt: cand.salt, encryptedMasterKey: cand.encryptedMasterKey }));
      console.log('[e2ee] master key 복원 성공 (source: ' + cand.source + ', cloud body verify: ' + !!cloudBody + ')');
      return masterKey;
    } catch (e) {
      console.warn('[e2ee] ' + cand.source + ' 시도 예외:', e);
      continue;
    }
  }
  console.warn('[e2ee] 모든 recovery 후보 (' + candidates.length + '개) — 어느 것도 비번 unwrap + cloud body decrypt 둘 다 통과 X. 비번 mismatch 또는 mk/recovery 분기 (forgot-password 권장).');
  return null;
}

