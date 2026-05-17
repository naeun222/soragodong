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
// 사용자 명시 2026-05-11 ultrathink: diary 카테고리 검사에서 state.chatMessages 제거.
// chatMessages 는 진행 중 대화 (아직 도서관에 저장 X). "도서관 dot = 도서관에 저장된 새 항목 있음" 의미로 정확히 → chatArchive 만 검사.
// V4 (사용자 명시 2026-05-13): 도서관 탭 안에서 카테고리 콘텐츠 element 아무거나 클릭 시 dot dismiss.
//   옛: chip 자체 클릭 시만 dismiss. 사용자가 *카테고리 chip 안 들어간 채* element 클릭 = dot 그대로.
//   새: delegation — 도서관 영역 안 어떤 클릭이든 *현재 카테고리* dot dismiss (이미 hide 상태면 skip 부담 ↓).
let _libDotDelegationInstalled = false;
function _installLibDotDelegation() {
  if (_libDotDelegationInstalled) return;
  _libDotDelegationInstalled = true;
  document.addEventListener('click', (e) => {
    if (!e.target || !e.target.closest) return;
    if (!e.target.closest('#screen-archive')) return;
    if (typeof _currentLens === 'undefined' || !_currentLens) return;
    // 이미 dot hide 상태면 skip (성능 + saveState 부담 ↓).
    const since = (typeof _libCatLastSeen === 'function') ? _libCatLastSeen(_currentLens) : 0;
    const hasNew = (typeof _libCategoryNewSince === 'function') ? _libCategoryNewSince(_currentLens, since) : false;
    if (!hasNew) return;
    _markLibCatSeen(_currentLens);
    try { saveState(); } catch {}
    if (typeof updateLibraryCatNewDots === 'function') { try { updateLibraryCatNewDots(); } catch {} }
  }, true);
}
// 자동 install — 첫 module load 후.
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _installLibDotDelegation);
  else _installLibDotDelegation();
}

function _libCategoryNewSince(cat, since) {
  // V4 (사용자 명시 2026-05-13): batch 결과 도착 전엔 dot X — chatArchive 의 _pendingExtract=true 인 항목 제외.
  //   사용자 시각: 결과 도착 = 보여지는 변화 — 그 시점에만 dot.
  if (cat === 'diary')
    return (state.entries || []).some(e => e.timestamp && new Date(e.timestamp).getTime() > since)
        || (state.chatArchive || []).some(a => a.generatedAt && new Date(a.generatedAt).getTime() > since && !a._pendingExtract);
  if (cat === 'yangsaeng')
    return (state.topicCards || []).some(c => c.category === 'strategy' && c.createdAt && new Date(c.createdAt).getTime() > since);
  if (cat === 'insights')
    // V4 (사용자 명시 2026-05-16 ultrathink): AI 자동 발견 인사이트도 NEW 배지 신호.
    return (state.archive || []).some(a => a.savedAt && new Date(a.savedAt).getTime() > since)
        || (state.insights || []).some(i => i && !i.dismissed && i.discoveredAt && new Date(i.discoveredAt).getTime() > since);
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
    // 사용자 명시 2026-05-18 ultrathink Phase 3: 진주 탭 분리 — archive tab dot 에서 pearls 신호 제외.
    //   _libCategoryNewSince('pearls', ...) 자체는 유지 (옛 사용자 data 의 _libCatLastSeen.pearls 보존).
    const has = since > 0 && (
      _libCategoryNewSince('diary', since) ||
      _libCategoryNewSince('yangsaeng', since) ||
      _libCategoryNewSince('insights', since) ||
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

// V4 (사용자 명시 2026-05-08 ultrathink): batch 결과 도착 시 영향 탭 (홈 / 나) 깜빡이는 dot.
//   chapter case_analysis → 나 탭 (traits/values/patterns/caseFormulation 갱신).
//   review 4종 (weekly/monthly/quarterly/annual) → 홈 탭 (review prompt 카드).
//   chapter topic / diary summary → 도서관 탭 (옛 _libCategoryNewSince 패턴 자동 처리).
//   사용자가 그 탭 진입 시 dot 자동 클리어 (showScreen hook).
function _markNavBatchUpdated(tabs) {
  if (!Array.isArray(tabs) || tabs.length === 0) return;
  state.preferences = state.preferences || {};
  state.preferences._navBatchUpdated = state.preferences._navBatchUpdated || {};
  const now = new Date().toISOString();
  let changed = false;
  tabs.forEach(t => {
    if (!state.preferences._navBatchUpdated[t]) {
      state.preferences._navBatchUpdated[t] = now;
      changed = true;
    }
  });
  if (changed) { try { saveState(); } catch {} }
  updateNavBatchDots();
}
function _clearNavBatchUpdate(tab) {
  const map = state.preferences && state.preferences._navBatchUpdated;
  if (!map || !map[tab]) return;
  delete map[tab];
  try { saveState(); } catch {}
  updateNavBatchDots();
}
function updateNavBatchDots() {
  try {
    // 사용자 명시 2026-05-08 ultrathink: home = review fresh 동적 (user_viewed=true 시 자동 off).
    //   model = flag 기반 (_processExtractChapterAnalysis 안에서 _markNavBatchUpdated(['model']) 호출 후 클리어).
    const hasFreshReview =
      (state.weeklyReviews    || []).some(r => r && r.auto && !r.user_viewed) ||
      (state.monthlyReviews   || []).some(r => r && r.auto && !r.user_viewed) ||
      (state.quarterlyReviews || []).some(r => r && r.auto && !r.user_viewed) ||
      (state.annualReviews    || []).some(r => r && r.auto && !r.user_viewed);
    const map = (state.preferences || {})._navBatchUpdated || {};
    const hasModelUpdate = !!map.model;
    const homeItem  = document.querySelector('.bottom-nav .nav-item[data-screen="home"]');
    const modelItem = document.querySelector('.bottom-nav .nav-item[data-screen="model"]');
    if (homeItem)  homeItem.classList.toggle('has-new', hasFreshReview);
    if (modelItem) modelItem.classList.toggle('has-new', hasModelUpdate);
  } catch (_) {}
}
