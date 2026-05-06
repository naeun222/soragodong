// 사용자 명시 2026-05-02 ultrathink: 옛 _callOpusForAnnualNarrative 폐기 — _buildAnnualReviewPrompt + generateAnnualReview 안 callAnthropic 으로 이전. batch path 도 동일 builder 재사용.

// 결정적 helpers
function _computeAnnualStatsArray({entries, pearls, archive, decisions}) {
  const dnaEmbodied = (state.pearls || []).filter(p => p.type === 'dna_pearl' && p.embodimentStatus === 'embodied').length;
  const chatTotal = entries.reduce((s, e) => s + (e.chatCount || 0), 0);
  const strategies = (state.topicCards || []).filter(t => t.category === 'strategy');
  const attempts = strategies.flatMap(s => s.attempts || []);
  const worked = attempts.filter(a => Array.isArray(a) ? a[0] === 'worked' : a.status === 'worked').length;
  const successRate = attempts.length > 0 ? Math.round((worked / attempts.length) * 100) + '%' : '-';
  return [
    { emoji: '📔', num: entries.length, label: '일기' },
    { emoji: '💬', num: chatTotal || 0, label: '대화' },
    { emoji: '🎯', num: successRate, label: '성공률' },
    { emoji: '✨', num: archive.length, label: '깨달음' },
    { emoji: '🧬', num: dnaEmbodied, label: '체화' },
    { emoji: '🐚', num: decisions.length, label: '큰 결정' }
  ];
}

function _computeAnnualTree() {
  const dna = (state.pearls || []).filter(p => p.type === 'dna_pearl');
  const fmt = (p) => ({ name: p.content || p.title || '', emoji: p.emoji || '⚡' });
  return {
    embodied: dna.filter(p => p.embodimentStatus === 'embodied').slice(0, 4).map(fmt),
    growing:  dna.filter(p => p.embodimentStatus === 'growing' || p.embodimentStatus === 'rooting').slice(0, 4).map(fmt),
    trying:   dna.filter(p => !p.embodimentStatus || p.embodimentStatus === 'trying').slice(0, 3).map(fmt),
    caption: '이제 이 정도는 너 혼자서도 해낼 수 있어 🫂'
  };
}

function _computeAnnualMoments(pearls) {
  const memorable = pearls.filter(p => p.note || p.photo || p.video).slice(0, 3);
  const bgs = [
    'linear-gradient(135deg, rgba(212,167,106,0.45), rgba(139,126,196,0.30))',
    'linear-gradient(135deg, rgba(126,200,180,0.45), rgba(98,165,200,0.30))',
    'linear-gradient(135deg, rgba(255,215,122,0.40), rgba(180,130,90,0.30))'
  ];
  const emojiMap = { 음악: '🎵', 음식: '🍴', 장소: '📍', 순간: '✨', 사람: '👥' };
  return memorable.map((p, i) => ({
    date: (p.createdAt || '').slice(0, 10).replace(/-/g, '.'),
    text: p.content || '',
    emoji: emojiMap[p.category] || '🐚',
    bg: bgs[i] || bgs[0]
  }));
}

function _computeAnnualSongs(pearls) {
  const music = pearls.filter(p => p.category === '음악' && p.track && p.track.previewUrl);
  if (music.length === 0) return {};
  const songs = {};
  for (let i = 1; i <= 10; i++) {
    if (i === 1 || i === 10) songs[`card${i}`] = music[0].track;
    else songs[`card${i}`] = music[(i - 1) % music.length].track;
  }
  return songs;
}

function _computeAnnualRealizations(archive) {
  const count = { scrap: 0, memo: 0, reflection: 0 };
  archive.forEach(a => { count[a.type || 'scrap'] = (count[a.type || 'scrap'] || 0) + 1; });
  const tagFreq = {};
  archive.forEach(a => (a.tags || []).forEach(t => { tagFreq[t] = (tagFreq[t] || 0) + 1; }));
  return {
    count,
    topTags: Object.entries(tagFreq).sort((a,b) => b[1] - a[1]).slice(0, 4).map(t => t[0])
  };
}

function _annualReviewBuildCard1(d) {
  return `
    <div class="ann-rv-card ann-rv-card-1">
      <div class="ann-rv-year">${escapeHtml(d.yearRange)}</div>
      <div class="ann-rv-oneword">${escapeHtml(d.oneWord)}</div>
      <div class="ann-rv-persona-wrap">
        <div class="ann-rv-persona">
          <div>너는</div>
          <div><em>${escapeHtml(d.persona)}</em></div>
          <div>이야.</div>
        </div>
        ${d.personaReason ? `<div class="ann-rv-persona-reason">${escapeHtml(d.personaReason)}</div>` : ''}
      </div>
      <div class="ann-rv-stats">
        ${d.stats.map(s => `
          <div class="ann-rv-stat">
            <div class="ann-rv-stat-emoji">${s.emoji}</div>
            <div class="ann-rv-stat-num">${escapeHtml(String(s.num))}</div>
            <div class="ann-rv-stat-label">${escapeHtml(s.label)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// 카드 2: 한 해 흐름 — 사용자 명시 2026-04-30: 숫자 X / 365 dot grid (Github contribution 풍 + 변곡점 ★)
function _annualReviewBuildCard2(d) {
  // 시드 페르소나 1년 활력 등급 (가짜) — 봄 stuck → 여름 발견 → 가을 시도 → 겨울 변곡
  const days = [];
  const total = 53 * 7; // 371 cells (column-major fill)
  // seed 기반 deterministic — 매번 같은 결과
  let seed = 42;
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let i = 0; i < total; i++) {
    let level;
    if (i < 60)        level = Math.floor(rand() * 2);          // 봄 (5-6월) 0-1
    else if (i < 150)  level = Math.floor(rand() * 3);          // 여름 (7-8월) 0-2
    else if (i < 220)  level = 1 + Math.floor(rand() * 2);      // 가을 (9-10월) 1-2
    else if (i < 280)  level = 2 + Math.floor(rand() * 2);      // 초겨울 (11-12월) 2-3
    else               level = 2 + Math.floor(rand() * 3);      // 겨울 → 봄 (1-4월) 2-4
    days.push({ level: Math.min(4, level) });
  }
  // 변곡점 ★ — 12월 7일 부근 (idx 약 220)
  if (days[220]) days[220] = { level: 4, star: true };
  // 사용자 명시 2026-04-30: 컬럼(주 단위)별 활기 → 아래에서 위로 정렬 (low at top, high at bottom)
  const sortedDays = [];
  for (let col = 0; col < 53; col++) {
    const week = days.slice(col * 7, col * 7 + 7);
    week.sort((a, b) => (a.level || 0) - (b.level || 0));
    sortedDays.push(...week);
  }
  const cells = sortedDays.map(day => {
    if (day.star) return '<div class="ann-rv-yearmap-day ann-rv-yearmap-day-star" title="12/7 변곡점"></div>';
    return `<div class="ann-rv-yearmap-day ann-rv-yearmap-day-${day.level}"></div>`;
  }).join('');
  return `
    <div class="ann-rv-card ann-rv-card-2">
      <div class="ann-rv-label">한 해의 흐름</div>
      <div class="ann-rv-yearmap-months">
        <span>5</span><span>6</span><span>7</span><span>8</span>
        <span>9</span><span>10</span><span>11</span><span>12</span>
        <span>1</span><span>2</span><span>3</span><span>4</span>
      </div>
      <div class="ann-rv-yearmap">${cells}</div>
      <div class="ann-rv-yearmap-legend">
        조용
        <span class="ann-rv-yearmap-legend-dot"></span>
        <span class="ann-rv-yearmap-legend-dot ann-rv-yearmap-day-1"></span>
        <span class="ann-rv-yearmap-legend-dot ann-rv-yearmap-day-2"></span>
        <span class="ann-rv-yearmap-legend-dot ann-rv-yearmap-day-3"></span>
        <span class="ann-rv-yearmap-legend-dot ann-rv-yearmap-day-4"></span>
        활기
      </div>
      ${d.persona_evolution && (d.persona_evolution.start || d.persona_evolution.end) ? `
        <div style="margin:14px auto 6px; padding:14px 16px; background:rgba(168,156,214,0.08); border:1px solid rgba(168,156,214,0.22); border-radius:14px; max-width:340px;">
          <div style="display:flex; align-items:stretch; gap:12px;">
            <div style="flex:1; min-width:0;">
              <div style="font-size:9.5px; color:rgba(168,156,214,0.85); letter-spacing:0.14em; text-transform:uppercase; margin-bottom:5px;">1-2월의 너</div>
              <div style="font-family:'Gowun Batang',serif; font-size:12.5px; color:rgba(255,255,255,0.78); line-height:1.55;">${escapeHtml(d.persona_evolution.start || '')}</div>
            </div>
            <div style="display:flex; align-items:center; color:rgba(212,167,106,0.7); font-size:18px;">→</div>
            <div style="flex:1; min-width:0;">
              <div style="font-size:9.5px; color:rgba(212,167,106,0.95); letter-spacing:0.14em; text-transform:uppercase; margin-bottom:5px;">11-12월의 너</div>
              <div style="font-family:'Gowun Batang',serif; font-size:13px; color:white; line-height:1.55;">${escapeHtml(d.persona_evolution.end || '')}</div>
            </div>
          </div>
        </div>
      ` : ''}
      <div class="ann-rv-caption">★ <strong>12월 7일</strong>이 네 변곡점이었어</div>
    </div>
  `;
}

