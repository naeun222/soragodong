async function openV4ScheduleItem(id) {
  const it = (state.todaySchedule || []).find(x => x.id === id);
  if (!it) return;
  const action = await showOptionsModal({
    title: `📅 ${it.title}`,
    message: `${it.start}–${it.end}`,
    options: [
      { label: '🗑 삭제',   value: 'delete' },
      { label: '✏️ 수정',   value: 'edit' },
      { label: '취소',      value: 'cancel' }
    ]
  });
  if (action === 'delete') {
    state.todaySchedule = state.todaySchedule.filter(x => x.id !== id);
    // 연결된 task가 있으면 task.scheduledStart도 비움
    if (it.taskId) {
      const t = (state.tasks || []).find(x => x.id === it.taskId);
      if (t) { t.scheduledStart = null; t.scheduledEnd = null; }
    }
    saveState();
    renderExecute();
    showToast('일정 삭제됨');
  } else if (action === 'edit') {
    const result = await showTimeRangePicker({
      title: `✏️ ${it.title}`,
      startDefault: it.start,
      endDefault: it.end
    });
    if (!result) return;
    it.start = result.start;
    it.end = result.end;
    if (it.taskId) {
      const t = (state.tasks || []).find(x => x.id === it.taskId);
      if (t) { t.scheduledStart = result.start; t.scheduledEnd = result.end; }
    }
    saveState();
    renderExecute();
    showToast('수정됨 ✦');
  }
}

// V4-fix: 시간 범위 picker (input type=time × 2). 알람 picker 느낌.
function showTimeRangePicker(opts) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'input-modal-overlay show time-range-overlay';
    overlay.innerHTML = `
      <div class="input-modal time-range-modal">
        <div class="input-modal-title">${escapeHtml(opts.title || '시간 선택')}</div>
        <div class="time-range-row">
          <div class="time-range-col">
            <label>시작</label>
            <input type="time" id="trStartInput" value="${opts.startDefault || ''}" step="300">
          </div>
          <div class="time-range-arrow">→</div>
          <div class="time-range-col">
            <label>끝</label>
            <input type="time" id="trEndInput" value="${opts.endDefault || ''}" step="300">
          </div>
        </div>
        <div style="display:flex; gap:8px; margin-top:18px;">
          <button class="input-modal-btn" id="trCancel" style="flex:1;">취소</button>
          <button class="input-modal-btn primary" id="trOk" style="flex:1;">확인 ✦</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const cleanup = (val) => {
      overlay.remove();
      resolve(val);
    };
    document.getElementById('trCancel').onclick = () => cleanup(null);
    document.getElementById('trOk').onclick = () => {
      const start = document.getElementById('trStartInput').value;
      const end = document.getElementById('trEndInput').value;
      if (!start || !end) {
        showToast('시작·끝 시간 둘 다 필요');
        return;
      }
      if (start >= end) {
        showToast('끝 시각이 시작 이후여야 해');
        return;
      }
      cleanup({ start, end });
    };
    overlay.onclick = (e) => { if (e.target === overlay) cleanup(null); };
  });
}

// V4-1v: 서랍장 4 그룹 자동 분류 (V4 비전 10.3)
// 🌅 지금 가능 / 📅 나중 / 💭 아이디어 / 🎯 큰 것
let _drawerView = 'auto';  // 'auto' | 'time'

