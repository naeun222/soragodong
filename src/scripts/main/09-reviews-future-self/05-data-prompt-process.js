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

  return {
    type,
    cutoff, cutoffEnd, cutoffISO, cutoffEndISO,
    entriesInRange, missionsInRange, chatInRange, decisionsInRange,
    topicCardsInRange, pearlsInRange, archiveInRange, insightsInRange, chaptersInRange,
    prevSeeds, prevUserNote,
    trackingFacts  // 사용자 명시 2026-05-10 (큐 6): monthly+ 만 채워짐.
  };
}

// 리뷰 prompt 빌더 — system / model / max_tokens / userMessage / _endpoint 반환.
// 사용자 명시 2026-05-02 ultrathink (ERROR #9): entries 0개 = null return → caller skip.
// V4 사용자 명시 (V190): batch API 전환 + cache_control 분리 (buildSystemPrompt 패턴).
//   stable 가이드 (목표 / Detective / 일상어 / 톤 / 출력 JSON 스키마) → system + ephemeral cache → 90% 비용 ↓
//   volatile 데이터 (기간 데이터 / 알려진 사용자 / 지난 씨앗) → userMessage
//   inline (generateReview) / batch (_buildReviewBatchRequests) 둘 다 같은 spec 사용 → 동시 적용.
function _buildReviewPrompt(type, data) {
  const { entriesInRange, missionsInRange, chatInRange, decisionsInRange, topicCardsInRange, pearlsInRange, archiveInRange, insightsInRange, chaptersInRange, prevSeeds, prevUserNote } = data;

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
  // 사용자 명시 2026-05-10 (큐 7+8): 주간 리뷰 schema 4 섹션만 — MOMENTUM / 장면 3 / 흐름 / 부드러운 알림.
  //   옛 strengths / quotes / emotions / pattern / risk_signals / cycles / value_align 모두 출력 X (사용자 명시 "잘한 것 / 너의 인용 / 감정 파트 빼야").
  //   "리뷰 모음에서 inline 으로 가볍게" — 4 섹션만 deep-dive 없이.
  const stable = type === 'weekly' ? `너는 사용자의 주간 리뷰를 작성한다. 가볍게, 4 섹션만.

[목표]
이번 주 가까운 거리 일기. 사건과 감정 raw. 분석가 X 친구의 메모 ○.
큰 패턴 발견은 월간/분기에서 — 주간은 짧은 관찰만.

[일상어 강제]
- 수치 약어 / 분석가 어휘 절대 X. 일상 한국어 그대로.
- 통계 어휘 (correlation / 평균 / +N% / std dev / 분포) 전면 X.
- 친구한테 카톡 쓰듯이.

[톤]
친한 친구. 반말. 상담사 X.
구체 > 일반. 판단 X. self-compassion.
짧게. 주간이라 가벼움. 무겁게 결론 X. "이런 일이 있었네" 톤.
살짝 토닥토닥 — 자연스럽게 잘한 거 / 버텨낸 거 짚어줘. 과장 X. 예: '이만큼 해냈네 ✦' / '의외로 잘 챙겼어' / '버텨낸 한 주야'.

[출력 JSON — 6 섹션]
{
  "one_word_weekly": "이번 주 momentum 한 단어 — 운동·진행 어휘 (예: \\"정착중\\", \\"가속중\\", \\"회복중\\", \\"휘청중\\", \\"재정비\\", \\"몰입\\", \\"숨고르기\\"). 한 단어.",
  "momentum_line": "MOMENTUM 한 단어 보충 한 문장 — 소라고동 톤. 그 한 단어가 어떻게 드러났나 짧게. 살짝 격려 톤 OK. 예: '활력이 바닥일 때 오히려 제일 많이 만들어냈어 — 그 자체로 대단해' / '자고 일어나면 다시 출발선이라 휘청대도 OK, 일주일 끌고 왔어'. 분석가 X 친구 톤.",
  "scenes": [
    "이번 주 장면 1 (30-50자, 일기 톤, when + what + feeling 자연 한 문장. 예: '월요일 저녁 엄마 통화 후 30분 멍 — 울컥')",
    "이번 주 장면 2",
    "이번 주 장면 3"
  ],
  "flow": "이번 주 흐름 1-2 문장 (가벼운 관찰. 'X일 때 Y 같음' 톤. 예: '잘 잔 다음날 한결 가벼웠어. 카페 가는 날엔 글이 술술.'). 짧게.",
  "cycles": {
    "sleep": "수면 → 이번 주 영향 (1줄, 일상어). 예: '잘 잔 날 3번, 다음날마다 가벼웠어'. 무관하면 빈 문자열.",
    "mode": "활성 모드 / 시간대 (1줄, 일상어). 예: '저녁 9시 넘으면 글이 술술'. 무관하면 빈 문자열.",
    "other": "황체기 / 날씨 / 외부 (1줄, 일상어). 모르면 빈 문자열."
  },
  "soft_notice": "부드러운 알림 1 문장 (선택, 강요 X. 자기친절 + 살짝 격려 톤. 예: '이번 주 좀 빡셌어 — 다음 주는 살살 가도 OK', '의외로 잘 챙겼네 ✦', '버텨낸 것만으로 잘했어', '잘 해온 거 짚어주고 싶었어'). 데이터 부족 / 가벼운 주면 빈 문자열."
}

scenes 는 정확히 3개. 다른 field (strengths / quotes / emotions / pattern / risk_signals / value_align) 절대 X. JSON 객체 하나만. markdown code fence X.` : `너는 사용자의 월간 리뷰를 작성한다.

[목표]
단순 요약 X. **Detective** — 사용자가 못 본 cross-pattern 발견.
사용자 자신의 인용 5개 → 자기친밀감.
다음 리뷰 때 다시 볼 '씨앗' 적용하기 → 리뷰 간 continuity.
이번 달의 너를 한 단어로 명명 (정체성 hook).

[패턴 발견 — Detective 가이드]
- mode + entries + missions + outcomes 교차 봐.
- 예: "쉰 일요일 다음주, 한결 가벼워" / "산책한 날에만 글이 잘 됐어, 4번 중 4번"
- 예: "관계 entry 들 다 비 오는 날 적혔네 — 흐린 날이 오히려 관계 챙기는 시기인가?"
- generic 패턴 X. 구체 (요일 / 인용 / 횟수) 로 입증.
- V4 fix (사용자 보고 2026-05-21): mode 예시는 사용자 실제 activeModes (state.modes / entry.modes) 만 참조. 데이터에 없는 mode 단어 절대 X (예: 사용자가 월경 모드인데 '시험기' 인용 = 환각, hardcoded 예시 모방 금지).

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
  "one_word": "이번 달의 너 = 정체성 한 단어 (예: \\"관찰자\\", \\"협상자\\", \\"탐험가\\", \\"잠수부\\"). 한 단어만.",
  "summary": "이번 달 한 줄 요약 (15-30자)",
  "pattern": {
    "headline": "발견한 패턴 한 문장 — 친구 톤 / 일상 어휘. 짧고 surprising. 수치 약어 절대 X. 예: '아침 산책 한 날 = 그날 일기 길어', '잠 잘 잔 다음날, 기분이 한 단계 가벼워', '마감 임박이면 진짜 빨리 진입하네'. (X 'sleep 7h+ → mood +1.5')",
    "evidence": "구체 근거 — entry 인용 1-2개 + 요일/횟수. 일상 어휘로 풀어 써. 예: '"오늘 일찍 잤더니 머리 맑아." (화/목)'. (X '7h+ 4 days, mood avg 4.2')",
    "condition": "어떤 조건일 때인지 (1줄, 일상 톤). 예: '11시 전에 자고 30분 산책할 때'. (X 'sleep<23:00 + exercise≥30min')"
  },
  "quotes": ["짧은 인용 0-5개 (entries / 대화에서 실제로 있는 것만, 각 30자 이내). 데이터 부족하면 0개 OK — 합성 절대 X.", "..."],
  "strengths": ["이번 달 사용자가 잘한 작은 win 0-5개 (구체, 자기 친밀 톤, 자존감 boost). 데이터 부족하면 1-2개 OK. 결과 X 시도·태도·관찰 ○. 예: '월요일 마감 임박에도 잠 7시간 챙김', '엄마 통화 후 5분 산책으로 회복'", "..."],
  "cycles": {
    "sleep": "수면 → 이번 달 영향 (1줄, 일상어). 예: '잘 잔 날 4번, 다음날마다 한결 가벼웠어'. (X '7h+ avg → +1.5'). 무관하면 빈 문자열.",
    "mode": "이번 달 entry.modes 에 실제로 활성됐던 모드 (시험·여행·아픔·휴식·월경 중 사용자가 체크한 것만) 와 시간대에서 어땠는지 (1줄, 일상어). 사용자 실제 데이터에 없는 모드 절대 인용 X. 예 (실제 활성된 모드만 참조): '월경 중인데도 진주 5개 추가했어', '여행 모드 동안 일기 한 줄로 짧아졌어'. 모드 데이터 없으면 빈 문자열.",
    "other": "황체기·날씨·계절·외부 (1줄, 일상어). 예: '비 오는 날 살짝 무거웠어'. 모르면 빈 문자열."
  },
  "value_align": {
    "score": "0-10 정수 — 사용자 본인 values 명단 와 이번 달 행동이 얼마나 맞았나. values 명단 X 면 score=null.",
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
  const _entriesForPrompt = entriesInRange.map(e => ({ 요일: _dowLabel(e.date), ...e }));
  const volatile = `[기간 데이터]
[중요 — 요일] 아래 각 체크인/챕터의 '요일' 필드를 그대로 써. date 문자열로 요일을 직접 계산하지 마 (요일 계산은 틀리기 쉬움). 장면·패턴에서 요일을 언급할 땐 반드시 '요일' 필드 기준.
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

이미 알려진 사용자 (user_verified ✓ 만):
- traits: ${(state.traits || []).filter(t => t.user_verified !== false).slice(0, 5).map(t => t.name).join(', ')}
- patterns: ${(state.patterns || []).filter(p => p.user_verified !== false).slice(0, 5).map(p => p.name).join(', ')}
- values: ${(state.values || []).filter(v => v.user_verified !== false).slice(0, 3).map(v => v.name).join(', ')}

[지난 리뷰 씨앗] ${prevSeeds.length > 0 ? '(callback 추천 — 씨앗이 어떻게 됐는지 짚어주면 사용자 신뢰↑)' : '(없음)'}
${prevSeeds.length > 0 ? prevSeeds.map(s => '· ' + s).join('\n') : '(이번이 첫 리뷰 또는 이전 씨앗 X)'}

[지난 리뷰 사용자 한 마디] ${prevUserNote ? '(사용자가 직접 남긴 메모 — 어휘 그대로 짚어주면 자기친밀감 ↑)' : '(없음)'}
${prevUserNote ? '· "' + prevUserNote + '"' : '(이번이 첫 리뷰 또는 사용자 메모 X)'}
${(data.trackingFacts && data.trackingFacts.length > 0) ? `
[이 기간 추적 항목] (사용자 명시 2026-05-10 — 행동 actual 데이터. 패턴/강점/가치 일관성/위험 신호 추출 시 활용.)
${data.trackingFacts.map(f => {
  const _corr = (typeof f.moodCorrelation === 'number')
    ? (f.moodCorrelation > 0.3 ? ` · 한 날 기분 한결 좋음 (+${f.moodCorrelation.toFixed(1)})` : f.moodCorrelation < -0.3 ? ` · 한 날 기분 살짝 무거움 (${f.moodCorrelation.toFixed(1)})` : '')
    : '';
  const _prog = f.progress ? ` · 진척: ${f.progress}` : '';
  const _check = f.type === 'check' ? `${f.checkedDays}/${f.totalDaysInRange}일 체크${_corr}` : (f.type === 'measurement' ? '측정형' : '');
  return `- "${f.title}" — ${_check}${_prog}`;
}).join('\n')}

[활용 가이드]
- 추적 항목 = 사용자 행동 사실 (추측 X). pattern / strengths / value_align / risk_signals 추출 시 evidence 로 활용.
- 모델 자체 추측 X — 위 fact 를 그대로 인용 ("X 한 날 기분 더 좋았어" 식).
- 체크율 급락 = risk 신호 (부드럽게).` : ''}

위 데이터로 [출력 JSON] 스키마에 맞춰 JSON 객체 하나만 반환.`;

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
