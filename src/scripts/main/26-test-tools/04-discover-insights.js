// V4-fix v3 (사용자 요청): AI 인사이트 발견 강제 — 5개 entry 가드 우회 + AI 호출
async function testForceDiscoverInsights() {
  if (!state.preferences || !state.preferences.testerMode) {
    showToast('⚠️ 테스터 모드 ON 후 사용');
    return;
  }
  if (typeof discoverInsights === 'function' && _canAI()) {
    showToast('🔮 AI 인사이트 발견 진행 중...');
    try {
      await discoverInsights();
    } catch (e) {
      showToast('실패 — fallback으로 시드 인사이트 추가');
      _addFallbackInsights();
    }
    return;
  }
  // API 키 없으면 fallback 시드 추가
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

