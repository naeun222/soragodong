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
  // 사용자 보고 2026-05-10: 대화탭 deeper prompt = 순수 4단 ([상황] 제거 — [상황]은 intake/미션 결과 체크 전용).
  state.chatMessages.push({
    role: 'user',
    content: '아까 그 얘기, 4단계로 더 깊게 분석해줘. [내가 본 것] / [이게 뭐냐면] / [이럴 땐 이렇게] / [오늘의 제안] 형식으로. 네가 관찰한 패턴도 한 줄 자연스럽게 인용해줘.',
    timestamp: new Date().toISOString(),
    isDeeperRequest: true
  });
  saveState();
  renderChat();
  // 사용자 요청 2026-04-30: '더 알아보기' 4단 응답 = 깊은 분석 → opus 4.7. 평소 메인 chat은 sonnet 유지.
  // 사용자 명시 2026-05-10 (재정정): 4단 분석은 plan 무관 누구나 Opus — cap 으로만 횟수 제한. 헤더 토글의 Opus 모드 (Premium 가드) 와 별개.
  // opts.isDeeper = true → callAnthropic body 에 is_deeper_analysis: true → backend Premium 가드 우회.
  let _deeperGenOk = false;
  try {
    await generateAIResponse('claude-opus-4-7', { isDeeper: true });
    // 마지막 assistant 메시지가 error 가 아닐 때만 정상 응답으로 인정.
    const _lastM = state.chatMessages[state.chatMessages.length - 1];
    _deeperGenOk = !!(_lastM && _lastM.role === 'assistant' && !_lastM.error && !_lastM.typing);
  } catch (_) {}
  // 사용자 보고 2026-05-10: 옛 흐름 = generate 실패해도 무조건 increment → cap 1 차감 + 30분 cooldown 발동 → "한 번만 눌러도 잠김" 버그.
  // 정상 응답 받았을 때만 cap 차감.
  if (_deeperGenOk && !window._onbTutorialMode && !(state.preferences && state.preferences.testerMode)) {
    _incrementDailyDeeperCount();
    const after = _checkDeeperEligibility();
    if (!after.ok && after.reason === 'cap' && state._dailyDeeperCount && !state._dailyDeeperCount.capToastShown) {
      state._dailyDeeperCount.capToastShown = true;
      saveState();
      showToast(`🔒 오늘 깊은 분석 ${after.cap}회 다 썼어 — 내일 또`);
    }
  }
}

