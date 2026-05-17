// V4 (사용자 명시 2026-05-18 ultrathink): non-Apple 디바이스 (갤럭시 Android 등) 에 Twemoji 적용.
//   사용자 보고: 갤럭시 native emoji 디자인 별로. iPhone 디자인 통일 요청.
//   Apple Color Emoji 폰트 self-host = 라이센스 회색 영역 → Twemoji (Twitter, Apache 2.0) 선택.
//   iOS / macOS / iPadOS 는 native Apple Color Emoji 유지 (skip — perf + 자연 보존).
//   동적 컨텐츠 (chat 메시지 추가 / render 함수 호출) 자동 대응 — debounced MutationObserver.
//   CDN fail 시 fallback = native emoji (silent).
(function _initTwemoji() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const _ua = (navigator && navigator.userAgent) || '';
  // Apple = native Apple Color Emoji 우수 → skip.
  if (/iPad|iPhone|iPod|Macintosh/.test(_ua)) return;
  const _sc = document.createElement('script');
  _sc.src = 'https://cdn.jsdelivr.net/npm/@twemoji/api@latest/dist/twemoji.min.js';
  _sc.async = true;
  _sc.onload = () => {
    try {
      if (!window.twemoji || !document.body) return;
      // 초기 parse — 이미 render 된 emoji 들 swap.
      try { window.twemoji.parse(document.body); } catch (_e) {}
      // 동적 컨텐츠 — debounced MutationObserver. requestAnimationFrame 으로 frame 당 1회 cap.
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
