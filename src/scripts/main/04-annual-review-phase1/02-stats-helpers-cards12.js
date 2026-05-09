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

// 사용자 명시 2026-05-09 ultrathink: moments_card 의미 정렬 — starred / photo+note / 시간 분포 균등.
// 옛: filter().slice(0, 3) — 처음 3개만, 의미 정렬 X. 매년 같은 분기 3개일 위험.
function _computeAnnualMoments(pearls) {
  const candidates = (pearls || []).filter(p => p && (p.note || p.photo || p.video));
  if (candidates.length === 0) return [];
  // 점수: starred > photo+note > photo > note > video
  candidates.forEach(p => {
    let score = 0;
    if (p.starred) score += 10;
    if (p.user_marked) score += 5;
    if (p.photo && p.note) score += 3;
    else if (p.photo) score += 2;
    else if (p.note) score += 1;
    if (p.video) score += 2;
    if (p.note && String(p.note).length > 30) score += 1;
    p._score = score;
  });
  candidates.sort((a, b) => (b._score || 0) - (a._score || 0));
  // 시간 분포 균등 — 분기별 1개씩
  const top = candidates.slice(0, 8);
  const byQuarter = [[], [], [], []];
  top.forEach(p => {
    const m = new Date(p.createdAt || 0).getMonth();
    const q = Math.floor(m / 3);
    if (byQuarter[q]) byQuarter[q].push(p);
  });
  const selected = [];
  for (let q = 0; q < 4 && selected.length < 3; q++) {
    if (byQuarter[q].length > 0) selected.push(byQuarter[q][0]);
  }
  // 부족하면 top 에서 추가
  for (const p of top) {
    if (selected.length >= 3) break;
    if (!selected.includes(p)) selected.push(p);
  }
  const memorable = selected.slice(0, 3);
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
    bg: bgs[i] || bgs[0],
    photo: p.photo || null
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

// 사용자 명시 2026-05-09 ultrathink: 365 dot grid 실제 데이터 매핑.
// 옛 deterministic seed (seed=42, hardcoded 12/7 변곡점) 제거 — 매년 같은 패턴이라 사용자 신뢰 깰 위험.
// entries (mood/vitality/chatCount/photo) + pearls + archive 활동 → cells.level 0-4.
// 변곡점 = 14일 chunk mood 평균의 가장 큰 변화 자리 (delta ≥ 0.5 만). caption 자동.
function _computeAnnualDotmap(targetYear, entries, pearls, archive) {
  const yearStart = new Date(targetYear, 0, 1);
  const yearEnd = new Date(targetYear + 1, 0, 1);
  const totalDays = Math.round((yearEnd - yearStart) / 86400000);

  const cells = [];
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(yearStart);
    d.setDate(d.getDate() + i);
    cells.push({
      date: d.toISOString().split('T')[0],
      level: 0, mood: null, vitality: null, activity: 0
    });
  }

  const cellByDate = {};
  cells.forEach(c => { cellByDate[c.date] = c; });

  (entries || []).forEach(e => {
    if (!e || !e.date) return;
    const c = cellByDate[e.date];
    if (!c) return;
    c.activity += 1;
    if (Number.isFinite(Number(e.mood))) c.mood = Number(e.mood);
    if (Number.isFinite(Number(e.vitality))) c.vitality = Number(e.vitality);
    if (e.chatCount) c.activity += Math.min(2, Number(e.chatCount) * 0.3);
    if (e.photo || e.video) c.activity += 0.5;
    if (e.note && String(e.note).length > 50) c.activity += 0.3;
  });

  (pearls || []).forEach(p => {
    if (!p || !p.createdAt) return;
    const c = cellByDate[String(p.createdAt).slice(0, 10)];
    if (c) c.activity += 0.5;
  });
  (archive || []).forEach(a => {
    if (!a || a._deleted) return;
    const c = cellByDate[String(a.savedAt || a.createdAt || '').slice(0, 10)];
    if (c) c.activity += 0.3;
  });

  cells.forEach(c => {
    if (c.activity === 0) { c.level = 0; return; }
    let level = 1;
    const moodVit = [c.mood, c.vitality].filter(v => Number.isFinite(v));
    if (moodVit.length > 0) {
      const avg = moodVit.reduce((s, v) => s + v, 0) / moodVit.length;
      if (avg >= 3.5) level += 1;
      if (avg >= 4.5) level += 1;
    }
    if (c.activity >= 2.5) level += 1;
    c.level = Math.min(4, level);
  });

  const chunkSize = 14;
  const chunks = [];
  for (let i = 0; i < cells.length; i += chunkSize) {
    const chunk = cells.slice(i, i + chunkSize);
    const moods = chunk.map(c => c.mood).filter(v => Number.isFinite(v));
    chunks.push({ start: i, avgMood: moods.length > 0 ? moods.reduce((s, v) => s + v, 0) / moods.length : null });
  }

  let maxDelta = 0;
  let variationStartIdx = -1;
  for (let i = 1; i < chunks.length; i++) {
    if (chunks[i].avgMood == null || chunks[i - 1].avgMood == null) continue;
    const delta = Math.abs(chunks[i].avgMood - chunks[i - 1].avgMood);
    if (delta > maxDelta && delta >= 0.5) {
      maxDelta = delta;
      variationStartIdx = chunks[i].start;
    }
  }

  let variationDate = null;
  let variationCaption = '';
  if (variationStartIdx >= 0 && cells[variationStartIdx]) {
    variationDate = cells[variationStartIdx].date;
    cells[variationStartIdx].isStar = true;
    cells[variationStartIdx].level = 4;
    const dt = new Date(variationDate + 'T12:00:00');
    variationCaption = `★ ${dt.getMonth() + 1}월 ${dt.getDate()}일 무렵이 변곡점이었어`;
  }

  const totalCells = 53 * 7;
  while (cells.length < totalCells) cells.push({ level: 0, filler: true });

  return { cells, variationDate, variationCaption };
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
// 사용자 명시 2026-05-09 ultrathink: dotmap (실데이터) 우선. 옛 review (dotmap X) / 시드 = 옛 deterministic fallback.
function _annualReviewBuildCard2(d) {
  let cells, variationCaption;
  if (d && d.dotmap && Array.isArray(d.dotmap.cells) && d.dotmap.cells.length >= 53 * 7) {
    cells = d.dotmap.cells.map(c => ({ level: c.level || 0, isStar: !!c.isStar }));
    variationCaption = d.dotmap.variationCaption || '';
  } else {
    // 시드 / 옛 review fallback — deterministic (시각 검증 의도)
    cells = [];
    const total = 53 * 7;
    let seed = 42;
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < total; i++) {
      let level;
      if (i < 60)        level = Math.floor(rand() * 2);
      else if (i < 150)  level = Math.floor(rand() * 3);
      else if (i < 220)  level = 1 + Math.floor(rand() * 2);
      else if (i < 280)  level = 2 + Math.floor(rand() * 2);
      else               level = 2 + Math.floor(rand() * 3);
      cells.push({ level: Math.min(4, level) });
    }
    if (cells[220]) cells[220] = { level: 4, isStar: true };
    variationCaption = '★ 12월 7일 무렵이 변곡점이었어';
  }
  // 컬럼별 sort (low → high) — ★ 는 마지막 (가장 활기 자리) 보존
  const sortedDays = [];
  for (let col = 0; col < 53; col++) {
    const week = cells.slice(col * 7, col * 7 + 7);
    if (week.length === 0) continue;
    const star = week.find(c => c.isStar);
    const sortable = star ? week.filter(c => !c.isStar) : week.slice();
    sortable.sort((a, b) => (a.level || 0) - (b.level || 0));
    if (star) sortable.push(star);
    sortedDays.push(...sortable);
  }
  const cellsHtml = sortedDays.map(day => {
    if (day.isStar) return '<div class="ann-rv-yearmap-day ann-rv-yearmap-day-star" title="변곡점"></div>';
    return `<div class="ann-rv-yearmap-day ann-rv-yearmap-day-${day.level || 0}"></div>`;
  }).join('');
  return `
    <div class="ann-rv-card ann-rv-card-2">
      <div class="ann-rv-label">한 해의 흐름</div>
      <div class="ann-rv-yearmap-months">
        <span>1</span><span>2</span><span>3</span><span>4</span>
        <span>5</span><span>6</span><span>7</span><span>8</span>
        <span>9</span><span>10</span><span>11</span><span>12</span>
      </div>
      <div class="ann-rv-yearmap">${cellsHtml}</div>
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
      ${variationCaption ? `<div class="ann-rv-caption">${escapeHtml(variationCaption)}</div>` : ''}
    </div>
  `;
}

