async function openReview(type) {
  // batch 처리 중 race 차단 (ERROR #7)
  // V4 fix (사용자 명시 2026-05-26 ultrathink — pendingReviewBatch race): 신 schema 진행 중에도 동일 차단.
  //   pendingReviewBatch.review_keys[].cycle === type 매칭. 30-force-analyze.js 의 새 review chain batch.
  if (Array.isArray(state.pendingBatch?.review_pending) && state.pendingBatch.review_pending.includes(type)) {
    showToast('🌙 자고 있는 동안 정리 중 ⏳ — 잠시 후 다시 봐줘');
    return;
  }
  if (Array.isArray(state.pendingReviewBatch?.review_keys) && state.pendingReviewBatch.review_keys.some(rk => rk && rk.cycle === type)) {
    showToast('🌙 자고 있는 동안 정리 중 ⏳ — 잠시 후 다시 봐줘');
    return;
  }
  // 사용자 명시 2026-05-04: 한 번 진입하면 같은 주기 안에서 카드 다시 안 뜨게.
  if (type === 'weekly') {
    _dismissReview('weekly', getCurrentWeekKey());
  } else if (type === 'monthly') {
    const _t = _cutoffAdjustedNow();
    _dismissReview('monthly', getMonthKey(new Date(_t.getFullYear(), _t.getMonth() - 1, 15)));
  }
  // existing 체크 (ERROR #2) + batch fresh user_viewed 적용하기
  const data = _collectReviewData(type);
  // 사용자 보고 2026-05-10: weekly weekKey = cutoffEnd (이번 주 일요일 = W19) 기준. monthly 는 cutoff (지난 달 시작) 그대로.
  const key = type === 'weekly' ? getWeekKey(data.cutoffEnd || data.cutoff) : getMonthKey(data.cutoff);
  const arrKey = type === 'weekly' ? 'weeklyReviews' : 'monthlyReviews';
  const arr = state[arrKey] || [];
  // batch fresh review (auto + !user_viewed) 우선 — key 무관하게 (사용자가 가장 최근 fresh 보게)
  const fresh = arr.find(r => r.auto && !r.user_viewed);
  const existing = fresh || arr.find(r => (type === 'weekly' ? r.weekKey : r.monthKey) === key);
  if (existing) {
    if (existing.auto && !existing.user_viewed) {
      existing.user_viewed = true;
      saveState();
      if (typeof renderReviewPrompts === 'function') renderReviewPrompts();
    }
    if (typeof renderReviewScreen === 'function') renderReviewScreen(type, existing, { readonly: true });
    showScreen('review');
    return;
  }

  const screen = document.getElementById('screen-review');
  screen.innerHTML = `
    <div class="screen-title">${type === 'weekly' ? '🌙 주간 리뷰' : '📅 월간 리뷰'}</div>
    <div class="screen-sub">잠시만, 데이터를 분석하고 있어...</div>
    <div style="text-align:center; padding: 60px 20px;">
      <div class="ai-loading"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
    </div>
  `;
  showScreen('review');

  try {
    const reviewData = await generateReview(type);
    renderReviewScreen(type, reviewData);
  } catch (err) {
    screen.innerHTML = `
      <div class="screen-title">${type === 'weekly' ? '🌙 주간 리뷰' : '📅 월간 리뷰'}</div>
      <div class="screen-sub">분석 중 오류가 났어 😅<br>${escapeHtml(err.message)}</div>
      <button class="btn-secondary" onclick="openReview('${type}')">다시 시도</button>
      <button class="btn-secondary" onclick="showScreen('home')">돌아가기</button>
    `;
  }
}

// 사용자 명시 2026-05-01: 분기 리뷰 카드 click 흐름 (자동 trigger 폐기 후 대체).
// 사용자 명시 2026-05-02 ultrathink: batch 처리 중 race 가드 추가 + prevQ 명시 계산 (ERROR #12).
async function openQuarterlyReviewCard() {
  if (!_canAI()) { showToast('AI 호출 불가능 — 로그인 필요'); return; }
  // batch 처리 중 race 차단
  if (Array.isArray(state.pendingBatch?.review_pending) && state.pendingBatch.review_pending.includes('quarterly')) {
    showToast('🌙 자고 있는 동안 정리 중 ⏳ — 잠시 후 다시 봐줘');
    return;
  }
  if (Array.isArray(state.pendingReviewBatch?.review_keys) && state.pendingReviewBatch.review_keys.some(rk => rk && rk.cycle === 'quarterly')) {
    showToast('🌙 자고 있는 동안 정리 중 ⏳ — 잠시 후 다시 봐줘');
    return;
  }
  // 사용자 명시 2026-05-10 (메커니즘 일관): 사용자 click = currentQuarterKey (이번 분기 진행 중 review). 자동 batch = prev (끝난 사이클) 그대로.
  const now = new Date();
  const Q = Math.floor(now.getMonth() / 3) + 1;
  const currentQuarterKey = `${now.getFullYear()}-Q${Q}`;
  _dismissReview('quarterly', currentQuarterKey);
  // batch fresh 우선 — auto + !user_viewed
  const fresh = (state.quarterlyReviews || []).find(r => r.auto && !r.user_viewed);
  const existing = fresh || (state.quarterlyReviews || []).find(r => r.quarterKey === currentQuarterKey);
  if (existing) {
    if (existing.auto && !existing.user_viewed) {
      existing.user_viewed = true;
      saveState();
      if (typeof renderReviewPrompts === 'function') renderReviewPrompts();
    }
    return openQuarterlyStories(existing.id);
  }
  showToast(`${currentQuarterKey} 분기 리뷰 생성 중... (1-2분)`);
  const stats = (typeof getQuarterlyStats === 'function' && getQuarterlyStats(currentQuarterKey)) || {
    checkins: 0, attempts: 0, worked: 0, pearls: 0, dnaPearls: 0
  };
  try {
    const aiReview = await generateQuarterlyReview(currentQuarterKey, stats);
    const newReview = {
      id: 'qr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      quarterKey: currentQuarterKey,
      completedAt: new Date().toISOString(),
      stats,
      summary: aiReview.summary || '',
      sections: Array.isArray(aiReview.sections) ? aiReview.sections : [],
      one_word: aiReview.one_word,
      pattern: aiReview.pattern,
      turning_point: aiReview.turning_point,
      transformation: aiReview.transformation,
      continuity: aiReview.continuity,
      quotes: aiReview.quotes,
      experiment: aiReview.experiment,
      seeds: aiReview.seeds,
      seed_callbacks: aiReview.seed_callbacks,
      auto: false
    };
    state.quarterlyReviews.push(newReview);
    saveState();
    if (typeof renderReviewPrompts === 'function') renderReviewPrompts();
    await openQuarterlyStories(newReview.id);
  } catch (e) {
    showToast('생성 실패: ' + (e.message || e));
    console.warn('[openQuarterlyReviewCard]', e);
  }
}

// 사용자 명시 2026-05-01: 연간 리뷰 카드 click 흐름.
// 사용자 명시 2026-05-02 ultrathink: batch 처리 중 race 가드 추가.
async function openAnnualReviewCard() {
  if (!_canAI()) { showToast('AI 호출 불가능 — 로그인 필요'); return; }
  if (Array.isArray(state.pendingBatch?.review_pending) && state.pendingBatch.review_pending.includes('annual')) {
    showToast('🌙 자고 있는 동안 정리 중 ⏳ — 잠시 후 다시 봐줘');
    return;
  }
  if (Array.isArray(state.pendingReviewBatch?.review_keys) && state.pendingReviewBatch.review_keys.some(rk => rk && rk.cycle === 'annual')) {
    showToast('🌙 자고 있는 동안 정리 중 ⏳ — 잠시 후 다시 봐줘');
    return;
  }
  // 사용자 명시 2026-05-10 (메커니즘 일관): 사용자 click = currentYear (올해 진행 중 review). 자동 batch = prev (끝난 사이클) 그대로.
  const currentYear = new Date().getFullYear();
  _dismissReview('annual', currentYear);
  // batch fresh 우선
  const fresh = (state.annualReviews || []).find(r => r.auto && !r.user_viewed);
  const existing = fresh || (state.annualReviews || []).find(r => r.year === currentYear);
  if (existing) {
    if (existing.auto && !existing.user_viewed) {
      existing.user_viewed = true;
      saveState();
      if (typeof renderReviewPrompts === 'function') renderReviewPrompts();
    }
    return openAnnualReview(existing);
  }
  showToast(`${currentYear}년 연간 리뷰 생성 중... (1-2분, Opus 4.7)`);
  try {
    await generateAnnualReview(currentYear);  // 자체 state.annualReviews push
    if (typeof renderReviewPrompts === 'function') renderReviewPrompts();
    const newReview = (state.annualReviews || []).find(r => r.year === currentYear);
    if (newReview) openAnnualReview(newReview);
  } catch (e) {
    showToast('생성 실패: ' + (e.message || e));
    console.warn('[openAnnualReviewCard]', e);
  }
}

// 사용자 명시 2026-05-02 ultrathink: 리뷰 batch API path 재사용 위해 prompt builder 분리.
// _collectReviewData → _buildReviewPrompt → callAnthropic / batch → _processReviewResult.
// inline path (사용자 click → generate) 와 batch path (4AM auto submit) 둘 다 동일 builder 사용.
