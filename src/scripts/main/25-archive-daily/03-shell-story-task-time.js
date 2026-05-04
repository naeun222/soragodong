async function generateShellStory(shellIdx, task) {
  const shell = state.shellCollection[shellIdx];
  if (!shell) return;
  
  const dateStr = new Date(shell.date).toLocaleDateString('ko-KR', { 
    month: 'long', day: 'numeric' 
  });
  const timeStr = new Date(shell.date).toLocaleTimeString('ko-KR', { 
    hour: '2-digit', minute: '2-digit' 
  });
  
  const prompt = `사용자가 방금 작업을 완료했어. 이 순간을 기억할 수 있는 짧은 한 줄 또는 두 줄짜리 메모를 만들어.

[작업]
"${task.title}"
${task.description ? `설명: ${task.description}` : ''}
종류: ${task.source === 'ai_mission' ? '소라의 부름 (AI 제안 미션)' : task.weight === 'main' ? '메인 작업' : task.weight === 'daily' ? '일상 작업' : '가벼운 작업'}
시간: ${dateStr} ${timeStr}

[규칙]
- 1-2줄, 30자 이내
- 그 순간의 분위기를 살리되 과장 X
- 너무 시적이지 X, 너무 건조하지 X
- 친근한 반말
- "수고했어" 같은 칭찬 X
- 사용자가 나중에 봤을 때 그날을 떠올릴 수 있을 만한 작은 디테일
- 따옴표 X, 다른 설명 X

[좋은 예시]
"오후의 작은 마침표"
"세그포머 한 줄, 그래도 한 줄"
"메일 하나, 어깨 가벼워짐"
"마감 직전의 천재 모드"
"오늘 첫 번째 도파민"

한 줄만 출력. 따옴표 X.`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: _anthropicHeaders(),
      body: JSON.stringify({ _endpoint: 'shell_story', model: 'claude-haiku-4-5', max_tokens: 80, messages: [{ role: 'user', content: prompt }] })
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

