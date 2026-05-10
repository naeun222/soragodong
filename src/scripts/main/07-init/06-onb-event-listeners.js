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
        // 사용자 명시 2026-05-11 ultrathink (근본): 결과 체크 대기 중인 (completed + !attemptStatus + strategyId 있음) 미션만 시뮬 대상.
        // 이전 = 무차별 가장 최근 completed → 이미 worked 처리된 미션 / standalone 미션을 잡아 시뮬 후 양생방 카드 결과 체크 미스매치.
        const recentCompleted = (state.missions || [])
          .filter(m => m.status === 'completed' && !m.attemptStatus && m.strategyId)
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
  // 사용자 명시 2026-05-06: Core 1 끝 환영 선물 모달 자동 트리거 폐기 — '얼리 플랜 자동 적용' 안내가
  // 가입 전환 모달 done step + 설정 카드에서 이미 노출. Tutorial 끝났을 때 별도 모달 X.
  // (devPreviewWelcomeBonus 만 dev 도구로 유지.)
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

  // 사용자 명시 2026-05-05: 100만 토큰 환영 선물 정책 폐기 → 처음 한 달 무료 (얼리 플랜) 자동 활성화 (ensureBillingRow). 튜토리얼 완주 시 별도 grant 호출 불필요.
}

