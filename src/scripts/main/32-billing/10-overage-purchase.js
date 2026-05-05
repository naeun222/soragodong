// ─── 추가팩 결제 + Tier 업그레이드 (PortOne V2) ───
// 사용자 명시 2026-05-06: V1 (IMP/iamport.js) → V2 (PortOne SDK) 마이그레이션.

async function _portOneV2RequestPayment({ paymentId, orderName, amount, customData }) {
  const channelKey = (typeof PORTONE_CHANNEL_KEY !== 'undefined') ? PORTONE_CHANNEL_KEY : '';
  const storeId = (typeof PORTONE_STORE_ID !== 'undefined') ? PORTONE_STORE_ID : '';
  if (!channelKey || !storeId) {
    alert('결제 설정 오류 (PORTONE_CHANNEL_KEY / PORTONE_STORE_ID 미설정)');
    return null;
  }
  // 사용자 명시 2026-05-06: KG이니시스 V2 일반 결제 = customer.phoneNumber + fullName 필수.
  const phoneNumber = (typeof _getPaymentPhoneNumber === 'function') ? _getPaymentPhoneNumber() : null;
  if (!phoneNumber) return null;
  const fullName = (typeof _getPaymentFullName === 'function') ? _getPaymentFullName() : null;
  if (!fullName) return null;
  if (typeof window.PortOne === 'undefined') {
    try {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.portone.io/v2/browser-sdk.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    } catch {
      alert('PortOne SDK 로드 실패');
      return null;
    }
  }
  if (typeof window.PortOne === 'undefined') {
    alert('PortOne SDK 객체 X');
    return null;
  }
  try {
    const response = await window.PortOne.requestPayment({
      storeId, channelKey, paymentId,
      orderName, totalAmount: amount, currency: 'KRW', payMethod: 'CARD',
      customer: { customerId: authUserId || undefined, email: session?.user?.email || undefined, phoneNumber, fullName },
      customData: customData ? JSON.stringify(customData) : undefined
    });
    if (response && response.code != null) {
      // 사용자 명시 2026-05-06: 결제 실패 카피 — 사용자 입장 친절.
      const code = response.code || '';
      const msg = response.message || '';
      let userMsg;
      if (code === 'USER_CANCEL' || /cancel|취소/i.test(msg)) {
        userMsg = '결제를 취소했어. 다시 시도하려면 다시 눌러줘.';
      } else if (/잔액|insufficient|한도|limit/i.test(msg)) {
        userMsg = '카드 한도 / 잔액이 부족해 보여. 다른 카드로 다시 시도해줘.';
      } else if (/거절|declin|reject/i.test(msg)) {
        userMsg = '카드사가 결제를 거절했어. 다른 카드로 시도하거나 카드사에 문의.';
      } else {
        userMsg = '결제 처리 중 문제가 생겼어 — 잠시 후 다시.\n\n자세한 사유: ' + msg + (code ? ' (' + code + ')' : '');
      }
      alert(userMsg);
      return null;
    }
    return response;
  } catch (e) {
    alert('결제창 호출 실패: ' + (e?.message || e));
    return null;
  }
}

// ─── 추가팩 결제 (cap 도달 시) ───
async function purchaseOveragePack(packKey) {
  const pack = OVERAGE_PACKS_CLIENT[packKey];
  if (!pack) { alert('잘못된 pack'); return; }
  if (!session?.access_token) { alert('로그인 필요'); return; }
  const paymentId = `pack-${packKey}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const result = await _portOneV2RequestPayment({
    paymentId,
    orderName: `소라고동 ${pack.label}`,
    amount: pack.krw,
    customData: { type: 'overage_pack', pack: packKey }
  });
  if (!result) return;
  try {
    const verifyResp = await fetch('/api/billing/overage-pack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ paymentId, pack: packKey })
    });
    const data = await verifyResp.json();
    if (verifyResp.ok && data.ok) {
      showToast(`✦ ${pack.label} 결제 완료 (+$${pack.usd})`);
      const ov = document.getElementById('budgetExceededOverlay');
      if (ov) ov.remove();
      if (typeof refreshBillingStatus === 'function') refreshBillingStatus();
    } else {
      alert('결제 검증 실패: ' + (data.error || '알 수 없음'));
    }
  } catch (e) { alert('백엔드 통신 실패: ' + (e?.message || e)); }
}

// ─── Tier 업그레이드 (Light → Premium 정가 결제) ───
async function upgradeToPremium() {
  if (!session?.access_token) { alert('로그인 필요'); return; }
  const paymentId = `upgrade-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const result = await _portOneV2RequestPayment({
    paymentId,
    orderName: '소라고동 Premium 구독 (Light → Premium 전환)',
    amount: TIER_UPGRADE_KRW,
    customData: { type: 'tier_upgrade', from: 'light', to: 'premium' }
  });
  if (!result) return;
  try {
    const verifyResp = await fetch('/api/billing/upgrade-tier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ paymentId })
    });
    const data = await verifyResp.json();
    if (verifyResp.ok && data.ok) {
      showToast('🌊 Premium 업그레이드 완료');
      const ov = document.getElementById('budgetExceededOverlay');
      if (ov) ov.remove();
      if (typeof refreshBillingStatus === 'function') refreshBillingStatus();
    } else {
      alert('결제 검증 실패: ' + (data.error || '알 수 없음'));
    }
  } catch (e) { alert('백엔드 통신 실패: ' + (e?.message || e)); }
}
