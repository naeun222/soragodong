function _toggleAllSetupConsents(allEl) {
  _SETUP_CONSENT_IDS.forEach(id => {
    const c = document.getElementById(id);
    if (c) c.checked = allEl.checked;
  });
}
function _syncSetupAllConsent() {
  const all = document.getElementById('setupConsentAll');
  if (!all) return;
  all.checked = _SETUP_CONSENT_IDS.every(id => {
    const c = document.getElementById(id);
    return c && c.checked;
  });
}

// 사용자 명시 2026-05-02: 비밀번호 설정 모달 안 동의 항목 자세히 펼침 토글.
// 체크박스 click = stopPropagation 으로 동의 toggle 만 / 텍스트 + ▾ click = 펼침.
function _toggleSetupConsent(btn) {
  const row = btn && btn.closest && btn.closest('.setup-consent-row');
  if (!row) return;
  // detail 자리 찾기 — sibling 으로 있거나 setup-consent-warn 다음에 있음.
  let next = row.nextElementSibling;
  while (next && !next.classList.contains('setup-consent-detail')) {
    next = next.nextElementSibling;
  }
  if (!next) return;
  const caret = btn.querySelector('.setup-consent-caret');
  if (next.hasAttribute('hidden')) {
    next.removeAttribute('hidden');
    if (caret) caret.textContent = '▴';
  } else {
    next.setAttribute('hidden', '');
    if (caret) caret.textContent = '▾';
  }
}

// 사용자 요청 2026-04-30: 비밀번호 input 보기/숨기기 토글 (👁).
function _togglePwView(inputId, btn) {
  const el = document.getElementById(inputId);
  if (!el) return;
  if (el.type === 'password') {
    el.type = 'text';
    if (btn) { btn.textContent = '🙈'; btn.style.color = 'var(--accent)'; }
  } else {
    el.type = 'password';
    if (btn) { btn.textContent = '👁'; btn.style.color = 'var(--text-soft)'; }
  }
}

// 사용자 요청 2026-04-30: 새 device 진입 시 password 복원 모달.
// loadFromCloud에서 _encryptedBody 있는데 마스터 키 X면 window._e2eePendingRecovery 넣음. 진입 후 모달.
