// V3.13: 단일 서랍장 task → now3 슬롯으로 승격
function promoteSingleTask(taskId) {
  const task = (state.tasks || []).find(t => t.id === taskId);
  if (!task) return;
  // now3 한도 체크 (3장)
  const todayKeyVal = todayKey();
  const now3Count = (state.tasks || []).filter(t =>
    t.slot === 'now3' && t.status !== 'done' && t.date === todayKeyVal
  ).length;
  if (now3Count >= 3) {
    showToast('⚠ 오늘의 카드 3장 꽉 찼어. 하나 완료하고 다시.');
    return;
  }
  task.slot = 'now3';
  task.date = todayKeyVal;
  saveState();
  renderExecute();
  showToast('↑ 오늘의 카드로 올림 ✦');
}

function triggerShortcut() {
  const useShortcut = state.preferences?.starRitualSettings?.useShortcut !== false;
  const shortcutName = state.preferences?.starRitualSettings?.shortcutName || 'SoraRitual';
  if (useShortcut && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
    setTimeout(() => {
      try {
        window.location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(shortcutName)}`;
      } catch(e) { /* graceful fail */ }
    }, 500);
  }
}

