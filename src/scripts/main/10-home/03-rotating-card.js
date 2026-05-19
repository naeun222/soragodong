// 사용자 명시 2026-05-09 (회전 카드 spec final): 미컨펌 우선 정렬 + 세션 lock.
// spec: rotating-card-final-2026-05-09.md (이 문서가 최종)
// source: 진주 / 시뮬레이션 / 어제 + weekly~annual review

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
  // V4 (사용자 명시 2026-05-17): priority stack 도입 — 회전 X, single card swap.
  //   사용자가 카드 본 (= 한 번 click) source 는 dayK 동안 dismiss. 다음 priority source 가 그 자리에.
  //   새벽 4시 dayK reset 시 자연 부활.
  if (typeof r.dismissedDayK === 'undefined') r.dismissedDayK = null;
  if (!r.dismissedSources || typeof r.dismissedSources !== 'object') r.dismissedSources = {};
  // 디버깅 / 호환
  if (!Array.isArray(r.history)) r.history = [];
  return r;
}

// V4 (사용자 명시 2026-05-17): dayK 바뀌면 dismissedSources 자동 reset.
function _rcGetDismissedToday() {
  const r = _ensureRotatingCardState();
  const tk = (typeof todayKey === 'function') ? todayKey() : null;
  if (r.dismissedDayK !== tk) {
    r.dismissedDayK = tk;
    r.dismissedSources = {};
    if (typeof saveState === 'function') { try { saveState(); } catch {} }
  }
  return r.dismissedSources || {};
}

function _rcMarkDismissedToday(sourceId) {
  if (!sourceId) return;
  const r = _ensureRotatingCardState();
  const tk = (typeof todayKey === 'function') ? todayKey() : null;
  if (r.dismissedDayK !== tk) {
    r.dismissedDayK = tk;
    r.dismissedSources = {};
  }
  r.dismissedSources[sourceId] = true;
  if (typeof saveState === 'function') { try { saveState(); } catch {} }
}

// V4 (사용자 명시 2026-05-17): 저녁 mode = 18:00 이후 ~ 04:00 (dayK reset 까지). 우선순위에 체크인 진입.
// V4 (사용자 명시 2026-05-17 ultrathink): dev toggle (window._devForceEvening) 우선 — 낮 시간에 저녁 UI 미리보기.
function _rcIsEveningMode() {
  if (window._devForceEvening) return true;
  const h = new Date().getHours();
  return h >= 18 || h < 4;
}

// =============================================================================
// 상수 — baseWeight + tie-breaker stable order
// =============================================================================
// review 4개 = 명확 우선순위 (annual > quarterly > monthly > weekly).
// 그 외 = 동급 weight 100, _RC_SOURCE_ORDER tie-break 으로 결정 (어제 / 진주 / 시뮬).
const _RC_BASE_WEIGHTS = {
  review_annual:    500,
  review_quarterly: 400,
  review_monthly:   300,
  review_weekly:    200,
  // 동급 100 — _RC_SOURCE_ORDER 의 tie-break 으로 결정.
  yesterday:        100,
  pearl:            100,
  simulation:       100,
};
const _RC_SOURCE_ORDER = [
  'review_annual', 'review_quarterly', 'review_monthly', 'review_weekly',
  'yesterday', 'pearl', 'simulation'
];

const _RC_PEARL_WINDOW_MS = 4 * 60 * 60 * 1000;       // 진주 4시간 stay
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

// 4AM cutoff key — getDayKey 위임으로 통일.
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
// 가용 source 수집 — 진주 / 시뮬레이션 / 어제 / weekly~annual review
// =============================================================================
function _rcCollectAvailable() {
  const safe = (fn, label) => {
    if (typeof fn !== 'function') return null;
    try { return fn(); } catch (e) { console.warn('[rotating-card source]', label, e); return null; }
  };
  const all = [
    safe(_rcSource1Pearl,      'pearl'),
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
// pearl=inspired(별눈), newView=surprised(큰 눈),
// quiz=thinking(?), quizDone=proud(별3개+자부심)
// =============================================================================
function _rcGodongSvg(sourceId) {
  const moodMap = {
    pearl: 'inspired',
    newView: 'surprised',
    quiz: 'thinking',
    quizDone: 'proud',
  };
  const mood = moodMap[sourceId] || 'default';
  return `<img class="rc-godong-svg godong-mood-${mood}" src="/character/godong-${mood}.svg" alt="" decoding="async" aria-hidden="true">`;
}

// =============================================================================
// 렌더 — sessionOrder 기반 (한 화면 안 stable)
// =============================================================================
// V4 (사용자 명시 2026-05-17 ultrathink): priority stack 으로 재설계 — 회전 X, 한 번에 한 카드만 노출.
//   사용자가 카드 click = "본 것" → dismiss → 다음 priority source 가 그 자리에 등장.
//   새벽 4시 dayK reset 시 자연 부활.
// V4 fix (사용자 명시 2026-05-18 ultrathink): 시간대 분기 폐기 — 낮/저녁 무관 동일 priority.
//   priority: 리뷰 → 체크인(미완료시) → hook → 오늘의 너.
//   완료 시 buildCheckin null → 다음 source 가 메인 + 작은 ✓ mini-link.
//   크기: 오늘의 너 (진주 큐레이션) 통일. 다른 source 는 inline min-height 로 매칭.
function renderRotatingCard() {
  const container = document.getElementById('rotatingCardContainer');
  if (!container) return;
  _ensureRotatingCardState();

  try {
    const dismissed = _rcGetDismissedToday();
    const todayKVal = (typeof todayKey === 'function') ? todayKey() : '';

    // 체크인 완료 여부 — 우선순위에서 제외 + 작은 링크 done 상태로.
    const todayEntry = (state.entries || []).find(e => e.date === todayKVal);
    const checkinDone = !!(todayEntry && (todayEntry.vitality || todayEntry.note));

    // 각 source 빌더 — 가용성 만 체크. tap 만으로는 dismiss X (peek 후 미완 = 다시 surface).
    // V4 (사용자 명시 2026-05-20 ultrathink): tap dismiss path 폐기. 각 source 의 *완료 / 만료* 조건만 책임.
    //   - hook: answered / dismissedFromHome / firstSurfacedAt+20h (pickHomeMainHook 가 책임)
    //   - checkin: checkinDone (submitCheckin 시 자동)
    //   - review: !user_viewed (openSavedReview 가 책임 — _reviewPreviewPickLatest 가 필터)
    //   - oneul: 영구 surface (fallback)
    const buildHook = () => {
      if (typeof pickHomeMainHook !== 'function') return null;
      const h = pickHomeMainHook();
      if (!h) return null;
      return {
        id: 'hook_' + (h.id || ''), sourceType: 'hook',
        bodyHtml: _rcBuildHookBodyHtml(h),
        onTapClick: `hookCardTap('${h.id}')`,
      };
    };
    const buildCheckin = () => {
      if (checkinDone) return null;  // 완료 → priority 에서 제외 (자동 dismiss)
      return {
        id: 'checkin_' + todayKVal, sourceType: 'checkin',
        bodyHtml: _rcBuildCheckinBodyHtml(),
        onTapClick: `enterCheckin()`,
      };
    };
    const buildOneul = () => {
      if (typeof _pickHeroPearl !== 'function' || typeof _heroCardHtml !== 'function') return null;
      // V4 (사용자 명시 2026-05-19 ultrathink): 4시간 단위 rotation — 매 진입 X.
      //   같은 4시간 bucket 안 = 캐시된 진주 그대로 (홈 자주 들어가도 안 바뀜).
      //   bucket 바뀌면 _pickHeroPearl() 로 새로 pick + 캐시 갱신.
      //   진주 0개 / cache lookup 실패 → fresh pick. cache 진주가 삭제됐어도 안전.
      const _bucket = Math.floor(Date.now() / (4 * 3600000));
      let pick = null;
      const _prefs = state.preferences || {};
      if (_prefs._oneulBucket === _bucket && _prefs._oneulPearlId) {
        const _cached = (state.pearls || []).find(p => p && !p._deleted && p.id === _prefs._oneulPearlId);
        if (_cached) pick = _cached;
      }
      if (!pick) {
        pick = _pickHeroPearl();
        if (pick && pick.id) {
          state.preferences = state.preferences || {};
          state.preferences._oneulBucket = _bucket;
          state.preferences._oneulPearlId = pick.id;
          try { saveState(); } catch {}
        }
      }
      if (!pick) return null;
      // V4 (사용자 명시 2026-05-17 재): 오늘의 너 = 영구 surface (마지막 fallback). click 해도 dismiss X — dismissed 체크 / dismissCall 둘 다 X.
      //   다른 source (hook/checkin/review) 다 dismiss 되면 오늘의 너만 남아 stay. _heroCardHtml 기본 onclick (진주 탭 진입) 만.
      return {
        id: 'oneul_' + (pick.id || ''), sourceType: 'oneul',
        bodyHtml: _heroCardHtml(pick, { linkTo: 'pearls-tab' }),
      };
    };
    const buildReview = () => {
      if (typeof _reviewPreviewPickLatest !== 'function') return null;
      const r = _reviewPreviewPickLatest();
      if (!r) return null;
      return {
        id: 'review_' + r._kind + '_' + (r.id || ''), sourceType: 'review',
        bodyHtml: _rcBuildReviewBodyHtml(r),
        onTapClick: `_openReviewPreviewLink('${r._kind}','${r.id || ''}')`,
      };
    };

    // 우선순위 순회 — 첫 통과한 1개 채택.
    // V4 fix (사용자 명시 2026-05-18 ultrathink): 시간대 무관 통일 priority.
    const priority = [buildReview, buildCheckin, buildHook, buildOneul];
    let picked = null;
    for (const fn of priority) {
      const s = fn();
      if (s) { picked = s; break; }
    }

    // 카드 + 작은 체크인 링크.
    // V4 fix (사용자 명시 2026-05-18 ultrathink): mini-link 는 완료 시에만 노출.
    //   checkin 카드가 priority slot 에 있을 때 skip (중복 회피) — 단 미완료 mini-link 도 폐기되어 결과적으로 done 만.
    // V4 fix (사용자 명시 2026-05-18 ultrathink 재): mini-link 위치 분리 — 회전카드 container 에서 빼고
    //   별도 #checkinDoneMiniLinkSlot (인사 영역 오른쪽) 에 inject.
    const cardHtml = picked ? _rcRenderShell([picked], 0) : '';
    const miniLink = (picked && picked.sourceType === 'checkin')
      ? ''  // checkin 카드가 priority slot 에 = 중복 회피
      : _rcCheckinMiniLink(checkinDone);  // 완료 시에만 ✓ 링크 노출

    // mini-link slot 별도 inject (인사 영역 오른쪽).
    const miniSlot = document.getElementById('checkinDoneMiniLinkSlot');
    if (miniSlot) miniSlot.innerHTML = miniLink;

    if (!cardHtml) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = cardHtml;
    // V4 (사용자 명시 2026-05-18 ultrathink): Phase 1D — 신 path 진주 미디어 (storageKey) 가 카드에 있으면 hydrate. hydratePearlVideos 도 같이 (옛 path 영상 진주 호환).
    if (typeof hydratePearlVideos === 'function') hydratePearlVideos();
    else if (typeof hydratePearlMedia === 'function') hydratePearlMedia(container);
  } catch (e) {
    console.error('[renderRotatingCard]', e);
    container.innerHTML = '';
  }
}

// V4 (사용자 명시 2026-05-17): source dismiss + 즉시 rerender → 다음 priority 가 그 자리에 등장.
function _rcOnSourceTap(sourceId) {
  try {
    _rcMarkDismissedToday(sourceId);
    // setTimeout 0 — onclick 핸들러 (enterCheckin / hookCardTap / openReview) 가 먼저 실행되고 rerender.
    setTimeout(() => { try { renderRotatingCard(); } catch {} }, 0);
  } catch (e) { console.warn('[rcOnSourceTap]', e); }
}

// 작은 체크인 링크 — 완료 시에만 노출.
// V4 fix (사용자 명시 2026-05-18 ultrathink): isDone=false 분기 폐기 — 미완료 mini-link X.
//   미완료는 priority slot 의 큰 체크인 카드로만 표시. 완료 시 (큰 카드 X) 작은 ✓ 링크만 노출.
// V4 fix (사용자 명시 2026-05-18 ultrathink 재): 문구 축소 '✓ 오늘 체크인 — 보기 / 수정' → '✓ 오늘 체크인'.
//   위치도 회전카드 밑 → 인사 영역 오른쪽 (#checkinDoneMiniLinkSlot) 으로 이동.
function _rcCheckinMiniLink(isDone) {
  if (window._onbTutorialMode) return '';
  if (!isDone) return '';
  return `<div class="rc-checkin-mini-link" onclick="enterCheckin()">✓ 오늘 체크인</div>`;
}

// Hook source bodyHtml — 친구 톤 질문 + hint.
// V4 fix (사용자 명시 2026-05-18) — 카드 크기 통일: 오늘의 너 (.library-hero) 큐레이션 기본 크기로 unify.
//   옛 .action-card (작은 size, flex row) → .library-hero (gradient bg, label + body + meta divider).
//   _rcRenderShell 의 outer .rc-body-tap 가 onTapClick 처리하므로 inner .library-hero 자체 onclick X.
function _rcBuildHookBodyHtml(hook) {
  const userName = (state.userName || '').trim();
  const nameCall = (typeof _hookNameCall === 'function') ? _hookNameCall(userName) : userName;
  const header = userName ? `있잖아 ${nameCall} ✦` : '있잖아 ✦';
  const body = hook && hook.body ? hook.body : '탭해서 답하기';
  return `
    <div class="library-hero">
      <div class="hero-label">💭 ${escapeHtml(header)}</div>
      <div class="hero-text">
        <div class="hero-text-col">
          <div class="hero-content">${escapeHtml(body)}</div>
        </div>
      </div>
      <div class="hero-meta">탭해서 답해줘</div>
    </div>
  `;
}

// 체크인 source bodyHtml — 시간대 카피 (미완료) + 튜토.
// V4 fix (사용자 명시 2026-05-18) — 카드 크기 통일: 오늘의 너 (.library-hero) 큐레이션 기본 크기.
//   같은 priority slot 안 다른 source 들과 visual consistency — 통일 안 하면 day 별로 크기 다른 카드 노출됨.
function _rcBuildCheckinBodyHtml() {
  if (window._onbTutorialMode) {
    return `
      <div class="library-hero">
        <div class="hero-label">✓ 체크인</div>
        <div class="hero-text">
          <div class="hero-text-col">
            <div class="hero-content">오늘 너 어땠어?</div>
          </div>
        </div>
        <div class="hero-meta">탭해서 시작</div>
      </div>
    `;
  }
  const slot = (typeof getCheckinTimeSlot === 'function') ? getCheckinTimeSlot() : 'night';
  const copy = (typeof _checkinCardCopy === 'function') ? _checkinCardCopy(slot, false) : { icon: '✓', title: '체크인', sub: '' };
  return `
    <div class="library-hero">
      <div class="hero-label">${copy.icon} 체크인</div>
      <div class="hero-text">
        <div class="hero-text-col">
          <div class="hero-content">${escapeHtml(copy.title)}</div>
        </div>
      </div>
      <div class="hero-meta">탭해서 시작</div>
    </div>
  `;
}

// 리뷰 링크 source bodyHtml.
// V4 fix (사용자 명시 2026-05-18) — 카드 크기 통일: 오늘의 너 (.library-hero) 큐레이션 기본 크기.
function _rcBuildReviewBodyHtml(r) {
  const kind = r && r._kind;
  let icon, title, kindLabel;
  if (kind === 'monthly') {
    icon = '📅'; title = '지난 달 너의 모습 돌아보기'; kindLabel = '월간 리뷰';
  } else if (kind === 'quarterly') {
    icon = '📅'; title = '지난 분기 너의 모습 돌아보기'; kindLabel = '분기 리뷰';
  } else if (kind === 'annual') {
    icon = '🎆'; title = '지난 한 해 너의 모습 돌아보기'; kindLabel = '연간 리뷰';
  } else {
    // weekly + fallback
    icon = '🌙'; title = '이번 주 어땠는지 같이 돌아볼까?'; kindLabel = '주간 리뷰';
  }
  return `
    <div class="library-hero">
      <div class="hero-label">${icon} ${kindLabel}</div>
      <div class="hero-text">
        <div class="hero-text-col">
          <div class="hero-content">${escapeHtml(title)}</div>
        </div>
      </div>
      <div class="hero-meta">탭해서 보기</div>
    </div>
  `;
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

  // V4 (사용자 명시 2026-05-17 재): godong SVG + 회전카드 배경 전부 제거. 단순 click 컨테이너만.
  return `
    <div class="rotating-card" id="rotatingCard" data-current-idx="${currentIdx}" data-total="${total}">
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
