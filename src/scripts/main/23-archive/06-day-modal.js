function openDayModal(dateStr) {
  // 그날 데이터 모음
  const entry = (state.entries || []).find(e => e.date === dateStr);
  // 사용자 보고 2026-05-04 (VB018): day modal 도 strategy / 시드 제외 (캘린더 dot 카운트와 동기화).
  const _isTesterDM = !!(state.preferences && state.preferences.testerMode);
  const topics = (state.topicCards || []).filter(c => {
    if (!c) return false;
    if (c.category === 'strategy') return false;
    if (!_isTesterDM && c._seed) return false;
    return (c.chapterStartedAt && getDayKey(c.chapterStartedAt) === dateStr) ||
      (!c.chapterStartedAt && c.createdAt && getDayKey(c.createdAt) === dateStr);
  });
  const archives = (state.archive || []).filter(a =>
    a.savedAt && getDayKey(a.savedAt) === dateStr
  );
  // V4 (사용자 명시 2026-05-14 ultrathink): pearls 분기 — 일반 진주 / 티켓 / 책 따로.
  //   티켓/책 은 eventDate 기준 (사후 등록 가능), 일반 진주 는 createdAt 기준 (기존 동작).
  const _allPearls = (state.pearls || []).filter(p => p.type !== 'dna_pearl');
  const pearls = _allPearls.filter(p =>
    p.category !== '티켓' && p.category !== '책' &&
    p.createdAt && getDayKey(p.createdAt) === dateStr
  );
  const tickets = _allPearls.filter(p => {
    if (p.category !== '티켓') return false;
    const dk = p.eventDate || (p.createdAt ? getDayKey(p.createdAt) : null);
    return dk === dateStr;
  });
  const books = _allPearls.filter(p => {
    if (p.category !== '책') return false;
    const dk = p.eventDate || p.finishedAt || (p.createdAt ? getDayKey(p.createdAt) : null);
    return dk === dateStr;
  });

  const counts = {
    diary: (entry ? 1 : 0),
    topics: topics.length,
    archives: archives.length,
    pearls: pearls.length,
    tickets: tickets.length,
    books: books.length
  };
  const total = counts.diary + counts.topics + counts.archives + counts.pearls + counts.tickets + counts.books;
  if (total === 0) {
    showToast(`${dateStr} 기록 없음`);
    return;
  }

  // 활성 첫 탭: 데이터 있는 첫 카테고리
  const tabOrder = ['diary', 'topics', 'archives', 'pearls', 'tickets', 'books'];
  _dayModalActiveTab = tabOrder.find(t => counts[t] > 0) || 'diary';

  const dateLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
  });

  // 무드 색 그라디언트 (entry.mood 1-5 → 보라→금)
  const moodColorMap = {
    1: ['rgba(90,74,114,0.30)',  'rgba(90,74,114,0.10)'],
    2: ['rgba(122,106,146,0.28)', 'rgba(122,106,146,0.10)'],
    3: ['rgba(168,157,200,0.28)', 'rgba(139,126,196,0.10)'],
    4: ['rgba(199,178,136,0.28)', 'rgba(199,178,136,0.10)'],
    5: ['rgba(212,167,106,0.32)', 'rgba(212,167,106,0.12)']
  };
  const moodPair = entry?.mood ? moodColorMap[entry.mood] : moodColorMap[3];
  const moodLabel = entry?.mood
    ? `기분 ${entry.mood}/5${entry.vitality ? ` · 활력 ${entry.vitality}/5` : ''}`
    : (counts.topics + counts.archives + counts.pearls > 0 ? `${counts.topics + counts.archives + counts.pearls}개 기록` : '');

  const overlay = document.createElement('div');
  overlay.id = 'dayModal';
  overlay.className = 'day-modal-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) closeDayModal(); };
  // V4 (사용자 명시 2026-05-20 ultrathink): 일기 사진/음악 수정 ⋯ 더보기 버튼 — × 왼쪽.
  //   entry 가 있고 사진 / 음악 / 추가 가능 케이스 면 노출. 체크인 질문/활력/에너지/수면 은 분석 추출에 들어가서 수정 X.
  const _hasEntryMedia = !!(entry && (
    entry.music ||
    entry.photo ||
    (Array.isArray(entry.photos) && entry.photos.length > 0)
  ));
  const moreBtnHtml = _hasEntryMedia
    ? `<button class="day-modal-more" onclick="openDiaryMediaEditSheet('${dateStr}')" aria-label="수정">⋯</button>`
    : '';

  overlay.innerHTML = `
    <div class="day-modal" onclick="event.stopPropagation()" style="--day-mood-from:${moodPair[0]}; --day-mood-to:${moodPair[1]};">
      <div class="day-modal-header">
        <div class="day-modal-date-wrap">
          <div class="day-modal-date">${escapeHtml(dateLabel)}</div>
          ${moodLabel ? `<div class="day-modal-mood">${escapeHtml(moodLabel)}</div>` : ''}
        </div>
        <div style="display:flex; align-items:center;">
          ${moreBtnHtml}
          <button class="day-modal-close" onclick="closeDayModal()">×</button>
        </div>
      </div>
      <div class="day-modal-tabs">
        ${counts.diary    ? `<button class="day-tab" data-tab="diary"    onclick="switchDayModalTab('diary')"><span>📔</span> 일기</button>` : ''}
        ${counts.topics   ? `<button class="day-tab" data-tab="topics"   onclick="switchDayModalTab('topics')"><span>✦</span> 토픽 <b>${counts.topics}</b></button>` : ''}
        ${counts.archives ? `<button class="day-tab" data-tab="archives" onclick="switchDayModalTab('archives')"><span>✨</span> 깨달음 <b>${counts.archives}</b></button>` : ''}
        ${counts.pearls   ? `<button class="day-tab" data-tab="pearls"   onclick="switchDayModalTab('pearls')"><span>🔮</span> 진주 <b>${counts.pearls}</b></button>` : ''}
        ${counts.tickets  ? `<button class="day-tab" data-tab="tickets"  onclick="switchDayModalTab('tickets')"><span>🎫</span> 티켓 <b>${counts.tickets}</b></button>` : ''}
        ${counts.books    ? `<button class="day-tab" data-tab="books"    onclick="switchDayModalTab('books')"><span>📚</span> 책 <b>${counts.books}</b></button>` : ''}
      </div>
      <div class="day-modal-body" id="dayModalBody"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay._dayData = { entry, topics, archives, pearls, tickets, books, dateStr };
  switchDayModalTab(_dayModalActiveTab);
}

function switchDayModalTab(tab) {
  _dayModalActiveTab = tab;
  document.querySelectorAll('.day-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  const body = document.getElementById('dayModalBody');
  const overlay = document.getElementById('dayModal');
  if (!body || !overlay || !overlay._dayData) return;
  const { entry, topics, archives, pearls, tickets, books, dateStr } = overlay._dayData;

  let html = '';
  if (tab === 'diary' && entry) {
    // 활력/기분 막대
    const hasBars = (entry.vitality != null) || (entry.mood != null);
    if (hasBars) {
      html += `<div class="day-mood-bars">`;
      if (entry.vitality != null) {
        const w = Math.max(0, Math.min(100, (entry.vitality / 5) * 100));
        html += `<div class="day-bar-col"><div class="day-bar-label">활력</div><div class="day-bar-value">${entry.vitality}/5</div><div class="day-bar-track"><div class="day-bar-fill" style="width:${w}%;"></div></div></div>`;
      }
      if (entry.mood != null) {
        const w = Math.max(0, Math.min(100, (entry.mood / 5) * 100));
        html += `<div class="day-bar-col"><div class="day-bar-label">기분</div><div class="day-bar-value">${entry.mood}/5</div><div class="day-bar-track"><div class="day-bar-fill" style="width:${w}%;"></div></div></div>`;
      }
      if (entry.sleepStart && entry.sleepEnd) {
        html += `<div class="day-bar-col"><div class="day-bar-label">수면</div><div class="day-bar-value">${escapeHtml(entry.sleepStart)}–${escapeHtml(entry.sleepEnd)}</div></div>`;
      }
      html += `</div>`;
    }
    // 모드 칩
    if (entry.modes) {
      const modeMap = { exam:'📚 시험', travel:'✈️ 여행', sick:'🤒 아픔', rest:'🏖 휴식', period:'🩸 월경', drained:'🪫 방전' };
      const ms = Object.keys(entry.modes).filter(k => entry.modes[k]);
      if (ms.length) {
        html += `<div class="day-mode-chips">${ms.map(m => `<span class="day-mode-chip">${modeMap[m] || m}</span>`).join('')}</div>`;
      }
    }
    // V4-fix: 일기 사진 — multi (최대 3) (legacy entry.photo fallback).
    const _entryPhotos = (Array.isArray(entry.photos) && entry.photos.length > 0)
      ? entry.photos.slice(0, 3)
      : (entry.photo ? [entry.photo] : []);
    if (_entryPhotos.length > 0) {
      html += `<div class="day-photo-wrap${_entryPhotos.length > 1 ? ' day-photo-multi' : ''}">${_entryPhotos.map(p => `<img src="${escapeHtml(p)}" alt="" class="day-photo">`).join('')}</div>`;
    }
    // V4-fix: 음악 카드 (entry.music 있으면)
    if (entry.music && entry.music.title) {
      const m = entry.music;
      const playBtn = m.previewUrl
        ? `<button class="day-music-play" onclick="event.stopPropagation(); toggleMusicPreview(this, '${escapeHtml(m.previewUrl)}')" aria-label="미리듣기">▶</button>`
        : '';
      html += `
        <div class="day-music-card">
          <img src="${escapeHtml(m.artworkUrl || '')}" alt="" class="day-music-art">
          <div class="day-music-meta">
            <div class="day-music-title">${escapeHtml(m.title || '')}</div>
            <div class="day-music-artist">${escapeHtml(m.artist || '')}</div>
          </div>
          ${playBtn}
        </div>
      `;
    }
    // 일기 본문
    if (entry.diary)     html += `<div class="day-diary">${escapeHtml(entry.diary)}</div>`;
    if (entry.aiSummary) html += `<div class="day-summary">🤖 ${escapeHtml(entry.aiSummary)}</div>`;
    // V4-fix: dailyQuestion 있으면 entry.note는 답변이라 Q+A 세트 박스에만. 없을 때만 별도 표시.
    if (entry.note && !entry.dailyQuestion?.text) {
      html += `<div class="day-summary" style="border-color:var(--accent2); background:rgba(212,167,106,0.08);">${escapeHtml(entry.note)}</div>`;
    }
    if (entry.dailyQuestion?.text) {
      // V4-fix v3 (사용자 요청): 답 없으면 질문 자체 표시 X
      const ans = entry.dailyQuestionAnswer || entry.note || '';
      if (ans) {
        html += `<div class="day-qa-set">
          <div class="day-q">Q. ${escapeHtml(entry.dailyQuestion.text)}</div>
          <div class="day-a">${escapeHtml(ans)}</div>
        </div>`;
      }
    }
  } else if (tab === 'topics') {
    // 사용자 보고 2026-04-29: 일기·대화 칩이 step 25에서 말한 8 카테고리(일기/일상/고민/감정/기억/할 일/아이디어/관계)로 분류돼 보이게
    topics.forEach(c => {
      const catInfo = TOPIC_CATEGORY_LABELS[c.category] || { label: '토픽', icon: '✦' };
      // 사용자 명시 2026-05-10 (큐 6 마무리): 시뮬 → 대화 이어가기 시 추출된 topicCard = source: 'simulation' 마킹.
      //   '시나리오' 라벨로 일반 토픽과 시각 구분.
      const _isSim = c.source === 'simulation';
      const _simTag = _isSim ? `<span style="font-size:9px; padding:2px 6px; background:rgba(212,167,106,0.18); color:var(--accent); border-radius:6px; margin-left:6px; letter-spacing:0.04em;">💭 시나리오</span>` : '';
      html += `
        <div class="day-card t-topic${_isSim ? ' t-topic-sim' : ''}" onclick="closeDayModal(); openTopicCard('${c.id}')">
          <div class="day-card-icon-row"><span class="icon">${catInfo.icon}</span><span>${escapeHtml(catInfo.label)}</span>${_simTag}</div>
          <div class="day-card-title">${escapeHtml(c.title || '')}</div>
          ${c.summary ? `<div class="day-card-body">${escapeHtml(c.summary)}</div>` : ''}
        </div>
      `;
    });
  } else if (tab === 'archives') {
    archives.forEach(a => {
      const t = a.type || 'scrap';
      const badge = t === 'memo' ? '✎' : t === 'reflection' ? '🌊' : '📌';
      const headline = a.headline || '';
      const body = a.userMemo || a.body || a.insight || '';
      html += `
        <div class="day-card t-archive">
          <div class="day-card-icon-row"><span class="icon">${badge}</span><span>${escapeHtml(a.source || t)}</span></div>
          ${headline ? `<div class="day-card-title">${escapeHtml(headline)}</div>` : ''}
          ${body ? `<div class="day-card-body">${escapeHtml(body)}</div>` : ''}
          ${Array.isArray(a.tags) && a.tags.length ? `<div class="day-tags">${a.tags.map(tg => `<span>#${escapeHtml(tg)}</span>`).join('')}</div>` : ''}
        </div>
      `;
    });
  } else if (tab === 'pearls') {
    pearls.forEach(p => {
      const iconMap = { 음악: '🎵', 음식: '🍴', 장소: '📍', 순간: '✨', 사람: '👥' };
      const icon = iconMap[p.category] || '💎';
      // 음악 진주 — 큰 앨범 art
      if (p.category === '음악' && p.track && p.track.artworkUrl) {
        html += `
          <div class="day-card t-pearl t-pearl-music" onclick="closeDayModal(); openPearl('${p.id}')">
            <img src="${escapeHtml(p.track.artworkUrl)}" alt="" class="day-pearl-art">
            <div class="day-pearl-music-meta">
              <div class="day-pearl-music-title">${escapeHtml(p.track.title || p.content || '')}</div>
              <div class="day-pearl-music-artist">${escapeHtml(p.track.artist || '')}</div>
              ${p.note ? `<div class="day-card-note" style="margin-top:6px; padding-top:6px;">${escapeHtml(p.note)}</div>` : ''}
            </div>
          </div>
        `;
      } else if (pearlHasMedia(p, 'video')) {
        // V4 (사용자 명시): 동영상 진주 — 썸네일만 (사진 패턴 동일). 클릭 시 모달에서 재생.
        // V4 (사용자 명시 2026-05-18 ultrathink): Phase 1D — pearlImgHtml 이 옛 dataURL / 신 storageKey 자동 분기.
        const thumbImg = pearlImgHtml(p, 'videoThumbnail', { cls: 'day-pearl-art', alt: '' });
        const visual = thumbImg
          ? thumbImg
          : `<div class="day-pearl-art video-thumb-placeholder">📹</div>`;
        // 사용자 명시 2026-05-04: 영상 진주 제목 = bare content (이모티콘 prefix 제거).
        // 사용자 보고 2026-05-10: 카테고리 이모지 prefix 누락 — 사진 진주 패턴 통일.
        const _vTitle = (typeof _stripLeadingEmoji === 'function') ? _stripLeadingEmoji(p.content || '') : (p.content || '');
        html += `
          <div class="day-card t-pearl t-pearl-music" onclick="closeDayModal(); openPearl('${p.id}')">
            ${visual}
            <div class="day-pearl-music-meta">
              <div class="day-pearl-music-title">${icon} ${escapeHtml(_vTitle)}</div>
              <div class="day-pearl-music-artist">${escapeHtml(p.category || '진주')}</div>
              ${p.note ? `<div class="day-card-note" style="margin-top:6px; padding-top:6px;">${escapeHtml(p.note)}</div>` : ''}
            </div>
          </div>
        `;
      } else if (pearlHasMedia(p, 'photo')) {
        // V4-fix: 사진 진주 (음악 풍 layout)
        // V4 (사용자 명시 2026-05-18 ultrathink): Phase 1D — pearlImgHtml 이 옛 dataURL / 신 storageKey 자동 분기.
        html += `
          <div class="day-card t-pearl t-pearl-music" onclick="closeDayModal(); openPearl('${p.id}')">
            ${pearlImgHtml(p, 'photo', { cls: 'day-pearl-art', alt: '' })}
            <div class="day-pearl-music-meta">
              <div class="day-pearl-music-title">${icon} ${escapeHtml(p.content || '')}</div>
              <div class="day-pearl-music-artist">${escapeHtml(p.category || '진주')}</div>
              ${p.note ? `<div class="day-card-note" style="margin-top:6px; padding-top:6px;">${escapeHtml(p.note)}</div>` : ''}
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="day-card t-pearl t-pearl-text" onclick="closeDayModal(); openPearl('${p.id}')">
            <div class="day-pearl-emoji-big">${icon}</div>
            <div class="day-card-body" style="font-size:13px; color:var(--text);">${escapeHtml(p.content || '')}</div>
            ${p.note ? `<div class="day-card-note">${escapeHtml(p.note)}</div>` : ''}
          </div>
        `;
      }
    });
  }
  // V4 (사용자 명시 2026-05-14 ultrathink): 'tickets' / 'books' 서브탭 본문.
  if (tab === 'tickets' && Array.isArray(tickets)) {
    tickets.forEach(p => {
      if (typeof _renderTicketCardHTML === 'function') {
        html += `<div class="day-card t-pearl day-ticket-wrap">${_renderTicketCardHTML(p, {})}</div>`;
      }
    });
  } else if (tab === 'books' && Array.isArray(books)) {
    books.forEach(p => {
      if (typeof _renderBookCardHTML === 'function') {
        html += `<div class="day-card t-pearl day-book-wrap">${_renderBookCardHTML(p, {})}</div>`;
      }
    });
  }

  if (!html) {
    const emptyMap = {
      diary:    { emoji: '📔', label: '일기' },
      topics:   { emoji: '✦', label: '토픽' },
      archives: { emoji: '✨', label: '깨달음' },
      pearls:   { emoji: '🔮', label: '진주' },
      tickets:  { emoji: '🎫', label: '티켓' },
      books:    { emoji: '📚', label: '책' }
    };
    const e = emptyMap[tab] || { emoji: '🔮', label: '기록' };
    html = `<div class="day-empty"><span class="day-empty-icon">${e.emoji}</span>이 날 ${e.label} 기록 없음.</div>`;
  }
  body.innerHTML = html;
  if (typeof hydratePearlVideos === 'function') hydratePearlVideos();
}

