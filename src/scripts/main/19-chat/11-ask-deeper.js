async function askDeeper(messageIdx) {
  // V4 (v8 묶음 4): 진입 시 eligibility 체크
  const elig = _checkDeeperEligibility();
  if (!elig.ok) {
    _showDeeperCapToast();
    return;
  }
  // V4 (v8 묶음 16): 더 알아보기 첫 사용 placeholder dismiss
  if (typeof dismissPlaceholder === 'function') dismissPlaceholder('deeper');
  // Find the user message before this assistant response
  let userMsgIdx = messageIdx - 1;
  while (userMsgIdx >= 0 && state.chatMessages[userMsgIdx].role !== 'user') {
    userMsgIdx--;
  }
  if (userMsgIdx < 0) {
    showToast('관련 대화를 찾을 수 없어');
    return;
  }
  const userMsg = state.chatMessages[userMsgIdx];
  
  // V4-fix v3 (사용자 요청): 더 알고 싶어 → 4단 + 진단 인용 강제
  // V4 (v8 묶음 3): [상황] prefix 추가 — 결과 체크 모달 📌 원래 문제 박스용. 사용자 화면에선 출력 시 제거됨 (formatAIResponse).
  state.chatMessages.push({
    role: 'user',
    content: '아까 그 얘기, 4단계로 더 깊게 분석해줘. [상황] / [내가 본 것] / [이게 뭐냐면] / [이럴 땐 이렇게] / [오늘의 제안] 형식으로. [상황]은 사용자가 시도하려는 *원래 문제*를 한 줄로 요약 (50자 내, 미션 결과 체크 모달용 — 화면엔 안 보임). 그 외 4단은 네가 관찰한 패턴도 한 줄 자연스럽게 인용해줘.',
    timestamp: new Date().toISOString(),
    isDeeperRequest: true
  });
  saveState();
  renderChat();
  // 사용자 요청 2026-04-30: '더 알아보기' 4단 응답 = 깊은 분석 → opus 4.7. 평소 메인 chat은 sonnet 유지.
  await generateAIResponse('claude-opus-4-7');
  // V4 (v8 묶음 4): 사용 후 increment + cap 도달 시 한 번만 토스트
  if (!window._onbTutorialMode && !(state.preferences && state.preferences.testerMode)) {
    _incrementDailyDeeperCount();
    const after = _checkDeeperEligibility();
    if (!after.ok && after.reason === 'cap' && state._dailyDeeperCount && !state._dailyDeeperCount.capToastShown) {
      state._dailyDeeperCount.capToastShown = true;
      saveState();
      showToast(`🔒 오늘 깊은 분석 ${after.cap}회 다 썼어 — 내일 또`);
    }
  }
}

