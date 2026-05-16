// ═══════════════════════════════════════════════════════════════
// V3.13.x: 음악 (iTunes Search API — 인증 X, 무료) + Apple Music 외부 링크
// ═══════════════════════════════════════════════════════════════
async function searchITunes(query) {
  if (!query || !query.trim()) return [];
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query.trim())}&entity=song&limit=20&country=KR&lang=ko_KR`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.results || []).filter(r => r.kind === 'song' || r.wrapperType === 'track').map(r => ({
      id: String(r.trackId),
      title: r.trackName,
      artist: r.artistName,
      album: r.collectionName,
      artworkUrl: (r.artworkUrl100 || '').replace('100x100bb', '300x300bb'),
      previewUrl: r.previewUrl,
      trackUrl: r.trackViewUrl
    }));
  } catch (e) {
    console.warn('iTunes search failed:', e);
    return [];
  }
}

let _musicSearchPickedTracks = null;
function showMusicSearchModal(callback) {
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay';
  overlay.id = 'musicSearchModal';
  overlay.innerHTML = `
    <div class="input-modal" onclick="event.stopPropagation()" style="max-height:88vh; display:flex; flex-direction:column;">
      <div class="input-modal-title">🎵 곡 검색</div>
      <input type="text" class="music-search-input" id="musicSearchInput" placeholder="곡명이나 아티스트..." autocomplete="off">
      <div class="music-search-results" id="musicSearchResults">
        <div class="music-search-empty">검색어를 입력해봐</div>
      </div>
      <div class="input-modal-actions">
        <button class="input-modal-btn cancel" onclick="closeMusicSearchModal()">취소</button>
      </div>
    </div>
  `;
  overlay.onclick = closeMusicSearchModal;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('show'), 30);

  const input = document.getElementById('musicSearchInput');
  const results = document.getElementById('musicSearchResults');
  let _searchTimer = null;
  let _lastQuery = '';
  setTimeout(() => input.focus(), 60);

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (_searchTimer) clearTimeout(_searchTimer);
    if (!q) {
      results.innerHTML = '<div class="music-search-empty">검색어를 입력해봐</div>';
      return;
    }
    results.innerHTML = '<div class="music-search-loading">검색 중...</div>';
    _searchTimer = setTimeout(async () => {
      _lastQuery = q;
      const tracks = await searchITunes(q);
      if (q !== _lastQuery) return;
      if (tracks.length === 0) {
        results.innerHTML = '<div class="music-search-empty">검색 결과가 없어</div>';
        return;
      }
      _musicSearchPickedTracks = tracks;
      results.innerHTML = tracks.map((t, i) => `
        <div class="music-search-row" onclick="_pickMusicTrack(${i})">
          <img class="music-search-art" src="${escapeHtml(t.artworkUrl)}" alt="" onerror="this.style.opacity=0.3;">
          <div class="music-search-meta">
            <div class="music-search-title">${escapeHtml(t.title)}</div>
            <div class="music-search-artist">${escapeHtml(t.artist)}</div>
          </div>
        </div>
      `).join('');
      window._pickMusicTrack = (idx) => {
        const t = (_musicSearchPickedTracks || [])[idx];
        if (!t) return;
        closeMusicSearchModal();
        if (callback) callback(t);
      };
    }, 350);
  });
}

function closeMusicSearchModal() {
  const overlay = document.getElementById('musicSearchModal');
  if (!overlay) return;
  overlay.classList.remove('show');
  setTimeout(() => overlay.remove(), 200);
  if (_currentMusicAudio) {
    try { _currentMusicAudio.pause(); } catch {}
    _currentMusicAudio = null;
    _currentMusicBtn = null;
  }
  _musicSearchPickedTracks = null;
  delete window._pickMusicTrack;
}

// 사용자 명시 2026-05-02 ultrathink: 🎵 emoji → waveform SVG (irregular dance ▆▂▇▃▅).
// 음악 진주 placeholder + button label 일괄 swap. inline SVG (외부 fetch X) + currentColor + 1em sizing.
const _MUSIC_WAVE_SVG = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true" class="music-wave-icon"><rect x="2" y="6" width="2.4" height="12" rx="1.2"/><rect x="6.4" y="10" width="2.4" height="4" rx="1.2"/><rect x="10.8" y="4" width="2.4" height="16" rx="1.2"/><rect x="15.2" y="9" width="2.4" height="6" rx="1.2"/><rect x="19.6" y="7" width="2.4" height="10" rx="1.2"/></svg>';

function renderMusicCardHTML(track, opts = {}) {
  if (!track) return '';
  const onRemove = opts.onRemove || '';
  const removeBtn = onRemove ? `<button class="music-card-remove" onclick="event.stopPropagation(); ${onRemove}" aria-label="제거">✕</button>` : '';
  const playBtn = track.previewUrl
    ? `<button class="music-card-btn play" onclick="event.stopPropagation(); toggleMusicPreview(this, '${escapeHtml(track.previewUrl)}')" aria-label="미리듣기">▶</button>`
    : '';
  const linkBtn = track.trackUrl
    ? `<a class="music-card-btn" href="${escapeHtml(track.trackUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation();" aria-label="Apple Music에서 듣기">↗</a>`
    : '';
  // 사용자 명시 2026-05-02 ultrathink: 🎵 emoji → waveform SVG. onerror 시 innerHTML 으로 SVG 대체.
  const art = track.artworkUrl
    ? `<img class="music-card-art" src="${escapeHtml(track.artworkUrl)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'music-card-art music-card-art-placeholder',innerHTML:'<svg viewBox=&quot;0 0 24 24&quot; width=&quot;1em&quot; height=&quot;1em&quot; fill=&quot;currentColor&quot; class=&quot;music-wave-icon&quot;><rect x=&quot;2&quot; y=&quot;6&quot; width=&quot;2.4&quot; height=&quot;12&quot; rx=&quot;1.2&quot;/><rect x=&quot;6.4&quot; y=&quot;10&quot; width=&quot;2.4&quot; height=&quot;4&quot; rx=&quot;1.2&quot;/><rect x=&quot;10.8&quot; y=&quot;4&quot; width=&quot;2.4&quot; height=&quot;16&quot; rx=&quot;1.2&quot;/><rect x=&quot;15.2&quot; y=&quot;9&quot; width=&quot;2.4&quot; height=&quot;6&quot; rx=&quot;1.2&quot;/><rect x=&quot;19.6&quot; y=&quot;7&quot; width=&quot;2.4&quot; height=&quot;10&quot; rx=&quot;1.2&quot;/></svg>'}))">`
    : `<div class="music-card-art music-card-art-placeholder">${_MUSIC_WAVE_SVG}</div>`;
  return `
    <div class="music-card-wrap">
      ${removeBtn}
      <div class="music-card">
        ${art}
        <div class="music-card-info">
          <div class="music-card-title">${escapeHtml(track.title || '')}</div>
          <div class="music-card-artist">${escapeHtml(track.artist || '')}</div>
        </div>
        <div class="music-card-actions">${playBtn}${linkBtn}</div>
      </div>
    </div>
  `;
}

// 사용자 명시 2026-05-02: 진주 음악 — 5 서비스 (YouTube Music / Spotify / Apple Music / Melon / Genie) 중 사용자 선택.
// 첫 click = 선택 모달 / 이후 = 자동 진입 / ⋯ 메뉴로 변경.
const _MUSIC_SERVICES = [
  { id: 'youtube', label: 'YouTube Music', icon: '🎵' },
  { id: 'spotify', label: 'Spotify', icon: '🟢' },
  { id: 'apple', label: 'Apple Music', icon: '🍎' },
  { id: 'melon', label: 'Melon', icon: '🍈' },
  { id: 'genie', label: 'Genie', icon: '🧞' }
];
function _getMusicServiceUrl(track, service) {
  if (!track) return null;
  // Apple Music = 시드 trackUrl 직접 (정확한 곡)
  if (service === 'apple' && track.trackUrl) return track.trackUrl;
  const q = encodeURIComponent(`${track.artist || ''} ${track.title || ''}`.trim());
  switch (service) {
    case 'youtube': return `https://music.youtube.com/search?q=${q}`;
    case 'spotify': return `https://open.spotify.com/search/${q}`;
    case 'apple':   return `https://music.apple.com/us/search?term=${q}`;
    case 'melon':   return `https://www.melon.com/search/song/index.htm?q=${q}`;
    case 'genie':   return `https://www.genie.co.kr/search/searchSong?query=${q}`;
    default: return track.trackUrl || `https://music.apple.com/us/search?term=${q}`;
  }
}
function _openMusicService(track) {
  if (!track) return;
  const pref = state && state.preferences && state.preferences.preferredMusicService;
  if (!pref) {
    showMusicServiceChooser(track, true);
    return;
  }
  const url = _getMusicServiceUrl(track, pref);
  if (url) window.open(url, '_blank', 'noopener');
}
function _openMusicServiceByPearlId(id) {
  if (!id || !Array.isArray(state.pearls)) return;
  const p = state.pearls.find(x => x && x.id === id);
  if (!p || !p.track) return;
  _openMusicService(p.track);
}
function showMusicServiceChooser(track, savePreference) {
  if (!track) return;
  if (document.getElementById('musicServiceOverlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay show';
  overlay.style.zIndex = '10001';
  overlay.id = 'musicServiceOverlay';
  const buttons = _MUSIC_SERVICES.map(s => `
    <button class="input-modal-btn" data-service="${s.id}" style="display:flex; align-items:center; gap:10px; padding:12px 14px; text-align:left; font-size:14px;">
      <span style="font-size:18px;">${s.icon}</span>
      <span style="flex:1;">${s.label}</span>
    </button>
  `).join('');
  overlay.innerHTML = `
    <div class="input-modal" style="max-width:340px; padding:22px;">
      <div style="font-size:16px; font-weight:600; color:var(--text); margin-bottom:6px;">🎵 어디서 들을까?</div>
      <div style="font-size:12px; color:var(--text-dim); margin-bottom:14px; line-height:1.6;">
        ${savePreference ? '한 번 고르면 다음부터 자동.<br>변경은 진주 안 ⋯ 에서.' : '바꿔봐 — 다음부터 이 서비스로.'}
      </div>
      <div style="display:flex; flex-direction:column; gap:6px;">${buttons}</div>
      <button class="btn-secondary" onclick="document.getElementById('musicServiceOverlay')?.remove()" style="margin-top:12px; width:100%;">취소</button>
    </div>
  `;
  document.body.appendChild(overlay);
  // button click 핸들링
  overlay.querySelectorAll('button[data-service]').forEach(btn => {
    btn.onclick = () => {
      const svc = btn.dataset.service;
      // preference 저장
      state.preferences = state.preferences || {};
      state.preferences.preferredMusicService = svc;
      saveState();
      // 진입
      const url = _getMusicServiceUrl(track, svc);
      if (url) window.open(url, '_blank', 'noopener');
      overlay.remove();
    };
  });
}

let _currentMusicAudio = null;
let _currentMusicBtn = null;
// 사용자 요청 2026-04-28: V3 동작 참고 — 에러 핸들링 + autoplay 정책 대응 강화
function toggleMusicPreview(btn, url) {
  if (!url) { showToast('재생할 음원 URL이 없어'); return; }
  // 사용자 보고 2026-05-01: 연간 리뷰 BGM (window._annAudio) 와 중첩 차단 — 진주 미리듣기 시 강제 pause.
  if (window._annAudio && !window._annAudio.paused) {
    try { window._annAudio.pause(); } catch {}
  }
  if (_currentMusicAudio && _currentMusicBtn !== btn) {
    try { _currentMusicAudio.pause(); } catch {}
    if (_currentMusicBtn) {
      _currentMusicBtn.textContent = '▶';
      _currentMusicBtn.classList.remove('playing');
    }
    _currentMusicAudio = null;
    _currentMusicBtn = null;
  }
  if (_currentMusicAudio && _currentMusicBtn === btn) {
    if (_currentMusicAudio.paused) {
      _currentMusicAudio.play().then(() => {
        btn.textContent = '⏸';
        btn.classList.add('playing');
      }).catch(e => {
        console.warn('audio play failed:', e);
        showToast('재생 실패: ' + (e.message || '알 수 없는 오류'));
      });
    } else {
      _currentMusicAudio.pause();
      btn.textContent = '▶';
      btn.classList.remove('playing');
    }
    return;
  }
  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = url;
  audio.addEventListener('ended', () => {
    btn.textContent = '▶';
    btn.classList.remove('playing');
    _currentMusicAudio = null;
    _currentMusicBtn = null;
  });
  audio.addEventListener('error', (e) => {
    console.warn('audio error:', e, url);
    btn.textContent = '▶';
    btn.classList.remove('playing');
    // 사용자 명시 2026-05-01 (agent audit): URL 만료 / 지역 차단 / link rot 시 button 자체 숨김 — 토스트 반복 차단.
    btn.style.display = 'none';
    showToast('음원 만료됨 — 미리듣기 button 숨김');
    _currentMusicAudio = null;
    _currentMusicBtn = null;
  });
  // 사용자 클릭 직후 즉시 play (gesture 유효)
  const playPromise = audio.play();
  _currentMusicAudio = audio;
  _currentMusicBtn = btn;
  btn.textContent = '⏸';
  btn.classList.add('playing');
  if (playPromise && typeof playPromise.then === 'function') {
    playPromise.catch(e => {
      console.warn('audio play failed:', e);
      btn.textContent = '▶';
      btn.classList.remove('playing');
      showToast('재생 실패: ' + (e.message || '브라우저 정책'));
      _currentMusicAudio = null;
      _currentMusicBtn = null;
    });
  }
}

// 체크인 화면 — 음악 슬롯 렌더 + 추가/제거
function renderCheckinMusicSlot() {
  const slot = document.getElementById('checkinMusicSlot');
  if (!slot) return;
  if (currentCheckin && currentCheckin.music) {
    slot.innerHTML = renderMusicCardHTML(currentCheckin.music, { onRemove: 'removeCheckinMusic()' });
  } else {
    slot.innerHTML = `
      <button class="music-add-btn" onclick="addCheckinMusic()">
        <span style="font-size:16px;">${_MUSIC_WAVE_SVG}</span>
        <span>음악</span>
      </button>
    `;
  }
}
function addCheckinMusic() {
  showMusicSearchModal((track) => {
    if (!currentCheckin) currentCheckin = {};
    currentCheckin.music = track;
    renderCheckinMusicSlot();
  });
}
function removeCheckinMusic() {
  if (currentCheckin) delete currentCheckin.music;
  renderCheckinMusicSlot();
}

// V4-fix: 체크인 사진 슬롯 (음악 왼쪽 작은 정사각)
function renderCheckinPhotoSlot() {
  const slot = document.getElementById('checkinPhotoSlot');
  if (!slot) return;
  if (currentCheckin && currentCheckin.photo) {
    slot.innerHTML = `
      <div class="checkin-photo-card">
        <img src="${currentCheckin.photo}" alt="" class="checkin-photo-img">
        <button class="checkin-photo-remove" onclick="removeCheckinPhoto()" aria-label="제거">✕</button>
      </div>
    `;
  } else {
    slot.innerHTML = `
      <button class="checkin-photo-add-btn" onclick="addCheckinPhoto()">
        <span class="cpa-icon">📷</span>
        <span class="cpa-label">사진</span>
      </button>
    `;
  }
}
async function addCheckinPhoto() {
  try {
    const file = await pickPhotoFile();
    if (!file) return;
    showFullscreenLoader('사진 처리 중... 📸');
    const resized = await fileToResizedDataUrl(file, 800);
    const square = await makeSquareThumb(resized, 600);
    hideFullscreenLoader();
    if (!currentCheckin) currentCheckin = {};
    currentCheckin.photo = square;
    renderCheckinPhotoSlot();
  } catch (e) {
    hideFullscreenLoader();
    console.warn('checkin photo failed:', e);
    showToast('사진 처리 실패');
  }
}
function removeCheckinPhoto() {
  if (currentCheckin) delete currentCheckin.photo;
  renderCheckinPhotoSlot();
}

async function addPearl() {
  // V4 (사용자 명시 2026-05-06 ultrathink — 추가): 첫 진주 진입 → V8 진주 튜토리얼 (시뮬) fire.
  if (typeof shouldRunFirstPearlTutorial === 'function' && shouldRunFirstPearlTutorial()) {
    runFirstPearlTutorialV8().catch(e => console.warn('[pearl tutorial]', e));
    return;
  }
  // V4 (사용자 명시 2026-05-14 ultrathink): 카테고리 5 → 7개 (티켓/책).
  const baseCategories = state.preferences?.pearlBasketCategories || ['음악', '음식', '장소', '순간', '사람'];
  const categories = baseCategories.concat(['티켓', '책']);
  const iconMap = { 음악: '🎵', 음식: '🍴', 장소: '📍', 순간: '✨', 사람: '👥', 티켓: '🎫', 책: '📚' };

  // V4 (사용자 명시 2026-05-14): 카테고리 필터된 상태에서 + 버튼 클릭 → 카테고리 모달 skip 하고 바로 그 카테고리.
  //   '전체' (null) 일 때만 카테고리 선택 모달 노출.
  let category = null;
  if (typeof _pearlCatFilter !== 'undefined' && _pearlCatFilter && categories.includes(_pearlCatFilter)) {
    category = _pearlCatFilter;
  } else {
    const options = categories.map(c => ({
      label: `${iconMap[c] || '💎'} ${c}`,
      value: c
    }));
    const picked = await showOptionsModal({
      title: '어떤 진주? 💎',
      message: '',
      options
    });
    if (!picked) return;
    category = picked.trim();
  }

  // V4 (사용자 명시 2026-05-14 ultrathink): 티켓 / 책 분기 (도서관 + 버튼 진입).
  //   sub-filter 도 누른 상태면 sub-type 도 prefill (영화 chip 활성 → 바로 영화 form).
  if (category === '티켓' && typeof saveTicketPearl === 'function') {
    const prefSub = (typeof _ticketSubFilter !== 'undefined' && _ticketSubFilter) ? _ticketSubFilter : null;
    await saveTicketPearl({ source: 'tab', prefillSubTypeId: prefSub });
    return;
  }
  if (category === '책' && typeof saveBookPearl === 'function') {
    await saveBookPearl({ source: 'tab' });
    return;
  }

  // V3.13.x: 음악 카테고리 → iTunes 검색 모달로 곡 선택
  if (category === '음악') {
    showMusicSearchModal(async (track) => {
      const note = await showInputModal({
        title: `💎 음악 — ${track.title}`,
        message: '메모 한 줄 (선택). 비우고 OK 가능.',
        placeholder: '예: 그날 노을 / 그 한 마디 / 그 곡 들었던 밤',
        okLabel: '보관'
      });
      if (note === null) return;
      state.pearls.push({
        id: 'pearl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        category: '음악',
        track,
        content: track.title,
        note: (note || '').trim() || null,
        createdAt: new Date().toISOString(),
        type: 'pearl'
      });
      saveState();
      renderLensPearls();
      showToast('진주 추가됨 💎');
    });
    return;
  }

  // 사용자 요청 2026-04-29: 카테고리별 자연스러운 placeholder
  const placeholderMap = {
    음식: { title: '예: 라멘',                memo: '예: 신촌 그 집, 짠한 국물' },
    장소: { title: '예: 한강 산책',           memo: '예: 노을 진 시각, 바람' },
    순간: { title: '예: 친구랑 한강에서 치맥', memo: '예: 친구들이랑 오랜만에 좋았음' },
    사람: { title: '예: 친구 ㅇㅇ',          memo: '예: 오랜만에 풀린 마음' }
  };
  const ph = placeholderMap[category] || { title: '한 줄로', memo: '구체적으로 한 줄' };

  const content = await showInputModal({
    title: `💎 ${category}`,
    message: '뭐가 좋았어? 한 줄로.',
    placeholder: ph.title,
    okLabel: '다음 →'
  });
  if (!content || !content.trim()) return;

  // 사용자 요청 2026-04-29: 모든 카테고리에 작은 메모 한 줄 입력 옵션 (음악처럼)
  const note = await showInputModal({
    title: `💎 ${category} — ${content.trim()}`,
    message: '구체적으로 한 줄 (선택). 비우고 OK 가능.',
    placeholder: ph.memo,
    okLabel: ['음식', '장소', '순간'].includes(category) ? '다음 →' : '보관'
  });
  if (note === null) return;

  // V4-fix: 음식/장소/순간은 사진 첨부 옵션 (음악 앨범아트 풍 — 정사각 600px)
  // V4: 동영상 옵션 추가 (3초 / 720p / WebCodecs 압축) — 썸네일 사진 패턴 동일.
  // 사용자 명시 2026-05-09: 5초 → 3초로 단축 + 라벨 괄호 표기 제거.
  let photo = null;
  let videoData = null;
  let videoThumb = null;
  let videoHasAudio = null;  // 사용자 명시 2026-05-02 ultrathink: 무음 영상 시각 안내용 메타.
  let videoAudioMeta = null;  // 사용자 보고 2026-05-09: audio chunks/codec/sr/ch — 진주 view 모달 + push toast 에 진단 표시.
  if (['음식', '장소', '순간'].includes(category)) {
    const mediaChoice = await showOptionsModal({
      title: '미디어 첨부 (선택)',
      message: '사진/동영상 보탤까? 글만도 OK.',
      options: [
        { label: '📷 사진', value: 'photo' },
        { label: '📹 동영상', value: 'video' },
        { label: '글만 보관', value: 'none' }
      ]
    });
    if (mediaChoice === 'photo') {
      try {
        const file = await pickPhotoFile();
        if (file) {
          showFullscreenLoader('사진 처리 중... 📸');
          const resized = await fileToResizedDataUrl(file, 800);
          const square = await makeSquareThumb(resized, 600);
          photo = square;
          hideFullscreenLoader();
        }
      } catch (e) {
        hideFullscreenLoader();
        console.warn('photo failed:', e);
        showToast('사진 처리 실패. 글만 저장.');
      }
    } else if (mediaChoice === 'video') {
      const existingVideos = (state.pearls || []).filter(p => p.video).length;
      if (existingVideos >= 10) {
        showToast('동영상 진주는 10개까지 — 오래된 거 정리하고 다시 시도');
      } else {
        try {
          const file = await pickVideoFile();
          if (file) {
            // 입력 가드: 100MB / 60초 이하 (압축 후 3초로 자름)
            if (file.size > 100_000_000) {
              showToast(`동영상 너무 큼 (${(file.size/1e6).toFixed(0)}MB) — 100MB 이하`);
            } else {
              showFullscreenLoader('동영상 길이 확인 중... 📹');
              const dur = await _getVideoDuration(file);
              hideFullscreenLoader();
              // V4 fix v6 (사용자 보고 ultrathink 2026-05-04): dur Infinity (live HLS / 일부 .mov) / NaN / 0 케이스 가드.
              // 그대로 dur > 3 분기 들어가면 trim modal 안에서 또 cleanup 되어 "자르기 취소됨" 잘못 안내.
              if (dur < 0 || !Number.isFinite(dur) || dur <= 0.05) {
                showToast('동영상 길이 읽기 실패 — 다른 영상 시도');
              } else {
                // 사용자 명시 2026-05-09: 3초 초과 = trim modal 띄워서 사용자가 구간 선택. 3초 이하 = modal X.
                // 사용자 명시 2026-05-10 (재정정): trim modal 안에는 video preview / thumbnail 미리보기 X (손잡이 + 시간 라벨만).
                let trimStart = 0;
                if (dur > 3) {
                  const range = await pickVideoTrimRange(file, 3);
                  if (!range) {
                    // 사용자 cancel
                    showToast('자르기 취소됨');
                    return;
                  }
                  trimStart = range.startTime;
                }
                showFullscreenLoader('동영상 압축 중... 📹');
                try {
                  const result = await compressVideoWebCodecs(file, {
                    maxSec: 3, targetHeight: 720, bitrate: 1_500_000, fps: 30,
                    startTime: trimStart
                  });
                  const dataUrl = result.videoUrl;
                  const approxBytes = Math.round((dataUrl.length - (dataUrl.indexOf(',') + 1)) * 0.75);
                  hideFullscreenLoader();
                  if (approxBytes > 5_000_000) {
                    showToast(`압축 후도 큼 (${(approxBytes/1e6).toFixed(1)}MB) — 짧은 영상 시도`);
                  } else {
                    videoData = dataUrl;
                    videoThumb = result.thumbnail;
                    videoHasAudio = !!result.hasAudio;
                    videoAudioMeta = result.audioMeta || null;
                    // 사용자 명시 2026-05-09 (재정정): 진단 modal/toast UI 제거 — Safari PWA / 데스크탑 Chrome 둘 다 무음
                    // = mp4 자체 audio track 호환성 issue (iOS quirk 무관). 임시 진단 코드 제거 후 큰 작업 (Opus / 다른 muxer) 진행 예정.
                    // videoAudioMeta stash 는 유지 (다음 fix 시 활용 가능).
                  }
                } catch (compressErr) {
                  hideFullscreenLoader();
                  console.error('compress error:', compressErr, compressErr && compressErr.stack);
                  const msg = (compressErr && (compressErr.message || compressErr.toString())) || '알 수 없는 오류';
                  const stack = (compressErr && compressErr.stack) ? '\n\n[stack]\n' + compressErr.stack.slice(0, 400) : '';
                  showErrorDetailModal('동영상 압축 실패', msg + stack);
                  // 사용자 보고 2026-05-09: compress fail 시 진주 push 막음 — 옛 흐름은 push 진행해서
                  // video 필드 X 진주가 남았음 (사용자 = "저장 됐는데 안 나옴"). 명확히 abort.
                  return;
                }
              }
            }
          }
        } catch (e) {
          hideFullscreenLoader();
          console.warn('video failed:', e);
          showToast('동영상 처리 실패. 글만 저장.');
        }
      }
    }
  }

  state.pearls.push({
    id: 'pearl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    content: content.trim(),
    category,
    note: (note || '').trim() || null,
    ...(photo ? { photo } : {}),
    ...(videoData ? { video: videoData } : {}),
    ...(videoThumb ? { videoThumbnail: videoThumb } : {}),
    // 사용자 명시 2026-05-02 ultrathink: 무음 영상 메타 (옛 진주 = undefined / 새 진주 = true|false).
    ...(videoHasAudio !== null ? { videoHasAudio } : {}),
    // 사용자 보고 2026-05-09: audio chunks/codec/sr/ch 진주 stash — view 모달 진단 표시.
    ...(videoAudioMeta ? { videoAudioMeta } : {}),
    createdAt: new Date().toISOString(),
    type: 'pearl'
  });
  saveState();
  renderLensPearls();
  // 사용자 명시 2026-05-09 (재정정): 진단 audio meta toast 합침 제거 — 큰 작업 (Opus / 다른 muxer) 으로 진짜 fix 예정.
  showToast('진주 추가됨 💎');
}

// 사용자 요청 2026-04-29: 진주 클릭 = 큰 보기 모달. 수정/삭제 등은 더보기 ⋮ 메뉴.
async function openPearl(id) {
  const pearl = state.pearls.find(p => p.id === id);
  if (!pearl) return;
  showPearlViewModal(pearl);
}

function showPearlViewModal(pearl) {
  // 기존 모달 제거
  document.querySelectorAll('.pearl-view-overlay').forEach(o => o.remove());
  const isMusic = pearl.category === '음악' && pearl.track;
  const isVideo = !!pearl.video;
  const isPhoto = !isVideo && !!pearl.photo;
  const iconMap = { 음악: '🎵', 음식: '🍴', 장소: '📍', 순간: '✨', 사람: '👥' };
  const icon = iconMap[pearl.category] || '💎';
  const dateStr = pearl.createdAt
    ? new Date(pearl.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  let mediaHtml = '';
  if (isMusic) {
    const artUrl = pearl.track.artworkUrl || '';
    const playBtn = pearl.track.previewUrl
      ? `<button class="pearl-view-play" onclick="_pearlViewPlayPreview('${escapeHtml(pearl.track.previewUrl)}', this)" aria-label="미리듣기">▶</button>`
      : '';
    // 사용자 명시 2026-05-02: 5 서비스 분기 + ⋯ 메뉴로 변경.
    const appleBtn = (pearl.track.trackUrl || pearl.track.title)
      ? `<div style="display:flex; gap:6px; align-items:center;">
           <button class="pearl-view-apple" onclick="_openMusicServiceByPearlId('${escapeHtml(pearl.id)}')" aria-label="음악 듣기" style="flex:1;">${_MUSIC_WAVE_SVG} 음악 듣기</button>
           <button class="pearl-view-music-more" onclick="(function(){ const p = state.pearls.find(x => x && x.id === '${escapeHtml(pearl.id)}'); if (p && p.track) showMusicServiceChooser(p.track, true); })()" aria-label="음악 서비스 변경" title="다른 서비스로 듣기">⋯</button>
         </div>`
      : '';
    mediaHtml = `
      <div class="pearl-view-media${artUrl ? '' : ' no-art'}">
        ${artUrl ? `<img src="${escapeHtml(artUrl)}" alt="" class="pearl-view-art" onerror="this.onerror=null;this.style.display='none';this.parentElement.classList.add('art-failed');">` : `<div class="pearl-view-art-placeholder">${_MUSIC_WAVE_SVG}</div>`}
        ${playBtn}
      </div>
      <div class="pearl-view-music-meta">
        <div class="pearl-view-title">${escapeHtml(pearl.track.title || pearl.content || '')}</div>
        <div class="pearl-view-sub">${escapeHtml(pearl.track.artist || '')}</div>
        ${appleBtn ? `<div style="margin-top:10px;">${appleBtn}</div>` : ''}
      </div>
    `;
  } else if (isVideo) {
    // 사용자 명시 2026-05-02 ultrathink: 무음 영상 메타 안내.
    // 사용자 명시 2026-05-10 (재정정): hasAudio=true 호환성 한계 안내 제거 — 48k resample + Opus universal 로 fix 됨.
    let mutedNotice = '';
    if (pearl.videoHasAudio === false) {
      mutedNotice = '<div style="font-size:11px; color:var(--text-soft); margin-top:6px; opacity:0.75;">🔇 무음 영상 — 인코딩 시점 소리 추출 X</div>';
    } else if (pearl.videoHasAudio === undefined) {
      mutedNotice = '<div style="font-size:10.5px; color:var(--text-soft); margin-top:6px; opacity:0.6;">🔇 소리 안 들리면 옛 진주야 — 새로 만든 진주는 소리 같이 저장돼</div>';
    }
    // 사용자 명시 2026-05-04: 영상 진주 제목 = bare content (이모티콘 prefix 제거).
    // 사용자 보고 2026-05-10: 카테고리 이모지 prefix 누락 — 사진 진주 패턴 통일 (`${icon} ${content}`).
    const _vTitle = (typeof _stripLeadingEmoji === 'function') ? _stripLeadingEmoji(pearl.content || '') : (pearl.content || '');
    // V4 fix v6 (사용자 보고 ultrathink 2026-05-04): video src 가 hydratePearlVideos 비동기로 적용되는 동안 까만 화면 → 사용자가 "썸네일 안 보임 / 재생 X" 로 인식.
    // poster 속성에 videoThumbnail 박아서 hydrate 전 + 첫 ▶ 클릭 전까지 thumbnail 보이게.
    const _posterAttr = pearl.videoThumbnail ? ` poster="${escapeHtml(pearl.videoThumbnail)}"` : '';
    mediaHtml = `
      <div class="pearl-view-media">
        <video data-pearl-vid="${pearl.id}" class="pearl-view-photo" controls playsinline preload="metadata"${_posterAttr}></video>
      </div>
      <div class="pearl-view-text-meta">
        <div class="pearl-view-title">${icon} ${escapeHtml(_vTitle)}</div>
        ${mutedNotice}
      </div>
    `;
  } else if (isPhoto) {
    mediaHtml = `
      <div class="pearl-view-media">
        <img src="${pearl.photo}" alt="" class="pearl-view-photo">
      </div>
      <div class="pearl-view-text-meta">
        <div class="pearl-view-title">${icon} ${escapeHtml(pearl.content || '')}</div>
      </div>
    `;
  } else {
    mediaHtml = `
      <div class="pearl-view-text-only">
        <div class="pearl-view-icon">${icon}</div>
        <div class="pearl-view-title">${escapeHtml(pearl.content || '')}</div>
      </div>
    `;
  }

  const overlay = document.createElement('div');
  overlay.className = 'pearl-view-overlay';
  overlay.innerHTML = `
    <div class="pearl-view-modal" onclick="event.stopPropagation()">
      <div class="pearl-view-header">
        <span class="pearl-view-cat">${icon} ${escapeHtml(pearl.category)}</span>
        <div style="display:flex; gap:6px;">
          <button class="pearl-view-more" onclick="_pearlViewMore('${pearl.id}')" aria-label="더보기">⋮</button>
          <button class="pearl-view-close" onclick="_closePearlView()" aria-label="닫기">✕</button>
        </div>
      </div>
      <div class="pearl-view-body">
        ${mediaHtml}
        ${pearl.note ? `<div class="pearl-view-note">${escapeHtml(pearl.note)}</div>` : ''}
        ${dateStr ? `<div class="pearl-view-date">${dateStr}</div>` : ''}
      </div>
    </div>
  `;
  overlay.onclick = (e) => { if (e.target === overlay) _closePearlView(); };
  document.body.appendChild(overlay);
  if (typeof hydratePearlVideos === 'function') hydratePearlVideos();
}

function _closePearlView() {
  document.querySelectorAll('.pearl-view-overlay').forEach(o => o.remove());
  // 미리듣기 정지
  if (window._pearlAudio && !window._pearlAudio.paused) {
    try { window._pearlAudio.pause(); } catch (e) {}
  }
}

function _pearlViewPlayPreview(url, btn) {
  if (!window._pearlAudio) window._pearlAudio = new Audio();
  const audio = window._pearlAudio;
  if (audio.src === url && !audio.paused) {
    audio.pause();
    if (btn) btn.textContent = '▶';
    return;
  }
  audio.src = url;
  audio.volume = 0.5;
  audio.play().then(() => {
    if (btn) btn.textContent = '⏸';
    audio.onended = () => { if (btn) btn.textContent = '▶'; };
  }).catch(e => showToast('재생 실패'));
}

async function _pearlViewMore(id) {
  const pearl = state.pearls.find(p => p.id === id);
  if (!pearl) return;
  const isMusic = pearl.category === '음악' && pearl.track;
  const opts = [];
  if (isMusic) opts.push({ label: '🎵 곡 바꾸기', value: 'change_music' });
  opts.push({ label: '✏️ 제목 / 메모 수정', value: 'edit' });
  opts.push({ label: '🗑 삭제', value: 'delete' });

  const action = await showOptionsModal({
    title: `💎 ${pearl.category}`,
    message: pearl.content || '',
    options: opts
  });
  if (!action) return;

  if (action === 'delete') {
    const yes = await showConfirmModal({
      title: '정말 삭제할까?',
      message: pearl.content,
      okLabel: '삭제',
      cancelLabel: '취소'
    });
    if (yes) {
      state.pearls = state.pearls.filter(p => p.id !== id);
      saveState();
      renderLensPearls();
      showToast('삭제됨');
      _closePearlView();
    }
  } else if (action === 'edit') {
    // 제목 + 메모 두 단계 (음악은 제목 = track 자동, 메모만)
    if (!isMusic) {
      const updated = await showInputModal({
        title: `💎 ${pearl.category} — 제목 수정`,
        defaultValue: pearl.content,
        multiline: true,
        okLabel: '다음 →'
      });
      if (updated === null) return;
      if (updated.trim()) pearl.content = updated.trim();
    }
    const updatedNote = await showInputModal({
      title: `💎 ${pearl.category} — 메모 수정`,
      defaultValue: pearl.note || '',
      placeholder: '비우면 메모 X',
      okLabel: '저장'
    });
    // 사용자 보고 2026-05-10: 영상 진주 제목 수정 후 메모 modal cancel 시 제목 변경도 같이 날아감 fix.
    // 메모 cancel = 메모 변경 X (제목 변경은 위에서 이미 커밋). 제목 cancel 만 전체 abort.
    if (updatedNote !== null) {
      pearl.note = updatedNote.trim() || null;
    }
    // 사용자 보고 2026-05-10: 영상 진주는 dataURL 큼 → saveState(true) 강제 flush 로 변경 손실 방지.
    saveState(true);
    renderLensPearls();
    showToast('수정됨 ✦');
    // 모달 다시 열어서 변경 반영
    showPearlViewModal(pearl);
  } else if (action === 'change_music' && isMusic) {
    if (typeof showMusicSearchModal === 'function') {
      showMusicSearchModal((track) => {
        if (!track) return;
        pearl.track = track;
        if (track.title && track.artist) {
          pearl.content = `${track.artist} - ${track.title}`;
        }
        saveState();
        renderLensPearls();
        showToast('🎵 곡 변경됨');
        // 모달 다시 열어서 변경 반영
        showPearlViewModal(pearl);
      });
    } else {
      showToast('음악 검색 기능 X');
    }
  }
}

