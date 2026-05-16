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
  // 사용자 명시 2026-05-17 ultrathink (revert): 옛 모래사장/마법고동/체크인 UI 복원 후 cold opener 별도 노출 X.
  //   cold-start 사용자는 home 본체의 체크인 + 🐚 모래사장 + 마법고동 카드로 진입 (중복 opener 불필요).
  return '';
}
