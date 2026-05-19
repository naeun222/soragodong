// 사용자 명시 2026-05-18 ultrathink: 일기·대화 timeline 재구성.
//   1) 최신순. 같은 날 안에서 일기 (entry) 먼저, 대화에서 정리된 토픽카드 (topicCards) 뒤.
//   2) 일기에 사진 첨부 (entry.photo) 있으면 카드 안에 inline 표시.
//   3) 대화 정리 라벨 = '🐚 대화에서 정리됨' (renderLensTopicCards 와 동일 phrase 통일).
//      일기 entry 와 시각 구분 — 별도 .ig-card-topic 카드 + .ig-topic-label.
//   `state.archive` (사용자 저장 깨달음) merge 는 제거 — 깨달음 탭이 그 역할 담당.
function renderLensTimeline() {
  const container = document.getElementById('lensTimeline');
  if (!container) return;

  // 일기 entries + 대화 정리 (topicCards) 합쳐 단일 timeline item array 구성.
  //   kind: 'diary' (entry) | 'topic' (topicCard)
  //   sortKey: ISO timestamp string (desc sort 후 같은 dayKey 안에서 'diary' 우선)
  const items = [];

  (state.entries || []).forEach(e => {
    if (!e.date) return;
    // dayKey = entry.date (YYYY-MM-DD 형식). intra-day 시각은 entry.timestamp (있으면) 또는 date+T23:59
    //   → 같은 날 다른 항목보다 위로 가도록 ts 를 23:59 로 잡고, 추가로 sortRank=0 (diary 우선) 부여.
    const ts = e.timestamp || (e.date + 'T23:59:59');
    items.push({ kind: 'diary', dayKey: e.date, ts, sortRank: 0, entry: e });
  });

  (state.topicCards || []).forEach(c => {
    // strategy 카테고리는 양생방 탭이 담당. timeline 에서는 일기·대화 chip 컨텍스트라 제외.
    if (c.category === 'strategy') return;
    const startedAt = c.chapterStartedAt || c.createdAt;
    if (!startedAt) return;
    const dayKey = getDayKey(startedAt);
    items.push({ kind: 'topic', dayKey, ts: startedAt, sortRank: 1, card: c });
  });

  // 최신순 — ts desc. 같은 ts (사실상 거의 없음) 또는 같은 dayKey 안에서 sortRank asc (diary=0 먼저).
  items.sort((a, b) => {
    if (a.dayKey !== b.dayKey) return b.dayKey.localeCompare(a.dayKey);
    if (a.sortRank !== b.sortRank) return a.sortRank - b.sortRank;
    return (b.ts || '').localeCompare(a.ts || '');
  });

  // 검색 필터
  let filtered = items;
  if (_archiveSearchQuery) {
    filtered = items.filter(it => {
      if (it.kind === 'diary') {
        const e = it.entry;
        const haystack = [
          e.date,
          e.note || '',
          e.diary || '',
          e.userEdit || '',
          e.dailyQuestion?.text || '',
          e.dailyQuestionAnswer || '',
          e.aiSummary || '',
          Object.keys(e.modes || {}).filter(k => e.modes[k]).join(' ')
        ].join(' ').toLowerCase();
        return haystack.includes(_archiveSearchQuery);
      } else {
        const c = it.card;
        const haystack = [c.title || '', c.summary || '', c.category || ''].join(' ').toLowerCase();
        return haystack.includes(_archiveSearchQuery);
      }
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div class="timeline-empty">
      <div class="icon">📅</div>
      ${_archiveSearchQuery ? '검색 결과 없음' : '아직 기록이 없어.<br>오늘 한 줄부터 천천히 ✦'}
    </div>`;
    return;
  }

  container.innerHTML = filtered.map(it => {
    if (it.kind === 'diary') return _renderDiaryCardHTML(it.entry);
    return _renderTopicCardHTML(it.card);
  }).join('');
}

// 일기 (entry) 카드 — 인스타 게시물 스타일. 사진 첨부 있으면 inline.
function _renderDiaryCardHTML(entry) {
  const isHidden = !!entry.hidden;
  const dateStr = formatDateKorean(entry.date);

  // 헤더 칩들 — 체크인 정보
  const chips = [];
  if (entry.sleepStart && entry.sleepEnd) {
    const dur = computeSleepDuration(entry.sleepStart, entry.sleepEnd);
    chips.push(`<span class="ig-chip">😴 ${dur}</span>`);
  }
  if (entry.vitality) chips.push(`<span class="ig-chip">⚡ ${entry.vitality}</span>`);
  if (entry.mood) chips.push(`<span class="ig-chip">💭 ${entry.mood}</span>`);
  if (entry.modes) {
    const activeModes = Object.keys(entry.modes).filter(k => entry.modes[k]);
    const labels = { exam: '시험', travel: '여행', sick: '아픔', rest: '휴식', period: '월경' };
    activeModes.forEach(m => chips.push(`<span class="ig-chip ig-chip-mode">${labels[m] || m}</span>`));
  }
  if (entry.sosSkipped) chips.push(`<span class="ig-chip ig-chip-mode">🪫 방전</span>`);

  // 본문 블록들
  const blocks = [];
  if (entry.dailyQuestion?.text && (entry.note || entry.dailyQuestionAnswer)) {
    const ans = entry.dailyQuestionAnswer || entry.note || '';
    blocks.push(`<div class="ig-qa-set">
      <div class="ig-question">Q. ${escapeHtml(entry.dailyQuestion.text)}</div>
      <div class="ig-answer">${escapeHtml(ans)}</div>
    </div>`);
  }
  if (entry.userEdit) {
    blocks.push(`<div class="ig-block ig-block-edit">📝 ${escapeHtml(entry.userEdit)}</div>`);
  }
  if (entry.diary) {
    blocks.push(`<div class="ig-block ig-block-diary"><div class="ig-block-icon">📔</div><div class="ig-block-content">${escapeHtml(entry.diary)}</div></div>`);
  }
  if (entry.aiSummary && !entry.diary) {
    blocks.push(`<div class="ig-block ig-block-auto"><div class="ig-block-label">🤖 자동 요약</div><div class="ig-block-content">${escapeHtml(entry.aiSummary)}</div></div>`);
  }
  // 일일질문 없이 note만 있는 케이스 — 단독 메모로
  if (!entry.dailyQuestion?.text && entry.note) {
    blocks.push(`<div class="ig-block ig-block-note">${escapeHtml(entry.note)}</div>`);
  }
  // V4 (사용자 명시 2026-05-20 ultrathink): photos[] multi 렌더 (max 3), legacy entry.photo fallback.
  const _tlPhotos = (Array.isArray(entry.photos) && entry.photos.length > 0)
    ? entry.photos.slice(0, 3)
    : (entry.photo ? [entry.photo] : []);
  if (_tlPhotos.length > 0) {
    const _imgs = _tlPhotos.map(p => `<img src="${escapeHtml(p)}" alt="" class="ig-photo" loading="lazy">`).join('');
    blocks.push(`<div class="ig-photo-wrap${_tlPhotos.length > 1 ? ' ig-photo-multi' : ''}">${_imgs}</div>`);
  }
  if (entry.music) {
    blocks.push(`<div style="margin-top:8px;">${renderMusicCardHTML(entry.music)}</div>`);
  }
  if (blocks.length === 0) {
    blocks.push(`<div class="ig-empty">기록만 남긴 날이야.</div>`);
  }

  return `
    <article class="ig-card${isHidden ? ' hidden-entry' : ''}" data-date="${entry.date}">
      <header class="ig-header">
        <div class="ig-header-left">
          <div class="ig-date">${dateStr}</div>
          ${chips.length ? `<div class="ig-chips">${chips.join('')}</div>` : ''}
        </div>
        <button class="ig-menu-btn" onclick="showTimelineDayMenu('${entry.date}')" aria-label="메뉴">⋮</button>
      </header>
      <div class="ig-body">${blocks.join('')}</div>
    </article>
  `;
}

// 대화 정리 (topicCard) 카드 — '🐚 대화에서 정리됨' 라벨 + 카테고리 + 요약. 일기와 시각 구분.
function _renderTopicCardHTML(card) {
  const startedAt = card.chapterStartedAt || card.createdAt;
  const dayKey = getDayKey(startedAt);
  const dateStr = formatDateKorean(dayKey);
  const catInfo = (typeof TOPIC_CATEGORY_LABELS !== 'undefined' && TOPIC_CATEGORY_LABELS[card.category])
    ? TOPIC_CATEGORY_LABELS[card.category]
    : { label: '토픽', icon: '✦' };
  const catClass = card.category ? `cat-${escapeHtml(card.category)}` : '';
  return `
    <article class="ig-card ig-card-topic ${catClass}" data-topic-id="${escapeHtml(card.id || '')}" onclick="openTopicCard('${escapeHtml(card.id || '')}')">
      <header class="ig-header">
        <div class="ig-header-left">
          <div class="ig-date">${dateStr}</div>
          <div class="ig-topic-label">🐚 대화에서 정리됨</div>
        </div>
      </header>
      <div class="ig-body">
        <div class="ig-topic-row">
          <span class="ig-topic-cat">${catInfo.icon} ${escapeHtml(catInfo.label)}</span>
          <span class="ig-topic-title">${escapeHtml(card.title || '')}</span>
        </div>
        ${card.summary ? `<div class="ig-topic-summary">${escapeHtml(card.summary)}</div>` : ''}
        <div class="ig-topic-meta">${card.messageCount || 0}개 메시지</div>
      </div>
    </article>
  `;
}

// V3.13.x: timeline 카드 ⋮ 메뉴 — 메모 추가/숨기기/삭제 정리
async function showTimelineDayMenu(date) {
  const entry = (state.entries || []).find(e => e.date === date);
  const isHidden = !!(entry && entry.hidden);
  const action = await showOptionsModal({
    title: formatDateKorean(date),
    options: [
      { label: '✎ 메모 추가/수정', value: 'edit' },
      { label: isHidden ? '👁 보이기' : '🙈 숨기기', value: 'toggle' },
      { label: '✕ 삭제', value: 'delete' }
    ]
  });
  if (!action) return;
  if (action === 'edit') return editTimelineEntry(date);
  if (action === 'toggle') return toggleHideEntry(date);
  if (action === 'delete') return deleteTimelineEntry(date);
}

function formatDateKorean(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  // V3.13.x: 04:00 cutoff 기준 오늘/어제 라벨링
  const todayK = todayKey();
  const yesterdayK = getDayKey(Date.now() - 86400000);
  if (dateStr === todayK) return '오늘 · ' + d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
  if (dateStr === yesterdayK) return '어제 · ' + d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

function computeSleepDuration(start, end) {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

async function editTimelineEntry(date) {
  const entry = state.entries.find(e => e.date === date);
  if (!entry) return;
  const current = entry.userEdit || '';
  const updated = await showInputModal({
    title: '메모 추가/수정',
    message: date,
    placeholder: '이 날에 대한 메모',
    defaultValue: current,
    multiline: true,
    okLabel: '저장'
  });
  if (updated === null) return;
  if (updated.trim() === '') {
    delete entry.userEdit;
  } else {
    entry.userEdit = updated.trim();
    entry.editedAt = new Date().toISOString();
  }
  saveState();
  renderLensTimeline();
}

function toggleHideEntry(date) {
  const entry = state.entries.find(e => e.date === date);
  if (!entry) return;
  entry.hidden = !entry.hidden;
  saveState();
  renderLensTimeline();
  showToast(entry.hidden ? '숨김 처리됨' : '다시 보임');
}

async function deleteTimelineEntry(date) {
  if (!await confirmDelete(`${formatDateKorean(date)}의 체크인`, '체크인 entry만 삭제. 그 날의 깨달음 카드는 그대로 유지돼 — 깨달음 탭에서 따로 관리해.')) return;
  state.entries = state.entries.filter(e => e.date !== date);
  // V3.13.x: archive(깨달음)는 별도 유지 — 사용자가 의도치 않게 깨달음을 잃는 일 방지
  saveState();
  renderLensTimeline();
  showToast('체크인 삭제됨');
}

// === V3.13.x: 사용자 저장 깨달음 (state.archive) — 깨달음 렌즈 최상단 ===
