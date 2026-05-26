// V4 (사용자 재정정 2026-05-27 ultrathink — 캘린더 일정/할 일 2단계 재정정):
// 일정 lens (도서관 🚀 일정 chip) 의 grid 뷰 캘린더.
// 사용자 재정정 2026-05-27 ultrathink (시각 조정): 구글 캘린더 월간 뷰 스타일 — 셀 세로 길게 + 일정 title 인라인.
// 사용자 명시 2026-05-27 ultrathink (UI 통일): 외곽 + 헤더 = 일기·대화 캘린더와 같은 .cal-grid-wrap / .cal-nav / .cal-nav-btn / .cal-month-label / .cal-weekdays 클래스. 화살표 ← →. 월 라벨 toLocaleDateString.
// timeline 뷰는 기존 renderExecute() — 별도.

let _schedCalCursorYM = null;  // 'YYYY-MM' (사용자 로컬 시간대)

const _SCHED_CAL_SCHEDULE_COLOR = '#7eb8ff';
const _SCHED_CAL_TASK_COLOR     = '#fbbf24';
const _SCHED_CAL_MAX_ITEMS      = 3;

function _schedCalEnsureCursor() {
  if (!_schedCalCursorYM) {
    const d = new Date();
    _schedCalCursorYM = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  return _schedCalCursorYM;
}

function _schedCalMonthShift(delta) {
  const ym = _schedCalEnsureCursor();
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  _schedCalCursorYM = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  if (typeof renderScheduleCalendarGrid === 'function') renderScheduleCalendarGrid();
}

function renderScheduleCalendarGrid() {
  const container = document.getElementById('libExecuteGrid');
  if (!container) return;

  const ym = _schedCalEnsureCursor();
  const [year, month] = ym.split('-').map(Number);
  const target = new Date(year, month - 1, 1);
  const monthLabel = target.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
  const lastDay = new Date(year, month, 0).getDate();
  const firstWeekday = target.getDay();
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;

  // schedules — 해당 월에 시작하는 entry. 시간순 정렬.
  const schedulesByDate = {};
  for (const s of (state.schedules || [])) {
    const dk = (typeof _isoToScheduleDayKey === 'function') ? _isoToScheduleDayKey(s.startAt) : null;
    if (!dk || !dk.startsWith(monthKey)) continue;
    if (!schedulesByDate[dk]) schedulesByDate[dk] = [];
    schedulesByDate[dk].push(s);
  }
  for (const dk of Object.keys(schedulesByDate)) {
    schedulesByDate[dk].sort((a, b) => (a.startAt || '').localeCompare(b.startAt || ''));
  }

  // tasks — dueDate 매칭 (미완료 만). dueTime 시간순.
  const tasksByDate = {};
  for (const t of (state.tasks || [])) {
    if (!t.dueDate || !t.dueDate.startsWith(monthKey)) continue;
    if (t.status === 'done') continue;
    if (!tasksByDate[t.dueDate]) tasksByDate[t.dueDate] = [];
    tasksByDate[t.dueDate].push(t);
  }
  for (const dk of Object.keys(tasksByDate)) {
    tasksByDate[dk].sort((a, b) => (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99'));
  }

  const _today = new Date();
  const todayK = `${_today.getFullYear()}-${String(_today.getMonth() + 1).padStart(2, '0')}-${String(_today.getDate()).padStart(2, '0')}`;

  // 외곽 + 헤더 + 요일 = 일기·대화 캘린더와 같은 클래스 (visual 통일).
  let html = `
    <div class="cal-grid-wrap">
      <div class="cal-nav">
        <button class="cal-nav-btn" onclick="_schedCalMonthShift(-1)" aria-label="지난 달">←</button>
        <div class="cal-month-label">${monthLabel}</div>
        <button class="cal-nav-btn" onclick="_schedCalMonthShift(1)" aria-label="다음 달">→</button>
      </div>
      <div class="cal-weekdays">
        <span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span>
      </div>
      <div style="display:grid; grid-template-columns: repeat(7, 1fr); gap:3px; padding:0 2px;">
  `;

  // 빈 셀 (전월 잔여)
  for (let i = 0; i < firstWeekday; i++) {
    html += '<div style="min-height:80px; background:transparent;"></div>';
  }

  for (let day = 1; day <= lastDay; day++) {
    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = dateKey === todayK;
    const ds = schedulesByDate[dateKey] || [];
    const dt = tasksByDate[dateKey] || [];

    // schedule 먼저 (시간순), task 그 다음. 종일 일정은 · prefix.
    const allItems = [
      ...ds.map(s => ({
        kind: 'schedule',
        title: s.isAllDay ? `· ${s.title || ''}` : (s.title || ''),
        color: _SCHED_CAL_SCHEDULE_COLOR
      })),
      ...dt.map(t => ({
        kind: 'task',
        title: `✓ ${t.title || ''}`,
        color: _SCHED_CAL_TASK_COLOR
      }))
    ];
    const display = allItems.slice(0, _SCHED_CAL_MAX_ITEMS);
    const remaining = allItems.length - display.length;

    const dayLabelHtml = isToday
      ? `<span style="font-size:11px; font-weight:600; color:#fff; background:var(--accent2); padding:2px 6px; border-radius:10px; line-height:1.2;">${day}</span>`
      : `<span style="font-size:11px; font-weight:400; color:var(--text); padding:2px 4px; line-height:1.2;">${day}</span>`;

    html += `
      <div onclick="_schedCalDayClick('${dateKey}')" style="min-height:80px; background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:4px 3px 5px; cursor:pointer; display:flex; flex-direction:column; gap:2px; box-sizing:border-box; overflow:hidden;">
        <div style="display:flex; justify-content:flex-end;">${dayLabelHtml}</div>
        ${display.map(it => `
          <div style="font-size:9.5px; padding:1px 4px; background:${it.color}1f; border-left:2px solid ${it.color}; color:var(--text); border-radius:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.35;" title="${escapeHtml(it.title)}">${escapeHtml(it.title)}</div>
        `).join('')}
        ${remaining > 0 ? `<div style="font-size:9px; color:var(--text-soft); padding:1px 4px; line-height:1.2;">+${remaining}</div>` : ''}
      </div>
    `;
  }

  html += `
      </div>
    </div>
  `;

  // 범례 (안내 문구 제거 — 2-3 ship 후)
  html += `
    <div style="margin:18px 4px 0; padding:12px 14px; background:var(--surface); border:1px solid var(--border); border-radius:12px; font-size:12px; color:var(--text-soft); line-height:1.6;">
      <div style="display:flex; gap:16px; flex-wrap:wrap; align-items:center;">
        <span style="display:inline-flex; align-items:center; gap:6px;"><span style="display:inline-block; width:10px; height:10px; background:${_SCHED_CAL_SCHEDULE_COLOR}1f; border-left:2px solid ${_SCHED_CAL_SCHEDULE_COLOR}; border-radius:2px;"></span>일정</span>
        <span style="display:inline-flex; align-items:center; gap:6px;"><span style="display:inline-block; width:10px; height:10px; background:${_SCHED_CAL_TASK_COLOR}1f; border-left:2px solid ${_SCHED_CAL_TASK_COLOR}; border-radius:2px;"></span>할 일 마감</span>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

function _schedCalDayClick(dateKey) {
  if (typeof openScheduleDayModal === 'function') {
    openScheduleDayModal(dateKey);
  } else if (typeof showToast === 'function') {
    showToast(`📅 ${dateKey}`);
  }
}

try {
  window.renderScheduleCalendarGrid = renderScheduleCalendarGrid;
  window._schedCalMonthShift = _schedCalMonthShift;
  window._schedCalDayClick = _schedCalDayClick;
} catch (e) {}
