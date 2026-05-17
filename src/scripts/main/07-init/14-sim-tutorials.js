// ═══════════════════════════════════════════════════════════════
// V4 (사용자 명시 2026-05-06 ultrathink — 추가): 시드 시뮬 튜토리얼 5종.
//   - 도서관 첫 진입 → 일기·대화 칩 튜토 (state.tutorialShown.diaryLib)
//   - 깨달음 칩 첫 클릭 → 깨달음 튜토 (state.tutorialShown.insights)
//   - 마법고동 첫 진입 → 마법 튜토 (state.tutorialShown.magic)
//   - 리뷰 모음 첫 진입 → 리뷰 튜토 (state.tutorialShown.reviews)
//   - 숙고 질문 첫 진입 → 숙고 튜토 (state.tutorialShown.reflection)
// 패턴: testerMode ON (자동 backup) → testSeedV4Data 풀 시드 → 화면 진입 → V8 코치마크 → testerMode OFF (reload).
// 마킹: state.tutorialShown[key] + sessionStorage 마커 (reload 후 backup 복원돼도 유지).
// 옛 카피 (library_categories / insights_intro / magic_room_intro / reflection_when 등) 그대로 가져옴 — 사용자 명시.
// ═══════════════════════════════════════════════════════════════

const SIM_TUTORIAL_MARKERS = {
  diaryLib: 'soragodong_v4_tut_diary_done',
  insights: 'soragodong_v4_tut_insights_done',
  magic: 'soragodong_v4_tut_magic_done',
  reviews: 'soragodong_v4_tut_reviews_done',
  reflection: 'soragodong_v4_tut_reflection_done',
  core3: 'soragodong_v4_tut_core3_done'
};

function _shouldRunSimTutorial(key, opts = {}) {
  if (typeof state === 'undefined' || !state) return false;
  state.tutorialShown = state.tutorialShown || {};
  // 사용자 명시 2026-05-06 ultrathink: force=true (설정 picker 진입) 면 모든 가드 우회.
  if (opts.force) {
    if (window._simTutorialRunning) return false;
    if (typeof _v8ShowCoachmark !== 'function') return false;
    if (typeof toggleTesterMode !== 'function') return false;
    if (typeof testSeedV4Data !== 'function') return false;
    return true;
  }
  if (state.tutorialShown[key]) return false;
  // 사용자 보고 2026-05-06 ultrathink (재): testerMode ON 사용자 (개발자 본인) = 이미 다 봄 + saveState noop 라 마킹 cloud sync X → 매번 fire 버그. skip.
  if (state.preferences && state.preferences.testerMode) return false;
  // 사용자 명시 2026-05-06 ultrathink (재 X2): "신규 가입자만 처음 눌렀을 때". 신규 detect = 사용자 직접 활동 흔적.
  // V8 시작 튜토 / C2 첫 클릭 튜토가 자동 inject 한 chatMessages/topicCards/intakeWorry/missions 는 신규 신호 X.
  // 진짜 신규 X 신호 = entries (체크인 1개+) 또는 shellCollection (미션 해낸 소라 1개+).
  const hasUserAction =
    (Array.isArray(state.entries) && state.entries.length > 0) ||
    (Array.isArray(state.shellCollection) && state.shellCollection.length > 0);
  if (hasUserAction) {
    state.tutorialShown[key] = true;
    try { saveState(); } catch {}
    return false;
  }
  if (window._v8TutorialRunning) return false;
  if (window._c2TutorialRunning) return false;
  if (window._pearlTutorialRunning) return false;
  if (window._simTutorialRunning) return false;
  if (window._onbTutorialMode) return false;
  if (typeof _v8ShowCoachmark !== 'function') return false;
  if (typeof toggleTesterMode !== 'function') return false;
  if (typeof testSeedV4Data !== 'function') return false;
  return true;
}

// 사용자 명시 2026-05-06 ultrathink (모달 충돌 가드): sim 튜토 진입 / 코치마크 사이에서 떠있을 수 있는 모달 정리.
function _simDismissBlockingOverlays() {
  const sels = [
    '.input-modal-overlay',
    '.options-modal-overlay',
    '.confirm-modal-overlay',
    '.strategy-card-preview-overlay',
    '.fullscreen-loader.show'
  ];
  sels.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      try { el.remove(); } catch {}
    });
  });
}

// 공통 sim 진입 helper — testerMode ON + 시드 + screen 진입 + 코치마크 시퀀스 + testerMode OFF (reload).
async function _runSimTutorial({ tutorialKey, screenAfterSeed, navAction, coachmarks, sessionMarker }) {
  if (window._simTutorialRunning) return;
  window._simTutorialRunning = true;
  state.tutorialShown = state.tutorialShown || {};
  state.tutorialShown[tutorialKey] = true;
  if (sessionMarker) {
    try { sessionStorage.setItem(sessionMarker, '1'); } catch {}
  }
  try { saveState(); } catch {}

  let _autoTesterToggled = false;
  try {
    if (!state.preferences || !state.preferences.testerMode) {
      await toggleTesterMode();
      _autoTesterToggled = true;
      window._onbAutoTesterMode = true;
    }
    if (typeof showFullscreenLoader === 'function') showFullscreenLoader('시뮬 준비 중... 🐚');
    try {
      await testSeedV4Data();
    } finally {
      if (typeof hideFullscreenLoader === 'function') hideFullscreenLoader();
    }
    if (typeof showToast === 'function') showToast('🎭 시뮬 모드 — 본 데이터 안전');

    if (screenAfterSeed && typeof showScreen === 'function') showScreen(screenAfterSeed);
    await _v8Sleep(350);
    if (typeof navAction === 'function') {
      window._simTutorialInternalNav = true;
      try { await navAction(); } catch {} finally { window._simTutorialInternalNav = false; }
    }
    await _v8Sleep(450);
    _simDismissBlockingOverlays();  // 코치마크 시작 직전 모달 정리

    for (const cm of (coachmarks || [])) {
      _simDismissBlockingOverlays();  // 각 step 직전에도 — reflection 화면 진입 모달 등 충돌 방지
      try { await cm(); } catch (e) { console.warn('[sim cm]', e); }
      await _v8Sleep(220);
    }
  } catch (e) {
    console.warn('[sim tutorial]', e);
  } finally {
    try { if (typeof _v8CleanupAll === 'function') _v8CleanupAll(); } catch {}
    try { if (typeof hideFullscreenLoader === 'function') hideFullscreenLoader(); } catch {}
    if (_autoTesterToggled && state.preferences && state.preferences.testerMode) {
      try { await toggleTesterMode(); } catch (e) { console.warn('[sim OFF]', e); }
    }
    window._simTutorialRunning = false;
  }
}

// init 에서 호출 — testerMode OFF reload 후 모든 sim 마커를 state.tutorialShown 로 복원.
function _restoreSimTutorialMarkersFromSession() {
  if (typeof state === 'undefined' || !state) return;
  state.tutorialShown = state.tutorialShown || {};
  let touched = false;
  Object.entries(SIM_TUTORIAL_MARKERS).forEach(([k, marker]) => {
    try {
      if (sessionStorage.getItem(marker)) {
        state.tutorialShown[k] = true;
        sessionStorage.removeItem(marker);
        touched = true;
      }
    } catch {}
  });
  if (touched) {
    try { saveState(); } catch {}
  }
}

// 마무리 멘트 — 모든 sim 튜토 공통.
function _simCoachmarkClosing() {
  const body = `
    <div class="v8-coach-title">튜토리얼이 끝났습니다!</div>
  `;
  return _v8ShowCoachmark({ body, allowNoTarget: true, position: 'bottom' });
}

// ═══════════════════════════════════════════════════════════════
// 1) 도서관 첫 진입 → 일기·대화 칩 튜토
// ═══════════════════════════════════════════════════════════════

// V4 (사용자 명시 2026-05-17 ultrathink): runDiaryLibTutorialV8 폐기 — 항상 false.
function shouldRunDiaryLibTutorial() { return false; }

async function runDiaryLibTutorialV8() {
  await _runSimTutorial({
    tutorialKey: 'diaryLib',
    sessionMarker: SIM_TUTORIAL_MARKERS.diaryLib,
    screenAfterSeed: 'archive',
    navAction: () => { if (typeof switchLibraryCat === 'function') switchLibraryCat('diary'); },
    coachmarks: [
      _diaryCoachmarkLibIntro,
      _diaryCoachmarkCalendar415,
      _diaryCoachmark415Read,
      _diaryCoachmarkChapterAuto,
      _simCoachmarkClosing
    ]
  });
}

function _diaryCoachmarkLibIntro() {
  const body = `
    <div class="v8-coach-text">
      안녕하세요! 이곳은 홈입니다.
    </div>
  `;
  return _v8ShowCoachmark({ body, allowNoTarget: true, position: 'bottom' });
}

// 사용자 명시 2026-05-06 ultrathink: 4/15 자동 슬라이드 + 강조 + interactive (직접 클릭으로 day modal 진입).
function _diaryCoachmarkCalendar415() {
  // 4/15 가 옛 달 → _calMonthOffset 계산해서 자동 슬라이드.
  try {
    const target = new Date('2026-04-15T12:00:00');
    const today = new Date();
    const offset = (target.getFullYear() - today.getFullYear()) * 12 + (target.getMonth() - today.getMonth());
    if (typeof _calMonthOffset !== 'undefined' && _calMonthOffset !== offset) {
      // _calMonthOffset 는 module-let — 같은 concat-build 안 그래도 global 접근 OK.
      // eslint-disable-next-line no-undef
      _calMonthOffset = offset;
      if (typeof renderLensCalendarGrid === 'function') renderLensCalendarGrid();
    }
  } catch (e) { console.warn('[diary 4/15 nav]', e); }

  const body = `
    <div class="v8-coach-title">📔 캘린더 무드 그리드</div>
    <div class="v8-coach-text">
      한 달 한눈에 — 칸 색 = 그날 기분.<br>
      <b>4월 15일</b> 칸 한 번 눌러보세요 ✦
    </div>
  `;
  return _v8ShowCoachmark({
    targetSelector: '.cal-day[data-date="2026-04-15"]',
    body,
    position: 'top',
    interactive: true,
    waitFor: () => {
      // day modal 떠있으면 advance.
      return !!document.querySelector('.day-modal.active, #dayModal.active, .day-modal:not([hidden])');
    },
    allowNoTarget: true
  });
}

// 사용자 명시 2026-05-06: 4/15 일기 본문 한 번 읽어보기 안내 — day modal 안 일기 박스 가리킴.
function _diaryCoachman415Read_NOOP() { /* placeholder reserved */ }
function _diaryCoachmark415Read() {
  const body = `
    <div class="v8-coach-title">📔 그날의 기록</div>
    <div class="v8-coach-text">
      이렇게 일기를 쓸 수 있어요.<br>
      <span class="v8-coach-text-soft">체크인 + 대화탭에서 일기: 쓰면 원본으로 저장되고, 없으면 고동이가 정리해줍니다.</span>
    </div>
  `;
  return _v8ShowCoachmark({
    targetSelector: '.day-modal-header, .day-modal-date',
    body,
    position: 'bottom',
    allowNoTarget: true
  });
}

function _diaryCoachmarkChapterAuto() {
  const body = `
    <div class="v8-coach-title">✦ 토픽 자동 분류</div>
    <div class="v8-coach-text">
      ✓ 마무리 누르거나 마지막 대화 후 5시간이 지나면,<br>
      대화 내용을 정리해서 '토픽'으로 정리됩니다. ✦
    </div>
  `;
  return _v8ShowCoachmark({ body, allowNoTarget: true, position: 'top' });
}

// ═══════════════════════════════════════════════════════════════
// 2) 깨달음 칩 첫 클릭 → 깨달음 튜토
// ═══════════════════════════════════════════════════════════════

function shouldRunInsightsTutorial() {
  if (typeof _isTutorialEligibleUser === 'function' && !_isTutorialEligibleUser()) return false;
  return _shouldRunSimTutorial('insights');
}

async function runInsightsTutorialV8() {
  await _runSimTutorial({
    tutorialKey: 'insights',
    sessionMarker: SIM_TUTORIAL_MARKERS.insights,
    screenAfterSeed: 'archive',
    navAction: () => { if (typeof switchLibraryCat === 'function') switchLibraryCat('insights'); },
    coachmarks: [
      _insightsCoachmarkIntro,
      _insightsCoachmarkAiExample,
      _simCoachmarkClosing
    ]
  });
}

function _insightsCoachmarkIntro() {
  // 옛 insights_intro 카피 (02-tutorial-welcome.js:1024) 그대로.
  const body = `
    <div class="v8-coach-title">✨ 당신 안에서 떠오른 통찰</div>
    <div class="v8-coach-text">
      대화에서 스크랩한 내용들이 이곳에 모입니다.<br><br>
      <b>🔮 AI 인사이트 발견</b>: 체크인이 7일 이상 쌓이면 인사이트가 발견됩니다.
    </div>
  `;
  return _v8ShowCoachmark({ body, allowNoTarget: true, position: 'bottom' });
}

function _insightsCoachmarkAiExample() {
  // 옛 insights_ai_example — 인사이트 카드 가리킴. 시드 안 ins_seed_5 = '엄마 통화 후 이튿날 mood 평균 +0.8'.
  // 사용자 명시 2026-05-06 ultrathink: 카드 자동 scrollIntoView + 임시 highlight glow (.sim-tutorial-highlight).
  // 사용자 보고 2026-05-06: querySelector 콤마 fallback 이 document order 첫 매치 (ins_seed_1) 를 잡던 버그 — fallback 제거.
  // ins_seed_5 가 DOM 에 없으면 'allowNoTarget: true' 로 가운데 띄움.
  const card = document.querySelector('.insight-card[data-id="ins_seed_5"]');
  if (card) {
    try { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
    card.classList.add('sim-tutorial-highlight');
    setTimeout(() => { try { card.classList.remove('sim-tutorial-highlight'); } catch {} }, 8000);
  }
  const body = `
    <div class="v8-coach-title">🔮 AI 인사이트 예시</div>
    <div class="v8-coach-text">
      이런 걸 고동이가 발견합니다.<br>
      <b>"엄마 통화 후 이튿날 mood 평균 +0.8"</b>
    </div>
  `;
  return _v8ShowCoachmark({
    targetSelector: '.insight-card[data-id="ins_seed_5"]',
    body,
    position: 'top',
    allowNoTarget: true
  });
}

// ═══════════════════════════════════════════════════════════════
// 3) 마법고동 첫 진입 → 마법 튜토
// ═══════════════════════════════════════════════════════════════

function shouldRunMagicTutorial() { return _shouldRunSimTutorial('magic'); }

async function runMagicTutorialV8() {
  await _runSimTutorial({
    tutorialKey: 'magic',
    sessionMarker: SIM_TUTORIAL_MARKERS.magic,
    screenAfterSeed: 'decisions',
    navAction: () => { if (typeof renderDecisionsList === 'function') renderDecisionsList(); },
    coachmarks: [
      _magicCoachmarkIntro,
      _magicCoachmarkSteps,
      _simCoachmarkClosing
    ]
  });
}

function _magicCoachmarkIntro() {
  // 옛 magic_room_intro 카피 (02-tutorial-welcome.js:1060) 그대로.
  const body = `
    <div class="v8-coach-title">🐚 마법고동</div>
    <div class="v8-coach-text">
      큰 결정 (도전 / 사랑 / 진로) 을 후회하지 않고 할 수 있게 도와주는 방이야.<br>
      <span class="v8-coach-text-soft">14일 숙성 — 머리 식히고 진짜 마음 읽기 ✦</span>
    </div>
  `;
  return _v8ShowCoachmark({
    targetSelector: 'button[onclick="startNewDecision()"], .new-decision-btn',
    body,
    position: 'top',
    allowNoTarget: true
  });
}

function _magicCoachmarkSteps() {
  const body = `
    <div class="v8-coach-title">단계별로 깊게</div>
    <div class="v8-coach-text">
      상황 정리 → 두려움 → 가치 → 14일 숙성 → 결론.<br>
      <span class="v8-coach-text-soft">중간 멈춰도 OK. 너의 페이스로.</span>
    </div>
  `;
  return _v8ShowCoachmark({ body, allowNoTarget: true, position: 'bottom' });
}

// ═══════════════════════════════════════════════════════════════
// 4) 리뷰 모음 첫 진입 → 리뷰 튜토
// ═══════════════════════════════════════════════════════════════

// V4 (사용자 명시 2026-05-17 ultrathink): runReviewsTutorialV8 폐기 — 항상 false.
function shouldRunReviewsTutorial() { return false; }

async function runReviewsTutorialV8() {
  await _runSimTutorial({
    tutorialKey: 'reviews',
    sessionMarker: SIM_TUTORIAL_MARKERS.reviews,
    screenAfterSeed: 'archive',
    navAction: () => {
      if (typeof switchLibraryCat === 'function') switchLibraryCat('galpi');
      setTimeout(() => { if (typeof showArchiveReviews === 'function') showArchiveReviews(); }, 250);
    },
    coachmarks: [
      _reviewsCoachmarkIntro,
      _reviewsCoachmarkAnnual,
      _simCoachmarkClosing
    ]
  });
}

function _reviewsCoachmarkIntro() {
  const body = `
    <div class="v8-coach-title">📅 리뷰 모음</div>
    <div class="v8-coach-text">
      주간 / 월간 / 분기 / 연간 리뷰 — 한 눈에.<br>
      <span class="v8-coach-text-soft">고동이가 너의 패턴 / 변화 / 성장 정리해줘 ✦</span>
    </div>
  `;
  return _v8ShowCoachmark({ body, allowNoTarget: true, position: 'bottom' });
}

// 사용자 명시 2026-05-06 ultrathink: 연간 리뷰 카드 한 번 직접 눌러보기 — interactive.
function _reviewsCoachmarkAnnual() {
  const card = document.querySelector('.annual-stories-card, .review-card.annual');
  if (card) {
    try { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
    card.classList.add('sim-tutorial-highlight');
    setTimeout(() => { try { card.classList.remove('sim-tutorial-highlight'); } catch {} }, 8000);
  }
  const body = `
    <div class="v8-coach-title">🌟 연간 리뷰</div>
    <div class="v8-coach-text">
      한 해의 너 — 한 번 들어가봐 ✦<br>
      <span class="v8-coach-text-soft">Stories 형식으로 한 컷 한 컷 같이 봐.</span>
    </div>
  `;
  return _v8ShowCoachmark({
    targetSelector: '.annual-stories-card, .review-card.annual',
    body,
    position: 'top',
    interactive: true,
    waitFor: () => {
      // annual review modal 또는 별도 화면 진입 detect.
      return !!document.querySelector('.annual-review-modal, .annual-stories-modal, #screen-annual-review.active, .ann-rv-overlay, .ann-rv-modal');
    },
    allowNoTarget: true
  });
}

// ═══════════════════════════════════════════════════════════════
// 4-real) 리뷰 모음 *첫 자연 진입* — 사용자 명시 2026-05-06: 실 데이터로 weekly 리뷰 한 번 생성 (비용 회사 부담).
//   데이터 부족 (entriesInRange 0) / AI 호출 불가 → sim fallback.
//   설정 picker → 'reviews' 는 그대로 sim (runReviewsTutorialV8). 자연 첫 진입만 real.
// ═══════════════════════════════════════════════════════════════
async function runFirstReviewsTutorialReal() {
  if (window._firstReviewsRealRunning) return;
  if (typeof _canAI !== 'function' || !_canAI() || typeof openReview !== 'function' || typeof _collectReviewData !== 'function') {
    return runReviewsTutorialV8();
  }
  let data;
  try { data = _collectReviewData('weekly'); } catch (e) { data = null; }
  if (!data || !Array.isArray(data.entriesInRange) || data.entriesInRange.length === 0) {
    return runReviewsTutorialV8();
  }

  window._firstReviewsRealRunning = true;
  state.tutorialShown = state.tutorialShown || {};
  state.tutorialShown.reviews = true;
  try { saveState(); } catch {}

  try {
    if (typeof showScreen === 'function') showScreen('archive-reviews');
    await _v8Sleep(280);
    await _firstReviewsRealCoachmarkIntro();
    await _v8Sleep(220);
    // openReview = screen 전환 + AI 분석 + render 까지 자체 처리.
    await openReview('weekly');
    await _v8Sleep(450);
    await _firstReviewsRealCoachmarkClosing();
  } catch (e) {
    console.warn('[firstReviewsReal]', e);
  } finally {
    window._firstReviewsRealRunning = false;
    try { if (typeof _v8CleanupAll === 'function') _v8CleanupAll(); } catch {}
  }
}

function _firstReviewsRealCoachmarkIntro() {
  const body = `
    <div class="v8-coach-title">📅 너의 첫 리뷰 — 직접 만들어볼게</div>
    <div class="v8-coach-text">
      지금까지 쌓인 너의 데이터로 한 번 정리해보자 🐚<br>
      <span class="v8-coach-text-soft">고동이가 너의 패턴 / 변화 / 성장 찾아줘 ✦</span>
    </div>
  `;
  return _v8ShowCoachmark({ body, allowNoTarget: true, position: 'bottom' });
}

function _firstReviewsRealCoachmarkClosing() {
  const body = `
    <div class="v8-coach-title">✦ 천천히 한 번 봐</div>
    <div class="v8-coach-text">
      앞으로 매주 / 매달 / 분기 / 연 마다 자동으로 만들어져.<br>
      <span class="v8-coach-text-soft">[홈 → 리뷰 모음] 에서 모아 봐.</span>
    </div>
  `;
  return _v8ShowCoachmark({ body, allowNoTarget: true, position: 'bottom' });
}

// ═══════════════════════════════════════════════════════════════
// 5) 숙고 질문 첫 진입 → 숙고 튜토
// ═══════════════════════════════════════════════════════════════

function shouldRunReflectionTutorial() {
  if (typeof _isTutorialEligibleUser === 'function' && !_isTutorialEligibleUser()) return false;
  return _shouldRunSimTutorial('reflection');
}

async function runReflectionTutorialV8() {
  await _runSimTutorial({
    tutorialKey: 'reflection',
    sessionMarker: SIM_TUTORIAL_MARKERS.reflection,
    screenAfterSeed: 'home',
    navAction: () => { if (typeof renderReflectionHome === 'function') renderReflectionHome(); },
    coachmarks: [
      _reflectionCoachmarkWhen,
      _reflectionCoachmarkTry,
      _reflectionCoachmarkFromChat,
      _simCoachmarkClosing
    ]
  });
}

function _reflectionCoachmarkWhen() {
  // 옛 reflection_when 카피 (02-tutorial-welcome.js:1168) 그대로.
  const body = `
    <div class="v8-coach-title">🌊 어떨 때 쓸까</div>
    <div class="v8-coach-text">
      <b>마음을 울리는 큰 물음</b>이 떠올랐을 때.<br><br>
      예시:<br>
      · "내가 이 일을 진정으로 원하는 게 맞는지"<br>
      · "지금 이 관계에서 나는 어떤 사람이 되고 있는지"<br>
      · "정말 두려워하는 건 뭘까"<br>
      <span class="v8-coach-text-soft">결론을 내릴 수 있게 도와줍니다.</span>
    </div>
  `;
  return _v8ShowCoachmark({ body, allowNoTarget: true, position: 'bottom' });
}

function _reflectionCoachmarkTry() {
  // 옛 reflection_try — 카드 가리킴.
  const body = `
    <div class="v8-coach-title">카드를 한 번 눌러보세요.</div>
    <div class="v8-coach-text">
      예시를 함께 봅시다.
    </div>
  `;
  return _v8ShowCoachmark({
    targetSelector: '.reflection-active-card, .reflection-card, [onclick*="openReflectionChat"]',
    body,
    position: 'top',
    allowNoTarget: true
  });
}

function _reflectionCoachmarkFromChat() {
  // 옛 reflection_from_chat 카피 그대로.
  const body = `
    <div class="v8-coach-title">🌊 대화에서 스크랩</div>
    <div class="v8-coach-text">
      대화 탭에서 <b>소라고동 메시지를 스크랩</b>해서 생각해볼 만한 내용은 <b>숙고 질문으로 보낼 수 있습니다</b>.<br>
      <span class="v8-coach-text-soft">메시지 우상단 ⋮ → "🌊 숙고 질문으로 보내기"</span>
    </div>
  `;
  return _v8ShowCoachmark({ body, allowNoTarget: true, position: 'bottom' });
}

// ═══════════════════════════════════════════════════════════════
// 6) Core 3 sim 튜토 — 결과 체크 → 모래사장 → DNA 소라 → 진주 합체 흐름
//    옛 startCore3A (success_celebrate / click_dna_shell / dna_explanation / core3a_finish) 의 V8 재해석.
//    사용자 명시: 결과 체크부터. 진짜 모달 띄우면 사용자 액션 막힘 가능 → 안내 코치마크로 시뮬.
// ═══════════════════════════════════════════════════════════════

function shouldRunCore3Tutorial(opts) {
  if (typeof _isTutorialEligibleUser === 'function' && !_isTutorialEligibleUser()) return false;
  return _shouldRunSimTutorial('core3', opts);
}

async function runCore3TutorialV8() {
  await _runSimTutorial({
    tutorialKey: 'core3',
    sessionMarker: SIM_TUTORIAL_MARKERS.core3 || 'soragodong_v4_tut_core3_done',
    screenAfterSeed: 'home',
    navAction: () => {
      if (typeof renderTodayMission === 'function') renderTodayMission();
      if (typeof renderShellBar === 'function') renderShellBar();
    },
    coachmarks: [
      _core3CoachmarkResultCheck,
      _core3CoachmarkOpenBeach,
      _core3CoachmarkDnaShell,
      _core3CoachmarkPearlMerge,
      _simCoachmarkClosing
    ]
  });
}

function _core3CoachmarkResultCheck() {
  // V4 (사용자 명시 2026-05-17 ultrathink): 카피 존댓말로.
  const body = `
    <div class="v8-coach-title">📋 결과 체크</div>
    <div class="v8-coach-text">
      미션 해낸 다음날, 고동이가 물어봐요 —<br>
      <b>✓ 통했어요 / 🤔 별로 / ✗ 안 통했어요</b><br>
      <span class="v8-coach-text-soft">'통했어요' 누르면 — 그 전략의 DNA 한 조각이 모래사장에 쌓입니다 ✦</span>
    </div>
  `;
  return _v8ShowCoachmark({
    targetSelector: '.mission-card, #missionContainer',
    body,
    position: 'bottom',
    allowNoTarget: true
  });
}

function _core3CoachmarkOpenBeach() {
  // 모래사장 자동 진입.
  if (typeof showScreen === 'function') showScreen('home');
  setTimeout(() => { if (typeof openShellCollection === 'function') openShellCollection(); }, 200);
  return _v8Sleep(500).then(() => {
    const body = `
      <div class="v8-coach-title">🏖 모래사장</div>
      <div class="v8-coach-text">
        통한 미션마다 — 소라 하나가 쌓입니다 ✦<br>
        <span class="v8-coach-text-soft">시드로 시뮬 소라들 미리 깔아뒀어요.</span>
      </div>
    `;
    return _v8ShowCoachmark({
      targetSelector: '.beach-area, .shell-grid, #shellModal.active',
      body,
      position: 'bottom',
      allowNoTarget: true
    });
  });
}

function _core3CoachmarkDnaShell() {
  // 시드 안 DNA 한 조각 (gradation 안의 shell) — 첫 element highlight.
  const dnaShell = document.querySelector('.beach-shell.has-dna, .beach-shell.dna, .shell-item[data-dna], .dna-shell');
  if (dnaShell) {
    try { dnaShell.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
    dnaShell.classList.add('sim-tutorial-highlight');
    setTimeout(() => { try { dnaShell.classList.remove('sim-tutorial-highlight'); } catch {} }, 8000);
  }
  const body = `
    <div class="v8-coach-title">🧬 마크 붙은 소라</div>
    <div class="v8-coach-text">
      보세요 — <b>🧬 마크</b> 붙은 소라.<br>
      이건 통하신 <em>전략의 DNA 한 조각</em>입니다 ✨<br>
      <span class="v8-coach-text-soft">같은 전략 또 통할 때마다 — 또 하나.</span>
    </div>
  `;
  return _v8ShowCoachmark({
    targetSelector: '.beach-shell.has-dna, .beach-shell.dna, .shell-item[data-dna], .dna-shell, .beach-shell',
    body,
    position: 'top',
    allowNoTarget: true
  });
}

function _core3CoachmarkPearlMerge() {
  const body = `
    <div class="v8-coach-title">💎 5조각 → DNA 진주</div>
    <div class="v8-coach-text">
      DNA 5조각 모이면 — 합쳐져서 <b>💎 DNA 진주</b>가 됩니다.<br>
      <span class="v8-coach-text-soft">당신만의 힘 ✦ 같은 상황 또 오면, 이미 당신의 무기.</span>
    </div>
  `;
  return _v8ShowCoachmark({ body, allowNoTarget: true, position: 'bottom' });
}

// ═══════════════════════════════════════════════════════════════
// 설정 → 코어 / sim 튜토 picker (force fire — tutorialShown 가드 우회).
// ═══════════════════════════════════════════════════════════════
async function showSimTutorialPicker() {
  if (typeof showOptionsModal !== 'function') {
    if (typeof showToast === 'function') showToast('튜토리얼 picker 부재');
    return;
  }
  // V4 (사용자 명시 2026-05-18 ultrathink): picker entries 정리.
  //   폐기 (shouldRun=false 라 trigger 해도 안 뜸): 'diaryLib' (runDiaryLibTutorialV8) / 'reviews' (runReviewsTutorialV8).
  //   추가: 'firstHome' (runFirstHomeTutorial — 홈 진입 7 page interactive flow). force 옵션으로 가드 우회.
  //   추가: 'magic' (runMagicTutorialV8 — 마법고동 큰 결정 14일 숙성).
  const opts = [
    { label: '🐚 시작 (안녕? → 첫 분석)',         value: 'v8start',    desc: 'V9 시작 튜토 — 게스트/카카오 신규 진입 흐름' },
    { label: '🏠 홈 첫 진입 (체크인 + 일기)',     value: 'firstHome',  desc: '백지 시드 → 체크인 → 일기 → 챗 prefill → 마무리' },
    { label: '⭐ 첫 ✦ 해볼게 / 🧬 전략으로',      value: 'firstC2',    desc: '4단 응답 → 미션 → 모래사장 한 사이클' },
    { label: '🚀 결과 체크 + 모래사장 (Core 3)',  value: 'core3',      desc: '결과 체크 → DNA 소라 → 진주 합체' },
    { label: '🔮 진주',                            value: 'pearls',     desc: '살아있다 느낀 순간들' },
    { label: '🐚 마법고동 (큰 결정)',              value: 'magic',      desc: '14일 숙성 — 도전 / 사랑 / 진로 결정' },
    { label: '✨ 깨달음 (AI 인사이트)',            value: 'insights',   desc: '엄마 통화 후 mood +0.8 패턴' },
    { label: '🌊 숙고 질문',                       value: 'reflection', desc: '마음을 울리는 큰 물음' }
  ];
  const choice = await showOptionsModal({
    title: '🔧 코어 튜토리얼',
    message: '시드 시뮬로 한 번 보기. testerMode 자동 ON → OFF 시 새로고침 (실 데이터 그대로).',
    options: opts
  });
  if (!choice) return;
  // 기존 마킹 reset (force fire)
  state.tutorialShown = state.tutorialShown || {};
  switch (choice) {
    case 'v8start':
      state.tutorialVersion = null;
      try { saveState(); } catch {}
      if (typeof runStartTutorialV8 === 'function') runStartTutorialV8().catch(e => console.warn(e));
      return;
    case 'firstHome':
      // V4 (사용자 명시 2026-05-18 ultrathink): _shownInlineTips 안의 firstHomeIntro 마커 제거 + force 호출.
      if (Array.isArray(state._shownInlineTips)) {
        state._shownInlineTips = state._shownInlineTips.filter(k => k !== 'firstHomeIntro');
      }
      try { saveState(); } catch {}
      if (typeof runFirstHomeTutorial === 'function') runFirstHomeTutorial({ force: true }).catch(e => console.warn(e));
      return;
    case 'firstC2':
      state.tutorialShown.core2 = false;
      state._core2NotUnlocked = false;
      try { saveState(); } catch {}
      if (typeof showToast === 'function') showToast('대화 탭에서 4단 응답에 ✦ 해볼게 / 🧬 전략으로 누르면 fire ✦');
      if (typeof showScreen === 'function') showScreen('chat');
      return;
    case 'core3':
      state.tutorialShown.core3 = false;
      try { saveState(); } catch {}
      if (typeof runCore3TutorialV8 === 'function') runCore3TutorialV8().catch(e => console.warn(e));
      return;
    case 'pearls':
      state.tutorialShown.pearls = false;
      try { saveState(); } catch {}
      if (typeof runFirstPearlTutorialV8 === 'function') runFirstPearlTutorialV8().catch(e => console.warn(e));
      return;
    case 'magic':
      state.tutorialShown.magic = false;
      try { saveState(); } catch {}
      if (typeof runMagicTutorialV8 === 'function') runMagicTutorialV8().catch(e => console.warn(e));
      return;
    case 'insights':
      state.tutorialShown.insights = false;
      try { saveState(); } catch {}
      if (typeof runInsightsTutorialV8 === 'function') runInsightsTutorialV8().catch(e => console.warn(e));
      return;
    case 'reflection':
      state.tutorialShown.reflection = false;
      try { saveState(); } catch {}
      if (typeof runReflectionTutorialV8 === 'function') runReflectionTutorialV8().catch(e => console.warn(e));
      return;
  }
}
