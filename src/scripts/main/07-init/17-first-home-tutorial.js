// V4 (사용자 명시 2026-05-17 ultrathink): firstHomeTutorial 전면 재설계 — 7 page interactive flow.
//   옛 simple-tuto 2 page (👍 체크인부터 / ✦ 대화탭에서) 폐기.
//   새 흐름: testerMode ON (자동 backup) → 백지 시드 → 체크인 코치마크 → 일기 안내 → 챗 prefill → ✓ 마무리 →
//            캘린더 자동 열기 + 시드 inject → 마무리. testerMode OFF 시 reload + backup restore (toggleTesterMode 내부).
//   markers: state._shownInlineTips 'firstHomeIntro' 영구 가드 (testerMode backup 에 포함 → restore 후 유지 → 다시 fire X).
//
// trigger: showScreen('archive') 진입 시 350ms 뒤 (15-navigation.js).
// 부수: window._firstHomeTutorialActive flag → renderTodayMission 미션 카드 hide (12-mission/08).

const FIRST_HOME_TUTORIAL_DONE_KEY = 'firstHomeIntro';
// V4 fix (사용자 보고 2026-05-20 ultrathink): 옛 .rc-checkin selector 버그 (2026-05-18~05-20) 으로
//   marker 가 박혔지만 튜토는 진행 X 였던 사용자들 일회성 복구. sweep flag 가 없으면 marker 제거 + flag set →
//   다음 홈 진입에서 튜토 정상 재실행. 1회만 동작.
const FIRST_HOME_TUTORIAL_SWEEP_KEY = 'firstHomeIntroSweep_2026_05_20';

function _firstHomeMaybeSweepStaleMarker() {
  try {
    if (!state || typeof state !== 'object') return;
    if (!Array.isArray(state._shownInlineTips)) state._shownInlineTips = [];
    state._sweeps = state._sweeps || {};
    if (state._sweeps[FIRST_HOME_TUTORIAL_SWEEP_KEY]) return;
    const idx = state._shownInlineTips.indexOf(FIRST_HOME_TUTORIAL_DONE_KEY);
    if (idx >= 0) state._shownInlineTips.splice(idx, 1);
    state._sweeps[FIRST_HOME_TUTORIAL_SWEEP_KEY] = true;
    try { saveState(true); } catch {}
  } catch (e) { console.warn('[firstHome sweep]', e); }
}

function shouldRunFirstHomeTutorial() {
  if (typeof state === 'undefined' || !state) return false;
  _firstHomeMaybeSweepStaleMarker();
  if (!Array.isArray(state._shownInlineTips)) state._shownInlineTips = [];
  if (state._shownInlineTips.includes(FIRST_HOME_TUTORIAL_DONE_KEY)) return false;
  if (state.preferences && state.preferences.testerMode) return false;
  if (window._v8TutorialRunning) return false;
  if (window._c2TutorialRunning) return false;
  if (window._pearlTutorialRunning) return false;
  if (window._simTutorialRunning) return false;
  if (window._onbTutorialMode) return false;
  if (window._firstHomeTutorialActive) return false;
  if (typeof _v8ShowCoachmark !== 'function') return false;
  if (typeof toggleTesterMode !== 'function') return false;
  // V4 (사용자 명시 2026-05-17 ultrathink): 게스트 OR 미구독 사용자 한정.
  if (typeof _isTutorialEligibleUser === 'function' && !_isTutorialEligibleUser()) return false;
  return true;
}

async function runFirstHomeTutorial(opts) {
  // V4 (사용자 명시 2026-05-18 ultrathink): opts.force=true (설정 picker 진입) 면 shouldRun 가드 우회.
  //   _firstHomeTutorialActive 중복 실행 가드만 유지 (이미 도는 중이면 skip).
  if (window._firstHomeTutorialActive) return;
  if (!(opts && opts.force) && !shouldRunFirstHomeTutorial()) return;
  window._firstHomeTutorialActive = true;
  // dismiss marker — testerMode backup 직전 set → backup 에 포함 → 종료 후 restore 해도 유지.
  // V4 fix (사용자 보고 2026-05-18 ultrathink): saveState(true) force + await saveToCloudNow().
  //   옛 saveState() debounce 400ms → 곧바로 toggleTesterMode (line 43-45) 가 testerMode=true 박음
  //   → _flushLocalSave/saveToCloud 의 testerMode 가드 (02-state.js:564) 가 차단 → marker 영구 lost.
  //   사용자가 튜토 도중 종료 시 finally 의 backup restore 도 fire 안 함 → 다음 reload _shownInlineTips=undefined → 튜토 매번 재실행.
  //   force + await 로 testerMode 박히기 전 cloud/localStorage 양쪽 완료 보장.
  if (!Array.isArray(state._shownInlineTips)) state._shownInlineTips = [];
  if (!state._shownInlineTips.includes(FIRST_HOME_TUTORIAL_DONE_KEY)) {
    state._shownInlineTips.push(FIRST_HOME_TUTORIAL_DONE_KEY);
    try { saveState(true); } catch {}
    try { if (typeof saveToCloudNow === 'function') await saveToCloudNow(); } catch (e) { console.warn('[firstHome marker cloud]', e); }
  }

  let _autoTesterToggled = false;
  try {
    // 1. testerMode ON — 현재 state 자동 backup (memory + cloud row).
    if (!state.preferences || !state.preferences.testerMode) {
      await toggleTesterMode();
      _autoTesterToggled = true;
    }
    // 2. 백지 시드 — 모든 사용자 data 비움 (체크인 가능 상태만).
    _firstHomeEmptySeed();
    // V4 fix (사용자 보고 2026-05-17 ultrathink): _lastEnterCheckinTs flag reset — P1 waitFor 의 reliable signal.
    try { delete window._lastEnterCheckinTs; } catch {}
    // 3. 홈 (archive) 진입 — 회전카드 체크인 source 노출.
    if (typeof showScreen === 'function') showScreen('archive');
    await _v8Sleep(350);
    if (typeof renderRotatingCard === 'function') renderRotatingCard();
    await _v8Sleep(220);

    // ── Page 1: 체크인 카드 안내 (회전카드 안 체크인 source 또는 mini-link target) ──
    await _firstHomeP1();
    // ── Page 2: 체크인 화면 — 기록 완료 안내 ──
    await _firstHomeP2();
    if (typeof showToast === 'function') showToast('잘하셨어요!');
    await _v8Sleep(900);

    // ── Page 3: 일기 쓰는 법 (text only) ──
    await _firstHomeP3();
    await _v8Sleep(220);

    // ── Page 4: 챗 prefill + 보내기 ──
    if (typeof showScreen === 'function') showScreen('chat');
    await _v8Sleep(400);
    _firstHomePrefillChat();
    await _v8Sleep(200);
    await _firstHomeP4();
    await _v8Sleep(400);  // AI 응답 settle 시간 (best-effort)

    // ── Page 5: 마무리 안내 chain (text → ✓ 마무리) ──
    await _firstHomeP5a();
    await _v8Sleep(220);
    await _firstHomeP5b();  // ✓ 마무리 누르도록 → confirm modal 뜸 → 사용자가 마무리 누름 → chatMessages 비워짐
    await _v8Sleep(400);

    // ── Page 6: 홈 자동 이동 + 시드 inject + 캘린더 자동 열기 ──
    if (typeof showScreen === 'function') showScreen('archive');
    await _v8Sleep(350);
    _firstHomeAddDaySeed();
    if (typeof openDayModal === 'function') openDayModal(todayKey());
    await _v8Sleep(500);
    await _firstHomeP6();
    await _v8Sleep(220);
    // 캘린더 모달 닫기
    try {
      const _dm = document.getElementById('dayModal');
      if (_dm) _dm.classList.remove('active');
    } catch {}
    await _v8Sleep(200);

    // ── Page 7: 마무리 ──
    await _firstHomeP7();
  } catch (e) {
    console.warn('[firstHome tutorial]', e);
  } finally {
    try { if (typeof _v8CleanupAll === 'function') _v8CleanupAll(); } catch {}
    // testerMode OFF — backup restore (location.reload 발생 — 사용자 원래 데이터 복원).
    if (_autoTesterToggled && state.preferences && state.preferences.testerMode) {
      try { await toggleTesterMode(); } catch (e) { console.warn('[firstHome OFF]', e); }
    }
    window._firstHomeTutorialActive = false;
    // 미션 카드 가드 해제 + rerender (testerMode 이미 OFF 였던 케이스 = reload X 안전망).
    if (typeof renderTodayMission === 'function') { try { renderTodayMission(); } catch {} }
  }
}

// 백지 시드 — testerMode 안에서 모든 사용자 data 비움 + chat 시드 메시지 3개 추가 (자연 대화 흐름, ✓ 마무리 가능).
// V4 fix (사용자 보고 2026-05-17 ultrathink): '대화가 너무 짧아 마무리할 게 없어' 토스트 회피 — endChapter minMessages=2 가드 통과.
function _firstHomeEmptySeed() {
  const _emptyArrays = ['chatArchive', 'entries', 'pearls', 'archive', 'missions',
    'topicCards', 'shellCollection', 'decisions', 'reflectionQuestions', 'insights', 'tasks',
    'dayPlan', 'starts', 'diagnoses', 'weeklyReviews', 'monthlyReviews', 'quarterlyReviews',
    'annualReviews', 'memoryVault', 'activeStrategies', 'projects', 'traits', 'values', 'patterns'];
  _emptyArrays.forEach(k => { state[k] = []; });
  // chat 시드 — 자연 대화 흐름 (P4 보내기 + P5b ✓ 마무리 가능하게).
  const _now = Date.now();
  state.chatMessages = [
    { role: 'user',      content: '오늘 좀 피곤하네.',                                                 timestamp: new Date(_now - 4 * 60000).toISOString() },
    { role: 'assistant', content: '오늘 어떤 일이 있었어요? 무엇이 가장 피곤하게 했어요?',           timestamp: new Date(_now - 3.5 * 60000).toISOString() },
    { role: 'user',      content: '회의가 많아서 머리가 좀 멍해.',                                    timestamp: new Date(_now - 3 * 60000).toISOString() },
    { role: 'assistant', content: '회의 사이에 잠깐이라도 숨 돌릴 틈이 있었어요?',                    timestamp: new Date(_now - 2.5 * 60000).toISOString() },
    { role: 'user',      content: '커피 한 잔 마실 정도?',                                            timestamp: new Date(_now - 2 * 60000).toISOString() },
    { role: 'assistant', content: '그게 그래도 한 호흡이 됐겠네요. 잠시라도 환기되는 게 중요하죠.',  timestamp: new Date(_now - 1.5 * 60000).toISOString() }
  ];
  state.caseFormulation = {};
  // 체크인 dismiss / rotating card dismiss flags reset
  state._chatEmptyCheckinDismissedDayK = null;
  if (state.rotatingCardState) {
    state.rotatingCardState.dismissedSources = {};
    state.rotatingCardState.dismissedDayK = null;
  }
  try { saveState(true); } catch {}
}

// 챗 입력창 prefill — 일기 예시.
function _firstHomePrefillChat() {
  const input = document.getElementById('chatInput');
  if (input) {
    input.value = '일기: 오늘은 아침에 일어나서 모닝빵을 먹고 산책을 다녀왔다.';
    try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
  }
}

// Page 6 자리 — 오늘 entry 에 음악 + 자동요약 추가 (mood/vitality/일기 원본은 사용자 입력으로 이미 들어감).
function _firstHomeAddDaySeed() {
  const tk = (typeof todayKey === 'function') ? todayKey() : null;
  if (!tk) return;
  let entry = (state.entries || []).find(e => e.date === tk);
  if (!entry) {
    entry = { date: tk };
    state.entries = state.entries || [];
    state.entries.push(entry);
  }
  // 음악
  if (!entry.music) {
    entry.music = {
      title: 'Vanilla Days',
      artist: 'LNGSHOT',
      artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/cf/a8/de/cfa8dee7-da1a-eb20-6074-741a4af1a1f6/cover_KM0024394_1.jpg/200x200bb.jpg'
    };
  }
  // 자동 요약 (placeholder — AI 호출 X)
  if (!entry.summary) {
    entry.summary = '아침 산책으로 시작한 평온한 하루 — 모닝빵의 작은 만족감.';
  }
  try { saveState(true); } catch {}
}

// ──────────────────────────────────────────────────────────────
// 페이지별 코치마크
// ──────────────────────────────────────────────────────────────

function _firstHomeP1() {
  const body = `
    <div class="v8-coach-title">👍 체크인부터</div>
    <div class="v8-coach-text">
      무엇을 해야할지 모르시겠다면,<br>가장 먼저 체크인을 해주세요.<br><br>
      매일 체크인할수록, 소라고동의<br><b>퀄리티가 훨씬 높아집니다!</b><br>
      <span class="v8-coach-text-soft">(깊이 이해할 수 있게 돼요)</span>
    </div>
  `;
  // V4 fix (사용자 보고 2026-05-20 ultrathink): 회전카드 redesign (2026-05-18, commit 8f02dd3) 으로
  //   .rc-checkin / .rc-checkin-mini-link 클래스 폐기 → .library-hero + .rc-body-tap (안에 #rotatingCard) 로 통합.
  //   옛 selector 가 null → _v8ShowCoachmark interactive 분기에서 target.addEventListener 가 TypeError →
  //   outer catch → finally 가 testerMode OFF 호출 → location.reload() → 사용자 시야엔 '잠깐 떠 사라짐'.
  //   marker (firstHomeIntro) 는 이미 박혀서 다음 진입에 튜토 영구 skip.
  //   fix: 회전카드 wrapper 자체를 target 으로. empty seed 상태에서 priority 가 체크인 source 를 채택 →
  //   클릭 시 inner .rc-body-tap onclick 이 enterCheckin() 발사 → _lastEnterCheckinTs set → waitFor 만족.
  return _v8ShowCoachmark({
    targetSelector: '#rotatingCard',
    body,
    position: 'bottom',
    interactive: true,
    waitFor: () => {
      try {
        if (window._lastEnterCheckinTs && (Date.now() - window._lastEnterCheckinTs) < 60000) return true;
      } catch {}
      return false;
    },
    allowNoTarget: true
  });
}

function _firstHomeP2() {
  const body = `
    <div class="v8-coach-title">한 번 해볼까요?</div>
    <div class="v8-coach-text">
      지금 몸의 에너지와 기분을 누르고,<br>
      <b>기록 완료</b>를 눌러주세요.
    </div>
  `;
  return _v8ShowCoachmark({
    targetSelector: '#checkinSubmitBtn',
    body,
    position: 'top',
    interactive: true,
    waitFor: () => {
      try {
        const tk = todayKey();
        const e = (state.entries || []).find(en => en.date === tk);
        if (e && (e.vitality || e.mood || e.note)) return true;
      } catch {}
      return false;
    },
    allowNoTarget: true
  });
}

function _firstHomeP3() {
  const body = `
    <div class="v8-coach-title">일기 쓰는 법</div>
    <div class="v8-coach-text">
      일기 쓰는 법은 두 가지가 있어요:<br><br>
      1. <b>'일기: '</b>라고 쓰고 원본으로 저장하기<br>
      2. <b>고동이랑 편하게 대화</b>하기
    </div>
  `;
  return _v8ShowCoachmark({
    body,
    allowNoTarget: true,
    position: 'bottom',
    okLabel: '아하'
  });
}

function _firstHomeP4() {
  const body = `
    <div class="v8-coach-text">
      제가 예시를 채워놨어요.<br>
      <b>보내기 버튼</b> 눌러볼까요?
    </div>
  `;
  return _v8ShowCoachmark({
    targetSelector: '#sendBtn',
    body,
    position: 'top',
    interactive: true,
    waitFor: () => {
      try {
        const msgs = state.chatMessages || [];
        // 사용자가 보낸 마지막 메시지가 '일기:' 시작.
        const lastUser = [...msgs].reverse().find(m => m && m.role === 'user');
        if (lastUser && (lastUser.content || '').trim().startsWith('일기:')) return true;
      } catch {}
      return false;
    },
    allowNoTarget: true
  });
}

function _firstHomeP5a() {
  // V4 fix (사용자 보고 2026-05-17 ultrathink): '좋아요. 일기·대화 카테고리에 원본으로 저장됐어요.' 줄바꿈 제거 — 한 문장 자연 wrap.
  const body = `
    <div class="v8-coach-title">고동이랑 대화 마무리</div>
    <div class="v8-coach-text">
      좋아요. 일기·대화 카테고리에 원본으로 저장됐어요.<br>
      조금 이따가 확인해보죠.
    </div>
  `;
  return _v8ShowCoachmark({
    body,
    allowNoTarget: true,
    position: 'bottom',
    okLabel: '다음'
  });
}

function _firstHomeP5b() {
  const body = `
    <div class="v8-coach-text">
      두 번째는, 일기를 안 쓰고<br><b>고동이랑 편하게 대화</b>한 뒤에<br>
      <b>✓ 마무리</b> 버튼을 누르는 방법이에요.<br><br>
      지금 말한 건 없지만, 그래도 눌러볼까요?<br>
      <span class="v8-coach-text-soft">(✓ → '마무리 ✦' 까지)</span>
    </div>
  `;
  return _v8ShowCoachmark({
    targetSelector: '.chat-end-btn',
    body,
    position: 'top',
    interactive: true,
    waitFor: () => {
      try {
        // 사용자가 ✓ → confirm modal '마무리 ✦' 누름 → chatMessages 비워짐.
        if ((state.chatMessages || []).length === 0) return true;
        // 또는 chatArchive 에 새 archive 추가 (최근 10s 안)
        const _arr = state.chatArchive || [];
        if (_arr.length > 0) {
          const _latest = _arr[0];
          const _ts = _latest && _latest.generatedAt ? new Date(_latest.generatedAt).getTime() : 0;
          if (Date.now() - _ts < 10000) return true;
        }
      } catch {}
      return false;
    },
    allowNoTarget: true
  });
}

function _firstHomeP6() {
  const body = `
    <div class="v8-coach-title">잘하셨어요</div>
    <div class="v8-coach-text">
      이렇게 대화를 마무리하거나 마지막 대화 후<br>5시간이 지나면, 대화 내용을 정리해서<br>
      자동으로 정리해줍니다.<br><br>
      오늘 하루 요약도 알아서 해주고요!<br><br>
      <span class="v8-coach-text-soft">지금은 예시입니다.</span>
    </div>
  `;
  return _v8ShowCoachmark({
    body,
    allowNoTarget: true,
    position: 'bottom',
    okLabel: '그렇구나'
  });
}

function _firstHomeP7() {
  const body = `
    <div class="v8-coach-text">
      튜토리얼이 끝났습니다.<br>
      즐거운 시간 되세요. 👍
    </div>
  `;
  return _v8ShowCoachmark({
    body,
    allowNoTarget: true,
    position: 'bottom',
    okLabel: '오케이'
  });
}
