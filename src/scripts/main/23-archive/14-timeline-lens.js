function renderLensTimeline() {
  const container = document.getElementById('lensTimeline');
  if (!container) return;

  // Build unified timeline entries by date
  const dateMap = new Map();

  // Add check-in entries
  (state.entries || []).forEach(e => {
    if (!e.date) return;
    if (!dateMap.has(e.date)) {
      dateMap.set(e.date, { date: e.date, checkin: null, chatSummary: null, archives: [], hidden: false, edited: null });
    }
    dateMap.get(e.date).checkin = e;
  });

  // Add archive insights (legacy + new) — V3.13.x: 4시 cutoff 적용
  (state.archive || []).forEach(a => {
    const date = a.savedAt ? getDayKey(a.savedAt) : (a.date && a.date.match(/\d{4}-\d{2}-\d{2}/)?.[0]);
    if (!date) return;
    if (!dateMap.has(date)) {
      dateMap.set(date, { date, checkin: null, chatSummary: null, archives: [], hidden: false });
    }
    dateMap.get(date).archives.push(a);
  });

  // Sort by date desc
  const sortedDays = [...dateMap.values()].sort((a, b) => b.date.localeCompare(a.date));

  // Apply search filter
  let filtered = sortedDays;
  if (_archiveSearchQuery) {
    filtered = sortedDays.filter(d => {
      const haystack = [
        d.date,
        d.checkin?.note || '',
        d.checkin?.dailyQuestion?.text || '',
        d.archives.map(a => a.insight).join(' '),
        Object.keys(d.checkin?.modes || {}).filter(k => d.checkin?.modes[k]).join(' '),
        d.edited?.userNote || ''
      ].join(' ').toLowerCase();
      return haystack.includes(_archiveSearchQuery);
    });
  }

  // Filter hidden entries (visible toggle)
  const hiddenIds = new Set((state.entries || []).filter(e => e.hidden).map(e => e.date));

  if (filtered.length === 0) {
    container.innerHTML = `<div class="timeline-empty">
      <div class="icon">📅</div>
      ${_archiveSearchQuery ? '검색 결과 없음' : '아직 기록이 없어.<br>오늘 한 줄부터 천천히 ✦'}
    </div>`;
    return;
  }

  // V3.13.x: 인스타 게시물 스타일 카드. 헤더(날짜+칩) + 본문 + ⋮ 메뉴
  container.innerHTML = filtered.map(day => {
    const entry = day.checkin;
    const isHidden = entry?.hidden;
    const dateStr = formatDateKorean(day.date);

    // 헤더 칩들 — 체크인 정보를 작은 chip으로
    const chips = [];
    if (entry) {
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
    }

    // 본문 블록들
    const blocks = [];
    // V3.13.x + V4-fix v3 (사용자 요청): 일일질문 — 답 있을 때만 Q+A 표시. 답 X면 그냥 없앰.
    if (entry?.dailyQuestion?.text && (entry?.note || entry?.dailyQuestionAnswer)) {
      const ans = entry.dailyQuestionAnswer || entry.note || '';
      blocks.push(`<div class="ig-qa-set">
        <div class="ig-question">Q. ${escapeHtml(entry.dailyQuestion.text)}</div>
        <div class="ig-answer">${escapeHtml(ans)}</div>
      </div>`);
    }
    if (entry?.userEdit) {
      blocks.push(`<div class="ig-block ig-block-edit">📝 ${escapeHtml(entry.userEdit)}</div>`);
    }
    if (entry?.diary) {
      blocks.push(`<div class="ig-block ig-block-diary"><div class="ig-block-icon">📔</div><div class="ig-block-content">${escapeHtml(entry.diary)}</div></div>`);
    }
    if (entry?.aiSummary && !entry?.diary) {
      blocks.push(`<div class="ig-block ig-block-auto"><div class="ig-block-label">🤖 자동 요약</div><div class="ig-block-content">${escapeHtml(entry.aiSummary)}</div></div>`);
    }
    // 일일질문 없이 note만 있는 케이스 — 단독 메모로
    if (!entry?.dailyQuestion?.text && entry?.note) {
      blocks.push(`<div class="ig-block ig-block-note">${escapeHtml(entry.note)}</div>`);
    }
    // V3.13.x: 그 날 음악
    if (entry?.music) {
      blocks.push(`<div style="margin-top:8px;">${renderMusicCardHTML(entry.music)}</div>`);
    }
    // 깨달음 카드들 (headline + body 강조)
    if (day.archives.length > 0) {
      const archHtml = day.archives.map(a => {
        if (a.headline) {
          return `<div class="ig-insight"><div class="ig-insight-headline">✦ ${escapeHtml(a.headline)}</div><div class="ig-insight-body">${escapeHtml(a.body || '')}</div></div>`;
        }
        return `<div class="ig-insight"><div class="ig-insight-body">✦ ${escapeHtml(a.insight || '')}</div></div>`;
      }).join('');
      blocks.push(`<div class="ig-insights">${archHtml}</div>`);
    }
    if (blocks.length === 0) {
      blocks.push(`<div class="ig-empty">기록만 남긴 날이야.</div>`);
    }

    return `
      <article class="ig-card${isHidden ? ' hidden-entry' : ''}" data-date="${day.date}">
        <header class="ig-header">
          <div class="ig-header-left">
            <div class="ig-date">${dateStr}</div>
            ${chips.length ? `<div class="ig-chips">${chips.join('')}</div>` : ''}
          </div>
          <button class="ig-menu-btn" onclick="showTimelineDayMenu('${day.date}')" aria-label="메뉴">⋮</button>
        </header>
        <div class="ig-body">${blocks.join('')}</div>
      </article>
    `;
  }).join('');
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
