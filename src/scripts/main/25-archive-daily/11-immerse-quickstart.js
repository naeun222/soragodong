async function openImmerseStart() {
  _quickStart({ taskId: null, taskTitle: null });
}

// 공통 헬퍼 — 즉시 단축어 trigger + state.starts 기록 + localStorage active ritual + active bar
function _quickStart({ taskId, taskTitle }) {
  if (!Array.isArray(state.starts)) state.starts = [];
  const startEntry = {
    id: 'start_' + Date.now(),
    taskId: taskId || null,
    taskTitle: taskTitle || null,
    startIf: null,
    startThen: null,
    obstacle: null,
    plan: null,
    ifThenType: 'none',
    startedAt: new Date().toISOString(),
    returnedAt: null,
    outcome: null
  };
  state.starts.push(startEntry);
  saveState();

  // localStorage 활성 ritual — 새로고침 / 다른 화면 진입 후에도 active bar 복원
  try {
    localStorage.setItem('soragodong_active_ritual', JSON.stringify({
      startId: startEntry.id,
      taskId: taskId || null,
      taskTitle: taskTitle || null,
      startIf: null, startThen: null, obstacle: null, plan: null,
      launchedAt: Date.now()
    }));
  } catch (e) {}

  triggerShortcut();
  showRitualActiveBar();
  showToast(taskTitle ? `🌧 시작 — "${taskTitle}"` : '🌧 시작 — 갔다 와');
  // V4 (사용자 명시 2026-05-15): 첫 시작 시 iOS 단축어 안내 토스트 (1회). modal 대신 toast = 시작 행동 흐름 안 깸.
  if (state.preferences && !state.preferences._immerseShortcutHintShown) {
    state.preferences._immerseShortcutHintShown = true;
    try { saveState(); } catch {}
    setTimeout(() => {
      if (typeof showToast === 'function') {
        showToast('💡 설정에 iOS 단축어 만드는 법이 나와있어');
      }
    }, 2600);
  }
}

// V3.13: 서랍장 task 우선순위 다음 번호 계산 (가장 높은 priority + 1)
function getNextDrawerPriority() {
  const drawer = (state.tasks || []).filter(t => t.slot === 'drawer');
  if (drawer.length === 0) return 0;
  const maxP = Math.max(...drawer.map(t => t.priority ?? 0));
  return maxP + 1;
}

