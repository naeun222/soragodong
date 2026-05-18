// ═══════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════
function loadSettings() {
  // 사용자 명시 2026-05-11: AI 호칭용 이름 입력.
  const _userNameInput = document.getElementById('userNameInput');
  if (_userNameInput) _userNameInput.value = state.userName || '';
  document.getElementById('profileInput').value = state.profile || '';
  // V4 (사용자 명시 2026-05-18 ultrathink): 일일 대화 한도 input UI 제거 (설정 단순화). state.preferences.dailyChatCap schema 자체는 옛 사용자 호환 위해 보존.
  const accountInfo = document.getElementById('accountInfo');
  if (accountInfo && session?.user) {
    accountInfo.innerHTML = `로그인된 계정: <strong style="color:var(--text)">${escapeHtml(session.user.email || '')}</strong>`;
  }
  // 사용자 명시 2026-05-03 ultrathink: 날씨 자동 인식 status 표시.
  if (typeof refreshWeatherToggleStatus === 'function') refreshWeatherToggleStatus();
  // 사용자 요청 2026-04-30 (Phase C): billing 자동 로드
  if (typeof refreshBillingStatus === 'function') refreshBillingStatus().catch(() => {});
  // V4 (사용자 명시 2026-05-18 ultrathink): E2EE / 진주 미디어 Settings 섹션 제거. 자동 흐름이 cover (가입 시 + 새 브라우저 시 강제, 진주 자동 마이그). refreshE2EEStatus / refreshPearlMigrationStatus 호출 자리 X.
  // 사용자 요청 2026-04-30: 피드백 inbox — 미읽음 답변 badge + admin 버튼 (jade6679@naver.com만 보임)
  if (typeof refreshFeedbackUnreadBadge === 'function') refreshFeedbackUnreadBadge().catch(() => {});
  if (typeof refreshAdminFeedbackButton === 'function') refreshAdminFeedbackButton().catch(() => {});
  // 사용자 요청 2026-04-30: 개발자 도구 admin only (jade6679@naver.com만 보임)
  const devSection = document.getElementById('devToolsSection');
  if (devSection) devSection.style.display = _isAdmin() ? 'block' : 'none';
  // V4 (사용자 명시 2026-05-17 ultrathink): 저녁 시뮬 toggle 라벨 sync (window flag 휘발성, settings 열 때마다 현재 상태 반영).
  const evBtn = document.getElementById('devForceEveningToggleBtn');
  if (evBtn) evBtn.textContent = '⏰ 저녁 6시+ 시뮬: ' + (window._devForceEvening ? 'ON' : 'OFF');

  // 사용자 요청 2026-04-30: 사업자 정보 표시 — 발급 후 BUSINESS_INFO 채우면 자동
  if (typeof renderBusinessInfo === 'function') renderBusinessInfo();
  // V4 (사용자 명시 2026-05-18 ultrathink): 알림 설정 UI sync — 권한 상태 + 빈도/시각 chip 활성 표시.
  if (typeof refreshNotificationSettings === 'function') refreshNotificationSettings();
}

function renderBusinessInfo() {
  const body = document.getElementById('businessInfoBody');
  if (!body) return;
  body.innerHTML = _buildBusinessInfoRowsHtml();
}

// 사용자 명시 2026-05-06 ultrathink: 사업자 정보 row HTML — 설정 inline + 로그인 footer 모달 공용.
function _buildBusinessInfoRowsHtml() {
  if (typeof BUSINESS_INFO === 'undefined') return '';
  const b = BUSINESS_INFO;
  const rows = [];
  if (b.name) rows.push(`<div><b>상호</b>: ${escapeHtml(b.name)}</div>`);
  if (b.representative) rows.push(`<div><b>대표자</b>: ${escapeHtml(b.representative)}</div>`);
  if (b.business_no) rows.push(`<div><b>사업자등록번호</b>: ${escapeHtml(b.business_no)}</div>`);
  if (b.ecommerce_no) rows.push(`<div><b>통신판매업 신고번호</b>: ${escapeHtml(b.ecommerce_no)}</div>`);
  // 사용자 보고 2026-05-05 (PortOne 심사): 사업장 주소 UI 직접 노출 (전상법 §13 의무 + PG 심사 요구).
  if (b.address) rows.push(`<div><b>사업장 주소</b>: ${escapeHtml(b.address)}</div>`);
  rows.push(`<div style="margin-top:6px; font-size:12px;"><a href="/terms" target="_blank" style="color:var(--accent);">이용약관</a> · <a href="/refund" target="_blank" style="color:var(--accent);">환불정책</a> · <a href="/privacy" target="_blank" style="color:var(--accent);">개인정보처리방침</a></div>`);
  if (b.email) rows.push(`<div><b>이메일</b>: <a href="mailto:${escapeHtml(b.email)}" style="color:var(--accent);">${escapeHtml(b.email)}</a></div>`);
  if (b.cpo) rows.push(`<div><b>개인정보 보호책임자</b>: ${escapeHtml(b.cpo)}</div>`);
  if (!b.business_no) {
    rows.push(`<div style="font-size:10px; color:var(--text-soft); margin-top:6px; font-style:italic;">사업자등록 진행 중 — 발급 후 정식 정보로 갱신됩니다.</div>`);
  }
  return rows.join('');
}

// 사용자 명시 2026-05-06 ultrathink: 로그인 화면 footer 의 '사업자정보' link 클릭 시 작은 모달.
// 전상법 §13 = 거래 화면에서 한 번 클릭으로 접근 가능 = 충족. 인증 후엔 설정에서도 inline 표시.
function showBusinessInfoModal() {
  if (document.getElementById('businessInfoOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'businessInfoOverlay';
  overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:10001; display:flex; align-items:center; justify-content:center; padding:20px;';
  overlay.onclick = (e) => { if (e.target === overlay) _closeBusinessInfoModal(); };
  const card = document.createElement('div');
  card.style.cssText = 'background:var(--surface,#1a1828); border:1px solid var(--border); border-radius:14px; max-width:380px; width:100%; padding:18px 20px; box-shadow:0 16px 48px rgba(0,0,0,0.5); font-size:11.5px; color:var(--text); line-height:1.75;';
  const rows = _buildBusinessInfoRowsHtml() || '<div style="color:var(--text-soft);">정보 준비 중</div>';
  card.innerHTML = `
    <div style="font-size:13px; font-weight:600; color:var(--accent); margin-bottom:10px;">사업자 정보</div>
    ${rows}
    <button onclick="_closeBusinessInfoModal()" style="margin-top:14px; width:100%; padding:9px; background:transparent; border:1px solid var(--border-strong,var(--border)); color:var(--text-dim); border-radius:9px; cursor:pointer; font-size:12px; font-family:inherit;">닫기</button>
  `;
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}
function _closeBusinessInfoModal() {
  const m = document.getElementById('businessInfoOverlay');
  if (m) m.remove();
}

function saveSettings() {
  // 사용자 명시 2026-05-11: AI 호칭.
  const _userNameInput = document.getElementById('userNameInput');
  if (_userNameInput) state.userName = _userNameInput.value.trim().slice(0, 20);
  state.profile = document.getElementById('profileInput').value.trim();
  // V4 (사용자 명시 2026-05-18 ultrathink): 일일 대화 한도 저장 코드 제거 (UI 칸 삭제). state.preferences.dailyChatCap 기존 값은 그대로 보존.
  // 사용자 보고 2026-05-01 (profile 날아간 케이스): force=true 로 local 즉시 + saveToCloudNow 즉시 await.
  // 기존 saveState() = cloud 1초 debounce → 입력 후 reload/crash 시 cloud 미동기 → 다음 visit 옛 cloud 가 덮음.
  saveState(true);
  showToast('저장됐어 ✦');
  if (typeof saveToCloudNow === 'function') {
    saveToCloudNow().catch(e => console.warn('[saveSettings] cloud sync:', e));
  }
  // 사용자 요청 2026-04-30 (Phase C): 설정 진입 시 billing 상태 자동 로드.
  if (typeof refreshBillingStatus === 'function') refreshBillingStatus().catch(() => {});
}

// V4 (사용자 명시 2026-05-13): _quotaStateLabel 4단계 정성 라벨 폐기 — 'N시간 후 reset' 으로 통일.
//   옛 라벨 ('오늘 여유 충분' / '적당히 사용 중' / '거의 다 썼어' / '한도 임박') 모두 제거.

// 사용자 요청 2026-04-30 (Phase C): billing 동적 로드 — Settings 진입 시 호출.
// 사용자 명시 2026-05-05: in-flight dedup + 30s TTL cache. manual=true (🔄 button) 만 항상 fresh fetch.
let _billingFetchInflight = null;
const _BILLING_CACHE_TTL_MS = 30 * 1000;
async function refreshBillingStatus(manual) {
  if (!manual) {
    if (_billingFetchInflight) return _billingFetchInflight;
    if (window._billingCache && window._billingCacheTs && (Date.now() - window._billingCacheTs) < _BILLING_CACHE_TTL_MS) {
      // 캐시 fresh — DOM 은 이전 호출이 이미 render 함. fetch skip.
      return;
    }
  }
  const p = _doRefreshBillingStatus(manual);
  if (!manual) {
    _billingFetchInflight = p;
    p.finally(() => { _billingFetchInflight = null; });
  }
  return p;
}
async function _doRefreshBillingStatus(manual) {
  // 사용자 명시 2026-04-30: manual=true 일 때만 토스트 (button click). 자동 호출 (settings 진입 등) = 토스트 X.
  // 사용자 보고 2026-05-12 ultrathink: status DOM 가드 분리 — 옛 흐름 = settings 화면 X 면 early return → _billingCache 갱신 X → _maybeAutoForceAnalyzeFreeTier 가 paid 구독자도 free 로 판정 → 매 3턴 분석 trigger.
  //   fix: status null 이어도 fetch + _billingCache 갱신 진행. render 만 status 있을 때 수행.
  const status = document.getElementById('billingStatus');
  if (typeof session === 'undefined' || !session || !session.access_token) {
    if (status) status.textContent = '로그인 필요';
    return;
  }
  // 사용자 명시 2026-05-11: admin 계정은 구독 표시 = '어드민', 결제/사용량 노출 X.
  // V4 (사용자 보고 2026-05-13): admin 도 _billingCache 갱신 + updateMainHeaderBtnVisual 호출. status UI 만 admin 라벨로 즉시 덮어쓰기.
  const _adminOverlayActive = typeof _isAdmin === 'function' && _isAdmin();
  if (_adminOverlayActive && status) {
    status.innerHTML = `
      <div><b>구독</b>: 🛡️ 어드민</div>
      <div style="font-size:11.5px; color:var(--text-soft); margin-top:6px; line-height:1.6;">운영 계정 — 제한 없음</div>
    `;
    // return X — fetch 계속 진행 (cache 갱신 위해)
  }
  // Phase 1e: 게스트 사용자 — 가입 유도 카드 (수치/한도 노출 X, 데이터 안전 + E2EE 톤).
  if (state && state.isGuest) {
    if (status) {
      status.innerHTML = `
        <div><b>🌱 게스트 모드</b></div>
        <div style="font-size:12px; color:var(--text-dim); margin-top:8px; line-height:1.7;">지금 데이터는 이 기기에만 있어요. - 브라우저 정리되면 사라집니다. 로그인해서 안전하게 이어가기.</div>
        <button class="btn-primary" onclick="showGuestConversionModal({reason:'manual'})" style="margin-top:12px; width:100%; padding:11px; font-size:13px; font-weight:600;">🔒 로그인하고 안전하게 이어가기</button>
        <div style="font-size:10.5px; color:var(--text-soft); margin-top:8px; line-height:1.6;">종단간 암호화로 영구 보관.</div>
      `;
    }
    return;
  }
  // 사용자 명시 2026-04-30 (정정): admin 특혜 제거 — admin 도 일반 사용자처럼 월정액 흐름 표시.
  // 사용자 보고 2026-04-30: 🔄 새로고침 작동 X 버그 — JWT 1h 만료 시 401 → 인터셉터는 /api/chat 만 swap 이라 /api/usage 401 그대로. 자동 refresh + retry + 시각 피드백 추가.
  if (manual && status) status.textContent = '🔄 갱신 중...';
  const _origFetch = window._anthropicOrigFetch || window.fetch;
  // 사용자 보고 2026-04-30 ultrathink: cache-bust query — SW 가 옛 버전이라 /api/usage 캐시 잔재 가능 케이스 보호.
  const _doFetch = () => _origFetch('/api/usage?t=' + Date.now(), {
    headers: { 'Authorization': 'Bearer ' + session.access_token, 'Cache-Control': 'no-cache' }
  });
  try {
    let resp = await _doFetch();
    if (resp.status === 401 && typeof _refreshSessionForApi === 'function') {
      const refreshed = await _refreshSessionForApi();
      if (refreshed) resp = await _doFetch();
    }
    if (!resp.ok) {
      if (status) status.textContent = `사용량 조회 실패 (${resp.status})`;
      return;
    }
    const data = await resp.json();
    const billing = data.billing || {};
    // V4 (사용자 명시 2026-05-13): 게스트 일일 한도 도달 — admin 한정 banner. /api/usage 가 admin 응답에 guest_budget_alert 포함.
    if (_adminOverlayActive && status && data.guest_budget_alert) {
      const ga = data.guest_budget_alert;
      const usedStr = (typeof ga.used_usd === 'number') ? ('$' + ga.used_usd.toFixed(4)) : '?';
      const limitStr = (typeof ga.limit_usd === 'number') ? ('$' + ga.limit_usd.toFixed(2)) : '?';
      const reachedStr = ga.reached_at ? new Date(ga.reached_at).toLocaleTimeString('ko-KR') : '';
      status.innerHTML = `
        <div><b>구독</b>: 🛡️ 어드민</div>
        <div style="font-size:11.5px; color:var(--text-soft); margin-top:6px; line-height:1.6;">운영 계정 — 제한 없음</div>
        <div style="margin-top:12px; padding:10px 12px; background:rgba(232,144,144,0.12); border:1px solid rgba(232,144,144,0.4); border-radius:8px; font-size:12px; line-height:1.6;">
          <b>⚠️ 게스트 일일 한도 도달</b><br>
          사용액: ${usedStr} / ${limitStr}${reachedStr ? ' · ' + reachedStr : ''}<br>
          <span style="color:var(--text-soft); font-size:11px;">게스트 신규 = '오늘 게스트 모드가 너무 붐벼' 안내 중. 내일 4시 reset.</span>
        </div>
      `;
    }
    const subActive = !!billing.subscription_active;
    const planKey = billing.subscription_plan;
    const planMeta = (planKey && typeof TIER_PLANS_CLIENT !== 'undefined' && TIER_PLANS_CLIENT[planKey]) ? TIER_PLANS_CLIENT[planKey] : null;
    const subExpires = billing.subscription_expires_at ? new Date(billing.subscription_expires_at).toLocaleDateString('ko-KR') : null;
    const balance = Number(billing.credit_balance_usd || 0);
    const balanceKrw = Math.round(balance * 1400);
    const quotaUsd = Number(billing.monthly_quota_usd || 0);
    const usedUsd = Number(billing.monthly_token_used || 0) / 1_000_000;
    let html = '';
    // 사용자 명시 2026-04-30 ultrathink: tier-aware 표시 — 구독 상태 / 한도 / 사용량 / 잔여 credit (overage pack 등)
    // 사용자 명시 2026-05-05: raw 수치 ($/토큰) 폐기 — 진행 bar + 상태 라벨로 추상화. 80%+ 일 때만 Premium CTA.
    // 사용자 명시 2026-05-11 ultrathink: early_light (legacy) 는 정상 구독 분기에서 제외 — backend 가 잘못 active 처리해도 frontend 에서 미구독 (또는 환영 체험) 으로 표시. label '얼리 플랜 (legacy)' 노출 차단.
    if (subActive && planMeta && planKey !== 'early_light') {
      // V4 (사용자 명시 2026-05-13 ultrathink): 사용량 bar = 일일 cap 기준 (server gating 도 daily only — monthly 가드 폐기 migration 0020).
      //   daily_cap_usd = _getDailyCapUsd(planKey) (server _lib/billing.ts TIER_PLANS[plan].daily_cap_usd 와 동기).
      //   daily_quota_used = billing row 의 누적 사용액 (consume_daily_atomic RPC 가 갱신).
      //   daily_quota_reset_at = 다음 4AM KST. 표시: 'N시간 뒤 reset' 또는 '내일 reset'.
      const dailyCapUsd = (typeof _getDailyCapUsd === 'function') ? _getDailyCapUsd(planKey) : 0;
      const dailyUsedUsd = Number(billing.daily_quota_used || 0);
      const usedPct = dailyCapUsd > 0 ? Math.min(100, Math.round((dailyUsedUsd / dailyCapUsd) * 100)) : 0;
      const isNearCap = usedPct >= 80;
      // reset 시각 — 다음 4AM KST 까지 남은 시간 표시.
      const resetIso = billing.daily_quota_reset_at;
      let resetStr = '';
      if (resetIso) {
        const resetDate = new Date(resetIso);
        const hoursLeft = Math.ceil((resetDate.getTime() - Date.now()) / 3600000);
        if (hoursLeft <= 0) resetStr = '곧 reset';
        else if (hoursLeft <= 24) resetStr = `${hoursLeft}시간 뒤 reset`;
        else resetStr = '내일 4시 reset';
      } else {
        resetStr = '매일 새벽 4시 reset';
      }
      // 사용자 명시 2026-05-06: backend `cancel_at_period_end` true 면 갱신 해지 됨 — '{date}에 종료' 라벨로 대체.
      const cancelledRenewal = !!billing.cancel_at_period_end;
      // V4 (사용자 명시 2026-05-11): trial 흐름 = Plus(key='light'). 옛 'early_lifetime trial' 폐기.
      // backend trial_until 필드는 이제 plan='light' 사용자에 set — sync 필요.
      const trialUntil = billing.trial_until ? new Date(billing.trial_until) : null;
      const inTrial = (planKey === 'light' && trialUntil && trialUntil > new Date());
      // V4 (사용자 명시 2026-05-11 — 가계약): 일반결제 모드면 모든 plan 이 1개월 일회성 → '에 만료' 톤.
      const _oneTimeMode = (typeof BILLING_RECURRING_ENABLED !== 'undefined' && !BILLING_RECURRING_ENABLED);
      let expiresLabel;
      if (inTrial) {
        const remDays = Math.max(0, Math.ceil((trialUntil.getTime() - Date.now()) / 86400000));
        expiresLabel = cancelledRenewal
          ? `첫 달 무료 — ${remDays}일 후 종료 (자동 결제 X)`
          : `첫 달 무료 — ${remDays}일 후 ${planMeta.krw.toLocaleString()}원 자동 결제`;
      } else if (_oneTimeMode) {
        expiresLabel = `${subExpires}에 만료 (자동 갱신 X)`;
      } else {
        expiresLabel = cancelledRenewal ? `${subExpires}에 종료` : `${subExpires}까지`;
      }
      // V4 (사용자 명시 2026-05-14): plan-color 적용 — Light=베이지/모래, Plus=딥블루, Premium=황금.
      const _planColor = (typeof _planColorVar === 'function') ? _planColorVar(planKey) : 'var(--accent)';
      html += `<div><b>구독</b>: <span style="color:${_planColor}; font-weight:600;">${planMeta.emoji} ${planMeta.label}</span> <span style="color:var(--text-soft); font-size:11px;">— ${expiresLabel}</span></div>`;
      // early_light: 토큰 양 안 보이게 (체험 플랜은 수치 노출 X)
      if (planKey !== 'early_light') {
        // V4 (사용자 명시 2026-05-13): 정성 라벨 폐기 — 'N시간 후 reset' 만 13px 표시.
        html += `<div style="margin-top:10px; font-size:13px;">${resetStr}</div>`;
        html += `<div style="margin-top:6px; height:8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.25); border-radius:4px; overflow:hidden;"><div style="height:100%; width:${usedPct}%; background:${isNearCap ? '#e89090' : 'var(--accent)'}; transition:width 0.3s;"></div></div>`;
        if (isNearCap && planKey !== 'premium') {
          html += `<button class="btn-secondary" onclick="openSubscribeModal()" style="margin-top:10px; width:100%; padding:9px; font-size:12px;">✨ Premium 으로 늘리기</button>`;
        }
      }
      // 사용자 명시 2026-05-06 (재배치): '다음 갱신 해지' = 결제 내역/환불 토글 안으로 이동 + 글씨 크기 ↑.
      // 옛 구독 카드 우측 하단 link 톤 = 너무 안 보였음. _renderCancelRenewalBox 가 토글 안 div 채움.
    } else if (balance > 0) {
      // 사용자 명시 2026-05-06 ultrathink: 신규 가입 = 무료 토큰 grant (양 비공개), early_light auto-grant X. raw $ 노출 금지.
      html += `<div><b>🎁 환영 무료 체험 중</b> <span style="color:var(--text-soft); font-size:11px;">— 자유롭게 써봐</span></div>`;
      html += `<div style="font-size:11px; color:var(--text-soft); margin-top:6px; line-height:1.6;">마음에 들면 구독해줘 — <b>🌊 Plus 첫 달 무료</b> (9,900원/월, 한 달 후 자동 결제) 또는 <b>🐚 Light 4,900원/월</b>.</div>`;
    } else {
      html += `<div><b>구독</b>: 미가입 <span style="color:var(--text-soft); font-size:11px;">— 계속 쓰려면 구독</span></div>`;
    }
    // 사용자 명시 2026-05-11 ultrathink: 추가팩 credit 가격 ($/원) 표시 폐기 — 사용량 cap bar 시각화로.
    //   추가팩 사용량 = max(0, usedUsd - quotaUsd). plan cap 넘긴 사용량부터 추가팩에서 차감.
    //   cap bar 100% = (사용한 추가팩 + 남은 balance). plan quota bar 와 동일 패턴 (line 248-249).
    // V4 (사용자 명시 2026-05-13): 추가팩 = Premium 전용 — light/plus/미구독/게스트엔 bar 노출 X.
    if (subActive && planKey === 'premium' && balance > 0) {
      const overageUsed = Math.max(0, usedUsd - quotaUsd);
      const overageTotal = overageUsed + balance;
      const overagePct = overageTotal > 0 ? Math.min(100, Math.round((overageUsed / overageTotal) * 100)) : 0;
      const remainingPct = 100 - overagePct;
      const isPackNearEmpty = remainingPct < 20;
      html += `<div style="margin-top:12px; font-size:13px;"><b>추가팩</b> <span style="color:var(--text-soft); font-size:11px;">— ${remainingPct}% 남음</span></div>`;
      html += `<div style="margin-top:6px; height:8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.25); border-radius:4px; overflow:hidden;"><div style="height:100%; width:${overagePct}%; background:${isPackNearEmpty ? '#e89090' : 'var(--accent)'}; transition:width 0.3s;"></div></div>`;
    }
    // 사용자 명시 2026-05-11 ultrathink: 레거시 early_light 안내 제거 — 위 정상 구독 분기에서 plan 자체를 미구독 처리하므로 일관성 차원에서 잔재 라인 삭제.
    // V4 (사용자 보고 2026-05-13): admin overlay 활성 시 status 안 덮어쓰기 (이미 위에서 admin 라벨 표시함).
    if (status && !_adminOverlayActive) status.innerHTML = html;
    // 사용자 명시 2026-05-06: 다음 갱신 해지 박스 — 결제 내역 토글 안에 별도 render. admin 도 정상 갱신 (해지 X / 비구독 빈 box).
    if (status && typeof _renderCancelRenewalBox === 'function') {
      try { _renderCancelRenewalBox(billing); } catch {}
    }
    // 사용자 명시 2026-05-05: _billingCacheTs stamp — 30s TTL + showBudgetExceededModal 캐시 재사용용.
    window._billingCache = billing;
    // 사용자 명시 2026-05-14 ultrathink: admin = Premium 강제 (제한 다 풀기). canUseOpus / _isPremium / canUseRAG / 추가팩 등 모든 client 가드 자동 우회.
    //   backend 가드는 ADMIN_USER_ID env 별도 검증 (admin endpoints).
    //   _adminOff 토글 시 _isAdmin 가 false → 일반 사용자 cache 그대로 (디버깅용 시각 분리).
    if (typeof _isAdmin === 'function' && _isAdmin()) {
      window._billingCache = {
        ...billing,
        subscription_plan: 'premium',
        subscription_active: true
      };
    }
    window._billingCacheTs = Date.now();
    // V4 (사용자 명시 2026-05-13 ultrathink): Plan 변경 시 메인 헤더 RAG 토글 visual sync (Light → Plus 가입 등).
    if (typeof updateMainHeaderBtnVisual === 'function') {
      try { updateMainHeaderBtnVisual(); } catch {}
    }
    // V4 (사용자 명시 2026-05-14 ultrathink): plan 결제 직후 onboarding chain auto-trigger (가계약 토스트만 / SDK 콜백 경로).
    //   결제 성공 모달이 떠있으면 그 모달의 [닫기] callback 이 직접 trigger 하므로 race 차단됨.
    if (typeof _maybeTriggerPlanOnboarding === 'function') {
      try { _maybeTriggerPlanOnboarding(); } catch {}
    }
    // 캐시 채워졌으니 배너 큐 재시도 (sync tip 등)
    if (typeof _renderNextBanner === 'function') { try { _renderNextBanner(); } catch {} }
    // 사용자 명시 2026-05-05: 한 달 무료 만료 7일 전 알림 + 인박스 badge 갱신.
    if (typeof checkFreeTrialExpiry === 'function') { try { checkFreeTrialExpiry(); } catch {} }
    // V4 (사용자 명시 2026-05-11 — 가계약): 일회성 1개월 결제 만료 7일 전 알림 (자동 갱신 X 상태).
    if (typeof checkSubscriptionExpiry === 'function') { try { checkSubscriptionExpiry(); } catch {} }
    // V4 (사용자 명시 2026-05-06 ultrathink): 신규 무료 토큰 80% 소진 / 0 도달 알림.
    if (typeof checkFreeCreditDepletion === 'function') { try { checkFreeCreditDepletion(); } catch {} }
    if (typeof refreshNotifInboxBadge === 'function') { try { refreshNotifInboxBadge(); } catch {} }
    // 사용자 명시 2026-04-30: 토스트 = manual button click 시만 (자동 호출 X — 자주 뜨면 부담)
    if (manual && typeof showToast === 'function') showToast('🔄 갱신됐어');
  } catch (e) {
    if (status) status.textContent = '조회 실패: ' + (e.message || e);
  }
}

// 사용자 명시 2026-05-06: 결제 내역 / 환불 UI.
async function loadPayments() {
  const container = document.getElementById('paymentsList');
  if (!container) return;
  if (!session?.access_token) {
    container.textContent = '로그인 필요';
    return;
  }
  // 사용자 명시 2026-05-11: admin 계정은 결제 내역 노출 X.
  if (typeof _isAdmin === 'function' && _isAdmin()) {
    container.innerHTML = '<div style="color:var(--text-soft); padding:8px 0;">🛡️ 어드민 — 결제 내역 없음</div>';
    return;
  }
  container.textContent = '불러오는 중...';
  try {
    const _origFetch = window._anthropicOrigFetch || window.fetch;
    const resp = await _origFetch('/api/billing/list-payments?t=' + Date.now(), {
      headers: { 'Authorization': 'Bearer ' + session.access_token, 'Cache-Control': 'no-cache' }
    });
    if (!resp.ok) {
      container.textContent = '내역 조회 실패 (' + resp.status + ')';
      return;
    }
    const data = await resp.json();
    const payments = data.payments || [];
    if (payments.length === 0) {
      container.innerHTML = '<div style="color:var(--text-soft); padding:8px 0;">최근 6개월 결제 내역 X</div>';
      return;
    }
    const typeLabel = {
      subscribe: '📅 월정액 구독',
      tier_upgrade: '🌊 Premium 업그레이드',
      overage_pack: '✦ Premium 추가팩'
    };
    container.innerHTML = payments.map(p => {
      const date = new Date(p.created_at).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' });
      const label = typeLabel[p.payment_type] || p.payment_type;
      const krw = (p.amount_krw || 0).toLocaleString();
      let statusBadge = '';
      let actionBtn = '';
      if (p.status === 'paid') {
        statusBadge = '<span style="font-size:10px; color:#8fc88f;">✓ 결제됨</span>';
        actionBtn = `<button onclick="requestRefund('${p.id}', ${p.amount_krw}, '${label.replace(/'/g, "\\'")}')" style="background:transparent; border:1px solid rgba(220,80,80,0.40); color:#e89090; font-size:11px; padding:4px 9px; border-radius:6px; cursor:pointer;">환불 요청</button>`;
      } else if (p.status === 'refunded') {
        statusBadge = `<span style="font-size:10px; color:var(--text-soft);">↩ ${(p.refund_amount_krw || 0).toLocaleString()}원 환불</span>`;
      } else if (p.status === 'cancelled' || p.status === 'partial_cancelled') {
        statusBadge = '<span style="font-size:10px; color:var(--text-soft);">↩ 취소됨</span>';
      } else if (p.status === 'processing') {
        statusBadge = '<span style="font-size:10px; color:#e8c590;">⏳ 처리 중</span>';
      }
      return `<div style="padding:10px 0; border-bottom:1px dashed rgba(255,255,255,0.06);">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <div>
            <div style="color:var(--text); font-size:12.5px;">${label}</div>
            <div style="color:var(--text-soft); font-size:10.5px; margin-top:2px;">${date} · ${krw}원 · ${statusBadge}</div>
            <div style="font-size:9.5px; color:var(--text-soft); font-family:monospace; margin-top:3px; user-select:all; cursor:text;" title="환불 문의 시 이 ID 알려주기 — 길게 눌러 복사">#${p.id}</div>
          </div>
          ${actionBtn}
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    container.textContent = '오류: ' + (e?.message || e);
  }
}

// 사용자 명시 2026-05-06: '다음 갱신 해지' 박스 — 결제 내역/환불 토글 안에 render. 글씨 12.5px (옛 10.5px 너무 안 보였음).
// 활성 구독 (subscription_active) + 모든 paid tier (early_light 포함) 에 노출. cancel_at_period_end=true 면 '✓ 해지됨' 라벨로 대체.
// V4 (사용자 명시 2026-05-13 ultrathink): '등록된 결제수단 + 다음 결제예정일 + 카드 변경 + 해지' 통합 관리 박스로 확장.
//   billing.portone_billing_key 가 있어야 정기 등록된 상태. 일반결제 (가계약) 는 박스 비움.
//   카드 변경: 같은 tier 로 재등록 = backend portone-register-recurring 이 새 billingKey 로 옛 거 대체 (upsert).
function _renderCancelRenewalBox(billing) {
  const box = document.getElementById('cancelRenewalBox');
  if (!box) return;
  const subActive = !!(billing && billing.subscription_active);
  if (!subActive) {
    box.innerHTML = '';
    return;
  }
  // V4 (사용자 명시 2026-05-11 — 가계약): 일회성 1개월 모드면 '다음 갱신' 자체가 없음 → 박스 비움.
  if (typeof BILLING_RECURRING_ENABLED !== 'undefined' && !BILLING_RECURRING_ENABLED) {
    box.innerHTML = '';
    return;
  }
  // 빌링키 없으면 (legacy early_light 등) 박스 비움 — 정기 등록된 사용자만.
  if (!billing.portone_billing_key) {
    box.innerHTML = '';
    return;
  }
  const cancelled = !!billing.cancel_at_period_end;
  const planKey = billing.subscription_plan;
  const planMeta = (planKey && typeof TIER_PLANS_CLIENT !== 'undefined' && TIER_PLANS_CLIENT[planKey]) ? TIER_PLANS_CLIENT[planKey] : null;
  const nextIso = billing.next_billing_at || billing.subscription_expires_at || null;
  const nextStr = nextIso ? new Date(nextIso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : '미정';
  const krw = planMeta ? planMeta.krw.toLocaleString() : '';
  // 등록된 PG — frontend state 에서 (backend 컬럼 미추가). 없으면 일반 라벨.
  const pgKey = state?.preferences?.lastRegisteredPG;
  const pgLabelStr = (typeof _pgLabel === 'function' && pgKey) ? _pgLabel(pgKey) : '카드 / 간편결제';
  const cancelBtnHtml = cancelled
    ? `<div style="padding:9px 11px; background:rgba(255,255,255,0.03); border:1px dashed rgba(255,255,255,0.10); border-radius:8px; font-size:12px; color:var(--text-soft); line-height:1.6;">✓ 다음 갱신 해지됨 — <b style="color:var(--text);">${nextStr}</b> 까지 사용 가능.</div>`
    : `<button class="btn-secondary" onclick="cancelNextRenewal()" style="width:100%; padding:10px; font-size:12.5px; color:var(--text); opacity:0.85;">⏸ 구독 해지 (다음 갱신부터)</button>
       <div style="font-size:10.5px; color:var(--text-soft); margin-top:6px; line-height:1.6;">현 결제 만료일 (${nextStr}) 까지 그대로 사용. 환불 X.</div>`;
  const changeBtnHtml = cancelled
    ? ''
    : `<button class="btn-secondary" onclick="changeRegisteredCard()" style="width:100%; padding:10px; font-size:12.5px; margin-top:8px;">💳 결제수단 (카드) 변경</button>
       <div style="font-size:10.5px; color:var(--text-soft); margin-top:6px; line-height:1.6;">새 카드 등록 = 기존 카드 자동 대체.</div>`;
  // V4 (사용자 명시 2026-05-13 ultrathink): 예약된 plan 변경 표시 + 취소 버튼.
  const schedPlan = billing.scheduled_plan_change || null;
  const schedAtStr = billing.scheduled_plan_change_at ? new Date(billing.scheduled_plan_change_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : null;
  const schedBoxHtml = schedPlan
    ? (() => {
        const schedLabel = TIER_PLANS_CLIENT[schedPlan]?.label || schedPlan;
        const schedEmoji = TIER_PLANS_CLIENT[schedPlan]?.emoji || '🔽';
        const schedKrw = TIER_PLANS_CLIENT[schedPlan]?.krw?.toLocaleString() || '';
        return `<div style="margin-top:10px; padding:10px 12px; background:rgba(135,206,235,0.08); border:1px solid rgba(95,180,211,0.30); border-radius:8px; font-size:11.5px; color:var(--text); line-height:1.65;">
          ${schedEmoji} <b>${schedLabel} 으로 전환 예약됨</b><br>
          <span style="color:var(--text-soft); font-size:10.5px;">${nextStr} 에 자동으로 ${schedKrw}원 결제 + 새 ${schedLabel} cycle 시작.${schedAtStr ? ` <span style="opacity:0.7;">(예약 ${schedAtStr})</span>` : ''}</span>
          <button class="btn-secondary" onclick="cancelPlanChange()" style="width:100%; padding:8px; font-size:11.5px; margin-top:8px;">예약 취소</button>
        </div>`;
      })()
    : '';
  box.innerHTML = `
    <div style="padding:10px 0;">
      <div style="font-size:12.5px; color:var(--text); font-weight:600; margin-bottom:8px;">📇 등록된 결제수단</div>
      <div style="background:rgba(0,0,0,0.18); border:1px solid var(--border); border-radius:9px; padding:11px 13px; margin-bottom:10px; line-height:1.7;">
        <div style="font-size:12px; color:var(--text);">${escapeHtml(pgLabelStr)}</div>
        <div style="font-size:11.5px; color:var(--text-soft); margin-top:4px;">다음 결제예정일: <b style="color:var(--text);">${nextStr}</b>${krw ? ` · <b style="color:var(--text);">${krw}원</b>` : ''}</div>
      </div>
      ${schedBoxHtml}
      ${changeBtnHtml}
      <div style="margin-top:10px;">${cancelBtnHtml}</div>
      <details style="margin-top:12px; font-size:11px; color:var(--text-soft);">
        <summary style="cursor:pointer; padding:4px 0; outline:none;">해지하면 어떻게 돼? / 환불은? / 다운그레이드는?</summary>
        <div style="padding:8px 0 4px; line-height:1.75;">
          • <b style="color:var(--text);">해지</b> = 다음 자동결제만 멈춤. 현 결제 기간 (${nextStr}) 까지 그대로 사용.<br>
          • <b style="color:var(--text);">환불</b> = 잔여일 비례. 위 결제 내역에서 [환불 요청] 버튼.<br>
          • 환불 시 즉시 구독 종료 (잔여일 사용 X) — 카드 명세서 3-7영업일 반영.<br>
          • <b style="color:var(--text);">다운그레이드</b> = [구독 시작 / 변경] 모달에서 하위 플랜 클릭 → 다음 갱신부터 자동 전환.<br>
          • <b style="color:var(--text);">업그레이드</b> = 같은 모달에서 상위 플랜 클릭 → 즉시 결제 + 새 cycle.
        </div>
      </details>
    </div>
  `;
}

// V4 (사용자 명시 2026-05-13 ultrathink): 등록된 카드 변경 — 같은 tier 로 재등록 (새 billingKey 가 옛 거 대체).
//   backend `/api/billing/portone-register-recurring` 이 upsert 라 새 빌링키가 자동 덮어씀.
//   ⚠ "첫 달 즉시 결제" 는 cycle reset — 만약 환불 회피 목적 재등록을 막으려면 backend 가드 필요.
//     현재는 신뢰 사용자 가정 (가계약 단건 모드). 정기결제 정식 승인 후 backend `change-card` endpoint 분리 권장.
function changeRegisteredCard() {
  const planKey = window._billingCache?.subscription_plan;
  if (!planKey || !TIER_PLANS_CLIENT[planKey]) {
    alert('현재 구독 상태를 확인할 수 없어. 새로고침 후 다시.');
    return;
  }
  const tierLabel = TIER_PLANS_CLIENT[planKey].label;
  if (!confirm(`💳 ${tierLabel} 결제수단 변경\n\n새 카드 등록 페이지로 이동해. 등록 완료되면 기존 카드는 자동으로 해제되고, 다음 결제일부터 새 카드로 결제돼.\n\n계속할까?`)) return;
  // 같은 tier 로 proceedSubscribe 재호출. 동의 모달이 다시 떠 — 사용자가 확실히 인지.
  if (typeof proceedSubscribe === 'function') proceedSubscribe(planKey);
  else alert('proceedSubscribe 함수 로드 X — 새로고침 후 다시.');
}

// 사용자 명시 2026-05-06: 다음 갱신 해지 — 현 결제 만료까지 사용, 자동 갱신 차단. 환불 X (잔여일 그대로).
// 백엔드: /api/billing/cancel-renewal (POST, Bearer auth) — billing.cancel_at_period_end=true set.
async function cancelNextRenewal() {
  if (!session?.access_token) { alert('로그인 필요'); return; }
  if (!confirm('다음 갱신을 해지할까?\n\n현 결제 기간 (만료일까지) 은 그대로 사용하고, 다음 자동 결제만 멈춰. 환불 아니야.\n\n다시 갱신하고 싶으면 [구독 시작 / 변경] 으로 재구독.')) return;
  try {
    const _origFetch = window._anthropicOrigFetch || window.fetch;
    const resp = await _origFetch('/api/billing/cancel-renewal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token
      },
      body: JSON.stringify({})
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok && data.ok) {
      showToast('✓ 다음 갱신 해지됨 — 만료일까지 사용 가능');
      if (typeof refreshBillingStatus === 'function') refreshBillingStatus(true);
    } else {
      alert('해지 실패: ' + (data.error || resp.status));
    }
  } catch (e) {
    alert('통신 오류: ' + (e?.message || e));
  }
}

async function requestRefund(paymentId, amountKrw, label) {
  if (!session?.access_token) { alert('로그인 필요'); return; }
  const reason = prompt(`${label} (${(amountKrw || 0).toLocaleString()}원) 환불 사유를 알려줘:\n\n(구독 = 잔여일 비례 환불 / 추가팩 = 잔여 credit 비례)`, '');
  if (reason === null) return;  // cancel
  if (!reason.trim()) { alert('환불 사유를 입력해줘.'); return; }
  if (!confirm(`정말 환불 요청할까?\n\n사유: ${reason}\n\n환불 후 잔여 사용 즉시 종료 (구독 만료) — 카드사 정책상 3-7영업일 내 카드 명세서 반영.`)) return;
  try {
    const _origFetch = window._anthropicOrigFetch || window.fetch;
    const resp = await _origFetch('/api/billing/refund', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token
      },
      body: JSON.stringify({ payment_id: paymentId, reason: reason.trim() })
    });
    const data = await resp.json();
    if (resp.ok && data.ok) {
      showToast(`↩ ${(data.refunded_krw || 0).toLocaleString()}원 환불 요청 완료`);
      alert(data.message || '환불 처리됨. 카드사 명세서 3-7영업일 반영.');
      loadPayments();
      if (typeof refreshBillingStatus === 'function') refreshBillingStatus(true);
    } else {
      let extra = '';
      if (data.caller_user_id) extra += '\n\ncaller: ' + data.caller_user_id;
      if (data.row_user_id_full) extra += '\nrow:    ' + data.row_user_id_full;
      else if (data.row_user_id_hint) extra += '\nrow:    ' + data.row_user_id_hint;
      alert('환불 실패: ' + (data.error || resp.status) + extra);
    }
  } catch (e) {
    alert('통신 오류: ' + (e?.message || e));
  }
}

// ═══════════════════════════════════════════════════════════════
// 🔔 알림 설정 — V4 사용자 명시 2026-05-18 ultrathink
// hookFrequency (daily / every-other-day / thrice-week / off) + hookNotificationTime (0-23) +
//   권한 상태 표시 + ensurePushSubscription 재등록.
// 변경 시 자동 ensurePushSubscription 호출 (옛 token 갱신 + 권한 prompt 흐름 자연 통합).
// ═══════════════════════════════════════════════════════════════

const HOOK_FREQ_LABELS = {
  'daily': '매일',
  'every-other-day': '격일',
  'thrice-week': '주 3회',
  'off': '받지 않기'
};

function _formatHookHour(hour) {
  if (typeof hour !== 'number' || isNaN(hour)) return '21시';
  if (hour < 6) return `새벽 ${hour}시`;
  if (hour < 12) return `아침 ${hour}시`;
  if (hour === 12) return '낮 12시';
  if (hour < 18) return `오후 ${hour - 12}시`;
  if (hour < 22) return `저녁 ${hour}시`;
  return `밤 ${hour}시`;
}

// 권한 상태 — Capacitor native 면 PushNotifications.checkPermissions, 그 외 Notification.permission.
async function _getNotificationPermissionState() {
  try {
    if (typeof window !== 'undefined' && window.Capacitor && typeof window.Capacitor.getPlatform === 'function') {
      const p = window.Capacitor.getPlatform();
      if (p === 'android' || p === 'ios') {
        const Push = window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
        if (Push && typeof Push.checkPermissions === 'function') {
          const r = await Push.checkPermissions();
          if (r && r.receive === 'granted') return 'granted';
          if (r && r.receive === 'denied') return 'denied';
          return 'default';
        }
        return 'unsupported';
      }
    }
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission || 'default';
  } catch (e) {
    return 'default';
  }
}

async function refreshNotificationSettings() {
  const prefs = (state && state.preferences) || {};
  const freq = prefs.hookFrequency || 'daily';
  const hour = (typeof prefs.hookNotificationTime === 'number') ? prefs.hookNotificationTime : 21;
  // 빈도 chip 활성
  document.querySelectorAll('#hookFrequencyRow .btn-secondary').forEach(b => {
    const f = b.getAttribute('data-freq');
    if (f === freq) b.classList.add('is-active');
    else b.classList.remove('is-active');
  });
  // 시각 chip 활성 (custom 시각이면 preset off)
  let presetHit = false;
  document.querySelectorAll('#hookTimeRow .btn-secondary').forEach(b => {
    const h = parseInt(b.getAttribute('data-hour'), 10);
    if (h === hour) { b.classList.add('is-active'); presetHit = true; }
    else b.classList.remove('is-active');
  });
  // 빈도 / 시각 hint
  const freqHint = document.getElementById('hookFrequencyHint');
  if (freqHint) {
    if (freq === 'off') freqHint.textContent = '알림 안 받아.';
    else freqHint.textContent = `현재: ${HOOK_FREQ_LABELS[freq] || freq}`;
  }
  const timeHint = document.getElementById('hookTimeHint');
  if (timeHint) {
    if (freq === 'off') {
      timeHint.textContent = '빈도가 [받지 않기] 라 시각 무관.';
    } else {
      const customStr = presetHit ? '' : ` (직접 설정)`;
      timeHint.textContent = `현재: ${_formatHookHour(hour)}${customStr}`;
    }
  }
  // 권한 상태 박스
  const statusBox = document.getElementById('notificationPermStatus');
  if (statusBox) {
    const perm = await _getNotificationPermissionState();
    const isCap = !!(window.Capacitor && typeof window.Capacitor.getPlatform === 'function' && (window.Capacitor.getPlatform() === 'android' || window.Capacitor.getPlatform() === 'ios'));
    let html = '';
    if (perm === 'granted') {
      const platLabel = isCap ? ((window.Capacitor.getPlatform() === 'android') ? 'Android 앱' : 'iOS 앱') : '브라우저';
      html = `<div><span style="color:#8fc88f;">✓ 알림 허용됨</span> <span style="color:var(--text-soft); font-size:11px;">— ${platLabel}</span></div>`;
      if (freq !== 'off') {
        html += `<div style="margin-top:4px; color:var(--text-soft); font-size:11.5px;">${HOOK_FREQ_LABELS[freq]} · ${_formatHookHour(hour)}쯤 한 번</div>`;
      }
    } else if (perm === 'denied') {
      html = `<div><span style="color:#e89090;">✗ 알림 거부됨</span></div>`;
      if (isCap) {
        html += `<div style="margin-top:6px; color:var(--text-soft); font-size:11px; line-height:1.7;">시스템 설정 → 앱 → 소라고동 → 알림 에서 허용 후 [🔄 다시 등록].</div>`;
      } else {
        html += `<div style="margin-top:6px; color:var(--text-soft); font-size:11px; line-height:1.7;">브라우저 주소창 자물쇠 (또는 ⓘ) → 알림 허용 → [🔄 다시 등록].</div>`;
      }
    } else if (perm === 'default') {
      html = `<div><span style="color:#e8c590;">⏳ 알림 미설정</span></div>`;
      html += `<div style="margin-top:6px; color:var(--text-soft); font-size:11px; line-height:1.7;">아래 빈도 / 시각 선택 후 [🔄 다시 등록] = 권한 요청.</div>`;
    } else if (perm === 'unsupported') {
      html = `<div><span style="color:var(--text-soft);">- 이 환경은 푸시 미지원</span></div>`;
      html += `<div style="margin-top:4px; color:var(--text-soft); font-size:11px; line-height:1.6;">iOS Safari 일반 / 데스크탑 일부 제한.</div>`;
    }
    statusBox.innerHTML = html;
  }
}

async function setHookFrequency(freq) {
  if (!state) return;
  state.preferences = state.preferences || {};
  state.preferences.hookFrequency = freq;
  try { saveState(); } catch {}
  refreshNotificationSettings();
  if (freq === 'off') {
    if (typeof showToast === 'function') showToast('🔕 알림 받지 않기 — 언제든 다시 켤 수 있어');
    return;
  }
  // freq 변경 시 옛 token 갱신 — silent (이미 granted 면 prompt X).
  if (typeof ensurePushSubscription === 'function') {
    const hour = (typeof state.preferences.hookNotificationTime === 'number') ? state.preferences.hookNotificationTime : 21;
    try {
      const r = await ensurePushSubscription({ frequency: freq, notificationTime: hour, silent: true });
      if (r && r.ok) {
        if (typeof showToast === 'function') showToast('✓ ' + (HOOK_FREQ_LABELS[freq] || freq) + ' 로 업데이트됐어');
      } else if (r && r.reason === 'permission-denied') {
        if (typeof showToast === 'function') showToast('알림 권한 거부됨 — 시스템 설정에서 허용해줘');
      }
    } catch (e) {
      console.warn('[setHookFrequency]', e);
    }
    refreshNotificationSettings();
  }
}

async function setHookNotificationTime(hour) {
  if (!state) return;
  if (typeof hour !== 'number' || isNaN(hour) || hour < 0 || hour > 23) return;
  state.preferences = state.preferences || {};
  state.preferences.hookNotificationTime = hour;
  try { saveState(); } catch {}
  refreshNotificationSettings();
  if (state.preferences.hookFrequency === 'off') return;
  if (typeof ensurePushSubscription === 'function') {
    const freq = state.preferences.hookFrequency || 'daily';
    try {
      const r = await ensurePushSubscription({ frequency: freq, notificationTime: hour, silent: true });
      if (r && r.ok) {
        if (typeof showToast === 'function') showToast('✓ ' + _formatHookHour(hour) + ' 로 업데이트됐어');
      }
    } catch (e) {
      console.warn('[setHookNotificationTime]', e);
    }
    refreshNotificationSettings();
  }
}

async function setHookNotificationTimeCustom() {
  if (typeof showInputModal !== 'function') {
    const v = prompt('몇 시? (0~23 사이 숫자)', String((state.preferences && state.preferences.hookNotificationTime) || 21));
    if (v === null) return;
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 0 || n > 23) { alert('0~23 사이 숫자로 적어줘'); return; }
    return setHookNotificationTime(n);
  }
  const v = await showInputModal({
    title: '몇 시?',
    message: '0~23 사이 숫자로.',
    placeholder: '예: 19',
    defaultValue: String((state.preferences && state.preferences.hookNotificationTime) || 21),
    okLabel: '저장'
  });
  if (v === null || v === undefined) return;
  const n = parseInt(String(v).trim(), 10);
  if (isNaN(n) || n < 0 || n > 23) {
    if (typeof showToast === 'function') showToast('0~23 사이 숫자로 적어줘');
    return;
  }
  return setHookNotificationTime(n);
}

async function reRegisterPushSubscription() {
  if (typeof ensurePushSubscription !== 'function') {
    if (typeof showToast === 'function') showToast('알림 모듈 부재 — 새로고침 후 다시');
    return;
  }
  const prefs = (state && state.preferences) || {};
  if (prefs.hookFrequency === 'off') {
    if (typeof showToast === 'function') showToast('빈도가 [받지 않기] 라 등록 X — 위에서 다른 빈도 선택 후 다시');
    return;
  }
  const freq = prefs.hookFrequency || 'daily';
  const hour = (typeof prefs.hookNotificationTime === 'number') ? prefs.hookNotificationTime : 21;
  try {
    if (typeof showToast === 'function') showToast('🔄 알림 등록 중...');
    const r = await ensurePushSubscription({ frequency: freq, notificationTime: hour });
    if (r && r.ok) {
      if (typeof showToast === 'function') showToast('🔔 알림 켜졌어 — ' + (HOOK_FREQ_LABELS[freq] || freq) + ' · ' + _formatHookHour(hour) + '쯤');
    } else if (r && r.reason === 'permission-denied') {
      alert('알림 권한이 거부됐어.\n\n시스템 설정 → 앱 → 소라고동 → 알림 (또는 브라우저 주소창 자물쇠 → 알림) 에서 허용 후 다시 시도.');
    } else if (r && r.reason === 'no-vapid-key') {
      if (typeof showToast === 'function') showToast('서버 키 미설정 — 관리자에게 문의');
    } else if (r && r.reason === 'unsupported-platform') {
      if (typeof showToast === 'function') showToast('이 환경은 푸시 미지원 (iOS Safari 일반 / 데스크탑 일부)');
    } else if (r && r.reason === 'no-capacitor-plugin') {
      if (typeof showToast === 'function') showToast('네이티브 플러그인 미설치 — 앱 재설치 필요');
    } else if (r && r.reason === 'no-auth') {
      if (typeof showToast === 'function') showToast('로그인 필요');
    } else {
      const reason = (r && r.reason) || 'unknown';
      if (typeof showToast === 'function') showToast('알림 등록 실패: ' + reason);
    }
  } catch (e) {
    console.warn('[reRegisterPushSubscription]', e);
    if (typeof showToast === 'function') showToast('오류: ' + (e?.message || e));
  }
  refreshNotificationSettings();
}

