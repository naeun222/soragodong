// ═══════════════════════════════════════════════════════════════
// GUEST ENTRY (Phase 1 — UX redesign)
// ═══════════════════════════════════════════════════════════════
// 사용자 명시 2026-05-06 ultrathink: 첫 화면 = 로그인 또는 게스트 명시 선택.
// 자동 anonymous 폐기 — 사용자가 '둘러보기' 누르면 그제야 anonymous signup.

async function enterGuestMode() {
  // 사용자 명시 2026-05-06 ultrathink: 게스트 진입 marker — 카카오 promote 후 비밀번호 설정 직후 PWA 유도 detect 용.
  try { sessionStorage.setItem('soragodong_was_guest', '1'); } catch {}
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
        btn.innerHTML = '<span class="guest-btn-leaf" aria-hidden="true">🌱</span><span class="guest-btn-text">그냥 해보기</span><span class="guest-btn-arrow" aria-hidden="true">→</span>';
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
      btn.innerHTML = '<span class="guest-btn-leaf" aria-hidden="true">🌱</span><span class="guest-btn-text">그냥 해보기</span><span class="guest-btn-arrow" aria-hidden="true">→</span>';
    }
  }
}

// 4 PIPA 동의 — 전체 동의 토글.
function _toggleAllLoginConsents(masterEl) {
  ['loginConsentTerms', 'loginConsentSensitive', 'loginConsentCrossBorder', 'loginConsentAdult'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = masterEl.checked;
  });
}
function _syncAllLoginConsentToggle() {
  const all = document.getElementById('loginConsentAll');
  if (!all) return;
  all.checked = ['loginConsentTerms', 'loginConsentSensitive', 'loginConsentCrossBorder', 'loginConsentAdult'].every(id => {
    const el = document.getElementById(id);
    return el && el.checked;
  });
}
