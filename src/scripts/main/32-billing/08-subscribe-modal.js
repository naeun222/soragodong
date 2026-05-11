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
      <button class="btn-primary" onclick="proceedSubscribe('${key}')" style="width:100%; padding:11px;">${plan.label} 정기 구독 (월 ${plan.krw.toLocaleString()}원)</button>
    </div>
  `;
  const earlyLifetimePlan = TIER_PLANS_CLIENT.early_lifetime;
  // 사용자 명시 2026-05-06 ultrathink: 얼리버드 = 하늘색~파란색 gradient (Light 대체 분위기).
  // 사용자 명시 2026-05-06: '첫 달 무료' 실제 구현 = 카드 등록 → 30일 trial → 30일 후 자동 결제.
  // 버튼 = proceedEarlyBirdTrial (요청 빌링키 등록 흐름) — 즉시 결제 흐름과 분리.
  const earlyLifetimeCard = `
    <div style="position:relative; padding:18px 16px; background:linear-gradient(135deg, rgba(135,206,235,0.18), rgba(74,144,226,0.10)); border:1.5px solid #5fb4d3; border-radius:14px; margin-bottom:10px;">
      <div style="position:absolute; top:-10px; left:16px; background:linear-gradient(135deg, #87CEEB, #4A90E2); color:#0c1e3a; font-size:9px; font-weight:700; letter-spacing:0.15em; padding:3px 8px; border-radius:4px;">첫 달 무료 · 출시 전 한정</div>
      <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:4px;">
        <div style="font-size:18px; font-weight:700; color:var(--text);">${earlyLifetimePlan.emoji} ${earlyLifetimePlan.label}</div>
        <div style="font-size:18px; font-weight:700; color:#5fb4d3;">
          <span style="text-decoration:line-through; opacity:0.55; font-size:13px; font-weight:500; margin-right:6px;">${earlyLifetimePlan.krw.toLocaleString()}원</span>
          0원<span style="font-size:11px; color:var(--text-dim); font-weight:400;">/첫 달</span>
        </div>
      </div>
      <div style="font-size:12px; color:var(--text-dim); margin-bottom:10px;">${earlyLifetimePlan.tagline}</div>
      <div style="font-size:11.5px; color:var(--text); line-height:1.7; padding:10px; background:rgba(0,0,0,0.18); border-radius:8px; margin-bottom:10px;">
        ${earlyLifetimePlan.description}
      </div>
      <button class="btn-primary" onclick="proceedEarlyBirdTrial()" style="width:100%; padding:11px; background:linear-gradient(135deg, #87CEEB, #4A90E2); color:#0c1e3a; font-weight:700;">${earlyLifetimePlan.emoji} 첫 달 무료로 시작하기</button>
    </div>
  `;
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
      ${earlyLifetimeCard}
      ${tierCard('light', TIER_PLANS_CLIENT.light, false)}
      ${tierCard('premium', TIER_PLANS_CLIENT.premium, true)}
      ${premiumPackCard}
      <div style="font-size:10.5px; color:var(--text-soft); line-height:1.7; padding:10px; background:rgba(126,200,227,0.04); border-left:3px solid rgba(126,200,227,0.30); border-radius:4px;">
        💡 잘 모르겠으면 <b style="color:#5fb4d3;">얼리버드</b>. 깊게 자주 쓰면 Premium.<br>
        <b>부가가치세 10% 포함</b> · <b>모든 플랜 = 매월 자동 갱신</b> (해지 1-click).<br>
        해지: [설정 → 구독] 다음 갱신 해지 / 환불 잔여일 비례 (<a href="/refund" target="_blank" style="color:var(--accent);">정책</a>).<br>
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
async function proceedSubscribe(tierKey) {
  const tier = TIER_PLANS_CLIENT[tierKey];
  if (!tier) { alert('잘못된 tier'); return; }
  if (tierKey === 'early_lifetime') return proceedEarlyBirdTrial();  // 얼리버드는 별도 (trial 흐름)
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

// 사용자 명시 2026-05-06: 얼리버드 첫 달 무료 = 빌링키 등록 흐름 (즉시 결제 X).
// 1) PortOne.requestIssueBillingKey 로 카드 등록 모달 (사용자 카드 정보, 결제 0원)
// 2) 응답 billingKey 를 /api/billing/portone-register-trial 에 POST → 30일 trial 시작
// 3) 30일 후 cron-charge-recurring 이 자동 결제 → 매월 자동 갱신
async function proceedEarlyBirdTrial() {
  const tier = TIER_PLANS_CLIENT.early_lifetime;
  if (!session || !session.access_token) {
    alert('로그인 필요 — 설정 → 로그아웃 후 재로그인.');
    return;
  }
  if (typeof state !== 'undefined' && state && state.isGuest) {
    alert('게스트 모드는 결제 X — 먼저 로그인.');
    return;
  }
  // 얼리버드 = 빌링키 등록 흐름이라 토스페이 제외 (tosstest 채널 = 일반결제만).
  const _pg = await _pickPaymentMethod({ excludeToss: true, title: '얼리버드 카드 등록 수단' });
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
  // 모바일 redirect 흐름 — 등록 후 같은 페이지로 복귀 (해시 #early-bird-trial-return 으로 후속 처리).
  let response;
  try {
    response = await window.PortOne.requestIssueBillingKey({
      storeId,
      channelKey: billingChannelKey,
      billingKeyMethod: _pgInfo.payMethod,
      ...(_pgInfo.easyPay ? { easyPay: _pgInfo.easyPay } : {}),
      issueId,
      issueName: '소라고동 얼리버드 정기 카드 등록',
      windowType: { pc: 'IFRAME', mobile: 'REDIRECTION' },
      redirectUrl: window.location.origin + (window.location.pathname || '/') + '#early-bird-trial-return',
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
  try {
    const verifyResp = await fetch('/api/billing/portone-register-trial', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token
      },
      body: JSON.stringify({ billingKey })
    });
    const result = await verifyResp.json();
    if (verifyResp.ok && result.ok) {
      if (result.duplicate) {
        showToast('💳 이미 얼리버드 구독 활성 — 카드 변경은 [설정] 에서');
        alert(result.message || '이미 활성 얼리버드 구독이 있어.');
      } else {
        showToast(`✨ 얼리버드 첫 달 무료 시작 — 30일 후 ${tier.krw.toLocaleString()}원 자동 결제 🫂`);
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
