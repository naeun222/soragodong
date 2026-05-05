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

function toggleChatModel() {
  // 게스트가 헤더 토글 누르면 → 결제 유도 X, 로그인 유도.
  if (typeof state !== 'undefined' && state && state.isGuest) {
    if (typeof showGuestConversionModal === 'function') {
      showGuestConversionModal({ reason: 'header_toggle' });
    }
    return;
  }
  state.preferences = state.preferences || {};
  const next = !state.preferences.useOpus;
  if (next && !canUseOpus()) {
    showToast('🦉 Opus 깊은 대화는 Premium 에서만');
    if (typeof openSubscribeModal === 'function') {
      setTimeout(() => openSubscribeModal(), 700);
    }
    return;
  }
  state.preferences.useOpus = next;
  saveState();
  updateChatModeBtn();
  if (next) {
    showToast('🦉 Opus 모드 — 깊게 (일일 30번)');
  } else {
    showToast('고동이 (Sonnet) 모드 — 기본 (충분히 깊은 대화)');
  }
  // V4 (v8 묶음 18): Opus 토글 첫 사용 inline tip
  if (typeof _showInlineTip === 'function') _showInlineTip('opusToggle');
}
function updateChatModeBtn() {
  // 사용자 요청 2026-04-30: 모델 토글 4곳 통일 (메인 헤더 + 숙고의 방 + 마법 helpChat + 돌연변이 임시대화창). 모든 .js-chat-mode-btn 인스턴스 동기 갱신.
  // Sonnet 표시 = godongicon.png 이미지, Opus = 🦉 이모지.
  const useOpus = !!(state.preferences && state.preferences.useOpus);
  const titleAttr = useOpus
    ? '🦉 Opus 모드 (잔액 5x 빠르게 차감) — 누르면 Sonnet으로'
    : '고동이 (Sonnet) 모드 — 누르면 Opus로'; // 사용자 명시 2026-04-30: 고동이 페르소나
  document.querySelectorAll('.js-chat-mode-btn').forEach(btn => {
    btn.classList.toggle('opus', useOpus);
    btn.innerHTML = useOpus ? '🦉' : '<img src="/godongicon.png" alt="" class="chat-mode-img">';
    btn.setAttribute('title', titleAttr);
  });
}

