// V3.7: startWelcomeTutorial을 인터랙티브 온보딩으로 가로채기
// V3.9: WELCOME_SLIDES/TOUR_SLIDES 슬라이드 시스템 완전 제거됨
// V4 (사용자 명시 2026-05-06 ultrathink): V8 시작 튜토리얼 (11-start-tutorial-v8.js) 로 교체.
// 옛 코어 / 풀 튜토리얼 진입 = 모두 no-op. ONBOARDING_STEPS 본체는 주석 보존.
function startWelcomeTutorial() {
  console.warn('[legacy] startWelcomeTutorial() — V8 시작 튜토리얼로 대체됨, no-op');
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
// V4 (사용자 명시 2026-05-06 ultrathink): 옛 80 스텝 = V8 시작 튜토 (11-start-tutorial-v8.js) 대체.
// 빈 배열로 stub — 진입 함수들 (startInteractiveOnboarding / startCoreTutorial) 도 no-op.
// 본체 코드는 아래 주석 블록에 보존 (legacy reference / 향후 Tier 3 모듈화 시 발췌).
const ONBOARDING_STEPS = [];
/* legacy ONBOARDING_STEPS — 보존만:
const _LEGACY_ONBOARDING_STEPS = [
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
    targetSelector: '.checkin-extra-toggle',
    title: '더 기록하고 싶으면 여기',
    body: '시험·여행·아픔·방전 같은 특별한 날이면 <b>▾ 더 기록하기</b> 펼쳐서 모드 / 수면 / 식사 등을 추가로 골라볼 수 있어.<br><br><span class="small">필수는 ⚡에너지·💭기분 두 개뿐. 나머지는 다 선택이야.</span>',
    waitFor: 'next',
    fallbackPosition: 'top'
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
    body: '여기서는 나한테 <b>무슨 말이든 해도 돼!</b> 자유도가 무궁무진해.<br>분위기에 맞게 답해줄게.<br><br>☕ <b>일상 공유</b> — "오늘 점심 마라탕 먹었어"<br>😆 <b>웃긴 에피소드</b> — "오늘 진짜 웃긴 일 있었어..."<br>🌟 <b>자랑·뿌듯</b> — "발표 끝났어! 잘 마무리함 ㅎㅎ"<br><br>🌀 <b>와다다 풀기</b> — "기쁘기도 하고 슬프기도 하고..."<br>🤔 <b>의견 듣기</b> — "이 옷 살까 말까ㅋㅋ"<br><br>🚧 <b>막혔을 때</b> — "내일 발표인데 자료 하나도 없어. 시작도 못 하겠어"<br>💧 <b>자책 흐를 때</b> — "방금 회의에서 말 더듬었어. 다들 별로라고 생각할 듯"<br>🔁 <b>패턴 의심</b> — "또 마감 임박해서야 시작이네. 왜?"<br><br>📅 <b>일정 추가</b> — "내일 3시 회의 잡아줘" / "8시 운동 가자"<br>🔍 <b>맛집·정보 검색</b> — "강남역 근처 카페 추천해줘"<br>📔 <b>일기로 남기기</b> — <b>"일기:"</b>로 시작하면 그날 entry에 원본 저장',
    waitFor: 'next'
  },
  // V4 (사용자 명시 2026-05-13): 옛 chat_opus_intro step 폐기 — 헤더 토글이 RAG 토글 (대화탭 한정)로 정정됨.
  //   신규 사용자 = 미구독 = RAG 토글 brand only (안 보임) → 튜토리얼 step 의미 X.
  //   Plus 가입 후 첫 클릭 모달 (showRagFirstClickModal) + 마법/숙고 첫 진입 모달 (showPerRoomOpusFirstClickModal) 으로 분리.
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
    title: '🧠 고동에게 맡기기 — 직접 해보자',
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
    title: '🌀 마법고동 + 리뷰',
    body: '마법고동과 리뷰 모음이 있어.<br><br>마법고동을 눌러봐.',
    waitFor: 'click',
    advanceDelay: 600,
    dimBackground: false,
    manualAdvance: true
  },
  {
    id: 'magic_room_intro',
    targetSelector: 'button[onclick="startNewDecision()"]',
    title: '🐚 마법고동',
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
*/

let _onbStep = 0;
let _onbActiveListeners = [];
let _onbStartTime = null;  // V3.12: 튜토리얼 시작 시간 — 종료 시 데이터 정리

// ═══════════════════════════════════════════════════════════════
