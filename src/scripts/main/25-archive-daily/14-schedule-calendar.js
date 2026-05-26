// V4 (사용자 재정정 2026-05-27 ultrathink — 캘린더 일정/할 일 2단계 재정정):
// 일정 lens (도서관 🚀 일정 chip) 의 grid 뷰 캘린더. 월간 7×N 그리드.
// 각 날짜 셀에: schedules dot (파랑) + task.dueDate dot (노랑).
// timeline 뷰는 기존 renderExecute() — 별도.

let _schedCalCursorYM = null;  // 'YYYY-MM' (사용자 로컬 시간대)

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
  const lastDay = new Date(year, month, 0).getDate();
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;

  // schedules — 해당 월에 시작하는 entry (multi-day 는 startAt 기준만 — 1단계 단순화)
  const schedulesByDate = {};
  for (const s of (state.schedules || [])) {
    const dk = (typeof _isoToScheduleDayKey === 'function') ? _isoToScheduleDayKey(s.startAt) : null;
    if (!dk || !dk.startsWith(monthKey)) continue;
    if (!schedulesByDate[dk]) schedulesByDate[dk] = [];
    schedulesByDate[dk].push(s);
  }

  // tasks — dueDate 매칭 (미완료 만)
  const tasksByDate = {};
  for (const t of (state.tasks || [])) {
    if (!t.dueDate || !t.dueDate.startsWith(monthKey)) continue;
    if (t.status === 'done') continue;
    if (!tasksByDate[t.dueDate]) tasksByDate[t.dueDate] = [];
    tasksByDate[t.dueDate].push(t);
  }

  const _today = new Date();
  const todayK = `${_today.getFullYear()}-${String(_today.getMonth() + 1).padStart(2, '0')}-${String(_today.getDate()).padStart(2, '0')}`;

  let html = `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 4px 12px;">
      <button onclick="_schedCalMonthShift(-1)" style="background:transparent; border:none; color:var(--text); font-size:22px; cursor:pointer; padding:4px 12px; font-family:inherit;" aria-label="이전 달">‹</button>
      <span style="font-size:15px; font-weight:600; color:var(--text);">${year}년 ${month}월</span>
      <button onclick="_schedCalMonthShift(1)" style="background:transparent; border:none; color:var(--text); font-size:22px; cursor:pointer; padding:4px 12px; font-family:inherit;" aria-label="다음 달">›</button>
    </div>
    <div style="display:grid; grid-template-columns: repeat(7, 1fr); gap:4px; padding:0 2px 6px; font-size:11px; color:var(--text-soft); text-align:center; font-weight:500;">
      <span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span>
    </div>
    <div style="display:grid; grid-template-columns: repeat(7, 1fr); gap:4px; padding:0 2px;">
  `;

  for (let i = 0; i < firstWeekday; i++) {
    html += '<div style="aspect-ratio:1; background:transparent;"></div>';
  }

  for (let day = 1; day <= lastDay; day++) {
    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = dateKey === todayK;
    const ds = schedulesByDate[dateKey] || [];
    const dt = tasksByDate[dateKey] || [];
    const hasContent = ds.length > 0 || dt.length > 0;

    const bgColor = isToday
      ? 'var(--accent2)'
      : (hasContent ? 'var(--surface2)' : 'var(--surface)');
    const dayColor = isToday ? '#fff' : 'var(--text)';
    const fontWeight = isToday ? '600' : '400';

    html += `
      <div onclick="_schedCalDayClick('${dateKey}')" style="aspect-ratio:1; background:${bgColor}; border:1px solid var(--border); border-radius:10px; padding:5px 4px; cursor:pointer; display:flex; flex-direction:column; align-items:center; justify-content:flex-start; gap:3px; box-sizing:border-box;">
        <span style="font-size:13px; font-weight:${fontWeight}; color:${dayColor}; line-height:1;">${day}</span>
        <div style="display:flex; gap:3px; align-items:center; min-height:5px;">
          ${ds.length > 0 ? `<span style="width:5px; height:5px; border-radius:50%; background:#7eb8ff; display:inline-block;" title="일정 ${ds.length}개"></span>` : ''}
          ${dt.length > 0 ? `<span style="width:5px; height:5px; border-radius:50%; background:#ffd166; display:inline-block;" title="할 일 마감 ${dt.length}개"></span>` : ''}
        </div>
      </div>
    `;
  }

  html += '</div>';

  // 범례 + 안내
  html += `
    <div style="margin:18px 4px 0; padding:14px; background:var(--surface); border:1px solid var(--border); border-radius:12px; font-size:12px; color:var(--text-soft); line-height:1.6;">
      <div style="display:flex; gap:14px; flex-wrap:wrap; align-items:center;">
        <span style="display:inline-flex; align-items:center; gap:6px;"><span style="width:6px; height:6px; border-radius:50%; background:#7eb8ff; display:inline-block;"></span>일정</span>
        <span style="display:inline-flex; align-items:center; gap:6px;"><span style="width:6px; height:6px; border-radius:50%; background:#ffd166; display:inline-block;"></span>할 일 마감</span>
      </div>
      <div style="margin-top:10px;">날짜 클릭 시 그날의 일정/마감 모달 (다음 단계 구현). 일정 추가/수정/삭제 + 알림은 후속 단계.</div>
    </div>
  `;

  container.innerHTML = html;
}

function _schedCalDayClick(dateKey) {
  // 2-3 단계 후속: 그날의 일정 + task dueDate 표시 + 추가 버튼. 일단 안내 toast.
  if (typeof showToast === 'function') showToast(`📅 ${dateKey} — 일정 모달은 다음 단계에서`);
}

try {
  window.renderScheduleCalendarGrid = renderScheduleCalendarGrid;
  window._schedCalMonthShift = _schedCalMonthShift;
  window._schedCalDayClick = _schedCalDayClick;
} catch (e) {}
