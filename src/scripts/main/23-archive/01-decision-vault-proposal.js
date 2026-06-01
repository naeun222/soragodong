// ═══════════════════════════════════════════════════════════════
// ARCHIVE
// ═══════════════════════════════════════════════════════════════
// === Decision Suggestion Handlers (V3.1) ===
function acceptDecisionSuggestion(idx) {
  const msg = state.chatMessages[idx];
  if (!msg || !msg.decisionSuggested) return;
  
  const ds = msg.decisionSuggested;
  const decision = {
    id: 'dec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    title: ds.title,
    startedAt: new Date().toISOString(),
    status: 'in_progress',
    steps: DECISION_STEPS.map(s => ({ id: s.id, completed: false, content: '' })),
    finalDecision: null,
    predictions: null,
    sourceMessageIdx: idx
  };
  state.decisions.push(decision);
  msg.decisionResponse = 'accept';
  saveState();
  renderChat();
  showToast('마법고동으로 보냈어 🐚');
  setTimeout(() => openDecision(decision.id), 600);
}

function declineDecisionSuggestion(idx) {
  const msg = state.chatMessages[idx];
  if (!msg || !msg.decisionSuggested) return;
  msg.decisionResponse = 'decline';
  saveState();
  renderChat();
}

// V3.6: Vault proposal — 대화에서 추출한 할 일을 서랍장에 넣을지 확인
function acceptVaultProposal(msgIdx, proposalId) {
  const msg = state.chatMessages[msgIdx];
  if (!msg || !Array.isArray(msg.vaultProposals)) return;
  const p = msg.vaultProposals.find(x => x.proposalId === proposalId);
  if (!p || p.responded) return;
  // 한 번 더 vault에 동일 항목 있는지 fuzzy 체크
  // V4 fix (사용자 명시 2026-05-30 — 장기 안전 Phase 2 ②): slice(-30) → 전체 범위 dedup.
  //   배경: 최근 30개만 비교 → 31번째 이전과 중복돼도 못 막아 vault 누적. 사용자 수동 accept 흐름이라 빈도 낮음 (전체 순회 무해).
  const existsInVault = (state.memoryVault || []).find(v =>
    v.content && similarText(v.content, p.content)
  );
  if (!existsInVault) {
    state.memoryVault.push({
      id: 'mv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      content: p.content,
      source: 'chat',
      extractedAt: new Date().toISOString(),
      sourceMessageIdx: msgIdx,
      processed: false,
      priority: nextPriority()
    });
  }
  p.responded = true;
  p.accepted = true;
  saveState();
  renderChat();
}

function declineVaultProposal(msgIdx, proposalId) {
  const msg = state.chatMessages[msgIdx];
  if (!msg || !Array.isArray(msg.vaultProposals)) return;
  const p = msg.vaultProposals.find(x => x.proposalId === proposalId);
  if (!p || p.responded) return;
  p.responded = true;
  p.accepted = false;
  saveState();
  renderChat();
  // V3.7: undo 토스트 — "괜찮아" 잘못 눌렀을 수 있음
  showUndoToast('서랍장에 안 넣음', () => {
    p.responded = false;
    p.accepted = null;
    saveState();
    renderChat();
  });
}

