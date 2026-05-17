// V4 (사용자 명시 2026-05-17 ultrathink): 시간대 시뮬 dev toggle.
//   저녁 6시 ~ 새벽 4시 모드 UI (회전카드 priority, 챗 empty 체크인 카드) 를 낮 시간에도 미리볼 수 있음.
//   _rcIsEveningMode (10-home/03-rotating-card.js) + _chatEmptyAreaHtml (19-chat/03-measure-render.js) 둘 다 flag 우선 체크.
//   flag = window._devForceEvening. localStorage 안 박힘 (휘발성 — reload 시 OFF).

function devToggleForceEvening() {
  window._devForceEvening = !window._devForceEvening;
  const btn = document.getElementById('devForceEveningToggleBtn');
  if (btn) btn.textContent = '⏰ 저녁 6시+ 시뮬: ' + (window._devForceEvening ? 'ON' : 'OFF');
  if (typeof showToast === 'function') {
    showToast(window._devForceEvening
      ? '⏰ 저녁 6시+ 시뮬 ON — 홈 priority stack 에 체크인 진입 / 챗 empty 에 체크인 카드'
      : '⏰ 저녁 6시+ 시뮬 OFF — 실제 시간대로 복귀');
  }
  // 즉시 rerender — 홈/챗 보고 있으면 바로 반영.
  if (typeof renderRotatingCard === 'function') { try { renderRotatingCard(); } catch {} }
  if (typeof renderChat === 'function') { try { renderChat(); } catch {} }
}
