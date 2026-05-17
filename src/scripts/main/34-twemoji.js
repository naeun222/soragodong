// V4 (사용자 명시 2026-05-18 ultrathink): Samsung 갤럭시에 Apple emoji 디자인 적용.
//   사용자 명시 "Twitter 이모지 별로. iPhone 이모지로 바꾸자. 갤럭시도."
//   Twemoji parser 인프라 활용 + image URL 만 emojicdn.elk.sh?style=apple 로 swap.
//   Apple Color Emoji = Apple proprietary. emojicdn.elk.sh CDN 활용 — self-host 부담 X / 단 CDN 의존성 + 라이센스 회색 영역.
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
      // Apple emoji style 로 swap — Twemoji parser callback 으로 image URL 변경.
      // icon = codepoint hex sequence (e.g., "1f600", "1f468-200d-1f469-200d-1f467") → emoji char 로 변환 후 emojicdn 호출.
      const _parseOpts = {
        callback: (icon) => {
          try {
            const _chars = icon.split('-').map(c => parseInt(c, 16));
            const _text = String.fromCodePoint(..._chars);
            return `https://emojicdn.elk.sh/${encodeURIComponent(_text)}?style=apple`;
          } catch (_e) { return false; }
        }
      };
      try { window.twemoji.parse(document.body, _parseOpts); } catch (_e) {}
      let _pending = false;
      const _debounced = () => {
        if (_pending) return;
        _pending = true;
        requestAnimationFrame(() => {
          _pending = false;
          try { window.twemoji.parse(document.body, _parseOpts); } catch (_e) {}
        });
      };
      new MutationObserver(_debounced).observe(document.body, { childList: true, subtree: true });
    } catch (e) {
      console.warn('[apple-emoji] init:', e);
    }
  };
  _sc.onerror = () => console.warn('[apple-emoji] CDN 로드 실패 — fallback native emoji');
  document.head.appendChild(_sc);
})();
