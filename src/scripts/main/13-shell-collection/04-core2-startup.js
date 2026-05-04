async function startCore2() {
  // 1. 비활성화 풀림
  state._core2NotUnlocked = false;
  // 2. testerMode ON (사용자 본 데이터 격리)
  state.preferences = state.preferences || {};
  if (!state.preferences.testerMode && typeof toggleTesterMode === 'function') {
    try { await toggleTesterMode(); } catch (e) { console.warn('startCore2 testerMode:', e); }
    window._onbAutoTesterMode = true;
  }
  saveState();
  // 3. Core 1 분석 자동 복원 — _intakeArchiveId 또는 첫 archive (옛 사용자 fallback = 시드 시나리오)
  const _activeArchives = (state.chatArchive || []).filter(a => a && !a._deleted);
  const targetArchive = _activeArchives.length > 0
    ? (state._intakeArchiveId
        ? _activeArchives.find(a => a && a.id === state._intakeArchiveId)
        : _activeArchives[0])
    : null;
  if (targetArchive && Array.isArray(targetArchive.messages) && targetArchive.messages.length > 0) {
    state.chatMessages = JSON.parse(JSON.stringify(targetArchive.messages));
  } else {
    // Fallback (옛 사용자 _intakeArchiveId 없음) — 시드 4단 분석 시나리오
    state.chatMessages = [
      { role: 'user', content: '카페에서 30분 집중 시도해봤는데 잘 안 돼.', timestamp: new Date().toISOString() },
      {
        role: 'assistant',
        content: '[상황]\n카페 30분 집중 시도\n\n[내가 본 것]\n환경 셋업으로 집중 진입을 *시도*하는 패턴 — 좋은 자기 관찰이야 ✦\n\n[이게 뭐냐면]\n환경 단서가 행동을 끌어주는 *행동 prompting*. 의지에 기대는 대신 환경이 하게 만드는 거야.\n\n[이럴 땐 이렇게]\n같은 자리/시간 반복 → 자동으로 집중 모드 진입.\n\n[오늘의 제안]\n오늘 카페에서 30분 노트북 펴고 한 단락 쓰기',
        timestamp: new Date().toISOString(),
        fromDeeper: true,
        proposal: true,
        situation: '카페 30분 집중 시도',
        proposalData: { title: '카페 30분 한 단락' }
      }
    ];
  }
  saveState();
  showToast('🎭 시뮬 모드 시작 — 본 데이터 안전');
  // 4. 채팅탭 진입 + 튜토리얼 시작
  if (typeof showScreen === 'function') showScreen('chat');
  if (typeof renderChat === 'function') renderChat();
  setTimeout(() => {
    const idx = (typeof ONBOARDING_STEPS !== 'undefined') ? ONBOARDING_STEPS.findIndex(s => s && s.id === 'click_strategy') : -1;
    if (idx < 0) { console.warn('[startCore2] click_strategy step missing'); return; }
    _onbStep = idx;
    _onbTutorialMode = true;
    window._onbTutorialMode = true;
    if (typeof _activeCoreId !== 'undefined') _activeCoreId = 'core2';
    if (typeof onbRenderStep === 'function') onbRenderStep();
  }, 400);
}

function _finishCore2() {
  state._beachJustUnlocked = true;
  try { sessionStorage.setItem('soragodong_v4_beach_just_unlocked', '1'); } catch {}
  state.tutorialShown = state.tutorialShown || {};
  state.tutorialShown.core2 = true;
  // testerMode OFF (자동 toggle 한 경우만)
  if (window._onbAutoTesterMode && state.preferences && state.preferences.testerMode) {
    try { toggleTesterMode(); } catch (e) { console.warn('_finishCore2 testerMode OFF:', e); }
    window._onbAutoTesterMode = false;
  }
  state.chatMessages = [];
  saveState();
  if (typeof onbClose === 'function') onbClose();
  showToast('🎭 시뮬 끝 — 모래사장 가보자 ✨');
  if (typeof showScreen === 'function') showScreen('home');
}

function _checkCore2JustFinished() {
  // init 시점 호출 — sessionStorage 또는 state._beachJustUnlocked 체크 → 깜빡임 점 갱신
  if (typeof _refreshBeachPulse === 'function') _refreshBeachPulse();
}

