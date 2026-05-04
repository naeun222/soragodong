// ═══════════════════════════════════════════════════════════════
// SHELL COLLECTION
// ═══════════════════════════════════════════════════════════════
// V4 (v8 묶음 9): Core 2 진입 모달 — 4단 응답의 🧬/✦ 버튼이 잠금 상태일 때 안내 (3 진입로 통합)
function _showCore2EntryModal() {
  if (window._showingCore2Entry) return;
  window._showingCore2Entry = true;
  const overlay = document.createElement('div');
  overlay.className = 'core2-entry-modal-overlay';
  overlay.innerHTML = `
    <div class="core2-entry-modal">
      <div class="core2-entry-emoji">🐚</div>
      <div class="core2-entry-title">다음 단계 — 행동 변화</div>
      <div class="core2-entry-body">
        아까 본 4단 분석을 <em>진짜</em> 행동으로 옮기면 어떻게 될까?<br>
        같이 따라가보자 ✨
        <div class="core2-entry-small">(일단 마음에 안 들어도 눌러보자 — 시뮬이라 괜찮아 ✨)</div>
      </div>
      <div class="core2-entry-buttons">
        <button class="core2-entry-btn primary" id="core2EntryAccept">좋아 ✦</button>
        <button class="core2-entry-btn secondary" id="core2EntryDecline">지금 말고</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  const cleanup = () => {
    overlay.classList.remove('show');
    setTimeout(() => { try { overlay.remove(); } catch {} }, 200);
    window._showingCore2Entry = false;
  };
  overlay.querySelector('#core2EntryAccept').addEventListener('click', () => { cleanup(); _acceptCore2Entry(); });
  overlay.querySelector('#core2EntryDecline').addEventListener('click', () => { cleanup(); _declineCore2Entry(); });
}
function _acceptCore2Entry() {
  if (typeof startCore2 === 'function') {
    startCore2();
  } else {
    showToast('🐚 잠시만 — 준비 중');
  }
}
function _declineCore2Entry() {
  showToast('🐚 언제든 다시 눌러봐');
}
function _showCore2LockedToast() {
  // V4 (v8 사용자 명시 2026-05-03 ultrathink — v2 §6 명시): 4단 응답 disabled-locked → 단순 토스트.
  // entry modal 자동 권유는 환영 선물 모달 [고마워!] 후 _acceptWelcomeGift 가 trigger (passive 안내).
  showToast('🔒 잠깐만, 다음 단계에서 알려줄게!');
}

// V4 (사용자 명시 2026-05-04 ultrathink V193): 신규 환영 모달 UI 전면 개편 — Core 1 끝 100만 토큰
// 디자인 원칙:
//  · 첫 한 바퀴 완주 축하 + 환영 두 톤 통합 (eyebrow 'celebrate' / 본문 greeting)
//  · godong 아이콘 (브랜드 일관성) + ambient gold glow (modal::before radial)
//  · 토큰 hero: label / amount (대형 그라데이션) / hint — vertical stack
//  · 신뢰 라인 보존 (전상법 §13 / 표시광고법 §3 — '30일 유효 · 자동 결제 X')
//  · 받기 click → backend POST (idempotent) → token block 'received' 색감 변환 → 0.8s 후 닫힘
