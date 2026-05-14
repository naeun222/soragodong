// ═══════════════════════════════════════════════════════════════
// V4 EMBODIMENT STATE MACHINE (체화 상태 머신)
// ───────────────────────────────────────────────────────────────
// 전략 카드의 generations[] 안 attempts[]를 기록하고,
// 누적 worked 수에 따라 embodimentStatus 자동 전환.
// V4 비전 5.4 전환 규칙:
//   🌱 seedling → 🌿 trying: 자동 (시도 1회+)
//   🌿 trying → 🌳 working: 누적 worked 3회 + 사용자 확인 (V4-1d-2 prompt)
//   🌳 working → 🍃 embodied: 누적 worked 5회 + 사용자 확인 (V4-1d-4 결정화 의식)
//   any → 🪦 mutated: 사용자 "안 통함" 클릭 → 새 generation
// ═══════════════════════════════════════════════════════════════

function getStrategyCard(strategyId) {
  if (!strategyId || !Array.isArray(state.topicCards)) return null;
  // 사용자 명시 2026-05-01: first-gen mutation (topic → strategy 변환) 진행 중이면 category 무관 검색.
  // finalize 시점 (옵션 선택 후) 에 category='strategy' 로 promote.
  if (_mutationChatState && _mutationChatState.firstGenTopicId === strategyId) {
    return state.topicCards.find(c => c.id === strategyId) || null;
  }
  return state.topicCards.find(c => c.id === strategyId && c.category === 'strategy') || null;
}

function getCurrentGeneration(card) {
  if (!card || !Array.isArray(card.generations) || !card.generations.length) return null;
  return card.generations[card.generations.length - 1];
}

function countWorkedAttempts(card) {
  if (!card || !Array.isArray(card.generations)) return 0;
  return card.generations.reduce((acc, g) =>
    acc + (Array.isArray(g.attempts) ? g.attempts.filter(a => a.status === 'worked').length : 0)
  , 0);
}

function countTotalAttempts(card) {
  if (!card || !Array.isArray(card.generations)) return 0;
  return card.generations.reduce((acc, g) =>
    acc + (Array.isArray(g.attempts) ? g.attempts.length : 0)
  , 0);
}

// status: 'worked' | 'meh' | 'didnt' | 'skipped'
// V4 (사용자 명시 2026-05-14): source 인자 추가 (backward-compat 4번째 arg). resurface chip 클릭 시 'chat-resurface' 전달.
function recordStrategyAttempt(strategyId, status, missionId, source) {
  const card = getStrategyCard(strategyId);
  if (!card) return null;
  const gen = getCurrentGeneration(card);
  if (!gen) return null;
  if (!Array.isArray(gen.attempts)) gen.attempts = [];
  // 사용자 요청 2026-04-28: shell 매핑 — missionId에 해당하는 shell이 있으면 attempt에 shellId 적용하고 gen.shells에 추가 (DNA 조각화)
  let shellId = null;
  if (missionId && (status === 'worked' || status === 'meh')) {
    const matched = (state.shellCollection || []).find(s => s.missionId === missionId);
    if (matched) shellId = matched._id;
  }
  gen.attempts.push({
    missionId: missionId || null,
    shellId,
    status,
    at: new Date().toISOString(),
    ...(source ? { source } : {})
  });
  if (!Array.isArray(gen.shells)) gen.shells = [];
  if (shellId && !gen.shells.includes(shellId)) gen.shells.push(shellId);
  if (missionId && Array.isArray(gen.missions) && !gen.missions.includes(missionId)) {
    gen.missions.push(missionId);
  }
  updateEmbodimentStatus(card);
  // V4-1o-3: 자기 학습 — recently shown 진단의 confidence를 결과로 갱신
  // V4 비전 9.5: "관찰 받고 행동 → 결과로 confidence 갱신"
  // weak_tool / wrong_layer 진단이 7일 내 shown인 경우, 이 카드 attempt 결과로 confidence 조정
  if (typeof updateDiagnosisConfidence === 'function') {
    try { updateDiagnosisConfidence(strategyId, status); } catch (e) { console.warn('updateDiagConf:', e); }
  }
  saveState();
  return card;
}

