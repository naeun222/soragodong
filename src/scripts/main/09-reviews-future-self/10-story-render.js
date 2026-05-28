// V4 (사용자 요청 2026-05-28): 주간 리뷰 옵션 2 — Story mode (3 페이지 풀스크린 sequence).
//   옵션 1 (classic, 기본) 와 토글로 swap. monthly/quarterly/annual = 적용 X.
//   목적: 회고 = 카드 stack scan 의 surface 아니라 *몰입의 surface*. 한 페이지 한 호흡.
//   schema 변경 X — 같은 reviewData 다른 위계로 render. 컨텐츠 결정은 prompt 그대로.
//
//   Page 1 Hero: one_word_weekly + momentum_line + mood arc (라벨 X, 곡선 only)
//   Page 2 Scenes: scenes 3개 carousel (좌우 swipe / dot)
//   Page 3 Reflection: flow + cycles 1-2개 + soft_notice + 이 주의 진주 1 + 행동 버튼
//
//   인터랙션: 좌우 swipe / tap 좌우 edge / 위 swipe = 다음. dot tap = 직접 jump.
//   마지막 페이지에서 다음 = 자동 닫기 (사용자 명시 2026-05-29).
//   음악 = 항상 ON, 사용자 환경 mute 토글 폐기 (사용자 명시 2026-05-29).

let _storyPageIdx = 0;
let _storySceneIdx = 0;
// V4 (사용자 보고 2026-05-28): archive-reviews inline 출신 표시 — ↺ Classic 시 모음으로 복귀 (풀스크린 classic 진입 대신).
let _storyFromInline = false;
// V4 (사용자 요청 2026-05-28): 페이지별 음악 자동 재생. 사용자 명시 2026-05-29: mute X, 항상 ON.
let _storyMusicTracks = [];
let _storyAudio = null;

function renderWeeklyStoryReview(reviewData, opts) {
  opts = opts || {};
  const readonly = !!opts.readonly;
  // V4 (사용자 명시 2026-05-29): 진입 출처 마크 — fromInline true 면 모음 출신 = ↺ Classic 버튼 표시.
  //   홈 진입 (openReview / _rcOpenFreshReview / preview) = fromInline false → Classic 버튼 hidden, ✕ 닫기만.
  _storyFromInline = !!opts.fromInline;
  const screen = document.getElementById('screen-review');
  if (!screen) return;

  const oneWord = String(reviewData.one_word_weekly || '').trim();
  const momentum = String(reviewData.momentum_line || '').trim();
  const flow = String(reviewData.flow || '').trim();
  const softNotice = String(reviewData.soft_notice || '').trim();
  const weekKey = reviewData.weekKey || (typeof getCurrentWeekKey === 'function' ? getCurrentWeekKey() : '');

  // scenes — string / object 양쪽 schema 호환 (06-render-screen.js 와 동일 normalize)
  const scenes = (Array.isArray(reviewData.scenes) ? reviewData.scenes : [])
    .map(sc => (typeof sc === 'string' ? { what: sc } : sc))
    .filter(s => s && (s.what || s.when))
    .slice(0, 3);

  // cycles — 3분류 다 비어있을 수 있음. 자동 1-2개만 선택.
  const cyclesRaw = (reviewData.cycles && typeof reviewData.cycles === 'object') ? reviewData.cycles : {};
  const cycleEntries = ['sleep', 'mode', 'other']
    .map(k => ({ k, v: String(cyclesRaw[k] || '').trim() }))
    .filter(x => x.v.length > 0)
    .slice(0, 2);

  // 주간 range — 진주 / 챕터 필터용
  let _cutoff, _cutoffEnd;
  if (typeof _weeklyChartRangeFromKey === 'function' && weekKey) {
    const r = _weeklyChartRangeFromKey(weekKey);
    if (r) { _cutoff = r.start; _cutoffEnd = r.end; }
  }
  if (!_cutoff || !_cutoffEnd) {
    // fallback — completedAt 기준 -7일
    const _t = new Date(reviewData.completedAt || Date.now());
    _cutoff = new Date(_t.getTime() - 7 * 86400000);
    _cutoffEnd = _t;
  }

  // mood + energy 두 곡선 — 옵션 1 의 _renderReviewMoodChartInline 재사용 (사용자 명시 2026-05-28: 옵션 1 차트 활용).
  //   energy = entry.energy ?? entry.vitality fallback. legend 자동 포함.
  const entriesForArc = (state.entries || [])
    .filter(e => {
      if (!e.date) return false;
      const d = new Date(e.date + 'T12:00:00');
      return d >= _cutoff && d < _cutoffEnd;
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const moodArcHtml = (typeof _renderReviewMoodChartInline === 'function' && entriesForArc.length >= 2)
    ? _renderReviewMoodChartInline(entriesForArc)
    : '';

  // 이 주의 진주 1개 — 컨텐츠 풍부한 진주 우선 (음악 > 사진/비디오 > 티켓/장소 > 텍스트).
  //   같은 priority 면 최근 순. 사용자 보고 2026-05-28: album art 보일 확률 ↑.
  const _pearlPriority = (p) => {
    if (p.category === '음악' && p.track && p.track.artworkUrl) return 1;
    if (typeof pearlHasMedia === 'function' && (pearlHasMedia(p, 'photo') || pearlHasMedia(p, 'videoThumbnail'))) return 2;
    if (p.category === '티켓' || p.category === '장소') return 3;
    return 4;
  };
  const pearlsThisWeek = (state.pearls || [])
    .filter(p => {
      if (p._deleted || !p.createdAt) return false;
      const d = new Date(p.createdAt);
      return d >= _cutoff && d < _cutoffEnd;
    })
    .sort((a, b) => {
      const _p = _pearlPriority(a) - _pearlPriority(b);
      if (_p !== 0) return _p;
      return new Date(b.createdAt) - new Date(a.createdAt);
    })
    .slice(0, 1);

  // 사용자 명시 2026-05-28: 옵션 1 inline 펼침 톤 — 😴/⚡/🌙 이모티콘 + 한국어.
  const cycleLabel = (k) => k === 'sleep' ? '😴 수면' : k === 'mode' ? '⚡ 모드' : '🌙 외부';

  // one_word 글자 stagger fade — Spotify Wrapped 톤 + 한국 손글씨 *그어지는* 톤.
  //   각 글자 <span> + animation-delay (80ms × index). reduced-motion 시 한 번에 fade.
  const oneWordChars = oneWord
    ? Array.from(oneWord).map((ch, i) => {
        const safe = (ch === ' ') ? '&nbsp;' : escapeHtml(ch);
        return `<span class="rstory-oneword-char" style="animation-delay:${(i * 80 + 200)}ms;">${safe}</span>`;
      }).join('')
    : '';

  // 사용자 명시 2026-05-29: scene → entry 매칭 보강.
  //   1) scene.when 안 한국어 요일 매칭 (신 schema, object)
  //   2) scene.what 안 한국어 요일 매칭 (옛 schema, string normalize 후 when 비어있음)
  //   3) 둘 다 매칭 실패면 → 사진 있는 entry 중 sceneIdx 위치 fallback (순서대로)
  //   diaryImgHtml 이 신/옛 photo path 다 처리 (photoStorageKeys / photos / photo).
  //   사진 3장 이상 entry 도 idx=0 = 첫 사진.
  const _KR_DAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const _findEntryByDayKeyword = (text) => {
    if (!text) return null;
    for (let i = 0; i < _KR_DAYS.length; i++) {
      if (text.includes(_KR_DAYS[i] + '요일') || text.includes(_KR_DAYS[i] + '요') || text.startsWith(_KR_DAYS[i])) {
        const matched = entriesForArc.find(e => {
          const d = new Date(e.date + 'T12:00:00');
          return d.getDay() === i;
        });
        if (matched) return matched;
      }
    }
    return null;
  };
  // 사진 있는 entry 만 모음 (fallback 용)
  const _entriesWithPhoto = entriesForArc.filter(e => (typeof diaryEntryHasPhoto === 'function' && diaryEntryHasPhoto(e, 0)));
  const _entryForScene = (scene, sceneIdx) => {
    // 1) when 요일 매칭
    const fromWhen = _findEntryByDayKeyword(String((scene && scene.when) || ''));
    if (fromWhen) return fromWhen;
    // 2) what 안 요일 매칭 (string scenes — when 비어있을 때)
    const fromWhat = _findEntryByDayKeyword(String((scene && scene.what) || ''));
    if (fromWhat) return fromWhat;
    // 3) 사진 있는 entry 중 sceneIdx 위치 fallback
    if (_entriesWithPhoto[sceneIdx]) return _entriesWithPhoto[sceneIdx];
    return null;
  };
  const _scenePhotoHtml = (scene, sceneIdx) => {
    const ent = _entryForScene(scene, sceneIdx);
    if (!ent) return '';
    if (typeof diaryEntryHasPhoto !== 'function' || !diaryEntryHasPhoto(ent, 0)) return '';
    if (typeof diaryImgHtml !== 'function') return '';
    return diaryImgHtml(ent, 0, { cls: 'rstory-scene-photo', alt: '' });
  };

  // 사용자 명시 2026-05-29: 음악 자동 재생 — 그 주 음악 진주 우선 → entry.music. 항상 ON (mute X).
  //   페이지 이동 시 곡 전환. 음악 1 = 모든 페이지 같은 곡 / 2 = 1곡: page1 / 2곡: page2-3 / 3+ = idx 매핑.
  const _weekMusicTracks = [];
  // 1) 음악 pearl 먼저 — 사용자가 명시 의도로 저장한 것이라 우선도 ↑
  (state.pearls || []).forEach(p => {
    if (p._deleted || p.category !== '음악') return;
    if (!p.track || !p.track.previewUrl) return;
    if (!p.createdAt) return;
    const d = new Date(p.createdAt);
    if (d < _cutoff || d >= _cutoffEnd) return;
    _weekMusicTracks.push(p.track);
  });
  // 2) entry.music — pearl 에 없는 것만
  entriesForArc.forEach(e => {
    if (!e.music || !e.music.previewUrl) return;
    if (_weekMusicTracks.some(t => t.id === e.music.id || t.previewUrl === e.music.previewUrl)) return;
    _weekMusicTracks.push(e.music);
  });

  const html = `
    <div class="rstory-container" id="rstoryContainer">
      <div class="rstory-progress" role="progressbar" aria-label="페이지 진행도">
        <div class="rstory-progress-bar" data-step="0"></div>
        <div class="rstory-progress-bar" data-step="1"></div>
        <div class="rstory-progress-bar" data-step="2"></div>
      </div>
      ${_storyFromInline ? `<button class="rstory-toggle" type="button" onclick="toggleWeeklyReviewLayout()" aria-label="Classic 으로 돌아가기">↺ Classic</button>` : ''}
      <button class="rstory-close" type="button" onclick="closeWeeklyStoryReview()" aria-label="닫기">✕</button>

      <div class="rstory-page rstory-page-hero active" data-page="0" role="region" aria-label="이번 주 한 단어">
        <div class="rstory-meta">${escapeHtml(weekKey || '이번 주')} <span class="rstory-meta-dot">•</span> 너의 한 주</div>
        ${oneWord ? `<div class="rstory-oneword" aria-label="이번 주 한 단어 ${escapeHtml(oneWord)}">${oneWordChars}</div>` : '<div class="rstory-empty">이번 주는 한 단어가 흐릿했어</div>'}
        ${momentum ? `<div class="rstory-momentum">${escapeHtml(momentum)}</div>` : ''}
        ${moodArcHtml ? `<div class="rstory-moodarc">${moodArcHtml}</div>` : ''}
        <div class="rstory-hint" aria-hidden="true">
          <svg viewBox="0 0 12 8" width="12" height="8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2 L6 6 L10 2"/></svg>
        </div>
      </div>

      <div class="rstory-page rstory-page-scenes" data-page="1" role="region" aria-label="이번 주 장면">
        <div class="rstory-meta">${escapeHtml(weekKey || '')} <span class="rstory-meta-dot">•</span> 이번 주 장면</div>
        ${scenes.length === 0 ? `
          <div class="rstory-empty">이 주는 장면이 흐릿했어</div>
        ` : `
          <div class="rstory-scenes-carousel">
            ${scenes.map((s, i) => {
              const _photo = _scenePhotoHtml(s, i);
              return `
              <div class="rstory-scene ${i === 0 ? 'active' : ''}" data-scene="${i}">
                ${s.when ? `<div class="rstory-scene-when">${escapeHtml(s.when)}</div>` : ''}
                ${_photo ? `<div class="rstory-scene-photo-wrap">${_photo}</div>` : ''}
                ${s.what ? `<div class="rstory-scene-what">${escapeHtml(s.what)}</div>` : ''}
                ${s.feeling ? `<div class="rstory-scene-feeling"><span class="rstory-scene-feeling-mark" aria-hidden="true">—</span> ${escapeHtml(s.feeling)}</div>` : ''}
              </div>
            `;}).join('')}
          </div>
          ${scenes.length > 1 ? `
            <div class="rstory-scene-dots" role="tablist" aria-label="장면 선택">
              ${scenes.map((_, i) => `<button type="button" class="rstory-scene-dot ${i === 0 ? 'active' : ''}" data-i="${i}" aria-label="장면 ${i + 1}"></button>`).join('')}
            </div>
          ` : ''}
        `}
      </div>

      <div class="rstory-page rstory-page-reflect" data-page="2" role="region" aria-label="이번 주 흐름과 한 마디">
        <div class="rstory-meta">${escapeHtml(weekKey || '')} <span class="rstory-meta-dot">•</span> 흐름</div>
        <div class="rstory-reflect-stack">
          ${flow ? `<div class="rstory-flow">${escapeHtml(flow)}</div>` : ''}
          ${cycleEntries.length > 0 ? `
            <div class="rstory-cycles">
              ${cycleEntries.map(c => `<div class="rstory-cycle"><span class="rstory-cycle-k">${cycleLabel(c.k)}</span><span class="rstory-cycle-v">${escapeHtml(c.v)}</span></div>`).join('')}
            </div>
          ` : ''}
          ${softNotice ? `
            <div class="rstory-notice">
              <span class="rstory-notice-mark" aria-hidden="true">✦</span>
              <span class="rstory-notice-text">${escapeHtml(softNotice)}</span>
            </div>
          ` : ''}
          ${pearlsThisWeek.length > 0 ? `
            <div class="rstory-pearl">
              <div class="rstory-pearl-label">이 주의 진주</div>
              ${_renderStoryPearlContent(pearlsThisWeek[0])}
            </div>
          ` : ''}
        </div>
        <div class="rstory-actions">
          <button class="rstory-action-secondary" type="button" onclick="closeWeeklyStoryReview()">← 모음으로</button>
        </div>
      </div>
    </div>
  `;

  // 사용자 명시 2026-05-29: 풀스크린 = 헤더/탭 빼고 남은 영역 (.screen) 안에서.
  //   .screen 가 이미 .screens (flex:1) 안 absolute inset:0 + padding 4px 24px 160px + overflow-y auto.
  //   옵션 2 활성 = .screen 에 .rstory-active 클래스 추가 → padding/overflow 무효화. portal 폐기 (이전 d42e8bd 의 .app stacking 해결책은 헤더/탭도 덮어버려 사용자 의도와 반대).
  screen.classList.add('rstory-active');
  screen.innerHTML = html;

  // entry 사진 비동기 hydrate (신 photoStorageKey path).
  try {
    if (typeof hydrateDiaryPhotos === 'function') {
      hydrateDiaryPhotos(screen);
    }
  } catch (e) { console.warn('[story] hydrateDiaryPhotos:', e); }

  // pearl 사진 비동기 hydrate (신 pearl.storageKey path).
  try {
    if (typeof hydratePearlMedia === 'function') {
      hydratePearlMedia(screen);
    }
  } catch (e) { console.warn('[story] hydratePearlMedia:', e); }

  // 음악 state 초기화 — 페이지마다 다른 곡. 항상 ON (사용자 명시 2026-05-29).
  //   진입 = "✦ Story mode 로 보기" / 카드 click 의 user gesture context 결과라 autoplay 가능.
  //   못 켜져도 (모바일 stricter) 첫 swipe / tap 에서 자동 재시도.
  _storyMusicTracks = _weekMusicTracks;
  _playStoryAudioForPage(0);

  _initStoryReviewInteractions();
}

function _buildStoryMoodArc(entries) {
  if (!entries || entries.length < 2) return '';
  const moods = entries
    .map(e => Number(e.mood))
    .filter(v => Number.isFinite(v) && v >= 1 && v <= 5);
  if (moods.length < 2) return '';
  const W = 240, H = 50, pad = 8;
  const points = moods.map((m, i) => {
    const x = pad + (i / Math.max(1, moods.length - 1)) * (W - 2 * pad);
    const y = pad + (1 - (m - 1) / 4) * (H - 2 * pad);
    return [x, y];
  });
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="${d}" fill="none" stroke="#7ec8e3" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/></svg>`;
}

function _initStoryReviewInteractions() {
  _storyPageIdx = 0;
  _storySceneIdx = 0;
  const container = document.getElementById('rstoryContainer');
  if (!container) return;
  _updateStoryProgress();

  // dot tap → scene 직접 jump
  container.querySelectorAll('.rstory-scene-dot').forEach(dot => {
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      const i = parseInt(dot.getAttribute('data-i') || '0', 10);
      if (Number.isFinite(i)) { _storySceneIdx = i; _updateStoryScene(); }
    });
  });

  // touch swipe
  let startX = 0, startY = 0, startT = 0;
  container.addEventListener('touchstart', (e) => {
    if (!e.touches || !e.touches[0]) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startT = Date.now();
  }, { passive: true });
  container.addEventListener('touchend', (e) => {
    if (!startT) return;
    const t = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : null;
    if (!t) { startT = 0; return; }
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    const dt = Date.now() - startT;
    startT = 0;
    if (dt > 700) return;
    if (Math.abs(dx) < 40 && Math.abs(dy) < 40) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      _storySwipeHorizontal(dx);
    } else {
      if (dy < -50) _storyGotoPage(_storyPageIdx + 1);
      else if (dy > 50) _storyGotoPage(_storyPageIdx - 1);
    }
  }, { passive: true });

  // mouse / pointer click on left/right edge (desktop fallback)
  container.addEventListener('click', (e) => {
    if (e.target.closest('.rstory-toggle, .rstory-close, .rstory-action-secondary, .rstory-scene-dot, button')) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.3) _storySwipeHorizontal(50);   // 좌 영역 = 이전
    else if (x > rect.width * 0.7) _storySwipeHorizontal(-50); // 우 영역 = 다음
  });

  // keyboard
  container.tabIndex = 0;
  container.focus({ preventScroll: true });
  container.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); _storySwipeHorizontal(-50); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); _storySwipeHorizontal(50); }
    else if (e.key === 'Escape') { e.preventDefault(); closeWeeklyStoryReview(); }
  });

  // visibility / unload — audio 백그라운드 누설 방지
  if (typeof document !== 'undefined' && !document._rstoryVisibilityHooked) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && _storyAudio && !_storyAudio.paused) {
        try { _storyAudio.pause(); } catch {}
      } else if (!document.hidden && document.getElementById('rstoryContainer')) {
        _playStoryAudioForPage(_storyPageIdx);
      }
    });
    window.addEventListener('pagehide', _stopStoryAudio);
    document._rstoryVisibilityHooked = true;
  }
}

// dx < 0 = 다음 (왼쪽으로 swipe). dx > 0 = 이전.
//   사용자 명시 2026-05-29: 마지막 페이지에서 '다음' = 자동 닫기.
function _storySwipeHorizontal(dx) {
  const container = document.getElementById('rstoryContainer');
  if (!container) return;
  const pages = container.querySelectorAll('.rstory-page');
  const lastIdx = pages.length - 1;
  if (_storyPageIdx === 1) {
    const scenes = container.querySelectorAll('.rstory-scene');
    if (dx < 0) {
      if (_storySceneIdx < scenes.length - 1) { _storySceneIdx++; _updateStoryScene(); }
      else _storyGotoPage(_storyPageIdx + 1);
    } else {
      if (_storySceneIdx > 0) { _storySceneIdx--; _updateStoryScene(); }
      else _storyGotoPage(_storyPageIdx - 1);
    }
  } else {
    if (dx < 0) {
      // 마지막 페이지에서 '다음' = 자동 닫기
      if (_storyPageIdx >= lastIdx) { closeWeeklyStoryReview(); return; }
      _storyGotoPage(_storyPageIdx + 1);
    } else {
      _storyGotoPage(_storyPageIdx - 1);
    }
  }
}

function _storyGotoPage(next) {
  const container = document.getElementById('rstoryContainer');
  if (!container) return;
  const pages = container.querySelectorAll('.rstory-page');
  // 마지막 페이지 + 1 = 자동 닫기 (사용자 명시 2026-05-29)
  if (next >= pages.length) { closeWeeklyStoryReview(); return; }
  if (next < 0) return;
  if (pages[_storyPageIdx]) pages[_storyPageIdx].classList.remove('active');
  _storyPageIdx = next;
  if (pages[_storyPageIdx]) pages[_storyPageIdx].classList.add('active');
  if (_storyPageIdx === 1) {
    _storySceneIdx = 0;
    _updateStoryScene();
  }
  _updateStoryProgress();
  // 페이지 전환 시 곡 swap (음악 1 = 같은 곡 유지)
  _playStoryAudioForPage(_storyPageIdx);
}

function _updateStoryScene() {
  const container = document.getElementById('rstoryContainer');
  if (!container) return;
  const scenes = container.querySelectorAll('.rstory-scene');
  scenes.forEach((s, i) => s.classList.toggle('active', i === _storySceneIdx));
  const dots = container.querySelectorAll('.rstory-scene-dot');
  dots.forEach((d, i) => d.classList.toggle('active', i === _storySceneIdx));
}

function _updateStoryProgress() {
  const container = document.getElementById('rstoryContainer');
  if (!container) return;
  const bars = container.querySelectorAll('.rstory-progress-bar');
  bars.forEach((b, i) => {
    b.classList.remove('done', 'current');
    if (i < _storyPageIdx) b.classList.add('done');
    else if (i === _storyPageIdx) b.classList.add('current');
  });
}

function closeWeeklyStoryReview() {
  _stopStoryAudio();
  const screen = document.getElementById('screen-review');
  if (screen) {
    screen.classList.remove('rstory-active');
    screen.innerHTML = '';
  }
  if (typeof showScreen === 'function') showScreen('archive-reviews');
}

// ────── 음악 자동 재생 ──────
// 페이지 ↔ 음악 매핑:
//   1곡 = 모든 페이지 같은 곡 (loop)
//   2곡 = Page 1 → 곡 A / Page 2-3 → 곡 B
//   3+곡 = Page idx % count
function _trackIdxForPage(pageIdx, count) {
  if (!count) return -1;
  if (count === 1) return 0;
  if (count === 2) return pageIdx === 0 ? 0 : 1;
  return pageIdx % count;
}

function _ensureStoryAudio() {
  if (_storyAudio) return _storyAudio;
  try {
    _storyAudio = new Audio();
    _storyAudio.preload = 'none';
    _storyAudio.loop = true;
    _storyAudio.volume = 0.55;
  } catch (e) { _storyAudio = null; }
  return _storyAudio;
}

function _playStoryAudioForPage(pageIdx) {
  if (!_storyMusicTracks || _storyMusicTracks.length === 0) return;
  const idx = _trackIdxForPage(pageIdx, _storyMusicTracks.length);
  if (idx < 0) return;
  const track = _storyMusicTracks[idx];
  if (!track || !track.previewUrl) return;
  const a = _ensureStoryAudio();
  if (!a) return;
  // 같은 src 재생 중 = skip (페이지 전환 시 곡 끊김 X)
  if (a.src === track.previewUrl && !a.paused) return;
  try {
    if (a.src !== track.previewUrl) {
      try { a.pause(); } catch {}
      a.src = track.previewUrl;
    }
    const p = a.play();
    if (p && p.catch) p.catch(() => { /* autoplay 차단 — 사용자 첫 클릭 후 재시도 */ });
  } catch {}
}

function _stopStoryAudio() {
  if (!_storyAudio) return;
  try { _storyAudio.pause(); } catch {}
  try { _storyAudio.src = ''; } catch {}
}

// pearl 카테고리별 컨텐츠 렌더 — 음악(album art) / 사진(thumbnail) / 티켓 / 장소 / 텍스트.
//   pearlImgHtml(pearl, 'photo') + hydratePearlMedia 가 신/옛 path 처리.
function _renderStoryPearlContent(p) {
  if (!p) return '<div class="rstory-pearl-note">(빈 진주)</div>';
  const note = String(p.note || p.content || '').slice(0, 140);
  // 음악
  if (p.category === '음악' && p.track) {
    const t = p.track;
    return `
      <div class="rstory-pearl-music">
        ${t.artworkUrl ? `<img src="${escapeHtml(t.artworkUrl)}" alt="" class="rstory-pearl-art" decoding="async">` : '<div class="rstory-pearl-art rstory-pearl-art-placeholder">♫</div>'}
        <div class="rstory-pearl-music-meta">
          ${t.title ? `<div class="rstory-pearl-music-title">${escapeHtml(t.title)}</div>` : ''}
          ${t.artist ? `<div class="rstory-pearl-music-artist">${escapeHtml(t.artist)}</div>` : ''}
          ${note ? `<div class="rstory-pearl-note rstory-pearl-note-tight">${escapeHtml(note)}</div>` : ''}
        </div>
      </div>
    `;
  }
  // 사진 (신/옛 path)
  if (typeof pearlHasMedia === 'function' && pearlHasMedia(p, 'photo')) {
    const imgHtml = (typeof pearlImgHtml === 'function')
      ? pearlImgHtml(p, 'photo', { cls: 'rstory-pearl-thumb' })
      : '';
    return `
      <div class="rstory-pearl-photo-row">
        <div class="rstory-pearl-thumb-wrap">${imgHtml}</div>
        ${note ? `<div class="rstory-pearl-note rstory-pearl-note-tight">${escapeHtml(note)}</div>` : ''}
      </div>
    `;
  }
  // 비디오
  if (typeof pearlHasMedia === 'function' && pearlHasMedia(p, 'videoThumbnail')) {
    const imgHtml = (typeof pearlImgHtml === 'function')
      ? pearlImgHtml(p, 'videoThumbnail', { cls: 'rstory-pearl-thumb' })
      : '';
    return `
      <div class="rstory-pearl-photo-row">
        <div class="rstory-pearl-thumb-wrap rstory-pearl-video-wrap">
          ${imgHtml}
          <span class="rstory-pearl-play">▶</span>
        </div>
        ${note ? `<div class="rstory-pearl-note rstory-pearl-note-tight">${escapeHtml(note)}</div>` : ''}
      </div>
    `;
  }
  // 티켓
  if (p.category === '티켓') {
    let dtStr = '';
    if (p.eventDate) {
      const d = new Date(p.eventDate);
      if (!isNaN(d)) dtStr = d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' });
    }
    return `
      <div class="rstory-pearl-ticket">
        <div class="rstory-pearl-ticket-icon" aria-hidden="true">🎫</div>
        <div class="rstory-pearl-ticket-body">
          ${p.venue ? `<div class="rstory-pearl-ticket-venue">${escapeHtml(p.venue)}</div>` : ''}
          ${dtStr ? `<div class="rstory-pearl-ticket-date">${escapeHtml(dtStr)}</div>` : ''}
          ${note ? `<div class="rstory-pearl-note rstory-pearl-note-tight">${escapeHtml(note)}</div>` : ''}
        </div>
      </div>
    `;
  }
  // 장소
  if (p.category === '장소') {
    return `
      <div class="rstory-pearl-place">
        <span class="rstory-pearl-place-pin" aria-hidden="true">📍</span>
        <div class="rstory-pearl-place-body">
          ${p.venue ? `<div class="rstory-pearl-place-venue">${escapeHtml(p.venue)}</div>` : ''}
          ${note ? `<div class="rstory-pearl-note rstory-pearl-note-tight">${escapeHtml(note)}</div>` : ''}
        </div>
      </div>
    `;
  }
  // 텍스트 (음식·사람·순간·기타) — 작은 카테고리 mark
  const catEmoji = ({ '음식': '🍴', '사람': '🫂', '순간': '✨' })[p.category] || '✦';
  return `
    <div class="rstory-pearl-text">
      <span class="rstory-pearl-cat-mark" aria-hidden="true">${catEmoji}</span>
      <span class="rstory-pearl-note">${escapeHtml(note || '(빈 진주)')}</span>
    </div>
  `;
}

// ↺ Classic 버튼 click — 모음 inline 출신만 보이는 버튼. 모음 화면으로 복귀.
//   사용자 명시 2026-05-29: preference 시스템 폐기. 단순히 닫고 모음으로.
function toggleWeeklyReviewLayout() {
  _stopStoryAudio();
  const _sc = document.getElementById('screen-review');
  if (_sc) {
    _sc.classList.remove('rstory-active');
    _sc.innerHTML = '';
  }
  _storyFromInline = false;
  if (typeof showScreen === 'function') showScreen('archive-reviews');
}

// archive-reviews inline 출신 — "Story로 보기" hint click. 풀스크린 story 진입.
//   13-quarter-deep-dive.js 의 inline 펼침 hint 가 호출.
function _switchToStoryFromInline(reviewId) {
  _openWeeklyAsStoryFromCard(reviewId, true);
}

// 풀스크린 story 진입 (id 로 review lookup). fromInline true 면 ↺ Classic 버튼 표시.
function _openWeeklyAsStoryFromCard(reviewId, fromInline) {
  const review = (state.weeklyReviews || []).find(r => r && r.id === reviewId);
  if (!review) { if (typeof showToast === 'function') showToast('해당 주간 리뷰를 찾을 수 없어'); return; }
  if (typeof renderReviewScreen === 'function') {
    renderReviewScreen('weekly', review, { readonly: true, story: true, fromInline: !!fromInline });
  }
  if (typeof showScreen === 'function') showScreen('review');
}
