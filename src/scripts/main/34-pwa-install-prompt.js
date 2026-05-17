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
  // V4 fix (사용자 보고 2026-05-18 ultrathink): Capacitor native (Android/iOS app) — 이미 native 라 PWA 설치 권유 X.
  try { if (typeof isCapacitorNative === 'function' && isCapacitorNative()) return false; } catch {}
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
// opts.force = true 면 가드 우회 + 마킹 X — sticky button 누른 사용자 명시 trigger 용.
function renderPwaInstallInlineCard(opts) {
  const force = !!(opts && opts.force);
  if (!force && !shouldShowPwaInstallPrompt()) return;
  if (document.getElementById('pwaInstallInlineCard')) return;
  const target = (opts && opts.target) || 'home';

  const ua = navigator.userAgent;
  const isAndroid = /Android/i.test(ua);
  // 사용자 보고 2026-05-06 (재): 옛 login-pwa 카드 (git c2bcf0b^) 의 step 카피 그대로 — 정확함.
  const stepsHtml = isAndroid
    ? `<button type="button" id="pwaInstallBtn" onclick="triggerPwaInstall()" class="btn-primary pwa-install-1tap" style="${window._deferredPwaPrompt ? '' : 'display:none;'} width:100%; margin-bottom:12px; padding:14px;">📱 앱 설치 ✦</button>
       <div class="pwa-step-group">
         <div class="pwa-step-label">📱 삼성 인터넷 (갤럭시 기본)</div>
         <div class="pwa-step">1. 우측 하단 <b>더보기 (≡)</b> 누르기</div>
         <div class="pwa-step">2. <b>[전체 페이지 추가]</b></div>
         <div class="pwa-step">3. <b>[홈 화면]</b> 누르기</div>
       </div>
       <div class="pwa-step-group">
         <div class="pwa-step-label">🌐 크롬 / Edge / Brave</div>
         <div class="pwa-step">1. 우측 상단 <b>메뉴 [⋮]</b> 누르기</div>
         <div class="pwa-step">2. <b>[홈 화면에 추가]</b> 또는 <b>[앱 설치]</b></div>
         <div class="pwa-step">3. <b>[설치]</b> → 앱처럼 작동</div>
       </div>
       <div class="pwa-step-note">Firefox / 인앱 브라우저는 설치 X — 위 둘 중 하나로 열어줘.</div>`
    : `<div class="pwa-step">1. <b>사파리(Safari)</b>로 이 사이트 열기</div>
       <div class="pwa-step">2. 하단 <b>더보기 (⋯)</b> → <b>공유 (⬆)</b> 누르기</div>
       <div class="pwa-step">3. <b>더보기 (∨)</b> → <b>[홈 화면에 추가]</b></div>`;

  const card = document.createElement('div');
  card.id = 'pwaInstallInlineCard';
  card.className = 'pwa-inline-card' + (target === 'floating' ? ' pwa-inline-card-floating' : '');
  // 사용자 명시 2026-05-06 ultrathink: force (sticky button 누른 사용자) 면 카피 변경 — '앱에서 볼래?' 톤.
  const titleHtml = force
    ? '📱 앱에서 볼래?'
    : '📱 홈 화면에 두면 더 편해';
  const subHtml = force
    ? '아직 앱 출시 전이라 — 홈 화면에 두면 앱처럼 ✦'
    : '매일 한 번 — 한 탭으로 바로 ✦';
  card.innerHTML = `
    <button class="pwa-inline-dismiss" onclick="_dismissPwaInstallCard()" aria-label="닫기">✕</button>
    <div class="pwa-inline-title">${titleHtml}</div>
    <div class="pwa-inline-sub">${subHtml}</div>
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

  // 마킹 — count++ / lastAt. force=true (sticky button) 면 마킹 skip — 사용자 명시 클릭이라 자동 trigger cool-down 영향 X.
  if (!force) {
    state.preferences = state.preferences || {};
    state.preferences.pwaInstallPrompted = state.preferences.pwaInstallPrompted || { count: 0 };
    state.preferences.pwaInstallPrompted.count = (state.preferences.pwaInstallPrompted.count || 0) + 1;
    state.preferences.pwaInstallPrompted.lastAt = new Date().toISOString();
    try { saveState(); } catch {}
  }
}

// 사용자 명시 2026-05-06 ultrathink: 스티키 동그라미 button — 우하단 fixed. 클릭 시 PWA 설치 카드 토글.
// 노출 조건: 모바일 + 비-standalone + 미설치. 모든 화면 (홈 / 도서관 / 챗 등) 공통.
function _ensurePwaStickyBtn() {
  if (document.getElementById('pwaStickyBtn')) return;
  // V4 fix (사용자 보고 2026-05-18 ultrathink): Capacitor native — sticky button 노출 X.
  try { if (typeof isCapacitorNative === 'function' && isCapacitorNative()) return; } catch {}
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return;
    if (window.navigator.standalone === true) return;
    const ua = navigator.userAgent;
    if (!/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return;
  } catch {}
  try {
    if (state && state.preferences && state.preferences.pwaInstallPrompted
        && state.preferences.pwaInstallPrompted.installed) return;
  } catch {}
  const btn = document.createElement('button');
  btn.id = 'pwaStickyBtn';
  btn.className = 'pwa-sticky-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', '앱에서 볼래 — 홈 화면에 설치 가이드');
  btn.innerHTML = '<span class="pwa-sticky-icon">📱</span>';
  btn.addEventListener('click', _togglePwaStickyCard);
  document.body.appendChild(btn);
}

async function _togglePwaStickyCard() {
  const existing = document.getElementById('pwaInstallInlineCard');
  if (existing) {
    _dismissPwaInstallCard();
    return;
  }
  // 사용자 명시 2026-05-06 ultrathink: Android + beforeinstallprompt 캡처됐으면 native install dialog 즉시 호출 (1탭 흐름).
  // 거부 (dismissed) 또는 미지원 (iOS / Firefox / 인앱) 시 manual 가이드 카드 fallback.
  if (window._deferredPwaPrompt) {
    try {
      const ev = window._deferredPwaPrompt;
      ev.prompt();
      const choice = await ev.userChoice;
      window._deferredPwaPrompt = null;
      if (choice && choice.outcome === 'accepted') {
        if (typeof showToast === 'function') showToast('🐚 설치 시작');
        return;
      }
      // dismissed — 사용자가 native dialog 거부. manual 가이드 fallback 도 추가 부담 → toast 만 띄우고 끝.
      if (typeof showToast === 'function') showToast('나중에 다시 눌러봐 🐚');
      return;
    } catch (e) { console.warn('[pwa native]', e); }
  }
  // beforeinstallprompt 미캡처 (iOS / Firefox / 인앱) — manual 가이드 카드.
  renderPwaInstallInlineCard({ target: 'floating', force: true });
}

function _hidePwaStickyBtn() {
  const btn = document.getElementById('pwaStickyBtn');
  if (btn) btn.remove();
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
