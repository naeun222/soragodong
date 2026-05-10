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
  const pearls = (state.pearls || []).filter(p =>
    p.type !== 'dna_pearl' && p.createdAt && getDayKey(p.createdAt) === dateStr
  );

  const counts = {
    diary: (entry ? 1 : 0),
    topics: topics.length,
    archives: archives.length,
    pearls: pearls.length
  };
  const total = counts.diary + counts.topics + counts.archives + counts.pearls;
  if (total === 0) {
    showToast(`${dateStr} 기록 없음`);
    return;
  }

  // 활성 첫 탭: 데이터 있는 첫 카테고리
  const tabOrder = ['diary', 'topics', 'archives', 'pearls'];
  _dayModalActiveTab = tabOrder.find(t => counts[t === 'diary' ? 'diary' : t === 'topics' ? 'topics' : t === 'archives' ? 'archives' : 'pearls'] > 0) || 'diary';

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
  overlay.innerHTML = `
    <div class="day-modal" onclick="event.stopPropagation()" style="--day-mood-from:${moodPair[0]}; --day-mood-to:${moodPair[1]};">
      <div class="day-modal-header">
        <div class="day-modal-date-wrap">
          <div class="day-modal-date">${escapeHtml(dateLabel)}</div>
          ${moodLabel ? `<div class="day-modal-mood">${escapeHtml(moodLabel)}</div>` : ''}
        </div>
        <button class="day-modal-close" onclick="closeDayModal()">×</button>
      </div>
      <div class="day-modal-tabs">
        ${counts.diary    ? `<button class="day-tab" data-tab="diary"    onclick="switchDayModalTab('diary')"><span>📔</span> 일기</button>` : ''}
        ${counts.topics   ? `<button class="day-tab" data-tab="topics"   onclick="switchDayModalTab('topics')"><span>✦</span> 토픽 <b>${counts.topics}</b></button>` : ''}
        ${counts.archives ? `<button class="day-tab" data-tab="archives" onclick="switchDayModalTab('archives')"><span>✨</span> 깨달음 <b>${counts.archives}</b></button>` : ''}
        ${counts.pearls   ? `<button class="day-tab" data-tab="pearls"   onclick="switchDayModalTab('pearls')"><span>🔮</span> 진주 <b>${counts.pearls}</b></button>` : ''}
      </div>
      <div class="day-modal-body" id="dayModalBody"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay._dayData = { entry, topics, archives, pearls, dateStr };
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
  const { entry, topics, archives, pearls, dateStr } = overlay._dayData;

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
    // V4-fix: 일기 사진 (음악 카드 풍 — 큰 사진)
    if (entry.photo) {
      html += `<div class="day-photo-wrap"><img src="${entry.photo}" alt="" class="day-photo"></div>`;
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
      html += `
        <div class="day-card t-topic" onclick="closeDayModal(); openTopicCard('${c.id}')">
          <div class="day-card-icon-row"><span class="icon">${catInfo.icon}</span><span>${escapeHtml(catInfo.label)}</span></div>
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
      } else if (p.video) {
        // V4 (사용자 명시): 동영상 진주 — 썸네일만 (사진 패턴 동일). 클릭 시 모달에서 재생.
        const thumb = p.videoThumbnail;
        const visual = thumb
          ? `<img src="${thumb}" alt="" class="day-pearl-art">`
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
      } else if (p.photo) {
        // V4-fix: 사진 진주 (음악 풍 layout)
        html += `
          <div class="day-card t-pearl t-pearl-music" onclick="closeDayModal(); openPearl('${p.id}')">
            <img src="${p.photo}" alt="" class="day-pearl-art">
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
  if (!html) {
    const emptyEmoji = tab === 'diary' ? '📔' : tab === 'topics' ? '✦' : tab === 'archives' ? '✨' : '🔮';
    const emptyLabel = tab === 'diary' ? '일기' : tab === 'topics' ? '토픽' : tab === 'archives' ? '깨달음' : '진주';
    html = `<div class="day-empty"><span class="day-empty-icon">${emptyEmoji}</span>이 날 ${emptyLabel} 기록 없음.</div>`;
  }
  body.innerHTML = html;
  if (typeof hydratePearlVideos === 'function') hydratePearlVideos();
}

