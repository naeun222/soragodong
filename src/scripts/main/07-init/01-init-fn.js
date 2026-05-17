// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
async function init() {
  try { performance.mark('initStart'); } catch (e) {}
  // V4 (사용자 명시 2026-05-14): landing page attribution — ?ref=start / ?ref=startlite query param.
  //   첫 진입 시 state.preferences._acquisitionSource + _acquisitionAt 저장. 이후 진입은 무시 (첫 source 보존).
  //   landing page CTA (start.html / startlite.html) 가 href 에 ref 자동 박음.
  try {
    const _refParam = new URLSearchParams(window.location.search).get('ref');
    if (_refParam && ['start', 'startlite', 'introduce'].includes(_refParam)) {
      state.preferences = state.preferences || {};
      if (!state.preferences._acquisitionSource) {
        state.preferences._acquisitionSource = _refParam;
        state.preferences._acquisitionAt = new Date().toISOString();
        try { saveState(); } catch {}
      }
      // URL 깔끔 처리 — ref param 1회 capture 후 history 에서 제거 (PWA 재진입 시 leak X).
      try {
        const _u = new URL(window.location.href);
        _u.searchParams.delete('ref');
        window.history.replaceState({}, document.title, _u.pathname + _u.search + _u.hash);
      } catch {}
    }
  } catch {}
  // V4 (사용자 명시 2026-05-15): _firstAppDayKey — 첫 진입 KST day key 기록.
  //   회전 카드 godongDiary 첫날 차단 (신규 미구독자) 등 first-day cohort 가드 용.
  //   기존 사용자 (key 없음) = 한 번 init 시 today key set → 그 이후 부터 정상.
  try {
    if (state && typeof todayKey === 'function') {
      state.preferences = state.preferences || {};
      if (!state.preferences._firstAppDayKey) {
        state.preferences._firstAppDayKey = todayKey();
        try { saveState(); } catch {}
      }
    }
  } catch {}
  const now = new Date();
  // V4 (v8 묶음 9): _core2NotUnlocked 신규 사용자 detect — Core 2 본 적 X 인 사용자만 4단 응답 disabled-locked
  if (typeof state._core2NotUnlocked === 'undefined') {
    const hasMission = Array.isArray(state.missions) && state.missions.length > 0;
    const hasShell = Array.isArray(state.shellCollection) && state.shellCollection.length > 0;
    const hasStrategy = Array.isArray(state.topicCards) && state.topicCards.some(c => c.category === 'strategy');
    state._core2NotUnlocked = !hasMission && !hasShell && !hasStrategy;
  }
  // V4 (v8 묶음 10): state.tutorialShown — Core 2/3-A/3-B/4 첫 경험 트리거 플래그 (옛 사용자도 한 번 받음 OK)
  // 사용자 명시 2026-05-06 ultrathink: pearls 추가 — 첫 진주 진입 V8 튜토리얼 마킹.
  if (!state.tutorialShown || typeof state.tutorialShown !== 'object') {
    state.tutorialShown = { core2: false, core3a: false, core3b: false, core3b_try: false, core4: false, pearls: false };
  } else {
    if (typeof state.tutorialShown.core2 === 'undefined') state.tutorialShown.core2 = false;
    if (typeof state.tutorialShown.core3a === 'undefined') state.tutorialShown.core3a = false;
    if (typeof state.tutorialShown.core3b === 'undefined') state.tutorialShown.core3b = false;
    if (typeof state.tutorialShown.core3b_try === 'undefined') state.tutorialShown.core3b_try = false;
    if (typeof state.tutorialShown.core4 === 'undefined') state.tutorialShown.core4 = false;
    if (typeof state.tutorialShown.pearls === 'undefined') state.tutorialShown.pearls = false;
  }
  // 사용자 명시 2026-05-06 ultrathink: 게스트 출신 detect — 게스트 진입 시 set 한 sessionStorage 마커가 있고 + 인증 사용자면 = promote 직후.
  // state.preferences._wasGuestPromoted 영속화 → 비밀번호 설정 직후 PWA 유도 trigger 에서 사용.
  try {
    if (sessionStorage.getItem('soragodong_was_guest') && state && !state.isGuest) {
      state.preferences = state.preferences || {};
      state.preferences._wasGuestPromoted = true;
      sessionStorage.removeItem('soragodong_was_guest');
      saveState();
    }
  } catch {}
  // V4 (v8 묶음 7): Core 2 reload 후 깜빡임 점 갱신 — sessionStorage / state._beachJustUnlocked 체크
  setTimeout(() => { if (typeof _checkCore2JustFinished === 'function') _checkCore2JustFinished(); }, 200);
  // 사용자 명시 2026-05-06: Core 1 reload 후 환영 선물 모달 자동 트리거 폐기. 마커도 정리.
  try { sessionStorage.removeItem('soragodong_v4_welcome_gift_pending'); } catch {}
  // V4 (사용자 명시 2026-05-04 — v7 §11 / v8 §11): 4AM cutoff 자동 돌연변이 깨달음 추출 후 다음 진입 안내
  if (state._mutationCutoffExtractedAt) {
    const _atMs = new Date(state._mutationCutoffExtractedAt).getTime();
    if (Date.now() - _atMs < 24 * 3600 * 1000) {
      setTimeout(() => { if (typeof showToast === 'function') showToast('🧬 어제 돌연변이 대화 깨달음 — 홈 ✨'); }, 1500);
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
  // 사용자 명시 2026-05-06 ultrathink (perf): 2000ms → 200ms — 다음 진입 cache-hit 보장 빠르게.
  if ('serviceWorker' in navigator) {
    setTimeout(() => {
      navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW register:', e));
    }, 200);
    // Phase B (사용자 명시 2026-05-17): SW push → 이미 열린 client 면 hookCardTap 직접 호출.
    try {
      navigator.serviceWorker.addEventListener('message', (event) => {
        const msg = event.data || {};
        if (msg.type === 'hook-trigger' && msg.hookId && typeof hookCardTap === 'function') {
          try { hookCardTap(msg.hookId); } catch (e) { console.warn('[hookTrigger msg]', e); }
        }
      });
    } catch (e) { console.warn('[SW message listener]', e); }
  }
  // 사용자 명시 2026-05-06 ultrathink (perf): boot splash 안전망 — init() 어떤 경로 fail 이라도 7초 후 자동 hide.
  setTimeout(() => { if (typeof _hideBootSplash === 'function') _hideBootSplash(); }, 7000);
  // 사용자 명시 2026-05-06 ultrathink: PWA 스티키 button — 모든 진입 경로 공통 노출 (가드는 _ensurePwaStickyBtn 안).
  setTimeout(() => { if (typeof _ensurePwaStickyBtn === 'function') _ensurePwaStickyBtn(); }, 1500);

  // ── AUTH GATE ──
  // 사용자 보고 2026-05-03: 기존 사용자 진입 초반의 nav click → '잠겨있어' 모달 = 버그.
  // root cause = cloud load 끝 전 = state.unlocked default (모두 false) → isCoreLocked = true → 잠금 모달.
  // fix = _initialDataLoading flag = isCoreLocked 우회 (cloud load 끝 후 set false).
  window._initialDataLoading = true;
  const authed = await checkSession();
  try { performance.mark('sessionEnd'); } catch (e) {}
  if (!authed) {
    // 사용자 명시 2026-05-06 ultrathink: 자동 anonymous 폐기 → 첫 화면에서 사용자가 '로그인' / '둘러보기' 선택.
    // 게스트는 명시 button click 으로 entry — 의도 분명 + UX 친근.
    // V4 (사용자 명시 2026-05-17 ultrathink): TWA (Play Store 앱) 진입 시 chooser 우회 → 자동 게스트 진입.
    //   웹 (브라우저) 은 기존 chooser 유지. 로그인 진입은 게스트 모드 안에서 가능 (나 탭 nudge / 설정).
    //   anonymous signup 실패 시 chooser fallback (alert dead-end 회피).
    if (typeof _isTWAEnv === 'function' && _isTWAEnv() && typeof signInAnonymouslyForGuest === 'function') {
      try {
        const r = await signInAnonymouslyForGuest();
        if (r && r.ok) {
          try { sessionStorage.setItem('soragodong_was_guest', '1'); } catch {}
          window.location.reload();
          return;
        }
        console.warn('[twa guest auto] sign-in fail — fallback to chooser:', r);
      } catch (e) {
        console.warn('[twa guest auto] throw — fallback to chooser:', e);
      }
    }
    showLoginScreen();
    window._initialDataLoading = false;
    return;
  }
  // Authenticated OR Guest — .app 노출
  document.getElementById('loginScreen').style.display = 'none';
  document.querySelector('.app').style.display = 'flex';

  // 사용자 보고 2026-05-14 ultrathink: 회전 카드 너무 늦게 나타남 jank — cloud RTT (~200-800ms) 전 localStorage cache 로 state 우선 채움 + home 영역 render. cloud 도착 후 line 250- 의 render 흐름이 다시 호출 → 최신 갱신. localStorage 가 평문 JSON 이라 E2EE 무관.
  try {
    const _localRaw = localStorage.getItem(V4_LOCAL_STORAGE_KEY);
    if (_localRaw) {
      const _parsed = JSON.parse(_localRaw);
      if (_parsed && typeof _parsed === 'object') {
        state = { ...DEFAULT_STATE, ...state, ..._parsed };
      }
    }
  } catch (e) { console.warn('[init eager localStorage cache]', e); }

  // 사용자 명시 2026-05-06 ultrathink (perf): 인증 통과 → splash hide.
  if (typeof _hideBootSplash === 'function') _hideBootSplash();

  // 사용자 보고 2026-05-14 ultrathink: home 영역 critical render (회전 카드 / 체크인 카드 / 오늘 미션 / 마법고동) — localStorage cache 로 즉시 표시. cloud 도착 후 line 250- 의 render 흐름이 다시 호출 → 최신 갱신 (flicker 작음, 같은 카드 type 의 content 갱신).
  try {
    if (typeof renderRotatingCard === 'function') renderRotatingCard();
    if (typeof renderTodayMission === 'function') renderTodayMission();
    // (renderMainAction/renderReviewPreview/renderYesterdayChangeHint 폐기 — 회전카드 안 4-source 로 흡수)
  } catch (e) { console.warn('[init eager home render]', e); }

  // 사용자 요청 2026-04-28: 서버 시간 동기화 (디바이스 시계 잘못돼도 보정)
  syncServerTime();  // fire-and-forget

  await loadFromCloud();
  try { performance.mark('cloudEnd'); } catch (e) {}
  window._initialDataLoading = false;

  // 사용자 요청 2026-05-11: 영상 마케팅 first-touch attribution upload (fire-and-forget, 이미 업로드된 사용자는 즉시 return).
  if (typeof maybeUploadAcquisition === 'function') {
    maybeUploadAcquisition().catch(() => {});
  }

  // 사용자 보고 2026-05-06 ultrathink (재): sim 튜토 sessionStorage 마커 → state.tutorialShown 복원 = loadFromCloud 후로 이동.
  // 옛 위치 (cloud load 전) = cloud 데이터가 우리 set 한 true 를 false 로 덮어씀 → 매번 fire 버그.
  // 인증 사용자: cloud row 가 옛 false 인데 reload 후 마커 살아있으니 우리가 true 강제 set + saveState — 다음 cloud sync 에 반영.
  try {
    state.tutorialShown = state.tutorialShown || {};
    if (sessionStorage.getItem('soragodong_v4_pearl_tutorial_done')) {
      state.tutorialShown.pearls = true;
      sessionStorage.removeItem('soragodong_v4_pearl_tutorial_done');
      try { saveState(); } catch {}
    }
  } catch {}
  if (typeof _restoreSimTutorialMarkersFromSession === 'function') {
    try { _restoreSimTutorialMarkersFromSession(); } catch (e) { console.warn('[sim restore]', e); }
  }

  // 사용자 보고 2026-05-06: 모바일 KG이니시스 = 결제창 redirect 흐름 → 돌아온 URL 의 paymentId query 처리.
  if (typeof _handlePaymentReturn === 'function') {
    _handlePaymentReturn().catch(e => console.warn('paymentReturn:', e));
  }

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

  // 사용자 보고 2026-05-10: 월간 리뷰 'AI 핵심 통찰 요약 받기' = '리뷰 못 찾음' 버그.
  //   root cause: 옛 review 가 id 필드 없이 push 됨 (id 박는 fix 사용자 보고 2026-05-08 이후) → onclick 의 review.id || '' = '' → 매칭 X.
  //   fix: id 누락 review 자동 backfill (init 1회).
  try {
    const _bf = (arr, prefix) => {
      if (!Array.isArray(arr)) return false;
      let touched = false;
      arr.forEach((r, i) => {
        if (r && (!r.id || r.id === '')) {
          r.id = prefix + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 6);
          touched = true;
        }
      });
      return touched;
    };
    let _bfTouched = false;
    if (_bf(state.weeklyReviews, 'wr_')) _bfTouched = true;
    if (_bf(state.monthlyReviews, 'mr_')) _bfTouched = true;
    if (_bf(state.quarterlyReviews, 'qr_')) _bfTouched = true;
    if (_bf(state.annualReviews, 'ar_')) _bfTouched = true;
    if (_bfTouched) {
      saveState();
      // 사용자 보고 2026-05-10: backfill 후 renderArchiveReviews 호출 — 옛 button onclick HTML 의 빈 id 갱신.
      if (typeof renderArchiveReviews === 'function') {
        try { renderArchiveReviews(); } catch {}
      }
    }
  } catch (e) { console.warn('[review id backfill]:', e); }

  // 사용자 명시 2026-05-10: 테스트 계정 (soragodongapp@gmail.com) 자동 설정.
  // 사용자 명시 2026-05-11 ultrathink (3차 정정): testerMode 자동 OFF. 우회 효과 (V8 튜토 / 코어 튜토 skip) 는 명시적 flag (tutorialVersion='v8-start' / _coreTutorialAutoStarted=true) 로 보장 — testerMode 가드에 의존 X.
  //   E2EE setup 모달 (필수 동의 항목 포함) 은 그대로 뜨도록 _e2eeOptedOut 도 set 안 함 (recovery 만 skip 위해 옛 _e2eeOptedOut 유지).
  //   비밀번호 길이는 _e2eeValidatePassword 가 테스트 계정 한정 8자 허용 (별도 fix).
  try {
    if (session && session.user && session.user.email === 'soragodongapp@gmail.com') {
      if (!state.preferences) state.preferences = {};
      let _testTouched = false;
      if (state.preferences.testerMode === true) { state.preferences.testerMode = false; _testTouched = true; }
      if (state.hasSeenWelcomeTutorial !== true) { state.hasSeenWelcomeTutorial = true; _testTouched = true; }
      if (state.hasSeenV3Tour !== true) { state.hasSeenV3Tour = true; _testTouched = true; }
      if (state.preferences._tutorialDismissed !== true) { state.preferences._tutorialDismissed = true; _testTouched = true; }
      // 사용자 명시 2026-05-11 ultrathink: recovery 모달은 skip (입력 창 안 뜸). setup 모달 (설정 창) 은 maybeShowE2EESetupForNewUser 안 테스트 계정 가드 우회로 매번 표시 — 필수 동의 항목 매번 확인.
      if (state.preferences._e2eeOptedOut !== true) { state.preferences._e2eeOptedOut = true; _testTouched = true; }
      if (state.tutorialVersion !== 'v8-start') { state.tutorialVersion = 'v8-start'; _testTouched = true; }
      if (state.preferences._coreTutorialAutoStarted !== true) { state.preferences._coreTutorialAutoStarted = true; _testTouched = true; }
      if (_testTouched) saveState();
    }
  } catch (e) { console.warn('[test account autoConfig]:', e); }

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
  // V4 (사용자 명시 2026-05-06 ultrathink): V8 시작 튜토리얼 우선 — 게스트 첫 진입 / 카카오 신규 (게스트 이력 X) 면 fire.
  // 그 외 = 기존 maybeShowFirstTimeIntro fallback.
  // 사용자 명시 2026-05-06 추가 ultrathink: V8 면 즉시 fire (300ms — render 직후), legacy 는 4500ms 유지.
  setTimeout(() => {
    if (typeof runStartTutorialV8 === 'function' && typeof shouldRunStartTutorialV8 === 'function' && shouldRunStartTutorialV8()) {
      runStartTutorialV8().catch(e => console.warn('[v8 tutorial entry]:', e));
    } else {
      setTimeout(async () => {
        if (typeof maybeShowFirstTimeIntro === 'function') {
          try { await maybeShowFirstTimeIntro(); } catch (e) { console.warn('firstTimeIntro:', e); }
        }
      }, 4200);  // legacy fallback — 기존 4500 거의 유지
    }
  }, 300);
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
  // 사용자 보고 2026-05-12 ultrathink: init 시 _billingCache 자동 populating.
  //   옛: refreshBillingStatus 가 settings 화면 진입 시만 호출 → settings 안 들른 사용자 (예: 새 계정 + 결제 직후 chat 로 진입) 의 _billingCache 영원히 비어있음.
  //   영향: _maybeAutoForceAnalyzeFreeTier (chat 3턴마다) 가 isPaid=false 로 판정 → paid 구독자도 매 3턴 자동 분석 trigger.
  //   fix: init 4초 후 refreshBillingStatus() 자동 호출 — status DOM 가드는 31-settings.js 에서 별도 분리됨 (DOM 없어도 _billingCache 갱신).
  if (typeof refreshBillingStatus === 'function') {
    setTimeout(() => { refreshBillingStatus().catch(e => console.warn('refreshBillingStatus init:', e)); }, 4000);
  }

  // V4 (사용자 명시 2026-05-16 cowork 디버그): _pendingExtract 안전망.
  //   원인: _archiveCurrentChapter 의 setTimeout(extract, 1500ms) 가 페이지 reload 로 죽으면
  //   (testerMode 토글 / 로그인 promote / 사용자 새로고침 / 탭 닫기 등) archiveItem._pendingExtract: true 마킹만 남고 traits 안 들어옴.
  //   fix: 다음 init 시 stuck archive 순회해서 extract 재시도.
  setTimeout(() => {
    try {
      if (!Array.isArray(state.chatArchive) || state.chatArchive.length === 0) return;
      if (typeof _canAI !== 'function' || !_canAI()) return;
      if (window._onbTutorialMode) return;
      if (state.preferences && state.preferences.testerMode) return;
      const stuckArchives = state.chatArchive.filter(a =>
        a && !a._deleted && a._pendingExtract && Array.isArray(a.messages) && a.messages.length >= 6
      );
      if (stuckArchives.length === 0) return;
      console.log('[pending extract recovery] stuck archives:', stuckArchives.length);
      (async () => {
        for (const arch of stuckArchives) {
          try {
            const _extractMsgs = (typeof _chapterExtractMessages === 'function')
              ? _chapterExtractMessages(arch)
              : (arch.messages || []).filter(m => m && !m.typing && !m.error);
            const _normalMsgs = _extractMsgs.filter(m => !m || !m.isSimulationContext);
            const _simMsgs = _extractMsgs.filter(m => m && m.isSimulationContext);
            if (typeof extractChapterCaseAnalysis === 'function') {
              if (_normalMsgs.length >= 3) {
                try { await extractChapterCaseAnalysis(_normalMsgs); }
                catch (e) { console.warn('[pending recovery] case fail:', arch.id, e); }
              }
              if (_simMsgs.length >= 3) {
                try { await extractChapterCaseAnalysis(_simMsgs, { isSimulation: true }); }
                catch (e) { console.warn('[pending recovery] case sim fail:', arch.id, e); }
              }
            }
            if (typeof extractPreviousChapterTopics === 'function') {
              if (_normalMsgs.length >= 3) {
                try { await extractPreviousChapterTopics(_normalMsgs); }
                catch (e) { console.warn('[pending recovery] topic fail:', arch.id, e); }
              }
              if (_simMsgs.length >= 3) {
                const _beforeSim = (state.topicCards || []).length;
                try {
                  await extractPreviousChapterTopics(_simMsgs);
                  const _added = (state.topicCards || []).slice(_beforeSim);
                  _added.forEach(card => { if (card) card.source = 'simulation'; });
                } catch (e) { console.warn('[pending recovery] topic sim fail:', arch.id, e); }
              }
            }
            delete arch._pendingExtract;
            delete arch._pendingCaseAnalysis;
            saveState();
            if (typeof renderChatArchiveModal === 'function') renderChatArchiveModal();
          } catch (e) { console.warn('[pending recovery] guard:', arch.id, e); }
        }
      })();
    } catch (e) { console.warn('[pending recovery] outer:', e); }
  }, 5000);

  applyNightMode();
  renderModes();
  if (typeof renderYesterdayCard === 'function') renderYesterdayCard();
  renderTodayMission();
  renderShellBar();
  renderActiveDecisionsHomeV3();
  renderReviewPrompts();
  renderPredictionFollowups();
  renderMainAction();
  // 사용자 명시 2026-05-17 ultrathink (revert): 마법고동 미니 카드 복원.
  renderDecisionMiniLink();
  // 신규 소형 카드 (a) 리뷰 미리보기 + (b) 자산 변화 hint — 공존.
  if (typeof renderReviewPreview === 'function') renderReviewPreview();
  if (typeof renderYesterdayChangeHint === 'function') renderYesterdayChangeHint();
  // 사용자 명시 2026-05-09: init 시 회전 카드 ('🌟 오늘의 너') 호출 누락 → 첫 로드 시 안 보임 fix.
  if (typeof renderRotatingCard === 'function') renderRotatingCard();
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

  // Hook 온보딩 (Section 19.1) — session 2회째 시간 prompt.
  //   1) init count 증가 (cloud load 후라서 누적 cloud 값 기준).
  //   2) 조건 통과 시 모달 (살짝 delay — 화면 안정 후).
  if (typeof _hookOnbBumpInitCount === 'function') _hookOnbBumpInitCount();
  if (typeof maybeShowHookOnboarding === 'function') {
    setTimeout(() => { try { maybeShowHookOnboarding(); } catch (e) { console.warn('[hookOnb]', e); } }, 2200);
  }

  // Hook 생성 — cooldown / cold-start gate / 풍부도 / askedHooks cooldown 다 통과 시 1회 fire.
  //   (E2EE 호환: backend cron 대신 client 가 substrate 모아서 POST.)
  //   온보딩 모달 보다 살짝 더 지연 — 사용자 시간 prompt 진행 중일 때 race 회피.
  if (typeof maybeGenerateHook === 'function') {
    setTimeout(() => { maybeGenerateHook().catch(e => console.warn('[hook]', e)); }, 5000);
  }

  // Phase B: Push 클릭 → /?hookTrigger=<id> deep link 자동 진입.
  //   init 끝에서 URL 파싱 → cloud load 완료 후 hookCardTap 호출.
  //   URL clean — replaceState 로 query param 제거 (재진입 시 leak X).
  try {
    const _hookTriggerId = new URLSearchParams(window.location.search).get('hookTrigger');
    if (_hookTriggerId && typeof hookCardTap === 'function') {
      setTimeout(() => {
        try { hookCardTap(_hookTriggerId); } catch (e) { console.warn('[hookTrigger]', e); }
      }, 3000);  // cloud load 끝나고 chatMessages 안정화 후
      try {
        const _u = new URL(window.location.href);
        _u.searchParams.delete('hookTrigger');
        window.history.replaceState({}, document.title, _u.pathname + _u.search + _u.hash);
      } catch {}
    }
  } catch (e) { console.warn('[hookTrigger parse]', e); }
}

