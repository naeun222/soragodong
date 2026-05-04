// ═══════════════════════════════════════════════════════════════
// 사용자 명시 2026-04-30: 옛 5문항 quiz 흐름 완전 폐기. 새 흐름 = chat_intake_entry 모달 + runIntakeFlow.
// V4 사용자 명시 (V203): chooser 컴포넌트 폐기. 신규 가입자 = 비밀번호 설정 → 시작 튜토리얼 자동 직진.
// 이 진입 함수: 신규 사용자 silent welcome bonus grant + 자동 튜토리얼 진입.
async function maybeShowFirstTimeIntro() {
  if (!authUserId) return;
  if (window._onbTutorialMode) return;
  // testerMode = banner queue 만 (chooser 폐기)
  if (state.preferences && state.preferences.testerMode) {
    if (typeof autoTourOnUpdate === 'function') autoTourOnUpdate();
    return;
  }
  // 다른 모달 떠있으면 skip (E2EE / 튜토리얼)
  if (document.getElementById('e2eeRecoveryOverlay')) return;
  if (document.getElementById('e2eeSetupOverlay')) return;
  if (document.getElementById('onbOverlay') && document.getElementById('onbOverlay').classList.contains('active')) return;
  // V4 (사용자 명시 2026-05-04 ultrathink V193): 옛 즉시 환영 모달 (showWelcomeBonusModal) 폐기 — Core 1 끝 _showWelcomeGiftModal 가 환영 + backend grant 통합.
  // _welcomeBonusShown legacy flag 는 아래 silent backend grant 분기에서 보존 (옛 모달 본 사용자 grant 정합성).
  // V4 (v8 사용자 명시 2026-05-03): silent backend grant — 신규 진입 즉시 backend POST (모달 X). Core 1 안 진행하는 사용자도 grant 보장. idempotent.
  // 신규 사용자 = entries ≤ 3 + _welcomeBonusShown 미설정 + access_token 활성.
  const entriesCountSilent = Array.isArray(state.entries) ? state.entries.length : Object.keys(state.entries || {}).length;
  const isFreshUserSilent = entriesCountSilent <= 3 && !(state.preferences && state.preferences._welcomeBonusShown);
  if (isFreshUserSilent && typeof session !== 'undefined' && session && session.access_token && typeof _authedFetch === 'function') {
    try {
      const resp = await _authedFetch('/api/billing/welcome-bonus', { method: 'POST' });
      if (resp.ok) {
        const data = await resp.json().catch(() => ({}));
        if (data.granted || data.already_granted) {
          state.preferences = state.preferences || {};
          state.preferences._welcomeBonusShown = true;
          try { saveState({ force: true }); } catch {}
          if (typeof refreshBillingStatus === 'function') refreshBillingStatus(false).catch(() => {});
        }
      }
    } catch (e) { console.warn('[silent welcome grant]:', e); }
  }

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

