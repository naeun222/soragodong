// V4-fix: 분기 리뷰 deep dive — 6 비교 축 시각 카드 (anchor 3 / 비전 7.10)
// 1. 8 차원 (problems↓ / strengths↑) / 2. 추적 항목 / 3. 모드 빈도
// 4. 진화율 / 5. 진주 수 / 6. growth 차원
// 직전 분기와 비교 (있으면) → ↑↓ 표시. 정체 감지 → "변화 X도 의미"
function renderQuarterlyDeepDive(review) {
  const s = review.stats || {};
  // 직전 분기 stats (비교용)
  const prevQ = (() => {
    const m = String(review.quarterKey || '').match(/^(\d{4})-Q(\d)$/);
    if (!m) return null;
    let y = parseInt(m[1]);
    let q = parseInt(m[2]) - 1;
    if (q < 1) { q = 4; y -= 1; }
    const prevKey = `${y}-Q${q}`;
    const prev = (state.quarterlyReviews || []).find(r => r.quarterKey === prevKey);
    return prev?.stats || null;
  })();

  const trend = (cur, prev) => {
    if (prev == null || cur == null) return '';
    if (cur > prev) return `<span class="dd-up" title="이전 분기 ${prev}">↑${cur - prev}</span>`;
    if (cur < prev) return `<span class="dd-down" title="이전 분기 ${prev}">↓${prev - cur}</span>`;
    return '<span class="dd-flat" title="이전 분기와 같음">→</span>';
  };

  // 1. 효과 본 시도 — 막대 + % (사용자 명시 2026-05-09 ultrathink: "진화율" 분석가 어휘 → "효과 본 시도" 일상어)
  const workRate = s.workRate != null ? Math.round(s.workRate * 100) : null;
  const prevWorkRate = prevQ?.workRate != null ? Math.round(prevQ.workRate * 100) : null;
  const workCard = workRate != null
    ? `<div class="dd-card">
         <div class="dd-card-label">🎯 효과 본 시도</div>
         <div class="dd-card-value">${workRate}<span class="dd-card-unit">%</span> ${trend(workRate, prevWorkRate)}</div>
         <div class="dd-bar-track"><div class="dd-bar-fill" style="width:${workRate}%;"></div></div>
         <div class="dd-card-sub">${s.worked || 0}/${s.attempts || 0} 번 중</div>
       </div>`
    : `<div class="dd-card dd-card-empty">
         <div class="dd-card-label">🎯 효과 본 시도</div>
         <div class="dd-card-empty-msg">아직 시도 X</div>
       </div>`;

  // 2. 진주 수
  const pearlsTotal = (s.pearls || 0) + (s.dnaPearls || 0);
  const prevPearlsTotal = prevQ ? (prevQ.pearls || 0) + (prevQ.dnaPearls || 0) : null;
  const pearlCard = `<div class="dd-card">
    <div class="dd-card-label">🔮 진주</div>
    <div class="dd-card-value">${pearlsTotal} ${trend(pearlsTotal, prevPearlsTotal)}</div>
    <div class="dd-card-sub">${s.pearls || 0} 일반${s.dnaPearls ? ` · ${s.dnaPearls} DNA` : ''}</div>
  </div>`;

  // 3. 체크인 일수
  const checkinCard = `<div class="dd-card">
    <div class="dd-card-label">📔 체크인</div>
    <div class="dd-card-value">${s.checkins || 0}<span class="dd-card-unit">일</span> ${trend(s.checkins || 0, prevQ?.checkins)}</div>
  </div>`;

  // 4. 모드 빈도 (top 1)
  const modes = s.modeCount || {};
  const topMode = Object.entries(modes).sort((a,b) => b[1] - a[1])[0];
  const modeMap = { exam: '📚 시험', travel: '✈️ 여행', sick: '🤒 아픔', rest: '🏖 휴식', period: '🩸 월경', drained: '🪫 방전' };
  const modeCard = topMode
    ? `<div class="dd-card">
         <div class="dd-card-label">🌫 자주 활성된 모드</div>
         <div class="dd-card-value-text">${modeMap[topMode[0]] || topMode[0]}</div>
         <div class="dd-card-sub">${topMode[1]}일</div>
       </div>`
    : `<div class="dd-card dd-card-empty">
         <div class="dd-card-label">🌫 모드</div>
         <div class="dd-card-empty-msg">활성 모드 거의 없음</div>
       </div>`;

  // 5. 추적 항목 변화 (top 1)
  const trackerTop = (s.trackerStats || [])[0];
  const trackerCard = trackerTop
    ? `<div class="dd-card">
         <div class="dd-card-label">📊 트래커</div>
         <div class="dd-card-value-text">${escapeHtml(trackerTop.title)}</div>
         <div class="dd-card-sub">${trackerTop.first ?? '?'} → ${trackerTop.last ?? '?'}${trackerTop.unit || ''} (${trackerTop.count}회)</div>
       </div>`
    : `<div class="dd-card dd-card-empty">
         <div class="dd-card-label">📊 트래커</div>
         <div class="dd-card-empty-msg">기록 X</div>
       </div>`;

  // 6. 너의 결 (problems / strengths / growth) — 사용자 명시 2026-05-09 ultrathink: "8 차원" 추상 어휘 → "너의 결" 일상어
  const dimsCard = `<div class="dd-card">
    <div class="dd-card-label">🪞 너의 결</div>
    <div class="dd-card-dim-row">
      <span title="짚어본 곳"><span class="dd-dim-icon">💧</span> ${s.problemsTotal || 0}</span>
      <span title="잘 풀린 곳"><span class="dd-dim-icon">✨</span> ${s.strengthsTotal || 0}</span>
      <span title="자라는 곳"><span class="dd-dim-icon">🌱</span> ${s.growthCount || 0}</span>
    </div>
  </div>`;

  // 정체 감지 — 모든 비교 축에서 변화 거의 없음
  let stagnationMsg = '';
  if (prevQ) {
    const flat = (workRate === prevWorkRate) && (pearlsTotal === prevPearlsTotal) && ((s.checkins || 0) === (prevQ.checkins || 0));
    if (flat && (workRate != null || pearlsTotal > 0)) {
      stagnationMsg = `<div class="dd-stagnation">머무는 시간도 의미 있어. 변화 X = 안정 또는 숙성 중일 수도.</div>`;
    }
  }

  return `<div class="dd-grid">
    ${workCard}
    ${pearlCard}
    ${checkinCard}
    ${modeCard}
    ${trackerCard}
    ${dimsCard}
  </div>${stagnationMsg}`;
}

// 사용자 명시 2026-05-09: 리뷰 모음에 카테고리 chip — 전체/주/월/계절/연간.
let _archiveReviewCategory = 'all';
function setArchiveReviewCategory(cat) {
  _archiveReviewCategory = cat || 'all';
  renderArchiveReviews();
}

function renderArchiveReviews() {
  const container = document.getElementById('archiveReviewsList');
  if (!container) return;

  const cat = _archiveReviewCategory || 'all';
  const weekly = (state.weeklyReviews || []).map(r => ({...r, type: 'weekly'}));
  const monthly = (state.monthlyReviews || []).map(r => ({...r, type: 'monthly'}));
  const quarterly = (state.quarterlyReviews || []).map(r => ({...r, type: 'quarterly'}));
  const annual = (state.annualReviews || []).map(r => ({...r, type: 'annual', completedAt: r.completedAt}));
  const allCombined = [...weekly, ...monthly, ...quarterly, ...annual].sort((a, b) =>
    new Date(b.completedAt) - new Date(a.completedAt)
  );
  const filtered = (cat === 'all')
    ? allCombined
    : allCombined.filter(r => r.type === cat);

  // 카테고리 chip row — 카테고리 별 카운트 표시
  const counts = {
    all: allCombined.length,
    weekly: weekly.length,
    monthly: monthly.length,
    quarterly: quarterly.length,
    annual: annual.length,
  };
  const chipHtml = `
    <div class="archive-review-chips">
      <button class="arc-chip${cat === 'all' ? ' is-active' : ''}" onclick="setArchiveReviewCategory('all')">전체 <span class="arc-chip-count">${counts.all}</span></button>
      <button class="arc-chip${cat === 'weekly' ? ' is-active' : ''}" onclick="setArchiveReviewCategory('weekly')">주 <span class="arc-chip-count">${counts.weekly}</span></button>
      <button class="arc-chip${cat === 'monthly' ? ' is-active' : ''}" onclick="setArchiveReviewCategory('monthly')">월 <span class="arc-chip-count">${counts.monthly}</span></button>
      <button class="arc-chip${cat === 'quarterly' ? ' is-active' : ''}" onclick="setArchiveReviewCategory('quarterly')">계절 <span class="arc-chip-count">${counts.quarterly}</span></button>
      <button class="arc-chip${cat === 'annual' ? ' is-active' : ''}" onclick="setArchiveReviewCategory('annual')">연간 <span class="arc-chip-count">${counts.annual}</span></button>
    </div>
  `;

  // 한 해 분기 4개 모두 있으면 '🌟 연간 Stories' 카드 (전체/연간 카테고리 시만)
  const yearGroups = {};
  (state.quarterlyReviews || []).forEach(r => {
    const yr = (r.quarterKey || '').split('-')[0];
    if (!yr) return;
    if (!yearGroups[yr]) yearGroups[yr] = 0;
    yearGroups[yr]++;
  });
  const fullYears = Object.keys(yearGroups).filter(yr => yearGroups[yr] >= 4).sort().reverse();
  let annualCardHtml = '';
  if (fullYears.length > 0 && (cat === 'all' || cat === 'annual')) {
    annualCardHtml = fullYears.map(yr => `
      <div class="timeline-day annual-stories-card" data-year="${yr}" onclick="event.stopPropagation(); openAnnualReview(${yr})" style="cursor:pointer; background: linear-gradient(135deg, rgba(212,167,106,0.18), rgba(168,157,200,0.18)); border: 1px solid var(--accent);">
        <div class="timeline-day-date">🌟 ${yr}년 연간 리뷰</div>
        <div class="timeline-day-summary" style="font-family: 'Gowun Batang', serif; font-size: 14px;">
          올 한 해, 너의 이야기.
        </div>
        <div class="timeline-day-meta"><span>▶ 같이 보자</span></div>
      </div>
    `).join('');
  }

  if (filtered.length === 0 && !annualCardHtml) {
    const emptyMsg = cat === 'weekly' ? '아직 주간 리뷰 없어.<br>일요일 4AM 자동 또는 홈 카드 직접 탭.'
      : cat === 'monthly' ? '아직 월간 리뷰 없어.<br>매월 1주차 자동.'
      : cat === 'quarterly' ? '아직 계절 리뷰 없어.<br>매분기 1주차 자동.'
      : cat === 'annual' ? '아직 연간 리뷰 없어.<br>한 해 분기 4개 모두 채우면 자동.'
      : '아직 리뷰가 없어요.<br>매주 일요일 / 매월 첫 날 / 매년 첫 날에<br>자동으로 정리됩니다.';
    container.innerHTML = chipHtml + `<div class="timeline-empty"><div class="icon">🌙</div>${emptyMsg}</div>`;
    return;
  }

  container.innerHTML = chipHtml + annualCardHtml + filtered.map((r, idx) => {
    const date = new Date(r.completedAt);
    const dateStr = date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    const seasonLabel = r.type === 'quarterly' && r.quarterKey && typeof seasonLabelOf === 'function'
      ? seasonLabelOf(r.quarterKey, { withEmoji: true })
      : null;
    const typeLabel = r.type === 'weekly' ? '🌙 주간 리뷰'
      : r.type === 'monthly' ? '📅 월간 리뷰'
      : r.type === 'annual' ? '🌟 연간 리뷰'
      : (seasonLabel ? `${seasonLabel} 리뷰` : '📊 분기 리뷰');
    const periodLabel = (r.type === 'quarterly' || r.type === 'annual') ? '' : (r.weekKey || r.monthKey || '');
    const autoTag = r.auto ? ' <span style="font-size:9px; color:var(--purple); padding:1px 6px; background:var(--purple-dim); border-radius:6px; margin-left:4px;">🤖 자동</span>' : '';

    let summaryLine = '';
    if (r.one_word || r.one_word_weekly) {
      const ow = r.one_word || r.one_word_weekly;
      summaryLine = `<span style="color:var(--accent); font-weight:600;">${escapeHtml(ow)}</span>`;
      if (r.pattern && r.pattern.headline) summaryLine += ` · <span style="opacity:0.85;">${escapeHtml(r.pattern.headline)}</span>`;
    } else if (r.pattern && r.pattern.headline) {
      summaryLine = escapeHtml(r.pattern.headline);
    } else if (r.summary) {
      summaryLine = escapeHtml(r.summary);
    } else {
      summaryLine = '(요약 없음)';
    }
    const reviewKey = r.weekKey || r.monthKey || r.quarterKey || '';
    const completedAtJs = r.completedAt ? `'${r.completedAt}'` : 'null';
    // 사용자 명시 2026-05-10 (큐 8): weekly 만 inline 펼침. 다른 type 은 옛 화면 전환.
    // V4 (사용자 보고 2026-05-28 — 옵션 2 Story mode): preference 'story' 시 weekly 카드 click 도 풀스크린 story 직진.
    const _weeklyStoryMode = !!(state.preferences && state.preferences.weeklyReviewLayout === 'story');
    const onClickJs = r.type === 'annual'
      ? `openAnnualReview(${r.year || 'null'})`
      : r.type === 'weekly'
        ? (_weeklyStoryMode ? `_openWeeklyAsStoryFromCard('${r.id}', true)` : `_toggleWeeklyInlineExpand('${r.id}')`)
        : `openSavedReview('${r.type}', '${escapeHtml(reviewKey)}', ${completedAtJs})`;
    const _isWeekly = r.type === 'weekly';
    const _ctaText = _isWeekly ? '▾ 펼쳐보기' : '▶ 같이 보자';
    // 사용자 명시 2026-05-11: weekly/monthly/quarterly/annual 리뷰 삭제 허용.
    const _isDeletable = r.type === 'weekly' || r.type === 'monthly' || r.type === 'quarterly' || r.type === 'annual';
    const _deleteBtn = _isDeletable
      ? `<button class="timeline-day-delete" type="button" onclick="event.stopPropagation(); deleteArchiveReview('${r.type}', '${r.id || ''}')" title="삭제" aria-label="삭제">×</button>`
      : '';

    return `
      <div class="timeline-day${_isWeekly ? ' weekly-inline-card' : ''}" data-review-id="${r.id}" onclick="${onClickJs}" style="cursor:pointer; position:relative;">
        ${_deleteBtn}
        <div class="timeline-day-date">${typeLabel}${periodLabel ? ` · ${periodLabel}` : ''}${autoTag}</div>
        <div class="timeline-day-summary" style="font-family: 'Gowun Batang', serif; font-size: 14px;">
          ${summaryLine}
        </div>
        <div class="timeline-day-meta"><span>${dateStr} · ${_ctaText}</span></div>
        ${_isWeekly ? `<div class="weekly-inline-detail" id="wid-${r.id}" style="display:none;"></div>` : ''}
      </div>
    `;
  }).join('');
}

// 사용자 명시 2026-05-11: 리뷰 모음에서 주/월/분기/연 리뷰 모두 삭제 가능.
//   삭제 = state array 에서 hard splice → AI substrate 자동 제외.
function deleteArchiveReview(type, id) {
  if (!type || !id) return;
  const labelMap = {
    'weekly':       '주간 리뷰',
    'monthly':      '월간 리뷰',
    'quarterly':    '계절 리뷰',
    'annual':       '연간 리뷰',
  };
  const arrMap = {
    'weekly':       'weeklyReviews',
    'monthly':      'monthlyReviews',
    'quarterly':    'quarterlyReviews',
    'annual':       'annualReviews',
  };
  const label = labelMap[type] || '항목';
  const arrKey = arrMap[type];
  if (!arrKey) return;
  const arr = state[arrKey];
  if (!Array.isArray(arr)) return;
  const found = arr.find(x => x && x.id === id);
  if (!found) {
    if (typeof showToast === 'function') showToast(`${label}을 찾을 수 없어`);
    return;
  }
  if (!confirm(`이 ${label} 지울까? (되돌릴 수 없음)`)) return;
  state[arrKey] = arr.filter(x => x && x.id !== id);
  if (typeof saveState === 'function') saveState(true);
  if (typeof showToast === 'function') showToast(`${label} 지웠어`);
  if (typeof renderArchiveReviews === 'function') renderArchiveReviews();
}

// 사용자 명시 2026-05-10 (큐 8): weekly 카드 inline 펼침 — 화면 전환 X, 카드 안 4 섹션 toggle.
//   4 섹션: MOMENTUM / 장면 3가지 / 흐름 / 부드러운 알림. 옛 schema (one_word_weekly / scenes / pattern.headline / risk_signals) 매핑.
function _toggleWeeklyInlineExpand(reviewId) {
  const detail = document.getElementById('wid-' + reviewId);
  if (!detail) return;
  const r = (state.weeklyReviews || []).find(x => x && x.id === reviewId);
  if (!r) return;
  if (detail.style.display === 'none' || !detail.innerHTML) {
    // expand
    const escape = (s) => (typeof escapeHtml === 'function' ? escapeHtml(String(s || '')) : String(s || ''));
    const _momentum = r.one_word_weekly || r.one_word || '';
    const _momentumLine = r.momentum_line || '';  // 사용자 명시 2026-05-10
    const _scenesArr = Array.isArray(r.scenes) ? r.scenes.slice(0, 3) : [];
    const _flow = r.flow || (r.pattern && r.pattern.headline) || r.summary || '';
    const _cycles = r.cycles || {};
    const _hasCycles = !!(typeof _cycles === 'object' && (_cycles.sleep || _cycles.mode || _cycles.other));
    const _soft = r.soft_notice || (Array.isArray(r.risk_signals) && r.risk_signals[0]) || '';
    // 활력/기분 7일 차트.
    // V4 fix (사용자 보고 2026-05-28 ultrathink): 차트 range = review.weekKey 기반 (renderReviewScreen 과 동일).
    //   옛 (2026-05-10): completedAt - 7일 rolling → 백필/재생성 review (completedAt=now) 면 실제 주와 무관하게 항상 '현재 주' 차트.
    //   renderReviewScreen 은 2026-05-22 에 weekKey 기반으로 고쳤는데 이 인라인 펼침만 옛 rolling 로직 잔존 → W18/W19/W21 셋 다 5/21~27 버그.
    let _chartHtml = '';
    if (typeof _renderReviewMoodChartInline === 'function') {
      let _cutoff, _cutoffEnd;
      const _range = (typeof _weeklyChartRangeFromKey === 'function' && r.weekKey)
        ? _weeklyChartRangeFromKey(r.weekKey)
        : null;
      if (_range) {
        _cutoff = _range.start; _cutoffEnd = _range.end;
      } else {
        // fallback (weekKey 없는 옛 review) — completedAt 기준 -7일
        const _refDate = r.completedAt ? new Date(r.completedAt) : new Date();
        _cutoff = new Date(_refDate.getTime() - 7 * 86400000);
        _cutoffEnd = _refDate;
      }
      const _entries = (state.entries || []).filter(e => {
        if (!e.date) return false;
        const d = new Date(e.date + 'T12:00:00');
        return d >= _cutoff && d < _cutoffEnd;
      }).slice(-7);
      if (_entries.length >= 2) {
        try { _chartHtml = _renderReviewMoodChartInline(_entries); } catch {}
      }
    }
    detail.innerHTML = `
      <div class="wid-inner" onclick="event.stopPropagation();">
        ${_momentum ? `
          <div class="wid-section">
            <div class="wid-label">이번 주 MOMENTUM</div>
            <div class="wid-momentum">${escape(_momentum)}</div>
            ${_momentumLine ? `<div class="wid-momentum-line">${escape(_momentumLine)}</div>` : ''}
          </div>` : ''}
        ${_chartHtml ? `
          <div class="wid-section">
            <div class="wid-label">활력 / 기분 — 이번 주</div>
            <div class="wid-chart">${_chartHtml}</div>
          </div>` : ''}
        ${_scenesArr.length > 0 ? `
          <div class="wid-section">
            <div class="wid-label">이번 주 장면 ${_scenesArr.length}가지</div>
            <div class="wid-scenes">
              ${_scenesArr.map((s, i) => `<div class="wid-scene"><span class="wid-scene-num">${i + 1}</span>${escape(typeof s === 'string' ? s : (s.text || s.summary || ''))}</div>`).join('')}
            </div>
          </div>` : ''}
        ${_flow ? `
          <div class="wid-section">
            <div class="wid-label">이번 주 흐름</div>
            <div class="wid-text">${escape(_flow)}</div>
          </div>` : ''}
        ${_hasCycles ? `
          <div class="wid-section">
            <div class="wid-label">사이클</div>
            <div class="wid-cycles">
              ${_cycles.sleep ? `<div class="wid-cycle-row"><span class="wid-cycle-key">😴 수면</span><span class="wid-cycle-val">${escape(_cycles.sleep)}</span></div>` : ''}
              ${_cycles.mode ? `<div class="wid-cycle-row"><span class="wid-cycle-key">⚡ 모드</span><span class="wid-cycle-val">${escape(_cycles.mode)}</span></div>` : ''}
              ${_cycles.other ? `<div class="wid-cycle-row"><span class="wid-cycle-key">🌙 외부</span><span class="wid-cycle-val">${escape(_cycles.other)}</span></div>` : ''}
            </div>
          </div>` : ''}
        ${_soft ? `
          <div class="wid-section">
            <div class="wid-label">부드러운 알림</div>
            <div class="wid-text wid-soft">${escape(typeof _soft === 'string' ? _soft : (_soft.text || _soft.message || ''))}</div>
          </div>` : ''}
        ${(!_momentum && !_scenesArr.length && !_flow && !_soft && !_hasCycles) ? `<div class="wid-empty">아직 정리된 내용이 없어 — 다음 주에 다시.</div>` : ''}
        <div class="wid-actions">
          <button class="wid-btn-close" type="button" onclick="event.stopPropagation(); _toggleWeeklyInlineExpand('${reviewId}')">접기</button>
          <button class="wid-btn-delete" type="button" onclick="event.stopPropagation(); deleteReview('weekly', '${escape(r.weekKey || '')}', '${r.completedAt || ''}')">🗑 삭제</button>
        </div>
        ${(typeof _switchToStoryFromInline === 'function') ? `<button class="review-layout-hint" type="button" onclick="event.stopPropagation(); _switchToStoryFromInline('${reviewId}')">✦ Story mode 로 보기 (옵션 2 · 실험)</button>` : ''}
      </div>
    `;
    detail.style.display = 'block';
    const card = detail.closest('.weekly-inline-card');
    if (card) card.classList.add('is-expanded');
  } else {
    detail.style.display = 'none';
    detail.innerHTML = '';
    const card = detail.closest('.weekly-inline-card');
    if (card) card.classList.remove('is-expanded');
  }
}


