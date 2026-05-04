// ═══════════════════════════════════════════════════════════════
// 🧪 V3.11.x: 테스트 도구 — 시간 trigger 시뮬레이션
// ═══════════════════════════════════════════════════════════════
function testSkip4Hours() {
  if (!state.chatMessages || state.chatMessages.length === 0) {
    showToast('대화 메시지가 없어. 먼저 대화창에서 메시지 보내봐.');
    return;
  }
  const lastMsg = state.chatMessages[state.chatMessages.length - 1];
  // V4 사용자 명시 2026-05-01 ultrathink: 챕터 갭 = 5h+. 테스트는 6h 전으로 (마진).
  const fakeTime = new Date(Date.now() - (6 * 60 * 60 * 1000 + 60000));
  lastMsg.timestamp = fakeTime.toISOString();
  saveState();
  showToast('🧪 6시간 전으로. 대화창에서 새 메시지 → 챕터 분리 + archive 이송');
}

// V4-fix: 테스터 모드 V4 전체 시드 + 강제 trigger 함수들 (testerMode ON 시 안전)
