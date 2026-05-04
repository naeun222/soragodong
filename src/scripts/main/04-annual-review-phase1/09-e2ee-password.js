// 사용자 요청 2026-04-30 (단순화): E2EE 활성화 — 사용자 지정 password 모달.
async function setupE2EE() {
  if (_e2eeMasterKey && _e2eeEnabled) {
    alert('이미 종단간 암호화(E2EE)가 활성화되어 있어요.');
    return;
  }
  // 사용자 보고 2026-04-30 데이터 손실 P3 fix: 재활성화 시 기존 master key 덮어쓰기 차단.
  // 기존 recovery localStorage 또는 cloud의 _encryptedBody가 있으면 = 이미 한 번 활성된 사용자.
  // 다시 setup하면 새 master key 생성 → 기존 암호화 데이터 영원히 복호화 불가능.
  try {
    if (localStorage.getItem('soragodong_v4_e2ee_recovery')) {
      alert(
        '이미 비밀번호를 설정하신 적이 있어요.\n\n' +
        '다시 활성화하시면 기존 비밀번호로 암호화된 데이터를 영원히 복구할 수 없습니다.\n\n' +
        '기존 비밀번호 기억나시면 새로고침 후 자동으로 뜨는 복원 모달에서 입력해주세요.'
      );
      return;
    }
  } catch {}
  if (window._e2eePendingRecovery) {
    alert('비밀번호 복원이 진행 중입니다. 새로고침 후 복원 모달에서 비밀번호를 입력해주세요.');
    return;
  }
  showE2EEPasswordSetupModal();
}

// 사용자 명시 2026-05-02 Phase 1: 비밀번호 변경 모달 (이미 활성된 사용자 대상).
function setupChangePassword() {
  if (!_e2eeMasterKey || !_e2eeEnabled) {
    alert('먼저 종단간 암호화(E2EE)를 활성화해주세요.\n\n[설정 → 종단간 암호화 → 활성화]');
    return;
  }
  // 기존 recovery 데이터 검증
  try {
    const local = localStorage.getItem('soragodong_v4_e2ee_recovery');
    if (!local) {
      alert('기존 비밀번호 데이터가 없어요. 새로고침 후 다시 시도해주세요.');
      return;
    }
  } catch {}
  showE2EEChangePasswordModal();
}

function showE2EEChangePasswordModal() {
  if (document.getElementById('e2eeChangePwOverlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay show';
  overlay.style.zIndex = '10001';
  overlay.id = 'e2eeChangePwOverlay';
  overlay.innerHTML = `
    <div class="input-modal" style="max-width:400px; padding:24px;">
      <div style="font-size:18px; font-weight:700; color:var(--text); margin-bottom:8px;">🔒 비밀번호 변경</div>
      <div style="font-size:12px; color:var(--text-dim); line-height:1.7; margin-bottom:14px;">
        기존 비밀번호로 잠금을 풀고 새 비밀번호로 다시 잠궈요.<br>
        <span style="color:var(--text-soft);">데이터는 그대로 — 비밀번호만 바뀌어요.</span>
      </div>
      <div style="margin-bottom:10px; position:relative;">
        <input type="password" id="e2eeChangePwOld" placeholder="기존 비밀번호" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" style="width:100%; font-family:inherit; padding-right:40px;">
        <button type="button" onclick="_togglePwView('e2eeChangePwOld', this)" title="보기 / 숨기기" style="position:absolute; right:6px; top:50%; transform:translateY(-50%); background:transparent; border:none; cursor:pointer; padding:6px 8px; color:var(--text-soft); font-size:16px;">👁</button>
      </div>
      <div style="margin-bottom:10px; position:relative;">
        <input type="password" id="e2eeChangePwNew" placeholder="새 비밀번호 (12자 이상)" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false" style="width:100%; font-family:inherit; padding-right:40px;">
        <button type="button" onclick="_togglePwView('e2eeChangePwNew', this)" title="보기 / 숨기기" style="position:absolute; right:6px; top:50%; transform:translateY(-50%); background:transparent; border:none; cursor:pointer; padding:6px 8px; color:var(--text-soft); font-size:16px;">👁</button>
      </div>
      <div style="margin-bottom:10px; position:relative;">
        <input type="password" id="e2eeChangePwConfirm" placeholder="새 비밀번호 다시 입력" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false" style="width:100%; font-family:inherit; padding-right:40px;">
        <button type="button" onclick="_togglePwView('e2eeChangePwConfirm', this)" title="보기 / 숨기기" style="position:absolute; right:6px; top:50%; transform:translateY(-50%); background:transparent; border:none; cursor:pointer; padding:6px 8px; color:var(--text-soft); font-size:16px;">👁</button>
      </div>
      <div id="e2eeChangePwStatus" style="font-size:11px; color:var(--text-soft); margin-bottom:14px; min-height:14px;"></div>
      <div style="font-size:10px; color:var(--text-soft); line-height:1.6; margin-bottom:14px; padding:8px; background:rgba(220,80,80,0.05); border-left:3px solid rgba(220,80,80,0.40); border-radius:4px;">
        ⚠️ 새 비밀번호도 분실 시 데이터 복구 X (회사도 X). 안전한 곳에 보관해주세요.
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn-primary" onclick="submitE2EEChangePassword()" style="flex:1;">변경</button>
        <button class="btn-secondary" onclick="cancelE2EEChangePassword()" style="flex:1;">취소</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('e2eeChangePwOld')?.focus(), 100);
}

async function submitE2EEChangePassword() {
  const oldPw = document.getElementById('e2eeChangePwOld')?.value || '';
  const newPw = document.getElementById('e2eeChangePwNew')?.value || '';
  const confirmPw = document.getElementById('e2eeChangePwConfirm')?.value || '';
  const status = document.getElementById('e2eeChangePwStatus');
  if (!status) return;
  status.style.color = 'var(--text-soft)';

  if (!oldPw) { status.textContent = '기존 비밀번호를 입력해주세요'; status.style.color = '#e89090'; return; }
  if (newPw !== confirmPw) {
    status.textContent = '새 비밀번호가 일치하지 않아요';
    status.style.color = '#e89090';
    return;
  }
  if (oldPw === newPw) {
    status.textContent = '새 비밀번호가 기존과 같아요';
    status.style.color = '#e89090';
    return;
  }
  const validation = _e2eeValidatePassword(newPw);
  if (!validation.ok) {
    status.textContent = validation.reason;
    status.style.color = '#e89090';
    return;
  }

  status.textContent = '변경 중...';
  try {
    await _e2eeChangePassword(oldPw, newPw);
    status.textContent = '✓ 비밀번호 변경 완료';
    status.style.color = 'var(--success, #98c379)';
    setTimeout(() => {
      cancelE2EEChangePassword();
      if (typeof showToast === 'function') showToast('🔒 비밀번호 변경 완료');
    }, 800);
  } catch (e) {
    status.textContent = e.message || '변경 실패';
    status.style.color = '#e89090';
  }
}

function cancelE2EEChangePassword() {
  const overlay = document.getElementById('e2eeChangePwOverlay');
  if (overlay) overlay.remove();
}

