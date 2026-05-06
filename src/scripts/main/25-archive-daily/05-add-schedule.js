async function addV4ScheduleItem() {
  const title = await showInputModal({
    title: '📅 일정 추가',
    message: '뭐 할 거야?',
    placeholder: '예: 미팅 / 운동 / 카페 작업',
    maxLength: 60,
    okLabel: '다음 →'
  });
  if (!title || !title.trim()) return;
  const time = await showTimeRangePicker({
    title: title.trim(),
    startDefault: '',
    endDefault: ''
  });
  if (!time) return;

  if (!Array.isArray(state.todaySchedule)) state.todaySchedule = [];
  state.todaySchedule.push({
    id: 'sched_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    title: title.trim(),
    start: time.start,
    end: time.end,
    // 사용자 명시 2026-05-06 (정정): 자정 cutoff helper.
    date: (typeof _scheduleDateKey === 'function') ? _scheduleDateKey() : todayKey(),
    source: 'manual',
    taskId: null,
    color: _V4_TT_COLORS[Math.floor(Math.random() * _V4_TT_COLORS.length)]
  });
  saveState();
  renderExecute();
  showToast('일정 추가됨 📅');
}

// V4-fix: 오늘 할 일 직접 추가
async function addTodayTask() {
  const title = await showInputModal({
    title: '오늘 할 일 추가',
    message: '한 줄로 적어.',
    placeholder: '예: 메일 답장 / 빨래 돌리기',
    maxLength: 60,
    okLabel: '추가'
  });
  if (!title || !title.trim()) return;
  if (!Array.isArray(state.tasks)) state.tasks = [];
  state.tasks.push({
    id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    title: title.trim().slice(0, 60),
    status: 'active',
    slot: 'drawer',
    isToday: true,
    weight: 'light',
    energy: 'mid',
    priority: typeof nextPriority === 'function' ? nextPriority() : 0,
    createdAt: new Date().toISOString(),
    date: todayKey(),
    source: 'manual_today'
  });
  saveState();
  renderExecute();
  showToast('오늘 할 일에 추가됨 📋');
}

// V3 5블록 토글 — V4-fix에서 완전 삭제로 dead code (호출 X). 함수 stub만 남겨 onclick 호환.
function toggle5Blocks() { /* dead — V4 5블록 제거 */ }

// V4-1u-d: 할 일 → 일정 적용하기 (V4 비전 10.7) — task.scheduledStart/End + state.todaySchedule push (taskId)
