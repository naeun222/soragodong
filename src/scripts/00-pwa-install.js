  // PWA 설치 — Android beforeinstallprompt 캡처 + 1탭 설치 / iOS manual fallback (사용자 명시 2026-04-30 ultrathink)
  var _deferredPwaPrompt = null;
  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    _deferredPwaPrompt = e;
    var btn = document.getElementById('pwaInstallBtn');
    if (btn) btn.style.display = '';
  });
  window.addEventListener('appinstalled', function() {
    _deferredPwaPrompt = null;
    var card = document.getElementById('loginPwaCard');
    if (card) card.style.display = 'none';
    if (typeof showToast === 'function') showToast('🐚 앱 설치 완료');
  });
  async function triggerPwaInstall() {
    if (!_deferredPwaPrompt) {
      if (typeof showToast === 'function') showToast('자동 설치 X — 수동 3 단계 참고');
      return;
    }
    _deferredPwaPrompt.prompt();
    try {
      var choice = await _deferredPwaPrompt.userChoice;
      if (choice && choice.outcome === 'accepted' && typeof showToast === 'function') {
        showToast('🐚 설치 시작');
      }
    } catch (e) { console.warn('[pwa install]', e); }
    _deferredPwaPrompt = null;
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
