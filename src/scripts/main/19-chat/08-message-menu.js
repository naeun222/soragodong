async function showMessageMenu(idx) {
  const msg = state.chatMessages[idx];
  if (!msg || msg.typing) return;
  const isUser = msg.role === 'user';
  const options = [{ label: '📋 복사', value: 'copy' }];
  if (isUser) {
    options.push({ label: '✎ 텍스트만 수정', value: 'editText' });
    options.push({ label: '↻ 여기서부터 다시 보내기', value: 'editResend' });
  }
  // V4-1j-a: 숙고 질문으로 보내기 (메시지 텍스트 → 질문 prefill)
  options.push({ label: '🌊 숙고 질문으로 보내기', value: 'reflection' });
  options.push({ label: '✕ 삭제', value: 'delete' });
  const action = await showOptionsModal({
    title: isUser ? '내 메시지' : '소라고동 메시지',
    options
  });
  if (!action) return;
  if (action === 'copy') {
    try {
      await navigator.clipboard.writeText(msg.content || '');
      showToast('📋 복사됨');
    } catch (e) {
      showToast('복사 실패. 직접 선택해서 복사해줘.');
    }
    return;
  }
  if (action === 'reflection') {
    // V4-1j-a: 메시지 텍스트를 prefill로 → 사용자 편집 → addReflectionQuestion
    const prefilled = (msg.content || '').slice(0, 280);
    const qText = await showInputModal({
      title: '🌊 숙고 질문으로',
      message: '깊이 보고 싶은 질문 형태로 다듬어. 답이 바로 안 나와도 OK.',
      defaultValue: prefilled,
      multiline: true,
      maxLength: 300,
      okLabel: '추가'
    });
    if (qText && qText.trim()) {
      const q = await addReflectionQuestion(qText.trim());
      if (q && q.id) {
        // sourceMsgIdx 넣음 (스크랩 출처 추적)
        q.source = 'scrap';
        q.sourceMsgIdx = idx;
        saveState();
      }
    }
    return;
  }
  if (action === 'editText') {
    const newText = await showInputModal({
      title: '메시지 수정 (텍스트만)',
      message: '내용만 바꿔. AI 재호출 X.',
      defaultValue: msg.content || '',
      multiline: true,
      okLabel: '저장'
    });
    if (newText === null) return;
    const t = newText.trim();
    if (!t) return;
    msg.content = t;
    saveState();
    renderChat();
    showToast('수정됨 ✦');
    return;
  }
  if (action === 'editResend') {
    const newText = await showInputModal({
      title: '여기서부터 다시 보내기',
      message: '이 메시지 이후 모든 대화가 삭제되고 AI가 다시 답해.',
      defaultValue: msg.content || '',
      multiline: true,
      okLabel: '다시 보내기'
    });
    if (newText === null) return;
    const t = newText.trim();
    if (!t) return;
    msg.content = t;
    msg.timestamp = new Date().toISOString();
    state.chatMessages = state.chatMessages.slice(0, idx + 1);
    saveState();
    renderChat();
    await generateAIResponse();
    return;
  }
  if (action === 'delete') {
    const yes = await showConfirmModal({
      title: '이 메시지 삭제',
      message: isUser
        ? '이 메시지 + 직후 AI 응답이 같이 삭제돼.\n되돌릴 수 없어.'
        : '이 메시지가 삭제돼.\n되돌릴 수 없어.',
      okLabel: '삭제', cancelLabel: '취소'
    });
    if (!yes) return;
    if (isUser) {
      // 사용자 메시지 + 직후 AI 응답 (있으면) 삭제
      let removeCount = 1;
      if (state.chatMessages[idx + 1] && state.chatMessages[idx + 1].role === 'assistant') {
        removeCount = 2;
      }
      state.chatMessages.splice(idx, removeCount);
    } else {
      state.chatMessages.splice(idx, 1);
    }
    saveState();
    renderChat();
    showToast('삭제됨');
    return;
  }
}

async function retryMessage(errorIdx) {
  // V3.4: 같은 user message에 대한 retry 시 직전 N분 내 추출된 trait/pattern 추적
  state._lastRetryAt = Date.now();
  state.chatMessages.splice(errorIdx, 1);
  renderChat();
  saveState();
  await generateAIResponse();
}

// 사용자 요청 2026-04-30 ultrathink Task 7: Hybrid Opus 토글 — chat 모드 전환 + 토스트 차감 안내
// 사용자 명시 2026-05-02 ultrathink: Opus 사용 가드 — Premium 전용. 튜토리얼 동안은 자유.
function canUseOpus() {
  if (window._onbTutorialMode) return true;  // 튜토리얼 자유
  // refreshBillingStatus 가 set 하는 마지막 cache 활용
  const billing = window._billingCache;
  if (!billing) return false;  // billing 정보 없으면 안전 차단
  if (billing.subscription_plan !== 'premium') return false;
  if (!billing.subscription_active) return false;
  // 일일 한도 체크는 server에서 (consume_opus_daily_atomic). 클라는 토글만 막음.
  return true;
}

// V4 (사용자 명시 2026-05-13): 옛 toggleChatModel() = 전역 Opus 토글 폐기.
//   메인 헤더 = RAG 토글 (대화탭 한정, onMainHeaderToggleClick 별도).
//   마법·숙고 = per-room (toggleReflectionOpus / toggleMagicHelpOpus).
//   호환 stub — 옛 호출처 (HTML inline onclick 등) 영향 X.
function toggleChatModel() {
  if (typeof onMainHeaderToggleClick === 'function') onMainHeaderToggleClick();
}
function updateChatModeBtn() {
  if (typeof updateMainHeaderBtnVisual === 'function') updateMainHeaderBtnVisual();
}
// V4 (사용자 명시 2026-05-13 ultrathink): 옛 toggleChatModel() / updateChatModeBtn() 폐기.
//   메인 헤더 = onMainHeaderToggleClick() / updateMainHeaderBtnVisual() 로 교체.
//   per-room (숙고/마법) = toggleReflectionOpus / toggleMagicHelpOpus 분리 (아래).
//   돌연변이 = 토글 자체 제거.

// V4 (사용자 명시 2026-05-13 ultrathink): 메인 헤더 토글 핸들러.
//   대화탭 + Plus/Premium = RAG 토글. Light/미구독/게스트 또는 다른 탭 = no-op (brand only).
//   Plus 첫 클릭 → 1-step 설명 모달 (첫 클릭은 OFF 유지, 두 번째 클릭부터 toggle).
function onMainHeaderToggleClick() {
  // 게스트 = 결제 유도 X, 로그인 유도.
  if (typeof state !== 'undefined' && state && state.isGuest) {
    if (typeof showGuestConversionModal === 'function') showGuestConversionModal({ reason: 'rag_toggle' });
    return;
  }
  // 활성 화면 검사 — 대화탭에서만 RAG 토글 동작.
  const activeScreen = document.querySelector('.screen.active, #screen-chat.active');
  const isChat = activeScreen && (activeScreen.id === 'screen-chat' || activeScreen.classList.contains('screen-chat'));
  if (!isChat) return;  // 다른 탭 = brand only no-op
  // Plan 검사 — Plus/Premium 만 가능.
  const billing = window._billingCache;
  const plan = billing?.subscription_plan;
  const active = !!billing?.subscription_active;
  const ragEligible = active && (plan === 'light' || plan === 'premium');  // 'light' key = Plus
  if (!ragEligible) return;  // Light/미구독/Premium 외 = brand only no-op
  state.preferences = state.preferences || {};
  // 첫 클릭 = 모달만 (transition X, 사용자 명시).
  if (!state.preferences._ragToggleSeen) {
    state.preferences._ragToggleSeen = true;
    try { saveState(); } catch {}
    if (typeof showRagFirstClickModal === 'function') showRagFirstClickModal();
    // 깜빡 halo 종료
    document.querySelectorAll('.js-rag-mode-btn').forEach(btn => btn.classList.remove('rag-blink'));
    return;
  }
  // 두 번째 클릭부터 toggle.
  state.preferences.useRag = !state.preferences.useRag;
  try { saveState(); } catch {}
  updateMainHeaderBtnVisual();
  if (typeof showToast === 'function') {
    showToast(state.preferences.useRag
      ? '✨ 옛 챕터 기억 ON — 다음 메시지부터 적용'
      : '🪶 옛 챕터 기억 OFF');
  }
  // V4: RAG 처음 ON 시 옛 archive 자동 백필.
  if (state.preferences.useRag && typeof _ragBackfillAll === 'function') {
    setTimeout(() => { _ragBackfillAll().catch(e => console.warn('[rag] backfill:', e)); }, 100);
  }
}

// V4 (사용자 명시 2026-05-13): 메인 헤더 토글 visual — 화면/Plan/RAG 상태 따라 분기.
//   대화탭 + Plus/Premium = godong-sonnet (OFF) / godong-rag (ON, gold halo)
//   다른 탭 또는 Light/미구독/게스트 = godongicon (brand only)
function updateMainHeaderBtnVisual() {
  const activeScreen = document.querySelector('.screen.active, #screen-chat.active');
  const isChat = activeScreen && (activeScreen.id === 'screen-chat' || activeScreen.classList.contains('screen-chat'));
  const billing = window._billingCache;
  const plan = billing?.subscription_plan;
  const active = !!billing?.subscription_active;
  const ragEligible = active && (plan === 'light' || plan === 'premium');
  const useRag = !!(state?.preferences?.useRag);
  const ragSeen = !!(state?.preferences?._ragToggleSeen);

  document.querySelectorAll('.js-rag-mode-btn').forEach(btn => {
    btn.classList.remove('rag-on', 'rag-off', 'rag-blink', 'brand-only');
    if (isChat && ragEligible) {
      if (useRag) {
        btn.classList.add('rag-on');
        btn.innerHTML = '<img src="/character/godong-rag.svg" alt="" class="chat-mode-img">';
        btn.setAttribute('title', '✨ 옛 챕터 기억 ON — 누르면 OFF');
      } else {
        btn.classList.add('rag-off');
        btn.innerHTML = '<img src="/character/godong-sonnet.svg" alt="" class="chat-mode-img">';
        btn.setAttribute('title', '🪶 옛 챕터 기억 OFF — 누르면 ON');
        // 깜빡 halo: ragSeen X + 사용자 처음 진입 시
        if (!ragSeen) btn.classList.add('rag-blink');
      }
    } else {
      btn.classList.add('brand-only');
      btn.innerHTML = '<img src="/godongicon.png" alt="" class="chat-mode-img">';
      btn.setAttribute('title', '소라고동');
    }
  });
}

// V4 (사용자 명시 2026-05-13): Plus 첫 클릭 RAG 설명 모달.
//   첫 클릭은 OFF 유지 — 사용자가 [켜기] 클릭 시에만 ON 전환.
//   문구는 사용자 직접 작성 — 일단 placeholder.
function showRagFirstClickModal() {
  if (document.getElementById('ragFirstClickOverlay')) return;
  const plan = window._billingCache?.subscription_plan;
  const topN = (plan === 'premium') ? 3 : 1;
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay show';
  overlay.id = 'ragFirstClickOverlay';
  overlay.style.zIndex = '10005';
  overlay.innerHTML = `
    <div class="input-modal" style="max-width:380px; padding:24px; text-align:center;">
      <div style="display:flex; gap:16px; align-items:center; justify-content:center; margin-bottom:16px;">
        <div style="text-align:center;">
          <img src="/character/godong-sonnet.svg" alt="" style="width:64px; height:64px;">
          <div style="font-size:10.5px; color:var(--text-soft); margin-top:4px;">평소</div>
        </div>
        <div style="color:var(--text-dim); font-size:18px;">→</div>
        <div style="text-align:center; filter:drop-shadow(0 0 12px rgba(212,167,106,0.55));">
          <img src="/character/godong-rag.svg" alt="" style="width:64px; height:64px;">
          <div style="font-size:10.5px; color:var(--accent); margin-top:4px;">옛 챕터 기억 ON</div>
        </div>
      </div>
      <div style="font-size:15px; font-weight:600; color:var(--text); margin-bottom:8px;">✨ 고동이가 옛 챕터를 기억해</div>
      <div style="font-size:12px; color:var(--text-dim); line-height:1.7; margin-bottom:18px;">
        켜면 — 지금 대화 주제와 비슷한 옛 챕터 <b>${topN}개</b>를<br>
        고동이가 자연스럽게 참조해서 답해.<br>
        매 메시지마다 다른 챕터 — 같은 얘기 반복 X.<br>
        <span style="color:var(--text-soft); font-size:11px;">지금은 OFF. 켜고 싶으면 [켜기].</span>
      </div>
      <button class="btn-primary" onclick="_ragFirstModalAct(true)" style="width:100%; padding:11px; margin-bottom:8px;">✨ 켜기</button>
      <button class="btn-secondary" onclick="_ragFirstModalAct(false)" style="width:100%; padding:10px;">그대로 둘게</button>
    </div>
  `;
  document.body.appendChild(overlay);
}
function _ragFirstModalAct(turnOn) {
  const ov = document.getElementById('ragFirstClickOverlay');
  if (ov) ov.remove();
  if (turnOn) {
    state.preferences = state.preferences || {};
    state.preferences.useRag = true;
    try { saveState(); } catch {}
    updateMainHeaderBtnVisual();
    if (typeof showToast === 'function') showToast('✨ 옛 챕터 기억 ON — 다음 메시지부터 적용');
    // 자동 백필 trigger
    if (typeof _ragBackfillAll === 'function') {
      setTimeout(() => { _ragBackfillAll().catch(e => console.warn('[rag] backfill:', e)); }, 100);
    }
  }
}

// V4 (사용자 명시 2026-05-13): per-room Opus 토글 — 숙고의 방.
//   해당 질문 (state.reflectionQuestions 의 _activeReflectionId) 의 useOpus 만 토글.
//   비-Premium = 클릭 시 Premium 권유 모달 (옛 패턴).
//   Premium default OFF — 사용자 명시 ON 시에만 Opus.
function toggleReflectionOpus() {
  if (typeof state !== 'undefined' && state && state.isGuest) {
    if (typeof showGuestConversionModal === 'function') showGuestConversionModal({ reason: 'reflection_opus_toggle' });
    return;
  }
  if (typeof _activeReflectionId === 'undefined' || !_activeReflectionId) return;
  const q = (state.reflectionQuestions || []).find(x => x.id === _activeReflectionId);
  if (!q) return;
  const next = !q.useOpus;
  if (next && !canUseOpus()) {
    showToast('🦉 Opus 깊은 사고는 Premium 에서만');
    if (typeof openSubscribeModal === 'function') setTimeout(() => openSubscribeModal(), 700);
    return;
  }
  q.useOpus = next;
  saveState();
  updateReflectionChatModeBtn();
  showToast(next ? '🦉 Opus 모드 — 깊게' : '🪶 Sonnet 모드 — 가볍게');
}
function updateReflectionChatModeBtn() {
  if (typeof _activeReflectionId === 'undefined' || !_activeReflectionId) return;
  const q = (state.reflectionQuestions || []).find(x => x.id === _activeReflectionId);
  const useOpus = !!(q && q.useOpus);
  const titleAttr = useOpus
    ? '🦉 Opus — 누르면 Sonnet'
    : '🪶 Sonnet — 누르면 Opus (Premium 전용)';
  document.querySelectorAll('.js-reflection-mode-btn').forEach(btn => {
    btn.classList.toggle('opus', useOpus);
    btn.innerHTML = useOpus ? '🦉' : '🪶';
    btn.setAttribute('title', titleAttr);
  });
}

// V4 (사용자 명시 2026-05-13): per-room Opus 토글 — 마법고동 helpChat.
//   해당 decision.helpChatUseOpus[stepId] 만 토글.
function toggleMagicHelpOpus() {
  if (typeof state !== 'undefined' && state && state.isGuest) {
    if (typeof showGuestConversionModal === 'function') showGuestConversionModal({ reason: 'magic_opus_toggle' });
    return;
  }
  if (typeof _magicHelpState === 'undefined' || !_magicHelpState || !_magicHelpState.decisionId || !_magicHelpState.stepId) return;
  const decision = (state.decisions || []).find(d => d.id === _magicHelpState.decisionId);
  if (!decision) return;
  if (!decision.helpChatUseOpus) decision.helpChatUseOpus = {};
  const stepId = _magicHelpState.stepId;
  const next = !decision.helpChatUseOpus[stepId];
  if (next && !canUseOpus()) {
    showToast('🦉 Opus 깊은 사고는 Premium 에서만');
    if (typeof openSubscribeModal === 'function') setTimeout(() => openSubscribeModal(), 700);
    return;
  }
  decision.helpChatUseOpus[stepId] = next;
  saveState();
  updateMagicHelpChatModeBtn();
  showToast(next ? '🦉 Opus 모드 — 깊게' : '🪶 Sonnet 모드 — 가볍게');
}
function updateMagicHelpChatModeBtn() {
  if (typeof _magicHelpState === 'undefined' || !_magicHelpState) return;
  const decision = (state.decisions || []).find(d => d.id === _magicHelpState.decisionId);
  const useOpus = !!(decision && decision.helpChatUseOpus && decision.helpChatUseOpus[_magicHelpState.stepId]);
  const titleAttr = useOpus
    ? '🦉 Opus — 누르면 Sonnet'
    : '🪶 Sonnet — 누르면 Opus (Premium 전용)';
  document.querySelectorAll('.js-magic-mode-btn').forEach(btn => {
    btn.classList.toggle('opus', useOpus);
    btn.innerHTML = useOpus ? '🦉' : '🪶';
    btn.setAttribute('title', titleAttr);
  });
}

