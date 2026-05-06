// ═══════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════
function loadSettings() {
  document.getElementById('profileInput').value = state.profile || '';
  // 사용자 요청 2026-04-30: 일일 cap input + 현재 사용량 표시
  const capInput = document.getElementById('dailyChatCapInput');
  if (capInput) {
    const cap = (state.preferences && state.preferences.dailyChatCap != null) ? state.preferences.dailyChatCap : 100;
    capInput.value = cap;
  }
  const status = document.getElementById('dailyChatCountStatus');
  if (status) {
    const todayK = todayKey();
    const cur = (state.dailyChatCount && state.dailyChatCount.date === todayK) ? state.dailyChatCount.count : 0;
    const cap = (state.preferences && state.preferences.dailyChatCap) || 100;
    if (cap === 0) {
      status.textContent = `오늘 ${cur}회 사용 (무제한)`;
    } else {
      status.textContent = `오늘 ${cur}/${cap}회 사용`;
    }
  }
  const accountInfo = document.getElementById('accountInfo');
  if (accountInfo && session?.user) {
    accountInfo.innerHTML = `로그인된 계정: <strong style="color:var(--text)">${escapeHtml(session.user.email || '')}</strong>`;
  }
  // 사용자 명시 2026-05-03 ultrathink: 날씨 자동 인식 status 표시.
  if (typeof refreshWeatherToggleStatus === 'function') refreshWeatherToggleStatus();
  // 사용자 요청 2026-04-30 (Phase C): billing 자동 로드
  if (typeof refreshBillingStatus === 'function') refreshBillingStatus().catch(() => {});
  // E2EE 상태 갱신
  if (typeof refreshE2EEStatus === 'function') refreshE2EEStatus();
  // 사용자 요청 2026-04-30: 피드백 inbox — 미읽음 답변 badge + admin 버튼 (jade6679@naver.com만 보임)
  if (typeof refreshFeedbackUnreadBadge === 'function') refreshFeedbackUnreadBadge().catch(() => {});
  if (typeof refreshAdminFeedbackButton === 'function') refreshAdminFeedbackButton().catch(() => {});
  // 사용자 요청 2026-04-30: 개발자 도구 admin only (jade6679@naver.com만 보임)
  const devSection = document.getElementById('devToolsSection');
  if (devSection) devSection.style.display = _isAdmin() ? 'block' : 'none';

  // 사용자 요청 2026-04-30: 사업자 정보 표시 — 발급 후 BUSINESS_INFO 채우면 자동
  if (typeof renderBusinessInfo === 'function') renderBusinessInfo();
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
  state.profile = document.getElementById('profileInput').value.trim();
  // 사용자 요청 2026-04-30: 일일 cap 저장
  const capInput = document.getElementById('dailyChatCapInput');
  if (capInput) {
    const v = parseInt(capInput.value, 10);
    if (!isNaN(v) && v >= 0 && v <= 9999) {
      if (!state.preferences) state.preferences = {};
      state.preferences.dailyChatCap = v;
    }
  }
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

// 사용자 명시 2026-05-05: 토큰/달러 raw 수치 폐기 — 구독제 무드에 맞춰 상태 라벨 4단계로 추상화.
// Why: 4자리 소수점 달러 + token 수 노출은 "정해진 금액으로 마음껏" 이라는 구독제 핵심 감각을 깬다.
function _quotaStateLabel(pct) {
  if (pct < 50) return '이번 달 여유 충분 ✅';
  if (pct < 80) return '이번 달 적당히 사용 중';
  if (pct < 95) return '이번 달 거의 다 썼어';
  return '이번 달 한도 임박 — 잠깐만';
}

// 사용자 요청 2026-04-30 (Phase C): billing 동적 로드 — Settings 진입 시 호출.
// 사용자 명시 2026-05-05: in-flight dedup + 30s TTL cache. manual=true (🔄 button) 만 항상 fresh fetch.
// burst 호출 (init 시점 _acceptWelcomeGift / silent welcome / banner trigger 동시) 한 번에 묶음.
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
  const status = document.getElementById('billingStatus');
  if (!status) return;
  if (typeof session === 'undefined' || !session || !session.access_token) {
    status.textContent = '로그인 필요';
    return;
  }
  // Phase 1e: 게스트 사용자 — 가입 유도 카드 (수치/한도 노출 X, 데이터 안전 + E2EE 톤).
  if (state && state.isGuest) {
    status.innerHTML = `
      <div><b>🌱 게스트 모드</b></div>
      <div style="font-size:12px; color:var(--text-dim); margin-top:8px; line-height:1.7;">지금 데이터는 이 기기에만 있어 — 브라우저 정리되면 사라져.</div>
      <button class="btn-primary" onclick="showGuestConversionModal({reason:'manual'})" style="margin-top:12px; width:100%; padding:11px; font-size:13px; font-weight:600;">🔒 로그인하고 안전하게 이어가기</button>
      <div style="font-size:10.5px; color:var(--text-soft); margin-top:8px; line-height:1.6;">종단간 암호화로 영구 보관 — 너만 풀 수 있어 (나도 못 봐).</div>
    `;
    return;
  }
  // 사용자 명시 2026-04-30 (정정): admin 특혜 제거 — admin 도 일반 사용자처럼 월정액 흐름 표시.
  // 사용자 보고 2026-04-30: 🔄 새로고침 작동 X 버그 — JWT 1h 만료 시 401 → 인터셉터는 /api/chat 만 swap 이라 /api/usage 401 그대로. 자동 refresh + retry + 시각 피드백 추가.
  if (manual) status.textContent = '🔄 갱신 중...';
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
      status.textContent = `사용량 조회 실패 (${resp.status})`;
      return;
    }
    const data = await resp.json();
    const billing = data.billing || {};
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
    if (subActive && planMeta) {
      const usedPct = quotaUsd > 0 ? Math.min(100, Math.round((usedUsd / quotaUsd) * 100)) : 0;
      const isNearCap = usedPct >= 80;
      // 사용자 명시 2026-05-06: backend `cancel_at_period_end` true 면 갱신 해지 됨 — '{date}에 종료' 라벨로 대체.
      const cancelledRenewal = !!billing.cancel_at_period_end;
      const expiresLabel = cancelledRenewal ? `${subExpires}에 종료` : `${subExpires}까지`;
      html += `<div><b>구독</b>: ${planMeta.emoji} ${planMeta.label} <span style="color:var(--text-soft); font-size:11px;">— ${expiresLabel}</span></div>`;
      // early_light: 토큰 양 안 보이게 (체험 플랜은 수치 노출 X)
      if (planKey !== 'early_light') {
        html += `<div style="margin-top:10px; font-size:13px;">${_quotaStateLabel(usedPct)}</div>`;
        html += `<div style="margin-top:6px; height:6px; background:var(--surface); border-radius:3px; overflow:hidden;"><div style="height:100%; width:${usedPct}%; background:${isNearCap ? '#e89090' : 'var(--accent)'}; transition:width 0.3s;"></div></div>`;
        if (isNearCap && planKey !== 'premium') {
          html += `<button class="btn-secondary" onclick="openSubscribeModal()" style="margin-top:10px; width:100%; padding:9px; font-size:12px;">🌊 Premium 으로 늘리기</button>`;
        }
      }
      // 사용자 명시 2026-05-06: 다음 갱신 해지 = 작은 link 톤 (text-soft, 10.5px, 밑줄 X). 보고 싶을 때만 보이게.
      // early_light 는 자동 결제 X (만료 후 별도 구독) 라 버튼 노출 X.
      if (planKey !== 'early_light') {
        if (cancelledRenewal) {
          html += `<div style="margin-top:10px; font-size:10.5px; color:var(--text-soft); text-align:right;">✓ 다음 갱신 해지됨</div>`;
        } else {
          html += `<div style="margin-top:10px; text-align:right;"><a href="javascript:void(0)" onclick="cancelNextRenewal()" style="font-size:10.5px; color:var(--text-soft); text-decoration:none; opacity:0.65;">다음 갱신 해지</a></div>`;
        }
      }
    } else {
      html += `<div><b>구독</b>: 미가입 <span style="color:var(--text-soft); font-size:11px;">— 체험 종료. 계속 쓰려면 구독</span></div>`;
    }
    if (balance > 0) {
      html += `<div style="margin-top:6px;"><b>잔여 credit</b>: $${balance.toFixed(4)} (~${balanceKrw.toLocaleString()}원)</div>`;
    }
    // 사용자 명시 2026-05-05: 처음 한 달 무료 (얼리 플랜) 만료 표시 — 100만 토큰 표기 폐기.
    if (subActive && planKey === 'early_light' && subExpires) {
      const expiresAt = new Date(billing.subscription_expires_at);
      const remainingDays = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000));
      html += `<div style="font-size:11px;color:var(--text-soft);margin-top:6px;">✦ 얼리 무료 — ${remainingDays}일 후 만료 (자동 결제 X)</div>`;
    }
    status.innerHTML = html;
    // 사용자 명시 2026-05-05: _billingCacheTs stamp — 30s TTL + showBudgetExceededModal 캐시 재사용용.
    window._billingCache = billing;
    window._billingCacheTs = Date.now();
    // 캐시 채워졌으니 배너 큐 재시도 (sync tip 등)
    if (typeof _renderNextBanner === 'function') { try { _renderNextBanner(); } catch {} }
    // 사용자 명시 2026-05-05: 한 달 무료 만료 7일 전 알림 + 인박스 badge 갱신.
    if (typeof checkFreeTrialExpiry === 'function') { try { checkFreeTrialExpiry(); } catch {} }
    if (typeof refreshNotifInboxBadge === 'function') { try { refreshNotifInboxBadge(); } catch {} }
    // 사용자 명시 2026-04-30: 토스트 = manual button click 시만 (자동 호출 X — 자주 뜨면 부담)
    if (manual && typeof showToast === 'function') showToast('🔄 갱신됐어');
  } catch (e) {
    status.textContent = '조회 실패: ' + (e.message || e);
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

