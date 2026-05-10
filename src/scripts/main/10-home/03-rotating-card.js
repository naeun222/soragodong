// 사용자 명시 2026-05-09 (회전 카드 spec final): 5-source 미컨펌 우선 정렬 + 세션 lock.
// spec: rotating-card-final-2026-05-09.md (이 문서가 최종)
// 5 source: 진주 / 새로 본 너 / 미니 리뷰 / Quiz / 운세
// 폐기: 어제 비교 / 회상 / 통찰(→ 새로 본 너 흡수) / Surprise

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
  // 미니 리뷰
  if (typeof r.lastMiniReviewAt === 'undefined') r.lastMiniReviewAt = null;
  if (typeof r.miniReviewContentId === 'undefined') r.miniReviewContentId = null;
  // Quiz
  if (typeof r.quizDay === 'undefined') r.quizDay = null;
  if (typeof r.quizProgress === 'undefined') r.quizProgress = null;
  if (!r.quizDeniedCooldown || typeof r.quizDeniedCooldown !== 'object') r.quizDeniedCooldown = {};
  if (!r.quizSkippedCooldown || typeof r.quizSkippedCooldown !== 'object') r.quizSkippedCooldown = {};
  if (typeof r.quizScoreBefore === 'undefined') r.quizScoreBefore = null;
  // 운세
  if (typeof r.lastHoroscopeFetchDay === 'undefined') r.lastHoroscopeFetchDay = null;
  if (typeof r.lastHoroscopeContent === 'undefined') r.lastHoroscopeContent = null;
  if (typeof r.lastHoroscopeLucky === 'undefined') r.lastHoroscopeLucky = null;
  if (typeof r.lastHoroscopeShownDate === 'undefined') r.lastHoroscopeShownDate = null;
  if (typeof r.zodiacOnboardSkippedAt === 'undefined') r.zodiacOnboardSkippedAt = null;
  // 시뮬레이션 (사용자 명시 2026-05-09)
  if (typeof r.simulationBlockKey === 'undefined') r.simulationBlockKey = null;
  if (typeof r.currentSimulation === 'undefined') r.currentSimulation = null;
  if (!r.userSimulationsToday || typeof r.userSimulationsToday !== 'object') r.userSimulationsToday = {};
  // 디버깅 / 호환
  if (!Array.isArray(r.history)) r.history = [];
  // preferences.userZodiac 자동 마이그
  if (!state.preferences) state.preferences = {};
  if (typeof state.preferences.userZodiac === 'undefined') state.preferences.userZodiac = null;
  return r;
}

// =============================================================================
// 상수 — baseWeight + tie-breaker stable order
// 사용자 명시 2026-05-09 (재정정): '새로 본 너' source 폐기 → Quiz 로 통합 (둘 다 caseFormulation 미컨펌 풀 사용 — 중복).
// 사용자 명시 2026-05-09 (추가): 시뮬레이션 source 6 추가 — Sonnet, 4h block, on-demand generate.
// 5 source: 진주 / 미니 리뷰 / Quiz / 운세 / 시뮬레이션
// =============================================================================
// 사용자 명시 2026-05-10: quiz source 통째 제거 — '별로다'.
// 사용자 명시 2026-05-10 (batch 11): 5 카드 (어제 / weekly / monthly / quarterly / annual review) 회전 카드 source 흡수. 새 소식 weight 가장 높음.
const _RC_BASE_WEIGHTS = {
  // news source — 새 소식 우선 (확인 시 자연 unavailable)
  review_annual:    300,  // 가장 큼 — 연 1회 도착
  review_quarterly: 250,
  review_monthly:   200,
  review_weekly:    180,  // 주간 = 일요일 도착, miniReview 격상 (200) 보다 약간 ↓
  yesterday:        150,  // 어제 기록 — 매일 한 번
  miniReview:       100,
  simulation:        70,
  horoscope:         50,
  pearl:             20,
};
const _RC_SOURCE_ORDER = [
  'review_annual', 'review_quarterly', 'review_monthly', 'review_weekly',
  'yesterday', 'miniReview', 'simulation', 'horoscope', 'pearl'
];

const _RC_PEARL_WINDOW_MS = 4 * 60 * 60 * 1000;       // 진주 4시간 stay
const _RC_MINI_REVIEW_COOLDOWN_MS = 3 * 86400000;     // 미니 리뷰 3일 stay
const _RC_QUIZ_DENIED_COOLDOWN_MS = 14 * 86400000;    // [아닌데] 14일
const _RC_QUIZ_SKIPPED_COOLDOWN_MS = 1 * 86400000;    // [넘기기] 1일

// =============================================================================
// 세션 lock (전역) — sessionOrder 화면 떠날 때까지 stash, 새 진입 시 reset
// =============================================================================
let _rcSessionOrder = null;
let _rcSessionIndex = 0;
let _rcSessionConfirmed = new Set();
let _rcZodiacSkippedThisSession = false;
let _rcHoroscopeFetchInflight = false;

function _rcResetSession() {
  _rcSessionOrder = null;
  _rcSessionIndex = 0;
  _rcSessionConfirmed = new Set();
  _rcZodiacSkippedThisSession = false;
  // _rcHoroscopeFetchInflight 은 fetch 진행 중이라 reset X — finally 블록이 정리.
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
  return (typeof todayKey === 'function') ? todayKey() : new Date().toISOString().slice(0, 10);
}

// 4AM cutoff key — 사용자 명시 2026-05-09: 미니 리뷰 / Quiz / 운세 모두 새벽 4시 cutoff 일관성.
function _rcCutoffKeyOf(timestampOrIso) {
  const d = new Date(timestampOrIso);
  if (d.getHours() < 4) d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
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
    case 'horoscope':  return r.lastHoroscopeShownDate === todayK;
  }
  return false;
}

function _rcIsConfirmed(sourceId) {
  return _rcSessionConfirmed.has(sourceId) || _rcIsHistoricallyConfirmed(sourceId);
}

// =============================================================================
// 정렬 — 미컨펌 위 / 컨펌 아래 + baseWeight desc + tie-breaker
// =============================================================================
function _rcSortByConfirmation(sources) {
  const unconfirmed = [];
  const confirmed = [];
  for (const s of sources) {
    if (_rcIsConfirmed(s.id)) confirmed.push(s);
    else unconfirmed.push(s);
  }
  const byWeight = (a, b) => {
    const wa = _RC_BASE_WEIGHTS[a.id] || 0;
    const wb = _RC_BASE_WEIGHTS[b.id] || 0;
    if (wb !== wa) return wb - wa;
    return _RC_SOURCE_ORDER.indexOf(a.id) - _RC_SOURCE_ORDER.indexOf(b.id);
  };
  unconfirmed.sort(byWeight);
  confirmed.sort(byWeight);
  // 사용자 명시 2026-05-09: 모든 source 컨펌 (unconfirmed 0) 시 진주 = 가장 먼저 (큐레이션 부드러운 surface).
  if (unconfirmed.length === 0 && confirmed.length > 0) {
    const pearlIdx = confirmed.findIndex(s => s && s.id === 'pearl');
    if (pearlIdx > 0) {
      const [pearl] = confirmed.splice(pearlIdx, 1);
      confirmed.unshift(pearl);
    }
  }
  return [...unconfirmed, ...confirmed];
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
// Source 3 — 미니 리뷰 (Haiku 3일 stay) — stash 견고화
// =============================================================================
function _rcSource3MiniReview() {
  if (typeof _canAI !== 'function' || !_canAI()) return { id: 'miniReview', available: false };
  const r = _ensureRotatingCardState();
  // 사용자 명시 2026-05-09: 3일 새벽 4시 cutoff (lastMiniReviewAt 의 4AM cutoff key vs todayK diff < 3)
  let inCooldown = false;
  if (r.lastMiniReviewAt) {
    const lastDayK = _rcCutoffKeyOf(r.lastMiniReviewAt);
    const todayK = (typeof _rcQuizCutoffKey === 'function') ? _rcQuizCutoffKey() : _rcTodayKey();
    inCooldown = _rcDayDiff(todayK, lastDayK) < 3;
  }

  if (inCooldown) {
    // cooldown 안 = 결과 카드 (재진입 시 stash 사용 — Haiku 재호출 X)
    const mr = _rcFindMiniReviewById(r.miniReviewContentId)
      || (Array.isArray(state.miniReviews) ? state.miniReviews[0] : null);
    if (mr && mr.content) {
      const trim = mr.content.length > 100 ? mr.content.slice(0, 100) + '…' : mr.content;
      return {
        id: 'miniReview',
        available: true,
        contentHash: 'miniReview_result_' + mr.id,
        bodyHtml: `
          <div class="rc-body-mini-review">
            <div class="rc-body-headline">지난 3일 정리</div>
            <div class="rc-body-copy">${escapeHtml(trim)}</div>
          </div>
        `,
        onTapClick: `openSavedMiniReview('${mr.id}')`,
      };
    }
    // cooldown 안인데 stashed content 없음 = 비정상 (이전 cooldown 끝) → trigger 카드로 fallback
  }

  // cooldown 후 = trigger 카드
  const copy = _rcPickRandom([
    '지난 3일 어땠어? 짧게 한 번 짚어볼까.',
    '이 3일 — 같이 한 번 보자.',
    '며칠 모아둔 거 한 번 봐볼까?',
    '지나간 며칠, 짧게 정리해줄까?',
  ]);
  return {
    id: 'miniReview',
    available: true,
    contentHash: 'miniReview_trigger_' + Math.floor(Date.now() / _RC_MINI_REVIEW_COOLDOWN_MS),
    bodyHtml: `
      <div class="rc-body-mini-review">
        <div class="rc-body-headline">지난 3일</div>
        <div class="rc-body-copy">${escapeHtml(copy)}</div>
        <div class="rc-body-mini-cta">탭 → 같이 정리 ✦</div>
      </div>
    `,
    onTapClick: `openMiniReviewModal()`,
  };
}

function _rcFindMiniReviewById(id) {
  if (!id || !Array.isArray(state.miniReviews)) return null;
  return state.miniReviews.find(m => m && m.id === id) || null;
}

// =============================================================================
// 미니 리뷰 모달 — Haiku 호출 (cooldown 후 trigger 시) + stash 견고화
// =============================================================================
async function openMiniReviewModal() {
  const existing = document.getElementById('rcMiniReviewModal');
  if (existing) return;

  const overlay = document.createElement('div');
  overlay.id = 'rcMiniReviewModal';
  overlay.className = 'rc-mini-review-overlay';
  overlay.innerHTML = `
    <div class="rc-mini-review-card">
      <div class="rc-mini-review-header">
        <div class="rc-mini-review-label">🐚 지난 3일</div>
        <button class="rc-mini-review-close" type="button" onclick="closeMiniReviewModal()" aria-label="닫기">×</button>
      </div>
      <div class="rc-mini-review-body" id="rcMiniReviewBody">
        <div class="rc-mini-review-loading">정리 중... ✦</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('show'), 30);

  try {
    const text = await _callMiniReviewHaiku();
    const bodyEl = document.getElementById('rcMiniReviewBody');
    if (!bodyEl) return;
    bodyEl.innerHTML = `
      <div class="rc-mini-review-content">${escapeHtml(text)}</div>
      <button class="rc-mini-review-dismiss" type="button" onclick="dismissMiniReview()">정리 끝</button>
    `;
    // stash — 재진입 시 손실 X. force=true 로 즉시 cloud sync.
    const r = _ensureRotatingCardState();
    r.lastMiniReviewAt = new Date().toISOString();
    if (!Array.isArray(state.miniReviews)) state.miniReviews = [];
    const mrId = 'mr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    state.miniReviews.unshift({
      id: mrId,
      content: text,
      generatedAt: new Date().toISOString(),
      source: 'haiku-3day',
    });
    r.miniReviewContentId = mrId;
    if (typeof saveState === 'function') saveState(true);
    _rcSessionMarkConfirmed('miniReview');
  } catch (e) {
    console.warn('[mini-review]', e);
    const bodyEl = document.getElementById('rcMiniReviewBody');
    if (bodyEl) {
      bodyEl.innerHTML = `
        <div class="rc-mini-review-error">지금은 못 정리하겠어. 다음에 다시 시도.</div>
        <button class="rc-mini-review-dismiss" type="button" onclick="closeMiniReviewModal()">닫기</button>
        <button class="rc-mini-review-retry" type="button" onclick="closeMiniReviewModal(); setTimeout(openMiniReviewModal, 100)">다시</button>
      `;
    }
  }
}

function closeMiniReviewModal() {
  const m = document.getElementById('rcMiniReviewModal');
  if (!m) return;
  m.classList.remove('show');
  setTimeout(() => m.remove(), 200);
}

function dismissMiniReview() {
  closeMiniReviewModal();
  setTimeout(() => {
    if (typeof renderRotatingCard === 'function') renderRotatingCard();
  }, 220);
}

// 사용자 명시 2026-05-09: cooldown 안 카드 탭 시 stashed content 모달 (Haiku 재호출 X).
function openSavedMiniReview(id) {
  const mr = _rcFindMiniReviewById(id) || (Array.isArray(state.miniReviews) ? state.miniReviews[0] : null);
  if (!mr || !mr.content) return;
  const existing = document.getElementById('rcMiniReviewModal');
  if (existing) return;

  const overlay = document.createElement('div');
  overlay.id = 'rcMiniReviewModal';
  overlay.className = 'rc-mini-review-overlay';
  const dateStr = mr.generatedAt
    ? new Date(mr.generatedAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
    : '';
  overlay.innerHTML = `
    <div class="rc-mini-review-card">
      <div class="rc-mini-review-header">
        <div class="rc-mini-review-label">🐚 지난 3일${dateStr ? ` · ${dateStr}` : ''}</div>
        <button class="rc-mini-review-close" type="button" onclick="closeMiniReviewModal()" aria-label="닫기">×</button>
      </div>
      <div class="rc-mini-review-body">
        <div class="rc-mini-review-content">${escapeHtml(mr.content)}</div>
        <button class="rc-mini-review-dismiss" type="button" onclick="closeMiniReviewModal()">닫기</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('show'), 30);
  _rcSessionMarkConfirmed('miniReview');
}

async function _callMiniReviewHaiku() {
  if (typeof callAnthropic !== 'function') throw new Error('callAnthropic 미정의');
  const since = Date.now() - _RC_MINI_REVIEW_COOLDOWN_MS;
  const recentEntries = (state.entries || []).filter(e => {
    const t = e.date ? new Date(e.date + 'T00:00:00').getTime() : 0;
    return t > since;
  }).slice(-7);
  const recentChats = (state.chatMessages || []).filter(m => {
    const t = m.timestamp ? new Date(m.timestamp).getTime() : 0;
    return t > since;
  }).slice(-30);
  const recentArchive = (state.chatArchive || []).filter(a => {
    const t = a.date ? new Date(a.date + 'T00:00:00').getTime() : 0;
    return t > since;
  }).slice(-3);

  const entriesText = recentEntries.map(e =>
    `[${e.date}] vit:${e.vitality || '-'} mood:${e.mood || '-'} sleep:${e.sleep || '-'} note:${(e.note || '').slice(0, 100)}`
  ).join('\n');
  const chatText = recentChats.map(m => `${m.role}: ${(m.content || '').slice(0, 120)}`).join('\n');
  const archiveText = recentArchive.map(a => `[${a.date}] ${(a.headline || a.summary || '').slice(0, 80)}`).join('\n');

  const systemPrompt = `너는 사용자의 친구. 지난 3일을 한 단락 (3-4문장) 으로 정리해줘.

규칙 (절대):
- 친구 카톡 톤. 분석 보고서 X.
- "힘내", "화이팅", "괜찮아질", "잘하고 있어", "대단해" 같은 빈 응원 절대 X.
- 진단명 (ADHD / 우울 / 불안 / PTSD / 강박) 직접 언급 X.
- 사용자 어휘 그대로 인용 OK.
- 평가 X, 관찰 ○.
- 한 단락만. 헤더 / 카테고리 / 리스트 X.
- "결" 단어 X (잔잔한 결, 가벼운 결 등 회피).
- 부담스러운 칭찬 X.`;

  const userPrompt = `지난 3일 데이터:

[체크인]
${entriesText || '(없음)'}

[대화 발췌]
${chatText || '(없음)'}

[아카이브 헤드라인]
${archiveText || '(없음)'}

→ 한 단락 (3-4문장) 으로 정리해줘.`;

  const sycophancy = /힘내|화이팅|괜찮아질|잘하고 있어|대단해/;
  const diagnosis = /\bADHD\b|우울증|우울장애|불안장애|PTSD|강박장애/i;
  const banGyeol = /잔잔한 결|가벼운 결|단단한 결|부드러운 결|결 따라/;

  let attempt = 0;
  while (attempt < 2) {
    const resp = await callAnthropic({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 280,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    if (!resp.ok) throw new Error('Haiku API ' + resp.status);
    const data = await resp.json();
    const text = (data.content?.[0]?.text || '').trim();
    if (!text) throw new Error('빈 응답');
    if (sycophancy.test(text) || diagnosis.test(text) || banGyeol.test(text)) {
      attempt++;
      if (attempt >= 2) throw new Error('tone verify 실패');
      continue;
    }
    return text;
  }
  throw new Error('attempts exceeded');
}

// =============================================================================
// 가용 source 수집 (4 source) — 사용자 명시 2026-05-09: '새로 본 너' 폐기 → Quiz 통합.
// 진주 / 미니 리뷰 / Quiz / 운세
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
    safe(_rcSource3MiniReview, 'miniReview'),
    safe(typeof _rcSource5Horoscope === 'function' ? _rcSource5Horoscope : null,   'horoscope'),
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
// godong 표정 SVG (5 source variant)
// =============================================================================
function _rcGodongSvg(sourceId) {
  const expressions = {
    pearl: {
      eyes: '<circle cx="22" cy="26" r="1.6" fill="#1a1a2e"/><circle cx="32" cy="26" r="1.6" fill="#1a1a2e"/>',
      mouth: '<path d="M 22 33 Q 27 36 32 33" fill="none" stroke="#1a1a2e" stroke-width="1.3" stroke-linecap="round"/>',
      extra: '<text x="42" y="14" font-size="9" fill="rgba(255,243,196,0.95)">✨</text>',
    },
    newView: {
      eyes: '<circle cx="22" cy="27" r="2.4" fill="#1a1a2e"/><circle cx="32" cy="27" r="2.4" fill="#1a1a2e"/><circle cx="22.5" cy="26" r="0.8" fill="#fff"/><circle cx="32.5" cy="26" r="0.8" fill="#fff"/>',
      mouth: '<circle cx="27" cy="34" r="1.6" fill="none" stroke="#1a1a2e" stroke-width="1.3"/>',
      extra: '<text x="42" y="14" font-size="9" fill="rgba(255,243,196,0.95)">✦</text>',
    },
    miniReview: {
      eyes: '<path d="M 20 27 Q 22 26 24 27" fill="none" stroke="#1a1a2e" stroke-width="1.4" stroke-linecap="round"/><path d="M 30 27 Q 32 26 34 27" fill="none" stroke="#1a1a2e" stroke-width="1.4" stroke-linecap="round"/>',
      mouth: '<line x1="25" y1="34" x2="29" y2="34" stroke="#1a1a2e" stroke-width="1.3" stroke-linecap="round"/>',
      extra: '',
    },
    quiz: {
      eyes: '<circle cx="22" cy="26" r="1.8" fill="#1a1a2e"/><circle cx="32" cy="26" r="1.8" fill="#1a1a2e"/>',
      mouth: '<path d="M 22 33 Q 27 35 32 33" fill="none" stroke="#1a1a2e" stroke-width="1.3" stroke-linecap="round"/>',
      extra: '<text x="42" y="14" font-size="9" fill="rgba(255,243,196,0.95)">?</text>',
    },
    quizDone: {
      eyes: '<path d="M 20 27 Q 22 24 24 27" fill="none" stroke="#1a1a2e" stroke-width="1.4" stroke-linecap="round"/><path d="M 30 27 Q 32 24 34 27" fill="none" stroke="#1a1a2e" stroke-width="1.4" stroke-linecap="round"/>',
      mouth: '<path d="M 22 33 Q 27 37 32 33" fill="none" stroke="#1a1a2e" stroke-width="1.5" stroke-linecap="round"/>',
      extra: '<text x="42" y="14" font-size="9" fill="rgba(255,243,196,0.95)">★</text>',
    },
    horoscope: {
      eyes: '<path d="M 20 26 Q 22 24 24 26" fill="none" stroke="#1a1a2e" stroke-width="1.4" stroke-linecap="round"/><path d="M 30 26 Q 32 24 34 26" fill="none" stroke="#1a1a2e" stroke-width="1.4" stroke-linecap="round"/>',
      mouth: '<path d="M 23 33 Q 27 35 31 33" fill="none" stroke="#1a1a2e" stroke-width="1.3" stroke-linecap="round"/>',
      extra: '<text x="40" y="14" font-size="8" fill="rgba(168,157,200,0.95)">🌗</text>',
    },
  };
  const exp = expressions[sourceId] || expressions.pearl;
  return `
    <svg class="rc-godong-svg" viewBox="0 0 56 50" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="godongGrad-${sourceId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f5d99c"/>
          <stop offset="100%" stop-color="#d4a76a"/>
        </linearGradient>
      </defs>
      <path d="M 28 5 Q 48 8 47 28 Q 46 47 28 47 Q 10 47 9 28 Q 8 12 28 5 Z" fill="url(#godongGrad-${sourceId})" stroke="rgba(168,157,200,0.4)" stroke-width="0.6"/>
      <path d="M 28 14 Q 40 18 38 28 Q 36 38 28 38 Q 20 38 20 28" fill="none" stroke="rgba(168,157,200,0.55)" stroke-width="1.2"/>
      ${exp.eyes}
      ${exp.mouth}
      ${exp.extra}
    </svg>
  `;
}

// =============================================================================
// 렌더 — sessionOrder 기반 (한 화면 안 stable)
// =============================================================================
function renderRotatingCard() {
  const container = document.getElementById('rotatingCardContainer');
  if (!container) return;
  _ensureRotatingCardState();

  try {
    // 튜토리얼 모드 = 진주 fixed
    if (window._onbTutorialMode) {
      const s = _rcSource1Pearl();
      _rcSessionOrder = [s];
      _rcSessionIndex = 0;
      container.innerHTML = _rcRenderShell([s], 0);
      return;
    }

    // 별자리 onboarding 카드 = horoscope source 자리에 자체 표시 (03b sub file). 별도 단독 X.

    // 새 세션 (sessionOrder 비어있으면 새 진입) — 가용 source 재계산 + 정렬
    if (!_rcSessionOrder) {
      const sources = _rcCollectAvailable();
      if (sources.length === 0) {
        // 가용 source 0 = source 1 진주 fallback (빈 진주 CTA 라도 가용)
        const s = _rcSource1Pearl();
        _rcSessionOrder = s ? [s] : [];
        _rcSessionIndex = 0;
      } else {
        _rcSessionOrder = _rcSortByConfirmation(sources);
        _rcSessionIndex = 0;
        // 첫 카드 진주면 lastPearlShownDate 갱신
        const first = _rcSessionOrder[0];
        if (first && first.id === 'pearl') {
          const r = _ensureRotatingCardState();
          r.lastPearlShownDate = _rcTodayKey();
          if (typeof saveState === 'function') saveState();
        }
      }
    }

    if (_rcSessionOrder.length === 0) {
      container.innerHTML = '';
      return;
    }
    if (_rcSessionIndex >= _rcSessionOrder.length) _rcSessionIndex = 0;
    container.innerHTML = _rcRenderShell(_rcSessionOrder, _rcSessionIndex);
    _rcEqualizeHeights();
  } catch (e) {
    console.error('[renderRotatingCard]', e);
    try {
      const s = _rcSource1Pearl();
      _rcSessionOrder = [s];
      _rcSessionIndex = 0;
      container.innerHTML = _rcRenderShell([s], 0);
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
