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
        <span style="color:var(--text-soft); font-size:11px;">
          매일 추가팩 (1,500원) 사면 한 달 ~45,000원.<br>
          Premium (25,000원) 가성비 ✨
        </span>
      </div>
      <button class="btn-primary" onclick="document.getElementById('premiumPromoOverlay').remove(); openSubscribeModal();" style="width:100%; margin-bottom:6px;">🌊 Premium 업그레이드</button>
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
    } else if (subActive && (plan === 'light' || plan === 'early_light')) {
      // V4 (v2 갱신): Light/얼리 월 cap 도달 — 추가팩 OR Premium 권유
      const packKey = plan === 'early_light' ? 'early_pack' : 'light_pack';
      const pack = OVERAGE_PACKS_CLIENT[packKey];
      bodyText = '이번 달 한도 도달했네.<br>Premium 가면 더 깊게 (3x 일일 자유) — Opus 깊은 대화 30번/일.<br><br><span style="color:var(--text-soft); font-size:11px;">또는 추가팩 작게, 다음 달까지 기다려도 OK 🫂</span>';
      optionsHtml = `
        <button class="btn-primary" onclick="document.getElementById('budgetExceededOverlay').remove(); openSubscribeModal();" style="width:100%; margin-bottom:6px;">🌊 Premium 으로 가기 (25,000원/월)</button>
        ${pack ? `<button class="btn-secondary" onclick="purchaseOveragePack('${packKey}')" style="width:100%; margin-bottom:6px;">🌿 추가팩 ${pack.krw.toLocaleString()}원 (1일분+α)</button>` : ''}
        <button class="btn-secondary" onclick="document.getElementById('budgetExceededOverlay').remove();" style="width:100%;">다음 달 기다릴게</button>
      `;
    } else {
      // 비구독 (무료 + legacy charge 잔액 소진) — 구독 안내
      optionsHtml = `
        <button class="btn-primary" onclick="document.getElementById('budgetExceededOverlay').remove(); openSubscribeModal();" style="width:100%; margin-bottom:6px;">📅 구독</button>
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

