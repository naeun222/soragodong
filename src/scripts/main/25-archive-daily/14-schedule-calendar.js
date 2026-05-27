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

const _SCHED_CAL_SCHEDULE_COLOR = '#5a9cb0';  // 바다톤 일정 (var(--cal-event))
const _SCHED_CAL_TASK_COLOR     = '#d8ac63';  // 골드 할 일 (var(--cal-task))
const _SCHED_CAL_SCHEDULE_INK   = '#082630';
const _SCHED_CAL_TASK_INK       = '#2c1e04';
const _SCHED_CAL_MAX_ITEMS      = 3;

// 사용자 명시 2026-05-27: 한국 공휴일 초록 표시 (구글 캘린더식). 2026년만 — 음력(설/추석/부처님오신날)·대체공휴일은
//   연도마다 바뀌어 하드코딩(검증: superkts / 우주항공청 월력요항). 2027+ 는 추후 추가. 노동절(근로자의날)은 관공서 공휴일 X → 제외.
const _KR_HOLIDAY_GREEN = '#4caf72';
const _KR_HOLIDAYS = {
  '2026-01-01': '신정',
  '2026-02-16': '설날 연휴', '2026-02-17': '설날', '2026-02-18': '설날 연휴',
  '2026-03-01': '삼일절', '2026-03-02': '대체공휴일',
  '2026-05-05': '어린이날',
  '2026-05-24': '부처님오신날', '2026-05-25': '대체공휴일',
  '2026-06-06': '현충일',
  '2026-08-15': '광복절', '2026-08-17': '대체공휴일',
  '2026-09-24': '추석 연휴', '2026-09-25': '추석', '2026-09-26': '추석 연휴',
  '2026-10-03': '개천절', '2026-10-05': '대체공휴일',
  '2026-10-09': '한글날',
  '2026-12-25': '성탄절'
};
function _krHolidayName(dateKey) {
  return (dateKey && _KR_HOLIDAYS[dateKey]) || null;
}

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
  // 풀스크린 오버레이 열려 있으면 그쪽을 갱신 (인라인 갱신도 함수 내부에서 함께).
  if (document.getElementById('schedCalFsOverlay')) {
    if (typeof renderScheduleCalendarGrid === 'function') renderScheduleCalendarGrid('schedCalFsGrid', true);
    if (typeof renderScheduleCalendarGrid === 'function') renderScheduleCalendarGrid();
  } else if (typeof renderScheduleCalendarGrid === 'function') {
    renderScheduleCalendarGrid();
  }
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

function renderScheduleCalendarGrid(targetId, fullscreen) {
  targetId = targetId || 'libExecuteGrid';
  fullscreen = !!fullscreen;
  const container = document.getElementById(targetId);
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
  // 사용자 명시 2026-05-27 ultrathink (인라인 = 7ea5091 tall + 풀스크린):
  //   인라인 = 억지로 늘린 tall 캘린더 (viewport 높이, 6행 1fr, 월/요일 sticky, 셀 안 일정 제목). 더 아래로 스크롤해 캘린더가 화면 맨 위에 닿으면 _schedCalOnScroll 가 풀스크린 오버레이를 엶.
  //   fullscreen = fixed inset:0 레이어 안에서 flex 로 viewport 전체 (앱 헤더·하단탭까지 덮음).
  const gridRows = 'repeat(6, 1fr)';
  const gridCls  = fullscreen ? 'sched-cal-monthgrid sched-cal-monthgrid-fs' : 'sched-cal-monthgrid';
  let html = `
    <div class="cal-grid-wrap sched-cal-wrap${fullscreen ? ' sched-cal-wrap-fs' : ''}">
      <div class="sched-cal-sticky">
        <div class="cal-nav">
          <button class="cal-nav-btn" onclick="_schedCalMonthShift(-1)" aria-label="지난 달">←</button>
          <div class="cal-month-label">${monthLabel}</div>
          <button class="cal-nav-btn" onclick="_schedCalMonthShift(1)" aria-label="다음 달">→</button>
        </div>
        <div class="cal-weekdays">
          <span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span>
        </div>
      </div>
      <div class="${gridCls}" style="display:grid; grid-template-columns: repeat(7, 1fr); grid-template-rows: ${gridRows}; gap:1px; background:var(--border); border:1px solid var(--border); border-radius:8px; overflow:hidden;">
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
        color: _SCHED_CAL_SCHEDULE_COLOR,
        ink: _SCHED_CAL_SCHEDULE_INK
      })),
      ...dt.map(t => ({
        // 사용자 명시 2026-05-27 (재): 인라인도 가독성 유지 — ✓ 프리픽스 제거(골드 색으로 구분). 인라인/전체화면 공통.
        kind: 'task',
        title: `${t.title || ''}`,
        color: _SCHED_CAL_TASK_COLOR,
        ink: _SCHED_CAL_TASK_INK
      }))
    ];
    const display = allItems.slice(0, _SCHED_CAL_MAX_ITEMS);
    const remaining = allItems.length - display.length;

    // 날짜 라벨 — 오늘 = 둥근 강조 박스. 공휴일 = 초록 숫자 (구글 캘린더식). 다른 달 = 흐리게.
    const holiday = (typeof _krHolidayName === 'function') ? _krHolidayName(dateKey) : null;
    let dayLabelHtml;
    if (isToday) {
      dayLabelHtml = `<span style="font-size:11px; font-weight:600; color:#fff; background:var(--accent2); padding:2px 6px; border-radius:10px; line-height:1.2;">${day}</span>`;
    } else if (holiday) {
      dayLabelHtml = `<span style="font-size:11px; font-weight:600; color:${_KR_HOLIDAY_GREEN};${isOtherMonth ? ' opacity:0.5;' : ''} padding:2px 4px; line-height:1.2;">${day}</span>`;
    } else if (isOtherMonth) {
      dayLabelHtml = `<span style="font-size:11px; font-weight:400; color:var(--text-soft); opacity:0.55; padding:2px 4px; line-height:1.2;">${day}</span>`;
    } else {
      dayLabelHtml = `<span style="font-size:11px; font-weight:400; color:var(--text); padding:2px 4px; line-height:1.2;">${day}</span>`;
    }

    const itemDim = isOtherMonth ? ' opacity:0.6;' : '';

    html += `
      <div onclick="_schedCalDayClick('${dateKey}')" style="background:var(--surface); padding:3px 2px 4px; cursor:pointer; display:flex; flex-direction:column; gap:2px; box-sizing:border-box; overflow:hidden;">
        <div style="display:flex; justify-content:flex-end;">${dayLabelHtml}</div>
        ${(holiday && fullscreen) ? `<div style="font-size:10px; font-weight:600; color:${_KR_HOLIDAY_GREEN}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.3;${itemDim}">${escapeHtml(holiday)}</div>` : ''}
        ${display.map(it => `
          <div style="font-size:10px; font-weight:600; padding:1px 4px; background:${it.color}; color:${it.ink}; border-radius:3px; white-space:nowrap; overflow:hidden; line-height:1.4;${itemDim}" title="${escapeHtml(it.title)}">${escapeHtml(it.title)}</div>
        `).join('')}
        ${remaining > 0 ? `<div style="font-size:9px; color:var(--text-soft); padding:1px 5px; line-height:1.2;${itemDim}">+${remaining}</div>` : ''}
      </div>
    `;
  }

  html += `
      </div>
    </div>
  `;

  // 범례 (인라인은 풀스크린 힌트 포함, 풀스크린은 컴팩트)
  if (fullscreen) {
    html += `
      <div style="margin:12px 4px 0; padding:10px 14px; font-size:12px; color:var(--text-soft); display:flex; gap:16px; flex-wrap:wrap; align-items:center;">
        <span style="display:inline-flex; align-items:center; gap:6px;"><span style="display:inline-block; width:11px; height:11px; background:${_SCHED_CAL_SCHEDULE_COLOR}; border-radius:3px;"></span>일정</span>
        <span style="display:inline-flex; align-items:center; gap:6px;"><span style="display:inline-block; width:11px; height:11px; background:${_SCHED_CAL_TASK_COLOR}; border-radius:3px;"></span>할 일 마감</span>
      </div>
    `;
  } else {
    html += `
      <div style="margin:18px 4px 0; padding:12px 14px; background:var(--surface); border:1px solid var(--border); border-radius:12px; font-size:12px; color:var(--text-soft); line-height:1.6;">
        <div style="display:flex; gap:16px; flex-wrap:wrap; align-items:center;">
          <span style="display:inline-flex; align-items:center; gap:6px;"><span style="display:inline-block; width:11px; height:11px; background:${_SCHED_CAL_SCHEDULE_COLOR}; border-radius:3px;"></span>일정</span>
          <span style="display:inline-flex; align-items:center; gap:6px;"><span style="display:inline-block; width:11px; height:11px; background:${_SCHED_CAL_TASK_COLOR}; border-radius:3px;"></span>할 일 마감</span>
        </div>
        <div style="margin-top:8px; font-size:11px; color:var(--text-soft); opacity:0.8;">더 아래로 스크롤하면 전체화면⛶</div>
      </div>
    `;
  }

  container.innerHTML = html;

  if (!fullscreen) {
    // 인라인 갱신 시 풀스크린 오버레이 열려 있으면 같이 갱신.
    if (document.getElementById('schedCalFsOverlay')) renderScheduleCalendarGrid('schedCalFsGrid', true);
    // 스크롤 트리거 1회 bind.
    _schedCalBindScrollTrigger();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 사용자 명시 2026-05-27 ultrathink (진짜 풀스크린): 일정 lens 에서 아래로 스크롤해 캘린더가 화면 상단에 닿으면 풀스크린 오버레이 자동 open.
//   오버레이 = fixed inset:0 (앱 헤더·하단탭·상태바 다 덮음, safe-area). ✕ 로 닫으면 lens scrollTop=0 리셋 (재open 루프 방지) + cooldown.
// ─────────────────────────────────────────────────────────────────────────────
let _schedCalFsCooldown = false;

// 사용자 명시 2026-05-27 ultrathink (빡빡하게): 바닥 도달만으론 X — 바닥에서 한 번 더 당기는(오버스크롤) 제스처가 있어야 풀스크린.
//   touch: 바닥 닿은 뒤 손가락을 추가로 70px 더 위로 끌면 (= 아래로 더 스크롤 시도) 발동.
//   wheel(데스크톱): 바닥에서 아래 휠 누적 180 넘으면 발동.
let _schedCalBottomAnchorY = null;
let _schedCalWheelAccum = 0;
const _SCHED_CAL_PULL_PX = 70;
const _SCHED_CAL_WHEEL_PX = 180;

function _schedCalBindScrollTrigger() {
  if (window._schedCalScrollBound) return;
  const screen = document.getElementById('screen-archive');
  if (!screen) return;
  screen.addEventListener('touchstart', _schedCalTouchStart, { passive: true });
  screen.addEventListener('touchmove', _schedCalTouchMove, { passive: true });
  screen.addEventListener('touchend', _schedCalTouchEnd, { passive: true });
  screen.addEventListener('wheel', _schedCalWheel, { passive: true });
  window._schedCalScrollBound = true;
}

function _schedCalCanTrigger(screen) {
  if (_schedCalFsCooldown) return false;
  if (document.getElementById('schedCalFsOverlay')) return false;
  if (typeof _currentLens === 'undefined' || _currentLens !== 'execute') return false;
  if (typeof _libView === 'undefined' || _libView !== 'grid') return false;
  if (!screen || !document.getElementById('libExecuteGrid')) return false;
  if (screen.scrollHeight - screen.clientHeight < 120) return false;  // 짧은 페이지 가드
  return true;
}

function _schedCalAtBottom(screen) {
  return screen.scrollTop + screen.clientHeight >= screen.scrollHeight - 8;
}

function _schedCalTouchStart() {
  _schedCalBottomAnchorY = null;
}

function _schedCalTouchMove(e) {
  const screen = document.getElementById('screen-archive');
  if (!_schedCalCanTrigger(screen)) { _schedCalBottomAnchorY = null; return; }
  const y = (e.touches && e.touches[0]) ? e.touches[0].clientY : null;
  if (y == null) return;
  if (!_schedCalAtBottom(screen)) { _schedCalBottomAnchorY = null; return; }
  // 바닥 도달 — 그 순간 Y anchor. 거기서 추가로 위로 끈 양(아래로 더 스크롤 시도) 측정.
  if (_schedCalBottomAnchorY == null) { _schedCalBottomAnchorY = y; return; }
  if (_schedCalBottomAnchorY - y > _SCHED_CAL_PULL_PX) {
    _schedCalBottomAnchorY = null;
    openScheduleCalendarFullscreen();
  }
}

function _schedCalTouchEnd() {
  _schedCalBottomAnchorY = null;
}

function _schedCalWheel(e) {
  const screen = document.getElementById('screen-archive');
  if (!_schedCalCanTrigger(screen)) { _schedCalWheelAccum = 0; return; }
  if (!_schedCalAtBottom(screen)) { _schedCalWheelAccum = 0; return; }
  if (e.deltaY > 0) {
    _schedCalWheelAccum += e.deltaY;
    if (_schedCalWheelAccum > _SCHED_CAL_WHEEL_PX) {
      _schedCalWheelAccum = 0;
      openScheduleCalendarFullscreen();
    }
  }
}

function openScheduleCalendarFullscreen() {
  if (document.getElementById('schedCalFsOverlay')) return;
  const html = `
    <div id="schedCalFsOverlay" class="sched-cal-fs-overlay" style="position:fixed; inset:0; background:var(--bg); z-index:9997; display:flex; flex-direction:column;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:calc(10px + env(safe-area-inset-top,0px)) 14px 6px; flex-shrink:0;">
        <div style="font-size:15px; font-weight:600; color:var(--text);">📅 일정</div>
        <button onclick="_closeScheduleCalendarFullscreen()" aria-label="닫기" style="background:var(--surface); border:1px solid var(--border); color:var(--text); width:34px; height:34px; border-radius:9px; cursor:pointer; font-size:18px; line-height:1; flex-shrink:0;">×</button>
      </div>
      <div id="schedCalFsGrid" style="flex:1; min-height:0; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:0 12px calc(12px + env(safe-area-inset-bottom,0px));"></div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
  renderScheduleCalendarGrid('schedCalFsGrid', true);
}

function _closeScheduleCalendarFullscreen() {
  const ov = document.getElementById('schedCalFsOverlay');
  if (ov) ov.remove();
  // 재open 루프 방지: lens 를 맨 위로 + 잠깐 cooldown.
  const screen = document.getElementById('screen-archive');
  if (screen) screen.scrollTop = 0;
  _schedCalFsCooldown = true;
  setTimeout(() => { _schedCalFsCooldown = false; }, 500);
}

function _schedCalDayClick(dateKey) {
  // 사용자 명시 2026-05-27 ultrathink (3단계): 날짜 클릭 → 구글 캘린더식 일별 시간대(day view).
  if (typeof openScheduleDayTimeline === 'function') {
    openScheduleDayTimeline(dateKey);
  } else if (typeof openScheduleDayModal === 'function') {
    openScheduleDayModal(dateKey);
  } else if (typeof showToast === 'function') {
    showToast(`📅 ${dateKey}`);
  }
}

// esc → 풀스크린 캘린더 닫기 (단, day view / 수정 모달이 위에 없을 때만).
try {
  window.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    if (document.getElementById('schedDayTimelineOverlay') || document.getElementById('schedModalOverlay') || document.getElementById('schedSheetOverlay')) return;
    if (document.getElementById('schedCalFsOverlay')) _closeScheduleCalendarFullscreen();
  });
} catch (e) {}

try {
  window.renderScheduleCalendarGrid = renderScheduleCalendarGrid;
  window._schedCalMonthShift = _schedCalMonthShift;
  window._schedCalDayClick = _schedCalDayClick;
  window.openScheduleCalendarFullscreen = openScheduleCalendarFullscreen;
  window._closeScheduleCalendarFullscreen = _closeScheduleCalendarFullscreen;
} catch (e) {}
