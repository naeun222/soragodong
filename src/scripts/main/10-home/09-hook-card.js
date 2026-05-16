// Hook 카드 — 홈 메인 슬롯 Phase 1 (_home-archive-redesign.md)
// pickHomeMainHook() → unanswered hook within 48h or null
// renderHookCard(hook) → HTML string (rotatingCardContainer 직접 삽입용)
// hookCardTap(hookId) → hook message inject + chat 탭 진입

function pickHomeMainHook() {
  const now = Date.now();
  return ((state.askedHooks || [])
    .filter(h => h && !h.answered)
    .filter(h => (now - new Date(h.askedAt).getTime()) < 48 * 3600000)
    .sort((a, b) => new Date(b.askedAt) - new Date(a.askedAt))
  )[0] || null;
}

function _hookNameCall(userName) {
  if (!userName) return '';
  const last = userName[userName.length - 1];
  const code = last ? last.charCodeAt(0) : 0;
  const hasJongseong = (code >= 0xAC00 && code <= 0xD7A3)
    ? ((code - 0xAC00) % 28) !== 0
    : false;
  return hasJongseong ? `${userName}아` : `${userName}야`;
}

function renderHookCard(hook) {
  if (!hook) return '';
  const userName = (state.userName || '').trim();
  const nameCall = _hookNameCall(userName);
  const header = userName ? `있잖아 ${nameCall} ✦` : '있잖아 ✦';
  return `
    <div class="hook-main-card"
         data-hook-id="${escapeHtml(hook.id || '')}"
         onclick="hookCardTap(this.dataset.hookId)"
         role="button" tabindex="0"
         aria-label="${escapeHtml(header)}">
      <div class="hook-main-header">${escapeHtml(header)}</div>
      <div class="hook-main-body">${escapeHtml(hook.body || '')}</div>
      <div class="hook-main-hint">탭해서 답하기</div>
    </div>
  `;
}

function hookCardTap(hookId) {
  if (!hookId) return;
  const hook = (state.askedHooks || []).find(h => h && h.id === hookId);
  if (!hook) {
    if (typeof showScreen === 'function') showScreen('chat');
    return;
  }
  // hook message 를 chatMessages 앞에 inject — 중복 방지
  const alreadyInjected = (state.chatMessages || []).some(
    m => m && m.isHookMessage && m.hookId === hookId
  );
  if (!alreadyInjected && hook.body) {
    const hookMsg = {
      role: 'assistant',
      content: hook.body,
      timestamp: hook.askedAt || new Date().toISOString(),
      isHookMessage: true,
      hookId: hookId,
      hookSource: hook.source,
      hookTriggerDayK: hook.trigger_dayK,
    };
    state.chatMessages = [hookMsg, ...(state.chatMessages || [])];
    if (typeof saveState === 'function') saveState(true);
  }
  if (typeof showScreen === 'function') showScreen('chat');
  if (typeof renderChat === 'function') setTimeout(() => renderChat(), 80);
}
