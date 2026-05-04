// ═══════════════════════════════════════════════════════════════
// PHASE 4: REVIEWS + FUTURE SELF LETTER + PREDICTION FOLLOWUPS
// ═══════════════════════════════════════════════════════════════

// ─── Time helpers ───
function getWeekKey(date) {
  // ISO week: YYYY-W##
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7); // Thursday of this week
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function getMonthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 사용자 명시 2026-05-01 ultrathink: 4AM cutoff 적용된 "now". 새벽 4시 이전 = 어제 mental.
function _cutoffAdjustedNow() {
  const now = (typeof getServerNowMs === 'function' ? getServerNowMs() : Date.now());
  return new Date(now - DAY_CUTOFF_HOUR * 3600000);
}

function getCurrentWeekKey() { return getWeekKey(_cutoffAdjustedNow()); }
function getCurrentMonthKey() { return getMonthKey(_cutoffAdjustedNow()); }

// 사용자 명시 2026-05-02 ultrathink: batch 자동 생성 review 가 도착했고 사용자가 아직 안 봤으면 카드 노출 (요일 제약 우회).
// review.auto = true (batch 으로 push) + !review.user_viewed (사용자 click X) 시 = "✦ 새 리뷰 도착" 의미.
// 사용자 click 시 user_viewed=true 넣음 (다음 진입 시 카드 hidden).
function _hasFreshBatchReview(arrKey, keyMatch) {
  const arr = state[arrKey] || [];
  return arr.find(r => r.auto && !r.user_viewed && (!keyMatch || keyMatch(r)));
}

// 사용자 명시 2026-05-04: 한 번 진입한 리뷰 카드 같은 주기 안에선 다시 안 뜨게.
// type ∈ {'weekly','monthly','quarterly','annual'}, key = 해당 주기 식별자 (currentWeekKey / prevMonthKey / prevQuarterKey / prevYear).
function _reviewDismissed(type, key) {
  const map = state.preferences && state.preferences._dismissedReviews;
  return map && map[type] === key;
}
function _dismissReview(type, key) {
  if (!state.preferences) state.preferences = {};
  if (!state.preferences._dismissedReviews) state.preferences._dismissedReviews = {};
  state.preferences._dismissedReviews[type] = key;
  if (typeof saveState === 'function') saveState();
}

function isWeeklyReviewAvailable() {
  // batch 자동 생성 + 미시청 = 항상 노출 (요일 무관)
  const fresh = _hasFreshBatchReview('weeklyReviews');
  if (fresh) return true;
  // 옛 흐름: 일요일 + 이번주 안 한 경우 (사용자 직접 생성 가능 시점)
  const today = _cutoffAdjustedNow();
  if (today.getDay() !== 0) return false;
  const currentWeekKey = getCurrentWeekKey();
  if (_reviewDismissed('weekly', currentWeekKey)) return false;
  return !(state.weeklyReviews || []).some(r => r.weekKey === currentWeekKey);
}

function isMonthlyReviewAvailable() {
  const fresh = _hasFreshBatchReview('monthlyReviews');
  if (fresh) return true;
  // 옛 흐름: 일요일 + 첫 7일 + 지난달 데이터 있으면
  const today = _cutoffAdjustedNow();
  if (today.getDay() !== 0) return false;
  const dayOfMonth = today.getDate();
  if (dayOfMonth > 7) return false;
  const prevMonthKey = getMonthKey(new Date(today.getFullYear(), today.getMonth() - 1, 15));
  if (_reviewDismissed('monthly', prevMonthKey)) return false;
  const hasPrevMonth = (state.monthlyReviews || []).some(r => r.monthKey === prevMonthKey);
  if (hasPrevMonth) return false;
  const hasPrevMonthData = state.entries.some(e => e.date.startsWith(prevMonthKey));
  return hasPrevMonthData;
}

// 사용자 명시 2026-05-01 ultrathink: 분기 리뷰 카드 가드 (4AM cutoff).
function isQuarterlyReviewAvailable() {
  const fresh = _hasFreshBatchReview('quarterlyReviews');
  if (fresh) return true;
  const today = _cutoffAdjustedNow();
  if (today.getDay() !== 0) return false;
  if (today.getDate() > 7) return false;
  if (today.getMonth() % 3 !== 0) return false;
  const prevQDate = new Date(today.getFullYear(), today.getMonth() - 1, 15);
  const prevQuarterKey = (typeof getQuarterKey === 'function') ? getQuarterKey(prevQDate) : null;
  if (!prevQuarterKey) return false;
  if (_reviewDismissed('quarterly', prevQuarterKey)) return false;
  const exists = (state.quarterlyReviews || []).some(r => r.quarterKey === prevQuarterKey);
  if (exists) return false;
  const range = (typeof getQuarterRange === 'function') ? getQuarterRange(prevQuarterKey) : null;
  if (!range) return false;
  const startISO = range.start.toISOString().split('T')[0];
  const endISO = range.end.toISOString().split('T')[0];
  return state.entries.some(e => e.date >= startISO && e.date <= endISO);
}

// 사용자 명시 2026-05-01 ultrathink: 연간 리뷰 카드 가드 (4AM cutoff).
function isAnnualReviewAvailable() {
  const fresh = _hasFreshBatchReview('annualReviews');
  if (fresh) return true;
  const today = _cutoffAdjustedNow();
  if (today.getDay() !== 0) return false;
  if (today.getMonth() !== 0) return false;
  if (today.getDate() > 7) return false;
  const prevYear = today.getFullYear() - 1;
  if (_reviewDismissed('annual', prevYear)) return false;
  const exists = (state.annualReviews || []).some(r => r.year === prevYear);
  if (exists) return false;
  return (state.entries || []).some(e => e.date && e.date.startsWith(String(prevYear)));
}

function renderReviewPrompts() {
  const container = document.getElementById('reviewPromptsContainer');
  if (!container) return;
  let html = '';
  // 사용자 명시 2026-05-02 ultrathink: batch 처리 중 review_pending 안 type = 카드 자체 hidden (라벨 X). 결과 도착 후 카드 노출.
  const reviewPending = Array.isArray(state.pendingBatch?.review_pending) ? state.pendingBatch.review_pending : [];
  const _hidden = (type) => reviewPending.includes(type);
  // batch 결과 도착한 새 review = "✦ 새 리뷰 도착" 라벨 (사용자 click 전까지)
  const _freshLabel = (arrKey) => {
    const fresh = _hasFreshBatchReview(arrKey);
    return fresh ? '<span style="margin-left:6px; font-size:9.5px; color:var(--accent); letter-spacing:0.1em;">✦ NEW</span>' : '';
  };

  // 사용자 명시 2026-05-01: 큰 사이클부터 (연 → 분기 → 월 → 주). 가장 무거운 게 위로.
  if (!_hidden('annual') && typeof isAnnualReviewAvailable === 'function' && isAnnualReviewAvailable()) {
    const prevYear = _cutoffAdjustedNow().getFullYear() - 1;
    html += `
      <div class="review-card annual" onclick="openAnnualReviewCard()">
        <div class="review-card-label">🐚 연간 리뷰${_freshLabel('annualReviews')}</div>
        <div class="review-card-title">${prevYear}년을 한 번에 돌아볼까?</div>
        <div class="review-card-desc">1년치 데이터 + 한 단어 + 변곡점 — Opus 4.7 깊은 분석.</div>
      </div>
    `;
  }
  if (!_hidden('quarterly') && typeof isQuarterlyReviewAvailable === 'function' && isQuarterlyReviewAvailable()) {
    const today = new Date();
    const prevQDate = new Date(today.getFullYear(), today.getMonth() - 1, 15);
    const prevQuarterKey = getQuarterKey(prevQDate);
    const qNum = prevQuarterKey.split('-Q')[1];
    const season = (typeof SEASON_LABELS !== 'undefined' && SEASON_LABELS['Q' + qNum]) || { name: '계절', emoji: '🍂' };
    html += `
      <div class="review-card quarterly" onclick="openQuarterlyReviewCard()">
        <div class="review-card-label">${season.emoji} ${season.name} 리뷰${_freshLabel('quarterlyReviews')}</div>
        <div class="review-card-title">지난 ${season.name} 한 계절을 정리해볼까?</div>
        <div class="review-card-desc">3개월치 패턴 + 변곡점 + 다음 계절 한 가지 — AI가 분석해줄게.</div>
      </div>
    `;
  }
  if (!_hidden('monthly') && isMonthlyReviewAvailable()) {
    html += `
      <div class="review-card monthly" onclick="openReview('monthly')">
        <div class="review-card-label">📅 월간 리뷰${_freshLabel('monthlyReviews')}</div>
        <div class="review-card-title">지난 달 네 모습 돌아보기</div>
        <div class="review-card-desc">한 달치 패턴, 새로 발견된 트레이트, 의미 있던 순간들 — AI가 분석해줄게.</div>
      </div>
    `;
  }
  if (!_hidden('weekly') && isWeeklyReviewAvailable()) {
    html += `
      <div class="review-card" onclick="openReview('weekly')">
        <div class="review-card-label">🌙 주간 리뷰${_freshLabel('weeklyReviews')}</div>
        <div class="review-card-title">이번 주 어땠는지 같이 돌아볼까?</div>
        <div class="review-card-desc">7일 데이터 분석 + 패턴 + 다음 주 한 가지 제안.</div>
      </div>
    `;
  }
  container.innerHTML = html;
}

function renderPredictionFollowups() {
  const container = document.getElementById('predictionFollowupsContainer');
  if (!container) return;

  // Generate followups for decisions if not already generated
  ensurePredictionFollowups();

  // Find followups due
  const now = new Date();
  const due = (state.predictionFollowups || []).filter(f => !f.completedAt && new Date(f.dueDate) <= now);

  if (due.length === 0) { container.innerHTML = ''; return; }

  container.innerHTML = due.map(f => {
    const decision = state.decisions.find(d => d.id === f.decisionId);
    if (!decision) return '';
    const horizonLabel = { '3months': '3개월', '6months': '6개월', '12months': '12개월' }[f.horizon];
    return `
      <div class="followup-card" onclick="openFollowup('${f.id}')">
        <div class="followup-card-label">🔮 Future Self Letter · ${horizonLabel} · 선택</div>
        <div class="followup-card-question">"${escapeHtml(decision.title)}" — ${horizonLabel} 전 네 예측이 도착했어. 지금 어때?</div>
        <div style="display:flex; gap:8px; margin-top:10px;" onclick="event.stopPropagation()">
          <button class="quick-btn" onclick="openFollowup('${f.id}')" style="font-size:11px; padding:6px 12px;">열어보기 →</button>
          <button class="quick-btn" onclick="dismissFollowup('${f.id}')" style="font-size:11px; padding:6px 12px;">나중에</button>
        </div>
      </div>
    `;
  }).join('');
}

function dismissFollowup(followupId) {
  const f = state.predictionFollowups.find(x => x.id === followupId);
  if (!f) return;
  // Snooze 14 days
  const newDue = new Date(Date.now() + 14 * 86400000);
  f.dueDate = newDue.toISOString();
  saveState();
  renderPredictionFollowups();
  showToast('14일 후 다시 알려줄게');
}

function ensurePredictionFollowups() {
  // For each decided decision, ensure followups exist
  const decided = state.decisions.filter(d => d.status === 'decided' && d.predictions);
  decided.forEach(d => {
    ['3months', '6months', '12months'].forEach(horizon => {
      const exists = state.predictionFollowups.some(f => f.decisionId === d.id && f.horizon === horizon);
      if (!exists && d.predictions[horizon]) {
        const months = parseInt(horizon);
        const dueDate = new Date(d.decidedAt);
        dueDate.setMonth(dueDate.getMonth() + months);
        state.predictionFollowups.push({
          id: 'fu_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          decisionId: d.id,
          horizon,
          dueDate: dueDate.toISOString(),
          originalPrediction: d.predictions[horizon],
          completedAt: null,
          actualOutcome: null,
          accuracy: null,
          reflections: null
        });
      }
    });
  });
}

// ─── Weekly review screen ───
// 사용자 명시 2026-05-02 ultrathink (ERROR #2 fix): existing 체크 + batch 처리 중 race 가드.
// existing 있으면 즉시 read-only 표시 (1-2분 대기 X). batch 처리 중이면 안내.
async function openReview(type) {
  // batch 처리 중 race 차단 (ERROR #7)
  if (Array.isArray(state.pendingBatch?.review_pending) && state.pendingBatch.review_pending.includes(type)) {
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
  const key = type === 'weekly' ? getWeekKey(data.cutoff) : getMonthKey(data.cutoff);
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
  // 사용자 명시 2026-05-02 ultrathink (ERROR #12 fix): prevQ 명시 — 현재 분기 직전.
  const now = new Date();
  const Q = Math.floor(now.getMonth() / 3) + 1;
  const prevQuarterKey = Q === 1 ? `${now.getFullYear() - 1}-Q4` : `${now.getFullYear()}-Q${Q - 1}`;
  // 사용자 명시 2026-05-04: 한 번 진입한 분기 리뷰 카드 다시 안 뜨게.
  _dismissReview('quarterly', prevQuarterKey);
  // batch fresh 우선 — auto + !user_viewed
  const fresh = (state.quarterlyReviews || []).find(r => r.auto && !r.user_viewed);
  const existing = fresh || (state.quarterlyReviews || []).find(r => r.quarterKey === prevQuarterKey);
  if (existing) {
    if (existing.auto && !existing.user_viewed) {
      existing.user_viewed = true;
      saveState();
      if (typeof renderReviewPrompts === 'function') renderReviewPrompts();
    }
    return openQuarterlyStories(existing.id);
  }
  showToast(`${prevQuarterKey} 분기 리뷰 생성 중... (1-2분)`);
  const stats = (typeof getQuarterlyStats === 'function' && getQuarterlyStats(prevQuarterKey)) || {
    checkins: 0, attempts: 0, worked: 0, pearls: 0, dnaPearls: 0
  };
  try {
    const aiReview = await generateQuarterlyReview(prevQuarterKey, stats);
    const newReview = {
      id: 'qr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      quarterKey: prevQuarterKey,
      completedAt: new Date().toISOString(),
      stats,
      summary: aiReview.summary || '',
      sections: Array.isArray(aiReview.sections) ? aiReview.sections : [],
      one_word: aiReview.one_word,
      pattern: aiReview.pattern,
      turning_point: aiReview.turning_point,
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
  const prevYear = new Date().getFullYear() - 1;
  // 사용자 명시 2026-05-04: 한 번 진입한 연간 리뷰 카드 다시 안 뜨게.
  _dismissReview('annual', prevYear);
  // batch fresh 우선
  const fresh = (state.annualReviews || []).find(r => r.auto && !r.user_viewed);
  const existing = fresh || (state.annualReviews || []).find(r => r.year === prevYear);
  if (existing) {
    if (existing.auto && !existing.user_viewed) {
      existing.user_viewed = true;
      saveState();
      if (typeof renderReviewPrompts === 'function') renderReviewPrompts();
    }
    return openAnnualReview(existing);
  }
  showToast(`${prevYear}년 연간 리뷰 생성 중... (1-2분, Opus 4.7)`);
  try {
    await generateAnnualReview(prevYear);  // 자체 state.annualReviews push
    if (typeof renderReviewPrompts === 'function') renderReviewPrompts();
    const newReview = (state.annualReviews || []).find(r => r.year === prevYear);
    if (newReview) openAnnualReview(newReview);
  } catch (e) {
    showToast('생성 실패: ' + (e.message || e));
    console.warn('[openAnnualReviewCard]', e);
  }
}

// 사용자 명시 2026-05-02 ultrathink: 리뷰 batch API path 재사용 위해 prompt builder 분리.
// _collectReviewData → _buildReviewPrompt → callAnthropic / batch → _processReviewResult.
// inline path (사용자 click → generate) 와 batch path (4AM auto submit) 둘 다 동일 builder 사용.
function _collectReviewData(type) {
  const today = new Date();
  let cutoff, cutoffEnd;
  if (type === 'weekly') {
    cutoff = new Date(today.getTime() - 7 * 86400000);
    cutoffEnd = today;
  } else {
    cutoff = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    cutoffEnd = new Date(today.getFullYear(), today.getMonth(), 1);
  }
  const cutoffISO = cutoff.toISOString().split('T')[0];
  const cutoffEndISO = cutoffEnd.toISOString().split('T')[0];
  // 사용자 명시 2026-05-02 ultrathink (ERROR #11 fix): inRange 도 ISO 문자열 비교로 통일 — Date 객체 vs ISO 문자열 미스매치 방지.
  const inRange = (dt) => {
    if (!dt) return false;
    const iso = (typeof dt === 'string') ? dt.split('T')[0] : new Date(dt).toISOString().split('T')[0];
    return iso >= cutoffISO && iso < cutoffEndISO;
  };

  const entriesInRange = state.entries.filter(e => e.date >= cutoffISO && e.date < cutoffEndISO);
  const missionsInRange = state.missions.filter(m => inRange(m.createdAt));
  const chatInRange = state.chatMessages.filter(m => m.timestamp && inRange(m.timestamp) && !m.typing && !m.error && m.role === 'user').slice(-40);
  const decisionsInRange = state.decisions.filter(d => inRange(d.startedAt) || (d.decidedAt && inRange(d.decidedAt)));
  const topicCardsInRange = (state.topicCards || []).filter(t => t.createdAt && inRange(t.createdAt));
  const pearlsInRange = (state.pearls || []).filter(p => p.createdAt && inRange(p.createdAt));
  const archiveInRange = (state.archive || []).filter(a => {
    const dt = a.savedAt || a.createdAt;
    return dt && inRange(dt);
  });
  const insightsInRange = (state.insights || []).filter(i => {
    const dt = i.discoveredAt || i.createdAt;
    return dt && inRange(dt);
  });
  const chaptersInRange = (state.chatArchive || []).filter(c => {
    const dt = c.generatedAt || c.createdAt || (c.date ? c.date + 'T12:00:00' : null);
    return dt && inRange(dt);
  });

  // 이전 리뷰 씨앗 — callback 위해 prompt 주입 (continuity).
  // 사용자 보고 2026-04-30 review (agent P1-4): completedAt 기준 정렬 후 최신.
  const prevList = type === 'weekly' ? (state.weeklyReviews || []) : (state.monthlyReviews || []);
  const prevLatest = prevList.length > 0
    ? prevList.slice().sort((a, b) => new Date(b.completedAt || b.createdAt || 0) - new Date(a.completedAt || a.createdAt || 0))[0]
    : null;
  let prevSeeds = prevLatest ? (prevLatest.seeds || []) : [];
  // 사용자 명시 2026-05-02 ultrathink (ERROR #13 명시): monthly = first-touch fallback X (월=여러 주 누적이라 seed continuity 덜 중요). weekly 만 fallback.
  if (prevSeeds.length === 0 && type === 'weekly' && Array.isArray(state._firstTouchSeeds) && state._firstTouchSeeds.length > 0) {
    prevSeeds = state._firstTouchSeeds;
  }

  return {
    type,
    cutoff, cutoffEnd, cutoffISO, cutoffEndISO,
    entriesInRange, missionsInRange, chatInRange, decisionsInRange,
    topicCardsInRange, pearlsInRange, archiveInRange, insightsInRange, chaptersInRange,
    prevSeeds
  };
}

// 리뷰 prompt 빌더 — system / model / max_tokens / userMessage / _endpoint 반환.
// 사용자 명시 2026-05-02 ultrathink (ERROR #9): entries 0개 = null return → caller skip.
// V4 사용자 명시 (V190): batch API 전환 + cache_control 분리 (buildSystemPrompt 패턴).
//   stable 가이드 (목표 / Detective / 일상어 / 톤 / 출력 JSON 스키마) → system + ephemeral cache → 90% 비용 ↓
//   volatile 데이터 (기간 데이터 / 알려진 사용자 / 지난 씨앗) → userMessage
//   inline (generateReview) / batch (_buildReviewBatchRequests) 둘 다 같은 spec 사용 → 동시 적용.
function _buildReviewPrompt(type, data) {
  const { entriesInRange, missionsInRange, chatInRange, decisionsInRange, topicCardsInRange, pearlsInRange, archiveInRange, insightsInRange, chaptersInRange, prevSeeds } = data;
  if (!entriesInRange || entriesInRange.length === 0) return null;

  const periodLabel = type === 'weekly' ? '주' : '달';

  // ─── STABLE (cache_control ephemeral) ───
  const stable = `너는 사용자의 ${type === 'weekly' ? '주간' : '월간'} 리뷰를 작성한다.

[목표]
단순 요약 X. **Detective** — 사용자가 못 본 cross-pattern 발견.
사용자 자신의 인용 5개 → 자기친밀감.
다음 리뷰 때 다시 볼 '씨앗' 적용하기 → 리뷰 간 continuity.
${type === 'monthly' ? '이번 달의 너를 한 단어로 명명 (정체성 hook).' : ''}

[패턴 발견 — Detective 가이드]
- mode + entries + missions + outcomes 교차 봐.
- 예: "쉰 일요일 다음주, 한결 가벼워" / "X 가닥은 시험기에만 잘 됐어, 4번 중 4번"
- 예: "관계 entry 들 다 시험 모드 시기에 적혔네 — 시험기가 오히려 관계 챙기는 시기인가?"
- generic 패턴 X. 구체 (요일 / 인용 / 횟수) 로 입증.

[일상어 강제 — 사용자 명시 2026-04-30 ultrathink]
- 수치 약어 / 분석가 어휘 절대 X. 일상 한국어 그대로.
- BAD: "7h+ → mood +1.5", "수면 평균 7시간", "4/5 일관성", "+1.5점"
- GOOD: "잘 잔 다음날, 한결 가벼웠어 (4번 중 4번)", "평일에 7시간 넘게 잔 날들이 좋았어"
- 숫자 표시할 때도 단위 풀어 써: "7시간", "4번 중 4번", "30분", "10시 즘"
- 통계 어휘 (correlation / 평균 / +N% / std dev / 분포) 전면 X.
- 친구한테 카톡 쓰듯이.

[톤]
친한 친구. 반말. 상담사 X.
구체 > 일반. specific > generic.
판단 X. self-compassion.
짧게. 각 섹션 ≤ 4줄.
관찰 친화 — 결과보다 과정·시도·태도.

[출력 JSON]
{
  ${type === 'monthly' ? '"one_word": "이번 달의 너 = 정체성 한 단어 (예: \\"관찰자\\", \\"협상자\\", \\"탐험가\\", \\"잠수부\\"). 한 단어만.",' : '"one_word_weekly": "이번 주 momentum 한 단어 — 운동·진행 어휘 (예: \\"정착중\\", \\"가속중\\", \\"회복중\\", \\"휘청중\\", \\"재정비\\", \\"몰입\\", \\"숨고르기\\"). monthly 와 다른 dimension (정체성 X 운동성 ○).",'}
  "summary": "이번 ${periodLabel} 한 줄 요약 (15-30자)",
  "pattern": {
    "headline": "발견한 패턴 한 문장 — 친구 톤 / 일상 어휘. 짧고 surprising. 수치 약어 절대 X. 예: '아침 산책 한 날 = 그날 일기 길어', '잠 잘 잔 다음날, 기분이 한 단계 가벼워', '마감 임박이면 진짜 빨리 진입하네'. (X 'sleep 7h+ → mood +1.5')",
    "evidence": "구체 근거 — entry 인용 1-2개 + 요일/횟수. 일상 어휘로 풀어 써. 예: '"오늘 일찍 잤더니 머리 맑아." (화/목)'. (X '7h+ 4 days, mood avg 4.2')",
    "condition": "어떤 조건일 때인지 (1줄, 일상 톤). 예: '11시 전에 자고 30분 산책할 때'. (X 'sleep<23:00 + exercise≥30min')"
  },
  "quotes": ["사용자 entries / 대화에서 추출한 짧은 인용 5개 (각 30자 이내, 5개)", "...", "...", "...", "..."],
  "strengths": ["이번 ${periodLabel} 사용자가 잘한 작은 win 3-5개 (구체, 자기 친밀 톤, 자존감 boost). 결과 X 시도·태도·관찰 ○. 예: '월요일 마감 임박에도 잠 7시간 챙김', '엄마 통화 후 5분 산책으로 회복'", "...", "..."],
  "cycles": {
    "sleep": "수면 → 이번 ${periodLabel} 영향 (1줄, 일상어). 예: '잘 잔 날 4번, 다음날마다 한결 가벼웠어'. (X '7h+ avg → +1.5'). 무관하면 빈 문자열.",
    "mode": "어떤 모드·시간대에서 어땠는지 (1줄, 일상어). 예: '시험기인데도 카페 가서 글이 술술 써졌어'.",
    "other": "황체기·날씨·계절·외부 (1줄, 일상어). 예: '비 오는 날 살짝 무거웠어'. 모르면 빈 문자열."
  },
  "value_align": {
    "score": "0-10 정수 — 사용자 본인 values 명단 와 이번 ${periodLabel} 행동이 얼마나 맞았나. values 명단 X 면 score=null.",
    "aligned": "values 명단 단어 그대로 + 그 가치 보여준 구체 행동 (1줄, 일상어). 예: '"회복" — 잠 일찍 잔 날 4번, 산책 3번', '"자율" — 카페 가는 거 스스로 정함'.",
    "gap": "values 명단 중 살짝 멀어진 거 + 부드럽게 (1줄, 판단 X). 빈 문자열 OK. 예: '"연결"은 살짝 약했어 — 이번 주는 회복기였으니 OK'."
  },
  "emotions": [{"word": "사용자가 자주 쓴 감정 단어 (entries/chat 에서)", "count": "사용 빈도 (정수)"}],
  "risk_signals": {
    "level": "'none' | 'watch' | 'concern' — mood drop 3일 이상 / 수면 심하게 불규칙 / 사람 만남 X / 미션 연속 missed 등",
    "signals": ["감지된 신호 (구체, 부드럽게). 'none' 일 때 빈 array.", "..."],
    "suggestion": "부드러운 제안 1줄. concern 일 때 위기 채널 안내 (1393 자살예방, 1577-0199 정신건강, 119) 포함. watch 면 self-care 제안. none 이면 빈 문자열."
  }
}

JSON 객체 하나만 반환. markdown code fence X. 다른 글 X. 모든 필수 필드 다 채워서 출력.`;

  // ─── VOLATILE (매번 다른 데이터) ───
  const volatile = `[기간 데이터]
체크인: ${JSON.stringify(entriesInRange, null, 2).slice(0, 4000)}
미션: ${JSON.stringify(missionsInRange.map(m => ({title: m.title, status: m.status, attemptStatus: m.attemptStatus, strategyId: m.strategyId})), null, 2).slice(0, 1500)}
대화 발췌 (사용자): ${chatInRange.map(m => m.content.slice(0, 200)).join('\n---\n').slice(0, 3000)}
결정 + 예측: ${JSON.stringify(decisionsInRange.map(d => ({title: d.title, status: d.status, finalDecision: d.finalDecision, predictions: d.predictions})), null, 2).slice(0, 1500)}
챕터: ${JSON.stringify(chaptersInRange.map(c => ({date: c.date, messageCount: c.messageCount})), null, 0).slice(0, 1500)}
가닥(topicCards): ${JSON.stringify(topicCardsInRange.map(t => ({title: t.title, summary: t.summary, category: t.category})), null, 0).slice(0, 1500)}
진주: ${JSON.stringify(pearlsInRange.map(p => ({content: p.content, note: p.note})), null, 0).slice(0, 1000)}
스크랩(archive): ${JSON.stringify(archiveInRange.map(a => ({headline: a.headline, body: (a.body || '').slice(0, 200), tags: a.tags, starred: a.starred})), null, 0).slice(0, 1200)}
인사이트: ${JSON.stringify(insightsInRange.map(i => ({content: i.content, type: i.type})), null, 0).slice(0, 800)}
활성 모드: ${Object.keys(state.modes || {}).filter(k => state.modes[k]).join(', ') || '없음'}

이미 알려진 사용자 (user_verified ✓ 만):
- traits: ${(state.traits || []).filter(t => t.user_verified !== false).slice(0, 5).map(t => t.name).join(', ')}
- patterns: ${(state.patterns || []).filter(p => p.user_verified !== false).slice(0, 5).map(p => p.name).join(', ')}
- values: ${(state.values || []).filter(v => v.user_verified !== false).slice(0, 3).map(v => v.name).join(', ')}

[지난 리뷰 씨앗] ${prevSeeds.length > 0 ? '(callback 추천 — 씨앗이 어떻게 됐는지 짚어주면 사용자 신뢰↑)' : '(없음)'}
${prevSeeds.length > 0 ? prevSeeds.map(s => '· ' + s).join('\n') : '(이번이 첫 리뷰 또는 이전 씨앗 X)'}

위 데이터로 [출력 JSON] 스키마에 맞춰 JSON 객체 하나만 반환.`;

  return {
    system: [{ type: 'text', text: stable, cache_control: { type: 'ephemeral' } }],
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    userMessage: volatile,
    _endpoint: type === 'monthly' ? 'review_monthly' : 'review_weekly'
  };
}

// 리뷰 결과 처리 — JSON 파싱만 (state.push 는 caller 책임. inline = renderReviewScreen 의 사용자 save / batch = 자동 push).
function _processReviewResult(jsonText) {
  return _robustJsonExtract(jsonText);
}

// 사용자 명시 2026-05-02 ultrathink: generateReview = collect → build → callAnthropic → process (단순 wrapper).
// batch path 는 _collectReviewData / _buildReviewPrompt 만 사용 + batch request 넣음.
async function generateReview(type) {
  if (!_canAI()) throw new Error('AI 호출 불가능 (로그인 또는 API 키 필요)');
  const data = _collectReviewData(type);
  const promptSpec = _buildReviewPrompt(type, data);
  if (!promptSpec) throw new Error('이 기간 데이터가 없어서 리뷰를 생성할 수 없어요');

  const resp = await callAnthropic({
    _endpoint: promptSpec._endpoint,
    model: promptSpec.model,
    max_tokens: promptSpec.max_tokens,
    system: promptSpec.system,
    messages: [{ role: 'user', content: promptSpec.userMessage }]
  });
  if (!resp.ok) throw new Error('API ' + resp.status);
  const respData = await resp.json();
  const text = respData.content[0].text;
  return _processReviewResult(text);
}

// 사용자 명시 2026-05-01: opts.readonly = 리뷰 모음에서 클릭 시 풀화면 read-only view (저장 X / 삭제 + 모음으로 돌아가기 버튼)
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

    // Pattern — 핵심 카드 2
    const pat = reviewData.pattern || {};
    const patternBlock = (pat.headline || pat.evidence || pat.condition) ? `
    <div style="background:var(--surface); border:1px solid rgba(201,169,110,0.20); border-radius:14px; padding:16px 18px; margin-bottom:14px;">
      <div style="font-size:11px; color:var(--accent); letter-spacing:0.15em; text-transform:uppercase; margin-bottom:10px;">🔍 패턴 발견</div>
      ${pat.headline ? `<div style="font-size:14.5px; font-weight:600; color:var(--text); line-height:1.6; margin-bottom:8px;">${escapeHtml(pat.headline)}</div>` : ''}
      ${pat.evidence ? `<div style="font-size:12px; color:var(--text-dim); line-height:1.7; padding:8px 12px; background:rgba(0,0,0,0.18); border-left:2px solid rgba(201,169,110,0.40); border-radius:6px; margin-bottom:6px;">${escapeHtml(pat.evidence)}</div>` : ''}
      ${pat.condition ? `<div style="font-size:11px; color:var(--text-soft); line-height:1.6;">↳ ${escapeHtml(pat.condition)}</div>` : ''}
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
    risk_signals: reviewData.risk_signals
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
function _renderReviewMoodChart(entries) {
  if (!Array.isArray(entries) || entries.length < 2) return '';
  // mood: 1-5 / energy: 1-5 둘 다 정규화 후 0-1 비율로 표시
  const w = 320, h = 110, pad = 18;
  const xs = (i) => pad + (i / (entries.length - 1)) * (w - pad * 2);
  const ys = (v) => h - pad - ((Number(v) - 1) / 4) * (h - pad * 2);  // 1-5 → 0-1 → y
  const moodValid = entries.filter(e => Number.isFinite(Number(e.mood)) && Number(e.mood) >= 1 && Number(e.mood) <= 5);
  const energyValid = entries.filter(e => Number.isFinite(Number(e.energy)) && Number(e.energy) >= 1 && Number(e.energy) <= 5);
  if (moodValid.length < 2 && energyValid.length < 2) return '';
  const buildPath = (vals, getter) => vals.map((e, i) => {
    const idx = entries.indexOf(e);
    return `${i === 0 ? 'M' : 'L'}${xs(idx).toFixed(1)},${ys(getter(e)).toFixed(1)}`;
  }).join(' ');
  const moodPath = moodValid.length >= 2 ? buildPath(moodValid, e => e.mood) : '';
  const energyPath = energyValid.length >= 2 ? buildPath(energyValid, e => e.energy) : '';
  const dots = (vals, color, getter) => vals.map(e => {
    const idx = entries.indexOf(e);
    return `<circle cx="${xs(idx).toFixed(1)}" cy="${ys(getter(e)).toFixed(1)}" r="3.5" fill="${color}"/>`;
  }).join('');
  // x-axis dates
  const labels = entries.map((e, i) => {
    const x = xs(i);
    const md = (e.date || '').slice(5);  // MM-DD
    return `<text x="${x.toFixed(1)}" y="${h - 4}" fill="rgba(255,255,255,0.40)" font-size="9" text-anchor="middle">${md}</text>`;
  }).join('');
  // grid lines
  const gridY = [1, 2, 3, 4, 5].map(v => `<line x1="${pad}" y1="${ys(v).toFixed(1)}" x2="${w - pad}" y2="${ys(v).toFixed(1)}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>`).join('');
  return `
    <div class="review-section" style="background:var(--surface); border-radius:14px; padding:14px 16px; margin-bottom:18px;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
        <div style="font-size:11px; color:var(--accent); letter-spacing:0.15em; text-transform:uppercase;">📊 7일 흐름</div>
        <div style="font-size:10px; color:var(--text-soft);">
          <span style="color:#e8c890;">● mood</span> <span style="color:#7ec8e3; margin-left:8px;">● energy</span>
        </div>
      </div>
      <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:auto; display:block;" preserveAspectRatio="xMidYMid meet">
        ${gridY}
        ${moodPath ? `<path d="${moodPath}" stroke="#e8c890" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
        ${energyPath ? `<path d="${energyPath}" stroke="#7ec8e3" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
        ${moodPath ? dots(moodValid, '#e8c890', e => e.mood) : ''}
        ${energyPath ? dots(energyValid, '#7ec8e3', e => e.energy) : ''}
        ${labels}
      </svg>
    </div>`;
}


// hero block 내부에 inline 적용하는 chart variant — 카드 wrapper X (hero 가 wrapper 역할).
function _renderReviewMoodChartInline(entries) {
  if (!Array.isArray(entries) || entries.length < 2) return '';
  const w = 320, h = 100, pad = 16;
  const xs = (i) => pad + (i / (entries.length - 1)) * (w - pad * 2);
  const ys = (v) => h - pad - ((Number(v) - 1) / 4) * (h - pad * 2);
  const moodValid = entries.filter(e => Number.isFinite(Number(e.mood)) && Number(e.mood) >= 1 && Number(e.mood) <= 5);
  const energyValid = entries.filter(e => Number.isFinite(Number(e.energy)) && Number(e.energy) >= 1 && Number(e.energy) <= 5);
  if (moodValid.length < 2 && energyValid.length < 2) return '';
  const buildPath = (vals, getter) => vals.map((e, i) => {
    const idx = entries.indexOf(e);
    return `${i === 0 ? 'M' : 'L'}${xs(idx).toFixed(1)},${ys(getter(e)).toFixed(1)}`;
  }).join(' ');
  const moodPath = moodValid.length >= 2 ? buildPath(moodValid, e => e.mood) : '';
  const energyPath = energyValid.length >= 2 ? buildPath(energyValid, e => e.energy) : '';
  const dots = (vals, color, getter) => vals.map(e => {
    const idx = entries.indexOf(e);
    return `<circle cx="${xs(idx).toFixed(1)}" cy="${ys(getter(e)).toFixed(1)}" r="3" fill="${color}"/>`;
  }).join('');
  const labels = entries.map((e, i) => {
    const x = xs(i);
    const md = (e.date || '').slice(5);
    return `<text x="${x.toFixed(1)}" y="${h - 2}" fill="rgba(255,255,255,0.36)" font-size="8.5" text-anchor="middle">${md}</text>`;
  }).join('');
  const gridY = [1, 3, 5].map(v => `<line x1="${pad}" y1="${ys(v).toFixed(1)}" x2="${w - pad}" y2="${ys(v).toFixed(1)}" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>`).join('');
  return `
    <div style="margin-top:6px;">
      <div style="display:flex; align-items:center; justify-content:center; gap:14px; font-size:9.5px; color:var(--text-soft); margin-bottom:4px;">
        <span style="color:#e8c890;">● mood</span><span style="color:#7ec8e3;">● energy</span>
      </div>
      <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:auto; display:block;" preserveAspectRatio="xMidYMid meet">
        ${gridY}
        ${moodPath ? `<path d="${moodPath}" stroke="#e8c890" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
        ${energyPath ? `<path d="${energyPath}" stroke="#7ec8e3" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
        ${moodPath ? dots(moodValid, '#e8c890', e => e.mood) : ''}
        ${energyPath ? dots(energyValid, '#7ec8e3', e => e.energy) : ''}
        ${labels}
      </svg>
    </div>`;
}

// 사용자 명시 2026-04-30 ultrathink + 검색 (Spotify Wrapped 2025 5억 share / 디자인 트렌드 typography-first / Strava signature visual): 공유 카드 PNG export 재설계.
// 1080x1920 (Stories), brand recognition = 🐚 + gold + Gowun Batang serif, hero typography hierarchy 강화 (Wrapped 2025 약점 = 강한 hero 부재).
async function exportReviewShareCard(type) {
  const screen = document.getElementById('screen-review');
  if (!screen || !screen.dataset.reviewData) { alert('리뷰 데이터 없음'); return; }
  const r = JSON.parse(screen.dataset.reviewData);

  // 폰트 (Gowun Batang) 로드 — canvas 에서 system font fallback 안 되도록 미리 ready
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch {}
  showToast('🎨 카드 그리는 중...');

  // 로고 (godongicon.png) 미리 로드 — emoji 대신 사용
  let logoImg = null;
  try {
    logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';
    logoImg.src = '/godongicon.png';
    await logoImg.decode();
  } catch (e) {
    console.warn('[shareCard] godongicon 로드 실패:', e);
    logoImg = null;
  }

  const W = 1080, H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // ── 1. Background — 깊은 다크 그라데이션 (3 stop) ──
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0f0e17');
  bg.addColorStop(0.55, '#1a1826');
  bg.addColorStop(1, '#221f33');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── 2. Hero halo — center radial gold ──
  const halo = ctx.createRadialGradient(W * 0.5, 700, 0, W * 0.5, 700, 760);
  halo.addColorStop(0, 'rgba(201,169,110,0.22)');
  halo.addColorStop(0.55, 'rgba(201,169,110,0.06)');
  halo.addColorStop(1, 'rgba(201,169,110,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);

  // ── 3. 로고 watermark — 거대 옅은 원 (background depth) ──
  if (logoImg) {
    ctx.save();
    ctx.globalAlpha = 0.055;
    const wmSize = 760;
    ctx.drawImage(logoImg, (W - wmSize) / 2, 720, wmSize, wmSize);
    ctx.restore();
  }

  // ── 4. ✨ 작은 점 산재 (decoration, opacity 0.28) ──
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.font = '36px serif';
  ctx.fillStyle = '#e8c99a';
  ctx.textAlign = 'center';
  const sparkles = [
    [180, 220], [920, 280], [240, 1640], [880, 1760],
    [120, 880], [960, 1100], [780, 200], [200, 1380]
  ];
  sparkles.forEach(([x, y]) => ctx.fillText('✦', x, y));
  ctx.restore();

  ctx.textAlign = 'center';

  // ── 5. Top 라벨 — 주간 진주 / 월간 진주 + 날짜 ──
  const dateStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).replace(/년 |월 |일/g, m => ({ '년 ':'.', '월 ':'.', '일':'' }[m]));
  ctx.font = '500 30px "Noto Sans KR", system-ui, sans-serif';
  ctx.fillStyle = '#7b7a8e';
  ctx.fillText((type === 'weekly' ? '주간 진주' : '월간 진주') + '  ·  ' + dateStr, W / 2, 220);

  // ── 6. 로고 작게 (hero word 위) ──
  if (logoImg) {
    const heroSize = 130;
    ctx.drawImage(logoImg, (W - heroSize) / 2, 290, heroSize, heroSize);
  }

  // ── 7. momentum / 정체성 라벨 ──
  ctx.font = '600 26px "Noto Sans KR", system-ui';
  ctx.fillStyle = '#9d9aad';
  ctx.letterSpacing = '0.18em';
  const labelText = type === 'weekly' ? '이번 주 momentum' : '이번 달의 너';
  ctx.fillText(labelText, W / 2, 460);

  // ── 8. 한 단어 hero (거대 typography — Wrapped 2025 학습: 강한 hero 필요) ──
  const oneWord = r.one_word_weekly || r.one_word || '';
  if (oneWord) {
    ctx.font = '700 200px "Gowun Batang", "Nanum Myeongjo", serif';
    ctx.fillStyle = type === 'weekly' ? '#9ed4e8' : '#c9a96e';
    ctx.fillText(oneWord, W / 2, 700);

    // 한 단어 underline accent
    const tw = ctx.measureText(oneWord).width;
    const ux = W / 2 - tw / 2;
    ctx.fillStyle = type === 'weekly' ? 'rgba(126,200,227,0.35)' : 'rgba(201,169,110,0.35)';
    ctx.fillRect(ux, 730, tw, 4);
  }

  // ── 9. Best quote (60px serif italic, hero 다음 anchor) ──
  // quotes 중 가장 짧고 의미 강한 것 하나 — 첫 번째 사용
  const quotes = Array.isArray(r.quotes) ? r.quotes.filter(q => q && q.trim()) : [];
  const bestQuote = quotes[0] ? String(quotes[0]).replace(/^["\u201c]|["\u201d]$/g, '').trim() : '';
  if (bestQuote) {
    // hairline divider 위/아래
    ctx.fillStyle = 'rgba(232,201,154,0.20)';
    ctx.fillRect(W * 0.18, 880, W * 0.64, 1);

    ctx.font = 'italic 500 56px "Gowun Batang", serif';
    ctx.fillStyle = '#ede8f5';
    const qLines = _wrapText('"' + bestQuote + '"', 18);
    qLines.slice(0, 3).forEach((ln, i) => ctx.fillText(ln, W / 2, 970 + i * 78));

    ctx.fillStyle = 'rgba(232,201,154,0.20)';
    ctx.fillRect(W * 0.18, 1180, W * 0.64, 1);
  }

  // ── 10. Strengths label + 3 items ──
  const strengths = (Array.isArray(r.strengths) ? r.strengths : []).slice(0, 3);
  if (strengths.length > 0) {
    ctx.font = '600 28px "Noto Sans KR", system-ui';
    ctx.fillStyle = '#f5c870';
    ctx.fillText('✨  이번 ' + (type === 'weekly' ? '주' : '달') + ' 잘한 것', W / 2, 1300);

    ctx.font = '400 32px "Noto Sans KR", system-ui';
    ctx.fillStyle = '#ede8f5';
    strengths.forEach((s, i) => {
      const lines = _wrapText(s, 22);
      lines.slice(0, 2).forEach((ln, j) => {
        const yy = 1380 + (i * 88) + (j * 38);
        ctx.fillText(ln, W / 2, yy);
      });
    });
  }

  // ── 11. Footer — 🐚 소라고동 + URL (acquisition trigger) ──
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(W * 0.32, 1740, W * 0.36, 1);

  ctx.font = '600 36px "Gowun Batang", serif';
  ctx.fillStyle = '#c9a96e';
  // 로고 + 텍스트 inline (이미지 + '소라고동' 가운데 정렬)
  if (logoImg) {
    const brandText = '소라고동';
    const tw = ctx.measureText(brandText).width;
    const logoW = 44, gap = 14;
    const totalW = logoW + gap + tw;
    const startX = (W - totalW) / 2;
    ctx.drawImage(logoImg, startX, 1779, logoW, logoW);
    ctx.textAlign = 'left';
    ctx.fillText(brandText, startX + logoW + gap, 1812);
    ctx.textAlign = 'center';
  } else {
    ctx.fillText('소라고동', W / 2, 1810);
  }

  ctx.font = '400 24px "Noto Sans KR", system-ui';
  ctx.fillStyle = '#7b7a8e';
  ctx.fillText('soragodong.com', W / 2, 1854);

  // ── 12. Download ──
  canvas.toBlob((blob) => {
    if (!blob) { alert('PNG 변환 실패'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `soragodong_${type}_${new Date().toISOString().split('T')[0]}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('📤 공유 카드 다운로드됨 ✦');
  }, 'image/png');
}

// helper: 한 줄당 char 수로 줄바꿈
function _wrapText(text, charsPerLine) {
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  words.forEach(w => {
    if ((cur + ' ' + w).trim().length > charsPerLine) {
      if (cur) lines.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  });
  if (cur) lines.push(cur);
  return lines.slice(0, 4);  // max 4 줄
}

// ─── Future Self Letter (prediction follow-up) ───
function openFollowup(followupId) {
  const followup = state.predictionFollowups.find(f => f.id === followupId);
  if (!followup) return;
  const decision = state.decisions.find(d => d.id === followup.decisionId);
  if (!decision) return;
  const horizonLabel = { '3months': '3개월', '6months': '6개월', '12months': '12개월' }[followup.horizon];

  const screen = document.getElementById('screen-followup');
  screen.innerHTML = `
    <div class="screen-title">🔮 Future Self Letter</div>
    <div class="screen-sub">${horizonLabel} 전 너에게서 온 편지가 도착했어.</div>

    <div style="background: linear-gradient(135deg, rgba(212,167,106,0.1), rgba(139,126,196,0.08)); border: 1px solid rgba(212,167,106,0.25); border-radius: 16px; padding: 18px; margin-bottom: 20px;">
      <div style="font-size: 11px; color: #d4a76a; letter-spacing: 0.1em; margin-bottom: 8px;">결정: ${escapeHtml(decision.title)}</div>
      <div style="font-size: 12px; color: var(--text-dim); margin-bottom: 10px;">최종 결정: ${escapeHtml(decision.finalDecision || '')}</div>
      <div style="font-size: 11px; color: var(--accent); letter-spacing: 0.08em; margin-bottom: 6px; margin-top: 14px;">${horizonLabel} 전 네 예측:</div>
      <div style="font-size: 14px; line-height: 1.7; color: var(--text); font-style: italic;">"${escapeHtml(followup.originalPrediction)}"</div>
    </div>

    <div class="input-group">
      <div class="input-label">📝 지금 실제로는 어때?</div>
      <textarea id="followupOutcome" rows="4" placeholder="실제로 ${horizonLabel} 후, 상황과 네 느낌은?"></textarea>
    </div>

    <div class="input-group">
      <div class="input-label">🎯 예측 정확도 (1-10)</div>
      <input type="number" id="followupAccuracy" min="1" max="10" value="5">
      <div style="font-size:11px; color:var(--text-dim); margin-top:6px;">1: 완전히 틀림 / 5: 어느 정도 맞음 / 10: 정확히 예측대로</div>
    </div>

    <div class="input-group">
      <div class="input-label">💭 돌아보면 (선택)</div>
      <textarea id="followupReflection" rows="3" placeholder="이 예측이 왜 맞았/틀렸는지, 나에 대해 새로 알게 된 것이 있다면..."></textarea>
    </div>

    <button class="btn-primary decision" onclick="saveFollowup('${followupId}')">기록하고 닫기 ✦</button>
    <button class="btn-secondary" onclick="showScreen('home')">나중에</button>
  `;
  showScreen('followup');
}

async function saveFollowup(followupId) {
  const followup = state.predictionFollowups.find(f => f.id === followupId);
  const outcome = document.getElementById('followupOutcome').value.trim();
  const accuracy = parseInt(document.getElementById('followupAccuracy').value) || 5;
  const reflection = document.getElementById('followupReflection').value.trim();

  if (!outcome) { alert('실제 상황을 적어주세요.'); return; }

  followup.completedAt = new Date().toISOString();
  followup.actualOutcome = outcome;
  followup.accuracy = accuracy;
  followup.reflections = reflection;

  // Add to archive — 사용자 명시 2026-05-01 ultrathink: Future Self = 마법고동 흐름 → type='magic'
  const decision = state.decisions.find(d => d.id === followup.decisionId);
  state.archive.unshift({
    date: new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }),
    insight: `[Future Self] "${decision?.title}" 결정의 ${followup.horizon} 후 — 예측 정확도 ${accuracy}/10. ${reflection || outcome.slice(0, 100)}`,
    source: '🔮 Future Self',
    savedAt: new Date().toISOString(),
    type: 'magic',
    tags: ['마법고동', 'Future Self']
  });

  saveState();
  showCelebration('🔮', '편지 회신 완료', '✦');
  setTimeout(() => { showScreen('home'); }, 1500);
}

