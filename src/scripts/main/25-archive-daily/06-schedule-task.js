async function scheduleTaskToTime(taskId) {
  const task = (state.tasks || []).find(t => t.id === taskId);
  if (!task) return;

  // 이미 적용된 일정 있으면 변경/제거 picker
  const existing = (state.todaySchedule || []).find(it => it.taskId === taskId && (!it.date || it.date === todayKey()));
  if (existing) {
    const action = await showOptionsModal({
      title: `⏰ ${task.title}`,
      message: `현재 ${existing.start}–${existing.end}`,
      options: [
        { label: '✏️ 시간 변경', value: 'change' },
        { label: '✕ 일정에서 빼기', value: 'remove' },
        { label: '취소', value: 'cancel' }
      ]
    });
    if (action === 'remove') {
      state.todaySchedule = state.todaySchedule.filter(it => it.id !== existing.id);
      task.scheduledStart = null;
      task.scheduledEnd = null;
      saveState();
      renderExecute();
      if (typeof _refreshScheduleDayTimelineIfOpen === 'function') _refreshScheduleDayTimelineIfOpen();
      showToast('일정에서 뺐어');
      return;
    }
    if (action !== 'change') return;
    // change → 아래 흐름으로 이어짐
  }

  const time = await showTimeRangePicker({
    title: `⏰ ${task.title}`,
    startDefault: existing?.start || '',
    endDefault: existing?.end || ''
  });
  if (!time) return;
  const startT = time.start;
  const endT = time.end;
  // 사용자 명시 2026-05-06 (정정): 자정 cutoff helper.
  const todayK = (typeof _scheduleDateKey === 'function') ? _scheduleDateKey() : todayKey();

  if (existing) {
    existing.start = startT;
    existing.end = endT;
  } else {
    if (!Array.isArray(state.todaySchedule)) state.todaySchedule = [];
    state.todaySchedule.push({
      id: 'sched_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      title: task.title,
      start: startT,
      end: endT,
      date: todayK,
      source: 'task',
      taskId: taskId,
      color: _V4_TT_COLORS[Math.floor(Math.random() * _V4_TT_COLORS.length)]
    });
  }
  task.scheduledStart = startT;
  task.scheduledEnd = endT;
  saveState();
  renderExecute();
  if (typeof _refreshScheduleDayTimelineIfOpen === 'function') _refreshScheduleDayTimelineIfOpen();
  showToast(`⏰ ${startT} 적용됨`);
}

// V4-1w-1: 일정 → .ics 파일 export (V4 비전 10.4 단방향)
// Google/Apple 캘린더로 import 가능. OAuth 없이 단순 파일 다운.
