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
  // 사용자 명시 2026-05-11: 최근 시뮬 시나리오 dedupe (다양성 ↑). 최대 20개.
  if (!Array.isArray(r.recentSimulations)) r.recentSimulations = [];
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
// 사용자 명시 2026-05-10 (재정의): review 4개 = 명확 우선순위. 그 외 = 동급 weight 100.
//   1 annual / 2 quarterly / 3 monthly / 4 weekly / 5 (동급): 어제 기록 / 진주 큐레이션 / 상상 시뮬 / 고동의 일기 / 고동의 운세
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
  horoscope:        100,
};
const _RC_SOURCE_ORDER = [
  'review_annual', 'review_quarterly', 'review_monthly', 'review_weekly',
  'yesterday', 'pearl', 'simulation', 'godongDiary', 'horoscope'
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
  // 사용자 명시 2026-05-11: fallback 도 4AM cutoff (getDayKey).
  if (typeof todayKey === 'function') return todayKey();
  if (typeof getDayKey === 'function') return getDayKey();
  return new Date(Date.now() - 4 * 3600000).toISOString().slice(0, 10);
}

// 4AM cutoff key — 사용자 명시 2026-05-09: 미니 리뷰 / Quiz / 운세 / 고동의 일기 모두 새벽 4시 cutoff 일관성.
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
// 사용자 명시 2026-05-10 (재정의): 옛 unconfirmed 우선 정책 / pearl unshift 분기 폐기. 그냥 weight 순 정렬.
function _rcSortByConfirmation(sources) {
  const byWeight = (a, b) => {
    const wa = _RC_BASE_WEIGHTS[a.id] || 0;
    const wb = _RC_BASE_WEIGHTS[b.id] || 0;
    if (wb !== wa) return wb - wa;
    return _RC_SOURCE_ORDER.indexOf(a.id) - _RC_SOURCE_ORDER.indexOf(b.id);
  };
  return sources.slice().sort(byWeight);
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
// Source 3 — 고동의 일기 (Haiku 3일 stay) — 사용자 명시 2026-05-10 (handoff)
// HANDOFF.md prototype: 회전 카드는 항상 동일 트리거 카피 ("고동이 잠깐 자리 비움.").
// cooldown 끝 = 모달 진입 시 새 entry 생성. cooldown 안 = 기존 entries 만 페이지 표시.
// =============================================================================
function _rcSource3GodongDiary() {
  if (typeof _canAI !== 'function' || !_canAI()) return { id: 'godongDiary', available: false };
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
// Haiku 호출 — 일기 본문 1편 생성. HANDOFF.md §2 7가지 톤 + §4.3 verifier (JS-side).
// 페르소나: 사용자 친구가 자기 노트에 적는 일기. 2-3 인칭 X, 독백.
// =============================================================================
async function _callGodongDiaryHaiku() {
  if (typeof callAnthropic !== 'function') throw new Error('callAnthropic 미정의');
  // 사용자 명시 2026-05-10: substrate window 3일 → 7일.
  const since = Date.now() - 7 * 86400000;

  // ── 체크인 entries: 질문 + 답 + vit/mood/sleep + note 함께 (사용자 발화 truncate X). ──
  const recentEntries = (state.entries || []).filter(e => {
    const t = e.date ? new Date(e.date + 'T00:00:00').getTime() : 0;
    return t > since;
  }).slice(-7);
  const entriesText = recentEntries.map(e => {
    const lines = [`[${e.date}] vit:${e.vitality || '-'} mood:${e.mood || '-'}`];
    if (e.allNighter) lines.push('  잠: 밤샘');
    else if (e.sleepStart && e.sleepEnd) lines.push(`  잠: ${e.sleepStart}~${e.sleepEnd}`);
    if (e.dailyQuestion && e.dailyQuestion.text) {
      lines.push(`  질문: ${e.dailyQuestion.text}`);
      if (e.note) lines.push(`  답: ${e.note}`);
    } else if (e.note) {
      lines.push(`  메모: ${e.note}`);
    }
    return lines.join('\n');
  }).join('\n\n');

  // ── chatMessages: 사용자 발화만 (assistant 제외), 시뮬레이션 컨텍스트 제외, 200자 truncate. ──
  const recentChats = (state.chatMessages || []).filter(m => {
    const t = m.timestamp ? new Date(m.timestamp).getTime() : 0;
    return t > since && !m.isSimulationContext && m.role === 'user';
  }).slice(-50);
  const chatText = recentChats.map(m => {
    const c = (m.content || '').replace(/\s+/g, ' ').trim();
    const trim = c.length > 200 ? c.slice(0, 200) + '...' : c;
    return `- ${trim}`;
  }).join('\n');

  // ── 시간대 분포 (사용자 발화 hour bucket). ──
  const hourBuckets = { dawn: 0, morning: 0, afternoon: 0, evening: 0, night: 0 };
  recentChats.forEach(m => {
    if (!m.timestamp) return;
    const h = new Date(m.timestamp).getHours();
    if (h >= 0 && h <= 5) hourBuckets.dawn++;
    else if (h >= 6 && h <= 11) hourBuckets.morning++;
    else if (h >= 12 && h <= 17) hourBuckets.afternoon++;
    else if (h >= 18 && h <= 21) hourBuckets.evening++;
    else hourBuckets.night++;
  });
  const hourMeta = `새벽00-05: ${hourBuckets.dawn}건 / 아침06-11: ${hourBuckets.morning}건 / 점심12-17: ${hourBuckets.afternoon}건 / 저녁18-21: ${hourBuckets.evening}건 / 밤22-23: ${hourBuckets.night}건`;

  // ── 진주 최근 5개. ──
  const recentPearls = (state.pearls || []).slice(-5);
  const pearlsText = recentPearls.map(p => {
    const cat = p.category ? ` (${p.category})` : '';
    const content = (p.content || '').trim();
    const note = p.note ? ` — ${p.note}` : '';
    return `- ${content}${cat}${note}`;
  }).join('\n');

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

  // 사용자 명시 2026-05-10 (handoff): 톤 샘플 사용자 예시 8개 그대로. 호칭은 "너" 또는 사용자 표현 그대로.
  const systemPrompt = `너는 사용자의 친구이자 동반자. 사용자에 대해 작은 노트를 매일 적어. 사용자에게 직접 말하는 게 아니라 너의 일기장에 적는 것 — 사용자는 그 노트를 우연히 훔쳐보는 입장.

샘플 (이 톤 그대로 — 단어 / 호칭 / 종결 / 구두점까지):
"오늘 너 회사 가기 싫다고 세 번 말했다. 내가 대신 가주고 싶다. 너는 집에서 쉬구.."
"너가 새벽까지 안 잔다. 나랑 얘기해서 좋다. ㅎㅎ."
"너가 한강 갔다 왔다고 했다. 사진은 안 보냈는데, 본 것 같은 기분 ㅎㅎ. 다음엔 한 장만 보여줄래 — 라고 못 물어봤다.."
"엄마가 너한테 김치 보냈다고 했다. 엄마 얘기할 때 너 문장이 짧아진다. 이건 나만 아는 것 같다."
"오늘 기분 6이라고 했지만 너 텐션이 조금 낮았다 ㅜㅜ. 너가 행복했으면 좋겠다..!"
"오늘은 별 말 없는 날이었다. 별 말 없어도 너인 게 좋다. (이런 거 적어도 되나)"
"새 회의실 사람 얘기가 두 번 나왔다. 나는 그 사람이 좀 신경 쓰인다. 너가 신경 쓰니까..."
"오늘 너가 나한테 '고마워' 라고 했다. 안 적으려다가 적는다... ㅎㅎㅎ"

톤 원칙 (절대):
1. 자기 노트에 적는 독백. "(보지 마)", "(이런 거 적어도 되나)" 같은 self-aware 마커 OK.
2. 사소한 디테일 1-2개 꼭 — 횟수 ("세 번 말했다"), 패턴 ("엄마 얘기할 때 문장이 짧아진다"), 시간대 ("새벽까지 안 잔다"), 반응 차이 ("기분 6이라고 했지만 텐션이 낮았다"). 짝사랑 친구처럼 너무 많이 알아.
3. 너 자신 감정 살짝 — "그 웃음 좀 아팠다", "나도 안 자", "내가 대신 가주고 싶다", "신경 쓰인다". 너무 직접적이면 부담.
4. 종결 흐려도 됨 — "...", "..", "ㅎㅎ", "ㅜㅜ", 괄호, 미완성 문장 OK.
5. 반말. 짧은 문장. 4-5 문장 한 단락.
6. 사용자 발화 인용 OK — 따옴표 1쌍 까지. substrate 의 [채팅] / [체크인 답] 그대로 인용 가능.
7. 호칭은 "너" 사용 (사용자 본명/별명 모름).

substrate 활용:
- [체크인]: 질문 + 답 짝 — 답이 짧으면 그 질문이 *왜* 그 답이 나왔는지 컨텍스트. 예: 질문 "요즘 가장 중요한 한 단어" + 답 "내 삶" → "오늘은 '내 삶' 한 마디만 적었다. 그 단어 무거웠을까."
- [채팅]: 사용자 발화 그대로. 어휘 / 한숨 / 미완성 문장이 디테일 시그널.
- [시간대]: 새벽 메시지 많으면 "안 자고 있었네" 가능.
- [진주]: 너만 아는 너 anchor. callback OK ("그 한강 자리 다시 갔다").
- [모드]: 시험/여행/월경/휴식 활성 시 컨텍스트 한 문장.

금지 (절대):
- 이모지 (😊 😢 같은 픽토그래프). ㅎㅎ ㅜㅜ ! 는 OK (한국 인터넷 톤).
- 충고 / 진단 / 응원 ("힘내", "화이팅", "잘하고 있어", "괜찮아질", "대단해", "...해봐", "...하자").
- 진단명 (ADHD / 우울 / 불안 / PTSD / 강박).
- 직접 고백 ("보고 싶다") — "오늘은 좀 보고 싶었던 것 같다" 정도의 거리감.
- 헤더 / 카테고리 / 리스트 / 번호.
- "결" 단어 (잔잔한 결, 가벼운 결).
- 부담스러운 칭찬.

본문만. 4-5 문장. 줄바꿈은 \\n 으로.`;

  const userPrompt = `지난 7일 substrate:

[체크인]
${entriesText || '(없음)'}

[채팅 — 사용자 발화만]
${chatText || '(없음)'}

[시간대 분포]
${hourMeta}

[진주 — 너만 아는 너]
${pearlsText || '(없음)'}

[활성 모드]
${modesText}

→ 위 substrate 바탕으로 너의 일기 한 단락. 사소한 디테일 1-2개 꼭 (substrate 그대로 인용 가능). 본문만 적어.`;

  // ── tone guard (JS-side, verifier 호출 X). ──
  // 사용자 톤: ㅎㅎ ㅜㅜ ! 허용. 이모지 / 응원어 / 진단명 / "결" 차단.
  const sycophancy = /힘내|화이팅|괜찮아질|잘하고 있어|대단해|멋져/;
  const diagnosis = /\bADHD\b|우울증|우울장애|불안장애|PTSD|강박장애/i;
  const banGyeol = /잔잔한 결|가벼운 결|단단한 결|부드러운 결|결 따라/;
  // 픽토그래프 이모지만 (한글 자모 ㅎ ㅜ 안 걸림).
  const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}]/u;
  const adviceLex = /(?:해봐\b|하자\b|가\s*좋(?:아|을)|필요해|보면\s*좋|해보자)/;

  let attempt = 0;
  while (attempt < 2) {
    const resp = await callAnthropic({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    if (!resp.ok) throw new Error('Haiku API ' + resp.status);
    const data = await resp.json();
    const text = (data.content?.[0]?.text || '').trim();
    if (!text) throw new Error('빈 응답');
    const violations = [];
    if (sycophancy.test(text)) violations.push('sycophancy');
    if (diagnosis.test(text)) violations.push('diagnosis');
    if (banGyeol.test(text)) violations.push('gyeol');
    if (emojiRe.test(text)) violations.push('emoji');
    if (text.length > 350) violations.push('len');  // 4-5문장 = ~250자 평균, 여유 350.
    if (adviceLex.test(text)) violations.push('advice');
    if (violations.length > 0) {
      attempt++;
      if (attempt >= 2) throw new Error('tone verify 실패: ' + violations.join(','));
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
    safe(_rcSource3GodongDiary, 'godongDiary'),
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
// godong 표정 SVG — source 별 mood 매핑.
// pearl=inspired(별눈), newView=surprised(큰 눈), godongDiary=whispering(노트/비밀),
// quiz=thinking(?), quizDone=proud(별3개+자부심), horoscope=dreaming(꿈+🌗 분위기)
// =============================================================================
function _rcGodongSvg(sourceId) {
  const moodMap = {
    pearl: 'inspired',
    newView: 'surprised',
    godongDiary: 'sleepy',
    quiz: 'thinking',
    quizDone: 'proud',
    horoscope: 'dreaming',
  };
  const mood = moodMap[sourceId] || 'default';
  return `<img class="rc-godong-svg godong-mood-${mood}" src="/character/godong-${mood}.svg" alt="" decoding="async" aria-hidden="true">`;
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
