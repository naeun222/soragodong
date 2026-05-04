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

function exportData() {
  const dataStr = JSON.stringify(state, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `soragodong_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

