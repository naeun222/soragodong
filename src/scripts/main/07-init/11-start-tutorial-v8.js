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
  if (hasAnyData) return false;
  // 사용자 명시 2026-05-06 ultrathink: 카카오 신규 (게스트 이력 X) = E2EE 비밀번호 모달 강제. V8 hero 가 모달 위로 떠 가독성 X / 사용자가 모달 처리 중 hero step 진행됨 → 보류.
  // E2EE 활성화 끝나는 hook (_e2eeSetupNewUser 후 setTimeout — 10-unified-consent-modal.js) 에서 직접 runStartTutorialV8 fire.
  // 게스트 → 카카오 promote (linkIdentity, 같은 uid) 의 경우 = state.tutorialVersion 이 이미 'v8-start' 거나 hasAnyData=true 라 위 가드에 걸려 fire X — 게스트 진행도 그대로 보존.
  const _e2eePending = !_e2eeEnabled && !_e2eeMasterKey;
  if (_e2eePending) {
    // 단, recovery (다른 device 진입) 등으로 이미 활성화 흐름 진행 중이면 fire (모달 안 뜸).
    try {
      if (localStorage.getItem('soragodong_v4_e2ee_recovery')) return true;
    } catch {}
    return false;
  }
  return true;
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
    // 사용자 명시 2026-05-06: 중간 단계 — 4단 분석 카드 읽기 안내 (마무리 직전 압박감 X).
    await _v8CoachmarkReadFourStage();
    await _v8Sleep(250);
    // 사용자 명시 2026-05-06 (추가): 분기 step — 이 대화 더 이어갈래 / 새로 할래.
    //   continue → 마무리는 설명만 하고 자동 advance / fresh → 사용자가 ✓ 직접 클릭.
    const branch = await _v8CoachmarkContinueOrFresh();
    await _v8Sleep(200);
    await _v8CoachmarkEndChapter(branch);
    await _v8Sleep(250);
    // 사용자 명시 2026-05-06 (추가): 마무리 멘트 step — 친절한 톤.
    await _v8CoachmarkClosing();
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
        <img class="v8-hero-godong" src="/godongicon.png" alt="소라고동" decoding="async" loading="eager">
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
    // V4 (사용자 명시 2026-05-14): 첫 진입 hero tap 대기 미세 축소 — 600/130/1100 → 400/110/700.
    const screen1 = '안녕?';
    const typeOne = (i) => {
      if (i > screen1.length) {
        setTimeout(() => {
          if (hint) hint.classList.add('v8-pulse');
          acceptingTap = true;
        }, 700);
        return;
      }
      textEl.textContent = screen1.slice(0, i);
      setTimeout(() => typeOne(i + 1), 110);
    };
    setTimeout(() => typeOne(1), 400);

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
          <div class="v8-hero-line v8-hero-line-3">그리고 시간이 지나면 —<br>너를 이해해.</div>
        `;
        // V4 (사용자 명시 2026-05-14): hero 화면 2 cascade 끝 (CSS line-3 = 1500ms) 직후 잠깐 dwell 후 tap — 3000 → 1800.
        setTimeout(() => {
          if (hint) hint.classList.add('v8-pulse');
          acceptingTap = true;
        }, 1800);
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

  if (!analysis || !analysis.text) return;

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
  // 사용자 명시 2026-05-08: AI 4단 raw text 그대로 push — askDeeper 와 100% 동일 시각.
  const fourStage = analysis.text;
  // proposal title 추출 — [오늘의 제안] 섹션 첫 줄.
  let proposalTitle = '오늘 한 걸음';
  const propMatch = fourStage.match(/\[오늘의 제안\]\s*([\s\S]+?)(?=\n\s*\[|$)/);
  if (propMatch) {
    const firstLine = propMatch[1].trim().split(/\n/)[0].trim();
    if (firstLine) proposalTitle = firstLine.slice(0, 40);
  }
  state.chatMessages.push({
    role: 'assistant',
    content: fourStage,
    fromDeeper: true,
    proposal: true,
    proposalData: { title: proposalTitle },
    timestamp: nowIso
  });
  // 사용자 명시 2026-05-06 ultrathink: 4단 분석 직후 '더 알고 싶어 ▾' 설명만. 마무리는 코치마크가 책임.
  state.chatMessages.push({
    role: 'assistant',
    content: '처음이라 위 4단으로 정리해줬어 ✦\n평소엔 답 아래 "더 알고 싶어 ▾" 누르면 이렇게 깊게 풀어줄게.',
    timestamp: nowIso
  });
  saveState();
  if (typeof renderChat === 'function') renderChat();
  setTimeout(() => { if (typeof scrollChatToBottom === 'function') scrollChatToBottom(true); }, 80);
}

// ─────────────────────────────────────────────────────────────
// 코치마크 — 가벼운 자체 인프라 (ONBOARDING_STEPS 분리)
// ─────────────────────────────────────────────────────────────

function _v8ShowCoachmark({ targetSelector, targetEl, body, position = 'top', interactive = false, waitFor, onAdvance, branchButtons, allowNoTarget = false, noMask = true }) {
  // 사용자 명시 2026-05-06 ultrathink: 모든 코치마크 default mask off — 다른 모달 / 화면 가독성 보존.
  // mask 가 진짜 필요한 곳만 noMask: false 로 명시.
  return new Promise((resolve) => {
    const root = document.getElementById('v8TutorialRoot');
    if (!root) { resolve(); return; }
    // 사용자 명시 2026-05-06: targetEl 직접 받는 옵션 추가 — 동적 selector (chat 메시지 등) 대응.
    const target = targetEl || (targetSelector ? document.querySelector(targetSelector) : null);
    // 사용자 명시 2026-05-06 (추가): allowNoTarget — 타겟 없어도 가운데 띄움 (마무리 멘트 등).
    if (!allowNoTarget && (!target || target.offsetParent === null)) { resolve(); return; }
    root.setAttribute('aria-hidden', 'false');
    // 사용자 명시 2026-05-06 (추가): branchButtons — 두 버튼 분기. interactive 와는 별개로 mask 표시.
    let buttonsHtml = '';
    if (branchButtons && branchButtons.length === 2) {
      buttonsHtml = `<div class="v8-coach-branch-row">
        <button class="v8-coach-branch-btn primary" data-branch="${branchButtons[0].value}">${branchButtons[0].label}</button>
        <button class="v8-coach-branch-btn ghost" data-branch="${branchButtons[1].value}">${branchButtons[1].label}</button>
      </div>`;
    } else if (!interactive) {
      buttonsHtml = '<button class="v8-coach-ok" id="v8CoachOk">알겠어 ✦</button>';
    }
    // 사용자 명시 2026-05-06 ultrathink: 어두운 mask 전면 폐기 — 항상 false. (noMask 옵션 보존, 호환만 위해.)
    const showMask = false;
    root.innerHTML = `
      <div id="v8Coach" class="v8-coach ${interactive && !branchButtons ? 'v8-coach-interactive' : ''}">
        ${showMask ? '<div class="v8-coach-mask"></div>' : ''}
        <div class="v8-coach-bubble" id="v8CoachBubble">
          <div class="v8-coach-body">${body}</div>
          ${buttonsHtml}
        </div>
      </div>
    `;
    const bubble = document.getElementById('v8CoachBubble');
    const okBtn = document.getElementById('v8CoachOk');
    // 사용자 명시 2026-05-06 (추가): target 없을 땐 ring 생략 (마무리 멘트 등 가운데 띄우기).
    const ring = target ? document.createElement('div') : null;
    if (ring) {
      ring.className = 'v8-coach-ring';
      document.body.appendChild(ring);
    }

    const place = () => {
      if (!bubble) return;
      const bw = Math.min(320, window.innerWidth - 32);
      bubble.style.width = bw + 'px';
      const bh = bubble.offsetHeight || 120;
      // target 없으면 가운데 정렬 (마무리 멘트 등)
      if (!target) {
        bubble.style.top = Math.max(16, (window.innerHeight - bh) / 2) + 'px';
        bubble.style.left = Math.max(16, (window.innerWidth - bw) / 2) + 'px';
        return;
      }
      const r = target.getBoundingClientRect();
      // ring around target
      const pad = 8;
      if (ring) {
        ring.style.top = (r.top - pad) + 'px';
        ring.style.left = (r.left - pad) + 'px';
        ring.style.width = (r.width + pad * 2) + 'px';
        ring.style.height = (r.height + pad * 2) + 'px';
      }
      // bubble position
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

    let watcher = null;
    let resolved = false;
    let onTargetClick = null;
    let bubbleHiddenTimeout = null;
    const cleanup = () => {
      if (watcher) { clearInterval(watcher); watcher = null; }
      if (bubbleHiddenTimeout) { clearTimeout(bubbleHiddenTimeout); bubbleHiddenTimeout = null; }
      if (onTargetClick && target) {
        try { target.removeEventListener('click', onTargetClick); } catch {}
        onTargetClick = null;
      }
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
      try { if (ring) ring.remove(); } catch {}
      root.innerHTML = '';
      root.setAttribute('aria-hidden', 'true');
    };

    const advance = (val) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      if (typeof onAdvance === 'function') {
        try { onAdvance(val); } catch {}
      }
      resolve(val);
    };

    if (branchButtons) {
      // 사용자 명시 2026-05-06 (추가): 두 버튼 분기 — 클릭 시 data-branch value 로 resolve.
      const btns = root.querySelectorAll('.v8-coach-branch-btn');
      btns.forEach(b => b.addEventListener('click', () => advance(b.dataset.branch)));
    } else if (interactive) {
      // 사용자가 타겟 직접 클릭 → 그 액션의 후속 결과 (waitFor) 가 만족되면 advance.
      // 사용자 보고 2026-05-06 ultrathink: 타겟 클릭 시 confirm modal 이 위로 뜨는데,
      // ring (z-index 9999) + bubble (10000) 이 confirm modal (9900) 위에 남아 stuck 느낌.
      // → 클릭 즉시 ring/bubble visual hide. waitFor 만족 시 advance, 6초 안 만족 = 자동 advance.
      let bubbleHidden = false;
      onTargetClick = () => {
        if (bubbleHidden || resolved) return;
        bubbleHidden = true;
        bubble.style.opacity = '0';
        bubble.style.pointerEvents = 'none';
        ring.style.opacity = '0';
        // 사용자 명시 2026-05-06 ultrathink: 클릭 즉시 + 짧은 setTimeout 두 번 waitFor 즉시 체크 — 80ms watcher tick 보다 빠르게.
        const _quickCheck = () => {
          try { if (waitFor && waitFor() && !resolved) { advance(); return true; } } catch {}
          return false;
        };
        if (_quickCheck()) return;
        setTimeout(() => { if (!_quickCheck()) {} }, 30);
        setTimeout(() => { if (!_quickCheck()) {} }, 120);
        bubbleHiddenTimeout = setTimeout(() => { if (!resolved) advance(); }, 6000);
      };
      target.addEventListener('click', onTargetClick);
      // 사용자 명시 2026-05-06 ultrathink: watcher tick 250→80ms — 코치마크 사라짐 latency 단축.
      watcher = setInterval(() => {
        try {
          if (waitFor && waitFor()) { advance(); return; }
          if (!target || target.offsetParent === null) { advance(); return; }
          if (!bubbleHidden) place();
        } catch {}
      }, 80);
    } else {
      if (okBtn) okBtn.addEventListener('click', advance);
    }
  });
}

// 사용자 명시 2026-05-06: intake → 마무리 사이 중간 단계 — 4단 분석 카드 읽기 안내.
// chat 메시지 중 [내가 본 것] 포함하는 assistant 메시지 (= 4단 분석) 의 DOM 찾아 가리킴.
function _v8CoachmarkReadFourStage() {
  const allMsgs = document.querySelectorAll('#chatMessages .msg.assistant');
  const fourStageMsg = Array.from(allMsgs).find(m => /\[내가 본 것\]/.test(m.textContent || ''));
  if (!fourStageMsg) return Promise.resolve();
  // 사용자가 분석 살펴볼 시간 — 메시지 살짝 보이게 스크롤 후 코치마크.
  try { fourStageMsg.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
  const body = `
    <div class="v8-coach-title">내가 본 거야</div>
    <div class="v8-coach-text">
      방금 들려준 거 — 이렇게 정리했어.<br>
      <span class="v8-coach-text-soft">천천히 읽어봐 ✦</span>
    </div>
  `;
  return _v8ShowCoachmark({
    targetEl: fourStageMsg,
    body,
    position: 'bottom'
  });
}

// 사용자 명시 2026-05-06 (추가): 분기 step — 4단 분석 본 후 "이 대화 더 이어갈래 / 새로 할래".
//   continue → _v8CoachmarkEndChapter('continue') 가 설명만 (자동 advance 가능한 OK)
//   fresh    → _v8CoachmarkEndChapter('fresh') 가 사용자 직접 ✓ 클릭 강제 (interactive)
function _v8CoachmarkContinueOrFresh() {
  const body = `
    <div class="v8-coach-title">분석 해줬어 ✦</div>
    <div class="v8-coach-text">
      이 대화 <b>더 이어가도</b> 되고,<br>
      처음부터 <b>새로 시작</b>해도 돼.
    </div>
  `;
  return _v8ShowCoachmark({
    body,
    allowNoTarget: true,
    branchButtons: [
      { label: '✦ 더 이어갈래', value: 'continue' },
      { label: '새로 할래', value: 'fresh' }
    ]
  });
}

function _v8CoachmarkEndChapter(branch) {
  const target = '.chat-end-btn';
  // 사용자 명시 2026-05-06 (추가): branch 별 분기.
  //   'continue' → 마무리는 설명만 (사용자 직접 클릭 강요 X). OK 버튼으로 advance.
  //   'fresh'    → 사용자가 ✓ 직접 눌러야 advance (chatMessages.empty 감지).
  if (branch === 'continue') {
    const body = `
      <div class="v8-coach-title">대화 마무리</div>
      <div class="v8-coach-text">
        나중에 입력창 옆 <b>✓</b> 누르면 챕터로 묶어 도서관에 넣어줄게.<br>
        <span class="v8-coach-text-soft">지금은 이대로 이어가자 🐚</span>
      </div>
    `;
    return _v8ShowCoachmark({
      targetSelector: target,
      body,
      position: 'top'
    });
  }
  // fresh — 직접 클릭
  const body = `
    <div class="v8-coach-title">대화 마무리</div>
    <div class="v8-coach-text">
      한 번 직접 눌러볼래? ✓<br>
      내가 정리해서 도서관에 넣어둘게.<br>
      <span class="v8-coach-text-soft">나 탭에서도 보여.</span>
    </div>
  `;
  return _v8ShowCoachmark({
    targetSelector: target,
    body,
    position: 'top',
    interactive: true,
    waitFor: () => Array.isArray(state.chatMessages) && state.chatMessages.length === 0
  });
}

// 사용자 명시 2026-05-06 (추가): 마무리 멘트 step — 친절한 톤.
function _v8CoachmarkClosing() {
  const body = `
    <div class="v8-coach-title">자, 한 바퀴 돌았어 🐚</div>
    <div class="v8-coach-text">
      궁금한 거 있으면 언제든 말해줘.<br>
      <span class="v8-coach-text-soft">매일 한 번 체크인하면 — 더 깊게 너를 이해해갈게 ✦</span>
    </div>
  `;
  return _v8ShowCoachmark({
    body,
    allowNoTarget: true,
    position: 'bottom'
  });
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
