function _collectReviewData(type) {
  const today = new Date();
  let cutoff, cutoffEnd;
  if (type === 'weekly') {
    cutoff = new Date(today.getTime() - 7 * 86400000);
    cutoffEnd = today;
  } else {
    cutoff = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    cutoffEnd = new Date(today.getFullYear(), today.getMonth(), 1);
  }
  const cutoffISO = cutoff.toISOString().split('T')[0];
  const cutoffEndISO = cutoffEnd.toISOString().split('T')[0];
  // 사용자 명시 2026-05-02 ultrathink (ERROR #11 fix): inRange 도 ISO 문자열 비교로 통일 — Date 객체 vs ISO 문자열 미스매치 방지.
  const inRange = (dt) => {
    if (!dt) return false;
    const iso = (typeof dt === 'string') ? dt.split('T')[0] : new Date(dt).toISOString().split('T')[0];
    return iso >= cutoffISO && iso < cutoffEndISO;
  };

  const entriesInRange = state.entries.filter(e => e.date >= cutoffISO && e.date < cutoffEndISO);
  const missionsInRange = state.missions.filter(m => inRange(m.createdAt));
  const chatInRange = state.chatMessages.filter(m => m.timestamp && inRange(m.timestamp) && !m.typing && !m.error && m.role === 'user').slice(-40);
  const decisionsInRange = state.decisions.filter(d => !d._deleted && (inRange(d.startedAt) || (d.decidedAt && inRange(d.decidedAt))));
  const topicCardsInRange = (state.topicCards || []).filter(t => !t._deleted && t.createdAt && inRange(t.createdAt));
  const pearlsInRange = (state.pearls || []).filter(p => !p._deleted && p.createdAt && inRange(p.createdAt));
  const archiveInRange = (state.archive || []).filter(a => {
    if (a._deleted) return false;
    const dt = a.savedAt || a.createdAt;
    return dt && inRange(dt);
  });
  const insightsInRange = (state.insights || []).filter(i => {
    if (i._deleted) return false;
    const dt = i.discoveredAt || i.createdAt;
    return dt && inRange(dt);
  });
  const chaptersInRange = (state.chatArchive || []).filter(c => {
    if (c._deleted) return false;
    const dt = c.generatedAt || c.createdAt || (c.date ? c.date + 'T12:00:00' : null);
    return dt && inRange(dt);
  });

  // 이전 리뷰 씨앗 — callback 위해 prompt 주입 (continuity).
  // 사용자 보고 2026-04-30 review (agent P1-4): completedAt 기준 정렬 후 최신.
  const prevList = type === 'weekly' ? (state.weeklyReviews || []) : (state.monthlyReviews || []);
  const prevLatest = prevList.length > 0
    ? prevList.slice().sort((a, b) => new Date(b.completedAt || b.createdAt || 0) - new Date(a.completedAt || a.createdAt || 0))[0]
    : null;
  let prevSeeds = prevLatest ? (prevLatest.seeds || []) : [];
  // 사용자 명시 2026-05-02 ultrathink (ERROR #13 명시): monthly = first-touch fallback X (월=여러 주 누적이라 seed continuity 덜 중요). weekly 만 fallback.
  if (prevSeeds.length === 0 && type === 'weekly' && Array.isArray(state._firstTouchSeeds) && state._firstTouchSeeds.length > 0) {
    prevSeeds = state._firstTouchSeeds;
  }

  return {
    type,
    cutoff, cutoffEnd, cutoffISO, cutoffEndISO,
    entriesInRange, missionsInRange, chatInRange, decisionsInRange,
    topicCardsInRange, pearlsInRange, archiveInRange, insightsInRange, chaptersInRange,
    prevSeeds
  };
}

// 리뷰 prompt 빌더 — system / model / max_tokens / userMessage / _endpoint 반환.
// 사용자 명시 2026-05-02 ultrathink (ERROR #9): entries 0개 = null return → caller skip.
// V4 사용자 명시 (V190): batch API 전환 + cache_control 분리 (buildSystemPrompt 패턴).
//   stable 가이드 (목표 / Detective / 일상어 / 톤 / 출력 JSON 스키마) → system + ephemeral cache → 90% 비용 ↓
//   volatile 데이터 (기간 데이터 / 알려진 사용자 / 지난 씨앗) → userMessage
//   inline (generateReview) / batch (_buildReviewBatchRequests) 둘 다 같은 spec 사용 → 동시 적용.
function _buildReviewPrompt(type, data) {
  const { entriesInRange, missionsInRange, chatInRange, decisionsInRange, topicCardsInRange, pearlsInRange, archiveInRange, insightsInRange, chaptersInRange, prevSeeds } = data;
  if (!entriesInRange || entriesInRange.length === 0) return null;

  const periodLabel = type === 'weekly' ? '주' : '달';

  // ─── STABLE (cache_control ephemeral) ───
  const stable = `너는 사용자의 ${type === 'weekly' ? '주간' : '월간'} 리뷰를 작성한다.

[목표]
단순 요약 X. **Detective** — 사용자가 못 본 cross-pattern 발견.
사용자 자신의 인용 5개 → 자기친밀감.
다음 리뷰 때 다시 볼 '씨앗' 적용하기 → 리뷰 간 continuity.
${type === 'monthly' ? '이번 달의 너를 한 단어로 명명 (정체성 hook).' : ''}

[패턴 발견 — Detective 가이드]
- mode + entries + missions + outcomes 교차 봐.
- 예: "쉰 일요일 다음주, 한결 가벼워" / "X 가닥은 시험기에만 잘 됐어, 4번 중 4번"
- 예: "관계 entry 들 다 시험 모드 시기에 적혔네 — 시험기가 오히려 관계 챙기는 시기인가?"
- generic 패턴 X. 구체 (요일 / 인용 / 횟수) 로 입증.

[일상어 강제 — 사용자 명시 2026-04-30 ultrathink]
- 수치 약어 / 분석가 어휘 절대 X. 일상 한국어 그대로.
- BAD: "7h+ → mood +1.5", "수면 평균 7시간", "4/5 일관성", "+1.5점"
- GOOD: "잘 잔 다음날, 한결 가벼웠어 (4번 중 4번)", "평일에 7시간 넘게 잔 날들이 좋았어"
- 숫자 표시할 때도 단위 풀어 써: "7시간", "4번 중 4번", "30분", "10시 즘"
- 통계 어휘 (correlation / 평균 / +N% / std dev / 분포) 전면 X.
- 친구한테 카톡 쓰듯이.

[톤]
친한 친구. 반말. 상담사 X.
구체 > 일반. specific > generic.
판단 X. self-compassion.
짧게. 각 섹션 ≤ 4줄.
관찰 친화 — 결과보다 과정·시도·태도.

[출력 JSON]
{
  ${type === 'monthly' ? '"one_word": "이번 달의 너 = 정체성 한 단어 (예: \\"관찰자\\", \\"협상자\\", \\"탐험가\\", \\"잠수부\\"). 한 단어만.",' : '"one_word_weekly": "이번 주 momentum 한 단어 — 운동·진행 어휘 (예: \\"정착중\\", \\"가속중\\", \\"회복중\\", \\"휘청중\\", \\"재정비\\", \\"몰입\\", \\"숨고르기\\"). monthly 와 다른 dimension (정체성 X 운동성 ○).",'}
  "summary": "이번 ${periodLabel} 한 줄 요약 (15-30자)",
  "pattern": {
    "headline": "발견한 패턴 한 문장 — 친구 톤 / 일상 어휘. 짧고 surprising. 수치 약어 절대 X. 예: '아침 산책 한 날 = 그날 일기 길어', '잠 잘 잔 다음날, 기분이 한 단계 가벼워', '마감 임박이면 진짜 빨리 진입하네'. (X 'sleep 7h+ → mood +1.5')",
    "evidence": "구체 근거 — entry 인용 1-2개 + 요일/횟수. 일상 어휘로 풀어 써. 예: '"오늘 일찍 잤더니 머리 맑아." (화/목)'. (X '7h+ 4 days, mood avg 4.2')",
    "condition": "어떤 조건일 때인지 (1줄, 일상 톤). 예: '11시 전에 자고 30분 산책할 때'. (X 'sleep<23:00 + exercise≥30min')"
  },
  "quotes": ["사용자 entries / 대화에서 추출한 짧은 인용 5개 (각 30자 이내, 5개)", "...", "...", "...", "..."],
  "strengths": ["이번 ${periodLabel} 사용자가 잘한 작은 win 3-5개 (구체, 자기 친밀 톤, 자존감 boost). 결과 X 시도·태도·관찰 ○. 예: '월요일 마감 임박에도 잠 7시간 챙김', '엄마 통화 후 5분 산책으로 회복'", "...", "..."],
  "cycles": {
    "sleep": "수면 → 이번 ${periodLabel} 영향 (1줄, 일상어). 예: '잘 잔 날 4번, 다음날마다 한결 가벼웠어'. (X '7h+ avg → +1.5'). 무관하면 빈 문자열.",
    "mode": "어떤 모드·시간대에서 어땠는지 (1줄, 일상어). 예: '시험기인데도 카페 가서 글이 술술 써졌어'.",
    "other": "황체기·날씨·계절·외부 (1줄, 일상어). 예: '비 오는 날 살짝 무거웠어'. 모르면 빈 문자열."
  },
  "value_align": {
    "score": "0-10 정수 — 사용자 본인 values 명단 와 이번 ${periodLabel} 행동이 얼마나 맞았나. values 명단 X 면 score=null.",
    "aligned": "values 명단 단어 그대로 + 그 가치 보여준 구체 행동 (1줄, 일상어). 예: '"회복" — 잠 일찍 잔 날 4번, 산책 3번', '"자율" — 카페 가는 거 스스로 정함'.",
    "gap": "values 명단 중 살짝 멀어진 거 + 부드럽게 (1줄, 판단 X). 빈 문자열 OK. 예: '"연결"은 살짝 약했어 — 이번 주는 회복기였으니 OK'."
  },
  "emotions": [{"word": "사용자가 자주 쓴 감정 단어 (entries/chat 에서)", "count": "사용 빈도 (정수)"}],
  "risk_signals": {
    "level": "'none' | 'watch' | 'concern' — mood drop 3일 이상 / 수면 심하게 불규칙 / 사람 만남 X / 미션 연속 missed 등",
    "signals": ["감지된 신호 (구체, 부드럽게). 'none' 일 때 빈 array.", "..."],
    "suggestion": "부드러운 제안 1줄. concern 일 때 위기 채널 안내 (1393 자살예방, 1577-0199 정신건강, 119) 포함. watch 면 self-care 제안. none 이면 빈 문자열."
  }
}

JSON 객체 하나만 반환. markdown code fence X. 다른 글 X. 모든 필수 필드 다 채워서 출력.`;

  // ─── VOLATILE (매번 다른 데이터) ───
  const volatile = `[기간 데이터]
체크인: ${JSON.stringify(entriesInRange, null, 2).slice(0, 4000)}
미션: ${JSON.stringify(missionsInRange.map(m => ({title: m.title, status: m.status, attemptStatus: m.attemptStatus, strategyId: m.strategyId})), null, 2).slice(0, 1500)}
대화 발췌 (사용자): ${chatInRange.map(m => m.content.slice(0, 200)).join('\n---\n').slice(0, 3000)}
결정 + 예측: ${JSON.stringify(decisionsInRange.map(d => ({title: d.title, status: d.status, finalDecision: d.finalDecision, predictions: d.predictions})), null, 2).slice(0, 1500)}
챕터: ${JSON.stringify(chaptersInRange.map(c => ({date: c.date, messageCount: c.messageCount})), null, 0).slice(0, 1500)}
가닥(topicCards): ${JSON.stringify(topicCardsInRange.map(t => ({title: t.title, summary: t.summary, category: t.category})), null, 0).slice(0, 1500)}
진주: ${JSON.stringify(pearlsInRange.map(p => ({content: p.content, note: p.note})), null, 0).slice(0, 1000)}
스크랩(archive): ${JSON.stringify(archiveInRange.map(a => ({headline: a.headline, body: (a.body || '').slice(0, 200), tags: a.tags, starred: a.starred})), null, 0).slice(0, 1200)}
인사이트: ${JSON.stringify(insightsInRange.map(i => ({content: i.content, type: i.type})), null, 0).slice(0, 800)}
활성 모드: ${Object.keys(state.modes || {}).filter(k => state.modes[k]).join(', ') || '없음'}

이미 알려진 사용자 (user_verified ✓ 만):
- traits: ${(state.traits || []).filter(t => t.user_verified !== false).slice(0, 5).map(t => t.name).join(', ')}
- patterns: ${(state.patterns || []).filter(p => p.user_verified !== false).slice(0, 5).map(p => p.name).join(', ')}
- values: ${(state.values || []).filter(v => v.user_verified !== false).slice(0, 3).map(v => v.name).join(', ')}

[지난 리뷰 씨앗] ${prevSeeds.length > 0 ? '(callback 추천 — 씨앗이 어떻게 됐는지 짚어주면 사용자 신뢰↑)' : '(없음)'}
${prevSeeds.length > 0 ? prevSeeds.map(s => '· ' + s).join('\n') : '(이번이 첫 리뷰 또는 이전 씨앗 X)'}

위 데이터로 [출력 JSON] 스키마에 맞춰 JSON 객체 하나만 반환.`;

  return {
    system: [{ type: 'text', text: stable, cache_control: { type: 'ephemeral' } }],
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    userMessage: volatile,
    _endpoint: type === 'monthly' ? 'review_monthly' : 'review_weekly'
  };
}

// 리뷰 결과 처리 — JSON 파싱만 (state.push 는 caller 책임. inline = renderReviewScreen 의 사용자 save / batch = 자동 push).
function _processReviewResult(jsonText) {
  return _robustJsonExtract(jsonText);
}

// 사용자 명시 2026-05-02 ultrathink: generateReview = collect → build → callAnthropic → process (단순 wrapper).
// batch path 는 _collectReviewData / _buildReviewPrompt 만 사용 + batch request 넣음.
async function generateReview(type) {
  if (!_canAI()) throw new Error('AI 호출 불가능 (로그인 또는 API 키 필요)');
  const data = _collectReviewData(type);
  const promptSpec = _buildReviewPrompt(type, data);
  if (!promptSpec) throw new Error('이 기간 데이터가 없어서 리뷰를 생성할 수 없어요');

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
  return _processReviewResult(text);
}

// 사용자 명시 2026-05-01: opts.readonly = 리뷰 모음에서 클릭 시 풀화면 read-only view (저장 X / 삭제 + 모음으로 돌아가기 버튼)
