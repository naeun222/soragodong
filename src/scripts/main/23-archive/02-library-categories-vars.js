// ═══════════════════════════════════════════════════════════════
// V4-1l-a LIBRARY — 5 카테고리 (📔 일기·대화 / 🧬 양생방 / ✨ 깨달음 / 🔮 진주 / 🌀 마법·리뷰)
// V3 lens-tabs (conversations/wisdom)에서 5 카테고리 칩으로 확장.
// 사용자 명시 2026-05-18 ultrathink Phase 3: 진주 chip + libPearls view 제거 — 진주는 별도 탭 (#screen-pearls).
//   _LIB_CAT_TO_VIEW 에서 pearls 매핑 제거. 4 카테고리 (diary/yangsaeng/insights/galpi) 만 남음.
// ═══════════════════════════════════════════════════════════════

const _LIB_CAT_TO_VIEW = {
  diary:     'libDiary',
  yangsaeng: 'libYangsaeng',
  insights:  'libInsights',
  galpi:     'libGalpi',
  // 사용자 명시 2026-05-27 ultrathink: 실행 chip — 5번째 library 카테고리.
  execute:   'libExecute'
};

let _currentLens = 'diary';
let _archiveSearchQuery = '';
// 사용자 명시 2026-05-18 ultrathink (Phase 1+2): 진주 전용 탭 검색 query — archive 검색 query 와 분리 (탭 전환 시 cross-contamination 방지).
//   renderLensPearls 가 screen-pearls.active 시 _pearlsTabSearchQuery, 그 외 _archiveSearchQuery 사용.
let _pearlsTabSearchQuery = '';
let _libView = 'grid';  // V4-1p: 그리드 ↔ 타임라인 토글
// 사용자 명시 2026-05-27 ultrathink (캘린더 일정/할 일 2-1단계): 일기·대화 grid 뷰 한정 일기/일정 토글 모드.
//   'diary' = 기존 (캘린더에 일기 표시). 'schedule' = 캘린더에 일정 (state.schedules) 표시 — 2-2 단계 구현.
//   timeline 뷰 / 다른 카테고리에서는 무시 (검색 input 노출 유지).
let _calViewMode = 'diary';
try {
  const _storedCalMode = localStorage.getItem('soragodong_cal_view_mode');
  if (_storedCalMode === 'diary' || _storedCalMode === 'schedule') _calViewMode = _storedCalMode;
} catch (e) {}
let _archiveTagFilter = null;  // V4-1q: 깨달음 태그 칩 필터 (단일 선택)
// 사용자 요청 2026-04-29: 카테고리별 피드/목록 토글 + 목록 모드 카테고리 필터
// 사용자 명시 2026-05-02 cleanup: yangsaeng/galpi 별 view state 는 통합 _libView 로 대체. CatFilter 만 lens 별 유지 (UI onclick).
let _yangsaengCatFilter = null;  // 'seedling_trying' | 'working' | 'mutated' | 'embodied'
let _insightsView = 'feed';      // 'feed' | 'list'  (legacy — line 29902 표시 분기에서만 read)
let _insightsCatFilter = null;   // 'scrap' | 'memo' | 'reflection' | 'ai'
let _galpiCatFilter = null;      // 'decision' | 'weekly' | 'monthly' | 'quarterly'

function setYangsaengCatFilter(c) { _yangsaengCatFilter = (_yangsaengCatFilter === c) ? null : c; if (typeof renderLensStrategies === 'function') renderLensStrategies(); }
function setInsightsCatFilter(c) { _insightsCatFilter = (_insightsCatFilter === c) ? null : c; if (typeof renderLensArchive === 'function') renderLensArchive(); if (typeof renderLensInsights === 'function') renderLensInsights(); }
function setGalpiCatFilter(c) { _galpiCatFilter = (_galpiCatFilter === c) ? null : c; if (typeof renderLensGalpi === 'function') renderLensGalpi(); }

function renderArchive() {
  // 모든 하위 뷰 렌더; switchLibraryCat이 표시/숨김 처리
  renderLensTopicCards();
  renderLensTimeline();
  renderLensArchive();
  renderLensInsights();
  renderLensStrategies();
  renderLensPearls();
  if (typeof renderLensCalendarGrid === 'function') renderLensCalendarGrid();
  // 사용자 명시 2026-05-27 ultrathink: 실행 chip view 도 같이 pre-render (다른 lens 와 동일 패턴).
  if (typeof renderExecute === 'function') { try { renderExecute(); } catch (e) { console.warn('[renderExecute]', e); } }
  // V4 fix (사용자 보고 2026-05-17 ultrathink): renderLibraryHero 자동 호출 제거 — '오늘의 너' 큐레이션이 회전카드 oneul source + libraryHero 두 곳에 중복 노출되던 버그 fix.
  //   회전카드 (renderRotatingCard) 의 oneul source 가 '오늘의 너' 책임. libraryHero 는 진주 튜토 전용 (13-first-pearl-tutorial.js 가 명시 호출).
  if (typeof updateLibraryCatNewDots === 'function') updateLibraryCatNewDots();
  if (typeof updateLibraryTabNewDot === 'function') updateLibraryTabNewDot();
  if (typeof hydratePearlVideos === 'function') hydratePearlVideos();
  updateArchiveQuickCounts();
  // V4-fix #6: 일기·대화 grid 뷰 = 캘린더만 (lensTopicCards / lensTimeline 숨김). 매 호출 일관 적용.
  if (typeof _applyDiaryGridHide === 'function') _applyDiaryGridHide();
  // 사용자 명시 2026-05-27 ultrathink (캘린더 일정/할 일 2-1단계): 일기/일정 토글 display 동기화 (첫 진입 시 + 매 재렌더).
  if (typeof _applyCalViewModeDisplay === 'function') _applyCalViewModeDisplay();
}

function _applyDiaryGridHide() {
  const tc = document.getElementById('lensTopicCards');
  const tl = document.getElementById('lensTimeline');
  // 사용자 보고 2026-05-04 (VB019): 일기·대화 grid 모드에서 검색 입력 시 결과가 안 보이는 버그.
  // root cause: searchArchive() 가 lensTopicCards/lensTimeline 을 채워도 calOnly 로 display:none → 결과 invisible.
  // fix: 검색어 있으면 토픽 카드/타임라인 강제 노출 (캘린더는 그대로).
  const hasSearchQuery = !!(typeof _archiveSearchQuery === 'string' && _archiveSearchQuery.length > 0);
  const calOnly = (_libView === 'grid' && _currentLens === 'diary') && !hasSearchQuery;
  if (tc) tc.style.display = calOnly ? 'none' : '';
  if (tl) tl.style.display = calOnly ? 'none' : '';
  // 사용자 명시 2026-05-18 ultrathink: timeline 뷰에서 lensTopicCards 의 '🐚 대화에서 정리됨' 별도 섹션 숨김.
  //   timeline 자체가 일기 + 대화 정리 통합 feed (renderLensTimeline 에서 topicCards 합쳐 inline 표시) → 중복 방지.
  //   grid + diary + 검색 케이스만 topicCards 살림 (기존 동작 유지).
  if (tc && _libView === 'timeline' && _currentLens === 'diary') tc.style.display = 'none';
}

// 사용자 명시 2026-05-27 ultrathink (캘린더 일정/할 일 2-1단계): 일기·대화 grid 뷰 한정 일기/일정 토글.
//   일기·대화 + grid 일 때만 토글 노출 + 검색 input hide. 그 외는 검색 input 노출 (timeline / 다른 카테고리).
function switchCalViewMode(mode) {
  if (mode !== 'diary' && mode !== 'schedule') mode = 'diary';
  if (_calViewMode === mode) return;
  _calViewMode = mode;
  try { localStorage.setItem('soragodong_cal_view_mode', mode); } catch (e) {}
  _applyCalViewModeDisplay();
  // 2-2 단계에서 일정 모드 캘린더 렌더링 추가. 현재는 캘린더 재호출만 (mode 전환 신호).
  if (typeof renderLensCalendarGrid === 'function') renderLensCalendarGrid();
  // 2-2 단계 (캘린더 일정 표시 + 추가/수정/삭제) 미구현 안내 — 사용자 확인용. 다음 step 후 제거.
  if (mode === 'schedule' && typeof showToast === 'function') {
    showToast('📅 일정 모드 — 캘린더 표시 + 추가는 다음 단계에서');
  }
}

function _applyCalViewModeDisplay() {
  const input = document.getElementById('archiveSearch');
  const toggleEl = document.getElementById('calViewModeToggle');
  if (!input || !toggleEl) return;
  const showToggle = (_currentLens === 'diary' && _libView === 'grid');
  if (showToggle) {
    input.style.display = 'none';
    toggleEl.style.display = 'flex';
    document.querySelectorAll('#calViewModeToggle .cal-mode-btn').forEach(b => {
      const isActive = b.dataset.mode === _calViewMode;
      b.style.background = isActive ? 'var(--surface2)' : 'transparent';
      b.style.color = isActive ? 'var(--text)' : 'var(--text-soft)';
    });
  } else {
    input.style.display = '';
    toggleEl.style.display = 'none';
  }
}

