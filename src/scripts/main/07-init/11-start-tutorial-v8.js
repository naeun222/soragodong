// ═══════════════════════════════════════════════════════════════
// V4 (사용자 명시 2026-05-15 ultrathink): V9 시작 튜토리얼 (V8 → V9 reflow).
// 게스트 첫 진입 / 카카오 신규 (게스트 이력 X) → 자동 fire.
//
// V8 흐름 (intake 폼 + 4단 분석 inject + 이어/새로 코치마크 + 마무리 학습) 전체 폐기.
//   = 84% 가입 → 첫 chat drop 의 주범. 사용자 가설 "paradox of choice + clinical 첫인상" 데이터로 confirm.
//   사용자 hook 가설 = empathy ("공감이 되면 알아서 이어 대화"). Replika style 최소화로 정중앙 배치.
//
// V9 흐름:
//   1) cold open hero (V8 유지 — "안녕?" → differentiator 차별화 강함)
//   2) warm start modal — "요즘 머릿속에 제일 큰 거 하나만 풀어볼래?" + textarea + [없어][보내기]
//   3) 분기:
//      (A) 텍스트 입력 → chat 탭 + sendChat (사용자 텍스트가 첫 user message → normal AI 응답)
//      (B) "없어" → "좋아." 토스트 + chat 탭 + ice-breaker assistant inject (pool 2개 random)
//
// 함수 명명: runStartTutorialV8 / shouldRunStartTutorialV8 이름 보존 (호출처 다수). 마킹은 'v9-start' 신규.
// 기존 'v8-start' 마킹 사용자도 동일 가드 — 재진입 X (기존 진행 보존).
// _v8ShowCoachmark / _v8HeroSequence / _v8Sleep / _v8CleanupAll = 다른 튜토리얼 (12/13/14) 공유 → 유지.
// 시드 / 테스터 무관 — testerMode 면 skip.
// ═══════════════════════════════════════════════════════════════

function shouldRunStartTutorialV8() {
  if (!state) return false;
  // V4 (사용자 명시 2026-05-15): v8-start / v9-start 둘 다 가드 — 기존 V8 사용자 재진입 X.
  if (state.tutorialVersion === 'v8-start' || state.tutorialVersion === 'v9-start') return false;
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
  state.tutorialVersion = 'v9-start';
  try { saveState(); } catch {}
  try {
    // V4 (사용자 명시 2026-05-16 cowork): hero 시퀀스 제거 — "안녕?" + 3줄 cascade fade 가 신규 진입에 3-4초 강제 대기.
    //   warm modal 바로 진입. _v8HeroSequence 함수 본체는 보존 (legacy / 향후 별도 진입 시 재사용 가능).
    const result = await _v9ShowWarmStartModal();
    if (result && result.type === 'answer') {
      await _v9HandleAnswer(result.answer);
    } else {
      await _v9HandleNone();
    }
  } catch (e) {
    console.warn('[v9 tutorial]', e);
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
// V9 WARM START MODAL — Replika style 최소화 (intake / 4단 분석 inject 폐기)
// ─────────────────────────────────────────────────────────────

// V4 (사용자 명시 2026-05-15 ultrathink): "없어" 분기 ice-breaker pool.
//   1) 친구 reciprocity ("내가 먼저") + identity/상황 ("뭐 하고 지내?") — 한국 culture 첫 만남 표준 + ADHD 친화 (사실 답 >> 추상 답)
//   2) bar 가장 낮음 ("별거 아닌 거")
//   pool 보존 + random pick = variability (매번 똑같으면 친구다움 즉시 깨짐).
const _V9_ICEBREAKERS = [
  '음, 그럼 내가 먼저 — 요즘 뭐 하고 지내? 학생이든 직장인이든 그냥 쉬고 있든.',
  '그럼 오늘 한 일 중에 제일 별거 아닌 거 하나 얘기해볼래? 진짜 별거 아닌 거 — 아침에 뭐 먹었다, 본 광고가 웃겼다, 그런 거.'
];

function _v9PickIcebreaker() {
  return _V9_ICEBREAKERS[Math.floor(Math.random() * _V9_ICEBREAKERS.length)];
}

function _v9ShowWarmStartModal() {
  return new Promise((resolve) => {
    const root = document.getElementById('v8TutorialRoot');
    if (!root) { resolve({ type: 'none' }); return; }
    root.setAttribute('aria-hidden', 'false');
    root.innerHTML = `
      <div class="v9-warm-overlay">
        <div class="v9-warm-card">
          <div class="v9-warm-question">안녕! 오늘 어땠어?</div>
          <div class="v9-warm-textarea-wrap">
            <textarea class="v9-warm-input" id="v9WarmInput" placeholder="" rows="3"></textarea>
          </div>
          <div class="v9-warm-buttons">
            <button class="v9-warm-btn ghost" id="v9WarmNone" type="button">별 일 없었어</button>
            <button class="v9-warm-btn primary" id="v9WarmSend" type="button" disabled>보내기 →</button>
          </div>
        </div>
      </div>
    `;
    const input = document.getElementById('v9WarmInput');
    const sendBtn = document.getElementById('v9WarmSend');
    const noneBtn = document.getElementById('v9WarmNone');
    let resolved = false;
    const cleanup = () => {
      root.innerHTML = '';
      root.setAttribute('aria-hidden', 'true');
    };
    if (input) {
      setTimeout(() => { try { input.focus(); } catch {} }, 80);
      input.addEventListener('input', () => {
        if (sendBtn) sendBtn.disabled = !input.value.trim();
      });
      // Cmd/Ctrl+Enter = submit. Enter 단독 = newline.
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          if (sendBtn && !sendBtn.disabled) sendBtn.click();
        }
      });
    }
    if (sendBtn) sendBtn.addEventListener('click', () => {
      if (resolved) return;
      const txt = ((input && input.value) || '').trim();
      if (!txt) return;
      resolved = true;
      cleanup();
      resolve({ type: 'answer', answer: txt });
    });
    if (noneBtn) noneBtn.addEventListener('click', () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve({ type: 'none' });
    });
  });
}

async function _v9HandleAnswer(text) {
  if (typeof showScreen === 'function') showScreen('chat');
  await _v8Sleep(120);  // chat 탭 진입 settle
  const chatInput = document.getElementById('chatInput');
  if (chatInput && typeof sendChat === 'function') {
    // sendChat 의 위기 신호 detect / daily cap / 4AM cutoff 분기 등 normal flow 그대로 통과.
    chatInput.value = text;
    try { chatInput.dispatchEvent(new Event('input')); } catch {}
    try { await sendChat(); } catch (e) { console.warn('[v9] sendChat', e); }
  } else {
    // fallback — input / sendChat 미가용 시 직접 push + AI 호출
    state.chatMessages = state.chatMessages || [];
    state.chatMessages.push({
      role: 'user',
      content: text,
      timestamp: new Date().toISOString()
    });
    try { saveState(); } catch {}
    if (typeof renderChat === 'function') renderChat();
    if (typeof generateAIResponse === 'function') {
      try { await generateAIResponse(); } catch (e) { console.warn('[v9] generateAIResponse', e); }
    }
  }
}

async function _v9HandleNone() {
  if (typeof showToast === 'function') showToast('좋아.');
  if (typeof showScreen === 'function') showScreen('chat');
  await _v8Sleep(220);
  const icebreaker = _v9PickIcebreaker();
  state.chatMessages = state.chatMessages || [];
  state.chatMessages.push({
    role: 'assistant',
    content: icebreaker,
    timestamp: new Date().toISOString()
  });
  try { saveState(); } catch {}
  if (typeof renderChat === 'function') renderChat();
  setTimeout(() => {
    if (typeof scrollChatToBottom === 'function') scrollChatToBottom(true);
  }, 80);
}

// ─────────────────────────────────────────────────────────────
// 코치마크 — 가벼운 자체 인프라 (ONBOARDING_STEPS 분리)
// ─────────────────────────────────────────────────────────────

function _v8ShowCoachmark({ targetSelector, targetEl, body, position = 'top', interactive = false, waitFor, onAdvance, branchButtons, allowNoTarget = false, noMask = true, okLabel }) {
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
      // V4 (사용자 명시 2026-05-17 ultrathink): okLabel opt — 페이지별 버튼 라벨 ('아하', '다음', '그렇구나', '오케이' 등).
      buttonsHtml = `<button class="v8-coach-ok" id="v8CoachOk">${okLabel || '알겠어 ✦'}</button>`;
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

// V4 (사용자 명시 2026-05-15): V8 의 _v8CoachmarkReadFourStage / ContinueOrFresh / EndChapter / Closing 폐기.
//   intake + 4단 분석 inject 자체가 V9 에서 빠져 코치마크들도 타깃 메시지 X.
//   ✓ 마무리 학습은 chat-input-bar 의 chatEndHintBanner (첫 ✓ 까지 자연 노출) 가 대체.
//   _v8ShowCoachmark infra 는 12/13/14 (sim / pearl / strategy 튜토리얼) 가 공유 → 유지.

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
