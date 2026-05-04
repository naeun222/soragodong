// V4 9.5 + 사용자 정합: 진단은 "더 알아보기" 눌렀을 때만 자연 인용.
// generateAIResponse는 마지막 user 메시지가 isDeeperRequest=true일 때만 active 진단 hint inject.
// shown 진단은 active로 복구해 다음 "더 알아보기" 응답에 인용되도록.
function testForceDiagnosisCitation() {
  let active = (state.diagnoses || []).find(d => d.status === 'active');
  if (!active) {
    const shown = (state.diagnoses || []).find(d => d.status === 'shown');
    if (shown) { shown.status = 'active'; active = shown; }
  }
  if (!active) {
    showToast('⚠️ 관찰 X — "관찰 5종 즉시 detect" 먼저 누르거나 시드 쌓기');
    return;
  }
  active.status = 'active';
  saveState({ force: true });
  const labels = { weak_tool: '도구 약함', wrong_layer: '차원 안 맞음', value_clash: '가치 상충', avoidance: '회피 패턴', willpower_cap: '의지 임계치' };
  showToast(`🐚 "${labels[active.type] || active.type}" 관찰 active. 대화 → AI 응답 밑 [더 알고 싶어 ▾] 클릭하면 응답에 한 줄 자연 인용.`);
}

// 숙고 질문 새로 적용하기 (스크랩 진입점 시뮬레이션)
function testForceQuestionScrap() {
  if (!Array.isArray(state.reflectionQuestions)) state.reflectionQuestions = [];
  const newQ = {
    id: 'rq_test_' + Date.now(),
    text: '시드: 내가 진짜로 원하는 삶의 모양은?',
    shortText: '진짜 원하는 삶의 모양',
    createdAt: new Date().toISOString(),
    source: 'scrap',
    sourceMsgIdx: null,
    status: 'pending',
    chatMessages: []
  };
  state.reflectionQuestions.push(newQ);
  saveState({ force: true });
  if (typeof renderReflectionHome === 'function') renderReflectionHome();
  showToast('🌊 새 숙고 질문 적용됨 (대기 중) — 홈 → 더 깊이 볼 거에서 활성화 가능');
}

