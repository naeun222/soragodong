// 사용자 명시 2026-05-09 ultrathink: 리뷰 카드 description hook — generic 워딩 X / specific stat preview ○.
// "AI가 분석해줄게" 일반 워딩 → "이번 주 4번 체크인 · 진주 2개" specific. 사용자 본인 데이터 미리 보여주는 게 가장 강한 hook.
function _buildReviewCardHook(type) {
  try {
    const today = (typeof _cutoffAdjustedNow === 'function') ? _cutoffAdjustedNow() : new Date();
    const dayNames = ['일','월','화','수','목','금','토'];
    let entries = [], pearls = [], archive = [];
    let startISO = '', endISO = '';

    if (type === 'weekly') {
      const sunCutoff4am = (typeof _lastWeekly4amCutoff === 'function') ? _lastWeekly4amCutoff() : null;
      const cutoff = sunCutoff4am ? new Date(sunCutoff4am.getTime() - 7 * 86400000) : new Date(today.getTime() - 7 * 86400000);
      const cutoffEnd = sunCutoff4am || today;
      startISO = cutoff.toISOString().split('T')[0];
      endISO = cutoffEnd.toISOString().split('T')[0];
    } else if (type === 'monthly') {
      const cutoff = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const cutoffEnd = new Date(today.getFullYear(), today.getMonth(), 1);
      startISO = cutoff.toISOString().split('T')[0];
      endISO = cutoffEnd.toISOString().split('T')[0];
    } else if (type === 'quarterly') {
      const prevQDate = new Date(today.getFullYear(), today.getMonth() - 1, 15);
      const prevQuarterKey = (typeof getQuarterKey === 'function') ? getQuarterKey(prevQDate) : null;
      const range = (typeof getQuarterRange === 'function' && prevQuarterKey) ? getQuarterRange(prevQuarterKey) : null;
      if (!range) return null;
      startISO = range.start.toISOString().split('T')[0];
      endISO = range.end.toISOString().split('T')[0];
    } else if (type === 'annual') {
      const prevYear = today.getFullYear() - 1;
      startISO = `${prevYear}-01-01`;
      endISO = `${prevYear}-12-31`;
    } else {
      return null;
    }

    const inRangeIso = (iso) => iso && iso >= startISO && iso <= endISO;
    entries = (state.entries || []).filter(e => e.date && inRangeIso(e.date));
    pearls = (state.pearls || []).filter(p => !p._deleted && p.createdAt && inRangeIso(String(p.createdAt).slice(0, 10)));
    archive = (state.archive || []).filter(a => !a._deleted && a.type !== 'memo' && !a._excludeFromAI
      && (a.savedAt || a.createdAt) && inRangeIso(String(a.savedAt || a.createdAt).slice(0, 10)));

    if (entries.length === 0) return null;

    const parts = [];
    if (type === 'weekly') {
      parts.push(`${entries.length}번 체크인`);
      const dayCount = {};
      entries.forEach(e => { const d = new Date(e.date + 'T12:00:00').getDay(); dayCount[d] = (dayCount[d] || 0) + 1; });
      const topDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0];
      if (topDay && Number(topDay[1]) >= 2) parts.push(`${dayNames[topDay[0]]}요일 ${topDay[1]}번`);
      const moods = entries.map(e => Number(e.mood)).filter(v => Number.isFinite(v) && v >= 1 && v <= 5);
      if (moods.length > 0) {
        const avg = moods.reduce((s, v) => s + v, 0) / moods.length;
        if (avg >= 3.8) parts.push('한결 가벼운 주');
        else if (avg <= 2.2) parts.push('무거웠던 주');
      }
      if (pearls.length > 0) parts.push(`진주 ${pearls.length}개`);
    } else if (type === 'monthly') {
      parts.push(`${entries.length}일 체크인`);
      if (pearls.length > 0) parts.push(`진주 ${pearls.length}개`);
      if (archive.length > 0) parts.push(`스크랩 ${archive.length}개`);
    } else if (type === 'quarterly') {
      parts.push(`3개월 ${entries.length}일`);
      if (pearls.length > 0) parts.push(`진주 ${pearls.length}개`);
      if (archive.length > 0) parts.push(`깨달음 ${archive.length}`);
    } else if (type === 'annual') {
      parts.push(`${entries.length}일 일기`);
      if (pearls.length > 0) parts.push(`진주 ${pearls.length}개`);
      if (archive.length > 0) parts.push(`깨달음 ${archive.length}`);
    }
    return parts.length > 0 ? parts.join(' · ') : null;
  } catch (e) {
    return null;
  }
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

  // 사용자 명시 2026-05-09 ultrathink: 1월 첫 일요일 동시 노출 → 큰 사이클 1개씩만 throttle.
  // 연간 가능하면 분기 hide, 분기 가능하면 월 hide 등 — ritual overload 방지.
  const annualOk = !_hidden('annual') && typeof isAnnualReviewAvailable === 'function' && isAnnualReviewAvailable();
  const quarterlyOk = !_hidden('quarterly') && typeof isQuarterlyReviewAvailable === 'function' && isQuarterlyReviewAvailable();
  const monthlyOk = !_hidden('monthly') && isMonthlyReviewAvailable();
  const weeklyOk = !_hidden('weekly') && isWeeklyReviewAvailable();

  // throttle 결정: 가장 큰 사이클 1개만 노출 (사용자 명시 2026-05-09 ultrathink).
  // 단 fresh batch (auto + !user_viewed) 는 우선 — 사용자가 못 본 결과 누락 방지.
  const annualHasFresh = _hasFreshBatchReview('annualReviews');
  const quarterlyHasFresh = _hasFreshBatchReview('quarterlyReviews');
  const monthlyHasFresh = _hasFreshBatchReview('monthlyReviews');
  const weeklyHasFresh = _hasFreshBatchReview('weeklyReviews');

  let showAnnual = annualOk;
  let showQuarterly = quarterlyOk && !showAnnual;
  let showMonthly = monthlyOk && !showAnnual && !showQuarterly;
  let showWeekly = weeklyOk && !showAnnual && !showQuarterly && !showMonthly;
  // fresh batch 결과는 throttle 우회 (놓치면 영영 안 봄)
  if (annualHasFresh) showAnnual = true;
  if (quarterlyHasFresh) showQuarterly = true;
  if (monthlyHasFresh) showMonthly = true;
  if (weeklyHasFresh) showWeekly = true;

  // 사용자 명시 2026-05-01: 큰 사이클부터 (연 → 분기 → 월 → 주). 가장 무거운 게 위로.
  if (showAnnual) {
    const prevYear = _cutoffAdjustedNow().getFullYear() - 1;
    const hook = _buildReviewCardHook('annual') || `${prevYear}년 한 단어로 너의 한 해`;
    html += `
      <div class="review-card annual" onclick="openAnnualReviewCard()">
        <div class="review-card-label">🐚 연간 리뷰${_freshLabel('annualReviews')}</div>
        <div class="review-card-title">${prevYear}년을 한 번에 돌아볼까?</div>
        <div class="review-card-desc">${escapeHtml(hook)}</div>
      </div>
    `;
  }
  if (showQuarterly) {
    const today = new Date();
    const prevQDate = new Date(today.getFullYear(), today.getMonth() - 1, 15);
    const prevQuarterKey = getQuarterKey(prevQDate);
    const qNum = prevQuarterKey.split('-Q')[1];
    const season = (typeof SEASON_LABELS !== 'undefined' && SEASON_LABELS['Q' + qNum]) || { name: '계절', emoji: '🍂' };
    const hook = _buildReviewCardHook('quarterly') || `한 계절 변화 + 다음 ${season.name} 한 가지`;
    html += `
      <div class="review-card quarterly" onclick="openQuarterlyReviewCard()">
        <div class="review-card-label">${season.emoji} ${season.name} 리뷰${_freshLabel('quarterlyReviews')}</div>
        <div class="review-card-title">지난 ${season.name} 한 계절을 정리해볼까?</div>
        <div class="review-card-desc">${escapeHtml(hook)}</div>
      </div>
    `;
  }
  if (showMonthly) {
    const hook = _buildReviewCardHook('monthly') || '한 달치 패턴, 의미 있던 순간';
    html += `
      <div class="review-card monthly" onclick="openReview('monthly')">
        <div class="review-card-label">📅 월간 리뷰${_freshLabel('monthlyReviews')}</div>
        <div class="review-card-title">지난 달 네 모습 돌아보기</div>
        <div class="review-card-desc">${escapeHtml(hook)}</div>
      </div>
    `;
  }
  if (showWeekly) {
    const hook = _buildReviewCardHook('weekly') || '7일 흐름 + 너의 장면들';
    html += `
      <div class="review-card" onclick="openReview('weekly')">
        <div class="review-card-label">🌙 주간 리뷰${_freshLabel('weeklyReviews')}</div>
        <div class="review-card-title">이번 주 어땠는지 같이 돌아볼까?</div>
        <div class="review-card-desc">${escapeHtml(hook)}</div>
      </div>
    `;
  }
  // 사용자 명시 2026-05-09: '📚 지난 리뷰 모음 →' footer link 제거 — 번잡.
  // 진입 path 흡수: 도서관 → '🌀 마법·리뷰' 카테고리 → 리뷰 모음 (16-galpi-insights.js archive-quick-row 에서 노출).
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
