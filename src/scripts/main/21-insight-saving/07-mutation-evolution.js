// V4-1d-3 wire용: 사용자 "안 통함" → 새 generation 생성, 이전 gen은 mutated.
function mutateToNewGeneration(strategyId, layer, action) {
  const card = getStrategyCard(strategyId);
  if (!card) return null;
  if (!Array.isArray(card.generations)) card.generations = [];
  const prevGen = getCurrentGeneration(card);
  if (prevGen) {
    prevGen.status = 'mutated';
    // 사용자 요청 2026-04-28: 옛 카드 내용 (title/problem/concept/action) prev gen에 snapshot 보존 — 진화 트리에서 보임
    if (!prevGen.snapshot) {
      prevGen.snapshot = {
        title: card.title || '',
        problemContext: card.problemContext || '',
        psychConcept: card.psychConcept || '',
        actionStrategy: card.actionStrategy || ''
      };
    }
  }
  const newGen = {
    gen: card.generations.length + 1,
    layer: layer || 'L2',
    action: action || '',
    missions: [],
    shells: [],
    attempts: [],
    status: 'working'
  };
  card.generations.push(newGen);
  card.embodimentStatus = 'evolved'; // V4 (v8 묶음 19-H, 사용자 짚음 2026-05-03): 진화 가지 시작 — 신 상태 evolved (옛 'trying' reset 정정)
  // V4-fix v3 (사용자 보고): 양생방 카드 시각 갱신
  // - title = 돌연변이로 바뀐 새 행동 전략 (사용자 요청 — 제목 자체 변경)
  // - actionStrategy = 새 generation의 action 그대로
  // - 진화 트리 자동 펼침
  if (action) {
    card.actionStrategy = action;
    card.title = action.length > 40 ? action.slice(0, 40) + '...' : action;
  }
  // 사용자 요청 2026-04-28: 진화 직후엔 트리 접힘 (사용자가 직접 제목 클릭해서 펼치는 경험)
  if (!state.preferences) state.preferences = {};
  if (!state.preferences._strategyTreeOpen) state.preferences._strategyTreeOpen = {};
  state.preferences._strategyTreeOpen[strategyId] = false;
  saveState();
  return card;
}

// V4-1d-4 wire용: 5.6 3 경로 결정.
function determineEmbodimentPath(card) {
  if (!card || !Array.isArray(card.generations)) return 'one-shot';
  const gens = card.generations;
  if (gens.length === 1) return 'one-shot';
  if (gens.length <= 2) return 'quick-discovery';
  return 'evolved';
}

// V4-1d-2: 시도 결과 체크 4 옵션 모달.
// 안티-자책 톤 (V4 비전 5.9): "실패" X, "안 통했어 / 못 시도했어" 톤.
// returns: 'worked' | 'meh' | 'didnt' | 'skipped' | 'defer' | null (사용자 취소)
// V4 (v8 묶음 1): 결과 체크 모달 — 시그너처 객체 ({ strategyName, situation, missionTitle }) + string legacy 호환.
// 옵션 4개 (skipped 폐기) + 배경 클릭 X (명시 선택 강제) + 📌 원래 문제 박스 (situation 있을 때만)
async function showAttemptResultModal(arg) {
  let strategyName = '', situation = '', missionTitle = '';
  if (typeof arg === 'string') {
    strategyName = arg;
  } else if (arg && typeof arg === 'object') {
    strategyName = arg.strategyName || '';
    situation = arg.situation || '';
    missionTitle = arg.missionTitle || '';
  }
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'attempt-result-modal-overlay';
    const sitHtml = situation ? `
      <div class="attempt-result-section problem">
        <div class="attempt-result-section-label">📌 원래 문제</div>
        <div class="attempt-result-section-text">${escapeHtml(String(situation).slice(0, 200))}</div>
      </div>` : '';
    const missionHtml = missionTitle ? `
      <div class="attempt-result-section attempt">
        <div class="attempt-result-section-label">🌿 이번 시도</div>
        <div class="attempt-result-section-text">${escapeHtml(missionTitle)}</div>
      </div>` : '';
    const promptLine = strategyName
      ? `「${escapeHtml(strategyName)}」 통했어?`
      : `통했어?`;
    overlay.innerHTML = `
      <div class="attempt-result-modal">
        <div class="attempt-result-title">어땠어?</div>
        ${sitHtml}
        ${missionHtml}
        <div class="attempt-result-prompt">${promptLine}</div>
        <div class="attempt-result-options">
          <button class="result-option-btn primary" data-status="worked">👍 해결 됐어</button>
          <button class="result-option-btn" data-status="meh">🤔 그저 그래</button>
          <button class="result-option-btn" data-status="didnt">👎 안 통했어</button>
          <button class="result-option-btn defer" data-status="defer">⏸ 아직 결과 안 나왔어</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    overlay.querySelectorAll('.result-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const status = btn.dataset.status;
        overlay.classList.remove('show');
        setTimeout(() => { try { overlay.remove(); } catch {} }, 200);
        resolve(status);
      });
    });
    // 배경 클릭 X — 사용자 명시 선택 강제 (의도된 cancel 막힘)
  });
}

// V4-1d-3: 돌연변이 진화 — 임시 채팅 (4 옵션 picker).
// V4 비전 6.3: 안 통한 가지 → 다른 가지에서 4 옵션 즉석 → 사용자 선택 → 새 generation + 새 미션.
// 5.8 톤: "🧬 돌연변이 시점. [전략명] 가지 끝났어 — 발견 [무엇]. 새 가지 어디서? 🌍/👥/🧠/🪞"
// 메인 흐름 X (anchor 29). non-blocking: completeMission이 await 안 함.
const _LAYER_EMOJI = { L1: '🧠', L2: '🎯', L3: '🌍', L4: '👥', L5: '🪞' };
const _LAYER_NAME  = { L1: '인지', L2: '행동', L3: '환경', L4: '사회', L5: '메타' };

