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

