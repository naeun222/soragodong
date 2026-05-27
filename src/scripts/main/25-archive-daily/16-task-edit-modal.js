// V4 (사용자 명시 2026-05-27 ultrathink — 캘린더 일정/할 일 3단계):
// 할 일 (state.tasks) 의 통합 수정/생성 모달 — 제목 / 메모 / dueDate / dueTime / notifyMinutesBefore.
// 사용자 명시 2026-05-27 ultrathink (캘린더 그날 모달 통합): create 모드 추가 — taskId null + opts.dueDate prefill.
//   '+ 할 일 마감' 버튼 (15-schedule-modals.js openScheduleDayModal) 에서 호출.

const _TASK_MODAL_TASK_COLOR = '#fbbf24';

function _closeTaskEditModal() {
  const overlay = document.getElementById('taskEditModalOverlay');
  if (overlay) overlay.remove();
}

function openTaskEditModal(taskId, opts) {
  _closeTaskEditModal();
  opts = opts || {};

  const isCreate = !taskId;
  let task = null;
  if (taskId) {
    task = (state.tasks || []).find(t => t.id === taskId);
    if (!task) {
      if (typeof showToast === 'function') showToast('할 일 없음');
      return;
    }
  }

  const titleVal   = task ? (task.title || '') : '';
  const descVal    = task ? (task.description || '') : '';
  const dueDateVal = task ? (task.dueDate || '') : (opts.dueDate || '');
  const dueTimeVal = task ? (task.dueTime || '') : '';
  let notifyVal;
  if (task) {
    notifyVal = (task.notifyMinutesBefore === null || task.notifyMinutesBefore === undefined)
      ? ''
      : String(task.notifyMinutesBefore);
  } else {
    notifyVal = '';  // 새 task default 알림 없음 (사용자가 의도적 set 시만 trigger)
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

  const headerLabel = isCreate ? '✓ 새 할 일 마감' : '✏️ 할 일 수정';
  const saveLabel   = isCreate ? '추가' : '저장';

  const html = `
    <div id="taskEditModalOverlay" onclick="if(event.target===this) _closeTaskEditModal();" style="position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;">
      <div style="background:var(--bg); border:1px solid var(--border); border-radius:16px; width:100%; max-width:480px; max-height:85vh; overflow-y:auto; padding:18px 16px;" onclick="event.stopPropagation();">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
          <div style="font-size:16px; font-weight:600; color:var(--text);">${headerLabel}</div>
          <button onclick="_closeTaskEditModal()" style="background:transparent; border:none; color:var(--text-soft); font-size:22px; cursor:pointer; padding:2px 6px; line-height:1;" aria-label="닫기">×</button>
        </div>
        <div style="display:flex; flex-direction:column; gap:13px;">
          <label style="display:flex; flex-direction:column; gap:5px;">
            <span style="font-size:12px; color:var(--text-soft);">제목</span>
            <input type="text" id="taskFormTitle" value="${escapeHtml(titleVal)}" maxlength="60" style="${inputStyle}">
          </label>
          <label style="display:flex; flex-direction:column; gap:5px;">
            <span style="font-size:12px; color:var(--text-soft);">메모 (선택)</span>
            <textarea id="taskFormDesc" rows="2" placeholder="..." style="${inputStyle} resize:vertical; min-height:48px;">${escapeHtml(descVal)}</textarea>
          </label>
          <div style="height:1px; background:var(--border); margin:4px 0;"></div>
          <div style="font-size:13px; color:var(--text); font-weight:500; display:flex; align-items:center; gap:6px;"><span style="display:inline-block; width:8px; height:8px; background:${_TASK_MODAL_TASK_COLOR}; border-radius:50%;"></span>마감 (선택)</div>
          <label style="display:flex; flex-direction:column; gap:5px;">
            <span style="font-size:12px; color:var(--text-soft);">날짜</span>
            <input type="date" id="taskFormDueDate" value="${dueDateVal}" style="${dtStyle}">
          </label>
          <label style="display:flex; flex-direction:column; gap:5px;">
            <span style="font-size:12px; color:var(--text-soft);">시간 (비우면 종일 마감)</span>
            <input type="time" id="taskFormDueTime" value="${dueTimeVal}" step="300" style="${dtStyle}">
          </label>
          <label style="display:flex; flex-direction:column; gap:5px;">
            <span style="font-size:12px; color:var(--text-soft);">알림</span>
            <select id="taskFormNotify" style="${dtStyle}">${notifyOptHtml}</select>
            <span style="font-size:11px; color:var(--text-soft); margin-top:2px;">알림 실제 동작은 4단계 (로컬 알림) 에서 연결.</span>
          </label>
        </div>
        <div style="display:flex; gap:8px; margin-top:18px; flex-wrap:wrap;">
          ${isCreate ? '' : `<button onclick="_taskFormDelete('${taskId}')" style="padding:11px 14px; background:transparent; border:1px solid var(--border); color:#dc6c6c; border-radius:10px; font-size:13px; cursor:pointer; font-family:inherit;">🗑 삭제</button>`}
          <button onclick="_closeTaskEditModal()" style="flex:1; min-width:80px; padding:11px 14px; background:transparent; border:1px solid var(--border); color:var(--text-soft); border-radius:10px; font-size:13px; cursor:pointer; font-family:inherit;">취소</button>
          <button onclick="_taskFormSave('${taskId || ''}')" style="flex:1; min-width:80px; padding:11px 14px; background:var(--accent2); border:none; color:#fff; border-radius:10px; font-size:13px; font-weight:500; cursor:pointer; font-family:inherit;">${saveLabel}</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(() => {
    const inp = document.getElementById('taskFormTitle');
    if (inp) inp.focus();
  }, 50);
}

function _taskFormSave(taskId) {
  const isCreate = !taskId;

  const title = (document.getElementById('taskFormTitle')?.value || '').trim();
  if (!title) {
    if (typeof showToast === 'function') showToast('제목을 입력해줘');
    return;
  }
  const desc      = (document.getElementById('taskFormDesc')?.value || '').trim();
  const dueDate   = document.getElementById('taskFormDueDate')?.value || '';
  const dueTime   = document.getElementById('taskFormDueTime')?.value || '';
  const notifyStr = document.getElementById('taskFormNotify')?.value;
  const notify = (notifyStr === '' || notifyStr === null) ? null : parseInt(notifyStr, 10);

  if (isCreate) {
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
    if (typeof showToast === 'function') showToast('✓ 할 일 마감 추가됨');
  } else {
    const task = (state.tasks || []).find(t => t.id === taskId);
    if (!task) {
      if (typeof showToast === 'function') showToast('할 일 없음');
      return;
    }
    task.title = title;
    task.description = desc || null;
    if (typeof setTaskDue === 'function') {
      setTaskDue(taskId, {
        dueDate: dueDate || null,
        dueTime: dueTime || null,
        notifyMinutesBefore: notify
      });
    } else {
      task.dueDate = dueDate || null;
      task.dueTime = dueTime || null;
      task.notifyMinutesBefore = notify;
      if (typeof saveState === 'function') saveState();
    }
    if (typeof showToast === 'function') showToast('✏️ 저장됨');
  }

  _closeTaskEditModal();
  if (typeof renderExecute === 'function') renderExecute();
  if (typeof renderScheduleCalendarGrid === 'function') renderScheduleCalendarGrid();
  if (typeof _refreshScheduleDayTimelineIfOpen === 'function') _refreshScheduleDayTimelineIfOpen();
}

function _taskFormDelete(taskId) {
  if (!taskId) return;
  if (!confirm('이 할 일 삭제할까?')) return;
  state.tasks = (state.tasks || []).filter(t => t.id !== taskId);
  state.todaySchedule = (state.todaySchedule || []).filter(it => it.taskId !== taskId);
  if (typeof saveState === 'function') saveState();
  // 사용자 명시 2026-05-27 ultrathink (4단계): 삭제 시 예약 알림도 cancel.
  if (typeof cancelNotificationById === 'function') {
    cancelNotificationById(taskId).catch(e => console.warn('[task notif cancel]', e));
  }
  if (typeof showToast === 'function') showToast('🗑 삭제됨');
  _closeTaskEditModal();
  if (typeof renderExecute === 'function') renderExecute();
  if (typeof renderScheduleCalendarGrid === 'function') renderScheduleCalendarGrid();
  if (typeof _refreshScheduleDayTimelineIfOpen === 'function') _refreshScheduleDayTimelineIfOpen();
}

try {
  window.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && document.getElementById('taskEditModalOverlay')) {
      _closeTaskEditModal();
    }
  });
} catch (e) {}

try {
  window.openTaskEditModal = openTaskEditModal;
  window._closeTaskEditModal = _closeTaskEditModal;
  window._taskFormSave = _taskFormSave;
  window._taskFormDelete = _taskFormDelete;
} catch (e) {}
