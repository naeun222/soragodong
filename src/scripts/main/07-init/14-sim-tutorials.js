// ═══════════════════════════════════════════════════════════════
// V4 (사용자 명시 2026-05-06 ultrathink — 추가): 시드 시뮬 튜토리얼 5종.
//   - 도서관 첫 진입 → 일기·대화 칩 튜토 (state.tutorialShown.diaryLib)
//   - 깨달음 칩 첫 클릭 → 깨달음 튜토 (state.tutorialShown.insights)
//   - 마법의 소라고동 첫 진입 → 마법 튜토 (state.tutorialShown.magic)
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
  reflection: 'soragodong_v4_tut_reflection_done'
};

function _shouldRunSimTutorial(key) {
  if (typeof state === 'undefined' || !state) return false;
  state.tutorialShown = state.tutorialShown || {};
  if (state.tutorialShown[key]) return false;
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

    for (const cm of (coachmarks || [])) {
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
    <div class="v8-coach-title">시뮬 끝 — 본 데이터로 돌아갈게 🐚</div>
    <div class="v8-coach-text">
      잠깐 화면 깜빡 — testerMode OFF 라 새로고침.<br>
      <span class="v8-coach-text-soft">너의 진짜 데이터는 그대로 ✦</span>
    </div>
  `;
  return _v8ShowCoachmark({ body, allowNoTarget: true, position: 'bottom' });
}

// ═══════════════════════════════════════════════════════════════
// 1) 도서관 첫 진입 → 일기·대화 칩 튜토
// ═══════════════════════════════════════════════════════════════

function shouldRunDiaryLibTutorial() { return _shouldRunSimTutorial('diaryLib'); }

async function runDiaryLibTutorialV8() {
  await _runSimTutorial({
    tutorialKey: 'diaryLib',
    sessionMarker: SIM_TUTORIAL_MARKERS.diaryLib,
    screenAfterSeed: 'archive',
    navAction: () => { if (typeof switchLibraryCat === 'function') switchLibraryCat('diary'); },
    coachmarks: [
      _diaryCoachmarkLibIntro,
      _diaryCoachmarkChip,
      _diaryCoachmarkCalendar,
      _diaryCoachmarkChapterAuto,
      _simCoachmarkClosing
    ]
  });
}

function _diaryCoachmarkLibIntro() {
  const body = `
    <div class="v8-coach-title">📚 5 카테고리</div>
    <div class="v8-coach-text">
      도서관에는 <b>5가지 카테고리</b>가 있어:<br>
      📔 일기·대화 / 🔮 진주 / 🧬 양생방 / ✨ 깨달음 / 🌀 마법·리뷰<br>
      <span class="v8-coach-text-soft">각 카테고리별로 자동 정리 ✦</span>
    </div>
  `;
  return _v8ShowCoachmark({ body, allowNoTarget: true, position: 'bottom' });
}

function _diaryCoachmarkChip() {
  const body = `
    <div class="v8-coach-title">📔 일기·대화</div>
    <div class="v8-coach-text">
      대화탭에서 <b>"일기:"</b>라고 쓴 것도 저장되고,<br>
      고동이랑 한 대화를 고동이가 알아서 정리해줘.
    </div>
  `;
  return _v8ShowCoachmark({
    targetSelector: '.lib-cat-chip[data-cat="diary"]',
    body,
    position: 'bottom',
    allowNoTarget: true
  });
}

function _diaryCoachmarkCalendar() {
  const body = `
    <div class="v8-coach-title">📔 캘린더 무드 그리드</div>
    <div class="v8-coach-text">
      한 달 한눈에 — 칸 색 = 그날 기분.<br>
      <span class="v8-coach-text-soft">날짜 칸 누르면 그날의 기록.</span>
    </div>
  `;
  return _v8ShowCoachmark({
    targetSelector: '.cal-day, .lib-cal-grid',
    body,
    position: 'bottom',
    allowNoTarget: true
  });
}

function _diaryCoachmarkChapterAuto() {
  const body = `
    <div class="v8-coach-title">✦ 토픽 자동 분류</div>
    <div class="v8-coach-text">
      ✓ 마무리 누르거나 5시간 뒤엔 (한 번 자고 일어남)<br>
      <b>8 카테고리</b> (일기/일상/고민/감정/기억/할 일/아이디어/관계) 중 하나로 자동 분류.<br>
      <span class="v8-coach-text-soft">새벽 4시 일괄 정리 (신규는 즉시) ✦</span>
    </div>
  `;
  return _v8ShowCoachmark({ body, allowNoTarget: true, position: 'top' });
}

// ═══════════════════════════════════════════════════════════════
// 2) 깨달음 칩 첫 클릭 → 깨달음 튜토
// ═══════════════════════════════════════════════════════════════

function shouldRunInsightsTutorial() { return _shouldRunSimTutorial('insights'); }

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
    <div class="v8-coach-title">✨ 네 안에서 떠오른 통찰</div>
    <div class="v8-coach-text">
      대화에서 스크랩한 깨달음 / 직접 적은 메모 / 숙고한 결론 — 세 개가 여기에 모여.<br><br>
      <b>🔮 AI 인사이트 발견</b>: 체크인이 7일 이상 쌓이면 네가 어떤 패턴을 가지고 있는지 고동이가 파악해줘.<br>
      <span class="v8-coach-text-soft">탭해서 한 번 구경해봐 ✦</span>
    </div>
  `;
  return _v8ShowCoachmark({ body, allowNoTarget: true, position: 'bottom' });
}

function _insightsCoachmarkAiExample() {
  // 옛 insights_ai_example — 인사이트 카드 가리킴. 시드 안 ins_seed_5 가 'AI 발견' 예시.
  const body = `
    <div class="v8-coach-title">🔮 AI 인사이트 예시</div>
    <div class="v8-coach-text">
      이런 걸 고동이가 발견해줘 ✦<br>
      <span class="v8-coach-text-soft">엄마 통화 후 기분 상승 같은 패턴 — 신기하지?</span>
    </div>
  `;
  return _v8ShowCoachmark({
    targetSelector: '.insight-card[data-id="ins_seed_5"], .insight-card.ai-discovered, .insight-card',
    body,
    position: 'top',
    allowNoTarget: true
  });
}

// ═══════════════════════════════════════════════════════════════
// 3) 마법의 소라고동 첫 진입 → 마법 튜토
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
    <div class="v8-coach-title">🐚 마법의 소라고동</div>
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

function shouldRunReviewsTutorial() { return _shouldRunSimTutorial('reviews'); }

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
      _reviewsCoachmarkCadence,
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

function _reviewsCoachmarkCadence() {
  const body = `
    <div class="v8-coach-title">자동 안내</div>
    <div class="v8-coach-text">
      때 되면 — 홈에 카드로 떠.<br>
      직접 만들고 싶으면 카드 클릭 → 생성.<br>
      <span class="v8-coach-text-soft">데이터 부족하면 '아직 일러' 안내.</span>
    </div>
  `;
  return _v8ShowCoachmark({ body, allowNoTarget: true, position: 'top' });
}

// ═══════════════════════════════════════════════════════════════
// 5) 숙고 질문 첫 진입 → 숙고 튜토
// ═══════════════════════════════════════════════════════════════

function shouldRunReflectionTutorial() { return _shouldRunSimTutorial('reflection'); }

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
      <span class="v8-coach-text-soft">하나만 안고 며칠/몇 주 살아봐. 결론은 네가 직접 적어 ✦</span>
    </div>
  `;
  return _v8ShowCoachmark({ body, allowNoTarget: true, position: 'bottom' });
}

function _reflectionCoachmarkTry() {
  // 옛 reflection_try — 카드 가리킴.
  const body = `
    <div class="v8-coach-title">예시 미리 깔아뒀어</div>
    <div class="v8-coach-text">
      카드 한 번 눌러봐 — 그 질문 안에서 같이 깊이 들여다보자.
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
      대화 탭에서 <b>소라고동 메시지를 스크랩</b>해서 생각해볼 만한 내용은 <b>숙고 질문으로 보낼 수 있어</b>.<br>
      <span class="v8-coach-text-soft">메시지 우상단 ⋮ → "🌊 숙고 질문으로 보내기"</span>
    </div>
  `;
  return _v8ShowCoachmark({ body, allowNoTarget: true, position: 'bottom' });
}
