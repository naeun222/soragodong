
// V4-1z: Stories 컴포넌트 (분기/연간 리뷰 Replay식)
// 진지(변화/진화/AI 새 특징/패턴/narrative) + 감성(hook/곡/진주/재미/시) 5:5
let _storiesState = null;

async function openQuarterlyStories(reviewId) {
  const review = (state.quarterlyReviews || []).find(r => r.id === reviewId);
  if (!review) {
    showToast('분기 리뷰 데이터 없음');
    return;
  }
  const slides = await buildQuarterlySlides(review);
  _openStoriesPlayer(slides, 'quarterly');
}

function _openStoriesPlayer(slides, type) {
  if (!Array.isArray(slides) || slides.length === 0) {
    showToast('표시할 슬라이드 없음');
    return;
  }
  // V4-fix: 진주 음악 모음 (previewUrl 있는 것만, 슬라이드 cycle용)
  const musicTracks = (state.pearls || [])
    .filter(p => p.category === '음악' && p.track && p.track.previewUrl)
    .map(p => p.track);
  const muted = !!(state.preferences && state.preferences.storiesMuted);
  _storiesState = {
    slides,
    idx: 0,
    type,
    autoTimer: null,
    paused: false,
    fillTimer: null,
    fillStart: 0,
    fillElapsed: 0,
    musicTracks,
    musicAudio: null,
    muted
  };
  const overlay = document.getElementById('storiesOverlay');
  if (!overlay) return;
  overlay.style.display = 'block';
  const chatBar = document.getElementById('chatInputBar');
  if (chatBar) chatBar.style.visibility = 'hidden';
  const reflBar = document.getElementById('reflectionInputBar');
  if (reflBar) reflBar.classList.remove('active');
  // mute 버튼 초기 상태
  const muteBtn = document.getElementById('storiesMuteBtn');
  if (muteBtn) {
    muteBtn.textContent = muted ? '🔇' : '🔊';
    // 음악 진주 X면 mute 버튼 숨김
    muteBtn.style.display = musicTracks.length > 0 ? '' : 'none';
  }
  _renderStoriesProgress();
  _renderStoriesSlide();
  _startStoriesAutoTimer();
  // 사용자 명시 2026-05-09 ultrathink: 첫 진입 시 long-press / tap onboarding hint (한 번만, 4초 페이드).
  _showStoriesHintOnce();
}

function _showStoriesHintOnce() {
  if (state.preferences && state.preferences.storiesHintShown) return;
  const overlay = document.getElementById('storiesOverlay');
  if (!overlay) return;
  const existing = document.getElementById('storiesOnboardHint');
  if (existing) return;
  const hint = document.createElement('div');
  hint.id = 'storiesOnboardHint';
  hint.style.cssText = 'position:fixed; bottom:90px; left:50%; transform:translateX(-50%); z-index:101; background:rgba(0,0,0,0.72); color:rgba(255,255,255,0.92); padding:10px 18px; border-radius:24px; font-size:12.5px; backdrop-filter:blur(8px); pointer-events:none; opacity:0; transition:opacity 0.4s; white-space:nowrap; font-family:"Noto Sans KR",system-ui;';
  hint.textContent = '👆 길게 누르면 멈춰  ·  좌·우 탭 = 이전·다음';
  overlay.appendChild(hint);
  setTimeout(() => { hint.style.opacity = '1'; }, 400);
  setTimeout(() => {
    hint.style.opacity = '0';
    setTimeout(() => { try { hint.remove(); } catch {} }, 500);
  }, 4500);
  if (!state.preferences) state.preferences = {};
  state.preferences.storiesHintShown = true;
  if (typeof saveState === 'function') saveState();
}

// V4-fix: Stories 음소거 토글
function toggleStoriesMute() {
  if (!_storiesState) return;
  _storiesState.muted = !_storiesState.muted;
  if (!state.preferences) state.preferences = {};
  state.preferences.storiesMuted = _storiesState.muted;
  saveState();
  const muteBtn = document.getElementById('storiesMuteBtn');
  if (muteBtn) muteBtn.textContent = _storiesState.muted ? '🔇' : '🔊';
  if (_storiesState.muted) {
    if (_storiesState.musicAudio) {
      try { _storiesState.musicAudio.pause(); } catch {}
    }
    const info = document.getElementById('storiesMusicInfo');
    if (info) info.classList.remove('show');
  } else {
    _playStoriesSlideMusic();
  }
}

// V4-fix v3 (사용자 요청): 한 슬라이드마다 다른 곡 — 음악 진주 X면 안 나옴
function _playStoriesSlideMusic() {
  if (!_storiesState || _storiesState.muted) return;
  if (!_storiesState.musicTracks || _storiesState.musicTracks.length === 0) return;
  const trackIdx = _storiesState.idx % _storiesState.musicTracks.length;
  const track = _storiesState.musicTracks[trackIdx];
  if (!track || !track.previewUrl) return;
  // 이미 같은 트랙 재생 중이면 skip (슬라이드 변경 시 끊김 X)
  if (_storiesState.musicAudio && _storiesState.musicAudio.src === track.previewUrl && !_storiesState.musicAudio.paused) {
    return;
  }
  // 사용자 보고 2026-04-28: 자동 슬라이드 넘김 시 음악 안 나오던 버그 — autoplay 정책 (user gesture 없으면 새 Audio 차단)
  // 같은 audio element 재활용 + src 교체로 unlock 유지 (첫 play는 stories open 시 user gesture로 발생)
  let audio;
  if (_storiesState.musicAudio) {
    audio = _storiesState.musicAudio;
    try { audio.pause(); } catch {}
    audio.src = track.previewUrl;
  } else {
    audio = new Audio(track.previewUrl);
    audio.loop = true;
    _storiesState.musicAudio = audio;
  }
  audio.volume = 0;
  const playPromise = audio.play();
  if (playPromise && playPromise.then) {
    playPromise.then(() => {
      // fade-in 0.3s
      let v = 0;
      const targetVol = 0.45;
      const fadeStep = setInterval(() => {
        v += 0.05;
        if (v >= targetVol) { v = targetVol; clearInterval(fadeStep); }
        audio.volume = v;
      }, 60);
    }).catch(e => console.warn('stories music play failed:', e));
  }
  // music info 표시
  const info = document.getElementById('storiesMusicInfo');
  if (info) {
    info.innerHTML = `
      <div class="stories-music-info-art">${track.artworkUrl ? `<img src="${escapeHtml(track.artworkUrl)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.parentElement.innerHTML='🎵'">` : '🎵'}</div>
      <div class="stories-music-info-text">${escapeHtml(track.title || '')} — ${escapeHtml(track.artist || '')}</div>
    `;
    info.classList.add('show');
  }
}

function closeStories() {
  if (_storiesState) {
    if (_storiesState.autoTimer) clearTimeout(_storiesState.autoTimer);
    if (_storiesState.fillTimer) clearInterval(_storiesState.fillTimer);
    // V4-fix: 배경 음악 멈춤
    if (_storiesState.musicAudio) {
      try { _storiesState.musicAudio.pause(); } catch {}
      _storiesState.musicAudio = null;
    }
  }
  _storiesState = null;
  const overlay = document.getElementById('storiesOverlay');
  if (overlay) overlay.style.display = 'none';
  const info = document.getElementById('storiesMusicInfo');
  if (info) info.classList.remove('show');
  const chatBar = document.getElementById('chatInputBar');
  if (chatBar) chatBar.style.visibility = '';
  // 일반 음악 미리듣기도 멈춤
  if (_currentMusicAudio) {
    try { _currentMusicAudio.pause(); } catch {}
    _currentMusicAudio = null;
    _currentMusicBtn = null;
  }
}

function storiesNext() {
  if (!_storiesState) return;
  if (_storiesState.idx < _storiesState.slides.length - 1) {
    _storiesState.idx += 1;
    _renderStoriesProgress();
    _renderStoriesSlide();
    _startStoriesAutoTimer();
  } else {
    closeStories();
  }
}

function storiesPrev() {
  if (!_storiesState) return;
  if (_storiesState.idx > 0) {
    _storiesState.idx -= 1;
    _renderStoriesProgress();
    _renderStoriesSlide();
    _startStoriesAutoTimer();
  }
}

// 사용자 요청 2026-04-28: 인스타식 long-press pause — 200ms 이상 누르면 pause, 짧게 누르면 navigation
let _storiesPressTimer = null;
let _storiesPressTriggered = false;
function _storiesHandlePressStart(e) {
  if (_storiesPressTimer) clearTimeout(_storiesPressTimer);
  _storiesPressTriggered = false;
  _storiesPressTimer = setTimeout(() => {
    _storiesPressTriggered = true;
    storiesPause();
  }, 200);
}
function _storiesHandlePressEnd(e) {
  if (_storiesPressTimer) {
    clearTimeout(_storiesPressTimer);
    _storiesPressTimer = null;
  }
  if (_storiesPressTriggered) {
    storiesResume();
    if (e && e.preventDefault) e.preventDefault();
    setTimeout(() => { _storiesPressTriggered = false; }, 50);
  }
}
function _storiesHandleClick(action) {
  if (_storiesPressTriggered) return;  // long-press 중이면 click 무시
  if (action === 'prev') storiesPrev();
  else if (action === 'next') storiesNext();
}

function storiesPause() {
  if (!_storiesState || _storiesState.paused) return;
  _storiesState.paused = true;
  if (_storiesState.autoTimer) {
    clearTimeout(_storiesState.autoTimer);
    _storiesState.autoTimer = null;
  }
  if (_storiesState.fillTimer) {
    clearInterval(_storiesState.fillTimer);
    _storiesState.fillTimer = null;
  }
  _storiesState.fillElapsed += Date.now() - _storiesState.fillStart;
  // V4-fix: 음악도 같이 pause
  if (_storiesState.musicAudio) {
    try { _storiesState.musicAudio.pause(); } catch {}
  }
}

function storiesResume() {
  if (!_storiesState || !_storiesState.paused) return;
  _storiesState.paused = false;
  _startStoriesAutoTimer();
  // V4-fix: 음악 resume
  if (_storiesState.musicAudio && !_storiesState.muted) {
    try { _storiesState.musicAudio.play(); } catch {}
  }
}

function _startStoriesAutoTimer() {
  if (!_storiesState) return;
  const SLIDE_DUR = 6000;  // 6초
  if (_storiesState.autoTimer) clearTimeout(_storiesState.autoTimer);
  if (_storiesState.fillTimer) clearInterval(_storiesState.fillTimer);
  // resume이면 fillElapsed 유지 / 새 슬라이드면 reset
  if (!_storiesState.paused) {
    // 새 슬라이드 — fillElapsed 리셋 (단 resume에서는 유지)
  }
  _storiesState.fillStart = Date.now();
  _storiesState.autoTimer = setTimeout(() => {
    storiesNext();
  }, SLIDE_DUR - _storiesState.fillElapsed);
  // progress fill 진행
  const fillEl = document.querySelector('.stories-progress-bar.current .stories-progress-fill');
  if (fillEl) {
    _storiesState.fillTimer = setInterval(() => {
      if (!_storiesState || _storiesState.paused) return;
      const elapsed = (Date.now() - _storiesState.fillStart) + _storiesState.fillElapsed;
      const pct = Math.min(100, (elapsed / SLIDE_DUR) * 100);
      fillEl.style.width = pct + '%';
    }, 50);
  }
}

function _renderStoriesProgress() {
  const container = document.getElementById('storiesProgress');
  if (!container || !_storiesState) return;
  container.innerHTML = _storiesState.slides.map((s, i) => {
    const cls = i < _storiesState.idx ? ' done' : (i === _storiesState.idx ? ' current' : '');
    return `<div class="stories-progress-bar${cls}"><div class="stories-progress-fill"></div></div>`;
  }).join('');
}

function _renderStoriesSlide() {
  if (!_storiesState) return;
  const slide = _storiesState.slides[_storiesState.idx];
  if (!slide) return;
  const container = document.getElementById('storiesSlide');
  if (!container) return;
  container.className = 'stories-slide ' + (slide.tone || 'tone-deep');
  container.innerHTML = slide.html;
  // 일반 음악 미리듣기 (진주 카드 안의) 멈춤
  if (_currentMusicAudio) {
    try { _currentMusicAudio.pause(); } catch {}
    _currentMusicAudio = null;
    _currentMusicBtn = null;
  }
  // fillElapsed 리셋
  _storiesState.fillElapsed = 0;
  // V4-fix: 슬라이드별 배경 음악 (진주 음악 cycle, mute 안 한 경우)
  // 한 곡이 여러 슬라이드 걸쳐 재생 — 같은 트랙이면 끊김 X
  _playStoriesSlideMusic();
}

// 분기 리뷰 → 10 슬라이드 빌더
async function buildQuarterlySlides(review) {
  const stats = review.stats || {};
  const range = (() => {
    const m = String(review.quarterKey || '').match(/^(\d{4})-Q(\d)$/);
    if (!m) return null;
    return getQuarterRange(review.quarterKey);
  })();
  const startMs = range ? new Date(range.start).getTime() : 0;
  const endMs   = range ? new Date(range.end).getTime() : Date.now();
  const inRange = (iso) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= startMs && t <= endMs;
  };

  // 직전 분기 비교
  const prevQ = (() => {
    const m = String(review.quarterKey || '').match(/^(\d{4})-Q(\d)$/);
    if (!m) return null;
    let y = parseInt(m[1]); let q = parseInt(m[2]) - 1;
    if (q < 1) { q = 4; y -= 1; }
    return (state.quarterlyReviews || []).find(r => r.quarterKey === `${y}-Q${q}`)?.stats || null;
  })();

  const slides = [];

  // 사용자 보고 2026-04-29: 신규 슬라이드 4종 추가 — Mood arc / Highlight 한 순간 / Forecast 후일담 / Timecapsule
  // 1. 감성 hook — 큰 숫자 + 사진 + 직전 분기 비교
  const heroPhoto = (() => {
    const entries = (state.entries || []).filter(e => e.photo && e.date && new Date(e.date + 'T12:00:00').getTime() >= startMs && new Date(e.date + 'T12:00:00').getTime() <= endMs);
    return entries.length > 0 ? entries[Math.floor(Math.random() * entries.length)].photo : null;
  })();
  // V4-fix v3 (사용자 요청 — 더 설명적, 친절한 톤): 평균 빈도 + 직전 분기 비교
  const totalDays = Math.max(1, Math.round((endMs - startMs) / 86400000));
  const checkinsCnt = stats.checkins || 0;
  const avgGap = checkinsCnt > 0 ? Math.round(totalDays / checkinsCnt) : 0;
  const prevCheckins = prevQ?.checkins;
  let heroComparison = '';
  if (prevCheckins != null && checkinsCnt > prevCheckins) {
    const diff = checkinsCnt - prevCheckins;
    heroComparison = `<div class="stories-body">지난 분기보다 ${diff}번 더. 자기 자신한테 더 가까이 와 있었네.</div>`;
  } else if (prevCheckins != null && checkinsCnt < prevCheckins) {
    const diff = prevCheckins - checkinsCnt;
    heroComparison = `<div class="stories-body">지난 분기보다 ${diff}번 적었어. 바빴거나 다른 데 살았던 분기일 거야.</div>`;
  } else if (avgGap > 0) {
    heroComparison = `<div class="stories-body">평균 ${avgGap}일에 한 번씩 체크인. 꾸준한 흐름이야.</div>`;
  }
  slides.push({
    tone: 'tone-emo',
    html: `
      <div class="stories-label">${escapeHtml((typeof seasonLabelOf === 'function' ? seasonLabelOf(review.quarterKey) : review.quarterKey) || '')}</div>
      ${heroPhoto ? `<img class="stories-photo" src="${heroPhoto}" alt="">` : ''}
      <div class="stories-hero-num">${checkinsCnt}</div>
      <div class="stories-hero-unit">번 체크인했어</div>
      <div style="font-size:11px; color:rgba(255,255,255,0.55); margin-top:6px;">자기 자신을 기록한 시간</div>
      ${heroComparison}
    `
  });

  // 사용자 요청 2026-04-29: Mood arc 슬라이드 제거
  // 2. 진지 변화 — 8 차원 + 모드
  slides.push({
    tone: 'tone-deep',
    html: _buildChangeSlideHTML(stats, prevQ)
  });

  // 3. 감성 top 곡
  const topMusic = (() => {
    const musicPearls = (state.pearls || []).filter(p => p.category === '음악' && p.track && inRange(p.createdAt));
    if (musicPearls.length === 0) return null;
    // 가장 최근 또는 random
    return musicPearls[Math.floor(Math.random() * musicPearls.length)];
  })();
  slides.push({
    tone: 'tone-emo-2',
    html: topMusic ? `
      <div class="stories-label">네 사운드트랙</div>
      <div class="stories-music-card">
        <img class="stories-music-art" src="${escapeHtml(topMusic.track.artworkUrl || '')}" alt="">
        <div>
          <div class="stories-music-title">${escapeHtml(topMusic.track.title || '')}</div>
          <div class="stories-music-artist">${escapeHtml(topMusic.track.artist || '')}</div>
        </div>
        ${topMusic.track.previewUrl ? `<button class="stories-music-play" onclick="event.stopPropagation(); toggleMusicPreview(this, '${escapeHtml(topMusic.track.previewUrl)}')">▶</button>` : ''}
      </div>
    ` : `
      <div class="stories-label">네 사운드트랙</div>
      <div class="stories-empty">이 분기 음악 진주 없음<br>다음 분기엔 ✦</div>
    `
  });

  // 사용자 요청 2026-04-29: '전략이 네 무기' 슬라이드(_buildEvolutionSlideHTML) 제거
  // → '🌳 통한 전략들' + '🐚 모은 소라' 두 신규 긍정 슬라이드로 대체
  const workedSlideHtml = _buildWorkedStrategiesSlideHTML(stats, inRange);
  if (workedSlideHtml) slides.push({ tone: 'tone-emo-2', html: workedSlideHtml });
  const shellsSlideHtml = _buildShellsCollectedSlideHTML(stats, inRange, startMs, endMs);
  if (shellsSlideHtml) slides.push({ tone: 'tone-emo-4', html: shellsSlideHtml });

  // 5. 감성 top 진주
  // 사용자 요청 2026-04-28: 튜토리얼/테스터 모드면 '엄마 김치찌개' 카드 고정 (시각 검증)
  const isAutoFix = !!(window._onbTutorialMode || (state.preferences && state.preferences.testerMode));
  const topPearl = (() => {
    if (isAutoFix) {
      const fixed = (state.pearls || []).find(p => p && p.content === '엄마 김치찌개');
      if (fixed) return fixed;
    }
    const pearls = (state.pearls || []).filter(p => p.type !== 'dna_pearl' && p.category !== '음악' && inRange(p.createdAt));
    if (pearls.length === 0) {
      // 음악 빼고 없으면 음악도 OK
      const allP = (state.pearls || []).filter(p => p.type !== 'dna_pearl' && inRange(p.createdAt));
      return allP.length > 0 ? allP[Math.floor(Math.random() * allP.length)] : null;
    }
    return pearls[Math.floor(Math.random() * pearls.length)];
  })();
  slides.push({
    tone: 'tone-emo-3',
    html: topPearl ? `
      <div class="stories-label">잊지 못할 순간</div>
      <div class="stories-pearl-card">
        ${topPearl.photo ? `<img src="${escapeHtml(topPearl.photo)}" alt="" style="width:100%; max-width:240px; aspect-ratio:1; object-fit:cover; border-radius:14px; margin:0 auto 14px; display:block; border:1px solid rgba(255,255,255,0.2);">` : `<div class="stories-pearl-emoji">${({음악:'🎵',음식:'🍴',장소:'📍',순간:'✨',사람:'👥'})[topPearl.category] || '💎'}</div>`}
        <div class="stories-pearl-content">${escapeHtml(topPearl.content || '')}</div>
        ${topPearl.note ? `<div style="font-size:11px; color:rgba(255,255,255,0.6); margin-top:10px; font-style:italic;">${escapeHtml(topPearl.note)}</div>` : ''}
      </div>
    ` : `
      <div class="stories-label">잊지 못할 순간</div>
      <div class="stories-empty">이 분기 진주 없음</div>
    `
  });

  // 사용자 요청 2026-04-29: '기억나는 한 순간' (highlight) 슬라이드 제거
  // 6. 진지 AI 새 특징
  slides.push({
    tone: 'tone-deep-2',
    html: _buildNewFeaturesSlideHTML(inRange)
  });

  // 7. 감성 재미 — Spotify식 light stat
  slides.push({
    tone: 'tone-emo-4',
    html: _buildFunStatsSlideHTML(stats, inRange)
  });

  // 8. 진지 패턴 — 진단
  slides.push({
    tone: 'tone-deep-3',
    html: _buildPatternsSlideHTML(inRange)
  });

  // 8.5. 진지 깨달음 정리 (V4-fix v3 사용자 요청)
  slides.push({
    tone: 'tone-deep-2',
    html: _buildArchiveSummarySlideHTML(inRange)
  });

  // 8.7. 진지 — 직전 분기 예측 후일담 (사용자 요청 2026-04-29)
  const forecastHtml = _buildForecastFollowupSlideHTML(review.quarterKey);
  if (forecastHtml) {
    slides.push({ tone: 'tone-deep-3', html: forecastHtml });
  }

  // 8.8. 감성 — 1년 전 너 (Timecapsule) (사용자 요청 2026-04-29)
  const timecapsuleHtml = _buildTimecapsuleSlideHTML(review.quarterKey);
  if (timecapsuleHtml) {
    slides.push({ tone: 'tone-emo-5', html: timecapsuleHtml });
  }

  // 8.9. 진지 — 그때 너 → 지금 너 (사용자 명시 2026-05-06 ultrathink: 분기 = 변화 렌즈)
  const transformationHtml = _buildTransformationSlideHTML(review);
  if (transformationHtml) {
    slides.push({ tone: 'tone-deep-2', html: transformationHtml });
  }

  // 9. 진지 narrative + prompt
  slides.push({
    tone: 'tone-deep',
    html: _buildNarrativeSlideHTML(review)
  });

  // 10. 감성 시적 한 줄
  slides.push({
    tone: 'tone-emo-5',
    html: _buildClosingSlideHTML(review, stats)
  });

  return slides;
}

// === 슬라이드 HTML 빌더 ===

