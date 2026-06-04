// V4-fix v3 (사용자 요청): 깨달음 정리 슬라이드 — 분기/연간/주간/월간 공통
function _buildArchiveSummarySlideHTML(inRange) {
  const arrs = (state.archive || []).filter(a => a.savedAt && inRange(a.savedAt));
  if (arrs.length === 0) {
    return `
      <div class="stories-label">네 깨달음</div>
      <div class="stories-title">이 분기 깨달음 카드 없음</div>
      <div class="stories-body">+ 메뉴의 ✦ 깨달음으로, 또는 ✎ 메모로 직접. 다음 분기엔 작은 한 줄도 OK.</div>
    `;
  }
  // type 분포
  const typeCount = { scrap: 0, memo: 0, reflection: 0 };
  arrs.forEach(a => { typeCount[a.type || 'scrap'] = (typeCount[a.type || 'scrap'] || 0) + 1; });
  // 태그 빈도
  const tagFreq = {};
  arrs.forEach(a => (a.tags || []).forEach(t => { tagFreq[t] = (tagFreq[t] || 0) + 1; }));
  const topTags = Object.entries(tagFreq).sort((a,b) => b[1] - a[1]).slice(0, 4).map(t => t[0]);
  // 헤드라인 top 5 (최신 또는 풍부한 헤드라인)
  const topHeadlines = arrs.filter(a => a.headline).slice(0, 5);

  return `
    <div class="stories-label">네 깨달음</div>
    <div class="stories-title">${arrs.length}개의 통찰이 자라났어</div>
    <div class="stories-body" style="margin-bottom:12px;">📌 스크랩 ${typeCount.scrap || 0} · ✎ 메모 ${typeCount.memo || 0}${typeCount.reflection ? ` · 🌊 숙고 ${typeCount.reflection}` : ''}</div>
    ${topTags.length > 0 ? `<div style="font-size:11px; color:rgba(255,255,255,0.55); margin-bottom:14px; letter-spacing:0.04em;">자주 떠올린: ${topTags.map(t => '#' + escapeHtml(t)).join(' · ')}</div>` : ''}
    ${topHeadlines.length > 0 ? `<div class="stories-archive-list">
      ${topHeadlines.map(a => `<div class="stories-archive-item">✦ ${escapeHtml(a.headline)}</div>`).join('')}
    </div>` : ''}
    <div class="stories-body" style="margin-top:14px; font-size:12px;">네 안에서 자라난 통찰들. 다음 분기에도 이어질 거야.</div>
  `;
}

function _buildClosingSlideHTML(review, stats) {
  // sections에서 흐름 또는 첫 번째 section을 시적으로
  const flow = Array.isArray(review.sections) && review.sections[0] ? review.sections[0].body : '';
  const poem = flow ? flow.split(/[.\n]/)[0].slice(0, 28) : `${review.quarterKey || '분기'} — 네 흔적`;
  // 사용자 요청 2026-04-28: 미적 — emoji 화환 + 큰 gradient + 시구 카드 + 흐릿한 별 효과
  return `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:22px; padding:36px 22px; max-width:320px; position:relative;">
      <!-- 배경 별 -->
      <div style="position:absolute; top:18px; left:14px; font-size:14px; opacity:0.35;">✦</div>
      <div style="position:absolute; top:64px; right:22px; font-size:11px; opacity:0.30;">·</div>
      <div style="position:absolute; bottom:36px; left:24px; font-size:13px; opacity:0.32;">✧</div>
      <div style="position:absolute; bottom:80px; right:18px; font-size:10px; opacity:0.28;">·</div>

      <!-- 메인 emoji + 광원 -->
      <div style="position:relative; display:flex; align-items:center; justify-content:center;">
        <div style="position:absolute; width:100px; height:100px; background:radial-gradient(circle, rgba(212,167,106,0.30) 0%, transparent 70%); border-radius:50%;"></div>
        <div style="font-size:60px; line-height:1; position:relative; filter: drop-shadow(0 0 14px rgba(212,167,106,0.5));">🐚</div>
      </div>

      <!-- 라벨 + 가는 구분선 -->
      <div style="display:flex; align-items:center; gap:10px;">
        <div style="width:24px; height:1px; background:rgba(212,167,106,0.5);"></div>
        <div class="stories-label" style="text-align:center; margin:0;">${escapeHtml(review.quarterKey || '')}</div>
        <div style="width:24px; height:1px; background:rgba(212,167,106,0.5);"></div>
      </div>

      <!-- 시구 카드 -->
      <div style="background:linear-gradient(135deg, rgba(212,167,106,0.25), rgba(168,157,200,0.20), rgba(143,200,143,0.18)); border:1px solid rgba(212,167,106,0.45); border-radius:20px; padding:26px 22px; text-align:center; box-shadow:0 4px 24px rgba(212,167,106,0.18);">
        <div class="stories-poem" style="font-size:19px; line-height:1.7; color:white; font-family:'Gowun Batang', serif; font-weight:500;">${escapeHtml(poem)}</div>
      </div>

      <!-- 마무리 인사 -->
      <div style="font-size:13px; color:rgba(255,255,255,0.78); text-align:center; line-height:1.8; letter-spacing:0.02em;">
        한 페이지가 끝났어.<br>
        <span style="color:rgba(212,167,106,0.95); font-weight:500;">다음 페이지도 같이 ✦</span>
      </div>
    </div>
  `;
}

