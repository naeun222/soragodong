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
  if (window._v8TutorialRunning) return false;
  if (window._c2TutorialRunning) return false;
  if (window._pearlTutorialRunning) return false;
  if (window._onbTutorialMode) return false;
  if (typeof _v8ShowCoachmark !== 'function') return false;
  if (typeof toggleTesterMode !== 'function') return false;
  if (typeof testSeedV4Data !== 'function') return false;
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
    await _pearlCoachmarkTodayYou();
    await _v8Sleep(220);
    await _pearlCoachmarkCategories();
    await _v8Sleep(220);
    await _pearlCoachmarkClosing();
    await _v8Sleep(280);
  } catch (e) {
    console.warn('[pearl tutorial]', e);
  } finally {
    try { if (typeof _v8CleanupAll === 'function') _v8CleanupAll(); } catch {}
    try { if (typeof hideFullscreenLoader === 'function') hideFullscreenLoader(); } catch {}
    // testerMode OFF (자동 toggle 한 경우만) — 내부에서 reload 발생.
    if (_autoTesterToggled && state.preferences && state.preferences.testerMode) {
      try { await toggleTesterMode(); } catch (e) { console.warn('[pearl OFF]', e); }
    }
    window._pearlTutorialRunning = false;
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
      여기는 네가 정말정말 좋아하는 것들을 보관하는 곳이야.<br>
      언제 다시 떠올려도 기분이 좋아질 만한.<br><br>
      <b>진주</b>라고 불러. 한 번 구경해봐.<br>
      <span class="v8-coach-text-soft">체크인에서 같은 곡 5번 = 자동으로 진주가 돼 ✦</span>
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
      매일 진주 하나를 고동이가 꺼내서 보여줄게.<br>
      <span class="v8-coach-text-soft">음악 진주면 — 30초 미리듣기 ✦</span>
    </div>
  `;
  return _v8ShowCoachmark({
    targetSelector: '.library-hero, .hero-music-play',
    body,
    position: 'bottom',
    allowNoTarget: true
  });
}

function _pearlCoachmarkCategories() {
  const body = `
    <div class="v8-coach-title">5 카테고리</div>
    <div class="v8-coach-text">
      🎵 음악 / 🍴 음식 / 📍 장소 / ✨ 순간 / 👥 사람.<br>
      <span class="v8-coach-text-soft">한 줄이면 충분 — 부담 없이 ✦</span>
    </div>
  `;
  return _v8ShowCoachmark({
    targetSelector: '.pi-cat, .pearls-intro-text',
    body,
    position: 'top',
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
  const body = `
    <div class="v8-coach-title">시뮬 끝 — 본 데이터로 돌아갈게 🐚</div>
    <div class="v8-coach-text">
      잠깐 화면 깜빡 — testerMode OFF 라 새로고침.<br>
      <span class="v8-coach-text-soft">너의 진짜 진주는 그대로 ✦</span>
    </div>
  `;
  return _v8ShowCoachmark({
    body,
    allowNoTarget: true,
    position: 'bottom'
  });
}
