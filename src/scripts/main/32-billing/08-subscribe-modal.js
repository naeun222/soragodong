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

// 결제 수단 선택 픽커 — 플랜 클릭 후 카드/카카오페이/토스페이 중 선택.
let __payMethodPickerResolve = null;
function _pickPayMethodResolve(method) {
  const ov = document.getElementById('payMethodPickerOverlay');
  if (ov) ov.remove();
  if (__payMethodPickerResolve) {
    const r = __payMethodPickerResolve;
    __payMethodPickerResolve = null;
    r(method);
  }
}
function _pickPaymentMethod({ excludeToss = false, title = '결제 수단 선택' } = {}) {
  return new Promise((resolve) => {
    __payMethodPickerResolve = resolve;
    const tossBtn = excludeToss ? '' : `
        <button onclick="_pickPayMethodResolve('toss')" style="width:100%; padding:14px; margin-bottom:8px; display:flex; align-items:center; gap:12px; text-align:left; background:#0064FF; color:#fff; border:none; border-radius:10px; cursor:pointer; font-family:inherit;">
          <span style="font-size:14px; font-weight:900; letter-spacing:-0.02em;">toss</span>
          <div style="flex:1;">
            <div style="font-weight:700; font-size:13px;">토스페이</div>
            <div style="font-size:10.5px; opacity:0.85;">토스 앱으로 간편결제</div>
          </div>
        </button>`;
    const overlay = document.createElement('div');
    overlay.className = 'input-modal-overlay show';
    overlay.id = 'payMethodPickerOverlay';
    overlay.style.zIndex = '10002';
    overlay.innerHTML = `
      <div class="input-modal" style="max-width:340px; padding:22px;">
        <div style="font-size:15px; font-weight:700; color:var(--text); margin-bottom:14px;">${escapeHtml(title)}</div>
        <button onclick="_pickPayMethodResolve('card')" style="width:100%; padding:14px; margin-bottom:8px; display:flex; align-items:center; gap:12px; text-align:left; background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:10px; cursor:pointer; font-family:inherit;">
          <span style="font-size:20px;">💳</span>
          <div style="flex:1;">
            <div style="font-weight:700; font-size:13px;">카드</div>
            <div style="font-size:10.5px; color:var(--text-dim);">국내 신용/체크카드 (KG이니시스)</div>
          </div>
        </button>
        <button onclick="_pickPayMethodResolve('kakao')" style="width:100%; padding:14px; margin-bottom:8px; display:flex; align-items:center; gap:12px; text-align:left; background:#FEE500; color:#3C1E1E; border:none; border-radius:10px; cursor:pointer; font-family:inherit;">
          <span style="font-size:14px; font-weight:900;">kakao</span>
          <div style="flex:1;">
            <div style="font-weight:700; font-size:13px;">카카오페이</div>
            <div style="font-size:10.5px; opacity:0.75;">카카오 계정으로 간편결제</div>
          </div>
        </button>
        ${tossBtn}
        <button class="btn-secondary" onclick="_pickPayMethodResolve(null)" style="width:100%; padding:10px; margin-top:6px;">취소</button>
      </div>
    `;
    document.body.appendChild(overlay);
  });
}

function _getPayChannelInfo(method) {
  const storeId = (typeof PORTONE_STORE_ID !== 'undefined') ? PORTONE_STORE_ID : '';
  if (method === 'kakao') return {
    storeId,
    channelKey: (typeof PORTONE_KAKAO_CHANNEL_KEY !== 'undefined') ? PORTONE_KAKAO_CHANNEL_KEY : '',
    billingChannelKey: (typeof PORTONE_KAKAO_BILLING_CHANNEL_KEY !== 'undefined') ? PORTONE_KAKAO_BILLING_CHANNEL_KEY : '',
    payMethod: 'EASY_PAY', easyPay: { easyPayProvider: 'KAKAOPAY' }, needsCustomerInfo: false
  };
  if (method === 'toss') return {
    storeId,
    channelKey: (typeof PORTONE_TOSS_CHANNEL_KEY !== 'undefined') ? PORTONE_TOSS_CHANNEL_KEY : '',
    billingChannelKey: '',
    payMethod: 'EASY_PAY', easyPay: { easyPayProvider: 'TOSSPAY' }, needsCustomerInfo: false
  };
  return {
    storeId,
    channelKey: (typeof PORTONE_CHANNEL_KEY !== 'undefined') ? PORTONE_CHANNEL_KEY : '',
    billingChannelKey: (typeof PORTONE_BILLING_CHANNEL_KEY !== 'undefined') ? PORTONE_BILLING_CHANNEL_KEY : '',
    payMethod: 'CARD', easyPay: null, needsCustomerInfo: true
  };
}

async function openSubscribeModal() {
  if (document.getElementById('subscribeModalOverlay')) return;
  if (typeof refreshBillingStatus === 'function') {
    try { await refreshBillingStatus(false); } catch {}
  }
  const minorWarning = state.preferences?.requiresLegalGuardianForPayment
    ? `<div style="padding:10px; background:rgba(220,150,80,0.10); border:1px solid rgba(220,150,80,0.40); border-radius:8px; font-size:11px; color:#e8c590; margin-bottom:14px;">⚠️ 만 18세 미만은 결제 시 법정대리인 동의 필요</div>`
    : '';
  // V4 (사용자 명시 2026-05-11 ultrathink): tier 카드 통합 — 옛 earlyLifetimeCard 폐기.
  //   Plus (key='light', has_free_trial=true) 가 *RECOMMENDED + 첫 달 무료* 자리 차지.
  //   Light (key='early_lifetime') 는 정가 entry tier — 일반 tierCard 로 렌더.
  // freeTrial 띠 = plan.has_free_trial truthy 일 때. 버튼 색상도 trial 자리에 맞춰 sky gradient.
  const tierCard = (key, plan, recommended) => {
    const isFreeTrial = !!plan.has_free_trial;
    const trialBadge = isFreeTrial
      ? '<div style="position:absolute; top:-10px; left:16px; background:linear-gradient(135deg, #87CEEB, #4A90E2); color:#0c1e3a; font-size:9px; font-weight:700; letter-spacing:0.15em; padding:3px 8px; border-radius:4px;">첫 달 무료</div>'
      : '';
    const cardBg = isFreeTrial
      ? 'linear-gradient(135deg, rgba(135,206,235,0.18), rgba(74,144,226,0.10))'
      : (recommended ? 'linear-gradient(135deg, rgba(212,167,106,0.12), rgba(212,167,106,0.04))' : 'var(--surface)');
    const cardBorder = isFreeTrial
      ? '1.5px solid #5fb4d3'
      : (recommended ? '1.5px solid var(--accent)' : '1px solid var(--border)');
    const recommendBadge = (recommended && !isFreeTrial)
      ? '<div style="font-size:9px; letter-spacing:0.18em; text-transform:uppercase; color:var(--accent); font-weight:700; margin-bottom:6px;">RECOMMENDED</div>'
      : '';
    const priceHtml = isFreeTrial
      ? `<div style="font-size:18px; font-weight:700; color:#5fb4d3;">
           <span style="text-decoration:line-through; opacity:0.55; font-size:13px; font-weight:500; margin-right:6px;">${plan.krw.toLocaleString()}원</span>
           0원<span style="font-size:11px; color:var(--text-dim); font-weight:400;">/첫 달</span>
         </div>`
      : `<div style="font-size:18px; font-weight:700; color:var(--text);">${plan.krw.toLocaleString()}원<span style="font-size:11px; color:var(--text-dim); font-weight:400;">/월</span></div>`;
    const buttonStyle = isFreeTrial
      ? 'background:linear-gradient(135deg, #87CEEB, #4A90E2); color:#0c1e3a; font-weight:700;'
      : '';
    const _oneTime = (typeof BILLING_RECURRING_ENABLED !== 'undefined' && !BILLING_RECURRING_ENABLED);
    // V4 (사용자 명시 2026-05-11 ultrathink): Plus 첫 달 무료 = 가계약/정기 모두 활성. 가계약은 자동 결제 X 명시.
    const buttonText = isFreeTrial
      ? (_oneTime
          ? `${plan.emoji} 첫 달 무료 시작 (자동 결제 X)`
          : `${plan.emoji} 첫 달 무료로 시작하기`)
      : (_oneTime
          ? `${plan.label} 1개월 (${plan.krw.toLocaleString()}원)`
          : `${plan.label} 정기 구독 (월 ${plan.krw.toLocaleString()}원)`);
    return `
      <div class="tier-card ${recommended ? 'tier-recommended' : ''}" style="position:relative; padding:18px 16px; background:${cardBg}; border:${cardBorder}; border-radius:14px; margin-bottom:10px;">
        ${trialBadge}
        ${recommendBadge}
        <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:4px;">
          <div style="font-size:18px; font-weight:700; color:var(--text);">${plan.emoji} ${plan.label}</div>
          ${priceHtml}
        </div>
        <div style="font-size:12px; color:var(--text-dim); margin-bottom:10px;">${plan.tagline}</div>
        <div style="font-size:11.5px; color:var(--text); line-height:1.7; padding:10px; background:rgba(0,0,0,0.18); border-radius:8px; margin-bottom:10px;">
          ${plan.description}
        </div>
        <button class="btn-primary" onclick="proceedSubscribe('${key}')" style="width:100%; padding:11px; ${buttonStyle}">${buttonText}</button>
      </div>
    `;
  };
  // 사용자 명시 2026-05-11: Premium 추가팩 카드 — Premium 사용자 한정 단건결제. 비-Premium 클릭 시 안내 토스트.
  const premiumPack = OVERAGE_PACKS_CLIENT?.premium_pack;
  const premiumPackCard = premiumPack ? `
    <div style="padding:13px 15px; background:rgba(212,167,106,0.05); border:1px dashed rgba(212,167,106,0.45); border-radius:11px; margin-bottom:10px;">
      <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:3px;">
        <div style="font-size:13.5px; font-weight:600; color:var(--text);">🌊 Premium 추가팩</div>
        <div style="font-size:13.5px; font-weight:600; color:var(--text);">${premiumPack.krw.toLocaleString()}원<span style="font-size:10px; color:var(--text-dim); font-weight:400;"> · 단건</span></div>
      </div>
      <div style="font-size:11px; color:var(--text-dim); margin-bottom:9px;">월 한도 도달 시 추가 사용 — Premium 구독자 전용.</div>
      <button class="btn-secondary" onclick="tryBuyPremiumPack()" style="width:100%; padding:9px; font-size:12px;">추가팩 구매</button>
    </div>
  ` : '';
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay show';
  overlay.id = 'subscribeModalOverlay';
  overlay.style.zIndex = '10000';
  overlay.innerHTML = `
    <div class="input-modal" style="max-width:420px; max-height:92vh; overflow-y:auto; padding:24px;">
      <div style="font-size:17px; font-weight:700; color:var(--text); margin-bottom:14px;">📅 구독</div>
      ${minorWarning}
      ${tierCard('early_lifetime', TIER_PLANS_CLIENT.early_lifetime, false)}
      ${tierCard('light', TIER_PLANS_CLIENT.light, true)}
      ${tierCard('premium', TIER_PLANS_CLIENT.premium, false)}
      ${premiumPackCard}
      <div style="font-size:10.5px; color:var(--text-soft); line-height:1.7; padding:10px; background:rgba(126,200,227,0.04); border-left:3px solid rgba(126,200,227,0.30); border-radius:4px;">
        ${(typeof BILLING_RECURRING_ENABLED !== 'undefined' && !BILLING_RECURRING_ENABLED)
          ? `💡 잘 모르겠으면 <b style="color:#5fb4d3;">Plus 첫 달 무료</b> (1인 1회 한정). 가볍게 시작은 Light, 깊게 자주 쓰면 Premium.<br>
             <b>부가가치세 10% 포함</b> · <b>1개월 이용권 — 자동 갱신 X</b> (만료 7일 전 알림 후 직접 재구매).<br>
             환불: 잔여일 비례 (<a href="/refund" target="_blank" style="color:var(--accent);">정책</a>).<br>`
          : `💡 잘 모르겠으면 <b style="color:#5fb4d3;">Plus 첫 달 무료</b> (1인 1회 한정). 가볍게 시작은 Light, 깊게 자주 쓰면 Premium.<br>
             <b>부가가치세 10% 포함</b> · <b>모든 플랜 = 매월 자동 갱신</b> (해지 1-click).<br>
             해지: [설정 → 구독] 다음 갱신 해지 / 환불 잔여일 비례 (<a href="/refund" target="_blank" style="color:var(--accent);">정책</a>).<br>`}
        <span style="color:var(--text-dim);">⚠ 본 서비스는 임상 치료·진단·전문가 상담을 대체하지 않습니다.</span>
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

// 사용자 명시 2026-05-11: Premium 사용자만 추가팩 구매 가능. 비-Premium 클릭 시 토스트만.
function tryBuyPremiumPack() {
  const plan = window._billingCache?.subscription_plan || null;
  const active = !!window._billingCache?.subscription_active;
  if (!active || plan !== 'premium') {
    if (typeof showToast === 'function') showToast('🌊 Premium 구독자만 구매 가능');
    return;
  }
  closeSubscribeModal();
  if (typeof purchaseOveragePack === 'function') purchaseOveragePack('premium_pack');
}

// 사용자 명시 2026-05-11: Light/Premium 도 정기결제 — 빌링키 등록 흐름 (얼리버드와 동일하지만 첫 달 즉시 결제).
//   1) requestIssueBillingKey (빌링 채널) → billingKey 발급
//   2) /api/billing/portone-register-recurring → 첫 달 chargeWithBillingKey + next_billing_at=+30d
//   3) cron-charge-recurring 이 30일 후 자동 결제
// 토스페이는 tosstest = 일반결제만 → 빌링키 픽커에서 제외.
// V4 (사용자 명시 2026-05-11 ultrathink): trial flow 매핑 변경 — early_lifetime → light (Plus).
//   Light(4,900, key='early_lifetime') 은 정가 즉시 결제 / Plus(9,900, key='light') 는 첫 달 무료 trial.
// V4 (사용자 명시 2026-05-11 — 가계약): BILLING_RECURRING_ENABLED=false 시 1개월 일회성 결제로 분기.
async function proceedSubscribe(tierKey) {
  const tier = TIER_PLANS_CLIENT[tierKey];
  if (!tier) { alert('잘못된 tier'); return; }
  // V4 (사용자 명시 2026-05-11 ultrathink — 정정): 가계약 모드에서도 Plus 첫 달 무료 활성. 결제 X 흐름.
  if (typeof BILLING_RECURRING_ENABLED !== 'undefined' && !BILLING_RECURRING_ENABLED) {
    if (tier.has_free_trial) return proceedFreeTrial();  // Plus 첫 달 무료 — 결제 X, 카드 등록 X (1인 1회)
    return proceedOneTimePurchase(tierKey);              // Light/Premium = 일회성 1개월 결제
  }
  if (tier.has_free_trial) return proceedPlusTrial();  // Plus = 첫 달 무료 trial 흐름 (key='light')
  if (!session || !session.access_token) {
    alert('로그인 필요 — 설정 → 로그아웃 후 재로그인.');
    return;
  }
  if (typeof state !== 'undefined' && state && state.isGuest) {
    alert('게스트 모드는 결제 X — 먼저 로그인.');
    return;
  }
  const _pg = await _pickPaymentMethod({ excludeToss: true, title: `${tier.label} 정기 결제 수단 선택` });
  if (!_pg) return;
  const _pgInfo = _getPayChannelInfo(_pg);
  const billingChannelKey = _pgInfo.billingChannelKey || _pgInfo.channelKey;
  const storeId = _pgInfo.storeId;
  if (!billingChannelKey || !storeId) {
    alert('결제 설정 오류 — 빌링키 채널 미설정');
    return;
  }
  let phoneNumber = '', fullName = '';
  if (_pgInfo.needsCustomerInfo) {
    const info = await _collectPaymentInfoIfNeeded();
    if (!info) return;
    phoneNumber = info.phoneNumber;
    fullName = info.fullName;
  }

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
  if (typeof window.PortOne === 'undefined' || typeof window.PortOne.requestIssueBillingKey !== 'function') {
    alert('PortOne SDK 빌링키 기능 X');
    return;
  }

  // KG이니시스 oid 최대 40자 — userId 앞 8자 + base36 ts + rand4 = 26자.
  const issueId = `bk-${(authUserId||'anon').slice(0,8)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
  let response;
  try {
    response = await window.PortOne.requestIssueBillingKey({
      storeId,
      channelKey: billingChannelKey,
      billingKeyMethod: _pgInfo.payMethod,
      ...(_pgInfo.easyPay ? { easyPay: _pgInfo.easyPay } : {}),
      issueId,
      issueName: `소라고동 ${tier.label} 정기 (월 ${tier.krw.toLocaleString()}원 자동 갱신)`,
      windowType: { pc: 'IFRAME', mobile: 'REDIRECTION' },
      redirectUrl: window.location.origin + (window.location.pathname || '/') + '#recurring-subscribe-return',
      customer: {
        customerId: authUserId || undefined,
        email: session?.user?.email || undefined,
        ...(phoneNumber ? { phoneNumber, fullName } : {})
      }
    });
  } catch (e) {
    _resetBodyAfterPortone();
    alert('카드 등록창을 열 수 없어. 잠시 후 다시 시도해줘.\n\n자세한 사유: ' + (e?.message || e));
    return;
  }
  _resetBodyAfterPortone();

  if (response && response.code != null) {
    const code = response.code || '';
    const msg = response.message || '';
    let userMsg;
    if (code === 'USER_CANCEL' || /cancel|취소/i.test(msg)) {
      userMsg = '카드 등록을 취소했어. 다시 시도하려면 다시 눌러줘.';
    } else {
      userMsg = '카드 등록 중 문제가 생겼어 — 잠시 후 다시.\n\n자세한 사유: ' + msg + (code ? ' (' + code + ')' : '');
    }
    alert(userMsg);
    return;
  }

  const billingKey = response && response.billingKey;
  if (!billingKey) {
    alert('빌링키를 못 받았어 — 잠시 후 다시.');
    return;
  }

  // 백엔드: 첫 달 즉시 결제 + 정기 등록.
  try {
    const verifyResp = await fetch('/api/billing/portone-register-recurring', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token
      },
      body: JSON.stringify({ billingKey, plan: tierKey })
    });
    const result = await verifyResp.json();
    if (verifyResp.ok && result.ok) {
      if (result.duplicate) {
        showToast(`💳 이미 활성 ${tier.label} 구독`);
        alert(result.message || `이미 활성 ${tier.label} 구독이 있어.`);
      } else {
        showToast(`📅 ${tier.label} 정기 시작 — 월 ${tier.krw.toLocaleString()}원 자동 갱신`);
      }
      closeSubscribeModal();
      if (typeof refreshBillingStatus === 'function') refreshBillingStatus();
    } else {
      alert(`${tier.label} 구독 등록 실패: ` + (result.error || '알 수 없음'));
    }
  } catch (e) {
    alert('백엔드 통신 실패: ' + (e?.message || e));
  }
}

// V4 (사용자 명시 2026-05-11 ultrathink): 가계약 모드 Plus 첫 달 무료 — 결제 X, 카드 등록 X.
//   backend `claim-free-trial` endpoint 가 직접 Plus subscription 30일 활성화. 1인 1회 가드.
//   30일 후 자동 만료 (cron 갱신 X). 사용자가 직접 재구매.
async function proceedFreeTrial() {
  if (!session || !session.access_token) {
    alert('로그인 필요 — 설정 → 로그아웃 후 재로그인.');
    return;
  }
  if (typeof state !== 'undefined' && state && state.isGuest) {
    alert('게스트 모드는 결제 X — 먼저 로그인.');
    return;
  }
  // 사용자 confirm — 1인 1회임을 명확히 알림.
  const ok = confirm('Plus 첫 달 무료 — 30일간 무료로 모든 기능 사용 가능.\n\n• 1인 1회 한정 (다음엔 정가 9,900원)\n• 자동 결제 X — 30일 후 만료\n• 만료 7일 전 알림\n\n시작할까?');
  if (!ok) return;
  if (typeof showToast === 'function') showToast('Plus 첫 달 무료 신청 중…');
  try {
    const resp = await fetch('/api/billing/claim-free-trial', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token
      },
      body: JSON.stringify({})
    });
    const result = await resp.json();
    if (resp.ok && result.ok) {
      if (result.duplicate) {
        showToast('💳 이미 Plus 구독 활성');
        alert(result.message || '이미 활성 Plus 구독이 있어.');
      } else {
        showToast('🌊 Plus 첫 달 무료 시작 — 30일 자유롭게 🫂');
      }
      closeSubscribeModal();
      if (typeof refreshBillingStatus === 'function') refreshBillingStatus();
    } else {
      // 1인 1회 가드 hit (TRIAL_ALREADY_CONSUMED) 시 사용자 친절 카피.
      const code = result?.code || '';
      if (code === 'TRIAL_ALREADY_CONSUMED') {
        alert('Plus 첫 달 무료는 1인 1회 한정 — 이미 사용했어.\n\n계속 쓰려면 Plus 1개월 (9,900원) 정가 결제로 진행해줘.');
      } else {
        alert('Plus 첫 달 무료 신청 실패: ' + (result?.error || '알 수 없음'));
      }
    }
  } catch (e) {
    alert('백엔드 통신 실패: ' + (e?.message || e));
  }
}

// 사용자 명시 2026-05-06: 얼리버드 첫 달 무료 = 빌링키 등록 흐름 (즉시 결제 X).
// 1) PortOne.requestIssueBillingKey 로 카드 등록 모달 (사용자 카드 정보, 결제 0원)
// 2) 응답 billingKey 를 /api/billing/portone-register-trial 에 POST → 30일 trial 시작
// 3) 30일 후 cron-charge-recurring 이 자동 결제 → 매월 자동 갱신
// V4 (사용자 명시 2026-05-11 ultrathink): trial 흐름 = Plus tier (key='light'). 옛 얼리버드 promo 정체성 폐기 — 함수 리네임.
//   ⚠ backend /api/billing/portone-register-trial 도 plan='light' 로 처리 (또는 plan 파라미터 추가) — 백엔드 sync 필요.
async function proceedPlusTrial() {
  const tier = TIER_PLANS_CLIENT.light;  // Plus (9,900) — 첫 달 무료 trial
  if (!session || !session.access_token) {
    alert('로그인 필요 — 설정 → 로그아웃 후 재로그인.');
    return;
  }
  if (typeof state !== 'undefined' && state && state.isGuest) {
    alert('게스트 모드는 결제 X — 먼저 로그인.');
    return;
  }
  // Plus trial = 빌링키 등록 흐름이라 토스페이 제외 (tosstest 채널 = 일반결제만).
  const _pg = await _pickPaymentMethod({ excludeToss: true, title: 'Plus 첫 달 무료 카드 등록 수단' });
  if (!_pg) return;
  const _pgInfo = _getPayChannelInfo(_pg);
  const billingChannelKey = _pgInfo.billingChannelKey || _pgInfo.channelKey;
  const storeId = _pgInfo.storeId;
  if (!billingChannelKey || !storeId) {
    alert('결제 설정 오류 — 빌링키 채널 미설정');
    return;
  }
  let phoneNumber = '', fullName = '';
  if (_pgInfo.needsCustomerInfo) {
    const info = await _collectPaymentInfoIfNeeded();
    if (!info) return;
    phoneNumber = info.phoneNumber;
    fullName = info.fullName;
  }

  // PortOne V2 SDK 동적 로드 (proceedSubscribe 와 동일).
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
  if (typeof window.PortOne === 'undefined' || typeof window.PortOne.requestIssueBillingKey !== 'function') {
    alert('PortOne SDK 빌링키 기능 X — 출시 전 준비 중. 잠시 후 다시.');
    return;
  }

  // billingKey issueId — 매번 unique. customer.customerId = user.id 로 매칭.
  // KG이니시스 oid 최대 40자 — UUID 전체 포함 시 64자 초과. base36 ts + userId 앞 8자로 26자 이내.
  const issueId = `bk-${(authUserId||'anon').slice(0,8)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
  // 모바일 redirect 흐름 — 등록 후 같은 페이지로 복귀 (해시 #plus-trial-return 으로 후속 처리).
  let response;
  try {
    response = await window.PortOne.requestIssueBillingKey({
      storeId,
      channelKey: billingChannelKey,
      billingKeyMethod: _pgInfo.payMethod,
      ...(_pgInfo.easyPay ? { easyPay: _pgInfo.easyPay } : {}),
      issueId,
      issueName: '소라고동 Plus 정기 카드 등록 (첫 달 무료)',
      windowType: { pc: 'IFRAME', mobile: 'REDIRECTION' },
      redirectUrl: window.location.origin + (window.location.pathname || '/') + '#plus-trial-return',
      customer: {
        customerId: authUserId || undefined,
        email: session?.user?.email || undefined,
        ...(phoneNumber ? { phoneNumber, fullName } : {})
      }
    });
  } catch (e) {
    _resetBodyAfterPortone();
    alert('카드 등록창을 열 수 없어. 잠시 후 다시 시도해줘.\n\n자세한 사유: ' + (e?.message || e));
    return;
  }
  _resetBodyAfterPortone();

  if (response && response.code != null) {
    const code = response.code || '';
    const msg = response.message || '';
    let userMsg;
    if (code === 'USER_CANCEL' || /cancel|취소/i.test(msg)) {
      userMsg = '카드 등록을 취소했어. 다시 시도하려면 다시 눌러줘.';
    } else {
      userMsg = '카드 등록 중 문제가 생겼어 — 잠시 후 다시 시도해줘.\n\n자세한 사유: ' + msg + (code ? ' (' + code + ')' : '');
    }
    alert(userMsg);
    return;
  }

  const billingKey = response && response.billingKey;
  if (!billingKey) {
    alert('빌링키를 못 받았어 — 잠시 후 다시 시도해줘.');
    return;
  }

  // 백엔드 등록 — trial 시작.
  // V4 (사용자 명시 2026-05-11 ultrathink): defensive plan='light' 명시 — backend default 안 의존.
  //   Plus trial 흐름 (key='light'). 옛 default 'early_lifetime' 잔재 시 잘못된 tier 방지.
  try {
    const verifyResp = await fetch('/api/billing/portone-register-trial', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token
      },
      body: JSON.stringify({ billingKey, plan: 'light' })
    });
    const result = await verifyResp.json();
    if (verifyResp.ok && result.ok) {
      if (result.duplicate) {
        showToast('💳 이미 Plus 구독 활성 — 카드 변경은 [설정] 에서');
        alert(result.message || '이미 활성 Plus 구독이 있어.');
      } else {
        showToast(`🌊 Plus 첫 달 무료 시작 — 30일 후 ${tier.krw.toLocaleString()}원 자동 결제 🫂`);
      }
      closeSubscribeModal();
      if (typeof refreshBillingStatus === 'function') refreshBillingStatus();
    } else {
      alert('빌링키 등록 실패: ' + (result.error || '알 수 없음'));
    }
  } catch (e) {
    alert('백엔드 통신 실패: ' + (e?.message || e));
  }
}

// V4 (사용자 명시 2026-05-11 — 가계약 단계): 일회성 1개월 결제 (KG이니시스 일반).
//   PortOne V2 — requestPayment (paymentId 채번) → server 가 /api/billing/portone-verify-pay 로 amount/status 검증 후
//   subscription_expires_at = now+30d 갱신. 자동 갱신 X — 만료 7일 전 알림 후 사용자가 직접 재구매.
//   카드 / 카카오페이 일반 채널 사용. 토스페이는 일반결제만 가능해 OK.
async function proceedOneTimePurchase(tierKey) {
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
  const _pg = await _pickPaymentMethod({ excludeToss: false, title: `${tier.label} 1개월 이용권 결제 수단` });
  if (!_pg) return;
  const _pgInfo = _getPayChannelInfo(_pg);
  if (!_pgInfo.channelKey || !_pgInfo.storeId) {
    alert('결제 설정 오류 — 채널 미설정');
    return;
  }
  let phoneNumber = '', fullName = '';
  if (_pgInfo.needsCustomerInfo) {
    const info = await _collectPaymentInfoIfNeeded();
    if (!info) return;
    phoneNumber = info.phoneNumber;
    fullName = info.fullName;
  }

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
  if (typeof window.PortOne === 'undefined' || typeof window.PortOne.requestPayment !== 'function') {
    alert('PortOne SDK 결제 기능 X');
    return;
  }

  // paymentId 형식 = `payment-{tierKey}-{userIdShort}-{ts}` — payment-return-handler 의 startsWith('payment-') 분기로 verify-pay 호출.
  // KG이니시스 oid 40자 제한 — tierKey full 사용 (early_lifetime=14자) 시 28자 이내로 유지.
  const tierShort = tierKey.replace('early_lifetime', 'early').replace('premium', 'prem');
  const paymentId = `payment-${tierShort}-${(authUserId||'anon').slice(0,8)}-${Date.now().toString(36)}`;

  // 모바일 redirect 흐름용 marker — return handler 의 user mismatch 검증에 사용.
  try {
    sessionStorage.setItem('soragodong_pending_payment', JSON.stringify({
      paymentId, user_id: authUserId, tier: tierKey, ts: Date.now()
    }));
  } catch {}

  let response;
  try {
    response = await window.PortOne.requestPayment({
      storeId: _pgInfo.storeId,
      channelKey: _pgInfo.channelKey,
      paymentId,
      orderName: `소라고동 ${tier.label} 1개월 이용권`,
      totalAmount: tier.krw,
      currency: 'KRW',
      payMethod: _pgInfo.payMethod,
      ...(_pgInfo.easyPay ? { easyPay: _pgInfo.easyPay } : {}),
      windowType: { pc: 'IFRAME', mobile: 'REDIRECTION' },
      redirectUrl: window.location.origin + (window.location.pathname || '/') + '#subscribe-return',
      customer: {
        customerId: authUserId || undefined,
        email: session?.user?.email || undefined,
        ...(phoneNumber ? { phoneNumber, fullName } : {})
      },
      customData: JSON.stringify({ tier: tierKey, type: 'subscribe_one_month' })
    });
  } catch (e) {
    _resetBodyAfterPortone();
    try { sessionStorage.removeItem('soragodong_pending_payment'); } catch {}
    alert('결제창을 열 수 없어. 잠시 후 다시 시도해줘.\n\n자세한 사유: ' + (e?.message || e));
    return;
  }
  _resetBodyAfterPortone();

  if (response && response.code != null) {
    const code = response.code || '';
    const msg = response.message || '';
    try { sessionStorage.removeItem('soragodong_pending_payment'); } catch {}
    let userMsg;
    if (code === 'USER_CANCEL' || /cancel|취소/i.test(msg)) {
      userMsg = '결제를 취소했어. 다시 시도하려면 다시 눌러줘.';
    } else if (/잔액|insufficient|한도|limit/i.test(msg)) {
      userMsg = '카드 한도 / 잔액이 부족해 보여. 다른 카드로 다시 시도해줘.';
    } else if (/거절|declin|reject/i.test(msg)) {
      userMsg = '카드사가 결제를 거절했어. 다른 카드로 시도하거나 카드사에 문의해줘.';
    } else {
      userMsg = '결제 중 문제가 생겼어 — 잠시 후 다시.\n\n자세한 사유: ' + msg + (code ? ' (' + code + ')' : '');
    }
    alert(userMsg);
    return;
  }

  // PC IFRAME 흐름 = response 에 paymentId 가 즉시 반환됨. 백엔드 검증.
  try {
    if (typeof showToast === 'function') showToast('결제 확인 중…');
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
      try { sessionStorage.removeItem('soragodong_pending_payment'); } catch {}
      if (result.duplicate) {
        showToast(`💳 이미 활성 ${tier.label} 구독`);
        alert(result.message || `이미 활성 ${tier.label} 구독이 있어.`);
      } else {
        showToast(`📅 ${tier.label} 1개월 시작 — 만료 7일 전 알림`);
      }
      closeSubscribeModal();
      if (typeof refreshBillingStatus === 'function') refreshBillingStatus();
    } else {
      alert(`${tier.label} 결제 검증 실패: ` + (result.error || '알 수 없음') + `\n\npaymentId: ${paymentId}`);
    }
  } catch (e) {
    alert('백엔드 통신 실패: ' + (e?.message || e) + `\n\npaymentId: ${paymentId}`);
  }
}
