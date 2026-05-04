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
