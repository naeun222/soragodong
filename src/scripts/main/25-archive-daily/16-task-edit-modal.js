// V4 (사용자 명시 2026-05-27 ultrathink — 캘린더 일정/할 일 3단계):
// 할 일 (state.tasks) 의 dueDate / dueTime / notifyMinutesBefore 설정 UI.
// editTaskCard (06-vault-drag-drop.js) 가 호출. 캘린더 노랑 bar 표시는 이미 구현.

const _TASK_MODAL_TASK_COLOR = '#fbbf24';

function _closeTaskEditModal() {
  const overlay = document.getElementById('taskEditModalOverlay');
  if (overlay) overlay.remove();
}

function openTaskEditModal(taskId) {
  _closeTaskEditModal();
  const task = (state.tasks || []).find(t => t.id === taskId);
  if (!task) {
    if (typeof showToast === 'function') showToast('할 일 없음');
    return;
  }

  const titleVal = task.title || '';
  const descVal  = task.description || '';
  const dueDateVal = task.dueDate || '';
  const dueTimeVal = task.dueTime || '';
  let notifyVal;
  if (task.notifyMinutesBefore === null || task.notifyMinutesBefore === undefined) {
    notifyVal = '';
  } else {
    notifyVal = String(task.notifyMinutesBefore);
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
    <div id="taskEditModalOverlay" onclick="if(event.target===this) _closeTaskEditModal();" style="position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;">
      <div style="background:var(--bg); border:1px solid var(--border); border-radius:16px; width:100%; max-width:480px; max-height:85vh; overflow-y:auto; padding:18px 16px;" onclick="event.stopPropagation();">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
          <div style="font-size:16px; font-weight:600; color:var(--text);">✏️ 할 일 수정</div>
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
          <button onclick="_taskFormDelete('${taskId}')" style="padding:11px 14px; background:transparent; border:1px solid var(--border); color:#dc6c6c; border-radius:10px; font-size:13px; cursor:pointer; font-family:inherit;">🗑 삭제</button>
          <button onclick="_closeTaskEditModal()" style="flex:1; min-width:80px; padding:11px 14px; background:transparent; border:1px solid var(--border); color:var(--text-soft); border-radius:10px; font-size:13px; cursor:pointer; font-family:inherit;">취소</button>
          <button onclick="_taskFormSave('${taskId}')" style="flex:1; min-width:80px; padding:11px 14px; background:var(--accent2); border:none; color:#fff; border-radius:10px; font-size:13px; font-weight:500; cursor:pointer; font-family:inherit;">저장</button>
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
  const task = (state.tasks || []).find(t => t.id === taskId);
  if (!task) {
    if (typeof showToast === 'function') showToast('할 일 없음');
    return;
  }
  const title = (document.getElementById('taskFormTitle')?.value || '').trim();
  if (!title) {
    if (typeof showToast === 'function') showToast('제목을 입력해줘');
    return;
  }
  const desc = (document.getElementById('taskFormDesc')?.value || '').trim();
  const dueDate = document.getElementById('taskFormDueDate')?.value || '';
  const dueTime = document.getElementById('taskFormDueTime')?.value || '';
  const notifyStr = document.getElementById('taskFormNotify')?.value;

  task.title = title;
  task.description = desc || null;

  if (typeof setTaskDue === 'function') {
    setTaskDue(taskId, {
      dueDate: dueDate || null,
      dueTime: dueTime || null,
      notifyMinutesBefore: (notifyStr === '' || notifyStr === null) ? null : parseInt(notifyStr, 10)
    });
  } else {
    task.dueDate = dueDate || null;
    task.dueTime = dueTime || null;
    task.notifyMinutesBefore = (notifyStr === '' || notifyStr === null) ? null : parseInt(notifyStr, 10);
    if (typeof saveState === 'function') saveState();
  }

  if (typeof showToast === 'function') showToast('✏️ 저장됨');
  _closeTaskEditModal();
  if (typeof renderExecute === 'function') renderExecute();
  if (typeof renderScheduleCalendarGrid === 'function') renderScheduleCalendarGrid();
}

function _taskFormDelete(taskId) {
  if (!taskId) return;
  if (!confirm('이 할 일 삭제할까?')) return;
  state.tasks = (state.tasks || []).filter(t => t.id !== taskId);
  // 연결된 todaySchedule entry (task 시간 적용 결과) 도 같이 제거
  state.todaySchedule = (state.todaySchedule || []).filter(it => it.taskId !== taskId);
  if (typeof saveState === 'function') saveState();
  if (typeof showToast === 'function') showToast('🗑 삭제됨');
  _closeTaskEditModal();
  if (typeof renderExecute === 'function') renderExecute();
  if (typeof renderScheduleCalendarGrid === 'function') renderScheduleCalendarGrid();
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
