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
  // 사용자 명시 2026-05-06 ultrathink: 진주 튜토 testerMode OFF reload 후 backup 복원 시 마킹 유지 — sessionStorage 마커 → state 적용.
  try {
    if (sessionStorage.getItem('soragodong_v4_pearl_tutorial_done')) {
      state.tutorialShown.pearls = true;
      sessionStorage.removeItem('soragodong_v4_pearl_tutorial_done');
    }
  } catch {}
  // 사용자 명시 2026-05-06 ultrathink: 일기/깨달음/마법/리뷰/숙고 sim 튜토 마커 → state.tutorialShown 복원.
  if (typeof _restoreSimTutorialMarkersFromSession === 'function') {
    try { _restoreSimTutorialMarkersFromSession(); } catch (e) { console.warn('[sim restore]', e); }
  }
  // V4 (v8 묶음 7): Core 2 reload 후 깜빡임 점 갱신 — sessionStorage / state._beachJustUnlocked 체크
  setTimeout(() => { if (typeof _checkCore2JustFinished === 'function') _checkCore2JustFinished(); }, 200);
  // 사용자 명시 2026-05-06: Core 1 reload 후 환영 선물 모달 자동 트리거 폐기. 마커도 정리.
  try { sessionStorage.removeItem('soragodong_v4_welcome_gift_pending'); } catch {}
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
  // 사용자 명시 2026-05-06 ultrathink (perf): 2000ms → 200ms — 다음 진입 cache-hit 보장 빠르게.
  if ('serviceWorker' in navigator) {
    setTimeout(() => {
      navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW register:', e));
    }, 200);
  }
  // 사용자 명시 2026-05-06 ultrathink (perf): boot splash 안전망 — init() 어떤 경로 fail 이라도 7초 후 자동 hide.
  setTimeout(() => { if (typeof _hideBootSplash === 'function') _hideBootSplash(); }, 7000);

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
    // 사용자 명시 2026-05-06 ultrathink: 자동 anonymous 폐기 → 첫 화면에서 사용자가 '로그인' / '둘러보기' 선택.
    // 게스트는 명시 button click 으로 entry — 의도 분명 + UX 친근.
    showLoginScreen();
    window._initialDataLoading = false;
    return;
  }
  // Authenticated OR Guest — .app 노출
  document.getElementById('loginScreen').style.display = 'none';
  document.querySelector('.app').style.display = 'flex';
  // 사용자 명시 2026-05-06 ultrathink (perf): 인증 통과 → splash hide.
  if (typeof _hideBootSplash === 'function') _hideBootSplash();

  // 사용자 요청 2026-04-28: 서버 시간 동기화 (디바이스 시계 잘못돼도 보정)
  syncServerTime();  // fire-and-forget

  await loadFromCloud();
  window._initialDataLoading = false;

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

