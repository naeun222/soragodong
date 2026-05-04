//  · burst / 별 효과 X (사용자 명시 2026-05-01 탑티어 리디자인 톤 보존)
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
        한 달 쓰면 너 자신이<br>
        다르게 보일지도. 🫂
      </div>
      <div class="welcome-gift-token">
        <span class="welcome-gift-token-label">환영 선물 · 무료 체험</span>
        <span class="welcome-gift-token-amount">🐚 100만 토큰</span>
        <span class="welcome-gift-token-hint">약 한 달치 자유로운 대화</span>
      </div>
      <button class="welcome-gift-btn" id="welcomeGiftAccept">받을게</button>
      <div class="welcome-gift-trust">30일 동안 유효 · 자동 결제 X</div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  const btn = overlay.querySelector('#welcomeGiftAccept');
  btn.addEventListener('click', async () => {
    if (btn.dataset._processing === '1') return;
    btn.dataset._processing = '1';
    btn.disabled = true;
    btn.textContent = '받는 중...';
    try { await _acceptWelcomeGift(); } catch (e) { console.warn('[welcome-gift] accept:', e); }
    const tokenEl = overlay.querySelector('.welcome-gift-token');
    if (tokenEl) tokenEl.classList.add('received');
    btn.textContent = '받았어 ✦';
    setTimeout(() => {
      overlay.classList.remove('show');
      setTimeout(() => { try { overlay.remove(); } catch {} }, 300);
      window._showingWelcomeGift = false;
    }, 800);
  });
}
async function _acceptWelcomeGift() {
  // V4 (v8 사용자 명시 2026-05-03 ultrathink — v2 §8): client-side state.welcomeGift 기록 (30일 카운트) + backend POST grant. 신규 진입 즉시 환영 = 폐기, Core 1 끝 환영만 활성.
  state.welcomeGift = {
    grantedAt: new Date().toISOString(),
    tokensGranted: 1_000_000,
    tokensRemaining: 1_000_000,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  };
  state._welcomeGiftAccepted = true;
  state.preferences = state.preferences || {};
  state.preferences._welcomeBonusShown = true;  // 옛 flag 도 set (재출현 방지)
  try { saveState({ force: true }); } catch {}
  if (typeof saveToCloudNow === 'function') {
    saveToCloudNow().catch(e => console.warn('[welcomeGift] cloud sync:', e));
  }
  // backend POST — idempotent (already_granted 처리). 실제 grant 보장.
  if (typeof session !== 'undefined' && session && session.access_token && typeof _authedFetch === 'function') {
    try {
      const resp = await _authedFetch('/api/billing/welcome-bonus', { method: 'POST' });
      if (resp.ok) {
        const data = await resp.json().catch(() => ({}));
        if (data.already_granted) {
          if (typeof showToast === 'function') showToast('✦ 이미 받았어');
        } else if (data.granted) {
          if (typeof showToast === 'function') showToast('🎁 100만 토큰 받았어 ✦');
        }
        if (typeof refreshBillingStatus === 'function') refreshBillingStatus(false).catch(() => {});
      } else {
        console.warn('[welcomeGift] backend 비-OK:', resp.status);
      }
    } catch (e) { console.warn('[welcomeGift] backend:', e); }
  } else {
    if (typeof showToast === 'function') showToast('🎁 100만 토큰 지급 ✦');
  }
  // V4 (v8 사용자 명시 2026-05-03 ultrathink — v2 §1 [5] / §6 명시): 환영 선물 후 Core 2 자동 unlock 권유 (passive 안내)
  setTimeout(() => {
    if (state._core2NotUnlocked && typeof _showCore2EntryModal === 'function') {
      _showCore2EntryModal();
    }
  }, 600);
}

// V4 (v8 묶음 13): 카드 시각화 모달 — Core 2 튜토리얼 saveMsgAsStrategy 직후 자동
