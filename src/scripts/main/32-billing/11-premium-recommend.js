// V4 (사용자 명시 2026-05-04 ultrathink — v2): 3일 연속 일일 cap 도달 detect → Premium 권유 모달
function _trackDailyCapHit() {
  state.dailyCapHits = Array.isArray(state.dailyCapHits) ? state.dailyCapHits : [];
  const todayK = (typeof todayKey === 'function') ? todayKey() : new Date().toISOString().split('T')[0];
  if (!state.dailyCapHits.includes(todayK)) {
    state.dailyCapHits.push(todayK);
    state.dailyCapHits = state.dailyCapHits.slice(-14);
    try { saveState(); } catch {}
  }
  // 3일 연속 detect
  let consecutive = 1;
  const todayMs = new Date(todayK + 'T12:00:00').getTime();
  for (let i = 1; i < 7; i++) {
    const d = new Date(todayMs - i * 86400000);
    const dk = d.toISOString().split('T')[0];
    if (state.dailyCapHits.includes(dk)) consecutive++;
    else break;
  }
  return consecutive;
}
function _showPremiumPromoModal() {
  if (document.getElementById('premiumPromoOverlay')) return;
  if (state.preferences && state.preferences._premiumPromoShownAt) {
    // 7일 마다 1번만 (잦은 노출 회피)
    const last = new Date(state.preferences._premiumPromoShownAt).getTime();
    if (!isNaN(last) && Date.now() - last < 7 * 24 * 3600 * 1000) return;
  }
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay show';
  overlay.id = 'premiumPromoOverlay';
  overlay.style.zIndex = '10001';
  overlay.innerHTML = `
    <div class="input-modal" style="max-width:380px; padding:24px; text-align:center;">
      <div style="font-size:36px; margin-bottom:8px;">🌊</div>
      <div style="font-size:17px; font-weight:600; color:var(--text); margin-bottom:8px;">3일 연속 한도 도달 ✦</div>
      <div style="font-size:13px; color:var(--text-dim); line-height:1.7; margin-bottom:18px;">
        활발하게 쓰고 있네!<br>
        <b>Premium</b> 가면 <b>3.75x 더 자유</b>롭게 — Opus 깊은 대화도 매일 30번까지.<br>
        <br>
        <span style="color:var(--text-soft); font-size:11.5px; line-height:1.6;">
          솔직하게 — 단독 개발자 (1인) 라 Premium = <b>iOS 앱 출시 후원</b>.<br>
          중고 맥북 사서 iOS 빌드 가능 🫂<br>
          <span style="font-size:10px; opacity:0.6;">개발자가 중고 맥북이 없어서 ios 앱 출시를 못하고 있어욥..</span>
        </span>
      </div>
      <button class="btn-primary" onclick="document.getElementById('premiumPromoOverlay').remove(); openSubscribeModal();" style="width:100%; margin-bottom:6px;">🌊 Premium 으로 후원하기</button>
      <button class="btn-secondary" onclick="document.getElementById('premiumPromoOverlay').remove();" style="width:100%;">나중에</button>
    </div>
  `;
  document.body.appendChild(overlay);
  state.preferences = state.preferences || {};
  state.preferences._premiumPromoShownAt = new Date().toISOString();
  try { saveState(); } catch {}
}

// ─── Cap 도달 모달 (claude-style, 사용자 명시 2026-04-30 + v2 갱신 2026-05-04 ultrathink) ───
// V2 흐름: 일일 cap 도달 = "내일 또 24h ✨" (충격 X) + 추가팩 (작은 단위) / 월 cap 도달 = Premium 권유 + 추가팩
// reason 안 'daily' / 'monthly' 분기 가능. 옛 호환 — reason 만 string 이면 monthly 가정.
function showBudgetExceededModal(reason, opts) {
  if (document.getElementById('budgetExceededOverlay')) return;
  opts = opts || {};
  const isDaily = !!opts.isDaily || (typeof reason === 'string' && /일일|daily|24h/i.test(reason));
  (async () => {
    let billing = null;
    // 사용자 명시 2026-05-05: refreshBillingStatus 가 30s 안에 채운 캐시 재사용 — 별도 /api/usage 호출 절감.
    if (window._billingCache && window._billingCacheTs && (Date.now() - window._billingCacheTs) < 30000) {
      billing = window._billingCache;
    } else {
      try {
        const _origFetch = window._anthropicOrigFetch || window.fetch;
        const resp = await _origFetch('/api/usage', {
          headers: { 'Authorization': 'Bearer ' + (session?.access_token || '') }
        });
        if (resp.ok) {
          const data = await resp.json();
          billing = data.billing || null;
        }
      } catch (e) { /* ignore */ }
    }
    const plan = billing?.subscription_plan || null;
    const subActive = !!billing?.subscription_active;
    const overlay = document.createElement('div');
    overlay.className = 'input-modal-overlay show';
    overlay.id = 'budgetExceededOverlay';
    overlay.style.zIndex = '10000';
    let optionsHtml = '';
    let titleText = '🔋 한도 도달';
    let bodyText = escapeHtml(reason || '이번 cycle 한도 다 썼어요.');
    // V4 (사용자 명시 2026-05-04 ultrathink — v2): 일일 cap 도달 = '내일 또 24h ✨' 톤. 추가팩 = 작은 단위.
    if (isDaily && subActive) {
      // 3일 연속 detect — Light/early 사용자에게 Premium 권유 (Premium = 자기 사용자라 X)
      if (typeof _trackDailyCapHit === 'function') {
        const consecutive = _trackDailyCapHit();
        if (consecutive >= 3 && (plan === 'light' || plan === 'early_light')) {
          // 일일 cap 모달 닫고 Premium 권유 모달
          setTimeout(() => { if (typeof _showPremiumPromoModal === 'function') _showPremiumPromoModal(); }, 400);
        }
      }
      titleText = '🌙 오늘은 여기까지';
      bodyText = '내일 또 24h ✨<br><span style="color:var(--text-soft); font-size:11px;">오늘 충분히 깊게 했어 — 내일 다시 만나자.</span>';
      // 추가팩 (작은 단위) — 24h 못 기다리는 경우
      const packKey = (plan === 'premium') ? 'premium_pack' : (plan === 'early_light' ? 'early_pack' : 'light_pack');
      const pack = OVERAGE_PACKS_CLIENT[packKey];
      if (pack) {
        optionsHtml = `
          <button class="btn-secondary" onclick="purchaseOveragePack('${packKey}')" style="width:100%; margin-bottom:6px;">🌿 못 기다리겠어 — 추가팩 ${pack.krw.toLocaleString()}원</button>
          <button class="btn-primary" onclick="document.getElementById('budgetExceededOverlay').remove();" style="width:100%;">내일 만날게 ✨</button>
        `;
      } else {
        optionsHtml = `<button class="btn-primary" onclick="document.getElementById('budgetExceededOverlay').remove();" style="width:100%;">내일 만날게 ✨</button>`;
      }
    } else if (subActive && plan === 'premium') {
      // 월 cap 도달 — Premium 사용자: 추가팩 (계속 가능)
      const pack = OVERAGE_PACKS_CLIENT.premium_pack;
      optionsHtml = `
        <button class="btn-primary" onclick="purchaseOveragePack('premium_pack')" style="width:100%; margin-bottom:6px;">🌊 추가팩 ${pack.krw.toLocaleString()}원 결제</button>
        <div style="font-size:10.5px; color:var(--text-soft); margin-top:4px; margin-bottom:8px; text-align:center;">계속 결제 가능.</div>
        <button class="btn-secondary" onclick="document.getElementById('budgetExceededOverlay').remove();" style="width:100%;">닫기</button>
      `;
    } else if (subActive && plan === 'early_light') {
      titleText = '🐚 체험 한도 도달';
      bodyText = '체험 한도 다 썼네 — 써줘서 고마워.<br><br>' +
        '<span style="color:var(--accent); font-weight:600;">✨ 얼리버드 평생 이용권</span>이 지금 <b>4,900원</b> (앱 출시 전 한정).<br>' +
        '월정액 대신, 한 번 결제하고 매달 Light 수준으로 평생 이어가.<br><br>' +
        '<span style="color:var(--text-soft); font-size:11px; line-height:1.6;">' +
        '솔직하게 — 단독 개발자 (1인) 라 결제 = iOS 앱 출시 후원이야 🫂<br>' +
        '<span style="font-size:10px; opacity:0.55;">개발자가 중고 맥북이 없어서 ios 앱 출시를 못하고 있어욥..</span>' +
        '</span>';
      optionsHtml = `
        <button class="btn-primary" onclick="document.getElementById('budgetExceededOverlay').remove(); openSubscribeModal();" style="width:100%; margin-bottom:6px;">✨ 얼리버드 평생 이용권 보기 (4,900원)</button>
        <button class="btn-secondary" onclick="document.getElementById('budgetExceededOverlay').remove(); openSubscribeModal();" style="width:100%; margin-bottom:6px;">📅 월정액 구독 보기</button>
        <button class="btn-secondary" onclick="document.getElementById('budgetExceededOverlay').remove();" style="width:100%;">나중에 결정할게</button>
      `;
    } else if (subActive && plan === 'light') {
      // Light 월 cap 도달 — 추가팩 OR Premium 권유
      const pack = OVERAGE_PACKS_CLIENT.light_pack;
      bodyText = '이번 달 한도 도달했네.<br>Premium 가면 더 깊게 (3x 일일 자유) — Opus 깊은 대화 30번/일.<br><br>' +
        '<span style="color:var(--text-soft); font-size:11px; line-height:1.6;">' +
        '솔직하게 — 단독 개발자 (1인) 라 Premium 결제 = <b>iOS 앱 출시 후원</b>. 중고 맥북 사서 iOS 빌드 가능 🫂<br>' +
        '<span style="font-size:10px; opacity:0.55;">개발자가 중고 맥북이 없어서 ios 앱 출시를 못하고 있어욥..</span>' +
        '</span>';
      optionsHtml = `
        <button class="btn-primary" onclick="document.getElementById('budgetExceededOverlay').remove(); openSubscribeModal();" style="width:100%; margin-bottom:6px;">🌊 Premium 으로 후원하기 (25,000원/월)</button>
        ${pack ? `<button class="btn-secondary" onclick="purchaseOveragePack('light_pack')" style="width:100%; margin-bottom:6px;">🌿 추가팩 ${pack.krw.toLocaleString()}원 (1일분+α)</button>` : ''}
        <button class="btn-secondary" onclick="document.getElementById('budgetExceededOverlay').remove();" style="width:100%;">다음 달 기다릴게</button>
      `;
    } else {
      // 비구독 (체험 만료) — 구독 안내 + 개발자 후원 톤
      titleText = '🐚 체험 종료';
      bodyText = '체험 기간 끝났어 — 깊게 써줘서 고마워.<br><br>' +
        '계속 쓰려면 구독 — <span style="color:var(--accent); font-weight:600;">얼리버드 평생 이용권 4,900원</span>이 지금만.<br><br>' +
        '<span style="color:var(--text-soft); font-size:11px; line-height:1.6;">' +
        '단독 개발자 (1인) 가 후원 = iOS 앱 출시 가능 🫂<br>' +
        '<span style="font-size:10px; opacity:0.55;">개발자가 중고 맥북이 없어서 ios 앱 출시를 못하고 있어욥..</span>' +
        '</span>';
      optionsHtml = `
        <button class="btn-primary" onclick="document.getElementById('budgetExceededOverlay').remove(); openSubscribeModal();" style="width:100%; margin-bottom:6px;">✨ 얼리버드 평생 이용권 보기 (4,900원)</button>
        <button class="btn-secondary" onclick="document.getElementById('budgetExceededOverlay').remove(); openSubscribeModal();" style="width:100%; margin-bottom:6px;">📅 월정액 구독 보기</button>
        <button class="btn-secondary" onclick="document.getElementById('budgetExceededOverlay').remove();" style="width:100%;">닫기</button>
      `;
    }
    overlay.innerHTML = `
      <div class="input-modal" style="max-width:380px; padding:24px;">
        <div style="font-size:16px; font-weight:700; color:var(--text); margin-bottom:8px;">${titleText}</div>
        <div style="font-size:12px; color:var(--text); line-height:1.7; margin-bottom:14px;">
          ${bodyText}
        </div>
        ${optionsHtml}
      </div>
    `;
    document.body.appendChild(overlay);
  })().catch(e => console.warn('[budget modal]', e));
}

