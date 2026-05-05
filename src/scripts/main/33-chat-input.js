// ═══════════════════════════════════════════════════════════════
// CHAT INPUT
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // V4 (사용자 명시 2026-05-04 ultrathink V181 근본 해결): 모바일 입력창 렉 다층 해결
  // 근본 원인 4가지:
  //  1. _resizeTextarea: style.height='auto' set + scrollHeight read + height set = 매 keystroke 2~3회 강제 reflow (1.6MB DOM 에서 누적 → 모바일 lag 체감)
  //  2. IME composition 미처리 — 한글 자모(ㅎ→하→한) 입력마다 input event 발생 → 자모 단위 resize
  //  3. textarea 자체에 contain 미적용 → height 변경이 fixed chat-input-bar 외부로 layout 전파
  //  4. 동일 높이여도 무조건 set → 불필요한 repaint
  // 해결 다층 (CSS + JS):
  //  ① compositionstart/end flag — IME 한글 입력 중 resize skip, end 시 1회 final
  //  ② height 변화량 1px 미만이면 set skip (max 도달 후 매 keystroke 무동작)
  //  ③ rAF coalesce 보존 (frame당 1회)
  //  ④ CSS .chat-textarea { contain: layout style; field-sizing: content; } — Chrome 123+/Safari 17+ native auto-size, 미지원 브라우저는 JS fallback
  const _resizeTextarea = (el, max) => {
    if (el._composing) return;            // ① IME 한글 입력 중 skip
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, max);
    if (Math.abs(next - el.offsetHeight) >= 1) {  // ② 동일 높이 skip
      el.style.height = next + 'px';
    }
  };
  const _makeRafResizer = (el, max) => {
    let raf = 0;
    return () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; _resizeTextarea(el, max); });
    };
  };
  const _bindAutoResize = (el, max) => {
    if (!el) return;
    const resize = _makeRafResizer(el, max);
    el.addEventListener('compositionstart', () => { el._composing = true; });
    el.addEventListener('compositionend',   () => { el._composing = false; resize(); });
    el.addEventListener('input', resize);
  };
  const ta = document.getElementById('chatInput');
  _bindAutoResize(ta, 140);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isMobile()) {
      e.preventDefault(); sendChat();
    }
  });
  // 사용자 요청 2026-04-29: 숙고 입력바도 메인 chat 처럼 자동 높이 (max 140px)
  const reflTa = document.getElementById('reflectionInput');
  if (reflTa) {
    _bindAutoResize(reflTa, 140);
    reflTa.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !isMobile()) {
        e.preventDefault(); sendReflectionChat();
      }
    });
  }
  ['sleepStart', 'sleepEnd'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updateSleepDuration);
  });
  // Enter key on login email
  const loginEmail = document.getElementById('loginEmail');
  if (loginEmail) {
    loginEmail.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); handleSendCode(); }
    });
  }
  // Enter key on login code
  const loginCode = document.getElementById('loginCode');
  if (loginCode) {
    loginCode.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); handleVerifyCode(); }
    });
    // Auto-submit when full code entered
    loginCode.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, ''); // numeric only
      if (e.target.value.length >= 8) {
        setTimeout(() => handleVerifyCode(), 100);
      }
    });
  }
});

function isMobile() {
  return /Android|iPhone|iPad/i.test(navigator.userAgent);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

init();
