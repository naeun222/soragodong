// ═══════════════════════════════════════════════════════════════
// 결제 — 사용자 명시 2026-04-30 ultrathink: 충전 plan 폐기 → 2-tier 월정액 only
// ═══════════════════════════════════════════════════════════════

// 사용자 명시 2026-05-02 ultrathink: 가격 조정 + early_light 신설 (서버 _lib/billing.ts 의 TIER_PLANS 와 동기 — 위변조 방지로 결제 검증은 서버에서 재확인).
// description: 정직 톤 — 정량 KRW 표기 X, 정성적 설명만. cap 자체는 서버 운영 용도.
const TIER_PLANS_CLIENT = {
  light:        { krw: 9900,  cap_usd: 5,  cap_krw: 7000,  label: 'Light',        tagline: '매일의 자기관찰', emoji: '🐚',
    description: '일반 대화 + 분석 풀로. 매일의 자기관찰에 충분.' },
  premium:      { krw: 25000, cap_usd: 13, cap_krw: 18000, label: 'Premium',      tagline: '깊게 자주', emoji: '🌊',
    description: '긴 대화 / 4단 분석 / 마법고동 큰 결정 / 주간·월간 회고 풀 활용. Opus 깊은 대화 30번/일.' },
  early_light:  { krw: 4900,  cap_usd: 4,  cap_krw: 5600,  label: 'Light (얼리)', tagline: '평생 절반 가격', emoji: '🐚',
    description: '출시 전에 함께해준 마음에 감사해서 절반 가격으로 평생 같이 가자.', requires_early_user: true }
};
// 사용자 명시 2026-05-02 ultrathink: light_pack 제거 — Premium 전용. Light/얼리는 Premium 전환 또는 다음 달 대기.
// V4 (사용자 명시 2026-05-04 ultrathink — v2 갱신): 추가팩 재설계 — 작은 단위 + 두 tier 다 가능. *24h 못 기다리는 사용자* trigger.
// 옛 5,000원 / +$4 (light) 와 7,000원 / +$5 (premium) 폐기.
const OVERAGE_PACKS_CLIENT = {
  light_pack:   { krw: 1500, usd: 1.0, label: 'Light 추가팩',   tier: 'light' },
  early_pack:   { krw: 1500, usd: 1.0, label: 'Light 추가팩',   tier: 'early_light' },
  premium_pack: { krw: 2500, usd: 1.5, label: 'Premium 추가팩', tier: 'premium' }
};
// V4 (사용자 명시 2026-05-04 ultrathink — v2): tier 별 일일 cap 비율 (월 cap × 비율 / 30 = 일일).
// Light /25 (마진 보호) — $5 × 1.2 / 30 = $0.20/일
// Premium /20 (여유, '마음껏 깊게' 약속) — $15 × 1.5 / 30 = $0.75/일
// Early /25 동일 (Light 와 동일 비율) — $4 × 1.2 / 30 = $0.16/일
const DAILY_CAP_RATIO = { light: 1.2, early_light: 1.2, premium: 1.5 };
function _getDailyCapUsd(plan) {
  const tier = TIER_PLANS_CLIENT[plan];
  if (!tier) return 0;
  const ratio = DAILY_CAP_RATIO[plan] || 1.2;
  return (tier.cap_usd || 0) * ratio / 30;
}
// Light → Premium 정가 결제 (사용자 명시 2026-05-02: 차액 결제 폐기 — 새 사이클 시작)
const TIER_UPGRADE_KRW = TIER_PLANS_CLIENT.premium.krw; // 25,000
// 옛 차액 변수 호환 (점진 정리 — sub_modal 의 일부 코드가 import)
const TIER_UPGRADE_DIFF_KRW = TIER_UPGRADE_KRW;

// 카톡 오픈채팅 (피드백·문의 채널, 익명 OK)
const KAKAO_OPEN_CHAT = 'https://open.kakao.com/o/sUP7kIsi';

// 사용자 명시 2026-04-30 ultrathink: 포트원 미설정 단계 — 토스 수동 송금 으로 구독 활성화.
// verify-toss-subscribe 의 RECEIVER_ACCOUNT 와 동기 — 변경 시 둘 다.
const TOSS_ACCOUNT = {
  bank: '우리은행',
  number: '1002-963-062525',
  number_raw: '1002963062525',  // deep link 용 (하이픈 X)
  holder: '김나은',
  bankCode: '20'
};

// 사용자별 송금 메모 코드 (unique, 8자) — auth_user_id 기반
function _generateUserMemoCode() {
  const uid = (typeof authUserId === 'string' && authUserId) ? authUserId : '';
  const short = uid.replace(/-/g, '').slice(0, 8).toUpperCase();
  return 'SO-' + short;
}

// 사업자 정보 (전자상거래법 의무 노출). 사업자등록증·통신판매업 신고증 발급 후 빈 문자열만 채우면 자동 표시.
// 주소·연락처는 자택이라 민감 — settings UI 노출 X, 약관·환불·개인정보 마크다운에만 풀 명시 (전상법 §13 의무 자리). 사용자 명시 2026-04-30 ultrathink.
const BUSINESS_INFO = {
  name: '나은 랩(Lab)',                       // 상호
  representative: '김나은',                // 대표자
  business_no: '261-21-02592',             // 사업자등록번호 (2026-04-30, 일반과세)
  ecommerce_no: '',                        // 통신판매업 신고번호 — 발급 후 채움
  address: '서울특별시 동작구 상도로47아길 14',  // 자택 — UI 노출 X, source of truth 만
  phone: '',                               // 연락처 (선택, 070 가상번호 발급 시)
  email: 'soragodongapp@gmail.com',        // 사업용 이메일 (CPO 공시용)
  cpo: '김나은'                             // 개인정보 보호책임자
};

// 사용자 명시 2026-04-30 ultrathink: 충전 plan UI/handler (CHARGE_PLANS / openChargeModal / proceedCharge / showTossChargeModal / openTossApp / verifyTossReceipt / closeTossChargeModal) 일괄 폐기.
// _generateUserMemoCode + TOSS_ACCOUNT 은 신 월정액 송금 흐름에 그대로 재활용 (legacy 폐기 X).
// 새 흐름: 무료 3,000원 → 소진 후 Light (8,900원) 또는 Premium (25,000원) 월정액. 한도 도달 시 추가팩 (Light 5K = +$4 / Premium 7K = +$5) 또는 tier 업그레이드 (16,100원).
// 기존 charge 잔액 (credit_balance_usd > 0) 사용자: legacy 호환 — 그대로 차감, 0 도달 후 구독 안내. admin pending charges 도구도 잔존 미해결 건만 처리.

// ─── 피드백 / 문의 (오픈채팅 + 인앱 메시지) ───
function openFeedbackKakao_legacy_anchor() { /* anchor — 아래 함수가 곧 시작 */ }
// 사용자 요청 2026-04-30: 피드백·문의 — 카톡 오픈채팅 + 인앱 메시지.
function openFeedbackKakao() {
  if (!KAKAO_OPEN_CHAT || KAKAO_OPEN_CHAT.includes('[TBD')) {
    alert('카톡 오픈채팅 링크가 아직 들어가 있지 않아요. 잠시 후 다시 시도해주세요.');
    return;
  }
  window.open(KAKAO_OPEN_CHAT, '_blank');
}

function openFeedbackInApp() {
  if (document.getElementById('feedbackOverlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay show';
  overlay.id = 'feedbackOverlay';
  overlay.style.zIndex = '10001';
  overlay.innerHTML = `
    <div class="input-modal" style="max-width:380px; padding:24px;">
      <div style="font-size:16px; font-weight:700; color:var(--text); margin-bottom:8px;">✉️ 메세지 보내기</div>
      <div style="font-size:11px; color:var(--text-dim); line-height:1.7; margin-bottom:14px;">
        뭐든 편하게 적어줘! 버그·아이디어·잡담 다 OK 🐚<br>
        <span style="color:var(--text-soft);">답변 시 이 앱에서 바로 받아볼 수 있어 (설정 → 받은 답변).</span>
      </div>
      <textarea id="feedbackMessageInput" rows="6" placeholder="자유롭게 적어줘..." maxlength="2000" style="width:100%; font-size:12px; padding:10px; resize:vertical;"></textarea>
      <div style="font-size:10px; color:var(--text-soft); margin-top:6px;">최대 2000자</div>
      <div id="feedbackStatus" style="font-size:11px; margin-top:10px; min-height:14px;"></div>
      <div style="display:flex; gap:8px; margin-top:14px;">
        <button class="btn-primary" onclick="submitFeedback()" style="flex:1;">보내기 ✦</button>
        <button class="btn-secondary" onclick="closeFeedbackModal()" style="flex:1;">나중에</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('feedbackMessageInput')?.focus(), 100);
}

function closeFeedbackModal() {
  const overlay = document.getElementById('feedbackOverlay');
  if (overlay) overlay.remove();
}

async function submitFeedback() {
  const ta = document.getElementById('feedbackMessageInput');
  const status = document.getElementById('feedbackStatus');
  if (!ta || !status) return;
  const msg = ta.value.trim();
  if (msg.length < 5) {
    status.textContent = '5자 이상 적어주세요';
    status.style.color = '#e89090';
    return;
  }
  status.textContent = '보내는 중...';
  status.style.color = 'var(--text-soft)';
  try {
    const resp = await _authedFetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
      body: JSON.stringify({ message: msg })
    });
    if (resp.ok) {
      status.textContent = '✓ 잘 받았어! 고마워 🐚';
      status.style.color = '#9ed4a0';
      setTimeout(() => closeFeedbackModal(), 1500);
    } else {
      status.textContent = '오류 났어 😢 카톡으로 보내줄래?';
      status.style.color = '#e89090';
    }
  } catch (e) {
    status.textContent = '오류: ' + (e.message || e);
    status.style.color = '#e89090';
  }
}

// 사용자 요청 2026-04-30: 인앱 피드백 inbox — RLS 직접 SELECT (본인 row만).
async function fetchMyFeedback() {
  if (!authUserId || !session?.access_token) return [];
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_feedback?user_id=eq.${authUserId}&select=*&order=created_at.desc&limit=100`,
      { headers: authHeaders() }
    );
    if (!resp.ok) return [];
    return await resp.json() || [];
  } catch (e) { console.warn('fetchMyFeedback:', e); return []; }
}

function _getReadFeedbackIds() {
  try {
    const raw = localStorage.getItem('soragodong_v4_feedback_read');
    return new Set(JSON.parse(raw || '[]'));
  } catch { return new Set(); }
}

function _markFeedbackRead(ids) {
  try {
    const set = _getReadFeedbackIds();
    for (const id of ids) set.add(id);
    localStorage.setItem('soragodong_v4_feedback_read', JSON.stringify([...set]));
  } catch {}
}

// 사용자 명시 2026-05-02 ultrathink: 알림 인박스 — myFeedbackInbox 패턴 일반화.
// state.notifications array 기반 (client-only). 환영 만료 7일 전 / 결제 영수증 / 카카오 마이그레이션 안내 등 미래 자리.
// Phase 3 (포트원 + 알림톡) 도입 시 server endpoint 추가.
function _addNotification({ type, title, body, persistent }) {
  state.notifications = state.notifications || [];
  // 동일 type 이미 unread 있으면 skip (중복 방지)
  const existing = state.notifications.find(n => n.type === type && !n.readAt);
  if (existing) return existing;
  const notif = {
    id: 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    type, title, body,
    persistent: !!persistent,
    createdAt: new Date().toISOString(),
    readAt: null
  };
  state.notifications.unshift(notif);
  // cap 50
  if (state.notifications.length > 50) state.notifications = state.notifications.slice(0, 50);
  saveState();
  refreshNotifInboxBadge();
  return notif;
}

function refreshNotifInboxBadge() {
  const badge = document.getElementById('notifInboxBadge');
  if (!badge) return;
  const unread = (state.notifications || []).filter(n => !n.readAt).length;
  if (unread > 0) {
    badge.style.display = 'inline-block';
    badge.textContent = unread > 9 ? '9+' : String(unread);
  } else {
    badge.style.display = 'none';
  }
}

function openNotifInbox() {
  if (document.getElementById('notifInboxOverlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay show';
  overlay.id = 'notifInboxOverlay';
  overlay.style.zIndex = '9999';
  const items = state.notifications || [];
  let body;
  if (items.length === 0) {
    body = `<div style="padding:30px 20px; text-align:center; color:var(--text-soft); font-size:13px;">아직 알림 없어 ✦</div>`;
  } else {
    body = items.map(n => {
      const isUnread = !n.readAt;
      const accentColor = n.type === 'welcome_expiry_warning' ? '#e8c590' : 'var(--accent)';
      const date = new Date(n.createdAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      return `
        <div class="notif-item" data-notif-id="${n.id}" onclick="_markNotifRead('${n.id}')" style="padding:12px 14px; border-left:3px solid ${isUnread ? accentColor : 'transparent'}; background:${isUnread ? 'rgba(212,167,106,0.04)' : 'transparent'}; cursor:pointer; border-bottom:1px solid var(--border);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <div style="font-size:13px; font-weight:${isUnread ? '600' : '500'}; color:var(--text);">${escapeHtml(n.title || '')}</div>
            <div style="font-size:10px; color:var(--text-soft);">${date}</div>
          </div>
          <div style="font-size:11.5px; color:var(--text-dim); line-height:1.6;">${n.body || ''}</div>
        </div>
      `;
    }).join('');
  }
  overlay.innerHTML = `
    <div class="input-modal" style="max-width:440px; max-height:80vh; overflow-y:auto; padding:0;">
      <div style="padding:16px 20px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
        <div style="font-size:15px; font-weight:700; color:var(--text);">🔔 알림함</div>
        <button class="btn-icon" onclick="document.getElementById('notifInboxOverlay').remove()" style="background:none; border:none; font-size:18px; color:var(--text-soft); cursor:pointer;">✕</button>
      </div>
      <div>${body}</div>
      ${items.length > 0 ? '<div style="padding:10px 16px; border-top:1px solid var(--border); text-align:center;"><button class="btn-secondary" onclick="_markAllNotifRead()" style="font-size:11px;">모두 읽음 처리</button></div>' : ''}
    </div>
  `;
  document.body.appendChild(overlay);
}

function _markNotifRead(notifId) {
  const notif = (state.notifications || []).find(n => n.id === notifId);
  if (!notif || notif.readAt) return;
  notif.readAt = new Date().toISOString();
  saveState();
  refreshNotifInboxBadge();
  // 모달 안 표시 갱신 — 간단하게 close + reopen
  const overlay = document.getElementById('notifInboxOverlay');
  if (overlay) {
    overlay.remove();
    openNotifInbox();
  }
}

function _markAllNotifRead() {
  const now = new Date().toISOString();
  (state.notifications || []).forEach(n => { if (!n.readAt) n.readAt = now; });
  saveState();
  refreshNotifInboxBadge();
  const overlay = document.getElementById('notifInboxOverlay');
  if (overlay) {
    overlay.remove();
    openNotifInbox();
  }
}

// 사용자 명시 2026-05-02 ultrathink: 환영 토큰 만료 7일 전 알림 자동 적용됨 (init 흐름 또는 refreshBillingStatus 후).
// 부드러운 톤 — "사라져" 같은 다급한 워딩 X.
function checkWelcomeBonusExpiry() {
  const billing = window._billingCache;
  if (!billing) return;
  const expires = billing.welcome_bonus_expires_at;
  const remaining = Number(billing.welcome_bonus_tokens_remaining || 0);
  if (!expires || remaining <= 0) return;
  const expiresAt = new Date(expires).getTime();
  const now = Date.now();
  const remainingDays = (expiresAt - now) / 86400000;
  if (remainingDays > 7 || remainingDays < 0) return;
  // 7일 이내 + 만료 안 함 — 알림 자리잡음 (중복 차단은 _addNotification 안에서)
  const remainingDisplay = remaining >= 10000 ? Math.round(remaining / 10000) + '만' : remaining.toLocaleString();
  _addNotification({
    type: 'welcome_expiry_warning',
    title: '환영 선물 만료가 가까워',
    body: `한 달 동안 유효해서 알려드려.<br>남은 토큰: 약 <b>${remainingDisplay}</b>`,
    persistent: true
  });
}

// 미읽음 답변 수 — Settings 진입 / 주기 갱신
async function refreshFeedbackUnreadBadge() {
  const badge = document.getElementById('myFeedbackUnreadBadge');
  if (!badge) return;
  try {
    const list = await fetchMyFeedback();
    const read = _getReadFeedbackIds();
    const unread = list.filter(f => f.admin_reply && !read.has(f.id));
    if (unread.length > 0) {
      badge.style.display = 'inline-block';
      badge.textContent = String(unread.length);
    } else {
      badge.style.display = 'none';
    }
  } catch {}
}

async function openMyFeedbackInbox() {
  if (document.getElementById('myFeedbackInboxOverlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay show';
  overlay.id = 'myFeedbackInboxOverlay';
  overlay.style.zIndex = '10001';
  overlay.innerHTML = `
    <div class="input-modal" style="max-width:480px; max-height:85vh; overflow-y:auto; padding:24px;">
      <div style="font-size:16px; font-weight:700; color:var(--text); margin-bottom:8px;">📬 받은 답변</div>
      <div id="myFeedbackInboxBody" style="font-size:12px; color:var(--text-dim); line-height:1.7;">불러오는 중...</div>
      <div style="display:flex; gap:8px; margin-top:14px;">
        <button class="btn-secondary" onclick="closeMyFeedbackInbox()" style="flex:1;">닫기</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const list = await fetchMyFeedback();
  const body = document.getElementById('myFeedbackInboxBody');
  if (!body) return;
  if (list.length === 0) {
    body.innerHTML = '<span style="color:var(--text-soft);">아직 보낸 메시지가 없어 🐚</span>';
    return;
  }
  body.innerHTML = list.map(f => {
    const dt = new Date(f.created_at).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const replyHtml = f.admin_reply
      ? `<div style="margin-top:10px; padding:10px 12px; background:rgba(143,200,143,0.08); border-left:3px solid rgba(143,200,143,0.40); border-radius:6px;">
           <div style="font-size:10px; color:#9ed4a0; font-weight:600; margin-bottom:4px;">🐚 소라고동 답변 · ${f.replied_at ? new Date(f.replied_at).toLocaleString('ko-KR', { month: 'long', day: 'numeric' }) : ''}</div>
           <div style="white-space:pre-wrap; color:var(--text);">${escapeHtml(f.admin_reply)}</div>
         </div>`
      : `<div style="margin-top:10px; font-size:10.5px; color:var(--text-soft);">⏳ 아직 답변 안 왔음</div>`;
    return `
      <div style="margin-bottom:14px; padding-bottom:14px; border-bottom:1px solid rgba(255,255,255,0.04);">
        <div style="font-size:10px; color:var(--text-soft); margin-bottom:4px;">${dt}</div>
        <div style="white-space:pre-wrap; color:var(--text);">${escapeHtml(f.message)}</div>
        ${replyHtml}
      </div>
    `;
  }).join('');
  // mark all replied as read
  const replied = list.filter(f => f.admin_reply).map(f => f.id);
  if (replied.length > 0) {
    _markFeedbackRead(replied);
    refreshFeedbackUnreadBadge();
  }
}

function closeMyFeedbackInbox() {
  const overlay = document.getElementById('myFeedbackInboxOverlay');
  if (overlay) overlay.remove();
}

// 사용자 요청 2026-04-30: admin 피드백 답변 inbox — ADMIN_USER_ID env 적용된 사용자만 동작 (jade6679@naver.com).
async function refreshAdminFeedbackButton() {
  const btn = document.getElementById('adminFeedbackBtn');
  if (!btn) return;
  try {
    const resp = await _authedFetch('/api/admin/feedback-list?status=open', {
      headers: { 'Authorization': 'Bearer ' + (session?.access_token || '') }
    });
    if (resp.status === 403) { btn.style.display = 'none'; return; }
    if (!resp.ok) { btn.style.display = 'none'; return; }
    const data = await resp.json();
    const openCount = (data.feedback || []).length;
    btn.style.display = 'block';
    btn.innerHTML = `🛠 관리자 — 피드백 답변${openCount > 0 ? ` <span style="margin-left:6px; background:#e89090; color:#fff; padding:1px 6px; border-radius:8px; font-size:10px; font-weight:700;">${openCount}</span>` : ''}`;
  } catch { btn.style.display = 'none'; }
}

async function openAdminFeedbackInbox() {
  if (document.getElementById('adminFeedbackOverlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay show';
  overlay.id = 'adminFeedbackOverlay';
  overlay.style.zIndex = '10001';
  overlay.innerHTML = `
    <div class="input-modal" style="max-width:560px; max-height:88vh; overflow-y:auto; padding:24px;">
      <div style="font-size:16px; font-weight:700; color:var(--text); margin-bottom:8px;">🛠 관리자 — 피드백 답변</div>
      <div style="margin-bottom:12px; display:flex; gap:6px;">
        <button class="btn-secondary" onclick="adminFeedbackLoad('open')" style="flex:1; font-size:11px; padding:6px 8px;">미답변</button>
        <button class="btn-secondary" onclick="adminFeedbackLoad('replied')" style="flex:1; font-size:11px; padding:6px 8px;">답변 완료</button>
        <button class="btn-secondary" onclick="adminFeedbackLoad('all')" style="flex:1; font-size:11px; padding:6px 8px;">전체</button>
      </div>
      <div id="adminFeedbackBody" style="font-size:12px; color:var(--text-dim); line-height:1.7;">불러오는 중...</div>
      <div style="display:flex; gap:8px; margin-top:14px;">
        <button class="btn-secondary" onclick="closeAdminFeedbackInbox()" style="flex:1;">닫기</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  await adminFeedbackLoad('open');
}

function closeAdminFeedbackInbox() {
  const overlay = document.getElementById('adminFeedbackOverlay');
  if (overlay) overlay.remove();
}

async function adminFeedbackLoad(filter) {
  const body = document.getElementById('adminFeedbackBody');
  if (!body) return;
  body.innerHTML = '<span style="color:var(--text-soft);">불러오는 중...</span>';
  try {
    const resp = await _authedFetch('/api/admin/feedback-list?status=' + encodeURIComponent(filter), {
      headers: { 'Authorization': 'Bearer ' + (session?.access_token || '') }
    });
    if (!resp.ok) {
      // 사용자 보고 2026-04-30 ultrathink-2: 'table 없음' 패턴이면 친화적 셋업 카드 + 복사 가능 SQL.
      let errData = null;
      try { errData = await resp.json(); } catch {}
      const hintTxt = (errData && errData.hint) || '';
      const upBody  = (errData && errData.upstream_body) || '';
      const tableMissing = /0003_feedback\.sql|PGRST205|relation .* does not exist|Could not find the table/i.test(hintTxt + '\n' + upBody);
      if (tableMissing) {
        body.innerHTML = `
          <div style="padding:16px; background:rgba(212,167,106,0.08); border:1px solid rgba(212,167,106,0.40); border-radius:10px;">
            <div style="font-size:14px; font-weight:600; color:var(--accent); margin-bottom:8px;">🛠 셋업 미완 — soragodong_feedback table 없음</div>
            <div style="font-size:11px; color:var(--text-dim); line-height:1.7; margin-bottom:12px;">
              피드백 답변 기능을 쓰려면 Supabase에서 <b>0003_feedback.sql</b>을 실행해야 해.<br>
              <span style="color:var(--text-soft);">(앱 사용자 입장에선 이 기능 안 보임 — admin 전용)</span>
            </div>
            <div style="font-size:11px; color:var(--text-dim); line-height:1.85; margin-bottom:12px;">
              <b>📋 단계</b>:<br>
              1. Supabase Dashboard 열기 (<a href="https://supabase.com/dashboard" target="_blank" style="color:var(--accent);">supabase.com/dashboard</a>) → 프로젝트 선택<br>
              2. 좌측 <b>SQL Editor</b> → <b>+ New query</b><br>
              3. 아래 SQL 복사해서 붙여넣기 → <b>Run</b><br>
              4. 새로고침 후 다시 진입
            </div>
            <textarea id="adminFeedbackSqlBox" readonly style="width:100%; height:160px; font-family:monospace; font-size:10px; padding:10px; background:var(--surface); border:1px solid var(--border); border-radius:8px; color:var(--text); white-space:pre; overflow:auto;">CREATE TABLE IF NOT EXISTS soragodong_feedback (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  admin_reply TEXT,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON soragodong_feedback(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON soragodong_feedback(user_id, created_at DESC);
ALTER TABLE soragodong_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own feedback" ON soragodong_feedback;
CREATE POLICY "users read own feedback"
  ON soragodong_feedback FOR SELECT
  USING (auth.uid() = user_id);</textarea>
            <div style="display:flex; gap:6px; margin-top:8px;">
              <button class="btn-primary" onclick="(function(){var t=document.getElementById('adminFeedbackSqlBox');t.select();navigator.clipboard.writeText(t.value).then(()=>showToast('📋 SQL 복사됨 — Supabase Dashboard에 붙여넣어'));})()" style="flex:1; font-size:11px;">📋 SQL 복사</button>
              <button class="btn-secondary" onclick="adminFeedbackLoad('open')" style="flex:1; font-size:11px;">↻ 다시 시도</button>
            </div>
          </div>`;
        return;
      }
      // 그 외 에러는 server diagnostic 그대로 노출 (a35d8cd 흐름 유지)
      let serverMsg = '';
      if (errData) {
        serverMsg = errData.error || '';
        if (errData.upstream_status) serverMsg += ` (upstream ${errData.upstream_status})`;
        if (errData.hint) serverMsg += ` — ${errData.hint}`;
        if (errData.upstream_body) serverMsg += `\n${(errData.upstream_body || '').slice(0, 200)}`;
      }
      body.innerHTML = `<div style="color:#e89090; white-space:pre-wrap; font-size:11px; padding:10px; background:rgba(220,80,80,0.05); border:1px solid rgba(220,80,80,0.30); border-radius:8px;">실패 (${resp.status})${serverMsg ? '\n\n' + escapeHtml(serverMsg) : ''}</div>`;
      return;
    }
    const data = await resp.json();
    const list = data.feedback || [];
    if (list.length === 0) {
      body.innerHTML = '<span style="color:var(--text-soft);">표시할 피드백 X</span>';
      return;
    }
    body.innerHTML = list.map(f => {
      const dt = new Date(f.created_at).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      // 사용자 명시 2026-05-02: '[🐛 자동 오류 보고]' prefix 자동 식별 → 빨간 border 강조 + 🐛 라벨.
      const isErrorReport = (f.message || '').startsWith('[🐛 자동 오류 보고]');
      const replyHtml = f.admin_reply
        ? `<div style="margin-top:8px; padding:8px 10px; background:rgba(143,200,143,0.08); border-left:3px solid rgba(143,200,143,0.40); border-radius:6px;">
             <div style="font-size:10px; color:#9ed4a0; font-weight:600; margin-bottom:4px;">답변됨 · ${f.replied_at ? new Date(f.replied_at).toLocaleString('ko-KR') : ''}</div>
             <div style="white-space:pre-wrap; color:var(--text);">${escapeHtml(f.admin_reply)}</div>
           </div>`
        : `<div style="margin-top:8px;">
             <textarea id="adminReplyInput_${f.id}" rows="3" placeholder="답변 작성..." style="width:100%; font-size:12px; padding:8px;"></textarea>
             <button class="btn-primary" onclick="adminFeedbackSubmitReply(${f.id})" style="margin-top:6px; font-size:11px; padding:6px 12px;">답변 보내기</button>
           </div>`;
      const containerStyle = isErrorReport
        ? 'margin-bottom:14px; padding:12px; background:rgba(220,80,80,0.05); border:1px solid rgba(232,163,163,0.40); border-left:3px solid #e8a3a3; border-radius:8px;'
        : 'margin-bottom:14px; padding:12px; background:var(--surface); border-radius:8px;';
      const errorTag = isErrorReport
        ? `<span style="display:inline-block; padding:1px 7px; background:rgba(232,163,163,0.15); color:#e8a3a3; border-radius:6px; font-size:9.5px; font-weight:700; letter-spacing:0.04em; margin-right:6px;">🐛 자동 오류</span>`
        : '';
      return `
        <div style="${containerStyle}">
          <div style="font-size:10px; color:var(--text-soft); margin-bottom:4px;">
            ${errorTag}${dt} · ${escapeHtml(f.user_email || '익명')} · #${f.id}
          </div>
          <div style="white-space:pre-wrap; color:var(--text); margin-bottom:6px; ${isErrorReport ? 'font-family:monospace; font-size:11.5px; max-height:240px; overflow-y:auto;' : ''}">${escapeHtml(f.message)}</div>
          ${replyHtml}
        </div>
      `;
    }).join('');
  } catch (e) {
    body.innerHTML = '<span style="color:#e89090;">예외: ' + (e.message || e) + '</span>';
  }
}

async function adminFeedbackSubmitReply(feedbackId) {
  const ta = document.getElementById('adminReplyInput_' + feedbackId);
  if (!ta) return;
  const reply = ta.value.trim();
  if (!reply) { showToast('답변 내용 없음'); return; }
  try {
    const resp = await _authedFetch('/api/admin/feedback-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
      body: JSON.stringify({ feedback_id: feedbackId, reply })
    });
    if (resp.ok) {
      showToast('✓ 답변 완료');
      adminFeedbackLoad('open');
      refreshAdminFeedbackButton();
    } else {
      const t = await resp.text();
      alert('실패: ' + t.slice(0, 200));
    }
  } catch (e) {
    alert('예외: ' + (e.message || e));
  }
}

// 사용자 명시 2026-04-30 ultrathink: admin 잔액 정정 — 이전 누적 잔액 fix 용
async function adminResetBalance() {
  if (typeof _isAdmin === 'function' && !_isAdmin()) {
    showToast('admin 권한 필요');
    return;
  }
  if (!session || !session.access_token) {
    showToast('로그인 필요');
    return;
  }
  const newBalanceStr = prompt('정정할 잔액 (USD, 0~100):\n예) 0 = 비우기 / 2.14 = 무료 토큰 3,000원', '2.14');
  if (newBalanceStr === null) return;
  const newBalance = parseFloat(newBalanceStr);
  if (isNaN(newBalance) || newBalance < 0 || newBalance > 100) {
    alert('잘못된 값 — 0 ~ 100 USD 범위');
    return;
  }
  const resetIdempotency = confirm('idempotency 기록도 reset?\n\nYes = 과거 결제 다시 처리 가능 (위험)\nNo = 잔액만 정정 (권장)');
  const _origFetch = window._anthropicOrigFetch || window.fetch;
  try {
    const resp = await _authedFetch('/api/admin/reset-balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        new_balance_usd: newBalance,
        reset_idempotency: resetIdempotency
      })
    });
    const data = await resp.json();
    if (!resp.ok) {
      alert('실패: ' + (data.error || resp.status));
      return;
    }
    const msg = `✦ 잔액 $${data.old_balance_usd} → $${data.new_balance_usd}` +
                (data.idempotency_deleted ? ` (idempotency ${data.idempotency_deleted}개 삭제)` : '');
    showToast(msg);
    if (typeof refreshBillingStatus === 'function') refreshBillingStatus(true);
  } catch (e) {
    alert('에러: ' + (e.message || e));
  }
}

async function adminLoadPendingCharges() {
  const container = document.getElementById('adminPendingList');
  if (!container) return;
  container.innerHTML = '<span style="color:var(--text-soft);">불러오는 중...</span>';
  try {
    const resp = await _authedFetch('/api/admin/pending-charges', {
      headers: { 'Authorization': 'Bearer ' + (session?.access_token || '') }
    });
    if (resp.status === 403) {
      container.innerHTML = '<span style="color:var(--text-soft);">관리자 권한 X (Cloudflare env에 ADMIN_USER_ID 포함되어 있어야 함)</span>';
      return;
    }
    if (!resp.ok) {
      container.innerHTML = `<span style="color:#e89090;">실패 (${resp.status})</span>`;
      return;
    }
    const data = await resp.json();
    const pending = data.pending || [];
    if (pending.length === 0) {
      container.innerHTML = '<span style="color:var(--text-soft);">대기 중인 송금 X</span>';
      return;
    }
    let html = '<div style="display:flex; flex-direction:column; gap:6px;">';
    pending.forEach(p => {
      const at = new Date(p.created_at).toLocaleString('ko-KR');
      html += `
        <div style="padding:8px; background:var(--surface); border-radius:6px; line-height:1.6;">
          <div><b>${p.amount_krw.toLocaleString()}원</b> — ${p.user_email || '[email X]'}</div>
          <div style="font-size:10px; color:var(--text-soft);">메모: <code>${p.portone_merchant_uid}</code> · ${at}</div>
          <div style="display:flex; gap:4px; margin-top:6px;">
            <button class="btn-secondary" onclick="adminConfirm(${p.id})" style="font-size:11px; padding:4px 8px; background:rgba(143,200,143,0.20); border-color:rgba(143,200,143,0.40); color:#9ed4a0;">✓ 입금 확인</button>
            <button class="btn-secondary" onclick="adminRevoke(${p.id})" style="font-size:11px; padding:4px 8px; background:rgba(220,80,80,0.15); border-color:rgba(220,80,80,0.40); color:#e89090;">✗ 환수</button>
          </div>
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<span style="color:#e89090;">예외: ${e.message || e}</span>`;
  }
}

async function adminConfirm(paymentId) {
  if (!confirm('입금 확인하셨나요? status를 paid로 변경합니다.')) return;
  try {
    const resp = await _authedFetch('/api/admin/confirm-charge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
      body: JSON.stringify({ payment_id: paymentId })
    });
    if (resp.ok) {
      showToast('✓ 입금 확인 완료');
      adminLoadPendingCharges();
    } else {
      const r = await resp.json();
      alert('실패: ' + (r.error || resp.status));
    }
  } catch (e) { alert('예외: ' + (e.message || e)); }
}

async function adminRevoke(paymentId) {
  if (!confirm('미입금 또는 거짓 송금 — 잔액 환수 + status cancelled 처리합니다. 정말?')) return;
  try {
    const resp = await fetch('/api/admin/revoke-charge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
      body: JSON.stringify({ payment_id: paymentId, ban_user: false })
    });
    if (resp.ok) {
      showToast('✗ 환수 완료');
      adminLoadPendingCharges();
    } else {
      const r = await resp.json();
      alert('실패: ' + (r.error || resp.status));
    }
  } catch (e) { alert('예외: ' + (e.message || e)); }
}

// 사용자 명시 2026-04-30: confirmTossSent 폐기 — manual-charge endpoint 410 Gone. 영수증 캡처 (verify-toss-receipt) 만 사용.

// ─── admin: 사용량 분석 dashboard (사용자 명시 2026-05-02 ultrathink) ───
// soragodong_usage 테이블 집계 → endpoint / model / 일자 / 사용자 별 비용 분포.
// 절감 우선순위 결정 + Phase 적용 후 효과 검증 도구.
async function openAdminUsageDashboard() {
  if (!_isAdmin()) { showToast('관리자 전용'); return; }
  if (document.getElementById('adminUsageOverlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay show';
  overlay.id = 'adminUsageOverlay';
  overlay.style.zIndex = '10001';
  overlay.innerHTML = `
    <div class="input-modal" style="max-width:680px; max-height:88vh; overflow-y:auto; padding:24px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
        <div style="font-size:16px; font-weight:700; color:var(--text);">📊 사용량 분석</div>
        <button onclick="closeAdminUsageDashboard()" style="background:transparent; border:none; font-size:20px; color:var(--text-soft); cursor:pointer;">✕</button>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px; align-items:center;">
        <label style="font-size:12px; color:var(--text-soft);">기간:</label>
        <select id="adminUsageDays" onchange="_loadUsageSummary()" style="padding:4px 8px; font-size:12px;">
          <option value="7" selected>최근 7일</option>
          <option value="30">최근 30일</option>
          <option value="90">최근 90일</option>
        </select>
        <label style="font-size:12px; color:var(--text-soft); margin-left:8px;">분류:</label>
        <select id="adminUsageGroupBy" onchange="_loadUsageSummary()" style="padding:4px 8px; font-size:12px;">
          <option value="endpoint" selected>endpoint</option>
          <option value="model">model</option>
          <option value="day">일자</option>
          <option value="user">사용자</option>
        </select>
      </div>
      <div id="adminUsageContent" style="font-size:12px;">불러오는 중...</div>
    </div>
  `;
  document.body.appendChild(overlay);
  _loadUsageSummary();
}
function closeAdminUsageDashboard() {
  const o = document.getElementById('adminUsageOverlay');
  if (o) o.remove();
}
async function _loadUsageSummary() {
  const container = document.getElementById('adminUsageContent');
  if (!container) return;
  const days = parseInt(document.getElementById('adminUsageDays')?.value || '7', 10);
  const groupBy = document.getElementById('adminUsageGroupBy')?.value || 'endpoint';
  container.innerHTML = '<span style="color:var(--text-soft);">불러오는 중...</span>';
  try {
    const resp = await _authedFetch('/api/admin/usage-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
      body: JSON.stringify({ days, group_by: groupBy })
    });
    if (resp.status === 403) {
      container.innerHTML = '<span style="color:var(--text-soft);">관리자 권한 X (env ADMIN_USER_ID)</span>';
      return;
    }
    if (!resp.ok) {
      const r = await resp.json().catch(() => ({}));
      container.innerHTML = `<span style="color:#e89090;">실패 (${resp.status}) ${r.error || ''}</span>`;
      return;
    }
    const data = await resp.json();
    if (!data.ok) {
      container.innerHTML = `<span style="color:#e89090;">${escapeHtml(data.reason || '실패')}</span>`;
      return;
    }
    const rows = Array.isArray(data.rows) ? data.rows : [];
    const total = data.total || {};
    if (rows.length === 0) {
      container.innerHTML = '<span style="color:var(--text-soft);">데이터 X (해당 기간 호출 0)</span>';
      return;
    }
    const fmtKrw = (usd) => Math.round((Number(usd) || 0) * 1400).toLocaleString();
    const fmtTok = (n) => (Number(n) || 0).toLocaleString();
    const cacheRatio = (r) => {
      const inT = Number(r.input_tokens) || 0;
      const cacheT = Number(r.cache_read_tokens) || 0;
      if (inT + cacheT === 0) return '—';
      return Math.round((cacheT / (inT + cacheT)) * 100) + '%';
    };
    let html = `
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:11px;">
          <thead>
            <tr style="border-bottom:1px solid var(--border); text-align:left;">
              <th style="padding:6px 4px;">${groupBy === 'endpoint' ? 'endpoint' : groupBy === 'model' ? 'model' : groupBy === 'day' ? '일자' : '사용자 ID'}</th>
              <th style="padding:6px 4px; text-align:right;">호출</th>
              <th style="padding:6px 4px; text-align:right;">input</th>
              <th style="padding:6px 4px; text-align:right;">output</th>
              <th style="padding:6px 4px; text-align:right;">cache hit</th>
              <th style="padding:6px 4px; text-align:right;">USD</th>
              <th style="padding:6px 4px; text-align:right;">≈KRW</th>
            </tr>
          </thead>
          <tbody>
    `;
    rows.forEach(r => {
      const keyDisplay = groupBy === 'user' ? String(r.key || '').slice(0, 8) + '…' : escapeHtml(String(r.key || ''));
      html += `
        <tr style="border-bottom:1px solid var(--border-soft);">
          <td style="padding:5px 4px;"><code>${keyDisplay}</code></td>
          <td style="padding:5px 4px; text-align:right;">${fmtTok(r.calls)}</td>
          <td style="padding:5px 4px; text-align:right; color:var(--text-soft);">${fmtTok(r.input_tokens)}</td>
          <td style="padding:5px 4px; text-align:right; color:var(--text-soft);">${fmtTok(r.output_tokens)}</td>
          <td style="padding:5px 4px; text-align:right; color:#9ed4a0;">${cacheRatio(r)}</td>
          <td style="padding:5px 4px; text-align:right;">$${(Number(r.cost_usd) || 0).toFixed(4)}</td>
          <td style="padding:5px 4px; text-align:right;"><b>${fmtKrw(r.cost_usd)}</b>원</td>
        </tr>
      `;
    });
    html += `
          </tbody>
          <tfoot>
            <tr style="border-top:2px solid var(--border); font-weight:600;">
              <td style="padding:8px 4px;">합계</td>
              <td style="padding:8px 4px; text-align:right;">${fmtTok(total.calls)}</td>
              <td style="padding:8px 4px; text-align:right;">${fmtTok(total.input_tokens)}</td>
              <td style="padding:8px 4px; text-align:right;">${fmtTok(total.output_tokens)}</td>
              <td style="padding:8px 4px; text-align:right; color:#9ed4a0;">${cacheRatio(total)}</td>
              <td style="padding:8px 4px; text-align:right;">$${(Number(total.cost_usd) || 0).toFixed(4)}</td>
              <td style="padding:8px 4px; text-align:right;">${fmtKrw(total.cost_usd)}원</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div style="margin-top:10px; font-size:10.5px; color:var(--text-soft);">
        cutoff: ${escapeHtml(data.cutoff || '?')} · KRW = USD × 1,400
      </div>
    `;
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<span style="color:#e89090;">예외: ${escapeHtml(String(e.message || e))}</span>`;
  }
}

// ─── 구독 모달 (사용자 명시 2026-05-02 ultrathink: 일반 / 얼리 분기) ───
// 일반: Light 9,900 + Premium 25,000
// 얼리 (early_user=true): ~~9,900~~ → 4,900 강조 + Premium 25,000
async function openSubscribeModal() {
  if (document.getElementById('subscribeModalOverlay')) return;
  // billing 갱신 (얼리 자격 확인용)
  if (typeof refreshBillingStatus === 'function') {
    try { await refreshBillingStatus(false); } catch {}
  }
  const isEarly = !!(window._billingCache && window._billingCache.early_user);
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
      <button class="btn-primary" onclick="proceedSubscribe('${key}')" style="width:100%; padding:11px;">${plan.label} 구독 (${plan.krw.toLocaleString()}원)</button>
    </div>
  `;
  // 사용자 명시 2026-05-02 ultrathink: 얼리 카드 — Light 9,900 strike-through + 4,900 강조 + "평생 이 가격" 메시지.
  const earlyCard = (plan) => `
    <div class="tier-card tier-early" style="padding:18px 16px; background:linear-gradient(135deg, rgba(126,200,227,0.10), rgba(126,200,227,0.03)); border:1.5px solid rgba(126,200,227,0.45); border-radius:14px; margin-bottom:10px;">
      <div style="font-size:9px; letter-spacing:0.18em; text-transform:uppercase; color:#7ec8e3; font-weight:700; margin-bottom:6px;">✨ 얼리 유저 — 평생</div>
      <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:4px;">
        <div style="font-size:18px; font-weight:700; color:var(--text);">${plan.emoji} ${plan.label}</div>
        <div style="display:flex; align-items:baseline; gap:8px;">
          <div style="font-size:13px; color:var(--text-soft); text-decoration:line-through; font-weight:500;">${TIER_PLANS_CLIENT.light.krw.toLocaleString()}원</div>
          <div style="font-size:18px; font-weight:700; color:#7ec8e3;">${plan.krw.toLocaleString()}원<span style="font-size:11px; color:var(--text-dim); font-weight:400;">/월</span></div>
        </div>
      </div>
      <div style="font-size:12px; color:var(--text-dim); margin-bottom:10px;">${plan.tagline}</div>
      <div style="font-size:11.5px; color:var(--text); line-height:1.7; padding:10px; background:rgba(0,0,0,0.18); border-radius:8px; margin-bottom:10px;">
        ${plan.description}
      </div>
      <button class="btn-primary" onclick="proceedSubscribe('early_light')" style="width:100%; padding:11px; background:#7ec8e3; color:#0a1418;">얼리 가격으로 구독 (${plan.krw.toLocaleString()}원)</button>
    </div>
  `;
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay show';
  overlay.id = 'subscribeModalOverlay';
  overlay.style.zIndex = '10000';
  overlay.innerHTML = `
    <div class="input-modal" style="max-width:420px; max-height:92vh; overflow-y:auto; padding:24px;">
      <div style="font-size:17px; font-weight:700; color:var(--text); margin-bottom:6px;">📅 구독</div>
      <div style="font-size:12px; color:var(--text-dim); line-height:1.6; margin-bottom:14px;">
        무료 토큰 끝나면 마음껏 깊게 쓸 수 있게. 자동 갱신 X — 다음 달 명시 결제.
      </div>
      ${minorWarning}
      ${isEarly ? earlyCard(TIER_PLANS_CLIENT.early_light) : tierCard('light', TIER_PLANS_CLIENT.light, false)}
      ${tierCard('premium', TIER_PLANS_CLIENT.premium, true)}
      <div style="font-size:10.5px; color:var(--text-soft); line-height:1.7; padding:10px; background:rgba(126,200,227,0.04); border-left:3px solid rgba(126,200,227,0.30); border-radius:4px;">
        💡 ${isEarly ? '얼리 유저는 평생 이 가격이야. 더 쓰고 싶으면 Premium 으로 가도 돼.' : '잘 모르겠으면 <b>Light</b> 부터. 더 쓰고 싶으면 Premium.'}<br>
        해지: [설정 → 구독] 환불 (잔여일 비례 — <a href="/refund" target="_blank" style="color:var(--accent);">정책</a>).
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

// 사용자 명시 2026-04-30: tier 인자 받음 ('light' | 'premium').
// 포트원 채널 키 미설정 = 베타 (토스 수동 송금 + AI vision 인증). 활성 시 카드 결제.
async function proceedSubscribe(tierKey) {
  const tier = TIER_PLANS_CLIENT[tierKey];
  if (!tier) { alert('잘못된 tier'); return; }

  // 포트원 미설정 = 토스 송금 fallback (한 달 구독, 자동 갱신 X)
  const channelKey = window.PORTONE_CHANNEL_KEY || '';
  if (!channelKey) {
    closeSubscribeModal();
    showTossSubscribeModal(tierKey);
    return;
  }

  // 포트원 활성 — 카드 결제 흐름
  if (typeof window.IMP === 'undefined') {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.iamport.kr/v1/iamport.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    }).catch(() => alert('포트원 SDK 로드 실패'));
  }
  if (typeof window.IMP === 'undefined') return;
  IMP.init(channelKey);

  const merchantUid = `sub_${tierKey}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  IMP.request_pay({
    pg: 'tosspayments', pay_method: 'card', merchant_uid: merchantUid,
    name: `소라고동 ${tier.label} 구독`,
    amount: tier.krw,
    buyer_email: session?.user?.email || ''
  }, async (rsp) => {
    if (!rsp.success) { alert('결제 실패: ' + (rsp.error_msg || '취소됨')); return; }
    try {
      const verifyResp = await fetch('/api/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
        body: JSON.stringify({ imp_uid: rsp.imp_uid, merchant_uid: merchantUid, plan: tierKey })
      });
      const result = await verifyResp.json();
      if (verifyResp.ok && result.ok) {
        showToast(`📅 ${tier.label} 구독 완료 (${tier.krw.toLocaleString()}원/월)`);
        closeSubscribeModal();
        if (typeof refreshBillingStatus === 'function') refreshBillingStatus();
      } else {
        alert('결제 검증 실패: ' + (result.error || '알 수 없음'));
      }
    } catch (e) {
      alert('백엔드 통신 실패: ' + (e.message || e));
    }
  });
}

// ─── 토스 송금 구독 모달 (사용자 명시 2026-04-30: 포트원 미설정 단계 fallback) ───
// 한 달 구독 — 자동 갱신 X. 다음 달 재구독 = 다시 송금 + 인증.
function showTossSubscribeModal(tierKey) {
  if (document.getElementById('tossSubscribeOverlay')) return;
  const tier = TIER_PLANS_CLIENT[tierKey];
  if (!tier) return;
  const memoCode = _generateUserMemoCode();
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay show';
  overlay.id = 'tossSubscribeOverlay';
  overlay.style.zIndex = '10001';
  overlay.innerHTML = `
    <div class="input-modal" style="max-width:400px; max-height:92vh; overflow-y:auto; padding:24px;">
      <div style="font-size:16px; font-weight:700; color:var(--text); margin-bottom:8px;">${tier.emoji} ${tier.label} 구독 — 한 달</div>
      <div style="font-size:11px; color:var(--text-dim); line-height:1.7; margin-bottom:14px;">
        토스 앱으로 보내고, 영수증 한 장 올려줘. 내가 확인하고 한 달 활성화해줄게 ✦<br>
        <strong style="color:var(--accent);">자동 갱신 X</strong> — 다음 달 재구독은 다시 송금 + 인증.
      </div>

      <div style="padding:14px; background:var(--surface); border-radius:10px; margin-bottom:14px;">
        <div style="font-size:11px; color:var(--text-dim); margin-bottom:4px;">구독 금액 (한 달)</div>
        <div style="font-size:18px; font-weight:700; color:var(--text);">${tier.krw.toLocaleString()}원</div>
      </div>

      <div style="padding:14px; background:linear-gradient(135deg, rgba(126,200,227,0.10), rgba(143,200,143,0.05)); border:1px solid rgba(126,200,227,0.30); border-radius:10px; margin-bottom:14px;">
        <div style="font-size:11px; color:var(--text-dim); margin-bottom:6px;">📲 토스 송금 정보</div>
        <div style="font-size:13px; color:var(--text); line-height:1.8;">
          <b>은행</b>: ${TOSS_ACCOUNT.bank}<br>
          <b>계좌</b>: ${TOSS_ACCOUNT.number}<br>
          <b>예금주</b>: ${TOSS_ACCOUNT.holder}<br>
          <b>금액</b>: ${tier.krw.toLocaleString()}원<br>
          <b style="color:var(--accent);">메모 (필수)</b>: <code style="background:rgba(212,167,106,0.20); padding:2px 6px; border-radius:4px; font-family:monospace;">${memoCode}</code>
        </div>
      </div>

      <div style="display:flex; gap:6px; margin-bottom:8px;">
        <button class="btn-secondary" onclick="navigator.clipboard.writeText('${TOSS_ACCOUNT.number_raw}').then(() => showToast('계좌번호 복사됨'))" style="flex:1; font-size:11px;">📋 계좌번호 복사</button>
        <button class="btn-secondary" onclick="navigator.clipboard.writeText('${memoCode}').then(() => showToast('메모 코드 복사됨'))" style="flex:1; font-size:11px;">📋 메모 코드 복사</button>
      </div>
      <div style="font-size:10px; color:var(--text-soft); margin-bottom:14px; line-height:1.6;">
        💡 토스 말고 다른 은행 앱 (우리·국민·신한 등) 도 OK.
      </div>

      <div style="border-top:1px solid var(--border); padding-top:14px; margin-bottom:8px;">
        <div style="font-size:13px; font-weight:600; color:var(--text); margin-bottom:6px;">📸 송금 보낸 후 — 캡처 올리기</div>
        <div style="font-size:11px; color:var(--text-dim); line-height:1.7; margin-bottom:10px;">
          아래 중 한 장 캡처해서 올려:<br>
          · <strong>본인 통장 거래 내역</strong> (출금 line + 메모 보이게) <span style="color:var(--text-soft);">— 가장 정확</span><br>
          · 송금 완료 화면<br>
          · 거래내역 → 클릭 → 상세 화면<br>
          <span style="color:var(--text-soft);">AI가 확인하고 한 달 구독 활성화 ✦</span>
        </div>
        <div style="font-size:10px; color:var(--text-soft); margin-bottom:10px; padding:8px; background:rgba(0,0,0,0.15); border-radius:6px; line-height:1.6;">
          📋 <b>AI(Anthropic Sonnet)가 추출하는 정보</b>:<br>
          금액 · 수신 계좌 · 메모 코드 · 송금 시각 · 화면 종류 (검증 목적). 추출 결과는 검증 후 즉시 사용·삭제 (학습 X). <a href="/privacy" target="_blank" style="color:var(--accent);">자세히</a>
        </div>
        <input type="file" id="tossSubReceiptInput" accept="image/*" style="width:100%; font-size:11px;">

        <!-- 필수 동의 -->
        <div style="margin-top:12px; padding:10px; background:var(--surface); border-radius:8px;">
          <label style="display:flex; align-items:flex-start; gap:8px; margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid var(--border); font-size:12px; font-weight:600; line-height:1.6; cursor:pointer;">
            <input type="checkbox" id="tossSubConsentAll" onchange="_toggleTossSubConsentAll(this)" style="margin-top:3px; flex-shrink:0;">
            <span style="color:var(--accent);">필수 항목 전체 동의 (아래 3가지 한 번에)</span>
          </label>
          <label style="display:flex; align-items:flex-start; gap:8px; margin-bottom:8px; font-size:11px; line-height:1.6; cursor:pointer;">
            <input type="checkbox" id="tossSubConsentRefund" onchange="_syncTossSubConsentAllChk()" style="margin-top:3px; flex-shrink:0;">
            <span><b>(필수)</b> <a href="/refund" target="_blank" style="color:var(--accent);">환불정책</a> — 잔여일 비례 환불 가능</span>
          </label>
          <label style="display:flex; align-items:flex-start; gap:8px; margin-bottom:8px; font-size:11px; line-height:1.6; cursor:pointer;">
            <input type="checkbox" id="tossSubConsentTerms" onchange="_syncTossSubConsentAllChk()" style="margin-top:3px; flex-shrink:0;">
            <span><b>(필수)</b> <a href="/terms" target="_blank" style="color:var(--accent);">이용약관</a> — ${tier.label} 구독 ${tier.krw.toLocaleString()}원/월 / 자동 갱신 X</span>
          </label>
          <label style="display:flex; align-items:flex-start; gap:8px; font-size:11px; line-height:1.6; cursor:pointer;">
            <input type="checkbox" id="tossSubConsentSensitive" onchange="_syncTossSubConsentAllChk()" style="margin-top:3px; flex-shrink:0;">
            <span><b>(필수)</b> <a href="/privacy" target="_blank" style="color:var(--accent);">개인정보처리방침</a> — 정신건강 자기관찰 데이터 처리 별도 동의 (개인정보보호법 §23)</span>
          </label>
        </div>

        <button class="btn-primary" onclick="verifyTossSubscribe('${tierKey}', '${memoCode}')" style="width:100%; margin-top:8px;">✦ 자동 확인하고 한 달 활성화</button>
      </div>

      <div style="font-size:10px; color:var(--text-soft); line-height:1.6; margin-top:10px; padding:8px; background:rgba(126,200,227,0.05); border-left:3px solid rgba(126,200,227,0.40); border-radius:4px;">
        🐚 어디서 막히면 → <a href="${KAKAO_OPEN_CHAT}" target="_blank" style="color:var(--accent); font-weight:600;">💬 오픈채팅으로 톡 줘</a>
      </div>

      <button class="btn-secondary" onclick="closeTossSubscribeModal()" style="width:100%; margin-top:10px;">닫기</button>
    </div>
  `;
  document.body.appendChild(overlay);
}

function closeTossSubscribeModal() {
  const overlay = document.getElementById('tossSubscribeOverlay');
  if (overlay) overlay.remove();
}

// 토스 구독 동의 헬퍼 (양방향 sync)
const _TOSS_SUB_CONSENT_IDS = ['tossSubConsentRefund', 'tossSubConsentTerms', 'tossSubConsentSensitive'];
function _toggleTossSubConsentAll(allEl) {
  const v = !!(allEl && allEl.checked);
  _TOSS_SUB_CONSENT_IDS.forEach(id => {
    const cb = document.getElementById(id);
    if (cb) cb.checked = v;
  });
}
function _syncTossSubConsentAllChk() {
  const all = _TOSS_SUB_CONSENT_IDS.every(id => document.getElementById(id)?.checked);
  const allCb = document.getElementById('tossSubConsentAll');
  if (allCb) allCb.checked = all;
}

// 영수증 캡처 → AI 자동 인증 → 한 달 구독 활성화
async function verifyTossSubscribe(tierKey, memoCode) {
  const refundOk = document.getElementById('tossSubConsentRefund')?.checked;
  const termsOk = document.getElementById('tossSubConsentTerms')?.checked;
  const sensitiveOk = document.getElementById('tossSubConsentSensitive')?.checked;
  if (!refundOk || !termsOk || !sensitiveOk) {
    alert('환불정책 + 이용약관 + 민감정보 처리 동의 체크해야 해.');
    return;
  }
  const input = document.getElementById('tossSubReceiptInput');
  if (!input || !input.files || input.files.length === 0) {
    alert('영수증 캡처 먼저 골라줘! 📸');
    return;
  }
  const file = input.files[0];
  if (file.size > 5 * 1024 * 1024) {
    alert('파일 너무 커 (5MB 이하로) 🐚');
    return;
  }
  // 동의 기록
  try {
    const now = new Date().toISOString();
    state.preferences = state.preferences || {};
    state.preferences.consentLog = state.preferences.consentLog || [];
    state.preferences.consentLog.push({ type: 'subscribe_refund',  version: '1.0', confirmed: true, at: now, tier: tierKey, memo_code: memoCode });
    state.preferences.consentLog.push({ type: 'subscribe_terms',   version: '1.0', confirmed: true, at: now, tier: tierKey, memo_code: memoCode });
    state.preferences.consentLog.push({ type: 'subscribe_sensitive_data', version: '1.0', confirmed: true, at: now, tier: tierKey, memo_code: memoCode, scope: 'mental_health_self_observation' });
    saveState();
  } catch (e) { console.warn('subscribe consent log:', e); }

  showToast('🔍 한 번 볼게...');
  try {
    const reader = new FileReader();
    const base64Promise = new Promise((resolve, reject) => {
      reader.onload = () => resolve((reader.result || '').toString().split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const base64 = await base64Promise;
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const resp = await fetch('/api/billing/verify-toss-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
      body: JSON.stringify({ image_base64: base64, tier: tierKey, user_memo_code: memoCode, image_sha256: sha256 })
    });
    const result = await resp.json();
    if (resp.ok && result.ok && result.verified) {
      const tier = TIER_PLANS_CLIENT[tierKey];
      showToast(`✦ ${tier.label} 구독 한 달 활성화! ${tier.krw.toLocaleString()}원 잘 받았어 🐚`);
      closeTossSubscribeModal();
      if (typeof refreshBillingStatus === 'function') refreshBillingStatus();
    } else {
      alert('어... 영수증을 잘 못 알아봤어 😅 ' + (result.error || '') + '\n\n다시 시도. 안 되면 → ' + KAKAO_OPEN_CHAT);
    }
  } catch (e) {
    alert('오류 😢 ' + (e.message || e) + '\n\n💬 오픈채팅 → ' + KAKAO_OPEN_CHAT);
  }
}

// ─── 추가팩 결제 (cap 도달 시) ───
async function purchaseOveragePack(packKey) {
  const pack = OVERAGE_PACKS_CLIENT[packKey];
  if (!pack) { alert('잘못된 pack'); return; }
  if (typeof window.IMP === 'undefined') {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.iamport.kr/v1/iamport.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    }).catch(() => alert('포트원 SDK 로드 실패'));
  }
  if (typeof window.IMP === 'undefined') return;
  const channelKey = window.PORTONE_CHANNEL_KEY || '';
  if (!channelKey) { alert('결제 시스템 미설정.'); return; }
  IMP.init(channelKey);
  const merchantUid = `pack_${packKey}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  IMP.request_pay({
    pg: 'tosspayments', pay_method: 'card', merchant_uid: merchantUid,
    name: `소라고동 ${pack.label}`,
    amount: pack.krw,
    buyer_email: session?.user?.email || ''
  }, async (rsp) => {
    if (!rsp.success) { alert('결제 실패: ' + (rsp.error_msg || '취소됨')); return; }
    try {
      const verifyResp = await fetch('/api/billing/overage-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
        body: JSON.stringify({ imp_uid: rsp.imp_uid, merchant_uid: merchantUid, pack: packKey })
      });
      const result = await verifyResp.json();
      if (verifyResp.ok && result.ok) {
        showToast(`✦ ${pack.label} 결제 완료 (+$${pack.usd})`);
        const ov = document.getElementById('budgetExceededOverlay');
        if (ov) ov.remove();
        if (typeof refreshBillingStatus === 'function') refreshBillingStatus();
      } else {
        alert('결제 검증 실패: ' + (result.error || '알 수 없음'));
      }
    } catch (e) { alert('백엔드 통신 실패: ' + (e.message || e)); }
  });
}

// ─── Tier 업그레이드 (Light → Premium 차액 결제) ───
async function upgradeToPremium() {
  if (typeof window.IMP === 'undefined') {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.iamport.kr/v1/iamport.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    }).catch(() => alert('포트원 SDK 로드 실패'));
  }
  if (typeof window.IMP === 'undefined') return;
  const channelKey = window.PORTONE_CHANNEL_KEY || '';
  if (!channelKey) { alert('결제 시스템 미설정.'); return; }
  IMP.init(channelKey);
  const merchantUid = `upg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  IMP.request_pay({
    pg: 'tosspayments', pay_method: 'card', merchant_uid: merchantUid,
    name: '소라고동 Light → Premium 업그레이드',
    amount: TIER_UPGRADE_DIFF_KRW,
    buyer_email: session?.user?.email || ''
  }, async (rsp) => {
    if (!rsp.success) { alert('결제 실패: ' + (rsp.error_msg || '취소됨')); return; }
    try {
      const verifyResp = await fetch('/api/billing/upgrade-tier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
        body: JSON.stringify({ imp_uid: rsp.imp_uid, merchant_uid: merchantUid })
      });
      const result = await verifyResp.json();
      if (verifyResp.ok && result.ok) {
        showToast('🌊 Premium 업그레이드 완료');
        const ov = document.getElementById('budgetExceededOverlay');
        if (ov) ov.remove();
        if (typeof refreshBillingStatus === 'function') refreshBillingStatus();
      } else {
        alert('결제 검증 실패: ' + (result.error || '알 수 없음'));
      }
    } catch (e) { alert('백엔드 통신 실패: ' + (e.message || e)); }
  });
}

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

// 사용자 명시 2026-05-02 ultrathink: Opus 일일 30번 한도 도달 모달.
// 카피 "오늘 깊은 대화 다 나눴네. 이만 여기까지 하고 쉬자 🫂" — "내일 또" 같은 미래 약속 X (현재로 닫음).
function showOpusLimitReachedModal() {
  if (document.getElementById('opusLimitOverlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay show';
  overlay.id = 'opusLimitOverlay';
  overlay.style.zIndex = '10000';
  overlay.innerHTML = `
    <div class="input-modal" style="max-width:360px; padding:28px; text-align:center;">
      <div style="font-size:36px; margin-bottom:10px;">🦉</div>
      <div style="font-size:15px; font-weight:600; color:var(--text); line-height:1.7; margin-bottom:18px;">
        오늘 깊은 대화 다 나눴네.<br>이만 여기까지 하고 쉬자 🫂
      </div>
      <button class="btn-primary" onclick="document.getElementById('opusLimitOverlay').remove();" style="width:100%;">알겠어</button>
    </div>
  `;
  document.body.appendChild(overlay);
}

function exportData() {
  const dataStr = JSON.stringify(state, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `soragodong_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// 사용자 요청 2026-04-28: 자동 백업 — 주 1회 + APP_VERSION 변경 시. 단일 row(me_v4_auto_backup) 내 snapshots[] 5개 rolling
async function runAutoBackupIfNeeded() {
  if (!authUserId) return;
  if (state.preferences && state.preferences.testerMode) return;  // 테스터 모드면 skip
  // 사용자 보고 2026-04-30 데이터 손실 P4 fix: pending recovery 중이면 빈 state가 snapshot에 적용되는 거 차단.
  if (window._e2eePendingRecovery) {
    console.warn('[autoBackup] E2EE 복원 대기 중 — snapshot 차단 (데이터 보호)');
    return;
  }
  if (!state.preferences) state.preferences = {};
  const now = Date.now();
  const lastTs = state.preferences._lastAutoBackupAt || 0;
  const lastVer = state.preferences._lastAutoBackupVersion || '';
  const verChanged = (typeof APP_VERSION !== 'undefined') && lastVer !== APP_VERSION;
  const weekly = (now - lastTs) >= AUTO_BACKUP_INTERVAL_MS;
  if (!weekly && !verChanged) return;
  const reason = verChanged ? `update_${APP_VERSION}` : 'weekly';
  try {
    // 기존 snapshots 로드
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${V4_AUTO_BACKUP_USER_ID}&select=data,id&limit=1`,
      { headers: authHeaders() }
    );
    let snapshots = [];
    let existingId = null;
    if (resp.ok) {
      const rows = await resp.json();
      if (rows.length > 0 && rows[0].data && Array.isArray(rows[0].data.snapshots)) {
        snapshots = rows[0].data.snapshots;
        existingId = rows[0].id;
      }
    }
    // 사용자 보고 2026-05-01 (profile 날아간 케이스): wipe detection — 직전 snapshot 비해 핵심 데이터 손실 시 skip.
    // crash 후폭풍·partial state·실수 reset 등으로 cloud 빈 데이터 들어가고 옛 snapshot 까지 rotate-out 되던 risk 차단.
    const stateHash = _computeStateHash(state);
    if (snapshots.length > 0) {
      const last = snapshots[snapshots.length - 1].data || {};
      const lastSnap = snapshots[snapshots.length - 1];
      // 사용자 명시 2026-05-01: 100+ 사용자 효율 — 변경 없는 state 면 snapshot 추가 skip + 다음 schedule 으로 미룸.
      if (stateHash && lastSnap._stateHash === stateHash) {
        console.log('[autoBackup] 변경 없음 — snapshot skip, lastAutoBackupAt 만 갱신.');
        state.preferences._lastAutoBackupAt = now;
        state.preferences._lastAutoBackupVersion = typeof APP_VERSION !== 'undefined' ? APP_VERSION : '';
        saveState();
        return;
      }
      const lastHasProfile = !!(last.profile && String(last.profile).trim());
      const currHasProfile = !!(state.profile && String(state.profile).trim());
      const lastEntries = Array.isArray(last.entries) ? last.entries.length : 0;
      const currEntries = Array.isArray(state.entries) ? state.entries.length : 0;
      const lastTraits = Array.isArray(last.traits) ? last.traits.length : 0;
      const currTraits = Array.isArray(state.traits) ? state.traits.length : 0;
      const profileWipe = lastHasProfile && !currHasProfile;
      const entriesShrink = lastEntries >= 5 && currEntries < lastEntries / 2;
      const traitsShrink = lastTraits >= 5 && currTraits < lastTraits / 2;
      // chatMessages 는 ✓ 마무리 시 0 으로 reset 되는 게 정상 → wipe 신호 X
      if (profileWipe || entriesShrink || traitsShrink) {
        console.warn('[autoBackup] wipe 감지 — snapshot 차단 (profile/entries/traits 손실 보호). 옛 snapshot 유지.', {
          profileWipe, entriesShrink, traitsShrink,
          lastEntries, currEntries, lastTraits, currTraits
        });
        return;
      }
    }
    // 새 snapshot 추가 (state에서 testerMode flag strip)
    const sanitized = JSON.parse(JSON.stringify(state));
    if (sanitized.preferences) delete sanitized.preferences.testerMode;
    snapshots.push({
      ts: new Date(now).toISOString(),
      reason,
      appVersion: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '',
      _stateHash: stateHash,
      data: sanitized
    });
    // rolling 5개
    if (snapshots.length > AUTO_BACKUP_KEEP_N) {
      snapshots = snapshots.slice(-AUTO_BACKUP_KEEP_N);
    }
    const body = JSON.stringify({ data: { snapshots } });
    if (existingId) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${V4_AUTO_BACKUP_USER_ID}`,
        { method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body }
      );
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/soragodong_data`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ auth_user_id: authUserId, user_id: V4_AUTO_BACKUP_USER_ID, data: { snapshots } })
      });
    }
    state.preferences._lastAutoBackupAt = now;
    state.preferences._lastAutoBackupVersion = typeof APP_VERSION !== 'undefined' ? APP_VERSION : '';
    saveState();
    console.log(`[autoBackup] saved (${reason}). snapshots: ${snapshots.length}`);
  } catch (e) { console.warn('autoBackup:', e); }
}

// 사용자 요청 2026-04-29: 수동 클라우드 백업 — 사용자가 명시적으로 적용하는 체크포인트 (rolling 10개)
// 사용자 명시 2026-05-01: opts.silentNote 지정 시 모달 skip — 헤더 sync-dot 빠른 체크포인트 (날짜·시각 자동) 용도.
let _lastManualBackupAt = 0;  // 사용자 요청 2026-05-02 cleanup B2: 30s rate-limit (연속 클릭 시 Supabase 부하 방지)
const _MANUAL_BACKUP_MIN_INTERVAL_MS = 30 * 1000;
async function manualCloudBackup(opts) {
  opts = opts || {};
  if (!authUserId) { showToast('로그인 필요'); return; }
  if (state.preferences && state.preferences.testerMode) {
    showToast('⚠️ 테스터 모드 ON — OFF 후 시도');
    return;
  }
  // 사용자 보고 2026-04-30 데이터 손실 P5 fix: pending recovery 중이면 빈 state snapshot 적용됨 차단.
  if (window._e2eePendingRecovery) {
    showToast('⚠️ 비밀번호 복원 후 다시 시도');
    return;
  }
  // 사용자 요청 2026-05-02 cleanup B2: 30s rate-limit (silentNote 자동 체크포인트는 통과 — 자동 trigger 의 일정 간격은 별도 보장).
  const _nowMs = Date.now();
  if (typeof opts.silentNote !== 'string' && _nowMs - _lastManualBackupAt < _MANUAL_BACKUP_MIN_INTERVAL_MS) {
    const wait = Math.ceil((_MANUAL_BACKUP_MIN_INTERVAL_MS - (_nowMs - _lastManualBackupAt)) / 1000);
    showToast(`잠깐 ${wait}초 후 다시 시도`);
    return;
  }
  _lastManualBackupAt = _nowMs;
  let note;
  if (typeof opts.silentNote === 'string') {
    note = opts.silentNote;
  } else {
    note = await showInputModal({
      title: '☁️ 클라우드 백업',
      message: '이 시점에 메모 남길래? (선택, 안 적어도 OK)\n나중에 복원할 때 어떤 시점인지 알아보기 쉬워.',
      placeholder: '예: 새 학기 시작 전',
      okLabel: '백업'
    });
    if (note === null) return;  // 취소
  }
  showToast('☁️ 클라우드 백업 중...');
  try {
    // 기존 snapshots 로드
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${V4_MANUAL_BACKUP_USER_ID}&select=data,id&limit=1`,
      { headers: authHeaders() }
    );
    let snapshots = [];
    let existingId = null;
    if (resp.ok) {
      const rows = await resp.json();
      if (rows.length > 0 && rows[0].data && Array.isArray(rows[0].data.snapshots)) {
        snapshots = rows[0].data.snapshots;
        existingId = rows[0].id;
      }
    }
    // 사용자 명시 2026-05-01: 100+ 사용자 대비 효율 — 변경 없는 state 면 backup skip.
    // 1) same-hash skip — 직전 snapshot 의 _stateHash 와 동일하면 의미 없는 backup. 옛 snapshot rotate-out 도 차단.
    // 2) 30초 rate limit — 실수 더블 클릭 / 빠른 연타 차단.
    const stateHash = _computeStateHash(state);
    if (snapshots.length > 0) {
      const lastSnap = snapshots[snapshots.length - 1];
      if (stateHash && lastSnap._stateHash === stateHash) {
        showToast('✦ 변경 사항 없음 — 이미 백업됨');
        return;
      }
      if (lastSnap.ts) {
        const sinceMs = Date.now() - new Date(lastSnap.ts).getTime();
        if (sinceMs < 30 * 1000) {
          showToast('잠깐만 — 30초 후 다시 시도');
          return;
        }
      }
    }
    // 새 snapshot
    const sanitized = JSON.parse(JSON.stringify(state, _serializeReplacer));
    snapshots.push({
      ts: new Date().toISOString(),
      note: (note || '').trim().slice(0, 80),
      appVersion: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '',
      _stateHash: stateHash,
      data: sanitized
    });
    // rolling cap
    if (snapshots.length > MANUAL_BACKUP_KEEP_N) {
      snapshots = snapshots.slice(-MANUAL_BACKUP_KEEP_N);
    }
    const body = JSON.stringify({ data: { snapshots } });
    if (existingId) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${V4_MANUAL_BACKUP_USER_ID}`,
        { method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body }
      );
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/soragodong_data`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ auth_user_id: authUserId, user_id: V4_MANUAL_BACKUP_USER_ID, data: { snapshots } })
      });
    }
    showToast(`☁️ 백업됨 (${snapshots.length}/${MANUAL_BACKUP_KEEP_N})`);
  } catch (e) {
    console.error('manualCloudBackup:', e);
    showToast('백업 실패: ' + (e.message || e));
  }
}

// 사용자 명시 2026-05-01: 헤더 sync-dot click → 빠른 체크포인트 (날짜·시각 자동 메모, 모달 X).
// 사용자 보고 2026-05-01: 진행 중 시각 피드백 (.checkpointing 띠) → 백업 끝나면 자동 제거.
async function quickCheckpointFromHeader() {
  // V4 (v8 묶음 18): 강제 저장 첫 사용 inline tip
  if (typeof _showInlineTip === 'function') _showInlineTip('syncDotClick');
  const pill = document.querySelector('.date-pill');
  const ts = new Date();
  const mm = String(ts.getMonth() + 1).padStart(2, '0');
  const dd = String(ts.getDate()).padStart(2, '0');
  const hh = String(ts.getHours()).padStart(2, '0');
  const mi = String(ts.getMinutes()).padStart(2, '0');
  const note = `${ts.getFullYear()}-${mm}-${dd} ${hh}:${mi}`;
  if (pill) pill.classList.add('checkpointing');
  try {
    await manualCloudBackup({ silentNote: note });
  } finally {
    if (pill) {
      pill.classList.remove('checkpointing');
      // hover/focus 잔재 띠 제거 — blur 로 keyboard focus 풀음
      try { pill.blur(); } catch {}
    }
  }
}

// 사용자 요청 2026-04-29: 수동 클라우드 복원 — 백업 목록에서 선택해서 복원
async function restoreFromCloudBackup() {
  if (!authUserId) { showToast('로그인 필요'); return; }
  showToast('🔍 클라우드 백업 검색 중...');
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${V4_MANUAL_BACKUP_USER_ID}&select=data&limit=1`,
      { headers: authHeaders() }
    );
    if (!resp.ok) { showToast('백업 검색 실패'); return; }
    const rows = await resp.json();
    if (rows.length === 0 || !rows[0].data || !Array.isArray(rows[0].data.snapshots) || rows[0].data.snapshots.length === 0) {
      showToast('클라우드 백업 없음 — "☁️ 클라우드 백업"으로 먼저 넣어둬');
      return;
    }
    const snapshots = rows[0].data.snapshots.slice().reverse();  // 최신 먼저
    const opts = snapshots.map((s, i) => {
      const dt = new Date(s.ts).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const noteLabel = s.note ? ` · ${s.note}` : '';
      return { label: `${dt}${noteLabel}`, value: String(i) };
    });
    const choice = await showOptionsModal({
      title: '☁️ 클라우드 복원',
      message: `${snapshots.length}개 백업 중 선택. 복원하면 현재 데이터는 사라져.`,
      options: opts
    });
    if (!choice) return;
    const idx = parseInt(choice, 10);
    const snap = snapshots[idx];
    if (!snap || !snap.data) { showToast('백업 데이터 X'); return; }
    const yes = await showConfirmModal({
      title: '복원 확정?',
      message: `${new Date(snap.ts).toLocaleString('ko-KR')}${snap.note ? '\n메모: ' + snap.note : ''}\n\n현재 데이터 사라지고 이 시점 상태로 돌아가.`,
      okLabel: '복원',
      cancelLabel: '취소'
    });
    if (!yes) return;
    state = { ...DEFAULT_STATE, ...snap.data };
    await saveToCloudNow();
    showToast('✦ 복원됨 — 새로고침 중...');
    setTimeout(() => location.reload(), 800);
  } catch (e) {
    console.error('restoreFromCloudBackup:', e);
    showToast('복원 실패: ' + (e.message || e));
  }
}

// 자동 백업 목록 → modal로 보여주고 선택 복구
async function showAutoBackupList() {
  if (!authUserId) { showToast('로그인 필요'); return; }
  showToast('🔍 자동 백업 검색 중...');
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${V4_AUTO_BACKUP_USER_ID}&select=data&limit=1`,
      { headers: authHeaders() }
    );
    if (!resp.ok) { showToast('백업 검색 실패'); return; }
    const rows = await resp.json();
    if (rows.length === 0 || !rows[0].data || !Array.isArray(rows[0].data.snapshots) || rows[0].data.snapshots.length === 0) {
      showToast('자동 백업 없음 (주 1회 + 업데이트 시 자동 생성됨)');
      return;
    }
    const snapshots = rows[0].data.snapshots.slice().reverse(); // 최신 먼저
    const opts = snapshots.map((s, i) => {
      const dt = new Date(s.ts).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const reasonLabel = s.reason === 'weekly' ? '🗓 주간' : s.reason.startsWith('update_') ? '🔄 업데이트 ' + s.reason.replace('update_', '') : s.reason;
      return { label: `${dt} · ${reasonLabel}`, value: String(i) };
    });
    const choice = await showOptionsModal({
      title: '🕰 자동 백업에서 복원',
      message: `최근 ${snapshots.length}개 중 선택. 복구하면 현재 데이터는 사라져.`,
      options: opts
    });
    if (!choice) return;
    const idx = parseInt(choice, 10);
    const snap = snapshots[idx];
    if (!snap || !snap.data) { showToast('snapshot 데이터 X'); return; }
    const yes = await showConfirmModal({
      title: '복구 확정?',
      message: `${new Date(snap.ts).toLocaleString('ko-KR')}\n\n현재 데이터 사라지고 이 시점 상태로 돌아가.`,
      okLabel: '복구',
      cancelLabel: '취소'
    });
    if (!yes) return;
    state = { ...DEFAULT_STATE, ...snap.data };
    await saveToCloudNow();
    showToast('✦ 복구됨 — 새로고침 중...');
    setTimeout(() => location.reload(), 800);
  } catch (e) {
    console.error('showAutoBackupList:', e);
    showToast('복구 실패: ' + (e.message || e));
  }
}

// 사용자 요청 2026-04-28: 실수 초기화 복구 — V3→V4 마이그레이션 백업 (V4_BACKUP_USER_ID 'backup_v6_pre_v7') 또는 localStorage에서
async function recoverFromBackup() {
  if (!authUserId) { showToast('로그인 필요'); return; }
  showToast('🔍 백업 검색 중...');
  // 1. Supabase backup row 시도
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${V4_BACKUP_USER_ID}&select=data,updated_at&limit=1`,
      { headers: authHeaders() }
    );
    if (resp.ok) {
      const rows = await resp.json();
      if (rows.length > 0 && rows[0].data) {
        const meta = rows[0].data._backup_meta || {};
        const when = meta.createdAt ? new Date(meta.createdAt).toLocaleString('ko-KR') : '시점 X';
        const yes = await showConfirmModal({
          title: '🔄 cloud 백업 발견',
          message: `백업 시점: ${when}\n타입: ${meta.type || 'V6'}\n\n현재 데이터를 이 백업으로 덮어쓸까?\n(현재 데이터는 사라져)`,
          okLabel: '복구',
          cancelLabel: '취소'
        });
        if (yes) {
          const backupData = JSON.parse(JSON.stringify(rows[0].data));
          delete backupData._backup_meta;
          state = { ...DEFAULT_STATE, ...backupData };
          await saveToCloudNow();
          showToast('✦ 복구됨 — 새로고침 중...');
          setTimeout(() => location.reload(), 800);
          return;
        }
      } else {
        // cloud backup 없음 → localStorage 시도
        const local = localStorage.getItem(V4_LOCAL_STORAGE_KEY);
        if (local) {
          const yes = await showConfirmModal({
            title: '🔄 localStorage 백업 발견',
            message: `이 기기에 저장된 옛 데이터가 있어.\n복구할까?\n(현재 cloud 데이터는 사라짐)`,
            okLabel: '복구',
            cancelLabel: '취소'
          });
          if (yes) {
            state = { ...DEFAULT_STATE, ...JSON.parse(local) };
            await saveToCloudNow();
            showToast('✦ 복구됨 — 새로고침 중...');
            setTimeout(() => location.reload(), 800);
            return;
          }
        } else {
          showToast('⚠️ 복구 가능한 백업 없음');
        }
      }
    }
  } catch (e) {
    console.error('recovery error:', e);
    showToast('복구 실패: ' + (e.message || e));
  }
}

async function resetAll() {
  // V4: V4 row만 삭제. V3 prod 데이터(`me`)는 영원히 안 건드림.
  if (!confirm('V4 미리보기 데이터만 삭제돼 (V3 prod는 안전). API 키는 유지. 정말?')) return;
  if (!confirm('한 번 더. 진짜?')) return;
  // 사용자 요청 2026-04-28: API 키 보존 (별도 localStorage에 임시 저장 → 새 state 만들 때 복원)
  const preservedApiKey = state.apiKey || '';
  if (preservedApiKey) {
    try { localStorage.setItem('soragodong_v4_apikey_preserve', preservedApiKey); } catch (e) {}
  }
  // 사용자 보고 2026-04-28: 시드 데이터 남는 버그 — 메모리 + storage + cloud 모두 강제 정리
  // 1. 메모리에서 testerMode + 튜토리얼 mode flag 강제 OFF (잔여 backup 무력화)
  if (state.preferences) state.preferences.testerMode = false;
  window._onbTutorialMode = false;
  window._testerModeBackupState = null;
  if (typeof _testerModeBackupState !== 'undefined') _testerModeBackupState = null;
  // 2. localStorage 모든 V4 키 정리 (다른 키도 cleanup) — API 키 preserve 키는 제외
  try {
    localStorage.removeItem(V4_LOCAL_STORAGE_KEY);
    localStorage.removeItem(V4_LAST_USER_KEY);
    Object.keys(localStorage).forEach(k => {
      if ((k.startsWith('soragodong_v4') || k.startsWith('me_v4')) && k !== 'soragodong_v4_apikey_preserve') {
        localStorage.removeItem(k);
      }
    });
  } catch (e) { console.error('localStorage clear:', e); }
  // 3. cloud DELETE — retry 포함 + verify
  let cloudDeleted = false;
  if (authUserId) {
    for (let attempt = 0; attempt < 3 && !cloudDeleted; attempt++) {
      try {
        const resp = await fetch(
          `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${V4_USER_ID}`,
          { method: 'DELETE', headers: authHeaders() }
        );
        if (resp.ok || resp.status === 204 || resp.status === 200) {
          cloudDeleted = true;
        } else {
          console.warn(`cloud delete attempt ${attempt + 1} failed: ${resp.status}`);
        }
      } catch (e) {
        console.error(`cloud delete attempt ${attempt + 1}:`, e);
      }
    }
    // verify — 정말 삭제됐는지 확인
    try {
      const verifyResp = await fetch(
        `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${V4_USER_ID}&select=id&limit=1`,
        { headers: authHeaders() }
      );
      if (verifyResp.ok) {
        const rows = await verifyResp.json();
        if (rows.length > 0) {
          alert('⚠ cloud row가 여전히 존재함. 네트워크 오류 가능성 — 다시 시도해줘.');
          return;  // reload 안 함 — 사용자 재시도 가능
        }
      }
    } catch (e) { console.error('verify:', e); }
  }
  // 4. state 메모리 즉시 비움 (reload 전이라도 안전)
  state = JSON.parse(JSON.stringify(DEFAULT_STATE));
  alert('✦ 데이터 삭제 완료. 새로고침합니다.');
  location.reload();
}

// V3.13.x: 소라 컬렉션만 초기화 (다른 데이터는 유지)
// V4-fix: 보류된 숙고 찌꺼기 일괄 정리 (paused 항목만)
async function cleanupPausedReflections() {
  const all = state.reflectionQuestions || [];
  const paused = all.filter(q => q.status === 'paused');
  if (paused.length === 0) {
    showToast('보류된 숙고 없음 — 깨끗해');
    return;
  }
  const ok = await showConfirmModal({
    title: `🌊 보류된 숙고 ${paused.length}개 삭제`,
    message: `옛 보류 데이터 일괄 정리. active / resolved 항목은 안 건드림.`,
    okLabel: '정리',
    cancelLabel: '취소'
  });
  if (!ok) return;
  state.reflectionQuestions = all.filter(q => q.status !== 'paused');
  saveState();
  if (typeof renderReflectionHome === 'function') renderReflectionHome();
  showToast(`🗑 ${paused.length}개 정리됨`);
}

async function resetShellCollection() {
  const count = (state.shellCollection || []).length;
  if (count === 0) {
    showToast('이미 비어있어');
    return;
  }
  const yes = await showConfirmModal({
    title: '소라 컬렉션 초기화',
    message: `모래사장 소라 ${count}개가 모두 삭제돼.\n다른 데이터(체크인/대화/할 일 등)는 그대로.\n되돌릴 수 없어.`,
    okLabel: '삭제', cancelLabel: '취소'
  });
  if (!yes) return;
  state.shellCollection = [];
  saveState();
  if (typeof renderBeach === 'function') renderBeach();
  if (typeof renderShellBar === 'function') renderShellBar();
  showToast(`🐚 소라 ${count}개 초기화 완료`);
}

// V3.13.x: 부분 초기화 헬퍼들 — 잘못 테스트 입력한 데이터 정리용
async function _confirmAndReset(label, count, doReset, rerender) {
  if (count === 0) { showToast(`${label} 이미 비어있어`); return; }
  const yes = await showConfirmModal({
    title: `${label} 초기화`,
    message: `${label} ${count}개가 모두 삭제돼.\n다른 데이터는 그대로.\n되돌릴 수 없어.`,
    okLabel: '삭제', cancelLabel: '취소'
  });
  if (!yes) return;
  doReset();
  saveState();
  if (rerender) try { rerender(); } catch (e) {}
  showToast(`✦ ${label} ${count}개 초기화 완료`);
}
async function resetChatMessages() {
  const c = (state.chatMessages || []).length;
  await _confirmAndReset('대화 메시지', c, () => { state.chatMessages = []; }, () => {
    if (typeof renderChat === 'function') renderChat();
  });
}
async function resetEntries() {
  const c = (state.entries || []).length;
  await _confirmAndReset('체크인 entries', c, () => { state.entries = []; }, () => {
    const cur = document.querySelector('.screen.active');
    if (cur && cur.id === 'screen-archive' && typeof renderArchive === 'function') renderArchive();
    if (cur && cur.id === 'screen-home' && typeof renderTodayMission === 'function') renderTodayMission();
  });
}
async function resetTopicCards() {
  const c = (state.topicCards || []).length;
  await _confirmAndReset('토픽 카드 + 전략 카드', c, () => { state.topicCards = []; }, () => {
    if (typeof renderArchive === 'function') renderArchive();
  });
}
async function resetMissions() {
  const c = (state.missions || []).length;
  await _confirmAndReset('미션', c, () => { state.missions = []; }, () => {
    if (typeof renderTodayMission === 'function') renderTodayMission();
  });
}
async function resetArchive() {
  const c = (state.archive || []).length;
  await _confirmAndReset('도서관 깨달음', c, () => { state.archive = []; }, () => {
    if (typeof renderArchive === 'function') renderArchive();
  });
}
async function resetPearls() {
  const c = (state.pearls || []).length;
  await _confirmAndReset('진주', c, () => { state.pearls = []; }, () => {
    if (typeof renderArchive === 'function') renderArchive();
  });
}
async function resetTasks() {
  const c = (state.tasks || []).length;
  await _confirmAndReset('할 일(서랍장)', c, () => { state.tasks = []; }, () => {
    if (typeof renderExecute === 'function') renderExecute();
  });
}

// V3.13.x: 앱 버전 — 매 git push 전 갱신. 새 버전 진입 시 튜토리얼 자동 시작.
const APP_VERSION = 'v4.0.169-ios-mov-audio-fallback';
// 사용자 명시 2026-05-01: window 으로 노출 — Sentry release tag (init 안에서 참조).
try { window.APP_VERSION = APP_VERSION; } catch {}

// V3.13.x: 단순화 — 튜토리얼 진행 중 X + 해당 버전 dismiss X면 무조건 배너.
// lastSeen 자동 갱신 로직 제거. 모든 사용자 (신규 포함)에게 표시.
function autoTourOnUpdate() {
  if (typeof renderUpdateNotice === 'function') renderUpdateNotice();
  if (typeof renderFeedbackBanner === 'function') renderFeedbackBanner();
}
// V4 (사용자 요청 2026-04-29): 배너 → 3 버튼 모달
// dismiss 단위는 메이저 버전 (V4/V5/...). 같은 메이저면 한 번 dismiss로 끝까지 안 떠.
// 이전 사용자의 dismissedAppVersion 플래그는 이제 무효 (사용자 명시 — 지금 이후부터).
function _currentMajor() {
  const v = (typeof APP_VERSION === 'string' ? APP_VERSION : '') || '';
  const m = v.match(/^v(\d+)/i);
  return m ? ('V' + m[1]) : 'V4';
}
function renderUpdateNotice() {
  // 기존 배너 element 비활성 (잔여 시각 제거)
  const banner = document.getElementById('updateBanner');
  if (banner) { banner.style.display = 'none'; banner.innerHTML = ''; }

  // V4 사용자 명시 (V203): chooser 컴포넌트 폐기. 이 함수는 배너 큐 trigger 만 담당.
  // 신규 사용자 자동 튜토리얼 진입은 maybeShowFirstTimeIntro 에서 처리.
  if (typeof authUserId === 'undefined' || !authUserId) return;
  if (typeof session === 'undefined' || !session || !session.access_token) return;
  if (document.getElementById('e2eeRecoveryOverlay')) return;
  if (document.getElementById('e2eeSetupOverlay')) return;

  // 배너 큐 (legacy bonus / sync tip / feedback) — chooser 모달 X.
  if (typeof _renderNextBanner === 'function') _renderNextBanner();
}

// V4 사용자 명시 2026-05-01: 배너 큐 — 우선순위 list, 1개씩만 노출.
// 닫으면 (영구 dismiss flag SET) → 다음 trigger (페이지 진입/새로고침) 시 다음 후보가 자리 차지.
// 동시 표시 X — 화면 노이즈 회피.
//
// 새 배너 추가 = 아래 list 에 항목 + check/render/dismissFlag 정의.

const _BANNER_CANDIDATES = [
  { id: 'legacyBonusMay2026', check: _legacyBonusBanner_check, render: _legacyBonusBanner_render, dismissFlag: 'dismissedLegacyBonusMay2026Banner' },
  { id: 'syncTipMay2026',     check: _syncTipBanner_check,     render: _syncTipBanner_render,     dismissFlag: 'dismissedSyncTipMay2026' }
];

function _renderNextBanner() {
  const banner = document.getElementById('updateBanner');
  if (!banner) return;
  // 공통 gate
  if (typeof authUserId === 'undefined' || !authUserId) return;
  if (typeof session === 'undefined' || !session || !session.access_token) return;
  if (window._onbTutorialMode) return;
  if (state && state.preferences && state.preferences.testerMode) return;
  // 자리 비우기 (이전 배너 잔여)
  banner.style.display = 'none';
  banner.innerHTML = '';
  for (const c of _BANNER_CANDIDATES) {
    if (state && state.preferences && state.preferences[c.dismissFlag]) continue;
    if (!c.check()) continue;
    c.render(banner);
    banner.style.display = 'flex';
    return;
  }
}

// === 배너 1: legacy bonus (사용자 명시 2026-05-01) — 환영 토큰 받은 사용자 += 1,000원 1회 ===
function _legacyBonusBanner_check() {
  // 사전 필터: refreshBillingStatus 가 채운 캐시 사용. 캐시 없으면 보류 (다음 자동 호출 시 재시도).
  const billing = window._billingCache;
  if (!billing) return false;
  if (!billing.free_credit_granted) return false;       // 환영 토큰 미수령 = legacy 대상 X
  if (billing.legacy_bonus_2026_05_granted) return false; // 이미 받음
  // 사용자 보고 2026-05-01 ultrathink: 신규 사용자도 뜨던 버그 fix.
  // legacy = 2026-05-01 이전부터 사용한 사용자. 첫 entry/chatMessages timestamp 가 5월 1일 이전이어야 적용.
  // backend billing 캐시에 grant 시점 필드 없어서 client-side 가입 시점 추정.
  try {
    const cutoffMs = new Date('2026-05-01T00:00:00').getTime();
    const _entries = (state.entries || []).slice().sort((a, b) => {
      const ta = new Date(a.timestamp || a.date || 0).getTime();
      const tb = new Date(b.timestamp || b.date || 0).getTime();
      return ta - tb;
    });
    const firstEntryMs = _entries.length && _entries[0]
      ? new Date(_entries[0].timestamp || _entries[0].date || 0).getTime()
      : Infinity;
    const firstMsg = (state.chatMessages || []).find(m => m && m.timestamp);
    const firstMsgMs = firstMsg ? new Date(firstMsg.timestamp).getTime() : Infinity;
    // chatArchive 도 보존 (옛 사용자가 archive 있을 수 있음)
    const firstArchive = (state.chatArchive || []).slice().sort((a, b) => {
      const ta = new Date(a.date + 'T00:00:00' || 0).getTime();
      const tb = new Date(b.date + 'T00:00:00' || 0).getTime();
      return ta - tb;
    })[0];
    const firstArchiveMs = firstArchive && firstArchive.date
      ? new Date(firstArchive.date + 'T00:00:00').getTime()
      : Infinity;
    const firstUseMs = Math.min(firstEntryMs, firstMsgMs, firstArchiveMs);
    if (firstUseMs >= cutoffMs) return false;  // 신규 사용자 (2026-05-01 이후 첫 사용) — legacy X
  } catch (e) {
    console.warn('[legacyBonus] cutoff guard fail:', e);
    return false;  // 가드 실패 시 안전하게 안 보임
  }
  return true;
}
function _legacyBonusBanner_render(banner) {
  banner.innerHTML = `
    <div class="update-banner-text">1,000원 더 넣어드렸어용</div>
    <div class="update-banner-actions">
      <button class="update-banner-btn-go" id="legacyBonusClaimBtn" onclick="claimLegacyBonusMay2026()">🎁 받기</button>
      <button class="update-banner-btn-dismiss" onclick="dismissLegacyBonusBanner()" aria-label="닫기" title="닫기">✕</button>
    </div>
  `;
}
async function claimLegacyBonusMay2026() {
  const btn = document.getElementById('legacyBonusClaimBtn');
  if (btn && btn.dataset._processing === '1') return;
  if (btn) { btn.dataset._processing = '1'; btn.disabled = true; btn.textContent = '받는 중...'; }
  try {
    const resp = await _authedFetch('/api/billing/legacy-bonus-may2026', { method: 'POST' });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok && data.ok) {
      const balKrw = Math.round((data.balance_usd || 0) * 1400).toLocaleString();
      if (data.granted) {
        if (typeof showToast === 'function') showToast(`🎁 1,000원 받았어 ✦ 잔액 ~${balKrw}원`);
      } else if (data.already_granted) {
        if (typeof showToast === 'function') showToast(`✦ 이미 받았어 (잔액 ~${balKrw}원)`);
      }
      // flag SET + cloud sync
      state.preferences = state.preferences || {};
      state.preferences.dismissedLegacyBonusMay2026Banner = true;
      try { saveState(true); } catch {}
      if (typeof saveToCloudNow === 'function') saveToCloudNow().catch(e => console.warn('[legacyBonus] cloud:', e));
      if (typeof refreshBillingStatus === 'function') refreshBillingStatus(false).catch(() => {});
      // 배너 즉시 제거 + 다음 배너 자리 (사용자 명시 2026-05-01)
      const banner = document.getElementById('updateBanner');
      if (banner) { banner.style.display = 'none'; banner.innerHTML = ''; }
      if (typeof _renderNextBanner === 'function') _renderNextBanner();
    } else {
      const reason = data?.reason;
      if (reason === 'not_legacy_user') {
        if (typeof showToast === 'function') showToast('환영 토큰을 먼저 받아야 해 🐚');
      } else {
        if (typeof showToast === 'function') showToast('받기 실패: ' + (data?.error || resp.status));
      }
      if (btn) { btn.dataset._processing = ''; btn.disabled = false; btn.textContent = '받기'; }
    }
  } catch (e) {
    console.warn('[legacyBonus] error:', e);
    if (typeof showToast === 'function') showToast('받기 실패 — 인터넷 점검');
    if (btn) { btn.dataset._processing = ''; btn.disabled = false; btn.textContent = '받기'; }
  }
}
function dismissLegacyBonusBanner() {
  const banner = document.getElementById('updateBanner');
  if (banner) { banner.style.display = 'none'; banner.innerHTML = ''; }
  state.preferences = state.preferences || {};
  state.preferences.dismissedLegacyBonusMay2026Banner = true;
  saveState(true);
  if (typeof saveToCloudNow === 'function') saveToCloudNow().catch(e => console.warn('[legacyBonus dismiss] cloud:', e));
  // 사용자 명시 2026-05-01: 닫으면 다음 배너 즉시 자리 차지 (새로고침 대기 X)
  if (typeof _renderNextBanner === 'function') _renderNextBanner();
}

// === 배너 2: sync tip (헤더 알약 안내) — 코어 다 끝낸 기존 사용자 한정 ===
function _syncTipBanner_check() {
  const coreKeys = ['core1','core2','core3','core4','core5','core6','core8'];
  const allCoresDone = state.unlocked && coreKeys.every(k => state.unlocked[k] === true);
  if (!allCoresDone) return false;
  const entriesCount = Array.isArray(state.entries) ? state.entries.length : 0;
  if (entriesCount <= 3) return false;
  return true;
}
function _syncTipBanner_render(banner) {
  banner.innerHTML = `
    <div class="update-banner-text">✦ NEW — 오른쪽 위 <b>🟢</b> 누르면 클라우드에 백업(저장)됨. <span style="opacity:0.85;">백업 중요하니까 자주자주 ✦</span></div>
    <div class="update-banner-actions">
      <button class="update-banner-btn-dismiss" onclick="dismissSyncTipBanner()" aria-label="닫기" title="닫기">✕</button>
    </div>
  `;
}
function dismissSyncTipBanner() {
  const banner = document.getElementById('updateBanner');
  if (banner) { banner.style.display = 'none'; banner.innerHTML = ''; }
  state.preferences = state.preferences || {};
  state.preferences.dismissedSyncTipMay2026 = true;
  saveState(true);
  if (typeof saveToCloudNow === 'function') {
    saveToCloudNow().catch(e => console.warn('[syncTip dismiss] cloud:', e));
  }
  // 사용자 명시 2026-05-01: 닫으면 다음 배너 즉시 자리 차지
  if (typeof _renderNextBanner === 'function') _renderNextBanner();
}

// 옛 함수 호환 (외부 호출 잔재 대비) — 큐로 위임.
function maybeShowSyncTipBanner() { if (typeof _renderNextBanner === 'function') _renderNextBanner(); }

// === Admin 배너 미리보기 (사용자 명시 2026-05-01) ===
// 실제 사용자에게 어떻게 뜨는지 preview. dismiss flag / backend grant 절대 X.
function devPreviewBanner(type) {
  if (typeof _isAdmin === 'function' && !_isAdmin()) {
    if (typeof showToast === 'function') showToast('관리자만');
    return;
  }
  devClosePreviewBanner();
  const banner = document.getElementById('updateBanner');
  const fb = document.getElementById('feedbackBanner');
  if (type === 'legacy') {
    if (!banner) return;
    if (typeof _legacyBonusBanner_render === 'function') _legacyBonusBanner_render(banner);
    // 실제 grant / dismiss flag 차단 — onclick swap
    const claimBtn = banner.querySelector('#legacyBonusClaimBtn');
    if (claimBtn) {
      claimBtn.setAttribute('onclick', "if (typeof showToast==='function') showToast('🔍 미리보기 — 실제 grant X'); devClosePreviewBanner();");
    }
    const dismissBtn = banner.querySelector('.update-banner-btn-dismiss');
    if (dismissBtn) dismissBtn.setAttribute('onclick', 'devClosePreviewBanner()');
    banner.style.display = 'flex';
    if (typeof showToast === 'function') showToast('🔍 미리보기 — 실제 사용자 view');
  } else if (type === 'syncTip') {
    if (!banner) return;
    if (typeof _syncTipBanner_render === 'function') _syncTipBanner_render(banner);
    const dismissBtn = banner.querySelector('.update-banner-btn-dismiss');
    if (dismissBtn) dismissBtn.setAttribute('onclick', 'devClosePreviewBanner()');
    banner.style.display = 'flex';
    if (typeof showToast === 'function') showToast('🔍 미리보기 — 실제 사용자 view');
  } else if (type === 'feedback') {
    if (!fb) return;
    fb.innerHTML = `
      <div class="update-banner-text">💌 고동MOM에게 한 마디:</div>
      <div class="update-banner-actions">
        <button class="update-banner-btn-go" onclick="if (typeof showToast===&quot;function&quot;) showToast(&quot;🔍 미리보기 — 피드백 모달 X&quot;); devClosePreviewBanner();">메시지 보내기</button>
        <button class="update-banner-btn-dismiss" onclick="devClosePreviewBanner()" aria-label="닫기">×</button>
      </div>
    `;
    fb.style.display = 'flex';
    if (typeof showToast === 'function') showToast('🔍 미리보기 — 실제 사용자 view');
  }
}
function devClosePreviewBanner() {
  const banner = document.getElementById('updateBanner');
  const fb = document.getElementById('feedbackBanner');
  if (banner) { banner.style.display = 'none'; banner.innerHTML = ''; }
  if (fb) { fb.style.display = 'none'; fb.innerHTML = ''; }
}
// V4 사용자 명시 (V203): showUpdateChooserModal / _chooseUpdateOption 폐기.
// 신규 사용자 = maybeShowFirstTimeIntro 가 자동 startCoreTutorial('core1') 진입.
// 기존 사용자 = 배너 큐만 (chooser 모달 X).
// 설정 → 투어 다시 보기 = startCoreTutorial 직접 호출.
// 설정 → 풀 튜토리얼 = startInteractiveOnboarding 직접 호출.
// 사용자 요청 2026-04-30: 헤더 배너 '고동MOM에게 한 마디' — 인앱 피드백 직진.
// dismiss 시 v4 기간 동안 안 뜸 (V5 시 다시 등장).
function renderFeedbackBanner() {
  const banner = document.getElementById('feedbackBanner');
  if (!banner) return;
  if (typeof authUserId === 'undefined' || !authUserId) { banner.style.display = 'none'; return; }
  if (typeof session === 'undefined' || !session || !session.access_token) { banner.style.display = 'none'; return; }
  if (window._onbTutorialMode) { banner.style.display = 'none'; return; }
  if (state && state.preferences && state.preferences.testerMode) { banner.style.display = 'none'; return; }
  const major = _currentMajor();
  const dismissed = state && state.preferences && state.preferences.dismissedFeedbackBannerMajor;
  if (dismissed === major) { banner.style.display = 'none'; return; }
  banner.style.display = 'flex';
  banner.innerHTML = `
    <div class="update-banner-text">💌 고동MOM에게 한 마디:</div>
    <div class="update-banner-actions">
      <button class="update-banner-btn-go" onclick="openFeedbackInApp(); dismissFeedbackBanner();">메시지 보내기</button>
      <button class="update-banner-btn-dismiss" onclick="dismissFeedbackBanner()" aria-label="닫기">×</button>
    </div>
  `;
}

function dismissFeedbackBanner() {
  if (!state) return;
  state.preferences = state.preferences || {};
  state.preferences.dismissedFeedbackBannerMajor = _currentMajor();
  saveState();
  const banner = document.getElementById('feedbackBanner');
  if (banner) banner.style.display = 'none';
  // 사용자 보고 2026-05-02: 고동MOM dismiss 후 다음 배너 큐 (legacy / syncTip) 자동 trigger.
  if (typeof _renderNextBanner === 'function') _renderNextBanner();
}
// V3.13.x: iOS PWA 슬라이드 종료 후 재진입 (또는 탭 복귀) 시 새 버전 체크
// (visibility hidden → visible. iOS에선 cold start 안 해도 발생.)
let _lastAutoTourCheck = 0;
async function checkServerVersionAndReload() {
  try {
    const resp = await fetch('/version.txt?_=' + Date.now(), { cache: 'no-store' });
    if (!resp.ok) return false;
    const serverVersion = (await resp.text()).trim();
    if (serverVersion && serverVersion !== APP_VERSION) {
      // 새 버전 — 강제 reload (메모리 state 폐기, cloud에서 다시 로드 → 새 HTML 받음)
      console.log(`[version] new version ${serverVersion} (current ${APP_VERSION}) — reloading`);
      // 사용자 보고 2026-04-30: reload 전 cloud 저장 강제 — 미저장 변경 손실 방지.
      // (saveState 는 debounced 1초 → 강제 reload 시 cloud 저장 안 끝남)
      try {
        if (typeof saveState === 'function' && typeof authUserId !== 'undefined' && authUserId) {
          saveState({ force: true });
        }
        if (typeof saveToCloudNow === 'function' && typeof authUserId !== 'undefined' && authUserId) {
          // 3초 timeout — 네트워크 느려도 reload는 진행
          await Promise.race([
            saveToCloudNow(),
            new Promise(resolve => setTimeout(resolve, 3000))
          ]);
        }
      } catch (e) { console.warn('[version reload] cloud save:', e); }
      location.reload();
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  const now = Date.now();
  if (now - _lastAutoTourCheck < 5000) return;  // 5초 가드 (탭 전환 빈번 방지)
  _lastAutoTourCheck = now;
  // 1. 서버 버전 체크 — 새 버전이면 reload (그 후 init에서 autoTourOnUpdate 호출됨)
  const reloaded = await checkServerVersionAndReload();
  if (reloaded) return;
  // 2. 같은 버전이면 그냥 autoTourOnUpdate (혹시 이전 진입에서 lastSeen 미적용된 케이스 대비)
  if (state && state.preferences) autoTourOnUpdate();
});
// V3.13.x: 첫 load 시 서버 버전 즉시 체크 — 옛 캐시면 빠르게 reload
window.addEventListener('load', () => {
  // 즉시 호출 (이전엔 3초 setTimeout — 사용자 체감 지연)
  checkServerVersionAndReload();
});

// V3.13.x: 테스터 모드 토글 — ON 시 메모리 snapshot 백업, OFF 시 그 snapshot으로 복원
// (이전: ON/OFF 모두 saveState(true) → 메모리 누적 변경 사항이 cloud에 저장되버림)
let _testerModeBackupState = null;
async function toggleTesterMode() {
  state.preferences = state.preferences || {};
  if (!state.preferences.testerMode) {
    // ON: 현재 state 백업 — 메모리 + cloud row 둘 다 (사용자 요청 2026-04-28: reload 후에도 복원 가능)
    _testerModeBackupState = JSON.parse(JSON.stringify(state));
    try {
      await _saveTesterBackupToCloud(_testerModeBackupState);
    } catch (e) { console.warn('tester backup cloud save:', e); }
    state.preferences.testerMode = true;
    // 사용자 보고 2026-04-28: 튜토리얼 직전 예약된 saveToCloud setTimeout 즉시 취소
    // (debounce로 1초 후 fire 예정 → 그때 state엔 시드 적용돼 있어 cloud로 새던 버그)
    if (typeof syncTimeout !== 'undefined' && syncTimeout) {
      clearTimeout(syncTimeout);
      syncTimeout = null;
    }
    refreshTesterModeUI();
    showToast('🧪 테스터 모드 ON — 변경 저장 X. OFF 또는 새로고침 후 OFF 시 ON 직전 상태로 복원.');
    return;
  }
  // OFF: 메모리 backup 우선, 없으면 cloud backup row에서 복원
  if (_testerModeBackupState) {
    Object.keys(state).forEach(k => delete state[k]);
    Object.assign(state, _testerModeBackupState);
    _testerModeBackupState = null;
    saveState(true);
    await _deleteTesterBackupFromCloud();
    refreshTesterModeUI();
    showToast('✦ 테스터 모드 OFF — ON 직전 상태로 복원됨. 새로고침...');
    // 사용자 명시 2026-05-01 (agent audit): 600ms reload race fix — saveToCloudNow 1초 debounce 보다 짧아 cloud 저장 안 끝나고 reload 되던 자리. await 로 보장.
    try { if (typeof saveToCloudNow === 'function') await saveToCloudNow(); } catch {}
    location.reload();
    return;
  }
  // 메모리 backup 없음 — cloud backup row 시도
  showToast('🔄 cloud 백업 검색 중...');
  const cloudBackup = await _loadTesterBackupFromCloud();
  if (cloudBackup) {
    Object.keys(state).forEach(k => delete state[k]);
    Object.assign(state, cloudBackup);
    state.preferences = state.preferences || {};
    state.preferences.testerMode = false;
    saveState(true);
    await _deleteTesterBackupFromCloud();
    refreshTesterModeUI();
    showToast('✦ cloud 백업에서 복원됨. 새로고침...');
    // 사용자 명시 2026-05-01 (agent audit): 600ms reload race fix.
    try { if (typeof saveToCloudNow === 'function') await saveToCloudNow(); } catch {}
    location.reload();
    return;
  }
  // cloud 백업도 없음 — flag만 끄기
  state.preferences.testerMode = false;
  saveState(true);
  refreshTesterModeUI();
  showToast('✦ 테스터 모드 OFF (백업 X — flag 만 지움)');
  try { if (typeof saveToCloudNow === 'function') await saveToCloudNow(); } catch {}
  location.reload();
}

// 사용자 요청 2026-04-28: testerMode backup cloud 저장/복원/삭제 헬퍼
async function _saveTesterBackupToCloud(stateData) {
  if (!authUserId) return;
  // testerMode flag 자체는 backup에서 false로 저장 (복원 후 자동 OFF 상태)
  const sanitized = JSON.parse(JSON.stringify(stateData));
  if (sanitized.preferences) sanitized.preferences.testerMode = false;
  // 기존 backup row 있는지 체크
  const checkResp = await fetch(
    `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${V4_TESTER_BACKUP_USER_ID}&select=id&limit=1`,
    { headers: authHeaders() }
  );
  const existing = await checkResp.json();
  const body = JSON.stringify({ data: { ...sanitized, _backup_meta: { type: 'tester_mode', createdAt: new Date().toISOString() } } });
  if (existing.length > 0) {
    await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${V4_TESTER_BACKUP_USER_ID}`,
      { method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body }
    );
  } else {
    await fetch(`${SUPABASE_URL}/rest/v1/soragodong_data`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ auth_user_id: authUserId, user_id: V4_TESTER_BACKUP_USER_ID, data: { ...sanitized, _backup_meta: { type: 'tester_mode', createdAt: new Date().toISOString() } } })
    });
  }
}
async function _loadTesterBackupFromCloud() {
  if (!authUserId) return null;
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${V4_TESTER_BACKUP_USER_ID}&select=data&limit=1`,
      { headers: authHeaders() }
    );
    if (!resp.ok) return null;
    const rows = await resp.json();
    if (rows.length === 0) return null;
    const data = rows[0].data;
    if (data && data._backup_meta) delete data._backup_meta;
    return data;
  } catch (e) { console.warn('load tester backup:', e); return null; }
}
async function _deleteTesterBackupFromCloud() {
  if (!authUserId) return;
  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${V4_TESTER_BACKUP_USER_ID}`,
      { method: 'DELETE', headers: authHeaders() }
    );
  } catch (e) { console.warn('delete tester backup:', e); }
}
// 알림 기능 미적용됨 — 진짜 백그라운드 푸시는 Phase C (백엔드 + Service Worker) 적용된 후 활성.

function refreshTesterModeUI() {
  const btn = document.getElementById('testerModeToggleBtn');
  if (!btn) return;
  const on = state.preferences && state.preferences.testerMode;
  btn.textContent = on ? '🧪 테스터 모드: ON (변경 저장 X)' : '🧪 테스터 모드: OFF';
  btn.style.background = on ? 'rgba(232,163,163,0.15)' : '';
  btn.style.color = on ? '#f0c0c0' : '';
  btn.style.borderColor = on ? 'rgba(232,163,163,0.4)' : '';
  // 헤더에 시각 배지
  let badge = document.getElementById('testerModeBadge');
  if (on) {
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'testerModeBadge';
      badge.style.cssText = 'position:fixed; top:8px; left:50%; transform:translateX(-50%); background:#e8a3a3; color:#000; padding:4px 12px; border-radius:12px; font-size:10px; font-weight:600; z-index:9999; letter-spacing:0.5px;';
      badge.textContent = '🧪 TESTER MODE';
      document.body.appendChild(badge);
    }
  } else {
    if (badge) badge.remove();
  }
}

