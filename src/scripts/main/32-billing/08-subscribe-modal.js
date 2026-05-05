// ─── 구독 모달 (사용자 명시 2026-05-06: PortOne V2 카드 결제, 토스 수동 송금 폐기) ───
// Light 9,900 + Premium 25,000. 자동 갱신 X — 다음 달 명시 결제.

// 사용자 명시 2026-05-06: KG이니시스 V2 일반 결제 = customer.phoneNumber + fullName 필수.
// 한 번 입력받으면 state.preferences.paymentPhone / paymentFullName 에 보관해서 재사용.
function _getPaymentPhoneNumber() {
  state.preferences = state.preferences || {};
  const saved = state.preferences.paymentPhone;
  if (saved && /^010\d{7,8}$/.test(saved)) return saved;
  const raw = prompt('결제 진행을 위해 휴대폰 번호 입력 (예: 010-1234-5678)\n— KG이니시스 정책상 필수');
  if (raw == null) return null;
  const digits = String(raw).replace(/[^0-9]/g, '');
  if (!/^010\d{7,8}$/.test(digits)) {
    alert('휴대폰 번호 형식이 잘못됐어 (010 으로 시작하는 10~11 자리).');
    return null;
  }
  state.preferences.paymentPhone = digits;
  try { saveState(); } catch {}
  return digits;
}
function _getPaymentFullName() {
  state.preferences = state.preferences || {};
  const saved = state.preferences.paymentFullName;
  if (saved && saved.trim().length >= 2) return saved.trim();
  const raw = prompt('결제 진행을 위해 구매자 이름 입력 (실명)\n— KG이니시스 정책상 필수');
  if (raw == null) return null;
  const name = String(raw).trim();
  if (name.length < 2) {
    alert('이름이 너무 짧아 (2자 이상).');
    return null;
  }
  state.preferences.paymentFullName = name;
  try { saveState(); } catch {}
  return name;
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
      ${tierCard('light', TIER_PLANS_CLIENT.light, false)}
      ${tierCard('premium', TIER_PLANS_CLIENT.premium, true)}
      <div style="font-size:10.5px; color:var(--text-soft); line-height:1.7; padding:10px; background:rgba(126,200,227,0.04); border-left:3px solid rgba(126,200,227,0.30); border-radius:4px;">
        💡 잘 모르겠으면 <b>Light</b> 부터. 더 쓰고 싶으면 Premium.<br>
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

  const phoneNumber = _getPaymentPhoneNumber();
  if (!phoneNumber) return;
  const fullName = _getPaymentFullName();
  if (!fullName) return;

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

  // 결제 시도 — paymentId = 매번 unique. 사용자 본인 식별용 customer 정보 + tier 별 amount.
  const paymentId = `payment-${tierKey}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  let response;
  try {
    response = await window.PortOne.requestPayment({
      storeId,
      channelKey,
      paymentId,
      orderName: `소라고동 ${tier.label} 구독 (1개월)`,
      totalAmount: tier.krw,
      currency: 'KRW',
      payMethod: 'CARD',
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
