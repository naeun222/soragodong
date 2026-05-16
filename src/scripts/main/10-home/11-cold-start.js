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
  // rotatingCardContainer 안에 cold opener HTML 주입.
  return `
    <div class="home-cold-opener" onclick="showScreen('chat')">
      <div class="hco-icon">🐚</div>
      <div class="hco-title">오늘은 한 줄만</div>
      <div class="hco-sub">아무 말이나 편하게.</div>
      <div class="hco-cta">→ 챗으로</div>
    </div>
  `;
}
