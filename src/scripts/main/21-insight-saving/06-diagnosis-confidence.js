// V4-1o-3: 진단 자기 학습 — recently shown 진단의 confidence 조정
function updateDiagnosisConfidence(strategyId, status) {
  if (!Array.isArray(state.diagnoses)) return;
  const now = Date.now();
  const window = 7 * 86400000;  // 7일 내 shown 진단만
  state.diagnoses.forEach(d => {
    if (d.status !== 'shown') return;
    if (d.targetCardId && d.targetCardId !== strategyId) return;
    if (!d.detectedAt) return;
    const age = now - new Date(d.detectedAt).getTime();
    if (age > window) return;
    // weak_tool / wrong_layer: worked → confidence 감소 (진단 틀렸다는 신호) / didnt → 증가
    if (d.type === 'weak_tool' || d.type === 'wrong_layer') {
      const delta = status === 'worked' ? -0.15 : (status === 'didnt' ? 0.10 : 0);
      if (delta) {
        d.confidence = Math.max(0, Math.min(1, (d.confidence || 0.5) + delta));
        d.lastUpdate = new Date().toISOString();
        // confidence가 너무 낮아지면 status='dismissed' (다시 안 띄움 + 흔적 보존)
        if (d.confidence < 0.2) d.status = 'dismissed';
      }
    }
    // avoidance: worked → 회피 패턴 깨짐 → confidence 감소
    if (d.type === 'avoidance' && status === 'worked') {
      d.confidence = Math.max(0, (d.confidence || 0.5) - 0.20);
      if (d.confidence < 0.2) d.status = 'dismissed';
    }
  });
}

function updateEmbodimentStatus(card) {
  if (!card) return;
  // 사용자 명시 2026-05-01 (agent audit P9): 'archived' 분기 dead 정리. 사용자 진입 UI 없는 dead state.
  // 체화 (embodied = 5번 성공 → DNA 진주) 와 보관 (archived = 사용자 X 표시) 의미상 다름. archived 는 미구현 자리.
  if (card.embodimentStatus === 'embodied') return;

  const total = countTotalAttempts(card);
  const worked = countWorkedAttempts(card);

  // seedling → trying: 첫 시도부터
  if (card.embodimentStatus === 'seedling' && total >= 1) {
    card.embodimentStatus = 'trying';
  }

  // trying → working: worked 3회+ 자동 전환 + 5.8 톤 토스트.
  // (5.4 "사용자 확인"은 5회+ 결정화 의식에 한정. 3회 단계는 자동 + 인지 부담↓)
  // V4 (v8 묶음 19-H): 'trying' 또는 'evolved' 둘 다 working 으로 전환 (진화 가지도 worked 3회면 성장)
  if ((card.embodimentStatus === 'trying' || card.embodimentStatus === 'evolved') && worked >= 3) {
    card.embodimentStatus = 'working';
    if (typeof showToast === 'function') {
      showToast('🧬 가닥 색 진해짐 — 너만의 코드로 자리 잡고 있어');
    }
  }

  // working → embodied: worked 5회+ → 결정화 의식 prompt (V4-1d-4)
  if (worked >= 5 && card.embodimentStatus !== 'embodied') {
    if (typeof promptCrystallize === 'function') {
      try { promptCrystallize(card); } catch (e) { console.warn('promptCrystallize:', e); }
    }
  }
}

