// ═══════════════════════════════════════════════════════════════
// 사용자 명시 2026-04-30 ultrathink: 연간 리뷰 실제 생성 (Phase 1 — Opus narrative + 결정적 helpers).
// ═══════════════════════════════════════════════════════════════
// 사용자 명시 2026-05-02 ultrathink: 연간 리뷰 batch path 재사용 위해 분리.
// _collectAnnualData → _buildAnnualReviewPrompt → callAnthropic / batch → _processAnnualReviewResult.
function _collectAnnualData(year) {
  const targetYear = year || (new Date().getFullYear() - 1);
  const yearStart = new Date(targetYear, 0, 1).getTime();
  const yearEnd = new Date(targetYear + 1, 0, 1).getTime();
  const inYear = (iso) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= yearStart && t < yearEnd;
  };
  const entries = (state.entries || []).filter(e => e.date && inYear(e.date + 'T12:00:00'));
  const pearls = (state.pearls || []).filter(p => inYear(p.createdAt));
  const archive = (state.archive || []).filter(a => inYear(a.savedAt || a.createdAt));
  const decisions = (state.decisions || []).filter(d => inYear(d.completedAt || d.startedAt));
  const quarterlies = (state.quarterlyReviews || []).filter(r => r.quarterKey && r.quarterKey.startsWith(targetYear + '-'));
  const insights = (state.insights || []).filter(i => inYear(i.discoveredAt || i.createdAt));
  const chatArchive = (state.chatArchive || []).filter(c => inYear(c.generatedAt || (c.date ? c.date + 'T12:00:00' : null)));
  return { targetYear, entries, pearls, archive, decisions, quarterlies, insights, chatArchive };
}

function _buildAnnualReviewPrompt(year, data) {
  const _data = data || _collectAnnualData(year);
  const { targetYear, entries, pearls, archive, decisions, quarterlies, insights, chatArchive } = _data;
  // 사용자 명시 2026-04-30 ultrathink: entries < 10 = 데이터 부족 → null return → caller skip.
  if (entries.length < 10) return null;
  const ctx = {
    year: targetYear, entries, pearls, archive, decisions, quarterlies, insights, chatArchive,
    stats: { entryCount: entries.length, pearlCount: pearls.length, archiveCount: archive.length, decisionCount: decisions.length }
  };
  const prompt = `${ctx.year}년 연간 리뷰 narrative 작성.

[목표]
1년 데이터 → 정체성 변화 / 핵심 finding 2개 / 가장 깊은 숙고 / 가장 현명한 깨달음 발견.
분기 리뷰 4개 종합 후 '한 해 = 한 단락' narrative.

[데이터 요약]
- 일기 ${ctx.stats.entryCount}개 / 깨달음 ${ctx.stats.archiveCount}개 / 진주 ${ctx.stats.pearlCount}개 / 큰 결정 ${ctx.stats.decisionCount}개

[분기 리뷰 4개]
${ctx.quarterlies.map(q => '· ' + q.quarterKey + ': ' + (q.summary || '')).join('\n')}

[일기 발췌 (최근 30개)]
${ctx.entries.slice(-30).map(e => '[' + e.date + '] ' + (e.text || '').slice(0, 150)).join('\n').slice(0, 4000)}

[깨달음 카드 top 20]
${ctx.archive.slice(0, 20).map(a => '· ' + (a.headline || (a.body || '').slice(0, 80))).join('\n').slice(0, 2000)}

[큰 결정 ${ctx.decisions.length}개]
${ctx.decisions.map(d => '· ' + (d.title || '') + ': ' + (d.conclusion || '')).join('\n').slice(0, 1000)}

[톤]
관찰 친화. 너 = 사용자. 칭찬 inflation X. 사실 관찰 ○. 친구 톤 (반말 OK). "적용하다" 동사 금지 (자연 동사로).

[출력 — JSON 만, 마크다운 X]
{
  "oneWord": "한 단어 (예: 전환, 회복, 시작)",
  "persona": "한 줄 페르소나 ('OOO한 사람' 형식)",
  "personaReason": "구체적 데이터 한 줄 (수치/날짜)",
  "finding1": {
    "label": "발견 라벨 (15자 이내)",
    "quote": "사용자 인용 (10-15자)",
    "dataNum": "+30% 또는 비슷한 수치",
    "dataText": "구체 데이터 (2줄, \\n)",
    "conclusion": "결론 (2줄, <span> 핵심 강조 가능)"
  },
  "finding2": {
    "label": "또 하나",
    "friendLow": "낮은 수",
    "friendLowLabel": "낮은 라벨",
    "friendHigh": "높은 수",
    "friendHighLabel": "높은 라벨",
    "conclusion": "결론 (<span> 강조)"
  },
  "deep": {
    "question": "올해 가장 깊었던 질문 — 사용자가 마법고동 (14일 숙성) 으로 실제로 다룬 결정 중 가장 본질적인 것. 인용 형식 (\\\"...\\\"). 1줄 또는 2줄 (\\n 사용). 한국 사용자 일상 어휘 (예: '내가 원하는 건 / 적성인지 워라밸인지?', '이 관계 노력으로 풀릴까 / 그냥 멀어지는 게 맞을까?'). 추상 reframe X 구체 결정 ○.",
    "conclusion": "14일 후 결론 — 인용 형식 (\\\"...\\\"). 실행 가능한 짧은 문장 (예: '적성 우선 — 회복 시간은 챙기면서', '3개월 더 보고, 그동안 사이드만 시도')",
    "date": "YYYY.MM.DD → YYYY.MM.DD · 14일"
  },
  "best_pearl": {
    "title": "올해 가장 현명한 한 마디 (8-20자) — 위 [깨달음 카드 top 20] 또는 [일기 발췌] 에서 사용자가 실제로 한 말 / 표현 그대로 인용 또는 그 어휘로 paraphrase. 추상 reframe X (예: '결함이 아니라 내 결' 같은 합성 X). 사용자 1인칭 발화 톤 유지 (예: '마감 임박 = 도파민 부스터', '수면 7h 미만 = 그 주 망함', '아침 운동 한 날 일기가 길어', '욕망 속 감각이 진짜 방향임').",
    "summary": "그 깨달음 요약 한 줄 — 사용자 본인 어휘. 추상 X 구체 ○",
    "whyThisYear": "왜 가장 현명한지 — 일상어로 친절히 풀어쓰기. 'Q3 카드 #5' / '3월 일기' 같은 약어·dev 용어 X. '한 해 동안 ~ 반복 등장' / '~ 시점부터 변화' 같은 자연 한국어. 구체적 (어디서 / 언제 / 어떻게 변했는지) + 사용자 친근 톤. 2-3 문장."
  },
  "oneLine": "한 해 마무리 — 따뜻한 토닥 톤 (분석 X). 친구가 어깨 토닥하며 하는 말. 한국어 자연 어순 + 띄어쓰기·문법 정확. 구조: 첫 줄 = 평가어 ('너 올해 많이 컸어' 류) → 빈 줄 → 변화 (자책에서 관찰로 / 회피에서 회복으로 류 — 2줄, 흐름 metaphor 'X에서 Y로') → 빈 줄 → 마무리 ('수고했어 🫂' 류 + 허그 emoji 🫂). \\n\\n 으로 빈 줄 표현. 예: '너 올해 많이 컸어.\\n\\n자책에서 관찰로,\\n회피에서 회복으로.\\n\\n수고했어 🫂'"
}

JSON만 출력.`;
  return {
    system: 'JSON 객체 하나만 반환. markdown code fence X. 모든 필수 필드 다 채워서 출력.',
    model: 'claude-opus-4-7',
    max_tokens: 4000,
    userMessage: prompt,
    _endpoint: 'review_annual'
  };
}

// 연간 리뷰 결과 처리 — narrative JSON + 결정적 helpers 조립 + state.annualReviews push.
// inline path / batch path 둘 다 호출 (narrative = JSON, data = _collectAnnualData 결과, isTester = optional).
function _processAnnualReviewResult(narrative, year, data, isTester) {
  const _data = data || _collectAnnualData(year);
  const { targetYear, entries, pearls, archive, decisions } = _data;
  const stats = _computeAnnualStatsArray({entries, pearls, archive, decisions});
  const tree = _computeAnnualTree();
  const moments_card = _computeAnnualMoments(pearls);
  const songs = _computeAnnualSongs(pearls);
  const realizations = _computeAnnualRealizations(archive);
  const beach = {
    diaryCount: entries.length, pearlCount: pearls.length,
    bestPearl: (narrative?.best_pearl?.title) || ''
  };
  const review = {
    id: 'ar_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    type: 'annual',
    year: targetYear,
    yearRange: `${targetYear} → ${targetYear + 1}`,
    completedAt: new Date().toISOString(),
    oneWord: narrative?.oneWord || '',
    persona: narrative?.persona || '',
    personaReason: narrative?.personaReason || '',
    stats,
    finding1: narrative?.finding1 || {},
    finding2: narrative?.finding2 || {},
    tree, beach, moments_card,
    best_pearl: narrative?.best_pearl || {},
    realizations,
    deep: narrative?.deep || {},
    oneLine: narrative?.oneLine || '',
    songs,
    auto: false
  };
  if (isTester) {
    review._mock = true;
    review._seed = Date.now();
  }
  state.annualReviews = state.annualReviews || [];
  state.annualReviews = state.annualReviews.filter(r => r.year !== targetYear);
  state.annualReviews.unshift(review);
  return review;
}

async function generateAnnualReview(year) {
  const targetYear = year || (new Date().getFullYear() - 1);
  const isTester = !!(state.preferences && state.preferences.testerMode);
  if (!isTester && !_canAI()) {
    showToast('연간 리뷰 생성 = 결제 정보 필요 (로그인 또는 API 키)');
    return null;
  }
  showToast(isTester ? '🧪 테스터 모드 — mock 리뷰 생성 (Opus 호출 X)' : '🐚 연간 리뷰 생성 중... (1-2분 소요)');
  const data = _collectAnnualData(targetYear);
  if (!isTester && data.entries.length < 10) {
    showToast(`${targetYear}년 일기 부족 (${data.entries.length}개) — 충분한 데이터 쌓인 후 재시도.`);
    return null;
  }
  let narrative = null;
  if (isTester) {
    const seed = _buildAnnualReviewSeedData(targetYear);
    narrative = {
      oneWord: seed.oneWord, persona: seed.persona, personaReason: seed.personaReason,
      finding1: seed.finding1, finding2: seed.finding2, deep: seed.deep,
      best_pearl: seed.best_pearl, oneLine: seed.oneLine
    };
  } else {
    const promptSpec = _buildAnnualReviewPrompt(targetYear, data);
    if (!promptSpec) {
      showToast(`${targetYear}년 데이터 부족 — 충분한 데이터 쌓인 후 재시도.`);
      return null;
    }
    try {
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
      narrative = _robustJsonExtract(text);
    } catch (e) {
      console.error('[generateAnnualReview]', e);
      showToast('연간 리뷰 생성 실패: ' + e.message);
      return null;
    }
    if (!narrative) return null;
  }
  const review = _processAnnualReviewResult(narrative, targetYear, data, isTester);
  if (typeof saveToCloudNow === 'function') await saveToCloudNow(); else saveState();
  showToast(isTester
    ? `🧪 ${targetYear}년 mock 리뷰 완료 (시드 narrative + 실제 helper). 미리보기에서 확인.`
    : `🐚 ${targetYear}년 연간 리뷰 완료. 미리보기에서 확인.`);
  return review;
}

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
      <div class="ann-rv-caption">★ <strong>12월 7일</strong>이 네 변곡점이었어</div>
    </div>
  `;
}

// 카드 3: 발견 #1 (AI 포착) — 다음 phase: Opus 4.7 prompt
// 사용자 명시 2026-04-30: button 제거 (진주 담기 / 갸우뚱)
function _annualReviewBuildCard3(d) {
  const f = d.finding1 || {};
  return `
    <div class="ann-rv-card ann-rv-card-finding">
      <div class="ann-rv-label">${escapeHtml(f.label || '발견')}</div>
      <div class="ann-rv-finding-quote-block">${escapeHtml(f.quote || '')}</div>
      <div class="ann-rv-finding-vs-arrow">↓</div>
      <div class="ann-rv-finding-data-block">
        <div class="ann-rv-finding-data-num">${escapeHtml(f.dataNum || '')}</div>
        <div class="ann-rv-finding-data-text">${escapeHtml(f.dataText || '').replace(/\n/g, '<br>')}</div>
      </div>
      <div class="ann-rv-finding-conclusion">${(f.conclusion || '').replace(/\n/g, '<br>')}</div>
    </div>
  `;
}

// 카드 4: 발견 #2 (자기 친구) — 다음 phase: Opus 4.7 prompt
// 사용자 명시 2026-04-30: button 제거 + 결론 워딩 자연화
function _annualReviewBuildCard4(d) {
  const f = d.finding2 || {};
  return `
    <div class="ann-rv-card ann-rv-card-finding">
      <div class="ann-rv-label">${escapeHtml(f.label || '발견')}</div>
      <div class="ann-rv-friend-vs">
        <div class="ann-rv-friend-side">
          <div class="ann-rv-friend-num ann-rv-friend-num-low">${escapeHtml(f.friendLow || '')}</div>
          <div class="ann-rv-friend-label">${escapeHtml(f.friendLowLabel || '')}</div>
        </div>
        <div class="ann-rv-friend-vs-divider">vs</div>
        <div class="ann-rv-friend-side">
          <div class="ann-rv-friend-num ann-rv-friend-num-high">${escapeHtml(f.friendHigh || '')}</div>
          <div class="ann-rv-friend-label">${escapeHtml(f.friendHighLabel || '')}</div>
        </div>
      </div>
      <div class="ann-rv-finding-conclusion">${(f.conclusion || '').replace(/\n/g, '<br>')}</div>
    </div>
  `;
}

// 카드 5: 무기 DNA tree — 사용자 명시 2026-04-30: best 자리 = 캡션 ("이제 네 힘으로 이만큼이나 해결할 수 있어")
function _annualReviewBuildCard5(d) {
  const t = d.tree || {};
  const layer = (items, embodied) => `
    <div class="ann-rv-tree-layer">
      ${(items || []).map(it => `
        <div class="ann-rv-tree-leaf">
          <span class="ann-rv-tree-emoji${embodied ? ' ann-rv-tree-emoji-embodied' : ''}">${it.emoji}</span>
          <span class="ann-rv-tree-name">${escapeHtml(it.name)}</span>
        </div>
      `).join('')}
    </div>
  `;
  return `
    <div class="ann-rv-card ann-rv-card-5">
      <div class="ann-rv-label">자라는 무기들</div>
      <div class="ann-rv-tree">
        <div class="ann-rv-tree-tier">✨ 체화</div>
        ${layer(t.embodied, true)}
        <div class="ann-rv-tree-tier">🌳 성장 중</div>
        ${layer(t.growing, false)}
        <div class="ann-rv-tree-tier">🌿 시도 중</div>
        ${layer(t.trying, false)}
      </div>
      <div class="ann-rv-tree-caption">${escapeHtml(t.caption || '')}</div>
    </div>
  `;
}

// 카드 6: 모래사장 — 사용자 명시 2026-04-30: 진짜 소라 X / 소라의 부름에서 획득한 아이템들 (SHELL_POOLS 다양 emoji).
function _annualReviewBuildCard6(d) {
  const b = d.beach || {};
  const dc = b.diaryCount || 0;
  // 시드 SHELL_POOLS 에서 다양 tier mix (light + daily + main + golden)
  const shellEmojis = ['🐚','🐌','🪸','🌀','🐠','🐢','🦀','🦦','🐬','🦑','🐉','🦚','🪻'];
  let icons;
  if (dc >= 13) {
    // 하트 outline 13개 (사용자 명시 2026-04-30)
    const heartCoords = [
      { top: 18, left: 26 }, { top: 10, left: 36 }, { top: 14, left: 44 },
      { top: 14, left: 56 }, { top: 10, left: 64 }, { top: 18, left: 74 },
      { top: 32, left: 18 }, { top: 32, left: 82 },
      { top: 48, left: 28 }, { top: 48, left: 72 },
      { top: 64, left: 38 }, { top: 64, left: 62 },
      { top: 80, left: 50 }
    ];
    icons = heartCoords.map((c, i) => ({ emoji: shellEmojis[i % shellEmojis.length], top: c.top, left: c.left, size: 24 }));
    // 가운데 legendary ✨ 진주 (가장 빛난 1개)
    icons.push({ emoji: '✨', top: 46, left: 50, size: 32, pearl: true });
  } else {
    icons = [
      { emoji: '🐚', top: 28, left: 14, size: 30 },
      { emoji: '✨', top: 62, left: 42, size: 38, pearl: true },
      { emoji: '🐠', top: 48, left: 75, size: 26 },
      { emoji: '✨', top: 18, left: 58, size: 28, pearl: true },
      { emoji: '🪸', top: 76, left: 22, size: 28 },
      { emoji: '✨', top: 8,  left: 32, size: 22, pearl: true },
      { emoji: '🐢', top: 56, left: 8,  size: 24 }
    ];
  }
  const iconsHtml = icons.map(ic => `
    <div class="ann-rv-beach-icon ${ic.pearl ? 'ann-rv-beach-icon-pearl' : ''}"
         style="top:${ic.top}%;left:${ic.left}%;font-size:${ic.size}px;">${ic.emoji}</div>
  `).join('');
  return `
    <div class="ann-rv-card ann-rv-card-6">
      <div class="ann-rv-label" style="color:rgba(255,248,232,0.85);">너의 모래사장</div>
      <div class="ann-rv-beach-icons">${iconsHtml}</div>
      <div class="ann-rv-beach-stats">
        <div class="ann-rv-beach-stat">
          <div class="ann-rv-beach-stat-num">${b.diaryCount || 0}</div>
          <div class="ann-rv-beach-stat-label">소라</div>
        </div>
        <div class="ann-rv-beach-stat">
          <div class="ann-rv-beach-stat-num">${b.pearlCount || 0}</div>
          <div class="ann-rv-beach-stat-label">진주</div>
        </div>
      </div>
      <div class="ann-rv-beach-pearl">
        <div class="ann-rv-beach-pearl-emoji">🐚</div>
        <div class="ann-rv-beach-pearl-quote">${escapeHtml(b.bestPearl || '')}</div>
        <div class="ann-rv-beach-pearl-label">가장 빛난 소라</div>
      </div>
    </div>
  `;
}

// 카드 7 (새): 잊지 못할 순간 — 사용자 명시 2026-04-30: '사진' 카드 grid 별 슬라이드
function _annualReviewBuildCardMoments(d) {
  const moments = d.moments_card || [];
  const cards = moments.map(m => {
    // 사용자 명시 2026-04-30 ultrathink: photo 필드 있으면 사진 background (gradient overlay 로 텍스트 가독성). 없으면 옛 emoji + bg gradient.
    const hasPhoto = !!m.photo;
    const cardStyle = hasPhoto
      ? `background-image: linear-gradient(180deg, transparent 35%, rgba(0,0,0,0.72) 100%), url('${escapeHtml(m.photo)}'); background-size: cover; background-position: center;`
      : `background:${m.bg || ''};`;
    return `
    <div class="ann-rv-moment-card" style="${cardStyle}">
      ${hasPhoto ? '' : `<div class="ann-rv-moment-bg">${m.emoji || '🌅'}</div>`}
      <div class="ann-rv-moment-content">
        <div class="ann-rv-moment-date">${escapeHtml(m.date)}</div>
        <div class="ann-rv-moment-text">${escapeHtml(m.text)}</div>
      </div>
    </div>
  `;
  }).join('');
  return `
    <div class="ann-rv-card ann-rv-card-moments">
      <div class="ann-rv-label">잊지 못할 순간</div>
      <div class="ann-rv-moments-list">${cards}</div>
    </div>
  `;
}

// 카드 8: 올해의 깨달음 (사용자 명시 2026-04-30 ultrathink: Stories 톤 — count + tags + 가장 현명한 한 마디)
function _annualReviewBuildCardPearl(d) {
  const p = d.best_pearl || {};
  const title = (typeof p === 'string') ? p : (p.title || '');
  const summary = (typeof p === 'object') ? (p.summary || '') : '';
  const why = (typeof p === 'object') ? (p.whyThisYear || '') : '';
  const r = d.realizations || {};
  const c = r.count || {};
  const tags = r.topTags || [];
  const total = (c.scrap || 0) + (c.memo || 0) + (c.reflection || 0);
  return `
    <div class="ann-rv-card ann-rv-card-pearl" style="text-align:center;">
      <div class="stories-label">네 깨달음</div>
      <div class="stories-title" style="margin-bottom:14px;">올해 가장 현명한 한 마디</div>
      ${total > 0 ? `<div class="stories-body" style="margin-bottom:8px; font-size:13px;">📌 스크랩 ${c.scrap || 0} · ✎ 메모 ${c.memo || 0}${c.reflection ? ` · 🌊 숙고 ${c.reflection}` : ''}</div>` : ''}
      ${tags.length > 0 ? `<div style="font-size:11px; color:rgba(255,255,255,0.55); margin-bottom:18px; letter-spacing:0.04em;">자주 떠올린: ${tags.map(t => '#' + escapeHtml(t)).join(' · ')}</div>` : ''}
      <div class="stories-archive-list" style="max-width:340px;">
        <div class="stories-archive-item" style="padding:14px 18px; line-height:1.55;">
          <div style="font-size:14.5px; font-weight:500;${summary ? ' margin-bottom:6px;' : ''}">✦ ${escapeHtml(title)}</div>
          ${summary ? `<div style="font-size:12.5px; color:rgba(255,255,255,0.72); line-height:1.6;">${escapeHtml(summary)}</div>` : ''}
        </div>
      </div>
      ${why ? `<div style="margin-top:18px; padding:12px 14px; background:rgba(255,250,205,0.06); border-left:2px solid rgba(255,250,205,0.30); border-radius:0 8px 8px 0; max-width:320px; text-align:left;">
        <div style="font-size:9.5px; color:rgba(255,250,205,0.75); letter-spacing:0.14em; text-transform:uppercase; margin-bottom:6px; font-weight:600;">🦉 Opus — 왜 가장 현명한지</div>
        <div style="font-size:11.5px; color:rgba(255,250,205,0.7); font-style:italic; line-height:1.6;">${escapeHtml(why)}</div>
      </div>` : ''}
      <div class="stories-body" style="margin-top:16px; font-size:12px; opacity:0.7;">네 안에서 자라난 ${total > 0 ? total + '개 ' : ''}통찰 중. 내년에도 이어질 거야.</div>
    </div>
  `;
}

// 카드 9: 가장 깊었던 숙고 — 사용자 명시: 질문 + 결론 둘 다 (예전 리뷰 형식)
function _annualReviewBuildCardDeep(d) {
  const dq = d.deep || {};
  return `
    <div class="ann-rv-card ann-rv-card-deep">
      <div class="ann-rv-deep-label">가장 깊었던 숙고</div>
      <div class="ann-rv-deep-question">${escapeHtml(dq.question || '').replace(/\n/g, '<br>')}</div>
      ${dq.conclusion ? `
        <div class="ann-rv-deep-divider">↓ 14일 후 ↓</div>
        <div class="ann-rv-deep-conclusion">${escapeHtml(dq.conclusion).replace(/\n/g, '<br>')}</div>
      ` : ''}
      <div class="ann-rv-deep-date">${escapeHtml(dq.date || '')}</div>
    </div>
  `;
}

// 카드 10 (마지막) — 사용자 명시 2026-04-30 ultrathink: 분기 closing 처럼 한 단락 한 마디 = 단일 시구
function _annualReviewBuildCard9(d) {
  const oneLine = d.oneLine || '한 해, 한 마디';
  return `
    <div class="ann-rv-card ann-rv-card-8">
      <!-- ambient 별 (4개) -->
      <div style="position:absolute; top:11%; left:10%; font-size:14px; opacity:0.35; pointer-events:none;">✦</div>
      <div style="position:absolute; top:18%; right:13%; font-size:11px; opacity:0.30; pointer-events:none;">·</div>
      <div style="position:absolute; bottom:26%; left:14%; font-size:13px; opacity:0.32; pointer-events:none;">✧</div>
      <div style="position:absolute; bottom:32%; right:11%; font-size:10px; opacity:0.28; pointer-events:none;">·</div>

      <div style="display:flex; flex-direction:column; align-items:center; max-width:340px; width:100%; box-sizing:border-box; gap:22px; position:relative;">
        <!-- godong icon + halo (사용자 명시 2026-05-01: 🐚 emoji → godongicon.png, drop-shadow X 배경 안 보이게) -->
        <div style="position:relative; display:flex; align-items:center; justify-content:center; height:80px;">
          <div style="position:absolute; width:110px; height:110px; background:radial-gradient(circle, rgba(212,167,106,0.32) 0%, transparent 70%); border-radius:50%; animation: ann-rv-final-halo 3s ease-in-out infinite alternate;"></div>
          <img src="/godongicon.png" alt="소라고동" style="width:64px; height:64px; object-fit:contain; position:relative; display:block;" decoding="async">
        </div>

        <!-- 라벨 + 양쪽 가는 선 -->
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:24px; height:1px; background:rgba(212,167,106,0.5);"></div>
          <div class="stories-label" style="margin:0;">${escapeHtml(d.yearRange || '한 해, 한 단락')}</div>
          <div style="width:24px; height:1px; background:rgba(212,167,106,0.5);"></div>
        </div>

        <!-- 시구 카드 — 한 단락 한 마디 (단일 시구) -->
        <div class="ann-rv-final-poem" style="position:relative; background:linear-gradient(135deg, rgba(212,167,106,0.25), rgba(168,157,200,0.20), rgba(143,200,143,0.18)); border:1px solid rgba(212,167,106,0.45); border-radius:20px; padding:30px 24px; box-shadow:0 4px 24px rgba(212,167,106,0.18); width:100%; box-sizing:border-box;">
          <div style="position:absolute; top:-2px; left:14px; font-size:42px; line-height:1; color:rgba(212,167,106,0.55); font-family:'Gowun Batang', serif; pointer-events:none;">"</div>
          <div style="position:absolute; bottom:-22px; right:14px; font-size:42px; line-height:1; color:rgba(212,167,106,0.55); font-family:'Gowun Batang', serif; pointer-events:none;">"</div>
          <div style="font-size:18px; line-height:1.85; color:white; font-family:'Gowun Batang', serif; font-weight:500; text-align:center; letter-spacing:0.01em;">
            ${escapeHtml(oneLine).replace(/\n/g, '<br>')}
          </div>
        </div>

        <!-- 마무리 인사 (분기 closing 톤) -->
        <div style="font-size:13px; color:rgba(255,255,255,0.78); text-align:center; line-height:1.85; letter-spacing:0.02em; margin-top:6px;">
          한 해가 끝났어.<br>
          <span style="color:rgba(212,167,106,0.95); font-weight:500;">다음 페이지도 같이 ✦</span>
        </div>
      </div>
    </div>
  `;
}

function _annualReviewRender() {
  let overlay = document.getElementById('annualReviewOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'annualReviewOverlay';
    overlay.className = 'ann-rv-overlay';
    document.body.appendChild(overlay);
  }
  const s = _annualReviewState;
  if (!s) return;
  const total = s.cards.length;
  const cardHtml = s.cards[s.currentIdx](s.data);
  const progressDots = Array.from({ length: total }, (_, i) =>
    `<span class="${i <= s.currentIdx ? 'active' : ''}"></span>`).join('');
  // 사용자 명시 2026-04-30: 하단 화살표 button 제거 (좌·우 tap + swipe + 키보드만으로 충분)
  // 슬라이드별 노래 (사용자 명시 2026-04-30: 자동 재생 + 반복 재생 + LP 회전 artwork)
  const songData = (s.data && s.data.songs) ? s.data.songs[`card${s.currentIdx + 1}`] : null;
  if (songData && songData.previewUrl) {
    // 사용자 보고 2026-05-01: 진주 미리듣기 (toggleMusicPreview 의 _currentMusicAudio) 와 중첩 차단 — 연간 리뷰 진입 시 강제 pause.
    if (typeof _currentMusicAudio !== 'undefined' && _currentMusicAudio) {
      try { _currentMusicAudio.pause(); } catch {}
      if (typeof _currentMusicBtn !== 'undefined' && _currentMusicBtn) {
        _currentMusicBtn.textContent = '▶';
        _currentMusicBtn.classList.remove('playing');
      }
      _currentMusicAudio = null;
      if (typeof _currentMusicBtn !== 'undefined') _currentMusicBtn = null;
    }
    if (!window._annAudio) {
      window._annAudio = new Audio();
      window._annAudio.volume = 0.5;
      window._annAudio.loop = true;  // 사용자 명시 2026-04-30: 끊기면 반복 재생
    }
    if (window._annAudio.src !== songData.previewUrl) {
      window._annAudio.src = songData.previewUrl;
      window._annAudio.loop = true;
      window._annAudio.play().catch(e => console.warn('[ann-rv] autoplay blocked:', e));
    }
  } else if (window._annAudio) {
    try { window._annAudio.pause(); } catch {}
  }
  const isPlaying = (window._annAudio && !window._annAudio.paused);
  const playState = isPlaying ? '⏸' : '▶';
  const playingClass = isPlaying ? ' playing' : '';
  // 사용자 명시 2026-04-30: CD 만 (artwork) — 제목·아티스트·button 제거. CD click → toggle play/pause.
  const songHtml = songData ? `
    <div class="ann-rv-song${playingClass}">
      <img class="ann-rv-song-art" src="${escapeHtml(songData.artworkUrl || '')}" alt="${escapeHtml((songData.title || '') + ' — ' + (songData.artist || ''))}" title="${escapeHtml(songData.title || '')} — ${escapeHtml(songData.artist || '')}" onclick="_annTogglePlay(this)">
    </div>
  ` : '';
  overlay.innerHTML = `
    <div class="ann-rv-progress">${progressDots}</div>
    <button class="ann-rv-close" onclick="_annualReviewClose()" aria-label="닫기">✕</button>
    ${total > 1 ? '<button class="ann-rv-tap ann-rv-tap-prev" onclick="_annualReviewPrev()" aria-label="이전"></button>' : ''}
    ${cardHtml}
    ${total > 1 ? '<button class="ann-rv-tap ann-rv-tap-next" onclick="_annualReviewNext()" aria-label="다음"></button>' : ''}
    ${songHtml}
  `;
  overlay.classList.add('open');
  // 처음 1번만 swipe + key listener attach
  if (!overlay._annRvBound) {
    overlay._annRvBound = true;
    let touchStart = null;
    overlay.addEventListener('touchstart', (e) => {
      touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });
    overlay.addEventListener('touchend', (e) => {
      if (!touchStart) return;
      const dx = e.changedTouches[0].clientX - touchStart.x;
      const dy = e.changedTouches[0].clientY - touchStart.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) _annualReviewNext();
        else _annualReviewPrev();
      }
      touchStart = null;
    }, { passive: true });
    document.addEventListener('keydown', _annualReviewKeyHandler);
  }
}

function _annualReviewKeyHandler(e) {
  if (!_annualReviewState) return;
  if (e.key === 'ArrowRight') { _annualReviewNext(); e.preventDefault(); }
  else if (e.key === 'ArrowLeft') { _annualReviewPrev(); e.preventDefault(); }
  else if (e.key === 'Escape') { _annualReviewClose(); }
}

function _annualReviewNext() {
  const s = _annualReviewState; if (!s) return;
  if (s.currentIdx < s.cards.length - 1) { s.currentIdx++; _annualReviewRender(); }
}
function _annualReviewPrev() {
  const s = _annualReviewState; if (!s) return;
  if (s.currentIdx > 0) { s.currentIdx--; _annualReviewRender(); }
}
function _annualReviewClose() {
  const overlay = document.getElementById('annualReviewOverlay');
  if (overlay) { overlay.classList.remove('open'); overlay.innerHTML = ''; overlay._annRvBound = false; }
  document.removeEventListener('keydown', _annualReviewKeyHandler);
  _annualReviewState = null;
  // 사용자 명시 2026-04-30: 닫을 때 audio 정리
  if (window._annAudio) {
    try { window._annAudio.pause(); window._annAudio.src = ''; } catch {}
    window._annAudio = null;
  }
}

// 사용자 명시 2026-04-30: CD click → toggle play/pause + LP spin class
function _annTogglePlay() {
  if (!window._annAudio) return;
  const songEl = document.querySelector('.ann-rv-song');
  if (window._annAudio.paused) {
    window._annAudio.play().catch(() => {});
    if (songEl) songEl.classList.add('playing');
  } else {
    window._annAudio.pause();
    if (songEl) songEl.classList.remove('playing');
  }
}

// ═══════════════════════════════════════════════════════════════
// 사용자 명시 2026-04-30: 옛 5문항 quiz 흐름 완전 폐기. 새 흐름 = chat_intake_entry 모달 + runIntakeFlow.
// V4 사용자 명시 (V203): chooser 컴포넌트 폐기. 신규 가입자 = 비밀번호 설정 → 시작 튜토리얼 자동 직진.
// 이 진입 함수: 신규 사용자 silent welcome bonus grant + 자동 튜토리얼 진입.
async function maybeShowFirstTimeIntro() {
  if (!authUserId) return;
  if (window._onbTutorialMode) return;
  // testerMode = banner queue 만 (chooser 폐기)
  if (state.preferences && state.preferences.testerMode) {
    if (typeof autoTourOnUpdate === 'function') autoTourOnUpdate();
    return;
  }
  // 다른 모달 떠있으면 skip (E2EE / 튜토리얼)
  if (document.getElementById('e2eeRecoveryOverlay')) return;
  if (document.getElementById('e2eeSetupOverlay')) return;
  if (document.getElementById('onbOverlay') && document.getElementById('onbOverlay').classList.contains('active')) return;
  // V4 (사용자 명시 2026-05-04 ultrathink V193): 옛 즉시 환영 모달 (showWelcomeBonusModal) 폐기 — Core 1 끝 _showWelcomeGiftModal 가 환영 + backend grant 통합.
  // _welcomeBonusShown legacy flag 는 아래 silent backend grant 분기에서 보존 (옛 모달 본 사용자 grant 정합성).
  // V4 (v8 사용자 명시 2026-05-03): silent backend grant — 신규 진입 즉시 backend POST (모달 X). Core 1 안 진행하는 사용자도 grant 보장. idempotent.
  // 신규 사용자 = entries ≤ 3 + _welcomeBonusShown 미설정 + access_token 활성.
  const entriesCountSilent = Array.isArray(state.entries) ? state.entries.length : Object.keys(state.entries || {}).length;
  const isFreshUserSilent = entriesCountSilent <= 3 && !(state.preferences && state.preferences._welcomeBonusShown);
  if (isFreshUserSilent && typeof session !== 'undefined' && session && session.access_token && typeof _authedFetch === 'function') {
    try {
      const resp = await _authedFetch('/api/billing/welcome-bonus', { method: 'POST' });
      if (resp.ok) {
        const data = await resp.json().catch(() => ({}));
        if (data.granted || data.already_granted) {
          state.preferences = state.preferences || {};
          state.preferences._welcomeBonusShown = true;
          try { saveState({ force: true }); } catch {}
          if (typeof refreshBillingStatus === 'function') refreshBillingStatus(false).catch(() => {});
        }
      }
    } catch (e) { console.warn('[silent welcome grant]:', e); }
  }

  // V4 사용자 명시 (V203): chooser 폐기. 신규 가입자 = 비밀번호 설정 후 시작 튜토리얼 자동 직진.
  // 한 번만 (preferences._coreTutorialAutoStarted) — reload 시 재트리거 X.
  const isFreshUser = entriesCountSilent <= 3 && !(state.preferences && state.preferences._coreTutorialAutoStarted);
  if (isFreshUser && typeof startCoreTutorial === 'function') {
    state.preferences = state.preferences || {};
    state.preferences._coreTutorialAutoStarted = true;
    state.preferences.dismissedMajor = (typeof _currentMajor === 'function') ? _currentMajor() : (typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'V4');
    try { saveState({ force: true }); } catch {}
    if (typeof saveToCloudNow === 'function') { saveToCloudNow().catch(() => {}); }
    setTimeout(() => { try { startCoreTutorial('core1'); } catch (e) { console.warn('[auto core tutorial]:', e); } }, 600);
    return;
  }

  // 기존 사용자 = 배너 큐만 (legacy / sync tip / feedback). chooser 모달 X.
  if (typeof autoTourOnUpdate === 'function') autoTourOnUpdate();
}

// V4 (사용자 명시 2026-05-04 ultrathink V193): 옛 showWelcomeBonusModal 함수 삭제. 신규 환영 모달 = _showWelcomeGiftModal (Core 1 끝 trigger).

// 개발자 도구 — 주간 리뷰 신규 schema 풀 미리보기 (시드 데이터, AI 호출 X).
// 사용자 명시 2026-04-30 ultrathink: chart / strengths / cycles / emotions / value_align / risk_signals 모두 demo. 위기 신호 'watch' 케이스 + 가치 align bar + 7일 차트 다 한 화면에.
function devPreviewWeeklyReview() {
  if (typeof renderReviewScreen !== 'function') { alert('renderReviewScreen 미정의'); return; }
  const today = new Date();
  // entries 가 부족하면 chart 가 표시 X 라 임시 7일 mood/energy 시드 inject (기존 entries 안 건드림 — testerMode 권장)
  if (!state.preferences || !state.preferences.testerMode) {
    if (!confirm('테스터 모드 OFF 인데 진행 시 임시 entries 가 state 에 적용될 수 있어. 권장: 테스터 모드 ON 후 진행. 계속?')) return;
  }
  const reviewData = {
    one_word_weekly: '회복중',
    summary: '잠을 챙긴 주, 마음이 한결 가벼웠어.',
    pattern: {
      headline: '잘 잔 다음날, 기분이 한 단계 가벼워',
      evidence: '"오늘 일찍 잤더니 머리 맑아." (화) / "잠 짧으면 한 적용하자 늦더라." (목)',
      condition: '평일 11시 전에 잤을 때 — 5일 중 4일'
    },
    quotes: [
      '"오늘 일찍 잤더니 머리 맑아."',
      '"엄마 통화하고 5분 걸으니까 풀려."',
      '"마감 임박 = 자연 진입, 미루기 X."',
      '"카페에서 글이 술술 써졌어."',
      '"운동 한 날 일기가 길어."'
    ],
    strengths: [
      '월요일 마감 임박에도 일찍 자고 잠 챙김 — 평소 패턴 깸',
      '엄마 통화 끝나고 5분 산책으로 바로 회복',
      '카페에서 글 쓴 날 3번 — 환경 잘 골랐어'
    ],
    cycles: {
      sleep: '평일에 일찍 잔 4번, 다음날마다 한결 가벼웠어. 토요일 늦게 잤더니 일요일 처짐.',
      mode: '시험기인데도 카페 가서 글이 술술 — 카페인 늘되 산책·일찍 자기로 회복 챙김',
      other: '비 오는 날 2일 살짝 무거웠어'
    },
    emotions: [
      { word: '안심', count: 5 },
      { word: '집중', count: 4 },
      { word: '뿌듯', count: 3 },
      { word: '압도', count: 2 }
    ],
    value_align: {
      score: 8,
      aligned: '"회복" — 잠 일찍 잔 날 4번, 산책 3번 / "자율" — 카페 가는 거 스스로 정함',
      gap: '"연결"은 살짝 약했어 — 이번 주는 회복기였으니 OK'
    },
    risk_signals: {
      level: 'watch',
      signals: ['주말에 한 번 늦잠 — 평일 리듬 안 무너지게만 챙기자'],
      suggestion: '주말도 평일이랑 한 시간 차이 안에서 자면 마음 안정. 무리 X — 의식만 살짝.'
    },
    seeds: [
      '평일 11시 알람 지킨 날 (목표: 5/5)',
      '카페에서 작업한 날 vs 집에서 작업한 날'
    ],
    seed_callbacks: '지난 주 씨앗 "잘 잔 다음날 어떤지" → 4번 중 4번 가벼웠어. 패턴 확정.'
  };

  // 사용자 명시 2026-04-30 ultrathink: '이 기간 깨달음 N개' 카드 통째로 보여주기 위해 풍부한 archive 5개 시드.
  // _buildReviewArchiveSummaryHTML 가 사용하는 모든 필드 inject: tags / type / savedAt / headline / body / starred / revisitCount
  // savedAt 분포 — 초/중/말미 시각 분포 보여주기 위해 분산 (chart 패턴 + 화두 무게중심 + 갈래 클러스터 시각화)
  const _seedNow = new Date();
  const _seedAgo = (days, hours) => new Date(_seedNow.getTime() - days * 86400000 - (hours || 0) * 3600000).toISOString();
  reviewData._seed_archive_for_preview = [
    {
      type: 'memo',
      headline: '아침 산책 한 날 = 그날 일기 길어',
      body: '아침 30분 걸은 화/목 — 일기에 자연스럽게 손이 가더라. 몸이 풀려야 글이 나오나봐.',
      tags: ['루틴', '회복', '글쓰기'],
      savedAt: _seedAgo(6),
      starred: true,
      revisitCount: 3
    },
    {
      type: 'scrap',
      headline: '카페 한 곳 정착 — 환경 안정',
      body: '같은 카페 3번 가니까 머리 자동 ON. 환경이 만들어주는 거 같아.',
      tags: ['환경', '집중', '루틴'],
      savedAt: _seedAgo(5, 4),
      revisitCount: 1
    },
    {
      type: 'memo',
      headline: '잠 일찍 자는 게 가장 큰 효과',
      body: '11시 전 자면 다음날 mood 한 단계 가벼움. 이거 진짜 핵심이야.',
      tags: ['수면', '회복'],
      savedAt: _seedAgo(4, 12),
      starred: true,
      revisitCount: 5
    },
    {
      type: 'reflection',
      headline: '엄마 통화는 반드시 산책 + 짝지어야 회복',
      body: '통화 직후 그냥 앉아있으면 무거움 남음. 5분 산책으로 풀어야 흐르네.',
      tags: ['회복', '관계'],
      savedAt: _seedAgo(2, 8)
    },
    {
      type: 'memo',
      headline: '마감 임박 = 자연 진입, 미루기 X',
      body: '결함이 아니라 작동 방식. 임박해야 진입 빠른 건 인정하고 활용.',
      tags: ['집중', '작동방식'],
      savedAt: _seedAgo(1, 2),
      starred: true,
      revisitCount: 2
    }
  ];
  // chart 표시 위해 임시 entries 7일 inject (state 적용하지 X — review screen 에서만 cutoff/cutoffEnd 안에서 entries 필터)
  // renderReviewScreen 가 state.entries 를 cutoff 으로 필터하므로, 시드 entries 있으면 chart 자동 표시
  // 7일 차트 — 마지막 7일에 mood/energy 변동 있는 시드 entry 가 state.entries 에 있으면 자동 그려짐 (testSeedV4Data 가 entries 채워둠)
  // entries 부족 시 chart X — graceful empty.

  // dataset 직접 set 후 renderReviewScreen 호출
  showScreen('review');
  setTimeout(() => {
    if (typeof renderReviewScreen === 'function') {
      renderReviewScreen('weekly', reviewData);
      showToast('📅 주간 리뷰 미리보기 (시드)');
    }
  }, 100);
}

// 개발자 도구 — 환영 선물 모달 (V4 V193: _showWelcomeGiftModal 통합).
// idempotent — 이미 받은 사용자는 backend 가 자동 skip ('이미 받았어'). 다시 테스트 하려면 devResetWelcomeBonus 후 재진입.
function devPreviewWelcomeBonus() {
  if (typeof _showWelcomeGiftModal === 'function') _showWelcomeGiftModal();
}

// 개발자 도구 — admin 본인 환영 보너스 처음부터 재테스트.
// 사용자 보고 2026-04-30: 받기 누르면 잔액 그대로 → admin 의 free_credit_granted=true 잔재 때문이라 자동 reset 후 모달 즉시 띄워주는 원터치 흐름.
async function devResetWelcomeBonus() {
  if (typeof session === 'undefined' || !session || !session.access_token) {
    alert('로그인 필요'); return;
  }
  if (!confirm('admin 본인 잔액 0 + free_credit_granted=false 리셋 후 환영 모달 자동 재오픈. 진행?')) return;
  try {
    const resp = await _authedFetch('/api/admin/reset-balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        new_balance_usd: 0,
        reset_free_credit_granted: true
      })
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      alert('reset 실패: ' + resp.status + ' / ' + err + '\n\nADMIN_USER_ID env 들어가 있는지 확인.');
      return;
    }
    const data = await resp.json();
    console.log('[devReset] backend 응답:', data);
    // 클라이언트 flag 도 reset
    state.preferences = state.preferences || {};
    state.preferences._welcomeBonusShown = false;
    saveState();
    if (typeof saveToCloudNow === 'function') {
      try { await saveToCloudNow(); } catch {}
    }
    showToast(`✦ reset 완료 (잔액 ${data.old_balance_usd} → 0). 모달 띄울게...`);
    // 잠깐 후 환영 모달 자동 오픈 → 받기 click → $2.14 grant
    setTimeout(() => {
      if (typeof _showWelcomeGiftModal === 'function') _showWelcomeGiftModal();  // V193: _showWelcomeGiftModal 통합
    }, 600);
  } catch (e) {
    alert('reset 실패: ' + (e.message || e));
  }
}

// 사용자 보고 2026-04-30 review (agent): AI 응답 JSON 견고 추출.
// max_tokens 부족 truncation / markdown code fence / 외부 텍스트 등 robust.
// 사용: generateFirstTouchFromCoreData, generateReview 등.
function _robustJsonExtract(text) {
  if (!text || typeof text !== 'string') throw new Error('빈 응답');
  // markdown fence strip
  let s = text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '');
  const start = s.indexOf('{');
  if (start < 0) throw new Error('JSON 객체 시작 없음');
  // brace-balanced 닫힘 (string literal escape 포함)
  let depth = 0, end = -1, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) throw new Error('JSON 닫힘 없음 (truncated 의심 — max_tokens 부족 가능)');
  return JSON.parse(s.slice(start, end + 1));
}

// 사용자 명시 2026-04-30 (정정): quiz form 폐기 → 코어 #1 종료 snapshot 기반 첫 관찰.
// 코어 #1 동안 사용자가 적용한 chatMessages user / entries / 모드 → AI 가설 추출. 동일 출력 schema (showFirstTouchResult 재사용).
async function generateFirstTouchFromCoreData(snapshot) {
  const userMsgsText = (snapshot.userMessages || []).map(m => m.content).join('\n---\n').slice(0, 2500);
  const entriesText = JSON.stringify(snapshot.entries || [], null, 0).slice(0, 1500);
  const modesText = (snapshot.selectedModes || []).join(', ') || '(없음)';
  const vitalityText = snapshot.pickedVitality || '(미응답)';
  const prompt = `사용자가 처음 앱에 진입해 코어 #1 (하면서 익히기) 튜토리얼을 끝냈다. 이 동안 사용자가 남긴 첫 데이터로 가벼운 첫 관찰을 작성한다.

[사용자가 코어 #1 동안 남긴 거]
대화 메시지 (사용자 발화):
${userMsgsText || '(없음)'}

오늘 일기 / 체크인:
${entriesText}

선택한 모드: ${modesText}
오늘 활력: ${vitalityText}

[목표]
- 한 단어 정체성 명명 (정형 X — 사용자 첫 데이터 기반 고유)
- 가설 3개 — trait / value / pattern 중 적절한 카테고리. confidence 0.3-0.5 (낮음 — 데이터 적음, 첫 인사 수준).
- 다음 1주 관찰 거리 2개 (구체, observable)
- 한 줄 친근 인사 + 첫 인상 (40자 이내)

[가설 schema 가이드]
- trait: name (10자 이내) + description (한 문장)
- value: name (5자 이내) + description (한 문장)
- pattern: name (10자 이내 라벨) + trigger (조건) + sequence (행동 흐름)
- display_text: ✓ 박스에서 보일 친근한 한 줄 (예: "꼼꼼한 편인 거 같아")

[톤]
친한 친구 반말. judgment X. self-compassion. confidence 낮음 명시 (예: "초안 — 함께 확인해볼 가설").
Surprise > Truth — '어, 어떻게 알았어?' 트리거. Specific > Generic.

[출력 JSON 만, markdown X]
{
  "one_word": "한 단어 정체성",
  "intro_line": "한 줄 친근 인사 + 첫 인상 (40자 이내)",
  "hypotheses": [
    { "category": "trait" | "value" | "pattern", "name": "...", "description": "...", "trigger": null, "sequence": null, "confidence": 0.3-0.5, "display_text": "..." },
    ...3개
  ],
  "watch_points": [
    "다음 1주 관찰 거리 1 (구체, observable)",
    "다음 1주 관찰 거리 2"
  ]
}`;
  const resp = await callAnthropic({
    _endpoint: 'first_touch',
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: 'JSON 객체 하나만 반환. markdown code fence X. 다른 글 X. 모든 필수 필드 다 채워서 출력.',
    messages: [{ role: 'user', content: prompt }]
  });
  if (!resp.ok) throw new Error('API ' + resp.status);
  const data = await resp.json();
  const text = data?.content?.[0]?.text || '';
  return _robustJsonExtract(text);
}

// 코어 #1 종료 시점 (onbFinish) 호출. snapshot → AI 진단 → 결과 적용하기 + showFirstTouchResult.
// background — 사용자 화면 표시 후 1.5초 후 trigger. 실패 silent (사용자 막힘 X).
async function _runFirstTouchFromCore1(snapshot) {
  if (!_canAI()) { console.log('[firstTouch core1] AI 불가능 — skip'); return; }
  if (!snapshot || (!snapshot.userMessages?.length && !snapshot.entries?.length)) {
    console.log('[firstTouch core1] snapshot 비어있음 — skip');
    return;
  }
  try {
    const insight = await generateFirstTouchFromCoreData(snapshot);
    if (!insight || !insight.one_word) throw new Error('분석 결과 비어있음');
    state.firstTouchInsight = { ...insight, source: 'core1', completedAt: new Date().toISOString() };
    state.preferences = state.preferences || {};
    state.preferences._firstTouchDone = true;
    saveState();
    if (typeof showFirstTouchResult === 'function') showFirstTouchResult(insight);
  } catch (e) {
    console.warn('[firstTouch core1] 실패 — silent:', e);
    // 실패 silent. _firstTouchDone 마킹 X — 다음 진단 흐름에서 재시도 가능.
  }
}

function showFirstTouchResult(insight) {
  if (document.getElementById('firstTouchResultOverlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay show';
  overlay.id = 'firstTouchResultOverlay';
  overlay.style.zIndex = '10001';
  const hypothesesHtml = (insight.hypotheses || []).map((h, i) => {
    // 새 schema: { category, name, description, trigger, sequence, display_text, confidence }
    // 옛 schema: 그냥 string (backward compat)
    const displayText = (typeof h === 'string') ? h : (h.display_text || h.name || '');
    const catLabel = (typeof h === 'object' && h.category) ?
      `<span style="font-size:9px; color:var(--text-soft); letter-spacing:0.1em; text-transform:uppercase; margin-right:6px;">${h.category === 'trait' ? '특성' : h.category === 'value' ? '가치' : '패턴'}</span>` : '';
    return `
      <div class="ft-hypothesis">
        <label>
          <input type="checkbox" id="ftHyp${i}" data-idx="${i}">
          <span>${catLabel}${escapeHtml(displayText)}</span>
        </label>
      </div>
    `;
  }).join('');
  const watchPointsHtml = (insight.watch_points || []).map(w => `
    <div class="ft-watch">· ${escapeHtml(w)}</div>
  `).join('');
  overlay.innerHTML = `
    <div class="input-modal" style="max-width:440px; max-height:90vh; overflow-y:auto; padding:24px;">
      <div style="font-size:11px; color:var(--text-soft); letter-spacing:0.15em; text-transform:uppercase; margin-bottom:6px;">너의 첫 관찰</div>
      <div style="font-family:'Gowun Batang',serif; font-size:32px; color:var(--accent); margin-bottom:8px; letter-spacing:0.04em;">${escapeHtml(insight.one_word || '')}</div>
      <div style="font-size:14px; color:var(--text); line-height:1.7; margin-bottom:18px; padding:14px; background:linear-gradient(135deg, rgba(139,126,196,0.12), rgba(201,169,110,0.07)); border-radius:12px;">
        ${escapeHtml(insight.intro_line || '')}
      </div>
      <div style="font-size:11px; color:var(--accent); letter-spacing:0.12em; text-transform:uppercase; margin-bottom:8px; margin-top:14px;">🔍 가설 (✓ 맞으면 체크)</div>
      <div style="font-size:11px; color:var(--text-dim); line-height:1.6; margin-bottom:10px;">
        체크한 건 너의 첫 traits/patterns로 자리잡음 (검증 미완료 표시 — 나중에 ✓ 확정 가능).
      </div>
      <div class="ft-hypotheses">${hypothesesHtml}</div>
      <div style="font-size:11px; color:var(--accent); letter-spacing:0.12em; text-transform:uppercase; margin-bottom:8px; margin-top:18px;">🪄 다음 1주 관찰 거리</div>
      <div class="ft-watches">${watchPointsHtml}</div>
      <div style="font-size:11px; color:var(--text-soft); margin-top:8px; font-style:italic;">
        다음 주간 리뷰 때 어떻게 됐는지 같이 봐.
      </div>
      <button class="btn-primary" onclick="closeFirstTouchResult()" style="width:100%; margin-top:20px;">시작하기 ✦</button>
    </div>
  `;
  document.body.appendChild(overlay);
}

function closeFirstTouchResult() {
  // ✓한 가설 → 카테고리별 (traits/values/patterns) 표준 schema 적용하기 — 기존 분석 흐름과 동일
  const checked = [...document.querySelectorAll('#firstTouchResultOverlay input[type="checkbox"]:checked')];
  if (checked.length > 0 && state.firstTouchInsight && Array.isArray(state.firstTouchInsight.hypotheses)) {
    if (!Array.isArray(state.traits)) state.traits = [];
    if (!Array.isArray(state.values)) state.values = [];
    if (!Array.isArray(state.patterns)) state.patterns = [];
    const nowIso = new Date().toISOString();
    for (const cb of checked) {
      const idx = parseInt(cb.dataset.idx, 10);
      const hyp = state.firstTouchInsight.hypotheses[idx];
      if (!hyp) continue;
      const id = 'ft_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const conf = typeof hyp.confidence === 'number' ? hyp.confidence : 0.5;
      // 옛 schema (string) 호환 — trait로 폴백
      if (typeof hyp === 'string') {
        state.traits.push({ id, name: hyp.slice(0, 20), description: hyp, confidence: conf, source: 'first_touch', user_verified: false, addedAt: nowIso });
        continue;
      }
      const cat = hyp.category;
      if (cat === 'trait') {
        state.traits.push({ id, name: hyp.name || '', description: hyp.description || hyp.display_text || '', confidence: conf, source: 'first_touch', user_verified: false, addedAt: nowIso });
      } else if (cat === 'value') {
        state.values.push({ id, name: hyp.name || '', description: hyp.description || hyp.display_text || '', confidence: conf, source: 'first_touch', user_verified: false, addedAt: nowIso });
      } else if (cat === 'pattern') {
        state.patterns.push({ id, name: hyp.name || '', trigger: hyp.trigger || '', sequence: hyp.sequence || hyp.display_text || '', confidence: conf, source: 'first_touch', user_verified: false, addedAt: nowIso });
      } else {
        // 카테고리 없거나 알 수 없으면 trait로 폴백
        state.traits.push({ id, name: hyp.name || (hyp.display_text || '').slice(0, 20), description: hyp.display_text || '', confidence: conf, source: 'first_touch', user_verified: false, addedAt: nowIso });
      }
    }
  }
  // 첫 weekly review에서 callback 위해 watch points seeds로 저장
  if (state.firstTouchInsight && Array.isArray(state.firstTouchInsight.watch_points)) {
    state._firstTouchSeeds = state.firstTouchInsight.watch_points.slice();
  }
  saveState();
  const overlay = document.getElementById('firstTouchResultOverlay');
  if (overlay) overlay.remove();
  showToast('✦ 첫 관찰 완료. 시작하자.');
  // 사용자 요청 2026-04-30 + V203 (chooser 폐기): 첫 관찰 close 후 → 배너 큐 trigger (legacy bonus / sync tip / feedback)
  setTimeout(() => { if (typeof autoTourOnUpdate === 'function') autoTourOnUpdate(); }, 800);
}

// ═══════════════════════════════════════════════════════════════════════════
// 코어 #1 첫 관찰 — Intake Worry 인터랙티브 흐름 (사용자 명시 2026-04-30 ultrathink)
// 흐름: Step1 첫 발화 (한 마디/예시chip/음성) → Step2 AI deepening → Step3 장문 발화 → Step4 paraphrase → Step5 더 알고 싶어 → Step6 차원 분석 + 작은 전략 → Step7 traits/values/patterns 자동 합류
// state.intakeWorry 별도 array — testerMode OFF / 시드 sweep / backup restore 영향 X
// ═══════════════════════════════════════════════════════════════════════════

// 예시 entry 7개 (한 줄 / 장문 페어). Step1 = 랜덤 1개 short chip / Step3 = 같은 페어 long (사용자 직접 입력 시 fallback = 다른 랜덤 또는 AI 동적).
const INTAKE_EXAMPLES = [
  {
    id: 'mom_anger', icon: '💔',
    short: '엄마한테 화냈어',
    long: '엄마한테 별거 아닌 일로 화를 냈어. 통화하다가 잔소리해서 톡 쏘아붙였어. 끊고 나서 바로 후회됐는데 자주 그래. 왜 그러는지 모르겠어.'
  },
  {
    id: 'project_block', icon: '💼',
    short: '할 일이 자꾸 막혀',
    long: '프로젝트 마감 다가오는데 손도 못 대. 시작만 하면 되는데 자꾸 다른 거 하다가 결국 마감 임박해서야 폭발할까 봐 걱정. 매번 그래.'
  },
  {
    id: 'reject_guilt', icon: '💞',
    short: '거절했는데 마음이 무거워',
    long: '친구 부탁 거절했는데 자꾸 마음에 걸려. 거절은 맞다고 생각하는데 부채감이 안 사라져. 며칠째 그 생각만 떠올라.'
  },
  {
    id: 'sleep_fog', icon: '🌙',
    short: '잠을 못 자',
    long: '머리는 피곤한데 누우면 잡생각이 멈추질 않아. 다음날 종일 멍해서 아무것도 못 해. 이게 한 달째.'
  },
  {
    id: 'unknown_heavy', icon: '💭',
    short: '이유 모르겠는데 무거워',
    long: '큰 일 있는 것도 아닌데 그냥 가라앉아 있어. 며칠 됐어. 뭘 해도 마음이 잡히질 않고 의욕이 없어.'
  },
  {
    id: 'path_doubt', icon: '🌠',
    short: '이 길이 맞는 건지 헷갈려',
    long: '지금까지 온 게 아까운 건지 진짜 좋아하는 건지 모르겠어. 가끔 그만두고 싶다가도 끝까지 가야 할 거 같고 — 답이 안 나와.'
  },
  {
    id: 'overwhelmed', icon: '🔥',
    short: '다 압도돼서 못 따라가',
    long: '할 일이 너무 많아. 뭐부터 해야 할지 모르겠고 시작도 못 해. 한 발짝도 못 떼고 있는데 시간만 가. 답답해.'
  }
];

function _intakePickRandomExample(excludeId) {
  const pool = excludeId ? INTAKE_EXAMPLES.filter(e => e.id !== excludeId) : INTAKE_EXAMPLES;
  return pool[Math.floor(Math.random() * pool.length)];
}

// 짧음 detect — 15자 미만 = deepening 필요
function _intakeShouldDeepen(text) {
  if (!text) return true;
  return text.trim().replace(/\s+/g, '').length < 15;
}

// Step2: AI 가 사용자 첫 짧은 발화 받고 한 번 더 풀어달라 부탁 (1-2 문장).
async function _intakeDeepenAsk(userText) {
  if (!_canAI()) throw new Error('AI 호출 불가능');
  const prompt = `너는 소라고동 — 자기관찰 친구. 따뜻 + 짧게 + 반말.
사용자가 첫 발화로 짧게 말했어. 한 번 더 풀어달라 부탁해.
판단 X. 강요 X. 1-2 문장 follow-up 질문.
사용자 발화의 핵심어 1개를 자연스럽게 paraphrase 안에 넣어.

사용자 첫 발화: "${userText}"

[출력]
1-2 문장만. 다른 글 X. 따옴표 X.`;
  const resp = await callAnthropic({
    _endpoint: 'intake',
    model: 'claude-sonnet-4-6',
    max_tokens: 200,
    system: '소라고동 톤 — 따뜻하고 짧게. 1-2 문장만 출력. 따옴표·markdown X.',
    messages: [{ role: 'user', content: prompt }]
  });
  if (!resp.ok) throw new Error('API ' + resp.status);
  const data = await resp.json();
  return (data?.content?.[0]?.text || '').trim();
}

// Step3: AI 가 사용자 첫 발화 받고 장문 entry 1개 모방용 생성 (50-100자, 상황+감정+자기관찰).
async function _intakeGenLongExample(userText) {
  if (!_canAI()) throw new Error('AI 호출 불가능');
  const prompt = `사용자가 첫 발화로 "${userText}" 라고 말했어 (짧음).
이걸 자연스럽게 풀어 적은 장문 entry 1개를 모방용으로 생성해 — "이런 식으로 풀면 돼" 학습용.
50-100자, 상황 + 감정 + 자기관찰 3축, 반말, 자연 한국어.
사용자 발화의 핵심 그대로 살리면서 살 붙임.

[출력]
장문 entry 1개만. 다른 글 X. 따옴표 X.`;
  const resp = await callAnthropic({
    _endpoint: 'intake',
    // V4 (사용자 명시 2026-05-04): 짧은 모방 task = Haiku 통일 (saveMsgAsInsight / summarizeForArchive 등 일관)
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    system: '장문 entry 1개만 출력. 50-100자. 따옴표·markdown X.',
    messages: [{ role: 'user', content: prompt }]
  });
  if (!resp.ok) throw new Error('API ' + resp.status);
  const data = await resp.json();
  return (data?.content?.[0]?.text || '').trim();
}

// Step6: 전체 intakeWorry chat 받아 차원 분석 + 작은 전략 + traits/values/patterns 가설 생성.
async function _intakeAnalyze(intakeWorry) {
  if (!_canAI()) throw new Error('AI 호출 불가능');
  const chatText = (intakeWorry || []).map(m => `${m.role === 'user' ? '사용자' : '소라고동'}: ${m.content}`).join('\n');
  const prompt = `사용자 — 첫 만남 미니 분석. 다음 대화 보고 차원 분석 + 작은 전략 + 자기관찰 가설.

[대화 전체]
${chatText}

[너의 일]
1. paraphrase: 사용자 발화 핵심 1줄 인용 또는 paraphrase
2. dimension: 환경 / 인지 / 사회 / 정체성 / 가치 중 1개 (가장 작동하는 차원)
3. diagnosis: 1-2 문장. 판단 X. 자기관찰 톤.
4. strategy: 1-2 문장. 환경 cuing 우선. 관찰 친화. 구체.
5. hypotheses: trait / value / pattern 가설 1-3개 (user_verified=false, confidence 0.4-0.6)

[가설 schema]
- trait: name (10자 이내) + description (한 문장) + display_text (✓ 박스용 친근 한 줄)
- value: name (5자 이내) + description (한 문장) + display_text
- pattern: name (10자 이내) + trigger (조건) + sequence (행동 흐름) + display_text

[톤]
친한 친구 반말. judgment X. self-compassion. 첫 만남이라 confidence 낮게.
Surprise > Truth. Specific > Generic.

[출력 JSON 만, markdown X]
{
  "paraphrase": "...",
  "dimension": "환경/인지/사회/정체성/가치 중 하나",
  "diagnosis": "1-2 문장",
  "strategy": "1-2 문장",
  "hypotheses": [
    { "category": "trait" | "value" | "pattern", "name": "...", "description": "...", "trigger": null, "sequence": null, "confidence": 0.5, "display_text": "..." }
  ]
}`;
  const resp = await callAnthropic({
    _endpoint: 'intake',
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: 'JSON 객체 하나만 반환. markdown code fence X. 다른 글 X. 모든 필수 필드 다 채워서 출력.',
    messages: [{ role: 'user', content: prompt }]
  });
  if (!resp.ok) throw new Error('API ' + resp.status);
  const data = await resp.json();
  const text = data?.content?.[0]?.text || '';
  return _robustJsonExtract(text);
}

// 분석 결과의 hypotheses → state.traits/values/patterns 자동 합류 (user_verified=false).
function _intakeApplyHypotheses(hypotheses) {
  if (!Array.isArray(hypotheses)) return;
  state.traits = state.traits || [];
  state.values = state.values || [];
  state.patterns = state.patterns || [];
  hypotheses.forEach((h, i) => {
    if (!h || !h.category || !h.name) return;
    const id = 'intake_' + h.category + '_' + Date.now() + '_' + i;
    const base = {
      id,
      name: h.name,
      description: h.description || '',
      display_text: h.display_text || h.name,
      confidence: typeof h.confidence === 'number' ? h.confidence : 0.5,
      user_verified: false,
      evidence_count: 1,
      created_at: new Date().toISOString(),
      source: 'intake_core1'
    };
    if (h.category === 'trait') state.traits.push(base);
    else if (h.category === 'value') state.values.push(base);
    else if (h.category === 'pattern') {
      state.patterns.push({
        ...base,
        trigger: h.trigger || '',
        sequence: h.sequence || ''
      });
    }
  });
}

// ─── Intake 모달 풀 흐름 (Step1-6) + Web Speech API ──────────────────────────
let _intakeState = null;  // { step, exampleStep1, aiLong, analysis, resolve, recognition, recognizing }

async function runIntakeFlow() {
  return new Promise((resolve) => {
    state.intakeWorry = [];
    _intakeState = {
      step: 1,
      exampleStep1: _intakePickRandomExample(),
      aiLong: null,
      analysis: null,
      resolve,
      recognition: null,
      recognizing: false
    };
    _showIntakeModal();
  });
}

// ─── 공용 입력창 음성 인식 (사용자 명시 2026-04-30 ultrathink: chat / reflection / magic / mutation 4곳) ──────────
window._inputSpeechActive = null;  // { recognition, btnEl, taEl }

window._toggleInputSpeech = function(taId, btnId) {
  const ta = document.getElementById(taId);
  const btn = document.getElementById(btnId);
  if (!ta || !btn) return;
  // 같은 button 재누름 = stop
  if (window._inputSpeechActive && window._inputSpeechActive.btnEl === btn) {
    try { window._inputSpeechActive.recognition?.stop(); } catch {}
    return;
  }
  // 다른 곳 진행 중이면 먼저 stop
  if (window._inputSpeechActive) {
    try { window._inputSpeechActive.recognition?.stop(); } catch {}
    window._inputSpeechActive = null;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    showToast('🎤 음성 인식이 이 브라우저에서는 안 돼. 직접 적어줘 ✦');
    return;
  }
  // 첫 사용 = privacy 안내 1회
  if (!localStorage.getItem('soragodong_v4_speech_consent')) {
    if (!confirm('🎤 음성 입력 안내\n\n음성은 Google 서버를 거쳐 텍스트로 변환됩니다. 동의하시고 사용하시겠어요?')) return;
    try { localStorage.setItem('soragodong_v4_speech_consent', '1'); } catch {}
  }
  const recognition = new SR();
  recognition.lang = 'ko-KR';
  recognition.continuous = true;
  recognition.interimResults = true;
  let finalText = ta.value ? ta.value + ' ' : '';
  let silenceTimer = null;
  const resetSilence = () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => { try { recognition.stop(); } catch {} }, 5000);
  };
  recognition.onstart = () => {
    btn.classList.add('speech-active');
    btn.textContent = '⏹';
    resetSilence();
  };
  recognition.onresult = (event) => {
    resetSilence();
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += t + ' ';
      else interim += t;
    }
    ta.value = (finalText + interim).trim();
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const _MIC_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11Z"/></svg>';
  recognition.onerror = (e) => {
    console.warn('[input speech] error', e);
    btn.classList.remove('speech-active');
    btn.innerHTML = _MIC_SVG;
  };
  recognition.onend = () => {
    btn.classList.remove('speech-active');
    btn.innerHTML = _MIC_SVG;
    if (silenceTimer) clearTimeout(silenceTimer);
    window._inputSpeechActive = null;
  };
  window._inputSpeechActive = { recognition, btnEl: btn, taEl: ta };
  try { recognition.start(); } catch (e) { console.warn('[input speech] start fail', e); }
};

// 사용자 명시 2026-04-30 ultrathink: chat_intake_entry step 안 button 핸들러.
// 모달 풀 흐름 종료 → 분석 결과를 대화창에 4단 형식 + proposal 메시지로 자동 표시
// → 튜토리얼은 click_strategy step 으로 점프 (send_diary / click_deeper / await_deeper_response 생략 — intake 가 동일 분석을 만들었으므로 중복 단계 회피).
window._startIntakeFromTutorial = async function() {
  if (document.getElementById('intakeModalOverlay')) return;
  // 사용자 명시 2026-05-01 (agent audit): _canAI 가드 — session 없거나 401 시 사용자 stranded 차단.
  if (typeof _canAI === 'function' && !_canAI()) {
    if (typeof showToast === 'function') showToast('🔑 로그인 후 다시 시도해줘');
    if (typeof onbNext === 'function') onbNext();
    return;
  }
  try {
    await runIntakeFlow();
    if (state.intakeWorry && state.intakeWorry.length > 0) {
      state.preferences = state.preferences || {};
      state.preferences._firstTouchDone = true;
    }
    saveState();
  } catch (e) { console.warn('[intake] tutorial 흐름 실패', e); }

  // intake 분석 stash → 대화창으로 전달
  const analysis = window._lastIntakeAnalysis;
  const worries = Array.isArray(window._lastIntakeWorries) ? window._lastIntakeWorries : [];
  delete window._lastIntakeAnalysis;
  delete window._lastIntakeWorries;

  if (analysis && (analysis.diagnosis || analysis.strategy)) {
    state.chatMessages = state.chatMessages || [];
    const nowIso = new Date().toISOString();
    if (worries.length > 0) {
      state.chatMessages.push({
        role: 'user',
        content: worries.join('\n\n'),
        timestamp: nowIso
      });
    }
    const dim = (analysis.dimension || '환경').trim();
    const para = (analysis.paraphrase || '').trim();
    const diag = (analysis.diagnosis || '').trim();
    const strat = (analysis.strategy || '').trim();
    const observation = para || (diag ? diag.split(/[.。]\s/)[0] + '.' : '방금 들려준 마음, 정리해봤어.');
    const concept = `${dim} 차원이 작동하는 모습이 보여.${diag ? '\n' + diag : ''}`;
    const guide = strat || '천천히 같이 가보자.';
    const proposalText = strat ? strat.split(/[.。]\s/)[0].slice(0, 80) : '천천히 한 걸음';
    const fourStage = `[내가 본 것]\n${observation}\n\n[이게 뭐냐면]\n${concept}\n\n[이럴 땐 이렇게]\n${guide}\n\n[오늘의 제안]\n${proposalText}`;
    state.chatMessages.push({
      role: 'assistant',
      content: fourStage,
      fromDeeper: true,
      proposal: true,
      proposalData: { title: proposalText.slice(0, 40) || '오늘 한 걸음' },
      timestamp: nowIso
    });
    // V4 (사용자 명시 2026-05-04 ultrathink): 4단 분석 직후 안내 메시지 inject — '내가 지금은 4단 분석 채워놨다' 톤 (옛 카피 톤)
    state.chatMessages.push({
      role: 'assistant',
      content: '처음이라 위 4단으로 친절히 정리해줬어 ✦\n평소엔 답 아래 "더 알고 싶어 ▾" 누르면 이렇게 깊게 풀어줄게.',
      timestamp: nowIso
    });
    saveState();
    if (typeof renderChat === 'function') renderChat();
    setTimeout(() => { if (typeof scrollChatToBottom === 'function') scrollChatToBottom(true); }, 80);

    // V4 (v8 묶음 12): chapter_close_intro 점프 — 사용자 ✓ 마무리 클릭 안내 → endChapter (묶음 5 archive 핀 영구) → core1_finish
    const targetIdx = Array.isArray(ONBOARDING_STEPS)
      ? ONBOARDING_STEPS.findIndex(s => s && s.id === 'chapter_close_intro')
      : -1;
    if (targetIdx >= 0 && typeof _onbStep !== 'undefined') {
      _onbStep = targetIdx;
      if (typeof onbRenderStep === 'function') {
        setTimeout(() => onbRenderStep(), 200);
      }
      return;
    }
  }

  // fallback — 분석 결과 없거나 jump 실패: 기존 동작 (다음 step)
  if (typeof onbNext === 'function') onbNext();
};

function _intakeSpeechSupported() {
  return ('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window);
}

function _showIntakeModal() {
  if (document.getElementById('intakeModalOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'intakeModalOverlay';
  overlay.className = 'input-modal-overlay show';
  overlay.style.zIndex = '10002';
  // V4 (v8 묶음 12): 강제 모드 — 오버레이 클릭 X (ESC 차단은 keydown listener)
  overlay.addEventListener('click', (e) => { if (e.target === overlay) e.stopPropagation(); });
  overlay.innerHTML = `<div class="intake-modal" onclick="event.stopPropagation()" id="intakeModalContent"></div>`;
  document.body.appendChild(overlay);
  // V4 (v8 묶음 12): ESC 차단 — _onIntakeKeydown 등록
  document.addEventListener('keydown', _onIntakeKeydown, true);
  _renderIntakeStep();
}
// V4 (v8 묶음 12): intake 모달 ESC / Escape 차단 — 사용자 명시 선택만 (X / 취소 X)
function _onIntakeKeydown(e) {
  if (e.key === 'Escape' || e.key === 'Esc') {
    e.preventDefault();
    e.stopPropagation();
  }
}

function _closeIntakeModal() {
  if (_intakeState && _intakeState.recognition) {
    try { _intakeState.recognition.stop(); } catch {}
  }
  // V4 (v8 묶음 12): ESC keydown listener 해제
  try { document.removeEventListener('keydown', _onIntakeKeydown, true); } catch {}
  const overlay = document.getElementById('intakeModalOverlay');
  if (overlay) overlay.remove();
  const resolveFn = _intakeState && _intakeState.resolve;
  _intakeState = null;
  if (typeof resolveFn === 'function') resolveFn();
}

function _renderIntakeStep() {
  const c = document.getElementById('intakeModalContent');
  if (!c || !_intakeState) return;
  const dots = _intakeProgressDots(_intakeState.step);
  if (_intakeState.step === 1)      c.innerHTML = dots + _intakeStep1Html();
  else if (_intakeState.step === 2) c.innerHTML = dots + _intakeStep2Html();
  else if (_intakeState.step === 3) c.innerHTML = dots + _intakeStep3Html();
  else if (_intakeState.step === 4) c.innerHTML = dots + _intakeStep4Html();
  else if (_intakeState.step === 5) c.innerHTML = dots + _intakeStep5Html();
  else if (_intakeState.step === 6) c.innerHTML = dots + _intakeStep6Html();
  // textarea autofocus (Step1, 3)
  setTimeout(() => {
    const ta = document.querySelector('#intakeModalContent textarea');
    if (ta) ta.focus();
  }, 100);
}

function _intakeProgressDots(step) {
  const total = 6;
  let html = '<div class="intake-progress">';
  for (let i = 1; i <= total; i++) html += `<span class="intake-dot ${i <= step ? 'on' : ''}"></span>`;
  html += '</div>';
  return html;
}

function _intakeStep1Html() {
  const ex = _intakeState.exampleStep1;
  // 사용자 명시 2026-04-30 ultrathink: 미지원 브라우저도 mic button 표시 — 누름 시 토스트 안내 (예시·텍스트 권유).
  const micHtml = `<button id="intakeMicBtn1" class="intake-mic-btn" onclick="_intakeMicToggle(1)" aria-label="음성"><span id="intakeMicIcon1"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="width:18px;height:18px;display:block;"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11Z"/></svg></span></button>`;
  return `
    <div class="intake-mic-recommend">
      <span class="intake-mic-recommend-emoji">🎤</span>
      <span><b>말로 풀어봐 — 적극 추천!</b><br><span class="intake-mic-recommend-sub">손보다 빠르고 자연스러워</span></span>
    </div>
    <div class="intake-prompt">요즘 마음에 자주 떠오르는 거, 한 마디부터 시작해도 OK.</div>
    <textarea id="intakeInput1" class="intake-textarea" rows="3" placeholder="한 줄도 OK. 마음 가는 대로."></textarea>
    <div id="intakeMicStatus1" class="intake-mic-status" style="display:none;"></div>
    <div class="intake-actions">
      ${micHtml}
      <button id="intakeSendBtn1" class="intake-send-btn" onclick="_intakeStep1Send()">✦ 보내기</button>
    </div>
    <div class="intake-example">
      <div class="intake-example-label">↓ 예시 — <b>클릭하면 입력창에 채워져</b></div>
      <div class="intake-example-chip" onclick="_intakeStep1FillExample()">${ex.icon} "${escapeHtml(ex.short)}"</div>
    </div>
  `;
}

function _intakeStep1FillExample() {
  const ta = document.getElementById('intakeInput1');
  if (ta && _intakeState) ta.value = _intakeState.exampleStep1.short;
}

async function _intakeStep1Send() {
  const text = (document.getElementById('intakeInput1')?.value || '').trim();
  if (!text) { showToast('한 줄이라도 적어줘 ✦'); return; }
  state.intakeWorry.push({ role: 'user', content: text, ts: new Date().toISOString(), kind: 'first' });
  saveState();
  // 짧음 detect → Step2 (deepening). 장문이면 Step3 skip 후 Step4 직진.
  if (_intakeShouldDeepen(text)) {
    _intakeState.step = 2;
    _renderIntakeStep();
    try {
      const ask = await _intakeDeepenAsk(text);
      state.intakeWorry.push({ role: 'assistant', content: ask, ts: new Date().toISOString(), kind: 'deepen_q' });
      saveState();
      const askDiv = document.getElementById('intakeAIAsk');
      if (askDiv) askDiv.innerHTML = `<b>🐚</b> ${escapeHtml(ask)}`;
    } catch (e) {
      console.warn('[intake] deepen ask 실패 — fallback wording', e);
      const askDiv = document.getElementById('intakeAIAsk');
      if (askDiv) askDiv.innerHTML = `<b>🐚</b> 어떤 상황이었고 어떻게 됐는지 좀 더 풀어줄래? 상황 → 무슨 마음 → 어떻게 됐는지, 자유롭게.`;
      state.intakeWorry.push({ role: 'assistant', content: '어떤 상황이었고 어떻게 됐는지 좀 더 풀어줄래?', ts: new Date().toISOString(), kind: 'deepen_q' });
      saveState();
    }
    // AI 동적 long example 미리 백그라운드 fetch (Step3 진입 시 즉시 표시)
    _intakeGenLongExample(text)
      .then(longText => { if (_intakeState) _intakeState.aiLong = longText; })
      .catch(e => { console.warn('[intake] long example 실패 — INTAKE_EXAMPLES 페어 사용', e); });
  } else {
    // 한 번에 장문 발화 → Step3 skip → Step4 (paraphrase + 더 알고 싶어) 직진
    _intakeState.step = 4;
    _renderIntakeStep();
  }
}

function _intakeStep2Html() {
  return `
    <div class="intake-ai-msg" id="intakeAIAsk"><b>🐚</b> <span class="intake-loading">잠깐...</span></div>
    <div class="intake-prompt-secondary">한 번 더 풀어줘.<br><span class="small">고민을 구체적으로 다 털어놔도 OK. 상황 → 무슨 마음 → 어떻게 됐는지.</span></div>
    <div class="intake-actions">
      <button class="intake-send-btn" onclick="_intakeStep2Next()">✦ 다음</button>
    </div>
  `;
}

async function _intakeStep2Next() {
  _intakeState.step = 3;
  _renderIntakeStep();
  // 사용자 명시 2026-04-30: AI 동적 long example 보장 — 백그라운드 fetch 미완료 시 다시 시도 + await
  if (!_intakeState.aiLong) {
    try {
      const userFirst = state.intakeWorry.find(m => m.role === 'user');
      if (userFirst && userFirst.content) {
        const longText = await _intakeGenLongExample(userFirst.content);
        if (_intakeState && longText) {
          _intakeState.aiLong = longText;
          _renderIntakeStep();
        }
      }
    } catch (e) {
      console.warn('[intake] step3 long example retry failed:', e);
    }
  }
}

function _intakeStep3Html() {
  const userFirst = state.intakeWorry.find(m => m.role === 'user');
  const userText = userFirst ? userFirst.content : '';
  // AI long 우선 / 없으면 페어 long fallback
  const ex = _intakeState.exampleStep1;
  const fallbackLong = ex.long;
  const longText = _intakeState.aiLong || fallbackLong;
  const micHtml = `<button id="intakeMicBtn3" class="intake-mic-btn" onclick="_intakeMicToggle(3)" aria-label="음성"><span id="intakeMicIcon3"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="width:18px;height:18px;display:block;"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11Z"/></svg></span></button>`;
  return `
    <div class="intake-ai-msg-small"><b>🐚</b> ${escapeHtml(userText.slice(0, 50))}${userText.length > 50 ? '...' : ''} — 한 번 더 풀어줘.</div>
    <textarea id="intakeInput3" class="intake-textarea" rows="5" placeholder="3줄 이상 풀어줘.&#10;상황 → 무슨 마음 → 어떻게 됐는지."></textarea>
    <div id="intakeMicStatus3" class="intake-mic-status" style="display:none;"></div>
    <div class="intake-actions">
      ${micHtml}
      <button class="intake-send-btn" onclick="_intakeStep3Send()">✦ 보내기</button>
    </div>
    <div class="intake-example">
      <div class="intake-example-label">↓ 예시 — <b>클릭하면 입력창에 채워져</b>${_intakeState.aiLong ? '' : ' <span class="small">(AI 답변 기다리는 중...)</span>'}</div>
      <div class="intake-example-chip intake-example-long" onclick="_intakeStep3FillExample()">${ex.icon} "${escapeHtml(longText)}"</div>
    </div>
  `;
}

function _intakeStep3FillExample() {
  const ta = document.getElementById('intakeInput3');
  if (!ta) return;
  const longText = _intakeState.aiLong || _intakeState.exampleStep1.long;
  ta.value = longText;
}

async function _intakeStep3Send() {
  const text = (document.getElementById('intakeInput3')?.value || '').trim();
  if (!text) { showToast('한 번 더 풀어줘 ✦'); return; }
  state.intakeWorry.push({ role: 'user', content: text, ts: new Date().toISOString(), kind: 'detailed' });
  saveState();
  _intakeState.step = 4;
  _renderIntakeStep();
}

function _intakeStep4Html() {
  // 사용자 발화 paraphrase 한 줄 + "더 알고 싶어" button
  const lastUser = state.intakeWorry.filter(m => m.role === 'user').slice(-1)[0];
  const preview = lastUser ? (lastUser.content.length > 80 ? lastUser.content.slice(0, 80) + '...' : lastUser.content) : '';
  return `
    <div class="intake-ai-msg"><b>🐚</b> 잘 들었어 ✦<br><br><span class="small intake-quote">"${escapeHtml(preview)}"</span><br><br>이 마음, 어디서 작동하는지 같이 들여다볼래?</div>
    <div class="intake-actions">
      <button class="intake-send-btn intake-deepen-btn" onclick="_intakeStep4Analyze()">🔍 더 알고 싶어</button>
    </div>
  `;
}

async function _intakeStep4Analyze() {
  _intakeState.step = 5;
  _renderIntakeStep();
  try {
    const result = await _intakeAnalyze(state.intakeWorry);
    _intakeState.analysis = result;
    state.intakeWorry.push({
      role: 'assistant',
      content: `[차원: ${result.dimension}]\n${result.diagnosis}\n\n✦ ${result.strategy}`,
      ts: new Date().toISOString(),
      kind: 'analysis'
    });
    saveState();
    _renderIntakeStep();
  } catch (e) {
    console.warn('[intake] analyze 실패', e);
    _intakeState.analysis = {
      paraphrase: '',
      dimension: '환경',
      diagnosis: '잘 들었어. 좀 더 같이 들여다보고 싶어.',
      strategy: '천천히 가자. 다음 대화에서 이어가자.',
      hypotheses: []
    };
    _renderIntakeStep();
  }
}

function _intakeStep5Html() {
  if (!_intakeState.analysis) {
    return `<div class="intake-ai-msg"><b>🐚</b> <span class="intake-loading">잠깐 들여다보는 중...</span></div>`;
  }
  const a = _intakeState.analysis;
  return `
    <div class="intake-analysis">
      ${a.paraphrase ? `<div class="intake-analysis-paraphrase">${escapeHtml(a.paraphrase)}</div>` : ''}
      <div class="intake-analysis-dim"><b>${escapeHtml(a.dimension || '')} 차원</b> 이 작동하고 있어 보여.</div>
      <div class="intake-analysis-diag">${escapeHtml(a.diagnosis || '')}</div>
      <div class="intake-analysis-sep"></div>
      <div class="intake-analysis-strategy"><b>✦ 이렇게 한 번 해볼래?</b><br>${escapeHtml(a.strategy || '')}</div>
    </div>
    <div class="intake-actions">
      <button class="intake-send-btn" onclick="_intakeStep5Next()">고마워 ✦</button>
    </div>
  `;
}

function _intakeStep5Next() {
  // hypotheses → traits/values/patterns 자동 합류
  if (_intakeState.analysis && _intakeState.analysis.hypotheses) {
    _intakeApplyHypotheses(_intakeState.analysis.hypotheses);
    saveState();
  }
  // 사용자 명시 2026-04-30 ultrathink: 튜토리얼 모드일 때 모달 종료 후 대화창에 4단 분석 자동 표시용 stash.
  // _startIntakeFromTutorial 가 modal 종료 시점에 읽어서 처리.
  if (window._onbTutorialMode) {
    window._lastIntakeAnalysis = _intakeState.analysis ? JSON.parse(JSON.stringify(_intakeState.analysis)) : null;
    window._lastIntakeWorries = (state.intakeWorry || [])
      .filter(m => m && m.role === 'user')
      .map(m => m.content);
  }
  _intakeState.step = 6;
  _renderIntakeStep();
}

function _intakeStep6Html() {
  return `
    <div class="intake-finish">
      <div class="intake-finish-icon">🐚</div>
      <div class="intake-finish-title">방금 너를 잠깐 들여다봤어 🐚</div>
      <div class="intake-finish-body">
        ✨ <b>나 탭</b> 가보면 — 내가 방금 너를 어떻게 봤는지 나와있어.<br>
        이따 확인해봐!
      </div>
    </div>
    <div class="intake-actions">
      <button class="intake-send-btn" onclick="_closeIntakeModal()">계속 ✦</button>
    </div>
  `;
}

// Web Speech API 통합 — Step1 / Step3 마이크 버튼.
function _intakeMicToggle(stepNum) {
  if (!_intakeState) return;
  if (_intakeState.recognizing) {
    try { _intakeState.recognition?.stop(); } catch {}
    return;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    // 사용자 명시 2026-04-30 ultrathink: 미지원 브라우저 (iOS Safari < 16.5 등) = 토스트 안내. 예시·텍스트 권유.
    showToast('🎤 음성 인식이 이 브라우저에서는 안 돼. 예시 누르거나 직접 적어줘 ✦');
    return;
  }
  // 첫 사용 = privacy 안내 1회
  // 사용자 명시 2026-05-01 (agent audit): consent 키 통합 (chat 4곳 입력창과 동일 키). 사용자가 chat 에서 한 번 동의하면 intake 도 skip.
  if (!localStorage.getItem('soragodong_v4_speech_consent')) {
    if (!confirm('🎤 음성 입력 안내\n\n음성은 Google 서버를 거쳐 텍스트로 변환됩니다. 동의하시고 사용하시겠어요?')) return;
    try { localStorage.setItem('soragodong_v4_speech_consent', '1'); } catch {}
  }
  const ta = document.getElementById('intakeInput' + stepNum);
  const iconEl = document.getElementById('intakeMicIcon' + stepNum);
  const statusEl = document.getElementById('intakeMicStatus' + stepNum);
  const recognition = new SR();
  recognition.lang = 'ko-KR';
  recognition.continuous = true;
  recognition.interimResults = true;
  let finalText = ta?.value ? ta.value + ' ' : '';
  let silenceTimer = null;
  const resetSilenceTimer = () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => { try { recognition.stop(); } catch {} }, 5000);  // 5초 침묵 자동 종료
  };
  recognition.onstart = () => {
    _intakeState.recognizing = true;
    if (iconEl) iconEl.textContent = '⏹';
    if (statusEl) { statusEl.style.display = 'block'; statusEl.innerHTML = '<span class="intake-mic-pulse">●</span> 듣는 중...'; }
    resetSilenceTimer();
  };
  recognition.onresult = (event) => {
    resetSilenceTimer();
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += transcript + ' ';
      else interim += transcript;
    }
    if (ta) ta.value = (finalText + interim).trim();
  };
  recognition.onerror = (e) => {
    console.warn('[intake speech] error', e);
    if (statusEl) statusEl.innerHTML = '⚠️ 음성 인식 오류 — 다시 시도하거나 직접 적어줘';
  };
  recognition.onend = () => {
    _intakeState.recognizing = false;
    _intakeState.recognition = null;
    if (silenceTimer) clearTimeout(silenceTimer);
    if (iconEl) iconEl.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="width:18px;height:18px;display:block;"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11Z"/></svg>';
    if (statusEl) statusEl.style.display = 'none';
  };
  _intakeState.recognition = recognition;
  try { recognition.start(); } catch (e) { console.warn('[intake speech] start fail', e); }
}

async function maybeShowE2EESetupForNewUser() {
  if (!authUserId) return;
  if (state.preferences && state.preferences.testerMode) return;
  if (_e2eeEnabled || _e2eeMasterKey) return;
  if (window._e2eePendingRecovery) return;
  try {
    if (localStorage.getItem('soragodong_v4_e2ee_recovery')) return;  // 이미 활성
    // 사용자 명시 2026-05-02: dismissed flag 검사 제거 — E2EE 설정 강제 (skip X). 신규/legacy 둘 다.
  } catch {}
  if (document.getElementById('e2eeSetupOverlay')) return;
  // 사용자 명시 2026-05-02: allowCancel: false — 신규/legacy 강제 모달 (취소 button X).
  showE2EEPasswordSetupModal({ allowCancel: false });
}

// 사용자 요청 2026-04-30 (단순화): E2EE 활성화 — 사용자 지정 password 모달.
async function setupE2EE() {
  if (_e2eeMasterKey && _e2eeEnabled) {
    alert('이미 종단간 암호화(E2EE)가 활성화되어 있어요.');
    return;
  }
  // 사용자 보고 2026-04-30 데이터 손실 P3 fix: 재활성화 시 기존 master key 덮어쓰기 차단.
  // 기존 recovery localStorage 또는 cloud의 _encryptedBody가 있으면 = 이미 한 번 활성된 사용자.
  // 다시 setup하면 새 master key 생성 → 기존 암호화 데이터 영원히 복호화 불가능.
  try {
    if (localStorage.getItem('soragodong_v4_e2ee_recovery')) {
      alert(
        '이미 비밀번호를 설정하신 적이 있어요.\n\n' +
        '다시 활성화하시면 기존 비밀번호로 암호화된 데이터를 영원히 복구할 수 없습니다.\n\n' +
        '기존 비밀번호 기억나시면 새로고침 후 자동으로 뜨는 복원 모달에서 입력해주세요.'
      );
      return;
    }
  } catch {}
  if (window._e2eePendingRecovery) {
    alert('비밀번호 복원이 진행 중입니다. 새로고침 후 복원 모달에서 비밀번호를 입력해주세요.');
    return;
  }
  showE2EEPasswordSetupModal();
}

// 사용자 명시 2026-05-02 Phase 1: 비밀번호 변경 모달 (이미 활성된 사용자 대상).
function setupChangePassword() {
  if (!_e2eeMasterKey || !_e2eeEnabled) {
    alert('먼저 종단간 암호화(E2EE)를 활성화해주세요.\n\n[설정 → 종단간 암호화 → 활성화]');
    return;
  }
  // 기존 recovery 데이터 검증
  try {
    const local = localStorage.getItem('soragodong_v4_e2ee_recovery');
    if (!local) {
      alert('기존 비밀번호 데이터가 없어요. 새로고침 후 다시 시도해주세요.');
      return;
    }
  } catch {}
  showE2EEChangePasswordModal();
}

function showE2EEChangePasswordModal() {
  if (document.getElementById('e2eeChangePwOverlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay show';
  overlay.style.zIndex = '10001';
  overlay.id = 'e2eeChangePwOverlay';
  overlay.innerHTML = `
    <div class="input-modal" style="max-width:400px; padding:24px;">
      <div style="font-size:18px; font-weight:700; color:var(--text); margin-bottom:8px;">🔒 비밀번호 변경</div>
      <div style="font-size:12px; color:var(--text-dim); line-height:1.7; margin-bottom:14px;">
        기존 비밀번호로 잠금을 풀고 새 비밀번호로 다시 잠궈요.<br>
        <span style="color:var(--text-soft);">데이터는 그대로 — 비밀번호만 바뀌어요.</span>
      </div>
      <div style="margin-bottom:10px; position:relative;">
        <input type="password" id="e2eeChangePwOld" placeholder="기존 비밀번호" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" style="width:100%; font-family:inherit; padding-right:40px;">
        <button type="button" onclick="_togglePwView('e2eeChangePwOld', this)" title="보기 / 숨기기" style="position:absolute; right:6px; top:50%; transform:translateY(-50%); background:transparent; border:none; cursor:pointer; padding:6px 8px; color:var(--text-soft); font-size:16px;">👁</button>
      </div>
      <div style="margin-bottom:10px; position:relative;">
        <input type="password" id="e2eeChangePwNew" placeholder="새 비밀번호 (12자 이상)" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false" style="width:100%; font-family:inherit; padding-right:40px;">
        <button type="button" onclick="_togglePwView('e2eeChangePwNew', this)" title="보기 / 숨기기" style="position:absolute; right:6px; top:50%; transform:translateY(-50%); background:transparent; border:none; cursor:pointer; padding:6px 8px; color:var(--text-soft); font-size:16px;">👁</button>
      </div>
      <div style="margin-bottom:10px; position:relative;">
        <input type="password" id="e2eeChangePwConfirm" placeholder="새 비밀번호 다시 입력" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false" style="width:100%; font-family:inherit; padding-right:40px;">
        <button type="button" onclick="_togglePwView('e2eeChangePwConfirm', this)" title="보기 / 숨기기" style="position:absolute; right:6px; top:50%; transform:translateY(-50%); background:transparent; border:none; cursor:pointer; padding:6px 8px; color:var(--text-soft); font-size:16px;">👁</button>
      </div>
      <div id="e2eeChangePwStatus" style="font-size:11px; color:var(--text-soft); margin-bottom:14px; min-height:14px;"></div>
      <div style="font-size:10px; color:var(--text-soft); line-height:1.6; margin-bottom:14px; padding:8px; background:rgba(220,80,80,0.05); border-left:3px solid rgba(220,80,80,0.40); border-radius:4px;">
        ⚠️ 새 비밀번호도 분실 시 데이터 복구 X (회사도 X). 안전한 곳에 보관해주세요.
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn-primary" onclick="submitE2EEChangePassword()" style="flex:1;">변경</button>
        <button class="btn-secondary" onclick="cancelE2EEChangePassword()" style="flex:1;">취소</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('e2eeChangePwOld')?.focus(), 100);
}

async function submitE2EEChangePassword() {
  const oldPw = document.getElementById('e2eeChangePwOld')?.value || '';
  const newPw = document.getElementById('e2eeChangePwNew')?.value || '';
  const confirmPw = document.getElementById('e2eeChangePwConfirm')?.value || '';
  const status = document.getElementById('e2eeChangePwStatus');
  if (!status) return;
  status.style.color = 'var(--text-soft)';

  if (!oldPw) { status.textContent = '기존 비밀번호를 입력해주세요'; status.style.color = '#e89090'; return; }
  if (newPw !== confirmPw) {
    status.textContent = '새 비밀번호가 일치하지 않아요';
    status.style.color = '#e89090';
    return;
  }
  if (oldPw === newPw) {
    status.textContent = '새 비밀번호가 기존과 같아요';
    status.style.color = '#e89090';
    return;
  }
  const validation = _e2eeValidatePassword(newPw);
  if (!validation.ok) {
    status.textContent = validation.reason;
    status.style.color = '#e89090';
    return;
  }

  status.textContent = '변경 중...';
  try {
    await _e2eeChangePassword(oldPw, newPw);
    status.textContent = '✓ 비밀번호 변경 완료';
    status.style.color = 'var(--success, #98c379)';
    setTimeout(() => {
      cancelE2EEChangePassword();
      if (typeof showToast === 'function') showToast('🔒 비밀번호 변경 완료');
    }, 800);
  } catch (e) {
    status.textContent = e.message || '변경 실패';
    status.style.color = '#e89090';
  }
}

function cancelE2EEChangePassword() {
  const overlay = document.getElementById('e2eeChangePwOverlay');
  if (overlay) overlay.remove();
}

// 사용자 명시 2026-05-02: 통합 모달 — 동의 4개 + 비밀번호 + 분실 경고 + Q&A. allowCancel 옵션 (자발적 활성 vs 강제).
function showE2EEPasswordSetupModal(opts) {
  opts = opts || {};
  const allowCancel = opts.allowCancel !== false;  // default true (Settings 자발적). false = 강제 (가입/legacy)
  if (document.getElementById('e2eeSetupOverlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay show';
  overlay.style.zIndex = '10001';
  overlay.id = 'e2eeSetupOverlay';
  overlay.dataset.allowCancel = allowCancel ? '1' : '0';
  const cancelButton = allowCancel ? `<button class="btn-secondary" onclick="cancelE2EESetup()" style="flex:1;">취소</button>` : '';
  // 사용자 명시 2026-05-02: 체크박스 = 동의 toggle 만 / 텍스트 + ▾ click = 자세히 펼침 토글.
  const _row = (id, label, detailHTML, extra) => `
    <div class="setup-consent-row">
      <input type="checkbox" id="${id}" onclick="event.stopPropagation()" onchange="_syncSetupAllConsent()">
      <button type="button" class="setup-consent-text" onclick="_toggleSetupConsent(this)">
        <span>${label}</span>
        <span class="setup-consent-caret">▾</span>
      </button>
    </div>
    ${extra || ''}
    <div class="setup-consent-detail" hidden>${detailHTML}</div>
  `;
  const consentSection = `
      <style>
        .setup-consent-card { margin-bottom:14px; padding:10px 14px; background:var(--surface); border:1px solid var(--border); border-radius:10px; }
        .setup-consent-card-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; }
        .setup-consent-card-title { font-size:12px; color:var(--text); font-weight:600; }
        .setup-consent-all { display:flex; gap:6px; align-items:center; cursor:pointer; font-size:11.5px; color:var(--text-dim); user-select:none; }
        .setup-consent-all input { width:13px; height:13px; accent-color:var(--accent); cursor:pointer; margin:0; }
        .setup-consent-all:hover { color:var(--text); }
        .setup-consent-row { display:flex; gap:8px; align-items:center; padding:8px 0; }
        .setup-consent-row + .setup-consent-row,
        .setup-consent-detail + .setup-consent-row { border-top:1px solid rgba(255,255,255,0.04); }
        .setup-consent-row input[type=checkbox] { margin:0; width:13px; height:13px; accent-color:var(--accent); flex-shrink:0; cursor:pointer; }
        .setup-consent-text { flex:1; display:flex; align-items:center; justify-content:space-between; gap:8px; background:transparent; border:0; padding:0; text-align:left; cursor:pointer; font-family:inherit; font-size:12.5px; color:var(--text-dim); line-height:1.55; }
        .setup-consent-text:hover { color:var(--text); }
        .setup-consent-text b { color:var(--text); }
        .setup-consent-caret { font-size:11px; color:var(--text-soft); flex-shrink:0; transition:opacity 0.15s; }
        .setup-consent-text:hover .setup-consent-caret { color:var(--accent); }
        .setup-consent-detail { margin-left:21px; margin-top:4px; margin-bottom:6px; padding:9px 12px; background:rgba(255,255,255,0.02); border-left:2px solid rgba(212,167,106,0.30); border-radius:0 6px 6px 0; font-size:11px; color:var(--text-dim); line-height:1.75; }
        .setup-consent-detail b, .setup-consent-detail strong { color:var(--text); }
        .setup-consent-detail a { color:var(--accent); }
        .setup-consent-warn { margin-left:21px; margin-top:2px; font-size:10.5px; color:#e8a3a3; padding:5px 9px; background:rgba(232,163,163,0.06); border-left:2px solid rgba(232,163,163,0.45); border-radius:0 4px 4px 0; line-height:1.55; }
      </style>
      <div class="setup-consent-card">
        <div class="setup-consent-card-header">
          <span class="setup-consent-card-title">필수 동의</span>
          <label class="setup-consent-all">
            <input type="checkbox" id="setupConsentAll" onchange="_toggleAllSetupConsents(this)">
            <span>모두 동의</span>
          </label>
        </div>
        ${_row('setupConsentTerms',
          '<span style="color:var(--accent); font-weight:600;">(필수)</span> 이용약관·개인정보처리',
          '· <a href="/terms" target="_blank">이용약관 →</a><br>· <a href="/privacy" target="_blank">개인정보처리방침 →</a>'
        )}
        ${_row('setupConsentSensitive',
          '<span style="color:var(--accent); font-weight:600;">(필수)</span> 민감정보 처리',
          '· 기분·감정·자기관찰 기록 = 법률상 민감정보 (PIPA §23)<br>· 목적: AI 자기관찰 / 패턴 정리 / 개인 모델<br>· 보유: 회원 탈퇴 시 즉시 삭제<br>· <b>E2EE 암호화</b> — 회사도 평문 접근 X'
        )}
        ${_row('setupConsentCrossBorder',
          '<span style="color:var(--accent); font-weight:600;">(필수)</span> 국외이전 (Anthropic 미국)',
          '· 이전 항목: 사용자 입력 텍스트 (체크인·일기·대화)<br>· 이전 시기: AI 호출 시점 (실시간 처리, 저장 X)<br>· 수신자: Anthropic (미국) / Supabase (미국) / Cloudflare<br>· <b>AI 학습·재활용 X</b> — Zero Data Retention (처리 후 즉시 폐기)<br>· 30일 후 자동 삭제<br>· <a href="/cross-border" target="_blank">자세히 →</a>'
        )}
        ${_row('setupConsentAdult',
          '<span style="color:var(--accent); font-weight:600;">(필수)</span> <b>만 19세 이상입니다</b>',
          '· 청소년보호법 + PIPA §22-2 + 정신건강 정보 민감성<br>· 우리 서비스 = 자기관찰·정서 기록 처리 — 미성년자 보호',
          '<div class="setup-consent-warn">⚠ 허위 시 모든 책임은 본인 (및 법정대리인)에게. 회사 즉시 계정 정지 + 데이터 삭제.</div>'
        )}
        <div style="margin-top:10px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.04); font-size:10.5px; color:var(--text-soft); line-height:1.6;">
          ※ 4개 모두 동의해야 시작 가능. 거부 시 정신건강 자기관찰 + AI 기능 이용 X (인프라 특성상 어쩔 수 없어).
        </div>
      </div>
  `;
  const qaSection = `
      <details style="margin-bottom:14px; padding:10px 12px; background:linear-gradient(135deg, rgba(126,200,227,0.06), rgba(143,200,143,0.04)); border:1px solid rgba(126,200,227,0.12); border-radius:10px;">
        <summary style="font-size:12px; color:var(--accent2); font-weight:600; cursor:pointer;">🛡️ 데이터 어떻게 다뤄?</summary>
        <div style="font-size:11.5px; color:var(--text-dim); line-height:1.7; margin-top:10px;">
          <div style="margin-bottom:8px;"><b style="color:var(--text);">Q. 내 일기가 AI 학습에 들어가?</b><br>A. <b>절대 X.</b> Anthropic Zero Data Retention — 학습·재판매·연구 등 외부 사용 불가. 30일 후 자동 삭제.</div>
          <div style="margin-bottom:8px;"><b style="color:var(--text);">Q. 개발자가 내 일기 볼 수 있어?</b><br>A. 본인 비밀번호로 잠그면 X. 단 분실 시 복구 X.</div>
          <div style="margin-bottom:8px;"><b style="color:var(--text);">Q. 광고로 팔리거나 외부에 새는 거 아냐?</b><br>A. 절대 X. 구독제로 운영.</div>
          <div style="margin-bottom:8px;"><b style="color:var(--text);">Q. 통신은 안전해?</b><br>A. HTTPS + Anthropic 보안 인증 (SOC 2 Type II / ISO 27001).</div>
          <div><b style="color:var(--text);">Q. 이거 의료·상담 앱이야?</b><br>A. 아니 — 의료·심리상담 대체 X. 위기 시 1393 / 1577-0199.</div>
        </div>
      </details>
  `;
  overlay.innerHTML = `
    <div class="input-modal" style="max-width:420px; padding:24px; max-height:90vh; overflow-y:auto;">
      <div style="font-size:18px; font-weight:700; color:var(--text); margin-bottom:8px;">🔐 비밀번호 설정</div>
      <div style="font-size:12px; color:var(--text-dim); line-height:1.7; margin-bottom:14px;">
        활성화 후 <strong>회사도 본인 데이터를 볼 수 없어</strong>.<br>
        본인이 외울 수 있는 비밀번호를 입력해줘. 다른 기기에서도 같은 비밀번호로 복원 가능.
      </div>
      ${consentSection}
      <div style="margin-bottom:10px; position:relative;">
        <input type="password" id="e2eePasswordInput" placeholder="비밀번호 (12자 이상)" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false" style="width:100%; font-family:inherit; padding-right:40px;">
        <button type="button" onclick="_togglePwView('e2eePasswordInput', this)" title="보기 / 숨기기" style="position:absolute; right:6px; top:50%; transform:translateY(-50%); background:transparent; border:none; cursor:pointer; padding:6px 8px; color:var(--text-soft); font-size:16px;">👁</button>
      </div>
      <div style="margin-bottom:10px; position:relative;">
        <input type="password" id="e2eePasswordConfirmInput" placeholder="비밀번호 다시 입력" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false" style="width:100%; font-family:inherit; padding-right:40px;">
        <button type="button" onclick="_togglePwView('e2eePasswordConfirmInput', this)" title="보기 / 숨기기" style="position:absolute; right:6px; top:50%; transform:translateY(-50%); background:transparent; border:none; cursor:pointer; padding:6px 8px; color:var(--text-soft); font-size:16px;">👁</button>
      </div>
      <div id="e2eePasswordStatus" style="font-size:11px; color:var(--text-soft); margin-bottom:14px; min-height:14px;"></div>
      <div style="font-size:10px; color:var(--text-soft); line-height:1.6; margin-bottom:14px; padding:8px; background:rgba(220,80,80,0.05); border-left:3px solid rgba(220,80,80,0.40); border-radius:4px;">
        ⚠️ 비밀번호 분실 시 데이터를 영구 복구할 수 없어. 회사도 복원 X. 안전한 곳에 보관해줘 (카톡 나에게 보내기 / 폰 메모 / 손글씨).
      </div>
      ${qaSection}
      <div style="display:flex; gap:8px;">
        <button class="btn-primary" onclick="submitE2EESetup()" style="flex:1;">활성화</button>
        ${cancelButton}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('e2eePasswordInput')?.focus(), 100);
}

async function submitE2EESetup() {
  const pw1 = document.getElementById('e2eePasswordInput')?.value || '';
  const pw2 = document.getElementById('e2eePasswordConfirmInput')?.value || '';
  const status = document.getElementById('e2eePasswordStatus');
  if (!status) return;
  // 사용자 명시 2026-05-02: 동의 4개 검증 (모달 안 통합).
  const consentTerms = document.getElementById('setupConsentTerms')?.checked;
  const consentSensitive = document.getElementById('setupConsentSensitive')?.checked;
  const consentCrossBorder = document.getElementById('setupConsentCrossBorder')?.checked;
  const consentAdult = document.getElementById('setupConsentAdult')?.checked;
  if (!consentTerms || !consentSensitive || !consentCrossBorder || !consentAdult) {
    status.textContent = '필수 동의 4개를 모두 체크해줘';
    status.style.color = '#e89090';
    return;
  }
  if (pw1 !== pw2) {
    status.textContent = '비밀번호가 일치하지 않습니다';
    status.style.color = '#e89090';
    return;
  }
  const validation = _e2eeValidatePassword(pw1);
  if (!validation.ok) {
    status.textContent = validation.reason;
    status.style.color = '#e89090';
    return;
  }
  status.textContent = '활성화 중...';
  status.style.color = 'var(--text-soft)';
  try {
    await _e2eeSetupNewUser(pw1);
    _e2eeEnabled = true;
    // 사용자 명시 2026-05-02: 동의 timestamp 넣음 (PIPA 준수).
    if (!state.preferences) state.preferences = {};
    state.preferences.consentTerms = true;
    state.preferences.consentSensitive = true;
    state.preferences.consentCrossBorder = true;
    state.preferences.consentAdult = true;
    state.preferences.consentAt = new Date().toISOString();
    state.preferences.consentVersion = '2.0';
    await saveToCloudNow();
    refreshE2EEStatus();
    const overlay = document.getElementById('e2eeSetupOverlay');
    if (overlay) overlay.remove();
    showToast('🔐 E2EE 활성화 완료 — 회사조차 귀하의 데이터를 열람할 수 없습니다');
    // 사용자 보고 2026-04-30 + V203 (chooser 폐기): E2EE setup 닫힌 후 firstTimeIntro 재트리거 (silent 환영 보너스 + 자동 코어 튜토리얼 진입).
    setTimeout(() => {
      if (typeof maybeShowFirstTimeIntro === 'function') {
        maybeShowFirstTimeIntro().catch(e => console.warn('firstTimeIntro after e2ee:', e));
      }
    }, 700);
  } catch (e) {
    status.textContent = '실패: ' + (e.message || e);
    status.style.color = '#e89090';
  }
}

function cancelE2EESetup() {
  const overlay = document.getElementById('e2eeSetupOverlay');
  if (overlay) overlay.remove();
  // dismiss 적용됨 — 다음 진입 시 자동 권유 X (Settings에서 명시 활성 가능)
  try { localStorage.setItem('soragodong_v4_e2ee_setup_dismissed', new Date().toISOString()); } catch {}
  // 사용자 보고 2026-04-30 + V203 (chooser 폐기): cancel 후에도 firstTimeIntro 재트리거 (silent 환영 보너스 + 자동 코어 튜토리얼 진입).
  setTimeout(() => {
    if (typeof maybeShowFirstTimeIntro === 'function') {
      maybeShowFirstTimeIntro().catch(e => console.warn('firstTimeIntro after e2ee cancel:', e));
    }
  }, 600);
}

// 비밀번호 안내 (이미 활성된 사용자) — 사용자 요청 2026-04-30 password 단순화 후 wording.
async function showE2EERecoveryInfo() {
  try {
    const recovery = JSON.parse(localStorage.getItem('soragodong_v4_e2ee_recovery') || 'null');
    if (!recovery) {
      alert('아직 종단간 암호화(E2EE)가 활성화되지 않았어요.\n\n위의 [🔐 E2EE 활성화] 버튼을 먼저 눌러주세요.');
      return;
    }
    alert(
      '비밀번호는 보안상 이 기기에 그대로 저장되어 있지 않습니다.\n\n' +
      '활성화하실 때 본인이 직접 입력하신 비밀번호를 기억해두셔야 합니다.\n' +
      '추천: 카톡 나에게 보내기 / 폰 메모 앱 / 손글씨 메모.\n\n' +
      '✓ 비밀번호 기억하시면:\n' +
      '   다른 기기에서 같은 이메일로 로그인 후 비밀번호 입력 → 데이터 복원.\n\n' +
      '⚠️ 비밀번호 분실 시:\n' +
      '   새 기기에서는 본인의 데이터에 접근하실 수 없습니다 (회사도 복구해드릴 수 없습니다).\n' +
      '   현재 사용 중인 이 기기에서는 계속 사용 가능합니다.\n\n' +
      '안전을 위해 [📁 파일로 백업] 도 권장드립니다.'
    );
  } catch (e) {
    alert('확인 실패: ' + (e.message || e));
  }
}

// E2EE 상태 표시 갱신
function refreshE2EEStatus() {
  const status = document.getElementById('e2eeStatus');
  if (!status) return;
  if (_e2eeEnabled && _e2eeMasterKey) {
    status.innerHTML = '✅ <b style="color:#9ed4a0;">활성화됨</b> — 회사도 본인 데이터 볼 수 없음';
  } else {
    status.innerHTML = '⚠️ 미활성 — 회사 (관리자 1명)가 시스템상 데이터 접근 가능';
  }
}

// password 입력 → 암호화된 마스터 키 복호화 → 마스터 키 복원 (새 device 진입 시).
async function _e2eeRestoreFromPassphrase(password) {
  // 사용자 보고 2026-04-30 ultrathink 진단: localStorage e2ee_recovery 만 보면 cloud sync 분기 / 비번 변경 부분-갱신 / mk rotate 잔여 케이스에서 unwrap 실패.
  // multi-source fallback — localStorage + cloud(me_v4 / me_v4_backup / auto_backup / manual_backup) 의 _e2eeRecovery 다 시도.
  // 어느 한 source 가 사용자 비번 + cloud body decrypt 둘 다 통과하면 그게 truth → master key 넣음.
  const candidates = [];
  // (a) localStorage
  try {
    const local = JSON.parse(localStorage.getItem('soragodong_v4_e2ee_recovery') || 'null');
    if (local && local.salt && local.encryptedMasterKey) {
      candidates.push({ source: 'localStorage', salt: local.salt, encryptedMasterKey: local.encryptedMasterKey });
    }
  } catch {}
  // (b) cloud rows — main + backup 들
  if (typeof authUserId === 'string' && authUserId && typeof SUPABASE_URL === 'string') {
    const cloudIds = [V4_USER_ID, V4_TESTER_BACKUP_USER_ID, V4_AUTO_BACKUP_USER_ID, V4_MANUAL_BACKUP_USER_ID];
    for (const uid of cloudIds) {
      try {
        const resp = await fetch(
          `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${uid}&select=data&limit=1`,
          { headers: authHeaders() }
        );
        if (!resp.ok) continue;
        const rows = await resp.json();
        const rec = rows[0] && rows[0].data && rows[0].data._e2eeRecovery;
        if (rec && rec.salt && rec.encryptedMasterKey) {
          const dup = candidates.some(c => c.salt === rec.salt && c.encryptedMasterKey === rec.encryptedMasterKey);
          if (!dup) candidates.push({ source: 'cloud:' + uid, salt: rec.salt, encryptedMasterKey: rec.encryptedMasterKey });
        }
      } catch (e) { console.warn('[e2ee] cloud recovery fetch 실패 (' + uid + '):', e); }
    }
  }
  if (candidates.length === 0) {
    const err = new Error('NO_RECOVERY');
    err.code = 'NO_RECOVERY';
    throw err;
  }
  console.log('[e2ee] recovery 후보 ' + candidates.length + '개:', candidates.map(c => c.source));
  // 각 후보 시도 — 비번 unwrap + cloud body decrypt 둘 다 통과해야 truth.
  // 사용자 보고 2026-04-30 review (agent): unwrap 만 성공한 fallback 적용 시 stale master key 가 localStorage 에 영구 저장 → reload 사이클 무한 반복 risk. 제거.
  // unwrap OK + cloud body 실패 = master key 와 cloud body 가 별도 wrap 된 상태 — 평문 backup 복원 (forgot-password) 흐름으로 유도가 안전.
  const cloudBody = window._e2eePendingRecovery && window._e2eePendingRecovery._encryptedBody;
  for (const cand of candidates) {
    try {
      const passwordKey = await _e2eePassphraseToKey(password, cand.salt);
      const masterKeyB64 = await _e2eeDecrypt(cand.encryptedMasterKey, passwordKey);
      if (!masterKeyB64) continue;  // 이 source 비번 mismatch
      const masterKey = await _e2eeImportKey(masterKeyB64);
      // cloud body verify — 통과해야만 valid
      if (cloudBody) {
        let bodyOk = false;
        try {
          const test = await _e2eeDecrypt(cloudBody, masterKey);
          bodyOk = !!test;
        } catch (e) {
          console.warn('[e2ee] ' + cand.source + ' cloud body decrypt 예외:', e);
        }
        if (!bodyOk) {
          console.warn('[e2ee] ' + cand.source + ' unwrap OK 인데 cloud body decrypt 실패. 다음 후보 시도. (이 master key 는 저장 X — stale risk 회피)');
          continue;
        }
      }
      // 성공 — master key 저장하고 recovery 도 best source 로 갱신.
      // 사용자 보고 2026-05-02 ultrathink: PWA standalone 의 sessionStorage 매 진입 cleanup → localStorage 으로 후퇴.
      _e2eeMasterKey = masterKey;
      localStorage.setItem(_E2EE_LOCAL_KEY, masterKeyB64);
      sessionStorage.removeItem(_E2EE_LOCAL_KEY);  // Phase 0 잔여 정리
      localStorage.setItem('soragodong_v4_e2ee_recovery', JSON.stringify({ salt: cand.salt, encryptedMasterKey: cand.encryptedMasterKey }));
      console.log('[e2ee] master key 복원 성공 (source: ' + cand.source + ', cloud body verify: ' + !!cloudBody + ')');
      return masterKey;
    } catch (e) {
      console.warn('[e2ee] ' + cand.source + ' 시도 예외:', e);
      continue;
    }
  }
  console.warn('[e2ee] 모든 recovery 후보 (' + candidates.length + '개) — 어느 것도 비번 unwrap + cloud body decrypt 둘 다 통과 X. 비번 mismatch 또는 mk/recovery 분기 (forgot-password 권장).');
  return null;
}

