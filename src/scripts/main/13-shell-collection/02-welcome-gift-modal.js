// V4 (사용자 명시 2026-05-06 ultrathink 정정): 옛 "early_light auto-grant 30일 무료" 가정 폐기.
// 실제 backend = 신규 가입 시 무료 토큰 (credit_balance) grant, plan 자동 활성화 X. 양은 비공개.
// 이 모달은 환영 인사 + 자유롭게 써보기 안내 + 클라이언트 flag set (재출현 방지) — backend grant 호출 X.
function _showWelcomeGiftModal() {
  if (window._showingWelcomeGift) return;
  if (document.getElementById('welcomeGiftOverlay')) return;
  window._showingWelcomeGift = true;
  const overlay = document.createElement('div');
  overlay.className = 'welcome-gift-overlay';
  overlay.id = 'welcomeGiftOverlay';
  overlay.innerHTML = `
    <div class="welcome-gift-modal">
      <img class="welcome-gift-godong" src="/godongicon.png" alt="소라고동">
      <div class="welcome-gift-celebrate">🎉 첫 한 바퀴 끝!</div>
      <div class="welcome-gift-greeting">잘 따라왔어 🐚</div>
      <div class="welcome-gift-sub">
        쓰다 보면 너 자신이<br>
        다르게 보일지도. 🫂
      </div>
      <div class="welcome-gift-token">
        <span class="welcome-gift-token-label">🎁 환영 선물</span>
        <span class="welcome-gift-token-amount">자유롭게 써봐</span>
        <span class="welcome-gift-token-hint">마음에 들면 그때 구독</span>
      </div>
      <button class="welcome-gift-btn" id="welcomeGiftAccept">시작할게</button>
      <div class="welcome-gift-trust">자동 결제 X · 마음에 들 때만 구독</div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  const btn = overlay.querySelector('#welcomeGiftAccept');
  btn.addEventListener('click', async () => {
    if (btn.dataset._processing === '1') return;
    btn.dataset._processing = '1';
    btn.disabled = true;
    try { await _acceptWelcomeGift(); } catch (e) { console.warn('[welcome-gift] accept:', e); }
    const tokenEl = overlay.querySelector('.welcome-gift-token');
    if (tokenEl) tokenEl.classList.add('received');
    btn.textContent = '시작 ✦';
    setTimeout(() => {
      overlay.classList.remove('show');
      setTimeout(() => { try { overlay.remove(); } catch {} }, 300);
      window._showingWelcomeGift = false;
    }, 800);
  });
}
async function _acceptWelcomeGift() {
  // 사용자 명시 2026-05-05: backend grant 호출 X — ensureBillingRow 가 신규 가입 시 자동 활성화.
  // 이 함수 = 클라이언트 flag (재출현 방지) + cloud sync + billing refresh 만.
  state._welcomeGiftAccepted = true;
  state.preferences = state.preferences || {};
  state.preferences._welcomeBonusShown = true;
  try { saveState({ force: true }); } catch {}
  if (typeof saveToCloudNow === 'function') {
    saveToCloudNow().catch(e => console.warn('[welcomeGift] cloud sync:', e));
  }
  if (typeof refreshBillingStatus === 'function') {
    refreshBillingStatus(false).catch(() => {});
  }
  if (typeof showToast === 'function') showToast('🐚 자유롭게 써봐 ✦');
  // Core 2 자동 unlock 권유 (passive 안내) — 기존 흐름 보존.
  setTimeout(() => {
    if (state._core2NotUnlocked && typeof _showCore2EntryModal === 'function') {
      _showCore2EntryModal();
    }
  }, 600);
}

// V4 (v8 묶음 13): 카드 시각화 모달 — Core 2 튜토리얼 saveMsgAsStrategy 직후 자동
