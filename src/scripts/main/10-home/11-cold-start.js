// V4 (사용자 명시 2026-05-17 ultrathink): cold start 분기.
//   가입 7일 미만 OR chatArchive < 2 OR pearls+entries < 3 = cold start.
//   메인 카드 = "오늘은 한 줄만" + chat link (substrate 부족 시 godongDiary 생성 X).

function _isColdStart() {
  if (!state) return true;
  // 가입 7일 미만 — state.createdAt 부재 시 daysSinceJoin 가드 skip
  if (state.createdAt) {
    const days = (Date.now() - new Date(state.createdAt).getTime()) / 86400000;
    if (!isNaN(days) && days < 7) return true;
  }
  const archiveLen = Array.isArray(state.chatArchive) ? state.chatArchive.length : 0;
  if (archiveLen < 2) return true;
  const pearlsLen = Array.isArray(state.pearls) ? state.pearls.length : 0;
  const entriesLen = Array.isArray(state.entries) ? state.entries.length : 0;
  if (pearlsLen + entriesLen < 3) return true;
  return false;
}

function renderColdStartOpener() {
  // 사용자 명시 2026-05-17 ultrathink: cold start = 옛 홈 구조 (체크인 / 모래사장 / 마법고동) 3 카드 stack.
  //   "오늘은 한 줄만" 단일 opener 폐기 — 신규 사용자에게 진입점 셋 모두 노출이 더 친절 (액션 선택지 가시화).
  return `
    <div class="home-cold-actions">
      <div class="action-card checkin-card" onclick="enterCheckin()" style="background: linear-gradient(135deg, rgba(139,126,196,0.18), rgba(45,40,80,0.15)); border-color: rgba(139,126,196,0.35);">
        <div class="action-icon">✓</div>
        <div class="action-text">
          <div class="action-title">체크인</div>
          <div class="action-sub">오늘 한 줄 적어두기</div>
        </div>
        <div class="action-arrow">›</div>
      </div>
      <div class="action-card" onclick="openShellCollection(); if(typeof _dismissBeachPulse==='function') _dismissBeachPulse();">
        <div class="action-icon">🐚</div>
        <div class="action-text">
          <div class="action-title">모래사장</div>
          <div class="action-sub">진주 모으는 곳</div>
        </div>
        <div class="action-arrow">›</div>
      </div>
      <div class="action-card" onclick="openMagicReflectionChooser()">
        <div class="action-icon" style="background:transparent; padding:0;"><img src="/character/godong-wizard.svg" alt="" class="godong-icon godong-mood-wizard" decoding="async" style="width:40px; height:40px;"></div>
        <div class="action-text">
          <div class="action-title">마법고동</div>
          <div class="action-sub">큰 결정 · 깊은 질문</div>
        </div>
        <div class="action-arrow">›</div>
      </div>
    </div>
  `;
}
