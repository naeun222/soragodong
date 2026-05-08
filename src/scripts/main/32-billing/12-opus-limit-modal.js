// 사용자 명시 2026-05-02 ultrathink: Opus 일일 30번 한도 도달 모달.
// 카피 "오늘 깊은 대화 다 나눴네. 이만 여기까지 하고 쉬자 🫂" — "내일 또" 같은 미래 약속 X (현재로 닫음).
function showOpusLimitReachedModal() {
  if (document.getElementById('opusLimitOverlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay show';
  overlay.id = 'opusLimitOverlay';
  overlay.style.zIndex = '10000';
  overlay.innerHTML = `
    <div class="input-modal" style="max-width:360px; padding:28px; text-align:center;">
      <div style="font-size:36px; margin-bottom:10px;">🦉</div>
      <div style="font-size:15px; font-weight:600; color:var(--text); line-height:1.7; margin-bottom:18px;">
        오늘 깊은 대화 다 나눴네.<br>이만 여기까지 하고 쉬자 🫂
      </div>
      <button class="btn-primary" onclick="document.getElementById('opusLimitOverlay').remove();" style="width:100%;">알겠어</button>
    </div>
  `;
  document.body.appendChild(overlay);
}

// 사용자 명시 2026-05-08 ultrathink (audit FAIL #6): 평문 export 경고 — PIPA §29 안전조치 의무.
// E2EE 활성 사용자도 export 파일은 평문 — 기기 분실 시 위험. 사용자 confirm 후 진행.
async function exportData() {
  const _msg = '⚠️ 이 백업 파일은 암호화되지 않습니다.\n\n파일 안에 일기·대화·진주·전략 등 모든 자기관찰 데이터가 평문으로 들어갑니다. 파일을 분실하면 누구든 열람 가능해요.\n\n안전한 곳에만 보관해주세요:\n· 비밀번호로 잠긴 메모/USB\n· 암호화된 클라우드 (1Password / Bitwarden 첨부)\n· 본인만 접근 가능한 외장 디스크\n\n계속 진행할까?';
  const _ok = (typeof showConfirmModal === 'function')
    ? await showConfirmModal({ title: '백업 파일 평문 경고', message: _msg, confirmText: '응, 진행', cancelText: '취소' })
    : confirm(_msg);
  if (!_ok) return;
  const dataStr = JSON.stringify(state, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `soragodong_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

