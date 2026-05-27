// V4 (사용자 명시 2026-05-14 ultrathink): opts.mode='resurface' 분기 — 챗 도중 자동 surface 된 카드 클릭 시.
//   서브 카피 + primary "✦ 다시 해볼게" → _resurfaceStrategyAsMission (acceptProposal 흐름 재활용: createMission + recordStrategyAttempt + showCelebration + AI 확인 메시지).
//   ghost "다음에" — 단순 닫기 (cooldown X — chip X dismiss 만 7일 cooldown, 사용자 결정 6).
function _showStrategyCardModal(card, opts) {
  if (!card) return;
  if (document.querySelector('.strategy-card-preview-overlay')) return;
  opts = opts || {};
  const isResurface = opts.mode === 'resurface';
  const msgIdx = (typeof opts.msgIdx === 'number') ? opts.msgIdx : null;
  const subCopy = isResurface
    ? '같은 결 다시 마주쳤네 — 다시 꺼내볼래?'
    : '전략 카드로 키움에 저장됐어 ✦';
  const primaryLabel = isResurface ? '✦ 다시 해볼게' : '계속 ✦';
  const ghostBtn = isResurface
    ? `<button class="scp-btn scp-btn-ghost" id="scpGhost">다음에</button>`
    : '';
  const overlay = document.createElement('div');
  overlay.className = 'strategy-card-preview-overlay';
  overlay.innerHTML = `
    <div class="strategy-card-preview">
      <div class="scp-icon">🧬</div>
      <div class="scp-title">${escapeHtml(card.title || '새 전략')}</div>
      <div class="scp-sub">${escapeHtml(subCopy)}</div>
      <div class="scp-body">
        ${card.problemContext ? `<div class="scp-row"><span class="scp-row-icon">🔍</span> ${escapeHtml((card.problemContext || '').slice(0, 80))}</div>` : ''}
        ${card.psychConcept ? `<div class="scp-row"><span class="scp-row-icon">💡</span> ${escapeHtml((card.psychConcept || '').slice(0, 80))}</div>` : ''}
        ${card.actionStrategy ? `<div class="scp-row"><span class="scp-row-icon">🌿</span> ${escapeHtml((card.actionStrategy || '').slice(0, 80))}</div>` : ''}
      </div>
      <button class="scp-btn" id="scpClose">${primaryLabel}</button>
      ${ghostBtn}
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  const closeBtn = overlay.querySelector('#scpClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      if (isResurface) {
        _closeStrategyCardModal();
        try { _resurfaceStrategyAsMission(card, msgIdx); }
        catch (e) { console.warn('[resurface as mission]', e); }
      } else {
        _closeStrategyCardModal();
      }
    });
  }
  const ghost = overlay.querySelector('#scpGhost');
  if (ghost) {
    // 사용자 결정 6: 모달 "다음에" 는 단순 닫기 (cooldown X — chip X dismiss 만 7일 cooldown).
    ghost.addEventListener('click', _closeStrategyCardModal);
  }
}

// V4 (사용자 명시 2026-05-14 ultrathink): resurface chip → 카드 모달 → "✦ 다시 해볼게" 클릭 시
//   acceptProposal 흐름 재활용 — createMission(title=card.title, strategyId, situation=마지막 user 메시지 발췌)
//   + recordStrategyAttempt(missionId, 'trying', 'chat-resurface')
//   + showCelebration + renderTodayMission + AI 확인 메시지 push + chip dismiss.
function _resurfaceStrategyAsMission(card, msgIdx) {
  if (!card || !card.id) return;
  const title = (card.title || '').trim() || '전략 다시 해보기';
  // 상황 pre-fill: 마지막 user 메시지 발췌 (50자 이내). msgIdx 이전 가장 가까운 user 메시지.
  let situation = '';
  try {
    if (Array.isArray(state.chatMessages) && state.chatMessages.length) {
      const startIdx = (typeof msgIdx === 'number' && msgIdx >= 0)
        ? Math.min(msgIdx, state.chatMessages.length - 1)
        : state.chatMessages.length - 1;
      for (let i = startIdx; i >= 0; i--) {
        const m = state.chatMessages[i];
        if (m && m.role === 'user' && !m.error && m.content) {
          situation = (m.content || '').trim().slice(0, 50);
          break;
        }
      }
    }
  } catch {}
  // 미션 생성 (acceptProposal 패턴: createMission + strategyId/generationIdx/situation link).
  const opts = {
    strategyId: card.id,
    linkedStrategy: card.title || ''
  };
  if (Array.isArray(card.generations) && card.generations.length) {
    opts.generationIdx = card.generations.length - 1;
  }
  if (situation) {
    opts.situation = situation;
    opts._situationSource = 'llm_extracted';
  }
  const description = card.actionStrategy || card.psychConcept || '';
  let mission = null;
  try {
    if (typeof createMission === 'function') {
      mission = createMission(title, description, opts);
    }
  } catch (e) { console.warn('[resurface createMission]', e); }
  // attempts 누적 — missionId link, source='chat-resurface'.
  try {
    if (mission && mission.id && typeof recordStrategyAttempt === 'function') {
      recordStrategyAttempt(card.id, 'trying', mission.id, 'chat-resurface');
    }
  } catch (e) { console.warn('[resurface recordAttempt]', e); }
  // chip dismiss (해당 메시지 stash 비우고 DOM 제거) — 같은 chip 재렌더 방지.
  try {
    if (typeof msgIdx === 'number' && Array.isArray(state.chatMessages) && state.chatMessages[msgIdx]) {
      state.chatMessages[msgIdx].resurfacedStrategyId = null;
    }
  } catch {}
  try {
    const chip = document.querySelector(`.strategy-resurface-chip[data-stratid="${card.id}"]`);
    if (chip) {
      chip.classList.add('dismissed');
      setTimeout(() => { try { chip.remove(); } catch {} }, 200);
    }
  } catch {}
  // 셀러브레이션 + 미션 카드 active 화 + AI 확인 메시지 (acceptProposal 패턴 그대로).
  try { if (typeof showCelebration === 'function') showCelebration('🧬', '다시 한 번 — 미션으로 시작!', '✦'); } catch {}
  try { saveState(); } catch {}
  try { if (typeof renderTodayMission === 'function') renderTodayMission(); } catch {}
  try {
    state.chatMessages.push({
      role: 'assistant',
      content: `좋아, "${title}" 다시 한번 해보자. 홈에 오늘의 미션으로 등록됐어 🧬\n\n결과는 미션 끝나고 체크하면 돼 ✦`,
      timestamp: new Date().toISOString()
    });
    saveState();
    if (typeof renderChat === 'function') renderChat();
  } catch (e) { console.warn('[resurface AI msg]', e); }
}
function _closeStrategyCardModal() {
  const overlay = document.querySelector('.strategy-card-preview-overlay');
  if (!overlay) return;
  overlay.classList.remove('show');
  setTimeout(() => { try { overlay.remove(); } catch {} }, 200);
}

// V4 (v8 묶음 7): startCore2 — testerMode ON + Core 1 분석 자동 복원 + 🎭 시뮬 배지 + 채팅탭 + click_strategy step
