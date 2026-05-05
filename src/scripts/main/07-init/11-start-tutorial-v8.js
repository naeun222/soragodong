// ═══════════════════════════════════════════════════════════════
// V4 (사용자 명시 2026-05-06 ultrathink): V8 시작 튜토리얼
// 게스트 첫 진입 / 카카오 신규 (게스트 이력 X) → 자동 fire.
// 흐름: cold open hero (안녕? → differentiator) → intake 모달 →
//       chat 탭 자동 + 4단 분석 메시지 inject → 마무리 코치마크 →
//       헤더 모델 토글 코치마크 → 종료 (tutorialVersion='v8-start' 마킹).
// 시드 / 테스터 무관 — testerMode 면 skip.
// ═══════════════════════════════════════════════════════════════

function shouldRunStartTutorialV8() {
  if (!state) return false;
  if (state.tutorialVersion === 'v8-start') return false;
  if (state.preferences && state.preferences.testerMode) return false;
  // 게스트 첫 진입 — intakeWorry 비어있고 chatMessages 비어있으면 첫 진입
  if (state.isGuest) {
    const hadIntake = Array.isArray(state.intakeWorry) && state.intakeWorry.length > 0;
    return !hadIntake;
  }
  // 인증 사용자 (카카오 신규 등) — 데이터 비어있으면 신규
  const hasAnyData =
    (Array.isArray(state.entries) && state.entries.length > 0) ||
    (Array.isArray(state.chatMessages) && state.chatMessages.length > 0) ||
    (Array.isArray(state.intakeWorry) && state.intakeWorry.length > 0) ||
    (Array.isArray(state.shellCollection) && state.shellCollection.length > 0) ||
    (Array.isArray(state.topicCards) && state.topicCards.length > 0) ||
    (Array.isArray(state.missions) && state.missions.length > 0);
  return !hasAnyData;
}

async function runStartTutorialV8() {
  if (!shouldRunStartTutorialV8()) return;
  if (window._v8TutorialRunning) return;
  window._v8TutorialRunning = true;
  // V8 튜토 동안 다른 자동 모달 (E2EE setup 등) 이 위로 뜨지 않도록 — init 의 setTimeout 이미 발사됐을 수 있음.
  // 옛 코어 자동 진입 차단 — V8 가 시작 튜토를 책임지므로 maybeShowFirstTimeIntro 의 startCoreTutorial 진입 막기.
  // tutorialVersion 마킹 = 시작 시점 — 중간 reload 시 재진입 차단 (사용자 신뢰 우선, 같은 화면 반복 회피).
  state.preferences = state.preferences || {};
  state.preferences._coreTutorialAutoStarted = true;
  state.tutorialVersion = 'v8-start';
  try { saveState(); } catch {}
  try {
    await _v8HeroSequence();           // 화면 1·2
    await _v8RunIntakeAndInject();     // 모달 + chat inject
    await _v8Sleep(900);               // chat 메시지 / 스크롤 settle
    await _v8CoachmarkEndChapter();    // 마무리 코치마크
    await _v8Sleep(250);
    await _v8CoachmarkModelToggle();   // 헤더 모델 토글 코치마크
  } catch (e) {
    console.warn('[v8 tutorial]', e);
  } finally {
    window._v8TutorialRunning = false;
    _v8CleanupAll();
    // V8 종료 시 Core 2 잠금 해제 — 첫 사이클 (intake → chat → archive) 완수.
    // 4단 카드의 ✦ 해볼게 / 🧬 전략으로 버튼이 disabled-locked 상태가 안 되도록.
    if (state._core2NotUnlocked) {
      state._core2NotUnlocked = false;
      try { saveState(); } catch {}
      try { if (typeof renderChat === 'function') renderChat(); } catch {}
    }
  }
}

// ─────────────────────────────────────────────────────────────
// HERO — 화면 1 "안녕?" + 화면 2 differentiator
// ─────────────────────────────────────────────────────────────

function _v8HeroSequence() {
  return new Promise((resolve) => {
    const root = document.getElementById('v8TutorialRoot');
    if (!root) { resolve(); return; }
    root.setAttribute('aria-hidden', 'false');
    root.innerHTML = `
      <div id="v8Hero" class="v8-hero">
        <img class="v8-hero-godong" src="/godongicon.png" alt="">
        <div class="v8-hero-text" id="v8HeroText"></div>
        <div class="v8-hero-tap-hint" id="v8HeroTapHint">✦</div>
      </div>
    `;
    const hero = document.getElementById('v8Hero');
    const textEl = document.getElementById('v8HeroText');
    const hint = document.getElementById('v8HeroTapHint');
    if (!hero || !textEl) { resolve(); return; }

    let phase = 1;
    let acceptingTap = false;

    // 화면 1: "안녕?" 타이핑
    const screen1 = '안녕?';
    const typeOne = (i) => {
      if (i > screen1.length) {
        setTimeout(() => {
          if (hint) hint.classList.add('v8-pulse');
          acceptingTap = true;
        }, 1100);
        return;
      }
      textEl.textContent = screen1.slice(0, i);
      setTimeout(() => typeOne(i + 1), 130);
    };
    setTimeout(() => typeOne(1), 600);

    // 화면 2: cascade fade
    const renderScreen2 = () => {
      acceptingTap = false;
      if (hint) hint.classList.remove('v8-pulse');
      textEl.classList.add('v8-hero-text-fadeout');
      setTimeout(() => {
        textEl.classList.remove('v8-hero-text-fadeout');
        textEl.innerHTML = `
          <div class="v8-hero-line v8-hero-line-1">다른 AI랑 나는 좀 달라.</div>
          <div class="v8-hero-line v8-hero-line-2">너를 기억해.</div>
          <div class="v8-hero-line v8-hero-line-3">그리고 시간이 지나면 — 다시 물어봐.</div>
        `;
        // 1500ms 정적 후 hint 호흡
        setTimeout(() => {
          if (hint) hint.classList.add('v8-pulse');
          acceptingTap = true;
        }, 3000);
      }, 350);
    };

    const onTap = (e) => {
      if (!acceptingTap) return;
      e.preventDefault();
      if (phase === 1) {
        phase = 2;
        renderScreen2();
      } else {
        // 화면 2 → 모달로 전환 (hero 페이드 아웃 후 resolve)
        acceptingTap = false;
        if (hint) hint.classList.remove('v8-pulse');
        hero.classList.add('v8-hero-fadeout');
        setTimeout(() => {
          root.innerHTML = '';
          root.setAttribute('aria-hidden', 'true');
          hero.removeEventListener('click', onTap);
          resolve();
        }, 450);
      }
    };
    hero.addEventListener('click', onTap);
  });
}

// ─────────────────────────────────────────────────────────────
// INTAKE 모달 + chat 탭 자동 + 4단 분석 메시지 inject
// ─────────────────────────────────────────────────────────────

async function _v8RunIntakeAndInject() {
  // _canAI 가드 — 세션 확보 못 하면 토스트 후 종료
  if (typeof _canAI === 'function' && !_canAI()) {
    if (typeof showToast === 'function') showToast('🔑 잠시 후 다시 시도해줘');
    return;
  }
  if (typeof runIntakeFlow !== 'function') {
    console.warn('[v8] runIntakeFlow 부재');
    return;
  }
  // intake 단계 5 stash 가 _onbTutorialMode 플래그 의존 → 우회 위해 v8 전용 플래그 set
  window._v8TutorialMode = true;
  window._onbTutorialMode = true;  // step5 의 stash 분기 reuse — _startIntakeFromTutorial 가 쓰는 그 플래그
  try {
    await runIntakeFlow();
  } catch (e) { console.warn('[v8 intake]', e); }
  window._onbTutorialMode = false;
  window._v8TutorialMode = false;

  const analysis = window._lastIntakeAnalysis;
  const worries = Array.isArray(window._lastIntakeWorries) ? window._lastIntakeWorries : [];
  delete window._lastIntakeAnalysis;
  delete window._lastIntakeWorries;

  // chat 탭으로 자동 전환
  if (typeof showScreen === 'function') showScreen('chat');

  if (!analysis || (!analysis.diagnosis && !analysis.strategy)) return;

  state.chatMessages = state.chatMessages || [];
  const nowIso = new Date().toISOString();
  if (worries.length > 0) {
    state.chatMessages.push({
      role: 'user',
      content: worries.join('\n\n'),
      timestamp: nowIso
    });
  }
  // godong intro line — 사용자 명시 카피
  state.chatMessages.push({
    role: 'assistant',
    content: '방금 들은 거, 이렇게 봤어 —',
    timestamp: nowIso
  });
  // 4단 분석 (기존 _startIntakeFromTutorial 와 동일 포맷)
  const dim = (analysis.dimension || '환경').trim();
  const para = (analysis.paraphrase || '').trim();
  const diag = (analysis.diagnosis || '').trim();
  const strat = (analysis.strategy || '').trim();
  const observation = para || (diag ? diag.split(/[.。]\s/)[0] + '.' : '방금 들려준 마음, 정리해봤어.');
  const concept = `${dim} 차원이 작동하는 모습이 보여.${diag ? '\n' + diag : ''}`;
  const guide = strat || '천천히 같이 가보자.';
  const proposalText = strat ? strat.split(/[.。]\s/)[0].slice(0, 80) : '천천히 한 걸음';
  const fourStage = `[내가 본 것]\n${observation}\n\n[이게 뭐냐면]\n${concept}\n\n[이럴 땐 이렇게]\n${guide}\n\n[오늘의 제안]\n${proposalText}`;
  state.chatMessages.push({
    role: 'assistant',
    content: fourStage,
    fromDeeper: true,
    proposal: true,
    proposalData: { title: proposalText.slice(0, 40) || '오늘 한 걸음' },
    timestamp: nowIso
  });
  saveState();
  if (typeof renderChat === 'function') renderChat();
  setTimeout(() => { if (typeof scrollChatToBottom === 'function') scrollChatToBottom(true); }, 80);
}

// ─────────────────────────────────────────────────────────────
// 코치마크 — 가벼운 자체 인프라 (ONBOARDING_STEPS 분리)
// ─────────────────────────────────────────────────────────────

function _v8ShowCoachmark({ targetSelector, body, position = 'top', onAdvance }) {
  return new Promise((resolve) => {
    const root = document.getElementById('v8TutorialRoot');
    if (!root) { resolve(); return; }
    const target = targetSelector ? document.querySelector(targetSelector) : null;
    // 타겟이 화면에 없으면 코치마크 skip — 다음 단계로 진행
    if (!target || target.offsetParent === null) { resolve(); return; }
    root.setAttribute('aria-hidden', 'false');
    root.innerHTML = `
      <div id="v8Coach" class="v8-coach">
        <div class="v8-coach-mask"></div>
        <div class="v8-coach-bubble" id="v8CoachBubble">
          <div class="v8-coach-body">${body}</div>
          <button class="v8-coach-ok" id="v8CoachOk">알겠어 ✦</button>
        </div>
      </div>
    `;
    const bubble = document.getElementById('v8CoachBubble');
    const okBtn = document.getElementById('v8CoachOk');
    const ring = document.createElement('div');
    ring.className = 'v8-coach-ring';
    document.body.appendChild(ring);

    const place = () => {
      if (!target || !bubble) return;
      const r = target.getBoundingClientRect();
      // ring around target
      const pad = 8;
      ring.style.top = (r.top - pad) + 'px';
      ring.style.left = (r.left - pad) + 'px';
      ring.style.width = (r.width + pad * 2) + 'px';
      ring.style.height = (r.height + pad * 2) + 'px';
      // bubble position
      const bw = Math.min(320, window.innerWidth - 32);
      bubble.style.width = bw + 'px';
      const bh = bubble.offsetHeight || 120;
      let top, left;
      if (position === 'bottom') {
        top = r.bottom + 14;
        left = Math.max(16, Math.min(window.innerWidth - bw - 16, r.left + r.width / 2 - bw / 2));
      } else {
        top = r.top - bh - 14;
        left = Math.max(16, Math.min(window.innerWidth - bw - 16, r.left + r.width / 2 - bw / 2));
        if (top < 12) {
          // 위로 못 올라가면 아래로
          top = r.bottom + 14;
        }
      }
      bubble.style.top = top + 'px';
      bubble.style.left = left + 'px';
    };
    requestAnimationFrame(() => requestAnimationFrame(place));
    const onResize = () => place();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);

    const cleanup = () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
      try { ring.remove(); } catch {}
      root.innerHTML = '';
      root.setAttribute('aria-hidden', 'true');
    };

    const advance = () => {
      cleanup();
      if (typeof onAdvance === 'function') {
        try { onAdvance(); } catch {}
      }
      resolve();
    };
    if (okBtn) okBtn.addEventListener('click', advance);
  });
}

function _v8CoachmarkEndChapter() {
  const target = '.chat-end-btn';
  const body = `
    <div class="v8-coach-title">대화 마무리</div>
    <div class="v8-coach-text">
      다 얘기했다 싶으면 여기 눌러 ✓<br>
      내가 정리해서 도서관에 넣어둘게.<br>
      <span class="v8-coach-text-soft">나 탭에서도 보여.</span>
    </div>
  `;
  return _v8ShowCoachmark({ targetSelector: target, body, position: 'top' });
}

function _v8CoachmarkModelToggle() {
  // 헤더 첫 번째 godongicon button (메인 헤더 안)
  const target = '.header .js-chat-mode-btn';
  const body = `
    <div class="v8-coach-title">모델 깊이</div>
    <div class="v8-coach-text">
      여기 누르면 모델 바뀌어.<br>
      평소엔 가볍게, 깊게 가고 싶을 땐 깊게.
    </div>
  `;
  return _v8ShowCoachmark({ targetSelector: target, body, position: 'bottom' });
}

function _v8Sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function _v8CleanupAll() {
  const root = document.getElementById('v8TutorialRoot');
  if (root) {
    root.innerHTML = '';
    root.setAttribute('aria-hidden', 'true');
  }
  document.querySelectorAll('.v8-coach-ring').forEach(el => el.remove());
}
