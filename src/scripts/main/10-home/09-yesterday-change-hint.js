// V4 (사용자 명시 2026-05-17 ultrathink): 카드 (b) 어제 대비 자산 변화 hint.
//   옛 "N개 모았어" 카운터 (매일 동일 = 죽은 정보) 폐기 → 어제 대비 +N 변화만 표시.
//   변화 0건 = 카드 자체 숨김.
//   진행 중 결정/숙고는 짧은 hint 한 줄 같이 표시.

function _changeHintCount24h(items, tsKey) {
  if (!Array.isArray(items)) return 0;
  const cutoff = Date.now() - 86400000;
  let n = 0;
  for (const it of items) {
    if (!it) continue;
    const raw = it[tsKey];
    if (!raw) continue;
    const t = new Date(raw).getTime();
    if (!isNaN(t) && t >= cutoff) n++;
  }
  return n;
}

function renderYesterdayChangeHint() {
  const container = document.getElementById('homeChangeHintContainer');
  if (!container) return;

  // testerMode 또는 cold start 면 카드 자체 숨김 (변화 비교 무의미)
  if (state && state.preferences && state.preferences.testerMode) {
    container.innerHTML = '';
    return;
  }
  if (typeof _isColdStart === 'function' && _isColdStart()) {
    container.innerHTML = '';
    return;
  }

  // 24h 이내 추가된 자산
  const newShells   = _changeHintCount24h(state.shellCollection, 'collectedAt');
  const newPearls   = _changeHintCount24h((state.pearls || []).filter(p => p && p.type !== 'dna_pearl'), 'createdAt');
  const newArchive  = _changeHintCount24h((state.archive || []).filter(a => a && !a._deleted), 'savedAt');
  const newInsights = _changeHintCount24h((state.insights || []).filter(i => i && !i.dismissed), 'discoveredAt');

  // 진행 중 마법고동 — 활성 결정 1개 + 가장 가까운 unlock 시점
  const activeDecisions = (state.decisions || []).filter(d => d && d.status === 'in_progress');
  let decisionHint = null;
  if (activeDecisions.length > 0) {
    // 가장 최근 시작 결정의 unlock 시점
    const sorted = activeDecisions.slice().sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0));
    const d0 = sorted[0];
    if (d0 && d0.startedAt) {
      const startedMs = new Date(d0.startedAt).getTime();
      const elapsedDays = Math.floor((Date.now() - startedMs) / 86400000);
      const remainDays = Math.max(0, 14 - elapsedDays);
      if (remainDays > 0) decisionHint = `🪄 마법고동 ${remainDays}일 남음`;
      else decisionHint = `🪄 마법고동 unlock 됨`;
    }
  }

  // 변화 0건 + 결정 hint 도 없으면 카드 자체 숨김
  const parts = [];
  if (newShells > 0)   parts.push(`🐚 +${newShells}`);
  if (newPearls > 0)   parts.push(`🔮 +${newPearls}`);
  if (newArchive > 0)  parts.push(`✨ +${newArchive}`);
  if (newInsights > 0) parts.push(`🔍 +${newInsights}`);

  if (parts.length === 0 && !decisionHint) {
    container.innerHTML = '';
    return;
  }

  const partsLine = parts.length > 0
    ? `<div class="hch-changes">${parts.join(' · ')}<span class="hch-since"> 어제</span></div>`
    : '';
  const decisionLine = decisionHint
    ? `<div class="hch-decision" onclick="event.stopPropagation(); showScreen('decisions');">${decisionHint} ›</div>`
    : '';

  container.innerHTML = `<div class="home-change-hint">${partsLine}${decisionLine}</div>`;
}
