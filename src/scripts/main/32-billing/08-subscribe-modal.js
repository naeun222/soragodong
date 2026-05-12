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

// V4 (사용자 명시 2026-05-13 ultrathink): 자동결제 등록 직전 명시적 동의 화면.
//   한국 전자상거래법 §13 / 여전법 권고 — 카드 자동결제 등록 전 *상품/금액/주기/해지방법* 고지 + 명시적 동의 체크박스.
//   PG 선택 직후 호출 → 사용자가 동의해야 PortOne.requestIssueBillingKey 진행.
//   trial 흐름 (proceedPlusTrial) 도 동일 — 첫 달 0원이지만 30일 후 자동 결제이므로 동일 동의 절차.
//   인자: { tier, pgLabel, isTrial } — tier=TIER_PLANS_CLIENT[k], pgLabel=PG 한글명, isTrial=Plus 첫 달 무료 여부.
//   반환: Promise<boolean> — 동의(true) / 취소(false).
function _showRecurringConsentModal({ tier, pgLabel, isTrial }) {
  return new Promise((resolve) => {
    const krw = tier.krw.toLocaleString();
    // V4 (사용자 명시 2026-05-13 ultrathink): 매월 가입일 anchor 기준 다음 결제일 (Netflix / YouTube 표준).
    //   오늘 KST day = anchor → 다음 달 같은 날 (짧은 달 clip). 30일 fixed 폐기.
    const _anchorDay = (typeof _getCurrentKstAnchorDay === 'function') ? _getCurrentKstAnchorDay() : new Date().getDate();
    const nextDate = (typeof _calcNextBillingDateKst === 'function')
      ? _calcNextBillingDateKst(new Date(), _anchorDay)
      : new Date(Date.now() + 30 * 86400_000);
    const nextDateStr = nextDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    const businessName = (typeof BUSINESS_INFO !== 'undefined' && BUSINESS_INFO?.name) ? BUSINESS_INFO.name : '나은 랩(Lab)';
    const businessNo   = (typeof BUSINESS_INFO !== 'undefined' && BUSINESS_INFO?.business_no) ? BUSINESS_INFO.business_no : '';
    const trialBanner = isTrial
      ? `<div style="padding:11px 12px; background:linear-gradient(135deg, rgba(135,206,235,0.15), rgba(74,144,226,0.08)); border:1px solid rgba(95,180,211,0.40); border-radius:8px; font-size:12px; color:#9fd4e8; line-height:1.6; margin-bottom:12px;">
           🌊 <b>첫 달 0원</b> — 오늘은 결제 X, 카드만 등록.<br>
           <span style="color:var(--text-soft);">${nextDateStr} 부터 <b style="color:#5fb4d3;">월 ${krw}원</b> 자동 결제 시작 (1인 1회 trial 한정).</span>
         </div>`
      : '';
    const firstPayLabel = isTrial
      ? `${nextDateStr} (한 달 후 첫 자동 결제)`
      : `오늘 즉시 ${krw}원 결제, 이후 매월 ${nextDate.getDate()}일 자동 결제 (${nextDateStr} 부터)`;
    const rows = [
      ['상품',         `소라고동 ${tier.label} 정기구독`],
      ['결제금액',     `<b style="color:var(--text);">월 ${krw}원</b> <span style="color:var(--text-soft); font-size:10.5px;">(부가가치세 10% 포함)</span>`],
      ['결제주기',     `매월 1회 자동 결제 (가입일 기준 같은 날)`],
      ['첫 결제',      firstPayLabel],
      ['결제수단',     pgLabel],
      ['해지방법',     `<b style="color:var(--accent);">[설정 → 구독]</b> 에서 1-click 해지 — 언제든 가능`],
      ['환불',         `잔여일 비례 환불 (<a href="/refund" target="_blank" style="color:var(--accent);">정책</a>)`],
      ['공급자',       `${businessName}${businessNo ? ` (사업자 ${businessNo})` : ''}`],
    ];
    const rowsHtml = rows.map(([k, v]) => `
      <div style="display:flex; gap:10px; padding:7px 0; border-bottom:1px dashed rgba(255,255,255,0.06); font-size:12px; line-height:1.55;">
        <div style="flex:0 0 70px; color:var(--text-soft);">${k}</div>
        <div style="flex:1; color:var(--text);">${v}</div>
      </div>`).join('');
    const overlay = document.createElement('div');
    overlay.className = 'input-modal-overlay show';
    overlay.id = 'recurringConsentOverlay';
    overlay.style.zIndex = '10003';
    overlay.innerHTML = `
      <div class="input-modal" style="max-width:420px; max-height:92vh; overflow-y:auto; padding:22px;">
        <div style="font-size:16px; font-weight:700; color:var(--text); margin-bottom:4px;">📅 자동결제 등록 안내</div>
        <div style="font-size:11.5px; color:var(--text-dim); margin-bottom:14px; line-height:1.6;">
          아래 내용으로 매월 자동 결제가 진행돼. 동의 후 카드 등록 페이지로 이동.
        </div>
        ${trialBanner}
        <div style="background:rgba(0,0,0,0.18); border:1px solid var(--border); border-radius:10px; padding:8px 14px; margin-bottom:14px;">
          ${rowsHtml}
        </div>
        <label style="display:flex; gap:9px; align-items:flex-start; padding:8px 0; cursor:pointer; font-size:12px; color:var(--text); line-height:1.55;">
          <input type="checkbox" id="recurringConsentCk1" style="margin-top:3px; flex:0 0 auto;">
          <span><b>(필수)</b> 위 자동결제 내용을 모두 확인했으며, 매월 자동 결제에 동의합니다.</span>
        </label>
        <label style="display:flex; gap:9px; align-items:flex-start; padding:8px 0 14px; cursor:pointer; font-size:12px; color:var(--text); line-height:1.55;">
          <input type="checkbox" id="recurringConsentCk2" style="margin-top:3px; flex:0 0 auto;">
          <span><b>(필수)</b> <a href="/tos" target="_blank" style="color:var(--accent);">이용약관</a> · <a href="/refund" target="_blank" style="color:var(--accent);">환불정책</a> · <a href="/privacy" target="_blank" style="color:var(--accent);">개인정보 처리방침</a> 에 동의합니다.</span>
        </label>
        <button class="btn-primary" id="recurringConsentSubmit" style="width:100%; padding:12px; margin-bottom:8px; opacity:0.45; cursor:not-allowed;" disabled>동의하고 카드 등록 페이지로 이동</button>
        <button class="btn-secondary" id="recurringConsentCancel" style="width:100%; padding:10px;">취소</button>
        <div style="margin-top:12px; font-size:10.5px; color:var(--text-soft); line-height:1.65; padding:9px; background:rgba(126,200,227,0.04); border-left:3px solid rgba(126,200,227,0.30); border-radius:4px;">
          💡 등록된 카드는 <b>[설정 → 구독]</b> 에서 언제든 변경·해지할 수 있어.<br>
          ⚠ 본 서비스는 임상 치료·진단·전문가 상담을 대체하지 않습니다.
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const ck1 = document.getElementById('recurringConsentCk1');
    const ck2 = document.getElementById('recurringConsentCk2');
    const submitBtn = document.getElementById('recurringConsentSubmit');
    const cancelBtn = document.getElementById('recurringConsentCancel');
    const sync = () => {
      const ok = !!(ck1?.checked && ck2?.checked);
      submitBtn.disabled = !ok;
      submitBtn.style.opacity = ok ? '1' : '0.45';
      submitBtn.style.cursor = ok ? 'pointer' : 'not-allowed';
    };
    ck1?.addEventListener('change', sync);
    ck2?.addEventListener('change', sync);
    const close = (val) => {
      const ov = document.getElementById('recurringConsentOverlay');
      if (ov) ov.remove();
      resolve(val);
    };
    submitBtn.addEventListener('click', () => { if (!submitBtn.disabled) close(true); });
    cancelBtn.addEventListener('click', () => close(false));
  });
}

// V4 (사용자 명시 2026-05-13 ultrathink): 등록 성공 후 명시적 안내 모달.
//   토스트 1줄로는 사용자가 *언제 다음 결제되는지 / 어디서 관리하는지* 가 안 보임 → 명시 화면.
//   trial 의 경우: "오늘은 결제 X, 30일 후 첫 결제" 톤. 정가의 경우: "오늘 첫 결제 완료, 30일 후 자동 갱신" 톤.
//   '구독 관리하러 가기' 버튼 → 설정 → 결제 내역 토글 자동 펼침 (settings 의 _expandPaymentsToggle 호출).
function _showRecurringSuccessModal({ tier, pgLabel, isTrial, nextBillingIso }) {
  const krw = tier.krw.toLocaleString();
  // V4 (사용자 명시 2026-05-13 ultrathink): backend response 의 next_billing_at (매월 anchor 적용된 ISO) 그대로 표시.
  let nextDate;
  try {
    if (nextBillingIso) nextDate = new Date(nextBillingIso);
    else if (typeof _calcNextBillingDateKst === 'function' && typeof _getCurrentKstAnchorDay === 'function') {
      nextDate = _calcNextBillingDateKst(new Date(), _getCurrentKstAnchorDay());
    } else {
      nextDate = new Date(Date.now() + 30 * 86400_000);
    }
  } catch { nextDate = new Date(Date.now() + 30 * 86400_000); }
  const nextDateStr = nextDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const headline = isTrial
    ? `🌊 ${tier.label} 첫 달 무료 시작`
    : `📅 ${tier.label} 정기구독 시작`;
  const subline = isTrial
    ? `오늘부터 한 달 동안 무료로 사용해.`
    : `오늘 첫 ${krw}원 결제 완료.`;
  const nextLine = isTrial
    ? `<div style="font-size:12.5px; color:var(--text); line-height:1.65;"><b style="color:#5fb4d3;">${nextDateStr}</b> 에 첫 ${krw}원 자동 결제가 시작돼.</div>`
    : `<div style="font-size:12.5px; color:var(--text); line-height:1.65;">다음 결제예정일: <b style="color:var(--accent);">${nextDateStr}</b> · 월 ${krw}원</div>`;
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay show';
  overlay.id = 'recurringSuccessOverlay';
  overlay.style.zIndex = '10004';
  overlay.innerHTML = `
    <div class="input-modal" style="max-width:380px; padding:24px;">
      <div style="font-size:36px; text-align:center; margin-bottom:10px;">✓</div>
      <div style="font-size:17px; font-weight:700; color:var(--text); text-align:center; margin-bottom:6px;">${escapeHtml(headline)}</div>
      <div style="font-size:12.5px; color:var(--text-dim); text-align:center; margin-bottom:16px; line-height:1.6;">${escapeHtml(subline)}</div>
      <div style="background:rgba(0,0,0,0.18); border:1px solid var(--border); border-radius:10px; padding:13px 14px; margin-bottom:14px; line-height:1.7;">
        ${nextLine}
        <div style="font-size:12px; color:var(--text-soft); margin-top:6px;">결제수단: ${escapeHtml(pgLabel)}</div>
      </div>
      <div style="font-size:11.5px; color:var(--text-soft); line-height:1.7; padding:11px 13px; background:rgba(126,200,227,0.05); border-left:3px solid rgba(126,200,227,0.40); border-radius:4px; margin-bottom:14px;">
        💡 <b style="color:var(--text);">관리 위치:</b> [설정 → 구독]<br>
        - 결제수단 (카드) 변경<br>
        - 다음 갱신 해지 (1-click)<br>
        - 환불 요청 (잔여일 비례)
      </div>
      <button class="btn-primary" id="recurringSuccessGoSettings" style="width:100%; padding:11px; margin-bottom:8px;">구독 관리하러 가기</button>
      <button class="btn-secondary" id="recurringSuccessClose" style="width:100%; padding:10px;">닫기</button>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => {
    const ov = document.getElementById('recurringSuccessOverlay');
    if (ov) ov.remove();
  };
  document.getElementById('recurringSuccessClose').addEventListener('click', close);
  document.getElementById('recurringSuccessGoSettings').addEventListener('click', () => {
    close();
    try { if (typeof showScreen === 'function') showScreen('settings'); } catch {}
    try { if (typeof refreshBillingStatus === 'function') refreshBillingStatus(true); } catch {}
    setTimeout(() => {
      // 결제 내역 / 환불 / 해지 details 자동 펼침 — cancelRenewalBox 의 부모 <details> 찾기.
      const renewalBox = document.getElementById('cancelRenewalBox');
      const det = renewalBox ? renewalBox.closest('details') : null;
      if (det && !det.open) det.open = true;
      if (det && typeof det.scrollIntoView === 'function') {
        try { det.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
      }
    }, 250);
  });
}

// V4 (사용자 명시 2026-05-13 ultrathink): PG 한글 표시명 (동의 모달 / 성공 모달 / 설정 박스 공용).
function _pgLabel(method) {
  if (method === 'kakao') return '🟨 카카오페이 정기결제 (테스트 채널 TCSUBSCRIP)';
  if (method === 'card')  return '💳 KG이니시스 카드 정기결제 (테스트 채널 INIBillTst)';
  if (method === 'toss')  return '🔵 토스페이 정기결제';
  return method || '결제수단';
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
  // V4 (사용자 보고 2026-05-13 ultrathink): Plus trial 1인 1회 가드 — 이미 사용한 사용자에게 '첫 달 무료' 카드 노출 X.
  //   backend (`portone-register-trial.ts` / `claim-free-trial.ts`) 가 `plus_trial_consumed_at` set 검사 후 거부 (TRIAL_ALREADY_CONSUMED).
  //   frontend 가드 = UX (사용자가 첫 달 무료 보고 결제 시도했다가 마지막 단계에서 거부당하는 함정 차단).
  //   billing row 의 plus_trial_consumed_at 이 timestamp 면 사용함, null 이면 X.
  const _trialConsumed = !!window._billingCache?.plus_trial_consumed_at;
  // V4 (사용자 명시 2026-05-13 ultrathink): 사전 UI 차단 매트릭스 — Q1~Q4 정책.
  //   _trialActive: Plus 가계약 trial 활성 (자동갱신 X — billing_key=null). 같은 plan + 다운그레이드 차단, Premium 업그레이드만 가능.
  //   _normalRecurring: 정상 자동 갱신 구독. 현 plan = 카드 변경 / 다운그레이드 차단 / Premium 업그레이드만 가능.
  //   _isSubscribed: 어떤 형태든 구독 중. 새 trial / 미구독 카드는 차단.
  const _curPlan       = window._billingCache?.subscription_plan || null;
  const _curActive     = !!window._billingCache?.subscription_active;
  const _hasBillingKey = !!window._billingCache?.portone_billing_key;
  const _curExpiresIso = window._billingCache?.subscription_expires_at || null;
  const _curExpiresStr = _curExpiresIso ? new Date(_curExpiresIso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : null;
  const _trialActive     = _curActive && _curPlan === 'light' && !_hasBillingKey;
  const _normalRecurring = _curActive && _hasBillingKey;
  const _isSubscribed    = _curActive && (_curPlan === 'light' || _curPlan === 'premium' || _curPlan === 'early_lifetime');
  const minorWarning = state.preferences?.requiresLegalGuardianForPayment
    ? `<div style="padding:10px; background:rgba(220,150,80,0.10); border:1px solid rgba(220,150,80,0.40); border-radius:8px; font-size:11px; color:#e8c590; margin-bottom:14px;">⚠️ 만 18세 미만은 결제 시 법정대리인 동의 필요</div>`
    : '';
  // 현재 구독 상태 안내 — Plus trial 자동갱신 X 케이스 vs 정상 자동 갱신 케이스 분기.
  let currentSubNotice = '';
  if (_trialActive) {
    currentSubNotice = `<div style="padding:10px 12px; background:rgba(135,206,235,0.08); border:1px solid rgba(95,180,211,0.35); border-radius:8px; font-size:11.5px; color:var(--text); margin-bottom:14px; line-height:1.65;">🌊 <b>Plus 첫 달 무료 사용 중</b> — ${_curExpiresStr ? `${_curExpiresStr} 만료, 그 후 자동으로 끊김 (자동 갱신 X)` : '자동 갱신 X'}.<br><span style="color:var(--text-soft); font-size:10.5px;">계속 쓰려면 만료 7일 전 알림 후 직접 재구매, 또는 지금 다른 tier 로 변경 가능 (업/다운 모두).</span></div>`;
  } else if (_normalRecurring) {
    const curLabel = (TIER_PLANS_CLIENT[_curPlan]?.label) || _curPlan;
    const curEmoji = TIER_PLANS_CLIENT[_curPlan]?.emoji || '📅';
    currentSubNotice = `<div style="padding:10px 12px; background:rgba(212,167,106,0.06); border:1px solid rgba(212,167,106,0.30); border-radius:8px; font-size:11.5px; color:var(--text); margin-bottom:14px; line-height:1.65;">${curEmoji} <b>${curLabel} 정기 구독 중</b>${_curExpiresStr ? ` — 다음 결제 ${_curExpiresStr}` : ''}.</div>`;
  }
  // 옛 Plus trial 소진 안내 — 미구독 사용자에게만 의미 있어 (구독 중이면 currentSubNotice 가 우선).
  const trialConsumedNotice = (_trialConsumed && !_isSubscribed)
    ? `<div style="padding:9px 12px; background:rgba(126,200,227,0.06); border-left:3px solid rgba(126,200,227,0.40); border-radius:4px; font-size:11px; color:var(--text-soft); margin-bottom:14px; line-height:1.6;">ℹ️ <b style="color:var(--text);">Plus 첫 달 무료</b>는 1인 1회 — 이미 사용했어. <b style="color:var(--text);">정가 9,900원/월</b> 구독으로 진행 가능.</div>`
    : '';
  // V4 (사용자 명시 2026-05-11 ultrathink): tier 카드 통합 — 옛 earlyLifetimeCard 폐기.
  //   Plus (key='light', has_free_trial=true) 가 *RECOMMENDED + 첫 달 무료* 자리 차지.
  //   Light (key='early_lifetime') 는 정가 entry tier — 일반 tierCard 로 렌더.
  // V4 (사용자 명시 2026-05-13 ultrathink): 사전 UI 차단 매트릭스 — 3 분기 (업/다운 모두 허용):
  //   (1) isCurrentPlan = 현재 구독 plan 카드 = 결제수단 변경. trial 활성은 변경 X 차단만.
  //   (2) isPlanChange = 구독 중인 사용자가 다른 tier 카드 클릭 = 즉시 변경 (업/다운 모두). proceedSubscribe(key) 재활용 → backend upsert + 새 cycle.
  //   (3) isFreeTrial = 미구독 + Plus + trial 미사용 = 옛 첫 달 무료 카드.
  //   정책: 모든 plan 변경 = 즉시 결제 + 새 cycle 시작, 잔여 일수 보상 X (upgrade-tier.ts 와 일관).
  const _tierRank = { early_lifetime: 1, light: 2, premium: 3 };
  const tierCard = (key, plan, recommended) => {
    const isCurrentPlan = _isSubscribed && key === _curPlan;
    const isPlanChange  = _isSubscribed && !isCurrentPlan;
    const _isUpgrade    = (_tierRank[key] || 0) > (_tierRank[_curPlan] || 0);
    const isFreeTrial = !!plan.has_free_trial && !_trialConsumed && !_isSubscribed;
    const trialBadge = isFreeTrial
      ? '<div style="position:absolute; top:-10px; left:16px; background:linear-gradient(135deg, #87CEEB, #4A90E2); color:#0c1e3a; font-size:9px; font-weight:700; letter-spacing:0.15em; padding:3px 8px; border-radius:4px;">첫 달 무료</div>'
      : '';
    const currentBadge = isCurrentPlan
      ? '<div style="position:absolute; top:-10px; left:16px; background:linear-gradient(135deg, #d4a76a, #b58a4e); color:#0c1e3a; font-size:9px; font-weight:700; letter-spacing:0.15em; padding:3px 8px; border-radius:4px;">현재 구독</div>'
      : '';
    const cardBg = isCurrentPlan
      ? 'linear-gradient(135deg, rgba(212,167,106,0.10), rgba(212,167,106,0.03))'
      : (isFreeTrial
          ? 'linear-gradient(135deg, rgba(135,206,235,0.18), rgba(74,144,226,0.10))'
          : (recommended ? 'linear-gradient(135deg, rgba(212,167,106,0.12), rgba(212,167,106,0.04))' : 'var(--surface)'));
    const cardBorder = isCurrentPlan
      ? '1.5px solid var(--accent)'
      : (isFreeTrial
          ? '1.5px solid #5fb4d3'
          : (recommended ? '1.5px solid var(--accent)' : '1px solid var(--border)'));
    const cardOpacity = '';
    const recommendBadge = (recommended && !isFreeTrial && !isCurrentPlan)
      ? '<div style="font-size:9px; letter-spacing:0.18em; text-transform:uppercase; color:var(--accent); font-weight:700; margin-bottom:6px;">RECOMMENDED</div>'
      : '';
    const priceHtml = isFreeTrial
      ? `<div style="font-size:18px; font-weight:700; color:#5fb4d3;">
           <span style="text-decoration:line-through; opacity:0.55; font-size:13px; font-weight:500; margin-right:6px;">${plan.krw.toLocaleString()}원</span>
           0원<span style="font-size:11px; color:var(--text-dim); font-weight:400;">/첫 달</span>
         </div>`
      : `<div style="font-size:18px; font-weight:700; color:var(--text);">${plan.krw.toLocaleString()}원<span style="font-size:11px; color:var(--text-dim); font-weight:400;">/월</span></div>`;
    const _oneTime = (typeof BILLING_RECURRING_ENABLED !== 'undefined' && !BILLING_RECURRING_ENABLED);
    // 버튼 카피 / onclick / disabled 분기.
    let buttonHtml;
    if (isCurrentPlan) {
      if (_trialActive) {
        // Plus 가계약 trial 활성 — 변경 불가, 만료까지 사용. (Q2=a)
        buttonHtml = `<button class="btn-secondary" disabled style="width:100%; padding:11px; opacity:0.55; cursor:not-allowed;">사용 중 — 만료까지 그대로</button>`;
      } else {
        // 정상 자동 갱신 — 결제수단 변경 (Q4=b). changeRegisteredCard 호출.
        buttonHtml = `<button class="btn-secondary" onclick="changeRegisteredCard()" style="width:100%; padding:11px;">💳 결제수단 (카드) 변경</button>`;
      }
    } else if (isPlanChange) {
      // V4 (사용자 명시 2026-05-13 ultrathink): 업그레이드 = 즉시 변경 (proceedSubscribe) / 다운그레이드 = 다음 갱신부터 (scheduleDowngrade).
      //   다운그레이드 = 현 cycle 만료까지 그대로 사용, 자동 갱신 차단, 만료 후 직접 새 tier 가입. (Phase A — frontend-only)
      //   Phase B (자동 전환) = supabase migration `scheduled_plan_change` 컬럼 + cron 분기 추가 시 가능.
      if (_isUpgrade) {
        buttonHtml = `<button class="btn-primary" onclick="proceedSubscribe('${key}')" style="width:100%; padding:11px;">✨ ${plan.label} 으로 업그레이드</button>`;
      } else {
        buttonHtml = `<button class="btn-secondary" onclick="scheduleDowngrade('${key}')" style="width:100%; padding:11px;">🔽 ${plan.label} 으로 다운그레이드 (다음 갱신부터)</button>`;
      }
    } else {
      // 미구독 신규 가입 흐름 (기존).
      const buttonStyle = isFreeTrial
        ? 'background:linear-gradient(135deg, #87CEEB, #4A90E2); color:#0c1e3a; font-weight:700;'
        : '';
      const buttonText = isFreeTrial
        ? (_oneTime
            ? `${plan.emoji} 첫 달 무료 시작 (자동 결제 X)`
            : `${plan.emoji} 첫 달 무료로 시작하기`)
        : (_oneTime
            ? `${plan.label} 1개월`
            : `${plan.label} 정기 구독`);
      buttonHtml = `<button class="btn-primary" onclick="proceedSubscribe('${key}')" style="width:100%; padding:11px; ${buttonStyle}">${buttonText}</button>`;
    }
    // V4 (사용자 보고 2026-05-13 ultrathink): Plus 카드 + trial 소진 시 description 에서 '첫 달 무료' 카피 strip.
    let descHtml = plan.description;
    if (plan.has_free_trial && _trialConsumed) {
      const _oneTime2 = (typeof BILLING_RECURRING_ENABLED !== 'undefined' && !BILLING_RECURRING_ENABLED);
      descHtml = (plan.description || '').replace(/\s*첫 달 무료[^.]*\.?$/, '').trim();
      if (_oneTime2) descHtml += ' 1개월 이용권 — 만료 후 재구매 (자동 갱신 X).';
      else descHtml += ' 정기 구독 — 매월 9,900원 자동 결제, 언제든 해지.';
    }
    return `
      <div class="tier-card ${recommended ? 'tier-recommended' : ''}" style="position:relative; padding:18px 16px; background:${cardBg}; border:${cardBorder}; border-radius:14px; margin-bottom:10px; ${cardOpacity}">
        ${trialBadge}
        ${currentBadge}
        ${recommendBadge}
        <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:4px;">
          <div style="font-size:18px; font-weight:700; color:var(--text);">${plan.emoji} ${plan.label}</div>
          ${priceHtml}
        </div>
        <div style="font-size:12px; color:var(--text-dim); margin-bottom:10px;">${plan.tagline}</div>
        <div style="font-size:11.5px; color:var(--text); line-height:1.7; padding:10px; background:rgba(0,0,0,0.18); border-radius:8px; margin-bottom:10px;">
          ${descHtml}
        </div>
        ${buttonHtml}
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
      <div style="font-size:11px; color:var(--text-dim); margin-bottom:9px;">일일 한도 도달 시 추가 사용 — Premium 구독자 전용.</div>
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
      ${currentSubNotice}
      ${trialConsumedNotice}
      ${tierCard('early_lifetime', TIER_PLANS_CLIENT.early_lifetime, false)}
      ${tierCard('light', TIER_PLANS_CLIENT.light, true)}
      ${tierCard('premium', TIER_PLANS_CLIENT.premium, false)}
      ${premiumPackCard}
      <div style="font-size:10.5px; color:var(--text-soft); line-height:1.7; padding:10px; background:rgba(126,200,227,0.04); border-left:3px solid rgba(126,200,227,0.30); border-radius:4px;">
        ${(typeof BILLING_RECURRING_ENABLED !== 'undefined' && !BILLING_RECURRING_ENABLED)
          ? (_trialConsumed
              ? `💡 가볍게 시작은 Light, 깊게 자주 쓰면 Premium.<br>
                 <b>부가가치세 10% 포함</b> · <b>1개월 이용권 — 자동 갱신 X</b> (만료 7일 전 알림 후 직접 재구매).<br>
                 환불: 잔여일 비례 (<a href="/refund" target="_blank" style="color:var(--accent);">정책</a>).<br>`
              : `💡 잘 모르겠으면 <b style="color:#5fb4d3;">Plus 첫 달 무료</b> (1인 1회 한정). 가볍게 시작은 Light, 깊게 자주 쓰면 Premium.<br>
                 <b>부가가치세 10% 포함</b> · <b>1개월 이용권 — 자동 갱신 X</b> (만료 7일 전 알림 후 직접 재구매).<br>
                 환불: 잔여일 비례 (<a href="/refund" target="_blank" style="color:var(--accent);">정책</a>).<br>`)
          : (_trialConsumed
              ? `💡 가볍게 시작은 Light, 깊게 자주 쓰면 Premium.<br>
                 <b>부가가치세 10% 포함</b> · <b>모든 플랜 = 매월 자동 갱신</b> (해지 1-click).<br>
                 해지: [설정 → 구독] 다음 갱신 해지 / 환불 잔여일 비례 (<a href="/refund" target="_blank" style="color:var(--accent);">정책</a>).<br>`
              : `💡 잘 모르겠으면 <b style="color:#5fb4d3;">Plus 첫 달 무료</b> (1인 1회 한정). 가볍게 시작은 Light, 깊게 자주 쓰면 Premium.<br>
                 <b>부가가치세 10% 포함</b> · <b>모든 플랜 = 매월 자동 갱신</b> (해지 1-click).<br>
                 해지: [설정 → 구독] 다음 갱신 해지 / 환불 잔여일 비례 (<a href="/refund" target="_blank" style="color:var(--accent);">정책</a>).<br>`)}
        💎 <b>Premium 만</b> 일일 한도 도달 시 추가팩 (+${(OVERAGE_PACKS_CLIENT?.premium_pack?.krw || 2500).toLocaleString()}원) 즉시 구매 가능.<br>
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

// V4 (사용자 명시 2026-05-13 ultrathink): 다운그레이드 = 다음 갱신부터 자동 전환 (Phase B — backend migration 0022).
//   동작:
//     1) 사용자 confirm — '현 cycle 만료까지 그대로, 만료일에 자동으로 새 tier 시작' 명시
//     2) /api/billing/schedule-plan-change 호출 — billing.scheduled_plan_change = newTierKey set
//     3) cron-charge-recurring 이 만료일 도달 시 자동으로 새 plan 의 krw charge + plan 전환
//     4) 토스트 + 모달 닫음 + billing status 갱신
//   취소: /설정 → 결제 내역 / 환불 / 해지 에 cancelPlanChange() 버튼.
async function scheduleDowngrade(tierKey) {
  const tier = TIER_PLANS_CLIENT[tierKey];
  if (!tier) { alert('잘못된 플랜'); return; }
  const curPlan = window._billingCache?.subscription_plan;
  const curLabel = TIER_PLANS_CLIENT[curPlan]?.label || curPlan || '현재 plan';
  const expiresIso = window._billingCache?.subscription_expires_at || window._billingCache?.next_billing_at;
  const expiresStr = expiresIso ? new Date(expiresIso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : '만료일';
  const ok = confirm(`🔽 ${tier.label} 으로 다운그레이드 (다음 갱신부터)\n\n• 오늘부터 ${expiresStr} 까지 ${curLabel} 그대로 사용\n• ${expiresStr} 에 자동으로 ${tier.label} ${tier.krw.toLocaleString()}원 결제 + 새 cycle 시작\n• 이후 매월 ${tier.label} ${tier.krw.toLocaleString()}원 자동 갱신\n\n언제든 [설정 → 결제 내역 / 환불 / 해지] 에서 예약 취소 가능.\n\n계속할까?`);
  if (!ok) return;
  if (!session?.access_token) { alert('로그인 필요'); return; }
  try {
    const _origFetch = window._anthropicOrigFetch || window.fetch;
    const resp = await _origFetch('/api/billing/schedule-plan-change', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token
      },
      body: JSON.stringify({ newPlan: tierKey })
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok && data.ok) {
      showToast(`🔽 ${expiresStr} 에 ${tier.label} 자동 전환 예약됨`);
      closeSubscribeModal();
      if (typeof refreshBillingStatus === 'function') refreshBillingStatus(true);
    } else {
      // COLUMN_MISSING = supabase migration 0022 미적용. 사용자에게 명시.
      if (data?.code === 'COLUMN_MISSING') {
        alert('DB schema 미적용 — supabase migration 0022_scheduled_plan_change.sql 실행 필요.\n(사용자 작업: Supabase SQL Editor)');
      } else {
        alert('다운그레이드 예약 실패: ' + (data?.error || resp.status));
      }
    }
  } catch (e) {
    alert('통신 오류: ' + (e?.message || e));
  }
}

// V4 (사용자 명시 2026-05-13 ultrathink): 예약된 plan 변경 취소 — billing.scheduled_plan_change = NULL.
async function cancelPlanChange() {
  if (!session?.access_token) { alert('로그인 필요'); return; }
  const sched = window._billingCache?.scheduled_plan_change;
  if (!sched) { showToast('예약된 변경 없음'); return; }
  const schedLabel = TIER_PLANS_CLIENT[sched]?.label || sched;
  if (!confirm(`예약된 ${schedLabel} 전환을 취소할까?\n\n현재 plan 그대로 자동 갱신 계속.`)) return;
  try {
    const _origFetch = window._anthropicOrigFetch || window.fetch;
    // schedule-plan-change endpoint 가 같은 plan 으로 호출되면 SAME_PLAN 거부 — 별도 cancel-plan-change endpoint 가 깔끔하지만,
    // 단순화: 현재 plan 으로 schedule 호출은 거부되니까 직접 PATCH 가 안 됨. 별도 endpoint 없이 schedule 을 NULL 로 set 하는 별도 흐름 필요.
    // 우회: 같은 plan 으로 schedule 시도하면 backend 가 SAME_PLAN 거부 — 거기 분기로 NULL 처리하는 별도 endpoint 권장.
    // V4 (TODO): /api/billing/cancel-plan-change endpoint 추가. 일단 schedule-plan-change 에 cancel:true flag 로.
    const resp = await _origFetch('/api/billing/schedule-plan-change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ cancel: true })
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok && data.ok) {
      showToast('✓ 예약 취소됨 — 현재 plan 그대로 갱신');
      if (typeof refreshBillingStatus === 'function') refreshBillingStatus(true);
    } else {
      alert('취소 실패: ' + (data?.error || resp.status));
    }
  } catch (e) {
    alert('통신 오류: ' + (e?.message || e));
  }
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
  if (!tier) { alert('잘못된 플랜'); return; }
  // V4 (사용자 명시 2026-05-13 ultrathink): 업그레이드 confirm — 옛 구독 즉시 종료 + 새 cycle.
  //   다운그레이드는 별도 `scheduleDowngrade()` 가 처리 (cancel-renewal + 만료 후 직접 가입). 여기엔 안 옴.
  //   backend `portone-register-recurring` 이 upsert 라 옛 row 자동 덮어씌움.
  const _curBillingPlan   = window._billingCache?.subscription_plan || null;
  const _curBillingActive = !!window._billingCache?.subscription_active;
  const _isUpgrading      = _curBillingActive && _curBillingPlan && _curBillingPlan !== tierKey;
  if (_isUpgrading) {
    const curLabel = TIER_PLANS_CLIENT[_curBillingPlan]?.label || _curBillingPlan;
    const ok = confirm(`✨ ${tier.label} 으로 업그레이드\n\n현재 ${curLabel} 구독이 즉시 종료되고, 오늘부터 새 ${tier.label} 사이클이 시작돼.\n\n• 오늘 ${tier.krw.toLocaleString()}원 즉시 결제\n• 다음 자동 결제는 매월 가입일 기준 (오늘 = 가입일)\n• 잔여 ${curLabel} 일수 보상 X (정책상)\n• 결제수단도 새 카드로 등록\n\n계속할까?`);
    if (!ok) return;
  }
  // V4 (사용자 보고 2026-05-13 ultrathink): trial 소진 사용자 safety net — cache 갱신 race / 옛 stale UI 클릭 케이스 보호.
  //   billing cache 의 plus_trial_consumed_at 이 set 이면 trial 흐름 강제 우회 → 정가 정기 구독 / 일회성 결제 흐름으로.
  const _trialConsumedGuard = !!window._billingCache?.plus_trial_consumed_at;
  // V4 (사용자 명시 2026-05-11 ultrathink — 정정): 가계약 모드에서도 Plus 첫 달 무료 활성. 결제 X 흐름.
  if (typeof BILLING_RECURRING_ENABLED !== 'undefined' && !BILLING_RECURRING_ENABLED) {
    if (tier.has_free_trial && !_trialConsumedGuard) return proceedFreeTrial();  // Plus 첫 달 무료 — 결제 X, 카드 등록 X (1인 1회)
    return proceedOneTimePurchase(tierKey);              // Light/Premium = 일회성 1개월 결제 / trial 소진된 Plus 도 이쪽
  }
  if (tier.has_free_trial && !_trialConsumedGuard) return proceedPlusTrial();  // Plus = 첫 달 무료 trial 흐름 (key='light'). 소진 시 fall-through
  if (!session || !session.access_token) {
    alert('로그인 필요 — 설정 → 로그아웃 후 재로그인.');
    return;
  }
  if (typeof state !== 'undefined' && state && state.isGuest) {
    alert('게스트 모드는 결제 X — 먼저 로그인.');
    return;
  }
  // V4 (사용자 명시 2026-05-13 — 토스페이 심사용 임시 mockup): TOSS_PAY_REVIEW_MOCK=true 면 picker 에 토스페이 노출.
  const _excludeToss = !(typeof TOSS_PAY_REVIEW_MOCK !== 'undefined' && TOSS_PAY_REVIEW_MOCK);
  const _pg = await _pickPaymentMethod({ excludeToss: _excludeToss, title: `${tier.label} 정기 결제 수단 선택` });
  if (!_pg) return;
  const _pgInfo = _getPayChannelInfo(_pg);
  // V4 (사용자 명시 2026-05-13 ultrathink): PG 선택 직후 자동결제 동의 모달 — 미동의 시 종료.
  //   토스페이 심사용 mockup 흐름: picker → 동의 모달 (PG 라벨에 토스페이 표시) → 동의 후 SDK 가드.
  const _consent = await _showRecurringConsentModal({ tier, pgLabel: _pgLabel(_pg), isTrial: false });
  if (!_consent) return;
  const billingChannelKey = _pgInfo.billingChannelKey || _pgInfo.channelKey;
  const storeId = _pgInfo.storeId;
  if (!billingChannelKey || !storeId) {
    // V4 (사용자 명시 2026-05-13 — 토스페이 심사용): 토스 선택 시 친절 안내 (동의 모달까지 본 후). 다른 PG 는 옛 generic 에러.
    if (_pg === 'toss' && typeof TOSS_PAY_REVIEW_MOCK !== 'undefined' && TOSS_PAY_REVIEW_MOCK) {
      alert('🔵 토스페이 정기결제\n\n토스페이 빌링키 채널은 현재 발급 심사 중. 채널 발급 완료 후 활성됩니다.\n\n실제 결제 시연은 KG이니시스 또는 카카오페이로 진행해주세요 — 동일한 정기결제 흐름.');
      return;
    }
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
  // 동의 후 PG 페이지로 이동 안내 토스트.
  if (typeof showToast === 'function') showToast(`${_pgLabel(_pg)} 결제 페이지로 이동…`);
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
      // V4 (사용자 보고 2026-05-13 ultrathink): KG이니시스 V2 모바일 빌링키 = offerPeriod 필수 ('빌링키 발급 창 호출 실패' 에러).
      //   주의: PortOne 표준 ISO 8601 duration ('P1M') X — KG이니시스 custom 형식 '<숫자><d|m|y>' (예: '1m'=매월). PC IFRAME 엔 optional, 모바일 REDIRECTION 시 누락하면 발급 자체 차단.
      offerPeriod: { interval: '1m' },
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
        // V4 (사용자 명시 2026-05-13 ultrathink): 마지막 등록 PG 저장 — 설정 박스 표시용.
        try {
          state.preferences = state.preferences || {};
          state.preferences.lastRegisteredPG = _pg;
          state.preferences.lastRegisteredAt = Date.now();
          saveState();
        } catch {}
        // V4 (사용자 보고 2026-05-13 ultrathink): Premium 결제했는데 plan='light' 저장 버그 진단.
        //   backend 응답 plan != 보낸 tierKey 면 UPSERT mismatch 가능 — 응답 plan 기반 tier 재계산.
        const _actualPlanKey = result.plan || tierKey;
        const _actualTier = (typeof TIER_PLANS_CLIENT !== 'undefined' && TIER_PLANS_CLIENT[_actualPlanKey])
          ? TIER_PLANS_CLIENT[_actualPlanKey] : tier;
        if (_actualPlanKey !== tierKey) {
          console.warn('[subscribe] backend plan mismatch!', { sent: tierKey, received: _actualPlanKey });
        }
        // V4 (사용자 명시 2026-05-13 ultrathink): 토스트 대체 — 명시 성공 모달.
        _showRecurringSuccessModal({
          tier: _actualTier,
          pgLabel: _pgLabel(_pg),
          isTrial: false,
          nextBillingIso: result.next_billing_at || null
        });
      }
      closeSubscribeModal();
      // V4 (사용자 보고 2026-05-13): 결제 후 fresh refresh 강제 — cache 잔재 차단.
      if (typeof refreshBillingStatus === 'function') refreshBillingStatus(true);
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
  const ok = confirm('Plus 첫 달 무료 — 한 달 무료로 모든 기능 사용 가능.\n\n• 1인 1회 한정 (다음엔 정가 9,900원)\n• 자동 결제 X — 한 달 후 만료\n• 만료 7일 전 알림\n\n시작할까?');
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
        showToast('🌊 Plus 첫 달 무료 시작 — 한 달 자유롭게 🫂');
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
  // V4 (사용자 명시 2026-05-13 — 토스페이 심사용 mockup): TOSS_PAY_REVIEW_MOCK=true 면 picker 에 토스페이 노출.
  const _excludeToss = !(typeof TOSS_PAY_REVIEW_MOCK !== 'undefined' && TOSS_PAY_REVIEW_MOCK);
  const _pg = await _pickPaymentMethod({ excludeToss: _excludeToss, title: 'Plus 첫 달 무료 카드 등록 수단' });
  if (!_pg) return;
  const _pgInfo = _getPayChannelInfo(_pg);
  // V4 (사용자 명시 2026-05-13 ultrathink): trial 도 30일 후 자동 결제 = 동의 모달 필수.
  //   토스페이 심사용 mockup 흐름: picker → 동의 모달 → 동의 후 SDK 가드.
  const _consent = await _showRecurringConsentModal({ tier, pgLabel: _pgLabel(_pg), isTrial: true });
  if (!_consent) return;
  const billingChannelKey = _pgInfo.billingChannelKey || _pgInfo.channelKey;
  const storeId = _pgInfo.storeId;
  if (!billingChannelKey || !storeId) {
    if (_pg === 'toss' && typeof TOSS_PAY_REVIEW_MOCK !== 'undefined' && TOSS_PAY_REVIEW_MOCK) {
      alert('🔵 토스페이 정기결제\n\n토스페이 빌링키 채널은 현재 발급 심사 중. 채널 발급 완료 후 활성됩니다.\n\n실제 결제 시연은 KG이니시스 또는 카카오페이로 진행해주세요 — 동일한 정기결제 흐름.');
      return;
    }
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
  // V4 (사용자 명시 2026-05-13 ultrathink): 동의 후 PG 페이지로 이동 안내 토스트.
  if (typeof showToast === 'function') showToast(`${_pgLabel(_pg)} 빌링키 발급 페이지로 이동…`);
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
      // V4 (사용자 보고 2026-05-13 ultrathink): KG이니시스 V2 모바일 빌링키 = offerPeriod 필수 — proceedSubscribe 와 동일. 형식 '1m' (KG이니시스 custom, ISO 8601 X).
      offerPeriod: { interval: '1m' },
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
        try {
          state.preferences = state.preferences || {};
          state.preferences.lastRegisteredPG = _pg;
          state.preferences.lastRegisteredAt = Date.now();
          saveState();
        } catch {}
        _showRecurringSuccessModal({
          tier,
          pgLabel: _pgLabel(_pg),
          isTrial: true,
          nextBillingIso: result.trial_until || result.next_billing_at || null
        });
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
  if (!tier) { alert('잘못된 플랜'); return; }
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
