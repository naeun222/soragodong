// ─── 추가팩 결제 (cap 도달 시) ───
async function purchaseOveragePack(packKey) {
  const pack = OVERAGE_PACKS_CLIENT[packKey];
  if (!pack) { alert('잘못된 pack'); return; }
  if (typeof window.IMP === 'undefined') {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.iamport.kr/v1/iamport.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    }).catch(() => alert('포트원 SDK 로드 실패'));
  }
  if (typeof window.IMP === 'undefined') return;
  const channelKey = window.PORTONE_CHANNEL_KEY || '';
  if (!channelKey) { alert('결제 시스템 미설정.'); return; }
  IMP.init(channelKey);
  const merchantUid = `pack_${packKey}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  IMP.request_pay({
    pg: 'tosspayments', pay_method: 'card', merchant_uid: merchantUid,
    name: `소라고동 ${pack.label}`,
    amount: pack.krw,
    buyer_email: session?.user?.email || ''
  }, async (rsp) => {
    if (!rsp.success) { alert('결제 실패: ' + (rsp.error_msg || '취소됨')); return; }
    try {
      const verifyResp = await fetch('/api/billing/overage-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
        body: JSON.stringify({ imp_uid: rsp.imp_uid, merchant_uid: merchantUid, pack: packKey })
      });
      const result = await verifyResp.json();
      if (verifyResp.ok && result.ok) {
        showToast(`✦ ${pack.label} 결제 완료 (+$${pack.usd})`);
        const ov = document.getElementById('budgetExceededOverlay');
        if (ov) ov.remove();
        if (typeof refreshBillingStatus === 'function') refreshBillingStatus();
      } else {
        alert('결제 검증 실패: ' + (result.error || '알 수 없음'));
      }
    } catch (e) { alert('백엔드 통신 실패: ' + (e.message || e)); }
  });
}

// ─── Tier 업그레이드 (Light → Premium 차액 결제) ───
async function upgradeToPremium() {
  if (typeof window.IMP === 'undefined') {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.iamport.kr/v1/iamport.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    }).catch(() => alert('포트원 SDK 로드 실패'));
  }
  if (typeof window.IMP === 'undefined') return;
  const channelKey = window.PORTONE_CHANNEL_KEY || '';
  if (!channelKey) { alert('결제 시스템 미설정.'); return; }
  IMP.init(channelKey);
  const merchantUid = `upg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  IMP.request_pay({
    pg: 'tosspayments', pay_method: 'card', merchant_uid: merchantUid,
    name: '소라고동 Light → Premium 업그레이드',
    amount: TIER_UPGRADE_DIFF_KRW,
    buyer_email: session?.user?.email || ''
  }, async (rsp) => {
    if (!rsp.success) { alert('결제 실패: ' + (rsp.error_msg || '취소됨')); return; }
    try {
      const verifyResp = await fetch('/api/billing/upgrade-tier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
        body: JSON.stringify({ imp_uid: rsp.imp_uid, merchant_uid: merchantUid })
      });
      const result = await verifyResp.json();
      if (verifyResp.ok && result.ok) {
        showToast('🌊 Premium 업그레이드 완료');
        const ov = document.getElementById('budgetExceededOverlay');
        if (ov) ov.remove();
        if (typeof refreshBillingStatus === 'function') refreshBillingStatus();
      } else {
        alert('결제 검증 실패: ' + (result.error || '알 수 없음'));
      }
    } catch (e) { alert('백엔드 통신 실패: ' + (e.message || e)); }
  });
}

