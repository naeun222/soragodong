// ─── 결제 redirect return handler (PortOne V2 모바일 흐름) ───
// 사용자 보고 2026-05-06: 모바일 KG이니시스 = 결제창 redirect → 우리 도메인 복귀 + URL query (paymentId / code / message).
// init() 끝부분에서 fire-and-forget 호출. paymentId 없으면 즉시 return.
// paymentId prefix 로 endpoint 분기:
//   payment-{tier}-...   → /api/billing/portone-verify-pay  (구독)
//   pack-{packKey}-...   → /api/billing/overage-pack        (충전)
//   upgrade-...          → /api/billing/upgrade-tier        (Light → Premium)

// 사용자 보고 2026-05-10: PC IFRAME 결제창 cancel 후 body 의 inline style (overflow / padding-bottom) 잔존 →
// 화면이 위로 올라간 듯 보이고 하단 padding 큼. PortOne V2 SDK 의 cleanup 누락 케이스 workaround.
// 모든 결제 응답 (성공/취소/에러) 직후 무조건 호출.
function _resetBodyAfterPortone() {
  try {
    document.body.style.overflow = '';
    document.body.style.paddingTop = '';
    document.body.style.paddingBottom = '';
    document.body.style.paddingLeft = '';
    document.body.style.paddingRight = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.bottom = '';
    document.body.style.transform = '';
    document.body.style.height = '';
    document.body.style.width = '';
    document.documentElement.style.overflow = '';
    document.documentElement.style.height = '';
    document.querySelectorAll('iframe[src*="portone"], iframe[src*="inicis"], div[id^="portone-"], div[class*="portone-v2"]').forEach(el => {
      try { el.remove(); } catch {}
    });
  } catch {}
}

async function _handlePaymentReturn() {
  let params;
  try { params = new URLSearchParams(window.location.search); } catch { return; }

  // 사용자 명시 2026-05-06: 빌링키 발급 redirect 복귀 — Plus 첫 달 무료 카드 등록 (옛 얼리버드 trial).
  // PortOne V2 = redirect 후 query 에 billingKey (또는 code/message) 채워짐. issueId prefix 'bkey-' 로 감지.
  // V4 (사용자 명시 2026-05-11 — 가계약): BILLING_RECURRING_ENABLED=false 시 빌링키 등록 흐름 자체 차단.
  const billingKey = params.get('billingKey');
  const issueId = params.get('issueId') || '';
  if (billingKey || issueId.startsWith('bkey-')) {
    if (typeof BILLING_RECURRING_ENABLED !== 'undefined' && !BILLING_RECURRING_ENABLED) {
      try {
        ['billingKey', 'issueId', 'code', 'message', 'transactionType', 'pgCode', 'pgMessage'].forEach(k => params.delete(k));
        const remaining = params.toString();
        const cleanUrl = window.location.origin + window.location.pathname + (remaining ? '?' + remaining : '');
        history.replaceState({}, '', cleanUrl);
      } catch {}
      console.warn('[paymentReturn] 정기결제 흐름 비활성 (BILLING_RECURRING_ENABLED=false) — billingKey return skip');
      return;
    }
    return _handleBillingKeyReturn(params);
  }

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

// 사용자 명시 2026-05-06: Plus 빌링키 발급 redirect 복귀 처리 (옛 얼리버드 trial).
// 모바일 흐름: requestIssueBillingKey({ windowType.mobile: 'REDIRECTION' }) → PortOne 결제창 →
// redirect_url 에 ?billingKey=... (성공) 또는 ?code=...&message=... (실패).
async function _handleBillingKeyReturn(params) {
  const billingKey = params.get('billingKey') || '';
  const code = params.get('code') || '';
  const message = params.get('message') || '';

  // URL 정리.
  try {
    ['billingKey', 'issueId', 'code', 'message', 'transactionType', 'pgCode', 'pgMessage'].forEach(k => params.delete(k));
    const remaining = params.toString();
    const cleanUrl = window.location.origin + window.location.pathname + (remaining ? '?' + remaining : '');
    history.replaceState({}, '', cleanUrl);
  } catch {}

  if (code) {
    let userMsg;
    if (code === 'USER_CANCEL' || /cancel|취소/i.test(message)) {
      userMsg = '카드 등록을 취소했어. 다시 시도하려면 다시 눌러줘.';
    } else {
      userMsg = '카드 등록 중 문제가 생겼어 — 잠시 후 다시 시도해줘.\n\n자세한 사유: ' + message + (code ? ' (' + code + ')' : '');
    }
    setTimeout(() => alert(userMsg), 300);
    return;
  }
  if (!billingKey) {
    setTimeout(() => alert('빌링키 응답을 못 받았어 — 다시 시도해줘.'), 300);
    return;
  }

  // 세션 도착 대기 (max 5s).
  let waited = 0;
  while (!session?.access_token && waited < 5000) {
    await new Promise(r => setTimeout(r, 200));
    waited += 200;
  }
  if (!session?.access_token) {
    setTimeout(() => alert('카드 등록 결과 — 로그인 후 새로고침으로 확인 가능해.'), 300);
    return;
  }
  if (session?.user?.is_anonymous) {
    setTimeout(() => alert('익명 게스트 상태 — 빌링키 등록 X. 정식 계정으로 로그인 후 다시.'), 300);
    return;
  }

  try {
    if (typeof showToast === 'function') showToast('카드 등록 확인 중…');
    // V4 (사용자 명시 2026-05-11 ultrathink): defensive plan='light' 명시 — backend default 안 의존.
    //   trial 흐름 = Plus (key='light'). 옛 default 'early_lifetime' 잔재 시 잘못된 tier trial 방지.
    const resp = await fetch('/api/billing/portone-register-trial', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token
      },
      body: JSON.stringify({ billingKey, plan: 'light' })
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok && data.ok) {
      const tier = (typeof TIER_PLANS_CLIENT !== 'undefined' && TIER_PLANS_CLIENT.light) || { krw: 9900 };
      if (data.duplicate) {
        setTimeout(() => alert(data.message || '이미 활성 Plus 구독이 있어.'), 300);
      } else if (typeof showToast === 'function') {
        showToast(`🌊 Plus 첫 달 무료 시작 — 30일 후 ${tier.krw.toLocaleString()}원 자동 결제`);
      }
      if (typeof refreshBillingStatus === 'function') {
        try { await refreshBillingStatus(true); } catch {}
      }
    } else {
      setTimeout(() => alert('빌링키 등록 실패: ' + (data?.error || '알 수 없음')), 300);
    }
  } catch (e) {
    setTimeout(() => alert('빌링키 등록 중 오류: ' + (e?.message || e)), 300);
  }
}
