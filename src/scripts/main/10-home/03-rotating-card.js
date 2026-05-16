// 사용자 명시 2026-05-09 (회전 카드 spec final): 미컨펌 우선 정렬 + 세션 lock.
// spec: rotating-card-final-2026-05-09.md (이 문서가 최종)
// 사용자 명시 2026-05-16: 별자리 운세 source 폐기. 4 source 남음: 진주 / 고동의 일기 / 시뮬레이션 / 어제 + weekly~annual review.
// 폐기: 어제 비교 / 회상 / 통찰(→ 새로 본 너 흡수) / Surprise / 별자리 운세

// =============================================================================
// STATE 마이그 — 누락 필드 자동 보완 (preferences namespace 보호)
// =============================================================================
function _ensureRotatingCardState() {
  if (!state.rotatingCardState || typeof state.rotatingCardState !== 'object') {
    state.rotatingCardState = {};
  }
  const r = state.rotatingCardState;
  // 진주
  if (typeof r.pearlWindowStart === 'undefined') r.pearlWindowStart = null;
  if (typeof r.pearlCurrentId === 'undefined') r.pearlCurrentId = null;
  if (typeof r.lastPearlShownDate === 'undefined') r.lastPearlShownDate = null;
  // 새로 본 너
  if (!Array.isArray(r.unseenInsights)) r.unseenInsights = [];
  if (!Array.isArray(r.unseenInsightsHistory)) r.unseenInsightsHistory = [];
  // 미니 리뷰 (legacy)
  if (typeof r.lastMiniReviewAt === 'undefined') r.lastMiniReviewAt = null;
  if (typeof r.miniReviewContentId === 'undefined') r.miniReviewContentId = null;
  // 고동의 일기 (사용자 명시 2026-05-10)
  if (typeof r.lastGodongDiaryAt === 'undefined') r.lastGodongDiaryAt = null;
  if (typeof r.godongDiaryContentId === 'undefined') r.godongDiaryContentId = null;
  // Quiz
  if (typeof r.quizDay === 'undefined') r.quizDay = null;
  if (typeof r.quizProgress === 'undefined') r.quizProgress = null;
  if (!r.quizDeniedCooldown || typeof r.quizDeniedCooldown !== 'object') r.quizDeniedCooldown = {};
  if (!r.quizSkippedCooldown || typeof r.quizSkippedCooldown !== 'object') r.quizSkippedCooldown = {};
  if (typeof r.quizScoreBefore === 'undefined') r.quizScoreBefore = null;
  // 시뮬레이션 (사용자 명시 2026-05-09)
  if (typeof r.simulationBlockKey === 'undefined') r.simulationBlockKey = null;
  if (typeof r.currentSimulation === 'undefined') r.currentSimulation = null;
  if (!r.userSimulationsToday || typeof r.userSimulationsToday !== 'object') r.userSimulationsToday = {};
  // 사용자 명시 2026-05-11: 최근 시뮬 시나리오 dedupe (다양성 ↑). 최대 20개.
  if (!Array.isArray(r.recentSimulations)) r.recentSimulations = [];
  // 디버깅 / 호환
  if (!Array.isArray(r.history)) r.history = [];
  return r;
}

// =============================================================================
// 상수 — baseWeight + tie-breaker stable order
// 사용자 명시 2026-05-09 (재정정): '새로 본 너' source 폐기 → Quiz 로 통합 (둘 다 caseFormulation 미컨펌 풀 사용 — 중복).
// 사용자 명시 2026-05-09 (추가): 시뮬레이션 source 6 추가 — Sonnet, 4h block, on-demand generate.
// 사용자 명시 2026-05-16: 별자리 운세 source 폐기.
// 4 source: 진주 / 미니 리뷰 / Quiz / 시뮬레이션
// =============================================================================
// 사용자 명시 2026-05-10 (재정의): review 4개 = 명확 우선순위. 그 외 = 동급 weight 100.
//   1 annual / 2 quarterly / 3 monthly / 4 weekly / 5 (동급): 어제 기록 / 진주 큐레이션 / 상상 시뮬 / 고동의 일기
//   사용자 미컨펌 우선순위 정책 폐기 (옛 _rcSortByConfirmation unconfirmed 우선 분기).
//   사용자 명시 2026-05-10 (handoff): miniReview → godongDiary 로 전환 (HANDOFF.md prototype).
const _RC_BASE_WEIGHTS = {
  review_annual:    500,
  review_quarterly: 400,
  review_monthly:   300,
  review_weekly:    200,
  // 동급 100 — _RC_SOURCE_ORDER 의 tie-break 으로 결정.
  yesterday:        100,
  pearl:            100,
  simulation:       100,
  godongDiary:      100,
};
const _RC_SOURCE_ORDER = [
  'review_annual', 'review_quarterly', 'review_monthly', 'review_weekly',
  'yesterday', 'pearl', 'simulation', 'godongDiary'
];

const _RC_PEARL_WINDOW_MS = 4 * 60 * 60 * 1000;       // 진주 4시간 stay
const _RC_GODONG_DIARY_COOLDOWN_MS = 3 * 86400000;    // 고동의 일기 3일 stay (옛 미니 리뷰 패턴 유지)
const _RC_QUIZ_DENIED_COOLDOWN_MS = 14 * 86400000;    // [아닌데] 14일
const _RC_QUIZ_SKIPPED_COOLDOWN_MS = 1 * 86400000;    // [넘기기] 1일

// =============================================================================
// 세션 lock (전역) — sessionOrder 화면 떠날 때까지 stash, 새 진입 시 reset
// =============================================================================
let _rcSessionOrder = null;
let _rcSessionIndex = 0;
let _rcSessionConfirmed = new Set();

function _rcResetSession() {
  _rcSessionOrder = null;
  _rcSessionIndex = 0;
  _rcSessionConfirmed = new Set();
}

function _rcSessionMarkConfirmed(sourceId) {
  if (sourceId) _rcSessionConfirmed.add(sourceId);
}

// =============================================================================
// crisis keyword filter (anti-trigger 가드)
// =============================================================================
const _RC_CRISIS_KEYWORDS = [
  '자살', '자해', '죽고싶', '죽고 싶',
  '사라지고싶', '사라지고 싶', '없어지고싶', '없어지고 싶',
  '끝내고싶', '끝내고 싶', '끝내자',
  '뛰어내리', '목숨', '극단', '약 다',
];
function _rcHasCrisis(text) {
  if (!text) return false;
  const s = String(text).toLowerCase();
  for (const kw of _RC_CRISIS_KEYWORDS) if (s.includes(kw)) return true;
  return false;
}

// =============================================================================
// helpers
// =============================================================================
function _rcPickRandom(arr) {
  if (!arr || arr.length === 0) return '';
  return arr[Math.floor(Math.random() * arr.length)];
}

function _rcTodayKey() {
  // 사용자 명시 2026-05-11: fallback 도 4AM cutoff (getDayKey).
  if (typeof todayKey === 'function') return todayKey();
  if (typeof getDayKey === 'function') return getDayKey();
  return new Date(Date.now() - 4 * 3600000).toISOString().slice(0, 10);
}

// 4AM cutoff key — 사용자 명시 2026-05-09: 미니 리뷰 / Quiz / 고동의 일기 모두 새벽 4시 cutoff 일관성.
// 사용자 명시 2026-05-11: getDayKey 위임으로 통일 (옛 자체 구현 제거).
function _rcCutoffKeyOf(timestampOrIso) {
  if (typeof getDayKey === 'function') return getDayKey(timestampOrIso);
  // fallback
  const d = new Date(timestampOrIso);
  d.setTime(d.getTime() - 4 * 3600000);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function _rcDayDiff(keyA, keyB) {
  if (!keyA || !keyB) return 0;
  const a = new Date(keyA + 'T00:00:00').getTime();
  const b = new Date(keyB + 'T00:00:00').getTime();
  return Math.round((a - b) / 86400000);
}

// =============================================================================
// 컨펌 판정 — historicallyConfirmed (state 기반) + sessionConfirmed (이번 세션)
// =============================================================================
function _rcIsHistoricallyConfirmed(sourceId) {
  const r = _ensureRotatingCardState();
  const todayK = _rcTodayKey();
  switch (sourceId) {
    case 'pearl':      return r.lastPearlShownDate === todayK;
    case 'miniReview': {
      // 사용자 명시 2026-05-09: 3일 새벽 4시 cutoff (호출 시점 + 정확히 3일 후 새벽 4시 부터 새 trigger)
      if (!r.lastMiniReviewAt) return false;
      const lastDayK = _rcCutoffKeyOf(r.lastMiniReviewAt);
      const todayK = (typeof _rcQuizCutoffKey === 'function') ? _rcQuizCutoffKey() : _rcTodayKey();
      return _rcDayDiff(todayK, lastDayK) < 3;
    }
  }
  return false;
}

function _rcIsConfirmed(sourceId) {
  return _rcSessionConfirmed.has(sourceId) || _rcIsHistoricallyConfirmed(sourceId);
}

// =============================================================================
// 정렬 — 미컨펌 위 / 컨펌 아래 + baseWeight desc + tie-breaker
// =============================================================================
// 사용자 명시 2026-05-10 (재정의): 옛 unconfirmed 우선 정책 / pearl unshift 분기 폐기. 그냥 weight 순 정렬.
// V4 (사용자 명시 2026-05-13): 리뷰 link source (weight 200+) = 우선. 그 외 동급 (weight 100) = 매 호출 *랜덤* 셔플 (옛 _RC_SOURCE_ORDER fixed tie-break 폐기).
function _rcSortByConfirmation(sources) {
  const highW = sources.filter(s => (_RC_BASE_WEIGHTS[s.id] || 0) > 100);
  const tieW  = sources.filter(s => (_RC_BASE_WEIGHTS[s.id] || 0) <= 100);
  highW.sort((a, b) => (_RC_BASE_WEIGHTS[b.id] || 0) - (_RC_BASE_WEIGHTS[a.id] || 0));
  // Fisher-Yates shuffle — 동급 source 무작위 첫 자리.
  for (let i = tieW.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tieW[i], tieW[j]] = [tieW[j], tieW[i]];
  }
  return [...highW, ...tieW];
}

// =============================================================================
// Source 1 — 진주 (4시간 stay)
// =============================================================================
function _rcSource1Pearl() {
  const pearls = (state.pearls || []).filter(p => p.type !== 'dna_pearl');
  if (pearls.length === 0) {
    return {
      id: 'pearl',
      available: true,
      isEmpty: true,
      contentHash: 'pearl_empty_cta',
      bodyHtml: typeof _heroEmptyHtml === 'function' ? _heroEmptyHtml() : '',
    };
  }
  if (typeof _heroCardHtml !== 'function') return { id: 'pearl', available: false };

  const r = _ensureRotatingCardState();
  let pick = null;
  // 4시간 windowing
  if (r.pearlWindowStart && r.pearlCurrentId) {
    const elapsed = Date.now() - new Date(r.pearlWindowStart).getTime();
    if (elapsed < _RC_PEARL_WINDOW_MS) {
      pick = pearls.find(p => p.id === r.pearlCurrentId) || null;
    }
  }
  if (!pick && typeof _pickHeroPearl === 'function') {
    pick = _pickHeroPearl();
    if (pick) {
      r.pearlWindowStart = new Date().toISOString();
      r.pearlCurrentId = pick.id;
    }
  }
  if (!pick) return { id: 'pearl', available: false };
  return {
    id: 'pearl',
    available: true,
    contentHash: 'pearl_' + (pick.id || ''),
    bodyHtml: _heroCardHtml(pick, { linkTo: 'pearls-tab' }),
    pick,
  };
}

// =============================================================================
// Source 2 (폐기) — 새로 본 너 → Quiz 로 통합 (사용자 명시 2026-05-09 재정정)
// 옛 함수들 (_rcSource2NewView, _rcCollectNewViewPool, _rcConfirmNewView, _rcNewViewDoneCard, _rcRefreshNewViewSlot)
// = dead code. 호환 위해 stub 유지 (다른 곳 호출 시 silent return).
// =============================================================================

function _rcCollectNewViewPool() {
  const r = _ensureRotatingCardState();
  const cf = state.caseFormulation || {};
  const answeredIds = new Set((r.unseenInsightsHistory || []).map(h => h.id));
  const pool = [];
  const dims = ['problems', 'mechanisms', 'strengths', 'goals', 'growth'];
  // 사용자 명시 2026-05-09: 시드/옛 사용자 = item.text, 새 force-analyze = item.name. 둘 다 인식.
  const nameOf = (it) => (it && (it.name || it.text)) || '';
  for (const kind of dims) {
    const arr = Array.isArray(cf[kind]) ? cf[kind] : [];
    for (const item of arr) {
      const nm = nameOf(item);
      if (!nm) continue;
      if (item.user_verified === true) continue; // 이미 컨펌
      const id = `${kind}::${nm}`;
      if (answeredIds.has(id)) continue;
      pool.push({
        id, kind,
        name: nm,
        description: item.description || '',
        confidence: typeof item.confidence === 'number' ? item.confidence : 0.5,
        sourcePool: 'verified',
      });
    }
    const ua = cf.unverified && Array.isArray(cf.unverified[kind]) ? cf.unverified[kind] : [];
    for (const item of ua) {
      const nm = nameOf(item);
      if (!nm) continue;
      const id = `${kind}::${nm}`;
      if (answeredIds.has(id)) continue;
      pool.push({
        id, kind,
        name: nm,
        description: item.description || '',
        confidence: typeof item.confidence === 'number' ? item.confidence : 0.4,
        sourcePool: 'unverified',
      });
    }
  }
  return pool;
}

function _rcSource2NewView() {
  const pool = _rcCollectNewViewPool();
  if (pool.length === 0) return { id: 'newView', available: false };

  // 가장 confidence 높은 항목 우선 (사용자 진단대로 가장 확실한 새 발견부터)
  pool.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  const pick = pool[0];

  // 카피 = 인사이트 별 동적 생성 (사용자 명시 2026-05-09)
  const kindLabel = _RC_NEW_VIEW_KIND_LABEL[pick.kind] || '소식';
  const intros = [
    `있잖아, 너에 대해 새로 본 ${kindLabel} 하나`,
    `어 너 새 ${kindLabel} 있는 거 알아?`,
    `잠깐 — 새 ${kindLabel} 하나`,
    `오 ${kindLabel} 하나 새로 보였어`,
  ];
  const intro = _rcPickRandom(intros);
  const desc = pick.description || '';
  const descTrim = desc.length > 90 ? desc.slice(0, 90) + '…' : desc;

  // crisis keyword skip (description 안에)
  if (_rcHasCrisis(desc)) {
    // 다음 후보 fallback
    if (pool.length >= 2) {
      const alt = pool[1];
      if (_rcHasCrisis(alt.description || '')) return { id: 'newView', available: false };
      return _rcSource2NewViewWithPick(alt);
    }
    return { id: 'newView', available: false };
  }

  return _rcSource2NewViewWithPick(pick);
}

function _rcSource2NewViewWithPick(pick) {
  // 사용자 명시 2026-05-09: 분석톤 X, 소라고동톤 간단하게. intro + name 만 (description hide).
  const intros = [
    '있잖아',
    '어 이거',
    '잠깐',
    '너 이거',
    '오',
    '있잖아, 너',
  ];
  const intro = _rcPickRandom(intros);

  const bodyHtml = `
    <div class="rc-body-newview">
      <div class="rc-body-headline">${escapeHtml(intro)}</div>
      <div class="rc-body-newview-name">${escapeHtml(pick.name)}</div>
      <div class="rc-newview-actions">
        <button class="rc-btn rc-btn--correct" type="button" onclick="event.stopPropagation(); _rcConfirmNewView('${escapeHtml(pick.id).replace(/'/g, '&#39;')}', 'correct')">맞아 ✓</button>
        <button class="rc-btn rc-btn--wrong" type="button" onclick="event.stopPropagation(); _rcConfirmNewView('${escapeHtml(pick.id).replace(/'/g, '&#39;')}', 'wrong')">아닌데 ✕</button>
      </div>
    </div>
  `;
  return {
    id: 'newView',
    available: true,
    contentHash: 'newView_' + pick.id,
    bodyHtml,
    onTapClick: `showScreen('model')`,
    pick,
  };
}

// 사용자 명시 2026-05-09: 다 봤어 카드 — newView 큐 비어있을 때 source 자리 유지 (다음 source cycle X).
function _rcNewViewDoneCard() {
  const copy = _rcPickRandom([
    '오늘은 다 봤어 ✓',
    '확인 끝 — 내일 또',
    '이정도면 됐어',
    '다 봤네 — 내일 또',
    '오늘 너 다 봤어',
  ]);
  return {
    id: 'newView',
    available: true,
    contentHash: 'newView_done_' + _rcTodayKey(),
    bodyHtml: `
      <div class="rc-body-newview rc-newview-done">
        <div class="rc-body-headline">새로 본 너</div>
        <div class="rc-body-copy">${escapeHtml(copy)}</div>
      </div>
    `,
    onTapClick: '',
    _isNewViewDone: true,
  };
}

// 같은 자리 refresh (sessionOrder 변경 X) — 새 인사이트 있으면 그거, 없으면 '다 봤어'
function _rcRefreshNewViewSlot() {
  if (!Array.isArray(_rcSessionOrder)) {
    if (typeof renderRotatingCard === 'function') renderRotatingCard();
    return;
  }
  const idx = _rcSessionOrder.findIndex(s => s && s.id === 'newView');
  if (idx < 0) {
    if (typeof renderRotatingCard === 'function') renderRotatingCard();
    return;
  }
  const fresh = _rcSource2NewView();
  if (fresh && fresh.available) {
    _rcSessionOrder[idx] = fresh;
  } else {
    _rcSessionOrder[idx] = _rcNewViewDoneCard();
  }
  const container = document.getElementById('rotatingCardContainer');
  if (container && typeof _rcRenderShell === 'function') {
    container.innerHTML = _rcRenderShell(_rcSessionOrder, _rcSessionIndex);
  }
}

function _rcConfirmNewView(itemId, verdict) {
  if (!itemId || (verdict !== 'correct' && verdict !== 'wrong')) return;
  const r = _ensureRotatingCardState();
  if (!Array.isArray(r.unseenInsightsHistory)) r.unseenInsightsHistory = [];
  r.unseenInsightsHistory.push({ id: itemId, verdict, at: new Date().toISOString() });

  // case formulation 항목 mutation (name || text 둘 다 매칭)
  const sep = itemId.indexOf('::');
  if (sep > 0) {
    const kind = itemId.slice(0, sep);
    const name = itemId.slice(sep + 2);
    const cf = state.caseFormulation || {};
    const arrays = [
      Array.isArray(cf[kind]) ? cf[kind] : null,
      cf.unverified && Array.isArray(cf.unverified[kind]) ? cf.unverified[kind] : null,
    ].filter(Boolean);
    for (const arr of arrays) {
      const idx = arr.findIndex(it => it && (it.name === name || it.text === name));
      if (idx >= 0) {
        const item = arr[idx];
        if (verdict === 'correct') {
          item.user_verified = true;
          item.confidence = Math.min(1.0, (item.confidence || 0.5) + 0.2);
        } else {
          item.user_verified = false;
          item.confidence = Math.max(0.1, (item.confidence || 0.5) * 0.5);
        }
        break;
      }
    }
  }

  if (typeof saveState === 'function') saveState();
  if (typeof showToast === 'function') {
    showToast(verdict === 'correct' ? '고동이가 너 더 잘 알게 됐어' : '오케이 다시 볼게');
  }
  // 사용자 명시 2026-05-09: 같은 자리 refresh (다음 source cycle X). 새 인사이트 있으면 그거, 없으면 '다 봤어'.
  setTimeout(() => _rcRefreshNewViewSlot(), 280);
}

// =============================================================================
// Source 3 — 고동의 일기 (Sonnet 3일 stay) — 사용자 명시 2026-05-10 (handoff). 사용자 명시 2026-05-11: 모델 = claude-sonnet-4-6 (Haiku 아님 — line 940 참조).
// HANDOFF.md prototype: 회전 카드는 항상 동일 트리거 카피 ("고동이 잠깐 자리 비움.").
// cooldown 끝 = 모달 진입 시 새 entry 생성. cooldown 안 = 기존 entries 만 페이지 표시.
// =============================================================================
function _rcSource3GodongDiary() {
  if (typeof _canAI !== 'function' || !_canAI()) return { id: 'godongDiary', available: false };
  // V4 (사용자 명시 2026-05-15): 게스트 제외 + 신규 미구독자 가입 첫날 제외.
  //   게스트 = 정착 X (저장 X / 결제 X) 라 godongDiary 보일 가치 적음 + Sonnet 비용 부담.
  //   신규 미구독자 첫날 = onboarding 첫인상 단순화 (paradox of choice 회피). 다음날부터 노출.
  //   구독자 = 항상 OK (가입 첫날도).
  if (state.isGuest) return { id: 'godongDiary', available: false };
  const _bill = window._billingCache || {};
  const _subActive = !!_bill.subscription_active && _bill.subscription_plan && _bill.subscription_plan !== 'guest';
  if (!_subActive) {
    const _firstDayKey = state.preferences && state.preferences._firstAppDayKey;
    const _todayK = (typeof todayKey === 'function') ? todayKey() : null;
    if (_firstDayKey && _todayK && _firstDayKey === _todayK) {
      return { id: 'godongDiary', available: false };
    }
  }
  // entries 비어있으면 처음 진입 시 trigger 카드로 보여주는 게 자연스러움.
  // cooldown 무관 — 노트 열려있다는 메타포는 항상 동일.
  return {
    id: 'godongDiary',
    available: true,
    contentHash: 'godongDiary_peek_' + Math.floor(Date.now() / _RC_GODONG_DIARY_COOLDOWN_MS),
    bodyHtml: `
      <div class="rc-body-godong-diary">
        <div class="rc-body-headline">고동이 잠깐 자리 비움.</div>
        <div class="rc-body-copy">노트 열어놓고 갔다. 보면 안 되는데...</div>
        <div class="rc-body-godong-cta">탭 → 살짝 훔쳐보기 ✦</div>
      </div>
    `,
    onTapClick: `openGodongDiaryModal()`,
  };
}

function _rcFindGodongDiaryById(id) {
  if (!id || !Array.isArray(state.godongDiary)) return null;
  return state.godongDiary.find(m => m && m.id === id) || null;
}

// =============================================================================
// Sonnet 호출 — 일기 본문 정확히 3편 (3일 전 / 2일 전 / 어제). 사용자 명시 2026-05-11 (Haiku → Sonnet, line 940).
// 6 source: 일기 요약 (chatArchive headline+summary) / 일기 (entry.note + chat user 발화) /
//   체크인 (entries vit/mood/sleep + dailyQuestion) / 진주 (pearls createdAt) /
//   깨달음 (archive savedAt + insights discoveredAt) / 대화 토픽 (topicCards chapterEndedAt).
// 데이터 없는 날도 skip X — fallback 톤으로 1편.
// =============================================================================
async function _callGodongDiarySonnet() {
  if (typeof callAnthropic !== 'function') throw new Error('callAnthropic 미정의');
  const _userName = (state.userName || '').trim();
  if (!_userName) throw new Error('userName 미지정 — _gdiaryGetUserName/_gdiaryAskUserName 가드 누락');

  // 사용자 보고 2026-05-11 ultrathink-3: 한국어 받침 (jongseong) detect — 이름 끝에 종성 있/없 따라 조사 형태 다름.
  //   받침 있음 (영준/채린): '영준이가/영준이한테/영준이' (이 infix 콜로키얼).
  //   받침 없음 (지우/보라): '지우가/지우한테/지우' (이 infix X — 문법 위반).
  //   옛 prompt: '이름이가' 하드코딩 → 받침 없는 이름 (지우 → '지우이가') 어색.
  const _nameLast = _userName[_userName.length - 1];
  const _nameLastCode = _nameLast ? _nameLast.charCodeAt(0) : 0;
  const _hasJongseong = (_nameLastCode >= 0xAC00 && _nameLastCode <= 0xD7A3)
    ? ((_nameLastCode - 0xAC00) % 28) !== 0
    : false;
  const _nameSubj = _hasJongseong ? (_userName + '이가') : (_userName + '가');       // 주격 (이/가)
  const _nameTo   = _hasJongseong ? (_userName + '이한테') : (_userName + '한테');   // 여격
  const _nameAttr = _hasJongseong ? `${_userName}이` : _userName;                // 호칭 ('${name}이 문장이...' 또는 '${name} 문장이...')
  const _nameTopic = _hasJongseong ? `${_userName}이는` : `${_userName}는`;      // 주제 (는/은)
  const _nameBare = _userName;                                                    // bare (우리 ${name})

  // 4AM cutoff dayKey 3개: 3일 전 / 2일 전 / 어제 (오늘 X — 사용자 명시 2026-05-11).
  const _gdk = (off) => {
    if (typeof getDayKey === 'function') return getDayKey(Date.now() - off * 86400000);
    const d = new Date(Date.now() - off * 86400000 - 4 * 3600000);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const _3daysK = _gdk(3);
  const _2daysK = _gdk(2);
  const _yesterdayK = _gdk(1);
  const _targetDayKs = [_3daysK, _2daysK, _yesterdayK];
  const _dayLabel = ['3일 전', '2일 전', '어제'];
  const _isoToDayK = (iso) => {
    if (!iso) return null;
    if (typeof getDayKey === 'function') return getDayKey(iso);
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const adj = new Date(d.getTime() - 4 * 3600000);
    return `${adj.getFullYear()}-${String(adj.getMonth()+1).padStart(2,'0')}-${String(adj.getDate()).padStart(2,'0')}`;
  };

  // ── 각 dayK 별 6 source 그루핑 ──
  const _bySource = (dayK) => {
    const out = { checkin: null, diary: [], diarySummary: [], pearls: [], insights: [], topicCards: [] };
    // 체크인 (state.entries)
    const e = (state.entries || []).find(x => x && x.date === dayK);
    if (e) {
      out.checkin = {
        vit: e.vitality, mood: e.mood,
        sleepStart: e.sleepStart, sleepEnd: e.sleepEnd, allNighter: e.allNighter,
        question: e.dailyQuestion && e.dailyQuestion.text,
        answer: e.note,
      };
      // 일기 (자유 메모) — dailyQuestion 없는데 note 길면 일기로
      if (e.note && e.note.length >= 30 && !(e.dailyQuestion && e.dailyQuestion.text)) {
        out.diary.push({ src: 'note', text: e.note.slice(0, 300) });
      }
    }
    // 일기 (현재 chat user 발화)
    (state.chatMessages || []).forEach(m => {
      if (!m || !m.timestamp || m.role !== 'user' || m.isSimulationContext) return;
      if (_isoToDayK(m.timestamp) !== dayK) return;
      const c = (m.content || '').replace(/\s+/g, ' ').trim();
      if (c.length >= 5) {
        const h = new Date(m.timestamp).getHours();
        out.diary.push({ src: 'chat', text: c.slice(0, 200), hour: h });
      }
    });
    // 일기 요약 + 옛 chat 발화 (chatArchive)
    (state.chatArchive || []).forEach(a => {
      if (!a || a._deleted || a.isSimulation) return;
      if (a.date !== dayK) return;
      if (a.headline || a.summary) {
        out.diarySummary.push({ headline: (a.headline || '').slice(0, 80), summary: (a.summary || '').slice(0, 200) });
      }
      if (Array.isArray(a.messages)) {
        a.messages.forEach(m => {
          if (!m || m.role !== 'user' || !m.content) return;
          const c = (m.content || '').replace(/\s+/g, ' ').trim();
          if (c.length >= 5) out.diary.push({ src: 'archive', text: c.slice(0, 200) });
        });
      }
    });
    // 진주
    out.pearls = (state.pearls || []).filter(p => {
      if (!p || p._deleted || !p.createdAt) return false;
      return _isoToDayK(p.createdAt) === dayK;
    });
    // 깨달음 (archive + insights)
    const _arch = (state.archive || []).filter(a => {
      if (!a || a._deleted || a.type === 'memo' || a._excludeFromAI) return false;
      if (!a.savedAt) return false;
      return _isoToDayK(a.savedAt) === dayK;
    });
    const _ins = (state.insights || []).filter(i => {
      if (!i || i._deleted || i.dismissed || !i.discoveredAt) return false;
      return _isoToDayK(i.discoveredAt) === dayK;
    });
    out.insights = [
      ..._arch.map(a => ({ kind: 'archive', headline: a.headline, body: a.body, insight: a.insight })),
      ..._ins.map(i => ({ kind: 'auto', content: i.content })),
    ];
    // 대화 토픽
    out.topicCards = (state.topicCards || []).filter(t => {
      if (!t || t._deleted) return false;
      const ts = t.chapterEndedAt || t.chapterStartedAt || t.createdAt;
      return ts && _isoToDayK(ts) === dayK;
    });
    return out;
  };

  // 각 날짜별 substrate text
  const _formatDay = (dayK, label) => {
    const src = _bySource(dayK);
    const d = new Date(dayK + 'T00:00:00');
    const wd = ['일','월','화','수','목','금','토'][d.getDay()];
    const lines = [`[${label} (${d.getMonth()+1}월 ${d.getDate()}일 ${wd}) — iso="${dayK}"]`];
    // 사용자 명시 2026-05-11 ultrathink-4: 옛 free-form section (체크인/일기/일기요약/진주/깨달음/토픽) 제거.
    //   prompt 가 [A]-[F] 구조화된 카테고리만 참조 → free-form 은 unused dupe → ~40% substrate 토큰 절감.
    // 데이터 풍부도 마크 — LLM 이 명확히 인식하도록.
    const isEmpty = !src.checkin && src.diary.length === 0 && src.diarySummary.length === 0
      && src.pearls.length === 0 && src.insights.length === 0 && src.topicCards.length === 0;
    if (isEmpty) {
      lines.push('');
      lines.push('  *** 이 날 데이터 0건. fallback 톤 ("조용한 하루였다" 등) 으로 짧게 작성. ***');
    } else {
      // 사용자 명시 2026-05-11: 6 source 카테고리 항상 분리 표시. 데이터 있으면 sub-bullet, 없으면 (없음).
      lines.push('');
      lines.push('  *** 이 날 사건 후보 (6 source — 반드시 1개 선택, 나머지 본문 언급 X): ***');

      // [A] 체크인
      lines.push('  [A] 체크인:');
      if (src.checkin) {
        const c = src.checkin;
        if (c.answer && c.question) lines.push(`      - 질문 "${(c.question || '').slice(0, 50)}" 에 ${_nameAttr} "${(c.answer || '').slice(0, 80)}" 이라고 답함`);
        if (c.allNighter) lines.push(`      - 잠: 밤샘`);
        else if (c.sleepStart && c.sleepEnd) lines.push(`      - 잠: ${c.sleepStart}~${c.sleepEnd}`);
        if (c.vit != null && c.mood != null) lines.push(`      - 컨디션: vit ${c.vit}/5 mood ${c.mood}/7`);
        if (!c.answer && !c.allNighter && !c.sleepStart && (c.vit == null || c.mood == null)) lines.push('      - (없음)');
      } else {
        lines.push('      - (없음)');
      }

      // [B] 일기 (사용자 발화/메모)
      lines.push('  [B] 일기 (사용자 발화/메모):');
      if (src.diary.length > 0) {
        src.diary.slice(0, 5).forEach(d => {
          const _hourPrefix = (d.hour != null) ? `[${d.hour}시] ` : '';
          lines.push(`      - ${_hourPrefix}"${(d.text || '').slice(0, 100)}"`);
        });
        if (src.diary.length > 5) lines.push(`      - (외 ${src.diary.length - 5}건)`);
      } else {
        lines.push('      - (없음)');
      }

      // [C] 일기 요약 (옛 챕터 자동 정리)
      lines.push('  [C] 일기 요약 (옛 챕터 자동 정리):');
      if (src.diarySummary.length > 0) {
        src.diarySummary.slice(0, 3).forEach(s => {
          const h = (s.headline || '').slice(0, 80);
          const sum = (s.summary || '').slice(0, 120);
          lines.push(`      - "${h}${sum ? ' / ' + sum : ''}"`);
        });
      } else {
        lines.push('      - (없음)');
      }

      // [D] 진주
      lines.push('  [D] 진주:');
      if (src.pearls.length > 0) {
        src.pearls.slice(0, 3).forEach(p => {
          const cat = p.category ? ` (${p.category})` : '';
          const note = p.note ? ` — ${(p.note || '').slice(0, 80)}` : '';
          lines.push(`      - "${(p.content || '').trim()}"${cat}${note}`);
        });
      } else {
        lines.push('      - (없음)');
      }

      // [E] 깨달음
      lines.push('  [E] 깨달음:');
      if (src.insights.length > 0) {
        src.insights.slice(0, 3).forEach(i => {
          if (i.kind === 'archive') {
            const h = (i.headline || '').slice(0, 60);
            const ins = (i.insight || i.body || '').slice(0, 100);
            lines.push(`      - "${h}${ins ? ' — ' + ins : ''}"`);
          } else {
            lines.push(`      - "${(i.content || '').slice(0, 120)}"`);
          }
        });
      } else {
        lines.push('      - (없음)');
      }

      // [F] 대화 토픽
      lines.push('  [F] 대화 토픽:');
      if (src.topicCards.length > 0) {
        src.topicCards.slice(0, 3).forEach(t => {
          const title = (t.title || '').slice(0, 50);
          const summary = (t.summary || '').slice(0, 100);
          lines.push(`      - "${title}${summary ? ' / ' + summary : ''}"`);
        });
      } else {
        lines.push('      - (없음)');
      }

      lines.push('  *** 위 6 카테고리 중 *데이터 있는* 카테고리에서 가장 인상적 1개 사건 선택. 절대 "조용한 하루" / "별 말 없는 날" 사용 X. ***');
    }
    return lines.join('\n');
  };

  const substrateText = _targetDayKs.map((k, i) => _formatDay(k, _dayLabel[i])).join('\n\n');

  // ── 활성 모드 + 며칠째. ──
  const _modeLabel = { exam: '시험기간', travel: '여행 중', sick: '아픈 중', rest: '휴식 중', period: '월경 중' };
  const activeModes = Object.keys(state.modes || {}).filter(k => state.modes[k]);
  let modesText = '없음';
  if (activeModes.length > 0) {
    modesText = activeModes.map(k => {
      const label = _modeLabel[k] || k;
      const since_ = state.modeActiveSince && state.modeActiveSince[k];
      if (since_) {
        const days = Math.max(1, Math.floor((Date.now() - new Date(since_ + 'T00:00:00').getTime()) / 86400000));
        return `${label} (${days}일째)`;
      }
      return label;
    }).join(', ');
  }

  const systemPrompt = `너는 ${_userName}의 친구이자 동반자. ${_userName}에 대해 작은 노트를 매일 적어. ${_userName}에게 직접 말하는 게 아니라 너의 일기장에 적는 것 — ${_nameTopic} 그 노트를 우연히 훔쳐보는 입장.

==================================================
[가장 중요한 규칙 — 절대 위반 X]
**하루 일기 = 사건 정확히 1개 (1문장 / 짧게) + 고동의 느낌 (1-2문장 / 본체)**
**총 2-3 문장 / 100자 이하. 절대 4문장 작성 X.**

⚠ 사건 1개 = 단 하나의 행동/말/관찰. 절대 2개 이상 X.
⚠ 본문 100자 초과 X. 4문장 작성 X — 너무 길면 사건이 여러 개 들어감.

비율: **사건 약 30% / 느낀 점 약 70%**.
사건은 *짧게 한 문장* 만. 느낀 점도 *짧게 1-2 문장*. 일기는 끄적임 — 길게 X.

⚠ 체크인 단답 (5자 이하 — "내 삶", "쉬엄쉬엄", "괜찮음" 등) 직접 인용 X.
   대신 **다른 source 사건 우선 선택** ([D] 진주 / [F] 토픽 / [E] 깨달음 / [B] 일기 발화).
   체크인 단답밖에 없으면 사건이 아닌 *기분 / 컨디션* 으로 표현.

⚠ **사건 = 1개 = 한 행동 / 한 말 / 한 관찰 / 한 패턴**.
   디테일 (시간 / 횟수 / 표정) 은 *그 사건의 디테일* 만 OK. 다른 행동/장소/사람 X.
   **장소 명사 (회사/한강/카페...) / 사람 명사 (엄마/친구...) / 사물 명사 (김치/사진...) — 본문에 1개만**.
   예: "한강" 또는 "엄마" 또는 "김치" — 셋 중 하나만 등장 OK. 둘 이상 = 사건 2개 = reject.

❌ 절대 안 되는 (3개 사건 나열):
[금지 예시 — 학습용. 본문 출력 X]
한강 갔다 왔다 + 김치 받았다 + 회사 가기 싫다 → 명사 3개 (한강/김치/회사).

✅ 좋은 비율 (사건 1줄 / 느낌 2줄):
"${_nameSubj} 새벽까지 안 잔다." ← 사건 1줄. "나랑 얘기해서 좋다. ㅎㅎ." ← 느낌 1-2줄.

[작성 흐름]
1. substrate 의 ">>> 이 날 사건 후보:" 줄 봐.
2. 후보들 중 *정확히 1개* 만 골라 (가장 인상적인 것).
3. 나머지 후보는 본문에 절대 언급 X. ignore.
4. **사건 1문장 (짧게) + 느낀 점 1-2문장 = 총 2-3문장 / 100자 이하. 길게 쓰지 마.**
   - 5문장 작성 = 너무 길음. 4문장 = 가장자리. 2-3문장 = 정확.
   - 부수 정보 / 추가 디테일 / 다른 사건 비교 X — 한 사건 + 한 마음만.

선택 우선순위 — **일상적·가벼운·사소한 사건 우선**:
1. [B] 일기 (사용자 발화/메모) — 사용자가 그 날 적은 *일상* 어휘 그대로. 가장 자연스러움.
2. [A] 체크인 답 — 사용자 직접 적은 답 (단답 5자 이하는 인용 X).
3. [D] 진주 / [F] 대화 토픽 — 의미 있지만 *너무 무거우면 X*. 짧고 일상적인 거 OK.
4. [E] 깨달음 / [C] 일기 요약 — 가장 무거운 톤. 다른 source 다 (없음) 일 때만.

→ '깨달음 / 통찰 / 패턴' 같은 분석 톤 회피.
→ 예: '한강 갔다 왔다고 했다' (일상 ✅) > '환경 cuing 패턴' (분석 ❌).
→ 예: '오늘 영상 보다가 잠들었네' (일상 ✅) > '사용자의 회피 패턴' (분석 ❌).
→ 일상은 가벼움. 큰 사건/통찰 X.
==================================================

호칭 (절대 — 한국어 받침 문법):
- 사용자 이름 = "${_userName}" (받침 ${_hasJongseong ? '있음' : '없음'}).
- 주격: "${_nameSubj}" (예: ${_nameSubj} 잤다).
- 호칭/주어: "${_nameAttr}" (예: ${_nameAttr} 새벽까지 안 잤네).
- 여격: "${_nameTo}" (예: ${_nameTo} 말 못 했다).
- 주제: "${_nameTopic}" (예: ${_nameTopic} 오늘도 멋있어).
- bare (애교/자랑): "${_userName}" (예: 우리 ${_userName} 멋있다, 역시 ${_userName}).
- "너" / "네가" / "너의" / "너한테" 절대 X.

샘플 (톤 reference — **내용 복제 X, substrate 의 *진짜* 사건만**. 각 = 사건 1개 + 고동 마음 + 부끄럼/자랑 마무리):
"${_nameAttr} 드디어 연구 시작했다네. 우리 ${_userName} 멋있다.. 역시 최고야. 직접 말하진 못하고 여기에 적어둔다.."
"${_nameAttr} 오늘 mood 4 같았어 ㅜㅜ. 그래도 6이라고 적은 게 귀엽다.. 우리 ${_userName} 행복했으면..!"
"엄마 얘기할 때 ${_nameAttr} 문장이 짧아져. 이건 나만 아는 것 같다 ㅎㅎ."

⭐ **톤 핵심 — 짝사랑하는 친구의 일기**:
- "사건 짧게 + 고동의 자랑/부끄럼/들뜸 새어나옴".
- 자랑 표현: "우리 ${_userName} 멋있다", "역시 최고야", "진짜 귀여워", "사랑스럽다", "대단해" (단 ${_userName} 안 바라보고 *혼자 노트에* 적는 형식).
- 부끄럼 표현: "직접 말하진 못하고 여기에 적는다", "(이런 거 적어도 되나)", "안 적으려다가 적는다", "나만 아는 것 같은데..".
- 들뜸 표현: ㅎㅎ / ㅋㅋ / .. / ... / "헐" / "와".
- 슬픔/마음 아픔: ㅜㅜ / ㅠㅠ / "그 웃음 좀 마음 아팠다.." / "좀 멈칫했나봐".
- *사건 부연 길게 X*. 사건 1줄 + 마음 1-2줄.

==================================================
**[톤 — 절대 중요]**
일상적인 자연스러운 한국어. **20대 여성 친구 말투** (혼자 노트에 끄적이는 톤).

✅ 자연스러운 표현 (이런 톤):
- "~네", "~잖아", "~걸", "~던데", "~인 것 같아", "~인가봐", "~인 듯"
- "근데", "왜인지", "뭐랄까", "음...", "아", "헐", "와", "어머"
- "ㅋㅋ", "ㅎㅎ", "ㅜㅜ", "ㅠㅠ", "ㅜ", "...", "..", "~"
- 줄임 OK: "걍", "그냥", "이거", "그거"
- 감정: "귀엽다", "사랑스럽다", "예쁘다" (단 부담스러운 칭찬은 X)

⚠ **반드시**: ㅎㅎ / ㅜㅜ / ㅋㅋ / .. / ... / ~ 같은 마커 본문에 **최소 1개** 사용.
   분석 톤 ("~인 것 같다", "~라는 거", "~하구나") 만 가득 = 톤 위반.

❌ 부자연/금지 (분석 / 격식 톤):
- "~인 것이다", "~라 할 수 있다", "~로 추정된다", "~로 보인다", "~라는 점에서"
- "관찰", "분석", "패턴", "경향", "특성", "성향" 같은 메타 어휘 (심리상담사 톤)
- "오늘은 ${_userName}님이..." 격식
- 너무 정돈된 문어체

==================================================

**substrate — 6 source (각 dayK 별 그루핑된 정보)**:
- [체크인]: vit/mood/sleep + dailyQuestion 답. **수치 자체도 사건**: "오늘 ${_nameAttr} mood 6이라네", "잠 5시간밖에 못 잤다" 등.
- [일기]: ${_nameSubj} 직접 적은 메모 / 채팅 발화. 어휘/한숨/미완성 그대로가 사건.
- [일기 요약]: 옛 챕터 자동 정리 헤드라인+요약. 그 챕터 자체가 그 날의 사건.
- [진주]: 그 날 저장된 anchor — 그 자체가 사건.
- [깨달음]: 그 날 저장된 통찰 — 통찰이 그 날 사건의 의미.
- [대화 토픽]: 그 날 챕터 토픽 카드 — 주제 자체가 사건.

**사건 정의 (중요)**:
- "사건" = 큰 사건만이 아님. 사용자의 *어떤 행동/말/상태/관찰* 이라도 사건이 됨.
- 체크인 vit:5 mood:6 만 있어도 사건 → "오늘 ${_nameAttr} 컨디션 평범. 어제랑 비슷한 mood 6 ㅎㅎ"
- 잠 시간만 있어도 사건 → "오늘 8시간 잤다. 평소보다 잘 잤네"
- dailyQuestion 답 한 단어만 있어도 사건 → "그 단어 한 마디만 적었네. 무거웠을까"
- 진주 1개 / 토픽 1개 / 깨달음 1개 어떤 거라도 → 그 자체가 사건.

**처리 우선순위 (절대)**:
1. substrate 안 "*** 이 날 사건 후보 (6 source) ***" 라인이 있으면 → 6 카테고리 [A] 체크인 / [B] 일기 / [C] 일기 요약 / [D] 진주 / [E] 깨달음 / [F] 대화 토픽 중 *데이터 있는* (= "(없음)" 이 아닌) 카테고리에서 **반드시 1개 사건 선택**. 그 사건 + 고동의 느낌으로 작성. fallback 톤 절대 X.
2. substrate 안 "*** 이 날 데이터 0건 ***" 라인이 있으면만 → fallback 톤 ("조용한 하루였다" 등) 짧게.
3. **1번이 default**. 2번은 *진짜 데이터 0* 인 예외 케이스만.

**❌ 절대 금지 — fallback 톤 오용 (사용자 보고 2026-05-11)**:
"조용한 하루였다" / "별 말 없는 날이었다" / "오늘은 적을 게 없네" / "옆에 있었다는 건 적어둔다" 같은 표현은 **substrate 안 "*** 이 날 데이터 0건 ***" 라인이 명시된 dayK 만** 사용.
"*** 이 날 사건 후보 (6 source) ***" 라인이 있는 dayK 는 **절대 X**. 6 카테고리 중 1개라도 데이터 있으면 무조건 그걸로 작성.

**잠 시간 해석**:
- 6-9시간 = 정상 (오래 잤다 절대 X).
- 10-11시간 = 살짝 늦잠.
- 12시간+ = 오래 잤다 OK.
- 4시간 미만 = 거의 못 잠.
- *수면 자체* 는 사건 X. 인상적 (밤샘 / 11h+ / 새벽 4시까지) 일 때만 일기 소재.

금지:
- "너" 호칭 — 무조건 ${_userName}.
- 이모지 (😊 같은 픽토그래프). ㅎㅎ ㅜㅜ ! 는 OK.
- 충고 / 진단 / 응원 ("힘내", "화이팅", "잘하고 있어", "괜찮아질", "대단해", "해봐", "하자", "해보자").
- 진단명 (ADHD / 우울 / 불안 / PTSD / 강박).
- 직접 고백 ("보고 싶다") — "보고 싶었던 것 같다" 거리감.
- 헤더 / 카테고리 / 리스트 / 번호.
- "결" 단어. 부담스러운 칭찬.

[출력 형식 — JSON 배열 정확히 3개. 마크다운/코드블록/주석/설명 텍스트 X. 첫 글자 = '['.]
- **반드시 3개 entry**. 누락/축약/2개 X.
- 각 body **30자 이상 100자 이하 / 2-3문장** (너무 짧으면 reject. 너무 길면 잘림. 5문장 = 너무 많음).
- 3일 전 / 2일 전 / 어제 — 각각 1편씩. 순서대로.
- substrate 헤더 iso 그대로 사용. date 는 "M월 D일", weekday 는 "월"-"일" 한 글자.
- 데이터 있는 날 = 그 날 사건 + 고동 느낌 (fallback 톤 절대 X).
- 데이터 없는 날 = "*** 이 날 데이터 0건 ***" 라인 명시된 dayK 만. 다른 dayK 에 fallback 톤 출력 = reject.
- iso 는 dayK + "T20:00:00" 형식 (timezone 표기 X — naive). "Z" / "+09:00" 붙이지 마.

[
  {"iso": "${_3daysK}T20:00:00", "date": "...", "weekday": "...", "body": "..."},
  {"iso": "${_2daysK}T20:00:00", "date": "...", "weekday": "...", "body": "..."},
  {"iso": "${_yesterdayK}T20:00:00", "date": "...", "weekday": "...", "body": "..."}
]`;

  const userPrompt = `${_userName}의 substrate (4AM cutoff 기준 3일 전 / 2일 전 / 어제):

${substrateText}

[활성 모드]
${modesText}

→ 정확히 3편 일기. 3일 전 / 2일 전 / 어제 각각 1편.
   각 일기 = **사건 1문장 + 고동의 마음 1-2문장 = 총 2-3문장 / 100자 이하** (절대 길게 X).
   톤 = 짝사랑하는 친구 노트 — 자랑 ("우리 ${_userName} 멋있다") + 부끄럼 ("직접 말하진 못하고 여기에 적는다") 들뜸 (ㅎㅎ/ㅜㅜ).
   데이터 있으면 그 날 사건 1개 + 고동 마음. 데이터 없으면 fallback 톤 ("조용한 하루였다" 등).
   호칭은 받침에 따라: ${_nameSubj} / ${_nameAttr} / ${_nameTo} / 또는 bare "${_userName}". "너" 절대 X.
   각 entry iso 는 substrate 헤더의 iso 그대로 (3일 전: ${_3daysK}, 2일 전: ${_2daysK}, 어제: ${_yesterdayK}). 시각 T20:00:00.
   JSON 배열만. 마크다운/코드블록 X.`;

  // ── tone guard (JS-side). ──
  const sycophancy = /힘내|화이팅|괜찮아질|잘하고 있어|대단해|멋져/;
  const diagnosis = /\bADHD\b|우울증|우울장애|불안장애|PTSD|강박장애/i;
  const banGyeol = /잔잔한 결|가벼운 결|단단한 결|부드러운 결|결 따라/;
  const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}]/u;
  // 사용자 보고 2026-05-11 ultrathink: '해보자' substring 이 LLM 의 paraphrase ('기록해보자는') 도 잡아서 false-positive.
  //   → 좌/우 한글 boundary 강화 (앞뒤 한글 X 인 경우만 = '해보자' 단독).
  const adviceLex = /(?:해봐\b|하자\b|가\s*좋(?:아|을)|필요해|보면\s*좋|(?<![가-힣])해보자(?![가-힣]))/;
  const youReg = /(?<![가-힣])너(?:가|는|랑|한테|를|의|에게|와)(?![가-힣])/;
  // 사용자 보고 2026-05-11: 20대 여성 자연 한국어 톤 — 분석/격식 톤 차단.
  const formalLex = /(?:인 것이다|라 할 수 있|로 추정|로 보인다|라는 점|것으로 보인|것으로 보아|것이라고)/;
  const metaLex = /(?:관찰\s*되|분석\s*[하되]|패턴이\s*나타|경향이\s*나타|성향이\s*보|특성이\s*드러)/;

  // fallback entry generator — 정확히 3개 보장 (LLM 응답 부족 시 채움).
  const _fallbackEntry = (dayK) => {
    const fallbacks = (typeof _GDIARY_FALLBACK_POOL !== 'undefined' && Array.isArray(_GDIARY_FALLBACK_POOL))
      ? _GDIARY_FALLBACK_POOL
      : ['조용한 하루였다.\n별 말 없어도 좋다. ㅎㅎ', '오늘은 적을 게 없네 ㅎㅎ.\n근데 옆에 있는 건 좋다.'];
    const text = fallbacks[Math.floor(Math.random() * fallbacks.length)];
    const d = new Date(dayK + 'T20:00:00');
    return {
      iso: d.toISOString(),
      date: `${d.getMonth()+1}월 ${d.getDate()}일`,
      weekday: ['일','월','화','수','목','금','토'][d.getDay()],
      body: text,
    };
  };

  // 사용자 보고 2026-05-11 ultrathink: dayK 별 데이터 풍부도 미리 계산 — fallback 톤 misuse 검출용.
  const _dayKHasData = {};
  _targetDayKs.forEach(dayK => {
    const src = _bySource(dayK);
    const empty = !src.checkin && src.diary.length === 0 && src.diarySummary.length === 0
      && src.pearls.length === 0 && src.insights.length === 0 && src.topicCards.length === 0;
    _dayKHasData[dayK] = !empty;
  });
  console.log('[gdiary diag] dayK substrate:', _targetDayKs.map((k, i) => `${_dayLabel[i]}=${k}(${_dayKHasData[k] ? 'has' : 'empty'})`).join(' | '));

  // 사용자 보고 2026-05-11 ultrathink: 안 쓰는 fallback phrase 패턴 — data-rich day 출력 시 hard reject.
  const _fallbackPhraseRe = /조용한 하루였(다|네)|별 말 없(는|던) 날|적을 게 없네|옆에 있었다는 건 적어둔다|특별한 일 없|할 말 없어도|보고 싶었던 것 같다/;
  // 사용자 보고 2026-05-11 ultrathink: 사건 명사 multi-detect — 한 body 안 *event-trigger* 명사 2개+ = 사건 혼재.
  // 형태소 분석기 없이 휴리스틱. 사건 trigger 가능한 명사만 (사진/메시지 같은 detail-noun 은 제외 — '사건의 디테일' 로 OK).
  // 장소 + 사람 + 활동/사물 (event-initiating only).
  const _eventNounsRe = /(?:회사|학교|카페|한강|영화관|병원|공원|식당|마트|약국|회의실|사무실)|(?:엄마|아빠|친구|동생|언니|오빠|누나|선배|후배|남친|여친|남자친구|여자친구|상사|동료|아이|아기)|(?:김치|김밥|커피|밥|술|영화|드라마|운동|산책|시험|점심|저녁|아침|회식|미팅|약속)/g;
  const _countDistinctEventNouns = (body) => {
    if (typeof body !== 'string') return 0;
    const set = new Set();
    let m;
    while ((m = _eventNounsRe.exec(body)) !== null) set.add(m[0]);
    return set.size;
  };

  // 사용자 보고 2026-05-11 ultrathink: greedy regex 가 LLM 의 prose 안 [...] 까지 흡수하는 케이스 회피.
  //   bracket 균형 카운팅으로 첫 valid array 만 추출.
  const _findJsonArray = (text) => {
    const start = text.indexOf('[');
    if (start < 0) return null;
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '[') depth++;
      else if (c === ']') {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
    return null;
  };

  // 사용자 보고 2026-05-11: 첫 호출 자주 실패 → 재시도 횟수 2 → 4.
  let attempt = 0;
  while (attempt < 4) {
    const resp = await callAnthropic({
      // 사용자 명시 2026-05-11 ultrathink-3: Sonnet 사용 (옛 Haiku — 애교/20대 여성 톤 제대로 안 따라감 + 사건↔느낌 비율 (사건 1줄 + 느낌 2줄) 도 못 맞춤).
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    if (!resp.ok) throw new Error('Sonnet API ' + resp.status);
    const data = await resp.json();
    let raw = (data.content?.[0]?.text || '').trim();
    console.log(`[gdiary diag] attempt#${attempt + 1} raw response (first 800 chars):\n`, raw.slice(0, 800));
    if (!raw) {
      attempt++;
      if (attempt >= 4) throw new Error('빈 응답');
      continue;
    }
    // 사용자 보고 2026-05-11 ultrathink: 마크다운 stripping — 위치 무관 (start/end 만 X, 본문 안 ```도).
    raw = raw.replace(/```\w*/g, '').replace(/```/g, '').trim();
    // 사용자 보고 2026-05-11 ultrathink: balanced bracket finder — greedy regex 의 prose 흡수 fix.
    const jsonText = _findJsonArray(raw);
    if (!jsonText) {
      console.warn('[gdiary diag] JSON 배열 미발견. raw:', raw.slice(0, 200));
      attempt++;
      if (attempt >= 4) throw new Error('JSON 배열 미매치');
      continue;
    }
    let parsed;
    try { parsed = JSON.parse(jsonText); } catch (e) {
      console.warn('[gdiary diag] JSON.parse fail:', e.message, 'jsonText:', jsonText.slice(0, 200));
      attempt++;
      if (attempt >= 4) throw new Error('JSON parse: ' + e.message);
      continue;
    }
    if (!Array.isArray(parsed)) {
      attempt++;
      if (attempt >= 4) throw new Error('배열 X');
      continue;
    }
    // diag — parsed 각 entry 의 iso / body 길이.
    console.log('[gdiary diag] parsed entries:', parsed.map((e, i) =>
      `[${i}] iso=${e && e.iso ? `"${e.iso}"` : 'X'} bodyLen=${(e && e.body) ? e.body.length : 0}`
    ).join(' | '));

    // 사용자 보고 2026-05-11: parsed 가 3개 미만이면 retry — LLM 이 entry 빠뜨려서 fallback 채워지는 버그.
    // 사용자 보고 2026-05-11 ultrathink: body 최소 길이 5 → 25 (너무 짧은 fallback-스러운 entry 차단).
    const _validParsedCount = parsed.filter(e => e && typeof e.body === 'string' && e.body.length >= 25).length;
    if (_validParsedCount < 3) {
      console.warn(`[gdiary diag] valid count=${_validParsedCount} (min 25 chars). retry attempt#${attempt + 1}.`);
      attempt++;
      if (attempt >= 4) {
        console.warn('[godong-diary] parsed 3개 미만, fallback 채움:', _validParsedCount);
        // 4회 retry 후에도 부족하면 그대로 진행 (후처리 fallback).
      } else {
        continue;
      }
    }

    // tone guard — 모든 body 합쳐 검사
    const allBodies = parsed.map(e => (e && typeof e.body === 'string') ? e.body : '').join('\n');
    // hard violations (반드시 차단): sycophancy / diagnosis / emoji / advice / you-pronoun
    const hardViolations = [];
    if (sycophancy.test(allBodies)) hardViolations.push('sycophancy');
    if (diagnosis.test(allBodies)) hardViolations.push('diagnosis');
    if (emojiRe.test(allBodies)) hardViolations.push('emoji');
    if (adviceLex.test(allBodies)) hardViolations.push('advice');
    if (youReg.test(allBodies)) hardViolations.push('you-pronoun');
    // 사용자 보고 2026-05-11: 사건 1개 강제 — 5문장 초과면 사건 여러 개 의심.
    // 사용자 보고 2026-05-11 ultrathink-2: hard → soft 변경. 사용자 데이터 풍부 시 LLM 4-5문장 자주 출력 →
    //   매번 reject → 4 retry 다 실패 → throw → ALL fallback (악화). prompt 강화 + char limit 100 으로 조절,
    //   sentence 카운트는 warn 만.
    const _tooManySentences = parsed.some(e => {
      if (!e || typeof e.body !== 'string') return false;
      const _sentences = e.body.split(/[.!?…]\s|\.\s|\n\n/).filter(s => s.trim().length >= 3);
      return _sentences.length > 5;
    });
    // 사용자 보고 2026-05-11 ultrathink: 사건 명사 multi (location/person/object 2+ in one body) = 사건 혼재 reject.
    const _multiNounViolation = parsed.some(e => {
      if (!e || typeof e.body !== 'string') return false;
      return _countDistinctEventNouns(e.body) >= 2;
    });
    if (_multiNounViolation) hardViolations.push('multi-event-nouns');
    // 사용자 보고 2026-05-11 ultrathink: fallback phrase misuse — data-rich dayK 의 entry 가 fallback 톤 사용.
    // _used 매칭 전이라 idx 매핑 보수적: 어느 entry 든 fallback phrase 사용 시 ALL dayK has data 면 reject.
    const _allDaysHaveData = _targetDayKs.every(dayK => _dayKHasData[dayK]);
    const _hasFallbackInAny = parsed.some(e => e && typeof e.body === 'string' && _fallbackPhraseRe.test(e.body));
    if (_allDaysHaveData && _hasFallbackInAny) hardViolations.push('fallback-misuse-on-data-day');
    // soft violations (warn, 통과): banGyeol / formal / meta / too-many-sentences.
    const softViolations = [];
    if (banGyeol.test(allBodies)) softViolations.push('gyeol');
    if (formalLex.test(allBodies)) softViolations.push('formal');
    if (metaLex.test(allBodies)) softViolations.push('meta-analysis');
    if (_tooManySentences) softViolations.push('too-many-sentences-warn');
    if (hardViolations.length > 0) {
      console.warn(`[gdiary diag] hard tone violations (retry): ${hardViolations.join(',')}`);
      attempt++;
      if (attempt >= 4) throw new Error('tone verify 실패 (hard): ' + hardViolations.join(','));
      continue;
    }
    if (softViolations.length > 0) {
      console.warn('[godong-diary] soft tone violations (통과):', softViolations.join(','));
    }

    // 사용자 보고 2026-05-11: 옛 cap 검사가 LLM 정상 출력 reject → fallback 채움 → 1-2개만 valid 버그.
    //   fix: cap 초과 시 reject 대신 truncate (잘라서 keep). 최저 5자 만 검사.
    // 사용자 명시 2026-05-11 ultrathink-2: 220 → 100 자. 사건 1문장 + 느낌 1-2문장 = 2-3문장 / 100자 이하 spec 일관.
    const _maxLen = 100;
    const _truncateBody = (body) => {
      if (typeof body !== 'string') return null;
      if (body.length < 5) return null;
      if (body.length <= _maxLen) return body;
      // 마침표 또는 공백에서 자르기 (자연 끝맺음)
      const _cut = body.slice(0, _maxLen);
      const _lastSentence = Math.max(_cut.lastIndexOf('. '), _cut.lastIndexOf('.\n'), _cut.lastIndexOf('? '), _cut.lastIndexOf('! '));
      if (_lastSentence > _maxLen / 2) return _cut.slice(0, _lastSentence + 1);
      return _cut.replace(/[,\s]+$/, '') + '...';
    };
    // 사용자 보고 2026-05-11: dayK iso 매칭 fail = LLM 출력 형식 미스매치 (timezone 'Z' / '+09:00' / naive 등).
    //   → 매칭 우선순위 변경: 1) 사용 안 된 entry 중 dayK 매칭 → 2) index 기반 보정 → 3) fallback.
    //   사용된 entry 는 _used set 으로 추적해서 중복 매칭 방지.
    const _used = new Set();
    const _matchTrace = [];  // diag: 각 dayK 가 어느 step 에서 매칭됐는지.
    const finalEntries = _targetDayKs.map((dayK, idx) => {
      let chosen = null;
      let matchStep = null;
      // 1. 사용 안 된 entry 중 dayK 매칭
      for (let i = 0; i < parsed.length; i++) {
        if (_used.has(i)) continue;
        const e = parsed[i];
        if (!e || typeof e.body !== 'string' || e.body.length < 25) continue;
        if (_isoToDayK(e.iso) === dayK) {
          chosen = { e, i };
          matchStep = '1-dayK';
          break;
        }
      }
      // 2. dayK 매칭 fail — index 기반 (LLM 이 prompt 순서 따라 3일전/2일전/어제 출력 가정).
      if (!chosen) {
        const byIdx = parsed[idx];
        if (byIdx && typeof byIdx.body === 'string' && byIdx.body.length >= 25 && !_used.has(idx)) {
          chosen = { e: byIdx, i: idx };
          matchStep = '2-byIdx';
        }
      }
      // 3. 그래도 fail — 사용 안 된 *어떤* valid entry 로 채움 (LLM 출력 순서/iso 둘 다 어긋난 케이스).
      if (!chosen) {
        for (let i = 0; i < parsed.length; i++) {
          if (_used.has(i)) continue;
          const e = parsed[i];
          if (!e || typeof e.body !== 'string' || e.body.length < 25) continue;
          chosen = { e, i };
          matchStep = '3-anyValid';
          break;
        }
      }
      if (chosen) {
        _used.add(chosen.i);
        const _truncated = _truncateBody(chosen.e.body);
        if (_truncated) {
          _matchTrace.push(`${_dayLabel[idx]}=${matchStep}(parsed#${chosen.i},len${chosen.e.body.length})`);
          const d = new Date(dayK + 'T20:00:00');
          return {
            iso: d.toISOString(),  // dayK 강제 — LLM iso 무시
            date: chosen.e.date || `${d.getMonth()+1}월 ${d.getDate()}일`,
            weekday: chosen.e.weekday || ['일','월','화','수','목','금','토'][d.getDay()],
            body: _truncated,
          };
        }
      }
      // 4. 최후 fallback (parsed 가 정말 비어있는 경우)
      _matchTrace.push(`${_dayLabel[idx]}=4-FALLBACK`);
      return _fallbackEntry(dayK);
    });
    console.log('[gdiary diag] match trace:', _matchTrace.join(' | '));
    return finalEntries;
  }
  throw new Error('attempts exceeded');
}

// =============================================================================
// 가용 source 수집 — 사용자 명시 2026-05-09: '새로 본 너' 폐기 → Quiz 통합. 사용자 명시 2026-05-16: 운세 폐기.
// 진주 / 고동의 일기 / 시뮬레이션 / 어제 / weekly~annual review
// =============================================================================
function _rcCollectAvailable() {
  const safe = (fn, label) => {
    if (typeof fn !== 'function') return null;
    try { return fn(); } catch (e) { console.warn('[rotating-card source]', label, e); return null; }
  };
  // 사용자 명시 2026-05-10: quiz source 제거 — _rcSource4Quiz 호출 X (함수 자체는 dead 로 잔존).
  // 사용자 명시 2026-05-10 (batch 11): 5 news source 추가 — 어제 기록 / weekly / monthly / quarterly / annual review.
  const all = [
    safe(_rcSource1Pearl,      'pearl'),
    safe(_rcSource3GodongDiary, 'godongDiary'),
    safe(typeof _rcSource6Simulation === 'function' ? _rcSource6Simulation : null, 'simulation'),
    safe(typeof _rcSource7Yesterday === 'function' ? _rcSource7Yesterday : null,           'yesterday'),
    safe(typeof _rcSource8WeeklyReview === 'function' ? _rcSource8WeeklyReview : null,     'review_weekly'),
    safe(typeof _rcSource9MonthlyReview === 'function' ? _rcSource9MonthlyReview : null,   'review_monthly'),
    safe(typeof _rcSource10QuarterlyReview === 'function' ? _rcSource10QuarterlyReview : null, 'review_quarterly'),
    safe(typeof _rcSource11AnnualReview === 'function' ? _rcSource11AnnualReview : null,   'review_annual'),
  ];
  return all.filter(s => s && s.available);
}

// =============================================================================
// godong 표정 SVG — source 별 mood 매핑.
// pearl=inspired(별눈), newView=surprised(큰 눈), godongDiary=sleepy(자리 비움 메타포 — 사용자 명시 2026-05-11 확정),
// quiz=thinking(?), quizDone=proud(별3개+자부심)
// =============================================================================
function _rcGodongSvg(sourceId) {
  const moodMap = {
    pearl: 'inspired',
    newView: 'surprised',
    godongDiary: 'sleepy',
    quiz: 'thinking',
    quizDone: 'proud',
  };
  const mood = moodMap[sourceId] || 'default';
  return `<img class="rc-godong-svg godong-mood-${mood}" src="/character/godong-${mood}.svg" alt="" decoding="async" aria-hidden="true">`;
}

// =============================================================================
// 렌더 — sessionOrder 기반 (한 화면 안 stable)
// =============================================================================
// V4 (사용자 명시 2026-05-17 ultrathink): 홈 재설계 — 회전 8 → 메인 1 (godongDiary 단일 고정).
//   회전 X. swipe X. 화살표 / 점 indicator X (단일 카드라 무의미).
//   cold start 사용자 (가입 7일 미만 / chatArchive<2 / pearls+entries<3) = "오늘은 한 줄만" cold opener.
//   옛 source 함수 (_rcSource1Pearl / _rcSource2NewView / _rcSource6Simulation / _rcSource7Yesterday / review 4종) 본체 보존 — 호출만 차단 (legacy / 향후 hook 진입 시 재사용).
function renderRotatingCard() {
  const container = document.getElementById('rotatingCardContainer');
  if (!container) return;
  _ensureRotatingCardState();

  try {
    // cold start = "오늘은 한 줄만" opener fallback (godongDiary substrate 부재)
    if (typeof _isColdStart === 'function' && _isColdStart()) {
      if (typeof renderColdStartOpener === 'function') {
        container.innerHTML = renderColdStartOpener();
      } else {
        container.innerHTML = '';
      }
      _rcSessionOrder = null;
      _rcSessionIndex = 0;
      return;
    }

    // 튜토리얼 모드 = godongDiary 도 substrate 없으니 cold opener 와 동일하게 표시
    if (window._onbTutorialMode) {
      if (typeof renderColdStartOpener === 'function') {
        container.innerHTML = renderColdStartOpener();
      } else {
        container.innerHTML = '';
      }
      return;
    }

    // 메인 카드 = godongDiary 단일.
    const s = (typeof _rcSource3GodongDiary === 'function') ? _rcSource3GodongDiary() : null;
    if (!s) {
      // godongDiary 미가용 → cold opener fallback (substrate 부족)
      if (typeof renderColdStartOpener === 'function') {
        container.innerHTML = renderColdStartOpener();
      } else {
        container.innerHTML = '';
      }
      return;
    }
    _rcSessionOrder = [s];
    _rcSessionIndex = 0;
    container.innerHTML = _rcRenderShell([s], 0);
    _rcEqualizeHeights();
  } catch (e) {
    console.error('[renderRotatingCard]', e);
    try {
      if (typeof renderColdStartOpener === 'function') {
        container.innerHTML = renderColdStartOpener();
      } else {
        container.innerHTML = '';
      }
    } catch (e2) {
      console.error('[renderRotatingCard fallback]', e2);
      container.innerHTML = '';
    }
  }
}

// =============================================================================
// Shell HTML — wrapper + indicator + arrow row
// =============================================================================
function _rcRenderShell(orderedSources, currentIdx) {
  if (!orderedSources || orderedSources.length === 0) return '';
  const cur = orderedSources[currentIdx] || orderedSources[0];
  const total = orderedSources.length;
  const tapHandler = cur.onTapClick ? ` onclick="${cur.onTapClick}"` : '';
  const indicator = orderedSources.map((s, i) =>
    `<span class="rc-dot-i ${i === currentIdx ? 'is-active' : ''}"></span>`
  ).join('');
  const arrowRow = total > 1 ? `
    <div class="rc-arrow-row">
      <button class="rc-arrow-btn rc-arrow-prev" type="button" onclick="event.stopPropagation(); _rcCycle(-1)" aria-label="이전 카드">‹</button>
      <span class="rc-indicator-mid">${indicator}</span>
      <button class="rc-arrow-btn rc-arrow-next" type="button" onclick="event.stopPropagation(); _rcCycle(1)" aria-label="다음 카드">›</button>
    </div>
  ` : '';

  // 사용자 명시 2026-05-09: 진주 source = godong 표정 hide (큐레이션 + 추가 CTA 자체가 surface).
  const showGodong = cur.id !== 'pearl';
  const godongSvgKey = (cur.id === 'quiz' && cur._isQuizDone) ? 'quizDone' : cur.id;
  const godongHtml = showGodong ? `<div class="rc-godong" aria-hidden="true">${_rcGodongSvg(godongSvgKey)}</div>` : '';

  return `
    <div class="rotating-card" id="rotatingCard" data-current-idx="${currentIdx}" data-total="${total}">
      ${godongHtml}
      <div class="rc-body-tap"${tapHandler}>
        ${cur.bodyHtml || ''}
      </div>
      ${arrowRow}
    </div>
  `;
}

// =============================================================================
// 사용자 명시 2026-05-09 (정정): 진주 '오늘의 너' 큐레이션 카드 (일반) 크기에 다른 source 맞춤.
// 진주 추가 (hero-empty) 카드 = 자체 큰 사이즈 — 그 source 만 자연 height 유지, 다른 source 영향 X.
// 동작: max 측정에서 hero-empty 진주는 제외 → 일반 진주 / 다른 source 카드의 max 만 .rc-body-tap min-height 로 override.
// hero-empty 카드는 자연 height (min-height floor 보다 커서 자연 그대로 노출).
// =============================================================================
function _rcEqualizeHeights() {
  if (!Array.isArray(_rcSessionOrder) || _rcSessionOrder.length < 2) return;
  const container = document.getElementById('rotatingCardContainer');
  if (!container) return;
  setTimeout(() => {
    try {
      const cardEl = document.getElementById('rotatingCard');
      if (!cardEl) return;
      const bodyTap = cardEl.querySelector('.rc-body-tap');
      if (!bodyTap) return;
      const width = container.offsetWidth || 360;
      const tmp = document.createElement('div');
      tmp.style.cssText = `position:absolute;left:-9999px;top:0;width:${width}px;visibility:hidden;pointer-events:none;`;
      document.body.appendChild(tmp);
      let maxH = 0;
      for (let i = 0; i < _rcSessionOrder.length; i++) {
        const s = _rcSessionOrder[i];
        if (!s) continue;
        // 사용자 명시 2026-05-09: 진주 추가 카드 (hero-empty / isEmpty) = 측정에서 제외. 그 source 만 큼.
        if (s.id === 'pearl' && s.isEmpty) continue;
        tmp.innerHTML = `<div class="rotating-card"><div class="rc-body-tap">${s.bodyHtml || ''}</div></div>`;
        const tapEl = tmp.querySelector('.rc-body-tap');
        const h = tapEl ? tapEl.offsetHeight : 0;
        if (h > maxH) maxH = h;
      }
      document.body.removeChild(tmp);
      // 측정 max 가 default min (160px) 보다 크면 inline 으로 override.
      // hero-empty 카드는 자연 height 가 floor 보다 커서 그대로 큼.
      if (maxH > 160) {
        bodyTap.style.minHeight = maxH + 'px';
      } else {
        bodyTap.style.minHeight = '';
      }
    } catch (e) { console.warn('[rc equalize]', e); }
  }, 60);
}

// =============================================================================
// Cycle — 좌우 화살 navigate (sessionOrder 그대로, 인덱스만 advance)
// =============================================================================
function _rcCycle(dir, opts) {
  if (!_rcSessionOrder || _rcSessionOrder.length === 0) return;
  const total = _rcSessionOrder.length;
  if (total < 2) return;
  _rcSessionIndex = (_rcSessionIndex + dir + total) % total;
  // 진주 카드로 navigate 시 lastPearlShownDate 갱신
  const cur = _rcSessionOrder[_rcSessionIndex];
  if (cur && cur.id === 'pearl') {
    const r = _ensureRotatingCardState();
    r.lastPearlShownDate = _rcTodayKey();
    if (typeof saveState === 'function') saveState();
  }
  const container = document.getElementById('rotatingCardContainer');
  if (container) container.innerHTML = _rcRenderShell(_rcSessionOrder, _rcSessionIndex);
  _rcEqualizeHeights();
}

// =============================================================================
// 외부 hook — saveAt navigation 시 reset (홈 화면 떠나는 시점 = 다음 진입 시 새 세션)
// =============================================================================
// showScreen('home') 진입 = 새 세션 = renderRotatingCard 가 sessionOrder null 보고 재계산.
// 단, navigation 에서 'home' 이 아닌 곳으로 갈 때 reset 호출 → 다음 home 진입 시 자동 새 세션.
// 사용자 명시 2026-05-09: 새 세션마다 가용/불가용 재체크.
window.addEventListener('beforeunload', () => { _rcResetSession(); });

// 사용자 명시: chat 다리 footer 폐기 / swipe 폐기 / 자동 fade 폐기 — 좌우 화살만.
