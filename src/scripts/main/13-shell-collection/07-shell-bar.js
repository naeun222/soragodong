function renderShellBar() {
  const countEl = document.getElementById('shellCount');
  const streakEl = document.getElementById('streakInfo');
  if (!countEl || !streakEl) return;  // FIX: prevent null errors
  countEl.textContent = state.shellCollection.length;
  const recent = state.shellCollection.slice(-7);
  let info = '탭해서 보기 →';
  if (recent.length > 0) {
    info = recent.slice(-3).map(s => s.type).join(' ') + ' →';
  }
  streakEl.innerHTML = info;
  // V4 (v8 묶음 8): 깜빡임 점 갱신 — Core 2 끝나고 첫 진입 안내
  if (typeof _refreshBeachPulse === 'function') _refreshBeachPulse();
}

let _beachTab = 'all';

