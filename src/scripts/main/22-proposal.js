// ═══════════════════════════════════════════════════════════════
// PROPOSAL HANDLING (Phase 2 upgrade)
// ═══════════════════════════════════════════════════════════════

async function acceptProposal(idx) {
  const msg = state.chatMessages[idx];
  msg.proposalResponse = 'accept';

  // 사용자 요청 2026-04-29: 전략으로 안 누른 상태에서 해볼게 누르면 전략 DNA 흐름 끊김
  // (양생방 X / DNA 조각 X / 결정화 추적 X)
  // → 자동으로 saveMsgAsStrategy 먼저 돌림. 4단 분석 응답 (또는 fromDeeper)일 때만 — 평범한 대화엔 X.
  const has4Stage = /\[내가 본 것\]|\[이게 뭐냐면\]/.test(msg.content || '');
  if (!msg.savedStrategy && !msg.strategyId && msg.role === 'assistant' && !msg.typing && (msg.fromDeeper || has4Stage)) {
    try {
      await saveMsgAsStrategy(idx);
    } catch (e) { console.warn('auto-save strategy on accept:', e); }
  }

  // Create mission
  const proposalData = msg.proposalData || {};
  // V3.12.x: title 정제 (markdown/공백 제거, 너무 짧으면 fallback)
  let rawTitle = (proposalData.title || '').replace(/^[*#\s\[\]"']+|[*#\s\[\]"']+$/g, '').trim();
  if (!rawTitle || rawTitle.length < 2) rawTitle = extractProposalFromMessage(msg.content);
  const title = rawTitle;
  const description = proposalData.description || '';

  if (title) {
    // 사용자 요청 2026-04-28: 같은 메시지에서 'transition 전략으로'를 먼저 누른 경우 strategyId link → 미션 완료 시 shell이 DNA 조각으로 적용됨
    const opts = { sourceMessageIdx: idx };
    if (msg.strategyId) {
      opts.strategyId = msg.strategyId;
      const card = (state.topicCards || []).find(c => c.id === msg.strategyId);
      if (card && Array.isArray(card.generations)) {
        opts.generationIdx = card.generations.length - 1;
        opts.linkedStrategy = card.title;
      }
    }
    // V4 (v8 묶음 2): 4단 분석 안 [상황] AI 추출본 → 결과 체크 모달 📌 원래 문제 박스
    if (msg.situation) {
      opts.situation = msg.situation;
      opts._situationSource = 'llm_extracted';
    }
    createMission(title, description, opts);
    // V3.12.x: 해볼게 효과 — 소라의 부름 등장 celebration
    showCelebration('🐚', '소라가 널 부르고 있어!', '✨');
  }

  saveState();
  renderChat();
  renderTodayMission();

  // Brief confirm from AI
  state.chatMessages.push({
    role: 'assistant',
    content: `좋아! 홈 화면에 "${title}"이 오늘의 미션으로 등록됐어.\n\n완료하면 소라 하나 모아줄게 ✦`,
    timestamp: new Date().toISOString()
  });
  saveState();
  renderChat();
}

function extractProposalFromMessage(content) {
  // Extract text after [오늘의 제안]
  const match = content.match(/\[오늘의 제안\]([\s\S]+?)(?=\n\n|$)/);
  if (match) {
    let title = match[1].trim().split('\n')[0];
    // V3.12.x: markdown 제거 (**, ##, [ ] 등)
    title = title.replace(/^[*#\s\[\]]+|[*#\s\[\]]+$/g, '').slice(0, 40).trim();
    if (title && title.length >= 2) return title;
  }
  return '오늘의 미션';
}

function declineProposal(idx) {
  state.chatMessages[idx].proposalResponse = 'decline';
  saveState(); renderChat();
  state.chatMessages.push({
    role: 'assistant',
    content: '알았어. 지금 말고도 괜찮아. 언제든 준비되면 말해 🐚',
    timestamp: new Date().toISOString()
  });
  saveState(); renderChat();
}

