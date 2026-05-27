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
            <textarea id="schedFormDesc" placeholder="..." rows="2" style="${inputStyle} resize:vertical; min-height:48px;">${escapeHtml(descVal)}</textarea>
          </label>
          <label style="display:flex; align-items:center; gap:8px; padding:4px 0; cursor:pointer;">
            <input type="checkbox" id="schedFormAllDay" ${isAllDay ? 'checked' : ''} onchange="_schedFormToggleAllDay()" style="width:18px; height:18px; cursor:pointer; accent-color:var(--accent2);">
            <span style="font-size:13px; color:var(--text);">종일</span>
          </label>
          <div id="schedFormTimeWrap" style="display:flex; flex-direction:column; gap:10px;">
            <label style="display:flex; flex-direction:column; gap:5px;">
              <span style="font-size:12px; color:var(--text-soft);">시작</span>
              <input type="datetime-local" id="schedFormStart" value="${startVal}" style="${dtStyle}">
            </label>
            <label style="display:flex; flex-direction:column; gap:5px;">
              <span style="font-size:12px; color:var(--text-soft);">종료</span>
              <input type="datetime-local" id="schedFormEnd" value="${endVal}" style="${dtStyle}">
            </label>
          </div>
          <label style="display:flex; flex-direction:column; gap:5px;">
            <span style="font-size:12px; color:var(--text-soft);">알림</span>
            <select id="schedFormNotify" style="${dtStyle}">${notifyOptHtml}</select>
            <span style="font-size:11px; color:var(--text-soft); margin-top:2px;">알림 실제 동작은 4단계 (로컬 알림) 에서 연결.</span>
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
}

// esc 키 닫기
try {
  window.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && document.getElementById('schedModalOverlay')) {
      _closeScheduleModals();
    }
  });
} catch (e) {}

try {
  window.openScheduleDayModal = openScheduleDayModal;
  window.openScheduleEditModal = openScheduleEditModal;
  window._closeScheduleModals = _closeScheduleModals;
  window._schedFormSave = _schedFormSave;
  window._schedFormDelete = _schedFormDelete;
  window._schedFormToggleAllDay = _schedFormToggleAllDay;
} catch (e) {}
