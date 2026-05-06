// ═══════════════════════════════════════════════════════════════
// V4 (사용자 명시 2026-05-06 ultrathink): PWA 설치 인라인 카드.
// 두 trigger:
//   1. 첫 체크인 submit 후 — 일반 신규 사용자 (state.entries.length === 1).
//   2. 게스트 → 카카오 가입 후 비밀번호 설정 직후 — state.preferences._wasGuestPromoted === true.
// 가드: 1회 fire (state.preferences.pwaInstallPrompted), 7일 cool-down 최대 3회, 모바일+비-standalone, dismissed/installed 시 skip.
// 옛 PWA 인프라 (00-pwa-install.js / .pwa-install-1tap / .pwa-tabs / .pwa-step-* CSS) 재사용.
// ═══════════════════════════════════════════════════════════════

function shouldShowPwaInstallPrompt() {
  if (typeof state === 'undefined' || !state) return false;
  // standalone (이미 PWA) / desktop / 비-모바일 — skip.
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return false;
    if (window.navigator.standalone === true) return false;
    const ua = navigator.userAgent;
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    if (!isMobile) return false;
  } catch {}
  state.preferences = state.preferences || {};
  const p = state.preferences.pwaInstallPrompted || {};
  if (p.installed) return false;
  if (p.dismissed) return false;
  if (p.count && p.count >= 3) return false;
  if (p.lastAt) {
    try {
      const last = new Date(p.lastAt).getTime();
      if (Date.now() - last < 7 * 86400000) return false;
    } catch {}
  }
  return true;
}

// opts.target = 'home' (mainActionContainer 위 inline) | 'floating' (fixed bottom)
function renderPwaInstallInlineCard(opts) {
  if (!shouldShowPwaInstallPrompt()) return;
  if (document.getElementById('pwaInstallInlineCard')) return;
  const target = (opts && opts.target) || 'home';

  const ua = navigator.userAgent;
  const isAndroid = /Android/i.test(ua);
  // 옛 login-pwa 카드 (git c2bcf0b^) 의 step 카피 압축. 2026-04-30 ultrathink 톤 유지.
  const stepsHtml = isAndroid
    ? `<button type="button" id="pwaInstallBtn" onclick="triggerPwaInstall()" class="btn-primary pwa-install-1tap" style="${window._deferredPwaPrompt ? '' : 'display:none;'} width:100%; margin-bottom:10px; padding:11px;">📱 한 번에 설치 ✦</button>
       <div class="pwa-step-group">
         <div class="pwa-step-label">📱 삼성 인터넷</div>
         <div class="pwa-step">≡ → <b>[전체 페이지 추가]</b> → <b>[홈 화면]</b></div>
       </div>
       <div class="pwa-step-group">
         <div class="pwa-step-label">🌐 크롬 / Edge</div>
         <div class="pwa-step">⋮ → <b>[홈 화면에 추가]</b> 또는 <b>[앱 설치]</b></div>
       </div>`
    : `<div class="pwa-step">1. <b>Safari</b> 하단 <b>공유 ↗</b></div>
       <div class="pwa-step">2. <b>[홈 화면에 추가]</b></div>`;

  const card = document.createElement('div');
  card.id = 'pwaInstallInlineCard';
  card.className = 'pwa-inline-card' + (target === 'floating' ? ' pwa-inline-card-floating' : '');
  card.innerHTML = `
    <button class="pwa-inline-dismiss" onclick="_dismissPwaInstallCard()" aria-label="닫기">✕</button>
    <div class="pwa-inline-title">📱 홈 화면에 두면 더 편해</div>
    <div class="pwa-inline-sub">매일 한 번 — 한 탭으로 바로 ✦</div>
    ${stepsHtml}
  `;

  if (target === 'home') {
    const container = document.getElementById('mainActionContainer');
    if (container && container.parentNode) {
      container.parentNode.insertBefore(card, container);
    } else {
      document.body.appendChild(card);
    }
  } else {
    document.body.appendChild(card);
    requestAnimationFrame(() => card.classList.add('show'));
  }

  // 마킹 — count++ / lastAt
  state.preferences = state.preferences || {};
  state.preferences.pwaInstallPrompted = state.preferences.pwaInstallPrompted || { count: 0 };
  state.preferences.pwaInstallPrompted.count = (state.preferences.pwaInstallPrompted.count || 0) + 1;
  state.preferences.pwaInstallPrompted.lastAt = new Date().toISOString();
  try { saveState(); } catch {}
}

function _dismissPwaInstallCard() {
  const card = document.getElementById('pwaInstallInlineCard');
  if (card) {
    card.classList.add('pwa-inline-card-fadeout');
    setTimeout(() => { try { card.remove(); } catch {} }, 240);
  }
  try {
    state.preferences = state.preferences || {};
    state.preferences.pwaInstallPrompted = state.preferences.pwaInstallPrompted || {};
    state.preferences.pwaInstallPrompted.dismissedAt = new Date().toISOString();
    saveState();
  } catch {}
}
