function closeDayModal() {
  const el = document.getElementById('dayModal');
  if (el) el.remove();
}

// V4 (사용자 명시 2026-05-27 ultrathink): 캘린더 day cell 배경 필터 — 사진 / 티켓 / 책.
//   priority: photo > ticket > book. 토글 OFF or 자산 없으면 무드 색 fallback.
//   영구 저장 = state.preferences.calendarFilters.{photo,ticket,book}.
function _getCalFilters() {
  const pref = state.preferences || {};
  const f = pref.calendarFilters || {};
  return { photo: !!f.photo, ticket: !!f.ticket, book: !!f.book };
}

function toggleCalendarFilter(kind) {
  if (!['photo', 'ticket', 'book'].includes(kind)) return;
  if (!state.preferences) state.preferences = {};
  if (!state.preferences.calendarFilters) state.preferences.calendarFilters = { photo: false, ticket: false, book: false };
  state.preferences.calendarFilters[kind] = !state.preferences.calendarFilters[kind];
  try { saveState(); } catch (e) { console.warn('[calFilter save]', e); }
  renderLensCalendarGrid();
}

// SVG 아이콘 3종 — currentColor stroke, no fill. 14×14 viewBox 24.
const _CAL_FILTER_SVG = {
  photo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8a2 2 0 0 1 2-2h2.5l1.5-2h6l1.5 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2.5a2 2 0 0 0 0 4V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3.5a2 2 0 0 0 0-4V8z"/><path d="M10 7v1M10 11v1M10 15v1M10 19v0" stroke-dasharray="0.1 2"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a1 1 0 0 1 1-1h5a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4V5z"/><path d="M20 5a1 1 0 0 0-1-1h-5a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6V5z"/></svg>'
};

function renderLensCalendarGrid() {
  const container = document.getElementById('lensCalendarGrid');
  if (!container) { return; }
  // grid 뷰 + diary 카테고리만 표시. 그 외 비움.
  if (_libView !== 'grid' || _currentLens !== 'diary') {
    container.innerHTML = '';
    return;
  }

  const today = new Date();
  const target = new Date(today.getFullYear(), today.getMonth() + _calMonthOffset, 1);
  const year = target.getFullYear();
  const month = target.getMonth();
  const monthLabel = target.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay(); // 0=일
  const totalDays = lastDay.getDate();

  // 무드 색 매핑 (entry.mood 1-5)
  const moodColor = {
    1: '#5a4a72',  // 어두운 보라 (낮은 무드)
    2: '#7a6a92',
    3: '#a89dc8',  // 중성
    4: '#c7b288',
    5: '#d4a76a'   // 밝은 금 (높은 무드)
  };

  const calFilters = _getCalFilters();
  const _anyFilter = calFilters.photo || calFilters.ticket || calFilters.book;

  // 각 날짜 entries / chatMessages 매핑
  const entriesByDate = {};
  (state.entries || []).forEach(e => { if (e.date) entriesByDate[e.date] = e; });
  const chaptersByDate = {};
  // 사용자 보고 2026-04-29: chatMessages의 chapterStart 마커 timestamp는
  // "다음 챕터 시작 시점" (4시간 갭 후 첫 메시지)이라 잘못된 날짜에 점이 찍혔음
  // (예: 28일에 대화 → 29일 첫 메시지에 마커 → 29일에 잘못 표시).
  // → 실제 챕터 종료 시점 기반으로 변경: topicCards.chapterEndedAt + chatArchive.date
  // 사용자 보고 2026-05-04 (VB018): 캘린더에 잘못 표시되는 챕터 점 + 시드 토픽 노출 fix.
  // (1) category='strategy' 토픽카드 = 양생방 DNA 카드 → 일기·대화 챕터 dot X.
  // (2) testerMode 아닐 때는 _seed marker 도 제외 (시드 잔재가 캘린더 오염하는 케이스 방어).
  const _isTester = !!(state.preferences && state.preferences.testerMode);
  (state.topicCards || []).forEach(c => {
    if (!c) return;
    if (c.category === 'strategy') return;
    if (!_isTester && c._seed) return;
    const endedAt = c.chapterEndedAt || c.chapterStartedAt || c.createdAt;
    if (endedAt) {
      const dk = getDayKey(endedAt);
      chaptersByDate[dk] = (chaptersByDate[dk] || 0) + 1;
    }
  });
  (state.chatArchive || []).forEach(a => {
    if (!a || !a.date) return;
    if (!_isTester && a._seed) return;
    chaptersByDate[a.date] = (chaptersByDate[a.date] || 0) + 1;
  });

  // V4 (사용자 명시 2026-05-14 ultrathink): 티켓 / 책 진주 day cell mini icon — eventDate 기준.
  const ticketsByDate = {};
  const booksByDate = {};
  (state.pearls || []).forEach(p => {
    if (!p) return;
    if (p.category === '티켓') {
      const dk = p.eventDate || (p.createdAt ? getDayKey(p.createdAt) : null);
      if (dk) (ticketsByDate[dk] = ticketsByDate[dk] || []).push(p);
    } else if (p.category === '책') {
      const dk = p.eventDate || p.finishedAt || (p.createdAt ? getDayKey(p.createdAt) : null);
      if (dk) (booksByDate[dk] = booksByDate[dk] || []).push(p);
    }
  });

  let html = `
    <div class="cal-grid-wrap">
      <div class="cal-nav">
        <button class="cal-nav-btn" onclick="shiftCalMonth(-1)" aria-label="지난 달">←</button>
        <div class="cal-month-label">${monthLabel}</div>
        <button class="cal-nav-btn" onclick="shiftCalMonth(1)" aria-label="다음 달" ${_calMonthOffset >= 0 ? 'disabled style="opacity:0.3;"' : ''}>→</button>
      </div>
      <div class="cal-weekdays">
        <span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span>
      </div>
      <div class="cal-days">
  `;
  // 빈 칸 (월 첫째 날 전)
  for (let i = 0; i < startWeekday; i++) {
    html += `<div class="cal-day cal-empty"></div>`;
  }
  // 각 날짜
  for (let d = 1; d <= totalDays; d++) {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    const dateKey = `${year}-${mm}-${dd}`;
    const entry = entriesByDate[dateKey];
    const mood = entry?.mood;
    const hasChapter = !!chaptersByDate[dateKey];
    const dayTickets = ticketsByDate[dateKey] || [];
    const dayBooks = booksByDate[dateKey] || [];
    const isToday = dateKey === todayKey();
    // V4-fix: 오늘은 클릭 가능 — dateKey 문자열 비교 (YYYY-MM-DD)
    const isFuture = dateKey > todayKey();
    const empty = !entry && !hasChapter && dayTickets.length === 0 && dayBooks.length === 0;

    // V4 (사용자 명시 2026-05-27 ultrathink — 재): 필터 layer stack — photo z=3, ticket z=2, book z=1.
    //   각 필터 ON + 자산 있음 → 그 layer 셀에 push. img hydrate 실패 시 visibility:hidden 으로
    //   자연스럽게 아래 layer (다른 필터 자산 / mood 색) 가 비침. 단일 bgImageHtml 보다 stale storageKey
    //   에 강하고, 티켓·책은 photo 없을 때 sub-type emoji fallback layer 로 시각 신호 유지.
    //   priority chain 이 코드 if-else 가 아닌 CSS z-index 로 표현됨.
    const bgLayers = [];
    if (calFilters.photo && entry && typeof diaryEntryHasPhoto === 'function' && diaryEntryHasPhoto(entry, 0)) {
      const h = (typeof diaryImgHtml === 'function')
        ? diaryImgHtml(entry, 0, { cls: 'cal-day-bg-layer cal-day-bg-img cal-day-bg-photo', alt: '' })
        : '';
      if (h) bgLayers.push(h);
    }
    if (calFilters.ticket && dayTickets.length > 0) {
      const tp = (typeof pearlHasMedia === 'function') ? dayTickets.find(p => pearlHasMedia(p, 'photo')) : null;
      if (tp && typeof pearlImgHtml === 'function') {
        const h = pearlImgHtml(tp, 'photo', { cls: 'cal-day-bg-layer cal-day-bg-img cal-day-bg-ticket', alt: '' });
        if (h) bgLayers.push(h);
      } else {
        // photo 없는 티켓 → sub-type emoji fallback (첫 티켓 기준).
        const first = dayTickets[0];
        const sub = (typeof _findTicketSubType === 'function') ? _findTicketSubType(first.subType) : null;
        const emoji = sub?.emoji || '🎫';
        bgLayers.push(`<span class="cal-day-bg-layer cal-day-bg-emoji cal-day-bg-ticket" aria-hidden="true">${emoji}</span>`);
      }
    }
    if (calFilters.book && dayBooks.length > 0) {
      const bp = (typeof pearlHasMedia === 'function') ? dayBooks.find(p => pearlHasMedia(p, 'photo')) : null;
      if (bp && typeof pearlImgHtml === 'function') {
        const h = pearlImgHtml(bp, 'photo', { cls: 'cal-day-bg-layer cal-day-bg-img cal-day-bg-book', alt: '' });
        if (h) bgLayers.push(h);
      } else {
        // photo 없는 책 → 📚 emoji fallback.
        bgLayers.push(`<span class="cal-day-bg-layer cal-day-bg-emoji cal-day-bg-book" aria-hidden="true">📚</span>`);
      }
    }
    // cell bg 는 항상 mood 색 (모든 layer fail/없음 시 mood fallback).
    const bg = mood ? (moodColor[mood] || 'transparent') : 'transparent';

    // 티켓 / 책 mini dot — 필터 layer 가 셀을 채우면 CSS :has() 로 자동 hide.
    let miniIcons = '';
    if (dayTickets.length > 0) {
      const first = dayTickets[0];
      const sub = (typeof _findTicketSubType === 'function') ? _findTicketSubType(first.subType) : null;
      const emoji = sub?.emoji || '🎫';
      miniIcons += `<span class="day-cell-mini-dot">${emoji}</span>`;
    }
    if (dayBooks.length > 0) {
      const first = dayBooks[0];
      if (first.photo) {
        miniIcons += `<img class="day-cell-mini-cover" src="${first.photo}" alt="">`;
      } else {
        miniIcons += `<span class="day-cell-mini-dot">📚</span>`;
      }
    }
    const moreCount = dayTickets.length + dayBooks.length - (dayTickets.length > 0 ? 1 : 0) - (dayBooks.length > 0 ? 1 : 0);
    if (moreCount > 0) miniIcons += `<span class="day-cell-mini-more">+${moreCount}</span>`;
    const miniWrap = miniIcons ? `<span class="day-cell-mini-row">${miniIcons}</span>` : '';

    html += `
      <div class="cal-day${isToday ? ' today' : ''}${empty ? ' empty' : ''}${isFuture ? ' future' : ''}"
           data-date="${dateKey}"
           style="background:${bg};"
           onclick="${isFuture ? '' : `jumpToTimelineDate('${dateKey}')`}"
           title="${dateKey}${mood ? ` · 기분 ${mood}/5` : ''}">
        ${bgLayers.join('')}
        <span class="cal-day-num">${d}</span>
        ${hasChapter ? `<span class="cal-chapter-dot"></span>` : ''}
        ${miniWrap}
      </div>
    `;
  }
  const _filterBtn = (kind, label) => `
    <button type="button"
            class="cal-filter-btn${calFilters[kind] ? ' active' : ''}"
            aria-pressed="${calFilters[kind] ? 'true' : 'false'}"
            aria-label="${label}"
            title="${label}"
            onclick="toggleCalendarFilter('${kind}')">${_CAL_FILTER_SVG[kind]}</button>
  `;
  html += `
      </div>
      <div class="cal-legend">
        <div class="cal-legend-items">
          <span style="background:#5a4a72;"></span> 낮은 무드
          <span style="background:#a89dc8;"></span> 중성
          <span style="background:#d4a76a;"></span> 높은 무드
          <span class="cal-legend-dot"></span> 챕터 있음
        </div>
        <div class="cal-filter-toggle" role="group" aria-label="캘린더 표시 필터">
          ${_filterBtn('photo', '일기 사진')}
          ${_filterBtn('ticket', '티켓 진주')}
          ${_filterBtn('book', '책 진주')}
        </div>
      </div>
    </div>
  `;
  container.innerHTML = html;

  // V4 (사용자 명시 2026-05-27 ultrathink): 필터 ON 시 신 path (storageKey) 이미지 hydrate.
  if (_anyFilter) {
    try { if (typeof hydrateDiaryPhotos === 'function') hydrateDiaryPhotos(container); } catch (e) { console.warn('[cal hydrateDiary]', e); }
    try { if (typeof hydratePearlMedia === 'function') hydratePearlMedia(container); } catch (e) { console.warn('[cal hydratePearl]', e); }
  }
}

function switchLibraryCat(cat) {
  // V4 (사용자 명시 2026-05-06 ultrathink — 추가): 첫 칩 클릭 → V8 sim 튜토리얼 fire.
  // 사용자 명시 2026-05-18 ultrathink Phase 3: 진주 chip 제거 — pearls 트리거 폐기 (진주 탭 진입 / addPearl 진입 두 곳에서만 fire).
  if (!window._pearlTutorialInternalNav && !window._simTutorialInternalNav) {
    if (cat === 'insights' && typeof shouldRunInsightsTutorial === 'function' && shouldRunInsightsTutorial()) {
      runInsightsTutorialV8().catch(e => console.warn('[insights]', e));
      return;
    }
  }
  if (!_LIB_CAT_TO_VIEW[cat]) cat = 'diary';
  _currentLens = cat;
  document.querySelectorAll('.lib-cat-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.cat === cat);
  });
  Object.entries(_LIB_CAT_TO_VIEW).forEach(([k, vid]) => {
    const el = document.getElementById(vid);
    if (el) el.style.display = (k === cat) ? '' : 'none';
  });
  // 사용자 보고 2026-04-29: 칩 전환 시 active lens 재렌더 — 토글 상태(_libView)와 보이는 view 동기화
  if (typeof _renderActiveLens === 'function') _renderActiveLens();
  // V4 fix (사용자 명시 2026-05-17 재): libraryHero 일반 view 영구 hide — 옛 위치 (chip row 위, 도서관 전체 상단) 보존하되 일반 view 에선 빈 컨테이너.
  //   진주 튜토 진행 중에만 renderLibraryHero 동적 inject (13-first-pearl-tutorial.js). 모든 chip 진입 시 비우는 게 안전망 (튜토 종료 후 잔재 X).
  const _heroEl = document.getElementById('libraryHero');
  if (_heroEl) _heroEl.innerHTML = '';
  // V4: 카테고리 전환 후 잠금 시각 갱신 (마법고동 등)
  setTimeout(() => { if (typeof applyCoreLockMarkers === 'function') applyCoreLockMarkers(); }, 30);
  // 검색바는 모든 카테고리에서 노출 (사용자 보고 2026-04-29: 'block' 으로 덮으면 flex 깨져 토글이 검색창 밑으로 wrap — 'flex' 유지)
  //   사용자 명시 2026-05-27 ultrathink: 실행 chip 은 검색 / 그리드·타임라인 토글 적용 X → 둘 다 hide.
  const searchBar = document.getElementById('archiveSearchBar');
  if (searchBar) searchBar.style.display = (cat === 'execute') ? 'none' : 'flex';
  // V4-fix #5: 클릭한 카테고리는 본 것 → ● 점 사라짐
  if (typeof _markLibCatSeen === 'function') {
    _markLibCatSeen(cat);
    saveState();
    if (typeof updateLibraryCatNewDots === 'function') updateLibraryCatNewDots();
  }
  // V4-fix #6: 일기·대화 grid 뷰에서는 캘린더만 (lensTopicCards / lensTimeline 숨김)
  // + 캘린더 재렌더 (다른 cat에서 비워졌던 거 복구)
  if (typeof renderLensCalendarGrid === 'function') renderLensCalendarGrid();
  if (typeof _applyDiaryGridHide === 'function') _applyDiaryGridHide();
  // 사용자 요청 2026-04-29: 토글 5 카테고리 모두 통일 (SVG 아이콘 — 라벨 동적 X)
  // 사용자 명시 2026-05-27 ultrathink: 실행 chip 은 그리드·타임라인 토글 적용 X → hide.
  const toggleEl = document.querySelector('.library-view-toggle');
  if (toggleEl) toggleEl.style.display = (cat === 'execute') ? 'none' : '';
  // 사용자 명시 2026-05-27 ultrathink (캘린더 일정/할 일 2-1단계): 카테고리 전환 시 일기/일정 토글 display 동기화.
  if (typeof _applyCalViewModeDisplay === 'function') _applyCalViewModeDisplay();
}

