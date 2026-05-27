// V4 (사용자 명시 2026-05-17 ultrathink): firstStrategyTutorialV8 재설계 — 3 page 안내만.
//   옛: 5 step interactive (전략 카드 미리보기 → ✦ 해볼게 클릭 → 🏠 홈으로 이동 → 미션 카드 → 마무리).
//   새: 3 page 안내. testerMode X / 시드 X — 사용자 실제 액션 보존. interactive 없음 (OK 클릭만).
// trigger: 사용자가 첫 '✦ 해볼게' 누른 시점. trigger='accept' 케이스만 fire (trigger='strategy' 도 호환).
// 대상: 게스트 OR 미구독 (_isTutorialEligibleUser).

function shouldRunFirstStrategyTutorial() {
  if (typeof state === 'undefined' || !state) return false;
  state.tutorialShown = state.tutorialShown || {};
  if (state.tutorialShown.core2) return false;
  if (state.preferences && state.preferences.testerMode) return false;
  if (window._v8TutorialRunning) return false;
  if (window._c2TutorialRunning) return false;
  if (window._onbTutorialMode) return false;
  if (typeof _v8ShowCoachmark !== 'function') return false;
  if (typeof _isTutorialEligibleUser === 'function' && !_isTutorialEligibleUser()) return false;
  return true;
}

async function runFirstStrategyTutorialV8(trigger, msgIdx) {
  if (window._c2TutorialRunning) return;
  window._c2TutorialRunning = true;
  state.tutorialShown = state.tutorialShown || {};
  state.tutorialShown.core2 = true;
  try { saveState(); } catch {}
  try {
    // Page 1a: 코치마크 title 안내
    await _c2P1Title();
    await _v8Sleep(200);
    // Page 1b: 전략 카드 미리보기 모달 (옛 _showStrategyCardModal — 사용자 '계속' 클릭 후 닫힘)
    const lastCard = (Array.isArray(state.topicCards) && state.topicCards.length > 0)
      ? state.topicCards[state.topicCards.length - 1]
      : null;
    const cardOk = lastCard && lastCard.category === 'strategy';
    if (cardOk && typeof _showStrategyCardModal === 'function' && !document.querySelector('.strategy-card-preview-overlay')) {
      _showStrategyCardModal(lastCard);
      await _v8WaitForOverlayGone('.strategy-card-preview-overlay');
    }
    // Page 2: 홈 자동 이동 + 소라의 부름 안내
    if (typeof showScreen === 'function') showScreen('home');
    await _v8Sleep(350);
    if (typeof renderTodayMission === 'function') renderTodayMission();
    await _v8Sleep(220);
    await _c2P2();
    await _v8Sleep(220);
    // Page 3: 양생방 안내
    await _c2P3();
  } catch (e) {
    console.warn('[c2 first tutorial]', e);
  } finally {
    window._c2TutorialRunning = false;
    try { if (typeof _v8CleanupAll === 'function') _v8CleanupAll(); } catch {}
    try { if (typeof _closeStrategyCardModal === 'function') _closeStrategyCardModal(); } catch {}
  }
}

function _c2P1Title() {
  const body = `
    <div class="v8-coach-title">홈의 '키움'에 전략 카드가 생겼어요.</div>
    <div class="v8-coach-text">
      <span class="v8-coach-text-soft">전략 카드 미리보기를 확인해보세요.</span>
    </div>
  `;
  return _v8ShowCoachmark({
    body,
    allowNoTarget: true,
    position: 'bottom',
    okLabel: '알겠어'
  });
}

function _c2P2() {
  const body = `
    <div class="v8-coach-title">소라의 부름</div>
    <div class="v8-coach-text">
      고동이가 제안한 오늘의 미션을<br>수락하셨군요!<br><br>
      인증샷을 보내면 고동이가 안전하게 확인한 뒤<br><b>'소라' 아이템</b>을 줍니다.
    </div>
  `;
  return _v8ShowCoachmark({
    body,
    allowNoTarget: true,
    position: 'bottom',
    okLabel: '알겠어'
  });
}

function _c2P3() {
  const body = `
    <div class="v8-coach-text">
      자세한 건 <b>'키움'</b>을 들어가서<br>확인해보세요. 👍
    </div>
  `;
  return _v8ShowCoachmark({
    body,
    allowNoTarget: true,
    position: 'bottom',
    okLabel: '오케이'
  });
}

// 사용자 보고 2026-05-06: 다른 모달 닫힐 때까지 폴링. selector 매치하는 첫 element 가 사라지면 resolve.
function _v8WaitForOverlayGone(selector, maxMs = 30000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      try {
        if (!document.querySelector(selector)) { resolve(); return; }
        if (Date.now() - start >= maxMs) { resolve(); return; }
      } catch { resolve(); return; }
      setTimeout(tick, 150);
    };
    tick();
  });
}
