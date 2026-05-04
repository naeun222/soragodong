// 9.5 임계값 기반 신호 검사. 한 가닥 또는 전체 state 검사.
function detectDiagnoses() {
  const detected = [];
  const cards = (state.topicCards || []).filter(c => c.category === 'strategy');
  if (cards.length === 0) return detected;

  // (1) 도구 약함: 한 가닥 같은 layer attempt 3+ / worked 0
  cards.forEach(card => {
    if (!Array.isArray(card.generations)) return;
    card.generations.forEach(gen => {
      const attempts = gen.attempts || [];
      if (attempts.length < 3) return;
      const worked = attempts.filter(a => a.status === 'worked').length;
      if (worked === 0) {
        detected.push({
          type: 'weak_tool',
          confidence: 0.7,
          evidence: `"${card.title}" — ${gen.layer} 차원 ${attempts.length}회 시도, 작동 0`,
          targetCardId: card.id
        });
      }
    });
  });

  // (2) 차원 안 맞음: 한 layer 3+ didnt + 같은 카드 다른 layer 시도 X
  cards.forEach(card => {
    if (!Array.isArray(card.generations)) return;
    const usedLayers = new Set();
    let weakLayer = null;
    let weakDidntCount = 0;
    card.generations.forEach(gen => {
      usedLayers.add(gen.layer);
      const didnt = (gen.attempts || []).filter(a => a.status === 'didnt').length;
      if (didnt >= 3 && !weakLayer) {
        weakLayer = gen.layer;
        weakDidntCount = didnt;
      }
    });
    if (weakLayer && usedLayers.size === 1) {
      detected.push({
        type: 'wrong_layer',
        confidence: 0.7,
        evidence: `"${card.title}" — ${weakLayer} 차원만 ${weakDidntCount}회 안 통함. 다른 차원 시도 X.`,
        targetCardId: card.id
      });
    }
  });

  // (3) 가치 상충: 여러 가닥(2+)에서 모든 attempt didnt + values N개+
  const totalCardsWithAllDidnt = cards.filter(card => {
    const allAttempts = (card.generations || []).flatMap(g => g.attempts || []);
    if (allAttempts.length < 2) return false;
    return allAttempts.every(a => a.status === 'didnt' || a.status === 'meh');
  });
  if (totalCardsWithAllDidnt.length >= 2 && (state.values || []).length >= 2) {
    detected.push({
      type: 'value_clash',
      confidence: 0.6,
      evidence: `${totalCardsWithAllDidnt.length}개 가닥에서 모든 시도 안 통함 — 가치 상충 가능성`
    });
  }

  // (4) 회피 패턴: seedling > 30일 OR skipped > 50%
  const now = Date.now();
  cards.forEach(card => {
    if (card.embodimentStatus === 'seedling' && card.createdAt) {
      const days = Math.floor((now - new Date(card.createdAt).getTime()) / 86400000);
      if (days >= 30) {
        detected.push({
          type: 'avoidance',
          confidence: 0.55,
          evidence: `"${card.title}" — ${days}일째 미시도 (seedling)`,
          targetCardId: card.id
        });
      }
    }
    const allAttempts = (card.generations || []).flatMap(g => g.attempts || []);
    if (allAttempts.length >= 4) {
      const skipped = allAttempts.filter(a => a.status === 'skipped').length;
      if (skipped / allAttempts.length > 0.5) {
        detected.push({
          type: 'avoidance',
          confidence: 0.65,
          evidence: `"${card.title}" — ${allAttempts.length}회 중 ${skipped}회 못 시도 (50%+)`,
          targetCardId: card.id
        });
      }
    }
  });

  // (5) 의지 임계치 X: drained 모드 30일+ + strategy 신규 X
  // (drained 모드는 V3.11.x: state.modes.rest? 아니면 별도 — 단순화: rest 모드 활성 30일+)
  const restSince = state.modeActiveSince?.rest;
  if (restSince) {
    const days = Math.floor((now - new Date(restSince).getTime()) / 86400000);
    if (days >= 30) {
      // 신규 strategy 30일 내 X
      const recentNewStrategy = cards.some(c => {
        if (!c.createdAt) return false;
        const cdays = Math.floor((now - new Date(c.createdAt).getTime()) / 86400000);
        return cdays < 30;
      });
      if (!recentNewStrategy) {
        detected.push({
          type: 'willpower_cap',
          confidence: 0.6,
          evidence: `${days}일째 휴식 모드 + 신규 가닥 X`
        });
      }
    }
  }

  return detected;
}

// 진단 결과를 state.diagnoses에 등록 (한 진단당 1회 가드).
// type별로 detectedAt 30일 이내 같은 type 있으면 skip.
function registerDiagnoses(detected) {
  if (!Array.isArray(state.diagnoses)) state.diagnoses = [];
  const now = Date.now();
  // 사용자 명시 2026-05-01 (agent audit): cooldown 분기 — 일반 30일 / dismissed 진단 180일.
  // dismissed 된 진단 type 이 같은 카드에서 30일 후 재감지되며 반복 dismiss 사이클 자리 차단.
  const cooldownActive = 30 * 86400000;
  const cooldownDismissed = 180 * 86400000;
  let added = 0;
  detected.forEach(d => {
    const recentSame = state.diagnoses.find(x => {
      if (x.type !== d.type || x.targetCardId !== d.targetCardId) return false;
      if (!x.detectedAt) return false;
      const elapsed = now - new Date(x.detectedAt).getTime();
      const cool = (x.status === 'dismissed') ? cooldownDismissed : cooldownActive;
      return elapsed < cool;
    });
    if (recentSame) return;
    state.diagnoses.push({
      id: 'diag_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      type: d.type,
      confidence: d.confidence,
      evidence: d.evidence,
      targetCardId: d.targetCardId || null,
      detectedAt: new Date().toISOString(),
      status: 'active'
    });
    added++;
  });
  if (added > 0) saveState();
  return added;
}

// 자동 trigger: 홈 진입 시 또는 init 후 1회. 조용히 등록 (UI 표시 X — chat 자연 인용용).
function runDiagnosesIfNeeded() {
  // 마지막 실행 24시간 이내면 skip (state.preferences._diagLastRunAt)
  if (!state.preferences) state.preferences = {};
  const last = state.preferences._diagLastRunAt;
  if (last && (Date.now() - new Date(last).getTime()) < 24 * 3600000) return;
  const detected = detectDiagnoses();
  registerDiagnoses(detected);
  state.preferences._diagLastRunAt = new Date().toISOString();
  saveState();
}

// active 진단 1개 가져오기 (chat system prompt inject용)
function getActiveDiagnosis() {
  return (state.diagnoses || []).find(d => d.status === 'active') || null;
}

// 진단을 chat에 인용한 후 status='shown' 마킹 (재기 가드)
function markDiagnosisShown(id) {
  const d = (state.diagnoses || []).find(x => x.id === id);
  if (d) {
    d.status = 'shown';
    saveState();
  }
}

// V4-1e: 양생 미션 흐름 — strategy 카드 "✦ 해볼게" → 임시 대화 → 오늘의 제안 → 부름.
// 사용자 요청 2026-04-28: 해볼게 누르면 임시 대화창 → "어떤 상황이야?" → AI 오늘의 제안 → 부름 등록
