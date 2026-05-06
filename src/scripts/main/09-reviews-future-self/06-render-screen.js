function renderReviewScreen(type, reviewData, opts) {
  opts = opts || {};
  const readonly = !!opts.readonly;
  const screen = document.getElementById('screen-review');
  if (!screen) return;  // FIX BUG-1: null guard

  // periodLabel — readonly 모드면 review 자체의 weekKey/monthKey/quarterKey 사용 (실제 그 기간)
  let periodLabel;
  if (readonly && type === 'weekly' && reviewData.weekKey) {
    periodLabel = reviewData.weekKey;
  } else if (readonly && type === 'monthly' && reviewData.monthKey) {
    periodLabel = reviewData.monthKey;
  } else if (readonly && type === 'quarterly' && reviewData.quarterKey) {
    periodLabel = (typeof seasonLabelOf === 'function')
      ? seasonLabelOf(reviewData.quarterKey, { withEmoji: false })
      : reviewData.quarterKey;
  } else if (type === 'weekly') {
    periodLabel = `이번 주 (${getCurrentWeekKey()})`;
  } else if (type === 'monthly') {
    periodLabel = `지난 달 (${getMonthKey(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 15))})`;
  } else {
    periodLabel = '';
  }
  const periodWord = type === 'weekly' ? '주' : (type === 'monthly' ? '달' : '분기');
  const titleText = type === 'weekly' ? '🌙 주간 리뷰'
    : type === 'monthly' ? '📅 월간 리뷰'
    : (readonly && reviewData.quarterKey && typeof seasonLabelOf === 'function'
        ? `${seasonLabelOf(reviewData.quarterKey, { withEmoji: true })} 리뷰`
        : '📊 분기 리뷰');

  // readonly 모드 button HTML — quarterly 면 deep dive + Stories 버튼 + 모음으로 + 삭제
  const reviewKey = reviewData.weekKey || reviewData.monthKey || reviewData.quarterKey || '';
  const completedAtJs = reviewData.completedAt ? `'${reviewData.completedAt}'` : 'null';
  const quarterlyExtras = (readonly && type === 'quarterly' && reviewData.stats && typeof renderQuarterlyDeepDive === 'function')
    ? renderQuarterlyDeepDive(reviewData) +
      (reviewData.id ? `<button class="btn-primary" style="width:100%; margin-top:14px;" onclick="openQuarterlyStories('${reviewData.id}')">▶ Stories로 보기</button>` : '')
    : '';
  const readonlyButtonsHtml = `
    ${quarterlyExtras}
    <button class="btn-secondary" onclick="showScreen('archive-reviews')" style="width:100%; margin-top:14px;">← 리뷰 모음으로</button>
    <div style="margin-top:8px; padding-top:10px; border-top:1px dashed var(--border); text-align:right;">
      <button class="btn-secondary" onclick="if (deleteReview('${type}', '${escapeHtml(reviewKey)}', ${completedAtJs})) showScreen('archive-reviews')" style="font-size:10.5px; padding:5px 12px; opacity:0.6;">🗑 삭제</button>
    </div>
  `;

  // 사용자 요청 2026-04-30: 새 형식 (pattern/quotes/experiment/seeds) — 옛 형식 (sections.patterns 등) backward compat
  const isNewFormat = !!(reviewData.pattern || reviewData.quotes || reviewData.seeds);

  if (isNewFormat) {
    // ═══ 새 리뷰 layout (사용자 명시 2026-04-30 ultrathink: 정보량 ↓ + 시각 위계 — Hero / 핵심 카드 2 / 인용 horizontal / Stats grid 2-3 / 자기 평가 / 버튼 / footer seeds) ═══

    // Hero — one_word + summary + chart 통합
    const oneWordWeekly = reviewData.one_word_weekly ? `<div style="font-size:10.5px; color:var(--text-soft); letter-spacing:0.18em; text-transform:uppercase; margin-bottom:4px;">이번 주 momentum</div><div style="font-family:'Gowun Batang',serif; font-size:34px; color:#7ec8e3; letter-spacing:0.04em; margin-bottom:10px;">${escapeHtml(reviewData.one_word_weekly)}</div>` : '';
    const oneWord = reviewData.one_word ? `<div style="font-size:10.5px; color:var(--text-soft); letter-spacing:0.18em; text-transform:uppercase; margin-bottom:4px;">이번 달의 너</div><div style="font-family:'Gowun Batang',serif; font-size:36px; color:var(--accent); letter-spacing:0.04em; margin-bottom:10px;">${escapeHtml(reviewData.one_word)}</div>` : '';
    const summaryBlock = reviewData.summary ? `<div style="font-family:'Gowun Batang',serif; font-size:15px; color:var(--text); line-height:1.7; margin-bottom:14px; opacity:0.92;">${escapeHtml(reviewData.summary)}</div>` : '';

    // chart
    const _todayChart = new Date();
    const _cutoffChart = type === 'weekly'
      ? new Date(_todayChart.getTime() - 7 * 86400000)
      : new Date(_todayChart.getFullYear(), _todayChart.getMonth() - 1, 1);
    const _cutoffEndChart = type === 'weekly'
      ? _todayChart
      : new Date(_todayChart.getFullYear(), _todayChart.getMonth(), 1);
    const _entriesForChart = (state.entries || []).filter(e => {
      if (!e.date) return false;
      const d = new Date(e.date + 'T12:00:00');
      return d >= _cutoffChart && d < _cutoffEndChart;
    }).slice(-7);
    const chartInner = (typeof _renderReviewMoodChart === 'function' && _entriesForChart.length >= 2)
      ? _renderReviewMoodChartInline(_entriesForChart)
      : '';

    const heroBlock = `<div style="background:linear-gradient(135deg, rgba(139,126,196,0.10), rgba(201,169,110,0.06)); border:1px solid rgba(139,126,196,0.20); border-radius:18px; padding:22px 20px 18px; margin-bottom:18px; text-align:center;">
      ${oneWordWeekly}
      ${oneWord}
      ${summaryBlock}
      ${chartInner}
    </div>`;

    // Strengths — 핵심 카드 1
    const strengths = Array.isArray(reviewData.strengths) ? reviewData.strengths.filter(s => s && s.trim()).slice(0, 5) : [];
    const strengthsBlock = strengths.length > 0 ? `
    <div style="background:var(--surface); border:1px solid rgba(245,200,112,0.20); border-radius:14px; padding:16px 18px; margin-bottom:14px;">
      <div style="font-size:11px; color:#f5c870; letter-spacing:0.15em; text-transform:uppercase; margin-bottom:10px;">✨ 잘한 것</div>
      ${strengths.map(s => `<div style="font-size:13px; color:var(--text); line-height:1.7; padding:5px 0;">• ${escapeHtml(s)}</div>`).join('')}
    </div>` : '';

    // 사용자 명시 2026-05-06 ultrathink: 주간 = 미시 일기 톤. scenes 카드 = 이번 주 장면 3개 (when/what/feeling).
    //   weekly only — monthly 는 데이터 X (prompt schema 분리).
    const scenesArr = Array.isArray(reviewData.scenes) ? reviewData.scenes.filter(s => s && (s.what || s.when)) : [];
    const scenesBlock = (type === 'weekly' && scenesArr.length > 0) ? `
    <div style="margin-bottom:14px;">
      <div style="font-size:11px; color:#a89cd6; letter-spacing:0.15em; text-transform:uppercase; margin-bottom:10px;">📔 이번 주 장면</div>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${scenesArr.slice(0, 3).map(s => `
          <div style="background:var(--surface); border:1px solid rgba(168,156,214,0.18); border-radius:12px; padding:12px 14px; position:relative;">
            ${s.when ? `<div style="font-size:10.5px; color:#a89cd6; letter-spacing:0.08em; margin-bottom:5px;">${escapeHtml(s.when)}</div>` : ''}
            ${s.what ? `<div style="font-family:'Gowun Batang',serif; font-size:14px; color:var(--text); line-height:1.6;">${escapeHtml(s.what)}</div>` : ''}
            ${s.feeling ? `<div style="font-size:11px; color:var(--text-soft); margin-top:6px; font-style:italic;">— ${escapeHtml(s.feeling)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>` : '';

    // Pattern — 핵심 카드 2
    // weekly = {headline, note} 가벼움 / monthly = {headline, evidence, condition} Detective.
    const pat = reviewData.pattern || {};
    const patHasContent = pat.headline || pat.evidence || pat.condition || pat.note;
    const patternLabel = type === 'weekly' ? '🌙 이번 주 흐름' : '🔍 패턴 발견';
    const patternBlock = patHasContent ? `
    <div style="background:var(--surface); border:1px solid rgba(201,169,110,0.20); border-radius:14px; padding:16px 18px; margin-bottom:14px;">
      <div style="font-size:11px; color:var(--accent); letter-spacing:0.15em; text-transform:uppercase; margin-bottom:10px;">${patternLabel}</div>
      ${pat.headline ? `<div style="font-size:14.5px; font-weight:600; color:var(--text); line-height:1.6; margin-bottom:8px;">${escapeHtml(pat.headline)}</div>` : ''}
      ${pat.evidence ? `<div style="font-size:12px; color:var(--text-dim); line-height:1.7; padding:8px 12px; background:rgba(0,0,0,0.18); border-left:2px solid rgba(201,169,110,0.40); border-radius:6px; margin-bottom:6px;">${escapeHtml(pat.evidence)}</div>` : ''}
      ${pat.condition ? `<div style="font-size:11px; color:var(--text-soft); line-height:1.6;">↳ ${escapeHtml(pat.condition)}</div>` : ''}
      ${pat.note ? `<div style="font-size:11.5px; color:var(--text-soft); line-height:1.6;">↳ ${escapeHtml(pat.note)}</div>` : ''}
    </div>` : '';

    // 사용자 명시 2026-04-30 ultrathink: 이전 시드의 풍부한 '이 기간 깨달음 N개' 카드 통째로 호출.
    // _buildReviewArchiveSummaryHTML — 사고 모드 / 화두 무게중심 / 시간 분포 / 살아있는 통찰 / 테마 갈래 / 전체 헤드라인 / AI 통찰
    // 저장 전이라 review.id X — AI 통찰 button 자리에 '저장 후 가능' placeholder
    const _tempReviewForSummary = type === 'weekly'
      ? { weekKey: (typeof getCurrentWeekKey === 'function' ? getCurrentWeekKey() : ''), completedAt: new Date().toISOString(), id: '' }
      : { monthKey: (typeof getMonthKey === 'function' ? getMonthKey(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 15)) : ''), completedAt: new Date().toISOString(), id: '' };
    const _archiveOverride = Array.isArray(reviewData._seed_archive_for_preview) && reviewData._seed_archive_for_preview.length > 0
      ? reviewData._seed_archive_for_preview
      : null;
    const _insightsHtml = (typeof _buildReviewArchiveSummaryHTML === 'function')
      ? _buildReviewArchiveSummaryHTML(_tempReviewForSummary, _archiveOverride ? { archiveOverride: _archiveOverride } : {})
      : '';
    const insightsBlock = _insightsHtml ? `<div style="margin-bottom:14px;">${_insightsHtml}</div>` : '';

    // Quotes — horizontal scroll
    const quotesArr = Array.isArray(reviewData.quotes) ? reviewData.quotes.filter(q => q && q.trim()) : [];
    const quotesBlock = quotesArr.length > 0 ? `
    <div style="margin-bottom:18px;">
      <div style="font-size:11px; color:var(--accent); letter-spacing:0.15em; text-transform:uppercase; margin-bottom:10px;">📝 너의 인용</div>
      <div style="display:flex; gap:10px; overflow-x:auto; padding:2px 2px 8px; -webkit-overflow-scrolling:touch; scrollbar-width:thin;">
        ${quotesArr.map(q => `<div style="flex:0 0 auto; min-width:200px; max-width:280px; font-family:'Gowun Batang',serif; font-size:13.5px; color:var(--text); line-height:1.65; padding:10px 14px; background:var(--surface); border-left:2px solid rgba(126,200,227,0.40); border-radius:0 10px 10px 0; white-space:normal;">"${escapeHtml(q)}"</div>`).join('')}
      </div>
    </div>` : '';

    // Stats grid — cycles / emotions / value_align (3 col, auto-hide empty)
    const cyc = reviewData.cycles || {};
    const cyclesItems = [
      cyc.sleep ? { icon:'😴', label:'수면', text:cyc.sleep } : null,
      cyc.mode  ? { icon:'🌀', label:'모드', text:cyc.mode  } : null,
      cyc.other ? { icon:'🌊', label:'환경', text:cyc.other } : null
    ].filter(Boolean);
    const hasCycles = cyclesItems.length > 0;
    const cyclesCard = hasCycles ? `
    <div style="background:var(--surface); border:1px solid rgba(126,200,227,0.18); border-radius:12px; padding:14px 16px;">
      <div style="font-size:10.5px; color:#7ec8e3; letter-spacing:0.13em; text-transform:uppercase; margin-bottom:10px;">🌊 사이클</div>
      ${cyclesItems.map(c => `<div style="font-size:13px; color:var(--text); line-height:1.7; margin-bottom:9px;"><span style="color:var(--text-soft); font-size:10.5px;">${c.icon} ${c.label}</span><br>${escapeHtml(c.text)}</div>`).join('')}
    </div>` : '';

    const emotions = Array.isArray(reviewData.emotions) ? reviewData.emotions.filter(e => e && e.word) : [];
    const hasEmotions = emotions.length > 0;
    const _emoMax = hasEmotions ? Math.max(...emotions.map(e => Number(e.count) || 1)) : 1;
    const emotionsCard = hasEmotions ? `
    <div style="background:var(--surface); border:1px solid rgba(139,126,196,0.18); border-radius:12px; padding:14px 16px;">
      <div style="font-size:10.5px; color:#a89cd6; letter-spacing:0.13em; text-transform:uppercase; margin-bottom:10px;">💬 감정</div>
      ${emotions.slice(0, 5).map(e => {
        const cnt = Number(e.count) || 1;
        const pct = (cnt / _emoMax) * 100;
        return `<div style="display:flex; align-items:center; gap:10px; margin-bottom:7px;">
          <div style="font-size:12px; color:var(--text); min-width:54px; max-width:80px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(e.word)}</div>
          <div style="flex:1; height:8px; background:rgba(139,126,196,0.10); border-radius:4px; overflow:hidden;"><div style="height:100%; width:${pct}%; background:linear-gradient(90deg, #a89cd6, #c9a96e); border-radius:4px;"></div></div>
          <div style="font-size:11px; color:var(--text-soft); min-width:16px; text-align:right;">${cnt}</div>
        </div>`;
      }).join('')}
    </div>` : '';

    const va = reviewData.value_align || {};
    const vaScore = Number(va.score);
    const vaShow = !isNaN(vaScore) && vaScore >= 0 && vaScore <= 10 && (va.aligned || va.gap);
    // 가치 align 재설계: score 추상 X / aligned · gap narrative + 사용자 values 직접 (prompt 단에서 values 단어 그대로 인용 강제)
    // 사용자 명시 2026-04-30: '가치 align' → '나답게' (영어/추상 X 한국어). MATCH/GAP → 부드럽게.
    const valueCard = vaShow ? `
    <div style="background:var(--surface); border:1px solid rgba(201,169,110,0.18); border-radius:12px; padding:14px 16px;">
      <div style="font-size:10.5px; color:var(--accent); letter-spacing:0.13em; text-transform:uppercase; margin-bottom:10px;">🌿 나답게 산 한 주</div>
      ${va.aligned ? `<div style="font-size:13px; color:var(--text); line-height:1.7; margin-bottom:6px; padding:8px 12px; background:rgba(158,212,160,0.06); border-left:2px solid rgba(158,212,160,0.40); border-radius:0 6px 6px 0;"><span style="color:#9ed4a0; font-size:10.5px; font-weight:600; letter-spacing:0.1em;">✓ 나다움</span><br>${escapeHtml(va.aligned)}</div>` : ''}
      ${va.gap ? `<div style="font-size:13px; color:var(--text-soft); line-height:1.7; padding:8px 12px; background:rgba(255,255,255,0.02); border-left:2px solid rgba(232,200,144,0.30); border-radius:0 6px 6px 0;"><span style="color:#e8c890; font-size:10.5px; font-weight:600; letter-spacing:0.1em;">⌃ 살짝 멀어진</span><br>${escapeHtml(va.gap)}</div>` : ''}
    </div>` : '';

    // 사용자 명시 2026-04-30: 사이클/감정/나답게 세로 stack (grid X — 번잡 → 위계 정리)
    const statsCells = [cyclesCard, emotionsCard, valueCard].filter(Boolean);
    const statsGrid = statsCells.length > 0 ? `
    <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:14px;">
      ${statsCells.join('')}
    </div>` : '';

    // Risk signals — full width (concern 일 때 prominent)
    const risk = reviewData.risk_signals || {};
    const riskLevel = (risk.level || 'none').toLowerCase();
    const riskShow = riskLevel !== 'none' && ((Array.isArray(risk.signals) && risk.signals.length > 0) || risk.suggestion);
    const riskColor = riskLevel === 'concern' ? '#e89090' : '#e8c890';
    const riskBg = riskLevel === 'concern' ? 'rgba(232,144,144,0.10)' : 'rgba(232,200,144,0.07)';
    const riskBorder = riskLevel === 'concern' ? 'rgba(232,144,144,0.32)' : 'rgba(232,200,144,0.25)';
    const riskBlock = riskShow ? `
    <div style="background:${riskBg}; border:1px solid ${riskBorder}; border-radius:14px; padding:14px 16px; margin-bottom:14px;">
      <div style="font-size:10.5px; color:${riskColor}; letter-spacing:0.13em; text-transform:uppercase; margin-bottom:8px;">${riskLevel === 'concern' ? '🆘 잠깐, 너 괜찮아?' : '🌙 부드러운 알림'}</div>
      ${(risk.signals || []).map(s => `<div style="font-size:12px; color:var(--text); line-height:1.6; padding:3px 0;">· ${escapeHtml(s)}</div>`).join('')}
      ${risk.suggestion ? `<div style="font-size:11.5px; color:var(--text-dim); line-height:1.6; margin-top:8px; padding:9px 11px; background:rgba(0,0,0,0.18); border-radius:7px;">${escapeHtml(risk.suggestion)}</div>` : ''}
      ${riskLevel === 'concern' ? `<div style="font-size:10.5px; color:var(--text-soft); line-height:1.7; margin-top:9px; padding-top:9px; border-top:1px solid ${riskBorder};">☎ <b>1393</b> 자살예방상담 24h · ☎ <b>1577-0199</b> 정신건강위기 · ☎ <b>119</b> 응급<br><span style="font-size:9.5px; opacity:0.7;">소라고동의 AI 답변은 의료·법적·심리 상담이 아닙니다.</span></div>` : ''}
    </div>` : '';



    const html = `
      <div class="screen-title">${titleText}</div>
      <div class="screen-sub" style="margin-bottom:18px;">${periodLabel}</div>
      ${heroBlock}
      ${scenesBlock}
      ${strengthsBlock}
      ${patternBlock}
      ${insightsBlock}
      ${quotesBlock}
      ${statsGrid}
      ${riskBlock}
      ${readonly ? readonlyButtonsHtml : `
        <div style="display:flex; gap:8px; margin-top:14px;">
          <button class="btn-primary" onclick="saveReview('${type}')" style="flex:2;">저장하고 닫기 ✦</button>
          <button class="btn-secondary" onclick="exportReviewShareCard('${type}')" style="flex:1;">📤 공유 카드</button>
        </div>
        <button class="btn-secondary" onclick="showScreen('home')" style="margin-top:6px; width:100%;">나중에</button>
      `}
    `;
    screen.innerHTML = html;
    screen.dataset.reviewData = JSON.stringify(reviewData);
    screen.dataset.reviewType = type;
    return;
  }

  // ═══ 옛 리뷰 layout (backward compat) ═══
  let html = `
    <div class="screen-title">${titleText}</div>
    <div class="screen-sub">${periodLabel}</div>

    <div style="background: linear-gradient(135deg, var(--purple-dim), var(--accent-dim)); border: 1px solid rgba(139,126,196,0.2); border-radius: 16px; padding: 18px; margin-bottom: 20px; font-family: 'Gowun Batang', serif; font-size: 16px; line-height: 1.7;">
      ${escapeHtml(reviewData.summary || '')}
    </div>

    <div class="review-section">
      <div class="review-section-title">💫 네 모습</div>
      <div class="review-section-content">${escapeHtml(reviewData.sections?.patterns || '')}</div>
    </div>

    <div class="review-section">
      <div class="review-section-title">✨ 잘된 순간들</div>
      <div class="review-section-content">${escapeHtml(reviewData.sections?.good_moments || '')}</div>
    </div>

    <div class="review-section">
      <div class="review-section-title">🌊 어려웠던 순간</div>
      <div class="review-section-content">${escapeHtml(reviewData.sections?.hard_moments || '')}</div>
    </div>

    <div class="review-section">
      <div class="review-section-title">🐚 다음 ${periodWord} 제안</div>
      <div class="review-section-content">${escapeHtml(reviewData.sections?.next_suggestion || '')}</div>
    </div>

    ${reviewData.new_observations ? `
    <div class="review-section">
      <div class="review-section-title">🔮 새로 보인 것</div>
      <div class="review-section-content">${escapeHtml(reviewData.new_observations)}</div>
    </div>` : ''}

    ${readonly ? '' : `
    <div class="input-group" style="margin-top: 24px;">
      <div class="input-label">💬 ${type === 'weekly' ? '이번 주' : '이번 달'} 한 마디 (선택)</div>
      <textarea id="reviewUserNote" placeholder="네 말로 한 줄 남기고 싶다면..." rows="3"></textarea>
    </div>
    `}

    ${readonly ? readonlyButtonsHtml : `
    <button class="btn-primary" onclick="saveReview('${type}')">저장하고 닫기 ✦</button>
    <button class="btn-secondary" onclick="showScreen('home')">나중에</button>
    `}
  `;
  screen.innerHTML = html;
  screen.dataset.reviewData = JSON.stringify(reviewData);
  screen.dataset.reviewType = type;
}

function saveReview(type) {
  const screen = document.getElementById('screen-review');
  const reviewData = JSON.parse(screen.dataset.reviewData);
  // 사용자 명시 2026-04-30: 자기 평가 form 제거.
  const review = {
    completedAt: new Date().toISOString(),
    summary: reviewData.summary,
    sections: reviewData.sections,  // 옛 형식 backward compat
    // 사용자 요청 2026-04-30: 새 리뷰 필드 영구 저장 (다음 리뷰 callback 위해)
    one_word: reviewData.one_word,
    one_word_weekly: reviewData.one_word_weekly,
    pattern: reviewData.pattern,
    quotes: reviewData.quotes,
    strengths: reviewData.strengths,
    cycles: reviewData.cycles,
    emotions: reviewData.emotions,
    value_align: reviewData.value_align,
    risk_signals: reviewData.risk_signals,
    scenes: reviewData.scenes
  };

  // 사용자 보고 2026-05-01 ultrathink: 중복 가드 — 같은 weekKey/monthKey 이미 있으면 replace (auto 가 먼저 push 한 후 사용자 manual click 시 중복 방지)
  // 사용자 명시 2026-05-02 ultrathink (ERROR #14 fix): weekKey/monthKey = cutoff (data 시작 시점) 기준 — 데이터 주 기준 일관 (옛: weekly = 현 주 / monthly = 지난 달 → 미스매치).
  if (type === 'weekly') {
    const _data = (typeof _collectReviewData === 'function') ? _collectReviewData('weekly') : null;
    review.weekKey = _data ? getWeekKey(_data.cutoff) : getCurrentWeekKey();
    const _idx = state.weeklyReviews.findIndex(r => r.weekKey === review.weekKey);
    if (_idx >= 0) state.weeklyReviews[_idx] = review;
    else state.weeklyReviews.push(review);
  } else {
    const _data = (typeof _collectReviewData === 'function') ? _collectReviewData('monthly') : null;
    review.monthKey = _data ? getMonthKey(_data.cutoff) : getMonthKey(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 15));
    if (reviewData.new_observations) review.newObservations = reviewData.new_observations;
    const _idx = state.monthlyReviews.findIndex(r => r.monthKey === review.monthKey);
    if (_idx >= 0) state.monthlyReviews[_idx] = review;
    else state.monthlyReviews.push(review);
  }

  // 사용자 명시 2026-05-01 ultrathink: 리뷰 카드 결과 archive 자동 push 제거 — 리뷰 모음에서 다시 볼 수 있어 중복 noise.

  saveState();
  showToast(`${type === 'weekly' ? '주간' : '월간'} 리뷰 저장됨 ✦`);
  showScreen('home');
}

// 사용자 명시 2026-04-30 ultrathink: 주간/월간 리뷰 mood/energy 7일 차트 (entries 기반 SVG 라인).
