// V4-1t + fix: 카테고리 칩 새 항목 ● 점 — 카테고리별 lastSeen 이후 추가된 게 있을 때만.
// 사용자가 카테고리 클릭 시 lastSeen=now → 점 사라짐. 이후 새 항목 추가되면 다시 점.
function _libCatLastSeen(cat) {
  const seen = state.preferences && state.preferences._libCatLastSeen;
  return (seen && seen[cat]) ? new Date(seen[cat]).getTime() : 0;
}
function _markLibCatSeen(cat) {
  if (!state.preferences) state.preferences = {};
  if (!state.preferences._libCatLastSeen) state.preferences._libCatLastSeen = {};
  state.preferences._libCatLastSeen[cat] = new Date().toISOString();
}

// V4 (사용자 명시): 카테고리별 신규 항목 검사 — tab dot / cat dot 공용
function _libCategoryNewSince(cat, since) {
  if (cat === 'diary')
    return (state.entries || []).some(e => e.timestamp && new Date(e.timestamp).getTime() > since)
        || (state.chatMessages || []).some(m => m.timestamp && new Date(m.timestamp).getTime() > since);
  if (cat === 'yangsaeng')
    return (state.topicCards || []).some(c => c.category === 'strategy' && c.createdAt && new Date(c.createdAt).getTime() > since);
  if (cat === 'insights')
    return (state.archive || []).some(a => a.savedAt && new Date(a.savedAt).getTime() > since);
  if (cat === 'pearls')
    return (state.pearls || []).some(p => p.type !== 'dna_pearl' && p.createdAt && new Date(p.createdAt).getTime() > since);
  if (cat === 'galpi')
    return (state.decisions || []).some(d => d.startedAt && new Date(d.startedAt).getTime() > since)
        || (state.weeklyReviews || []).some(r => r.completedAt && new Date(r.completedAt).getTime() > since)
        || (state.monthlyReviews || []).some(r => r.completedAt && new Date(r.completedAt).getTime() > since)
        || (state.quarterlyReviews || []).some(r => r.completedAt && new Date(r.completedAt).getTime() > since);
  return false;
}

// V4 (사용자 명시): 도서관 탭 자체 dot — 5 카테고리 OR. archive 진입 시 마킹 → 즉시 클리어.
// 카테고리별 dot 과 별개 (tab lastSeen / cat lastSeen 분리 추적).
function _libTabLastSeenTs() {
  const v = state.preferences && state.preferences._libTabLastSeen;
  return v ? new Date(v).getTime() : 0;
}
function _markLibTabSeen() {
  if (!state.preferences) state.preferences = {};
  state.preferences._libTabLastSeen = new Date().toISOString();
}
function updateLibraryTabNewDot() {
  try {
    const since = _libTabLastSeenTs();
    // 처음 진입 안 한 사용자: 점 X (카테고리 dot 동일 정책)
    const has = since > 0 && (
      _libCategoryNewSince('diary', since) ||
      _libCategoryNewSince('yangsaeng', since) ||
      _libCategoryNewSince('insights', since) ||
      _libCategoryNewSince('pearls', since) ||
      _libCategoryNewSince('galpi', since)
    );
    const item = document.querySelector('.bottom-nav .nav-item[data-screen="archive"]');
    if (item) item.classList.toggle('has-new', has);
  } catch(_) {}
}

function updateLibraryCatNewDots() {
  document.querySelectorAll('.lib-cat-chip').forEach(chip => {
    const cat = chip.dataset.cat;
    const since = _libCatLastSeen(cat);
    // 처음 보는 카테고리(lastSeen=0)는 새 항목으로 간주 X (점 X) — 처음 진입 시 모든 카테고리가 점 안 떠야 깔끔.
    // 단 lastSeen 적용된 후에만 그 이후 추가된 항목 체크.
    const has = since > 0 ? _libCategoryNewSince(cat, since) : false;
    chip.classList.toggle('has-new', has);
  });
}
