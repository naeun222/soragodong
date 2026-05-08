// ═══════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════
function showScreen(name) {
  // V4 (사용자 명시 2026-05-06 ultrathink — 추가): 첫 진입 시 sim 튜토리얼 fire.
  // _simTutorialInternalNav 플래그 = 튜토리얼 자기 자신이 호출 — 재진입 차단.
  // 사용자 명시 2026-05-06 (재정정): 마법고동 sim 튜토 폐기 — decisions 분기 제거.
  if (!window._simTutorialInternalNav) {
    if (name === 'archive' && typeof shouldRunDiaryLibTutorial === 'function' && shouldRunDiaryLibTutorial()) {
      runDiaryLibTutorialV8().catch(e => console.warn('[diaryLib]', e));
      return;
    }
    if (name === 'archive-reviews' && typeof shouldRunReviewsTutorial === 'function' && shouldRunReviewsTutorial()) {
      // 사용자 명시 2026-05-06: 첫 자연 진입 = 실 데이터로 weekly 리뷰 직접 생성 (비용 회사 부담).
      // 데이터 부족 / AI 호출 불가 → 함수 안에서 runReviewsTutorialV8() (sim) fallback.
      if (typeof runFirstReviewsTutorialReal === 'function') {
        runFirstReviewsTutorialReal().catch(e => console.warn('[reviews]', e));
      } else {
        runReviewsTutorialV8().catch(e => console.warn('[reviews]', e));
      }
      return;
    }
  }
  // V4 코어 잠금 — 잠긴 탭/화면 진입 시 잠금 모달 (testerMode/코어활성/unlocked면 통과)
  // (글로벌 클릭 인터셉터가 잡지만, 다른 곳에서 showScreen 직접 호출하는 케이스도 가드)
  // V4 fix (사용자 보고 2026-05-04): 기존 가입자 진입 직후 나 탭 즉시 클릭 시 잠금 모달 잠시 뜨다 사라지던 async 경합 fix.
  // root cause = cloud load 끝 전 = state.unlocked default (모두 false) → 옛 isCoreLocked = true → 잠금 모달.
  // v8 dead-code 였지만 stale cached JS / 회귀 대비 _initialDataLoading flag 우회 + 화면 전환 진행 보장.
  if (!window._initialDataLoading) {
    const _navLockMap = { execute: 'core3', model: 'core4', archive: 'core5', decisions: 'core8' };
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
  // V3.13.x: 헤더는 항상 표시 (튜토리얼 sync_dot step 등 의존). 배너만 홈에 한정.
  const bannerEl = document.getElementById('updateBanner');
  if (bannerEl && name !== 'home') bannerEl.style.display = 'none';

  if (name === 'home') {
    if (typeof expireOldMissions === 'function') expireOldMissions();
    applyNightMode(); renderTodayMission(); renderShellBar(); renderActiveDecisionsHomeV3();
    renderReviewPrompts(); renderPredictionFollowups(); renderMainAction(); renderDecisionMiniLink();
    if (typeof renderReflectionHome === 'function') renderReflectionHome();
    // V4-1o: 관찰 5종 자동 trigger (24시간 1회 가드, 조용히 등록 — chat 인용용)
    if (typeof runDiagnosesIfNeeded === 'function') {
      try { runDiagnosesIfNeeded(); } catch (e) { console.warn('runDiagnoses:', e); }
    }
    // V3.13.x: 배너는 홈에만 (헤더와 함께)
    if (typeof renderUpdateNotice === 'function') renderUpdateNotice();
  }
  if (name === 'settings') { setTimeout(refreshTesterModeUI, 30); }
  // V4: 화면 전환 후 잠금 시각 갱신 (모든 화면 공통)
  setTimeout(() => { if (typeof applyCoreLockMarkers === 'function') applyCoreLockMarkers(); }, 50);
  if (name === 'execute') renderExecute();
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
  if (name === 'archive') {
    // V4-fix #5: 도서관 처음 진입 시 모든 카테고리 lastSeen 초기화 (점 폭발 방지)
    if (state.preferences && !state.preferences._libCatLastSeenInit) {
      const nowIso = new Date().toISOString();
      state.preferences._libCatLastSeen = {
        diary: nowIso, yangsaeng: nowIso, insights: nowIso, pearls: nowIso, galpi: nowIso
      };
      state.preferences._libCatLastSeenInit = true;
      saveState();
    }
    // V4 (사용자 명시): 도서관 탭 진입 → tab dot 즉시 클리어 (카테고리별 dot 은 chip 클릭 시 따로 클리어)
    _markLibTabSeen();
    if (typeof updateLibraryTabNewDot === 'function') updateLibraryTabNewDot();
    renderArchive();
  }
  if (name === 'decisions') renderDecisionsList();
  // 사용자 보고 2026-04-30 ultrathink-2: 마법의 소라고동 화면(list/detail)에서 일반 chat과 시각 구분
  // body.magic-mode → 보라/매직 그라디언트 헤더 chip + 색조 살짝 시프트
  // 사용자 요청 2026-04-30: 마법 helpChat (임시 대화창) 도 magic-mode 넣어 보라 톤. 숙고의 방 = 청록, 마법 영역 = 보라.
  document.body.classList.toggle('magic-mode', name === 'decisions' || name === 'decision-detail' || name === 'magic-help');
  document.body.classList.toggle('reflection-mode', name === 'reflection');
  if (name === 'chat') {
    rotateChatPlaceholder();  // V3.10: 매번 다른 힌트
    // 사용자 요청 2026-04-29: 채팅 진입 시 _stuckToBottom 강제 true (다시 들어오면 맨 아래 보고 싶어함)
    _stuckToBottom = true;
    _unseenSinceScroll = 0;
    // V4 사용자 명시 2026-05-04: 챕터 분리 (5h+ 갭) 를 sendChat 시점이 아니라 chat 탭 진입 시점에 detect.
    // 5h+ 만에 들어오면 화면이 처음부터 깔끔하게 비어 있는 상태 (옛 챕터는 자동 archive 이송).
    // resume 직후엔 skip — sendChat 와 동일한 가드.
    try {
      const _NEW_CHAPTER_GAP_MS = 5 * 60 * 60 * 1000;
      const _msgs = state.chatMessages || [];
      const _lastMsg = _msgs[_msgs.length - 1];
      const _lastMs = _lastMsg && _lastMsg.timestamp ? new Date(_lastMsg.timestamp).getTime() : null;
      const _nowMs = Date.now();
      const _gap = _lastMs == null ? Infinity : (_nowMs - _lastMs);
      let _isNewChapter = _gap >= _NEW_CHAPTER_GAP_MS;
      if (state._chatResumedAt && (_nowMs - state._chatResumedAt) < _NEW_CHAPTER_GAP_MS) {
        _isNewChapter = false;
      }
      if (_isNewChapter && _msgs.length > 0 && typeof _archiveCurrentChapter === 'function') {
        _archiveCurrentChapter({ manual: false });
      }
    } catch (e) { console.warn('[chat-entry chapter-gap]', e); }
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
  '뭐 적을지 모르겠으면 모르겠다고 적어',
  '"일기:"로 시작 -> 원본으로 저장',
  '✓ 누르면 이 대화 마무리',
  '+ 메뉴 -> 일기 템플릿 / 메모',
  '"더 알고 싶어 ▾" 눌러봐. 심리 분석해줄게.'
];

// 사용자 명시 2026-05-06: 빈 채팅 진입 시 인사 밑 노출 — 10개 (이모티콘 + 한 줄)
const EMPTY_STATE_EXAMPLES = [
  '🍜 오늘 점심 마라탕 먹었어',
  '😰 내일 발표인데 시작도 못 함 - 도와줄게',
  '👗 이 옷 살까 말까ㅋㅋ',
  '🎉 발표 끝났어! 뿌듯',
  '🌗 기쁘기도 하고 슬프기도 하고...',
  '📅 오늘 3시 회의 잡아줘',
  '📔 "일기:" 오늘 잘 지냄 - 원본으로 저장돼',
  '💎 진주에 넣어줘 - 진주로 저장돼',
  '🦫 오리너구리의 조상은 오리야 너구리야?',
  '🦋 에스파 좋아해?'
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
const INLINE_TIPS = {
  firstShell: '🐚 미션 해낸 모든 소라가 여기 모여 — 대화탭에서 ✦ 해볼게 눌러봐',
  specialShell: '✨ 특별한 소라 — 가챠 5% 확률',
  syncDotRed: '🔴 동기화 대기 — 클릭하면 강제 저장',
  syncDotClick: '✓ 강제 저장 완료',
  cutoffWarning: '🌙 새벽 4시 이전 체크인 = 전날로 기록돼',
  // 사용자 명시 2026-05-06 ultrathink: 체크인 = 너에 대한 정보 모으는 핵심 → 강조 톤.
  checkinFirstEntry: '✦ 매일 한 번 체크인 — 너에 대한 정보가 쌓일수록 고동이가 더 깊게 이해해줘 🐚',
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
function enterCheckin() {
  // 체크인 화면 진입 — 옛 onclick 동작 보존 (showScreen 또는 직접 진입)
  if (typeof _showInlineTip === 'function') {
    // 4시 cutoff 안내 — 새벽 시간대 (0~4시) 일 때만 cutoffWarning
    const hr = new Date().getHours();
    if (hr >= 0 && hr < 4) _showInlineTip('cutoffWarning');
    // 체크인 첫 entry 안내 (state.entries 비어있으면)
    if (!Array.isArray(state.entries) || state.entries.length === 0) _showInlineTip('checkinFirstEntry');
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

