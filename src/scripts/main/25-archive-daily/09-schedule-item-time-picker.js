async function openV4ScheduleItem(id) {
  // 사용자 명시 2026-05-27 ultrathink (캘린더 일정/할 일 sync — 양방향 CRUD): timeline 일정 클릭 시 캘린더와 같은 모달 진입.
  //   1) state.schedules entry → openScheduleEditModal (캘린더 모달).
  //   2) 옛 todaySchedule entry → taskId 면 scheduleTaskToTime (task 시간 적용 picker), 아니면 옛 옵션 modal (delete/edit).
  if (typeof openScheduleEditModal === 'function') {
    const sched = (state.schedules || []).find(s => s.id === id);
    if (sched) {
      openScheduleEditModal(sched.id);
      return;
    }
  }

  // 사용자 명시 2026-05-27 ultrathink (오늘 ↔ 타임라인 연동): 그리드의 task 마감 항목 클릭 → 할 일 메뉴 (수정/완료).
  const _tk = (state.tasks || []).find(t => t.id === id);
  if (_tk) {
    if (typeof _schedDayTaskMenu === 'function') return _schedDayTaskMenu(id);
    if (typeof editTaskCard === 'function') return editTaskCard(id);
    return;
  }

  const it = (state.todaySchedule || []).find(x => x.id === id);
  if (!it) return;

  // taskId 있으면 → task 시간 적용 picker (변경/제거 선택)
  if (it.taskId && typeof scheduleTaskToTime === 'function') {
    return scheduleTaskToTime(it.taskId);
  }

  // 옛 흐름 — ICS / 옛 manual entry (state.schedules 아닌 todaySchedule entry).
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
    if (it.taskId) {
      const t = (state.tasks || []).find(x => x.id === it.taskId);
      if (t) { t.scheduledStart = null; t.scheduledEnd = null; }
    }
    saveState();
    renderExecute();
    if (typeof _refreshScheduleDayTimelineIfOpen === 'function') _refreshScheduleDayTimelineIfOpen();
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
    if (typeof _refreshScheduleDayTimelineIfOpen === 'function') _refreshScheduleDayTimelineIfOpen();
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

