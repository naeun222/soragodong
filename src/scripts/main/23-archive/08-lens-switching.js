// V3 호환: 옛 switchLens('conversations'|'wisdom') 호출 지원 (튜토리얼 등 외부 참조)
function switchLens(lens) {
  const map = { conversations: 'diary', wisdom: 'insights' };
  switchLibraryCat(map[lens] || lens);
}

// V4-1p: 그리드 ↔ 타임라인 토글
// V4-fix (audit HIGH #2): active cat의 lens만 재렌더 (전체 7 lens X)
function switchLibraryView(view) {
  if (view !== 'grid' && view !== 'timeline') view = 'grid';
  _libView = view;
  document.querySelectorAll('.lib-view-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });
  _renderActiveLens();
  if (typeof _applyDiaryGridHide === 'function') _applyDiaryGridHide();
}

// V4-fix (audit HIGH #2): 카테고리별 active lens만 재렌더 (전체 7 lens 호출 X — 비효율 fix)
function _renderActiveLens() {
  const cat = _currentLens;
  if (cat === 'diary') {
    if (typeof renderLensCalendarGrid === 'function') renderLensCalendarGrid();
    if (typeof renderLensTopicCards === 'function') renderLensTopicCards();
    if (typeof renderLensTimeline === 'function') renderLensTimeline();
  } else if (cat === 'yangsaeng') {
    if (typeof renderLensStrategies === 'function') renderLensStrategies();
  } else if (cat === 'insights') {
    if (typeof renderLensArchive === 'function') renderLensArchive();
    if (typeof renderLensInsights === 'function') renderLensInsights();
  } else if (cat === 'pearls') {
    if (typeof renderLensPearls === 'function') renderLensPearls();
  } else if (cat === 'galpi') {
    if (typeof renderLensGalpi === 'function') renderLensGalpi();
  }
  if (typeof updateArchiveQuickCounts === 'function') updateArchiveQuickCounts();
}

// V4-1q: 깨달음 태그 칩 필터 (단일 선택, 같은 태그 다시 누르면 해제)
function setArchiveTagFilter(tag) {
  _archiveTagFilter = (_archiveTagFilter === tag) ? null : tag;
  renderLensArchive();
}

// 사용자 보고 2026-05-04 (VB023): 매 keystroke 마다 7 lens render = 모바일 lag.
// debounce 200ms 로 coalesce — 빠른 타이핑 중간엔 스킵.
let _archiveSearchDebounce = 0;
function searchArchive() {
  const input = document.getElementById('archiveSearch');
  if (!input) return;
  if (_archiveSearchDebounce) clearTimeout(_archiveSearchDebounce);
  _archiveSearchDebounce = setTimeout(() => {
    _archiveSearchDebounce = 0;
    _archiveSearchQuery = input.value.toLowerCase().trim();
    // 검색은 양 렌즈 다 갱신 (사용자 보고 2026-04-29: galpi 추가)
    renderLensTopicCards();
    renderLensTimeline();
    renderLensArchive();
    renderLensInsights();
    renderLensStrategies();
    renderLensPearls();
    if (typeof renderLensGalpi === 'function') renderLensGalpi();
    // 사용자 보고 2026-05-04 (VB019): grid+diary 일 때 검색 결과 보이게 lensTopicCards/Timeline 노출 동기화.
    if (typeof _applyDiaryGridHide === 'function') _applyDiaryGridHide();
  }, 200);
}

// 사용자 명시 2026-05-18 ultrathink (Phase 1+2): 진주 전용 탭 검색 — archiveSearch 와 별개.
//   _pearlsTabSearchQuery 만 driver. renderLensPearls 는 screen-pearls.active 시 이 값을 read.
let _pearlsSearchDebounce = 0;
function searchPearls() {
  const input = document.getElementById('pearlsSearch');
  if (!input) return;
  if (_pearlsSearchDebounce) clearTimeout(_pearlsSearchDebounce);
  _pearlsSearchDebounce = setTimeout(() => {
    _pearlsSearchDebounce = 0;
    _pearlsTabSearchQuery = input.value.toLowerCase().trim();
    if (typeof renderLensPearls === 'function') renderLensPearls();
  }, 200);
}

// === V3.8 LENS: TOPIC CARDS — 챕터별 토픽 정리 (대화 렌즈 상단) ===
const TOPIC_CATEGORY_LABELS = {
  // V4 8 카테고리 (step 25 챕터 자동 분류 기준)
  diary:        { label: '일기',     icon: '📔' },
  casual:       { label: '일상',     icon: '☀️' },
  concern:      { label: '고민',     icon: '💭' },
  emotion:      { label: '감정',     icon: '💧' },
  memory:       { label: '기억',     icon: '🔮' },
  todo:         { label: '할 일',    icon: '📋' },
  idea:         { label: '아이디어', icon: '💡' },
  relationship: { label: '관계',     icon: '👥' },
  // V3 호환 (legacy)
  decision:  { label: '결정', icon: '🐚' },
  task:      { label: '할 일', icon: '📋' },
  emotional: { label: '감정', icon: '💧' },
  strategy:  { label: '전략', icon: '🧬' }
};

