// V4 (사용자 명시 2026-05-27 ultrathink — 구글 캘린더식 통합 바닥 시트):
// 일정/할 일 생성·편집을 밑에서 올라오는 바닥 시트 하나로 통합. create 모드는 일정/할 일 세그먼트 토글.
// openScheduleEditModal / openTaskEditModal 은 이 시트로 라우팅 (얇은 wrapper). CRUD 는 13-schedule-crud.js 재사용.
// on-grid 드래그 생성(15 day view)에서 시작/종료를 _schedSheetSetTimeRange 로 라이브 반영.
// 사용자 명시 2026-05-27 ultrathink (재): 날짜/시간 = 구글식 인라인 펼침 피커 — 줄 탭 → 그 자리에 월간 달력 그리드 / 오전·오후·시·분 스크롤 휠.

let _schedSheetCtx = null;  // { mode, type, id, fields:{sYMD,sHM,eYMD,eHM,dueYMD,dueHM}, openPicker }

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

const _SCHED_WHEEL_ITEM_H = 40;  // 시간 휠 한 칸 px
const _SCHED_WD = ['일', '월', '화', '수', '목', '금', '토'];

function _schedPad2(n) { return String(n).padStart(2, '0'); }

function _closeSchedSheet() {
  const ov = document.getElementById('schedSheetOverlay');
  if (ov) ov.remove();
  _schedSheetCtx = null;
  if (typeof _schedDayClearDraft === 'function') _schedDayClearDraft();
}

// 'YYYY-MM-DD' + 분(0~1439) → 'YYYY-MM-DDTHH:MM'
function _schedSheetDateMinToLocal(dateKey, minutes) {
  const m = Math.max(0, Math.min(minutes, 24 * 60 - 1));
  return `${dateKey}T${_schedPad2(Math.floor(m / 60))}:${_schedPad2(m % 60)}`;
}

// 'YYYY-MM-DD' → '5월 20일 수요일'
function _schedSheetFmtDate(ymd) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const wd = _SCHED_WD[new Date(y, m - 1, d).getDay()];
  return `${m}월 ${d}일 ${wd}요일`;
}

// 'HH:MM' → '오후 6시' (정각) / '오후 7:45'
function _schedSheetFmtTime(hm) {
  if (!hm) return '';
  const [H, M] = hm.split(':').map(Number);
  const ampm = H < 12 ? '오전' : '오후';
  let h12 = H % 12; if (h12 === 0) h12 = 12;
  return M === 0 ? `${ampm} ${h12}시` : `${ampm} ${h12}:${_schedPad2(M)}`;
}

// 오늘 키 — 24-execute / save 와 같은 todayKey() 기준 (오늘 할 일 승격 판정에 사용).
function _schedSheetTodayKey() {
  return (typeof todayKey === 'function') ? todayKey() : (new Date()).toLocaleDateString('sv-SE');
}

// 알림 밑 picker HTML — 오늘 할 일 / 서랍장 칩 목록. create 모드만 호출.
function _schedSheetBuildPickerHtml(sheetDate) {
  const todayK = _schedSheetTodayKey();
  const isToday = sheetDate === todayK;
  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  const chip = t => {
    const due = (t.dueDate && t.dueDate !== sheetDate)
      ? `<span class="ssp-chip-due">📅${escapeHtml(t.dueDate.slice(5).replace('-', '/'))}</span>` : '';
    return `<button type="button" class="ssp-chip" onclick="_schedSheetPickExistingTask('${t.id}')">${escapeHtml((t.title || '').slice(0, 28))}${due}</button>`;
  };
  let groups = '';
  if (isToday) {
    const todayList = tasks.filter(t => t.slot === 'drawer' && t.isToday && t.status !== 'done');
    if (todayList.length) groups += `<div class="ssp-group-title">오늘 할 일</div><div class="ssp-chips">${todayList.map(chip).join('')}</div>`;
  }
  const drawerList = tasks.filter(t => t.slot === 'drawer' && !t.isToday && t.status !== 'done');
  if (drawerList.length) groups += `<div class="ssp-group-title">서랍장</div><div class="ssp-chips">${drawerList.map(chip).join('')}</div>`;
  if (!groups) return '';  // 가져올 할 일 없으면 picker 섹션 자체 숨김
  return `
    <div class="sched-sheet-picker">
      <span class="sched-sheet-picker-label">여기에 기존 할 일 놓기</span>
      ${groups}
    </div>`;
}

// picker 칩 탭 → 기존 task 를 시트의 날짜·시각에 매핑(이동). 한 task = 한 날짜 (덮어쓰기, 복제 X).
//   매핑 날짜가 오늘이면 '오늘 할 일'(isToday)로 승격, 아니면 서랍장 유지 (📅 그 날 캘린더/타임라인에 표시).
function _schedSheetPickExistingTask(taskId) {
  const ctx = _schedSheetCtx;
  if (!ctx) return;
  const task = (state.tasks || []).find(t => t.id === taskId);
  if (!task) { if (typeof showToast === 'function') showToast('할 일 없음'); return; }
  const isTaskSeg = ctx.type === 'task';
  const ymd = isTaskSeg ? ctx.fields.dueYMD : ctx.fields.sYMD;
  const allDayCb = document.getElementById(isTaskSeg ? 'schedSheetTaskAllDay' : 'schedSheetAllDay');
  const allDay = !!(allDayCb && allDayCb.checked);
  const hm = allDay ? null : (isTaskSeg ? ctx.fields.dueHM : ctx.fields.sHM);
  const notifyEl = document.getElementById('schedSheetNotify');
  const notifyStr = notifyEl ? notifyEl.value : '';
  const notify = (notifyStr === '' || notifyStr === null || notifyStr === undefined) ? null : parseInt(notifyStr, 10);
  const todayK = _schedSheetTodayKey();
  try {
    if (typeof setTaskDue === 'function') {
      setTaskDue(taskId, { dueDate: ymd || null, dueTime: hm || null, notifyMinutesBefore: notify });
    } else {
      task.dueDate = ymd || null; task.dueTime = hm || null; task.notifyMinutesBefore = notify;
    }
    task.isToday = (ymd === todayK);   // 오늘이면 오늘 할 일로, 아니면 서랍장 유지
    if (ymd === todayK) task.date = todayK;
    if (typeof saveState === 'function') saveState();
  } catch (e) {
    console.warn('[sched pick task]', e);
  }
  _closeSchedSheet();
  if (typeof renderExecute === 'function') renderExecute();
  if (typeof renderScheduleCalendarGrid === 'function') renderScheduleCalendarGrid();
  if (typeof _refreshScheduleDayTimelineIfOpen === 'function') _refreshScheduleDayTimelineIfOpen();
  if (typeof showToast === 'function') {
    const where = (ymd === todayK) ? '오늘 할 일' : (ymd ? ymd.slice(5).replace('-', '/') : '서랍장');
    showToast(`✓ ${(task.title || '').slice(0, 14)} → ${hm ? hm + ' ' : ''}${where}`);
  }
}

// opts: { type:'schedule'|'task', id?, date?, dueDate?, startMin?, endMin?, docked? }
function openScheduleSheet(opts) {
  opts = opts || {};
  _closeSchedSheet();

  const type0 = opts.type === 'task' ? 'task' : 'schedule';
  const id = opts.id || null;
  const isEdit = !!id;
  const docked = !!opts.docked;

  let entry = null, task = null;
  if (isEdit && type0 === 'schedule') {
    entry = (state.schedules || []).find(s => s.id === id) || null;
    if (!entry) { if (typeof showToast === 'function') showToast('일정 없음'); return; }
  }
  if (isEdit && type0 === 'task') {
    task = (state.tasks || []).find(t => t.id === id) || null;
    if (!task) { if (typeof showToast === 'function') showToast('할 일 없음'); return; }
  }

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
      evStart = `${baseDate}T${_schedPad2(now.getHours())}:00`;
      evEnd   = `${baseDate}T${_schedPad2((now.getHours() + 1) % 24)}:00`;
    }
  }

  // ── 할 일 prefill ──
  // 그리드 빈 시간대 탭으로 열면(startMin) 할 일 마감도 그 날짜·시각으로 맞춤(종일 OFF). 일정/할일 토글 전환해도 유지.
  const fromGridTime = (typeof opts.startMin === 'number');
  const gridTimeHM = fromGridTime ? `${_schedPad2(Math.floor(opts.startMin / 60))}:${_schedPad2(opts.startMin % 60)}` : null;
  const tkDueDate = task ? (task.dueDate || '') : (opts.dueDate || opts.date || (new Date()).toLocaleDateString('sv-SE'));
  const tkAllDay  = task ? !task.dueTime : !fromGridTime;   // 종일 마감 = dueTime 없음. create 기본 종일(그리드 탭이면 OFF).
  const tkDueTime = task ? (task.dueTime || '09:00') : (gridTimeHM || '09:00');

  _schedSheetCtx = {
    mode: isEdit ? 'edit' : 'create',
    type: type0,
    id,
    openPicker: null,
    fields: {
      sYMD: evStart.slice(0, 10), sHM: evStart.slice(11, 16),
      eYMD: evEnd.slice(0, 10),   eHM: evEnd.slice(11, 16),
      dueYMD: tkDueDate,          dueHM: tkDueTime
    }
  };

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

  const segHtml = isEdit ? '' : `
    <div class="sched-sheet-seg">
      <button id="schedSheetSegEvent" type="button" onclick="_schedSheetSetType('schedule')">일정</button>
      <button id="schedSheetSegTask" type="button" onclick="_schedSheetSetType('task')">할 일</button>
    </div>`;

  // 사용자 명시 2026-05-27: 알림 밑 picker — 오늘 할 일 / 서랍장에서 골라 이 시각에 놓기 (create 모드만).
  //   시트 날짜가 오늘이면 '오늘 할 일' + '서랍장' 둘 다, 다른 날이면 '서랍장' 만 (오늘 할 일은 정의상 오늘 것).
  const pickerHtml = isEdit ? '' : _schedSheetBuildPickerHtml(opts.date || opts.dueDate || (new Date()).toLocaleDateString('sv-SE'));

  // 날짜·시간 줄 (탭 → 인라인 펼침). 라벨은 _schedSheetRenderLabels 가 채움.
  const dtRow = (field, withTime) => `
    <div class="dt-row">
      <span class="dt-cell dt-cell-date" id="dtLabel-${field}-date" role="button" tabindex="0" onclick="_schedSheetTogglePicker('${field}','date')"></span>
      ${withTime ? `<span class="dt-cell dt-cell-time sched-sheet-timeonly" id="dtLabel-${field}-time" role="button" tabindex="0" onclick="_schedSheetTogglePicker('${field}','time')"></span>` : ''}
    </div>
    <div class="dt-slot" id="dtSlot-${field}"></div>`;

  const html = `
    <div id="schedSheetOverlay" class="sched-sheet-overlay${docked ? ' sched-sheet-overlay-docked' : ''}" onclick="if(event.target===this) _schedSheetTryDiscard();">
      <div class="sched-sheet${docked ? ' sched-sheet-docked' : ''}" data-detent="half" onclick="event.stopPropagation();">
        <div class="sched-sheet-grab"><div class="sched-sheet-grip"></div></div>
        <div class="sched-sheet-topbar">
          <button type="button" onclick="_closeSchedSheet()" class="sched-sheet-cancel">취소</button>
          <button type="button" onclick="_schedSheetSave()" class="sched-sheet-save">${isEdit ? '저장' : '추가'}</button>
        </div>
        <input type="text" id="schedSheetTitle" value="${escapeHtml(titleVal)}" placeholder="제목 추가" maxlength="60" class="sched-sheet-title">
        ${segHtml}
        <div class="sched-sheet-fields">
          <div id="schedSheetEventFields" style="display:flex; flex-direction:column;">
            <label class="sched-sheet-row-toggle">
              <span>종일</span>
              <span class="sw-toggle">
                <input type="checkbox" id="schedSheetAllDay" ${evAllDay ? 'checked' : ''} onchange="_schedSheetToggleAllDay()">
                <span class="sw-track"></span><span class="sw-knob"></span>
              </span>
            </label>
            <div id="schedSheetTimeWrap" class="dt-rows">
              ${dtRow('start', true)}
              ${dtRow('end', true)}
            </div>
          </div>
          <div id="schedSheetTaskFields" style="display:none; flex-direction:column;">
            <label class="sched-sheet-row-toggle">
              <span>종일 마감</span>
              <span class="sw-toggle sw-task">
                <input type="checkbox" id="schedSheetTaskAllDay" ${tkAllDay ? 'checked' : ''} onchange="_schedSheetToggleTaskAllDay()">
                <span class="sw-track"></span><span class="sw-knob"></span>
              </span>
            </label>
            <div class="dt-rows">
              ${dtRow('due', true)}
            </div>
          </div>
          <label style="display:flex; flex-direction:column; gap:5px; margin-top:6px;">
            <span style="${fieldLabel}">메모 (선택)</span>
            <textarea id="schedSheetDesc" rows="2" style="${inp} resize:vertical; min-height:46px;">${escapeHtml(descVal)}</textarea>
          </label>
          <label style="display:flex; flex-direction:column; gap:5px;">
            <span style="${fieldLabel}">알림</span>
            <select id="schedSheetNotify" style="${dtInp}">${notifyOptHtml}</select>
          </label>
          ${pickerHtml}
        </div>
        ${isEdit ? `<button type="button" onclick="_schedSheetDelete()" class="sched-sheet-delete">🗑 삭제</button>` : ''}
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
  // 드래그 시트 — 열 때 half 디텐트. grip 으로 위로 끌면 full, 내리면 half/닫기.
  const sheetEl = document.querySelector('#schedSheetOverlay .sched-sheet');
  if (sheetEl) {
    sheetEl.style.maxHeight = '92vh';
    // 사용자 명시 2026-05-27: 3단 디텐트 — 최소/중간(기본)/맨위. 열 때 중간(half), 본문 스크롤 OFF.
    _schedSheetApplyDetent('half', false);
    sheetEl.addEventListener('touchstart', _schedSheetDragDown, { passive: false });
    sheetEl.addEventListener('mousedown', _schedSheetDragDown);
  }
  _schedSheetSetType(type0);
  _schedSheetRenderLabels();
  _schedSheetToggleAllDay();
  _schedSheetToggleTaskAllDay();
  if (!isEdit) {
    setTimeout(() => {
      const t = document.getElementById('schedSheetTitle');
      if (t) t.focus();
    }, 60);
  }
  // 사용자 명시 2026-05-27: 서랍장 📅 버튼 등 — 열자마자 마감 날짜 달력 펼침 (할 일 타입 한정).
  if (opts.openDueDatePicker && _schedSheetCtx && _schedSheetCtx.type === 'task') {
    setTimeout(() => { if (typeof _schedSheetTogglePicker === 'function') _schedSheetTogglePicker('due', 'date'); }, 90);
  }
}

// ── field ↔ 모델 매핑 ──
function _schedSheetGetYMD(field) {
  const f = _schedSheetCtx.fields;
  return field === 'start' ? f.sYMD : field === 'end' ? f.eYMD : f.dueYMD;
}
function _schedSheetGetHM(field) {
  const f = _schedSheetCtx.fields;
  return field === 'start' ? f.sHM : field === 'end' ? f.eHM : f.dueHM;
}
function _schedSheetSetYMD(field, v) {
  const f = _schedSheetCtx.fields;
  if (field === 'start') f.sYMD = v; else if (field === 'end') f.eYMD = v; else f.dueYMD = v;
}
function _schedSheetSetHM(field, v) {
  const f = _schedSheetCtx.fields;
  if (field === 'start') f.sHM = v; else if (field === 'end') f.eHM = v; else f.dueHM = v;
}

function _schedSheetRenderLabels() {
  if (!_schedSheetCtx) return;
  ['start', 'end', 'due'].forEach(field => {
    const dl = document.getElementById(`dtLabel-${field}-date`);
    const tl = document.getElementById(`dtLabel-${field}-time`);
    if (dl) dl.textContent = _schedSheetFmtDate(_schedSheetGetYMD(field));
    if (tl) tl.textContent = _schedSheetFmtTime(_schedSheetGetHM(field));
  });
}

function _schedSheetSetType(type) {
  if (!_schedSheetCtx) return;
  _schedSheetCtx.type = (type === 'task') ? 'task' : 'schedule';
  _schedSheetCloseAllPickers();
  const evBtn = document.getElementById('schedSheetSegEvent');
  const tkBtn = document.getElementById('schedSheetSegTask');
  const evFields = document.getElementById('schedSheetEventFields');
  const tkFields = document.getElementById('schedSheetTaskFields');
  const isEvent = _schedSheetCtx.type === 'schedule';
  if (evBtn && tkBtn) {
    if (isEvent) {
      evBtn.style.background = 'var(--cal-event)'; evBtn.style.color = 'var(--cal-event-on)';
      tkBtn.style.background = 'transparent'; tkBtn.style.color = 'var(--text-soft)';
    } else {
      tkBtn.style.background = 'var(--cal-task)'; tkBtn.style.color = 'var(--cal-task-on)';
      evBtn.style.background = 'transparent'; evBtn.style.color = 'var(--text-soft)';
    }
  }
  if (evFields) evFields.style.display = isEvent ? 'flex' : 'none';
  if (tkFields) tkFields.style.display = isEvent ? 'none' : 'flex';
}

function _schedSheetToggleAllDay() {
  const cb = document.getElementById('schedSheetAllDay');
  const ev = document.getElementById('schedSheetEventFields');
  if (!cb || !ev) return;
  if (cb.checked) _schedSheetCloseAllPickers();
  ev.querySelectorAll('.sched-sheet-timeonly').forEach(el => { el.style.display = cb.checked ? 'none' : ''; });
}

function _schedSheetToggleTaskAllDay() {
  const cb = document.getElementById('schedSheetTaskAllDay');
  const tl = document.getElementById('dtLabel-due-time');
  if (!cb || !tl) return;
  if (cb.checked) _schedSheetCloseAllPickers();
  tl.style.display = cb.checked ? 'none' : '';
}

// ── 인라인 펼침 피커 (날짜 달력 / 시간 휠) ──
function _schedSheetCloseAllPickers() {
  if (!_schedSheetCtx) return;
  _schedSheetCtx.openPicker = null;
  document.querySelectorAll('#schedSheetOverlay .dt-slot').forEach(s => { s.innerHTML = ''; });
  document.querySelectorAll('#schedSheetOverlay .dt-cell').forEach(c => { c.style.color = ''; c.style.background = ''; });
}

function _schedSheetTogglePicker(field, kind) {
  if (!_schedSheetCtx) return;
  const op = _schedSheetCtx.openPicker;
  const same = op && op.field === field && op.kind === kind;
  _schedSheetCloseAllPickers();
  if (same) return;  // 토글 닫기
  _schedSheetCtx.openPicker = { field, kind };
  const accent = _schedSheetCtx.type === 'task' ? 'var(--cal-task)' : 'var(--cal-event)';
  const cell = document.getElementById(`dtLabel-${field}-${kind}`);
  if (cell) cell.style.color = accent;
  const slot = document.getElementById(`dtSlot-${field}`);
  if (!slot) return;
  if (kind === 'date') _schedSheetRenderDatePicker(slot, field, _schedSheetGetYMD(field).slice(0, 7));
  else _schedSheetRenderTimePicker(slot, field);
}

function _schedSheetRenderDatePicker(slot, field, cursorYM) {
  const cur = _schedSheetGetYMD(field);
  const [Y, M] = cursorYM.split('-').map(Number);
  const first = new Date(Y, M - 1, 1).getDay();
  const lastDay = new Date(Y, M, 0).getDate();
  const accent = _schedSheetCtx.type === 'task' ? 'var(--cal-task)' : 'var(--cal-event)';
  const accentOn = _schedSheetCtx.type === 'task' ? 'var(--cal-task-on)' : 'var(--cal-event-on)';

  let cells = '';
  for (let i = 0; i < first; i++) cells += `<span class="dtc-cell dtc-empty"></span>`;
  for (let d = 1; d <= lastDay; d++) {
    const ymd = `${Y}-${_schedPad2(M)}-${_schedPad2(d)}`;
    const sel = ymd === cur;
    const style = sel ? ` style="background:${accent}; color:${accentOn}; font-weight:700;"` : '';
    cells += `<span class="dtc-cell${sel ? ' sel' : ''}"${style} onclick="_schedSheetPickDate('${field}','${ymd}')">${d}</span>`;
  }

  slot.innerHTML = `
    <div class="dtc">
      <div class="dtc-nav">
        <button type="button" class="dtc-nav-btn" aria-label="이전 달" onclick="_schedSheetDatePickerNav('${field}',-1)">‹</button>
        <span class="dtc-month">${Y}년 ${M}월</span>
        <button type="button" class="dtc-nav-btn" aria-label="다음 달" onclick="_schedSheetDatePickerNav('${field}',1)">›</button>
      </div>
      <div class="dtc-weekdays">${_SCHED_WD.map(w => `<span>${w}</span>`).join('')}</div>
      <div class="dtc-grid">${cells}</div>
    </div>`;
}

function _schedSheetDatePickerNav(field, delta) {
  const slot = document.getElementById(`dtSlot-${field}`);
  if (!slot) return;
  const monthEl = slot.querySelector('.dtc-month');
  let Y, M;
  if (monthEl) {
    const m = monthEl.textContent.match(/(\d+)년\s*(\d+)월/);
    Y = parseInt(m[1], 10); M = parseInt(m[2], 10);
  } else {
    [Y, M] = _schedSheetGetYMD(field).split('-').map(Number);
  }
  const dt = new Date(Y, M - 1 + delta, 1);
  _schedSheetRenderDatePicker(slot, field, `${dt.getFullYear()}-${_schedPad2(dt.getMonth() + 1)}`);
}

function _schedSheetPickDate(field, ymd) {
  _schedSheetSetYMD(field, ymd);
  // 일정: 시작 날짜를 종료보다 뒤로 옮기면 종료도 같이 당김.
  if (field === 'start') {
    const f = _schedSheetCtx.fields;
    if (f.eYMD < f.sYMD) f.eYMD = f.sYMD;
  } else if (field === 'end') {
    const f = _schedSheetCtx.fields;
    if (f.eYMD < f.sYMD) f.sYMD = f.eYMD;
  }
  _schedSheetRenderLabels();
  const slot = document.getElementById(`dtSlot-${field}`);
  if (slot) _schedSheetRenderDatePicker(slot, field, ymd.slice(0, 7));  // 하이라이트 이동
}

function _schedSheetRenderTimePicker(slot, field) {
  const hm = _schedSheetGetHM(field);
  const [H, M] = hm.split(':').map(Number);
  const ampmIdx = H < 12 ? 0 : 1;
  let h12 = H % 12; if (h12 === 0) h12 = 12;
  const hourIdx = h12 - 1;
  const minIdx = Math.round(M / 5) % 12;

  const ampmItems = ['오전', '오후'];
  const colHtml = (items, selIdx) =>
    `<div class="dtw-col" data-field="${field}">
      <div class="dtw-pad"></div>
      ${items.map((t, i) => `<div class="dtw-item${i === selIdx ? ' sel' : ''}">${t}</div>`).join('')}
      <div class="dtw-pad"></div>
    </div>`;

  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1));
  const mins = Array.from({ length: 12 }, (_, i) => _schedPad2(i * 5));

  slot.innerHTML = `
    <div class="dtw">
      <div class="dtw-band"></div>
      ${colHtml(ampmItems, ampmIdx)}
      ${colHtml(hours, hourIdx)}
      ${colHtml(mins, minIdx)}
      <div class="dtw-fade dtw-fade-top"></div>
      <div class="dtw-fade dtw-fade-bottom"></div>
    </div>`;

  const cols = slot.querySelectorAll('.dtw-col');
  const initIdx = [ampmIdx, hourIdx, minIdx];
  const maxIdx = [1, 11, 11];
  cols.forEach((col, i) => {
    requestAnimationFrame(() => { col.scrollTop = initIdx[i] * _SCHED_WHEEL_ITEM_H; });
    col.dataset.lastIdx = String(initIdx[i]);
    let timer = null;
    col.addEventListener('scroll', () => {
      const idx = Math.max(0, Math.min(Math.round(col.scrollTop / _SCHED_WHEEL_ITEM_H), maxIdx[i]));
      if (String(idx) !== col.dataset.lastIdx) {
        col.dataset.lastIdx = String(idx);
        if (typeof _calHaptic === 'function') _calHaptic('tick');  // iOS 피커식 디텐트 진동
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => _schedSheetTimeWheelSettle(field, slot), 110);
    }, { passive: true });
  });
}

function _schedSheetTimeWheelSettle(field, slot) {
  const cols = slot.querySelectorAll('.dtw-col');
  if (cols.length < 3) return;
  const idx = c => Math.max(0, Math.round(c.scrollTop / _SCHED_WHEEL_ITEM_H));
  const ampmIdx = Math.min(idx(cols[0]), 1);
  const hourIdx = Math.min(idx(cols[1]), 11);
  const minIdx  = Math.min(idx(cols[2]), 11);
  let h12 = hourIdx + 1;
  let H;
  if (ampmIdx === 0) H = (h12 === 12) ? 0 : h12;
  else H = (h12 === 12) ? 12 : h12 + 12;
  _schedSheetSetHM(field, `${_schedPad2(H)}:${_schedPad2(minIdx * 5)}`);
  _schedSheetRenderLabels();
  // 가운데 항목 강조 갱신
  cols.forEach((col, ci) => {
    const sel = [ampmIdx, hourIdx, minIdx][ci];
    col.querySelectorAll('.dtw-item').forEach((it, i) => it.classList.toggle('sel', i === sel));
  });
}

// on-grid 드래그 핸들 → 시트 시작/종료 라이브 반영 (day view, type=schedule).
function _schedSheetSetTimeRange(dateKey, startMin, endMin) {
  if (!_schedSheetCtx) return;
  const f = _schedSheetCtx.fields;
  const s = _schedSheetDateMinToLocal(dateKey, startMin);
  const e = _schedSheetDateMinToLocal(dateKey, endMin);
  f.sYMD = s.slice(0, 10); f.sHM = s.slice(11, 16);
  f.eYMD = e.slice(0, 10); f.eHM = e.slice(11, 16);
  _schedSheetRenderLabels();
  // 시간 피커가 열려 있으면 휠 위치도 갱신.
  const op = _schedSheetCtx.openPicker;
  if (op && op.kind === 'time' && (op.field === 'start' || op.field === 'end')) {
    const slot = document.getElementById(`dtSlot-${op.field}`);
    if (slot) _schedSheetRenderTimePicker(slot, op.field);
  }
}

function _schedSheetSave() {
  const ctx = _schedSheetCtx;
  if (!ctx) return;
  const title = (document.getElementById('schedSheetTitle')?.value || '').trim();
  if (!title) { if (typeof showToast === 'function') showToast('제목을 입력해줘'); return; }
  const desc = (document.getElementById('schedSheetDesc')?.value || '').trim();
  const notifyStr = document.getElementById('schedSheetNotify')?.value;
  const notify = (notifyStr === '' || notifyStr === null || notifyStr === undefined) ? null : parseInt(notifyStr, 10);
  const f = ctx.fields;

  try {
    if (ctx.type === 'schedule') {
      const isAllDay = !!document.getElementById('schedSheetAllDay')?.checked;
      if (!f.sYMD || !f.eYMD) { if (typeof showToast === 'function') showToast('시작/종료 날짜를 입력해줘'); return; }
      const startStr = isAllDay ? `${f.sYMD}T00:00` : `${f.sYMD}T${f.sHM}`;
      const endStr   = isAllDay ? `${f.eYMD}T23:59` : `${f.eYMD}T${f.eHM}`;
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
      const dueDate = f.dueYMD || '';
      const taskAllDay = !!document.getElementById('schedSheetTaskAllDay')?.checked;
      const dueTime = taskAllDay ? '' : (f.dueHM || '');
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

// ── 드래그 시트 — 3단 디텐트: 최소(min) ↔ 중간(half) ↔ 맨위(full) ──
//   사용자 명시 2026-05-27:
//     · 중간: 본문 스크롤 X. 위로 끌면 맨위 / 아래로 끌면 최소.
//     · 맨위: 본문 스크롤 O. 내리려면 그립(핸들) 잡고 아래로(→중간) 또는 시트 밖 탭(→삭제 모달). 본문 드래그는 스크롤.
//     · 최소: 아래로 한 번 더 끌면 삭제(취소) 모달. 위로 끌면 중간.
//   본문 드래그는 입력/버튼/시간휠 제외 + 6px 임계 후 활성(탭 보존). 그립은 즉시 활성.
let _schedSheetDrag = null;

function _schedSheetDetentHeights() {
  const vh = window.innerHeight;
  return { min: 150, half: Math.round(vh * 0.52), full: Math.round(vh * 0.92) };
}

// 디텐트 적용 — 높이 + 본문 스크롤 토글 (맨위만 ON). detent: 'min'|'half'|'full'.
function _schedSheetApplyDetent(detent, animate) {
  const sheet = document.querySelector('#schedSheetOverlay .sched-sheet');
  if (!sheet) return;
  const H = _schedSheetDetentHeights();
  const h = H[detent] || H.half;
  sheet.style.transition = animate ? 'height 0.24s cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
  sheet.style.height = h + 'px';
  sheet.dataset.detent = detent;
  if (detent === 'full') {
    sheet.style.overflowY = 'auto';   // 맨위 = 본문 스크롤 ON
  } else {
    sheet.style.overflowY = 'hidden';  // 중간/최소 = 스크롤 OFF + 맨 위로
    sheet.scrollTop = 0;
  }
}

function _schedSheetPointY(e) {
  if (e.touches && e.touches[0]) return e.touches[0].clientY;
  if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientY;
  return e.clientY;
}

function _schedSheetDragDown(e) {
  if (e.type === 'mousedown' && e.button !== 0) return;
  if (_schedSheetDrag) return;
  const sheet = document.querySelector('#schedSheetOverlay .sched-sheet');
  if (!sheet) return;
  const tgt = e.target;
  const onGrab = !!(tgt && tgt.closest && tgt.closest('.sched-sheet-grab'));
  const detent = sheet.dataset.detent || 'half';
  // 맨위(full): 본문 드래그 = 스크롤. 그립으로만 리사이즈 (그립 아니면 드래그 안 잡고 native 스크롤에 양보).
  if (detent === 'full' && !onGrab) return;
  // 본문: 입력/선택/버튼/시간휠 위에서 시작하면 드래그 X (정상 동작 우선).
  if (!onGrab && tgt && tgt.closest && tgt.closest('input, textarea, select, button, .dtw')) return;
  _schedSheetDrag = {
    sheet,
    startY: _schedSheetPointY(e),
    startH: sheet.offsetHeight,
    lastDy: 0,
    curH: sheet.offsetHeight,
    isTouch: e.type === 'touchstart',
    active: onGrab,                 // grip = 즉시 / 본문 = 임계 넘으면
    threshold: onGrab ? 0 : 6
  };
  if (onGrab) {
    if (e.cancelable) e.preventDefault();
    sheet.style.transition = 'none';
  }
  if (_schedSheetDrag.isTouch) {
    document.addEventListener('touchmove', _schedSheetDragMove, { passive: false });
    document.addEventListener('touchend', _schedSheetDragUp);
    document.addEventListener('touchcancel', _schedSheetDragUp);
  } else {
    document.addEventListener('mousemove', _schedSheetDragMove);
    document.addEventListener('mouseup', _schedSheetDragUp);
  }
}

function _schedSheetDragMove(e) {
  const d = _schedSheetDrag;
  if (!d) return;
  const dy = _schedSheetPointY(e) - d.startY;
  if (!d.active) {
    if (Math.abs(dy) < d.threshold) return;   // 임계 전 — 탭/스크롤 통과
    d.active = true;
    d.sheet.style.transition = 'none';
  }
  if (e.cancelable) e.preventDefault();        // 활성 후 스크롤 차단 → 시트 리사이즈
  d.lastDy = dy;
  let h = d.startH - dy;
  h = Math.max(110, Math.min(h, window.innerHeight * 0.92));
  d.sheet.style.height = h + 'px';
  d.curH = h;
}

function _schedSheetDragUp() {
  const d = _schedSheetDrag;
  _schedSheetDrag = null;
  if (!d) return;
  if (d.isTouch) {
    document.removeEventListener('touchmove', _schedSheetDragMove);
    document.removeEventListener('touchend', _schedSheetDragUp);
    document.removeEventListener('touchcancel', _schedSheetDragUp);
  } else {
    document.removeEventListener('mousemove', _schedSheetDragMove);
    document.removeEventListener('mouseup', _schedSheetDragUp);
  }
  if (!d.active) return;   // 임계 못 넘음 = 탭 → 동작 없음 (네이티브 click 진행)
  const det = d.sheet.dataset.detent || 'half';
  if (d.lastDy < -50) {                       // 위로 한 단계: 최소→중간, 중간→맨위
    _schedSheetApplyDetent(det === 'min' ? 'half' : 'full', true);
  } else if (d.lastDy > 50) {                 // 아래로 한 단계
    if (det === 'full') {
      _schedSheetApplyDetent('half', true);   // 맨위 → 중간
    } else if (det === 'half') {
      _schedSheetApplyDetent('min', true);    // 중간 → 최소 (바로 삭제 아님)
    } else {
      _schedSheetApplyDetent('min', true);    // 최소에서 더 내림 → 삭제(취소) 모달 (제자리 유지)
      _schedSheetTryDiscard();
    }
  } else {
    _schedSheetApplyDetent(det, true);        // 제자리 스냅
  }
}

// ── 다른 데 클릭 / 아래로 더 내림 → 삭제(취소) 확인 (create 모드만). edit 는 바로 닫기. ──
function _schedSheetTryDiscard() {
  const ctx = _schedSheetCtx;
  if (!ctx) return;
  if (ctx.mode !== 'create') { _closeSchedSheet(); return; }
  if (document.getElementById('schedDiscardConfirm')) return;
  const label = ctx.type === 'task' ? '이 할 일을 삭제하시겠습니까?' : '이 일정을 삭제하시겠습니까?';
  const html = `
    <div id="schedDiscardConfirm" class="sched-discard-overlay" onclick="if(event.target===this) this.remove();">
      <div class="sched-discard-sheet" onclick="event.stopPropagation();">
        <div class="sched-discard-msg">${label}</div>
        <button type="button" class="sched-discard-del" onclick="_schedSheetConfirmDiscard()">삭제</button>
        <button type="button" class="sched-discard-cancel" onclick="var c=document.getElementById('schedDiscardConfirm'); if(c) c.remove();">취소</button>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

function _schedSheetConfirmDiscard() {
  const c = document.getElementById('schedDiscardConfirm');
  if (c) c.remove();
  _closeSchedSheet();
}

// esc → 시트 닫기 (시트가 맨 위일 때).
try {
  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (document.getElementById('schedDiscardConfirm')) { document.getElementById('schedDiscardConfirm').remove(); return; }
    if (document.getElementById('schedSheetOverlay')) _schedSheetTryDiscard();
  });
} catch (e) {}

try {
  window.openScheduleSheet = openScheduleSheet;
  window._schedSheetPickExistingTask = _schedSheetPickExistingTask;
  window._closeSchedSheet = _closeSchedSheet;
  window._schedSheetSetType = _schedSheetSetType;
  window._schedSheetToggleAllDay = _schedSheetToggleAllDay;
  window._schedSheetToggleTaskAllDay = _schedSheetToggleTaskAllDay;
  window._schedSheetTogglePicker = _schedSheetTogglePicker;
  window._schedSheetDatePickerNav = _schedSheetDatePickerNav;
  window._schedSheetPickDate = _schedSheetPickDate;
  window._schedSheetSetTimeRange = _schedSheetSetTimeRange;
  window._schedSheetSave = _schedSheetSave;
  window._schedSheetDelete = _schedSheetDelete;
  window._schedSheetTryDiscard = _schedSheetTryDiscard;
  window._schedSheetConfirmDiscard = _schedSheetConfirmDiscard;
} catch (e) {}
