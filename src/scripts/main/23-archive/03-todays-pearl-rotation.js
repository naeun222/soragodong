// V4-1t: 🌟 오늘의 너 — 진주 1개 회전 (안 본 진주 우선)
// V4 (사용자 명시 2026-05-05): 도서관 hero + 홈 메인 카드 자리 — 동일 헬퍼 공유.
//   _pickHeroPearl() → 진주 1개 선택 (rotation + seed pin)
//   _heroCardHtml(pick) → 카드 HTML 문자열 (음악/영상/사진/텍스트 분기)
function _pickHeroPearl() {
  const pearls = (state.pearls || []).filter(p => p.type !== 'dna_pearl');
  if (pearls.length === 0) return null;
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
  return pick;
}

function _heroCardHtml(pick, opts = {}) {
  if (!pick) return '';
  // V4 (사용자 명시 2026-05-05): 홈 hero 클릭 → 진주 탭으로 이동.
  //   도서관 hero 클릭 → 기존대로 진주 모달.
  // V4 (사용자 명시 2026-05-17 ultrathink): opts.dismissCall = priority stack dismiss 주입 (회전카드 source 일 때만).
  //   onclick 문자열 prefix 로 박혀서 play button stopPropagation 도 자연 회피 (play 시 카드 dismiss X).
  // 사용자 명시 2026-05-18 ultrathink Phase 3: 진주 탭 분리 — showScreen('pearls') 직접 이동 (옛 archive + switchLibraryCat('pearls') 폐기).
  const dismissCallStr = opts.dismissCall || '';
  const cardOnClick = opts.linkTo === 'pearls-tab'
    ? `${dismissCallStr}showScreen('pearls');`
    : `openPearl('${pick.id}')`;
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
  } else if (pearlHasMedia(pick, 'video')) {
    // V4 (사용자 명시): 동영상 진주 — 썸네일만 (사진과 동일 layout). 클릭 시 모달에서 재생.
    // V4 (사용자 명시 2026-05-18 ultrathink): Phase 1D — pearlImgHtml 이 옛 dataURL / 신 storageKey 자동 분기.
    const iconMap = { 음식: '🍴', 장소: '📍', 순간: '✨', 사람: '👥', 기타: '💎' };
    const icon = iconMap[pick.category || '기타'] || '💎';
    const thumbImg = pearlImgHtml(pick, 'videoThumbnail', { cls: 'hero-photo-thumb', alt: '' });
    const visual = thumbImg
      ? thumbImg
      : `<div class="hero-photo-thumb video-thumb-placeholder">📹</div>`;
    // 사용자 명시 2026-05-04: 영상 진주 제목 = bare content (이모티콘 prefix 제거).
    // 사용자 보고 2026-05-10: 카테고리 이모지 prefix 누락 — 사진 진주 패턴 통일.
    const _vTitle = (typeof _stripLeadingEmoji === 'function') ? _stripLeadingEmoji(pick.content || '') : (pick.content || '');
    body = `
      <div class="hero-photo">
        ${visual}
        <div class="hero-photo-meta">
          <div class="hero-photo-content">${icon} ${escapeHtml(_vTitle)}</div>
          ${pick.note ? `<div class="hero-note">${escapeHtml(pick.note)}</div>` : ''}
        </div>
      </div>
    `;
  } else if (pearlHasMedia(pick, 'photo')) {
    // V4-fix: 사진 진주 — 정방형 작은 thumbnail (hero 카드 세로 길이 안 늘림)
    // V4 (사용자 명시 2026-05-18 ultrathink): Phase 1D — pearlImgHtml 이 옛 dataURL / 신 storageKey 자동 분기.
    const iconMap = { 음식: '🍴', 장소: '📍', 순간: '✨', 사람: '👥', 기타: '💎' };
    const icon = iconMap[pick.category || '기타'] || '💎';
    body = `
      <div class="hero-photo">
        ${pearlImgHtml(pick, 'photo', { cls: 'hero-photo-thumb', alt: '' })}
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

  return `
    <div class="library-hero" onclick="${cardOnClick}">
      <div class="hero-label">🌟 오늘의 너</div>
      ${body}
      <div class="hero-meta">${escapeHtml(pick.category || '')}${dateStr ? ` · ${dateStr}` : ''}</div>
    </div>
  `;
}

// V4 (사용자 명시 2026-05-05): 진주 0개 — 빈 카드 대신 '첫 진주 유도' 카드 (홈 + 도서관 공통)
function _heroEmptyHtml() {
  return `
    <div class="library-hero hero-empty" onclick="addPearl()">
      <div class="hero-label">💎 첫 진주</div>
      <div class="hero-empty-body">
        <div class="hero-empty-title">살아있다 느낀 순간을 모아봐요</div>
        <div class="hero-empty-sub">좋았던 곡 · 한 끼 · 풍경 · 사람 — 한 줄로</div>
        <div class="hero-empty-cta">+ 첫 진주 추가</div>
      </div>
    </div>
  `;
}

function renderLibraryHero() {
  const container = document.getElementById('libraryHero');
  if (!container) return;
  const pick = _pickHeroPearl();
  container.innerHTML = pick ? _heroCardHtml(pick) : _heroEmptyHtml();
}

