// 사용자 요청 2026-04-29: 직전 분기 '🧭 다음 분기에' 본문 후일담으로 보여줌 (auto, 사용자 입력 X)
function _buildForecastFollowupSlideHTML(currentQuarterKey) {
  const m = String(currentQuarterKey || '').match(/^(\d{4})-Q(\d)$/);
  if (!m) return null;
  let y = parseInt(m[1]); let q = parseInt(m[2]) - 1;
  if (q < 1) { q = 4; y -= 1; }
  const prevReview = (state.quarterlyReviews || []).find(r => r.quarterKey === `${y}-Q${q}`);
  if (!prevReview || !Array.isArray(prevReview.sections)) return null;
  const forecast = prevReview.sections.find(s => s && s.label && (s.label.includes('다음 분기') || s.label.includes('다음에')));
  if (!forecast || !forecast.body) return null;
  return `
    <div class="stories-label">🔮 직전 분기 예측</div>
    <div class="stories-title" style="margin-bottom:14px;">"${escapeHtml(prevReview.quarterKey)}"에서 던진 한 마디</div>
    <div style="font-size:14px; color:rgba(255,255,255,0.92); font-style:italic; padding:16px 18px; background:rgba(212,167,106,0.12); border-left:3px solid rgba(212,167,106,0.55); border-radius:4px 12px 12px 4px; margin:10px auto; max-width:280px; line-height:1.65; text-align:left;">"${escapeHtml(forecast.body)}"</div>
    <div class="stories-body" style="margin-top:18px; font-size:12px; opacity:0.7;">실제로는 어땠어? 한 분기 풀어볼게.</div>
  `;
}

// 사용자 요청 2026-04-29: 1년 전 같은 분기 리뷰 한 문장 (Timecapsule)
function _buildTimecapsuleSlideHTML(currentQuarterKey) {
  const m = String(currentQuarterKey || '').match(/^(\d{4})-Q(\d)$/);
  if (!m) return null;
  const prevYear = parseInt(m[1]) - 1;
  const prevKey = `${prevYear}-Q${m[2]}`;
  const prevReview = (state.quarterlyReviews || []).find(r => r.quarterKey === prevKey);
  if (!prevReview || (!prevReview.summary && !(Array.isArray(prevReview.sections) && prevReview.sections[0]))) return null;
  const quote = prevReview.summary || prevReview.sections[0].body || '';
  if (!quote) return null;
  return `
    <div class="stories-label">📦 1년 전 너는</div>
    <div class="stories-title" style="margin-bottom:14px;">${escapeHtml(prevKey)}</div>
    <div style="font-size:15px; color:white; font-style:italic; padding:18px; background:linear-gradient(135deg, rgba(168,157,200,0.15), rgba(212,167,106,0.10)); border:1px solid rgba(168,157,200,0.3); border-radius:14px; margin:10px auto; max-width:280px; line-height:1.65;">"${escapeHtml(quote.slice(0, 220))}"</div>
    <div class="stories-body" style="margin-top:18px; font-size:11px; opacity:0.6;">그 분기 너와 비교해보면 어때?</div>
  `;
}

function _buildChangeSlideHTML(stats, prevQ) {
  const rows = [];
  const trend = (cur, prev) => {
    if (prev == null) return '';
    if (cur > prev) return `<span class="stories-stat-trend" style="color:#8fc88f;">↑${cur - prev}</span>`;
    if (cur < prev) return `<span class="stories-stat-trend" style="color:#c98c8c;">↓${prev - cur}</span>`;
    return `<span class="stories-stat-trend" style="opacity:0.5;">→</span>`;
  };
  const cls = (cur, prev) => {
    if (prev == null) return 'neutral';
    if (cur > prev) return 'up';
    if (cur < prev) return 'down';
    return 'neutral';
  };
  // strengths 늘어남
  rows.push({
    label: '✨ 강점 발견',
    val: stats.strengthsTotal || 0,
    prev: prevQ?.strengthsTotal,
    direction: 'up'
  });
  // problems
  rows.push({
    label: '💧 문제 인식',
    val: stats.problemsTotal || 0,
    prev: prevQ?.problemsTotal,
    direction: 'down'
  });
  // growth 차원
  rows.push({
    label: '🌱 성장 차원',
    val: stats.growthCount || 0,
    prev: prevQ?.growthCount,
    direction: 'up'
  });
  // 모드 빈도 변화 (가장 큰 모드)
  const topMode = stats.modeCount ? Object.entries(stats.modeCount).sort((a,b) => b[1] - a[1])[0] : null;
  if (topMode) {
    const modeMap = { exam:'📚 시험', travel:'✈️ 여행', sick:'🤒 아픔', rest:'🏖 휴식', period:'🩸 월경', drained:'🪫 방전' };
    rows.push({
      label: modeMap[topMode[0]] || topMode[0],
      val: topMode[1] + '일',
      prev: prevQ?.modeCount?.[topMode[0]] != null ? prevQ.modeCount[topMode[0]] : null,
      direction: 'neutral',
      raw: topMode[1]
    });
  }
  // V4-fix v3 (사용자 요청 — 더 설명적, 친절한 톤): 한 줄 통찰
  const insight = (() => {
    const sP = stats.strengthsTotal || 0;
    const pP = stats.problemsTotal || 0;
    const gP = stats.growthCount || 0;
    if (gP >= 2 && sP > pP) return '강점도 새로 보였고, 성장 축도 여러 개 움직였어. 네 모양이 더 또렷해진 분기야.';
    if (gP >= 2) return `성장 축이 ${gP}개나 움직였어. 멈춰있던 게 아니야 — 이 자체가 큰 의미야.`;
    if (sP > pP) return '강점이 문제보다 더 많이 보였어. 네 안에 단단한 게 있어.';
    if (pP > sP) return '문제가 더 또렷이 보인 분기야. 그게 보이는 것 자체가 첫 단계니까, 부담 가지지 마.';
    return '큰 흔들림 없이 균형 잡힌 분기였어. 머무는 시간도 너에게 필요한 시간이야.';
  })();
  return `
    <div class="stories-label">네 변화</div>
    <div class="stories-title">이 분기 네 안에서 일어난 변화</div>
    <div class="stories-stat-list">
      ${rows.map(r => `
        <div class="stories-stat-row ${cls(r.raw != null ? r.raw : r.val, r.prev)}">
          <span class="stories-stat-label">${r.label}</span>
          <span class="stories-stat-value">${r.val}${trend(r.raw != null ? r.raw : r.val, r.prev)}</span>
        </div>
      `).join('')}
    </div>
    <div class="stories-body" style="margin-top:14px;">${escapeHtml(insight)}</div>
  `;
}

