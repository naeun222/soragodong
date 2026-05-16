// V4 (사용자 명시 2026-05-16 ultrathink): testerMode fallback 시드 추가 도구.
// 실 데이터 인사이트 발견은 testForceInsightDiscover() (24-auto-insight-discover.js) — 테스터모드 OFF 필요.
// 이 함수는 testerMode 안에서 fallback 시드 3개 push (UI 검증용).
async function testForceDiscoverInsights() {
  if (!state.preferences || !state.preferences.testerMode) {
    showToast('⚠️ 테스터 모드 ON 후 사용 (실 데이터 발견은 testForceInsightDiscover)');
    return;
  }
  _addFallbackInsights();
}

function _addFallbackInsights() {
  if (!Array.isArray(state.insights)) state.insights = [];
  const fallback = [
    { type: 'causal',  content: '아침 6시 이전 기상한 날 — 작업 진척 평균 ↑',
      evidence: '시드 데이터 기반 추정.', confidence: 0.7 },
    { type: 'pattern', content: '실험 직전 명상 10분 → 집중력 ↑',
      evidence: '명상 체크형 +18회, 실험 success 동반.', confidence: 0.65 },
    { type: 'causal',  content: '논문 막힘 → 환경 바꾸면 30분 안에 진척',
      evidence: '"카페" / "도서관" 일기 후 작업 진척 빈번.', confidence: 0.75 }
  ];
  fallback.forEach(f => {
    state.insights.push({
      id: 'ins_fb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      ...f, supportingEntryIds: [],
      discoveredAt: new Date().toISOString(), dismissed: false, user_verified: false
    });
  });
  saveState({ force: true });
  if (typeof renderArchive === 'function') renderArchive();
  showToast('🔮 fallback 인사이트 3개 추가됨 — 도서관 → 깨달음에서 확인');
}

