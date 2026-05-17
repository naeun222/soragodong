// V4 (사용자 명시 2026-05-18 ultrathink): Samsung 갤럭시에 Twemoji (Twitter Open Source) emoji 적용.
//   사용자 명시 2026-05-18 (재): Apple emoji (emojicdn) 별로. Twemoji 로 변경 + 크기 갤럭시 native 와 동일하게.
//   Twemoji default = Twitter 디자인. Apache 2.0 라이센스. CDN jsdelivr 호스팅.
//   img.emoji 의 height/width = 1em (CSS 09-misc.css 마지막) — 갤럭시 native 와 동일 크기.
//   iOS / macOS / iPadOS / Pixel / Windows / 일반 Android = native 유지 (Samsung 갤럭시만 적용).
//   동적 컨텐츠 (chat 메시지 추가 / render 함수 호출) 자동 대응 — debounced MutationObserver.
(function _initTwemoji() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const _ua = (navigator && navigator.userAgent) || '';
  // V4 fix (사용자 명시 2026-05-18 ultrathink): Samsung 갤럭시 (Android + SM- 모델 또는 Samsung UA) 만 적용.
  //   Apple native = OK. Windows / Pixel / 일반 Android 도 Twemoji 별로 = native 유지.
  //   Capacitor WebView UA 예: 'Mozilla/5.0 (Linux; Android 13; SM-F916N) AppleWebKit/...'.
  const _isSamsung = /Android/.test(_ua) && (/SM-/.test(_ua) || /Samsung/i.test(_ua));
  if (!_isSamsung) return;
  const _sc = document.createElement('script');
  _sc.src = 'https://cdn.jsdelivr.net/npm/@twemoji/api@latest/dist/twemoji.min.js';
  _sc.async = true;
  _sc.onload = () => {
    try {
      if (!window.twemoji || !document.body) return;
      // Twemoji default = Twitter 디자인. callback 없음 = standard Twemoji CDN URL.
      try { window.twemoji.parse(document.body); } catch (_e) {}
      let _pending = false;
      const _debounced = () => {
        if (_pending) return;
        _pending = true;
        requestAnimationFrame(() => {
          _pending = false;
          try { window.twemoji.parse(document.body); } catch (_e) {}
        });
      };
      new MutationObserver(_debounced).observe(document.body, { childList: true, subtree: true });
    } catch (e) {
      console.warn('[twemoji] init:', e);
    }
  };
  _sc.onerror = () => console.warn('[twemoji] CDN 로드 실패 — fallback native emoji');
  document.head.appendChild(_sc);
})();
