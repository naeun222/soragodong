// V4 (사용자 명시 2026-05-17 ultrathink): 홈 탭 첫 진입 튜토.
//   원래 도서관이던 홈 (screen-archive) 첫 진입 시 2-page simple-tuto modal chain.
//   체크인 안내 + 토픽 정리 안내. 진행 중엔 시드 미션 (소라의 부름) 숨김 — _firstHomeTutorialActive flag.
//
// 트리거: showScreen('archive') / showScreen('home') 진입 후 1회. state._shownInlineTips 'firstHomeIntro' 영구 가드.
// 가드 추가:
//   - testerMode OFF (sim 튜토 진행 중 충돌 회피)
//   - V9 / Core 2 / 진주 튜토 미실행 중
//   - 게스트 / 인증 사용자 모두 표시 (가입 직후 카카오 신규 포함).

function shouldRunFirstHomeTutorial() {
  if (typeof state === 'undefined' || !state) return false;
  if (!Array.isArray(state._shownInlineTips)) state._shownInlineTips = [];
  if (state._shownInlineTips.includes('firstHomeIntro')) return false;
  if (state.preferences && state.preferences.testerMode) return false;
  if (window._v8TutorialRunning) return false;
  if (window._c2TutorialRunning) return false;
  if (window._pearlTutorialRunning) return false;
  if (window._simTutorialRunning) return false;
  if (window._onbTutorialMode) return false;
  if (window._firstHomeTutorialActive) return false;
  if (typeof _showSimpleTutoModal !== 'function') return false;
  return true;
}

function runFirstHomeTutorial() {
  if (!shouldRunFirstHomeTutorial()) return;
  window._firstHomeTutorialActive = true;
  // 즉시 미션 카드 가림 (튜토 시작 전 화면 정리).
  if (typeof renderTodayMission === 'function') { try { renderTodayMission(); } catch {} }
  _showSimpleTutoModal({
    key: 'firstHomeIntro',
    pages: [
      {
        html: `<div style="font-size:18px; font-weight:600; margin-bottom:10px;">👍 체크인부터</div>앱에 들어와서 심심하시다면, <b>가장 먼저 체크인</b>을 해주세요.<br><br>매일 체크인할수록, 소라고동의 <b>퀄리티가 훨씬 높아집니다!</b><br><span style="color:var(--text-dim); font-size:13px;">(깊이 이해할 수 있게 돼요)</span>`
      },
      {
        html: `<div style="font-size:18px; font-weight:600; margin-bottom:10px;">✦ 대화탭에서</div>대화탭에서 <b>✓ 마무리</b> 누르거나 <b>마지막 대화 후 5시간</b>이 지나면,<br>대화 내용을 정리해서 <b>'토픽'</b>으로 정리됩니다. ✦`
      }
    ],
    onClose: () => {
      window._firstHomeTutorialActive = false;
      // 튜토 끝나면 미션 카드 복원.
      if (typeof renderTodayMission === 'function') { try { renderTodayMission(); } catch {} }
    }
  });
}
