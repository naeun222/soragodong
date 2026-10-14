// ─── quotes 환각 방지 (사용자 명시 2026-05-09 ultrathink) ───
// AI 가 만들어낸 가짜 인용 차단. entries/chat/archive raw text 매칭 안 되면 drop.
// 자기친밀감 핵심 = "내가 한 말을 내가 본다" — verification 없으면 시스템 신뢰 깨짐.
function _normalizeQuoteText(s) {
  return String(s || '')
    .replace(/[""''「」『』·…—–\-:;,.!?~()\[\]{}\s]/g, '')
    .toLowerCase();
}

function _collectQuoteSources(data) {
  if (!data || typeof data !== 'object') return [];
  const out = [];
  const push = (v) => { if (v && typeof v === 'string') out.push(v); };
  const arr = (a) => Array.isArray(a) ? a : [];
  arr(data.entriesInRange || data.entriesIn || data.entries).forEach(e => {
    if (!e) return;
    push(e.text); push(e.note); push(e.diary); push(e.aiSummary);
  });
  arr(data.chatInRange || data.chatIn).forEach(m => { if (m) push(m.content); });
  arr(data.archiveInRange || data.archiveIn || data.archive).forEach(a => {
    if (!a) return;
    push(a.headline); push(a.body);
  });
  arr(data.pearlsInRange || data.pearlsIn || data.pearls).forEach(p => {
    if (!p) return;
    push(p.content); push(p.note);
  });
  arr(data.insightsInRange || data.insightsIn || data.insights).forEach(i => { if (i) push(i.content); });
  arr(data.chaptersInRange || data.chaptersIn).forEach(c => { if (c) push(c.summary || c.title); });
  return out;
}

function _filterValidQuotes(quotes, sources) {
  if (!Array.isArray(quotes)) return quotes;
  if (!Array.isArray(sources) || sources.length === 0) return quotes;
  const normSources = sources.map(_normalizeQuoteText).filter(s => s && s.length > 0);
  if (normSources.length === 0) return quotes;
  return quotes.filter(q => {
    const nq = _normalizeQuoteText(q);
    if (nq.length === 0) return false;
    // 너무 짧은 quote (4자 미만) = 매칭 false positive 위험 → 보수적으로 통과
    if (nq.length < 4) return true;
    return normSources.some(src => src.includes(nq));
  });
}

// transformation.start_quote / end_quote 같은 단일 인용 검증용. 매칭 X 면 빈 문자열.
function _verifySingleQuote(quote, sources) {
  if (!quote || typeof quote !== 'string') return '';
  const filtered = _filterValidQuotes([quote], sources);
  return filtered.length > 0 ? quote : '';
}

// V4 (사용자 명시 2026-05-25 ultrathink): cutoff/cutoffEnd 옵션 추가 (backlog 케이스에서 옛 cycle range 명시 가능).
//   기존 호출처 (옵션 X) = 옛 동작 그대로 (today 기준 자동 계산). review chain batch path 만 명시.
function _collectReviewData(type, opts) {
  opts = opts || {};
  const today = new Date();
  let cutoff, cutoffEnd;
  if (opts.cutoff && opts.cutoffEnd) {
    cutoff = opts.cutoff instanceof Date ? opts.cutoff : new Date(opts.cutoff);
    cutoffEnd = opts.cutoffEnd instanceof Date ? opts.cutoffEnd : new Date(opts.cutoffEnd);
  } else if (type === 'weekly') {
    // V4 fix (사용자 명시 2026-05-22 ultrathink): "끝난 주의 review" 흐름 복원.
    //   옛 (2026-05-10 fix): cutoffEnd = 다음 일요일 04:00 (미래) → 평일 (월~토) 진입 시 안 끝난 주의 부분 entries → review 부정확.
    //   원인: batch fire trigger (`_lastWeekly4amCutoff()` = 직전 일요일 04:00) 와 entries range cutoffEnd (다음 일요일) 가 1주 mismatch.
    //   새: cutoffEnd = 직전 일요일 04:00 (= batch fire trigger 와 일관). entries = 방금 끝난 1주 (지난 일요일 04:00 - 7일 ~ 지난 일요일 04:00).
    //   결과: 5/22 (금) 진입 시 cutoff 5/10 - cutoffEnd 5/17 = W20 (5/11-5/17) 의 review. 5/24 (일) 04:00 통과 후 진입 시 W21 (5/18-5/24).
    cutoffEnd = (typeof _lastWeekly4amCutoff === 'function')
      ? _lastWeekly4amCutoff()
      : (() => {
          // fallback — _lastWeekly4amCutoff inline 계산
          const _c = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 4, 0, 0, 0);
          const _dow = _c.getDay();
          const _daysBack = (_dow === 0) ? (_c <= today ? 0 : 7) : _dow;
          _c.setDate(_c.getDate() - _daysBack);
          if (_c > today) _c.setDate(_c.getDate() - 7);
          return _c;
        })();
    cutoff = new Date(cutoffEnd.getTime() - 7 * 86400000);
  } else {
    // V4 fix (사용자 명시 2026-05-22 ultrathink): monthly 도 동일 패턴 — "끝난 달의 review".
    //   옛 (2026-05-10 fix): 이번 달 (1일 ~ 다음 달 1일 04:00) — 진행 중 데이터.
    //   원인: batch fire trigger (`_lastMonthly4amCutoff()` = 이번 달 1일 04:00) 와 entries range (이번 달 1일 ~ 다음 달 1일) 가 1달 mismatch.
    //   새: cutoff = 지난 달 1일 04:00, cutoffEnd = 이번 달 1일 04:00. entries = 방금 끝난 달.
    cutoff = new Date(today.getFullYear(), today.getMonth() - 1, 1, 4, 0, 0, 0);
    cutoffEnd = new Date(today.getFullYear(), today.getMonth(), 1, 4, 0, 0, 0);
  }
  // 사용자 보고 2026-05-10 ultrathink: KST timezone shift bug fix.
  //   옛: cutoff.toISOString() = UTC 변환 → 04:00 KST = 19:00 UTC 전날 → date 1일 앞당겨짐.
  //   결과: 5/3 04:00 KST → '2026-05-02' → data range 5/2-5/8 (저번 주 토요일 포함, 어제 미포함).
  //   fix: local date 직접 추출 (getFullYear / getMonth / getDate). KST 기준 정확.
  const _toLocalDate = (d) => {
    if (!d) return '';
    const dd = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dd.getTime())) return '';
    const y = dd.getFullYear();
    const m = String(dd.getMonth() + 1).padStart(2, '0');
    const day = String(dd.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const cutoffISO = _toLocalDate(cutoff);
  const cutoffEndISO = _toLocalDate(cutoffEnd);
  // 사용자 명시 2026-05-02 ultrathink (ERROR #11 fix): inRange 도 ISO 문자열 비교로 통일 — Date 객체 vs ISO 문자열 미스매치 방지.
  const inRange = (dt) => {
    if (!dt) return false;
    let iso;
    if (typeof dt === 'string') {
      // entries.date = 'YYYY-MM-DD' local 그대로. chat timestamp = UTC ISO 'YYYY-MM-DDTHH:mm:ss.sssZ' → local 변환.
      iso = dt.includes('T') ? _toLocalDate(new Date(dt)) : dt.split('T')[0];
    } else {
      iso = _toLocalDate(new Date(dt));
    }
    return iso >= cutoffISO && iso < cutoffEndISO;
  };

  const entriesInRange = state.entries.filter(e => e.date >= cutoffISO && e.date < cutoffEndISO);
  // 사용자 명시 2026-05-11: dismissed 미션은 review 데이터에서 제외.
  const missionsInRange = state.missions.filter(m => m && m.status !== 'dismissed' && inRange(m.createdAt));
  // 사용자 명시 2026-05-10 (batch 12): 시뮬 컨텍스트 메시지 (isSimulationContext) 는 review 데이터 input 에서 제외 — 가상 시나리오를 실제 사건으로 모델이 오인 회피.
  const chatInRange = state.chatMessages.filter(m => m.timestamp && inRange(m.timestamp) && !m.typing && !m.error && m.role === 'user' && !m.isSimulationContext).slice(-40);
  const decisionsInRange = state.decisions.filter(d => !d._deleted && (inRange(d.startedAt) || (d.decidedAt && inRange(d.decidedAt))));
  const topicCardsInRange = (state.topicCards || []).filter(t => !t._deleted && t.createdAt && inRange(t.createdAt));
  const pearlsInRange = (state.pearls || []).filter(p => !p._deleted && p.createdAt && inRange(p.createdAt));
  // 사용자 명시 2026-05-06: 메모 type 은 review prompt 에서 제외 (순수 메모)
  const archiveInRange = (state.archive || []).filter(a => {
    if (a._deleted) return false;
    if (a.type === 'memo' || a._excludeFromAI) return false;
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
    // 사용자 명시 2026-05-10 (batch 12): pure 시뮬 챕터 (isSimulation: true) 는 review 데이터 제외.
    //   혼합 챕터 (hasSimulationMessages 만 true, isSimulation 은 false) 는 포함 — 일반 메시지 부분 활용. messages 는 chaptersInRange 본문 inject 시 별도 필터.
    if (c.isSimulation) return false;
    const dt = c.generatedAt || c.createdAt || (c.date ? c.date + 'T12:00:00' : null);
    return dt && inRange(dt);
  });

  // 사용자 명시 2026-05-10 (큐 6): 월/분기/연 review 시 추적 항목 (state.projects) inject.
  //   client-side fact 계산 — checked 일 vs unchecked 일 mood 비교, progress, target 도달.
  //   주간 (type='weekly') 은 가벼움 위주라 inject X. monthly 부터.
  let trackingFacts = [];
  if (type !== 'weekly') {
    const _projects = (state.projects || []).filter(p => p && !p._deleted);
    const _moodMap = new Map();
    (state.entries || []).forEach(e => { if (e.date && typeof e.mood === 'number') _moodMap.set(e.date, e.mood); });
    const _avg = (arr) => arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length;
    _projects.forEach(p => {
      // checkin 형 (toggleTrackerCheck → state.entries[date].trackerChecks[id] = true 또는 별도 필드)
      const _checkins = Array.isArray(p.checkins) ? p.checkins : [];
      const _checkedDates = new Set(_checkins.filter(c => c && c.date && inRange(c.date + 'T12:00:00')).map(c => c.date));
      // measurement 형
      const _measInRange = Array.isArray(p.measurements) ? p.measurements.filter(m => m && m.at && inRange(m.at)) : [];
      const _hasCheck = _checkedDates.size > 0;
      const _hasMeas = _measInRange.length > 0;
      if (!_hasCheck && !_hasMeas) return;
      const _entryDatesInRange = (entriesInRange || []).map(e => e.date).filter(Boolean);
      const _moodChecked = _entryDatesInRange.filter(d => _checkedDates.has(d)).map(d => _moodMap.get(d)).filter(v => typeof v === 'number');
      const _moodUnchecked = _entryDatesInRange.filter(d => !_checkedDates.has(d)).map(d => _moodMap.get(d)).filter(v => typeof v === 'number');
      const _moodOnAvg = _avg(_moodChecked);
      const _moodOffAvg = _avg(_moodUnchecked);
      const _correlation = (_moodOnAvg !== null && _moodOffAvg !== null) ? (_moodOnAvg - _moodOffAvg) : null;
      const _progressLine = (_hasMeas && p.target != null && p.baseline != null)
        ? `${_measInRange[_measInRange.length - 1].value} (목표 ${p.target}, 시작 ${p.baseline})`
        : null;
      trackingFacts.push({
        title: p.title || '추적 항목',
        type: _hasMeas ? 'measurement' : 'check',
        checkedDays: _checkedDates.size,
        totalDaysInRange: _entryDatesInRange.length,
        moodCorrelation: _correlation,
        progress: _progressLine,
      });
    });
  }

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
  // 사용자 명시 2026-05-09 ultrathink: prev userNote (사용자 직접 남긴 한 마디) 도 prompt 에 inject.
  const prevUserNote = prevLatest ? String(prevLatest.userNote || '').trim() : '';
  // 2026-10-15 월간 리뷰 v2: 지난달 리뷰의 '아직 한 번뿐' 항목 (pending) 을 이번 프롬프트에 넘겨 근거가 쌓이는지 보게 함. monthly 만.
  const prevPending = (type === 'monthly' && prevLatest && Array.isArray(prevLatest.pending))
    ? prevLatest.pending.filter(s => typeof s === 'string' && s.trim()).slice(0, 5)
    : [];

  return {
    type,
    cutoff, cutoffEnd, cutoffISO, cutoffEndISO,
    entriesInRange, missionsInRange, chatInRange, decisionsInRange,
    topicCardsInRange, pearlsInRange, archiveInRange, insightsInRange, chaptersInRange,
    prevSeeds, prevUserNote, prevPending,
    trackingFacts  // 사용자 명시 2026-05-10 (큐 6): monthly+ 만 채워짐.
  };
}

// 리뷰 prompt 빌더 — system / model / max_tokens / userMessage / _endpoint 반환.
// 사용자 명시 2026-05-02 ultrathink (ERROR #9): entries 0개 = null return → caller skip.
// V4 사용자 명시 (V190): batch API 전환 + cache_control 분리 (buildSystemPrompt 패턴).
//   stable 가이드 (목표 / 쓰는 방식 / 말 표본 / 출력 JSON 스키마) → system + ephemeral cache → 90% 비용 ↓
//   volatile 데이터 (기간 데이터 / 알려진 사용자 / 지난 씨앗) → userMessage
//   inline (generateReview) / batch (_buildReviewBatchRequests) 둘 다 같은 spec 사용 → 동시 적용.
function _buildReviewPrompt(type, data) {
  const { entriesInRange, missionsInRange, chatInRange, decisionsInRange, topicCardsInRange, pearlsInRange, archiveInRange, insightsInRange, chaptersInRange, prevSeeds, prevUserNote } = data;
  const prevPending = Array.isArray(data.prevPending) ? data.prevPending : [];

  // 사용자 명시 2026-05-08 ultrathink (재): weekly 는 마지막 review 이후 새 데이터 1개라도 있어야 trigger.
  //   "꼭 일주일 안 지나도 일요일 4AM 이후면 review 생성. 단 마지막 review 이후 데이터 X 면 X."
  //   monthly/quarterly/annual 은 옛 그대로 (entries 0 가드만).
  if (type === 'weekly') {
    // 사용자 보고 2026-05-10: 옛 가드 = lastReview 이후 새 데이터 검사 → 같은 주 (W19) 가 아직 push 안 됐는데도 막힘.
    //   fix: weekKey 비교 — 이번 주 weekKey 가 이미 push 됐으면 skip, 안 됐으면 데이터 가드 우회.
    // 사용자 보고 2026-05-10 (batch 10): 옛 코드 = cutoffEnd / cutoff destructure 안 됐는데 직접 사용 → ReferenceError. data.X 로.
    const _thisWeekKey = (typeof getWeekKey === 'function') ? getWeekKey(data.cutoffEnd || data.cutoff) : null;
    if (_thisWeekKey && (state.weeklyReviews || []).some(r => r.weekKey === _thisWeekKey)) {
      return null;  // 이미 이번 주 review push — idempotent skip.
    }
    // 사용자 보고 2026-05-10: entries 0 가드 완화 — chat / archive / pearl 등 데이터 1+ 면 review 가능 (chat-only 사용자도 review).
    const _hasAnyData =
      (entriesInRange && entriesInRange.length > 0) ||
      (chatInRange && chatInRange.length > 0) ||
      (archiveInRange && archiveInRange.length > 0) ||
      (pearlsInRange && pearlsInRange.length > 0) ||
      (chaptersInRange && chaptersInRange.length > 0);
    if (!_hasAnyData) return null;
  } else {
    // 사용자 명시 2026-05-10 (메커니즘 일관): monthly = 이번 달 (1일 ~ 다음 달 1일 04:00) data range. weekly 와 동일 idempotent skip + 데이터 1+ 가드.
    //   monthKey 비교 — 이번 달 review 이미 있으면 skip / 없으면 chat/archive/pearl 1+ 면 review.
    const _thisMonthKey = (typeof getMonthKey === 'function') ? getMonthKey(data.cutoff) : null;
    if (_thisMonthKey && (state.monthlyReviews || []).some(r => r.monthKey === _thisMonthKey)) {
      return null;
    }
    const _hasAnyData =
      (entriesInRange && entriesInRange.length > 0) ||
      (chatInRange && chatInRange.length > 0) ||
      (archiveInRange && archiveInRange.length > 0) ||
      (pearlsInRange && pearlsInRange.length > 0) ||
      (chaptersInRange && chaptersInRange.length > 0);
    if (!_hasAnyData) return null;
  }

  const periodLabel = type === 'weekly' ? '주' : '달';

  // ─── STABLE (cache_control ephemeral) ───
  // 2026-10-15: 프롬프트를 STYLE.md 기준 한국어 산문으로 다시 씀 (functions/api/_lib/prompts/STYLE.md).
  //   주간: one_word_weekly / momentum_line / scenes 3 / flow / cycles / soft_notice 필드 그대로. 칭찬·격려 지시 제거.
  //   월간: 규칙(조건→결과) 중심으로 재구성. 필드명은 옛 schema 그대로 두되 one_word='' / strengths=[] / emotions=[] / value_align 고정.
  //   신규 필드 rules[] (근거 2개 이상 + 반대 사례) / pending[] (근거 하나뿐인 후보). risk_signals 는 유지 (concern 시 1393 / 1577-0199 / 119).
  //   옛 변경 이력 (2026-04-30 일상어 강제, 2026-05-21 mode 환각 fix, 2026-05-29 사진 tiebreaker) 은 지시문 안에 녹여 둠.
  const stable = type === 'weekly' ? `너는 한 사람의 이번 주 기록을 읽고 짧은 주간 리뷰를 쓴다. 기록은 매일의 체크인(기분, 활력, 수면, 메모), 대화에서 이 사람이 쓴 말, 미션, 좋았던 순간으로 남긴 메모다.

주간 리뷰는 이번 주에 있었던 일을 가까이에서 적는 자리다. 큰 규칙 찾기는 월간 리뷰가 하고, 여기서는 장면 셋과 짧은 관찰만 쓴다. 무겁게 결론 내리지 않는다.

쓰는 방식:
- 이 사람에게 직접 말하듯 반말로 쓴다. 다만 친구 흉내를 내지 않는다. 사실을 말하는 사람의 말투면 된다.
- 종결은 말하듯이. "~더라", "~였어", "~인 것 같아", "~하더라고", "~네"로 끝낸다. "~다"로 끝나는 서술체는 쓰지 않는다. 보고서처럼 들리면 틀린 거다.
- 문장 사이를 이어주는 말을 쓴다. "근데", "그리고", "그래서", "그날은". 사실을 한 줄씩 끊어 나열하지 않고, 사람이 말하듯 한 호흡에 두세 문장을 이어도 된다.
- 사실 뒤에 짧은 관찰 한 마디는 된다. "세 번 다 그랬어", "이날만 달랐어"는 관찰이라 된다. "대단해", "잘했어"는 평가라 안 된다.
- 칭찬하지 않는다. 위로하지 않는다. 격려하지 않는다. "잘했어", "대단해", "멋지다", "너답다", "괜찮아", "충분해", "힘내"를 쓰지 않는다.
- 문장 끝에 평가를 붙이지 않는다. "~잖아", "~거야", "~한 거지"로 끝나는 꼬리를 붙이지 않는다.
- 비유를 쓰지 않는다. 멋있게 쓰려고 하지 않는다. 평범한 단어가 맞는 단어다. 조금이라도 번역한 것처럼 느껴지는 표현은 더 평범한 말로 바꾼다.
- 이모지와 장식 기호를 쓰지 않는다.
- 심리학 용어, 이론, 연구자 이름을 쓰지 않는다. 평균, 상관, 퍼센트, 분포 같은 통계 말도 쓰지 않는다.
- 사람에게 이름표를 붙이지 않는다. 점수를 매기지 않는다. 감정 단어를 세지 않는다.
- 없는 일을 지어내지 않는다. "나도 그런 적 있어"를 쓰지 않는다. 소라고동은 사람이 아니다.
- 이 사람의 말을 인용할 때는 실제로 쓴 문장을 그대로 쓴다. 날짜가 있으면 날짜를 붙인다.
- 숫자는 말로 푼다. "네 번 중 세 번", "열네 시간".
- 질문을 하지 않는다. 제안을 하지 않는다. 미션이나 과제를 주지 않는다. 리뷰는 대화가 아니다.
- 같은 말을 운율 때문에 두 번 하지 않는다.
- 모드(시험, 여행, 아픔, 휴식, 월경)는 기록에 실제로 켜져 있던 것만 말한다. 기록에 없는 모드를 지어내지 않는다.

이 사람이 쓰는 말의 결은 아래 표본과 같다. 어휘와 문장 길이를 이 범위 안에서 고른다. 표본의 말투(ㅋㅋ, 늘임표, 줄임말)를 흉내 내라는 뜻이 아니라, 이 사람이 안 쓸 단어를 쓰지 말라는 뜻이다.

[말 표본]
- 오늘은 하루종일 잠만 잤지만 잠을 푹 잘 수 있어서 좋았어.
- 원래 미용실 항상 10분 정도 지각하는데 오늘 안 늦었다. 일찍 나온 건 아니야.
- 내 노력으로 지각 안 한 게 아니라 운이 좋아서 그런 거라 좀 아쉬워.
- 지각 안 하는 게 진짜 너무 힘들다. 품이 원래 이리 많이 드는 일인가.
- 앱 개발 하다보니까 또 새벽 6시가 됐어.
- 이제는 이틀씩 사는 수준인 것 같아. 평범하게 매일 잘 때 자고 깰 때 깨는 게 불가능한 느낌.
- 내가 잠에 들려고 노력하는 그 시간이 너무 싫어.
- 하고 싶은 게 너무 많은데 시간 아까워서 못하겠어.
- 오늘 드디어 앱을 배포했다. 앱 때문에 다른 게 뒷전이 된 것 같기도 하고.
- 사람들이랑 교류하는 게 좋아서. 같이 웃고 서로 인간적인 호감인 상태에서 얘기하는 게 좋아서.
- 내가 반겨지는 느낌 그런 거 없으면 진짜 현타와.
- 그냥 있는 거 같아. 아무것도 안 하거나 핸드폰 하고.

[출력 JSON]
{
  "one_word_weekly": "이번 주가 어떤 상태였는지 한 단어. 움직임이나 진행을 나타내는 평범한 말 (회복중, 재정비, 몰입 같은). 한 단어만.",
  "momentum_line": "그 한 단어가 기록 어디에서 보였는지 한 문장. 말하듯이. 사실과 짧은 관찰까지만.",
  "scenes": [
    "이번 주 장면 하나. 30자에서 50자. 언제, 무슨 일이 있었고, 그때 어땠는지를 말하듯 한 문장으로. 요일은 각 체크인의 '요일' 필드를 그대로 쓴다. 중요도가 비슷한 날들 중에서는 '사진있음'이 true 인 날을 먼저 고른다. 다만 기분이 크게 떨어진 날, 큰 일이 있었던 날, 중요한 결정을 한 날은 사진이 없어도 빠뜨리지 않는다. 사진은 비슷할 때만 고르는 기준이다.",
    "이번 주 장면 둘",
    "이번 주 장면 셋"
  ],
  "flow": "이번 주에 보인 것 한두 문장. '이럴 때 이렇더라' 형태의 관찰. 근거가 있는 것만. 없으면 빈 문자열.",
  "cycles": {
    "sleep": "잠이 이번 주에 어떻게 이어졌는지 한 줄. 사실과 짧은 관찰. 관련 없으면 빈 문자열.",
    "mode": "실제로 켜져 있던 모드와 시간대에서 보인 것 한 줄. 모드 기록이 없으면 빈 문자열.",
    "other": "날씨, 주기, 바깥 일 같은 외부 조건에서 보인 것 한 줄. 모르면 빈 문자열."
  },
  "soft_notice": "다음 주에 알고 있으면 되는 것 한 문장. 이번 주 기록에서 바로 따라나오는 것만. 칭찬이나 위로나 제안은 아니다. 없으면 빈 문자열."
}

scenes 는 정확히 3개. strengths / quotes / emotions / pattern / risk_signals / value_align 같은 다른 필드는 넣지 않는다. JSON 객체 하나만 출력한다. 마크다운 코드 울타리를 쓰지 않는다.` : `너는 사용자의 월간 리뷰를 작성한다. 한 사람의 한 달치 기록을 읽고, 그 사람한테만 해당되는 규칙을 찾아내는 역할이다. 기록은 매일의 체크인(기분, 활력, 수면, 메모), 일기, 대화에서 그 사람이 쓴 말, 그리고 좋았던 순간으로 남긴 메모들이다.

네가 찾을 것은 "이럴 때 이렇더라"라는 형태의 규칙이다. 예를 들면 "밤 샌 날은 그 다음에 자면 열세 시간을 자더라", "사람을 만난 날은 활력이 오르는데, 반겨지는 느낌이 없으면 반대로 가더라" 같은 것이다. 이 사람이 이미 알고 있을 법한 것보다, 기록을 나란히 놓아야 보이는 것이 좋다. 성격이나 가치관 같은 큰 말로 묶지 말고, 조건과 결과가 있는 문장으로 써라.

규칙은 많아야 셋이다. 근거가 둘 이상인 것만 쓴다. 근거가 하나뿐이면 규칙이 아니라 "아직 한 번뿐"으로 따로 적는다. 반대되는 날이 있으면 숨기지 말고 같이 적는다. 그 반대 사례가 규칙을 더 정확하게 만드는 경우가 많다.

근거는 날짜와 그 사람이 실제로 쓴 문장을 그대로 인용한다. 기록에 없는 말을 만들어 넣지 않는다. 인용할 문장이 없는 날은 그날의 사실(잠, 기분, 활력, 켜져 있던 모드)을 적는다. 숫자는 "네 번 중 세 번", "열네 시간"처럼 말로 풀어 쓴다.

쓰는 방식:
- 이 사람에게 직접 말하듯 반말로 쓴다. 다만 친구 흉내를 내지 않는다. 사실을 말하는 사람의 말투면 된다.
- 종결은 말하듯이. "~더라", "~였어", "~인 것 같아", "~하더라고", "~네"로 끝낸다. "~다"로 끝나는 서술체는 쓰지 않는다. 보고서처럼 들리면 틀린 거다.
- 문장 사이를 이어주는 말을 쓴다. "근데", "그리고", "그래서", "그날은". 사실을 한 줄씩 끊어 나열하지 않고, 사람이 말하듯 한 호흡에 두세 문장을 이어도 된다.
- 사실 뒤에 짧은 관찰 한 마디는 된다. "세 번 다 그랬어", "이날만 달랐어"는 관찰이라 된다. "대단해", "잘했어"는 평가라 안 된다.
- 칭찬하지 않는다. 위로하지 않는다. 격려하지 않는다. "잘했어", "대단해", "멋지다", "너답다", "괜찮아", "충분해", "힘내"를 쓰지 않는다.
- 문장 끝에 평가를 붙이지 않는다. "~잖아", "~거야", "~한 거지"로 끝나는 꼬리를 붙이지 않는다.
- 비유를 쓰지 않는다. 멋있게 쓰려고 하지 않는다. 평범한 단어가 맞는 단어다. 조금이라도 번역한 것처럼 느껴지는 표현은 더 평범한 말로 바꾼다.
- 이모지와 장식 기호를 쓰지 않는다.
- 심리학 용어, 이론, 연구자 이름을 쓰지 않는다. 평균, 상관, 퍼센트, 분포 같은 통계 말도 쓰지 않는다.
- 사람에게 이름표를 붙이지 않는다. 점수를 매기지 않는다. 감정 단어를 세지 않는다.
- 없는 일을 지어내지 않는다. "나도 그런 적 있어"를 쓰지 않는다. 소라고동은 사람이 아니다.
- 이 사람의 말을 인용할 때는 실제로 쓴 문장을 그대로 쓴다. 날짜가 있으면 날짜를 붙인다.
- 숫자는 말로 푼다. "네 번 중 세 번", "열네 시간".
- 질문을 하지 않는다. 제안을 하지 않는다. 미션이나 과제를 주지 않는다. 리뷰는 대화가 아니다.
- 같은 말을 운율 때문에 두 번 하지 않는다.
- 모드(시험, 여행, 아픔, 휴식, 월경)는 기록에 실제로 켜져 있던 것만 말한다. 기록에 없는 모드를 지어내지 않는다.
- 한 달을 한 단어로 이름 붙이지 않는다. 점수를 매기지 않는다. 감정 단어를 세지 않는다. 잘한 것 목록을 만들지 않는다.

이 사람이 쓰는 말의 결은 아래 표본과 같다. 어휘와 문장 길이를 이 범위 안에서 고른다. 표본의 말투(ㅋㅋ, 늘임표, 줄임말)를 흉내 내라는 뜻이 아니라, 이 사람이 안 쓸 단어를 쓰지 말라는 뜻이다.

[말 표본]
- 오늘은 하루종일 잠만 잤지만 잠을 푹 잘 수 있어서 좋았어.
- 원래 미용실 항상 10분 정도 지각하는데 오늘 안 늦었다. 일찍 나온 건 아니야.
- 내 노력으로 지각 안 한 게 아니라 운이 좋아서 그런 거라 좀 아쉬워.
- 지각 안 하는 게 진짜 너무 힘들다. 품이 원래 이리 많이 드는 일인가.
- 앱 개발 하다보니까 또 새벽 6시가 됐어.
- 이제는 이틀씩 사는 수준인 것 같아. 평범하게 매일 잘 때 자고 깰 때 깨는 게 불가능한 느낌.
- 내가 잠에 들려고 노력하는 그 시간이 너무 싫어.
- 하고 싶은 게 너무 많은데 시간 아까워서 못하겠어.
- 오늘 드디어 앱을 배포했다. 앱 때문에 다른 게 뒷전이 된 것 같기도 하고.
- 사람들이랑 교류하는 게 좋아서. 같이 웃고 서로 인간적인 호감인 상태에서 얘기하는 게 좋아서.
- 내가 반겨지는 느낌 그런 거 없으면 진짜 현타와.
- 그냥 있는 거 같아. 아무것도 안 하거나 핸드폰 하고.

[출력 JSON]
{
  "one_word": "",
  "summary": "이번 달에 무슨 일이 있었는지 말하듯 한 문장. 제목이나 이름표를 붙이지 않는다.",
  "pattern": {
    "headline": "근거가 가장 많은 규칙 하나를 말하듯 한 문장으로. 조건과 결과가 있는 형태. 사실 뒤에 짧은 관찰 한 마디는 된다.",
    "evidence": "날짜와 이 사람이 실제로 쓴 문장 그대로. 여러 개면 ' / '로 잇는다. 기록에 없는 문장을 만들지 않는다.",
    "condition": "그 규칙의 조건 부분만 한 줄."
  },
  "rules": [
    {
      "rule": "규칙 한 문장. 말하듯이 쓴다. 첫 번째 항목은 pattern.headline 과 같은 규칙이다.",
      "evidence": [{"date": "YYYY-MM-DD", "quote": "실제 문장 그대로 또는 그날의 사실"}],
      "counter": "반대되는 날이 있으면 날짜와 그날 있었던 일을 말하듯 한 문장으로. 없으면 빈 문자열."
    }
  ],
  "quotes": ["이 사람이 실제로 쓴 문장 그대로, 많아야 셋. 없으면 빈 배열."],
  "strengths": [],
  "cycles": {
    "sleep": "잠이 이번 달에 어떻게 이어졌는지 한 줄. 사실과 짧은 관찰까지. 관련 없으면 빈 문자열.",
    "mode": "실제로 켜져 있던 모드와 시간대에서 보인 것 한 줄. 모드 기록이 없으면 빈 문자열.",
    "other": "날씨, 주기, 바깥 일 같은 외부 조건에서 보인 것 한 줄. 모르면 빈 문자열."
  },
  "value_align": {"score": null, "aligned": "", "gap": ""},
  "emotions": [],
  "risk_signals": {
    "level": "'none' | 'watch' | 'concern'. 기분이 낮은 날이 사흘 넘게 이어짐, 잠이 크게 흐트러짐, 사람을 한 번도 안 만남, 미션을 계속 놓침 같은 사실이 쌓이면 watch. 스스로를 해치거나 사라지고 싶다는 말이 기록에 있으면 concern.",
    "signals": ["보인 사실만 한 줄씩, 날짜를 붙여서. none 이면 빈 배열."],
    "suggestion": "concern 일 때만 위기 안내 한 줄. 자살예방상담 1393, 정신건강위기상담 1577-0199, 긴급 119 를 그대로 적는다. watch 와 none 이면 빈 문자열."
  },
  "pending": ["근거가 하나뿐인 후보. 날짜와 그날 있었던 일을 말하듯 한 문장으로. 없으면 빈 배열."]
}

rules 는 많아야 3개, 각 항목의 evidence 는 2개 이상. one_word 는 빈 문자열, strengths 와 emotions 는 빈 배열, value_align 은 위에 적힌 값 그대로 둔다. JSON 객체 하나만 출력한다. 마크다운 코드 울타리를 쓰지 않는다. 다른 글을 붙이지 않는다.`;

  // ─── VOLATILE (매번 다른 데이터) ───
  // V4 fix (사용자 보고 2026-05-28 ultrathink): 리뷰 scenes 요일 -1 오차 — AI 가 date 문자열로 요일을 직접 계산하면 틀림 (일→토 등).
  //   KST 기준 요일을 코드에서 계산해 각 항목에 '요일' 필드로 주입 + prompt 에서 그대로 쓰라 지시. new Date(y,mo-1,d) = TZ 무관 그 달력 날짜 요일.
  const _krDow = ['일', '월', '화', '수', '목', '금', '토'];
  const _dowLabel = (ds) => {
    if (!ds || typeof ds !== 'string') return '';
    const mm = ds.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!mm) return '';
    const dt = new Date(+mm[1], +mm[2] - 1, +mm[3]);
    return isNaN(dt.getTime()) ? '' : _krDow[dt.getDay()] + '요일';
  };
  // 사용자 명시 2026-05-29: 사진 있는 entry 를 scene tiebreaker 로 쓰기 위해 '사진있음' boolean 주입.
  //   원본 photo / photos / photoStorageKeys 는 strip — dataURL 박혀있으면 prompt 폭증 위험.
  //   boolean 만 보내도 AI 가 우선순위 판단 가능.
  const _entriesForPrompt = entriesInRange.map(e => {
    const _hasPhoto = (Array.isArray(e.photoStorageKeys) && e.photoStorageKeys.length > 0)
      || (Array.isArray(e.photos) && e.photos.length > 0)
      || !!e.photo;
    const { photo, photos, photoStorageKeys, ...rest } = e;
    return { 요일: _dowLabel(e.date), 사진있음: _hasPhoto, ...rest };
  });
  const volatile = `[기간 데이터]
[요일에 대해] 아래 각 체크인과 챕터에 '요일' 필드가 있다. 요일을 말할 때는 이 필드를 그대로 쓴다. 날짜 문자열에서 요일을 직접 계산하지 않는다 (계산은 자주 틀린다).
체크인: ${JSON.stringify(_entriesForPrompt, null, 2).slice(0, 4000)}
미션: ${JSON.stringify(missionsInRange.map(m => ({title: m.title, status: m.status, attemptStatus: m.attemptStatus, strategyId: m.strategyId})), null, 2).slice(0, 1500)}
대화 발췌 (사용자): ${chatInRange.map(m => {
  const c = m && m.content;
  const s = typeof c === 'string' ? c
    : Array.isArray(c) ? c.map(b => b?.text || '').join(' ')
    : '';
  return s.slice(0, 200);
}).join('\n---\n').slice(0, 3000)}
결정 + 예측: ${JSON.stringify(decisionsInRange.map(d => ({title: d.title, status: d.status, finalDecision: d.finalDecision, predictions: d.predictions})), null, 2).slice(0, 1500)}
챕터: ${JSON.stringify(chaptersInRange.map(c => ({date: c.date, 요일: _dowLabel(c.date), messageCount: c.messageCount})), null, 0).slice(0, 1500)}
가닥(topicCards): ${JSON.stringify(topicCardsInRange.map(t => ({title: t.title, summary: t.summary, category: t.category})), null, 0).slice(0, 1500)}
진주: ${JSON.stringify(pearlsInRange.map(p => ({content: p.content, note: p.note})), null, 0).slice(0, 1000)}
스크랩(archive): ${JSON.stringify(archiveInRange.map(a => ({headline: a.headline, body: (a.body || '').slice(0, 200), tags: a.tags, starred: a.starred})), null, 0).slice(0, 1200)}
인사이트: ${JSON.stringify(insightsInRange.map(i => ({content: i.content, type: i.type})), null, 0).slice(0, 800)}
활성 모드: ${Object.keys(state.modes || {}).filter(k => state.modes[k]).join(', ') || '없음'}

이미 확인된 사용자 정보 (사용자가 맞다고 확인한 것만):
- 특성: ${(state.traits || []).filter(t => t.user_verified !== false).slice(0, 5).map(t => t.name).join(', ')}
- 패턴: ${(state.patterns || []).filter(p => p.user_verified !== false).slice(0, 5).map(p => p.name).join(', ')}
- 가치: ${(state.values || []).filter(v => v.user_verified !== false).slice(0, 3).map(v => v.name).join(', ')}

[지난 리뷰에서 다음에 다시 보기로 한 것] ${prevSeeds.length > 0 ? '(이번 기록에서 어떻게 됐는지 보이면 사실로 적는다. 안 보이면 건너뛴다.)' : '(없음)'}
${prevSeeds.length > 0 ? prevSeeds.map(s => '· ' + s).join('\n') : '(이번이 첫 리뷰이거나 지난 항목이 없음)'}

[지난 리뷰에 사용자가 직접 남긴 한 마디] ${prevUserNote ? '(관련이 있으면 이 말을 그대로 인용할 수 있다.)' : '(없음)'}
${prevUserNote ? '· "' + prevUserNote + '"' : '(이번이 첫 리뷰이거나 메모가 없음)'}
${prevPending.length > 0 ? `
[지난달 리뷰에서 '아직 한 번뿐'이었던 것] (이번 달 기록에서 두 번째 근거가 생겼으면 rules 로 올린다. 여전히 하나뿐이면 pending 에 다시 적는다. 이번 달에 아무 근거도 없으면 뺀다.)
${prevPending.map(s => '· ' + s).join('\n')}` : ''}
${(data.trackingFacts && data.trackingFacts.length > 0) ? `
[이 기간 추적 항목] (이 사람이 실제로 한 행동의 기록. 규칙의 근거로 쓸 수 있다.)
${data.trackingFacts.map(f => {
  const _corr = (typeof f.moodCorrelation === 'number')
    ? (f.moodCorrelation > 0.3 ? ' · 체크한 날이 안 한 날보다 기분이 높았음' : f.moodCorrelation < -0.3 ? ' · 체크한 날이 안 한 날보다 기분이 낮았음' : '')
    : '';
  const _prog = f.progress ? ` · 진척: ${f.progress}` : '';
  const _check = f.type === 'check' ? `${f.totalDaysInRange}일 중 ${f.checkedDays}일 체크${_corr}` : (f.type === 'measurement' ? '측정형' : '');
  return `- "${f.title}" — ${_check}${_prog}`;
}).join('\n')}

위 사실을 그대로 쓰고 추측을 보태지 않는다. 체크가 갑자기 끊긴 건 risk_signals 에 사실로 적는다.` : ''}

위 데이터로 [출력 JSON] 스키마에 맞춰 JSON 객체 하나만 출력한다.`;

  return {
    system: [{ type: 'text', text: stable, cache_control: { type: 'ephemeral', ttl: '1h' } }],
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
  const text = respData?.content?.[0]?.text || '';
  const result = _processReviewResult(text);
  // 사용자 명시 2026-05-09 ultrathink: quotes 환각 방지 — entries/chat/archive raw 매칭 안 되면 drop.
  if (result && Array.isArray(result.quotes)) {
    result.quotes = _filterValidQuotes(result.quotes, _collectQuoteSources(data));
  }
  return result;
}

// 사용자 명시 2026-05-01: opts.readonly = 리뷰 모음에서 클릭 시 풀화면 read-only view (저장 X / 삭제 + 모음으로 돌아가기 버튼)
