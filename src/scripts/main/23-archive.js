// ═══════════════════════════════════════════════════════════════
// ARCHIVE
// ═══════════════════════════════════════════════════════════════
// === Decision Suggestion Handlers (V3.1) ===
function acceptDecisionSuggestion(idx) {
  const msg = state.chatMessages[idx];
  if (!msg || !msg.decisionSuggested) return;
  
  const ds = msg.decisionSuggested;
  const decision = {
    id: 'dec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    title: ds.title,
    startedAt: new Date().toISOString(),
    status: 'in_progress',
    steps: DECISION_STEPS.map(s => ({ id: s.id, completed: false, content: '' })),
    finalDecision: null,
    predictions: null,
    sourceMessageIdx: idx
  };
  state.decisions.push(decision);
  msg.decisionResponse = 'accept';
  saveState();
  renderChat();
  showToast('마법의 소라고동으로 보냈어 🐚');
  setTimeout(() => openDecision(decision.id), 600);
}

function declineDecisionSuggestion(idx) {
  const msg = state.chatMessages[idx];
  if (!msg || !msg.decisionSuggested) return;
  msg.decisionResponse = 'decline';
  saveState();
  renderChat();
}

// V3.6: Vault proposal — 대화에서 추출한 할 일을 서랍장에 넣을지 확인
function acceptVaultProposal(msgIdx, proposalId) {
  const msg = state.chatMessages[msgIdx];
  if (!msg || !Array.isArray(msg.vaultProposals)) return;
  const p = msg.vaultProposals.find(x => x.proposalId === proposalId);
  if (!p || p.responded) return;
  // 한 번 더 vault에 동일 항목 있는지 fuzzy 체크
  const existsInVault = (state.memoryVault || []).slice(-30).find(v => 
    v.content && similarText(v.content, p.content)
  );
  if (!existsInVault) {
    state.memoryVault.push({
      id: 'mv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      content: p.content,
      source: 'chat',
      extractedAt: new Date().toISOString(),
      sourceMessageIdx: msgIdx,
      processed: false,
      priority: nextPriority()
    });
  }
  p.responded = true;
  p.accepted = true;
  saveState();
  renderChat();
}

function declineVaultProposal(msgIdx, proposalId) {
  const msg = state.chatMessages[msgIdx];
  if (!msg || !Array.isArray(msg.vaultProposals)) return;
  const p = msg.vaultProposals.find(x => x.proposalId === proposalId);
  if (!p || p.responded) return;
  p.responded = true;
  p.accepted = false;
  saveState();
  renderChat();
  // V3.7: undo 토스트 — "괜찮아" 잘못 눌렀을 수 있음
  showUndoToast('서랍장에 안 넣음', () => {
    p.responded = false;
    p.accepted = null;
    saveState();
    renderChat();
  });
}

// ═══════════════════════════════════════════════════════════════
// V4-1l-a LIBRARY — 5 카테고리 (📔 일기·대화 / 🧬 양생방 / ✨ 깨달음 / 🔮 진주 / 🌀 마법·리뷰)
// V3 lens-tabs (conversations/wisdom)에서 5 카테고리 칩으로 확장.
// ═══════════════════════════════════════════════════════════════

const _LIB_CAT_TO_VIEW = {
  diary:     'libDiary',
  yangsaeng: 'libYangsaeng',
  insights:  'libInsights',
  pearls:    'libPearls',
  galpi:     'libGalpi'
};

let _currentLens = 'diary';
let _archiveSearchQuery = '';
let _libView = 'grid';  // V4-1p: 그리드 ↔ 타임라인 토글
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
  if (typeof renderLibraryHero === 'function') renderLibraryHero();
  if (typeof updateLibraryCatNewDots === 'function') updateLibraryCatNewDots();
  if (typeof updateLibraryTabNewDot === 'function') updateLibraryTabNewDot();
  if (typeof hydratePearlVideos === 'function') hydratePearlVideos();
  updateArchiveQuickCounts();
  // V4-fix #6: 일기·대화 grid 뷰 = 캘린더만 (lensTopicCards / lensTimeline 숨김). 매 호출 일관 적용.
  if (typeof _applyDiaryGridHide === 'function') _applyDiaryGridHide();
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
}

// V4-1t: 🌟 오늘의 너 — 진주 1개 회전 (안 본 진주 우선)
function renderLibraryHero() {
  const container = document.getElementById('libraryHero');
  if (!container) return;
  const pearls = (state.pearls || []).filter(p => p.type !== 'dna_pearl');
  if (pearls.length === 0) {
    container.innerHTML = '';
    return;
  }
  // 사용자 요청 2026-04-28: 튜토리얼/테스터 모드는 LONGSHOT - Vanilla Days 음악 고정 (재생 가능 보장 — iTunes 검색 실패 케이스 대비 하드코딩 fallback)
  const isAutoFix = !!(window._onbTutorialMode || (state.preferences && state.preferences.testerMode));
  let seedMusicPin = null;
  if (isAutoFix) {
    const seedPearl = pearls.find(p => p.id === 'pearl_seed_0');
    if (seedPearl && seedPearl.track && seedPearl.track.previewUrl) {
      seedMusicPin = seedPearl;
    } else {
      // iTunes 검색 실패 / 시드 안 적용됨 — 임시 fixed pearl 객체 (state에 push X, 렌더에만)
      seedMusicPin = {
        id: 'pearl_pinned_lngshot_vanilla',
        category: '음악',
        content: 'LNGSHOT - Vanilla Days',
        note: '새벽 카페에서 발견. 이 곡 들으면 그 시간으로 돌아감.',
        createdAt: new Date().toISOString(),
        track: {
          id: 'pinned_lngshot_vanilla',
          title: 'Vanilla Days',
          artist: 'LNGSHOT',
          artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/cf/a8/de/cfa8dee7-da1a-eb20-6074-741a4af1a1f6/cover_KM0024394_1.jpg/200x200bb.jpg',
          previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/30/c2/9f/30c29f0b-bed7-d993-6909-0392418d4dcc/mzaf_15564917017364106254.plus.aac.p.m4a',
          trackUrl: 'https://music.apple.com/us/album/vanilla-days/1885487042?i=1885487047'
        }
      };
    }
  }
  // 안 본 우선: state.preferences._libHeroSeen[]
  if (!state.preferences) state.preferences = {};
  if (!Array.isArray(state.preferences._libHeroSeen)) state.preferences._libHeroSeen = [];
  let seen = state.preferences._libHeroSeen;
  // 모든 진주 다 봤으면 reset
  const unseen = pearls.filter(p => !seen.includes(p.id));
  const pool = unseen.length > 0 ? unseen : pearls;
  // 가장 오래된 unseen 또는 random — 시드 음악 고정 시 우선
  const pick = seedMusicPin || pool[Math.floor(Math.random() * pool.length)];
  if (!seen.includes(pick.id)) {
    seen.push(pick.id);
    if (seen.length > pearls.length) seen = seen.slice(-pearls.length);
    state.preferences._libHeroSeen = seen;
    saveState();
  }

  const dateStr = pick.createdAt
    ? new Date(pick.createdAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
    : '';

  let body;
  if (pick.category === '음악' && pick.track) {
    const playBtn = pick.track.previewUrl
      ? `<button class="hero-music-play" onclick="event.stopPropagation(); toggleMusicPreview(this, '${escapeHtml(pick.track.previewUrl)}')" aria-label="미리듣기">▶</button>`
      : '';
    // V4-fix: 음악 placeholder
    const heroArt = pick.track.artworkUrl
      ? `<img src="${escapeHtml(pick.track.artworkUrl)}" alt="" class="hero-music-art" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'hero-music-art hero-music-art-placeholder',textContent:'🎵'}))">`
      : `<div class="hero-music-art hero-music-art-placeholder">${_MUSIC_WAVE_SVG}</div>`;
    body = `
      <div class="hero-music">
        ${heroArt}
        <div class="hero-music-meta">
          <div class="hero-music-title">${escapeHtml(pick.track.title || '')}</div>
          <div class="hero-music-artist">${escapeHtml(pick.track.artist || '')}</div>
          ${pick.note ? `<div class="hero-note">${escapeHtml(pick.note)}</div>` : ''}
        </div>
        ${playBtn}
      </div>
    `;
  } else if (pick.video) {
    // V4 (사용자 명시): 동영상 진주 — 썸네일만 (사진과 동일 layout). 클릭 시 모달에서 재생.
    const iconMap = { 음식: '🍴', 장소: '📍', 순간: '✨', 사람: '👥', 기타: '💎' };
    const icon = iconMap[pick.category || '기타'] || '💎';
    const thumb = pick.videoThumbnail;
    const visual = thumb
      ? `<img src="${thumb}" alt="" class="hero-photo-thumb">`
      : `<div class="hero-photo-thumb video-thumb-placeholder">📹</div>`;
    // 사용자 명시 2026-05-04: 영상 진주 제목 = bare content (이모티콘 prefix 제거)
    const _vTitle = (typeof _stripLeadingEmoji === 'function') ? _stripLeadingEmoji(pick.content || '') : (pick.content || '');
    body = `
      <div class="hero-photo">
        ${visual}
        <div class="hero-photo-meta">
          <div class="hero-photo-content">${escapeHtml(_vTitle)}</div>
          ${pick.note ? `<div class="hero-note">${escapeHtml(pick.note)}</div>` : ''}
        </div>
      </div>
    `;
  } else if (pick.photo) {
    // V4-fix: 사진 진주 — 정방형 작은 thumbnail (hero 카드 세로 길이 안 늘림)
    const iconMap = { 음식: '🍴', 장소: '📍', 순간: '✨', 사람: '👥', 기타: '💎' };
    const icon = iconMap[pick.category || '기타'] || '💎';
    body = `
      <div class="hero-photo">
        <img src="${pick.photo}" alt="" class="hero-photo-thumb">
        <div class="hero-photo-meta">
          <div class="hero-photo-content">${icon} ${escapeHtml(pick.content || '')}</div>
          ${pick.note ? `<div class="hero-note">${escapeHtml(pick.note)}</div>` : ''}
        </div>
      </div>
    `;
  } else {
    const iconMap = { 음악: '🎵', 음식: '🍴', 장소: '📍', 순간: '✨', 사람: '👥', 기타: '💎' };
    const icon = iconMap[pick.category || '기타'] || '💎';
    body = `
      <div class="hero-text">
        <div class="hero-icon">${icon}</div>
        <div class="hero-text-col">
          <div class="hero-content">${escapeHtml(pick.content || '')}</div>
          ${pick.note ? `<div class="hero-note">${escapeHtml(pick.note)}</div>` : ''}
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="library-hero" onclick="openPearl('${pick.id}')">
      <div class="hero-label">🌟 오늘의 너</div>
      ${body}
      <div class="hero-meta">${escapeHtml(pick.category || '')}${dateStr ? ` · ${dateStr}` : ''}</div>
    </div>
  `;
}

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
function _libCategoryNewSince(cat, since) {
  if (cat === 'diary')
    return (state.entries || []).some(e => e.timestamp && new Date(e.timestamp).getTime() > since)
        || (state.chatMessages || []).some(m => m.timestamp && new Date(m.timestamp).getTime() > since);
  if (cat === 'yangsaeng')
    return (state.topicCards || []).some(c => c.category === 'strategy' && c.createdAt && new Date(c.createdAt).getTime() > since);
  if (cat === 'insights')
    return (state.archive || []).some(a => a.savedAt && new Date(a.savedAt).getTime() > since);
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
    const has = since > 0 && (
      _libCategoryNewSince('diary', since) ||
      _libCategoryNewSince('yangsaeng', since) ||
      _libCategoryNewSince('insights', since) ||
      _libCategoryNewSince('pearls', since) ||
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

// V4-1s: 📔 일기·대화 캘린더 무드 그리드 (월 단위)
let _calMonthOffset = 0;  // 0 = 이번 달, -1 = 지난 달

function shiftCalMonth(delta) {
  _calMonthOffset += delta;
  renderLensCalendarGrid();
  // 사용자 보고 2026-05-04 (VB029): 월 전환 시 캘린더 보이게 자동 스크롤 + 슬라이드 시각 피드백 (5월로 넘어가도 4월 캘린더 안 보이던 버그).
  try {
    const _wrap = document.querySelector('#lensCalendarGrid .cal-grid-wrap');
    if (_wrap) {
      _wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      _wrap.classList.remove('cal-month-slide-prev', 'cal-month-slide-next');
      _wrap.classList.add(delta < 0 ? 'cal-month-slide-prev' : 'cal-month-slide-next');
      setTimeout(() => { try { _wrap.classList.remove('cal-month-slide-prev', 'cal-month-slide-next'); } catch {} }, 360);
    }
  } catch (e) { console.warn('[shiftCalMonth scroll]:', e); }
}

function jumpToTimelineDate(dateStr) {
  // V4-fix #6: grid 뷰에서는 모달, timeline 뷰에서는 scrollIntoView
  if (_libView === 'grid') {
    openDayModal(dateStr);
    return;
  }
  const timeline = document.getElementById('lensTimeline');
  if (!timeline) return;
  const card = timeline.querySelector(`[data-date="${dateStr}"]`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card.classList.add('ig-card-flash');
    setTimeout(() => card.classList.remove('ig-card-flash'), 1200);
  } else {
    showToast(`${dateStr} 기록 없음`);
  }
}

// V4-fix #6: 그날 모달 (캘린더 칸 클릭 → 일기/토픽/깨달음/진주 서브칩)
let _dayModalActiveTab = 'diary';

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
        // 사용자 명시 2026-05-04: 영상 진주 제목 = bare content (이모티콘 prefix 제거)
        const _vTitle = (typeof _stripLeadingEmoji === 'function') ? _stripLeadingEmoji(p.content || '') : (p.content || '');
        html += `
          <div class="day-card t-pearl t-pearl-music" onclick="closeDayModal(); openPearl('${p.id}')">
            ${visual}
            <div class="day-pearl-music-meta">
              <div class="day-pearl-music-title">${escapeHtml(_vTitle)}</div>
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
    const isToday = dateKey === todayKey();
    // V4-fix: 오늘은 클릭 가능 — dateKey 문자열 비교 (YYYY-MM-DD)
    const isFuture = dateKey > todayKey();
    const empty = !entry && !hasChapter;
    html += `
      <div class="cal-day${isToday ? ' today' : ''}${empty ? ' empty' : ''}${isFuture ? ' future' : ''}"
           data-date="${dateKey}"
           style="background:${bg};"
           onclick="${isFuture ? '' : `jumpToTimelineDate('${dateKey}')`}"
           title="${dateKey}${mood ? ` · 기분 ${mood}/5` : ''}">
        <span class="cal-day-num">${d}</span>
        ${hasChapter ? `<span class="cal-chapter-dot"></span>` : ''}
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
  // V4: 카테고리 전환 후 잠금 시각 갱신 (마법의 소라고동 등)
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

function renderLensTopicCards() {
  const container = document.getElementById('lensTopicCards');
  if (!container) return;
  
  const all = state.topicCards || [];
  // Strategy는 wisdom 렌즈에서 따로 표시. 여기선 strategy 제외.
  let cards = all.filter(c => c.category !== 'strategy');
  
  // 검색 필터
  if (_archiveSearchQuery) {
    cards = cards.filter(c => 
      (c.title || '').toLowerCase().includes(_archiveSearchQuery) ||
      (c.summary || '').toLowerCase().includes(_archiveSearchQuery)
    );
  }
  
  // 최신순
  cards = cards.slice().sort((a, b) => 
    new Date(b.chapterStartedAt || b.createdAt) - new Date(a.chapterStartedAt || a.createdAt)
  );
  
  if (cards.length === 0) {
    container.innerHTML = '';  // 빈 상태는 timeline empty가 처리
    return;
  }
  
  // 최대 15개만 (오래된 건 검색으로)
  const display = cards.slice(0, 15);
  
  let html = `
    <div class="topic-cards-section">
      <div class="topic-cards-header">
        <div class="topic-cards-title">🐚 대화에서 정리됨</div>
        <div class="topic-cards-count">${cards.length}개</div>
      </div>
  `;
  display.forEach(c => {
    const startedAt = c.chapterStartedAt || c.createdAt;
    const dateStr = new Date(startedAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
    // V3.13.x: 그 날 체크인 신호 칩 (4시 cutoff 적용)
    const dKey = startedAt ? getDayKey(startedAt) : null;
    const dEntry = dKey ? (state.entries || []).find(e => e.date === dKey) : null;
    let metaExtra = '';
    if (dEntry) {
      const bits = [];
      if (dEntry.vitality != null) bits.push(`⚡${dEntry.vitality}`);
      if (dEntry.mood != null) bits.push(`💭${dEntry.mood}`);
      if (dEntry.modes) {
        const ms = Object.keys(dEntry.modes).filter(k => dEntry.modes[k]);
        if (ms.length) bits.push(ms[0]);
      }
      if (bits.length) metaExtra = ` · ${bits.join(' ')}`;
    }
    // 사용자 보고 2026-05-01: 모음 list 에서 '✦ 토픽' 단일 라벨 → 카테고리별 (📔 일기 / 💭 고민 / 📋 할 일 등) 표시.
    const catInfo = TOPIC_CATEGORY_LABELS[c.category] || { label: '토픽', icon: '✦' };
    const catClass = c.category ? `cat-${c.category}` : '';
    html += `
      <div class="topic-card ${catClass}" onclick="openTopicCard('${c.id}')">
        <div class="topic-card-row1">
          <span class="topic-card-cat">${catInfo.icon} ${escapeHtml(catInfo.label)}</span>
          <span class="topic-card-title">${escapeHtml(c.title)}</span>
        </div>
        <div class="topic-card-summary">${escapeHtml(c.summary)}</div>
        <div class="topic-card-meta">${dateStr} · ${c.messageCount || 0}개 메시지${metaExtra}</div>
      </div>
    `;
  });
  if (cards.length > 15) {
    html += `<div style="font-size:11px; color:var(--text-soft); text-align:center; padding:8px;">+ ${cards.length - 15}개 더 (검색으로 찾기)</div>`;
  }
  html += `</div>`;
  container.innerHTML = html;
}

function openTopicCard(id) {
  const card = (state.topicCards || []).find(c => c.id === id);
  if (!card) return;
  const catInfo = TOPIC_CATEGORY_LABELS[card.category] || { label: '기타', icon: '·' };
  const startedAtISO = card.chapterStartedAt || card.createdAt;
  const dateStr = new Date(startedAtISO).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });

  // V3.13.x: 그 날 체크인 정보 박스 (4시 cutoff 적용)
  let dayInfoHtml = '';
  const dayKey = startedAtISO ? getDayKey(startedAtISO) : null;
  const dayEntry = dayKey ? (state.entries || []).find(e => e.date === dayKey) : null;
  if (dayEntry) {
    const bits = [];
    if (dayEntry.modes) {
      const ms = Object.keys(dayEntry.modes).filter(k => dayEntry.modes[k]);
      if (ms.length) bits.push(`모드: ${ms.join(', ')}`);
    }
    if (dayEntry.vitality != null) bits.push(`활력 ${dayEntry.vitality}/5`);
    if (dayEntry.mood != null) bits.push(`기분 ${dayEntry.mood}/5`);
    if (dayEntry.sleepStart && dayEntry.sleepEnd) bits.push(`수면 ${dayEntry.sleepStart}~${dayEntry.sleepEnd}`);
    const hasAnything = bits.length || dayEntry.diary || dayEntry.aiSummary;
    if (hasAnything) {
      const diaryBlock = dayEntry.diary
        ? `<div style="margin-top:6px; padding-top:6px; border-top: 1px solid var(--border); white-space:pre-wrap; color:var(--text);">📔 ${escapeHtml(dayEntry.diary)}</div>`
        : (dayEntry.aiSummary ? `<div style="margin-top:6px; padding-top:6px; border-top: 1px solid var(--border); color:var(--text);">🤖 ${escapeHtml(dayEntry.aiSummary)}</div>` : '');
      dayInfoHtml = `<div style="margin-top:10px; padding:10px 12px; background:var(--surface2); border-radius:10px; font-size:12px; color:var(--text-dim); line-height:1.6;"><div style="font-size:10px; opacity:0.7; letter-spacing:0.5px; margin-bottom:4px;">📅 그 날 체크인</div>${bits.join(' · ') || '<span style="opacity:0.6;">체크인 정보 없음</span>'}${diaryBlock}</div>`;
    }
  }
  
  // 액션 버튼 — 카테고리에 따라
  const actions = [];
  if (card.category === 'decision') {
    actions.push(`<button class="topic-modal-btn primary" onclick="topicToDecision('${id}'); closeTopicModal()"><img src="/godong.webp" alt="" class="godong-icon" decoding="async"> 마법의 소라고동으로</button>`);
  }
  if (card.category === 'task') {
    actions.push(`<button class="topic-modal-btn primary" onclick="topicToVault('${id}'); closeTopicModal()">📥 서랍장에</button>`);
  }
  if (card.category === 'memory' || card.category === 'idea') {
    actions.push(`<button class="topic-modal-btn primary" onclick="topicToPearl('${id}'); closeTopicModal()">💎 진주로 보관</button>`);
  }
  if (card.category !== 'strategy') {
    actions.push(`<button class="topic-modal-btn" onclick="topicToStrategy('${id}'); closeTopicModal()">🧬 전략 카드로</button>`);
  }
  actions.push(`<button class="topic-modal-btn danger" onclick="closeTopicModal(); deleteTopicCard('${id}')">🗑 삭제</button>`);
  
  const modal = document.createElement('div');
  modal.id = 'topicModal';
  modal.className = 'topic-modal-overlay';
  modal.innerHTML = `
    <div class="topic-modal" onclick="event.stopPropagation()">
      <div class="topic-modal-header">
        <span class="topic-card-cat" style="${getTopicCatStyle(card.category)}">${catInfo.icon} ${catInfo.label}</span>
        <button class="topic-modal-close" onclick="closeTopicModal()">×</button>
      </div>
      <div class="topic-modal-title">${escapeHtml(card.title)}</div>
      <div class="topic-modal-summary">${escapeHtml(card.summary)}</div>
      ${dayInfoHtml}
      <div class="topic-modal-meta">${dateStr} · ${card.messageCount || 0}개 메시지</div>
      <div class="topic-modal-actions">
        ${actions.join('')}
      </div>
    </div>
  `;
  modal.onclick = closeTopicModal;
  document.body.appendChild(modal);
  setTimeout(() => modal.classList.add('show'), 30);
}

function closeTopicModal() {
  const modal = document.getElementById('topicModal');
  if (!modal) return;
  modal.classList.remove('show');
  setTimeout(() => modal.remove(), 200);
}

function getTopicCatStyle(category) {
  const colors = {
    decision: 'background: rgba(179,157,219,0.18); color: #c4afe5;',
    task: 'background: rgba(201,169,110,0.18); color: var(--accent2);',
    emotional: 'background: rgba(232,163,163,0.16); color: #f0c0c0;',
    memory: 'background: rgba(136,192,208,0.16); color: #a3d3df;',
    idea: 'background: rgba(255,209,102,0.18); color: #ffe199;',
    strategy: 'background: rgba(143,200,143,0.16); color: #a8d6a8;'
  };
  return colors[category] || '';
}

function topicToDecision(id) {
  const card = (state.topicCards || []).find(c => c.id === id);
  if (!card) return;
  const decision = {
    id: 'dec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    title: card.title,
    startedAt: new Date().toISOString(),
    status: 'in_progress',
    steps: DECISION_STEPS.map(s => ({ id: s.id, completed: false, content: '' })),
    finalDecision: null,
    predictions: null,
    sourceTopicCardId: id
  };
  state.decisions.push(decision);
  saveState();
  renderArchive();
  showToast('마법의 소라고동으로 보냈어 🐚');
  setTimeout(() => openDecision(decision.id), 600);
}

function topicToVault(id) {
  const card = (state.topicCards || []).find(c => c.id === id);
  if (!card) return;
  state.memoryVault.push({
    id: 'mv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    content: card.title + (card.summary ? ' — ' + card.summary : ''),
    source: 'topic',
    extractedAt: new Date().toISOString(),
    sourceTopicCardId: id,
    processed: false,
    priority: nextPriority()
  });
  saveState();
  renderArchive();
  showToast('서랍장에 추가됨 📥');
}

function topicToPearl(id) {
  const card = (state.topicCards || []).find(c => c.id === id);
  if (!card) return;
  state.pearls.push({
    id: 'pearl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    content: card.title + (card.summary ? '\n' + card.summary : ''),
    category: '순간',
    createdAt: new Date().toISOString(),
    sourceTopicCardId: id,
    type: 'pearl'
  });
  saveState();
  renderArchive();
  showToast('진주 바구니에 보관됨 💎');
}

// 사용자 명시 2026-05-01: topic → strategy 변환 = 돌연변이 first-gen mutation chat 흐름 (진화해볼게와 동일 UX).
// 옛 동작 (단순 category flip) 폐기. category 는 finalize (옵션 선택 후) 시점 promote.
function topicToStrategy(id) {
  const card = (state.topicCards || []).find(c => c.id === id);
  if (!card) return;
  if (card.category === 'strategy') {
    showToast('이미 전략 카드야');
    return;
  }
  // 출처 추적 + 빈 generations / evolutionChats 초기화 (mutation chat finalize 가 generations[0] push)
  card.sourceTopicCategory = card.category;
  if (!Array.isArray(card.generations)) card.generations = [];
  if (!Array.isArray(card.evolutionChats)) card.evolutionChats = [];
  // mutation chat open (firstGen 모드) — 사용자 취소 시 card 그대로 (category 변경 X)
  if (typeof openMutationChat === 'function') {
    openMutationChat(id, card.title, { firstGen: true });
  }
}

async function deleteTopicCard(id) {
  if (!await confirmDelete('이 토픽 카드')) return;
  state.topicCards = (state.topicCards || []).filter(c => c.id !== id);
  saveState();
  renderArchive();
  showToast('삭제됨');
}

// === V3.8 LENS: STRATEGIES — 전략 카드 모음 (깨달음 렌즈) ===
function renderLensStrategies() {
  const container = document.getElementById('lensStrategies');
  if (!container) return;
  
  // V4-fix (사용자 보고): 관찰 시드 카드 양생방 숨김 (detectDiagnoses는 그대로 작동)
  let strategies = (state.topicCards || []).filter(c => c.category === 'strategy' && !c._isDiagnosticSeed);

  // 검색 필터
  if (_archiveSearchQuery) {
    strategies = strategies.filter(s =>
      (s.title || '').toLowerCase().includes(_archiveSearchQuery) ||
      (s.summary || '').toLowerCase().includes(_archiveSearchQuery)
    );
  }
  
  strategies = strategies.slice().sort((a, b) => 
    new Date(b.createdAt) - new Date(a.createdAt)
  );
  
  // 사용자 요청 2026-04-29: 공용 _libView 사용 ('grid'=피드, 'timeline'=목록) — 자체 토글 제거
  const _ysView = _libView === 'timeline' ? 'list' : 'feed';
  let html = `
    <div class="strategy-section">
      <div class="strategy-section-header">
        <div class="topic-cards-title">🧬 전략 DNA</div>
        <button class="strategy-add-btn" onclick="addManualStrategy()">+ 같이 만들기</button>
      </div>
  `;

  if (strategies.length === 0) {
    // pearl_design_spec_2026-05-03 §4-1: 빈 자리 카피 + "어떻게 자라" CTA
    html += `
      <div class="ys-empty-card">
        <div class="ys-empty-icon">🌿</div>
        <div class="ys-empty-title">양생방 — 아직 비어있어</div>
        <div class="ys-empty-body">여기는 네 전략들이 자라는 곳.<br>첫 전략은 대화에서 4단 분석을 받고 <em>✦ 해볼게</em> 누르면 자라.</div>
        <button class="ys-empty-cta" onclick="showYangsaengGrowthDiagram()">어떻게 자라는지 궁금해</button>
      </div>
    `;
  } else {
    // 상태 그룹 — 피드/목록 둘 다 사용
    // 사용자 명시 2026-05-01 (agent audit P9): archived dead state 제거. 진입 UI X 라 dead.
    const _groups = { seedling_trying: [], working: [], mutated: [], embodied: [] };
    strategies.forEach(s => {
      const st = s.embodimentStatus || 'seedling';
      const hasMutated = Array.isArray(s.generations) && s.generations.some(g => g.status === 'mutated');
      if (st === 'embodied')        _groups.embodied.push(s);
      else if (st === 'working')    _groups.working.push(s);
      else if (hasMutated)          _groups.mutated.push(s);
      else                          _groups.seedling_trying.push(s);
    });

    if (_ysView === 'list') {
      // 사용자 요청 2026-04-29: 카테고리 = 큰 카드 펼침/접힘 (진주 음악 카드 스타일)
      // 데이터 없는 카테고리도 살림 ("아직 없어")
      const _catFilter = (typeof _yangsaengCatFilter !== 'undefined') ? _yangsaengCatFilter : null;
      const STATUS_CATS = [
        { key: 'seedling_trying', icon: '🌿', label: '양생',  count: _groups.seedling_trying.length, emptyMsg: '아직 시작·시도 중인 전략 없어' },
        { key: 'working',         icon: '🌳', label: '성장',  count: _groups.working.length,         emptyMsg: '아직 작동 누적된 전략 없어' },
        { key: 'mutated',         icon: '🪦', label: '진화',  count: _groups.mutated.length,         emptyMsg: '아직 돌연변이된 전략 없어' },
        { key: 'embodied',        icon: '🍃', label: '체화',  count: _groups.embodied.length,        emptyMsg: '아직 체화된 전략 없어' }
      ];
      html += `<div class="lib-cat-accordion">
        ${STATUS_CATS.map(c => {
          const expanded = _catFilter === c.key;
          const cards = _groups[c.key] || [];
          const bodyInner = cards.length === 0
            ? `<div class="lcaa-empty">${c.emptyMsg}</div>`
            : cards.map(s => _renderStrategyCardHtml(s)).join('');
          return `
            <div class="lib-cat-accordion-item${expanded ? ' expanded' : ''}">
              <div class="lib-cat-accordion-header" onclick="setYangsaengCatFilter('${c.key}')">
                <span class="lcaa-icon">${c.icon}</span>
                <span class="lcaa-label">${c.label}</span>
                <span class="lcaa-count${c.count === 0 ? ' empty' : ''}">${c.count}</span>
                <span class="lcaa-chevron">▾</span>
              </div>
              <div class="lib-cat-accordion-body">${bodyInner}</div>
            </div>
          `;
        }).join('')}
      </div>`;
    } else {
      // 피드: 상태별 그룹 (기존 grid 동작)
      // 사용자 명시 2026-05-01 (agent audit P9 sync): archived dead state 제거 — _groups·STATUS_CATS 와 동기.
      const _groupOrder = [
        { key: 'seedling_trying', label: '🌿 양생 — 시작·시도 중' },
        { key: 'working',         label: '🌳 성장 중 — 작동 누적' },
        { key: 'mutated',         label: '🪦 돌연변이 — 진화 중' },
        { key: 'embodied',        label: '🍃 체화 완료' }
      ];
      _groupOrder.forEach(({ key, label }) => {
        const cards = _groups[key];
        if (!cards.length) return;
        html += `<div class="yangsaeng-status-group">
          <div class="yangsaeng-status-header">${label} · ${cards.length}</div>`;
        cards.forEach(s => { html += _renderStrategyCardHtml(s); });
        html += `</div>`;
      });
    }
  }
  html += `</div>`;
  container.innerHTML = html;
}

// === pearl_design_spec_2026-05-03 §4: 양생방 "어떻게 자라" 다이어그램 모달 ===
// 빈 자리 CTA → 모달 + helix 진주 1회 init.
let _ygPearlInit = false;
let _ygPearlRafId = null;
let _ygEscDetach = null;
function showYangsaengGrowthDiagram() {
  const ov = document.getElementById('yangsaengGrowthOverlay');
  if (!ov) return;
  ov.classList.add('open');
  // 첫 진입 시 helix 한 번만 init
  if (!_ygPearlInit) {
    _ygPearlInit = true;
    _initYgPearl();
  }
  if (typeof _registerModalEsc === 'function') {
    _ygEscDetach = _registerModalEsc(ov, closeYangsaengGrowthDiagram);
  }
}
function closeYangsaengGrowthDiagram() {
  const ov = document.getElementById('yangsaengGrowthOverlay');
  if (!ov) return;
  ov.classList.remove('open');
  if (typeof _ygEscDetach === 'function') { _ygEscDetach(); _ygEscDetach = null; }
}
function _initYgPearl() {
  // diagram_yangsaeng_v6 스크립트와 동일한 helix logic — evolved path (2 strand) 6 emoji
  const PEARL_CX = 110, PEARL_CY = 110;
  const HELIX_RADIUS = 32, HELIX_TOP = -52, HELIX_BOTTOM = 52;
  const SHELLS = ['✨','🌈','🦋','🪩','🎆','🦚'];
  const SPEED = 0.0011;
  const STRANDS = 2;
  const group = document.getElementById('yg-shells-group');
  if (!group) return;
  const ns = 'http://www.w3.org/2000/svg';
  const elements = SHELLS.map((emoji) => {
    const text = document.createElementNS(ns, 'text');
    text.setAttribute('class', 'yg-helix-shell-text');
    text.textContent = emoji;
    group.appendChild(text);
    return text;
  });
  const n = SHELLS.length;
  function update(timestamp) {
    const t = timestamp * SPEED;
    elements.forEach((el, i) => {
      let phase, yPos;
      if (STRANDS === 1) {
        const yT = (i + 0.5) / n;
        yPos = HELIX_TOP + yT * (HELIX_BOTTOM - HELIX_TOP);
        phase = t + yT * Math.PI * 2.5;
      } else {
        const half = Math.ceil(n / 2);
        const isStrand1 = i < half;
        const j = isStrand1 ? i : (i - half);
        const m = isStrand1 ? half : (n - half);
        const yT = (j + 0.5) / m;
        yPos = HELIX_TOP + yT * (HELIX_BOTTOM - HELIX_TOP);
        const strandPhase = isStrand1 ? 0 : Math.PI;
        phase = t + strandPhase + yT * Math.PI * 2.5;
      }
      const x = HELIX_RADIUS * Math.cos(phase);
      const z = Math.sin(phase);
      const screenX = PEARL_CX + x;
      const screenY = PEARL_CY + yPos;
      const depthScale = 0.85 + z * 0.22;
      const fontSize = 20 * depthScale;
      const tNorm = (z + 1) * 0.5;
      const depthOpacity = 0.7 + tNorm * 0.3;
      const glowAlpha = 0.5 + Math.max(0, z) * 0.4;
      const glowBlur = 3 + Math.max(0, z) * 2;
      el.setAttribute('x', screenX);
      el.setAttribute('y', screenY);
      el.setAttribute('font-size', fontSize);
      el.setAttribute('opacity', depthOpacity.toFixed(3));
      el.style.filter = `drop-shadow(0 0 ${glowBlur.toFixed(1)}px rgba(255,255,240,${glowAlpha.toFixed(2)}))`;
    });
    _ygPearlRafId = requestAnimationFrame(update);
  }
  _ygPearlRafId = requestAnimationFrame(update);
}

// V4-1p: strategy 카드 렌더 함수 추출 (grid/timeline 공용)
function _renderStrategyCardHtml(s) {
  const dateStr = new Date(s.createdAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
  const hasStructured = s.problemContext || s.psychConcept || s.actionStrategy;
  let bodyHtml;
  if (hasStructured) {
    bodyHtml = `
      ${s.problemContext ? `<div class="strategy-section-row"><div class="strategy-section-icon">🎯</div><div><div class="strategy-section-label">문제 상황</div><div class="strategy-section-text">${escapeHtml(s.problemContext)}</div></div></div>` : ''}
      ${s.psychConcept ? `<div class="strategy-section-row"><div class="strategy-section-icon">🔍</div><div><div class="strategy-section-label">심리학 개념</div><div class="strategy-section-text">${escapeHtml(s.psychConcept)}</div></div></div>` : ''}
      ${s.actionStrategy ? `<div class="strategy-section-row"><div class="strategy-section-icon">💡</div><div><div class="strategy-section-label">전략적 행동</div><div class="strategy-section-text strategy-section-action">${escapeHtml(s.actionStrategy)}</div></div></div>` : ''}
    `;
  } else if (s.summary) {
    bodyHtml = `<div class="strategy-card-legacy-summary">${escapeHtml(s.summary)}</div>`;
  } else {
    bodyHtml = '';
  }
  // 사용자 명시 2026-05-01 (agent audit P9): archived dead state 제거.
  // V4 (v8 묶음 19-H) 2026-05-03: 신규 상태 'evolved' + 4 어휘 시퀀스 (양생/성장/진화/체화) 코드 매핑 일치
  // V4 (v8 사용자 명시 2026-05-03 ultrathink): mutated 🪦 → 🍂 (낙엽 — 옛 가지 떨어진 자연 톤. evolved 🌿✨ 와 시각 분리)
  const _statusEmoji = { seedling:'🌱', trying:'🌿', working:'🌳', evolved:'🌿✨', embodied:'🍃', mutated:'🍂' };
  const _statusName  = { seedling:'시작', trying:'양생', working:'성장 중', evolved:'진화', embodied:'체화됨 ✨', archived:'마무리', mutated:'진화 중' };
  const _status = s.embodimentStatus || (Array.isArray(s.generations) ? 'seedling' : null);
  const _worked = _status ? countWorkedAttempts(s) : 0;
  const _total  = _status ? countTotalAttempts(s) : 0;
  const _gens   = Array.isArray(s.generations) ? s.generations.length : 0;
  const _isEmbodied = _status === 'embodied';
  // 사용자 요청 2026-04-28: 결과 체크 버튼 조건 수정 — '소라의 부름' 해냈어가 되어야 (즉 status === 'completed' && !attemptStatus). pending 상태에선 안 뜸. result check 끝나면 attemptStatus 적용돼서 사라짐
  const _hasUnchecked = (state.missions || []).some(m =>
    m.strategyId === s.id &&
    m.status === 'completed' &&
    !m.attemptStatus
  );
  // 사용자 요청 2026-04-28: '작동' → '성공' 표기 통일, 결과 체크 대기 시 hint
  const metaLine = _status
    ? (_total > 0
        ? `${_statusEmoji[_status]||'🌱'} ${_statusName[_status]||''} · 성공 ${_worked}/${_total}${_gens > 1 ? ` · ${_gens}세대` : ''}${_hasUnchecked ? ' · 🔍 결과 체크 대기' : ''}`
        : `${_statusEmoji[_status]||'🌱'} 미시도${_hasUnchecked ? ' · 🔍 결과 체크 대기' : ''}`)
    : '';
  const tryBtnHtml = (_status && !_isEmbodied)
    ? (_hasUnchecked
        ? `<button class="strategy-try-btn" style="background:#7d6fa8;" onclick="triggerAttemptResultFromCard('${s.id}')">🔍 결과 체크</button>`
        : `<button class="strategy-try-btn" onclick="callTryStrategy('${s.id}')">✦ 해볼게</button>`)
    : '';
  const metaHtml = metaLine ? `<div class="strategy-card-meta${_isEmbodied ? ' embodied' : ''}">${metaLine}</div>` : '';
  // V4-1n + 사용자 fix: 진화 트리 — 1세대 (체화된 one-shot 포함) 도 표시
  let genTreeHtml = '';
  if (Array.isArray(s.generations) && s.generations.length >= 1) {
    const _layerEmoji = { L1:'🧠', L2:'🎯', L3:'🌍', L4:'👥', L5:'🪞' };
    const _layerName  = { L1:'인지', L2:'행동', L3:'환경', L4:'사회', L5:'메타' };
    // V4-fix v3 (사용자 보고): 진화 트리 dot — 그 미션의 shell tier 색으로 채움 (anchor 23)
    const tierColors = {
      light:  '#a89dc8',  // 가벼움 — 보라
      daily:  '#7ec8e3',  // 일상 — 파랑
      main:   '#ffb86b',  // 메인 — 주황
      golden: '#ffd700',  // 황금
      call:   '#ff8da1',  // 부름 — 핑크
      legend: '#ffd93d'   // 특별 — 노랑
    };
    const rows = s.generations.map((g, gi) => {
      const isLast = gi === s.generations.length - 1;
      const isMutated = g.status === 'mutated';
      const dots = (g.attempts || []).map(a => {
        // shellId / missionId 로 shell 찾기
        // 사용자 보고 2026-04-29: 'didnt' attempt도 missionId fallback으로 shell 끌어와 DNA 트리에 적용되던 버그.
        // worked/meh 만 shell 매핑. didnt는 missionId 있어도 shell X.
        let shell = null;
        if (a.shellId) shell = (state.shellCollection || []).find(sc => sc._id === a.shellId);
        if (!shell && a.missionId && (a.status === 'worked' || a.status === 'meh')) {
          shell = (state.shellCollection || []).find(sc => sc.missionId === a.missionId);
        }
        let bgColor;
        let extraStyle = '';
        let titleStr = a.status;
        if (shell) {
          // 그 미션 shell 색
          bgColor = tierColors[shell.tier] || '#a89dc8';
          if (shell.tier === 'legend' || shell.tier === 'call') {
            extraStyle = ` box-shadow: 0 0 6px ${bgColor};`;
          }
          titleStr = `${a.status} · ${shell.label || shell.tier} ${shell.type || ''}`;
        } else {
          // shell 없는 attempt — 기존 status 색 (worked/meh/didnt/skipped 회색)
          bgColor = a.status === 'worked' ? '#8fc88f'
                  : a.status === 'meh'    ? '#d4a76a'
                  : a.status === 'didnt'  ? '#888a90'
                                          : '#666';
        }
        // 사용자 요청 2026-04-27: shell 있으면 그 아이콘 작게 (점 대체), 없으면 기존 색 dot
        if (shell && shell.type) {
          const glow = (shell.tier === 'legend' || shell.tier === 'call') ? 'filter:drop-shadow(0 0 3px ' + bgColor + ');' : '';
          return `<span class="gen-shell-mini" style="${glow}" title="${titleStr}">${shell.type}</span>`;
        }
        return `<span class="gen-dot" style="background:${bgColor};${extraStyle}" title="${titleStr}"></span>`;
      }).join('');
      const prefix = gi === 0 ? '' : '└─ ';
      const layer = `${_layerEmoji[g.layer] || '✦'} ${_layerName[g.layer] || g.layer}`;
      const action = escapeHtml((g.action || '').slice(0, 50));
      const mark = isMutated ? '🪦' : (isLast && _isEmbodied ? '🍃' : '');
      return `<div class="strategy-gen-row${isLast ? ' current' : ''}" style="padding-left:${gi * 14}px;">
        <span class="gen-prefix">${prefix}</span>
        <span class="gen-layer">${layer}</span>
        <span class="gen-action">${action}${mark ? ` <span class="gen-mark">${mark}</span>` : ''}</span>
        <span class="gen-dots">${dots}</span>
      </div>`;
    }).join('');
    genTreeHtml = `<div class="strategy-gens-tree">
      <div class="gens-tree-label">🧬 진화 트리 · ${s.generations.length}세대</div>
      ${rows}
    </div>`;
  }
  // V4-fix #13: 카드 클릭 시 진화 트리 펼침 (default 접힘 — 시각 정리)
  if (!state.preferences) state.preferences = {};
  if (!state.preferences._strategyTreeOpen) state.preferences._strategyTreeOpen = {};
  const treeOpen = !!state.preferences._strategyTreeOpen[s.id];
  const hasTree = !!genTreeHtml;
  const treeToggle = hasTree
    ? `<button class="strategy-tree-toggle" onclick="toggleStrategyTree('${s.id}')">${treeOpen ? '▴ DNA 트리 접기' : '▾ DNA 트리 보기'}</button>`
    : '';
  // V4-fix (사용자 보고): 카드 제목 클릭 = 트리 토글 (체화된 카드 포함)
  const titleClickAttr = hasTree ? `onclick="toggleStrategyTree('${s.id}')" style="cursor:pointer;"` : '';
  // V4 (v8 묶음 19-I): 진화된 카드 시각 효과 — .just-evolved 클래스 (state._justEvolvedCardId 일치 시)
  const _justEvolvedClass = (state._justEvolvedCardId === s.id) ? ' just-evolved' : '';
  return `
    <div class="strategy-card strategy-card-v2${_justEvolvedClass}" data-strategy-id="${s.id}">
      <div class="strategy-card-title" data-strategy-id="${s.id}" ${titleClickAttr}>🧬 ${escapeHtml(s.title)}${hasTree ? ' <span style="font-size:11px; color:var(--text-dim); font-weight:normal;">' + (treeOpen ? '▴' : '▾') + '</span>' : ''}</div>
      ${bodyHtml}
      ${metaHtml}
      ${hasTree && treeOpen ? genTreeHtml : ''}
      <div class="strategy-card-source">${dateStr}${s.source === 'manual' ? ' · 직접 추가' : s.source === 'deeper' ? ' · 더 알고 싶어' : ' · 대화 챕터'}</div>
      <div class="strategy-card-actions">
        ${tryBtnHtml}
        <button onclick="deleteTopicCard('${s.id}')">🗑 삭제</button>
      </div>
    </div>
  `;
}

// V4-fix #13: 양생 카드 진화 트리 collapse 토글
function toggleStrategyTree(strategyId) {
  if (!state.preferences) state.preferences = {};
  if (!state.preferences._strategyTreeOpen) state.preferences._strategyTreeOpen = {};
  state.preferences._strategyTreeOpen[strategyId] = !state.preferences._strategyTreeOpen[strategyId];
  saveState();
  renderArchive();
}

// V4-fix: 직접 추가 → 임시 채팅창 (인셋, 메인 챗과 분리). 4단으로 같이 만들고 DNA 카드로 저장.
function addManualStrategy() {
  openStrategyBuilder();
}

let _strategyBuilderState = null;  // { messages: [], parsed: null }

function openStrategyBuilder() {
  _strategyBuilderState = { messages: [], parsed: null };
  // 첫 AI 가이드
  _strategyBuilderState.messages.push({
    role: 'assistant',
    content: '🧬 전략 DNA 같이 만들자.\n\n어떤 상황에서 막혀? 한 줄로 적어봐 — 네가 자주 마주치는 패턴이나 풀고 싶은 고민.'
  });
  const overlay = document.createElement('div');
  overlay.id = 'strategyBuilder';
  overlay.className = 'sb-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) closeStrategyBuilder(); };
  overlay.innerHTML = `
    <div class="sb-modal" onclick="event.stopPropagation()">
      <div class="sb-header">
        <div class="sb-title">🧬 전략 DNA 같이 만들기</div>
        <button class="sb-close" onclick="closeStrategyBuilder()">×</button>
      </div>
      <div class="sb-chat" id="sbChat"></div>
      <div class="sb-save-row" id="sbSaveRow" style="display:none;">
        <button class="sb-save-btn" onclick="saveStrategyFromBuilder()">✨ 이걸로 DNA 카드 저장</button>
      </div>
      <div class="sb-input-bar">
        <textarea id="sbInput" class="sb-textarea" placeholder="한 줄 적어..." rows="1"></textarea>
        <button class="sb-send" onclick="sbSendMessage()">↑</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  renderStrategyBuilderChat();
  setTimeout(() => document.getElementById('sbInput')?.focus(), 100);
}

function closeStrategyBuilder() {
  const el = document.getElementById('strategyBuilder');
  if (el) el.remove();
  _strategyBuilderState = null;
}

function renderStrategyBuilderChat() {
  const c = document.getElementById('sbChat');
  if (!c || !_strategyBuilderState) return;
  c.innerHTML = _strategyBuilderState.messages.map(m => {
    const cls = m.role === 'user' ? 'sb-msg-user' : 'sb-msg-ai';
    return `<div class="sb-msg ${cls}">${escapeHtml(m.content || '')}</div>`;
  }).join('');
  c.scrollTop = c.scrollHeight;
  // parsed가 있으면 저장 버튼 노출
  document.getElementById('sbSaveRow').style.display = _strategyBuilderState.parsed ? 'block' : 'none';
}

async function sbSendMessage() {
  const input = document.getElementById('sbInput');
  const text = (input?.value || '').trim();
  if (!text || !_strategyBuilderState) return;
  _strategyBuilderState.messages.push({ role: 'user', content: text });
  input.value = '';
  input.style.height = 'auto';
  renderStrategyBuilderChat();

  if (!_canAI()) {
    // 사용자 보고 2026-04-30: Phase C 후 키 모델 폐기 — 로그인이 게이트.
    _strategyBuilderState.messages.push({ role: 'assistant', content: '(로그인이 안 되어있어. 다시 로그인 해줘.)' });
    renderStrategyBuilderChat();
    return;
  }

  // typing indicator
  _strategyBuilderState.messages.push({ role: 'assistant', content: '...' });
  renderStrategyBuilderChat();

  // 시스템 prompt: 4단 + JSON 같이 출력
  const recentMsgs = _strategyBuilderState.messages
    .filter(m => m.content !== '...')
    .slice(-8)
    .map(m => ({ role: m.role, content: m.content }));

  const sys = `"전략 DNA" 카드를 같이 만드는 동반자.

[흐름]
1. 사용자가 막히는 상황 한 줄 적음.
2. 한두 번 짧게 더 묻고 (예: 빈도/맥락/가치). 너무 많이 묻지 X (1-2턴).
3. 4단 정리해서 사용자에게 보여줌 — TITLE/PROBLEM/CONCEPT/ACTION
4. JSON도 같이 출력 (사용자에겐 보이고, 코드가 파싱)

[톤]
- 친구 반말, 1-3문장, 외재화
- 칭찬 X, 단정 X, 결론 강요 X
- 금지어: 대박/힘내/화이팅/할 수 있어/멋져/대단해

[4단 출력 형식 (3-4 turn 후, 사용자가 충분히 적었을 때)]
응답 본문 + 마지막에 다음 JSON (코드블록 \`\`\`json):
{
  "TITLE": "5-14자 명사형 명제",
  "PROBLEM": "문제 상황 50-90자",
  "CONCEPT": "심리학 개념 + 1줄 설명 30-80자",
  "ACTION": "구체 행동 50-120자"
}

JSON 안 적용하면 4단 정리 X — 더 묻기. 사용자가 충분히 답한 후에만 JSON.`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: _anthropicHeaders(),
      body: JSON.stringify({
        _endpoint: 'analyze_4stage',
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: sys,
        messages: recentMsgs
      })
    });
    const data = await resp.json();
    let aiText = data.content?.[0]?.text?.trim() || '(응답 비어있어)';

    // typing 제거
    _strategyBuilderState.messages.pop();

    // JSON 추출
    const jm = aiText.match(/```json\s*([\s\S]*?)```/);
    let parsed = null;
    if (jm) {
      try {
        const obj = JSON.parse(jm[1]);
        if (obj.TITLE || obj.title) {
          parsed = {
            title: (obj.TITLE || obj.title || '').slice(0, 30),
            problemContext: (obj.PROBLEM || obj.problem || '').slice(0, 200),
            psychConcept: (obj.CONCEPT || obj.concept || '').slice(0, 200),
            actionStrategy: (obj.ACTION || obj.action || '').slice(0, 240)
          };
        }
      } catch (e) { console.warn('sb JSON parse:', e); }
      // JSON 블록 제거하고 본문만 표시
      aiText = aiText.replace(/```json[\s\S]*?```/g, '').trim();
    }

    _strategyBuilderState.messages.push({ role: 'assistant', content: aiText });
    if (parsed) _strategyBuilderState.parsed = parsed;
    renderStrategyBuilderChat();
  } catch (e) {
    console.warn('sb AI failed:', e);
    _strategyBuilderState.messages.pop();
    _strategyBuilderState.messages.push({ role: 'assistant', content: '(AI 응답 실패 — 잠시 후 다시 보내봐)' });
    renderStrategyBuilderChat();
  }
}

function saveStrategyFromBuilder() {
  if (!_strategyBuilderState || !_strategyBuilderState.parsed) return;
  const p = _strategyBuilderState.parsed;
  const now = new Date().toISOString();
  const summary = [p.problemContext, p.psychConcept, p.actionStrategy].filter(Boolean).join(' / ');
  if (!Array.isArray(state.topicCards)) state.topicCards = [];
  state.topicCards.push({
    id: 'strat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    category: 'strategy',
    title: p.title,
    summary,
    problemContext: p.problemContext,
    psychConcept: p.psychConcept,
    actionStrategy: p.actionStrategy,
    chapterStartedAt: now,
    chapterEndedAt: now,
    createdAt: now,
    messageCount: _strategyBuilderState.messages.length,
    source: 'builder',
    generations: [{
      gen: 1, layer: 'L2',
      action: p.actionStrategy || p.title,
      missions: [], shells: [], attempts: [],
      status: 'working'
    }],
    embodimentStatus: 'seedling',
    embodimentPath: null,
    evolutionChats: []
  });
  saveState();
  closeStrategyBuilder();
  if (typeof renderArchive === 'function') renderArchive();
  showToast('🧬 전략 DNA 카드 저장됨');
}

// === LENS 1: TIMELINE — 일기 통합 (체크인 + 대화 + 아카이브 깨달음) ===
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
function renderLensArchive() {
  const container = document.getElementById('lensArchive');
  if (!container) return;
  const items = (state.archive || []);
  const q = _archiveSearchQuery;
  let filtered = q
    ? items.filter(a => [a.headline, a.body, a.insight, a.userMemo, a.date, a.source, ...(a.tags || [])].filter(Boolean).join(' ').toLowerCase().includes(q))
    : items;
  // V4-1q: 태그 칩 필터 (grid 모드)
  if (_libView === 'grid' && _archiveTagFilter) {
    filtered = filtered.filter(a => Array.isArray(a.tags) && a.tags.includes(_archiveTagFilter));
  }
  // 사용자 요청 2026-04-29: 공용 _libView 사용 (자체 토글 제거)
  const insightView = _libView === 'timeline' ? 'list' : 'feed';
  const insightCat = _insightsCatFilter;
  if (insightView === 'list' && insightCat && insightCat !== 'ai') {
    filtered = filtered.filter(a => (a.type || 'scrap') === insightCat);
  } else if (insightView === 'list' && insightCat === 'ai') {
    filtered = [];  // AI 인사이트만 보고싶을 때 archive는 숨김
  }

  let html = '<div class="archive-section-wrap">';
  // 사용자 명시 2026-05-01 ultrathink: 5 카테고리 (스크랩/숙고/마법/메모/AI 인사이트)
  if (insightView === 'list') {
    const counts = { scrap: 0, memo: 0, reflection: 0, magic: 0 };
    items.forEach(a => { counts[a.type || 'scrap'] = (counts[a.type || 'scrap'] || 0) + 1; });
    const aiInsights = (state.insights || []).filter(i => !i.dismissed)
      .sort((a, b) => new Date(b.discoveredAt) - new Date(a.discoveredAt));
    const aiCount = aiInsights.length;

    // 깨달음 카드 렌더 헬퍼 (인라인 — 큰 카드 풍 안 쓰고 간단히)
    const _archiveCardHtml = (a) => {
      const realIdx = items.indexOf(a);
      const t = a.type || 'scrap';
      const headline = (t !== 'memo' && a.headline)
        ? `<div class="archive-item-headline">${escapeHtml(a.headline)}</div>` : '';
      const bodyText = t === 'memo'
        ? (a.userMemo || a.body || a.insight || '')
        : (a.body || (a.headline ? '' : (a.insight || '')));
      const body = bodyText ? `<div class="archive-item-body">${escapeHtml(bodyText)}</div>` : '';
      const tagsHtml = (Array.isArray(a.tags) && a.tags.length)
        ? `<div class="archive-item-tags">${a.tags.map(tg => `<span class="archive-tag">#${escapeHtml(tg)}</span>`).join('')}</div>` : '';
      const dateStr = a.date || '';
      const sourceStr = a.source ? ` · ${escapeHtml(a.source)}` : '';
      return `
        <div class="archive-item-card archive-type-${t}" onclick="openArchiveItem(${realIdx})">
          <div class="archive-item-meta">${escapeHtml(dateStr)}${sourceStr}</div>
          ${headline}${body}${tagsHtml}
        </div>`;
    };
    // AI 인사이트 카드 렌더 헬퍼
    const _aiCardHtml = (i) => {
      const typeLabel = i.type === 'causal' ? '🔗 어떤 X 다음 Y' : '🔄 자주 보이는 패턴';
      const confPct = Math.round((i.confidence || 0.5) * 100);
      const isConfirmed = i.user_verified === true;
      return `
        <div class="insight-card${isConfirmed ? ' confirmed' : ''}" data-id="${i.id}" style="margin-bottom:8px;">
          <div class="insight-card-header">
            <span class="insight-card-type">${typeLabel}</span>
            <span class="insight-card-conf"><span class="insight-card-conf-bar"><span class="insight-card-conf-bar-fill" style="width:${confPct}%;"></span></span>${confPct}%</span>
          </div>
          <div class="insight-card-text">${escapeHtml(i.content)}</div>
          ${i.evidence ? `<div class="insight-card-evidence"><span class="insight-card-evidence-label">📊 근거</span>${escapeHtml(i.evidence)}</div>` : ''}
        </div>`;
    };

    const CATS = [
      { key: 'scrap',      icon: '📌', label: '스크랩',         items: items.filter(a => (a.type || 'scrap') === 'scrap'), emptyMsg: '아직 스크랩한 깨달음 없어. 대화에서 ✦ 깨달음으로 눌러서 모아.' },
      // V4 (사용자 명시 2026-05-04 — v7 §11 / v8 §11): 돌연변이 깨달음 6번째 sub-category
      { key: 'mutation',   icon: '🧬', label: '돌연변이',       items: items.filter(a => a.type === 'mutation'),           emptyMsg: '아직 돌연변이 깨달음 없어. 돌연변이 대화 끝에 ✓ 누르면 여기로.' },
      { key: 'reflection', icon: '🌊', label: '숙고',           items: items.filter(a => a.type === 'reflection'),         emptyMsg: '아직 숙고 결론 없어. 🌊 숙고 질문에서 결론 적용하면 여기로.' },
      { key: 'magic',      icon: '🌀', label: '마법',           items: items.filter(a => a.type === 'magic'),              emptyMsg: '아직 마법 깨달음 없어. 마법고동 step ✦ / Future Self / 마법 대화 끝내기 시 자리잡아.' },
      { key: 'memo',       icon: '✎',  label: '메모',           items: items.filter(a => a.type === 'memo'),               emptyMsg: '아직 메모 없어. 대화 + 메뉴 → ✎ 메모로 직접 적기.' },
      { key: 'ai',         icon: '🔮', label: '인사이트',       items: aiInsights,                                          emptyMsg: '아직 인사이트 없어. 체크인 7일 이상 쌓이면 자동 발견 가능.' }
    ];
    html += `<div class="lib-cat-accordion">
      ${CATS.map(c => {
        const expanded = insightCat === c.key;
        const count = c.key === 'ai' ? aiCount : (counts[c.key] || 0);
        const bodyInner = count === 0
          ? `<div class="lcaa-empty">${c.emptyMsg}</div>`
          : (c.key === 'ai' ? c.items.map(_aiCardHtml).join('') : c.items.map(_archiveCardHtml).join(''));
        // 사용자 명시 2026-05-01 (agent audit): '🔮 새 인사이트 찾기' button 폐기 — 일주일 자동 forceAnalyze 에 통합 (이미 28650 주석에 명시). UI 잔재 제거.
        const extraBtn = '';
        return `
          <div class="lib-cat-accordion-item${expanded ? ' expanded' : ''}">
            <div class="lib-cat-accordion-header" onclick="setInsightsCatFilter('${c.key}')">
              <span class="lcaa-icon">${c.icon}</span>
              <span class="lcaa-label">${c.label}</span>
              <span class="lcaa-count${count === 0 ? ' empty' : ''}">${count}</span>
              <span class="lcaa-chevron">▾</span>
            </div>
            <div class="lib-cat-accordion-body">${extraBtn}${bodyInner}</div>
          </div>`;
      }).join('')}
    </div></div>`;
    container.innerHTML = html;
    return;  // accordion이 모든 데이터 처리 — 아래 grid 렌더 skip
  }
  html += `<div class="archive-section-label">✦ 저장한 깨달음${items.length ? ` <span class="al-count">${items.length}</span>` : ''}</div>`;

  // V4-1q: grid 뷰에서 자주 쓰는 태그 5-10개 칩
  if (_libView === 'grid') {
    const tagCount = {};
    items.forEach(a => {
      if (Array.isArray(a.tags)) {
        a.tags.forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; });
      }
    });
    const topTags = Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    if (topTags.length > 0) {
      html += `<div class="archive-tag-chips">
        ${_archiveTagFilter ? `<button class="archive-tag-chip clear" onclick="setArchiveTagFilter(null)">✕ 필터 해제</button>` : ''}
        ${topTags.map(([t, c]) => `<button class="archive-tag-chip${_archiveTagFilter === t ? ' active' : ''}" onclick="setArchiveTagFilter('${escapeHtml(t).replace(/'/g, "\\'")}')">#${escapeHtml(t)} <span class="tag-chip-count">${c}</span></button>`).join('')}
      </div>`;
    }
  }

  if (filtered.length === 0) {
    if (q) {
      html += `<div class="archive-empty"><div style="font-size:13px;">"${escapeHtml(q)}" 검색 결과 없음.</div></div>`;
    } else {
      html += `<div class="archive-empty">
        <div class="icon">✦</div>
        <div style="font-size:14px; color:var(--text); margin-bottom:8px;">아직 저장된 깨달음 없어</div>
        대화 응답 아래 <b>"✦ 깨달음으로"</b> 또는 + 메뉴의 <b>✎ 메모</b>로 모아.
      </div>`;
    }
  } else {
    // V4-1h: type별 배지 + tags 표시
    const typeBadge = {
      'memo':       '<span class="archive-type-badge t-memo" title="메모">✎</span>',
      'reflection': '<span class="archive-type-badge t-reflect" title="숙고 결론">🌊</span>',
      'scrap':      '<span class="archive-type-badge t-scrap" title="대화 깨달음">📌</span>'
    };
    html += filtered.map(a => {
      const realIdx = items.indexOf(a);
      const t = a.type || 'scrap';
      const badge = typeBadge[t] || typeBadge['scrap'];
      // memo는 userMemo가 본문, headline X
      const headline = (t !== 'memo' && a.headline)
        ? `<div class="archive-item-headline">${escapeHtml(a.headline)}</div>`
        : '';
      const bodyText = t === 'memo'
        ? (a.userMemo || a.body || a.insight || '')
        : (a.body || (a.headline ? '' : (a.insight || '')));
      const body = bodyText ? `<div class="archive-item-body">${escapeHtml(bodyText)}</div>` : '';
      const tagsHtml = (Array.isArray(a.tags) && a.tags.length)
        ? `<div class="archive-item-tags">${a.tags.map(tg => `<span class="archive-tag">#${escapeHtml(tg)}</span>`).join('')}</div>`
        : '';
      const dateStr = a.date || '';
      const sourceStr = a.source ? ` · ${escapeHtml(a.source)}` : '';
      return `
        <div class="archive-item-card archive-type-${t}" onclick="openArchiveItem(${realIdx})">
          <div class="archive-item-meta">${badge} ${escapeHtml(dateStr)}${sourceStr}</div>
          ${headline}
          ${body}
          ${tagsHtml}
          <button class="archive-item-delete" onclick="event.stopPropagation(); deleteArchiveItem(${realIdx})" title="삭제" aria-label="삭제">✕</button>
        </div>
      `;
    }).join('');
  }
  html += '</div>';
  container.innerHTML = html;
}

async function deleteArchiveItem(idx) {
  if (!await confirmDelete('이 깨달음', '도서관에서 영구 삭제됩니다.')) return;
  if (!state.archive || idx < 0 || idx >= state.archive.length) return;
  state.archive.splice(idx, 1);
  saveState();
  renderLensArchive();
  showToast('삭제됨');
}

// V3.13.x: 깨달음 카드 클릭 → 원본 + 헤드라인/본문 보여주는 모달
function openArchiveItem(idx) {
  const a = (state.archive || [])[idx];
  if (!a) return;
  const dateStr = a.date || '';
  const sourceStr = a.source ? ` · ${escapeHtml(a.source)}` : '';
  const headline = a.headline ? `<div class="archive-modal-headline">${escapeHtml(a.headline)}</div>` : '';
  const bodyText = a.body || (a.headline ? '' : (a.insight || ''));
  const body = bodyText ? `<div class="archive-modal-body">${escapeHtml(bodyText)}</div>` : '';
  const questionBlock = a.question
    ? `<div class="archive-modal-section-label">네 질문</div>
       <div class="archive-modal-original" style="background:rgba(212,167,106,0.06);">${escapeHtml(a.question)}</div>`
    : '';
  const originalBlock = a.original
    ? `<div class="archive-modal-section-label">${a.question ? 'AI 응답' : '원본 메시지'}</div>
       <div class="archive-modal-original">${escapeHtml(a.original)}</div>`
    : `<div class="archive-modal-no-original">원본이 함께 저장되지 않은 항목 (이전 버전에서 저장)</div>`;

  const modal = document.createElement('div');
  modal.id = 'archiveModal';
  modal.className = 'topic-modal-overlay';
  modal.innerHTML = `
    <div class="topic-modal" onclick="event.stopPropagation()">
      <div class="topic-modal-header">
        <span class="topic-card-cat" style="background: rgba(201,169,110,0.18); color: var(--accent2);">✦ 깨달음</span>
        <button class="topic-modal-close" onclick="closeArchiveModal()">×</button>
      </div>
      ${headline}
      ${body}
      ${questionBlock}
      ${originalBlock}
      <div class="topic-modal-meta">${escapeHtml(dateStr)}${sourceStr}</div>
      <div class="topic-modal-actions">
        <button class="topic-modal-btn danger" onclick="closeArchiveModal(); deleteArchiveItem(${idx})">🗑 삭제</button>
      </div>
    </div>
  `;
  modal.onclick = closeArchiveModal;
  document.body.appendChild(modal);
  setTimeout(() => modal.classList.add('show'), 30);
}

function closeArchiveModal() {
  const modal = document.getElementById('archiveModal');
  if (!modal) return;
  modal.classList.remove('show');
  setTimeout(() => modal.remove(), 200);
}

// === LENS 2: INSIGHTS — AI 인과관계 발견 ===
// 사용자 요청 2026-04-29: 마법·리뷰 카테고리 — 피드(분리 sub) / 목록(4 chips) 토글
function renderLensGalpi() {
  const container = document.getElementById('libGalpi');
  if (!container) return;
  // 사용자 요청 2026-04-29: 공용 _libView 사용
  const view = _libView === 'timeline' ? 'list' : 'feed';
  // 사용자 보고 2026-04-29: 검색 적용 (목록 모드 inline 리스트에)
  const _qGalpi = _archiveSearchQuery;
  const matchesQ = (r, ...fields) => !_qGalpi || fields.filter(Boolean).join(' ').toLowerCase().includes(_qGalpi);
  let decisions = state.decisions || [];
  let weekly = (state.weeklyReviews || []).map(r => ({...r, _type: 'weekly'}));
  let monthly = (state.monthlyReviews || []).map(r => ({...r, _type: 'monthly'}));
  let quarterly = (state.quarterlyReviews || []).map(r => ({...r, _type: 'quarterly'}));
  if (_qGalpi) {
    decisions = decisions.filter(d => matchesQ(d, d.title, d.topic));
    weekly = weekly.filter(r => matchesQ(r, r.summary, r.weekKey));
    monthly = monthly.filter(r => matchesQ(r, r.summary, r.monthKey));
    quarterly = quarterly.filter(r => matchesQ(r, r.summary, r.quarterKey, ...(r.sections || []).map(s => s.body)));
  }
  const allReviews = [...weekly, ...monthly, ...quarterly].sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));

  // 사용자 요청 2026-04-29: 공용 toggle 사용 (자체 토글 X)
  const toggleHtml = '';

  let body = '';
  if (view === 'feed') {
    // 피드: 기존 archive-quick-row 두 버튼 (마법의 소라고동 / 리뷰 모음)
    body = `
      <div class="archive-quick-row" style="grid-template-columns:1fr 1fr;">
        <button class="archive-quick-btn" onclick="showArchiveDecisions()">
          <span class="aq-icon"><img src="/godong.webp" alt="" class="godong-icon" decoding="async"></span>
          <span class="aq-label">마법의 소라고동</span>
          <span class="aq-count">${decisions.length}건</span>
        </button>
        <button class="archive-quick-btn" onclick="showArchiveReviews()">
          <span class="aq-icon">🌙</span>
          <span class="aq-label">리뷰 모음</span>
          <span class="aq-count">${allReviews.length}건</span>
        </button>
      </div>
      <div style="margin-top:14px; font-size:12px; color:var(--text-dim); text-align:center; line-height:1.6;">
        큰 결정은 <img src="/godong.webp" alt="" class="godong-icon" decoding="async"> 마법의 소라고동에서 14일 숙성.<br>
        주간·월간 회고는 🌙 리뷰 모음에서 다시 보기.
      </div>
    `;
  } else {
    // 사용자 요청 2026-04-29: timeline = 큰 카드 펼침/접힘 accordion (5 카테고리, 데이터 없는 것도 살림)
    const cf = _galpiCatFilter;
    const annual = (state.annualStories || []).map(r => ({...r, _type: 'annual'})); // V4 비전 7.10 (있을 시)
    const annualCount = annual.length;

    const _decisionCard = (d) => `
      <div onclick="openDecision('${d.id}')" style="cursor:pointer; background:var(--surface2); border:1px solid var(--border); border-radius:10px; padding:11px 13px; margin-bottom:7px;">
        <div style="font-size:14px; color:white; margin-bottom:4px;">${escapeHtml(d.title || d.topic || '')}</div>
        <div style="font-size:11px; color:var(--text-soft);">${d.status === 'active' ? '숙성 중' : d.status === 'decided' ? '✓ 결정됨' : '중단됨'} · ${new Date(d.startedAt || d.createdAt || 0).toLocaleDateString('ko-KR')}</div>
      </div>`;
    const _reviewCard = (r, type) => {
      const dt = new Date(r.completedAt || 0).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
      const seasonLabel = type === 'quarterly' && r.quarterKey && typeof seasonLabelOf === 'function'
        ? seasonLabelOf(r.quarterKey, { withEmoji: true }) : '';
      const periodLabel = seasonLabel || r.weekKey || r.monthKey || r.yearKey || '';
      const onclickAttr = (type === 'quarterly' || type === 'annual')
        ? `onclick="openQuarterlyStories('${r.id}')"` : '';
      return `
        <div ${onclickAttr} style="${(type === 'quarterly' || type === 'annual') ? 'cursor:pointer;' : ''} background:var(--surface2); border:1px solid var(--border); border-radius:10px; padding:11px 13px; margin-bottom:7px;">
          <div style="font-size:13px; color:white; margin-bottom:4px;">${escapeHtml(periodLabel)} 리뷰</div>
          <div style="font-size:12px; color:var(--text-soft); margin-bottom:6px; line-height:1.55;">${escapeHtml((r.summary || '').slice(0, 100))}</div>
          <div style="font-size:10px; color:var(--text-dim);">${dt}${(type === 'quarterly' || type === 'annual') ? ' · ▶ Stories로 보기' : ''}</div>
        </div>`;
    };

    const CATS = [
      { key: 'decision',  icon: '🐚', label: '마법의 소라고동', items: decisions, count: decisions.length, emptyMsg: '아직 시작한 결정 없어. 큰 결정 있을 때 14일 숙성에 넣어.' },
      { key: 'weekly',    icon: '🌙', label: '주간 리뷰',       items: weekly,    count: weekly.length,    emptyMsg: '아직 주간 리뷰 없어. 일주일 데이터 쌓이면 자동 생성.' },
      { key: 'monthly',   icon: '📅', label: '월간 리뷰',       items: monthly,   count: monthly.length,   emptyMsg: '아직 월간 리뷰 없어. 한 달 데이터 쌓이면 자동.' },
      { key: 'quarterly', icon: '🌸', label: '계절 리뷰',       items: quarterly, count: quarterly.length, emptyMsg: '아직 계절 리뷰 없어. 분기 끝날 때 자동.' },
      { key: 'annual',    icon: '🌟', label: '연간 리뷰',       items: annual,    count: annualCount,      emptyMsg: '아직 연간 리뷰 없어. 한 해 마무리하면 Stories로.' }
    ];
    body = `<div class="lib-cat-accordion">
      ${CATS.map(c => {
        const expanded = cf === c.key;
        let inner;
        if (c.count === 0) {
          inner = `<div class="lcaa-empty">${c.emptyMsg}</div>`;
        } else if (c.key === 'decision') {
          inner = c.items.map(_decisionCard).join('');
        } else {
          inner = c.items.map(it => _reviewCard(it, c.key)).join('');
        }
        return `
          <div class="lib-cat-accordion-item${expanded ? ' expanded' : ''}">
            <div class="lib-cat-accordion-header" onclick="setGalpiCatFilter('${c.key}')">
              <span class="lcaa-icon">${c.icon}</span>
              <span class="lcaa-label">${c.label}</span>
              <span class="lcaa-count${c.count === 0 ? ' empty' : ''}">${c.count}</span>
              <span class="lcaa-chevron">▾</span>
            </div>
            <div class="lib-cat-accordion-body">${inner}</div>
          </div>`;
      }).join('')}
    </div>`;
  }

  container.innerHTML = toggleHtml + body;
}

function renderLensInsights() {
  const container = document.getElementById('lensInsights');
  if (!container) return;

  // 사용자 보고 2026-04-29: 검색 미적용 버그 fix
  const q = _archiveSearchQuery;
  let insights = (state.insights || []).filter(i => !i.dismissed)
    .sort((a, b) => new Date(b.discoveredAt) - new Date(a.discoveredAt));
  if (q) {
    insights = insights.filter(i =>
      [i.content, i.evidence, i.type].filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }
  // 사용자 요청 2026-04-29: timeline 모드에선 AI 인사이트는 위 accordion이 처리 — 여기선 빈 상태
  if (_libView === 'timeline') {
    container.innerHTML = '';
    return;
  }
  // 깨달음 목록 모드에서 type이 ai 아니면 AI 인사이트 섹션 숨김 (legacy)
  if (_insightsView === 'list' && _insightsCatFilter && _insightsCatFilter !== 'ai') {
    container.innerHTML = '';
    return;
  }
  
  // 사용자 요청 2026-04-30: '🔮 새 인사이트 찾기' 버튼 제거 — 일주일 자동 forceAnalyze에 통합.
  // discoverInsights 함수 자체는 dead code로 남김 (개발자 도구 등에서 수동 호출 가능).
  let html = '';
  
  if (insights.length === 0) {
    html += `<div class="insights-empty">
      <div class="icon">🔮</div>
      <div style="font-size:14px; color:var(--text); margin-bottom:8px;">아직 모이는 중 ✦</div>
      체크인이 7일쯤 쌓이면<br>자동으로 인사이트 찾아줄게.<br><br>
      <div style="font-size:11px; color:var(--text-soft);">너만의 패턴이 천천히 드러나.</div>
    </div>`;
  } else {
    html += insights.map(insight => {
      // V4-fix v3 (사용자 요청): 친절한 type 라벨
      const typeLabel = insight.type === 'causal'
        ? '🔗 어떤 X 다음 Y가 따라와'
        : '🔄 자주 보이는 패턴';
      const confPct = Math.round((insight.confidence || 0.5) * 100);
      const isConfirmed = insight.user_verified === true;
      return `
        <div class="insight-card${isConfirmed ? ' confirmed' : ''}" data-id="${insight.id}">
          <div class="insight-card-header">
            <span class="insight-card-type">${typeLabel}</span>
            <span class="insight-card-conf">
              <span class="insight-card-conf-bar"><span class="insight-card-conf-bar-fill" style="width:${confPct}%;"></span></span>
              ${confPct}%
            </span>
          </div>
          <div class="insight-card-text">${escapeHtml(insight.content)}</div>
          ${insight.evidence ? `<div class="insight-card-evidence"><span class="insight-card-evidence-label">📊 근거</span>${escapeHtml(insight.evidence)}</div>` : ''}
          ${isConfirmed
            ? `<div style="font-size:11px; color:#8fc88f; padding:4px 0;">✓ 확인됨 — 네 안의 살아있는 패턴</div>`
            : `<div class="insight-card-actions">
                <button class="insight-card-btn confirm" onclick="confirmInsight('${insight.id}')">맞아 ✓</button>
                <button class="insight-card-btn reject" onclick="dismissInsight('${insight.id}')">아니야</button>
              </div>`
          }
        </div>
      `;
    }).join('');
  }
  
  container.innerHTML = html;
}

// 사용자 요청 2026-04-30: discoverInsights 함수 제거 — 일주일 자동 forceAnalyze에 통합. dead code 정리.

function confirmInsight(id) {
  const ins = state.insights.find(i => i.id === id);
  if (!ins) return;
  ins.confirmed = true;
  ins.user_verified = true;  // V4-fix v3: insight 카드에서 ✓ 시각 분기 위해
  ins.confidence = Math.min(1.0, (ins.confidence || 0.5) + 0.2);
  saveState();
  renderLensInsights();
  showToast('확인됨 ✓');
}

function dismissInsight(id) {
  const ins = state.insights.find(i => i.id === id);
  if (!ins) return;
  ins.dismissed = true;
  saveState();
  renderLensInsights();
}

// === ARCHIVE-REVIEWS / ARCHIVE-DECISIONS ===

