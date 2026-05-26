// 사용자 명시 2026-05-27 ultrathink (re-iter): promoteSingleTask 폐기 — now3 surface 폐기 후 무의미. 외부 callsite 없음. '서랍장 → 오늘 할 일' promote 는 promoteToToday (28-project-tracking/06-vault-drag-drop.js) 가 담당.

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

