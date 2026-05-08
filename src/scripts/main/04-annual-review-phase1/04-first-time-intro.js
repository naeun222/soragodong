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
  // 사용자 명시 2026-05-05: 100만 토큰 silent welcome grant 폐기 → 처음 한 달 무료 (얼리 플랜) 자동 활성화.
  // backend ensureBillingRow 가 첫 /api/chat 또는 /api/usage 호출 시 자동 활성화. 클라이언트 silent grant 호출 불필요.
  const entriesCountSilent = Array.isArray(state.entries) ? state.entries.length : Object.keys(state.entries || {}).length;

  // V4 사용자 명시 (V203): chooser 폐기. 신규 가입자 = 비밀번호 설정 후 시작 튜토리얼 자동 직진.
  // 한 번만 (preferences._coreTutorialAutoStarted) — reload 시 재트리거 X.
  const isFreshUser = entriesCountSilent <= 3 && !(state.preferences && state.preferences._coreTutorialAutoStarted);
  if (isFreshUser && typeof startCoreTutorial === 'function') {
    state.preferences = state.preferences || {};
    state.preferences._coreTutorialAutoStarted = true;
    state.preferences.dismissedMajor = (typeof _currentMajor === 'function') ? _currentMajor() : (typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'V4');
    try { saveState({ force: true }); } catch {}
    if (typeof saveToCloudNow === 'function') { saveToCloudNow().catch(() => {}); }
    setTimeout(() => { try { startCoreTutorial('core1'); } catch (e) { console.warn('[auto core tutorial]:', e); } }, 600);
    return;
  }

  // 기존 사용자 = 배너 큐만 (legacy / sync tip / feedback). chooser 모달 X.
  if (typeof autoTourOnUpdate === 'function') autoTourOnUpdate();
}

