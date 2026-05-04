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

  // 1. 진화율 — 막대 + %
  const workRate = s.workRate != null ? Math.round(s.workRate * 100) : null;
  const prevWorkRate = prevQ?.workRate != null ? Math.round(prevQ.workRate * 100) : null;
  const workCard = workRate != null
    ? `<div class="dd-card">
         <div class="dd-card-label">🎯 진화율</div>
         <div class="dd-card-value">${workRate}<span class="dd-card-unit">%</span> ${trend(workRate, prevWorkRate)}</div>
         <div class="dd-bar-track"><div class="dd-bar-fill" style="width:${workRate}%;"></div></div>
         <div class="dd-card-sub">${s.worked || 0}/${s.attempts || 0} 시도</div>
       </div>`
    : `<div class="dd-card dd-card-empty">
         <div class="dd-card-label">🎯 진화율</div>
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
         <div class="dd-card-label">📊 추적 항목</div>
         <div class="dd-card-value-text">${escapeHtml(trackerTop.title)}</div>
         <div class="dd-card-sub">${trackerTop.first ?? '?'} → ${trackerTop.last ?? '?'}${trackerTop.unit || ''} (${trackerTop.count}회)</div>
       </div>`
    : `<div class="dd-card dd-card-empty">
         <div class="dd-card-label">📊 추적 항목</div>
         <div class="dd-card-empty-msg">기록 X</div>
       </div>`;

  // 6. 8 차원 (problems / strengths / growth)
  const dimsCard = `<div class="dd-card">
    <div class="dd-card-label">🪞 8 차원</div>
    <div class="dd-card-dim-row">
      <span title="문제"><span class="dd-dim-icon">💧</span> ${s.problemsTotal || 0}</span>
      <span title="강점"><span class="dd-dim-icon">✨</span> ${s.strengthsTotal || 0}</span>
      <span title="성장"><span class="dd-dim-icon">🌱</span> ${s.growthCount || 0}</span>
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

function renderArchiveReviews() {
  const container = document.getElementById('archiveReviewsList');
  if (!container) return;

  const weekly = (state.weeklyReviews || []).map(r => ({...r, type: 'weekly'}));
  const monthly = (state.monthlyReviews || []).map(r => ({...r, type: 'monthly'}));
  // V4-1y-3: 분기 리뷰 추가
  const quarterly = (state.quarterlyReviews || []).map(r => ({...r, type: 'quarterly'}));
  const all = [...weekly, ...monthly, ...quarterly].sort((a, b) =>
    new Date(b.completedAt) - new Date(a.completedAt)
  );

  // 사용자 요청 2026-04-28: 한 해 분기 4개 모두 있으면 '🌟 연간 Stories' 카드 맨 위에 노출
  const yearGroups = {};
  (state.quarterlyReviews || []).forEach(r => {
    const yr = (r.quarterKey || '').split('-')[0];
    if (!yr) return;
    if (!yearGroups[yr]) yearGroups[yr] = 0;
    yearGroups[yr]++;
  });
  const fullYears = Object.keys(yearGroups).filter(yr => yearGroups[yr] >= 4).sort().reverse();
  let annualCardHtml = '';
  if (fullYears.length > 0) {
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

  if (all.length === 0) {
    container.innerHTML = `<div class="timeline-empty">
      <div class="icon">🌙</div>
      아직 리뷰가 없어.<br>
      주말 / 매월 1주차 / 매분기 1주차에<br>
      자동으로 정리돼.
    </div>`;
    return;
  }

  container.innerHTML = annualCardHtml + all.map((r, idx) => {
    const date = new Date(r.completedAt);
    const dateStr = date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    // 사용자 요청 2026-04-29: 분기 리뷰 라벨을 봄/여름/가을/겨울 + 연도 + 이모지로
    const seasonLabel = r.type === 'quarterly' && r.quarterKey && typeof seasonLabelOf === 'function'
      ? seasonLabelOf(r.quarterKey, { withEmoji: true })
      : null;
    const typeLabel = r.type === 'weekly' ? '🌙 주간 리뷰'
      : r.type === 'monthly' ? '📅 월간 리뷰'
      : (seasonLabel ? `${seasonLabel} 리뷰` : '📊 분기 리뷰');
    const periodLabel = r.type === 'quarterly' ? '' : (r.weekKey || r.monthKey || '');
    const autoTag = r.auto ? ' <span style="font-size:9px; color:var(--purple); padding:1px 6px; background:var(--purple-dim); border-radius:6px; margin-left:4px;">🤖 자동</span>' : '';

    // 사용자 명시 2026-05-01: 카드 = 한 줄 요약만, 클릭 → screen-review 풀화면 (readonly).
    // one_word 우선 + pattern.headline 부제 / 없으면 summary fallback.
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

    return `
      <div class="timeline-day" onclick="openSavedReview('${r.type}', '${escapeHtml(reviewKey)}', ${completedAtJs})" style="cursor:pointer;">
        <div class="timeline-day-date">${typeLabel}${periodLabel ? ` · ${periodLabel}` : ''}${autoTag}</div>
        <div class="timeline-day-summary" style="font-family: 'Gowun Batang', serif; font-size: 14px;">
          ${summaryLine}
        </div>
        <div class="timeline-day-meta"><span>${dateStr} · ▶ 같이 보자</span></div>
      </div>
    `;
  }).join('');
}

