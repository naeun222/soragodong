// 코어 #1 종료 시점 + 첫 관찰 미완료 detect
function _isCore1AndFirstTouchPending() {
  if (!state.preferences) return false;
  if (state.preferences._firstTouchDone) return false;
  return true;  // _activeCoreId 가 _onbCleanupCore 시점에 이미 null 이라 주체 detect X — pending 만 보면 충분
}

// 사용자 명시 2026-04-30 ultrathink: testerMode ON 경로 = reload 됨 → init 시점에 _pendingIntake flag 보면 intake 모달 재진입.
async function _resumePendingIntake() {
  if (!state.preferences || !state.preferences._pendingIntake) return;
  if (state.preferences._firstTouchDone) {
    state.preferences._pendingIntake = false;
    saveState();
    return;
  }
  if (typeof runIntakeFlow !== 'function' || typeof _canAI !== 'function' || !_canAI()) return;
  try {
    await runIntakeFlow();
    state.preferences._firstTouchDone = true;
    state.preferences._pendingIntake = false;
    saveState();
  } catch (e) { console.warn('[intake] resume 실패', e); }
}

// 화면 회전/리사이즈 시 spotlight 위치 재계산
window.addEventListener('resize', () => {
  const ov = document.getElementById('onbOverlay');
  if (!ov || ov.style.display === 'none') return;
  const step = ONBOARDING_STEPS[_onbStep];
  if (step) onbPositionStep(step);
});

// V3.10: iOS Safari 키보드 가림 방지 — visualViewport API
// 키보드 올라오면 chat-input-bar가 키보드 위에 붙도록
// 사용자 보고 2026-05-02: typing 중 visualViewport scroll 이벤트 빈번 trigger 시 reflow 누적 → rAF throttle.
if (window.visualViewport) {
  let _vvRaf = 0;
  let _vvLastBottom = '';
  const updateInputBarOnKeyboard = () => {
    if (_vvRaf) return;
    _vvRaf = requestAnimationFrame(() => {
      _vvRaf = 0;
      const bar = document.getElementById('chatInputBar');
      if (!bar) return;
      const vv = window.visualViewport;
      const offset = window.innerHeight - vv.height - vv.offsetTop;
      const next = offset > 60 ? (offset + 'px') : '';
      if (next === _vvLastBottom) return; // 동일 값 재대입 = reflow 차단
      _vvLastBottom = next;
      bar.style.bottom = next;
    });
  };
  window.visualViewport.addEventListener('resize', updateInputBarOnKeyboard);
  window.visualViewport.addEventListener('scroll', updateInputBarOnKeyboard);
}

