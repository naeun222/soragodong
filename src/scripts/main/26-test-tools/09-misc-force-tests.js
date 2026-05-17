// 월간 리뷰 강제 생성 (V3.12) — 가드 우회 (dayOfMonth>7 무시)
async function testForceMonthlyReview() {
  showToast('🌙 월간 리뷰 강제 생성 중...');
  const today = new Date();
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 15);
  const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
  if (Array.isArray(state.monthlyReviews)) {
    state.monthlyReviews = state.monthlyReviews.filter(r => r.monthKey !== lastMonthKey);
  }
  let summary = '';
  let sections = null;
  if (_canAI() &&typeof generateReview === 'function') {
    try {
      const r = await generateReview('monthly');
      summary = r.summary || '';
      sections = r.sections;
    } catch (e) { console.warn('monthly AI failed:', e); }
  }
  if (!sections) {
    summary = '지난 달, 논문 진척과 일상 회복 둘 다 진행됨. drained 모드 4일.';
    sections = {
      patterns: '월 후반부에 마감 전 폭발력 작동.',
      good_moments: '환경 도구 (카페, 자동 종료) 시도 늘어남.',
      hard_moments: '거절 후 부채감 패턴 N회 등장.',
      next_suggestion: '거절 직후 5분 산책 — 부채감 소화 자동화.'
    };
  }
  state.monthlyReviews.push({
    completedAt: new Date().toISOString(),
    summary, sections, userNote: '',
    monthKey: lastMonthKey, auto: true
  });
  saveState({ force: true });
  showToast('✅ 월간 리뷰 생성됨 (홈 → 마법·리뷰 → 🌙 리뷰 모음)');
}

// 마법고동 active 결정 진입
function testForceDecisionRoom() {
  const active = (state.decisions || []).find(d => d.status === 'active');
  if (active && typeof openDecision === 'function') {
    openDecision(active.id);
    showToast(`🌀 "${active.topic}" 마법고동 진입`);
  } else if (typeof startNewDecision === 'function') {
    startNewDecision();
    showToast('🌀 새 마법고동 시작');
  } else {
    showToast('⚠️ 마법고동 관련 함수 X');
  }
}

