// ═══════════════════════════════════════════════════════════════
// GUEST ENTRY (Phase 1 — UX redesign)
// ═══════════════════════════════════════════════════════════════
// 사용자 명시 2026-05-06 ultrathink: 첫 화면 = 로그인 또는 게스트 명시 선택.
// 자동 anonymous 폐기 — 사용자가 '둘러보기' 누르면 그제야 anonymous signup.

async function enterGuestMode() {
  const btn = document.getElementById('guestEntryBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '시작하는 중...';
  }
  try {
    if (typeof signInAnonymouslyForGuest !== 'function') {
      alert('초기화 오류 — 페이지 새로고침');
      return;
    }
    const result = await signInAnonymouslyForGuest();
    if (!result.ok) {
      console.warn('[guest entry] fail:', result);
      const detail = result.detail ? ('\n\n' + result.detail) : '';
      alert('지금 둘러보기를 시작할 수 없어. 잠시 후 다시 시도하거나 로그인해줘.' + detail);
      if (btn) {
        btn.disabled = false;
        btn.textContent = '🌱 그냥 해보기';
      }
      return;
    }
    // 게스트 진입 성공 — 페이지 reload 로 init() 다시 (anonymous 세션 적용된 상태로 자연스럽게).
    window.location.reload();
  } catch (e) {
    console.error('[guest entry] throw:', e);
    alert('네트워크 오류 — 잠시 후 다시');
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🌱 그냥 해보기';
    }
  }
}

