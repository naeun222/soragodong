// V4 (사용자 명시 2026-05-14 ultrathink): plan 결제 직후 onboarding chain.
//   step 1 (환영 + 내일 아침 갱신) = 결제 성공 모달이 흡수 → opts.skipStep1=true 시 step 2 부터.
//   step 2 = plan 별 4단 분석 횟수 안내.
//   step 3 = (Plus/Premium 만) 옛 챕터 기억 (RAG) 안내 — showRagFirstClickModal 카피 재활용.
//   step 4 = (Premium 만) 마법/숙고 Opus 깊은 사고 잠금 해제 안내.
//   flag: state.preferences._planOnboardingShown[plan]=true — plan-key 별 1회.
//   trigger:
//     ① 결제 성공 모달 (_showRecurringSuccessModal) [닫기] → _planOnboardingFlow(plan, {skipStep1:true})
//     ② refreshBillingStatus 후 plan 변화 detect → _maybeTriggerPlanOnboarding() (가계약 토스트만 / SDK 콜백 경로)
//   tone: 정중체 (~합니다 / ~해요).

// plan-key → tier color CSS var
function _planColorVar(plan) {
  if (plan === 'premium') return 'var(--tier-premium)';
  if (plan === 'light')   return 'var(--tier-plus)';      // key 'light' = Plus = 블루
  if (plan === 'early_lifetime') return 'var(--tier-light)'; // key 'early_lifetime' = Light = 베이지
  return 'var(--accent)';
}
// plan-key → tier dim (transparent) CSS var
function _planColorDimVar(plan) {
  if (plan === 'premium') return 'var(--tier-premium-dim)';
  if (plan === 'light')   return 'var(--tier-plus-dim)';
  if (plan === 'early_lifetime') return 'var(--tier-light-dim)';
  return 'var(--accent-dim)';
}

function _planOnboardingFlow(plan, opts) {
  opts = opts || {};
  if (!plan) return;
  const VALID = ['early_lifetime', 'light', 'premium'];
  if (!VALID.includes(plan)) return;
  // 게스트 / 튜토리얼 도중 = skip (race 차단)
  if (typeof state !== 'undefined' && state && state.isGuest) return;
  if (window._onbTutorialMode) return;

  try {
    state.preferences = state.preferences || {};
    state.preferences._planOnboardingShown = state.preferences._planOnboardingShown || {};
    if (state.preferences._planOnboardingShown[plan]) return;
  } catch { return; }

  const tier = (typeof TIER_PLANS_CLIENT !== 'undefined') ? TIER_PLANS_CLIENT[plan] : null;
  if (!tier) return;
  const tierColor = _planColorVar(plan);
  const tierEmoji = tier.emoji || '✦';

  const _markDone = () => {
    try {
      state.preferences._planOnboardingShown[plan] = true;
      saveState();
    } catch {}
  };
  const _replaceOverlay = (innerHtml) => {
    const existing = document.getElementById('planOnboardingOverlay');
    if (existing) existing.remove();
    const ov = document.createElement('div');
    ov.className = 'input-modal-overlay show';
    ov.id = 'planOnboardingOverlay';
    ov.style.zIndex = '10006';
    ov.innerHTML = innerHtml;
    document.body.appendChild(ov);
    return ov;
  };

  const _step1 = () => {
    const ov = _replaceOverlay(`
      <div class="input-modal plan-onb-modal" style="max-width:380px; padding:24px; border-top:3px solid ${tierColor};">
        <div style="font-size:36px; text-align:center; margin-bottom:12px;">${tierEmoji}</div>
        <div style="font-size:17px; font-weight:700; color:var(--text); text-align:center; margin-bottom:14px;">환영합니다</div>
        <div style="font-size:13px; color:var(--text); line-height:1.75; text-align:center; margin-bottom:22px;">
          이제부터 <b style="color:${tierColor};">나 탭 · 도서관 챕터</b>는 다음날 아침에 한 번에 갱신됩니다.<br>내일 확인해보세요! ${tierEmoji}
        </div>
        <button class="btn-primary plan-onb-btn" id="planOnbStep1Ok" style="width:100%; padding:11px; background:${tierColor}; border:none; color:#fff; font-weight:600;">알겠어</button>
      </div>
    `);
    document.getElementById('planOnbStep1Ok').addEventListener('click', () => { ov.remove(); _step2(); });
  };

  const _step2 = () => {
    let copy;
    if (plan === 'early_lifetime') copy = '이제부터 하루에 <b style="color:'+tierColor+';">4단 분석을 세 번</b> 쓸 수 있습니다.';
    else if (plan === 'light')      copy = '이제부터 하루에 <b style="color:'+tierColor+';">4단 분석을 다섯 번</b> 쓸 수 있습니다.';
    else                            copy = '이제부터 <b style="color:'+tierColor+';">4단 분석을 하루에 열 번, 시간 제한 없이</b> 쓸 수 있습니다.';
    const ov = _replaceOverlay(`
      <div class="input-modal plan-onb-modal" style="max-width:380px; padding:24px; border-top:3px solid ${tierColor};">
        <div style="font-size:32px; text-align:center; margin-bottom:12px;">${tierEmoji}</div>
        <div style="font-size:13.5px; color:var(--text); line-height:1.8; text-align:center; margin-bottom:22px;">${copy}</div>
        <button class="btn-primary plan-onb-btn" id="planOnbStep2Ok" style="width:100%; padding:11px; background:${tierColor}; border:none; color:#fff; font-weight:600;">알겠어</button>
      </div>
    `);
    document.getElementById('planOnbStep2Ok').addEventListener('click', () => {
      ov.remove();
      if (plan === 'early_lifetime') { _markDone(); return; }
      // Plus/Premium = 대화탭 자동 이동 후 step 3.
      try { if (typeof showScreen === 'function') showScreen('chat'); } catch {}
      setTimeout(_step3, 300);
    });
  };

  const _step3 = () => {
    const isPremium = (plan === 'premium');
    const title = isPremium ? '✨ 업그레이드된 옛 챕터 기억' : '✨ 고동이 기억력이 좋아져';
    const subCopy = isPremium
      ? `이전 챕터를 <b style="color:${tierColor};">최대 3개</b>까지 더 깊이 찾아와서 이어갑니다.`
      : '대신 토큰이 조금 더 빨리 닳아요.';
    const ov = _replaceOverlay(`
      <div class="input-modal plan-onb-modal" style="max-width:380px; padding:24px; border-top:3px solid ${tierColor}; text-align:center;">
        <div style="font-size:16px; font-weight:600; color:var(--text); margin-bottom:16px;">${title}</div>
        <div style="display:flex; gap:16px; align-items:center; justify-content:center; margin-bottom:18px;">
          <div style="text-align:center;">
            <img src="/character/godong-sonnet.svg" alt="" style="width:64px; height:64px;">
            <div style="font-size:10.5px; color:var(--text-soft); margin-top:4px;">평소</div>
          </div>
          <div style="color:var(--text-dim); font-size:18px;">→</div>
          <div style="text-align:center; filter:drop-shadow(0 0 12px ${_planColorDimVar(plan)});">
            <img src="/character/godong-rag.svg" alt="" style="width:64px; height:64px;">
            <div style="font-size:10.5px; color:${tierColor}; margin-top:4px;">옛 챕터 기억 ON</div>
          </div>
        </div>
        <div style="font-size:12.5px; color:var(--text-dim); line-height:1.75; margin-bottom:18px;">
          대화를 더 자연스럽게 할 수 있고, 당신을 더 깊이 이해해요.<br>
          <span style="color:var(--text-soft); font-size:11.5px;">${subCopy}</span>
        </div>
        <div style="font-size:11.5px; color:var(--text-soft); line-height:1.6; margin-bottom:18px; padding:9px 12px; background:rgba(255,255,255,0.03); border-radius:8px;">
          상단 헤더의 <img src="/character/godong-serious.svg" alt="" style="height:15px; vertical-align:middle; margin:0 1px;"> 아이콘을 누르시면 ON 됩니다.
        </div>
        <button class="btn-primary plan-onb-btn" id="planOnbStep3Ok" style="width:100%; padding:11px; background:${tierColor}; border:none; color:#fff; font-weight:600;">알겠어</button>
      </div>
    `);
    document.getElementById('planOnbStep3Ok').addEventListener('click', () => {
      ov.remove();
      if (!isPremium) { _markDone(); return; }
      setTimeout(_step4, 200);
    });
  };

  const _step4 = () => {
    const ov = _replaceOverlay(`
      <div class="input-modal plan-onb-modal" style="max-width:380px; padding:24px; border-top:3px solid ${tierColor};">
        <div style="display:flex; gap:14px; align-items:center; justify-content:center; margin-bottom:14px; font-size:36px;">
          <span>🪶</span>
          <span style="color:var(--text-dim); font-size:20px;">→</span>
          <span style="filter:drop-shadow(0 0 12px ${_planColorDimVar(plan)});">🦉</span>
        </div>
        <div style="font-size:16px; font-weight:600; color:var(--text); text-align:center; margin-bottom:14px;">🦉 Opus 깊은 사고 잠금 해제</div>
        <div style="font-size:12.5px; color:var(--text-dim); line-height:1.75; text-align:center; margin-bottom:18px;">
          마법고동 · 숙고의 방 헤더의 <b>🪶</b> 를 누르면 <b style="color:${tierColor};">Opus(상위 모델)</b> 로 더 깊게 생각해줍니다.<br>
          <span style="color:var(--text-soft); font-size:11.5px;">중요한 한 번 쓸 때 추천 — 같은 잔량에서 토큰이 5배 빠르게 차감되니까요.</span>
        </div>
        <button class="btn-primary plan-onb-btn" id="planOnbStep4Ok" style="width:100%; padding:11px; background:${tierColor}; border:none; color:#fff; font-weight:600;">알겠어</button>
      </div>
    `);
    document.getElementById('planOnbStep4Ok').addEventListener('click', () => { ov.remove(); _markDone(); });
  };

  if (opts.skipStep1) _step2();
  else _step1();
}

// refreshBillingStatus 후 plan 변화 detect 시 자동 chain trigger.
//   결제 성공 모달 [닫기] callback 외 다른 경로 (가계약 토스트만 / SDK 콜백) 도 cover.
function _maybeTriggerPlanOnboarding() {
  try {
    const billing = window._billingCache;
    if (!billing) return;
    if (!billing.subscription_active) return;
    const plan = billing.subscription_plan;
    if (!plan) return;
    if (typeof state === 'undefined' || !state) return;
    if (state.isGuest) return;
    state.preferences = state.preferences || {};
    state.preferences._planOnboardingShown = state.preferences._planOnboardingShown || {};
    if (state.preferences._planOnboardingShown[plan]) return;
    // 다른 모달 떠있으면 skip — 결제 성공 모달 dismiss callback 이 직접 trigger 한다.
    if (document.querySelector('.input-modal-overlay.show')) return;
    if (typeof _planOnboardingFlow === 'function') _planOnboardingFlow(plan, { skipStep1: false });
  } catch (e) { console.warn('[planOnboarding] trigger', e); }
}
