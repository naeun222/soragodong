
// 사용자 명시 2026-05-02 ultrathink: 알림 인박스 — myFeedbackInbox 패턴 일반화.
// state.notifications array 기반 (client-only). 환영 만료 7일 전 / 결제 영수증 / 카카오 마이그레이션 안내 등 미래 자리.
// Phase 3 (포트원 + 알림톡) 도입 시 server endpoint 추가.
function _addNotification({ type, title, body, persistent }) {
  state.notifications = state.notifications || [];
  // 동일 type 이미 unread 있으면 skip (중복 방지)
  const existing = state.notifications.find(n => n.type === type && !n.readAt);
  if (existing) return existing;
  const notif = {
    id: 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    type, title, body,
    persistent: !!persistent,
    createdAt: new Date().toISOString(),
    readAt: null
  };
  state.notifications.unshift(notif);
  // cap 50
  if (state.notifications.length > 50) state.notifications = state.notifications.slice(0, 50);
  saveState();
  refreshNotifInboxBadge();
  return notif;
}

function refreshNotifInboxBadge() {
  const badge = document.getElementById('notifInboxBadge');
  if (!badge) return;
  const unread = (state.notifications || []).filter(n => !n.readAt).length;
  if (unread > 0) {
    badge.style.display = 'inline-block';
    badge.textContent = unread > 9 ? '9+' : String(unread);
  } else {
    badge.style.display = 'none';
  }
}

function openNotifInbox() {
  if (document.getElementById('notifInboxOverlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay show';
  overlay.id = 'notifInboxOverlay';
  overlay.style.zIndex = '9999';
  const items = state.notifications || [];
  let body;
  if (items.length === 0) {
    body = `<div style="padding:30px 20px; text-align:center; color:var(--text-soft); font-size:13px;">아직 알림 없어 ✦</div>`;
  } else {
    body = items.map(n => {
      const isUnread = !n.readAt;
      const accentColor = (n.type === 'free_trial_expiry_warning' || n.type === 'welcome_expiry_warning') ? '#e8c590' : 'var(--accent)';
      const date = new Date(n.createdAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      return `
        <div class="notif-item" data-notif-id="${n.id}" onclick="_markNotifRead('${n.id}')" style="padding:12px 14px; border-left:3px solid ${isUnread ? accentColor : 'transparent'}; background:${isUnread ? 'rgba(212,167,106,0.04)' : 'transparent'}; cursor:pointer; border-bottom:1px solid var(--border);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <div style="font-size:13px; font-weight:${isUnread ? '600' : '500'}; color:var(--text);">${escapeHtml(n.title || '')}</div>
            <div style="font-size:10px; color:var(--text-soft);">${date}</div>
          </div>
          <div style="font-size:11.5px; color:var(--text-dim); line-height:1.6;">${n.body || ''}</div>
        </div>
      `;
    }).join('');
  }
  overlay.innerHTML = `
    <div class="input-modal" style="max-width:440px; max-height:80vh; overflow-y:auto; padding:0;">
      <div style="padding:16px 20px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
        <div style="font-size:15px; font-weight:700; color:var(--text);">🔔 알림함</div>
        <button class="btn-icon" onclick="document.getElementById('notifInboxOverlay').remove()" style="background:none; border:none; font-size:18px; color:var(--text-soft); cursor:pointer;">✕</button>
      </div>
      <div>${body}</div>
      ${items.length > 0 ? '<div style="padding:10px 16px; border-top:1px solid var(--border); text-align:center;"><button class="btn-secondary" onclick="_markAllNotifRead()" style="font-size:11px;">모두 읽음 처리</button></div>' : ''}
    </div>
  `;
  document.body.appendChild(overlay);
}

function _markNotifRead(notifId) {
  const notif = (state.notifications || []).find(n => n.id === notifId);
  if (!notif || notif.readAt) return;
  notif.readAt = new Date().toISOString();
  saveState();
  refreshNotifInboxBadge();
  // 모달 안 표시 갱신 — 간단하게 close + reopen
  const overlay = document.getElementById('notifInboxOverlay');
  if (overlay) {
    overlay.remove();
    openNotifInbox();
  }
}

function _markAllNotifRead() {
  const now = new Date().toISOString();
  (state.notifications || []).forEach(n => { if (!n.readAt) n.readAt = now; });
  saveState();
  refreshNotifInboxBadge();
  const overlay = document.getElementById('notifInboxOverlay');
  if (overlay) {
    overlay.remove();
    openNotifInbox();
  }
}

// 사용자 명시 2026-05-05: 환영 100만 토큰 정책 폐기 → 처음 한 달 무료 (얼리 플랜) 만료 7일 전 알림.
// subscription_active=true + plan='early_light' + expires 7일 이내 = 알림 자리잡음.
// 톤 — Premium 결제 = 개발자 후원 (iOS 앱 출시 자금) 명시.
function checkFreeTrialExpiry() {
  const billing = window._billingCache;
  if (!billing) return;
  if (!billing.subscription_active) return;
  if (billing.subscription_plan !== 'early_light') return;
  const expires = billing.subscription_expires_at;
  if (!expires) return;
  const expiresAt = new Date(expires).getTime();
  const now = Date.now();
  const remainingDays = (expiresAt - now) / 86400000;
  if (remainingDays > 7 || remainingDays < 0) return;
  const daysDisplay = Math.max(1, Math.ceil(remainingDays));
  // V4 (사용자 명시 2026-05-06 ultrathink): legacy early_light plan 활성화된 옛 사용자만 fire. 신규는 무료 토큰 (자동 활성화 X) 라 이 분기 진입 X.
  _addNotification({
    type: 'free_trial_expiry_warning',
    title: '레거시 얼리 플랜 만료 임박',
    body: `<b>${daysDisplay}일</b> 후 만료. 계속 쓰려면 구독 — <b>얼리버드 4,900원/월</b> (출시 전 가격 평생 락인).<br><br><span style="font-size:11px; color:var(--text-soft);">결제 = 단독 개발자 후원 → iOS 앱 출시 가능 🫂</span>`,
    persistent: true
  });
}
// 옛 함수 호환 (외부 호출 잔재 대비) — checkFreeTrialExpiry 로 위임.
function checkWelcomeBonusExpiry() { return checkFreeTrialExpiry(); }

// V4 (사용자 명시 2026-05-06 ultrathink): 신규 가입 무료 토큰 (credit_balance) 소진 임박 / 소진 알림.
// 양 비공개 — 절대값 노출 X. self-calibrating: 첫 본 balance 를 _initialFreeBalance 로 저장 후 소진율 계산.
//   80%+ 소진 → '거의 끝' 알림 (한 번만, _creditDepletionWarned flag)
//   balance == 0 → '체험 끝' 알림 (별도, _creditDepletedNotified flag)
// 구독자는 별도 cap 흐름 (showBudgetExceededModal) 으로 처리되니 skip.
function checkFreeCreditDepletion() {
  const billing = window._billingCache;
  if (!billing) return;
  if (billing.subscription_active) return;  // 구독자 = 별도 cap 알림
  const balance = Number(billing.credit_balance_usd || 0);
  if (typeof state === 'undefined' || !state) return;
  state.preferences = state.preferences || {};

  // 토큰 다 떨어짐 → 'depleted' 알림 (한 번만)
  if (balance <= 0) {
    if (state.preferences._creditDepletedNotified) return;
    state.preferences._creditDepletedNotified = true;
    try { saveState(); } catch {}
    _addNotification({
      type: 'free_credit_depleted',
      title: '🐚 환영 무료 체험 끝',
      body: `깊게 써줘서 고마워.<br>계속 쓰려면 구독 — <b>얼리버드 4,900원/월</b> (출시 전 가격 평생 락인).<br><br><span style="font-size:11px; color:var(--text-soft);">결제 = 단독 개발자 후원 → iOS 앱 출시 가능 🫂</span>`,
      persistent: true
    });
    return;
  }

  // 처음 본 balance = initial 으로 저장. 또는 현 balance 가 더 크면 갱신 (재 grant 케이스).
  const init = Number(state.preferences._initialFreeBalance || 0);
  if (balance > init) {
    state.preferences._initialFreeBalance = balance;
    // 새로 충전됐으니 옛 warning flag reset — 다시 80% 소진 시 한 번 더 fire.
    delete state.preferences._creditDepletionWarned;
    delete state.preferences._creditDepletedNotified;
    try { saveState(); } catch {}
    return;
  }

  // 80%+ 소진 → 'low' 알림 (한 번만)
  const usedPct = init > 0 ? (init - balance) / init : 0;
  if (usedPct >= 0.8) {
    if (state.preferences._creditDepletionWarned) return;
    state.preferences._creditDepletionWarned = true;
    try { saveState(); } catch {}
    _addNotification({
      type: 'free_credit_low',
      title: '🐚 환영 무료 체험 거의 끝',
      body: `이제 얼마 안 남았어.<br>계속 쓰려면 — <b>얼리버드 4,900원/월</b> (출시 전 가격 평생 락인).<br><br><span style="font-size:11px; color:var(--text-soft);">결제 = 단독 개발자 후원 → iOS 앱 출시 가능 🫂</span>`,
      persistent: true
    });
  }
}

