// V4-fix v3 (사용자 요청): worked → DNA 조각 연결 모션 (소라 → 가닥 → 홈)
function showDnaConnectAnimation(strategyId, missionId) {
  const card = (state.topicCards || []).find(c => c.id === strategyId);
  const cardTitle = card ? card.title : '가닥';
  // 최근 적용된 shell 1개
  const shell = (state.shellCollection || []).slice().reverse().find(s => s.missionId === missionId) || (state.shellCollection || [])[(state.shellCollection || []).length - 1];
  const emoji = shell ? shell.type : '🐚';
  // DOM overlay
  const overlay = document.createElement('div');
  overlay.className = 'dna-connect-overlay';
  overlay.innerHTML = `
    <div class="dna-connect-stage">
      <div class="dna-connect-shell">${emoji}</div>
      <div class="dna-connect-line"></div>
      <div class="dna-connect-strand">🧬</div>
      <div class="dna-connect-text">"${escapeHtml(cardTitle)}"<br><span style="font-size:11px; color:rgba(255,255,255,0.7);">DNA에 적용됐어 ✦</span></div>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('show'), 50);
  setTimeout(() => {
    overlay.classList.add('out');
    setTimeout(() => overlay.remove(), 600);
  }, 2400);
}

