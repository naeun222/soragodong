// ─── 구독 모달 (사용자 명시 2026-05-06: PortOne V2 카드 결제, 토스 수동 송금 폐기) ───
// Light 9,900 + Premium 25,000. 자동 갱신 X — 다음 달 명시 결제.

// 사용자 명시 2026-05-06: KG이니시스 V2 일반 결제 = customer.phoneNumber + fullName 필수.
// 한 번 입력받으면 state.preferences.paymentPhone / paymentFullName 에 보관해서 재사용.
// 단일 모달에 두 input 같이 — prompt 두 번 X.
function _collectPaymentInfoIfNeeded() {
  state.preferences = state.preferences || {};
  const savedPhone = state.preferences.paymentPhone;
  const savedName = (state.preferences.paymentFullName || '').trim();
  if (savedPhone && /^010\d{7,8}$/.test(savedPhone) && savedName.length >= 2) {
    return Promise.resolve({ phoneNumber: savedPhone, fullName: savedName });
  }
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'input-modal-overlay show';
    overlay.id = 'paymentInfoOverlay';
    overlay.style.zIndex = '10001';
    overlay.innerHTML = `
      <div class="input-modal" style="max-width:360px; padding:22px;">
        <div style="font-size:16px; font-weight:700; color:var(--text); margin-bottom:6px;">💳 구매자 정보</div>
        <div style="font-size:11.5px; color:var(--text-dim); line-height:1.6; margin-bottom:14px;">
          KG이니시스 정책상 카드 결제 시 필수.<br>
          <span style="color:var(--text-soft);">한 번만 입력하면 다음부터 자동.</span>
        </div>
        <label style="display:block; font-size:11.5px; color:var(--text-dim); margin-bottom:4px;">이름 (실명)</label>
        <input type="text" id="paymentInfoName" value="${escapeHtml(savedName || '')}" placeholder="홍길동" style="width:100%; padding:10px 12px; background:var(--surface); border:1px solid var(--border); border-radius:8px; font-size:13px; color:var(--text); margin-bottom:12px;" autocomplete="name">
        <label style="display:block; font-size:11.5px; color:var(--text-dim); margin-bottom:4px;">휴대폰 번호</label>
        <input type="tel" id="paymentInfoPhone" value="${escapeHtml(savedPhone || '')}" placeholder="010-1234-5678" style="width:100%; padding:10px 12px; background:var(--surface); border:1px solid var(--border); border-radius:8px; font-size:13px; color:var(--text); margin-bottom:14px;" autocomplete="tel" inputmode="tel">
        <div id="paymentInfoError" style="font-size:11px; color:#e89090; margin-bottom:10px; min-height:14px;"></div>
        <button class="btn-primary" id="paymentInfoSubmit" style="width:100%; margin-bottom:6px;">저장하고 결제 진행</button>
        <button class="btn-secondary" id="paymentInfoCancel" style="width:100%;">취소</button>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = (val) => {
      const ov = document.getElementById('paymentInfoOverlay');
      if (ov) ov.remove();
      resolve(val);
    };
    document.getElementById('paymentInfoCancel').addEventListener('click', () => close(null));
    document.getElementById('paymentInfoSubmit').addEventListener('click', () => {
      const name = String(document.getElementById('paymentInfoName').value || '').trim();
      const phoneRaw = String(document.getElementById('paymentInfoPhone').value || '');
      const digits = phoneRaw.replace(/[^0-9]/g, '');
      const err = document.getElementById('paymentInfoError');
      if (name.length < 2) { err.textContent = '이름이 너무 짧아 (2자 이상).'; return; }
      if (!/^010\d{7,8}$/.test(digits)) { err.textContent = '휴대폰 형식이 잘못됐어 (010 으로 시작하는 10~11 자리).'; return; }
      state.preferences.paymentFullName = name;
      state.preferences.paymentPhone = digits;
      try { saveState(); } catch {}
      close({ phoneNumber: digits, fullName: name });
    });
    setTimeout(() => {
      const target = (savedName.length < 2) ? 'paymentInfoName' : 'paymentInfoPhone';
      const el = document.getElementById(target);
      if (el) el.focus();
    }, 50);
  });
}

// 사용자 명시 (개발자 도구): 결제 사전 정보 모달 미리보기. 캐시 비우고 다시 띄움 = 처음 결제 경험 재현.
function devPreviewPaymentInfoModal() {
  if (typeof _isAdmin === 'function' && !_isAdmin()) return;
  state.preferences = state.preferences || {};
  state.preferences.paymentPhone = null;
  state.preferences.paymentFullName = null;
  try { saveState(); } catch {}
  _collectPaymentInfoIfNeeded().then((res) => {
    if (typeof showToast === 'function') {
      showToast(res ? `저장됨: ${res.fullName} / ${res.phoneNumber}` : '미리보기 취소');
    }
  });
}

async function openSubscribeModal() {
  if (document.getElementById('subscribeModalOverlay')) return;
  if (typeof refreshBillingStatus === 'function') {
    try { await refreshBillingStatus(false); } catch {}
  }
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
  const earlyLifetimePlan = TIER_PLANS_CLIENT.early_lifetime;
  // 사용자 명시 2026-05-06 ultrathink: 얼리버드 평생 = 하늘색~파란색 gradient (Light 대체 분위기).
  const earlyLifetimeCard = `
    <div style="position:relative; padding:18px 16px; background:linear-gradient(135deg, rgba(135,206,235,0.18), rgba(74,144,226,0.10)); border:1.5px solid #5fb4d3; border-radius:14px; margin-bottom:10px;">
      <div style="position:absolute; top:-10px; left:16px; background:linear-gradient(135deg, #87CEEB, #4A90E2); color:#0c1e3a; font-size:9px; font-weight:700; letter-spacing:0.15em; padding:3px 8px; border-radius:4px;">출시 전 한정</div>
      <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:4px;">
        <div style="font-size:18px; font-weight:700; color:var(--text);">${earlyLifetimePlan.emoji} ${earlyLifetimePlan.label}</div>
        <div style="font-size:18px; font-weight:700; color:#5fb4d3;">${earlyLifetimePlan.krw.toLocaleString()}원<span style="font-size:11px; color:var(--text-dim); font-weight:400;"> 1회</span></div>
      </div>
      <div style="font-size:12px; color:var(--text-dim); margin-bottom:10px;">${earlyLifetimePlan.tagline}</div>
      <div style="font-size:11.5px; color:var(--text); line-height:1.7; padding:10px; background:rgba(0,0,0,0.18); border-radius:8px; margin-bottom:10px;">
        ${earlyLifetimePlan.description}
      </div>
      <button class="btn-primary" onclick="proceedSubscribe('early_lifetime')" style="width:100%; padding:11px; background:linear-gradient(135deg, #87CEEB, #4A90E2); color:#0c1e3a; font-weight:700;">${earlyLifetimePlan.emoji} 얼리버드 평생 이용권 (${earlyLifetimePlan.krw.toLocaleString()}원)</button>
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
        체험 끝나도 계속 쓸 수 있게. 자동 갱신 X — 직접 결제.
      </div>
      ${minorWarning}
      ${earlyLifetimeCard}
      ${tierCard('light', TIER_PLANS_CLIENT.light, false)}
      ${tierCard('premium', TIER_PLANS_CLIENT.premium, true)}
      <div style="font-size:10.5px; color:var(--text-soft); line-height:1.7; padding:10px; background:rgba(126,200,227,0.04); border-left:3px solid rgba(126,200,227,0.30); border-radius:4px;">
        💡 잘 모르겠으면 <b style="color:#5fb4d3;">얼리버드 평생</b> <s style="opacity:0.55;">또는 <b>Light</b></s>. 깊게 자주 쓰면 Premium.<br>
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

// 사용자 명시 2026-05-06: PortOne V2 SDK 카드 결제. 옛 V1 (IMP) + 토스 수동 송금 fallback 폐기.
// channelKey + storeId 미설정 시 alert (env 정정 필요).
async function proceedSubscribe(tierKey) {
  const tier = TIER_PLANS_CLIENT[tierKey];
  if (!tier) { alert('잘못된 tier'); return; }
  if (!session || !session.access_token) {
    alert('로그인 필요 — 설정 → 로그아웃 후 재로그인.');
    return;
  }
  if (typeof state !== 'undefined' && state && state.isGuest) {
    alert('게스트 모드는 결제 X — 먼저 로그인.');
    return;
  }
  const channelKey = (typeof PORTONE_CHANNEL_KEY !== 'undefined') ? PORTONE_CHANNEL_KEY : '';
  const storeId = (typeof PORTONE_STORE_ID !== 'undefined') ? PORTONE_STORE_ID : '';
  if (!channelKey || !storeId) {
    alert('결제 설정 오류 (PORTONE_CHANNEL_KEY / PORTONE_STORE_ID 미설정)');
    return;
  }

  const info = await _collectPaymentInfoIfNeeded();
  if (!info) return;
  const { phoneNumber, fullName } = info;

  // PortOne V2 SDK 동적 로드.
  if (typeof window.PortOne === 'undefined') {
    try {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.portone.io/v2/browser-sdk.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    } catch (e) {
      alert('PortOne SDK 로드 실패 — 네트워크 확인 후 다시');
      return;
    }
  }
  if (typeof window.PortOne === 'undefined') {
    alert('PortOne SDK 객체 X');
    return;
  }

  const isLifetimeTier = tierKey === 'early_lifetime';
  // 결제 시도 — paymentId = 매번 unique. 사용자 본인 식별용 customer 정보 + tier 별 amount.
  const paymentId = `payment-${tierKey}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  // 사용자 보고 2026-05-06: 모바일 redirect 흐름에서 verify-pay 호출 시점 user_id 와 결제 시점 user_id 가 다르면 NOT_OWN.
  // marker = _handlePaymentReturn 에서 매칭 검증용.
  try {
    sessionStorage.setItem('soragodong_pending_payment', JSON.stringify({
      paymentId,
      user_id: authUserId || '',
      ts: Date.now()
    }));
  } catch {}
  let response;
  try {
    response = await window.PortOne.requestPayment({
      storeId,
      channelKey,
      paymentId,
      orderName: isLifetimeTier ? `소라고동 ${tier.label} 이용권 (평생)` : `소라고동 ${tier.label} 구독 (1개월)`,
      totalAmount: tier.krw,
      currency: 'KRW',
      payMethod: 'CARD',
      // 사용자 보고 2026-05-06: 모바일 KG이니시스 = "PC 로 결제" 거부 메시지 → REDIRECTION 강제 + redirectUrl.
      windowType: { pc: 'IFRAME', mobile: 'REDIRECTION' },
      redirectUrl: window.location.origin + (window.location.pathname || '/'),
      customer: {
        customerId: authUserId || undefined,
        email: session?.user?.email || undefined,
        phoneNumber,
        fullName
      },
      customData: JSON.stringify({ tier: tierKey, type: 'subscribe' })
    });
  } catch (e) {
    alert('결제창을 열 수 없어. 잠시 후 다시 시도해줘.\n\n자세한 사유: ' + (e?.message || e));
    return;
  }

  // V2 SDK 응답 — 사용자가 결제창 닫음 / 카드 거절 / 잔액 부족 등 시 code 채워짐.
  if (response && response.code != null) {
    // 사용자 명시 2026-05-06: 결제 실패 카피 다듬기 — 사용자 입장 친절하게.
    const code = response.code || '';
    const msg = response.message || '';
    let userMsg;
    if (code === 'USER_CANCEL' || /cancel|취소/i.test(msg)) {
      userMsg = '결제를 취소했어. 다시 시도하려면 다시 눌러줘.';
    } else if (/잔액|insufficient|한도|limit/i.test(msg)) {
      userMsg = '카드 한도 / 잔액이 부족해 보여. 다른 카드로 다시 시도해줘.';
    } else if (/거절|declin|reject/i.test(msg)) {
      userMsg = '카드사가 결제를 거절했어. 다른 카드로 시도하거나 카드사에 문의해줘.';
    } else {
      userMsg = '결제 처리 중 문제가 생겼어 — 잠시 후 다시 시도해줘.\n\n자세한 사유: ' + msg + (code ? ' (' + code + ')' : '');
    }
    alert(userMsg);
    return;
  }

  // 결제 완료 — backend 검증 호출.
  try {
    const verifyResp = await fetch('/api/billing/portone-verify-pay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token
      },
      body: JSON.stringify({ paymentId, plan: tierKey })
    });
    const result = await verifyResp.json();
    if (verifyResp.ok && result.ok) {
      if (result.duplicate) {
        showToast('💳 이미 활성 구독 — 영수증 보관, 환불 안내 메일 확인');
        alert(result.message || '이미 활성 구독이 있어. 환불 요청은 이메일로.');
      } else if (isLifetimeTier) {
        showToast(`✨ 얼리버드 평생 이용권 완료 — 고마워 🫂`);
      } else {
        showToast(`📅 ${tier.label} 구독 완료 (${tier.krw.toLocaleString()}원/월)`);
      }
      closeSubscribeModal();
      if (typeof refreshBillingStatus === 'function') refreshBillingStatus();
    } else {
      alert('결제 검증 실패: ' + (result.error || '알 수 없음'));
    }
  } catch (e) {
    alert('백엔드 통신 실패: ' + (e?.message || e));
  }
}
