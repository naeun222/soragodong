// 사용자 명시 2026-05-01: 리뷰 모음 카드 클릭 → 풀화면 readonly view (주간 리뷰 미리보기와 동일 흐름).
function openSavedReview(type, key, completedAt) {
  let arr;
  let keyField;
  if (type === 'weekly') { arr = state.weeklyReviews || []; keyField = 'weekKey'; }
  else if (type === 'monthly') { arr = state.monthlyReviews || []; keyField = 'monthKey'; }
  else if (type === 'quarterly') { arr = state.quarterlyReviews || []; keyField = 'quarterKey'; }
  else { showToast('알 수 없는 리뷰 타입: ' + type); return; }

  const review = arr.find(r => r[keyField] === key && (!completedAt || r.completedAt === completedAt));
  if (!review) { showToast('리뷰 못 찾음 (이미 삭제됐을 수 있어)'); return; }

  showScreen('review');
  renderReviewScreen(type, review, { readonly: true });
  // 위로 스크롤
  const screen = document.getElementById('screen-review');
  if (screen) screen.scrollTop = 0;
}

// 사용자 요청 2026-05-01: 리뷰 모음에서 카드 삭제. type + key 매칭. completedAt 도 같이 받아 동일 key 여러 개 있을 시 정확히 그 instance 만 제거 (방어).
// return bool — readonly fullscreen 에서 success 시 list 화면 복귀 위함.
function deleteReview(type, key, completedAt) {
  if (!confirm('이 리뷰 삭제할까? 되돌릴 수 X.')) return false;
  const matchInstance = (r) => {
    if (completedAt && r.completedAt) return r.completedAt === completedAt;
    return true;  // completedAt 없으면 key 매칭만
  };
  if (type === 'weekly') {
    state.weeklyReviews = (state.weeklyReviews || []).filter(r => !(r.weekKey === key && matchInstance(r)));
  } else if (type === 'monthly') {
    state.monthlyReviews = (state.monthlyReviews || []).filter(r => !(r.monthKey === key && matchInstance(r)));
  } else if (type === 'quarterly') {
    state.quarterlyReviews = (state.quarterlyReviews || []).filter(r => !(r.quarterKey === key && matchInstance(r)));
  } else {
    showToast('알 수 없는 리뷰 타입: ' + type);
    return false;
  }
  saveState();
  if (typeof saveToCloudNow === 'function') saveToCloudNow().catch(() => {});
  if (typeof renderArchiveReviews === 'function') renderArchiveReviews();
  showToast('🗑 리뷰 삭제됨');
  return true;
}

// V4-fix v3 (사용자 요청 — 1~6 통합): 리뷰별 깨달음 깊은 가공
// 사용자 명시 2026-04-30 ultrathink: opts.archiveOverride 추가 — 주간 리뷰 본 화면 (저장 전 / preview 시드) 통째로 호출 가능.
function _buildReviewArchiveSummaryHTML(review, opts) {
  opts = opts || {};
  const _archiveSource = Array.isArray(opts.archiveOverride) ? opts.archiveOverride : (state.archive || []);
  let startMs = null, endMs = null;
  if (review.quarterKey && typeof getQuarterRange === 'function') {
    const range = getQuarterRange(review.quarterKey);
    if (range) { startMs = new Date(range.start).getTime(); endMs = new Date(range.end).getTime(); }
  } else if (review.monthKey) {
    const mm = String(review.monthKey).match(/^(\d{4})-(\d{2})$/);
    if (mm) {
      const y = parseInt(mm[1]); const mo = parseInt(mm[2]) - 1;
      startMs = new Date(y, mo, 1).getTime();
      endMs = new Date(y, mo + 1, 0, 23, 59, 59).getTime();
    }
  } else if (review.weekKey || review.completedAt) {
    const compMs = new Date(review.completedAt).getTime();
    startMs = compMs - 7 * 86400000;
    endMs = compMs;
  }
  if (startMs == null || endMs == null) return '';
  const arrs = _archiveSource.filter(a => {
    if (!a.savedAt) return false;
    const t = new Date(a.savedAt).getTime();
    return t >= startMs && t <= endMs;
  });
  if (arrs.length === 0) return '';
  const total = arrs.length;

  // 1) 태그 + 분기 비교
  const tagFreq = {};
  arrs.forEach(a => (a.tags || []).forEach(t => { tagFreq[t] = (tagFreq[t] || 0) + 1; }));
  const topTags = Object.entries(tagFreq).sort((a,b) => b[1] - a[1]).slice(0, 6);
  const periodLen = endMs - startMs;
  const prevArrs = _archiveSource.filter(a => {
    if (!a.savedAt) return false;
    const t = new Date(a.savedAt).getTime();
    return t >= (startMs - periodLen) && t < startMs;
  });
  const prevTags = new Set();
  prevArrs.forEach(a => (a.tags || []).forEach(t => prevTags.add(t)));
  const curTags = new Set(Object.keys(tagFreq));
  const newTags = [...curTags].filter(t => !prevTags.has(t));
  const goneTags = [...prevTags].filter(t => !curTags.has(t));
  const stayedTags = [...curTags].filter(t => prevTags.has(t));

  // 2) type 분포 = 사고 모드
  const tCount = { scrap: 0, memo: 0, reflection: 0 };
  arrs.forEach(a => { const t = a.type || 'scrap'; tCount[t] = (tCount[t] || 0) + 1; });
  const scrapPct = Math.round((tCount.scrap || 0) / total * 100);
  const memoPct  = Math.round((tCount.memo  || 0) / total * 100);
  const reflPct  = Math.round((tCount.reflection || 0) / total * 100);
  const modeInsight = (() => {
    if (scrapPct >= 60) return '대화 흐름에서 통찰을 잡는 편 — 외부 자극이 트리거.';
    if (memoPct >= 50)  return '자유롭게 ✎ 메모 — 능동적으로 통찰을 적용하는 편.';
    if (reflPct >= 30)  return '🌊 숙고로 깊이 파는 편 — 큰 질문을 안고 가.';
    return '세 가지 모드 골고루 — 다층 사고가 흐르고 있어.';
  })();

  // 3) 시간 분포 (3등분)
  const third = periodLen / 3;
  const timeBins = [0, 0, 0];
  arrs.forEach(a => {
    const t = new Date(a.savedAt).getTime();
    const bin = Math.min(2, Math.max(0, Math.floor((t - startMs) / third)));
    timeBins[bin]++;
  });
  const timeMaxBin = timeBins.indexOf(Math.max(...timeBins));
  const timeInsight = (() => {
    if (Math.max(...timeBins) - Math.min(...timeBins) <= 1) return '기간 내내 균등하게 — 꾸준한 사색.';
    if (timeMaxBin === 0) return '초반에 통찰 몰림 — 시작이 또렷했어.';
    if (timeMaxBin === 2) return '말미에 통찰 몰림 — 정리할 때 깊어지는 편.';
    return '중반에 통찰 몰림 — 흐름 중간이 깊어.';
  })();
  const tbMax = Math.max(...timeBins, 1);
  const timeBars = timeBins.map((n, i) => {
    const pct = (n / tbMax) * 100;
    const labels = ['초반', '중반', '말미'];
    return `<div style="flex:1; text-align:center;"><div style="height:36px; display:flex; align-items:flex-end;"><div style="width:100%; height:${pct}%; background:linear-gradient(180deg, var(--accent), rgba(212,167,106,0.25)); border-radius:3px 3px 0 0; min-height:3px;"></div></div><div style="font-size:9px; color:var(--text-soft); margin-top:3px;">${labels[i]} ${n}</div></div>`;
  }).join('');

  // 4) 클러스터
  const clusters = topTags.slice(0, 3).map(([tag, count]) => ({
    tag, count,
    items: arrs.filter(a => (a.tags || []).includes(tag)).sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt))
  })).filter(c => c.items.length >= 2);

  // 6) ★ + 다시 본
  const starredArrs = arrs.filter(a => a.starred);
  const topRevisited = arrs.slice().sort((a, b) => (b.revisitCount || 0) - (a.revisitCount || 0)).filter(a => (a.revisitCount || 0) > 0).slice(0, 3);

  // 5) AI 메타 요약 (캐시)
  const metaSummary = review.archiveMetaSummary || '';
  const heads = arrs.filter(a => a.headline).slice(0, 6);

  return `<div class="review-archive-summary">
    <div class="ras-title">✨ 이 기간 깨달음 ${total}개</div>
    ${metaSummary ? `<div class="ras-meta">"${escapeHtml(metaSummary)}"</div>` : (review.id ? `
      <div style="margin-bottom:12px;"><button class="ras-meta-btn" onclick="event.stopPropagation(); generateReviewArchiveMetaSummary('${review.id}')">🤖 AI 핵심 통찰 요약 받기</button></div>
    ` : `
      <div style="margin-bottom:12px; font-size:11px; color:var(--text-soft); padding:8px 10px; background:rgba(255,255,255,0.03); border-radius:6px; line-height:1.6;">🤖 리뷰 저장 후 AI 핵심 통찰 요약 받기 가능</div>
    `)}
    <div class="ras-section">
      <div class="ras-section-label">네 사고 모드</div>
      <div class="ras-mode-bars">
        <div class="ras-mode-row"><span>📌 스크랩 (대화에서)</span><span>${tCount.scrap || 0} · ${scrapPct}%</span></div>
        <div class="ras-mode-row"><span>✎ 메모 (자유)</span><span>${tCount.memo || 0} · ${memoPct}%</span></div>
        ${tCount.reflection ? `<div class="ras-mode-row"><span>🌊 숙고 (깊이)</span><span>${tCount.reflection} · ${reflPct}%</span></div>` : ''}
      </div>
      <div class="ras-insight">${escapeHtml(modeInsight)}</div>
    </div>
    ${topTags.length > 0 ? `<div class="ras-section">
      <div class="ras-section-label">네 화두 무게중심</div>
      <div style="font-size:11px; line-height:2;">${topTags.map(([t, c]) => `<span class="ras-tag">#${escapeHtml(t)} <span class="ras-tag-count">${c}</span></span>`).join('')}</div>
      ${(newTags.length || goneTags.length || stayedTags.length) ? `<div style="margin-top:10px; font-size:11px; line-height:1.7;">
        ${stayedTags.length > 0 ? `<div style="color:var(--text-dim);">↻ 계속되는: ${stayedTags.slice(0,4).map(t => '#' + escapeHtml(t)).join(' · ')}</div>` : ''}
        ${newTags.length > 0 ? `<div style="color:#8fc88f;">+ 새로 등장: ${newTags.slice(0,4).map(t => '#' + escapeHtml(t)).join(' · ')}</div>` : ''}
        ${goneTags.length > 0 ? `<div style="color:var(--text-soft);">− 사라진: ${goneTags.slice(0,4).map(t => '#' + escapeHtml(t)).join(' · ')}</div>` : ''}
      </div>` : ''}
    </div>` : ''}
    <div class="ras-section">
      <div class="ras-section-label">언제 통찰이 깊었나</div>
      <div style="display:flex; gap:6px; align-items:flex-end; padding:4px 0; max-width:240px;">${timeBars}</div>
      <div class="ras-insight">${escapeHtml(timeInsight)}</div>
    </div>
    ${(starredArrs.length > 0 || topRevisited.length > 0) ? `<div class="ras-section">
      <div class="ras-section-label">살아있는 통찰</div>
      ${starredArrs.length > 0 ? `<div style="font-size:11px; color:var(--text-dim); margin-bottom:6px;">★ 즐겨찾기 ${starredArrs.length}개</div>` : ''}
      ${topRevisited.length > 0 ? `<div style="display:flex; flex-direction:column; gap:4px;">${topRevisited.map(a => `<div style="font-size:12px; padding:4px 0;"><span style="color:var(--accent);">↻ ${a.revisitCount}번</span> ${escapeHtml(a.headline || (a.body || '').slice(0,40))}</div>`).join('')}</div>` : ''}
    </div>` : ''}
    ${clusters.length > 0 ? `<div class="ras-section">
      <div class="ras-section-label">테마별 갈래 — 한 화두가 어떻게 자랐나</div>
      ${clusters.map(c => `<div class="ras-cluster"><div class="ras-cluster-tag">#${escapeHtml(c.tag)} (${c.count})</div><div class="ras-cluster-path">${c.items.slice(0, 4).map((a, i) => `<div class="ras-cluster-step"><span class="ras-cluster-num">${i + 1}</span><span class="ras-cluster-text">${escapeHtml(a.headline || (a.body || '').slice(0, 30))}</span></div>`).join('')}</div></div>`).join('')}
    </div>` : ''}
    ${heads.length > 0 ? `<div class="ras-section">
      <div class="ras-section-label">전체 헤드라인</div>
      <div style="display:flex; flex-direction:column; gap:6px;">
        ${heads.map(h => `<div style="font-size:12px; line-height:1.55; padding:5px 0; border-top:1px dashed var(--border);">${h.starred ? '<span style="color:#ffd93d;">★</span> ' : ''}<span style="color:var(--accent);">✦</span> ${escapeHtml(h.headline)}${h.body ? `<div style="font-size:10.5px; color:var(--text-dim); margin-top:2px; padding-left:14px;">${escapeHtml((h.body || '').slice(0, 70))}</div>` : ''}</div>`).join('')}
      </div>
    </div>` : ''}
  </div>`;
}

// V4-fix v3 (5번): AI 메타 요약 — 깨달음들 한 단락 narrative
async function generateReviewArchiveMetaSummary(reviewId) {
  if (!_canAI()) {
    showToast('⚠️ API 키 필요');
    return;
  }
  const review = (state.weeklyReviews || []).concat(state.monthlyReviews || []).concat(state.quarterlyReviews || []).find(r => r.id === reviewId);
  if (!review) { showToast('리뷰 못 찾음'); return; }
  showToast('🤖 AI 통찰 요약 진행 중...');
  let startMs = null, endMs = null;
  if (review.quarterKey && typeof getQuarterRange === 'function') {
    const range = getQuarterRange(review.quarterKey);
    if (range) { startMs = new Date(range.start).getTime(); endMs = new Date(range.end).getTime(); }
  } else if (review.monthKey) {
    const mm = String(review.monthKey).match(/^(\d{4})-(\d{2})$/);
    if (mm) { const y = parseInt(mm[1]); const mo = parseInt(mm[2]) - 1; startMs = new Date(y, mo, 1).getTime(); endMs = new Date(y, mo + 1, 0, 23, 59, 59).getTime(); }
  } else { const compMs = new Date(review.completedAt).getTime(); startMs = compMs - 7 * 86400000; endMs = compMs; }
  const arrs = (state.archive || []).filter(a => { if (!a.savedAt) return false; const t = new Date(a.savedAt).getTime(); return t >= startMs && t <= endMs; });
  if (arrs.length === 0) { showToast('이 기간 깨달음 X'); return; }
  const archiveText = arrs.map(a => `[${a.type}] ${a.headline || ''}: ${a.body || a.userMemo || ''}`).join('\n');
  try {
    const resp = await callAnthropic({
      _endpoint: 'review_insight',
      model: 'claude-haiku-4-5', max_tokens: 250,
      messages: [{ role: 'user', content: `이 기간 사용자 깨달음 ${arrs.length}개. 핵심 통찰 한 단락 (3-4문장)으로 요약. 친구 톤, 외재화 ("X 패턴이 작동" / "너 X적이야" X), 따뜻하게.\n\n${archiveText.slice(0, 3500)}\n\n[출력 — 한 단락만, 마크다운/인용부호 X]` }]
    });
    const data = await resp.json();
    const text = data.content?.[0]?.text?.trim() || '';
    if (text) {
      review.archiveMetaSummary = text.slice(0, 400);
      saveState();
      if (typeof renderArchiveReviews === 'function') renderArchiveReviews();
      showToast('✓ 핵심 통찰 요약됨');
    } else { showToast('AI 응답 비어있음'); }
  } catch (e) { showToast('실패: ' + (e.message || '')); }
}

// 사용자 요청 2026-04-28: 도서관 마법의 소라고동 = 홈의 마법고동 같은 방. archive 별도 화면 X, decisions 화면으로 통일
function showArchiveDecisions() {
  showScreen('decisions');
  if (typeof renderDecisionsList === 'function') renderDecisionsList();
}

// renderArchiveDecisions 함수 삭제 (사용자 요청 2026-04-28) — showArchiveDecisions가 'decisions' 화면으로 통일된 후 dead code

// Update count badges on archive quick buttons
function updateArchiveQuickCounts() {
  const reviewCount = (state.weeklyReviews || []).length + (state.monthlyReviews || []).length + (state.quarterlyReviews || []).length;
  const decisionCount = (state.decisions || []).length;
  const reviewEl = document.getElementById('aqReviewCount');
  const decisionEl = document.getElementById('aqDecisionCount');
  if (reviewEl) reviewEl.textContent = reviewCount > 0 ? `${reviewCount}건` : '';
  if (decisionEl) decisionEl.textContent = decisionCount > 0 ? `${decisionCount}건` : '';
}

// === LENS 3: PEARLS — 진주 바구니 ===
// V4-1r: 🔮 진주 그리드 = Pinterest 갤러리. 카테고리 칩 필터 + masonry-style.
let _pearlCatFilter = null;

function setPearlCatFilter(cat) {
  _pearlCatFilter = (_pearlCatFilter === cat) ? null : cat;
  renderLensPearls();
}

function renderLensPearls() {
  const container = document.getElementById('lensPearls');
  if (!container) return;

  let pearls = (state.pearls || [])
    .filter(p => p.type !== 'dna_pearl')  // DNA 진주는 모래사장 — 도서관 진주 갤러리 X (V4 비전 7.2)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  // 사용자 보고 2026-04-29: 검색 미적용 버그 fix
  const _qPearls = _archiveSearchQuery;
  if (_qPearls) {
    pearls = pearls.filter(p => {
      const fields = [p.content, p.note, p.category];
      if (p.track) fields.push(p.track.title, p.track.artist);
      return fields.filter(Boolean).join(' ').toLowerCase().includes(_qPearls);
    });
  }
  const categories = state.preferences?.pearlBasketCategories || ['음악', '음식', '장소', '순간', '사람'];

  // V3.12.x: 진주 비언어적 인트로
  let html = `
    <div class="pearls-intro">
      <div class="pearls-intro-header">
        <span class="pearls-intro-emoji">💎</span>
        <div class="pearls-intro-text">살아있다 느낀 순간들</div>
      </div>
      <div class="pearls-intro-grid">
        <div class="pi-cat${_pearlCatFilter === '음악' ? ' active' : ''}" onclick="setPearlCatFilter('음악')" role="button" tabindex="0">🎵<span>음악</span></div>
        <div class="pi-cat${_pearlCatFilter === '음식' ? ' active' : ''}" onclick="setPearlCatFilter('음식')" role="button" tabindex="0">🍴<span>맛</span></div>
        <div class="pi-cat${_pearlCatFilter === '장소' ? ' active' : ''}" onclick="setPearlCatFilter('장소')" role="button" tabindex="0">📍<span>장소</span></div>
        <div class="pi-cat${_pearlCatFilter === '순간' ? ' active' : ''}" onclick="setPearlCatFilter('순간')" role="button" tabindex="0">✨<span>순간</span></div>
        <div class="pi-cat${_pearlCatFilter === '사람' ? ' active' : ''}" onclick="setPearlCatFilter('사람')" role="button" tabindex="0">👥<span>사람</span></div>
      </div>
    </div>
    <button class="pearls-add-btn" onclick="addPearl()">+ 진주 하나 더하기</button>
  `;

  // 사용자 요청 2026-04-29: 진주 grid 뷰의 별도 카테고리 칩 제거 — 위 '살아있다 느낀 순간들' 인트로의 pi-cat이 같은 역할
  if (_pearlCatFilter) {
    pearls = pearls.filter(p => (p.category || '기타') === _pearlCatFilter);
  }

  if (pearls.length === 0) {
    html += `<div class="pearls-empty">
      <div style="font-size:11px; color:var(--text-dim); line-height:1.7; margin-top:8px;">
        "좋다" 떠올린 거 → 진주.<br>
        <span style="opacity:0.7;">대화에서 흘린 취향도 나중에 자동으로 ✦</span>
      </div>
    </div>`;
  } else if (_libView === 'grid') {
    // V4-fix v2 (사용자 보고): Pinterest masonry — 다양 사이즈 + 미세 회전 + 날짜 + 음악 placeholder
    html += `<div class="pearls-pinterest">`;
    pearls.forEach((p, idx) => {
      // deterministic seed per pearl
      const seed = (p.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), idx);
      // 미세 회전 (4 variant) — 진짜 흩뿌림 느낌
      const tiltVariants = ['', 'left', 'right', 'leftS', 'rightS', '', '', ''];
      const tiltAttr = tiltVariants[seed % tiltVariants.length];
      // 1/4 확률로 큰 타일 (강조)
      const isLarge = (seed % 7 === 0);
      const sizeClass = isLarge ? ' tile-large' : '';
      const tiltStr = tiltAttr ? ` data-tilt="${tiltAttr}"` : '';
      // 날짜
      const dateStr = p.createdAt
        ? new Date(p.createdAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
        : '';
      if (p.category === '음악' && p.track) {
        // 사용자 보고 2026-04-29: artwork onerror replaceWith가 DOM 변경 → masonry layout 재계산 → 첫 카드 깜빡임.
        // onerror=null로 무한 retry 차단 + decoding/loading 힌트로 안정적 로드.
        const artHtml = p.track.artworkUrl
          ? `<img src="${escapeHtml(p.track.artworkUrl)}" alt="${escapeHtml(p.track.title || '')}" class="tile-music-art" loading="lazy" decoding="async" onerror="this.onerror=null;this.style.display='none';this.parentElement.classList.add('art-failed');">`
          : `<div class="tile-music-art music-card-art-placeholder">${_MUSIC_WAVE_SVG}</div>`;
        // 사용자 요청 2026-04-29: 진주에서 ▶ 미리듣기 + 🎵 음악 서비스 (사용자 명시 2026-05-02: 5 서비스 중 사용자 선택)
        const playBtnHtml = p.track.previewUrl
          ? `<button class="pearl-tile-play" onclick="event.stopPropagation(); toggleMusicPreview(this, '${escapeHtml(p.track.previewUrl)}')" aria-label="미리듣기">▶</button>`
          : '';
        const appleBtnHtml = (p.track.trackUrl || p.track.title)
          ? `<button class="pearl-tile-apple" onclick="event.stopPropagation(); _openMusicServiceByPearlId('${escapeHtml(p.id)}')" aria-label="음악 듣기">${_MUSIC_WAVE_SVG}</button>`
          : '';
        html += `
          <div class="pinterest-tile tile-music${sizeClass}"${tiltStr} onclick="openPearl('${p.id}')">
            <div class="tile-music-art-wrap">
              ${artHtml}
              ${playBtnHtml}
              ${appleBtnHtml}
            </div>
            <div class="tile-music-meta">
              <div class="tile-music-title">${escapeHtml(p.track.title || '')}</div>
              <div class="tile-music-artist">${escapeHtml(p.track.artist || '')}</div>
              ${p.note ? `<div class="tile-note">${escapeHtml(p.note.slice(0, 40))}</div>` : ''}
              ${dateStr ? `<div class="tile-date">${dateStr}</div>` : ''}
            </div>
          </div>
        `;
      } else if (p.video) {
        // V4 (사용자 명시): 동영상 진주 pinterest-tile — 썸네일만 (사진과 동일). 클릭 시 모달에서 재생.
        const iconMap = { 음식: '🍴', 장소: '📍', 순간: '✨', 사람: '👥' };
        const icon = iconMap[p.category] || '💎';
        const thumb = p.videoThumbnail;
        // 사용자 명시 2026-05-04: 영상 진주 제목 = bare content (이모티콘 prefix 제거)
        const _vTitle = (typeof _stripLeadingEmoji === 'function') ? _stripLeadingEmoji(p.content || '') : (p.content || '');
        const visual = thumb
          ? `<img src="${thumb}" alt="${escapeHtml(_vTitle)}" class="tile-photo-art">`
          : `<div class="tile-photo-art video-thumb-placeholder">📹</div>`;
        html += `
          <div class="pinterest-tile tile-photo${sizeClass}"${tiltStr} onclick="openPearl('${p.id}')">
            ${visual}
            <div class="tile-music-meta">
              <div class="tile-music-title">${escapeHtml(_vTitle)}</div>
              ${p.note ? `<div class="tile-note">${escapeHtml(p.note.slice(0, 40))}</div>` : ''}
              ${dateStr ? `<div class="tile-date">${dateStr}</div>` : ''}
            </div>
          </div>
        `;
      } else if (p.photo) {
        const iconMap = { 음식: '🍴', 장소: '📍', 순간: '✨', 사람: '👥' };
        const icon = iconMap[p.category] || '💎';
        html += `
          <div class="pinterest-tile tile-photo${sizeClass}"${tiltStr} onclick="openPearl('${p.id}')">
            <img src="${p.photo}" alt="${escapeHtml(p.content || '')}" class="tile-photo-art">
            <div class="tile-music-meta">
              <div class="tile-music-title">${icon} ${escapeHtml(p.content || '')}</div>
              ${p.note ? `<div class="tile-note">${escapeHtml(p.note.slice(0, 40))}</div>` : ''}
              ${dateStr ? `<div class="tile-date">${dateStr}</div>` : ''}
            </div>
          </div>
        `;
      } else {
        const iconMap = { 음악: '🎵', 음식: '🍴', 장소: '📍', 순간: '✨', 사람: '👥', 기타: '💎' };
        const icon = iconMap[p.category || '기타'] || '💎';
        html += `
          <div class="pinterest-tile tile-text${sizeClass}"${tiltStr} onclick="openPearl('${p.id}')">
            <div class="tile-icon">${icon}</div>
            <div class="tile-text-content">${escapeHtml(p.content || '')}</div>
            ${p.note ? `<div class="tile-note">${escapeHtml(p.note.slice(0, 50))}</div>` : ''}
            ${dateStr ? `<div class="tile-date">${dateStr}</div>` : ''}
          </div>
        `;
      }
    });
    html += `</div>`;
  } else {
    // timeline (시간순 평면 — 카테고리 그룹 X)
    html += `<div class="pearls-timeline">`;
    pearls.forEach(p => {
      if (p.category === '음악' && p.track) {
        html += `
          <div class="pearl-music-row pearl-card pearl-music-card" onclick="openPearl('${p.id}')">
            ${renderMusicCardHTML(p.track)}
            ${p.note ? `<div style="font-size:11px; color:var(--text-dim); margin-top:6px; padding:0 4px;">${escapeHtml(p.note)}</div>` : ''}
          </div>
        `;
      } else if (p.video) {
        // V4 (사용자 명시): 동영상 진주 timeline — 썸네일만 (사진 패턴). 클릭 시 모달에서 재생.
        const iconMap = { 음식: '🍴', 장소: '📍', 순간: '✨', 사람: '👥' };
        const icon = iconMap[p.category] || '💎';
        const thumb = p.videoThumbnail;
        // 사용자 명시 2026-05-04: 영상 진주 제목 = bare content (이모티콘 prefix 제거)
        const _vTitle = (typeof _stripLeadingEmoji === 'function') ? _stripLeadingEmoji(p.content || '') : (p.content || '');
        const visual = thumb
          ? `<img src="${thumb}" alt="" class="pearl-photo-thumb">`
          : `<div class="pearl-photo-thumb video-thumb-placeholder">📹</div>`;
        html += `
          <div class="pearl-card pearl-photo-card" onclick="openPearl('${p.id}')">
            ${visual}
            <div class="pearl-photo-meta">
              <div class="pearl-card-content">${escapeHtml(_vTitle)}</div>
              ${p.note ? `<div style="font-size:11px; color:var(--text-dim); margin-top:4px;">${escapeHtml(p.note)}</div>` : ''}
            </div>
          </div>
        `;
      } else if (p.photo) {
        // V4-fix: 사진 진주 timeline (작은 thumbnail + 메타)
        const iconMap = { 음식: '🍴', 장소: '📍', 순간: '✨', 사람: '👥' };
        const icon = iconMap[p.category] || '💎';
        html += `
          <div class="pearl-card pearl-photo-card" onclick="openPearl('${p.id}')">
            <img src="${p.photo}" alt="" class="pearl-photo-thumb">
            <div class="pearl-photo-meta">
              <div class="pearl-card-content">${icon} ${escapeHtml(p.content || '')}</div>
              ${p.note ? `<div style="font-size:11px; color:var(--text-dim); margin-top:4px;">${escapeHtml(p.note)}</div>` : ''}
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="pearl-card" onclick="openPearl('${p.id}')">
            <div class="pearl-card-content">${escapeHtml(p.content || '')}</div>
            ${p.note ? `<div style="font-size:10px; color:var(--text-dim); margin-top:6px;">${escapeHtml(p.note.slice(0,50))}</div>` : ''}
          </div>
        `;
      }
    });
    html += `</div>`;
  }

  container.innerHTML = html;
  if (typeof hydratePearlVideos === 'function') hydratePearlVideos();
}

