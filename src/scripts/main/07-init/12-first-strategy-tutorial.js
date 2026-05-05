// ═══════════════════════════════════════════════════════════════
// V4 (사용자 명시 2026-05-06 ultrathink — 추가): 첫 '✦ 해볼게' / '🧬 전략으로' 클릭 트리거.
// 옛 Core 2 튜토리얼 흐름 (전략 카드 미리보기 → 미션 등록 → 홈 → 미션 카드 → 첫 소라) 을
// V8 코치마크 UI 로 재현. 시뮬 (testerMode) X — 사용자 실제 액션을 그대로 보존.
// 트리거: state.tutorialShown.core2 !== true 일 때 1회. V8 코치마크 인프라 (_v8ShowCoachmark / _v8Sleep / _v8CleanupAll) 재사용.
// ═══════════════════════════════════════════════════════════════

function shouldRunFirstStrategyTutorial() {
  if (typeof state === 'undefined' || !state) return false;
  state.tutorialShown = state.tutorialShown || {};
  if (state.tutorialShown.core2) return false;
  if (state.preferences && state.preferences.testerMode) return false;
  if (window._v8TutorialRunning) return false;
  if (window._c2TutorialRunning) return false;
  if (window._onbTutorialMode) return false;
  if (typeof _v8ShowCoachmark !== 'function') return false;
  return true;
}

// trigger: 'strategy' (🧬 전략으로 첫 클릭) | 'accept' (✦ 해볼게 첫 클릭, 전략 자동 저장 포함)
async function runFirstStrategyTutorialV8(trigger, msgIdx) {
  if (window._c2TutorialRunning) return;
  window._c2TutorialRunning = true;
  state.tutorialShown = state.tutorialShown || {};
  state.tutorialShown.core2 = true;
  try { saveState(); } catch {}
  try {
    // ── Step 1: 방금 저장된 전략 카드 미리보기 (자동 dismiss) ──
    const lastCard = (Array.isArray(state.topicCards) && state.topicCards.length > 0)
      ? state.topicCards[state.topicCards.length - 1]
      : null;
    const cardOk = lastCard && lastCard.category === 'strategy';
    if (cardOk && typeof _showStrategyCardModal === 'function' && !document.querySelector('.strategy-card-preview-overlay')) {
      _showStrategyCardModal(lastCard);
      await _v8Sleep(2400);
      try { if (typeof _closeStrategyCardModal === 'function') _closeStrategyCardModal(); } catch {}
      await _v8Sleep(280);
    }

    // ── Step 2: trigger='strategy' 한정 — ✦ 해볼게 클릭 안내 (interactive) ──
    if (trigger === 'strategy') {
      const proceeded = await _c2CoachmarkAccept(msgIdx);
      if (!proceeded) return;  // 타겟 사라짐 등 — 그래도 cleanup 보장
      await _v8Sleep(900);  // 미션 생성 + 셀러브 settle
    }

    // ── Step 3: 홈 이동 ──
    await _c2CoachmarkGoHome();
    await _v8Sleep(450);
    try { if (typeof renderTodayMission === 'function') renderTodayMission(); } catch {}
    await _v8Sleep(280);

    // ── Step 4: 미션 카드 안내 ──
    await _c2CoachmarkMissionCard();
    await _v8Sleep(220);

    // ── Step 5: 마무리 ──
    await _c2CoachmarkClosing();
  } catch (e) {
    console.warn('[c2 first tutorial]', e);
  } finally {
    window._c2TutorialRunning = false;
    try { if (typeof _v8CleanupAll === 'function') _v8CleanupAll(); } catch {}
    try { if (typeof _closeStrategyCardModal === 'function') _closeStrategyCardModal(); } catch {}
  }
}

// ─────────────────────────────────────────────────────────────
// 코치마크 — 옛 Core 2 step 의 V8 재해석
// ─────────────────────────────────────────────────────────────

function _c2CoachmarkAccept(msgIdx) {
  // 옛 click_accept step — '✦ 해볼게' 직접 누르도록.
  const target = '.proposal-btn.accept';
  const body = `
    <div class="v8-coach-title">✦ 해볼게</div>
    <div class="v8-coach-text">
      이 전략을 — 오늘의 미션으로 받아볼래?<br>
      <span class="v8-coach-text-soft">한 번 직접 눌러봐 ✦</span>
    </div>
  `;
  return _v8ShowCoachmark({
    targetSelector: target,
    body,
    position: 'top',
    interactive: true,
    waitFor: () => {
      // msgIdx 의 proposalResponse='accept' 또는 strategyId 의 mission 등록 확인.
      try {
        const m = state.chatMessages && state.chatMessages[msgIdx];
        if (m && m.proposalResponse === 'accept') return true;
      } catch {}
      return false;
    }
  });
}

function _c2CoachmarkGoHome() {
  // 옛 go_home_for_mission step — 홈 nav 한 번 눌러서 진입.
  const target = '.nav-item[data-screen="home"]';
  const body = `
    <div class="v8-coach-title">🏠 홈으로</div>
    <div class="v8-coach-text">
      방금 등록된 미션 보러 가자.<br>
      <span class="v8-coach-text-soft">아래 🏠 한 번 눌러볼래?</span>
    </div>
  `;
  return _v8ShowCoachmark({
    targetSelector: target,
    body,
    position: 'top',
    interactive: true,
    waitFor: () => {
      try {
        const homeScreen = document.querySelector('#home.screen.active, #home.screen.show');
        if (homeScreen) return true;
        // active class 못 찾으면 currentScreen 변수 fallback
        if (typeof currentScreen !== 'undefined' && currentScreen === 'home') return true;
      } catch {}
      return false;
    }
  });
}

function _c2CoachmarkMissionCard() {
  // 옛 mission_card_intro step — 미션 카드 가리키며 설명만 (클릭 강요 X).
  // 사용자 명시 2026-05-06: 시뮬 X — 진짜 미션이라 인증 흐름 강요는 부담. 안내만.
  const target = '.mission-card.sora-call, .mission-btn.complete';
  const body = `
    <div class="v8-coach-title">⭐ 소라의 부름</div>
    <div class="v8-coach-text">
      여기가 너의 첫 미션 ✦<br>
      실제로 한 번 해보고 — <b>해냈어</b> 누르면<br>
      <b>🐚 소라</b> 하나가 모래사장에 쌓여.<br>
      <span class="v8-coach-text-soft">지금 안 눌러도 OK. 너의 속도로.</span>
    </div>
  `;
  return _v8ShowCoachmark({
    targetSelector: target,
    body,
    position: 'top'
  });
}

function _c2CoachmarkClosing() {
  // 옛 shell_obtained step — 한 사이클 마무리 멘트.
  const body = `
    <div class="v8-coach-title">전략 DNA 가 자라기 시작했어 🐚</div>
    <div class="v8-coach-text">
      대화 → 전략 → 미션 → 소라.<br>
      이게 한 사이클이야 ✦<br>
      <span class="v8-coach-text-soft">같은 전략 또 통할 때마다 — 또 하나 ✨<br>너의 속도로 천천히. 부담 없이.</span>
    </div>
  `;
  return _v8ShowCoachmark({
    body,
    allowNoTarget: true,
    position: 'bottom'
  });
}
