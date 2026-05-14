function closeDayModal() {
  const el = document.getElementById('dayModal');
  if (el) el.remove();
}

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
    const bg = mood ? moodColor[mood] || 'transparent' : 'transparent';
    const hasChapter = !!chaptersByDate[dateKey];
    const dayTickets = ticketsByDate[dateKey] || [];
    const dayBooks = booksByDate[dateKey] || [];
    const isToday = dateKey === todayKey();
    // V4-fix: 오늘은 클릭 가능 — dateKey 문자열 비교 (YYYY-MM-DD)
    const isFuture = dateKey > todayKey();
    const empty = !entry && !hasChapter && dayTickets.length === 0 && dayBooks.length === 0;

    // V4 (사용자 명시 2026-05-14 ultrathink): 티켓 / 책 mini dot — 첫 1개씩 + 누적 +N.
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
        <span class="cal-day-num">${d}</span>
        ${hasChapter ? `<span class="cal-chapter-dot"></span>` : ''}
        ${miniWrap}
      </div>
    `;
  }
  html += `
      </div>
      <div class="cal-legend">
        <span style="background:#5a4a72;"></span> 낮은 무드
        <span style="background:#a89dc8;"></span> 중성
        <span style="background:#d4a76a;"></span> 높은 무드
        <span class="cal-legend-dot"></span> 챕터 있음
      </div>
    </div>
  `;
  container.innerHTML = html;
}

function switchLibraryCat(cat) {
  // V4 (사용자 명시 2026-05-06 ultrathink — 추가): 첫 칩 클릭 → V8 sim 튜토리얼 fire.
  if (!window._pearlTutorialInternalNav && !window._simTutorialInternalNav) {
    if (cat === 'pearls' && typeof shouldRunFirstPearlTutorial === 'function' && shouldRunFirstPearlTutorial()) {
      runFirstPearlTutorialV8().catch(e => console.warn('[pearl tutorial]', e));
      return;
    }
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
  // V4: 카테고리 전환 후 잠금 시각 갱신 (마법고동 등)
  setTimeout(() => { if (typeof applyCoreLockMarkers === 'function') applyCoreLockMarkers(); }, 30);
  // 검색바는 모든 카테고리에서 노출 (사용자 보고 2026-04-29: 'block' 으로 덮으면 flex 깨져 토글이 검색창 밑으로 wrap — 'flex' 유지)
  const searchBar = document.getElementById('archiveSearchBar');
  if (searchBar) searchBar.style.display = 'flex';
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
  const toggleEl = document.querySelector('.library-view-toggle');
  if (toggleEl) toggleEl.style.display = '';
}

