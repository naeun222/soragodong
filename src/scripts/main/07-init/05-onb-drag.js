// V4-fix v3 (사용자 요청): 튜토리얼 coachmark 드래그
// 사용자 요청 2026-04-28: handle 제거, coachmark 전체 드래그 가능 (단 버튼/인터랙티브 element는 제외)
function _initOnbDrag() {
  const coachmark = document.getElementById('onbCoachmark');
  if (!coachmark || coachmark._dragInited) return;
  coachmark._dragInited = true;
  let dragging = false, moved = false, startX = 0, startY = 0, baseLeft = 0, baseTop = 0;
  const isInteractive = (el) => {
    if (!el || el === coachmark) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'button' || tag === 'a' || tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (el.onclick) return true;
    return isInteractive(el.parentElement);
  };
  const onMove = (e) => {
    if (!dragging) return;
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    const dx = cx - startX, dy = cy - startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
    // 사용자 보고 2026-04-29: above-modal 등 CSS !important 룰 이기려면 setProperty 'important'
    coachmark.style.setProperty('left', (baseLeft + dx) + 'px', 'important');
    coachmark.style.setProperty('top', (baseTop + dy) + 'px', 'important');
    coachmark.style.setProperty('right', 'auto', 'important');
    coachmark.style.setProperty('bottom', 'auto', 'important');
    coachmark.style.setProperty('transform', 'none', 'important');
    if (e.cancelable) e.preventDefault();
  };
  const onEnd = () => {
    if (!dragging) return;
    dragging = false;
    coachmark.classList.remove('dragging');
    // 사용자 보고 2026-04-29: 드래그 끝나도 위치 유지 (.dragging 클래스 제거 후 CSS !important 안 돌아오게 inline !important 유지)
    // moved=false (그냥 클릭) 면 inline 스타일 제거해 원래 위치 복귀
    if (!moved) {
      ['left', 'top', 'right', 'bottom', 'transform'].forEach(p => coachmark.style.removeProperty(p));
    }
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchend', onEnd);
  };
  const onStart = (e) => {
    // 버튼/입력 element 클릭은 드래그 X (정상 클릭으로)
    if (isInteractive(e.target)) return;
    dragging = true;
    moved = false;
    // V4 fix (사용자 보고 2026-05-04): above-modal 등에서 .dragging class 추가 시 CSS rule (top/left:auto !important) 가 즉시 발동해
    // getBoundingClientRect 가 강제 reflow 하면 코칭마크가 화면 좌상단으로 점프해 baseLeft/Top 잘못 캡처되던 버그.
    // fix: rect 캡처 → inline !important 적용 → .dragging class 추가 (이 순서로).
    const rect = coachmark.getBoundingClientRect();
    baseLeft = rect.left;
    baseTop = rect.top;
    coachmark.style.setProperty('left', baseLeft + 'px', 'important');
    coachmark.style.setProperty('top', baseTop + 'px', 'important');
    coachmark.style.setProperty('right', 'auto', 'important');
    coachmark.style.setProperty('bottom', 'auto', 'important');
    coachmark.style.setProperty('transform', 'none', 'important');
    coachmark.classList.add('dragging');
    startX = e.touches ? e.touches[0].clientX : e.clientX;
    startY = e.touches ? e.touches[0].clientY : e.clientY;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);
    // touch는 preventDefault — 스크롤 가로채기 방지. 마우스는 ok.
    if (e.touches && e.cancelable) e.preventDefault();
  };
  coachmark.addEventListener('mousedown', onStart);
  coachmark.addEventListener('touchstart', onStart, { passive: false });
}

function onbCleanupListeners() {
  _onbActiveListeners.forEach(({el, type, fn, opts}) => {
    if (el) el.removeEventListener(type, fn, opts || false);
  });
  _onbActiveListeners = [];
}

