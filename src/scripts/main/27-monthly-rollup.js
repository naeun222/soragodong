// ═══════════════════════════════════════════════════════════════
// V3.12: 월간 자동 통합 — 매월 1-7일, 지난 달 데이터 있으면 AI가 자동 정리
// ═══════════════════════════════════════════════════════════════
// V4-1y-1: 분기 헬퍼 + 데이터 집계 (V4 비전 7.9·7.10 + anchor 3 다차원 진전 비교)
function getQuarterKey(date) {
  const d = (typeof date === 'string') ? new Date(date) : date;
  const Q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${Q}`;
}

function getQuarterRange(quarterKey) {
  const m = String(quarterKey).match(/^(\d{4})-Q(\d)$/);
  if (!m) return null;
  const year = parseInt(m[1]);
  const Q = parseInt(m[2]);
  const startMonth = (Q - 1) * 3;
  const start = new Date(year, startMonth, 1);
  const end = new Date(year, startMonth + 3, 0, 23, 59, 59);
  return { start, end };
}

// 사용자 요청 2026-04-29: 분기 → 계절 라벨 변환 헬퍼
// Q1=봄(🌸), Q2=여름(☀️), Q3=가을(🍂), Q4=겨울(❄️)
const SEASON_LABELS = {
  Q1: { name: '봄',   emoji: '🌸', months: '1~3월' },
  Q2: { name: '여름', emoji: '☀️', months: '4~6월' },
  Q3: { name: '가을', emoji: '🍂', months: '7~9월' },
  Q4: { name: '겨울', emoji: '❄️', months: '10~12월' }
};
function quarterToSeason(quarterKey) {
  // '2026-Q1' → { name:'봄', emoji:'🌸', year: 2026, q: 'Q1', label: '2026년 봄' }
  const m = String(quarterKey || '').match(/^(\d{4})-Q(\d)$/);
  if (!m) return null;
  const year = m[1];
  const q = 'Q' + m[2];
  const info = SEASON_LABELS[q];
  if (!info) return null;
  return { ...info, year, q, label: `${year}년 ${info.name}` };
}
function seasonLabelOf(quarterKey, opts) {
  // opts: { withYear: true (default), withEmoji: false }
  const s = quarterToSeason(quarterKey);
  if (!s) return quarterKey || '';
  const wy = !opts || opts.withYear !== false;
  const we = opts && opts.withEmoji;
  return `${we ? s.emoji + ' ' : ''}${wy ? s.year + '년 ' : ''}${s.name}`;
}

// 분기 통계 — 6 비교 축 (V4 비전 7.10):
// 1. 8 차원 자체 (problems↓ / strengths↑) / 2. 추적 항목 / 3. 모드 빈도
// 4. 진화율 / 5. 진주 수 / 6. growth 차원
function getQuarterlyStats(quarterKey) {
  const range = getQuarterRange(quarterKey);
  if (!range) return null;
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();
  const inRange = (iso) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= startMs && t <= endMs;
  };

  // 진화율 (V4 attempts 기준)
  const cards = (state.topicCards || []).filter(c => c.category === 'strategy');
  let attempts = 0, worked = 0;
  cards.forEach(c => {
    (c.generations || []).forEach(g => {
      (g.attempts || []).forEach(a => {
        if (inRange(a.at)) {
          attempts++;
          if (a.status === 'worked') worked++;
        }
      });
    });
  });
  const workRate = attempts > 0 ? worked / attempts : null;

  // 진주 수
  const pearls = (state.pearls || []).filter(p => p.type !== 'dna_pearl' && inRange(p.createdAt)).length;
  const dnaPearls = (state.pearls || []).filter(p => p.type === 'dna_pearl' && inRange(p.createdAt)).length;

  // 모드 빈도 (entry.modes 기반)
  const modeCount = {};
  (state.entries || []).forEach(e => {
    if (!e.date) return;
    // entry.date는 YYYY-MM-DD — 분기 범위 매칭
    const eDate = new Date(e.date + 'T12:00:00').getTime();
    if (eDate < startMs || eDate > endMs) return;
    const ms = e.modes || {};
    Object.keys(ms).forEach(k => { if (ms[k]) modeCount[k] = (modeCount[k] || 0) + 1; });
  });

  // 추적 항목 변화 (kind='numeric' baseline → latest)
  const trackerStats = (state.projects || []).filter(p => p.measurements && p.measurements.length).map(p => {
    const inRangeMs = (p.measurements || []).filter(m => inRange(m.at));
    if (!inRangeMs.length) return null;
    const first = inRangeMs[0]?.value;
    const last = inRangeMs[inRangeMs.length - 1]?.value;
    return { title: p.title, unit: p.unit, first, last, count: inRangeMs.length };
  }).filter(Boolean);

  // 8 차원 — 분기 시점에 추가된 problems / strengths 수
  // 사용자 명시 2026-05-26 ultrathink: cf 5차원 객체 통일 후속 — count 정확화 (옛 string 만 count 폐기).
  //   직전 commit a2bc5d8 에서 cf 5차원이 객체 형태로 통일됨. 옛 `typeof p === 'string'` 가드는 객체 항목 0 처리 → 통계 과소.
  //   truthy + text 추출로 변경 — string + 객체 mixed 양쪽 count.
  const cf = state.caseFormulation || {};
  const _hasText = (p) => {
    if (!p) return false;
    const text = typeof p === 'string' ? p : (p && (p.text || p.name)) || '';
    return !!text && text.trim().length > 0;
  };
  const problemsAdded = (cf.problems || []).filter(_hasText).length;
  const strengthsAdded = (cf.strengths || []).filter(_hasText).length;
  // growth 차원
  const growthCount = (cf.growth || []).filter(_hasText).length;

  // entries 수 (체크인 일수)
  const checkins = (state.entries || []).filter(e => {
    if (!e.date) return false;
    const eDate = new Date(e.date + 'T12:00:00').getTime();
    return eDate >= startMs && eDate <= endMs;
  }).length;

  return {
    quarterKey,
    range: { start: range.start.toISOString(), end: range.end.toISOString() },
    attempts, worked, workRate,
    pearls, dnaPearls,
    modeCount,
    trackerStats,
    problemsTotal: problemsAdded,
    strengthsTotal: strengthsAdded,
    growthCount,
    checkins
  };
}

// 사용자 명시 2026-05-02 ultrathink: 분기 리뷰 batch path 재사용 위해 prompt builder 분리.
function _collectQuarterlyData(quarterKey, stats) {
  const cards = (state.topicCards || []).filter(c => c.category === 'strategy');
  const recentEmbodied = cards.filter(c => c.embodimentStatus === 'embodied').length;
  const prevQR = state.quarterlyReviews || [];
  const prevSeeds = prevQR.length > 0 ? (prevQR[prevQR.length - 1].seeds || []) : [];

  const range = getQuarterRange(quarterKey);
  let entriesIn = [], chatIn = [], topicCardsIn = [], pearlsIn = [], archiveIn = [], insightsIn = [], chaptersIn = [];
  if (range) {
    const startMs = range.start.getTime();
    const endMs = range.end.getTime();
    const inMs = (dt) => { if (!dt) return false; const t = new Date(dt).getTime(); return t >= startMs && t <= endMs; };
    entriesIn = (state.entries || []).filter(e => {
      if (!e.date) return false;
      const t = new Date(e.date + 'T12:00:00').getTime();
      return t >= startMs && t <= endMs;
    });
    chatIn = (state.chatMessages || []).filter(m => m.timestamp && m.role === 'user' && inMs(m.timestamp)).slice(-40);
    topicCardsIn = (state.topicCards || []).filter(t => !t._deleted && inMs(t.createdAt));
    pearlsIn = (state.pearls || []).filter(p => !p._deleted && inMs(p.createdAt));
    // 사용자 명시 2026-05-06: 메모 type 은 quarterly rollup 에서 제외 (순수 메모)
    archiveIn = (state.archive || []).filter(a => !a._deleted && a.type !== 'memo' && !a._excludeFromAI && inMs(a.savedAt || a.createdAt));
    insightsIn = (state.insights || []).filter(i => !i._deleted && inMs(i.discoveredAt || i.createdAt));
    chaptersIn = (state.chatArchive || []).filter(c => !c._deleted && inMs(c.generatedAt || c.createdAt || (c.date ? c.date + 'T12:00:00' : null)));
  }
  // 사용자 명시 2026-05-10 (큐 6 batch 8): 분기 review 에 추적 항목 (state.projects) inject — fact 기반.
  let trackingFacts = [];
  if (range) {
    const startMs = range.start.getTime();
    const endMs = range.end.getTime();
    const _projects = (state.projects || []).filter(p => p && !p._deleted);
    const _moodMap = new Map();
    (state.entries || []).forEach(e => { if (e.date && typeof e.mood === 'number') _moodMap.set(e.date, e.mood); });
    const _avg = (arr) => arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length;
    const _entryDatesIn = entriesIn.map(e => e.date).filter(Boolean);
    _projects.forEach(p => {
      const _checkins = Array.isArray(p.checkins) ? p.checkins : [];
      const _checked = new Set(_checkins.filter(c => c && c.date && new Date(c.date + 'T12:00:00').getTime() >= startMs && new Date(c.date + 'T12:00:00').getTime() <= endMs).map(c => c.date));
      const _meas = Array.isArray(p.measurements) ? p.measurements.filter(m => m && m.at && new Date(m.at).getTime() >= startMs && new Date(m.at).getTime() <= endMs) : [];
      if (_checked.size === 0 && _meas.length === 0) return;
      const _moodOn = _entryDatesIn.filter(d => _checked.has(d)).map(d => _moodMap.get(d)).filter(v => typeof v === 'number');
      const _moodOff = _entryDatesIn.filter(d => !_checked.has(d)).map(d => _moodMap.get(d)).filter(v => typeof v === 'number');
      const _onAvg = _avg(_moodOn);
      const _offAvg = _avg(_moodOff);
      const _corr = (_onAvg !== null && _offAvg !== null) ? (_onAvg - _offAvg) : null;
      const _prog = (_meas.length > 0 && p.target != null && p.baseline != null)
        ? `${_meas[_meas.length - 1].value} (목표 ${p.target}, 시작 ${p.baseline})`
        : null;
      trackingFacts.push({
        title: p.title || '추적 항목',
        type: _meas.length > 0 ? 'measurement' : 'check',
        checkedDays: _checked.size,
        totalDaysInRange: _entryDatesIn.length,
        moodCorrelation: _corr,
        progress: _prog,
      });
    });
  }
  return { quarterKey, stats, recentEmbodied, prevSeeds, entriesIn, chatIn, topicCardsIn, pearlsIn, archiveIn, insightsIn, chaptersIn, trackingFacts };
}

function _buildQuarterlyReviewPrompt(quarterKey, stats, data) {
  const _data = data || _collectQuarterlyData(quarterKey, stats);
  const { recentEmbodied, prevSeeds, entriesIn, chatIn, topicCardsIn, pearlsIn, archiveIn, insightsIn, chaptersIn } = _data;
  // 사용자 명시 2026-05-10 (메커니즘 일관 — weekly/monthly 와 동일): quarterKey idempotent skip — 같은 분기 review 이미 있으면 null. 사용자 click 두 번 방지.
  if (quarterKey && (state.quarterlyReviews || []).some(r => r.quarterKey === quarterKey)) {
    return null;
  }
  // 사용자 명시 2026-05-08 ultrathink: 마지막 quarterly review 이후 새 데이터 1개라도 있어야 trigger.
  const lastReview = (state.quarterlyReviews || []).slice().sort((a, b) =>
    new Date(b.completedAt || b.createdAt || 0) - new Date(a.completedAt || a.createdAt || 0)
  )[0];
  if (lastReview) {
    const lastAt = new Date(lastReview.completedAt || lastReview.createdAt || 0);
    const lastISO = lastAt.toISOString().split('T')[0];
    const hasNewSinceLast =
      (state.entries || []).some(e => e.date && e.date > lastISO) ||
      (state.chatMessages || []).some(m => m && m.role === 'user' && !m.typing && !m.error && m.timestamp && new Date(m.timestamp) > lastAt) ||
      (state.archive || []).some(a => a && !a._deleted && a.savedAt && new Date(a.savedAt) > lastAt) ||
      (state.missions || []).some(m => m && m.createdAt && new Date(m.createdAt) > lastAt) ||
      (state.pearls || []).some(p => p && !p._deleted && p.createdAt && new Date(p.createdAt) > lastAt) ||
      (state.topicCards || []).some(t => t && !t._deleted && t.createdAt && new Date(t.createdAt) > lastAt);
    if (!hasNewSinceLast) return null;
  }
  // 사용자 명시 2026-05-02 ultrathink (ERROR #9): entries 0개 = null return → caller skip.
  if (!entriesIn || entriesIn.length === 0) return null;

  // 사용자 명시 2026-05-11 ultrathink: review_quarterly stable system (JSON schema ~60줄) backend 이전.
  //   functions/api/_lib/prompts/review-systems.ts REVIEW_QUARTERLY_SYSTEM. backend 가 _endpoint='review_quarterly' 매칭하여 강제 inject.
  //   volatile (사용자 데이터) 만 user message 로 전송 — cache 적용 X (매번 변동).

  const volatile = `지난 분기 ${quarterKey} 리뷰 작성.

[지난 분기 stats]
- 체크인: ${stats.checkins}일
- 효과 본 시도: ${stats.workRate != null ? Math.round(stats.workRate * 100) + '% (' + stats.worked + '/' + stats.attempts + ')' : '데이터 부족'}
- 진주: ${stats.pearls}개${stats.dnaPearls ? ` + DNA 진주 ${stats.dnaPearls}개 결정화` : ''}
- 활성 모드 빈도: ${Object.entries(stats.modeCount).map(([k, v]) => `${k} ${v}일`).join(' / ') || '거의 없음'}
- 추적 항목 변화: ${stats.trackerStats.map(t => `${t.title} ${t.first}→${t.last}${t.unit || ''}`).join(' / ') || '데이터 부족'}
- 너의 결: 짚어본 곳 ${stats.problemsTotal} / 잘 풀린 곳 ${stats.strengthsTotal} / 자라는 곳 ${stats.growthCount}
- 체화 완료 가닥 (누적): ${recentEmbodied}개

[분기 entries 발췌]
${JSON.stringify(entriesIn.slice(-30), null, 0).slice(0, 4500)}

[분기 대화 발췌 (사용자)]
${chatIn.map(m => m.content.slice(0, 200)).join('\n---\n').slice(0, 3500)}

[분기 챕터]
${JSON.stringify(chaptersIn.map(c => ({date: c.date, messageCount: c.messageCount})), null, 0).slice(0, 1800)}

[분기 가닥(topicCards)]
${JSON.stringify(topicCardsIn.map(t => ({title: t.title, summary: t.summary, category: t.category})), null, 0).slice(0, 1800)}

[분기 진주]
${JSON.stringify(pearlsIn.map(p => ({content: p.content, note: p.note})), null, 0).slice(0, 1200)}

[분기 스크랩(archive)]
${JSON.stringify(archiveIn.map(a => ({headline: a.headline, body: (a.body || '').slice(0, 200), tags: a.tags, starred: a.starred})), null, 0).slice(0, 1500)}

[분기 인사이트]
${JSON.stringify(insightsIn.map(i => ({content: i.content, type: i.type})), null, 0).slice(0, 1000)}

[지난 분기 씨앗] ${prevSeeds.length > 0 ? '(callback 추천)' : '(첫 분기 또는 씨앗 X)'}
${prevSeeds.length > 0 ? prevSeeds.map(s => '· ' + s).join('\n') : ''}
${(_data.trackingFacts && _data.trackingFacts.length > 0) ? `
[이 분기 추적 항목] (사용자 명시 2026-05-10 — 행동 actual 데이터. 변화·강점·위험 신호 추출 시 활용.)
${_data.trackingFacts.map(f => {
  const _corr = (typeof f.moodCorrelation === 'number')
    ? (f.moodCorrelation > 0.3 ? ` · 한 날 기분 한결 좋음 (+${f.moodCorrelation.toFixed(1)})` : f.moodCorrelation < -0.3 ? ` · 한 날 기분 살짝 무거움 (${f.moodCorrelation.toFixed(1)})` : '')
    : '';
  const _prog = f.progress ? ` · 진척: ${f.progress}` : '';
  const _check = f.type === 'check' ? `${f.checkedDays}/${f.totalDaysInRange}일 체크${_corr}` : (f.type === 'measurement' ? '측정형' : '');
  return `- "${f.title}" — ${_check}${_prog}`;
}).join('\n')}

[활용 가이드]
- 추적 항목 = 사용자 행동 사실. transformation / pattern / strengths / risk_signals 추출 시 evidence.
- 모델 자체 추측 X — 위 fact 그대로 인용.` : ''}

위 데이터로 분기 리뷰 작성. JSON만 출력.`;

  return {
    // 사용자 명시 2026-05-11 ultrathink: stable system 자체는 backend (review-systems.ts) 가 강제 inject — client system 비움.
    system: undefined,
    model: 'claude-sonnet-4-6',
    max_tokens: 2500,
    userMessage: volatile,
    _endpoint: 'review_quarterly'
  };
}

function _processQuarterlyReviewResult(jsonText) {
  return _robustJsonExtract(jsonText);
}

// V4-1y-2: 분기 리뷰 AI 생성 — collect → build → callAnthropic → process (단순 wrapper).
async function generateQuarterlyReview(quarterKey, stats) {
  const data = _collectQuarterlyData(quarterKey, stats);
  const promptSpec = _buildQuarterlyReviewPrompt(quarterKey, stats, data);
  if (!promptSpec) throw new Error('이 분기 데이터가 없어서 리뷰를 생성할 수 없어요');

  const resp = await callAnthropic({
    _endpoint: promptSpec._endpoint,
    model: promptSpec.model,
    max_tokens: promptSpec.max_tokens,
    system: promptSpec.system,
    messages: [{ role: 'user', content: promptSpec.userMessage }]
  });
  if (!resp.ok) throw new Error('API ' + resp.status);
  const respData = await resp.json();
  const text = respData?.content?.[0]?.text || '';
  const result = _processQuarterlyReviewResult(text);
  // 사용자 명시 2026-05-09 ultrathink: quotes 환각 방지 — quotes / transformation.start_quote / end_quote 검증.
  if (result && typeof _filterValidQuotes === 'function') {
    const sources = _collectQuoteSources(data);
    if (Array.isArray(result.quotes)) {
      result.quotes = _filterValidQuotes(result.quotes, sources);
    }
    if (result.transformation && typeof result.transformation === 'object') {
      result.transformation.start_quote = _verifySingleQuote(result.transformation.start_quote, sources);
      result.transformation.end_quote = _verifySingleQuote(result.transformation.end_quote, sources);
    }
  }
  return result;
}

// 사용자 명시 2026-05-01 ultrathink: 옛 자동 review trigger 함수 3종 (runQuarterly/Monthly/AnnualAutoReviewIfNeeded) 완전 제거.
// 리뷰 카드 click 으로만 생성 (openReview / openQuarterlyReviewCard / openAnnualReviewCard).

// V4 (사용자 명시 2026-05-25 ultrathink): inline diary path (runDiaryAutoSummaryIfNeeded + summarizeDayForEntry) 재폐기.
//   배경: c75af50 에서 batch raw passthrough broken 으로 임시 복원 → c612f5c (chat-batch.ts backend 합성 + _endpoint strip) 후 batch path 정상 작동 확인 (cleanup batch submitted ✓) → inline 재폐기.
//   batch path 단독 — _buildDiaryBatchRequests (30-force-analyze.js) 가 4AM cutoff 통과 시 chapter+topic+diary 한 batch_id 묶음.
//   _aiSummaryFailed sentinel 은 _resumeChapterCleanupBatch 의 diary 분기가 영구 마킹.
//   _pendingDiarySummary race marker / inline retry guard 모두 폐기 — batch lastChapterCleanupAt stamp 가 24h cooldown 자연 역할.

// diary summary prompt builder — _buildDiaryBatchRequests (30-force-analyze.js) 가 호출.
function _buildDiarySummaryPrompt(date, messages, entry) {
  const dateLabel = new Date(date).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
  });

  const checkinParts = [];
  if (entry.modes) {
    // V4 fix (사용자 보고 2026-05-21 ultrathink): raw key (period/exam/travel/sick/rest) 직렬화 시 AI 가 영어 'period' → '시험 기간' 등 hallucinate.
    //   20-system-prompt.js:157 의 modeMap 과 동일 한국어 변환 적용. daily summary prompt 가 그 누락된 path.
    const _modeMap = { exam: '📚 마감/시험', travel: '✈️ 여행 중', sick: '🤒 아픔', rest: '🏖 휴식', period: '🩸 월경' };
    const activeModes = Object.keys(entry.modes).filter(k => entry.modes[k]);
    if (activeModes.length) checkinParts.push(`모드: ${activeModes.map(k => _modeMap[k] || k).join(', ')}`);
  }
  if (entry.vitality != null) checkinParts.push(`활력: ${entry.vitality}/5`);
  if (entry.mood != null) checkinParts.push(`기분: ${entry.mood}/5`);
  if (entry.sleepStart && entry.sleepEnd) checkinParts.push(`수면: ${entry.sleepStart}~${entry.sleepEnd}`);
  if (entry.note && entry.note.trim()) checkinParts.push(`체크인 메모: ${entry.note.trim()}`);
  const checkinSummary = checkinParts.length ? checkinParts.join(' / ') : '체크인 정보 없음';

  const chatLog = messages.length > 0 ? messages.map(m => {
    const role = m.role === 'user' ? '나' : '소라';
    let content = m.content || '';
    content = content.replace(/```json[\s\S]*?```/g, '').trim();
    content = content.replace(/\{[\s\S]*"(?:new_traits|new_values)[\s\S]*\}\s*$/g, '').trim();
    return `${role}: ${content}`;
  }).join('\n\n').slice(0, 6000) : '대화 없음';

  // 사용자 명시 2026-05-11 ultrathink: prompt template backend 이전 — buildDailySummary 가 합성.
  return {
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    _vars: { dateLabel, checkinSummary, chatLog },
    _endpoint: 'daily_summary'
  };
}

// diary summary 결과 처리 — 단순 text trim.
function _processDiarySummaryResult(text) {
  return (text || '').trim();
}

