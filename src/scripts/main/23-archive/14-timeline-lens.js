// V4 (사용자 명시 2026-05-20 ultrathink): 일기·대화 timeline 두 섹션 분리.
//   섹션 1 — 📔 일기 (entries) 최신순, 10개 이상 시 '더보기' 토글로 확장.
//   섹션 2 — 🐚 대화에서 정리됨 (topicCards) 최신순, 10개 이상 시 '더보기' 토글로 확장.
//   옛 단일 통합 timeline (intra-day diary 먼저 / topic 뒤) 폐기 — 사용자 mental model "일기 vs 대화 분리" 우선.
const TIMELINE_SECTION_INITIAL = 10;
let _timelineDiaryExpanded = false;
let _timelineTopicExpanded = false;

function _toggleTimelineSection(kind) {
  if (kind === 'diary') _timelineDiaryExpanded = !_timelineDiaryExpanded;
  else _timelineTopicExpanded = !_timelineTopicExpanded;
  if (typeof renderLensTimeline === 'function') renderLensTimeline();
}

function renderLensTimeline() {
  const container = document.getElementById('lensTimeline');
  if (!container) return;

  // 일기 entries 수집 — 최신순 sort.
  const diaryItems = (state.entries || [])
    .filter(e => e && e.date)
    .map(e => ({
      entry: e,
      ts: e.timestamp || (e.date + 'T23:59:59')
    }))
    .sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));

  // 대화 정리 (topicCards) 수집 — strategy 제외, 최신순 sort.
  const topicItems = (state.topicCards || [])
    .filter(c => c && c.category !== 'strategy')
    .map(c => {
      const startedAt = c.chapterStartedAt || c.createdAt;
      return startedAt ? { card: c, ts: startedAt } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));

  // 검색 필터 — 각 섹션 별 적용.
  const q = _archiveSearchQuery;
  const filteredDiary = q ? diaryItems.filter(it => {
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
    return haystack.includes(q);
  }) : diaryItems;
  const filteredTopic = q ? topicItems.filter(it => {
    const c = it.card;
    const haystack = [c.title || '', c.summary || '', c.category || ''].join(' ').toLowerCase();
    return haystack.includes(q);
  }) : topicItems;

  if (filteredDiary.length === 0 && filteredTopic.length === 0) {
    container.innerHTML = `<div class="timeline-empty">
      <div class="icon">📅</div>
      ${q ? '검색 결과 없음' : '아직 기록이 없어.<br>오늘 한 줄부터 천천히 ✦'}
    </div>`;
    return;
  }

  let html = '';

  // 섹션 1: 📔 일기
  if (filteredDiary.length > 0) {
    const diaryShown = _timelineDiaryExpanded ? filteredDiary : filteredDiary.slice(0, TIMELINE_SECTION_INITIAL);
    const diaryHasMore = filteredDiary.length > TIMELINE_SECTION_INITIAL;
    html += `<section class="timeline-section">
      <div class="timeline-section-header">📔 일기 <span class="timeline-section-count">${filteredDiary.length}</span></div>
      ${diaryShown.map(it => _renderDiaryCardHTML(it.entry)).join('')}
      ${diaryHasMore
        ? `<button class="timeline-section-more" onclick="_toggleTimelineSection('diary')">${_timelineDiaryExpanded ? '접기 ▴' : `더보기 (${filteredDiary.length - TIMELINE_SECTION_INITIAL}) ▾`}</button>`
        : ''}
    </section>`;
  }

  // 섹션 2: 🐚 대화에서 정리됨
  if (filteredTopic.length > 0) {
    const topicShown = _timelineTopicExpanded ? filteredTopic : filteredTopic.slice(0, TIMELINE_SECTION_INITIAL);
    const topicHasMore = filteredTopic.length > TIMELINE_SECTION_INITIAL;
    html += `<section class="timeline-section">
      <div class="timeline-section-header">🐚 대화에서 정리됨 <span class="timeline-section-count">${filteredTopic.length}</span></div>
      ${topicShown.map(it => _renderTopicCardHTML(it.card)).join('')}
      ${topicHasMore
        ? `<button class="timeline-section-more" onclick="_toggleTimelineSection('topic')">${_timelineTopicExpanded ? '접기 ▴' : `더보기 (${filteredTopic.length - TIMELINE_SECTION_INITIAL}) ▾`}</button>`
        : ''}
    </section>`;
  }

  container.innerHTML = html;
  if (typeof hydrateDiaryPhotos === 'function') hydrateDiaryPhotos(container);
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
  // V4 (Phase 1E Step 3): diaryImgHtml 가 storageKey / dataURL / legacy entry.photo 자동 분기.
  const _tlPhotoCount = Math.min(3, Math.max(
    Array.isArray(entry.photoStorageKeys) ? entry.photoStorageKeys.length : 0,
    Array.isArray(entry.photos) ? entry.photos.length : 0,
    entry.photo ? 1 : 0
  ));
  if (_tlPhotoCount > 0) {
    const _imgs = [];
    for (let _i = 0; _i < _tlPhotoCount; _i++) {
      if (typeof diaryEntryHasPhoto === 'function' && !diaryEntryHasPhoto(entry, _i)) continue;
      _imgs.push((typeof diaryImgHtml === 'function')
        ? diaryImgHtml(entry, _i, { cls: 'ig-photo', extra: 'loading="lazy"' })
        : `<img src="${escapeHtml((entry.photos && entry.photos[_i]) || (_i === 0 ? entry.photo : ''))}" alt="" class="ig-photo" loading="lazy">`);
    }
    if (_imgs.length > 0) {
      blocks.push(`<div class="ig-photo-wrap${_imgs.length > 1 ? ' ig-photo-multi' : ''}">${_imgs.join('')}</div>`);
    }
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
  // V4 (사용자 명시 2026-05-20 ultrathink): 사진/음악 수정 옵션 추가 — 사진 / 음악 있을 때만 노출.
  //   체크인 질문/활력/에너지/수면 은 분석 추출 입력이라 수정 X. 사진 + 음악만 허용.
  const _hasMedia = !!(entry && (
    entry.music ||
    entry.photo ||
    (Array.isArray(entry.photos) && entry.photos.length > 0) ||
    (Array.isArray(entry.photoStorageKeys) && entry.photoStorageKeys.some(Boolean))
  ));
  const options = [
    { label: '✎ 메모 추가/수정', value: 'edit' }
  ];
  if (_hasMedia || entry) {
    options.push({ label: '📷 사진 / 🎵 음악 수정', value: 'editMedia' });
  }
  options.push({ label: isHidden ? '👁 보이기' : '🙈 숨기기', value: 'toggle' });
  options.push({ label: '✕ 삭제', value: 'delete' });
  const action = await showOptionsModal({
    title: formatDateKorean(date),
    options
  });
  if (!action) return;
  if (action === 'edit') return editTimelineEntry(date);
  if (action === 'editMedia') {
    if (typeof openDiaryMediaEditSheet === 'function') openDiaryMediaEditSheet(date);
    return;
  }
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
