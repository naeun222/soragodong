// ═══════════════════════════════════════════════════════════════
// 사용자 명시 2026-04-30: 옛 5문항 quiz 흐름 완전 폐기. 새 흐름 = chat_intake_entry 모달 + runIntakeFlow.
// V4 사용자 명시 (V203): chooser 컴포넌트 폐기. 신규 가입자 = 비밀번호 설정 → 시작 튜토리얼 자동 직진.
// 이 진입 함수: 신규 사용자 silent welcome bonus grant + 자동 튜토리얼 진입.
async function maybeShowFirstTimeIntro() {
  if (!authUserId) return;
  if (window._onbTutorialMode) return;
  // V4 (사용자 명시 2026-05-06 ultrathink): V8 시작 튜토리얼이 진행 중이거나 이미 봤으면 옛 코어 자동 진입 X.
  if (window._v8TutorialRunning) return;
  if (state && state.tutorialVersion === 'v8-start') return;
  // testerMode = banner queue 만 (chooser 폐기)
  if (state.preferences && state.preferences.testerMode) {
    if (typeof autoTourOnUpdate === 'function') autoTourOnUpdate();
    return;
  }
  // 다른 모달 떠있으면 skip (E2EE / 튜토리얼)
  if (document.getElementById('e2eeRecoveryOverlay')) return;
  if (document.getElementById('e2eeSetupOverlay')) return;
  if (document.getElementById('onbOverlay') && document.getElementById('onbOverlay').classList.contains('active')) return;
  // V4 (사용자 명시 2026-05-16 ultrathink): 옛 isFreshUser → startCoreTutorial('core1') 자동 진입 폐기.
  //   V9 시작 튜토 (runStartTutorialV8 → _v9ShowWarmStartModal) 가 신규 가입자 진입 책임.
  //   여기서는 배너 큐 (sync tip / feedback) 만 trigger — 기존 사용자에게도 동일.
  if (typeof autoTourOnUpdate === 'function') autoTourOnUpdate();
}

