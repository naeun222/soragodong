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
  const cf = state.caseFormulation || {};
  const problemsAdded = (cf.problems || []).filter(p => typeof p === 'string').length;  // V3은 string
  const strengthsAdded = (cf.strengths || []).filter(s => typeof s === 'string').length;
  // growth 차원
  const growthCount = (cf.growth || []).length;

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

  // 사용자 명시 2026-05-09 ultrathink: stable (가이드 / 톤 / 출력 schema) → cache_control ephemeral.
  // volatile (stats / entries / chat / 지난 씨앗) 만 매번 다름. 90% 비용↓.
  const stable = `너는 사용자의 분기 리뷰를 작성한다.

[목표]
- 단순 stats 요약 X. **변곡점 (turning point)** 발견 — 분기 내 큰 변화 / 결정 / 정체성 shift.
- 사용자 본인의 인용 → 자기친밀감 (실제로 entry/대화에 있는 말만, 합성 X).
- **분기의 너를 한 단어로 명명** (정체성 hook).
- 다음 분기 씨앗 적용 → 리뷰 간 continuity.
- **변화 (transformation)** — 분기 시작과 끝의 너를 사용자 자신의 말로 비교.
- **anchor (continuity)** — 변하지 않은 정체성 1줄. 변화만 강조하면 사용자 멀미.

[패턴 발견 — Detective]
mode + entries + 가닥 outcomes 교차 봐. 구체적 숫자/인용으로 입증.

[일상어 강제]
- 수치 약어 / 분석가 어휘 절대 X. 일상 한국어 그대로.
- BAD: "+30%", "std dev", "correlation"
- GOOD: "더 자주 그랬어", "평균 7시간 잤어 → 7시간 잔 날들이 많았어"

[톤]
관찰 친화. 외재화 / 균형 노출. 칭찬 inflation X. 사실 관찰 ○. 친구 톤 (반말 OK).

[risk_signals 가드 — 사용자 명시 2026-05-09 ultrathink: 분기도 위기 감지]
3개월 단위 mood 지속 drop / 수면 심하게 불규칙 / 사람 만남 X 패턴 / 미션 연속 missed 등 = level 'watch' 또는 'concern'.
concern 시 위기 채널 안내 (1393 자살예방, 1577-0199 정신건강, 119) 자동 inject.

[출력 — JSON만, 마크다운 X]
{
  "one_word": "이번 분기의 너 = 한 단어 (예: \\"탐험가\\", \\"잠수부\\", \\"건축가\\")",
  "summary": "분기 핵심 한 문장 (40-80자, specific)",
  "pattern": {
    "headline": "발견한 패턴 한 문장",
    "evidence": "구체적 근거 — entry 인용 또는 숫자 (일상어)",
    "condition": "어떤 조건/모드/시간 (1줄, 일상어)"
  },
  "turning_point": "분기 내 변곡점 — 가장 큰 변화 / 결정 / 정체성 shift. 가능하면 entry 인용. 2-4문장.",
  "transformation": {
    "start_quote": "분기 첫 2주 entries / 대화에서 실제 사용자 인용 — 그때의 너 (30자 이내, 따옴표 X). 매칭 안 되면 빈 문자열.",
    "end_quote": "분기 끝 2주 entries / 대화에서 실제 사용자 인용 — 지금의 너 (30자 이내). 매칭 안 되면 빈 문자열.",
    "shift": "X에서 Y로 한 줄 (15-30자, 자연 한국어). 예: '자책에서 관찰로', '회피에서 마주봄으로', '버티기에서 흐름으로'. 추상 어휘 X 사용자 어휘 ○."
  },
  "continuity": "분기 내내 안 변한 너의 한 가지 (정체성 anchor) — 사용자 어휘. 1줄, 따뜻한 톤. 예: '그래도 매일 한 줄 일기는 남겼어', '엄마 챙기는 마음은 그대로'.",
  "quotes": ["짧은 인용 0-5개 (entries / 대화에서 실제로 있는 것만, 각 30자 이내). 데이터 부족하면 0개 OK — 합성 절대 X.", "..."],
  "experiment": {
    "what": "다음 분기 한 가지 작은 실험 (구체적, 환경 setup 우선)",
    "why": "왜 흥미로울지"
  },
  "seeds": ["다음 분기 watch point 1 (구체적, observable)", "...2"],
  "seed_callbacks": "지난 분기 씨앗이 어떻게 됐는지 (1-3문장). 첫 분기 또는 씨앗 X 면 빈 문자열.",
  "risk_signals": {
    "level": "'none' | 'watch' | 'concern' — 분기 단위 패턴 기반.",
    "signals": ["감지된 신호 (구체, 부드럽게). 'none' 일 때 빈 array.", "..."],
    "suggestion": "부드러운 제안 1줄. concern 시 위기 채널 안내 (1393 자살예방, 1577-0199 정신건강, 119) 포함. watch 면 self-care. none 이면 빈 문자열."
  }
}

[금지]
- "잘했다 / 멋지다" 류 칭찬 X
- 단정 X
- 마크다운 X

JSON만 출력. 모든 필수 필드 다 채워서 (값 없으면 빈 문자열 또는 빈 array).`;

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
    system: [{ type: 'text', text: stable, cache_control: { type: 'ephemeral' } }],
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
  const text = respData.content[0].text;
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

// V3.13.x: 일기 자동 요약 — entry 있는데 diary/aiSummary 둘 다 없는 날 보강 (어제부터 7일 거슬러, 1회 1일치)
// 사용자 명시 2026-05-02 ultrathink (A 옵션): batch 활성 + 처리 중 시 skip — batch에서 처리.
async function runDiaryAutoSummaryIfNeeded() {
  if (!_canAI()) return;
  // batch 처리 중 = 같은 batch 안 diary request 가 처리 중. inline race 차단.
  if (typeof FEATURE_BATCH_DIARY !== 'undefined' && FEATURE_BATCH_DIARY
      && state.pendingBatch && state.pendingBatch.batch_id) {
    return;
  }

  // V3.13.x: 04:00 cutoff 기준 어제부터 거꾸로
  for (let i = 1; i <= 7; i++) {
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    noon.setDate(noon.getDate() - i);
    const dateKey = getDayKey(noon);

    const entry = (state.entries || []).find(e => e.date === dateKey);
    if (!entry) continue;
    if (entry.diary) continue;
    if (entry.aiSummary) continue;
    if (entry._pendingDiarySummary) continue;  // batch 가 처리 중 — race 차단
    // 사용자 보고 2026-05-04 (B16): testerMode 아닐 때 시드 entry 제외 — '엄마 김치찌개' 등 더미 데이터 요약 노출 차단.
    const _isTesterDS = !!(state.preferences && state.preferences.testerMode);
    if (!_isTesterDS && entry._seed) continue;

    let messages = (state.chatMessages || []).filter(m =>
      m.timestamp && getDayKey(m.timestamp) === dateKey && !m.typing && !m.error
      && (_isTesterDS || !m._seed)
    );
    if (messages.length < 2) {
      const archived = (state.chatArchive || []).find(a => a.date === dateKey && !a._deleted && (_isTesterDS || !a._seed));
      if (archived && Array.isArray(archived.messages)) {
        messages = archived.messages.filter(m => _isTesterDS || !m._seed);
      }
    }

    const hasContext = messages.length >= 2 || entry.vitality != null || entry.mood != null || (entry.note && entry.note.trim());
    if (!hasContext) continue;

    try {
      const summary = await summarizeDayForEntry(dateKey, messages, entry);
      if (summary) {
        entry.aiSummary = summary;
        entry.dailySource = 'auto';
        saveState();
        console.log(`✦ 자동 요약 ${dateKey} 생성됨`);
      }
    } catch (e) {
      console.warn('diary auto summary failed for', dateKey, e);
    }
    return;  // 한 번에 1일치만 (cost + rate)
  }
}

// 사용자 명시 2026-05-02 ultrathink: diary auto summary batch path 재사용 위해 prompt builder 분리.
// inline path (runDiaryAutoSummaryIfNeeded) 와 batch path (_buildReviewBatchRequests 의 diary request) 둘 다 동일 builder 사용.
function _buildDiarySummaryPrompt(date, messages, entry) {
  const dateLabel = new Date(date).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
  });

  const checkinParts = [];
  if (entry.modes) {
    const activeModes = Object.keys(entry.modes).filter(k => entry.modes[k]);
    if (activeModes.length) checkinParts.push(`모드: ${activeModes.join(', ')}`);
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

  const prompt = `${dateLabel}의 기록이야. 일기를 안 썼지만 그 날 흔적으로 짧은 요약을 만들어줘.

[체크인]
${checkinSummary}

[그 날 대화]
${chatLog}

[요약 규칙]
- 1단락, 2-4문장 (150자 이내)
- 그 날의 감정·상황·중요한 일만
- 사용자 시점 ("나는 ~했다") 자연스럽게
- 친근한 톤, 반말 OK
- 형식: 그냥 한 단락. 제목 X, 불릿 X
- 정보 적으면 정직하게 짧게 ("기록 적은 하루. 체크인 보면 ~")

[좋은 예시]
"활력 낮고 기분도 다운된 하루. 소라랑 짧게 압박감에 대해 얘기. 별다른 행동은 없었지만 자기 인식 있었음."

요약만 출력. 다른 설명 X.`;

  return {
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    userMessage: prompt,
    _endpoint: 'daily_summary'
  };
}

// diary summary 결과 처리 — 단순 text trim.
function _processDiarySummaryResult(text) {
  return (text || '').trim();
}

async function summarizeDayForEntry(date, messages, entry) {
  const promptSpec = _buildDiarySummaryPrompt(date, messages, entry);
  const resp = await callAnthropic({
    _endpoint: promptSpec._endpoint,
    model: promptSpec.model,
    max_tokens: promptSpec.max_tokens,
    messages: [{ role: 'user', content: promptSpec.userMessage }]
  });
  if (!resp.ok) throw new Error('API ' + resp.status);
  const data = await resp.json();
  return _processDiarySummaryResult(data.content[0].text);
}

