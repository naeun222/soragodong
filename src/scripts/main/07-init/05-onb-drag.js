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
  // V4 (사용자 명시 2026-05-06 ultrathink): V8 시작 튜토리얼로 대체. 옛 진입 = no-op.
  // ONBOARDING_STEPS 빈 배열로 stub 됐고 모든 진입 (startCoreTutorial / startWelcomeTutorial / replay) 도 no-op.
  console.warn('[legacy] startInteractiveOnboarding — V8 시작 튜토리얼로 대체됨, no-op');
  return;
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

