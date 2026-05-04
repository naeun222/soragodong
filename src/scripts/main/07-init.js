// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
async function init() {
  const now = new Date();
  // V4 (v8 묶음 9): _core2NotUnlocked 신규 사용자 detect — Core 2 본 적 X 인 사용자만 4단 응답 disabled-locked
  if (typeof state._core2NotUnlocked === 'undefined') {
    const hasMission = Array.isArray(state.missions) && state.missions.length > 0;
    const hasShell = Array.isArray(state.shellCollection) && state.shellCollection.length > 0;
    const hasStrategy = Array.isArray(state.topicCards) && state.topicCards.some(c => c.category === 'strategy');
    state._core2NotUnlocked = !hasMission && !hasShell && !hasStrategy;
  }
  // V4 (v8 묶음 10): state.tutorialShown — Core 2/3-A/3-B/4 첫 경험 트리거 플래그 (옛 사용자도 한 번 받음 OK)
  if (!state.tutorialShown || typeof state.tutorialShown !== 'object') {
    state.tutorialShown = { core2: false, core3a: false, core3b: false, core3b_try: false, core4: false };
  } else {
    if (typeof state.tutorialShown.core2 === 'undefined') state.tutorialShown.core2 = false;
    if (typeof state.tutorialShown.core3a === 'undefined') state.tutorialShown.core3a = false;
    if (typeof state.tutorialShown.core3b === 'undefined') state.tutorialShown.core3b = false;
    if (typeof state.tutorialShown.core3b_try === 'undefined') state.tutorialShown.core3b_try = false;
    if (typeof state.tutorialShown.core4 === 'undefined') state.tutorialShown.core4 = false;
  }
  // V4 (v8 묶음 7): Core 2 reload 후 깜빡임 점 갱신 — sessionStorage / state._beachJustUnlocked 체크
  setTimeout(() => { if (typeof _checkCore2JustFinished === 'function') _checkCore2JustFinished(); }, 200);
  // V4 (v8 묶음 12): Core 1 reload 후 환영 선물 모달 — onbFinish 가 marker stash, init 시점에 표시
  setTimeout(() => {
    try {
      if (sessionStorage.getItem('soragodong_v4_welcome_gift_pending') === '1') {
        sessionStorage.removeItem('soragodong_v4_welcome_gift_pending');
        if (typeof _showWelcomeGiftModal === 'function') _showWelcomeGiftModal();
      }
    } catch {}
  }, 800);
  // V4 (사용자 명시 2026-05-04 — v7 §11 / v8 §11): 4AM cutoff 자동 돌연변이 깨달음 추출 후 다음 진입 안내
  if (state._mutationCutoffExtractedAt) {
    const _atMs = new Date(state._mutationCutoffExtractedAt).getTime();
    if (Date.now() - _atMs < 24 * 3600 * 1000) {
      setTimeout(() => { if (typeof showToast === 'function') showToast('🧬 어제 돌연변이 대화 깨달음 — 도서관 ✨'); }, 1500);
    }
    delete state._mutationCutoffExtractedAt;
    try { saveState(); } catch {}
  }
  // V3.7: datePill 제거됨 - 날짜는 greetingSub로 통합
  const dateStr = now.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
  const dpEl = document.getElementById('datePill');
  if (dpEl) dpEl.textContent = dateStr;  // safety (혹시 남은 element)
  const hour = now.getHours();
  let greet = hour < 11 ? '좋은 아침 ☀️' : hour < 18 ? '오후도 잘 🌤' : '오늘 수고했어 🌙';
  const gMain = document.getElementById('greetingMain');
  if (gMain) gMain.innerHTML = greet + ' <span class="accent">✦</span>';
  const gSub = document.getElementById('greetingSub');
  if (gSub) gSub.textContent = dateStr;
  // V3.13.x: 1분마다 갱신 + 앱이 다시 보일 때 즉시 갱신
  setInterval(refreshHeaderDate, 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { refreshHeaderDate(); applyNightMode(); }
  });

  // V4 사용자 요청 2026-04-29: Service Worker 등록 (오프라인 + 설치 배너 + 푸시 인프라 ready)
  if ('serviceWorker' in navigator) {
    setTimeout(() => {
      navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW register:', e));
    }, 2000);
  }

  // V4 (v8 사용자 명시 2026-05-03 ultrathink): 옛 코어 잠금 글로벌 클릭 인터셉터 = 폐기.
  // v8 = "잠금 X / 발견형 학습". Core 2 만 4단 응답 disabled-locked (4단 응답 자리에서 처리) 별도.
  // .core-locked 클래스 자체도 applyCoreLockMarkers noop 으로 부착 X.
  /* DEAD CODE (v8 폐기, legacy reference):
  // V4 코어 튜토리얼 잠금 — 글로벌 클릭 인터셉터 (capture phase로 원래 onclick 가로챔)
  // .core-locked 클래스 + data-core="coreN" 있는 element 클릭 시 잠금 모달 표시.
  // testerMode ON / 코어 활성 / unlocked=true 면 통과.
  document.addEventListener('click', function _coreLockInterceptor(e) {
    const el = e.target && e.target.closest && e.target.closest('.core-locked');
    if (!el) return;
    const coreId = el.getAttribute('data-core');
    if (!coreId) return;
    if (typeof isCoreLocked === 'function' && !isCoreLocked(coreId)) return; // 풀려있으면 통과
    e.preventDefault();
    e.stopPropagation();
    if (typeof showCoreLockModal === 'function') showCoreLockModal(coreId);
  }, true);
  */

  // ── AUTH GATE ──
  // 사용자 보고 2026-05-03: 기존 사용자 진입 초반의 nav click → '잠겨있어' 모달 = 버그.
  // root cause = cloud load 끝 전 = state.unlocked default (모두 false) → isCoreLocked = true → 잠금 모달.
  // fix = _initialDataLoading flag = isCoreLocked 우회 (cloud load 끝 후 set false).
  window._initialDataLoading = true;
  const authed = await checkSession();
  if (!authed) {
    showLoginScreen();
    window._initialDataLoading = false;
    return;
  }
  // Authenticated — load data
  document.getElementById('loginScreen').style.display = 'none';
  document.querySelector('.app').style.display = 'flex';

  // 사용자 요청 2026-04-28: 서버 시간 동기화 (디바이스 시계 잘못돼도 보정)
  syncServerTime();  // fire-and-forget

  await loadFromCloud();
  window._initialDataLoading = false;

  // 사용자 보고 2026-05-04 (VB022): 신규 사용자 기준 초반 잠금이 기존 사용자에게 잘못 적용되던 버그 fix.
  // root cause = init() 초입 (line ~15206) 의 _core2NotUnlocked detect 가 cloud load 전 → 새 device 진입 한 기존 사용자도 missions/shells/topicCards 비어있어서 신규 처리.
  // fix = cloud load 후 재평가 — 실제 데이터 (entries / chatMessages / shellCollection / topicCards / hasSeenWelcomeTutorial / hasSeenV3Tour) 있으면 잠금 해제 강제.
  try {
    const _hasRealData = (state.entries || []).length > 0
      || (state.chatMessages || []).length > 0
      || (state.shellCollection || []).length > 0
      || (state.topicCards || []).length > 0
      || (state.missions || []).length > 0
      || state.hasSeenWelcomeTutorial === true
      || state.hasSeenV3Tour === true;
    if (_hasRealData && state._core2NotUnlocked) {
      state._core2NotUnlocked = false;
      saveState();
    }
  } catch (e) { console.warn('[VB022 unlock re-eval]:', e); }

  // 사용자 요청 2026-04-30 (변호사 검수): 동의는 이메일 로그인 화면에 통합 (모달 X). consentLog 적용됨.

  // 사용자 요청 2026-04-30 (E2EE Stage 2): 새 device 진입 시 password 복원 모달
  setTimeout(() => {
    if (typeof maybeShowE2EERecoveryModal === 'function') {
      maybeShowE2EERecoveryModal().catch(e => console.warn('e2eeRecovery:', e));
    }
  }, 1500);

  // 사용자 요청 2026-04-30: 가입 시 E2EE password 자동 권유 (신규 사용자 한정).
  setTimeout(() => {
    if (typeof maybeShowE2EESetupForNewUser === 'function') {
      maybeShowE2EESetupForNewUser().catch(e => console.warn('e2eeSetupNewUser:', e));
    }
  }, 2500);

  // 사용자 요청 2026-04-28: 자동 백업 (주 1회 + APP_VERSION 변경 시) — fire-and-forget
  if (typeof runAutoBackupIfNeeded === 'function') {
    setTimeout(() => { runAutoBackupIfNeeded().catch(e => console.warn('autoBackup:', e)); }, 3000);
  }

  // 사용자 명시 2026-04-30 ultrathink (정정) + V203 (chooser 폐기): silent 환영 보너스 + 자동 코어 튜토리얼 진입.
  if (typeof maybeShowFirstTimeIntro === 'function') {
    setTimeout(() => { maybeShowFirstTimeIntro().catch(e => console.warn('firstTimeIntro:', e)); }, 4500);
  }
  // 사용자 명시 2026-04-30 ultrathink: testerMode ON 경로에서 reload 후 intake 모달 자동 재진입.
  if (typeof _resumePendingIntake === 'function') {
    setTimeout(() => { _resumePendingIntake().catch(e => console.warn('intake resume:', e)); }, 4800);
  }

  // 사용자 명시 2026-05-01: 리뷰 자동 생성 trigger 제거 (weekly/monthly/quarterly/yearly).
  // 사용자가 홈/리뷰모음의 review-card 를 직접 click 해야 generateReview 호출.
  // dailyChapterExtract 만 보존 (4단 분석 자동 추출 — 리뷰 X).
  if (typeof maybeRunDailyChapterExtract === 'function') {
    setTimeout(() => { maybeRunDailyChapterExtract().catch(e => console.warn('dailyChapterExtract:', e)); }, 4000);
  }

  applyNightMode();
  renderModes();
  if (typeof renderYesterdayCard === 'function') renderYesterdayCard();
  renderTodayMission();
  renderShellBar();
  renderActiveDecisionsHomeV3();
  renderReviewPrompts();
  renderPredictionFollowups();
  renderMainAction();
  renderDecisionMiniLink();
  if (typeof renderReflectionHome === 'function') renderReflectionHome();
  renderModel();
  renderProjects();
  renderArchive();
  renderChat();
  loadSettings();
  updateCheckinSub();
  updateSleepDuration();

  // Restore active ritual bar if user was in middle of one
  restoreActiveRitualOnLoad();

  // V3.13.x: 일기 자동 요약 (어제부터 거꾸로 보강 안 된 첫 날 1개)
  setTimeout(() => {
    runDiaryAutoSummaryIfNeeded().catch(e => console.warn('diary auto summary error:', e));
  }, 7000);

  // V3.13.x: 테스터 모드 켜져 있으면 배지 표시
  if (state.preferences && state.preferences.testerMode) {
    setTimeout(refreshTesterModeUI, 100);
  }

  // V3.13.x: 새 APP_VERSION 진입 시 튜토리얼 자동 시작
  // 사용자 명시 2026-04-30 ultrathink: 옛 quiz 폐기. 환영 보너스 close 후 autoTourOnUpdate 호출.
  // 신규 사용자가 아니거나 (entries 4+) 이미 first touch done이면 maybeShowFirstTimeIntro가 직접 trigger.
  // setTimeout(() => autoTourOnUpdate(), 2000);  // ← 옛 직접 호출 제거

  // V3.13.x: 신규 사용자 자동 튜토리얼 분기 제거. 배너로 통일.
  // (isBrandNewUser 신규 사용자도 배너로 자기 페이스에 시작 가능)

  // V4 사용자 요청 2026-04-29: 모든 코어 unlock 직후 reload 시 토스트 (onbFinish가 적용한 플래그)
  if (state.preferences && state.preferences._allTutorialsJustCompleted) {
    state.preferences._allTutorialsJustCompleted = false;
    saveState();
    setTimeout(() => {
      if (typeof showToast === 'function') showToast('🎉 모든 튜토리얼 끝났어! 🐚');
    }, 1800);
  }
}

// V3.7: startWelcomeTutorial을 인터랙티브 온보딩으로 가로채기
// V3.9: WELCOME_SLIDES/TOUR_SLIDES 슬라이드 시스템 완전 제거됨
function startWelcomeTutorial() {
  startInteractiveOnboarding();
}

// === V3.7 인터랙티브 온보딩 시스템 ===
// V3.13: 30단계 인터랙티브 튜토리얼 (API키 → 체크인 → 대화 → 부름 → 모래사장 → 아카이브 → 진주 → 실행 → 나)
// V3.13.x 개편: 27단계 / 7 phases. 소라고동 톤 (친구처럼 따뜻하게).
//
// V4 (v8 사용자 명시 2026-05-03 ultrathink): 옛 21 step (chat_opus_intro / send_diary / click_deeper / await_deeper_response /
//   click_strategy / click_accept / diary_keyword / open_plus_menu / pick_diary_template / diary_walkthrough /
//   chapter_auto / chapter_close_btn / chat_archive_note / chat_intro / chat_mic_intro / 등) = 모두 dead (Core 1 화이트리스트 외 진입 X).
// 풀 튜토리얼 (Settings → 가이드 → 별도 버튼) 진행 시만 보임 (admin / legacy 사용자 도구).
// v8 활성 step:
//   - Core 1: welcome / chat_intake_entry / chapter_close_intro / core1_finish (4 step)
//   - Core 2: click_strategy / click_accept / go_home_for_mission / mission_card_intro / shell_obtained (5 step)
//   - Core 3-A: success_celebrate / click_dna_shell / dna_explanation / core3a_finish (4 step)
//   - Core 3-B: mutation_intro / try_evolved_card (2 step)
//   - Core 4: crystallize_complete (1 step)
// 옛 잠금 메커니즘 (isCoreLocked / showCoreLockModal / _coreLockInterceptor / applyCoreLockMarkers) = noop dead.
const ONBOARDING_STEPS = [
  // === Phase 0: 부탁 한 마디 (사용자 요청 2026-04-28) ===
  {
    id: 'tutorial_plea',
    targetSelector: null,
    title: '✨ 풀 튜토리얼 시작',
    body: '풀 튜토리얼은 <b>30-40분</b> 정도 걸려.<br>대신 끝나면 모든 기능을 알게 돼.<br><br>부담되면 [<b>설정 → 가이드 → 개별 코어 튜토리얼</b>]에서 코어 하나만 따로 봐도 OK.<br><br><span class="small">💡 <b>"눌렀어 →" 버튼</b>: 시킨 대로 눌렀는데 화면이 안 바뀌면 <b>잠깐 기다려봐</b> (AI 응답 지연). 그래도 안 바뀌면 <b>"눌렀어 →"</b> 직접 눌러서 다음으로.</span>',
    waitFor: 'next'
  },
  // === Phase 1: 환영 (1) ===
  {
    id: 'welcome',
    targetSelector: null,
    title: '안녕! 나 소라고동이야 🐚',
    // V4 (v8 사용자 명시 2026-05-03 ultrathink — v2 카피 채택): 단순 + 자연 톤
    body: '인생의 고민들 — 같이 풀어가보자 ✦<br>부담 없이 한 바퀴!',
    waitFor: 'next'
  },
  {
    // V4 (v8 사용자 명시 2026-05-03 ultrathink — v2 §1 명시): intake_intro 신규 step (chat_intake_entry 옛 풀 튜토리얼 자리에 보존, V8_ACTIVE_STEPS 외).
    // 강제 모드 — '나중에' 버튼 제거, ✦ 시작해볼게 inline button 만. ESC 차단 / 오버레이 클릭 X 는 _showIntakeModal 안에서 처리.
    // V4 (사용자 명시 2026-05-03 ultrathink — 추가): step 진입 시 채팅탭 자동 + 시드 chatMessages 비우기 (대화 기록 X) + 모달 가운데 + 다음 버튼 hide
    id: 'intake_intro',
    targetSelector: null,
    title: '🐚 잠깐 — 같이 들여다볼까?',
    body: '요즘 마음에 자주 떠오르는 거 한 번 써봐 ✦<br><br>같이 들여다볼게. 시간은 1-2분.<br><br><button id="intakeStartTutorialBtn" class="btn-primary" onclick="_startIntakeFromTutorial()" style="margin-top:14px; padding:12px 20px; font-size:14px; width:100%;">✦ 시작해볼게</button>',
    waitFor: 'next',
    hideNextButton: true,
    // dimBackground 제거 = default true (배경 어둡 + 모달 가운데 강조)
    onShow: () => {
      if (typeof showScreen === 'function') showScreen('chat');
      if (Array.isArray(state.chatMessages) && state.chatMessages.length > 0) {
        state.chatMessages = [];
        try { saveState(); } catch {}
        if (typeof renderChat === 'function') renderChat();
      }
    }
  },

  {
    id: 'sync_dot_intro',
    targetSelector: '#syncDot',
    title: '🟢 동기화 표시',
    body: '오른쪽 위 작은 점 보이지? 이게 클라우드 동기화 상태야:<br><br>· 🟢 <b>초록</b> — 잘 저장돼있음 ✦<br>· 🟡 <b>금색</b> (깜빡) — 동기화 중<br>· 🔴 <b>빨강</b> — 에러! 이때는 <b>⚙ 설정 → ☁️ 지금 동기화</b> 눌러서 다시 시도해줘.<br><br><span class="small">✦ NEW — <b>이 표시</b>를 누르면 클라우드에 백업(저장)됨 (10개까지 보관, 메모는 시각으로 자동).</span><br><br>지금 색 한 번 확인해봐!',
    waitFor: 'next',
    fallbackPosition: 'bottom'
  },

  // === Phase 3: 체크인 (6) — 체크인은 nav-item에 없음. 홈 → 체크인 카드 두 단계로. ===
  {
    id: 'go_home_for_checkin',
    targetSelector: '.nav-item[data-screen="home"]',
    title: '🏠 홈으로',
    body: '체크인은 홈 화면에서 들어갈 수 있어.<br>아래 🏠 홈 탭 한 번 눌러볼래?',
    waitFor: 'visit',
    visitScreen: 'home'
  },
  {
    id: 'go_checkin',
    targetSelector: '.action-card[onclick*="checkin"]',
    title: '✓ 체크인 카드',
    body: '이 앱에서 <b>가장 먼저 할 일은 \'체크인\'이야</b> ✨<br><br>한 번 눌러볼래?',
    waitFor: 'click',
    advanceDelay: 800,
    fallbackPosition: 'bottom'
  },
  {
    id: 'pick_mode',
    targetSelector: '.mode-row',
    title: '오늘 컨디션 어때?',
    body: '특별한 날이면 골라봐. AI가 그 맥락에 맞춰 네 데이터를 학습해.<br>예를 들면 시험기간엔 밤낮이 바뀔 수 있잖아 — 다 괜찮아.<br><br><span class="small">선택 안 해도 됨. 여기선 시험 삼아 한 번 골라보자.</span>',
    waitFor: 'click',
    advanceDelay: 500,
    fallbackPosition: 'bottom'
  },
  {
    id: 'pick_vitality',
    targetSelector: '.vitality-options',
    title: '⚡ 활력은?',
    body: '오늘 에너지 어느 정도야?<br>😵 (방전) ~ ✨ (가득) 중에 직감으로 골라봐!',
    waitFor: 'click',
    advanceDelay: 500,
    fallbackPosition: 'bottom'
  },
  {
    id: 'cutoff_intro',
    targetSelector: null,
    title: '🌙 새벽 4시까지 = 어제',
    body: '새벽까지 일하다가 체크인 / 일기 적으면 — <b>새벽 4시 이전엔 어제 기록</b>으로 들어가.<br>새벽 4시 지나면 그 날부터 새 날.<br><br><span class="small">밤샘 일하는 너를 위한 배려야.</span>',
    waitFor: 'next',
    // 사용자 보고 2026-04-29: 이전 스탭과 위치 비슷해 움찔거림 — 이전 위치 그대로 유지
    keepCoachmarkPosition: true,
    dimBackground: false
  },
  {
    id: 'submit_checkin',
    targetSelector: 'button[onclick="submitCheckin()"]',
    title: '✦ 기록 완료',
    body: '여기까지로 충분해! 한 번 눌러볼래?',
    waitFor: 'click',
    advanceDelay: 1500,
    fallbackPosition: 'top'
  },

  // === Phase 4: 대화 + 일기 + 전략 (7) ===
  {
    id: 'go_chat',
    targetSelector: '.nav-item[data-screen="chat"]',
    title: '💬 대화 탭 — 소라고동의 꽃!',
    body: '이제 \'소라고동 앱\'의 핵심, 꽃, 대화 탭으로 갈 차례야! ✨<br>여기가 정말 중요한 곳이야 — 다음 화면에서 자세히 알려줄게.<br><br>아래 💬 대화 탭 눌러봐!',
    waitFor: 'visit',
    visitScreen: 'chat',
    fallbackPosition: 'top'
  },
  {
    id: 'chat_intro',
    targetSelector: null,
    title: '대화창에서 할 수 있는 것',
    body: '여기서는 나한테 <b>무슨 말이든 해도 돼!</b> 자유도가 무궁무진해.<br>분위기에 맞게 답해줄게.<br><br>☕ <b>일상 공유</b> — "오늘 점심 마라탕 먹었어"<br>😆 <b>웃긴 에피소드</b> — "오늘 진짜 웃긴 일 있었어..."<br>🔍 <b>가벼운 호기심</b> — "오리너구리는 조상이 오리야 너구리야?"<br>🌟 <b>자랑·뿌듯</b> — "발표 끝났어! 잘 마무리함 ㅎㅎ"<br><br>🌀 <b>와다다 풀기</b> — "기쁘기도 하고 슬프기도 하고..."<br>🤔 <b>의견 듣기</b> — "이 옷 살까 말까ㅋㅋ"<br><br>🚧 <b>막혔을 때</b> — "내일 발표인데 자료 하나도 없어. 시작도 못 하겠어"<br>💧 <b>자책 흐를 때</b> — "방금 회의에서 말 더듬었어. 다들 별로라고 생각할 듯"<br>🔁 <b>패턴 의심</b> — "또 마감 임박해서야 시작이네. 왜?"<br><br>📅 <b>일정 추가</b> — "내일 3시 회의 잡아줘" / "8시 운동 가자"<br>📔 <b>일기로 남기기</b> — <b>"일기:"</b>로 시작하면 그날 entry에 원본 저장',
    waitFor: 'next'
  },
  // 사용자 명시 2026-04-30 ultrathink: 대화 시작 전 헤더 sonnet/opus 토글 안내 + Opus 자동 활성화 (튜토리얼 한정). onbFinish 에서 sonnet 복원.
  {
    id: 'chat_opus_intro',
    targetSelector: '.js-chat-mode-btn',
    title: '🦉 더 깊은 대화 모델',
    body: '헤더 오른쪽 위 <b><img src="/godongicon.png" alt="" class="godong-icon" decoding="async">/🦉 토글</b> 보여?<br>누르면 더 깊게 답해주는 <b>Opus 모델</b>로 바뀌어.<br><br><b>지금은 튜토리얼이니까 Opus 써볼 수 있게 해줄게</b> ✦<br><br><span class="small">튜토리얼 끝나면 자동으로 sonnet 으로 돌아와. (Opus 깊은 대화는 Premium 에서 일일 30번)</span>',
    waitFor: 'next',
    nextLabel: '✦ 응 좋아',
    dimBackground: false,
    coachmarkPosition: 'corner',
    coachmarkTop: '72px'
  },
  // 사용자 명시 2026-04-30 ultrathink: 대화탭 시작 시점에 첫 관찰 흐름. 코어 #1 안. body 안 button 으로 모달 trigger + 끝나면 onbNext. 사용자가 nextBtn 으로 skip 가능 (선택권 보존).
  {
    id: 'chat_intake_entry',
    targetSelector: null,
    title: '🐚 잠깐 — 같이 들여다볼까?',
    body: '요즘 마음에 자주 떠오르는 거 한 번 써봐 ✦<br><br>같이 들여다볼게. 시간은 1-2분.<br><br><button id="intakeStartTutorialBtn" class="btn-primary" onclick="_startIntakeFromTutorial()" style="margin-top:14px; padding:12px 20px; font-size:14px; width:100%;">✦ 시작해볼게</button>',
    // V4 (v8 묶음 12): 강제 모드 — '나중에' 버튼 제거, ✦ 시작해볼게 inline button 만
    waitFor: 'next',
    hideNextButton: true,
    dimBackground: false
  },
  {
    id: 'send_diary',
    targetSelector: '#sendBtn',
    title: '"일기:"로 시작 → 그날 entry로 저장',
    body: '예시 미리 채워뒀어. 화살표 눌러서 한 번 보내봐!<br><br><span class="small">"일기:" 없이 그냥 보내면 평범한 대화야. 둘 다 자유롭게 써.</span>',
    waitFor: 'click',
    advanceDelay: 1000,
    fallbackPosition: 'top',
    dimBackground: false,
    prefill: { selector: '#chatInput', value: '일기: 오늘 엄마랑 통화했는데 또 짜증 냈어. 엄마가 "밥 잘 챙겨먹지"라고 한 마디 했을 뿐인데 나는 "나도 알아!"라고 짜증부터 내버렸어. 통화 끝나고 매번 죄책감이 밀려와. 가까운 사람한테 왜 이렇게 못되게 굴까. 매번 다음엔 안 그래야지 해놓고 또 똑같이 반복해.', force: true }
  },
  {
    id: 'click_deeper',
    targetSelector: null,
    advanceClickSelector: '.msg-action[onclick^="askDeeper"]',
    title: '"더 알고 싶어 ▾"',
    body: '평소엔 친구처럼 짧고 다정하게 답해줄게.<br><br>근데 <b>심리학적으로 깊이 분석해보고 싶을 땐</b> — 내 답 아래 <b>"더 알고 싶어 ▾"</b> 누르면 돼! 4단 분석 + 너만의 전략까지 들어가줄게.<br><br>한 번 눌러볼래?',
    waitFor: 'click',
    advanceDelay: 1500,
    dimBackground: false,
    coachmarkPosition: 'corner'
  },
  {
    id: 'await_deeper_response',
    targetSelector: null,
    title: '잠깐 기다려줘 🐚',
    body: '4단 분석 + 전략 만드는 중이야.<br><br><b>꼭!</b> 응답 끝나고 <b>🧬 전략으로</b>와 <b>✦ 해볼게</b> <b>두 버튼이 다 떠야</b> 다음으로 진행할 수 있어.<br><br>두 버튼이 뜰 때까지 기다려줘.',
    waitFor: 'next',
    dimBackground: false,
    coachmarkPosition: 'corner'
  },
  {
    id: 'click_strategy',
    targetSelector: '.msg-action[onclick^="saveMsgAsStrategy"]',
    title: '🧬 전략으로',
    body: '4단 응답 아래에 <b>"🧬 전략으로"</b> 버튼이 있어. 한 번 눌러볼래?<br><br><span class="small">응답이 길면 아래로 스크롤해서 찾아봐.</span>',
    waitFor: 'click',
    advanceDelay: 1200,
    manualAdvance: true,
    dimBackground: false,
    coachmarkPosition: 'corner'
  },
  {
    id: 'click_accept',
    targetSelector: '.proposal-btn.accept',
    title: '✦ 해볼게',
    body: '같은 응답 아래에 "✦ 해볼게" 버튼이 있어. 한 번 눌러볼래?<br>전략을 "오늘의 미션"으로 받아들이는 거야 — 홈에 "소라의 부름" ⭐로 등록돼!<br><br><span class="small">"🧬 전략으로" 옆에 같이 떠. 누른 후 "눌렀어 →" 눌러줘.</span>',
    waitFor: 'click',
    advanceDelay: 1500,
    manualAdvance: true,
    dimBackground: false,
    coachmarkPosition: 'corner'
  },
  {
    id: 'diary_keyword',
    targetSelector: null,
    title: '📔 "일기:" 키워드',
    body: '대화 첫 줄을 <b>"일기:"</b>로 시작하면 그날 entry에 원본 그대로 저장돼.<br><br>근데 일기 쓰는 또 다른 방법 — <b>+ 메뉴 → 일기 템플릿</b>!<br>인지심리학 기반 5종 (힘든 날 / 좋은 날 / 한 줄 / 계획 / 감정).<br><br>직접 해보자. 다음에서 + 버튼 보여줄게.',
    waitFor: 'next',
    dimBackground: false
  },
  {
    id: 'open_plus_menu',
    targetSelector: '#chatPlusBtn',
    title: '+ 버튼 눌러봐',
    body: '입력창 옆 <b>+</b> 버튼 보이지? 한 번 눌러봐.',
    waitFor: 'click',
    advanceDelay: 500,
    dimBackground: false,
    fallbackPosition: 'top'
  },
  {
    id: 'pick_diary_template',
    targetSelector: '.chat-plus-item[onclick*="diary"]',
    title: '📝 일기 템플릿 눌러봐',
    body: '"📝 일기 템플릿" 한 번 눌러봐.',
    waitFor: 'click',
    advanceDelay: 600,
    dimBackground: false,
    fallbackPosition: 'top'
  },
  {
    id: 'diary_walkthrough',
    targetSelector: null,
    title: '🌧 힘든 날 → 완성',
    body: '템플릿 picker 떴지?<br>1️⃣ <b>"🌧 힘든 날"</b> 눌러<br>2️⃣ 한 줄 적거나 비워두고<br>3️⃣ <b>"완성 ✦"</b> 누르면 자동으로 저장!<br><br>다 했으면 "다음 →" 눌러줘.',
    waitFor: 'next',
    dimBackground: false,
    aboveModal: true
  },
  {
    id: 'chapter_auto',
    targetSelector: null,
    title: '📖 챕터 자동 분류',
    body: '우리가 여기서 한 대화는 <b>입력창 왼쪽 하단의 ✓ 버튼을 누르면 마무리</b>돼. (5시간 동안 안 적으면 — 한 번 자고 일어남 — 알아서도 마무리 돼)<br><br>그럼 내가 이 대화 챕터를 <b>8가지 주제 중 하나</b>로 자동 분류해서 <b>📚 도서관</b> + <b>나 탭</b>에 정리해줄게:<br>일기 / 일상 / 고민 / 감정 / 기억 / 할 일 / 아이디어 / 관계.<br><br><span class="small">새벽 4시에 일괄 정리 (신규는 즉시). 잠깐 멈췄다가 이어서 하고 싶으면 그냥 메시지 보내. 새 대화 하고 싶을 때만 ✓.</span>',
    waitFor: 'next',
    dimBackground: false
  },
  {
    id: 'chapter_close_btn',
    targetSelector: '.chat-end-btn',
    title: '지금 마무리해볼까?',
    body: '입력창 왼쪽 하단의 <b>✓ 버튼</b> 눌러줘. 그 다음 "마무리"까지 눌러줘.<br><br><span class="small">다 했으면 "눌렀어 →" 눌러줘.</span>',
    waitFor: 'click',
    advanceDelay: 800,
    manualAdvance: true,
    dimBackground: false,
    fallbackPosition: 'top'
  },
  {
    id: 'chat_archive_note',
    targetSelector: null,
    title: '📜 이전 대화는 어디?',
    body: '마무리한 대화는 채팅 화면 위쪽 <b>📜 이전 대화</b>에서 다시 볼 수 있어.<br><br><b>7일이 지나면 자동으로 사라져</b>.<br><br>걱정하지 마! 우리가 한 대화는 <b>남김 없이</b> 고동이가 꼼꼼하게 정리해서 도서관에 저장해둬.<br><br>그리고 영영 보관하고 싶은 대화는 <b>📌 핀</b>을 꽂으면 돼! 📜 이전 대화 모달에서 각 대화 옆 <b>📍 → 📌</b> 토글하면 7일 cap 무시하고 영구 보관.',
    waitFor: 'next',
    dimBackground: false
  },

  // === Phase 5: 부름 + 모래사장 + 등급별로 (5) ===
  {
    id: 'go_home_for_mission',
    targetSelector: '.nav-item[data-screen="home"]',
    title: '🏠 홈으로 돌아가자',
    body: '좋아! 이제 홈으로 가자. 방금 받아들인 전략이 미션으로 등록됐을 거야.<br><br>아래 🏠 홈 탭 한 번 눌러볼래?',
    waitFor: 'visit',
    visitScreen: 'home'
  },
  {
    // V4 (v8 묶음 13) — Core 2 step [4] mission_card_intro: 해냈어 클릭 → 소라 획득
    id: 'mission_card_intro',
    targetSelector: '.mission-btn.complete',
    title: '⭐ 소라의 부름',
    body: '홈에 <b>⭐ 미션 카드</b> 떴어!<br>고동이가 너에게 *해보라고 던진* 부름이야.<br><br>지금은 시뮬이라 인증샷 X — <b>해냈어</b> 눌러봐.',
    waitFor: 'click',
    advanceDelay: 2000,
    coachmarkPosition: 'corner',
    fallbackPosition: 'top'
  },
  {
    // V4 (v8 묶음 13) — Core 2 step [5] shell_obtained: [좋아!] → _finishCore2 (testerMode OFF + reload + 모래사장 깜빡임 점)
    id: 'shell_obtained',
    targetSelector: null,
    title: '🐚 첫 소라 획득 ✦',
    body: '미션 해내면 — <b>🐚 소라</b> 하나가 모래사장에 쌓여.<br>같은 전략 또 통할 때마다 — 또 하나 ✨<br><br>홈의 모래사장 카드에서 볼 수 있어.<br><br><span class="small">시뮬은 여기까지! 이제 본 데이터로 돌아갈게.</span>',
    waitFor: 'next',
    nextLabel: '좋아!',
    dimBackground: false,
    onAdvance: () => {
      // _finishCore2 가 testerMode OFF + sessionStorage marker + reload (또는 home)
      if (typeof _finishCore2 === 'function') _finishCore2();
    }
  },
  // V4 (v8 묶음 14) 2026-05-03: Core 3-A 4 step (worked 첫 경험 → 모래사장 자동 진입 + DNA 소라 안내)
  {
    id: 'success_celebrate',
    targetSelector: null,
    title: '🎉 진짜로 통했네! ✨',
    body: '모래사장으로 가보자 — 뭐 떴는지 보자.',
    waitFor: 'next',
    nextLabel: '좋아!',
    dimBackground: false,
    onAdvance: () => {
      // 모래사장 자동 진입
      if (typeof showScreen === 'function') showScreen('home');
      setTimeout(() => { if (typeof openShellCollection === 'function') openShellCollection(); }, 300);
    }
  },
  {
    id: 'click_dna_shell',
    targetSelector: '.beach-shell.tutorial-target',
    title: '🎉 🧬 마크 붙은 소라',
    body: '봐, <b>🧬 마크</b> 붙은 소라!<br>이건 네가 통한 <em>전략의 DNA 한 조각</em>이야 ✨<br><br>한 번 눌러봐 — 어떤 전략이었는지 보여줄게.',
    waitFor: 'click',
    advanceDelay: 600,
    dimBackground: false,
    fallbackPosition: 'top'
  },
  {
    id: 'dna_explanation',
    targetSelector: null,
    title: '🧬 DNA 한 조각',
    body: '잠깐...',  // onShow 에서 동적 주입
    waitFor: 'next',
    nextLabel: '오',
    dimBackground: false,
    onShow: (step) => {
      const name = window._core3aStrategyName || '이 전략';
      step.body = `이 소라는 이제 '<b>${(typeof escapeHtml === 'function' ? escapeHtml(name) : name)}</b>' DNA 한 조각이야.<br>같은 전략이 또 통할 때마다 — 이런 소라가 하나씩 쌓여.<br><br>5조각 모이면 합쳐져서 💎 <b>DNA 진주</b>가 돼 — 너만의 힘 ✨<br><br><span class="small">🤫 도서관 → 양생방 가봐</span>`;
    }
  },
  {
    id: 'core3a_finish',
    targetSelector: null,
    title: '좋은 시작!',
    body: '너 점점 성장하고 있어 ✨<br><br>다음에 또 보자 🐚',
    waitFor: 'next',
    nextLabel: '좋아!',
    dimBackground: false,
    onAdvance: () => {
      if (typeof _finishCore3A === 'function') _finishCore3A();
    }
  },
  // V4 (v8 묶음 15) 2026-05-03: Core 3-B 1 step (진화 yes 분기 첫 경험 → mutation_intro → onAdvance _afterMutationIntro 가 openMutationChat 자동)
  {
    id: 'mutation_intro',
    targetSelector: null,
    title: '🧬 진화',
    body: '너 탓 아니야 — 이 전략이 안 맞은 거야.<br><br>다른 방법으로 가볼까? ✨',
    waitFor: 'next',
    nextLabel: '좋아 ✦',
    dimBackground: false,
    onAdvance: () => {
      if (typeof _afterMutationIntro === 'function') _afterMutationIntro();
    }
  },
  // V4 (v8 묶음 19-J) 2026-05-03: Core 3-B step 2 try_evolved_card — 진화 직후 ✦ 해볼게 안내 (waitFor click)
  {
    id: 'try_evolved_card',
    targetSelector: '.strategy-card.just-evolved .strategy-try-btn',
    title: '🌿 새 가지',
    body: '나중에 해볼게 눌러봐 ✨',
    waitFor: 'click',
    advanceDelay: 600,
    dimBackground: false,
    fallbackPosition: 'top',
    onAdvance: () => {
      // 클래스 청소 + tutorialShown.core3b_try=true
      state.tutorialShown = state.tutorialShown || {};
      state.tutorialShown.core3b_try = true;
      state._justEvolvedCardId = null;
      saveState();
      if (typeof _onbTutorialMode !== 'undefined') _onbTutorialMode = false;
      window._onbTutorialMode = false;
      if (typeof _activeCoreId !== 'undefined') _activeCoreId = null;
      if (typeof onbClose === 'function') onbClose();
    }
  },
  // V4 (v8 묶음 19) 2026-05-03: Core 4 1 step crystallize_complete — 첫 결정화 직후 안내
  {
    id: 'crystallize_complete',
    targetSelector: null,
    title: '💎 받아들였어 ✨',
    body: '잠깐...',  // onShow 에서 동적 주입
    waitFor: 'next',
    nextLabel: '좋아!',
    dimBackground: false,
    onShow: (step) => {
      const name = window._lastCrystallizedCardTitle || '이 전략';
      const safeName = (typeof escapeHtml === 'function') ? escapeHtml(name) : name;
      step.body = `이 진주는 모래사장에 있어.<br>같은 상황 또 오면 — 「${safeName}」은 이미 너의 힘이야 🐚`;
    },
    onAdvance: () => {
      // _finishCore4 — tutorialShown.core4=true + cleanup
      state.tutorialShown = state.tutorialShown || {};
      state.tutorialShown.core4 = true;
      saveState();
      if (typeof _onbTutorialMode !== 'undefined') _onbTutorialMode = false;
      window._onbTutorialMode = false;
      if (typeof _activeCoreId !== 'undefined') _activeCoreId = null;
      delete window._lastCrystallizedCardTitle;
      if (typeof onbClose === 'function') onbClose();
    }
  },
  {
    id: 'mission_done',
    targetSelector: '.mission-btn.complete',
    title: '⭐ 소라의 부름',
    body: '홈에 <b>⭐ 미션 카드</b>가 떠있을 거야!<br>이건 우리가 대화하다가 네가 고민을 전략적으로 해결하고 싶고, 그걸 \'소라가 제안\'했을 때만 나타나는 특별한 녀석이야.<br><br><b>부담은 전혀 안 가져도 돼. 안 해도 완전 괜찮음 ㅋㅋ 귀찮다 싶으면 과감히 패스해!</b> (부탁할게)<br><br>미션 완료 시 <b>인증샷</b>을 찍어서 내가 봐주고 검증해. 검증되면 \'특별한\' 소라를 얻을 수 있어.<br><br>지금은 튜토리얼이라 인증샷 넘어갈게. <b>해냈어</b> 눌러봐.',
    waitFor: 'click',
    advanceDelay: 2000,
    coachmarkPosition: 'corner',
    fallbackPosition: 'top'
  },
  {
    id: 'open_beach',
    targetSelector: '.home-small-card[onclick="openShellCollection()"]',
    title: '🏖 모래사장',
    body: '미션 완료한 소라가 모래사장에 쌓여 ✨<br>홈 화면의 모래사장 카드 한 번 눌러볼래?',
    waitFor: 'click',
    advanceDelay: 800,
    fallbackPosition: 'bottom'
  },
  {
    id: 'tier_tab',
    targetSelector: '.beach-tab[data-beach-tab="tier"]',
    title: '"등급으로" 탭으로',
    body: '등급별로 묶어서 보는 탭이야!<br>탭 눌러서 방금 받은 소라가 어떤 등급인지 같이 보자.',
    waitFor: 'click',
    advanceDelay: 800,
    fallbackPosition: 'bottom',
    dimBackground: false
  },
  // 사용자 요청 2026-04-29: 받은 소라 직접 눌러서 아이콘 / 이야기 카드 확인
  // 사용자 요청 2026-04-29 (재): 이 단계엔 아직 DNA 진주 설명 X — 평범한 (DNA 아닌) 소라만 선택 가능하게
  {
    id: 'click_new_shell',
    // 사용자 요청 2026-04-29: '방금 받은 소라' 정확히 spotlight (renderBeach가 tutorial-target 클래스 부착)
    targetSelector: '.beach-shell.tutorial-target',
    title: '🐚 방금 받은 소라',
    body: '소라 하나 눌러봐.<br>그 소라에 담긴 <b>이야기 카드</b>가 떠.',
    waitFor: 'click',
    advanceDelay: 600,
    dimBackground: false,
    fallbackPosition: 'top'
  },
  {
    id: 'shell_story_dismiss',
    targetSelector: '.shell-story-overlay .btn-secondary',
    title: '소라 이야기 ✦',
    body: '소라 아이콘 + 등급 + 그날 이야기 보여.<br><br>준비되면 <b>닫기</b> 눌러서 진행해.',
    waitFor: 'click',
    advanceDelay: 500,
    aboveModal: true,
    dimBackground: false,
    fallbackPosition: 'top'
  },
  {
    id: 'close_beach',
    targetSelector: null,
    title: '소라 7단계',
    body: '소라는 이렇게 나뉘어:<br>🐚 가벼움 → 🌀 일상 → 🐢 메인 → 🦞 황금 → ⭐ <b>부름</b> → ✨ 특별 → 🧬 <b>DNA 진주</b> (체화 완료)<br><br>천천히 구경해봐.',
    waitFor: 'next',
    coachmarkPosition: 'corner',
    dimBackground: false,
    aboveModal: true
  },
  {
    id: 'sora_obtain_methods',
    targetSelector: null,
    title: '🐚 소라는 어떻게 얻어?',
    body: '<b>소라의 부름</b>을 클리어 하거나,<br><b>오늘의 카드</b>를 완료하거나,<br><b>DNA 체화</b>를 했을 때.',
    waitFor: 'next',
    dimBackground: false,
    aboveModal: true  // 사용자 보고 2026-04-29: 이전 스탭과 같은 위치 유지
  },
  {
    id: 'special_shell_5pct',
    targetSelector: null,
    title: '✨ 5% 특별 소라',
    body: '가끔씩 <b>5%의 확률</b>로 \'<b>특별</b>\'한 소라가 떠.<br><br><span class="small">예쁘고 기분이 좋아.</span>',
    waitFor: 'next',
    dimBackground: false,
    aboveModal: true  // 사용자 보고 2026-04-29: 이전 스탭과 같은 위치 유지
  },
  {
    id: 'mission_carryover',
    targetSelector: '#shellModal .btn-secondary',
    title: '📆 못 한 부름은?',
    body: '\'소라의 부름\'은 <b>3일 동안 안 하면</b> 모래사장의 "📜 지난 부름"으로 가서 <b>7일 동안</b> 있다가 알아서 사라져.<br><br>거기서 <b>"다시 받기"</b> 누르면 오늘로 부활!<br><br>다 봤으면 <b>닫기</b> 눌러봐.',
    waitFor: 'click',
    advanceDelay: 600,
    dimBackground: false,
    aboveModal: true,
    fallbackPosition: 'top'
  },
  // crystallize_intro 일단 보류 (사용자 요청 2026-04-27) — 나중에 다시 넣을 때 demoCrystallize: true 활용
  {
    id: 'attempt_result_explain',
    targetSelector: null,
    title: '🔍 결과 체크',
    body: '근데, 미션은 성공해도 <b>문제가 해결 안 될 수도 있잖아</b>: 맞아.<br><br>예를 들면, <b>\'알람 설정\'</b> 미션은 했는데, 막상 알람이 울려도 공부를 안 했을 수 있지.<br><br>그래서 문제가 해결됐는지 <b>결과 체크</b>를 할 거야.<br>다음날 <b>체크인이나 대화 탭에 들어올 때 자동으로 떠</b>.',
    waitFor: 'next',
    dimBackground: false,
    aboveModal: true  // 사용자 보고 2026-04-29: 이전 스탭과 같은 위치 유지
  },
  {
    id: 'attempt_result_demo',
    targetSelector: null,
    title: '직접 해보자',
    body: '결과 체크 창이 떴지?<br>여기서 <b>\'👍 해결 됐어\'</b>를 눌러볼까?<br><br><span class="small">실제로는 다음날 자동으로 떠. \'⏸ 아직 결과 안 나왔어\'를 누르면 더 미룰 수도 있어.</span>',
    waitFor: 'next',
    nextLabel: '눌렀어 →',
    dimBackground: false,
    demoAttemptResult: true,
    aboveModal: true
  },
  {
    id: 'back_to_beach',
    targetSelector: '.home-small-card[onclick="openShellCollection()"]',
    title: '🏖 모래사장으로',
    body: '방금 봤어? 결과 체크가 끝났어! ✨<br>모래사장 가서 무슨 일이 일어났는지 같이 보자.',
    waitFor: 'click',
    advanceDelay: 800,
    fallbackPosition: 'bottom'
  },
  // 사용자 요청 2026-04-29: 결과 체크 후 DNA 붙은 소라 직접 눌러서 확인
  {
    id: 'click_dna_shell',
    targetSelector: '.beach-shell.dna-shell',
    title: '🧬 DNA 붙은 소라',
    body: '여기, <b>🧬 마크 붙은 소라들</b> 보여?<br>그 중 하나 눌러봐 — DNA 조각 표시 같이 보자.',
    waitFor: 'click',
    advanceDelay: 600,
    dimBackground: false,
    fallbackPosition: 'top'
  },
  {
    id: 'dna_explanation_close',
    // 사용자 요청 2026-04-29: 네모(spotlight) X
    targetSelector: null,
    // 사용자 요청 2026-04-29 (final): 자동 진행 / 폴링 다 제거. 사용자가 직접 닫기 누르고 '다음' 눌러서 진행.
    title: '🧬 DNA 한 조각',
    body: '이게 <b>DNA 한 조각</b> 표시야.<br>미션 성공이 → 전략 성공이 되면, <b>그 소라가 DNA의 한 조각</b>이 돼.<br><br>아까 눌렀던 <b>"전략으로"</b> 버튼 기억 나지?<br><br>우리가 전략을 성공할수록 그 전략은 성장해.<br><br><b>닫기 두 번</b> 누르고 <b>다음 →</b> 눌러서 진행해.',
    waitFor: 'next',
    dimBackground: false,
    aboveModal: true,
    fallbackPosition: 'top'
  },

  // === Phase 6: 도서관 → 양생방 직진 (사용자 요청 2026-04-28) ===
  {
    id: 'go_archive',
    targetSelector: '.nav-item[data-screen="archive"]',
    title: '📚 도서관으로',
    body: '이제 <b>📚 도서관</b> 탭 눌러봐. 양생방 보러 가자!',
    waitFor: 'visit',
    visitScreen: 'archive'
  },
  {
    id: 'yangsaeng_tab',
    targetSelector: '[data-cat="yangsaeng"]',
    title: '🧬 양생방',
    body: '여기 <b>양생방</b> 칩 눌러봐!',
    waitFor: 'click',
    advanceDelay: 800,
    dimBackground: false
  },
  {
    id: 'yangsaeng_explain',
    targetSelector: null,
    title: '🧬 전략 양생',
    body: '여기 <b>전략 DNA 카드</b>는 네 무기가 되어줄 수 있는 것들이야.<br><br>아까 우리가 <b>\'🧬 전략으로\'</b> 버튼을 누르면 그 전략이 여기에 저장돼. 🌱 새싹부터 시작해서 그 전략을 성공할수록 점점 성장해 — <b>양생 → 성장/진화 → 체화</b> 순서.<br><br>아까 눌렀던 전략도 여기 비슷한 이름으로 저장돼있을 거야!<br><br>이 전략들은 고동이랑 대화하다 <b>비슷한 상황에 맞닥뜨릴 때 재사용</b>돼.<br>(또는 네가 이 전략 쓰고 싶다고 고동이한테 말해도 돼!)<br><br>우리가 쓴 전략이 <b>실제로 나를 변화시킬 때까지</b> 우리는 \'<b>전략 양생</b>\'을 할 수 있어.',
    waitFor: 'next',
    dimBackground: false
  },
  // 사용자 보고 2026-05-01: 마감 직전 폭발력 신뢰 시드 카드 explanation 복원 — yangsaeng_explain 본문에서 분리해서 카드 spotlight 전용 step
  {
    id: 'yangsaeng_seed_card',
    targetSelector: '.strategy-card[data-strategy-id="strat_seed_0"]',
    title: '🌱 마감 직전 폭발력 신뢰',
    body: '여기 <b>"마감 직전 폭발력 신뢰"</b> 카드가 예시야.<br><b>3번 성공</b>해서 <b>"성장 중"</b> 단계.<br><br>곧 이 카드로 무엇을 할 수 있는지 함께 보자.',
    waitFor: 'next',
    dimBackground: false,
    fallbackPosition: 'top'
  },
  {
    id: 'click_result_check',
    // 사용자 보고 2026-04-29: 튜토리얼이 가끔 다른 전략 카드 결과 체크 가리키던 거 — strat_seed_0로 명시 scope
    targetSelector: '.strategy-card[data-strategy-id="strat_seed_0"] .strategy-try-btn',
    title: '🔍 결과 체크 버튼',
    body: '여기 <b>"🔍 결과 체크"</b> 버튼 눌러봐.<br><br><span class="small">체크인이나 대화탭에서 결과 체크 안 했으면 여기서도 가능해.</span>',
    waitFor: 'click',
    advanceDelay: 800,
    dimBackground: false,
    fallbackPosition: 'top'
  },
  {
    id: 'click_didnt_work',
    targetSelector: null,
    advanceClickSelector: '.options-btn[onclick*="didnt"]',
    title: '👎 안 통했어',
    body: '결과 체크 창 떴지?<br>이번엔 <b>\'👎 안 통했어\'</b>를 눌러봐.<br><br><span class="small">눌러도 진행이 안 되면 아래 "눌렀어 →" 직접 눌러줘.</span>',
    waitFor: 'click',
    advanceDelay: 600,
    manualAdvance: true,
    dimBackground: false,
    aboveModal: true
  },
  {
    id: 'click_evolve_yes',
    targetSelector: null,
    advanceClickSelector: '.input-modal-btn.ok',
    title: '🧬 진화해볼게',
    body: '\'안 통했네\' 창이 떴지?<br><b>\'🧬 진화해볼게\'</b> 눌러.<br><br><span class="small">눌러도 진행이 안 되면 아래 "눌렀어 →" 직접 눌러줘.</span>',
    waitFor: 'click',
    advanceDelay: 600,
    manualAdvance: true,
    dimBackground: false,
    aboveModal: true
  },
  {
    id: 'mutation_intro_msg',
    targetSelector: null,
    title: '🌿 임시 대화창',
    // 사용자 요청 2026-04-29: '고동이가 답변 만들 때까지 기다려줘' 강조 + 답변 끝나면 '다음' 직접 클릭으로 진행
    body: '전략이 실패한 게 아니라 <b>진화</b>한 거야!<br>네가 문제를 해결할 때까지 맞는 방법을 찾아보자.<br><br>(네 탓 X — 이 전략이 안 맞은 거!)<br><br><b>1.</b> <b>[🌱 가지 만들기]</b> 버튼 누르기<br><b>2.</b> 새 가지 4개 중 하나 선택<br><b>3.</b> 됐으면 <b>[다음 →]</b> 눌러줘<br><br><span class="small">대화 더 진행하면 [🔄 가지 다시 만들기]로 새로 — 같은 가지도 refine OK.</span>',
    waitFor: 'next',
    dimBackground: false,
    aboveModal: true
  },
  {
    id: 'mutation_what_effect',
    targetSelector: '#mutationChatSendBtn',
    title: '⌨ 보내봐',
    body: '이 임시 대화창에서 <b>새로운 전략에 대해 고동이랑 함께 토론</b>할 수 있어.<br><br>입력창에 \'<b>이게 무슨 효과가 있는 거야?</b>\' 미리 채워뒀어.<br><b>↑ 보내기</b> 버튼 눌러봐!',
    waitFor: 'click',
    advanceDelay: 1000,
    manualAdvance: true,
    dimBackground: false,
    aboveModal: true,
    prefillMutation: '이게 무슨 효과가 있는 거야?'
  },
  {
    id: 'mutation_finish_btn',
    // 사용자 요청 2026-04-29: 네모 표시 X (spotlight 제거)
    targetSelector: null,
    title: '✦ 이 가지로 해볼게',
    body: '고동이의 대답 들었지?<br><b>\'✦ 이 가지로 해볼게\'</b> 눌러봐.',
    waitFor: 'next',
    dimBackground: false,
    aboveModal: true
  },
  // mission_proposal_walkthrough / see_new_mission 보류 (사용자 요청 2026-04-28)
  {
    id: 'go_archive_evolved',
    targetSelector: '.nav-item[data-screen="archive"]',
    title: '📚 양생방 다시 가보자',
    body: '도서관 → 양생방에서 진화한 카드 보러 가자.<br>📚 도서관 눌러봐.',
    waitFor: 'visit',
    visitScreen: 'archive'
  },
  // click_yangsaeng_again 삭제 (사용자 요청 2026-04-28: step 50)
  {
    id: 'click_evolved_card',
    targetSelector: '.strategy-card-title[data-strategy-id="strat_seed_0"]',
    title: '진화한 전략 카드',
    body: '방금 진화한 카드 다시 눌러봐.<br>제목이 <b>새 가지로 바뀌어 있을 거야</b> — 진화 트리에 옛 \'마감 직전 폭발력 신뢰\'도 남아있어.',
    waitFor: 'click',
    advanceDelay: 800,
    manualAdvance: true,
    dimBackground: false
  },
  {
    id: 'evolved_explain',
    // 사용자 요청 2026-04-29: 진화한 전략 카드 spotlight (어떤 카드 진화했는지 시각 안내)
    targetSelector: '.strategy-card[data-strategy-id="strat_seed_0"]',
    title: '🧬 진화 트리 봤어?',
    body: '<b>\'마감 직전 폭발력 신뢰\'</b>가 안 통했네.<br>그래서 <b>새 가지로 진화</b>했어!<br><br>만약 이 새 전략이 <b>성공한다면</b> 이 DNA는 \'<b>성장</b>\' 해.<br>같은 전략이 <b>5번 성공</b>하면, 네가 이 전략을 \'<b>체화</b>\'했다고 봐.',
    waitFor: 'next',
    dimBackground: false,
    fallbackPosition: 'top'
  },
  {
    id: 'yangsaeng_try_btn',
    // 사용자 보고 2026-04-29: 다른 카드의 ✦ 해볼게 가리키지 않게 strat_seed_0로 scope
    targetSelector: '.strategy-card[data-strategy-id="strat_seed_0"] .strategy-try-btn',
    title: '✦ 해볼게 — 전략 재사용',
    body: '<b>"✦ 해볼게"</b> 버튼 눌러봐.<br><br>소라고동과 대화하다가 전략을 재사용할 수도 있지만, <b>"✦ 해볼게" 버튼으로도 전략을 재사용</b>해볼 수 있어.',
    waitFor: 'click',
    advanceDelay: 600,
    manualAdvance: true,
    dimBackground: false,
    fallbackPosition: 'top'
  },
  {
    id: 'mission_proposal_walkthrough',
    targetSelector: null,
    title: '🌿 어떤 상황? → 오늘의 제안',
    body: '\'어떤 상황?\' 창이 뜨면 답 적어 → 오늘의 제안 → \'<b>✦ 부름으로 등록</b>\' 눌러봐.<br><br><span class="small">소라고동이 네 상황에 맞는 구체 제안을 만들어줘.</span>',
    waitFor: 'next',
    manualAdvance: true,
    dimBackground: false,
    aboveModal: true
  },
  {
    id: 'go_home_check_mission',
    targetSelector: '.nav-item[data-screen="home"]',
    title: '🏠 홈으로',
    body: '홈에 새 부름이 등록됐을 거야. 보러 가자.<br>아래 🏠 홈 탭 눌러봐.',
    waitFor: 'visit',
    visitScreen: 'home',
    fallbackPosition: 'top'
  },
  {
    id: 'see_new_mission',
    targetSelector: '#missionContainer',
    title: '⭐ 새 \'소라의 부름\'',
    body: '홈에 <b>새 \'소라의 부름\'</b>이 등록됐어! ✨<br>아까 만든 \'오늘의 제안\'이 미션이 됐지.',
    waitFor: 'next',
    dimBackground: false
  },
  {
    id: 'crystallize_intro',
    targetSelector: null,
    title: '💎 네 일부가 되는 순간',
    body: '이 전략이 <b>5번 이상 성공</b>하면, 우리는 이 전략이 네 몸 속에 \'<b>체화</b>\'됐다고 말할 수 있어.<br><br>그러니까, 네가 앞으로 비슷한 문제 상황에서 <b>스스로 해결할 수 있는 힘</b>이 생긴 거지!<br><br>전략이 체화되면 → <b>DNA 진주</b>를 얻게 돼!<br>성장 및 진화에 쓰인 소라들이 <b>DNA에 자리잡아</b>.',
    waitFor: 'next',
    dimBackground: false,
    demoCrystallize: true
  },
  {
    id: 'dna_pearl_types',
    targetSelector: null,
    title: '🔮 DNA 진주 3가지',
    body: 'DNA 진주는 3가지 종류 — 슬라이더로 살펴봐 ↑',
    waitFor: 'next',
    dimBackground: false,
    aboveModal: true,
    demoDnaPearlTypes: true
  },
  // 도서관 카테고리들 (깨달음 / 마법·리뷰 / Stories) 설명 일단 보류 (사용자 요청 2026-04-28) — 양생방만 진행

  // === Phase 7: 실행 + 나 + 마무리 (5) ===
  {
    id: 'go_execute',
    targetSelector: '.nav-item[data-screen="execute"]',
    title: '🚀 실행 탭',
    body: '실행 탭은 — 네가 뭔 일을 시작할 때 <b>무거운 마음을 훌훌 털고 가벼운 두뇌로 임할 수 있게</b> 해주는 곳이야! ✨<br><br>아래 🚀 실행 탭 한 번 눌러봐.',
    waitFor: 'visit',
    visitScreen: 'execute',
    fallbackPosition: 'top'
  },
  {
    id: 'exec_overview',
    targetSelector: null,
    title: '실행 탭 — 무거운 마음 풀기',
    body: '여기는 네가 할 일 앞에서 압도되지 않게 도와주는 곳이야.<br><br>지금부터 작은 단계로 같이 둘러보자!',
    waitFor: 'next',
    dimBackground: false
  },
  {
    id: 'exec_brain_dump_btn',
    targetSelector: 'button[onclick="openBrainDump()"]',
    title: '🧠 머릿속 풀기 — 직접 해보자',
    body: '이 버튼 누르면 네 할 일을 와다다 적을 수 있어.<br>예시 미리 채워줄게 — 그냥 눌러봐!<br><br><span class="small">와다다 적으면 내가 가장 중요한 3장으로 골라줄게.</span>',
    waitFor: 'click',
    advanceDelay: 800,
    dimBackground: false
  },
  {
    id: 'exec_brain_dump_submit',
    targetSelector: '#brainDumpSubmit',
    title: '고동에게 맡기기 ✦',
    body: '예시가 자동으로 채워졌지?<br>이제 <b>"고동에게 맡기기"</b> 한 번 눌러봐.<br><br><span class="small">잠깐 기다리면 — 가장 중요한 3장 + 서랍장으로 정리돼.</span>',
    waitFor: 'click',
    advanceDelay: 1500,
    dimBackground: false
  },
  {
    id: 'exec_cards_intro',
    targetSelector: null,
    title: '✦ 오늘의 카드 3장',
    body: '오늘의 카드 = 할 일 목록 중에서 고동이 골라주는 \'<b>오늘의 할 일 3가지</b>\'.<br>이거 완료하면 <b>중요도에 맞는 등급의 소라</b>가 보상으로 주어져.<br><br>오늘 할 일 목록은 <b>서랍장으로 내릴 수 있고</b>, 서랍장에서 <b>오늘로 올릴 수 있어</b>.<br><br>한 번 구경해봐.',
    waitFor: 'next',
    dimBackground: false
  },
  {
    id: 'exec_drawer_intro',
    targetSelector: null,
    title: '📂 서랍장 4 그룹',
    body: '오늘의 카드 못 들어간 할 일은 서랍장으로.<br>자동 분류:<br>🌅 지금 가능 / 🎯 큰 것 / 📅 나중 / 💭 아이디어<br><br><span class="small">→ 오늘로 / ✓ 완료 / ✕ 삭제.</span>',
    waitFor: 'next',
    dimBackground: false
  },
  {
    id: 'exec_timetable',
    targetSelector: null,
    title: '📅 타임테이블',
    body: '시간 grid에 일정 직접 추가할 수 있어.<br>· + 으로 직접 추가<br>· 📤 구글 캘린더로 내보내기<br>· 📥 가져오기 (.ics)<br><br><span class="small">색깔 자유.</span>',
    waitFor: 'next',
    dimBackground: false
  },
  {
    id: 'exec_immerse_btn',
    targetSelector: '.exec-immerse-btn',
    title: '🌧 시작',
    body: '진짜 집중하고 싶을 때 이 버튼!<br>누르는 즉시 단축어 + 타이머 시작.<br><br>한 번 눌러봐.',
    waitFor: 'click',
    advanceDelay: 600,
    fallbackPosition: 'top'
  },
  // V4 redesign (사용자 명시 2026-05-04 ultrathink): 진입장벽 제거 — task input / IF-THEN 4 step 폐기.
  // 옛 step (exec_immerse_input / both / start_next / obstacle / launch) 모두 제거.
  {
    id: 'exec_iphone_shortcut',
    targetSelector: null,
    title: '📱 iPhone 단축어',
    body: '아이폰이라면 <b>단축어</b>를 설정할 수 있어 — 잠금화면에서 한 번에 시작.<br><br>자세한 내용은 <b>⚙ 설정</b>에서 \'단축어 설정 매뉴얼\' 항목 확인해봐.',
    waitFor: 'next',
    dimBackground: false
  },
  {
    id: 'exec_immerse_return',
    targetSelector: '.check-btn[onclick*="ritualReturn"]',
    title: '✓ 돌아옴',
    body: '몰입 끝나면 위에 <b>"✓ 돌아옴"</b> 버튼이 떠. 눌러봐.',
    waitFor: 'click',
    advanceDelay: 600,
    manualAdvance: true,
    dimBackground: false,
    fallbackPosition: 'top',
    aboveModal: true
  },
  {
    id: 'exec_immerse_done',
    targetSelector: null,
    title: '✦ 했어',
    body: '몰입 결과 묻는 창 떴지? <b>"✓ 했어"</b> 눌러봐.<br><br>네가 얼만큼의 시간을 써서 일을 완수했는지 알 수 있어. 이 데이터들이 쌓여서 네 \'<b>메타인지</b>\'에 도움을 줄 거야.<br><br><span class="small">"카드도 완료 처리할까?" 뜨면 <b>확인</b> 눌러줘.</span>',
    waitFor: 'next',
    manualAdvance: true,
    dimBackground: false,
    aboveModal: true
  },
  {
    id: 'go_model_final',
    targetSelector: '.nav-item[data-screen="model"]',
    title: '✦ 나 탭',
    body: '거의 다 왔어!<br>"나" 탭에선 너에 대한 정보를 볼 수 있어.<br><br>아래 ✦ 나 탭 눌러봐.',
    waitFor: 'visit',
    visitScreen: 'model',
    fallbackPosition: 'top'
  },
  {
    id: 'model_intro',
    targetSelector: null,
    title: '"나" 탭',
    body: '여기는 <b>내가 너를 분석한 결과</b>가 모이는 곳이야.<br>대화 쌓이면 자동으로 채워져 — 천천히 둘러봐.<br><br>📊 추적 항목 그래프도 여기서 한눈에.',
    waitFor: 'next',
    dimBackground: false
  },
  // 사용자 요청 2026-04-28: 도서관 튜토리얼 (reflection 앞으로 이동, 도서관 카테고리 다시 살림)
  // diagnoses_intro step 생략 (사용자 요청 2026-04-28)
  {
    id: 'go_archive_lib',
    targetSelector: '.nav-item[data-screen="archive"]',
    title: '📚 도서관으로',
    body: '이번엔 <b>📚 도서관</b> 전체 둘러보자.<br>아래 📚 도서관 탭 눌러봐.',
    waitFor: 'visit',
    visitScreen: 'archive',
    fallbackPosition: 'top'
  },
  {
    id: 'library_categories',
    targetSelector: null,
    title: '📚 5 카테고리',
    body: '도서관에는 <b>5가지 카테고리</b>가 있어:<br>📔 일기·대화 / 🔮 진주 / 🧬 양생방 / ✨ 깨달음 / 🌀 마법·리뷰<br><br>각 카테고리별로 자동 정리.',
    waitFor: 'next',
    dimBackground: false
  },
  {
    id: 'click_diary_chip',
    targetSelector: '[data-cat="diary"]',
    title: '📔 일기·대화 칩',
    body: '먼저 <b>📔 일기·대화</b> 칩 눌러봐.',
    waitFor: 'click',
    advanceDelay: 600,
    dimBackground: false,
    manualAdvance: true
  },
  {
    id: 'diary_calendar_explain',
    targetSelector: '.cal-day[data-date="2026-04-15"]',
    calNavToDate: '2026-04-15',  // 사용자 보고 2026-05-01: 4/15 = 옛 달 → 자동 슬라이드
    title: '📔 캘린더 무드 그리드',
    body: '한 달 한눈에 — 칸 색 = 그날 기분.<br><br>이 날을 클릭해봐.',
    waitFor: 'click',
    advanceDelay: 600,
    dimBackground: false,
    manualAdvance: true
  },
  // 사용자 요청 2026-04-29: 4/15 모달은 일기만 설명, 토픽 인터랙션은 today_diary_view로 이동
  {
    id: 'diary_day_modal_explain',
    targetSelector: null,
    advanceClickSelector: '.day-modal-close',
    title: '📔 그날의 기록',
    body: '이 날의 일기를 확인할 수 있어.<br><br>대화탭에서 "일기:"라고 쓴 것도 저장되고, 고동이랑 대화한 내용들을 고동이가 알아서 정리해줘.<br><br>다 봤으면 <b>×</b> 눌러서 닫기.',
    waitFor: 'click',
    dimBackground: false,
    aboveModal: true,
    // V4 fix (사용자 보고 2026-05-04): day-modal-tabs 가리던 버그 — 코칭마크 화면 하단 이동
    aboveModalBottom: true
  },
  // 사용자 요청 2026-04-29: 오늘 일기 (튜토리얼 중 '일기:'로 저장한 것) 같이 확인
  {
    id: 'click_today_diary',
    targetSelector: '.cal-day.today',
    calNavToToday: true,  // 사용자 보고 2026-05-01: 옛 달에 있던 calendar 를 오늘 (이번 달) 로 자동 슬라이드
    title: '📔 오늘 일기도 보자',
    body: '아까 우리가 <b>"일기:"</b>로 저장한 거 기억나?<br>오늘 칸 한 번 눌러봐.',
    waitFor: 'click',
    manualAdvance: true,
    dimBackground: false
  },
  // 오늘 모달 — 일기 보고 → 토픽 탭으로 advance
  {
    id: 'today_diary_view',
    targetSelector: null,
    advanceClickSelector: '.day-tab[data-tab="topics"]',
    title: '📔 오늘의 기록',
    body: '아까 저장한 일기가 여기 있지!<br><br>그리고 고동이랑 한 대화도 고동이가 <b>알아서 정리</b>해줘.<br>그게 뭔 말인지 — <b>"토픽"</b> 탭 한 번 눌러봐.',
    waitFor: 'click',
    manualAdvance: true,
    dimBackground: false,
    aboveModal: true,
    // V4 fix (사용자 보고 2026-05-04): 코칭마크가 토픽 탭 가리던 버그 — 화면 하단 이동
    aboveModalBottom: true
  },
  {
    id: 'today_topic_view',
    targetSelector: null,
    advanceClickSelector: '.day-modal-close',
    title: '✦ 토픽 — 카테고리별 자동 분류',
    body: '✓ 마무리 누르거나 5시간 동안 안 적으면 (한 번 자고 일어남), 고동이가 챕터를 <b>8 카테고리</b> (일기/일상/고민/감정/기억/할 일/아이디어/관계) 중 하나로 자동 분류해서 여기 자리잡아.<br><br>새벽 4시에 일괄 정리 (신규는 즉시). 다 봤으면 <b>×</b> 눌러서 닫기.',
    waitFor: 'click',
    dimBackground: false,
    aboveModal: true,
    // V4 fix (사용자 보고 2026-05-04): day-modal-tabs 가리던 버그 — 화면 하단 이동
    aboveModalBottom: true
  },
  {
    id: 'click_pearls_chip',
    targetSelector: '[data-cat="pearls"]',
    title: '🔮 진주 칩',
    body: '<b>🔮 진주</b> 칩 눌러봐.',
    waitFor: 'click',
    advanceDelay: 600,
    dimBackground: false,
    manualAdvance: true
  },
  {
    id: 'pearls_intro',
    targetSelector: null,
    title: '🔮 살아있다 느낀 순간들',
    body: '여기엔 네가 정말 정말 좋아하는 것들을 보관하는 곳이야. 언제 다시 떠올려도 기분이 좋아질 만한.<br><br><b>진주</b>라고 불러. 한 번 구경해봐.<br><br>네가 체크인에서 같은 곡을 5번 등록하면 자동으로 진주가 돼.',
    waitFor: 'next',
    dimBackground: false
  },
  {
    id: 'today_you_play',
    targetSelector: '.hero-music-play',
    title: '🌟 오늘의 너',
    body: '이 진주들 중 하나를 고동이가 꺼내서 보여줄 거야.<br><br>한 번 틀어볼까?',
    waitFor: 'click',
    advanceDelay: 600,
    dimBackground: false,
    manualAdvance: true
  },
  {
    id: 'click_insights_chip',
    targetSelector: '[data-cat="insights"]',
    title: '✨ 깨달음 칩',
    body: '<b>✨ 깨달음</b> 칩 눌러봐.',
    waitFor: 'click',
    advanceDelay: 600,
    dimBackground: false,
    manualAdvance: true
  },
  {
    id: 'insights_intro',
    targetSelector: null,
    title: '✨ 네 안에서 떠오른 통찰',
    body: '대화에서 스크랩한 깨달음 / 직접 적은 메모 / 숙고한 결론 — 세 개가 여기에 모여.<br><br>🔮 <b>AI 인사이트 발견</b>: 체크인이 7일 이상 쌓이면 네가 어떤 패턴을 가지고 있는지 고동이가 파악해줘.<br><br>탭해서 한 번 구경해봐.',
    waitFor: 'next',
    dimBackground: false
  },
  {
    id: 'insights_ai_example',
    targetSelector: '.insight-card[data-id="ins_seed_5"]',
    title: '🔮 AI 인사이트 예시',
    body: '이런 걸 고동이가 발견해줘. 신기하지?',
    waitFor: 'next',
    dimBackground: false
  },
  {
    id: 'click_galpi_chip',
    targetSelector: '[data-cat="galpi"]',
    title: '🌀 마법·리뷰 칩',
    body: '<b>🌀 마법·리뷰</b> 칩 눌러봐.',
    waitFor: 'click',
    advanceDelay: 600,
    dimBackground: false,
    manualAdvance: true
  },
  {
    id: 'galpi_sub_intro',
    targetSelector: '[onclick="showArchiveDecisions()"]',
    title: '🌀 마법의 소라고동 + 리뷰',
    body: '마법의 소라고동과 리뷰 모음이 있어.<br><br>마법의 소라고동을 눌러봐.',
    waitFor: 'click',
    advanceDelay: 600,
    dimBackground: false,
    manualAdvance: true
  },
  {
    id: 'magic_room_intro',
    targetSelector: 'button[onclick="startNewDecision()"]',
    title: '🐚 마법의 소라고동',
    body: '큰 결정(도전, 사랑, 진로)을 후회하지 않고 할 수 있게 도와주는 방이야.<br><br>새로운 결정 시작을 눌러봐.',
    waitFor: 'click',
    advanceDelay: 600,
    dimBackground: false,
    manualAdvance: true
  },
  {
    id: 'magic_modal_seeded',
    targetSelector: '.input-modal-btn.ok',
    title: '예시 입력해뒀어',
    body: '\'그에게 용기를 내볼까 vs 말까\' — 예시로 채워뒀어.<br><br>시작 버튼을 눌러봐.',
    waitFor: 'click',
    advanceDelay: 600,
    dimBackground: false,
    manualAdvance: true,
    aboveModal: true
  },
  {
    id: 'magic_step1_start',
    targetSelector: '.step-card.active button.btn-primary.decision',
    title: 'STEP 1 — 시작',
    body: '첫 단계 시작 버튼을 눌러봐.',
    waitFor: 'click',
    advanceDelay: 600,
    dimBackground: false,
    manualAdvance: true
  },
  {
    id: 'magic_step1_filled',
    targetSelector: null,
    title: '지금 상황',
    body: '예시도 채워뒀어.<br><br>🐚 <b>소라고동에게 도움 받기</b> — 이 버튼이 아주 유용해. 나중에 꼭 한 번 눌러봐. 도움 될 거야.<br><br>지금은 넘어가자.',
    waitFor: 'next',
    dimBackground: false,
    coachmarkPosition: 'corner'
  },
  {
    id: 'magic_step1_complete',
    targetSelector: 'button[onclick*="saveTextStep"]',
    title: '완료',
    body: '완료 버튼을 눌러봐.',
    waitFor: 'click',
    advanceDelay: 600,
    dimBackground: false,
    manualAdvance: true
  },
  {
    id: 'magic_unlock_explain',
    targetSelector: null,
    title: '🌙 마법의 시간',
    body: '3일 후, 7일 후, 14일 후 다시 와서 \'다른 각도\'로 생각해볼 수 있어. 그렇게 가장 현명한 결정을 도와주는 거지.<br><br>잠금이 풀리는 날엔 홈화면에 알림이 떠.',
    waitFor: 'next',
    dimBackground: false
  },
  {
    id: 'back_to_galpi_chip_1',
    targetSelector: '.nav-item[data-screen="archive"]',
    title: '📚 도서관으로 돌아가기',
    body: '아래 <b>📚 도서관</b> 탭 한 번 눌러봐.',
    waitFor: 'visit',
    visitScreen: 'archive',
    advanceDelay: 600,
    dimBackground: false,
    manualAdvance: true
  },
  {
    id: 'click_reviews',
    targetSelector: '[onclick="showArchiveReviews()"]',
    title: '🌙 리뷰 모음',
    body: '이번엔 리뷰 모음을 눌러봐.',
    waitFor: 'click',
    advanceDelay: 600,
    dimBackground: false,
    manualAdvance: true
  },
  {
    id: 'annual_stories_show',
    targetSelector: '.annual-stories-card',
    title: '🌟 연간 리뷰',
    body: '한 해를 10 카드 시퀀스로 같이 보자. 카드 눌러봐.',
    waitFor: 'click',
    hideUntilElementHidden: '#annualReviewOverlay',
    dimBackground: false
  },
  {
    id: 'annual_stories_done',
    targetSelector: '.nav-item[data-screen="archive"]',
    title: '📚 도서관으로 돌아오기',
    body: '연간 리뷰 잘 봤지? 아래 <b>📚 도서관</b> 탭 한 번 눌러서 돌아와.',
    waitFor: 'visit',
    visitScreen: 'archive',
    advanceDelay: 600,
    dimBackground: false,
    manualAdvance: true
  },
  {
    id: 'reflection_intro',
    targetSelector: '.nav-item[data-screen="home"]',
    title: '🌊 숙고 질문 — 홈으로 가자',
    body: '큰 질문 하나 안고 같이 깊이 들여다보는 곳이야.<br>아래 🏠 홈 탭 눌러봐.',
    waitFor: 'visit',
    visitScreen: 'home',
    dimBackground: false
  },
  {
    id: 'reflection_when',
    targetSelector: null,
    title: '어떨 때 쓸까',
    body: '<b>마음을 울리는 큰 물음</b>이 떠올랐을 때.<br><br>예시:<br>· "내가 이 일을 진정으로 원하는 게 맞는지"<br>· "지금 이 관계에서 나는 어떤 사람이 되고 있는지"<br>· "정말 두려워하는 건 뭘까"<br><br><span class="small">하나만 안고 며칠/몇 주 살아봐. 결론은 네가 직접 적어.</span>',
    waitFor: 'next',
    dimBackground: false
  },
  {
    id: 'reflection_try',
    targetSelector: '.reflection-card, [onclick*="openReflectionChat"]',
    title: '클릭해보자',
    body: '예시 숙고 질문 하나 미리 넣어뒀어.<br><b>카드 한 번 눌러봐</b> — 그 질문 안에서 같이 깊이 들여다보자.',
    waitFor: 'click',
    advanceDelay: 800,
    manualAdvance: true,
    dimBackground: false
  },
  {
    id: 'reflection_from_chat',
    targetSelector: null,
    title: '🌊 대화에서 스크랩',
    body: '대화 탭에서 <b>소라고동 메시지를 스크랩</b>해서 생각해볼 만한 내용은 <b>숙고 질문으로 보낼 수 있어</b>.<br><br><span class="small">메시지 우상단 <b>⋮</b> → "🌊 숙고 질문으로 보내기"</span>',
    waitFor: 'next',
    dimBackground: false
  },
  {
    id: 'help_button',
    targetSelector: null,
    title: '❓ 다시 보고 싶을 때',
    body: '튜토리얼은 언제든 다시 볼 수 있어.<br><br><b>⚙ 설정</b> 화면에서 "<b>🐚 투어 다시 보기</b>" 항목 누르면 처음부터 다시 시작.<br><br><span class="small">기능 추가될 때마다 업데이트 배너로 알려줄게.</span>',
    waitFor: 'next',
    dimBackground: false
  },
  {
    // V4 (v8 묶음 12) — Core 1 step [3] chapter_close_intro: ✓ 마무리 안내 (endChapter → 묶음 5 archive 핀 영구 자동)
    // V4 (사용자 명시 2026-05-04 ultrathink): "(미리 채워놨어)" 삭제. 4단 분석 안내는 chat 메시지 inject (_startIntakeFromTutorial 안 — 컨펌 후 추가 자리)
    id: 'chapter_close_intro',
    targetSelector: '.chat-end-btn',
    title: '📖 이 대화 마무리',
    body: '입력창 옆 <b>✓</b> 눌러봐.<br>챕터로 묶어 도서관에 정리해줄게 ✨',
    waitFor: 'click',
    advanceDelay: 1500,
    dimBackground: false,
    coachmarkPosition: 'corner'
  },
  {
    // V4 (v8 묶음 12) — Core 1 step [4] core1_finish: 환영 선물 모달은 onbFinish hook 으로 trigger
    // V4 (사용자 명시 2026-05-04 ultrathink): 카피 단순화 — '잘 따라왔어 / 자유롭게 구경해봐'. 나 탭 안내는 별도 모달 (_showProfileIntroModal).
    id: 'core1_finish',
    targetSelector: null,
    title: '🌟 첫 한 바퀴 끝!',
    body: '잘 따라왔어 🐚<br><br>이제 자유롭게 구경해봐! ✨',
    waitFor: 'next',
    nextLabel: '좋아!',
    dimBackground: false
  },
  {
    id: 'finish',
    targetSelector: null,
    title: '준비 끝 ✦',
    body: '한 바퀴 다 돌았어 ✦<br>잘 따라왔어 🐚<br><br><b>고동이랑 함께 인생의 답 같이 찾자</b> ✦<br><br><span style="font-size:17px; font-weight:700; color:var(--accent2);">핵심 1: 체크인 — 매일 한 번</span><br><span style="font-size:17px; font-weight:700; color:var(--accent2);">핵심 2: 대화 — 떠오를 때마다</span><br><br><span class="small">나머지는 부가. 매일 안 해도 OK.</span><br><br><b>무리 X. 너답게 ✦🐚</b>',
    waitFor: 'next',
    nextLabel: '시작! ✦'
  }
];

let _onbStep = 0;
let _onbActiveListeners = [];
let _onbStartTime = null;  // V3.12: 튜토리얼 시작 시간 — 종료 시 데이터 정리

// ═══════════════════════════════════════════════════════════════
// V4 코어 튜토리얼 시스템 (사용자 요청 2026-04-29)
// 풀 튜토리얼 ONBOARDING_STEPS를 코어 7개로 분리. 각 코어는 독립적으로 잠금 해제.
// 핵심 룰:
// - testerMode ON → 잠금 우회 (코어 진행 중 다른 잠금 영역 자유 통과)
// - 시드 prefix `seed_` (CLAUDE.md 시드 안전)
// - 종료(완료/건너뛰기/앱 종료) 시 testerMode backup으로 원복
// ═══════════════════════════════════════════════════════════════
const CORE_TUTORIAL_RANGES = {
  // 사용자 요청 2026-04-29: 코어 #1 endId 'finish' → 'chat_archive_note' ('이전 대화는 어디?' 까지)
  // 사용자 요청 2026-04-30: tutorial_plea step 은 코어 #1 startId 에서 제외 — pre-core 풀 튜토리얼 안내 step 으로 보존.
  // V4 (v8 묶음 12) 2026-05-03: Core 1 = 4 step (welcome / chat_intake_entry / chapter_close_intro / core1_finish). endId 갱신.
  core1: { startId: 'welcome',           endId: 'core1_finish' },
  // V4 (v8 묶음 13) 2026-05-03: Core 2 = 5 step (click_strategy / click_accept / go_home_for_mission / mission_card_intro / shell_obtained). 옛 33 step 폐기.
  core2: { startId: 'click_strategy',    endId: 'shell_obtained' },
  // V4 (v8 묶음 14) 2026-05-03: Core 3-A = 4 step (success_celebrate / click_dna_shell / dna_explanation / core3a_finish)
  core3a: { startId: 'success_celebrate', endId: 'core3a_finish' },
  // V4 (v8 묶음 15 + 19-J) 2026-05-03: Core 3-B = 2 step (mutation_intro / try_evolved_card)
  core3b: { startId: 'mutation_intro',   endId: 'try_evolved_card' },
  // V4 (v8 묶음 19) 2026-05-03: Core 4 = 1 step (crystallize_complete) — 결정화 의식 직후 안내. 옛 core4 (model_intro) 와 키 분리.
  core4_pearl: { startId: 'crystallize_complete', endId: 'crystallize_complete' }
  // V4 (v8 사용자 명시 2026-05-03 ultrathink): 옛 코어 튜토리얼 entries 모두 dead. 호출 시 V8_ACTIVE_STEPS 화이트리스트가 모두 skip → 즉시 onbFinish.
  /* DEAD CODE — 옛 core2_legacy (33 step) / core3 (실행 15 step) / core4 (model_intro 1 step) / core5 (도서관 15 step) / core6 (숙고 3 step) / core8 (마법 6 step):
  core2_legacy: { startId: 'mission_done',      endId: 'dna_pearl_types' },
  core3: { startId: 'exec_overview',     endId: 'exec_immerse_done' },     // 15 step
  core4: { startId: 'model_intro',       endId: 'model_intro' },           // 1 step
  core5: { startId: 'library_categories', endId: 'annual_stories_done' },  // 15 step (skip 포함)
  core6: { startId: 'reflection_when',   endId: 'reflection_from_chat' },  // 3 step
  core8: { startId: 'magic_room_intro',  endId: 'magic_unlock_explain' }   // 6 step
  */
};

// 사용자 요청 2026-04-29: 제목 단순화 — '코어' 빼고 단순 명사로
// V4 (v8 사용자 명시 2026-05-03 ultrathink): 옛 core3 / core4 / core5 / core6 / core8 라벨 = dead.
const CORE_LABELS = {
  core1: '시작',
  core2: '소라의 부름'
  /* DEAD CODE (v8 폐기, legacy reference):
  ,
  core3: '실행',
  core4: '나',
  core5: '도서관',
  core6: '숙고',
  core8: '마법의 소라고동'
  */
};

// 코어 #5에서 제외할 step ID (사용자 명시: today_* 3개 / magic_* 6개 / back_to_galpi)
const CORE_SKIP_IDS = {
  core5: new Set([
    'click_today_diary', 'today_diary_view', 'today_topic_view',
    'magic_room_intro', 'magic_modal_seeded', 'magic_step1_start',
    'magic_step1_filled', 'magic_step1_complete', 'magic_unlock_explain',
    'back_to_galpi_chip_1'
  ]),
  // V4 (v8 묶음 13) 2026-05-03: Core 2 = 5 step (click_strategy → click_accept → go_home_for_mission → mission_card_intro → shell_obtained). 풀 Core 1 흐름 안 사이 step + 옛 Core 2 mission_done 1 개만 skip (다른 옛 step 들은 endIdx='shell_obtained' 이후라 자동 종료).
  core2: new Set([
    // Core 1 풀 흐름 step (click_accept ~ go_home_for_mission 사이)
    'diary_keyword', 'open_plus_menu', 'pick_diary_template', 'diary_walkthrough',
    'chapter_auto', 'chapter_close_btn', 'chat_archive_note',
    // 옛 Core 2 의 mission_done — 신규 mission_card_intro 가 대체
    'mission_done'
  ])
};

// V4 (v8 사용자 명시 2026-05-03 ultrathink): Core 1 화이트리스트 — startIdx (welcome) ~ endIdx (core1_finish) 사이 118 step 중 4 step 만 활성. 나머지 옛 풀 튜토리얼 흐름은 자동 skip (옛 21 step + 옛 Core 2~6 step 이 array 사이에 들어감).
// onbNext / onbRenderStep 가 _activeCoreId === 'core1' 일 때 화이트리스트 외 step 자동 skip.
// V4 (v8 사용자 명시 2026-05-03 ultrathink — v2 §1): intake step ID = 'intake_intro' (신규 step). 옛 chat_intake_entry = dead.
const CORE1_ALLOW_IDS = new Set([
  'welcome',
  'intake_intro',
  'chapter_close_intro',
  'core1_finish'
]);

// V4 (v8 사용자 명시 2026-05-03 ultrathink — "옛 튜토리얼 싹 다 주석"): 전역 활성 step 화이트리스트.
// 풀 튜토리얼 (startInteractiveOnboarding(0)) / 코어 / chooser 진입 모두 = v8 step 만 진행.
// 옛 21 step (tutorial_plea / sync_dot_intro / go_home_for_checkin / go_checkin / pick_mode / pick_vitality / cutoff_intro /
//   submit_checkin / go_chat / chat_intro / chat_opus_intro / send_diary / click_deeper / await_deeper_response /
//   diary_keyword / open_plus_menu / pick_diary_template / diary_walkthrough / chapter_auto / chapter_close_btn /
//   chat_archive_note) + 옛 Phase 5 / 6+ (mission_done / open_beach / tier_tab / click_new_shell / yangsaeng_explain /
//   exec_overview / model_intro / library_categories / annual_stories_show / reflection_intro / magic_room_intro / ...) 모두 자동 skip.
// 옛 step 정의는 array 안 보존 (legacy reference) 단 진입 X.
const V8_ACTIVE_STEPS = new Set([
  // Core 1 — 4 step (v2 명시 — intake_intro 신규, 옛 chat_intake_entry dead)
  'welcome', 'intake_intro', 'chapter_close_intro', 'core1_finish',
  // Core 2 — 5 step
  'click_strategy', 'click_accept', 'go_home_for_mission', 'mission_card_intro', 'shell_obtained',
  // Core 3-A — 4 step
  'success_celebrate', 'click_dna_shell', 'dna_explanation', 'core3a_finish',
  // Core 3-B — 2 step
  'mutation_intro', 'try_evolved_card',
  // Core 4 (core4_pearl) — 1 step
  'crystallize_complete',
  // System (Core 끝 점프 + 풀 튜토리얼 끝)
  'help_button', 'finish'
]);

// 코어별 step 필드 override — { stepId: { coreId: { body?, nextLabel?, ... } } }
// 풀 튜토리얼 그대로 두되, 특정 코어에서만 본문/버튼 라벨 다르게.
// V4 (v8 사용자 명시 2026-05-03 ultrathink): 모든 옛 코어 override = dead. 옛 step (mission_done / yangsaeng_explain / exec_immerse_done / model_intro / galpi_sub_intro / annual_stories_done) 은 V8_ACTIVE_STEPS 외라 진입 X. help_button core1 / core2 만 활성.
const CORE_BODY_OVERRIDE = {
  // V4 (v8): help_button core1 / core2 마무리 카피만 활성. 옛 코어 (3 / 4 / 5 / 6 / 8) override 모두 dead.
  help_button: {
    core1: {
      title: '✦ 시작 — 마무리',
      body: '여기까지 잘 따라왔어 🐚<br>방금 네가 풀어준 얘기, 내가 잘 들었어.<br><br>✨ <b>\'나 탭\'</b>에 가면 너에 대해 자라기 시작한 모습이 보여 —<br><span class="small">· 통합 분석<br>· 네가 중시하는 것<br>· 너의 특성<br>· 보이는 패턴</span><br><br>틀린 거 있으면 ✕, 맞으면 ✓ 으로 정리해줘.<br><br>체크인은 매일 한 번. 대화는 떠오를 때마다.<br>너답게 천천히 가자 ✦',
      nextLabel: '시작! ✦'
    },
    core2: {
      title: '✦ 소라의 부름 — 마무리',
      body: '전략 DNA 가 어떻게 자라고 진화하는지 한 바퀴 봤어 ✦<br><br>이제 진짜 너의 전략이 쌓일 거야 —<br>대화하다 <b>\'✦ 해볼게\'</b> 누르면 카드로 자라.<br><br>부담 없이. 안 해도 ㄱㅊ.<br>너의 속도로 천천히 ✦',
      nextLabel: '시작! ✦'
    }
    /* DEAD CODE (v8 폐기, legacy reference):
    , core3: { title: '✦ 실행 — 마무리', body: '...', nextLabel: '시작! ✦' }
    , core4: { title: '✦ 나 — 마무리', body: '...', nextLabel: '시작! ✦' }
    , core5: { title: '✦ 도서관 — 마무리', body: '...', nextLabel: '시작! ✦' }
    , core6: { title: '✦ 숙고 — 마무리', body: '...', nextLabel: '시작! ✦' }
    , core8: { title: '✦ 마법의 소라고동 — 마무리', body: '...', nextLabel: '시작! ✦' }
    */
  }
  /* DEAD CODE — 옛 코어 step body override (V8_ACTIVE_STEPS 외라 모든 step 진입 X):
  ,
  mission_done: {
    core2: { body: '이 ⭐ 미션 카드가 ...' }
  },
  yangsaeng_explain: {
    core2: { body: '여기 전략 DNA 카드는 ...' }
  },
  exec_immerse_done: {
    core3: { body: '몰입 결과 묻는 창 떴지? ...' }
  },
  model_intro: {
    core4: { body: '여기는 내가 너를 분석한 결과 ...', nextLabel: '확인했어 ✦' }
  },
  galpi_sub_intro: {
    core5: { body: '여기엔 마법의 소라고동과 리뷰 모음 ...', waitFor: 'next', nextLabel: '다음 →', targetSelector: null, manualAdvance: false }
  },
  annual_stories_done: {
    core5: { body: 'Stories 잘 봤지? ...' }
  }
  */
};

// 활성 코어 추적 (onbFinish가 unlock 적용할 수 있게)
let _activeCoreId = null;
let _coreEndIdx = -1;
let _coreBodyOverridesApplied = [];
let _coreNeedsHelpAfterEnd = false;  // 코어 #1 외엔 endId 다 지나서 help_button으로 점프 필요

// V4 (v8 사용자 명시 2026-05-03 ultrathink): 옛 잠금 메커니즘 폐기 — 모든 코어 unlock 으로 처리.
// v8 = "잠금 X / 발견형 학습". Core 2 만 4단 응답 disabled-locked (state._core2NotUnlocked) 으로 별도 처리.
// 함수는 보존 — legacy 호환 (호출자 30+곳).
function isCoreLocked(coreId) {
  return false;  // 옛 잠금 메커니즘 dead — 항상 unlocked
  /* DEAD CODE (v8 폐기, legacy reference):
  if (!coreId) return false;
  if (state && state.preferences && state.preferences.testerMode) return false;
  if (window._onbTutorialMode) return false;
  // 사용자 보고 2026-05-03: 진입 초반의 cloud load 끝 전 = state.unlocked default (모두 false) → 잠금 모달 = 버그.
  // _initialDataLoading flag = cloud load 동안 잠금 우회.
  if (window._initialDataLoading) return false;
  // 사용자 보고 2026-04-30 (Phase C 전수 fix): apiKey 비어도 lock 적용 — 로그인 X 일 때만 우회.
  // 옛 코드는 'apiKey 없음 = 초기 셋업'이었으나 Phase C 후 모든 사용자 apiKey 비어있음.
  if (!state) return false;
  if (typeof session === 'undefined' || !session || !session.access_token) return false;
  if (!state.unlocked) return true;
  return state.unlocked[coreId] !== true;
  */
}

// 코어별 잠금 모달용 메타 (이름 + 길이 힌트)
// V4 (v8 사용자 명시 2026-05-03 ultrathink): showCoreLockModal noop 라 사용 X. 옛 core3-8 모두 dead.
const CORE_LOCK_INFO = {
  core1: { name: '시작',           long: false },
  core2: { name: '소라의 부름',     long: true }   // 사용자 명시: 좀 긺
  /* DEAD CODE (v8 폐기, legacy reference):
  , core3: { name: '실행',           long: false }
  , core4: { name: '나',             long: false }
  , core5: { name: '도서관',         long: true }
  , core6: { name: '숙고',           long: false }
  , core8: { name: '마법의 소라고동', long: false }
  */
};

// V4 (v8 사용자 명시 2026-05-03 ultrathink): 옛 잠금 모달 = 폐기 (noop).
// _coreLockInterceptor 가 dead 라 자동 호출 X. 함수 자체는 보존 (legacy 호환).
// v8 = "잠금 X / 발견형 학습". 사용자가 잠긴 영역 클릭하면 자유롭게 진입. Core 2 entry modal 만 별도.
async function showCoreLockModal(coreId) {
  return;  // 옛 잠금 모달 dead — noop
  /* DEAD CODE (v8 폐기, legacy reference):
  if (!coreId || !CORE_TUTORIAL_RANGES[coreId]) return;
  if (typeof showConfirmModal !== 'function') {
    if (typeof startCoreTutorial === 'function') startCoreTutorial(coreId);
    return;
  }
  const info = CORE_LOCK_INFO[coreId] || { name: '이 기능', long: false };
  const lengthHint = info.long ? '\n(좀 길어 — 5~10분 정도)' : '';
  const yes = await showConfirmModal({
    title: '🔒 잠겨있어',
    message: `'${info.name}' 튜토리얼을 완료해야 사용할 수 있어. 해볼래?${lengthHint}`,
    okLabel: '지금 해볼게 ✦',
    cancelLabel: '나중에'
  });
  if (yes) startCoreTutorial(coreId);
  */
}

// 코어별 진입 화면 — startInteractiveOnboarding의 showScreen('home') 덮어씌움
// V4 (v8 사용자 명시 2026-05-03 ultrathink): 옛 core3 / core4 / core5 / core6 / core8 진입 화면 dead.
const CORE_INITIAL_SCREEN = {
  core1: 'home',
  core2: 'home'     // click_strategy 시작 — 채팅 탭 진입은 startCore2 가 별도 처리. home default 보존.
  /* DEAD CODE (v8 폐기, legacy reference):
  , core3: 'execute',  // exec_overview는 실행 탭
  core4: 'model',    // model_intro는 나 탭
  core5: 'archive',  // library_categories는 도서관 탭
  core6: 'home',     // reflection은 홈에 있음 (사용자 명시: 추가 버튼)
  core8: 'decisions' // magic_room_intro는 마법의 소라고동 화면 — showScreen('decisions') + renderDecisionsList
  */
};

// 코어별 진입 후 추가 액션 — 마법의 소라고동 등 특수 진입 처리
// V4 (v8 사용자 명시 2026-05-03): 옛 core8 액션 dead.
const CORE_INITIAL_ACTION = {
  /* DEAD CODE (v8 폐기, legacy reference):
  core8: () => {
    if (typeof renderDecisionsList === 'function') renderDecisionsList();
  }
  */
};

// 코어 튜토리얼 시작 — startInteractiveOnboarding 인프라 재사용
async function startCoreTutorial(coreId) {
  const range = CORE_TUTORIAL_RANGES[coreId];
  if (!range) { console.warn('[core] unknown id:', coreId); return; }
  const startIdx = ONBOARDING_STEPS.findIndex(s => s.id === range.startId);
  const endIdx = ONBOARDING_STEPS.findIndex(s => s.id === range.endId);
  if (startIdx < 0 || endIdx < 0) { console.warn('[core] step ID missing:', range); return; }

  // step 필드 override 적용 (cleanup에서 원복)
  _coreBodyOverridesApplied = [];
  Object.entries(CORE_BODY_OVERRIDE).forEach(([stepId, perCore]) => {
    const ov = perCore[coreId];
    if (!ov) return;
    const step = ONBOARDING_STEPS.find(s => s.id === stepId);
    if (!step) return;
    const snapshot = {};
    Object.keys(ov).forEach(k => {
      snapshot[k] = step[k];  // 원본 보존 (없는 필드도 undefined로 적용됨)
      step[k] = ov[k];
    });
    _coreBodyOverridesApplied.push({ step, snapshot });
  });

  _activeCoreId = coreId;
  _coreEndIdx = endIdx;
  // 사용자 요청 2026-04-29: 코어 #1 endId 변경됨 (chat_archive_note) → 모든 코어 동일하게 help_button 점프
  // V4 (사용자 명시 2026-05-03 ultrathink): Core 1 = core1_finish 가 마지막 step (옛 help_button override 폐기 — '여기까지 잘 따라왔어' 카피 잔재).
  // 다른 코어는 그대로 help_button 점프 (Core 2 등 마무리 카피 자리).
  _coreNeedsHelpAfterEnd = (coreId !== 'core1');
  // 진입 화면 override (startInteractiveOnboarding이 기본 home으로 가는 거 덮어씌움)
  window._coreInitialScreen = CORE_INITIAL_SCREEN[coreId] || 'home';
  // 진입 후 추가 액션 (예: 마법의 소라고동 — renderDecisionsList)
  window._coreInitialAction = CORE_INITIAL_ACTION[coreId] || null;

  // 인프라 재사용 (testerMode ON + 시드 자동)
  await startInteractiveOnboarding(startIdx);

  // 사용자 요청 2026-04-29: 코어별 시드 후처리 — 그 코어 흐름에 직접 필요한 시드만 유지 (혼란 차단)
  setTimeout(() => { try { _scrubSeedsForCore(coreId); } catch (e) { console.warn('seed scrub:', e); } }, 50);
}

// 코어별 시드 정리 — testSeedV4Data가 적용한 거 중 그 코어 흐름에 안 필요한 거 제거
function _scrubSeedsForCore(coreId) {
  if (!state || !state.preferences || !state.preferences.testerMode) return;
  if (coreId === 'core2') {
    // 코어 #2 (소라의 부름) 흐름 필수: active 부름 + 양생방 결과 체크 대기 미션
    // 다른 양생 dot 시뮬용 / 지난 부름 시뮬용 미션은 혼란만 → 제거
    if (Array.isArray(state.missions)) {
      state.missions = state.missions.filter(m => {
        if (!m || !m.id) return true;
        if (!m.id.startsWith('mis_seed_')) return true;
        return m.id === 'mis_seed_active_call' || m.id === 'mis_seed_strat0_done_unchecked';
      });
      // 사용자 보고 2026-04-30: 양생방 step "결과 체크 버튼" 자리에 '✦ 해볼게' 가 보이던 버그 — mission 의 attemptStatus 가 어디선가 set 되어 _hasUnchecked=false. 코어 #2 진입 시 강제 reset.
      const _resultMission = state.missions.find(m => m && m.id === 'mis_seed_strat0_done_unchecked');
      if (_resultMission) {
        _resultMission.status = 'completed';
        delete _resultMission.attemptStatus;
        delete _resultMission._followupAsked;
      } else {
        // 누락 시 강제 재 추가
        const _todayMs = Date.now();
        state.missions.push({
          id: 'mis_seed_strat0_done_unchecked',
          title: '마감 직전 환경 셋업 1번',
          description: '카페 자리 + 폰 다른 방',
          status: 'completed',
          completedDate: new Date(_todayMs - 86400000).toISOString().split('T')[0],
          completedAt: new Date(_todayMs - 86400000).toISOString(),
          createdAt: new Date(_todayMs - 86400000).toISOString(),
          strategyId: 'strat_seed_0',
          generationIdx: 0
        });
      }
    }
  }
  // 다른 코어 후처리는 추후 보고 받으면 추가
  if (typeof renderTodayMission === 'function') renderTodayMission();
}

// V4 코어 튜토리얼 진행 카운트 — 글로벌 step idx 대신 코어 내부 local 카운트.
// skip step 제외 + 코어 #2~#8은 끝에 help_button 1개 추가.
function _coreStepCount() {
  if (!_activeCoreId) return null;
  const range = CORE_TUTORIAL_RANGES[_activeCoreId];
  if (!range) return null;
  const startIdx = ONBOARDING_STEPS.findIndex(s => s && s.id === range.startId);
  const endIdx = ONBOARDING_STEPS.findIndex(s => s && s.id === range.endId);
  if (startIdx < 0 || endIdx < 0) return null;
  const skipSet = CORE_SKIP_IDS[_activeCoreId] || new Set();
  // V4 (v8 사용자 명시 2026-05-03): Core 1 화이트리스트 — 4 step 만 카운트
  const allowSet = (_activeCoreId === 'core1') ? CORE1_ALLOW_IDS : null;
  let count = 0;
  for (let i = startIdx; i <= endIdx; i++) {
    const id = ONBOARDING_STEPS[i] && ONBOARDING_STEPS[i].id;
    if (skipSet.has(id)) continue;
    if (allowSet && !allowSet.has(id)) continue;
    if (typeof V8_ACTIVE_STEPS !== 'undefined' && !V8_ACTIVE_STEPS.has(id)) continue;  // 전역 dead step 카운트 X
    count++;
  }
  // 모든 코어 끝에 help_button 추가됨
  count++;
  return count;
}
function _coreCurrentStep() {
  if (!_activeCoreId) return null;
  const range = CORE_TUTORIAL_RANGES[_activeCoreId];
  if (!range) return null;
  const startIdx = ONBOARDING_STEPS.findIndex(s => s && s.id === range.startId);
  const endIdx = ONBOARDING_STEPS.findIndex(s => s && s.id === range.endId);
  if (startIdx < 0) return null;
  const skipSet = CORE_SKIP_IDS[_activeCoreId] || new Set();
  // V4 (v8 사용자 명시 2026-05-03): Core 1 화이트리스트
  const allowSet = (_activeCoreId === 'core1') ? CORE1_ALLOW_IDS : null;
  // help_button 점프 후 위치면 마지막 step
  const helpIdx = ONBOARDING_STEPS.findIndex(s => s && s.id === 'help_button');
  if (_onbStep === helpIdx) return _coreStepCount();
  // startIdx ~ _onbStep 사이 skip 제외하고 카운트
  let pos = 0;
  const upto = Math.min(_onbStep, endIdx);
  for (let i = startIdx; i <= upto; i++) {
    const id = ONBOARDING_STEPS[i] && ONBOARDING_STEPS[i].id;
    if (skipSet.has(id)) continue;
    if (allowSet && !allowSet.has(id)) continue;
    if (typeof V8_ACTIVE_STEPS !== 'undefined' && !V8_ACTIVE_STEPS.has(id)) continue;  // 전역 dead step 카운트 X
    pos++;
  }
  return pos;
}

// 코어 종료 시 cleanup (onbFinish에서 호출)
function _cleanupCoreOverrides() {
  (_coreBodyOverridesApplied || []).forEach(({step, snapshot}) => {
    if (!step || !snapshot) return;
    Object.keys(snapshot).forEach(k => {
      if (snapshot[k] === undefined) delete step[k];
      else step[k] = snapshot[k];
    });
  });
  _coreBodyOverridesApplied = [];
  _activeCoreId = null;
  _coreEndIdx = -1;
  _coreNeedsHelpAfterEnd = false;
}

// V4 (사용자 요청 2026-04-29): 설정 → 🐚 투어 다시 보기
// V4 사용자 명시 (V203): chooser 폐기 — 코어 #1 직접 진입 (사용자가 명시 click 한 거라 명확).
function showTutorialReplayMenu() {
  if (typeof startCoreTutorial === 'function') return startCoreTutorial('core1');
  return startInteractiveOnboarding();
}

// V4 (사용자 요청 2026-04-29): 설정 → 🔧 개별 코어 튜토리얼
// 코어 7개 + 풀 한 번에 골라서 진행. 잠금이랑 무관 — replay 도구.
async function showCoreReplayPicker() {
  if (typeof showOptionsModal !== 'function') {
    return startInteractiveOnboarding();
  }
  // 사용자 요청 2026-04-29: 제목 '코어 #N' 제거, 단순 명사 (코어 번호 순서 유지)
  const opts = [
    { label: '🐚 시작',             value: 'core1', desc: '체크인 / 대화 한 바퀴 (필수 핵심)' },
    { label: '⭐ 소라의 부름',      value: 'core2', desc: '미션 / 모래사장 / 양생방 (좀 긺)' },
    { label: '🚀 실행',             value: 'core3', desc: '머릿속 풀기 + 몰입' },
    { label: '✦ 나',                value: 'core4', desc: 'AI가 본 너의 패턴·가치·특성' },
    { label: '📚 도서관',           value: 'core5', desc: '일기 / 진주 / 깨달음 / 리뷰 (좀 긺)' },
    { label: '🌊 숙고',             value: 'core6', desc: '마음을 울리는 큰 물음' },
    { label: '🐚 마법의 소라고동', value: 'core8', desc: '큰 결정 14일 숙성' },
    { label: '✨ 풀 튜토리얼',       value: 'full',  desc: '처음부터 끝까지 (~30분)' }
  ];
  const choice = await showOptionsModal({
    title: '🔧 개별 코어 튜토리얼',
    message: '코어 골라서 다시 보기. 잠금 상태 영향 X.',
    options: opts
  });
  if (!choice) return;
  if (choice === 'full') {
    window._fullTutorialActive = true;
    return startInteractiveOnboarding();
  }
  if (typeof startCoreTutorial === 'function') return startCoreTutorial(choice);
}

// V4 (v8 사용자 명시 2026-05-03 ultrathink): 옛 코어 잠금 시각 표시 = 폐기.
// .core-locked 클래스 부착 X — DOM 깨끗. 옛 잠금 시각 (🔒 ::after) 안 보임.
// 함수는 보존 — render 함수들이 호출 (renderHome 등).
function applyCoreLockMarkers() {
  return;  // 옛 잠금 메커니즘 dead — noop
  /* DEAD CODE (v8 폐기, legacy reference):
  if (typeof document === 'undefined' || !document.querySelectorAll) return;
  // 매핑: 셀렉터 → coreId
  const lockMap = [
    // 탭 nav (3개)
    { sel: '.nav-item[data-screen="execute"]', core: 'core3' },
    { sel: '.nav-item[data-screen="model"]',   core: 'core4' },
    { sel: '.nav-item[data-screen="archive"]', core: 'core5' },
    // 홈 카드들
    { sel: '#missionContainer .mission-card',                         core: 'core2' },
    { sel: '.home-small-card[onclick="openShellCollection()"]',       core: 'core2' },
    // 도서관 안 양생방 chip — core2 prerequisite (사용자 요청 2026-04-29)
    { sel: '.lib-cat-chip[data-cat="yangsaeng"]',                     core: 'core2' },
    // 숙고 질문 — 추가 진입점 + 이미 active 진행 중인 카드도 잠금 (사용자 요청 2026-04-29)
    { sel: '.reflection-empty-card, .reflection-active-card, [onclick="addReflectionQuestion()"]', core: 'core6' },
    // 마법의 소라고동 — 도서관 안 진입점 + 홈 mini 카드 + 결정 화면 새 결정 버튼
    { sel: '[onclick="showArchiveDecisions()"], .decision-mini-card, .magic-card', core: 'core8' }
  ];
  lockMap.forEach(({sel, core}) => {
    const locked = isCoreLocked(core);
    document.querySelectorAll(sel).forEach(el => {
      if (locked) {
        el.classList.add('core-locked');
        el.setAttribute('data-core', core);
      } else {
        // 풀린 거: 클래스 + data 제거 (안전: 다른 data-core 쓰는 element와 충돌 X — 우리 앱엔 그런 예 없음)
        el.classList.remove('core-locked');
        if (el.getAttribute('data-core')) el.removeAttribute('data-core');
      }
    });
  });
  */
}

// 사용자 요청 2026-04-29: 튜토리얼 phase 시각화 — "지금 어디 있나"
// startId 기준으로 phase 묶음 정의. 마지막 phase는 다음 startId 직전까지.
const ONBOARDING_PHASES = [
  { startId: 'tutorial_plea',         name: '시작',                  desc: '한 마디 부탁' },
  { startId: 'go_home_for_checkin',    name: '첫 체크인',             desc: '오늘 너 30초 기록' },
  { startId: 'go_chat',                name: '대화 + 전략',           desc: '소라랑 풀고 무기 만들기' },
  { startId: 'go_home_for_mission',    name: '미션 + 모래사장',       desc: '소라의 부름과 결과 체크' },
  { startId: 'go_archive',             name: '🧬 양생방',             desc: '전략이 자라는 곳 — 핵심' },
  { startId: 'go_execute',             name: '실행 + 나',             desc: '몰입 + 자기 모델' },
  { startId: 'go_archive_lib',         name: '도서관 둘러보기',       desc: '5 카테고리 + 숙고' },
  { startId: 'finish',                 name: '마무리',                desc: '준비 끝!' }
];

// step idx → phase info
function _getPhaseInfo(idx) {
  if (!Array.isArray(ONBOARDING_STEPS) || idx < 0) return null;
  // phase startIdx 인덱스 매핑
  const startIdxs = ONBOARDING_PHASES.map(p => {
    const i = ONBOARDING_STEPS.findIndex(s => s && s.id === p.startId);
    return i;
  });
  // 어떤 phase에 속하는지
  let phaseIdx = 0;
  for (let p = 0; p < ONBOARDING_PHASES.length; p++) {
    if (startIdxs[p] !== -1 && startIdxs[p] <= idx) phaseIdx = p;
  }
  const phase = ONBOARDING_PHASES[phaseIdx];
  const phaseStartIdx = startIdxs[phaseIdx] >= 0 ? startIdxs[phaseIdx] : 0;
  const nextStart = (phaseIdx + 1 < startIdxs.length && startIdxs[phaseIdx + 1] >= 0) ? startIdxs[phaseIdx + 1] : ONBOARDING_STEPS.length;
  const phaseEndIdx = nextStart - 1;
  return { phaseIdx, phase, phaseStartIdx, phaseEndIdx, totalPhases: ONBOARDING_PHASES.length };
}

// V4-fix v3 (사용자 요청): 튜토리얼 coachmark 드래그
// 사용자 요청 2026-04-28: handle 제거, coachmark 전체 드래그 가능 (단 버튼/인터랙티브 element는 제외)
function _initOnbDrag() {
  const coachmark = document.getElementById('onbCoachmark');
  if (!coachmark || coachmark._dragInited) return;
  coachmark._dragInited = true;
  let dragging = false, moved = false, startX = 0, startY = 0, baseLeft = 0, baseTop = 0;
  const isInteractive = (el) => {
    if (!el || el === coachmark) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'button' || tag === 'a' || tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (el.onclick) return true;
    return isInteractive(el.parentElement);
  };
  const onMove = (e) => {
    if (!dragging) return;
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    const dx = cx - startX, dy = cy - startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
    // 사용자 보고 2026-04-29: above-modal 등 CSS !important 룰 이기려면 setProperty 'important'
    coachmark.style.setProperty('left', (baseLeft + dx) + 'px', 'important');
    coachmark.style.setProperty('top', (baseTop + dy) + 'px', 'important');
    coachmark.style.setProperty('right', 'auto', 'important');
    coachmark.style.setProperty('bottom', 'auto', 'important');
    coachmark.style.setProperty('transform', 'none', 'important');
    if (e.cancelable) e.preventDefault();
  };
  const onEnd = () => {
    if (!dragging) return;
    dragging = false;
    coachmark.classList.remove('dragging');
    // 사용자 보고 2026-04-29: 드래그 끝나도 위치 유지 (.dragging 클래스 제거 후 CSS !important 안 돌아오게 inline !important 유지)
    // moved=false (그냥 클릭) 면 inline 스타일 제거해 원래 위치 복귀
    if (!moved) {
      ['left', 'top', 'right', 'bottom', 'transform'].forEach(p => coachmark.style.removeProperty(p));
    }
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchend', onEnd);
  };
  const onStart = (e) => {
    // 버튼/입력 element 클릭은 드래그 X (정상 클릭으로)
    if (isInteractive(e.target)) return;
    dragging = true;
    moved = false;
    // V4 fix (사용자 보고 2026-05-04): above-modal 등에서 .dragging class 추가 시 CSS rule (top/left:auto !important) 가 즉시 발동해
    // getBoundingClientRect 가 강제 reflow 하면 코칭마크가 화면 좌상단으로 점프해 baseLeft/Top 잘못 캡처되던 버그.
    // fix: rect 캡처 → inline !important 적용 → .dragging class 추가 (이 순서로).
    const rect = coachmark.getBoundingClientRect();
    baseLeft = rect.left;
    baseTop = rect.top;
    coachmark.style.setProperty('left', baseLeft + 'px', 'important');
    coachmark.style.setProperty('top', baseTop + 'px', 'important');
    coachmark.style.setProperty('right', 'auto', 'important');
    coachmark.style.setProperty('bottom', 'auto', 'important');
    coachmark.style.setProperty('transform', 'none', 'important');
    coachmark.classList.add('dragging');
    startX = e.touches ? e.touches[0].clientX : e.clientX;
    startY = e.touches ? e.touches[0].clientY : e.clientY;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);
    // touch는 preventDefault — 스크롤 가로채기 방지. 마우스는 ok.
    if (e.touches && e.cancelable) e.preventDefault();
  };
  coachmark.addEventListener('mousedown', onStart);
  coachmark.addEventListener('touchstart', onStart, { passive: false });
}

async function startInteractiveOnboarding(startStep) {
  // 사용자 요청 2026-04-28: startStep 인자로 특정 step부터 시작 가능 (튜토리얼 디버그 편의)
  _onbStep = (typeof startStep === 'number' && startStep >= 0 && startStep < ONBOARDING_STEPS.length) ? startStep : 0;
  _onbStartTime = Date.now();
  // V4-fix v3: 이전 튜토리얼의 _prefillApplied flag 초기화 (재실행 시 prefill 다시 적용되도록)
  if (Array.isArray(ONBOARDING_STEPS)) {
    ONBOARDING_STEPS.forEach(s => { delete s._prefillApplied; });
  }
  window._onbTutorialMode = true;  // V3.13: 다른 함수가 튜토리얼 모드 알도록
  // V3.13.x: state.modes / periodStart 백업 (튜토리얼에서 변경된 모드 onbFinish 시 복원용)
  window._onbModesBackup = JSON.parse(JSON.stringify(state.modes || {}));
  window._onbPeriodStartBackup = state.periodStart || null;
  // V3.13.x: caseFormulation도 백업 — 튜토리얼 대화로 update됐을 가능성 (timestamp 없어 timestamp 정리 X)
  window._onbCFBackup = JSON.parse(JSON.stringify(state.caseFormulation || { version: 0, problems: [], mechanisms: [], strengths: [] }));
  // V4-fix v3 (사용자 요청): 튜토리얼 시작 시 testerMode ON + 시드 데이터 자동 적용하기
  // 사용자 보고 2026-04-28: toggleTesterMode가 async인데 await 안 해서 testerMode 플래그 set 전에 시드 체크 → 시드 안 적용됨. await로 순서 보장
  window._onbAutoTesterMode = false;
  if (state.preferences && !state.preferences.testerMode) {
    if (typeof toggleTesterMode === 'function') {
      try {
        await toggleTesterMode();  // ON: 백업 + flag set 완료 보장
        window._onbAutoTesterMode = true;
      } catch (e) { console.warn('tutorial testerMode ON:', e); }
    }
  }
  // testerMode ON 확인 후 시드 넣음 (await로 순서 보장)
  if (state.preferences && state.preferences.testerMode && typeof testSeedV4Data === 'function') {
    try { await testSeedV4Data(); } catch (e) { console.warn('tutorial seed:', e); }
  }
  // 사용자 보고 2026-04-30 ultrathink: 코어 튜토리얼 시작 시 '소라의 부름' 카드 home 에 떠있도록 보장 (시드 race / sweep 잔여 fallback).
  // status 'pending' (createMission 표준 / getTodayMissions 필터). 옛 'active' 였던 거 → 'pending' 으로 정정.
  if (state.preferences && state.preferences.testerMode && Array.isArray(state.missions)) {
    const _t = Date.now();
    const _todayStr = new Date(_t).toISOString().split('T')[0];
    const _activeM = state.missions.find(m => m && m.id === 'mis_seed_active_call');
    if (_activeM) {
      if (_activeM.status !== 'pending') _activeM.status = 'pending';
      if (!_activeM.scheduledFor) _activeM.scheduledFor = _todayStr;
    } else {
      state.missions.unshift({
        id: 'mis_seed_active_call',
        title: '엄마 통화 시작 전 3초 호흡',
        description: '"나도 알아!" 나오기 전에 한 호흡 끼우기',
        status: 'pending',
        scheduledFor: _todayStr,
        createdAt: new Date(_t - 3600000).toISOString()
      });
    }
  }
  const tourOv = document.getElementById('tourOverlay');
  if (tourOv) tourOv.style.display = 'none';
  // V4 코어 튜토리얼 — 진입 화면 override + 진입 후 추가 액션
  showScreen(window._coreInitialScreen || 'home');
  if (typeof window._coreInitialAction === 'function') {
    try { window._coreInitialAction(); } catch (e) { console.warn('core initial action:', e); }
    window._coreInitialAction = null;
  }
  setTimeout(() => {
    const ov = document.getElementById('onbOverlay');
    if (ov) {
      ov.style.display = 'block';
      ov.classList.add('active');
    }
    if (typeof _initOnbDrag === 'function') _initOnbDrag();
    onbRenderStep();
  }, 200);
}

function onbCleanupListeners() {
  _onbActiveListeners.forEach(({el, type, fn, opts}) => {
    if (el) el.removeEventListener(type, fn, opts || false);
  });
  _onbActiveListeners = [];
}

// 사용자 요청 2026-04-29: 흐리게 토글 기능 제거

// 사용자 보고 2026-04-28: capture 옵션 추가 — modal 안 element가 stopPropagation 해도 catch (예: showOptionsModal '.input-modal' onclick="event.stopPropagation()")
function onbAddListener(el, type, fn, useCapture) {
  if (!el) return;
  const opts = useCapture ? true : false;
  el.addEventListener(type, fn, opts);
  _onbActiveListeners.push({el, type, fn, opts});
}
// onbCleanupListeners도 capture 옵션 같이 사용해서 remove (이전 코드는 default false 였으니 capture listener 정리 안 됐음)

function onbRenderStep() {
  const step = ONBOARDING_STEPS[_onbStep];
  if (!step) { onbFinish(); return; }

  onbCleanupListeners();
  // V3.13.x: 새 step 진입 시 자동 스크롤 flag 리셋
  window._onbScrolledStep = null;
  window._onbStepAtPositionCall = null;

  // V4 (v8 묶음 14): step.onShow hook — Core 3-A dna_explanation body 동적 주입 / Core 4 crystallize_complete title 등
  if (typeof step.onShow === 'function') {
    try { step.onShow(step); } catch (e) { console.warn('[onbRenderStep onShow]:', e); }
  }

  // 사용자 명시 2026-04-30 ultrathink: chat_opus_intro step 진입 시 useOpus 자동 활성화 + flag 적용하기 (onbFinish 에서 자동 복원).
  if (step.id === 'chat_opus_intro') {
    state.preferences = state.preferences || {};
    if (!state.preferences.useOpus) {
      state.preferences.useOpus = true;
      state.preferences._opusActivatedByTutorial = true;
      if (typeof updateChatModeBtn === 'function') updateChatModeBtn();
    }
  }
  // 사용자 보고 2026-05-01: 캘린더 step 진입 시 자동으로 해당 월로 슬라이드 (4/15 시드 = 옛 달 → 자동 -N offset).
  if (typeof _calMonthOffset !== 'undefined' && typeof renderLensCalendarGrid === 'function') {
    if (step.calNavToDate) {
      const target = new Date(step.calNavToDate + 'T12:00:00');
      const today = new Date();
      const offset = (target.getFullYear() - today.getFullYear()) * 12 + (target.getMonth() - today.getMonth());
      if (_calMonthOffset !== offset) {
        _calMonthOffset = offset;
        try { renderLensCalendarGrid(); } catch {}
      }
    } else if (step.calNavToToday) {
      if (_calMonthOffset !== 0) {
        _calMonthOffset = 0;
        try { renderLensCalendarGrid(); } catch {}
      }
    }
  }
  
  // 1. 이미 그 화면이면 즉시 advance (V3.13.x: 막힘 방지)
  if (step.visitScreen) {
    const currentActive = document.querySelector('.screen.active');
    if (currentActive && currentActive.id === 'screen-' + step.visitScreen) {
      // 사용자 요청 2026-04-29: 딜레이 제거
      setTimeout(() => onbNext(), 0);
      return;
    }
    // 사용자가 직접 누르길 기다림 — 자동 전환 X (학습 의도 + showScreen 훅에서 advance)
  }

  // 2. requestAnimationFrame으로 DOM 안정 후 즉시 위치 잡기 (250ms → ~16ms)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      onbPositionStep(step);
    });
  });
}

function onbPositionStep(step, retryCount) {
  const stepNum = document.getElementById('onbStepNum');
  const titleEl = document.getElementById('onbTitle');
  const bodyEl = document.getElementById('onbBody');
  const nextBtn = document.getElementById('onbNextBtn');
  const backBtn = document.getElementById('onbBackBtn');
  const spotlight = document.getElementById('onbSpotlight');
  const coachmark = document.getElementById('onbCoachmark');
  const mask = document.getElementById('onbMask');
  if (!stepNum || !titleEl || !bodyEl || !nextBtn || !spotlight || !coachmark || !mask) return;
  // 뒤로 버튼 — step 0 또는 활성 코어의 startStep 에선 숨김 (사용자 보고 2026-05-01: 옛 코어 이전으로 넘어가던 버그 fix)
  if (backBtn) {
    let coreStartIdx = -1;
    if (_activeCoreId && typeof CORE_TUTORIAL_RANGES !== 'undefined' && CORE_TUTORIAL_RANGES[_activeCoreId]) {
      coreStartIdx = ONBOARDING_STEPS.findIndex(s => s && s.id === CORE_TUTORIAL_RANGES[_activeCoreId].startId);
    }
    backBtn.hidden = (_onbStep === 0) || (coreStartIdx >= 0 && _onbStep <= coreStartIdx);
  }
  // 모달 위로 떠야 하는 step (예: diary_walkthrough / attempt_result_demo)
  // 부모 .onb-overlay 의 stacking context가 자식의 z-index를 가두므로 부모도 같이 올림 (crystallize 10000 위로)
  coachmark.classList.toggle('above-modal', !!step.aboveModal);
  spotlight.classList.toggle('above-modal', !!step.aboveModal);
  // V4 fix (사용자 보고 2026-05-04): day-modal step에서 above-modal 코칭마크가 day-modal-tabs (토픽 칩 등)
  // 가리던 버그. aboveModalBottom 옵션으로 코칭마크를 화면 하단 (bottom-nav 위)로 이동.
  coachmark.classList.toggle('above-modal-bottom', !!step.aboveModalBottom);
  const ovEl = document.getElementById('onbOverlay');
  if (ovEl) ovEl.style.zIndex = step.aboveModal ? '10500' : '9000';

  // 사용자 요청 2026-04-29: phase 시각화 — step number + phase 라벨 + 시뮬 배지 + phase 진행 바
  // V4 코어 튜토리얼이면 글로벌 idx 대신 코어 로컬 카운트 (사용자 요청 2026-04-29)
  const _coreTotal = (typeof _coreStepCount === 'function') ? _coreStepCount() : null;
  const _coreCur   = (typeof _coreCurrentStep === 'function') ? _coreCurrentStep() : null;
  const stepNumText = document.getElementById('onbStepNumText');
  if (stepNumText) {
    if (_coreTotal && _coreCur) stepNumText.textContent = `${_coreCur} / ${_coreTotal}`;
    else stepNumText.textContent = `${_onbStep + 1} / ${ONBOARDING_STEPS.length}`;
  } else {
    if (_coreTotal && _coreCur) stepNum.textContent = `${_coreCur} / ${_coreTotal}`;
    else stepNum.textContent = `${_onbStep + 1} / ${ONBOARDING_STEPS.length}`;
  }
  const phaseInfo = (typeof _getPhaseInfo === 'function') ? _getPhaseInfo(_onbStep) : null;
  const phaseLabel = document.getElementById('onbPhaseLabel');
  if (phaseLabel) {
    // 코어 튜토리얼이면 단순 명사 라벨, 아니면 phase 라벨
    if (_activeCoreId && CORE_LABELS[_activeCoreId]) {
      phaseLabel.textContent = CORE_LABELS[_activeCoreId] + ' 튜토리얼';
    } else {
      phaseLabel.textContent = phaseInfo ? phaseInfo.phase.name : '';
    }
  }
  const simBadge = document.getElementById('onbSimBadge');
  if (simBadge) {
    const isSim = !!(step.demoAttemptResult || step.demoCrystallize || step.demoDnaPearlTypes);
    simBadge.style.display = isSim ? '' : 'none';
  }
  const phaseBar = document.getElementById('onbPhaseBar');
  if (phaseBar) {
    if (_activeCoreId && _coreTotal && _coreCur) {
      // 코어 튜토리얼: 코어 step별 dot
      const dots = [];
      for (let i = 1; i <= _coreTotal; i++) {
        const cls = i < _coreCur ? 'done' : (i === _coreCur ? 'current' : '');
        dots.push(`<span class="onb-phase-dot ${cls}"></span>`);
      }
      phaseBar.innerHTML = dots.join('');
    } else if (phaseInfo) {
      // 풀 튜토리얼: 9 phase dot
      phaseBar.innerHTML = ONBOARDING_PHASES.map((p, i) => {
        const cls = i < phaseInfo.phaseIdx ? 'done' : (i === phaseInfo.phaseIdx ? 'current' : '');
        return `<span class="onb-phase-dot ${cls}" title="${escapeHtml(p.name)}"></span>`;
      }).join('');
    }
  }
  // 사용자 보고 2026-04-28: 너무 버벅거림 — swap fade 140ms→60ms 단축 + same-target 추가 skip
  const sameTitle = (titleEl.textContent === step.title);
  const sameBody = (bodyEl.innerHTML === step.body);
  if (sameTitle && sameBody) {
    // content 동일 — fade 완전 skip
  } else {
    // fade 짧게 (60ms) — 너무 답답하지 않게
    coachmark.classList.add('swapping');
    setTimeout(() => {
      titleEl.textContent = step.title;
      bodyEl.innerHTML = step.body;
      requestAnimationFrame(() => coachmark.classList.remove('swapping'));
    }, 60);
  }
  nextBtn.textContent = step.nextLabel || (_onbStep === ONBOARDING_STEPS.length - 1 ? '끝!' : '다음 →');
  // V4 (v8 묶음 12): hideNextButton 옵션 — chat_intake_entry 강제 모드 등 [다음] 버튼 hide
  if (step.hideNextButton) {
    nextBtn.style.display = 'none';
  } else {
    nextBtn.style.display = '';
  }

  // V3.13.x: dimBackground:false 옵션 — spotlight + 어두운 mask 끄기 (AI 응답 보면서 진행)
  if (step.dimBackground === false) {
    spotlight.style.display = 'none';
    mask.classList.remove('show-full');
    const ovDim = document.getElementById('onbOverlay');
    if (ovDim) ovDim.style.pointerEvents = 'none';
  }
  // 사용자 보고 2026-04-29: keepCoachmarkPosition — 이전 스탭과 같은 위치 유지 (움찔 방지)
  if (step.keepCoachmarkPosition) {
    coachmark.style.visibility = 'visible';
    coachmark.style.opacity = '1';
    coachmark.style.display = '';
    const ovKeep = document.getElementById('onbOverlay');
    if (ovKeep && !step.aboveModal) ovKeep.style.zIndex = '9500';
    // 위치 inline style 안 건드림 — 이전 스탭 그대로
  }
  // V3.13.x: coachmarkPosition:'corner' — coachmark만 우상단 컴팩트
  // 사용자 명시 2026-04-30 ultrathink: step.coachmarkTop 으로 살짝 아래 override 가능 (헤더 토글 가리는 step 한정)
  else if (step.coachmarkPosition === 'corner' || step.dimBackground === false) {
    const cs = coachmark.style;
    cs.top = step.coachmarkTop || '20px'; cs.right = '12px'; cs.left = 'auto';
    cs.transform = 'none'; cs.maxWidth = '260px'; cs.bottom = 'auto';
    cs.visibility = 'visible'; cs.opacity = '1'; cs.display = '';
    const ovEl0 = document.getElementById('onbOverlay');
    if (ovEl0 && !step.aboveModal) ovEl0.style.zIndex = '9500';
  } else {
    coachmark.style.maxWidth = '';
    coachmark.style.right = 'auto';
  }

  // 타깃 위치 잡기
  let target = null;
  if (step.targetSelector) {
    target = document.querySelector(step.targetSelector);
    // V3.13.x: target이 hidden(다른 화면)이면 invisible로 취급
    if (target && target.offsetParent === null) {
      target = null;
    }
    // V3.13.x + 2026-04-28: target 없으면 polling (dimBackground 무관). coachmark 임시 위치.
    if (!target) {
      spotlight.style.display = 'none';
      // dimBackground:false면 mask도 안 띄움 (배경 클릭 가능)
      if (step.dimBackground !== false) {
        mask.classList.add('show-full');
        const ov0 = document.getElementById('onbOverlay');
        if (ov0) ov0.style.pointerEvents = 'auto';
      }
      // coachmark 임시 위치 — corner 아니면 중앙 (keepCoachmarkPosition은 그대로 유지)
      if (step.coachmarkPosition !== 'corner' && step.dimBackground !== false && !step.keepCoachmarkPosition) {
        coachmark.style.top = '50%';
        coachmark.style.left = '50%';
        coachmark.style.transform = 'translate(-50%, -50%)';
        coachmark.style.bottom = 'auto';
      }

      // 사용자 보고 2026-04-28: polling 빨리 — 200ms → 첫 retry 50ms (DOM 거의 즉시), 그 후 점진적 backoff
      const tries = retryCount || 0;
      if (tries < 30) {
        window._onbStepAtPositionCall = _onbStep;
        // 첫 retry 50ms, 이후 100ms, 그 후 200ms (총 ~5.5초 within 30회)
        const interval = tries < 1 ? 50 : tries < 5 ? 100 : 200;
        setTimeout(() => {
          if (_onbStep === window._onbStepAtPositionCall && window._onbTutorialMode) {
            onbPositionStep(step, tries + 1);
          }
        }, interval);
        return;
      }
    }
  }
  // V3.13.x + 사용자 보고 2026-04-28: 자동 스크롤 — dimBackground 무관 (target 무조건 view 안으로)
  // bottom-nav (76px+) 가림 방지 — 하단 버퍼 130px
  // 2026-04-28 후속: 가로 스크롤 컨테이너 (예: 도서관 카테고리 칩) 안에서도 inline:'center'로 맞춤
  if (target) {
    const r0 = target.getBoundingClientRect();
    const vhCheck = window.innerHeight;
    const cs = window.getComputedStyle(target);
    const isFixed = cs.position === 'fixed' || cs.position === 'sticky';
    const outOfView = r0.bottom < 60 || r0.top > vhCheck - 130 || r0.bottom > vhCheck - 90;
    // 가로 overflow 부모 체크 — 칩이 부모 보이는 영역 밖이면 outOfViewH
    let outOfViewH = false;
    let p = target.parentElement;
    while (p && p !== document.body) {
      const pcs = window.getComputedStyle(p);
      if (pcs.overflowX === 'auto' || pcs.overflowX === 'scroll') {
        const pr = p.getBoundingClientRect();
        if (r0.right < pr.left + 20 || r0.left > pr.right - 20) outOfViewH = true;
        break;
      }
      p = p.parentElement;
    }
    if ((outOfView || outOfViewH) && !isFixed && window._onbScrolledStep !== _onbStep) {
      window._onbScrolledStep = _onbStep;
      if (step.dimBackground !== false) {
        spotlight.style.display = 'none';
        mask.classList.add('show-full');
      }
      target.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
      // 스크롤 안정화 후 즉시 재배치 (100ms → rAF로 단축)
      requestAnimationFrame(() => requestAnimationFrame(() => onbPositionStep(step, retryCount)));
      return;
    }
  }

  // V3.13.x: spotlight + coachmark 위치 잡기
  // 2026-04-27: dimBackground:false도 박스 윤곽 (no-dim) 표시 — target 어디 있는지 보이게
  if (step.dimBackground !== false || target) {
    if (target) {
      const rect = target.getBoundingClientRect();
      const padding = 8;
      spotlight.style.display = 'block';
      spotlight.style.left = (rect.left - padding) + 'px';
      spotlight.style.top = (rect.top - padding) + 'px';
      spotlight.style.width = (rect.width + padding * 2) + 'px';
      spotlight.style.height = (rect.height + padding * 2) + 'px';
      // 사용자 요청 2026-04-28: 레이아웃 settle 후 재포지션 (폰트/이미지 로드 / 키보드 닫힘 등 layout shift 보정)
      requestAnimationFrame(() => {
        const rect2 = target.getBoundingClientRect();
        if (Math.abs(rect2.top - rect.top) > 1 || Math.abs(rect2.left - rect.left) > 1) {
          spotlight.style.left = (rect2.left - padding) + 'px';
          spotlight.style.top = (rect2.top - padding) + 'px';
          spotlight.style.width = (rect2.width + padding * 2) + 'px';
          spotlight.style.height = (rect2.height + padding * 2) + 'px';
        }
      });
      setTimeout(() => {
        const rect3 = target.getBoundingClientRect();
        if (Math.abs(rect3.top - rect.top) > 1 || Math.abs(rect3.left - rect.left) > 1) {
          spotlight.style.left = (rect3.left - padding) + 'px';
          spotlight.style.top = (rect3.top - padding) + 'px';
          spotlight.style.width = (rect3.width + padding * 2) + 'px';
          spotlight.style.height = (rect3.height + padding * 2) + 'px';
        }
      }, 350);
      // dimBackground:false 면 박스만 (어둡지 X), 아니면 기존 box-shadow 다이밍
      spotlight.classList.toggle('no-dim', step.dimBackground === false);
      // V3.12.x: target 있을 때 mask 숨김 + overlay 클릭 패스스루 (inline 강제)
      mask.classList.remove('show-full');
      const ov = document.getElementById('onbOverlay');
      if (ov) ov.style.pointerEvents = 'none';

      // coachmark 위치 — corner면 위에서 set한 우상단 그대로
      if (step.coachmarkPosition !== 'corner') {
        const vh = window.innerHeight;
        const spaceAbove = rect.top;
        const spaceBelow = vh - rect.bottom;
        const cmHeight = 220; // 대략
        let cmTop;
        if (step.fallbackPosition === 'top' || spaceAbove >= cmHeight && spaceAbove >= spaceBelow) {
          cmTop = Math.max(16, rect.top - cmHeight - 16);
        } else if (step.fallbackPosition === 'bottom' || spaceBelow >= cmHeight) {
          cmTop = Math.min(vh - cmHeight - 16, rect.bottom + 16);
        } else {
          cmTop = (vh - cmHeight) / 2;
        }
        // V3.13.x: nav-item targeting 시 카드를 아이콘에서 더 띄움 (시각적 호흡)
        if (step.targetSelector && step.targetSelector.indexOf('.nav-item') !== -1) {
          cmTop = Math.max(16, cmTop - 30);
        }
        coachmark.style.top = cmTop + 'px';
        coachmark.style.left = '50%';
        coachmark.style.transform = 'translateX(-50%)';
        coachmark.style.bottom = 'auto';
      }
    } else {
      // 타깃 없음 — 화면 중앙. mask 표시해서 클릭 차단 (welcome/finish 화면).
      spotlight.style.display = 'none';
      mask.classList.add('show-full');
      const ov = document.getElementById('onbOverlay');
      if (ov) ov.style.pointerEvents = 'auto';
      if (step.coachmarkPosition !== 'corner') {
        coachmark.style.top = '50%';
        coachmark.style.left = '50%';
        coachmark.style.transform = 'translate(-50%, -50%)';
        coachmark.style.bottom = 'auto';
      }
    }
  }

  // V4-fix v3 (사용자 요청): 튜토리얼 step에서 데모 모달 띄움
  if (step.demoCrystallize) {
    setTimeout(() => {
      if (typeof showCrystallizeRitualModal === 'function') {
        try {
          // 사용자 요청 2026-04-28: 튜토리얼은 진화한 길 path (방금 돌연변이로 진화 경험 후) + shellsUsed 예시
          const fakeCard = {
            title: '환경 차원 - 폰 거리두기',
            id: 'demo_strat',
            generations: [
              { gen: 1, layer: 'L2', attempts: [{ status: 'didnt' }, { status: 'didnt' }], shells: [], status: 'mutated' },
              { gen: 2, layer: 'L3', attempts: [{ status: 'worked' }, { status: 'worked' }, { status: 'worked' }, { status: 'worked' }, { status: 'worked' }], shells: [], status: 'embodied' }
            ]
          };
          const fakePearl = {
            id: 'demo_dna_pearl',
            embodimentPath: 'evolved',
            shellsUsed: [],
            totalAttempts: 7,
            totalGens: 2,
            workedCount: 5
          };
          showCrystallizeRitualModal(fakeCard, fakePearl);
        } catch (e) { console.warn('demoCrystallize:', e); }
      }
    }, 500);
  }
  // 사용자 요청 2026-04-28: DNA 진주 3종 슬라이더 모달 (튜토리얼 dna_pearl_types step)
  if (step.demoDnaPearlTypes) {
    setTimeout(() => {
      if (typeof showDnaPearlTypesModal === 'function') {
        try { showDnaPearlTypesModal(); } catch (e) { console.warn('demoDnaPearlTypes:', e); }
      }
    }, 500);
  }
  // 사용자 요청 2026-04-28: 튜토리얼 step에서 mutation chat input prefill
  if (step.prefillMutation) {
    const tryFill = (attempts) => {
      const el = document.getElementById('mutationChatInput');
      if (el) {
        if (!el.value) {
          el.value = step.prefillMutation;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.style.height = 'auto';
          el.style.height = Math.min(100, el.scrollHeight) + 'px';
          try { el.focus(); } catch (e) {}
        }
        return;
      }
      if (attempts > 0) setTimeout(() => tryFill(attempts - 1), 200);
    };
    setTimeout(() => tryFill(15), 100);
  }
  // 결과 체크 모달 데모 (튜토리얼 attempt_result_demo step)
  // 사용자 요청 2026-04-28: 모달 제목 = 방금 해낸 소라의 부름 (가장 최근 completed mission). worked → 실제 recordStrategyAttempt (DNA 매핑)
  if (step.demoAttemptResult) {
    setTimeout(async () => {
      if (typeof showAttemptResultModal !== 'function') return;
      try {
        // 방금 해낸 소라의 부름 = 가장 최근 completed mission (completedAt 내림차순)
        const recentCompleted = (state.missions || [])
          .filter(m => m.status === 'completed')
          .sort((a, b) => new Date(b.completedAt || b.completedDate || 0) - new Date(a.completedAt || a.completedDate || 0))[0];
        // fallback: pending strategy mission
        const fallback = !recentCompleted
          ? (state.missions || [])
              .filter(m => m.strategyId)
              .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0]
          : null;
        const targetMission = recentCompleted || fallback;
        const modalTitle = targetMission?.title || '마감 직전 폭발력 신뢰';
        // V4 (v8 묶음 1): 객체 시그너처 — situation/missionTitle 전달
        const status = await showAttemptResultModal({
          strategyName: modalTitle,
          situation: targetMission?.situation || '',
          missionTitle: targetMission?.title || ''
        });
        if (status && window._onbTutorialMode && _onbStep === stepIdxAtRender) {
          // 사용자 보고 2026-04-29: mission.attemptStatus 설정 누락 — 튜토리얼 후 양생방 카드에 '결과 체크' 버튼 잔존하던 버그
          if (targetMission) {
            targetMission.attemptStatus = status;
            if (!targetMission.completedAt) targetMission.completedAt = new Date().toISOString();
            if (!targetMission.completedDate) targetMission.completedDate = todayKey();
          }
          // worked → recordStrategyAttempt (strategyId 있을 때만; shell DNA 매핑 자동)
          if (status === 'worked' && targetMission?.strategyId && typeof recordStrategyAttempt === 'function') {
            try { recordStrategyAttempt(targetMission.strategyId, 'worked', targetMission.id); } catch (e) { console.warn('recordStrategyAttempt:', e); }
          }
          // DNA 적용되는 효과
          if (status === 'worked' && typeof playDnaInsertionEffect === 'function') {
            try { playDnaInsertionEffect(); } catch (e) {}
          }
          setTimeout(() => onbNext(), 0);
        }
      } catch (e) { console.warn('demoAttemptResult:', e); }
    }, 500);
  }
  // V3.13 + V4-fix v3 + 2026-04-27 prefill: input에 예시 값 자동 주입 (retry + RAF + 즉시 시도)
  if (step.prefill && !step._prefillApplied) {
    const applyPrefill = () => {
      const el = document.querySelector(step.prefill.selector);
      if (!el) return false;
      if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return false;
      // 화면이 hidden이거나 display:none이면 다음 retry까지 대기
      if (el.offsetParent === null && el.tagName !== 'BODY') return false;
      if (el.value && !step.prefill.force) {
        step._prefillApplied = true;
        return true;
      }
      el.value = step.prefill.value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (el.tagName === 'TEXTAREA') {
        el.style.height = 'auto';
        el.style.height = Math.min(140, el.scrollHeight) + 'px';
      }
      try { el.focus(); } catch (e) {}
      step._prefillApplied = true;
      return true;
    };
    // 즉시 + RAF + retry 모두 시도 (화면 전환 race 방지)
    requestAnimationFrame(() => {
      if (step._prefillApplied) return;
      if (applyPrefill()) return;
      const tryPrefill = (attempts) => {
        if (step._prefillApplied) return;
        if (applyPrefill()) return;
        if (attempts > 0) setTimeout(() => tryPrefill(attempts - 1), 150);
      };
      setTimeout(() => tryPrefill(20), 80);  // 최대 80 + 20*150 = 3.08s
    });
  }

  // 행동 대기 처리. V3.13.x: 모든 setTimeout에 step 가드 (double advance 방지).
  const stepIdxAtRender = _onbStep;
  const safeAdvance = (delay) => setTimeout(() => {
    if (window._onbTutorialMode && _onbStep === stepIdxAtRender) onbNext();
  }, delay);
  if (step.waitFor === 'visit' && step.visitScreen) {
    if (target) {
      // 사용자 요청 2026-04-29: 튜토리얼 advance 딜레이 제거 — 클릭 즉시 다음 step
      const handler = (e) => { safeAdvance(0); };
      onbAddListener(target, 'click', handler);
    }
    // 사용자 요청 2026-04-28: 모든 비-'next' step에 '눌렀어' 비상 버튼 노출
    nextBtn.style.display = '';
    nextBtn.textContent = step.nextLabel || '눌렀어 →';
  } else if (step.waitFor === 'click') {
    // 사용자 요청 2026-04-28: advanceClickSelector — spotlight는 다른 element 가리키되 click trigger는 별도 element (예: DNA icon 강조 + 닫기 버튼 클릭으로 advance)
    let advanceTarget = target;
    if (step.advanceClickSelector) {
      const at = document.querySelector(step.advanceClickSelector);
      if (at) advanceTarget = at;
    }
    // 사용자 보고 2026-04-28: '더 알고 싶어' 버튼 등 — step 렌더 시점에 element가 DOM에 없으면 listener 안 붙던 버그
    // 해결: targetSelector null + advanceClickSelector 만 있고 hideUntilElementHidden 없는 경우 document delegation
    if (!target && step.advanceClickSelector && !step.hideUntilElementHidden) {
      const sel = step.advanceClickSelector;
      const stepIdxAtDel = stepIdxAtRender;
      const delegateHandler = (ev) => {
        if (!window._onbTutorialMode || _onbStep !== stepIdxAtDel) return;
        const matched = ev.target && ev.target.closest && ev.target.closest(sel);
        if (matched) safeAdvance(0);
      };
      // 사용자 보고 2026-04-28: capture 사용 — modal 안 stopPropagation 우회 ('안 통했어' 등 options-btn click 못 받던 버그)
      onbAddListener(document, 'click', delegateHandler, true);
      // 사용자 요청 2026-04-28: 모든 click step에 비상 버튼 항상 노출 (step.nextLabel 존중)
      nextBtn.style.display = '';
      nextBtn.textContent = step.nextLabel || '눌렀어 →';
      return;
    }
    if (advanceTarget) {
      // 사용자 요청 2026-04-28: hideUntilElementHidden — 클릭 후 코치마크 숨김 + 지정 element가 hidden 될 때까지 대기 → 다시 띄우고 advance
      if (step.hideUntilElementHidden) {
        const handler = (e) => {
          // 코치마크 숨김
          coachmark.style.display = 'none';
          spotlight.style.display = 'none';
          mask.classList.remove('show-full');
          const ovEl = document.getElementById('onbOverlay');
          if (ovEl) ovEl.style.pointerEvents = 'none';
          // overlay 가 hidden 될 때까지 polling
          const sel = step.hideUntilElementHidden;
          const stepIdxAtClick = stepIdxAtRender;
          // 사용자 보고 2026-04-28: position:fixed 요소는 offsetParent=null이라 숨김으로 잘못 판정 → display 직접 체크
          const isElHidden = (el) => {
            if (!el) return true;
            const st = el.style && el.style.display;
            if (st === 'none') return true;
            const cs = window.getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') return true;
            return false;
          };
          // overlay 가 보일 때까지 먼저 대기 (open 비동기) — visible 보고 → hidden 확인 후 advance
          let everVisible = false;
          // 사용자 보고 2026-05-01: 빠르게 X 누른 케이스 (poll 200ms 보다 빨리 close) — sync + rAF 즉시 체크 추가.
          (function _earlyVisibleCheck() {
            const elSync = document.querySelector(sel);
            if (elSync && !isElHidden(elSync)) everVisible = true;
            requestAnimationFrame(() => {
              const elRaf = document.querySelector(sel);
              if (elRaf && !isElHidden(elRaf)) everVisible = true;
            });
          })();
          const pollId = setInterval(() => {
            if (!window._onbTutorialMode || _onbStep !== stepIdxAtClick) {
              clearInterval(pollId);
              return;
            }
            const el = document.querySelector(sel);
            const hidden = isElHidden(el);
            if (!hidden) {
              everVisible = true;  // overlay가 한 번 떴다는 마킹
              return;  // 아직 표시 중이면 계속 대기
            }
            // hidden인데 한 번도 안 보였다면 — 아직 open 중일 수 있어 대기 (최대 5초)
            if (!everVisible) return;
            // visible → hidden 전환 확인 → advance
            clearInterval(pollId);
            coachmark.style.display = '';
            if (typeof onbNext === 'function') onbNext();
          }, 200);
          // 안전장치 — 30초 후 강제 정리
          setTimeout(() => {
            if (pollId) clearInterval(pollId);
          }, 30000);
        };
        onbAddListener(advanceTarget, 'click', handler);
      } else if (step.noAutoAdvanceOnClick) {
        // 사용자 요청 2026-04-29: target 클릭해도 자동 진행 X — '눌렀어' 버튼 직접 눌러야 다음
        // (target 클릭 = 다음 화면 전환 등 비동기 작업 트리거 → 튜토리얼은 그 결과 보고 사용자가 진행)
      } else {
        const handler = (e) => { safeAdvance(0); };
        onbAddListener(advanceTarget, 'click', handler);
      }
    }
    // 사용자 요청 2026-04-28: 모든 click step에 '눌렀어' 비상 버튼 항상 노출 (manualAdvance flag 무관)
    nextBtn.style.display = '';
    nextBtn.textContent = step.nextLabel || '눌렀어 →';
  } else if (step.waitFor === 'inputFilled') {
    // V3.13: input/textarea에 값이 들어가면 advance
    if (target) {
      const handler = () => {
        if (target.value && target.value.trim().length >= (step.minLength || 1)) {
          safeAdvance(0);
        }
      };
      onbAddListener(target, 'input', handler);
    }
    nextBtn.style.display = '';  // skip 가능하도록
    nextBtn.textContent = '입력했어 →';
  } else if (step.waitFor === 'next') {
    nextBtn.style.display = '';
    nextBtn.classList.remove('waiting');
  }
}

function onbNext() {
  // V4 (v8 묶음 14): step.onAdvance hook — Core 3-A / 3-B / Core 2 shell_obtained 등에서 사용
  const _curStep = ONBOARDING_STEPS[_onbStep];
  if (_curStep && typeof _curStep.onAdvance === 'function') {
    try { _curStep.onAdvance(_curStep); } catch (e) { console.warn('[onbNext onAdvance]:', e); }
  }
  _onbStep++;
  // V4 코어 종료 — 마지막 step 지나면 help_button 점프 또는 onbFinish
  if (_activeCoreId && _coreEndIdx >= 0 && _onbStep > _coreEndIdx) {
    // 코어 #2~#8: endId 후 help_button (다시 보고 싶을 때)으로 점프
    if (_coreNeedsHelpAfterEnd) {
      const helpIdx = ONBOARDING_STEPS.findIndex(s => s && s.id === 'help_button');
      if (helpIdx >= 0) {
        _onbStep = helpIdx;
        _coreEndIdx = helpIdx;  // 다음 next에 finish
        _coreNeedsHelpAfterEnd = false;
        onbRenderStep();
        return;
      }
    }
    onbFinish();
    return;
  }
  // V4 코어 skip — 코어별 제외 step 자동 통과
  // V4 (v8 사용자 명시 2026-05-03 ultrathink): 전역 V8_ACTIVE_STEPS 화이트리스트 — 풀 튜토리얼 / 코어 모두 옛 step skip
  const skipSet = _activeCoreId && CORE_SKIP_IDS[_activeCoreId];
  const allowSet = (_activeCoreId === 'core1') ? CORE1_ALLOW_IDS : null;
  const _endLimit = (_activeCoreId && _coreEndIdx >= 0) ? _coreEndIdx : (ONBOARDING_STEPS.length - 1);
  while (_onbStep <= _endLimit && _onbStep < ONBOARDING_STEPS.length) {
    const _curId = ONBOARDING_STEPS[_onbStep] && ONBOARDING_STEPS[_onbStep].id;
    const _shouldSkip =
      (skipSet && skipSet.has(_curId)) ||
      (allowSet && !allowSet.has(_curId)) ||
      (typeof V8_ACTIVE_STEPS !== 'undefined' && !V8_ACTIVE_STEPS.has(_curId));  // 전역 dead step 자동 skip
    if (!_shouldSkip) break;
    _onbStep++;
  }
  if (_activeCoreId && _coreEndIdx >= 0 && _onbStep > _coreEndIdx) {
    if (_coreNeedsHelpAfterEnd) {
      const helpIdx = ONBOARDING_STEPS.findIndex(s => s && s.id === 'help_button');
      if (helpIdx >= 0) {
        _onbStep = helpIdx;
        _coreEndIdx = helpIdx;
        _coreNeedsHelpAfterEnd = false;
        onbRenderStep();
        return;
      }
    }
    onbFinish();
    return;
  }
  if (_onbStep >= ONBOARDING_STEPS.length) {
    onbFinish();
    return;
  }
  onbRenderStep();
}

function onbBack() {
  if (_onbStep <= 0) return;
  // 사용자 보고 2026-05-01: 코어 튜토리얼 시작점 이전으로 가지 않도록 clamp (옛 버그: 다른 코어로 넘어감)
  let coreStartIdx = -1;
  if (_activeCoreId && typeof CORE_TUTORIAL_RANGES !== 'undefined' && CORE_TUTORIAL_RANGES[_activeCoreId]) {
    coreStartIdx = ONBOARDING_STEPS.findIndex(s => s && s.id === CORE_TUTORIAL_RANGES[_activeCoreId].startId);
    if (coreStartIdx >= 0 && _onbStep <= coreStartIdx) return;
  }
  // V4 (사용자 보고 2026-05-03 ultrathink): 뒤로 버튼 버그 fix — 화이트리스트 / SKIP_IDS 역방향 skip.
  // 옛 동작: _onbStep-- 후 옛 step (V8_ACTIVE_STEPS 외) 진입 → 사용자 막힘 (앞으로 가도 화이트리스트 외 step 이라 또 skip).
  // 새 동작: 역방향으로도 화이트리스트 step 만나면 break — 자연스러운 이전 step 으로 점프.
  const skipSet = _activeCoreId && CORE_SKIP_IDS[_activeCoreId];
  const allowSet = (_activeCoreId === 'core1') ? CORE1_ALLOW_IDS : null;
  do {
    _onbStep--;
    if (_onbStep < 0) { _onbStep = 0; break; }
    if (coreStartIdx >= 0 && _onbStep < coreStartIdx) { _onbStep = coreStartIdx; break; }
    const _curId = ONBOARDING_STEPS[_onbStep] && ONBOARDING_STEPS[_onbStep].id;
    const _shouldSkip =
      (skipSet && skipSet.has(_curId)) ||
      (allowSet && !allowSet.has(_curId)) ||
      (typeof V8_ACTIVE_STEPS !== 'undefined' && !V8_ACTIVE_STEPS.has(_curId));
    if (!_shouldSkip) break;
  } while (_onbStep > 0);
  // prefill flag 초기화 — 다시 진입 시 prefill 다시 적용되도록
  const prevStep = ONBOARDING_STEPS[_onbStep];
  if (prevStep && prevStep._prefillApplied) delete prevStep._prefillApplied;
  onbRenderStep();
}

async function onbSkip() {
  const yes = await showConfirmModal({
    title: '투어 건너뛸까?',
    message: '언제든 ⚙ 설정에서 다시 볼 수 있어.\n지금까지 튜토리얼에서 만든 데이터는 다 정리할게.',
    okLabel: '건너뛰기', cancelLabel: '계속'
  });
  if (!yes) return;
  // 사용자 요청 2026-04-28: 건너뛰기도 데이터 정리 (onbFinish의 cleanup 흐름 그대로 사용)
  onbFinish();
}

function onbFinish() {
  // 사용자 보고 2026-04-30 ultrathink (CRITICAL): 튜토리얼 끝 시점 원본 데이터 소실 버그 방어.
  // 옛 버그: testerMode 가 ON 인데 메모리 _testerModeBackupState 가 null 인 경로 (e.g. mid-tutorial reload 후 재진입)
  //         → restore 분기 안 타고 fallback 으로 떨어져 seed 데이터가 살아남은 채 cloud 저장됨.
  // 수정: cloud backup row (me_v4_backup) 한 번 더 fetch 시도 후 재진입. 무한 재귀 방지 flag.
  if (state && state.preferences && state.preferences.testerMode &&
      !_testerModeBackupState &&
      !window._onbCloudRecoverAttempted &&
      typeof authUserId !== 'undefined' && authUserId &&
      typeof _loadTesterBackupFromCloud === 'function') {
    window._onbCloudRecoverAttempted = true;
    (async () => {
      try {
        const cb = await _loadTesterBackupFromCloud();
        if (cb && typeof cb === 'object' && Object.keys(cb).length > 0) {
          _testerModeBackupState = cb;
          console.log('[onbFinish] cloud backup 으로 메모리 backup 복원');
        } else {
          console.warn('[onbFinish] cloud backup 비어있거나 없음');
        }
      } catch (e) { console.warn('[onbFinish] cloud backup 복원 실패:', e); }
      onbFinish();  // 재진입 — 이번엔 정상 경로 또는 fallback (seed sweep)
    })();
    return;
  }
  delete window._onbCloudRecoverAttempted;

  onbCleanupListeners();
  window._onbTutorialMode = false;

  // V4: 활성 코어 unlock 적용할 ID 보존 (cleanup 함수가 _activeCoreId를 null로 만들기 전에)
  const _completedCoreId = _activeCoreId;
  // V4: body override 복원 + 코어 활성 상태 정리
  if (typeof _cleanupCoreOverrides === 'function') _cleanupCoreOverrides();

  // 사용자 명시 2026-04-30 ultrathink (위치 이동): 옛 snapshot 진단 흐름 폐기 → chat_intake_entry step 안 모달 풀 흐름으로 대체. 이 자리 _firstTouchSnapshot 코드 제거.

  // 사용자 요청 2026-04-28: 테스터 모드 ON 상태였으면 backup 복원으로 한 방 정리 (filter cleanup 중복 X)
  if (state.preferences && state.preferences.testerMode && _testerModeBackupState) {
    // V4: 튜토리얼 중 사용자가 입력한 API 키 / profile 보존 (backup 복원으로 wipe 방지)
    const _userInputApiKey = state.apiKey;
    const _userInputProfile = state.profile;
    const _backupApiKey = _testerModeBackupState.apiKey;
    const _backupProfile = _testerModeBackupState.profile;
    // 사용자 명시 2026-04-30 ultrathink: intake 모달 (chat_intake_entry step) 진행 중 적용한 데이터 보존 — testerMode ON 동안 적용됐으니 backup 에 X. restore 후 다시 inject.
    const _intakeWorrySaved = Array.isArray(state.intakeWorry) ? state.intakeWorry.slice() : [];
    const _intakeTraits = (state.traits || []).filter(t => t && t.source === 'intake_core1');
    const _intakeValues = (state.values || []).filter(v => v && v.source === 'intake_core1');
    const _intakePatterns = (state.patterns || []).filter(p => p && p.source === 'intake_core1');
    const _intakeFirstTouchDone = !!(state.preferences && state.preferences._firstTouchDone);
    Object.keys(state).forEach(k => delete state[k]);
    Object.assign(state, _testerModeBackupState);
    _testerModeBackupState = null;
    // 사용자가 튜토리얼 중 새로 입력했으면(이전 비어있고 지금 있음) 그 값으로 넣음
    if (_userInputApiKey && !_backupApiKey) state.apiKey = _userInputApiKey;
    if (_userInputProfile && !_backupProfile) state.profile = _userInputProfile;
    // intake 데이터 다시 inject (튜토리얼 진행 중 적용한 거 — 보존)
    if (_intakeWorrySaved.length > 0) state.intakeWorry = _intakeWorrySaved;
    if (_intakeTraits.length > 0) state.traits = (state.traits || []).concat(_intakeTraits);
    if (_intakeValues.length > 0) state.values = (state.values || []).concat(_intakeValues);
    if (_intakePatterns.length > 0) state.patterns = (state.patterns || []).concat(_intakePatterns);
    if (_intakeFirstTouchDone) {
      state.preferences = state.preferences || {};
      state.preferences._firstTouchDone = true;
    }
    if (typeof refreshTesterModeUI === 'function') refreshTesterModeUI();
    state.hasSeenWelcomeTutorial = true;
    state.hasSeenV3Tour = true;
    // V4 코어 unlock 적용하기 (backup 복원 후 — 사용자 진행 상태에 추가)
    if (_completedCoreId) {
      state.unlocked = state.unlocked || {};
      state.unlocked[_completedCoreId] = true;
    }
    // V4 (v8 묶음 12): Core 1 끝나면 환영 선물 모달 trigger marker (reload 후 init 시점에 표시)
    if (_completedCoreId === 'core1') {
      try { sessionStorage.setItem('soragodong_v4_welcome_gift_pending', '1'); } catch {}
    }
    // V4 풀 튜토리얼 완주 시 모든 코어 unlock
    if (window._fullTutorialActive) {
      state.unlocked = state.unlocked || {};
      ['core1','core2','core3','core4','core5','core6','core8'].forEach(k => state.unlocked[k] = true);
      window._fullTutorialActive = false;
    }
    // V4 사용자 요청 2026-04-29: 모든 코어 unlock 시 다음 reload 후 토스트
    {
      const _all = ['core1','core2','core3','core4','core5','core6','core8'];
      const _allDone = state.unlocked && _all.every(k => state.unlocked[k] === true);
      state.preferences = state.preferences || {};
      if (_allDone && !state.preferences._allTutorialsCompletedShown) {
        state.preferences._allTutorialsCompletedShown = true;
        state.preferences._allTutorialsJustCompleted = true;
      }
    }
    _onbStartTime = null;
    delete window._onbCFBackup;
    delete window._onbModesBackup;
    delete window._onbPeriodStartBackup;
    saveState(true);
    const ov = document.getElementById('onbOverlay');
    if (ov) { ov.classList.remove('active'); ov.style.display = 'none'; }
    // V4 사용자 보고 2026-04-29: saveState의 saveToCloud는 1초 debounce — 400ms reload 전에 cloud 저장 안 끝남.
    // → saveToCloudNow()를 직접 await 한 다음 reload 해서 unlock 상태가 확실히 cloud에 적용된 후 진입.
    (async () => {
      try { if (typeof saveToCloudNow === 'function') await saveToCloudNow(); }
      catch (e) { console.warn('[onbFinish] cloud save:', e); }
      location.reload();
    })();
    return;
  }
  // testerMode flag만 있고 backup 없는 경우 — flag만 끄기 + 사용자 보고 2026-04-30 ultrathink (CRITICAL): seed marker sweep 강제.
  // 옛 버그: backup 없으면 flag 만 끄고 떨어져서 _seed marker 항목이 cloud 저장 → 데이터 손실.
  if (state.preferences && state.preferences.testerMode) {
    state.preferences.testerMode = false;
    if (typeof refreshTesterModeUI === 'function') refreshTesterModeUI();
    // _seed 마커 강제 sweep (방어). 사용자 데이터엔 이 마커 X — 안전.
    const _stripSeed = (arr) => Array.isArray(arr)
      ? arr.filter(it => !(it && typeof it === 'object' && it._seed))
      : arr;
    ['entries','chatMessages','chatArchive','weeklyReviews','memoryVault',
     'tasks','missions','pearls','archive','topicCards','reflectionQuestions',
     'projects','starts','quarterlyReviews','decisions','insights','diagnoses',
     'monthlyReviews','shellCollection','traits','values','patterns'
    ].forEach(k => { state[k] = _stripSeed(state[k]); });
    console.warn('[onbFinish] backup 없는 fallback — _seed sweep 실행');
  }

  // V3.13: 튜토리얼에서 만든 데이터 정리 (시작 시간 이후) — testerMode OFF 상태에서 시작한 케이스
  if (_onbStartTime) {
    const startISO = new Date(_onbStartTime).toISOString();
    const startMs = _onbStartTime;
    const todayK = todayKey();
    state.chatMessages = (state.chatMessages || []).filter(m =>
      !m.timestamp || m.timestamp < startISO
    );
    state.entries = (state.entries || []).filter(e =>
      e.date !== todayK || !e.timestamp || e.timestamp < startISO
    );
    // 튜토리얼에서 만든 mission/shell/task 정리
    state.missions = (state.missions || []).filter(m =>
      !m.createdAt || new Date(m.createdAt).getTime() < startMs
    );
    state.shellCollection = (state.shellCollection || []).filter(s =>
      !s.date || new Date(s.date).getTime() < startMs
    );
    state.tasks = (state.tasks || []).filter(t =>
      !t.createdAt || new Date(t.createdAt).getTime() < startMs
    );
    state.archive = (state.archive || []).filter(a =>
      !a.savedAt || new Date(a.savedAt).getTime() < startMs
    );
    state.pearls = (state.pearls || []).filter(p =>
      !p.createdAt || new Date(p.createdAt).getTime() < startMs
    );
    state.projects = (state.projects || []).filter(p =>
      !p.createdAt || new Date(p.createdAt).getTime() < startMs
    );
    state.decisions = (state.decisions || []).filter(d =>
      !d.startedAt || new Date(d.startedAt).getTime() < startMs
    );
    // 사용자 요청 2026-04-28: 튜토리얼 중 만든 starts(몰입 세션) 정리
    state.starts = (state.starts || []).filter(s =>
      !s.startedAt || new Date(s.startedAt).getTime() < startMs
    );
    // V3.13.x: askDeeper → 🧬 전략으로 저장된 토픽 카드 정리
    state.topicCards = (state.topicCards || []).filter(c =>
      !c.createdAt || new Date(c.createdAt).getTime() < startMs
    );
    // V3.13.x: 튜토리얼 대화로 추출된 traits/values/patterns 정리 (created_at 기반)
    state.traits = (state.traits || []).filter(t =>
      !t.created_at || new Date(t.created_at).getTime() < startMs
    );
    state.values = (state.values || []).filter(v =>
      !v.created_at || new Date(v.created_at).getTime() < startMs
    );
    state.patterns = (state.patterns || []).filter(p =>
      !p.created_at || new Date(p.created_at).getTime() < startMs
    );
    _onbStartTime = null;
  }
  // V3.13.x: caseFormulation 복원 — 튜토리얼 대화로 변경됐을 가능성 (timestamp 없어 백업/복원 방식)
  if (window._onbCFBackup) {
    state.caseFormulation = window._onbCFBackup;
    delete window._onbCFBackup;
  }
  // V3.13.x: state.modes + periodStart 복원 — _onbStartTime 검사 밖
  // (onbSkip 으로 종료해도 모드는 복원해야 — pick_mode에서 의도치 않게 누른 모드 정리)
  if (window._onbModesBackup) {
    state.modes = window._onbModesBackup;
    state.periodStart = window._onbPeriodStartBackup;
    delete window._onbModesBackup;
    delete window._onbPeriodStartBackup;
  }

  state.hasSeenWelcomeTutorial = true;
  state.hasSeenV3Tour = true;
  // V4 코어 unlock 적용하기 (no-backup 경로)
  if (_completedCoreId) {
    state.unlocked = state.unlocked || {};
    state.unlocked[_completedCoreId] = true;
  }
  // V4 (v8 묶음 12): Core 1 끝나면 환영 선물 모달 — no-backup 경로 (reload X) 직접 호출
  if (_completedCoreId === 'core1') {
    setTimeout(() => { if (typeof _showWelcomeGiftModal === 'function') _showWelcomeGiftModal(); }, 600);
  }
  // V4 풀 튜토리얼 완주 시 모든 코어 unlock (no-backup 경로도 동일)
  if (window._fullTutorialActive) {
    state.unlocked = state.unlocked || {};
    ['core1','core2','core3','core4','core5','core6','core8'].forEach(k => state.unlocked[k] = true);
    window._fullTutorialActive = false;
  }
  // V4 모든 코어 unlock 토스트 플래그 (no-backup 경로)
  {
    const _all = ['core1','core2','core3','core4','core5','core6','core8'];
    const _allDone = state.unlocked && _all.every(k => state.unlocked[k] === true);
    state.preferences = state.preferences || {};
    if (_allDone && !state.preferences._allTutorialsCompletedShown) {
      state.preferences._allTutorialsCompletedShown = true;
      // no-backup 경로는 reload 안 함 → 직접 토스트
      setTimeout(() => { if (typeof showToast === 'function') showToast('🎉 모든 튜토리얼 끝났어! 🐚'); }, 800);
    }
  }

  saveState();
  const ov = document.getElementById('onbOverlay');
  if (ov) {
    ov.classList.remove('active');
    ov.style.display = 'none';
  }
  showScreen('home');
  // 모든 화면 다시 그리기 (튜토리얼 데이터 지운 결과 반영)
  if (typeof renderTodayMission === 'function') renderTodayMission();
  if (typeof renderShellBar === 'function') renderShellBar();
  if (typeof renderChat === 'function') renderChat();
  setTimeout(() => showToast('잘 왔어 ✦ 진짜 시작!'), 300);
  // 사용자 명시 2026-04-30 ultrathink (위치 이동): intake 모달 = 코어 #1 chat_intake_entry step 자리에서 trigger (대화탭 시작 시점). onbFinish 자리는 X.
  // 단 _resumePendingIntake 안전망 (이전 _pendingIntake flag 남아있는 사용자 처리) 는 init 시점에서 호출.

  // 사용자 명시 2026-04-30 ultrathink: 튜토리얼이 chat_opus_intro 에서 활성화한 Opus = 끝 시점에 자동 sonnet 복원 (testerMode OFF 경로). testerMode ON 경로는 backup restore 가 자동 복원.
  if (state.preferences && state.preferences._opusActivatedByTutorial) {
    state.preferences.useOpus = false;
    state.preferences._opusActivatedByTutorial = false;
    if (typeof updateChatModeBtn === 'function') updateChatModeBtn();
    saveState();
  }

  // 사용자 명시 2026-05-02 ultrathink: 튜토리얼 완주 시점에 환영 100만 토큰 grant 자동 trigger (idempotent — backend 가 welcome_bonus_total_granted > 0 시 already_granted 응답).
  // 매 코어 끝마다 호출되지만 첫 호출만 grant. 환영 모달 '받기' click 도 같은 endpoint 호출 — 둘 다 OK.
  // testerMode 의 backup restore 후 cloud 저장 시작 시점에도 동일 — 첫 1회 만 grant.
  if (typeof session !== 'undefined' && session && session.access_token && typeof _authedFetch === 'function') {
    _authedFetch('/api/billing/welcome-bonus', { method: 'POST' })
      .then(r => r.json().catch(() => ({})))
      .then(data => {
        if (data?.granted) console.log('[onbFinish] welcome bonus granted:', data);
      })
      .catch(e => console.warn('[onbFinish] welcome bonus 호출 실패:', e));
  }
}

// 코어 #1 종료 시점 + 첫 관찰 미완료 detect
function _isCore1AndFirstTouchPending() {
  if (!state.preferences) return false;
  if (state.preferences._firstTouchDone) return false;
  return true;  // _activeCoreId 가 _onbCleanupCore 시점에 이미 null 이라 주체 detect X — pending 만 보면 충분
}

// 사용자 명시 2026-04-30 ultrathink: testerMode ON 경로 = reload 됨 → init 시점에 _pendingIntake flag 보면 intake 모달 재진입.
async function _resumePendingIntake() {
  if (!state.preferences || !state.preferences._pendingIntake) return;
  if (state.preferences._firstTouchDone) {
    state.preferences._pendingIntake = false;
    saveState();
    return;
  }
  if (typeof runIntakeFlow !== 'function' || typeof _canAI !== 'function' || !_canAI()) return;
  try {
    await runIntakeFlow();
    state.preferences._firstTouchDone = true;
    state.preferences._pendingIntake = false;
    saveState();
  } catch (e) { console.warn('[intake] resume 실패', e); }
}

// 화면 회전/리사이즈 시 spotlight 위치 재계산
window.addEventListener('resize', () => {
  const ov = document.getElementById('onbOverlay');
  if (!ov || ov.style.display === 'none') return;
  const step = ONBOARDING_STEPS[_onbStep];
  if (step) onbPositionStep(step);
});

// V3.10: iOS Safari 키보드 가림 방지 — visualViewport API
// 키보드 올라오면 chat-input-bar가 키보드 위에 붙도록
// 사용자 보고 2026-05-02: typing 중 visualViewport scroll 이벤트 빈번 trigger 시 reflow 누적 → rAF throttle.
if (window.visualViewport) {
  let _vvRaf = 0;
  let _vvLastBottom = '';
  const updateInputBarOnKeyboard = () => {
    if (_vvRaf) return;
    _vvRaf = requestAnimationFrame(() => {
      _vvRaf = 0;
      const bar = document.getElementById('chatInputBar');
      if (!bar) return;
      const vv = window.visualViewport;
      const offset = window.innerHeight - vv.height - vv.offsetTop;
      const next = offset > 60 ? (offset + 'px') : '';
      if (next === _vvLastBottom) return; // 동일 값 재대입 = reflow 차단
      _vvLastBottom = next;
      bar.style.bottom = next;
    });
  };
  window.visualViewport.addEventListener('resize', updateInputBarOnKeyboard);
  window.visualViewport.addEventListener('scroll', updateInputBarOnKeyboard);
}


function showLoginScreen() {
  document.querySelector('.app').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
}

// 사용자 명시 2026-05-02 ultrathink: 동의 검증 + pending consent 저장 helper (이메일 OTP / SNS 로그인 둘 다 사용).
// PIPA §22 / §23 / §17 별도 동의 의무 충족 — 4 분리 체크박스 (약관/민감/국외/만19세).
function _checkLoginConsentsAndSavePending(emailOrEmpty, loginMethod) {
  const consentTerms = document.getElementById('loginConsentTerms')?.checked;
  const consentSensitive = document.getElementById('loginConsentSensitive')?.checked;
  const consentCrossBorder = document.getElementById('loginConsentCrossBorder')?.checked;
  const consentAdult = document.getElementById('loginConsentAdult')?.checked;
  if (!consentTerms || !consentSensitive || !consentCrossBorder || !consentAdult) {
    const missing = [];
    if (!consentTerms) missing.push('약관·privacy');
    if (!consentSensitive) missing.push('민감정보 처리 (§23)');
    if (!consentCrossBorder) missing.push('국외이전 (§17)');
    if (!consentAdult) missing.push('만 19세 이상 자기 선언');
    alert('필수 동의 항목 모두 체크해야 시작 가능해.\n\n미체크: ' + missing.join(' / ') + '\n\n거부 시 서비스 이용 불가.');
    return false;
  }
  try {
    localStorage.setItem('soragodong_pending_consent', JSON.stringify({
      email: emailOrEmpty || '',
      consentTerms: !!consentTerms,
      consentSensitive: !!consentSensitive,
      consentCrossBorder: !!consentCrossBorder,
      consentAdult: !!consentAdult,
      loginMethod: loginMethod || 'email',
      at: new Date().toISOString(),
      versions: { terms: '1.1', privacy: '1.1', crossBorder: '2.1', refund: '1.1' }
    }));
  } catch (e) { console.warn('[consent] pending save:', e); }
  return true;
}

// 사용자 명시 2026-05-02 ultrathink: SNS 로그인 (카카오만 V4) — Supabase OAuth redirect 흐름.
// E2EE master password layer 보존 — SNS 인증 후 기존 비밀번호 모달이 자동 trigger.
// 사용자 명시 2026-05-02: 네이버 = V5 — 네이버 정책상 SNS 가입 시 '별도 비밀번호 요구 X' 의무 → E2EE 강제 흐름과 충돌. V5 휴대폰 본인 인증과 함께 재검토.
async function loginWithProvider(provider) {
  if (!['kakao'].includes(provider)) {
    alert('지원하지 않는 로그인: ' + provider);
    return;
  }
  // 사용자 명시 2026-05-02: 동의 검증은 OAuth callback 후 신규 사용자 = 비밀번호 설정 모달 안에서 (로그인 화면 X).
  // 단 loginMethod 만 pending 에 넣어둠 (callback 후 식별 위해).
  try {
    localStorage.setItem('soragodong_pending_consent', JSON.stringify({
      email: '', loginMethod: provider, at: new Date().toISOString()
    }));
  } catch {}
  // Supabase OAuth redirect — /auth/v1/authorize?provider=X&redirect_to=Y
  // 사용자 명시 2026-05-02: 카카오 = 이메일만 (PIPA 데이터 최소 수집). Supabase default scope (profile_nickname/profile_image) 제외 — scopes=account_email 명시.
  const redirectTo = window.location.origin;
  const scopeMap = { kakao: 'account_email' };
  const scopes = scopeMap[provider] || '';
  const scopeParam = scopes ? `&scopes=${encodeURIComponent(scopes)}` : '';
  const url = `${SUPABASE_URL}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectTo)}${scopeParam}`;
  // 사용자가 SNS 로그인 페이지로 이동 — redirect 후 Supabase callback → app session listener 자동 처리
  window.location.href = url;
}

// 사용자 명시 2026-05-02: OTP 60초 쿨타임 — alert() 대신 button inline countdown.
let _otpCooldownTimer = null;
function _startOtpCooldownUI(seconds) {
  const btn = document.getElementById('loginBtn');
  const status = document.getElementById('loginStatus');
  if (!btn) return;
  if (_otpCooldownTimer) { clearInterval(_otpCooldownTimer); _otpCooldownTimer = null; }
  let remaining = Math.max(1, Math.ceil(seconds));
  const restoreText = '로그인 코드 받기 ✦';
  function tick() {
    if (remaining <= 0) {
      clearInterval(_otpCooldownTimer); _otpCooldownTimer = null;
      btn.disabled = false;
      btn.textContent = restoreText;
      if (status) { status.textContent = ''; status.style.color = ''; }
      return;
    }
    btn.disabled = true;
    btn.textContent = `⏳ ${remaining}초 후 다시 받기`;
    if (status) {
      status.textContent = '잠깐 — 이메일 OTP 60초 쿨타임이야.';
      status.style.color = 'var(--text-soft)';
    }
    remaining -= 1;
  }
  tick();
  _otpCooldownTimer = setInterval(tick, 1000);
}
function _checkOtpCooldownAndStart() {
  try {
    const lastSent = parseInt(localStorage.getItem('soragodong_v4_last_otp_at') || '0', 10);
    if (!lastSent) return false;
    const elapsed = Date.now() - lastSent;
    if (elapsed >= 60000) return false;
    _startOtpCooldownUI(Math.ceil((60000 - elapsed) / 1000));
    return true;
  } catch { return false; }
}

async function handleSendCode() {
  const emailInput = document.getElementById('loginEmail');
  const email = emailInput.value.trim();
  if (!email || !email.includes('@')) {
    const status = document.getElementById('loginStatus');
    if (status) { status.textContent = '이메일을 정확히 입력해줘.'; status.style.color = 'var(--danger)'; }
    return;
  }

  // 사용자 명시 2026-05-02: 60s cooldown — alert() 대신 inline countdown.
  if (_checkOtpCooldownAndStart()) return;

  // 사용자 명시 2026-05-02: 동의는 신규 = 비밀번호 설정 모달 안에서 (로그인 화면 X). 단 loginMethod 넣어둠.
  try {
    localStorage.setItem('soragodong_pending_consent', JSON.stringify({
      email, loginMethod: 'email', at: new Date().toISOString()
    }));
  } catch {}

  const btn = document.getElementById('loginBtn');
  const status = document.getElementById('loginStatus');
  btn.disabled = true;
  btn.textContent = '전송 중...';
  status.textContent = '';

  try {
    await sendOTP(email);
    // 사용자 명시 2026-05-01 (agent audit): rate limit 추적용 timestamp 넣음.
    try { localStorage.setItem('soragodong_v4_last_otp_at', String(Date.now())); } catch {}
    // Move to step 2
    document.getElementById('loginStep1').style.display = 'none';
    document.getElementById('loginStep2').style.display = 'block';
    document.getElementById('loginEmailDisplay').textContent = email;
    // Store email for verification
    document.getElementById('loginStep2').dataset.email = email;
    setTimeout(() => document.getElementById('loginCode').focus(), 100);
  } catch (err) {
    // 사용자 명시 2026-05-01 (agent audit): Supabase rate-limit 영문 에러 한국어 매핑.
    const m = (err && err.message) || '';
    if (/rate.*limit|too many|60.?seconds?/i.test(m)) {
      // 서버 rate limit — timestamp 기록 후 inline countdown.
      try { localStorage.setItem('soragodong_v4_last_otp_at', String(Date.now())); } catch {}
      _startOtpCooldownUI(60);
      return;
    }
    const userMsg = /network|failed to fetch|offline/i.test(m)
      ? '인터넷 연결 확인해줘.'
      : '오류: ' + (m || '알 수 없음');
    status.textContent = userMsg;
    status.style.color = 'var(--danger)';
    btn.disabled = false;
    btn.textContent = '로그인 코드 받기 ✦';
  }
}

async function handleVerifyCode() {
  const email = document.getElementById('loginStep2').dataset.email;
  const codeInput = document.getElementById('loginCode');
  const code = codeInput.value.trim();
  if (!code || code.length < 6) { alert('이메일에 받은 코드를 입력해줘'); return; }

  const btn = document.getElementById('verifyBtn');
  const status = document.getElementById('verifyStatus');
  btn.disabled = true;
  btn.textContent = '확인 중...';
  status.textContent = '';

  try {
    await verifyOTP(email, code);
    status.textContent = '✓ 로그인 성공! 잠시만...';
    status.style.color = 'var(--success)';
    setTimeout(() => location.reload(), 600);
  } catch (err) {
    status.textContent = '오류: ' + err.message + ' — 코드를 다시 확인해줘.';
    status.style.color = 'var(--danger)';
    btn.disabled = false;
    btn.textContent = '로그인';
    codeInput.value = '';
    codeInput.focus();
  }
}

function resetLoginFlow() {
  document.getElementById('loginStep1').style.display = 'block';
  document.getElementById('loginStep2').style.display = 'none';
  document.getElementById('loginCode').value = '';
  document.getElementById('loginStatus').textContent = '';
  document.getElementById('verifyStatus').textContent = '';
  document.getElementById('loginBtn').disabled = false;
  document.getElementById('loginBtn').textContent = '로그인 코드 받기 ✦';
  // 사용자 명시 2026-05-02: cooldown 잔여 있으면 inline countdown 복원.
  if (typeof _checkOtpCooldownAndStart === 'function') _checkOtpCooldownAndStart();
}

// V3.13.x: "하루"를 04:00 cutoff로 정의 (디바이스 로컬 시간 새벽 4시 전은 어제, 4시 후는 오늘).
// 새벽 작업자 자연스러움 + 잠 자기 전 일기·체크인이 그 날의 기록으로 묶임.
// 해외 출장/여행 시 디바이스 시간대 자동 변경 → 그 지역 4시 cutoff (사용자 명시 2026-05-01: 그 해외 기준 OK).
const DAY_CUTOFF_HOUR = 4;
function getDayKey(input) {
  // 사용자 요청 2026-04-28: input 없으면 서버 시간 기반 (디바이스 시계 잘못돼도 정확)
  const t = input == null
    ? (typeof getServerNowMs === 'function' ? getServerNowMs() : Date.now())
    : (typeof input === 'string' ? new Date(input).getTime()
       : (input instanceof Date ? input.getTime() : input));
  const d = new Date(t - DAY_CUTOFF_HOUR * 3600000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function todayKey() { return getDayKey(); }


