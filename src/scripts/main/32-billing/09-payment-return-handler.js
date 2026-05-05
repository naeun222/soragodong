// ─── 결제 redirect return handler (PortOne V2 모바일 흐름) ───
// 사용자 보고 2026-05-06: 모바일 KG이니시스 = 결제창 redirect → 우리 도메인 복귀 + URL query (paymentId / code / message).
// init() 끝부분에서 fire-and-forget 호출. paymentId 없으면 즉시 return.
// paymentId prefix 로 endpoint 분기:
//   payment-{tier}-...   → /api/billing/portone-verify-pay  (구독)
//   pack-{packKey}-...   → /api/billing/overage-pack        (충전)
//   upgrade-...          → /api/billing/upgrade-tier        (Light → Premium)

async function _handlePaymentReturn() {
  let params;
  try { params = new URLSearchParams(window.location.search); } catch { return; }
  const paymentId = params.get('paymentId');
  if (!paymentId) return;

  const code = params.get('code') || '';
  const message = params.get('message') || '';

  try {
    ['paymentId', 'code', 'message', 'transactionType', 'txId', 'pgCode', 'pgMessage'].forEach(k => params.delete(k));
    const remaining = params.toString();
    const cleanUrl = window.location.origin + window.location.pathname + (remaining ? '?' + remaining : '');
    history.replaceState({}, '', cleanUrl);
  } catch {}

  if (code) {
    let userMsg;
    if (code === 'USER_CANCEL' || /cancel|취소/i.test(message)) {
      userMsg = '결제를 취소했어. 다시 시도하려면 다시 눌러줘.';
    } else if (/잔액|insufficient|한도|limit/i.test(message)) {
      userMsg = '카드 한도 / 잔액이 부족해 보여. 다른 카드로 다시 시도해줘.';
    } else if (/거절|declin|reject/i.test(message)) {
      userMsg = '카드사가 결제를 거절했어. 다른 카드로 시도하거나 카드사에 문의해줘.';
    } else {
      userMsg = '결제 처리 중 문제가 생겼어 — 잠시 후 다시 시도해줘.\n\n자세한 사유: ' + message + (code ? ' (' + code + ')' : '');
    }
    setTimeout(() => alert(userMsg), 300);
    return;
  }

  let waited = 0;
  while (!session?.access_token && waited < 5000) {
    await new Promise(r => setTimeout(r, 200));
    waited += 200;
  }
  if (!session?.access_token) {
    setTimeout(() => alert('결제 결과 — 로그인 후 새로고침으로 확인 가능해.\n\n결제 ID: ' + paymentId), 300);
    return;
  }

  // 사용자 보고 2026-05-06: anonymous 상태에서 verify-pay 호출 차단 (잘못된 user.id 로 INSERT 방지).
  if (session?.user?.is_anonymous) {
    setTimeout(() => alert(
      '익명 게스트 상태 — 결제 검증 X.\n\n' +
      '결제는 PortOne 쪽에서 정상 처리됐어. 결제했던 정식 계정으로 다시 로그인 후 결제 history 에서 확인.\n\n' +
      '결제 ID: ' + paymentId
    ), 300);
    console.warn('[paymentReturn] anonymous — blocked verify:', paymentId);
    return;
  }

  // 결제 시점 marker 와 현재 session 매칭 검증 (30분 만료).
  let pendingMarker = null;
  try {
    const raw = sessionStorage.getItem('soragodong_pending_payment');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (Date.now() - (parsed.ts || 0)) < 30 * 60 * 1000) pendingMarker = parsed;
    }
  } catch {}
  try { sessionStorage.removeItem('soragodong_pending_payment'); } catch {}

  if (pendingMarker && pendingMarker.paymentId === paymentId && pendingMarker.user_id && pendingMarker.user_id !== session.user.id) {
    setTimeout(() => alert(
      '결제 시점의 계정과 현재 로그인 계정이 달라.\n\n' +
      '결제는 PortOne 쪽에서 정상 처리됐어. 결제했던 계정으로 다시 로그인 후 결제 history 에서 확인.\n\n' +
      '결제 시점 user_id: ' + pendingMarker.user_id + '\n' +
      '현재 user_id: ' + session.user.id + '\n' +
      '결제 ID: ' + paymentId
    ), 300);
    console.warn('[paymentReturn] user mismatch — blocked verify:', pendingMarker.user_id, '→', session.user.id);
    return;
  }

  const parts = paymentId.split('-');
  let endpoint, body, successMsg;
  if (paymentId.startsWith('payment-')) {
    endpoint = '/api/billing/portone-verify-pay';
    body = { paymentId, plan: parts[1] || '' };
    successMsg = '📅 구독 완료';
  } else if (paymentId.startsWith('pack-')) {
    endpoint = '/api/billing/overage-pack';
    body = { paymentId, pack: parts[1] || '' };
    successMsg = '✦ 추가팩 결제 완료';
  } else if (paymentId.startsWith('upgrade-')) {
    endpoint = '/api/billing/upgrade-tier';
    body = { paymentId };
    successMsg = '🌊 Premium 업그레이드 완료';
  } else {
    console.warn('[paymentReturn] unknown paymentId prefix:', paymentId);
    setTimeout(() => alert('결제 ID 형식 인식 실패: ' + paymentId), 300);
    return;
  }

  try {
    if (typeof showToast === 'function') showToast('결제 확인 중…');
    const verifyResp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token
      },
      body: JSON.stringify(body)
    });
    const data = await verifyResp.json().catch(() => ({}));
    if (verifyResp.ok && data.ok) {
      if (data.duplicate) {
        setTimeout(() => alert(data.message || '이미 처리된 결제 — 영수증 확인.'), 300);
      } else if (typeof showToast === 'function') {
        showToast(successMsg);
      }
      if (typeof refreshBillingStatus === 'function') {
        try { await refreshBillingStatus(true); } catch {}
      }
    } else {
      setTimeout(() => alert('결제 검증 실패: ' + (data?.error || '알 수 없는 오류') + '\n\npaymentId: ' + paymentId), 300);
    }
  } catch (e) {
    setTimeout(() => alert('결제 검증 중 오류: ' + (e?.message || e) + '\n\npaymentId: ' + paymentId), 300);
  }
}
