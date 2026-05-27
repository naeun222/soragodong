// V4 (사용자 명시 2026-05-27 ultrathink — 구글 캘린더식 통합 바닥 시트):
// 일정/할 일 생성·편집을 밑에서 올라오는 바닥 시트 하나로 통합. create 모드는 일정/할 일 세그먼트 토글.
// openScheduleEditModal / openTaskEditModal 은 이 시트로 라우팅 (얇은 wrapper). CRUD 는 13-schedule-crud.js 재사용.
// on-grid 드래그 생성(15 day view)에서 시작/종료를 _schedSheetSetTimeRange 로 라이브 반영.

let _schedSheetCtx = null;  // { mode:'create'|'edit', type:'schedule'|'task', id }

const _SCHED_SHEET_NOTIFY_OPTIONS = [
  { v: '',     label: '없음' },
  { v: '0',    label: '시작 시' },
  { v: '5',    label: '5분 전' },
  { v: '10',   label: '10분 전' },
  { v: '15',   label: '15분 전' },
  { v: '30',   label: '30분 전' },
  { v: '60',   label: '1시간 전' },
  { v: '120',  label: '2시간 전' },
  { v: '1440', label: '1일 전' }
];

function _closeSchedSheet() {
  const ov = document.getElementById('schedSheetOverlay');
  if (ov) ov.remove();
  _schedSheetCtx = null;
  // on-grid 초안이 남아 있으면 제거 (day view).
  if (typeof _schedDayClearDraft === 'function') _schedDayClearDraft();
}

// 'YYYY-MM-DD' + 분(0~1439) → 'YYYY-MM-DDTHH:MM'
function _schedSheetDateMinToLocal(dateKey, minutes) {
  const m = Math.max(0, Math.min(minutes, 24 * 60 - 1));
  const HH = String(Math.floor(m / 60)).padStart(2, '0');
  const MM = String(m % 60).padStart(2, '0');
  return `${dateKey}T${HH}:${MM}`;
}

// opts: { type:'schedule'|'task', id?, date?, dueDate?, startMin?, endMin? }
function openScheduleSheet(opts) {
  opts = opts || {};
  _closeSchedSheet();

  const type0 = opts.type === 'task' ? 'task' : 'schedule';
  const id = opts.id || null;
  const isEdit = !!id;
  const docked = !!opts.docked;  // day-grid 초안에서 열림 — 백드롭 포인터 통과(위 그리드 핸들 조작 유지).

  let entry = null, task = null;
  if (isEdit && type0 === 'schedule') {
    entry = (state.schedules || []).find(s => s.id === id) || null;
    if (!entry) { if (typeof showToast === 'function') showToast('일정 없음'); return; }
  }
  if (isEdit && type0 === 'task') {
    task = (state.tasks || []).find(t => t.id === id) || null;
    if (!task) { if (typeof showToast === 'function') showToast('할 일 없음'); return; }
  }

  _schedSheetCtx = { mode: isEdit ? 'edit' : 'create', type: type0, id };

  // ── 공통 prefill ──
  const titleVal = isEdit ? (entry ? (entry.title || '') : (task ? (task.title || '') : '')) : '';
  const descVal  = isEdit ? (entry ? (entry.description || '') : (task ? (task.description || '') : '')) : '';

  // ── 일정 prefill ──
  const evAllDay = entry ? !!entry.isAllDay : false;
  let evStart, evEnd;
  if (entry) {
    evStart = (typeof _schedFormatLocalDT === 'function') ? _schedFormatLocalDT(new Date(entry.startAt)) : '';
    evEnd   = (typeof _schedFormatLocalDT === 'function') ? _schedFormatLocalDT(new Date(entry.endAt)) : '';
  } else {
    const baseDate = opts.date || (new Date()).toLocaleDateString('sv-SE');
    if (typeof opts.startMin === 'number' && typeof opts.endMin === 'number') {
      evStart = _schedSheetDateMinToLocal(baseDate, opts.startMin);
      evEnd   = _schedSheetDateMinToLocal(baseDate, opts.endMin);
    } else {
      const now = new Date();
      const sH = String(now.getHours()).padStart(2, '0');
      const eH = String((now.getHours() + 1) % 24).padStart(2, '0');
      evStart = `${baseDate}T${sH}:00`;
      evEnd   = `${baseDate}T${eH}:00`;
    }
  }

  // 날짜/시간 분리 (구글식 칩 — 네이티브 date/time 피커).
  const evStartDate = evStart.slice(0, 10), evStartTime = evStart.slice(11, 16);
  const evEndDate   = evEnd.slice(0, 10),   evEndTime   = evEnd.slice(11, 16);

  // ── 할 일 prefill ──
  const tkDueDate = task ? (task.dueDate || '') : (opts.dueDate || opts.date || (new Date()).toLocaleDateString('sv-SE'));
  // 종일 마감 = dueTime 없음. create 기본 종일 ON. 토글 off 시 보여줄 시간 기본값 09:00.
  const tkAllDay  = task ? !task.dueTime : true;
  const tkDueTime = task ? (task.dueTime || '09:00') : '09:00';

  // ── 알림 prefill ──
  let notifyVal;
  if (entry) {
    notifyVal = (entry.notifyMinutesBefore === null || entry.notifyMinutesBefore === undefined) ? '' : String(entry.notifyMinutesBefore);
  } else if (task) {
    notifyVal = (task.notifyMinutesBefore === null || task.notifyMinutesBefore === undefined) ? '' : String(task.notifyMinutesBefore);
  } else {
    notifyVal = type0 === 'schedule' ? '15' : '';
  }
  const notifyOptHtml = _SCHED_SHEET_NOTIFY_OPTIONS.map(o =>
    `<option value="${o.v}"${notifyVal === o.v ? ' selected' : ''}>${o.label}</option>`
  ).join('');

  const inp  = 'padding:11px 13px; background:var(--surface); border:1px solid var(--border); border-radius:10px; color:var(--text); font-size:14px; font-family:inherit; width:100%; box-sizing:border-box;';
  const dtInp = inp + ' font-size:13px; -webkit-appearance:none; appearance:none; min-width:0; max-width:100%;';
  const fieldLabel = 'font-size:12px; color:var(--text-soft);';

  // 세그먼트 토글 — create 모드만.
  const segHtml = isEdit ? '' : `
    <div class="sched-sheet-seg">
      <button id="schedSheetSegEvent" type="button" onclick="_schedSheetSetType('schedule')">일정</button>
      <button id="schedSheetSegTask" type="button" onclick="_schedSheetSetType('task')">할 일</button>
    </div>`;

  const html = `
    <div id="schedSheetOverlay" class="sched-sheet-overlay${docked ? ' sched-sheet-overlay-docked' : ''}" onclick="if(event.target===this) _closeSchedSheet();">
      <div class="sched-sheet${docked ? ' sched-sheet-docked' : ''}" onclick="event.stopPropagation();">
        <div class="sched-sheet-grip"></div>
        <div class="sched-sheet-topbar">
          <button type="button" onclick="_closeSchedSheet()" class="sched-sheet-cancel">취소</button>
          <button type="button" onclick="_schedSheetSave()" class="sched-sheet-save">${isEdit ? '저장' : '추가'}</button>
        </div>
        <input type="text" id="schedSheetTitle" value="${escapeHtml(titleVal)}" placeholder="제목 추가" maxlength="60" class="sched-sheet-title">
        ${segHtml}
        <div class="sched-sheet-fields">
          <div id="schedSheetEventFields" style="display:flex; flex-direction:column; gap:4px;">
            <label class="sched-sheet-row-toggle">
              <span>종일</span>
              <span class="sw-toggle">
                <input type="checkbox" id="schedSheetAllDay" ${evAllDay ? 'checked' : ''} onchange="_schedSheetToggleAllDay()">
                <span class="sw-track"></span><span class="sw-knob"></span>
              </span>
            </label>
            <div id="schedSheetTimeWrap" class="sched-sheet-dt-rows">
              <div class="sched-sheet-dt">
                <span class="sched-sheet-dt-lead">시작</span>
                <input type="date" id="schedSheetStartDate" value="${evStartDate}" class="sched-sheet-dt-date">
                <input type="time" id="schedSheetStartTime" value="${evStartTime}" step="300" class="sched-sheet-dt-time sched-sheet-timeonly">
              </div>
              <div class="sched-sheet-dt">
                <span class="sched-sheet-dt-lead">종료</span>
                <input type="date" id="schedSheetEndDate" value="${evEndDate}" class="sched-sheet-dt-date">
                <input type="time" id="schedSheetEndTime" value="${evEndTime}" step="300" class="sched-sheet-dt-time sched-sheet-timeonly">
              </div>
            </div>
          </div>
          <div id="schedSheetTaskFields" style="display:none; flex-direction:column; gap:4px;">
            <label class="sched-sheet-row-toggle">
              <span>종일 마감</span>
              <span class="sw-toggle sw-task">
                <input type="checkbox" id="schedSheetTaskAllDay" ${tkAllDay ? 'checked' : ''} onchange="_schedSheetToggleTaskAllDay()">
                <span class="sw-track"></span><span class="sw-knob"></span>
              </span>
            </label>
            <div class="sched-sheet-dt">
              <span class="sched-sheet-dt-lead">마감</span>
              <input type="date" id="schedSheetDueDate" value="${tkDueDate}" class="sched-sheet-dt-date">
              <input type="time" id="schedSheetDueTime" value="${tkDueTime}" step="300" class="sched-sheet-dt-time">
            </div>
          </div>
          <label style="display:flex; flex-direction:column; gap:5px;">
            <span style="${fieldLabel}">메모 (선택)</span>
            <textarea id="schedSheetDesc" rows="2" style="${inp} resize:vertical; min-height:46px;">${escapeHtml(descVal)}</textarea>
          </label>
          <label style="display:flex; flex-direction:column; gap:5px;">
            <span style="${fieldLabel}">알림</span>
            <select id="schedSheetNotify" style="${dtInp}">${notifyOptHtml}</select>
          </label>
        </div>
        ${isEdit ? `<button type="button" onclick="_schedSheetDelete()" class="sched-sheet-delete">🗑 삭제</button>` : ''}
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
  _schedSheetSetType(type0);
  _schedSheetToggleAllDay();
  _schedSheetToggleTaskAllDay();
  if (!isEdit) {
    setTimeout(() => {
      const t = document.getElementById('schedSheetTitle');
      if (t) t.focus();
    }, 60);
  }
}

function _schedSheetSetType(type) {
  if (!_schedSheetCtx) return;
  _schedSheetCtx.type = (type === 'task') ? 'task' : 'schedule';
  const evBtn = document.getElementById('schedSheetSegEvent');
  const tkBtn = document.getElementById('schedSheetSegTask');
  const evFields = document.getElementById('schedSheetEventFields');
  const tkFields = document.getElementById('schedSheetTaskFields');
  const isEvent = _schedSheetCtx.type === 'schedule';
  if (evBtn && tkBtn) {
    if (isEvent) {
      evBtn.classList.add('active'); evBtn.style.background = 'var(--cal-event)'; evBtn.style.color = 'var(--cal-event-on)';
      tkBtn.classList.remove('active'); tkBtn.style.background = 'transparent'; tkBtn.style.color = 'var(--text-soft)';
    } else {
      tkBtn.classList.add('active'); tkBtn.style.background = 'var(--cal-task)'; tkBtn.style.color = 'var(--cal-task-on)';
      evBtn.classList.remove('active'); evBtn.style.background = 'transparent'; evBtn.style.color = 'var(--text-soft)';
    }
  }
  if (evFields) evFields.style.display = isEvent ? 'flex' : 'none';
  if (tkFields) tkFields.style.display = isEvent ? 'none' : 'flex';
}

function _schedSheetToggleAllDay() {
  const cb = document.getElementById('schedSheetAllDay');
  const ev = document.getElementById('schedSheetEventFields');
  if (!cb || !ev) return;
  ev.querySelectorAll('.sched-sheet-timeonly').forEach(el => {
    el.style.display = cb.checked ? 'none' : '';
  });
}

function _schedSheetToggleTaskAllDay() {
  const cb = document.getElementById('schedSheetTaskAllDay');
  const t = document.getElementById('schedSheetDueTime');
  if (!cb || !t) return;
  t.style.display = cb.checked ? 'none' : '';
}

// on-grid 드래그 핸들 → 시트 시작/종료 라이브 반영 (day view, type=schedule).
function _schedSheetSetTimeRange(dateKey, startMin, endMin) {
  const sd = document.getElementById('schedSheetStartDate');
  const st = document.getElementById('schedSheetStartTime');
  const ed = document.getElementById('schedSheetEndDate');
  const et = document.getElementById('schedSheetEndTime');
  const sLocal = _schedSheetDateMinToLocal(dateKey, startMin);
  const eLocal = _schedSheetDateMinToLocal(dateKey, endMin);
  if (sd) sd.value = sLocal.slice(0, 10);
  if (st) st.value = sLocal.slice(11, 16);
  if (ed) ed.value = eLocal.slice(0, 10);
  if (et) et.value = eLocal.slice(11, 16);
}

function _schedSheetSave() {
  const ctx = _schedSheetCtx;
  if (!ctx) return;
  const title = (document.getElementById('schedSheetTitle')?.value || '').trim();
  if (!title) { if (typeof showToast === 'function') showToast('제목을 입력해줘'); return; }
  const desc = (document.getElementById('schedSheetDesc')?.value || '').trim();
  const notifyStr = document.getElementById('schedSheetNotify')?.value;
  const notify = (notifyStr === '' || notifyStr === null || notifyStr === undefined) ? null : parseInt(notifyStr, 10);

  try {
    if (ctx.type === 'schedule') {
      const isAllDay = !!document.getElementById('schedSheetAllDay')?.checked;
      const sDate = document.getElementById('schedSheetStartDate')?.value || '';
      const eDate = document.getElementById('schedSheetEndDate')?.value || '';
      const sTime = document.getElementById('schedSheetStartTime')?.value || '00:00';
      const eTime = document.getElementById('schedSheetEndTime')?.value || '00:00';
      if (!sDate || !eDate) { if (typeof showToast === 'function') showToast('시작/종료 날짜를 입력해줘'); return; }
      let startStr, endStr;
      if (isAllDay) {
        startStr = `${sDate}T00:00`;
        endStr   = `${eDate}T23:59`;
      } else {
        startStr = `${sDate}T${sTime}`;
        endStr   = `${eDate}T${eTime}`;
      }
      const start = new Date(startStr), end = new Date(endStr);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) { if (typeof showToast === 'function') showToast('시간 형식이 잘못됐어'); return; }
      if (end.getTime() < start.getTime()) { if (typeof showToast === 'function') showToast('종료가 시작보다 앞설 수 없어'); return; }
      const payload = { title, description: desc || null, startAt: start, endAt: end, isAllDay, notifyMinutesBefore: notify };
      if (ctx.mode === 'edit') {
        if (!updateSchedule(ctx.id, payload)) { if (typeof showToast === 'function') showToast('일정 없음'); return; }
        if (typeof showToast === 'function') showToast('✏️ 수정됨');
      } else {
        createSchedule(payload);
        if (typeof showToast === 'function') showToast('📅 추가됨');
      }
    } else {
      const dueDate = document.getElementById('schedSheetDueDate')?.value || '';
      const taskAllDay = !!document.getElementById('schedSheetTaskAllDay')?.checked;
      const dueTime = taskAllDay ? '' : (document.getElementById('schedSheetDueTime')?.value || '');
      if (ctx.mode === 'edit') {
        const t = (state.tasks || []).find(x => x.id === ctx.id);
        if (!t) { if (typeof showToast === 'function') showToast('할 일 없음'); return; }
        t.title = title;
        t.description = desc || null;
        if (typeof setTaskDue === 'function') {
          setTaskDue(ctx.id, { dueDate: dueDate || null, dueTime: dueTime || null, notifyMinutesBefore: notify });
        } else {
          t.dueDate = dueDate || null; t.dueTime = dueTime || null; t.notifyMinutesBefore = notify;
          if (typeof saveState === 'function') saveState();
        }
        if (typeof showToast === 'function') showToast('✏️ 저장됨');
      } else {
        const todayK = (typeof todayKey === 'function') ? todayKey() : (new Date()).toLocaleDateString('sv-SE');
        const newTask = {
          id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          title,
          description: desc || null,
          status: 'active',
          slot: 'drawer',
          isToday: dueDate === todayK,
          date: dueDate || todayK,
          weight: 'light',
          energy: 'mid',
          priority: (typeof nextPriority === 'function') ? nextPriority() : 0,
          createdAt: new Date().toISOString(),
          dueDate: dueDate || null,
          dueTime: dueTime || null,
          notifyMinutesBefore: notify,
          source: 'manual_due'
        };
        if (!Array.isArray(state.tasks)) state.tasks = [];
        state.tasks.push(newTask);
        if (typeof saveState === 'function') saveState();
        // 마감 알림 (재)스케줄 — fire-and-forget.
        if ((dueDate || dueTime) && typeof scheduleNotificationForTask === 'function') {
          (async () => {
            try {
              if (typeof _ensureNotifPermissionForSchedule === 'function') await _ensureNotifPermissionForSchedule(newTask);
              await scheduleNotificationForTask(newTask);
            } catch (e) { console.warn('[task notif]', e); }
          })();
        }
        if (typeof showToast === 'function') showToast('✓ 할 일 추가됨');
      }
    }
  } catch (e) {
    console.warn('[sched sheet save]', e);
    if (typeof showToast === 'function') showToast(`저장 실패: ${e.message || e}`);
    return;
  }

  _closeSchedSheet();
  if (typeof renderExecute === 'function') renderExecute();
  if (typeof renderScheduleCalendarGrid === 'function') renderScheduleCalendarGrid();
  if (typeof _refreshScheduleDayTimelineIfOpen === 'function') _refreshScheduleDayTimelineIfOpen();
}

function _schedSheetDelete() {
  const ctx = _schedSheetCtx;
  if (!ctx || ctx.mode !== 'edit') return;
  if (!confirm(ctx.type === 'schedule' ? '이 일정 삭제할까?' : '이 할 일 삭제할까?')) return;
  try {
    if (ctx.type === 'schedule') {
      deleteSchedule(ctx.id);
    } else {
      state.tasks = (state.tasks || []).filter(t => t.id !== ctx.id);
      state.todaySchedule = (state.todaySchedule || []).filter(it => it.taskId !== ctx.id);
      if (typeof saveState === 'function') saveState();
      if (typeof cancelNotificationById === 'function') cancelNotificationById(ctx.id).catch(() => {});
    }
    if (typeof showToast === 'function') showToast('🗑 삭제됨');
  } catch (e) {
    console.warn('[sched sheet delete]', e);
    if (typeof showToast === 'function') showToast(`삭제 실패: ${e.message || e}`);
    return;
  }
  _closeSchedSheet();
  if (typeof renderExecute === 'function') renderExecute();
  if (typeof renderScheduleCalendarGrid === 'function') renderScheduleCalendarGrid();
  if (typeof _refreshScheduleDayTimelineIfOpen === 'function') _refreshScheduleDayTimelineIfOpen();
}

// esc → 시트 닫기 (시트가 맨 위일 때).
try {
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.getElementById('schedSheetOverlay')) _closeSchedSheet();
  });
} catch (e) {}

try {
  window.openScheduleSheet = openScheduleSheet;
  window._closeSchedSheet = _closeSchedSheet;
  window._schedSheetSetType = _schedSheetSetType;
  window._schedSheetToggleAllDay = _schedSheetToggleAllDay;
  window._schedSheetToggleTaskAllDay = _schedSheetToggleTaskAllDay;
  window._schedSheetSetTimeRange = _schedSheetSetTimeRange;
  window._schedSheetSave = _schedSheetSave;
  window._schedSheetDelete = _schedSheetDelete;
} catch (e) {}
