// ═══════════════════════════════════════════════════════════════
// V4 (사용자 명시 2026-05-06 ultrathink — 추가): 첫 진주 진입 트리거.
// 트리거:
//   - 홈/도서관 hero '+ 첫 진주 추가' 버튼 (addPearl 진입)
//   - 도서관 진주 칩 첫 클릭 (switchLibraryCat('pearls'))
// 흐름: testerMode ON → testSeedV4Data 풀 시드 → 도서관 진주 칩 → V8 코치마크 시퀀스 → testerMode OFF (reload)
// 마킹: state.tutorialShown.pearls + sessionStorage 마커 (reload 후 backup 복원돼도 마킹 유지).
// ═══════════════════════════════════════════════════════════════

const PEARL_TUTORIAL_DONE_MARKER = 'soragodong_v4_pearl_tutorial_done';

function shouldRunFirstPearlTutorial() {
  if (typeof state === 'undefined' || !state) return false;
  state.tutorialShown = state.tutorialShown || {};
  if (state.tutorialShown.pearls) return false;
  // 사용자 보고 2026-05-06 ultrathink (재): testerMode ON (개발자 본인) = saveState noop 라 마킹 cloud sync X → 매번 fire 버그. skip.
  if (state.preferences && state.preferences.testerMode) return false;
  // 사용자 명시 2026-05-06 ultrathink (재 X2): "신규 가입자만 처음 눌렀을 때". 신규 detect = 사용자 직접 활동 흔적.
  // V8 / C2 자동 inject 데이터 (chatMessages/topicCards/missions) 는 신규 신호 X. entries / shellCollection / pearls (사용자 직접 추가) 만 신호.
  const hasUserAction =
    (Array.isArray(state.entries) && state.entries.length > 0) ||
    (Array.isArray(state.shellCollection) && state.shellCollection.length > 0) ||
    (Array.isArray(state.pearls) && state.pearls.length > 0);
  if (hasUserAction) {
    state.tutorialShown.pearls = true;
    try { saveState(); } catch {}
    return false;
  }
  if (window._v8TutorialRunning) return false;
  if (window._c2TutorialRunning) return false;
  if (window._pearlTutorialRunning) return false;
  if (window._onbTutorialMode) return false;
  if (typeof _v8ShowCoachmark !== 'function') return false;
  if (typeof toggleTesterMode !== 'function') return false;
  if (typeof testSeedV4Data !== 'function') return false;
  // V4 (사용자 명시 2026-05-17 ultrathink): 게스트 OR 미구독 사용자 한정.
  if (typeof _isTutorialEligibleUser === 'function' && !_isTutorialEligibleUser()) return false;
  return true;
}

async function runFirstPearlTutorialV8() {
  if (window._pearlTutorialRunning) return;
  window._pearlTutorialRunning = true;
  state.tutorialShown = state.tutorialShown || {};
  state.tutorialShown.pearls = true;
  // testerMode OFF reload 후 backup 복원 시 마킹 유지 위한 sessionStorage 마커.
  try { sessionStorage.setItem(PEARL_TUTORIAL_DONE_MARKER, '1'); } catch {}
  try { saveState(); } catch {}

  let _autoTesterToggled = false;
  try {
    // 1. testerMode ON (자동) — backup 발생.
    if (!state.preferences || !state.preferences.testerMode) {
      await toggleTesterMode();
      _autoTesterToggled = true;
      window._onbAutoTesterMode = true;
    }
    // 2. 시드 적용 — testSeedV4Data 는 비동기 iTunes 검색 등 포함 (~5-10초).
    if (typeof showFullscreenLoader === 'function') showFullscreenLoader('진주 시뮬 준비 중... 💎');
    try {
      await testSeedV4Data();
    } finally {
      if (typeof hideFullscreenLoader === 'function') hideFullscreenLoader();
    }
    if (typeof showToast === 'function') showToast('🎭 시뮬 모드 — 본 데이터 안전');

    // 3. 도서관 진입 + 진주 칩.
    if (typeof showScreen === 'function') showScreen('archive');
    await _v8Sleep(350);
    if (typeof switchLibraryCat === 'function') {
      // _internalCallSkipTutorial 플래그 — 인터셉트가 우리 자신 호출에서 또 fire 하지 않도록.
      window._pearlTutorialInternalNav = true;
      try { switchLibraryCat('pearls'); } finally { window._pearlTutorialInternalNav = false; }
    }
    await _v8Sleep(500);

    // 4. 코치마크 시퀀스 (V8 UI — mask 항상 off).
    // 사용자 명시 2026-05-06 ultrathink: '+ 진주 추가' step 폐기 — 인트로 / 오늘의너 / 카테고리 / 마무리 4 step.
    await _pearlCoachmarkIntro();
    await _v8Sleep(220);
    // V4 fix (사용자 명시 2026-05-17 재): 인사 문구 (_pearlCoachmarkIntro) 직후 hero 큐레이션 동적 inject — _pearlCoachmarkTodayYou target 보장.
    //   일반 view 영구 노출 X, 튜토리얼 한정. finally cleanup 에서 hero 비움.
    if (typeof renderLibraryHero === 'function') { try { renderLibraryHero(); } catch (e) { console.warn('[hero inject]', e); } }
    await _v8Sleep(120);
    await _pearlCoachmarkTodayYou();
    await _v8Sleep(220);
    await _pearlCoachmarkClosing();
    await _v8Sleep(280);
  } catch (e) {
    console.warn('[pearl tutorial]', e);
  } finally {
    try { if (typeof _v8CleanupAll === 'function') _v8CleanupAll(); } catch {}
    try { if (typeof hideFullscreenLoader === 'function') hideFullscreenLoader(); } catch {}
    // V4 fix (사용자 명시 2026-05-17 재): 튜토리얼 종료 시 hero 큐레이션 cleanup — 일반 view 노출 X.
    try {
      const _heroEl = document.getElementById('libraryHero');
      if (_heroEl) _heroEl.innerHTML = '';
    } catch {}
    // testerMode OFF (자동 toggle 한 경우만) — 내부에서 reload 발생.
    if (_autoTesterToggled && state.preferences && state.preferences.testerMode) {
      try { await toggleTesterMode(); } catch (e) { console.warn('[pearl OFF]', e); }
    }
    window._pearlTutorialRunning = false;
    // V4 (사용자 명시 2026-05-17 재): 튜토 종료 후 미션 가드 해제 → renderTodayMission 재호출 (testerMode 이미 OFF 였던 케이스 = reload X — 명시 rerender 필요).
    if (typeof renderTodayMission === 'function') { try { renderTodayMission(); } catch {} }
  }
}

// ─────────────────────────────────────────────────────────────
// 코치마크 시퀀스 — 옛 진주 step (click_pearls_chip / pearls_intro / today_you_play) 의 V8 재해석.
// ─────────────────────────────────────────────────────────────

function _pearlCoachmarkIntro() {
  // 사용자 명시 2026-05-06 ultrathink: 옛 'pearls_intro' 카피 ('정말정말') 그대로 가져옴.
  const body = `
    <div class="v8-coach-title">🔮 살아있다 느낀 순간들</div>
    <div class="v8-coach-text">
      여기는 정말정말 좋아하는 기억들을 보관하는 곳이에요.<br>
      언제 다시 떠올려도 기분이 좋아질 만한.<br><br>
      <b>진주</b>라고 불러요!
    </div>
  `;
  return _v8ShowCoachmark({
    targetSelector: '.lib-cat-chip[data-cat="pearls"]',
    body,
    position: 'bottom',
    allowNoTarget: true
  });
}

function _pearlCoachmarkTodayYou() {
  const body = `
    <div class="v8-coach-title">🌟 오늘의 너</div>
    <div class="v8-coach-text">
      매일 진주 하나를 '오늘의 너'에서 꺼내서 보여줘요.
    </div>
  `;
  return _v8ShowCoachmark({
    targetSelector: '.library-hero, .hero-music-play',
    body,
    position: 'bottom',
    allowNoTarget: true
  });
}

function _pearlCoachmarkAddBtn() {
  const body = `
    <div class="v8-coach-title">+ 진주 추가</div>
    <div class="v8-coach-text">
      한 줄 + 사진 (선택) + 메모 (선택).<br>
      <span class="v8-coach-text-soft">부담 없이. 좋았던 거 — 그 한 순간만.</span>
    </div>
  `;
  return _v8ShowCoachmark({
    targetSelector: '.pearls-add-btn, .hero-empty-cta',
    body,
    position: 'top',
    allowNoTarget: true
  });
}

function _pearlCoachmarkClosing() {
  // V4 (사용자 명시 2026-05-17 ultrathink): 카피 + okLabel 변경.
  const body = `
    <div class="v8-coach-text">
      소중한 기억들을 한 번 넣어보아요. 👍
    </div>
  `;
  return _v8ShowCoachmark({
    body,
    allowNoTarget: true,
    position: 'bottom',
    okLabel: '그래 알았다'
  });
}
