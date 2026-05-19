// Hook 카드 — 홈 메인 슬롯 Phase 1 (_home-archive-redesign.md)
// pickHomeMainHook() → unanswered hook within 48h or null
// renderHookCard(hook) → HTML string (rotatingCardContainer 직접 삽입용)
// hookCardTap(hookId) → hook message inject + chat 탭 진입

function pickHomeMainHook() {
  const now = Date.now();
  // V4 (사용자 명시 2026-05-18 ultrathink): hook 은 push 알림 시각에만 노출 (default 21시).
  //   scheduledFor 시각 도달 전 = 큐에 쌓인 상태, 홈 표시 X.
  //   dismissedFromHome = true (push 또는 홈 카드 tap 으로 진입한 후 자동 dismiss) 면 다시 안 보임.
  // V4 (사용자 명시 2026-05-20 ultrathink): 처음 홈에 surface 한 후 20h 지나면 자동 만료.
  //   tap 으로 dismiss X — 답하거나 명시적 ✕ 또는 20h 자동.
  //   firstSurfacedAt 은 picker 가 surface 결정 시 idempotent 마킹 (saveState 1회).
  const picked = ((state.askedHooks || [])
    .filter(h => h && !h.answered && !h.dismissedFromHome)
    .filter(h => {
      const sched = h.scheduledFor ? new Date(h.scheduledFor).getTime() : new Date(h.askedAt).getTime();
      return now >= sched;
    })
    .filter(h => (now - new Date(h.askedAt).getTime()) < 48 * 3600000)
    .filter(h => {
      if (!h.firstSurfacedAt) return true;  // 아직 surface 전 — 통과
      return (now - new Date(h.firstSurfacedAt).getTime()) < 20 * 3600000;
    })
    .sort((a, b) => new Date(b.askedAt) - new Date(a.askedAt))
  )[0] || null;
  // 첫 surface 시점 idempotent 박기 (다음 호출부터 20h timer 시작).
  if (picked && !picked.firstSurfacedAt) {
    picked.firstSurfacedAt = new Date(now).toISOString();
    try { if (typeof saveState === 'function') saveState(); } catch {}
  }
  return picked;
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

// renderHookCard 폐기 (사용자 명시 2026-05-17 ultrathink revert) — 회전카드 _rcBuildHookBodyHtml 이 대체.

// V4 (사용자 명시 2026-05-17 ultrathink): 옵션 A — pull 패턴.
//   iOS PWA push 못 받아도 backend 의 hook_push_queue 에 row 가 있음 → frontend 가 fetch 해서 카드 표시.
//   호출 시점: init 후 5s + showScreen('archive') 진입. dedup by id.
async function _syncPendingHookFromBackend() {
  try {
    if (typeof session === 'undefined' || !session?.access_token) return;
    if (typeof BACKEND_BASE === 'undefined') return;
    const r = await fetch(`${BACKEND_BASE}/api/hook/pending`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    if (!r.ok) return;
    const j = await r.json().catch(() => null);
    if (!j || !j.ok || !j.hook) return;
    state.askedHooks = state.askedHooks || [];
    if (state.askedHooks.some(h => h && h.id === j.hook.id)) return;  // dedup
    state.askedHooks.push({
      id: j.hook.id,
      body: j.hook.body,
      userName: j.hook.userName,
      askedAt: j.hook.sentAt || j.hook.scheduledAt || new Date().toISOString(),
      answered: false,
      source: 'backend-pull'
    });
    try { saveState(); } catch {}
    if (typeof renderRotatingCard === 'function') renderRotatingCard();
  } catch (e) { console.warn('[hook pending fetch]', e); }
}

// 답변 mark — sendChat 의 unanswered.answered=true 직후 fire-and-forget.
function _markHookAnsweredBackend(hookId) {
  try {
    if (!hookId) return;
    if (typeof session === 'undefined' || !session?.access_token) return;
    if (typeof BACKEND_BASE === 'undefined') return;
    fetch(`${BACKEND_BASE}/api/hook/answered`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ hook_id: hookId })
    }).catch(() => {});
  } catch {}
}

function hookCardTap(hookId) {
  if (!hookId) return;
  const hook = (state.askedHooks || []).find(h => h && h.id === hookId);
  if (!hook) {
    if (typeof showScreen === 'function') showScreen('chat');
    return;
  }
  // V4 (사용자 명시 2026-05-18 ultrathink): 옵션 B — hook tap = 새 챕터 시작.
  //   옛 흐름: hook 메시지를 진행중 챕터 앞에 inject → 옛 대화 + hook 섞임 → 사용자 의도 흐림.
  //   신 흐름: 옛 챕터 자동 archive 로 close → 새 챕터 첫 메시지 = hook. 명확함, 사용자 의도 존중.
  //
  //   중복 방지: 이미 챗에 같은 hook 박혀있으면 (예: hook tap 직후 사용자가 답변 안 한 채 다시 tap) skip — 메시지 중복 X.
  const alreadyInjected = (state.chatMessages || []).some(
    m => m && m.isHookMessage && m.hookId === hookId
  );
  if (!alreadyInjected && hook.body) {
    // 진행중 챕터 (chatMessages 가 비어있지 X) 면 archive 로 close. minMessages: 1 = 짧아도 자동 닫음.
    const hasActiveChat = Array.isArray(state.chatMessages) && state.chatMessages.length > 0;
    if (hasActiveChat) {
      if (typeof _archiveCurrentChapter === 'function') {
        try { _archiveCurrentChapter({ minMessages: 1, manual: false }); }
        catch (e) { console.warn('[hookCardTap] archive fail:', e); state.chatMessages = []; }
      } else {
        state.chatMessages = [];
      }
    }
    // 새 챕터 첫 메시지 = hook.
    const hookMsg = {
      role: 'assistant',
      content: hook.body,
      timestamp: hook.askedAt || new Date().toISOString(),
      isHookMessage: true,
      hookId: hookId,
      hookSource: hook.source,
      hookTriggerDayK: hook.trigger_dayK,
    };
    state.chatMessages = [hookMsg];
  }
  // V4 (사용자 명시 2026-05-18 ultrathink): hook tap (push or 홈 카드) = 홈 hook dismiss.
  //   사용자가 이미 hook 봤음 → 홈에 다시 표시할 필요 X. 답변 안 해도 홈에선 사라짐.
  //   chat 안 hook 메시지는 그대로 유지 (사용자가 답변하면 answered=true → backend mark).
  hook.dismissedFromHome = true;
  if (typeof saveState === 'function') saveState(true);
  if (typeof showScreen === 'function') showScreen('chat');
  if (typeof renderChat === 'function') setTimeout(() => renderChat(), 80);
}
