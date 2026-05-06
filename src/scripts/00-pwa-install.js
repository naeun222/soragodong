  // PWA 설치 — Android beforeinstallprompt 캡처 + 1탭 설치 / iOS manual fallback (사용자 명시 2026-04-30 ultrathink)
  // 사용자 명시 2026-05-06 ultrathink: window._deferredPwaPrompt 로 노출 — 다른 모듈 (renderPwaInstallInlineCard) 가 button 활성화 검사 가능.
  window._deferredPwaPrompt = null;
  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    window._deferredPwaPrompt = e;
    var btn = document.getElementById('pwaInstallBtn');
    if (btn) btn.style.display = '';
  });
  window.addEventListener('appinstalled', function() {
    window._deferredPwaPrompt = null;
    var card = document.getElementById('loginPwaCard') || document.getElementById('pwaInstallInlineCard');
    if (card) card.style.display = 'none';
    // 사용자 명시 2026-05-06 ultrathink: 스티키 button 도 hide — 설치 완료 후 시각 노출 X.
    if (typeof _hidePwaStickyBtn === 'function') _hidePwaStickyBtn();
    // 사용자 명시 2026-05-06 ultrathink: 설치 완료 마킹 — 인라인 카드 재노출 차단.
    try {
      if (typeof state !== 'undefined' && state) {
        state.preferences = state.preferences || {};
        state.preferences.pwaInstallPrompted = state.preferences.pwaInstallPrompted || {};
        state.preferences.pwaInstallPrompted.installed = true;
        if (typeof saveState === 'function') saveState();
      }
    } catch (_e) {}
    if (typeof showToast === 'function') showToast('🐚 앱 설치 완료');
  });
  async function triggerPwaInstall() {
    if (!window._deferredPwaPrompt) {
      if (typeof showToast === 'function') showToast('자동 설치 X — 수동 3 단계 참고');
      return;
    }
    window._deferredPwaPrompt.prompt();
    try {
      var choice = await window._deferredPwaPrompt.userChoice;
      if (choice && choice.outcome === 'accepted' && typeof showToast === 'function') {
        showToast('🐚 설치 시작');
      }
    } catch (e) { console.warn('[pwa install]', e); }
    window._deferredPwaPrompt = null;
    var btn = document.getElementById('pwaInstallBtn');
    if (btn) btn.style.display = 'none';
  }
  function setPwaTab(os) {
    document.querySelectorAll('.pwa-tab').forEach(function(b) {
      b.classList.toggle('active', b.dataset.os === os);
    });
    var ios = document.getElementById('pwaStepsIos');
    var and = document.getElementById('pwaStepsAndroid');
    if (ios) ios.style.display = os === 'ios' ? '' : 'none';
    if (and) and.style.display = os === 'android' ? '' : 'none';
  }
  // 사용자 명시 2026-04-30: 모바일 브라우저면 PWA takeover (login form 숨김), desktop/standalone 은 PWA 카드 자체 숨김.
  function escapePwaTakeover() {
    document.body.classList.remove('pwa-takeover');
  }
  (function initLoginPwa() {
    var card = document.getElementById('loginPwaCard');
    if (!card) return;
    var isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
      || window.navigator.standalone === true;
    var ua = navigator.userAgent;
    var isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    if (isStandalone || !isMobile) {
      // standalone (이미 PWA) 또는 desktop — PWA 카드 자체 숨김
      card.style.display = 'none';
      return;
    }
    // 모바일 브라우저 — takeover 모드 (login form 숨김, PWA 우선)
    document.body.classList.add('pwa-takeover');
    var defaultOs = 'ios';
    if (/Android/i.test(ua)) defaultOs = 'android';
    setPwaTab(defaultOs);
  })();
