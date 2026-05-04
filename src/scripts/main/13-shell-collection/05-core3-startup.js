// V4 (v8 묶음 10): startCore3A — worked 첫 경험 → 모래사장 자동 진입 + DNA 소라 안내 4 step
function startCore3A(mission) {
  if (state.tutorialShown && state.tutorialShown.core3a) return;
  if (!mission) return;
  const idx = (typeof ONBOARDING_STEPS !== 'undefined') ? ONBOARDING_STEPS.findIndex(s => s && s.id === 'success_celebrate') : -1;
  if (idx < 0) { console.warn('[startCore3A] success_celebrate step missing'); return; }
  // mission/card 정보 stash — onShow hook 에서 사용
  window._core3aMission = mission;
  if (mission.strategyId) {
    const card = (state.topicCards || []).find(c => c.id === mission.strategyId);
    if (card) window._core3aStrategyName = card.title;
  }
  _onbStep = idx;
  _onbTutorialMode = true;
  window._onbTutorialMode = true;
  if (typeof _activeCoreId !== 'undefined') _activeCoreId = 'core3a';
  if (typeof onbRenderStep === 'function') onbRenderStep();
}

function _finishCore3A() {
  state.tutorialShown = state.tutorialShown || {};
  state.tutorialShown.core3a = true;
  saveState();
  _onbTutorialMode = false;
  window._onbTutorialMode = false;
  if (typeof _activeCoreId !== 'undefined') _activeCoreId = null;
  delete window._core3aMission;
  delete window._core3aStrategyName;
  if (typeof onbClose === 'function') onbClose();
}

// V4 (v8 묶음 10): startCore3B — 진화 yes 분기 첫 경험 → mutation_intro step → onAdvance 가 openMutationChat 자동 진입
function startCore3B(strategyId, missionTitle) {
  if (state.tutorialShown && state.tutorialShown.core3b) {
    if (typeof openMutationChat === 'function') openMutationChat(strategyId, missionTitle);
    return;
  }
  const idx = (typeof ONBOARDING_STEPS !== 'undefined') ? ONBOARDING_STEPS.findIndex(s => s && s.id === 'mutation_intro') : -1;
  if (idx < 0) {
    console.warn('[startCore3B] mutation_intro step missing — fallback to direct openMutationChat');
    if (typeof openMutationChat === 'function') openMutationChat(strategyId, missionTitle);
    return;
  }
  window._core3bStrategyId = strategyId;
  window._core3bMissionTitle = missionTitle;
  _onbStep = idx;
  _onbTutorialMode = true;
  window._onbTutorialMode = true;
  if (typeof _activeCoreId !== 'undefined') _activeCoreId = 'core3b';
  if (typeof onbRenderStep === 'function') onbRenderStep();
}

function _afterMutationIntro() {
  // mutation_intro step 의 [좋아 ✦] 클릭 후 — openMutationChat 자동 진입
  state.tutorialShown = state.tutorialShown || {};
  state.tutorialShown.core3b = true;
  saveState();
  _onbTutorialMode = false;
  window._onbTutorialMode = false;
  if (typeof _activeCoreId !== 'undefined') _activeCoreId = null;
  const sid = window._core3bStrategyId;
  const mt = window._core3bMissionTitle;
  delete window._core3bStrategyId;
  delete window._core3bMissionTitle;
  if (typeof onbClose === 'function') onbClose();
  setTimeout(() => {
    if (typeof openMutationChat === 'function' && sid) openMutationChat(sid, mt);
  }, 300);
}

