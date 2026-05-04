function topicToDecision(id) {
  const card = (state.topicCards || []).find(c => c.id === id);
  if (!card) return;
  const decision = {
    id: 'dec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    title: card.title,
    startedAt: new Date().toISOString(),
    status: 'in_progress',
    steps: DECISION_STEPS.map(s => ({ id: s.id, completed: false, content: '' })),
    finalDecision: null,
    predictions: null,
    sourceTopicCardId: id
  };
  state.decisions.push(decision);
  saveState();
  renderArchive();
  showToast('마법의 소라고동으로 보냈어 🐚');
  setTimeout(() => openDecision(decision.id), 600);
}

function topicToVault(id) {
  const card = (state.topicCards || []).find(c => c.id === id);
  if (!card) return;
  state.memoryVault.push({
    id: 'mv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    content: card.title + (card.summary ? ' — ' + card.summary : ''),
    source: 'topic',
    extractedAt: new Date().toISOString(),
    sourceTopicCardId: id,
    processed: false,
    priority: nextPriority()
  });
  saveState();
  renderArchive();
  showToast('서랍장에 추가됨 📥');
}

function topicToPearl(id) {
  const card = (state.topicCards || []).find(c => c.id === id);
  if (!card) return;
  state.pearls.push({
    id: 'pearl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    content: card.title + (card.summary ? '\n' + card.summary : ''),
    category: '순간',
    createdAt: new Date().toISOString(),
    sourceTopicCardId: id,
    type: 'pearl'
  });
  saveState();
  renderArchive();
  showToast('진주 바구니에 보관됨 💎');
}

// 사용자 명시 2026-05-01: topic → strategy 변환 = 돌연변이 first-gen mutation chat 흐름 (진화해볼게와 동일 UX).
// 옛 동작 (단순 category flip) 폐기. category 는 finalize (옵션 선택 후) 시점 promote.
function topicToStrategy(id) {
  const card = (state.topicCards || []).find(c => c.id === id);
  if (!card) return;
  if (card.category === 'strategy') {
    showToast('이미 전략 카드야');
    return;
  }
  // 출처 추적 + 빈 generations / evolutionChats 초기화 (mutation chat finalize 가 generations[0] push)
  card.sourceTopicCategory = card.category;
  if (!Array.isArray(card.generations)) card.generations = [];
  if (!Array.isArray(card.evolutionChats)) card.evolutionChats = [];
  // mutation chat open (firstGen 모드) — 사용자 취소 시 card 그대로 (category 변경 X)
  if (typeof openMutationChat === 'function') {
    openMutationChat(id, card.title, { firstGen: true });
  }
}

async function deleteTopicCard(id) {
  if (!await confirmDelete('이 토픽 카드')) return;
  state.topicCards = (state.topicCards || []).filter(c => c.id !== id);
  saveState();
  renderArchive();
  showToast('삭제됨');
}

// === V3.8 LENS: STRATEGIES — 전략 카드 모음 (깨달음 렌즈) ===
