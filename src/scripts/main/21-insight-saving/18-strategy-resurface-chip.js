// V4 (사용자 명시 2026-05-14 ultrathink): 전략 resurface chip — AI bubble 끝 inline.
//   _maybeResurfaceStrategyAfterAIResponse: generateAIResponse 응답 완료 시 fire-and-forget hook.
//   chip click → _showStrategyCardModal(card, {mode:'resurface'}) → "✦ 다시 해볼게" → attempt push.
//   chip X dismiss → 7일 cooldown (resurfaceDismissedAt 박음).
//   모달 "다음에" 는 단순 닫기 (cooldown X — 사용자 결정 6).
//   Deeper 분석 (4단) 응답에는 skip (사용자가 능동 분석 요청 — chip 잡음 회피).

// chip HTML — 02-render-message.js 가 inline 으로 호출.
function _renderStrategyResurfaceChipHTML(card, msgIdx) {
  if (!card || !card.id) return '';
  const title = (typeof escapeHtml === 'function') ? escapeHtml(card.title || '전략') : (card.title || '전략');
  return `<div class="strategy-resurface-chip" data-stratid="${card.id}" onclick="_onStrategyResurfaceChipClick(${msgIdx}, '${card.id}')">` +
    `<span class="srf-icon">🧬</span>` +
    `<span class="srf-title">${title}</span>` +
    `<span class="srf-cta">— 다시 꺼내볼래?</span>` +
    `<button class="srf-dismiss" onclick="_onStrategyResurfaceChipDismiss(${msgIdx}, '${card.id}', event)" aria-label="이번엔 됐어">×</button>` +
    `</div>`;
}

// surface 마킹 — card.lastResurfacedAt + resurfaceCount + state._strategyChapterSurfacedIds.
function _strategyMarkSurfacedNow(card) {
  if (!card || !card.id) return;
  card.lastResurfacedAt = new Date().toISOString();
  card.resurfaceCount = (card.resurfaceCount || 0) + 1;
  state._strategyChapterSurfacedIds = Array.isArray(state._strategyChapterSurfacedIds)
    ? state._strategyChapterSurfacedIds : [];
  if (!state._strategyChapterSurfacedIds.includes(card.id)) {
    state._strategyChapterSurfacedIds.push(card.id);
  }
}

// generateAIResponse 응답 완료 직후 호출 — fire-and-forget.
async function _maybeResurfaceStrategyAfterAIResponse() {
  try {
    if (!Array.isArray(state.chatMessages) || state.chatMessages.length === 0) return;
    let asstIdx = -1;
    for (let i = state.chatMessages.length - 1; i >= 0; i--) {
      const m = state.chatMessages[i];
      if (m && m.role === 'assistant' && !m.typing && !m.error) { asstIdx = i; break; }
    }
    if (asstIdx === -1) return;
    const lastAsst = state.chatMessages[asstIdx];
    if (lastAsst.resurfacedStrategyId) return;
    // Deeper(4단) 응답엔 surface skip — 사용자 능동 분석 요청, 추가 chip 잡음.
    if (lastAsst.fromDeeper) return;
    let userText = '';
    for (let i = asstIdx - 1; i >= 0; i--) {
      const m = state.chatMessages[i];
      if (m && m.role === 'user' && !m.error) { userText = m.content || ''; break; }
    }
    if (!userText) return;
    if (typeof _findResurfaceCandidate !== 'function') return;
    const card = await _findResurfaceCandidate(userText);
    if (!card) return;
    lastAsst.resurfacedStrategyId = card.id;
    _strategyMarkSurfacedNow(card);
    try { saveState(); } catch {}
    if (typeof renderChat === 'function') renderChat();
  } catch (e) {
    console.warn('[strat-resurface]', e?.message || e);
  } finally {
    // 다음 호출에 stale cache 안 남게 — RAG cache reset.
    try { window._ragLastQueryEmbedding = null; } catch {}
  }
}

// chip click → 카드 모달 (resurface mode).
function _onStrategyResurfaceChipClick(msgIdx, stratId) {
  const card = (typeof getStrategyCard === 'function') ? getStrategyCard(stratId) : null;
  if (!card) return;
  if (typeof _showStrategyCardModal === 'function') {
    _showStrategyCardModal(card, { mode: 'resurface', msgIdx });
  }
}

// chip X dismiss → 7일 cooldown + chip fade-out.
function _onStrategyResurfaceChipDismiss(msgIdx, stratId, ev) {
  if (ev) { try { ev.stopPropagation(); } catch {} try { ev.preventDefault(); } catch {} }
  const card = (typeof getStrategyCard === 'function') ? getStrategyCard(stratId) : null;
  if (!card) return;
  card.resurfaceDismissedAt = new Date().toISOString();
  try { saveState(); } catch {}
  const chip = document.querySelector(`.strategy-resurface-chip[data-stratid="${stratId}"]`);
  if (chip) {
    chip.classList.add('dismissed');
    setTimeout(() => { try { chip.remove(); } catch {} }, 200);
  }
}
