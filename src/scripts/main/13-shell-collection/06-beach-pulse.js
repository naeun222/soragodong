// V4 (v8 묶음 8): 모래사장 깜빡임 점 — Core 2 끝나고 첫 진입 안내. 클릭하면 cleanup.
function _refreshBeachPulse() {
  const dot = document.getElementById('beachPulseDot');
  if (!dot) return;
  const justUnlocked = !!(state._beachJustUnlocked || (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('soragodong_v4_beach_just_unlocked') === '1'));
  if (justUnlocked) dot.removeAttribute('hidden');
  else dot.setAttribute('hidden', '');
}
function _dismissBeachPulse() {
  state._beachJustUnlocked = false;
  try { sessionStorage.removeItem('soragodong_v4_beach_just_unlocked'); } catch {}
  saveState();
  _refreshBeachPulse();
}

