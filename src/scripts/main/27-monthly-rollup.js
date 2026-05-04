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
    topicCardsIn = (state.topicCards || []).filter(t => inMs(t.createdAt));
    pearlsIn = (state.pearls || []).filter(p => inMs(p.createdAt));
    archiveIn = (state.archive || []).filter(a => inMs(a.savedAt || a.createdAt));
    insightsIn = (state.insights || []).filter(i => inMs(i.discoveredAt || i.createdAt));
    chaptersIn = (state.chatArchive || []).filter(c => inMs(c.generatedAt || c.createdAt || (c.date ? c.date + 'T12:00:00' : null)));
  }
  return { quarterKey, stats, recentEmbodied, prevSeeds, entriesIn, chatIn, topicCardsIn, pearlsIn, archiveIn, insightsIn, chaptersIn };
}

function _buildQuarterlyReviewPrompt(quarterKey, stats, data) {
  const _data = data || _collectQuarterlyData(quarterKey, stats);
  const { recentEmbodied, prevSeeds, entriesIn, chatIn, topicCardsIn, pearlsIn, archiveIn, insightsIn, chaptersIn } = _data;
  // 사용자 명시 2026-05-02 ultrathink (ERROR #9): entries 0개 = null return → caller skip.
  if (!entriesIn || entriesIn.length === 0) return null;

  const prompt = `지난 분기 ${quarterKey} 리뷰 작성.

[목표]
- 단순 stats 요약 X. **변곡점 (turning point)** 발견 — 분기 내 큰 변화 / 결정 / 정체성 shift.
- 사용자 본인의 인용 5개 → 자기친밀감.
- **분기의 너를 한 단어로 명명** (정체성 hook).
- 다음 분기 씨앗 적용하기 → 리뷰 간 continuity.

[지난 분기 stats]
- 체크인: ${stats.checkins}일
- 진화율: ${stats.workRate != null ? Math.round(stats.workRate * 100) + '% (' + stats.worked + '/' + stats.attempts + ')' : '데이터 부족'}
- 진주: ${stats.pearls}개${stats.dnaPearls ? ` + DNA 진주 ${stats.dnaPearls}개 결정화` : ''}
- 활성 모드 빈도: ${Object.entries(stats.modeCount).map(([k, v]) => `${k} ${v}일`).join(' / ') || '거의 없음'}
- 추적 항목 변화: ${stats.trackerStats.map(t => `${t.title} ${t.first}→${t.last}${t.unit || ''}`).join(' / ') || '데이터 부족'}
- 8 차원: 문제 ${stats.problemsTotal} / 강점 ${stats.strengthsTotal} / growth ${stats.growthCount}
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

[패턴 발견 — Detective]
mode + entries + 가닥 outcomes 교차 봐. 구체적 숫자/인용으로 입증.

[지난 분기 씨앗] ${prevSeeds.length > 0 ? '(callback 추천)' : '(첫 분기 또는 씨앗 X)'}
${prevSeeds.length > 0 ? prevSeeds.map(s => '· ' + s).join('\n') : ''}

[톤]
관찰 친화. 외재화 / 균형 노출. 칭찬 inflation X. 사실 관찰 ○. 친구 톤 (반말 OK).

[출력 — JSON만, 마크다운 X]
{
  "one_word": "이번 분기의 너 = 한 단어 (예: \\"탐험가\\", \\"잠수부\\", \\"건축가\\")",
  "summary": "분기 핵심 한 문장 (40-80자, specific)",
  "pattern": {
    "headline": "발견한 패턴 한 문장",
    "evidence": "구체적 근거 — entry 인용 또는 숫자",
    "condition": "어떤 조건/모드/시간"
  },
  "turning_point": "분기 내 변곡점 — 가장 큰 변화 / 결정 / 정체성 shift. 가능하면 entry 인용. 2-4문장.",
  "quotes": ["짧은 인용 5개 (entries / 대화에서, 각 30자 이내)", "...", "...", "...", "..."],
  "experiment": {
    "what": "다음 분기 한 가지 작은 실험 (구체적, 환경 setup 우선)",
    "why": "왜 흥미로울지"
  },
  "seeds": ["다음 분기 watch point 1 (구체적, observable)", "...2"]${prevSeeds.length > 0 ? ',\n  "seed_callbacks": "지난 분기 씨앗이 어떻게 됐는지 (1-3문장)"' : ''}
}

[금지]
- "잘했다 / 멋지다" 류 칭찬 X
- 단정 X
- 마크다운 X

JSON만 출력.`;

  return {
    system: 'JSON 객체 하나만 반환. markdown code fence X. 다른 글 X. 모든 필수 필드 다 채워서 출력.',
    model: 'claude-sonnet-4-6',
    max_tokens: 2500,
    userMessage: prompt,
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
  return _processQuarterlyReviewResult(text);
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
      const archived = (state.chatArchive || []).find(a => a.date === dateKey && (_isTesterDS || !a._seed));
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
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: _anthropicHeaders(),
    body: JSON.stringify({
      _endpoint: promptSpec._endpoint,
      model: promptSpec.model,
      max_tokens: promptSpec.max_tokens,
      messages: [{ role: 'user', content: promptSpec.userMessage }]
    })
  });
  if (!resp.ok) throw new Error('API ' + resp.status);
  const data = await resp.json();
  return _processDiarySummaryResult(data.content[0].text);
}

