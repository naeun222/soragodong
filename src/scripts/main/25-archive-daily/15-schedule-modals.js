// V4 (사용자 명시 2026-05-27 ultrathink — 캘린더 일정/할 일 2-3단계):
// 캘린더 날짜 클릭 → 그날의 일정 + task 모달 + 일정 추가/수정/삭제 폼.
// 알림 옵션 (notifyMinutesBefore) UI 만 — 실제 OS 알림 trigger 는 4단계 (로컬 알림) 에서 연결.

const _SCHED_MOD_SCHED_COLOR = '#7eb8ff';
const _SCHED_MOD_TASK_COLOR  = '#fbbf24';

function _closeScheduleModals() {
  const overlay = document.getElementById('schedModalOverlay');
  if (overlay) overlay.remove();
}

// Helper: Date → datetime-local input value ('YYYY-MM-DDTHH:MM', 사용자 로컬)
function _schedFormatLocalDT(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const HH = String(date.getHours()).padStart(2, '0');
  const MM = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${HH}:${MM}`;
}

// 그날 모달 — 그날의 일정 + task 표시 + '+ 일정 추가'.
function openScheduleDayModal(dateKey) {
  if (!dateKey) return;
  _closeScheduleModals();

  const schedules = ((typeof getSchedulesForDate === 'function') ? getSchedulesForDate(dateKey) : []).slice();
  const tasks = ((typeof getTasksDueOnDate === 'function') ? getTasksDueOnDate(dateKey) : []).slice();

  // 정렬: 종일 먼저, 시간 일정 startAt 순, task dueTime 순
  schedules.sort((a, b) => {
    if (a.isAllDay && !b.isAllDay) return -1;
    if (!a.isAllDay && b.isAllDay) return 1;
    return (a.startAt || '').localeCompare(b.startAt || '');
  });
  tasks.sort((a, b) => (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99'));

  const parts = dateKey.split('-');
  const titleLabel = `${parseInt(parts[1])}월 ${parseInt(parts[2])}일`;
  const weekdayShort = ['일','월','화','수','목','금','토'];
  const weekday = weekdayShort[new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])).getDay()];

  let listHtml = '';
  if (schedules.length === 0 && tasks.length === 0) {
    listHtml = `<div style="padding:24px 4px; text-align:center; color:var(--text-soft); font-size:13px;">이날 일정 없어.<br>아래 '+ 일정 추가' 로 시작.</div>`;
  } else {
    listHtml += '<div style="display:flex; flex-direction:column; gap:7px;">';
    for (const s of schedules) {
      let timeLabel;
      if (s.isAllDay) {
        timeLabel = '<span style="font-size:10px; padding:1px 7px; background:var(--surface2); border-radius:4px; color:var(--text-soft);">종일</span>';
      } else {
        const t1 = (typeof _isoToScheduleTimeKey === 'function') ? _isoToScheduleTimeKey(s.startAt) : '';
        const t2 = (typeof _isoToScheduleTimeKey === 'function') ? _isoToScheduleTimeKey(s.endAt) : '';
        timeLabel = `<span style="font-size:12px; color:var(--text-soft);">${t1 || ''}–${t2 || ''}</span>`;
      }
      const notify = (s.notifyMinutesBefore !== null && s.notifyMinutesBefore !== undefined)
        ? `<span style="font-size:10px; color:var(--text-soft); margin-left:6px;">🔔 ${s.notifyMinutesBefore}분 전</span>`
        : '';
      listHtml += `
        <div onclick="openScheduleEditModal('${s.id}')" style="display:flex; align-items:center; gap:10px; padding:11px 12px; background:${_SCHED_MOD_SCHED_COLOR}14; border-left:3px solid ${_SCHED_MOD_SCHED_COLOR}; border-radius:8px; cursor:pointer;">
          <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:3px;">
            <div style="font-size:13px; font-weight:500; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(s.title || '')}</div>
            <div style="display:flex; align-items:center; gap:4px;">${timeLabel}${notify}</div>
          </div>
          <span style="color:var(--text-soft); font-size:13px;">›</span>
        </div>
      `;
    }
    for (const t of tasks) {
      const timeLabel = t.dueTime
        ? `<span style="font-size:12px; color:var(--text-soft);">${escapeHtml(t.dueTime)} 마감</span>`
        : '<span style="font-size:10px; padding:1px 7px; background:var(--surface2); border-radius:4px; color:var(--text-soft);">종일 마감</span>';
      const notify = (t.notifyMinutesBefore !== null && t.notifyMinutesBefore !== undefined)
        ? `<span style="font-size:10px; color:var(--text-soft); margin-left:6px;">🔔 ${t.notifyMinutesBefore}분 전</span>`
        : '';
      listHtml += `
        <div onclick="openTaskEditModal('${t.id}')" style="display:flex; align-items:center; gap:10px; padding:11px 12px; background:${_SCHED_MOD_TASK_COLOR}14; border-left:3px solid ${_SCHED_MOD_TASK_COLOR}; border-radius:8px; cursor:pointer;">
          <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:3px;">
            <div style="font-size:13px; font-weight:500; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">✓ ${escapeHtml(t.title || '')}</div>
            <div style="display:flex; align-items:center; gap:4px;">${timeLabel}${notify}</div>
          </div>
          <span style="color:var(--text-soft); font-size:13px;">›</span>
        </div>
      `;
    }
    listHtml += '</div>';
  }

  const html = `
    <div id="schedModalOverlay" onclick="if(event.target===this) _closeScheduleModals();" style="position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;">
      <div style="background:var(--bg); border:1px solid var(--border); border-radius:16px; width:100%; max-width:480px; max-height:80vh; overflow-y:auto; padding:18px 16px;" onclick="event.stopPropagation();">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
          <div style="font-size:16px; font-weight:600; color:var(--text);">📅 ${titleLabel} <span style="font-size:13px; color:var(--text-soft); font-weight:400;">(${weekday})</span></div>
          <button onclick="_closeScheduleModals()" style="background:transparent; border:none; color:var(--text-soft); font-size:22px; cursor:pointer; padding:2px 6px; line-height:1;" aria-label="닫기">×</button>
        </div>
        ${listHtml}
        <div style="display:flex; gap:8px; margin-top:16px;">
          <button onclick="openScheduleEditModal(null, { date: '${dateKey}' })" style="flex:1; padding:12px 8px; background:${_SCHED_MOD_SCHED_COLOR}; border:none; color:#fff; border-radius:10px; font-size:13px; font-weight:500; cursor:pointer; font-family:inherit;">+ 일정 추가</button>
          <button onclick="openTaskEditModal(null, { dueDate: '${dateKey}' })" style="flex:1; padding:12px 8px; background:${_SCHED_MOD_TASK_COLOR}; border:none; color:#fff; border-radius:10px; font-size:13px; font-weight:500; cursor:pointer; font-family:inherit;">+ 할 일 마감</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
}

// 일정 폼 모달 (create + update). opts: { date: 'YYYY-MM-DD' } (create 시 default 날짜).
function openScheduleEditModal(scheduleId, opts) {
  _closeScheduleModals();
  opts = opts || {};

  let entry = null;
  if (scheduleId) {
    entry = (state.schedules || []).find(s => s.id === scheduleId) || null;
  }

  const isEdit = !!entry;
  const titleVal = entry ? (entry.title || '') : '';
  const descVal  = entry ? (entry.description || '') : '';
  const isAllDay = entry ? !!entry.isAllDay : false;
  let notifyVal;
  if (entry) {
    notifyVal = (entry.notifyMinutesBefore === null || entry.notifyMinutesBefore === undefined)
      ? ''
      : String(entry.notifyMinutesBefore);
  } else {
    notifyVal = '15';
  }

  // 시작/종료 시각 — datetime-local input
  let startVal, endVal;
  if (entry) {
    startVal = _schedFormatLocalDT(new Date(entry.startAt));
    endVal   = _schedFormatLocalDT(new Date(entry.endAt));
  } else {
    const baseDate = opts.date || (new Date()).toLocaleDateString('sv-SE');  // 'YYYY-MM-DD' (Swedish locale 은 ISO 형식)
    const now = new Date();
    const startH = String(now.getHours()).padStart(2, '0');
    const endH = String((now.getHours() + 1) % 24).padStart(2, '0');
    startVal = `${baseDate}T${startH}:00`;
    endVal   = `${baseDate}T${endH}:00`;
  }

  const notifyOptions = [
    { v: '',     label: '없음' },
    { v: '0',    label: '시작 시' },
    { v: '5',    label: '5분 전' },
    { v: '10',   label: '10분 전' },
    { v: '15',   label: '15분 전 (기본)' },
    { v: '30',   label: '30분 전' },
    { v: '60',   label: '1시간 전' },
    { v: '120',  label: '2시간 전' },
    { v: '1440', label: '1일 전' }
  ];
  const notifyOptHtml = notifyOptions.map(o =>
    `<option value="${o.v}"${notifyVal === o.v ? ' selected' : ''}>${o.label}</option>`
  ).join('');

  const inputStyle = 'padding:10px 12px; background:var(--surface); border:1px solid var(--border); border-radius:8px; color:var(--text); font-size:14px; font-family:inherit; width:100%; box-sizing:border-box;';
  const dtStyle    = 'padding:10px 12px; background:var(--surface); border:1px solid var(--border); border-radius:8px; color:var(--text); font-size:13px; font-family:inherit; width:100%; box-sizing:border-box;';
  // 사용자 보고 2026-05-27: date/time input overflow fix — appearance none + min-width 0.
  const dateTimeStyle = dtStyle + ' -webkit-appearance:none; appearance:none; min-width:0; max-width:100%;';

  const html = `
    <div id="schedModalOverlay" onclick="if(event.target===this) _closeScheduleModals();" style="position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;">
      <div style="background:var(--bg); border:1px solid var(--border); border-radius:16px; width:100%; max-width:480px; max-height:85vh; overflow-y:auto; padding:18px 16px;" onclick="event.stopPropagation();">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
          <div style="font-size:16px; font-weight:600; color:var(--text);">${isEdit ? '✏️ 일정 수정' : '+ 새 일정'}</div>
          <button onclick="_closeScheduleModals()" style="background:transparent; border:none; color:var(--text-soft); font-size:22px; cursor:pointer; padding:2px 6px; line-height:1;" aria-label="닫기">×</button>
        </div>
        <div style="display:flex; flex-direction:column; gap:13px;">
          <label style="display:flex; flex-direction:column; gap:5px;">
            <span style="font-size:12px; color:var(--text-soft);">제목</span>
            <input type="text" id="schedFormTitle" value="${escapeHtml(titleVal)}" placeholder="일정 제목" maxlength="60" style="${inputStyle}">
          </label>
          <label style="display:flex; flex-direction:column; gap:5px;">
            <span style="font-size:12px; color:var(--text-soft);">메모 (선택)</span>
            <textarea id="schedFormDesc" rows="2" style="${inputStyle} resize:vertical; min-height:48px;">${escapeHtml(descVal)}</textarea>
          </label>
          <label style="display:flex; align-items:center; gap:8px; padding:4px 0; cursor:pointer;">
            <input type="checkbox" id="schedFormAllDay" ${isAllDay ? 'checked' : ''} onchange="_schedFormToggleAllDay()" style="width:18px; height:18px; cursor:pointer; accent-color:var(--accent2);">
            <span style="font-size:13px; color:var(--text);">종일</span>
          </label>
          <div id="schedFormTimeWrap" style="display:flex; flex-direction:column; gap:10px;">
            <label style="display:flex; flex-direction:column; gap:5px;">
              <span style="font-size:12px; color:var(--text-soft);">시작</span>
              <input type="datetime-local" id="schedFormStart" value="${startVal}" style="${dateTimeStyle}">
            </label>
            <label style="display:flex; flex-direction:column; gap:5px;">
              <span style="font-size:12px; color:var(--text-soft);">종료</span>
              <input type="datetime-local" id="schedFormEnd" value="${endVal}" style="${dateTimeStyle}">
            </label>
          </div>
          <label style="display:flex; flex-direction:column; gap:5px;">
            <span style="font-size:12px; color:var(--text-soft);">알림</span>
            <select id="schedFormNotify" style="${dtStyle}">${notifyOptHtml}</select>
          </label>
        </div>
        <div style="display:flex; gap:8px; margin-top:18px; flex-wrap:wrap;">
          ${isEdit ? `<button onclick="_schedFormDelete('${entry.id}')" style="padding:11px 14px; background:transparent; border:1px solid var(--border); color:#dc6c6c; border-radius:10px; font-size:13px; cursor:pointer; font-family:inherit;">🗑 삭제</button>` : ''}
          <button onclick="_closeScheduleModals()" style="flex:1; min-width:80px; padding:11px 14px; background:transparent; border:1px solid var(--border); color:var(--text-soft); border-radius:10px; font-size:13px; cursor:pointer; font-family:inherit;">취소</button>
          <button onclick="_schedFormSave('${entry ? entry.id : ''}', '${opts.date || ''}')" style="flex:1; min-width:80px; padding:11px 14px; background:var(--accent2); border:none; color:#fff; border-radius:10px; font-size:13px; font-weight:500; cursor:pointer; font-family:inherit;">${isEdit ? '저장' : '추가'}</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
  _schedFormToggleAllDay();
  setTimeout(() => {
    const inp = document.getElementById('schedFormTitle');
    if (inp && !isEdit) inp.focus();
  }, 50);
}

function _schedFormToggleAllDay() {
  const allDayCb = document.getElementById('schedFormAllDay');
  const timeWrap = document.getElementById('schedFormTimeWrap');
  if (!allDayCb || !timeWrap) return;
  if (allDayCb.checked) {
    timeWrap.style.opacity = '0.5';
    timeWrap.style.pointerEvents = 'none';
  } else {
    timeWrap.style.opacity = '';
    timeWrap.style.pointerEvents = '';
  }
}

function _schedFormSave(existingId, dateHint) {
  const title = (document.getElementById('schedFormTitle')?.value || '').trim();
  if (!title) {
    if (typeof showToast === 'function') showToast('제목을 입력해줘');
    return;
  }
  const desc = (document.getElementById('schedFormDesc')?.value || '').trim();
  const isAllDay = !!document.getElementById('schedFormAllDay')?.checked;
  let startStr = document.getElementById('schedFormStart')?.value || '';
  let endStr   = document.getElementById('schedFormEnd')?.value   || '';
  const notifyStr = document.getElementById('schedFormNotify')?.value;

  if (!startStr || !endStr) {
    if (typeof showToast === 'function') showToast('시작/종료 시간을 입력해줘');
    return;
  }

  // 종일 — 자정-자정 정렬
  if (isAllDay) {
    const dKey = startStr.slice(0, 10) || dateHint || (new Date()).toLocaleDateString('sv-SE');
    startStr = `${dKey}T00:00`;
    endStr   = `${dKey}T23:59`;
  }

  const start = new Date(startStr);
  const end   = new Date(endStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    if (typeof showToast === 'function') showToast('시간 형식이 잘못됐어');
    return;
  }
  if (end.getTime() < start.getTime()) {
    if (typeof showToast === 'function') showToast('종료가 시작보다 앞설 수 없어');
    return;
  }

  const notify = (notifyStr === '' || notifyStr === null) ? null : parseInt(notifyStr, 10);

  try {
    if (existingId) {
      const r = updateSchedule(existingId, {
        title,
        description: desc || null,
        startAt: start,
        endAt: end,
        isAllDay,
        notifyMinutesBefore: notify
      });
      if (!r) { if (typeof showToast === 'function') showToast('일정 없음'); return; }
      if (typeof showToast === 'function') showToast('✏️ 수정됨');
    } else {
      createSchedule({
        title,
        description: desc || null,
        startAt: start,
        endAt: end,
        isAllDay,
        notifyMinutesBefore: notify
      });
      if (typeof showToast === 'function') showToast('📅 추가됨');
    }
  } catch (e) {
    console.warn('[schedule save]', e);
    if (typeof showToast === 'function') showToast(`저장 실패: ${e.message || e}`);
    return;
  }

  _closeScheduleModals();
  if (typeof renderScheduleCalendarGrid === 'function') renderScheduleCalendarGrid();
  if (typeof _refreshScheduleDayTimelineIfOpen === 'function') _refreshScheduleDayTimelineIfOpen();
}

function _schedFormDelete(id) {
  if (!id) return;
  if (!confirm('이 일정 삭제할까?')) return;
  try {
    deleteSchedule(id);
    if (typeof showToast === 'function') showToast('🗑 삭제됨');
  } catch (e) {
    console.warn('[schedule delete]', e);
    if (typeof showToast === 'function') showToast(`삭제 실패: ${e.message || e}`);
    return;
  }
  _closeScheduleModals();
  if (typeof renderScheduleCalendarGrid === 'function') renderScheduleCalendarGrid();
  if (typeof _refreshScheduleDayTimelineIfOpen === 'function') _refreshScheduleDayTimelineIfOpen();
}

// ─────────────────────────────────────────────────────────────────────────────
// 사용자 명시 2026-05-27 ultrathink (3단계): 구글 캘린더식 일별 시간대 (day view).
//   캘린더 날짜 클릭 → 0–24시 hour grid + 시간대별 일정/할 일 블록. 종일/시간없음 = 상단 strip.
//   블록 탭 → 일정/할 일 수정 모달. 이전/다음 날 nav. 겹치는 일정 = 컬럼 분할.
// ─────────────────────────────────────────────────────────────────────────────
let _schedDayTimelineDate = null;
const _SCHED_DAY_HOUR_H = 52;  // 시간 한 칸 px

function _hhmmToMin(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
  if (isNaN(h) || isNaN(mi)) return null;
  return h * 60 + mi;
}

// 겹치는 timed 이벤트에 _col / _cols 부여 (greedy 컬럼 배치).
function _schedDayAssignColumns(events) {
  let clusterEnd = -1;
  let cluster = [];
  const flush = () => {
    const colEnds = [];
    for (const ev of cluster) {
      let placed = false;
      for (let c = 0; c < colEnds.length; c++) {
        if (ev.startMin >= colEnds[c]) { ev._col = c; colEnds[c] = ev.endMin; placed = true; break; }
      }
      if (!placed) { ev._col = colEnds.length; colEnds.push(ev.endMin); }
    }
    const total = colEnds.length || 1;
    for (const ev of cluster) ev._cols = total;
    cluster = [];
  };
  for (const ev of events) {
    if (cluster.length && ev.startMin >= clusterEnd) flush();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.endMin);
  }
  if (cluster.length) flush();
}

function _closeScheduleDayTimeline() {
  const ov = document.getElementById('schedDayTimelineOverlay');
  if (ov) ov.remove();
  _schedDayTimelineDate = null;
}

function _schedDayShift(delta) {
  if (!_schedDayTimelineDate) return;
  const [y, m, d] = _schedDayTimelineDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  const dk = (typeof _schedYMD === 'function')
    ? _schedYMD(dt)
    : `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  openScheduleDayTimeline(dk);
}

function openScheduleDayTimeline(dateKey) {
  if (!dateKey) return;
  _schedDayTimelineDate = dateKey;
  const existing = document.getElementById('schedDayTimelineOverlay');
  if (existing) existing.remove();

  const schedules = ((typeof getSchedulesForDate === 'function') ? getSchedulesForDate(dateKey) : []).slice();
  // 사용자 명시 2026-05-27: 완료된 할 일도 표시 (취소선) — getTasksDueOnDate 는 done 제외하므로 직접 수집.
  const tasks = (Array.isArray(state.tasks) ? state.tasks : []).filter(t => t.dueDate === dateKey);

  const parts = dateKey.split('-');
  const titleLabel = `${parseInt(parts[1])}월 ${parseInt(parts[2])}일`;
  const weekdayShort = ['일', '월', '화', '수', '목', '금', '토'];
  const dObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  const weekday = weekdayShort[dObj.getDay()];

  const HOUR_H = _SCHED_DAY_HOUR_H;

  const timed = [];
  const allDay = [];
  for (const s of schedules) {
    if (s.isAllDay) { allDay.push({ kind: 'schedule', id: s.id, title: s.title || '', color: _SCHED_MOD_SCHED_COLOR, done: false }); continue; }
    const sk = (typeof _isoToScheduleTimeKey === 'function') ? _isoToScheduleTimeKey(s.startAt) : null;
    const ek = (typeof _isoToScheduleTimeKey === 'function') ? _isoToScheduleTimeKey(s.endAt) : null;
    const sMin = _hhmmToMin(sk);
    let eMin = _hhmmToMin(ek);
    if (sMin == null) { allDay.push({ kind: 'schedule', id: s.id, title: s.title || '', color: _SCHED_MOD_SCHED_COLOR, done: false }); continue; }
    if (eMin == null || eMin <= sMin) eMin = Math.min(sMin + 60, 24 * 60);
    timed.push({ kind: 'schedule', id: s.id, title: s.title || '', startMin: sMin, endMin: eMin, color: _SCHED_MOD_SCHED_COLOR, sub: `${sk || ''}–${ek || ''}`, done: false });
  }
  for (const t of tasks) {
    const isDone = t.status === 'done';
    const sMin = _hhmmToMin(t.dueTime);
    if (sMin == null) { allDay.push({ kind: 'task', id: t.id, title: `✓ ${t.title || ''}`, color: _SCHED_MOD_TASK_COLOR, done: isDone }); continue; }
    timed.push({ kind: 'task', id: t.id, title: `✓ ${t.title || ''}`, startMin: sMin, endMin: Math.min(sMin + 30, 24 * 60), color: _SCHED_MOD_TASK_COLOR, sub: `${t.dueTime || ''} 마감`, done: isDone });
  }

  timed.sort((a, b) => (a.startMin - b.startMin) || (a.endMin - b.endMin));
  _schedDayAssignColumns(timed);

  // 시간 라인 + 라벨
  let hoursHtml = '';
  for (let h = 0; h < 24; h++) {
    hoursHtml += `<div style="position:absolute; top:${h * HOUR_H}px; left:0; right:0; height:1px; background:var(--border); opacity:0.55;"></div>`;
    hoursHtml += `<div style="position:absolute; top:${h * HOUR_H - 6}px; left:0; width:42px; font-size:10px; color:var(--text-soft); text-align:right; padding-right:6px; box-sizing:border-box;">${String(h).padStart(2, '0')}:00</div>`;
  }

  // 이벤트 블록 — onclick 없음. tap/long-press 드래그는 _schedDaySetupInteractions 에서 처리.
  let blocksHtml = '';
  for (const ev of timed) {
    const widthPct = 100 / (ev._cols || 1);
    const leftPct = (ev._col || 0) * widthPct;
    const top = (ev.startMin / 60) * HOUR_H;
    const height = Math.max(((ev.endMin - ev.startMin) / 60) * HOUR_H - 2, 20);
    const doneStyle = ev.done ? ' opacity:0.55;' : '';
    const titleStyle = ev.done ? ' text-decoration:line-through;' : '';
    blocksHtml += `
      <div class="sched-day-block" data-item-id="${ev.id}" data-kind="${ev.kind}" data-start="${ev.startMin}" data-end="${ev.endMin}" data-done="${ev.done ? 1 : 0}" style="position:absolute; top:${top}px; height:${height}px; left:calc(${leftPct}% + 2px); width:calc(${widthPct}% - 4px); background:${ev.color}26; border-left:3px solid ${ev.color}; border-radius:5px; padding:3px 6px; box-sizing:border-box; overflow:hidden; cursor:pointer; touch-action:pan-y;${doneStyle}">
        <div style="font-size:11px; font-weight:600; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.3;${titleStyle}">${escapeHtml(ev.title)}</div>
        ${height > 30 ? `<div style="font-size:9px; color:var(--text-soft); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(ev.sub || '')}</div>` : ''}
      </div>
    `;
  }

  // 현재 시각 라인 (오늘만)
  let nowLineHtml = '';
  const _now = new Date();
  const todayK = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`;
  let initialScrollTop = 7 * HOUR_H;  // 기본 07:00 으로 스크롤
  if (dateKey === todayK) {
    const nowMin = _now.getHours() * 60 + _now.getMinutes();
    const nowTop = (nowMin / 60) * HOUR_H;
    nowLineHtml = `
      <div style="position:absolute; top:${nowTop}px; left:42px; right:0; height:2px; background:#ff6b6b; z-index:3;"></div>
      <div style="position:absolute; top:${nowTop - 4}px; left:38px; width:9px; height:9px; border-radius:50%; background:#ff6b6b; z-index:3;"></div>
    `;
    initialScrollTop = Math.max(nowTop - HOUR_H * 2, 0);
  }

  // 종일 strip
  let allDayHtml = '';
  if (allDay.length > 0) {
    allDayHtml = `<div style="display:flex; flex-wrap:wrap; gap:6px; padding:8px 14px; border-bottom:1px solid var(--border);">
      ${allDay.map(a => {
        const act = a.kind === 'schedule' ? `openScheduleEditModal('${a.id}')` : `_schedDayTaskMenu('${a.id}')`;
        const ds = a.done ? ' opacity:0.55; text-decoration:line-through;' : '';
        return `<div onclick="${act}" style="font-size:11px; padding:4px 9px; background:${a.color}26; border-left:3px solid ${a.color}; border-radius:5px; color:var(--text); cursor:pointer; max-width:100%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;${ds}">${escapeHtml(a.title)}</div>`;
      }).join('')}
    </div>`;
  }

  const html = `
    <div id="schedDayTimelineOverlay" style="position:fixed; inset:0; background:var(--bg); z-index:9998; display:flex; flex-direction:column;">
      <div style="display:flex; align-items:center; gap:8px; padding:calc(12px + env(safe-area-inset-top, 0px)) 14px 12px; border-bottom:1px solid var(--border); flex-shrink:0;">
        <button onclick="_schedDayShift(-1)" aria-label="이전 날" style="background:var(--surface); border:1px solid var(--border); color:var(--text); width:34px; height:34px; border-radius:9px; cursor:pointer; font-size:15px; flex-shrink:0;">‹</button>
        <div style="flex:1; min-width:0; text-align:center;">
          <div style="font-size:16px; font-weight:600; color:var(--text);">${titleLabel} <span style="font-size:13px; color:var(--text-soft); font-weight:400;">(${weekday})</span></div>
        </div>
        <button onclick="_schedDayShift(1)" aria-label="다음 날" style="background:var(--surface); border:1px solid var(--border); color:var(--text); width:34px; height:34px; border-radius:9px; cursor:pointer; font-size:15px; flex-shrink:0;">›</button>
        <button onclick="_closeScheduleDayTimeline()" aria-label="닫기" style="background:transparent; border:none; color:var(--text-soft); font-size:24px; cursor:pointer; padding:0 4px; line-height:1; flex-shrink:0;">×</button>
      </div>
      ${allDayHtml}
      <div class="sched-day-scroll">
        <div style="position:relative; height:${24 * HOUR_H + 8}px; padding:4px 12px 0 0;">
          ${hoursHtml}
          <div style="position:absolute; left:42px; right:8px; top:0; bottom:0;">
            ${blocksHtml}
          </div>
          ${nowLineHtml}
        </div>
      </div>
      <div style="display:flex; gap:8px; padding:12px 14px calc(14px + env(safe-area-inset-bottom, 0px)); border-top:1px solid var(--border); flex-shrink:0;">
        <button onclick="openScheduleEditModal(null, { date: '${dateKey}' })" style="flex:1; padding:12px 8px; background:${_SCHED_MOD_SCHED_COLOR}; border:none; color:#fff; border-radius:10px; font-size:13px; font-weight:500; cursor:pointer; font-family:inherit;">+ 일정 추가</button>
        <button onclick="openTaskEditModal(null, { dueDate: '${dateKey}' })" style="flex:1; padding:12px 8px; background:${_SCHED_MOD_TASK_COLOR}; border:none; color:#fff; border-radius:10px; font-size:13px; font-weight:500; cursor:pointer; font-family:inherit;">+ 할 일 마감</button>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
  const scrollEl = document.querySelector('#schedDayTimelineOverlay .sched-day-scroll');
  if (scrollEl) scrollEl.scrollTop = initialScrollTop;
  _schedDaySetupInteractions();
}

// ─────────────────────────────────────────────────────────────────────────────
// 사용자 명시 2026-05-27 ultrathink (2단계): 블록 long-press → 드래그로 시간대 이동.
//   tap = 동작 dispatch (일정 → 수정 모달 / 할 일 → 수정·완료 메뉴). 320ms 꾹 누르면 드래그 모드.
//   완료된 할 일은 드래그 X (tap 메뉴만). 5분 snap.
// ─────────────────────────────────────────────────────────────────────────────
let _schedDrag = null;

function _schedDayPointY(e) {
  if (e.touches && e.touches.length) return e.touches[0].clientY;
  if (e.changedTouches && e.changedTouches.length) return e.changedTouches[0].clientY;
  return e.clientY;
}

function _schedDaySetupInteractions() {
  const blocks = document.querySelectorAll('#schedDayTimelineOverlay .sched-day-block');
  blocks.forEach(el => {
    el.addEventListener('touchstart', _schedDayDown, { passive: true });
    el.addEventListener('mousedown', _schedDayDown);
  });
}

function _schedDayDown(e) {
  if (_schedDrag) return;
  if (e.type === 'mousedown' && e.button !== 0) return;
  const el = e.currentTarget;
  const startMin = parseInt(el.dataset.start, 10) || 0;
  _schedDrag = {
    el,
    itemId: el.dataset.itemId,
    kind: el.dataset.kind,
    done: el.dataset.done === '1',
    origStart: startMin,
    origEnd: parseInt(el.dataset.end, 10) || 0,
    startY: _schedDayPointY(e),
    curStart: startMin,
    active: false,
    moved: false,
    isTouch: e.type === 'touchstart',
    timer: null,
    scrollEl: document.querySelector('#schedDayTimelineOverlay .sched-day-scroll'),
  };
  // 완료된 할 일은 드래그 비활성 (tap 메뉴만).
  if (!_schedDrag.done) {
    _schedDrag.timer = setTimeout(() => {
      if (!_schedDrag) return;
      _schedDrag.active = true;
      el.classList.add('sched-day-dragging');
      // 드래그 중 스크롤 잠금 (preventDefault 안 먹는 엔진 안전장치).
      if (_schedDrag.scrollEl) _schedDrag.scrollEl.style.overflow = 'hidden';
      try { if (navigator.vibrate) navigator.vibrate(15); } catch (e2) {}
      _schedDayShowDragLabel();
    }, 320);
  }
  if (_schedDrag.isTouch) {
    document.addEventListener('touchmove', _schedDayMove, { passive: false });
    document.addEventListener('touchend', _schedDayUp);
    document.addEventListener('touchcancel', _schedDayUp);
  } else {
    document.addEventListener('mousemove', _schedDayMove);
    document.addEventListener('mouseup', _schedDayUp);
  }
}

function _schedDayMove(e) {
  if (!_schedDrag) return;
  const dy = _schedDayPointY(e) - _schedDrag.startY;
  if (!_schedDrag.active) {
    if (Math.abs(dy) > 10) {
      // 움직임 = 스크롤 → long-press 취소 (드래그 아님).
      _schedDrag.moved = true;
      clearTimeout(_schedDrag.timer);
      _schedDayCleanup();
    }
    return;
  }
  if (e.cancelable) e.preventDefault();  // 드래그 중 스크롤 차단
  const HOUR_H = _SCHED_DAY_HOUR_H;
  const dur = _schedDrag.origEnd - _schedDrag.origStart;
  let newStart = _schedDrag.origStart + Math.round(dy / HOUR_H * 60);
  newStart = Math.round(newStart / 5) * 5;  // 5분 snap
  newStart = Math.max(0, Math.min(newStart, 24 * 60 - Math.max(dur, 5)));
  _schedDrag.curStart = newStart;
  _schedDrag.el.style.top = (newStart / 60 * HOUR_H) + 'px';
  _schedDayUpdateDragLabel(newStart);
}

function _schedDayUp(e) {
  if (!_schedDrag) return;
  const d = _schedDrag;
  clearTimeout(d.timer);
  if (d.active) {
    if (e && e.cancelable) e.preventDefault();
    d.el.classList.remove('sched-day-dragging');
    _schedDayRemoveDragLabel();
    _schedDrag = null;
    _schedDayDetach(d);
    if (d.curStart !== d.origStart) {
      _schedDayCommitMove(d);
    } else if (typeof _refreshScheduleDayTimelineIfOpen === 'function') {
      _refreshScheduleDayTimelineIfOpen();  // 원위치 정리
    }
    return;
  }
  _schedDrag = null;
  _schedDayDetach(d);
  if (!d.moved) _schedDayTapDispatch(d.kind, d.itemId);  // tap
}

function _schedDayDetach(d) {
  if (d && d.scrollEl) d.scrollEl.style.overflow = '';  // 스크롤 잠금 해제
  if (d && d.isTouch) {
    document.removeEventListener('touchmove', _schedDayMove, { passive: false });
    document.removeEventListener('touchend', _schedDayUp);
    document.removeEventListener('touchcancel', _schedDayUp);
  } else {
    document.removeEventListener('mousemove', _schedDayMove);
    document.removeEventListener('mouseup', _schedDayUp);
  }
}

function _schedDayCleanup() {
  const d = _schedDrag;
  _schedDrag = null;
  _schedDayDetach(d);
}

function _schedDayTapDispatch(kind, itemId) {
  if (kind === 'schedule') {
    if (typeof openScheduleEditModal === 'function') openScheduleEditModal(itemId);
  } else {
    _schedDayTaskMenu(itemId);
  }
}

function _schedDayShowDragLabel() {
  let lab = document.getElementById('schedDayDragLabel');
  if (!lab) {
    lab = document.createElement('div');
    lab.id = 'schedDayDragLabel';
    lab.style.cssText = 'position:fixed; top:calc(66px + env(safe-area-inset-top,0px)); left:50%; transform:translateX(-50%); background:var(--accent2); color:#fff; font-size:13px; font-weight:600; padding:5px 13px; border-radius:20px; z-index:10002; pointer-events:none; box-shadow:0 2px 8px rgba(0,0,0,0.3);';
    document.body.appendChild(lab);
  }
  _schedDayUpdateDragLabel(_schedDrag ? _schedDrag.curStart : 0);
}

function _schedDayUpdateDragLabel(startMin) {
  const lab = document.getElementById('schedDayDragLabel');
  if (!lab) return;
  lab.textContent = `${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}`;
}

function _schedDayRemoveDragLabel() {
  const lab = document.getElementById('schedDayDragLabel');
  if (lab) lab.remove();
}

function _schedDayCommitMove(d) {
  const dateKey = _schedDayTimelineDate;
  if (!dateKey) return;
  const [Y, M, D] = dateKey.split('-').map(Number);
  const hh = Math.floor(d.curStart / 60), mm = d.curStart % 60;
  const hhmm = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  try {
    if (d.kind === 'schedule') {
      const dur = d.origEnd - d.origStart;
      const startDate = new Date(Y, M - 1, D, hh, mm, 0, 0);
      const endTotal = d.curStart + dur;
      const endDate = new Date(Y, M - 1, D, Math.floor(endTotal / 60), endTotal % 60, 0, 0);
      if (typeof updateSchedule === 'function') updateSchedule(d.itemId, { startAt: startDate, endAt: endDate });
    } else {
      if (typeof setTaskDue === 'function') setTaskDue(d.itemId, { dueTime: hhmm });
    }
    if (typeof showToast === 'function') showToast(`⏰ ${hhmm} 로 이동`);
  } catch (err) {
    console.warn('[sched day move]', err);
  }
  if (typeof renderScheduleCalendarGrid === 'function') renderScheduleCalendarGrid();
  if (typeof renderExecute === 'function') renderExecute();
  if (typeof _refreshScheduleDayTimelineIfOpen === 'function') _refreshScheduleDayTimelineIfOpen();
}

// ── 할 일 tap → 수정 / 완료(되살리기) 액션 시트 (3단계) ──
function _schedDayTaskMenu(taskId) {
  const task = (Array.isArray(state.tasks) ? state.tasks : []).find(t => t.id === taskId);
  if (!task) return;
  const isDone = task.status === 'done';
  const ex = document.getElementById('schedDayTaskMenuOverlay');
  if (ex) ex.remove();
  const btn = 'width:100%; padding:14px; border-radius:12px; font-size:14px; font-family:inherit; cursor:pointer; border:1px solid var(--border); background:var(--surface); color:var(--text); text-align:center; font-weight:500;';
  const doneBtn = isDone
    ? `${btn}`
    : `${btn} background:var(--accent2); color:#fff; border-color:var(--accent2);`;
  const html = `
    <div id="schedDayTaskMenuOverlay" onclick="if(event.target===this) this.remove();" style="position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:10001; display:flex; align-items:flex-end; justify-content:center;">
      <div onclick="event.stopPropagation();" style="background:var(--bg); border-top-left-radius:18px; border-top-right-radius:18px; width:100%; max-width:520px; padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px)); box-sizing:border-box;">
        <div style="font-size:14px; font-weight:600; color:var(--text); margin-bottom:2px;${isDone ? ' text-decoration:line-through; opacity:0.6;' : ''}">✓ ${escapeHtml(task.title || '')}</div>
        <div style="font-size:11px; color:var(--text-soft); margin-bottom:14px;">${isDone ? '완료됨' : '할 일'}</div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          <button onclick="_schedDayTaskMenuAction('${taskId}','edit')" style="${btn}">✎ 수정</button>
          <button onclick="_schedDayTaskMenuAction('${taskId}','${isDone ? 'revive' : 'done'}')" style="${doneBtn}">${isDone ? '↩ 되살리기' : '✓ 완료'}</button>
          <button onclick="document.getElementById('schedDayTaskMenuOverlay').remove()" style="${btn} color:var(--text-soft);">닫기</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
}

function _schedDayTaskMenuAction(taskId, action) {
  const ov = document.getElementById('schedDayTaskMenuOverlay');
  if (ov) ov.remove();
  if (action === 'edit') {
    if (typeof openTaskEditModal === 'function') openTaskEditModal(taskId);
    return;
  }
  // done / revive — toggleQuestComplete 가 양방향 처리 (셸 보상은 ai_mission 만 → due task 무영향).
  if (typeof toggleQuestComplete === 'function') {
    toggleQuestComplete(taskId);
  } else {
    const t = (state.tasks || []).find(x => x.id === taskId);
    if (t) { t.status = (action === 'done') ? 'done' : 'active'; if (typeof saveState === 'function') saveState(); }
  }
  // 완료 시 예약 알림 cancel.
  const t2 = (state.tasks || []).find(x => x.id === taskId);
  if (t2 && t2.status === 'done' && typeof cancelNotificationById === 'function') {
    cancelNotificationById(taskId).catch(() => {});
  }
  if (typeof renderScheduleCalendarGrid === 'function') renderScheduleCalendarGrid();
  if (typeof _refreshScheduleDayTimelineIfOpen === 'function') _refreshScheduleDayTimelineIfOpen();
}

// 사용자 명시 2026-05-27 ultrathink (1단계): 알림 클릭 → 그 일정/할 일 날짜의 day view 열기.
//   SW 가 item_id 만 보냄 → state 에서 찾아 날짜 결정. (init 의 message listener / ?schedNotif deep link 에서 호출.)
function _openScheduleFromNotif(itemId) {
  if (!itemId) return;
  let dateKey = null;
  const s = (Array.isArray(state.schedules) ? state.schedules : []).find(x => x.id === itemId);
  if (s) {
    dateKey = (typeof _isoToScheduleDayKey === 'function') ? _isoToScheduleDayKey(s.startAt) : null;
  } else {
    const t = (Array.isArray(state.tasks) ? state.tasks : []).find(x => x.id === itemId);
    if (t) dateKey = t.dueDate || null;
  }
  if (!dateKey) return;
  if (typeof openScheduleDayTimeline === 'function') openScheduleDayTimeline(dateKey);
}

// 일정/할 일 수정·삭제 후 day view 열려 있으면 갱신 (스크롤 위치 유지).
function _refreshScheduleDayTimelineIfOpen() {
  if (!document.getElementById('schedDayTimelineOverlay') || !_schedDayTimelineDate) return;
  const scrollEl = document.querySelector('#schedDayTimelineOverlay .sched-day-scroll');
  const keep = scrollEl ? scrollEl.scrollTop : null;
  openScheduleDayTimeline(_schedDayTimelineDate);
  if (keep != null) {
    const ne = document.querySelector('#schedDayTimelineOverlay .sched-day-scroll');
    if (ne) ne.scrollTop = keep;
  }
}

// esc 키 닫기
try {
  window.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && document.getElementById('schedModalOverlay')) {
      _closeScheduleModals();
    }
  });
  // day view — 수정 모달이 위에 없을 때만 닫기.
  window.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    if (document.getElementById('schedModalOverlay') || document.getElementById('taskEditModalOverlay')) return;
    if (document.getElementById('schedDayTimelineOverlay')) _closeScheduleDayTimeline();
  });
} catch (e) {}

try {
  window.openScheduleDayModal = openScheduleDayModal;
  window.openScheduleEditModal = openScheduleEditModal;
  window._closeScheduleModals = _closeScheduleModals;
  window._schedFormSave = _schedFormSave;
  window._schedFormDelete = _schedFormDelete;
  window._schedFormToggleAllDay = _schedFormToggleAllDay;
  window.openScheduleDayTimeline = openScheduleDayTimeline;
  window._closeScheduleDayTimeline = _closeScheduleDayTimeline;
  window._schedDayShift = _schedDayShift;
  window._refreshScheduleDayTimelineIfOpen = _refreshScheduleDayTimelineIfOpen;
  window._schedDayTaskMenu = _schedDayTaskMenu;
  window._schedDayTaskMenuAction = _schedDayTaskMenuAction;
  window._openScheduleFromNotif = _openScheduleFromNotif;
} catch (e) {}
