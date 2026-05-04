function _showStrategyCardModal(card) {
  if (!card) return;
  if (document.querySelector('.strategy-card-preview-overlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'strategy-card-preview-overlay';
  overlay.innerHTML = `
    <div class="strategy-card-preview">
      <div class="scp-icon">🧬</div>
      <div class="scp-title">${escapeHtml(card.title || '새 전략')}</div>
      <div class="scp-sub">전략 카드로 양생방에 저장됐어 ✦</div>
      <div class="scp-body">
        ${card.problemContext ? `<div class="scp-row"><span class="scp-row-icon">🔍</span> ${escapeHtml((card.problemContext || '').slice(0, 80))}</div>` : ''}
        ${card.psychConcept ? `<div class="scp-row"><span class="scp-row-icon">💡</span> ${escapeHtml((card.psychConcept || '').slice(0, 80))}</div>` : ''}
        ${card.actionStrategy ? `<div class="scp-row"><span class="scp-row-icon">🌿</span> ${escapeHtml((card.actionStrategy || '').slice(0, 80))}</div>` : ''}
      </div>
      <button class="scp-btn" id="scpClose">계속 ✦</button>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  overlay.querySelector('#scpClose').addEventListener('click', _closeStrategyCardModal);
}
function _closeStrategyCardModal() {
  const overlay = document.querySelector('.strategy-card-preview-overlay');
  if (!overlay) return;
  overlay.classList.remove('show');
  setTimeout(() => { try { overlay.remove(); } catch {} }, 200);
}

// V4 (v8 묶음 7): startCore2 — testerMode ON + Core 1 분석 자동 복원 + 🎭 시뮬 배지 + 채팅탭 + click_strategy step
