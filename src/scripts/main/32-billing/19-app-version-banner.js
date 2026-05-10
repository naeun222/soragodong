// V3.13.x: 앱 버전 — 매 git push 전 갱신. 새 버전 진입 시 튜토리얼 자동 시작.
const APP_VERSION = 'v4.0.201-402-reason-log';
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

// 사용자 명시 2026-05-05: legacy bonus 정책 폐기 → 배너 candidate 에서 제거.
const _BANNER_CANDIDATES = [
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

// === 배너 1: sync tip (헤더 알약 안내) — 코어 다 끝낸 기존 사용자 한정 ===
// 사용자 명시 2026-05-05: legacy bonus 1,000원 배너 + claim/dismiss 함수 제거 (정책 폐기).
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
  if (type === 'syncTip') {
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
