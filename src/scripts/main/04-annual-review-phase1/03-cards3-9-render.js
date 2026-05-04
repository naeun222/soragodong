// 카드 3: 발견 #1 (AI 포착) — 다음 phase: Opus 4.7 prompt
// 사용자 명시 2026-04-30: button 제거 (진주 담기 / 갸우뚱)
function _annualReviewBuildCard3(d) {
  const f = d.finding1 || {};
  return `
    <div class="ann-rv-card ann-rv-card-finding">
      <div class="ann-rv-label">${escapeHtml(f.label || '발견')}</div>
      <div class="ann-rv-finding-quote-block">${escapeHtml(f.quote || '')}</div>
      <div class="ann-rv-finding-vs-arrow">↓</div>
      <div class="ann-rv-finding-data-block">
        <div class="ann-rv-finding-data-num">${escapeHtml(f.dataNum || '')}</div>
        <div class="ann-rv-finding-data-text">${escapeHtml(f.dataText || '').replace(/\n/g, '<br>')}</div>
      </div>
      <div class="ann-rv-finding-conclusion">${(f.conclusion || '').replace(/\n/g, '<br>')}</div>
    </div>
  `;
}

// 카드 4: 발견 #2 (자기 친구) — 다음 phase: Opus 4.7 prompt
// 사용자 명시 2026-04-30: button 제거 + 결론 워딩 자연화
function _annualReviewBuildCard4(d) {
  const f = d.finding2 || {};
  return `
    <div class="ann-rv-card ann-rv-card-finding">
      <div class="ann-rv-label">${escapeHtml(f.label || '발견')}</div>
      <div class="ann-rv-friend-vs">
        <div class="ann-rv-friend-side">
          <div class="ann-rv-friend-num ann-rv-friend-num-low">${escapeHtml(f.friendLow || '')}</div>
          <div class="ann-rv-friend-label">${escapeHtml(f.friendLowLabel || '')}</div>
        </div>
        <div class="ann-rv-friend-vs-divider">vs</div>
        <div class="ann-rv-friend-side">
          <div class="ann-rv-friend-num ann-rv-friend-num-high">${escapeHtml(f.friendHigh || '')}</div>
          <div class="ann-rv-friend-label">${escapeHtml(f.friendHighLabel || '')}</div>
        </div>
      </div>
      <div class="ann-rv-finding-conclusion">${(f.conclusion || '').replace(/\n/g, '<br>')}</div>
    </div>
  `;
}

// 카드 5: 무기 DNA tree — 사용자 명시 2026-04-30: best 자리 = 캡션 ("이제 네 힘으로 이만큼이나 해결할 수 있어")
function _annualReviewBuildCard5(d) {
  const t = d.tree || {};
  const layer = (items, embodied) => `
    <div class="ann-rv-tree-layer">
      ${(items || []).map(it => `
        <div class="ann-rv-tree-leaf">
          <span class="ann-rv-tree-emoji${embodied ? ' ann-rv-tree-emoji-embodied' : ''}">${it.emoji}</span>
          <span class="ann-rv-tree-name">${escapeHtml(it.name)}</span>
        </div>
      `).join('')}
    </div>
  `;
  return `
    <div class="ann-rv-card ann-rv-card-5">
      <div class="ann-rv-label">자라는 무기들</div>
      <div class="ann-rv-tree">
        <div class="ann-rv-tree-tier">✨ 체화</div>
        ${layer(t.embodied, true)}
        <div class="ann-rv-tree-tier">🌳 성장 중</div>
        ${layer(t.growing, false)}
        <div class="ann-rv-tree-tier">🌿 시도 중</div>
        ${layer(t.trying, false)}
      </div>
      <div class="ann-rv-tree-caption">${escapeHtml(t.caption || '')}</div>
    </div>
  `;
}

// 카드 6: 모래사장 — 사용자 명시 2026-04-30: 진짜 소라 X / 소라의 부름에서 획득한 아이템들 (SHELL_POOLS 다양 emoji).
function _annualReviewBuildCard6(d) {
  const b = d.beach || {};
  const dc = b.diaryCount || 0;
  // 시드 SHELL_POOLS 에서 다양 tier mix (light + daily + main + golden)
  const shellEmojis = ['🐚','🐌','🪸','🌀','🐠','🐢','🦀','🦦','🐬','🦑','🐉','🦚','🪻'];
  let icons;
  if (dc >= 13) {
    // 하트 outline 13개 (사용자 명시 2026-04-30)
    const heartCoords = [
      { top: 18, left: 26 }, { top: 10, left: 36 }, { top: 14, left: 44 },
      { top: 14, left: 56 }, { top: 10, left: 64 }, { top: 18, left: 74 },
      { top: 32, left: 18 }, { top: 32, left: 82 },
      { top: 48, left: 28 }, { top: 48, left: 72 },
      { top: 64, left: 38 }, { top: 64, left: 62 },
      { top: 80, left: 50 }
    ];
    icons = heartCoords.map((c, i) => ({ emoji: shellEmojis[i % shellEmojis.length], top: c.top, left: c.left, size: 24 }));
    // 가운데 legendary ✨ 진주 (가장 빛난 1개)
    icons.push({ emoji: '✨', top: 46, left: 50, size: 32, pearl: true });
  } else {
    icons = [
      { emoji: '🐚', top: 28, left: 14, size: 30 },
      { emoji: '✨', top: 62, left: 42, size: 38, pearl: true },
      { emoji: '🐠', top: 48, left: 75, size: 26 },
      { emoji: '✨', top: 18, left: 58, size: 28, pearl: true },
      { emoji: '🪸', top: 76, left: 22, size: 28 },
      { emoji: '✨', top: 8,  left: 32, size: 22, pearl: true },
      { emoji: '🐢', top: 56, left: 8,  size: 24 }
    ];
  }
  const iconsHtml = icons.map(ic => `
    <div class="ann-rv-beach-icon ${ic.pearl ? 'ann-rv-beach-icon-pearl' : ''}"
         style="top:${ic.top}%;left:${ic.left}%;font-size:${ic.size}px;">${ic.emoji}</div>
  `).join('');
  return `
    <div class="ann-rv-card ann-rv-card-6">
      <div class="ann-rv-label" style="color:rgba(255,248,232,0.85);">너의 모래사장</div>
      <div class="ann-rv-beach-icons">${iconsHtml}</div>
      <div class="ann-rv-beach-stats">
        <div class="ann-rv-beach-stat">
          <div class="ann-rv-beach-stat-num">${b.diaryCount || 0}</div>
          <div class="ann-rv-beach-stat-label">소라</div>
        </div>
        <div class="ann-rv-beach-stat">
          <div class="ann-rv-beach-stat-num">${b.pearlCount || 0}</div>
          <div class="ann-rv-beach-stat-label">진주</div>
        </div>
      </div>
      <div class="ann-rv-beach-pearl">
        <div class="ann-rv-beach-pearl-emoji">🐚</div>
        <div class="ann-rv-beach-pearl-quote">${escapeHtml(b.bestPearl || '')}</div>
        <div class="ann-rv-beach-pearl-label">가장 빛난 소라</div>
      </div>
    </div>
  `;
}

// 카드 7 (새): 잊지 못할 순간 — 사용자 명시 2026-04-30: '사진' 카드 grid 별 슬라이드
function _annualReviewBuildCardMoments(d) {
  const moments = d.moments_card || [];
  const cards = moments.map(m => {
    // 사용자 명시 2026-04-30 ultrathink: photo 필드 있으면 사진 background (gradient overlay 로 텍스트 가독성). 없으면 옛 emoji + bg gradient.
    const hasPhoto = !!m.photo;
    const cardStyle = hasPhoto
      ? `background-image: linear-gradient(180deg, transparent 35%, rgba(0,0,0,0.72) 100%), url('${escapeHtml(m.photo)}'); background-size: cover; background-position: center;`
      : `background:${m.bg || ''};`;
    return `
    <div class="ann-rv-moment-card" style="${cardStyle}">
      ${hasPhoto ? '' : `<div class="ann-rv-moment-bg">${m.emoji || '🌅'}</div>`}
      <div class="ann-rv-moment-content">
        <div class="ann-rv-moment-date">${escapeHtml(m.date)}</div>
        <div class="ann-rv-moment-text">${escapeHtml(m.text)}</div>
      </div>
    </div>
  `;
  }).join('');
  return `
    <div class="ann-rv-card ann-rv-card-moments">
      <div class="ann-rv-label">잊지 못할 순간</div>
      <div class="ann-rv-moments-list">${cards}</div>
    </div>
  `;
}

// 카드 8: 올해의 깨달음 (사용자 명시 2026-04-30 ultrathink: Stories 톤 — count + tags + 가장 현명한 한 마디)
function _annualReviewBuildCardPearl(d) {
  const p = d.best_pearl || {};
  const title = (typeof p === 'string') ? p : (p.title || '');
  const summary = (typeof p === 'object') ? (p.summary || '') : '';
  const why = (typeof p === 'object') ? (p.whyThisYear || '') : '';
  const r = d.realizations || {};
  const c = r.count || {};
  const tags = r.topTags || [];
  const total = (c.scrap || 0) + (c.memo || 0) + (c.reflection || 0);
  return `
    <div class="ann-rv-card ann-rv-card-pearl" style="text-align:center;">
      <div class="stories-label">네 깨달음</div>
      <div class="stories-title" style="margin-bottom:14px;">올해 가장 현명한 한 마디</div>
      ${total > 0 ? `<div class="stories-body" style="margin-bottom:8px; font-size:13px;">📌 스크랩 ${c.scrap || 0} · ✎ 메모 ${c.memo || 0}${c.reflection ? ` · 🌊 숙고 ${c.reflection}` : ''}</div>` : ''}
      ${tags.length > 0 ? `<div style="font-size:11px; color:rgba(255,255,255,0.55); margin-bottom:18px; letter-spacing:0.04em;">자주 떠올린: ${tags.map(t => '#' + escapeHtml(t)).join(' · ')}</div>` : ''}
      <div class="stories-archive-list" style="max-width:340px;">
        <div class="stories-archive-item" style="padding:14px 18px; line-height:1.55;">
          <div style="font-size:14.5px; font-weight:500;${summary ? ' margin-bottom:6px;' : ''}">✦ ${escapeHtml(title)}</div>
          ${summary ? `<div style="font-size:12.5px; color:rgba(255,255,255,0.72); line-height:1.6;">${escapeHtml(summary)}</div>` : ''}
        </div>
      </div>
      ${why ? `<div style="margin-top:18px; padding:12px 14px; background:rgba(255,250,205,0.06); border-left:2px solid rgba(255,250,205,0.30); border-radius:0 8px 8px 0; max-width:320px; text-align:left;">
        <div style="font-size:9.5px; color:rgba(255,250,205,0.75); letter-spacing:0.14em; text-transform:uppercase; margin-bottom:6px; font-weight:600;">🦉 Opus — 왜 가장 현명한지</div>
        <div style="font-size:11.5px; color:rgba(255,250,205,0.7); font-style:italic; line-height:1.6;">${escapeHtml(why)}</div>
      </div>` : ''}
      <div class="stories-body" style="margin-top:16px; font-size:12px; opacity:0.7;">네 안에서 자라난 ${total > 0 ? total + '개 ' : ''}통찰 중. 내년에도 이어질 거야.</div>
    </div>
  `;
}

// 카드 9: 가장 깊었던 숙고 — 사용자 명시: 질문 + 결론 둘 다 (예전 리뷰 형식)
function _annualReviewBuildCardDeep(d) {
  const dq = d.deep || {};
  return `
    <div class="ann-rv-card ann-rv-card-deep">
      <div class="ann-rv-deep-label">가장 깊었던 숙고</div>
      <div class="ann-rv-deep-question">${escapeHtml(dq.question || '').replace(/\n/g, '<br>')}</div>
      ${dq.conclusion ? `
        <div class="ann-rv-deep-divider">↓ 14일 후 ↓</div>
        <div class="ann-rv-deep-conclusion">${escapeHtml(dq.conclusion).replace(/\n/g, '<br>')}</div>
      ` : ''}
      <div class="ann-rv-deep-date">${escapeHtml(dq.date || '')}</div>
    </div>
  `;
}

// 카드 10 (마지막) — 사용자 명시 2026-04-30 ultrathink: 분기 closing 처럼 한 단락 한 마디 = 단일 시구
function _annualReviewBuildCard9(d) {
  const oneLine = d.oneLine || '한 해, 한 마디';
  return `
    <div class="ann-rv-card ann-rv-card-8">
      <!-- ambient 별 (4개) -->
      <div style="position:absolute; top:11%; left:10%; font-size:14px; opacity:0.35; pointer-events:none;">✦</div>
      <div style="position:absolute; top:18%; right:13%; font-size:11px; opacity:0.30; pointer-events:none;">·</div>
      <div style="position:absolute; bottom:26%; left:14%; font-size:13px; opacity:0.32; pointer-events:none;">✧</div>
      <div style="position:absolute; bottom:32%; right:11%; font-size:10px; opacity:0.28; pointer-events:none;">·</div>

      <div style="display:flex; flex-direction:column; align-items:center; max-width:340px; width:100%; box-sizing:border-box; gap:22px; position:relative;">
        <!-- godong icon + halo (사용자 명시 2026-05-01: 🐚 emoji → godongicon.png, drop-shadow X 배경 안 보이게) -->
        <div style="position:relative; display:flex; align-items:center; justify-content:center; height:80px;">
          <div style="position:absolute; width:110px; height:110px; background:radial-gradient(circle, rgba(212,167,106,0.32) 0%, transparent 70%); border-radius:50%; animation: ann-rv-final-halo 3s ease-in-out infinite alternate;"></div>
          <img src="/godongicon.png" alt="소라고동" style="width:64px; height:64px; object-fit:contain; position:relative; display:block;" decoding="async">
        </div>

        <!-- 라벨 + 양쪽 가는 선 -->
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:24px; height:1px; background:rgba(212,167,106,0.5);"></div>
          <div class="stories-label" style="margin:0;">${escapeHtml(d.yearRange || '한 해, 한 단락')}</div>
          <div style="width:24px; height:1px; background:rgba(212,167,106,0.5);"></div>
        </div>

        <!-- 시구 카드 — 한 단락 한 마디 (단일 시구) -->
        <div class="ann-rv-final-poem" style="position:relative; background:linear-gradient(135deg, rgba(212,167,106,0.25), rgba(168,157,200,0.20), rgba(143,200,143,0.18)); border:1px solid rgba(212,167,106,0.45); border-radius:20px; padding:30px 24px; box-shadow:0 4px 24px rgba(212,167,106,0.18); width:100%; box-sizing:border-box;">
          <div style="position:absolute; top:-2px; left:14px; font-size:42px; line-height:1; color:rgba(212,167,106,0.55); font-family:'Gowun Batang', serif; pointer-events:none;">"</div>
          <div style="position:absolute; bottom:-22px; right:14px; font-size:42px; line-height:1; color:rgba(212,167,106,0.55); font-family:'Gowun Batang', serif; pointer-events:none;">"</div>
          <div style="font-size:18px; line-height:1.85; color:white; font-family:'Gowun Batang', serif; font-weight:500; text-align:center; letter-spacing:0.01em;">
            ${escapeHtml(oneLine).replace(/\n/g, '<br>')}
          </div>
        </div>

        <!-- 마무리 인사 (분기 closing 톤) -->
        <div style="font-size:13px; color:rgba(255,255,255,0.78); text-align:center; line-height:1.85; letter-spacing:0.02em; margin-top:6px;">
          한 해가 끝났어.<br>
          <span style="color:rgba(212,167,106,0.95); font-weight:500;">다음 페이지도 같이 ✦</span>
        </div>
      </div>
    </div>
  `;
}

function _annualReviewRender() {
  let overlay = document.getElementById('annualReviewOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'annualReviewOverlay';
    overlay.className = 'ann-rv-overlay';
    document.body.appendChild(overlay);
  }
  const s = _annualReviewState;
  if (!s) return;
  const total = s.cards.length;
  const cardHtml = s.cards[s.currentIdx](s.data);
  const progressDots = Array.from({ length: total }, (_, i) =>
    `<span class="${i <= s.currentIdx ? 'active' : ''}"></span>`).join('');
  // 사용자 명시 2026-04-30: 하단 화살표 button 제거 (좌·우 tap + swipe + 키보드만으로 충분)
  // 슬라이드별 노래 (사용자 명시 2026-04-30: 자동 재생 + 반복 재생 + LP 회전 artwork)
  const songData = (s.data && s.data.songs) ? s.data.songs[`card${s.currentIdx + 1}`] : null;
  if (songData && songData.previewUrl) {
    // 사용자 보고 2026-05-01: 진주 미리듣기 (toggleMusicPreview 의 _currentMusicAudio) 와 중첩 차단 — 연간 리뷰 진입 시 강제 pause.
    if (typeof _currentMusicAudio !== 'undefined' && _currentMusicAudio) {
      try { _currentMusicAudio.pause(); } catch {}
      if (typeof _currentMusicBtn !== 'undefined' && _currentMusicBtn) {
        _currentMusicBtn.textContent = '▶';
        _currentMusicBtn.classList.remove('playing');
      }
      _currentMusicAudio = null;
      if (typeof _currentMusicBtn !== 'undefined') _currentMusicBtn = null;
    }
    if (!window._annAudio) {
      window._annAudio = new Audio();
      window._annAudio.volume = 0.5;
      window._annAudio.loop = true;  // 사용자 명시 2026-04-30: 끊기면 반복 재생
    }
    if (window._annAudio.src !== songData.previewUrl) {
      window._annAudio.src = songData.previewUrl;
      window._annAudio.loop = true;
      window._annAudio.play().catch(e => console.warn('[ann-rv] autoplay blocked:', e));
    }
  } else if (window._annAudio) {
    try { window._annAudio.pause(); } catch {}
  }
  const isPlaying = (window._annAudio && !window._annAudio.paused);
  const playState = isPlaying ? '⏸' : '▶';
  const playingClass = isPlaying ? ' playing' : '';
  // 사용자 명시 2026-04-30: CD 만 (artwork) — 제목·아티스트·button 제거. CD click → toggle play/pause.
  const songHtml = songData ? `
    <div class="ann-rv-song${playingClass}">
      <img class="ann-rv-song-art" src="${escapeHtml(songData.artworkUrl || '')}" alt="${escapeHtml((songData.title || '') + ' — ' + (songData.artist || ''))}" title="${escapeHtml(songData.title || '')} — ${escapeHtml(songData.artist || '')}" onclick="_annTogglePlay(this)">
    </div>
  ` : '';
  overlay.innerHTML = `
    <div class="ann-rv-progress">${progressDots}</div>
    <button class="ann-rv-close" onclick="_annualReviewClose()" aria-label="닫기">✕</button>
    ${total > 1 ? '<button class="ann-rv-tap ann-rv-tap-prev" onclick="_annualReviewPrev()" aria-label="이전"></button>' : ''}
    ${cardHtml}
    ${total > 1 ? '<button class="ann-rv-tap ann-rv-tap-next" onclick="_annualReviewNext()" aria-label="다음"></button>' : ''}
    ${songHtml}
  `;
  overlay.classList.add('open');
  // 처음 1번만 swipe + key listener attach
  if (!overlay._annRvBound) {
    overlay._annRvBound = true;
    let touchStart = null;
    overlay.addEventListener('touchstart', (e) => {
      touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });
    overlay.addEventListener('touchend', (e) => {
      if (!touchStart) return;
      const dx = e.changedTouches[0].clientX - touchStart.x;
      const dy = e.changedTouches[0].clientY - touchStart.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) _annualReviewNext();
        else _annualReviewPrev();
      }
      touchStart = null;
    }, { passive: true });
    document.addEventListener('keydown', _annualReviewKeyHandler);
  }
}

function _annualReviewKeyHandler(e) {
  if (!_annualReviewState) return;
  if (e.key === 'ArrowRight') { _annualReviewNext(); e.preventDefault(); }
  else if (e.key === 'ArrowLeft') { _annualReviewPrev(); e.preventDefault(); }
  else if (e.key === 'Escape') { _annualReviewClose(); }
}

function _annualReviewNext() {
  const s = _annualReviewState; if (!s) return;
  if (s.currentIdx < s.cards.length - 1) { s.currentIdx++; _annualReviewRender(); }
}
function _annualReviewPrev() {
  const s = _annualReviewState; if (!s) return;
  if (s.currentIdx > 0) { s.currentIdx--; _annualReviewRender(); }
}
function _annualReviewClose() {
  const overlay = document.getElementById('annualReviewOverlay');
  if (overlay) { overlay.classList.remove('open'); overlay.innerHTML = ''; overlay._annRvBound = false; }
  document.removeEventListener('keydown', _annualReviewKeyHandler);
  _annualReviewState = null;
  // 사용자 명시 2026-04-30: 닫을 때 audio 정리
  if (window._annAudio) {
    try { window._annAudio.pause(); window._annAudio.src = ''; } catch {}
    window._annAudio = null;
  }
}

// 사용자 명시 2026-04-30: CD click → toggle play/pause + LP spin class
function _annTogglePlay() {
  if (!window._annAudio) return;
  const songEl = document.querySelector('.ann-rv-song');
  if (window._annAudio.paused) {
    window._annAudio.play().catch(() => {});
    if (songEl) songEl.classList.add('playing');
  } else {
    window._annAudio.pause();
    if (songEl) songEl.classList.remove('playing');
  }
}

