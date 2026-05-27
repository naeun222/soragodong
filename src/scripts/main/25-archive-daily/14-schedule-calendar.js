// V4 (사용자 재정정 2026-05-27 ultrathink — 캘린더 일정/할 일 2단계 재정정):
// 일정 lens (도서관 🗓️ 일정 chip) 의 grid 뷰 캘린더.
// 사용자 재정정 2026-05-27 ultrathink (시각 조정): 구글 캘린더 월간 뷰 스타일 — 셀 세로 + 일정 title 인라인.
// 사용자 명시 2026-05-27 ultrathink (UI 통일): 외곽 + 헤더 = 일기·대화 캘린더와 같은 .cal-* 클래스.
// 사용자 명시 2026-05-27 ultrathink (격자 + sync): 셀 사이 1px gap + grid background=var(--border) 격자 라인. todaySchedule (오늘) 도 캘린더 오늘 셀에 합치기.
// 사용자 명시 2026-05-27 ultrathink (풀스크린 + 이전/다음 달):
//   - 6주 (42 셀) 강제. grid-template-rows: repeat(6, 1fr) + height vh-based — 캘린더 영역 화면 가득.
//   - 이전 달 마지막 며칠 + 다음 달 첫 며칠 셀 표시. 숫자 색만 var(--text-soft) 흐리게 (구글 캘린더 패턴). 일정/task 도 표시.
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

// 정렬 키 — schedule.startAt (ISO) / todaySchedule.start (HH:MM) / isAllDay (맨 위).
function _schedSortKey(s) {
  if (s._legacyStart) return s._legacyStart;
  if (s.isAllDay) return '00:00';
  if (s.startAt && typeof _isoToScheduleTimeKey === 'function') {
    return _isoToScheduleTimeKey(s.startAt) || '99:99';
  }
  return '99:99';
}

// dateKey 'YYYY-MM-DD' helper
function _schedYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

  // 6주 (42 셀) 강제 — 이전 달 마지막 며칠 + 이번 달 + 다음 달 첫 며칠.
  const TOTAL_CELLS = 42;
  const prevMonthLastDay = new Date(year, month - 1, 0).getDate();
  const trailingCells = TOTAL_CELLS - firstWeekday - lastDay;

  // visible 셀 목록 (display 순서) + visibleDateKeys (schedules/tasks 매핑 용)
  const visibleDateKeys = new Set();
  const visibleCells = [];

  for (let i = 0; i < firstWeekday; i++) {
    const day = prevMonthLastDay - firstWeekday + 1 + i;
    const dt = new Date(year, month - 2, day);  // month-2 = 이전 달 (0-index)
    const dk = _schedYMD(dt);
    visibleCells.push({ day, dateKey: dk, isOtherMonth: true });
    visibleDateKeys.add(dk);
  }
  for (let day = 1; day <= lastDay; day++) {
    const dk = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    visibleCells.push({ day, dateKey: dk, isOtherMonth: false });
    visibleDateKeys.add(dk);
  }
  for (let i = 1; i <= trailingCells; i++) {
    const dt = new Date(year, month, i);  // month (0-index = 다음 달)
    const dk = _schedYMD(dt);
    visibleCells.push({ day: i, dateKey: dk, isOtherMonth: true });
    visibleDateKeys.add(dk);
  }

  // schedules — visible 범위 안 entry
  const schedulesByDate = {};
  for (const s of (state.schedules || [])) {
    const dk = (typeof _isoToScheduleDayKey === 'function') ? _isoToScheduleDayKey(s.startAt) : null;
    if (!dk || !visibleDateKeys.has(dk)) continue;
    if (!schedulesByDate[dk]) schedulesByDate[dk] = [];
    schedulesByDate[dk].push(s);
  }

  // tasks — dueDate 매칭 (미완료 만)
  const tasksByDate = {};
  for (const t of (state.tasks || [])) {
    if (!t.dueDate || !visibleDateKeys.has(t.dueDate)) continue;
    if (t.status === 'done') continue;
    if (!tasksByDate[t.dueDate]) tasksByDate[t.dueDate] = [];
    tasksByDate[t.dueDate].push(t);
  }

  const _today = new Date();
  const todayK = _schedYMD(_today);

  // todaySchedule 의 오늘 entry 도 캘린더 오늘 셀에 합치기 (timeline ↔ 캘린더 sync).
  if (visibleDateKeys.has(todayK)) {
    for (const it of (state.todaySchedule || [])) {
      const dateK = it.date || todayK;
      if (dateK !== todayK) continue;
      if (it.scheduleId) continue;  // schedules derive — 중복

      if (it.source === 'task' || it.taskId) {
        const taskEntity = (state.tasks || []).find(t => t.id === it.taskId);
        if (taskEntity && taskEntity.status === 'done') continue;
        const existing = tasksByDate[dateK] || [];
        const dup = existing.find(t => t.id === it.taskId);
        if (dup) continue;
        if (!tasksByDate[dateK]) tasksByDate[dateK] = [];
        tasksByDate[dateK].push({
          id: it.taskId,
          title: it.title || (taskEntity ? taskEntity.title : ''),
          dueTime: it.start || null,
          _fromTodaySchedule: true
        });
      } else {
        if (!schedulesByDate[dateK]) schedulesByDate[dateK] = [];
        schedulesByDate[dateK].push({
          id: it.id,
          title: it.title || '',
          isAllDay: false,
          startAt: null,
          _legacyStart: it.start || null,
          _fromTodaySchedule: true
        });
      }
    }
  }

  // 시간순 정렬
  for (const dk of Object.keys(schedulesByDate)) {
    schedulesByDate[dk].sort((a, b) => _schedSortKey(a).localeCompare(_schedSortKey(b)));
  }
  for (const dk of Object.keys(tasksByDate)) {
    tasksByDate[dk].sort((a, b) => (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99'));
  }

  // 외곽 + 헤더 + 요일
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
      <div style="display:grid; grid-template-columns: repeat(7, 1fr); grid-template-rows: repeat(6, minmax(96px, auto)); gap:1px; background:var(--border); border:1px solid var(--border); border-radius:8px; overflow:hidden;">
  `;

  for (const cell of visibleCells) {
    const { day, dateKey, isOtherMonth } = cell;
    const isToday = dateKey === todayK;
    const ds = schedulesByDate[dateKey] || [];
    const dt = tasksByDate[dateKey] || [];

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

    // 날짜 라벨 — 오늘 = 둥근 강조 박스. 다른 달 = 숫자 색 흐리게 (구글 캘린더 패턴).
    let dayLabelHtml;
    if (isToday) {
      dayLabelHtml = `<span style="font-size:11px; font-weight:600; color:#fff; background:var(--accent2); padding:2px 6px; border-radius:10px; line-height:1.2;">${day}</span>`;
    } else if (isOtherMonth) {
      dayLabelHtml = `<span style="font-size:11px; font-weight:400; color:var(--text-soft); opacity:0.55; padding:2px 4px; line-height:1.2;">${day}</span>`;
    } else {
      dayLabelHtml = `<span style="font-size:11px; font-weight:400; color:var(--text); padding:2px 4px; line-height:1.2;">${day}</span>`;
    }

    const itemDim = isOtherMonth ? ' opacity:0.6;' : '';

    html += `
      <div onclick="_schedCalDayClick('${dateKey}')" style="background:var(--surface); padding:4px 4px 5px; cursor:pointer; display:flex; flex-direction:column; gap:2px; box-sizing:border-box; overflow:hidden;">
        <div style="display:flex; justify-content:flex-end;">${dayLabelHtml}</div>
        ${display.map(it => `
          <div style="font-size:10px; padding:1px 5px; background:${it.color}1f; border-left:2px solid ${it.color}; color:var(--text); border-radius:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.35;${itemDim}" title="${escapeHtml(it.title)}">${escapeHtml(it.title)}</div>
        `).join('')}
        ${remaining > 0 ? `<div style="font-size:9px; color:var(--text-soft); padding:1px 5px; line-height:1.2;${itemDim}">+${remaining}</div>` : ''}
      </div>
    `;
  }

  html += `
      </div>
    </div>
  `;

  // 범례
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
