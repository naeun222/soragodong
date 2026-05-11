async function generateShellStory(shellIdx, task) {
  const shell = state.shellCollection[shellIdx];
  if (!shell) return;
  
  const dateStr = new Date(shell.date).toLocaleDateString('ko-KR', { 
    month: 'long', day: 'numeric' 
  });
  const timeStr = new Date(shell.date).toLocaleTimeString('ko-KR', { 
    hour: '2-digit', minute: '2-digit' 
  });
  
  // 사용자 명시 2026-05-11 ultrathink: prompt template backend 이전 — buildShellTaskTime 가 합성.
  const _taskKind = task.source === 'ai_mission' ? '소라의 부름 (AI 제안 미션)' : task.weight === 'main' ? '메인 작업' : task.weight === 'daily' ? '일상 작업' : '가벼운 작업';

  try {
    const resp = await callAnthropic({
      _endpoint: 'shell_story',
      _userContentType: 'task_time',
      _vars: { taskTitle: task.title, taskDescription: task.description || '', taskKind: _taskKind, dateStr, timeStr },
      model: 'claude-haiku-4-5',
      max_tokens: 80,
      messages: [{ role: 'user', content: '' }]
    });
    if (!resp.ok) return;
    const data = await resp.json();
    let text = data.content[0].text.trim().replace(/^["'`]+|["'`]+$/g, '');
    if (text && text.length < 60) {
      // Update the shell's story
      if (state.shellCollection[shellIdx]) {
        state.shellCollection[shellIdx].story = text;
        state.shellCollection[shellIdx].experience = text;  // 별칭
        saveState();
      }
    }
  } catch (e) {
    console.warn('shell story gen error:', e);
  }
}

// Toggle - allows "uncompleting" if user clicked by mistake
// V3.12.x: 마지막 start의 경과시간 (시작 → 돌아옴)
function getTaskElapsedTime(taskId) {
  const starts = (state.starts || []).filter(s => s.taskId === taskId && s.returnedAt);
  if (starts.length === 0) return null;
  const last = starts[starts.length - 1];
  const ms = new Date(last.returnedAt) - new Date(last.startedAt);
  const mins = Math.round(ms / 60000);
  if (mins < 1) return '< 1분';
  if (mins < 60) return `${mins}분`;
  return `${Math.floor(mins/60)}시간 ${mins%60}분`;
}

function toggleQuestComplete(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  if (task.status === 'done') {
    // Uncomplete
    task.status = 'active';
    task.completedAt = null;
    // V3.12.x fix: 모든 task 종류에서 마지막 소라 제거 (이전엔 ai_mission만 제거하던 버그)
    const lastShell = (state.shellCollection || []).slice().reverse().find(s => s.taskId === taskId);
    if (lastShell) {
      const idx = state.shellCollection.lastIndexOf(lastShell);
      if (idx >= 0) state.shellCollection.splice(idx, 1);
    }
    saveState();
    renderExecute();
    if (typeof renderShellBar === 'function') renderShellBar();
    showToast('되살림 ✦');
  } else {
    completeQuest(taskId);
  }
}

// V4-1u-b: 타임테이블 시간 grid (V4 비전 10.6)
// state.todaySchedule = [{id, title, start:'14:00', end:'15:30', source, taskId, color}]
const _V4_TT_COLORS = ['#a89dc8', '#d4a76a', '#8fc88f', '#c98c8c', '#7ab9d4', '#d4b87a', '#c08fc8'];

