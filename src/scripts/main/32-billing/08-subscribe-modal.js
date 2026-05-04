// ─── 구독 모달 (사용자 명시 2026-05-02 ultrathink: 일반 / 얼리 분기) ───
// 일반: Light 9,900 + Premium 25,000
// 얼리 (early_user=true): ~~9,900~~ → 4,900 강조 + Premium 25,000
async function openSubscribeModal() {
  if (document.getElementById('subscribeModalOverlay')) return;
  // billing 갱신 (얼리 자격 확인용)
  if (typeof refreshBillingStatus === 'function') {
    try { await refreshBillingStatus(false); } catch {}
  }
  const isEarly = !!(window._billingCache && window._billingCache.early_user);
  const minorWarning = state.preferences?.requiresLegalGuardianForPayment
    ? `<div style="padding:10px; background:rgba(220,150,80,0.10); border:1px solid rgba(220,150,80,0.40); border-radius:8px; font-size:11px; color:#e8c590; margin-bottom:14px;">⚠️ 만 18세 미만은 결제 시 법정대리인 동의 필요</div>`
    : '';
  const tierCard = (key, plan, recommended) => `
    <div class="tier-card ${recommended ? 'tier-recommended' : ''}" style="padding:18px 16px; background:${recommended ? 'linear-gradient(135deg, rgba(212,167,106,0.12), rgba(212,167,106,0.04))' : 'var(--surface)'}; border:${recommended ? '1.5px solid var(--accent)' : '1px solid var(--border)'}; border-radius:14px; margin-bottom:10px;">
      ${recommended ? '<div style="font-size:9px; letter-spacing:0.18em; text-transform:uppercase; color:var(--accent); font-weight:700; margin-bottom:6px;">RECOMMENDED</div>' : ''}
      <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:4px;">
        <div style="font-size:18px; font-weight:700; color:var(--text);">${plan.emoji} ${plan.label}</div>
        <div style="font-size:18px; font-weight:700; color:var(--text);">${plan.krw.toLocaleString()}원<span style="font-size:11px; color:var(--text-dim); font-weight:400;">/월</span></div>
      </div>
      <div style="font-size:12px; color:var(--text-dim); margin-bottom:10px;">${plan.tagline}</div>
      <div style="font-size:11.5px; color:var(--text); line-height:1.7; padding:10px; background:rgba(0,0,0,0.18); border-radius:8px; margin-bottom:10px;">
        ${plan.description}
      </div>
      <button class="btn-primary" onclick="proceedSubscribe('${key}')" style="width:100%; padding:11px;">${plan.label} 구독 (${plan.krw.toLocaleString()}원)</button>
    </div>
  `;
  // 사용자 명시 2026-05-02 ultrathink: 얼리 카드 — Light 9,900 strike-through + 4,900 강조 + "평생 이 가격" 메시지.
  const earlyCard = (plan) => `
    <div class="tier-card tier-early" style="padding:18px 16px; background:linear-gradient(135deg, rgba(126,200,227,0.10), rgba(126,200,227,0.03)); border:1.5px solid rgba(126,200,227,0.45); border-radius:14px; margin-bottom:10px;">
      <div style="font-size:9px; letter-spacing:0.18em; text-transform:uppercase; color:#7ec8e3; font-weight:700; margin-bottom:6px;">✨ 얼리 유저 — 평생</div>
      <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:4px;">
        <div style="font-size:18px; font-weight:700; color:var(--text);">${plan.emoji} ${plan.label}</div>
        <div style="display:flex; align-items:baseline; gap:8px;">
          <div style="font-size:13px; color:var(--text-soft); text-decoration:line-through; font-weight:500;">${TIER_PLANS_CLIENT.light.krw.toLocaleString()}원</div>
          <div style="font-size:18px; font-weight:700; color:#7ec8e3;">${plan.krw.toLocaleString()}원<span style="font-size:11px; color:var(--text-dim); font-weight:400;">/월</span></div>
        </div>
      </div>
      <div style="font-size:12px; color:var(--text-dim); margin-bottom:10px;">${plan.tagline}</div>
      <div style="font-size:11.5px; color:var(--text); line-height:1.7; padding:10px; background:rgba(0,0,0,0.18); border-radius:8px; margin-bottom:10px;">
        ${plan.description}
      </div>
      <button class="btn-primary" onclick="proceedSubscribe('early_light')" style="width:100%; padding:11px; background:#7ec8e3; color:#0a1418;">얼리 가격으로 구독 (${plan.krw.toLocaleString()}원)</button>
    </div>
  `;
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay show';
  overlay.id = 'subscribeModalOverlay';
  overlay.style.zIndex = '10000';
  overlay.innerHTML = `
    <div class="input-modal" style="max-width:420px; max-height:92vh; overflow-y:auto; padding:24px;">
      <div style="font-size:17px; font-weight:700; color:var(--text); margin-bottom:6px;">📅 구독</div>
      <div style="font-size:12px; color:var(--text-dim); line-height:1.6; margin-bottom:14px;">
        무료 토큰 끝나면 마음껏 깊게 쓸 수 있게. 자동 갱신 X — 다음 달 명시 결제.
      </div>
      ${minorWarning}
      ${isEarly ? earlyCard(TIER_PLANS_CLIENT.early_light) : tierCard('light', TIER_PLANS_CLIENT.light, false)}
      ${tierCard('premium', TIER_PLANS_CLIENT.premium, true)}
      <div style="font-size:10.5px; color:var(--text-soft); line-height:1.7; padding:10px; background:rgba(126,200,227,0.04); border-left:3px solid rgba(126,200,227,0.30); border-radius:4px;">
        💡 ${isEarly ? '얼리 유저는 평생 이 가격이야. 더 쓰고 싶으면 Premium 으로 가도 돼.' : '잘 모르겠으면 <b>Light</b> 부터. 더 쓰고 싶으면 Premium.'}<br>
        해지: [설정 → 구독] 환불 (잔여일 비례 — <a href="/refund" target="_blank" style="color:var(--accent);">정책</a>).
      </div>
      <button class="btn-secondary" onclick="closeSubscribeModal()" style="width:100%; margin-top:10px;">닫기</button>
    </div>
  `;
  document.body.appendChild(overlay);
}

function closeSubscribeModal() {
  const overlay = document.getElementById('subscribeModalOverlay');
  if (overlay) overlay.remove();
}

// 사용자 명시 2026-04-30: tier 인자 받음 ('light' | 'premium').
// 포트원 채널 키 미설정 = 베타 (토스 수동 송금 + AI vision 인증). 활성 시 카드 결제.
async function proceedSubscribe(tierKey) {
  const tier = TIER_PLANS_CLIENT[tierKey];
  if (!tier) { alert('잘못된 tier'); return; }

  // 포트원 미설정 = 토스 송금 fallback (한 달 구독, 자동 갱신 X)
  const channelKey = window.PORTONE_CHANNEL_KEY || '';
  if (!channelKey) {
    closeSubscribeModal();
    showTossSubscribeModal(tierKey);
    return;
  }

  // 포트원 활성 — 카드 결제 흐름
  if (typeof window.IMP === 'undefined') {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.iamport.kr/v1/iamport.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    }).catch(() => alert('포트원 SDK 로드 실패'));
  }
  if (typeof window.IMP === 'undefined') return;
  IMP.init(channelKey);

  const merchantUid = `sub_${tierKey}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  IMP.request_pay({
    pg: 'tosspayments', pay_method: 'card', merchant_uid: merchantUid,
    name: `소라고동 ${tier.label} 구독`,
    amount: tier.krw,
    buyer_email: session?.user?.email || ''
  }, async (rsp) => {
    if (!rsp.success) { alert('결제 실패: ' + (rsp.error_msg || '취소됨')); return; }
    try {
      const verifyResp = await fetch('/api/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
        body: JSON.stringify({ imp_uid: rsp.imp_uid, merchant_uid: merchantUid, plan: tierKey })
      });
      const result = await verifyResp.json();
      if (verifyResp.ok && result.ok) {
        showToast(`📅 ${tier.label} 구독 완료 (${tier.krw.toLocaleString()}원/월)`);
        closeSubscribeModal();
        if (typeof refreshBillingStatus === 'function') refreshBillingStatus();
      } else {
        alert('결제 검증 실패: ' + (result.error || '알 수 없음'));
      }
    } catch (e) {
      alert('백엔드 통신 실패: ' + (e.message || e));
    }
  });
}

