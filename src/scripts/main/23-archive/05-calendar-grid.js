
// V4-1s: 📔 일기·대화 캘린더 무드 그리드 (월 단위)
let _calMonthOffset = 0;  // 0 = 이번 달, -1 = 지난 달

function shiftCalMonth(delta) {
  _calMonthOffset += delta;
  renderLensCalendarGrid();
  // 사용자 보고 2026-05-04 (VB029): 월 전환 시 캘린더 보이게 자동 스크롤 + 슬라이드 시각 피드백 (5월로 넘어가도 4월 캘린더 안 보이던 버그).
  try {
    const _wrap = document.querySelector('#lensCalendarGrid .cal-grid-wrap');
    if (_wrap) {
      _wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      _wrap.classList.remove('cal-month-slide-prev', 'cal-month-slide-next');
      _wrap.classList.add(delta < 0 ? 'cal-month-slide-prev' : 'cal-month-slide-next');
      setTimeout(() => { try { _wrap.classList.remove('cal-month-slide-prev', 'cal-month-slide-next'); } catch {} }, 360);
    }
  } catch (e) { console.warn('[shiftCalMonth scroll]:', e); }
}

function jumpToTimelineDate(dateStr) {
  // V4-fix #6: grid 뷰에서는 모달, timeline 뷰에서는 scrollIntoView
  if (_libView === 'grid') {
    openDayModal(dateStr);
    return;
  }
  const timeline = document.getElementById('lensTimeline');
  if (!timeline) return;
  const card = timeline.querySelector(`[data-date="${dateStr}"]`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card.classList.add('ig-card-flash');
    setTimeout(() => card.classList.remove('ig-card-flash'), 1200);
  } else {
    showToast(`${dateStr} 기록 없음`);
  }
}

// V4-fix #6: 그날 모달 (캘린더 칸 클릭 → 일기/토픽/깨달음/진주 서브칩)
let _dayModalActiveTab = 'diary';

