// ═══════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════
function showScreen(name) {
  // 사용자 명시 2026-05-17: 홈 탭 제거 — 'home' 요청은 'archive' 로 alias (모든 "돌아가기" 버튼 호환 유지).
  if (name === 'home') name = 'archive';
  // V4 (사용자 명시 2026-05-13 ultrathink): 화면 전환 시 메인 헤더 토글 visual sync (대화탭 = RAG SVG / 그 외 = godongicon).
  if (typeof updateMainHeaderBtnVisual === 'function') {
    setTimeout(() => { try { updateMainHeaderBtnVisual(); } catch {} }, 0);
  }
  // V4 사용자 보고 2026-05-23 — chat 진입 시 renderChat 강제 호출. 옛 코드로 render 된 메시지를 새 코드 (avatar 포함) 로 재 render.
  //   empty entry (welcome bubble + chip) 도 renderChat 안 _chatEmptyAreaHtml 가 처리 — 별도 updateChatEmptyState 호출 불필요.
  if (name === 'chat' && typeof renderChat === 'function') {
    setTimeout(() => { try { renderChat(); } catch {} }, 0);
  }
  // V4 (사용자 명시 2026-05-06 ultrathink — 추가): 첫 진입 시 sim 튜토리얼 fire.
  // _simTutorialInternalNav 플래그 = 튜토리얼 자기 자신이 호출 — 재진입 차단.
  // 사용자 명시 2026-05-06 (재정정): 마법고동 sim 튜토 폐기 — decisions 분기 제거.
  if (!window._simTutorialInternalNav) {
    if (name === 'archive' && typeof shouldRunDiaryLibTutorial === 'function' && shouldRunDiaryLibTutorial()) {
      runDiaryLibTutorialV8().catch(e => console.warn('[diaryLib]', e));
      return;
    }
    // V4 (사용자 명시 2026-05-13): 리뷰 튜토리얼 자연 첫 진입 trigger 폐기. 설정 picker manual trigger 는 유지 (14-sim-tutorials.js).
  }
  // V4 코어 잠금 — 잠긴 탭/화면 진입 시 잠금 모달 (testerMode/코어활성/unlocked면 통과)
  // (글로벌 클릭 인터셉터가 잡지만, 다른 곳에서 showScreen 직접 호출하는 케이스도 가드)
  // V4 fix (사용자 보고 2026-05-04): 기존 가입자 진입 직후 나 탭 즉시 클릭 시 잠금 모달 잠시 뜨다 사라지던 async 경합 fix.
  // root cause = cloud load 끝 전 = state.unlocked default (모두 false) → 옛 isCoreLocked = true → 잠금 모달.
  // v8 dead-code 였지만 stale cached JS / 회귀 대비 _initialDataLoading flag 우회 + 화면 전환 진행 보장.
  if (!window._initialDataLoading) {
    // 사용자 명시 2026-05-17: archive = 새 홈 (안 C) — core5 잠금 제거. 홈은 모두에게 열려있어야.
    const _navLockMap = { execute: 'core3', model: 'core4', decisions: 'core8' };
    const _lockCoreId = _navLockMap[name];
    if (_lockCoreId && typeof isCoreLocked === 'function' && isCoreLocked(_lockCoreId)) {
      if (typeof showCoreLockModal === 'function') showCoreLockModal(_lockCoreId);
      return;
    }
  }
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const target = document.getElementById('screen-' + name);
  if (target) target.classList.add('active');
  const nav = document.querySelector(`.nav-item[data-screen="${name}"]`);
  if (nav) nav.classList.add('active');
  target && target.scrollTo(0, 0);
  document.getElementById('chatInputBar').style.display = name === 'chat' ? 'block' : 'none';
  // V4-1j-b: 숙고 입력 바 (fixed bottom)
  const reflInputBar = document.getElementById('reflectionInputBar');
  if (reflInputBar) reflInputBar.classList.toggle('active', name === 'reflection');
  // 사용자 요청 2026-04-29: 마법 도움 받기 화면도 입력바 토글
  const magicInputBar = document.getElementById('magicHelpInputBar');
  if (magicInputBar) magicInputBar.classList.toggle('active', name === 'magic-help');
  // V3.13.x: 헤더는 항상 표시. 배너만 새 홈(archive)에 한정.
  const bannerEl = document.getElementById('updateBanner');
  if (bannerEl && name !== 'archive') bannerEl.style.display = 'none';

  // (옛 'home' 분기 폐기 — alias 처리로 'archive' 진입 시 통합 렌더. 아래 'archive' 분기 참조.)
  if (name === 'settings') { setTimeout(refreshTesterModeUI, 30); }
  // V4: 화면 전환 후 잠금 시각 갱신 (모든 화면 공통)
  setTimeout(() => { if (typeof applyCoreLockMarkers === 'function') applyCoreLockMarkers(); }, 50);
  if (name === 'checkin') {
    renderDailyQuestion(); renderModes(); renderCheckinTrackers(); prefillCheckinFromEntry();
    // V4-fix v3 (사용자 요청): 체크인 진입 시 가닥 미션 팔로업 자동 prompt
    if (typeof offerStrategyFollowup === 'function') { try { offerStrategyFollowup(); } catch (e) {} }
  }
  if (name === 'model') {
    renderModel();
    // V4 (사용자 명시 2026-05-08 ultrathink): 나 탭 진입 시 batch dot 클리어.
    if (typeof _clearNavBatchUpdate === 'function') _clearNavBatchUpdate('model');
  }
  if (name === 'pearls') {
    // 사용자 명시 2026-05-18 ultrathink (Phase 1+2): 진주 탭 진입 — pearlsContent 에 renderLensPearls inject.
    //   pearlsSearch input 의 visible value 와 _pearlsTabSearchQuery 양방향 sync.
    const _pInput = document.getElementById('pearlsSearch');
    if (_pInput && typeof _pearlsTabSearchQuery === 'string') _pInput.value = _pearlsTabSearchQuery;
    if (typeof renderLensPearls === 'function') renderLensPearls();
    if (typeof hydratePearlVideos === 'function') hydratePearlVideos();
    // 사용자 명시 2026-05-18 ultrathink Phase 3: 옛 도서관 진주 chip 트리거 → 진주 탭 첫 진입으로 이전.
    //   internalNav 가드 — 튜토 내부에서 showScreen('pearls') 호출 시 재진입 회피.
    if (!window._pearlTutorialInternalNav && !window._simTutorialInternalNav) {
      if (typeof shouldRunFirstPearlTutorial === 'function' && shouldRunFirstPearlTutorial()) {
        runFirstPearlTutorialV8().catch(e => console.warn('[pearl tutorial]', e));
      }
    }
  }
  if (name === 'archive') {
    // 사용자 명시 2026-05-17: 도서관 = 새 홈. 옛 home 렌더 통합.
    //   회전카드 4-source (Hook/체크인/오늘의 너/리뷰) 으로 흡수 — renderReviewPreview / renderYesterdayChangeHint 호출 폐기.
    if (typeof expireOldMissions === 'function') expireOldMissions();
    applyNightMode();
    if (typeof renderTodayMission === 'function') renderTodayMission();
    if (typeof renderShellBar === 'function') renderShellBar();  // 양생방 안 shellCount 갱신
    if (typeof renderReflectionHome === 'function') renderReflectionHome();
    if (typeof renderRotatingCard === 'function') renderRotatingCard();
    if (typeof runDiagnosesIfNeeded === 'function') {
      try { runDiagnosesIfNeeded(); } catch (e) { console.warn('runDiagnoses:', e); }
    }
    if (typeof renderUpdateNotice === 'function') renderUpdateNotice();

    // V4-fix #5: 도서관 처음 진입 시 모든 카테고리 lastSeen 초기화 (점 폭발 방지)
    if (state.preferences && !state.preferences._libCatLastSeenInit) {
      const nowIso = new Date().toISOString();
      state.preferences._libCatLastSeen = {
        diary: nowIso, yangsaeng: nowIso, insights: nowIso, pearls: nowIso, galpi: nowIso
      };
      state.preferences._libCatLastSeenInit = true;
      saveState();
    }
    _markLibTabSeen();
    if (typeof updateLibraryTabNewDot === 'function') updateLibraryTabNewDot();
    // V4 (사용자 명시 2026-05-17 ultrathink): 홈 (옛 도서관) 첫 진입 튜토 — 체크인 + 토픽 안내 2 page chain. 시드 미션 hide.
    if (typeof runFirstHomeTutorial === 'function') {
      setTimeout(() => { try { runFirstHomeTutorial(); } catch (e) { console.warn('[firstHomeTuto]', e); } }, 350);
    }
    // V4 (사용자 명시 2026-05-17 ultrathink) 옵션 A: 홈 진입 시 backend pending hook fetch — iOS PWA push 못 받아도 카드 표시.
    if (typeof _syncPendingHookFromBackend === 'function') {
      setTimeout(() => { _syncPendingHookFromBackend(); }, 200);
    }
    renderArchive();
  }
  if (name === 'decisions') renderDecisionsList();
  // 사용자 보고 2026-05-09: 첫 진입 시 archive-reviews 빈 화면 → 진입마다 render 명시.
  if (name === 'archive-reviews') {
    if (typeof renderArchiveReviews === 'function') renderArchiveReviews();
  }
  // 사용자 보고 2026-04-30 ultrathink-2: 마법고동 화면(list/detail)에서 일반 chat과 시각 구분
  // body.magic-mode → 보라/매직 그라디언트 헤더 chip + 색조 살짝 시프트
  // 사용자 요청 2026-04-30: 마법 helpChat (임시 대화창) 도 magic-mode 넣어 보라 톤. 숙고의 방 = 청록, 마법 영역 = 보라.
  document.body.classList.toggle('magic-mode', name === 'decisions' || name === 'decision-detail' || name === 'magic-help');
  document.body.classList.toggle('reflection-mode', name === 'reflection');
  if (name === 'chat') {
    rotateChatPlaceholder();  // V3.10: 매번 다른 힌트
    // 사용자 요청 2026-04-29: 채팅 진입 시 _stuckToBottom 강제 true (다시 들어오면 맨 아래 보고 싶어함)
    _stuckToBottom = true;
    _unseenSinceScroll = 0;
    // V4 (사용자 명시 2026-05-20 ultrathink): 4AM cutoff 단순 룰 — last msg < (직전 4AM cutoff - 5분) 이면 archive.
    //   옛 (_isDifferentDay && _gap >= 5h) 룰 폐기 — 자정~새벽 단발 chat 도 매일 batch 에 묶이게.
    //   mid-session 보호: last msg 가 cutoff 직전 5분 또는 cutoff 이후 = defer (다음 4AM batch 에 묶임).
    //   archive date = first msg dayK (4AM 기준) — _archiveCurrentChapter 가 이미 그렇게 처리.
    //   resume (사용자가 archive 카드 다시 이어서) 직후 5h 안 = 같은 세션 유지.
    try {
      const _msgs = state.chatMessages || [];
      const _lastMsg = _msgs[_msgs.length - 1];
      const _lastMs = _lastMsg && _lastMsg.timestamp ? new Date(_lastMsg.timestamp).getTime() : null;
      let _shouldArchive = false;
      if (_lastMs != null && typeof _lastDaily4amCutoff === 'function') {
        const _cutoffMs = _lastDaily4amCutoff().getTime();
        _shouldArchive = _lastMs < (_cutoffMs - 5 * 60 * 1000);
      }
      if (state._chatResumedAt && (Date.now() - state._chatResumedAt) < (5 * 60 * 60 * 1000)) {
        _shouldArchive = false;
      }
      if (_shouldArchive && _msgs.length > 0 && typeof _archiveCurrentChapter === 'function') {
        _archiveCurrentChapter({ manual: false });
      }
    } catch (e) { console.warn('[chat-entry chapter-cutoff]', e); }
    renderChat();
    setTimeout(() => { const s = document.getElementById('screen-chat'); if (s) s.scrollTop = s.scrollHeight; }, 50);
    // V4-fix v3 (사용자 요청): 대화 진입 시 가닥 미션 팔로업 자동 prompt
    if (typeof offerStrategyFollowup === 'function') { try { offerStrategyFollowup(); } catch (e) {} }
    // 사용자 요청 2026-04-30 ultrathink Task 7: chat mode 토글 버튼 상태 반영
    if (typeof updateChatModeBtn === 'function') updateChatModeBtn();
  }

  // V3.13.x: 튜토리얼 visit step — 어떤 경로든 화면 도달 시 advance.
  // 단, setTimeout 콜백 실행 시점에 _onbStep이 이미 다른 단계면 무시 (double advance 방지).
  if (window._onbTutorialMode && typeof _onbStep === 'number' && Array.isArray(ONBOARDING_STEPS)) {
    const step = ONBOARDING_STEPS[_onbStep];
    if (step && step.waitFor === 'visit' && step.visitScreen === name) {
      const stepIdxAtCall = _onbStep;
      setTimeout(() => {
        if (window._onbTutorialMode && _onbStep === stepIdxAtCall) onbNext();
      }, 400);
    }
  }
}

// V3.10: 대화창 placeholder 회전 (매번 다른 힌트)
// V3.13.x: 톤 편중 X — 좋은 일·웃긴 에피소드·소소한 일상도 자연스럽게
// 사용자 명시 2026-05-06: 입력창 placeholder 풀 통합 — 20개 (대화탭 진입 시 1개 회전)
// 사용자 명시 2026-05-11: 검색 힌트 1개 추가 (총 21개).
const CHAT_PLACEHOLDERS = [
  '편하게 말해봐...',
  '오늘 어땠어?',
  '한 줄도 좋아',
  '뭐든 던져봐',
  '오늘 뭐 했어?',
  '오 뭔가 좋은 일?',
  'ㅋㅋㅋ 웃긴 거 있어?',
  '판단 안 함. 듣기만 할게',
  '지금 뭐 하고 있어?',
  '머릿속에 뭐가 있어?',
  '오늘 뭐 먹었어?',
  '생각나는 거 한 줄',
  '"졸려" 한 마디도 좋아',
  '소소한 거 들려줘',
  '비워두는 것도 괜찮아',
  '뭐 적을지 모르겠으면 모르겠다고 적어봐',
  '"일기:"로 시작 -> 원본으로 저장',
  '✓ 누르면 이 대화 마무리',
  '+ 메뉴 -> 더 알아보기 / 메모',
  'AI 답 ⋮ 메뉴 -> 깨달음으로 저장',
  '+ 메뉴의 "더 알아보기" 눌러봐. 분석해줄게.',
  '"검색해줘" 라고 말하면 인터넷에서 찾아와'
];

// V4 (사용자 명시 2026-06-01): empty bubble '무슨 말 할까?' 예시 토글 pool — 0476973(5/20)에서 3개로 축소됐던 원본 9개 복원.
//   기본 상태(모드 미선택) welcome 말풍선 '편하게 말해 보소' 밑 토글 펼침 (19-chat/03-measure-render.js toggleChatEmptyExamples).
const EMPTY_STATE_EXAMPLES = [
  '🍜 오늘 점심 마라탕 먹었어',
  '😰 내일 발표인데 시작도 못 함 - 도와줄게',
  '👗 이 옷 살까 말까ㅋㅋ',
  '🎉 발표 끝났어! 뿌듯',
  '🌗 기쁘기도 하고 슬프기도 하고...',
  '📔 "일기:" 오늘 잘 지냄 - 원본으로 저장돼',
  '💎 진주에 넣어줘 - 진주로 저장돼',
  '📅 내일 오후 3시에 회의 일정 잡아줘'
];

// 사용자 명시 2026-05-06: TEACHING_PLACEHOLDERS 풀 → CHAT_PLACEHOLDERS 와 통합. legacy 호환 위해 빈 array 유지.
const TEACHING_PLACEHOLDERS = [];
function dismissPlaceholder(key) {
  if (!Array.isArray(state._dismissedPlaceholders)) state._dismissedPlaceholders = [];
  if (!state._dismissedPlaceholders.includes(key)) {
    state._dismissedPlaceholders.push(key);
    saveState();
  }
}

// V4 (v8 묶음 18) 2026-05-03: Inline tip 8 trigger — 각 1회만 (state._shownInlineTips 가드)
// V4 fix (사용자 명시 2026-05-17 ultrathink):
//   - checkinFirstEntry 폐기 (firstHomeTutorial 의 page 1 흡수).
//   - firstShell 폐기 (모래사장 simple-tuto modal 과 중복 — 모달이 책임. inline tip 토스트 X).
//   - cutoffWarning 존댓말로 갱신.
const INLINE_TIPS = {
  specialShell: '✨ 특별한 소라 — 가챠 5% 확률',
  syncDotRed: '🔴 동기화 대기 — 클릭하면 강제 저장',
  syncDotClick: '✓ 강제 저장 완료',
  cutoffWarning: '🌙 새벽 4시 이전 체크인은 전날로 기록됩니다.',
  opusToggle: '🦉 Opus = 5x 빠르게 차감 (Premium 만)',
  modeFirstClick: '🌙 모드 전환 — 분위기에 맞게'
};
function _showInlineTip(key) {
  if (!Array.isArray(state._shownInlineTips)) state._shownInlineTips = [];
  if (state._shownInlineTips.includes(key)) return;
  state._shownInlineTips.push(key);
  saveState();
  const text = INLINE_TIPS[key];
  if (text && typeof showToast === 'function') showToast(text);
}

// V4 (v8 묶음 18): enterCheckin — 체크인 카드 onclick 진입 hook (cutoffWarning + checkinFirstEntry trigger)
// V4 fix (사용자 보고 2026-05-17 ultrathink): firstHomeTutorial P1 waitFor 의 reliable signal — _lastEnterCheckinTs flag.
//   옛: P1 waitFor 가 screen-checkin.classList.contains('active') 또는 #checkinSubmitBtn.offsetParent 체크 — race / CSS 변동에 취약.
//   새: enterCheckin 호출 시점 stash. P1 waitFor 가 최근 60s 내 호출 detect → advance.
function enterCheckin() {
  window._lastEnterCheckinTs = Date.now();
  // 체크인 화면 진입 — 옛 onclick 동작 보존 (showScreen 또는 직접 진입)
  if (typeof _showInlineTip === 'function') {
    // 4시 cutoff 안내 — 새벽 시간대 (0~4시) 일 때만 cutoffWarning
    const hr = new Date().getHours();
    if (hr >= 0 && hr < 4) _showInlineTip('cutoffWarning');
    // V4 fix (사용자 명시 2026-05-17 ultrathink): checkinFirstEntry inline tip 폐기 — firstHomeTutorial page 1 (👍 체크인부터) 으로 흡수.
  }
  // 옛 진입 흐름 — showScreen('checkin') / 또는 chatPlusAction('checkin') 등
  if (typeof showScreen === 'function') showScreen('checkin');
}

function rotateChatPlaceholder() {
  const input = document.getElementById('chatInput');
  if (!input) return;
  // 사용자 명시 2026-05-06: 단일 풀 (CHAT_PLACEHOLDERS 20개) 에서 1개 랜덤 — 대화탭 진입 시마다 회전
  const idx = Math.floor(Math.random() * CHAT_PLACEHOLDERS.length);
  input.placeholder = CHAT_PLACEHOLDERS[idx];
}

function updateCheckinSub() {
  const el = document.getElementById('checkinSub');
  if (!el) return;  // V3.13.x: mainAction 카드로 통합되며 엘리먼트 제거됨. 가드.
  const key = todayKey();
  const entry = state.entries.find(e => e.date === key);
  el.textContent = entry ? '오늘 기록 완료 ✓' : '15초면 돼';
}

