function showFullscreenLoader(text) {
  let el = document.getElementById('_fsLoader');
  if (el) el.remove();
  el = document.createElement('div');
  el.id = '_fsLoader';
  el.style.cssText = 'position:fixed; inset:0; background:rgba(15,14,23,0.88); z-index:10000; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; color:var(--text); backdrop-filter: blur(6px);';
  el.innerHTML = `<div style="font-size:14px; font-family: inherit;">${escapeHtml(text || '잠시만...')}</div><div class="ai-loading"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>`;
  document.body.appendChild(el);
}

function hideFullscreenLoader() {
  const el = document.getElementById('_fsLoader');
  if (el) el.remove();
}

function skipMission(missionId) {
  const mission = state.missions.find(m => m.id === missionId);
  if (!mission) return;
  const _prevStatus = mission.status;
  const _prevSkippedAt = mission.skippedAt || null;
  mission.status = 'skipped';
  mission.skippedAt = new Date().toISOString();
  saveState();
  setTimeout(() => { renderTodayMission(); }, 300);
  // V3.7: undo
  showUndoToast('괜찮아, 그런 날도 있어 🌊', () => {
    mission.status = _prevStatus;
    mission.skippedAt = _prevSkippedAt;
    saveState();
    renderTodayMission();
  });
}

