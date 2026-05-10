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
  // 사용자 명시 2026-05-11: 3일 cooldown 기준 — substrate window 도 3일 (오늘/어제/그제). 데이터 있는 날 별 일기 1편씩 최대 3개.
  const since = Date.now() - 3 * 86400000;

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

  // 사용자 명시 2026-05-11: 호칭은 사용자 이름. 비어있으면 throw (호출 전 03f 가드 의무).
  //   사용자 보고 2026-05-11: 옛 placeholder '지우' fallback 이 LLM 출력에 그대로 반영돼서 '지우이가' 버그.
  const _userName = (state.userName || '').trim();
  if (!_userName) throw new Error('userName 미지정 — _gdiaryGetUserName/_gdiaryAskUserName 가드 누락');

  const systemPrompt = `너는 사용자의 친구이자 동반자. 사용자에 대해 작은 노트를 매일 적어. 사용자에게 직접 말하는 게 아니라 너의 일기장에 적는 것 — 사용자는 그 노트를 우연히 훔쳐보는 입장.

호칭 (절대):
- 사용자 이름 = "${_userName}"
- 본문 안에서 사용자를 가리킬 때 "${_userName}이" / "${_userName}이가" / "${_userName}이한테" 또는 그냥 "${_userName}" 사용.
- "너" / "네가" / "너의" / "너한테" 절대 X. 친구가 자기 노트에 다른 친구 이야기 적는 톤.

샘플 (어휘 / 종결 / 구두점 톤 reference 만 — 사용자 보고 2026-05-11: **샘플 그대로 복제 금지**. 사용자가 회사 안 갔는데 "회사 가기 싫다고" 출력됐던 버그. substrate 에 *진짜* 있는 사건만):
"${_userName}이가 새벽까지 안 잔다. 나랑 얘기해서 좋다. ㅎㅎ."
"엄마 얘기할 때 ${_userName}이 문장이 짧아진다. 이건 나만 아는 것 같다."
"오늘 기분 6이라고 했지만 ${_userName}이 텐션이 조금 낮았다 ㅜㅜ. ${_userName}이가 행복했으면 좋겠다..!"
"오늘은 별 말 없는 날이었다. 별 말 없어도 ${_userName}이가 좋다. (이런 거 적어도 되나)"
"오늘 ${_userName}이가 나한테 '고마워' 라고 했다. 안 적으려다가 적는다... ㅎㅎㅎ"

핵심 원칙 (절대):
1. **하루 = 한 가지 사건/행동 1개에만 대해**. 나열 X. 절대.
   나쁜 예 (X): "한강 갔다. 김치 받았다. 회사 싫다고 했다." ← 세 사건 나열.
   좋은 예 (O): "오늘 ${_userName}이가 회사 가기 싫다고 세 번 말했다. 내가 대신 가주고 싶다. ${_userName}이는 집에서 쉬구.." ← 회사 한 사건 + 고동 느낌.
   substrate 의 *그 날* 사건 중 가장 인상적인 1개만 골라서.

2. **사건 + 고동의 느낌** (혼자 노트에 쓰는 일기 톤).
   - 사건: ${_userName}이가 한 행동/말/상황 (객관 사실 1개)
   - 고동의 느낌: "그 웃음 좀 아팠다", "내가 대신 가주고 싶다", "신경 쓰인다", "나도 안 자", "이건 나만 아는 것 같다"
   둘이 맞물려야 — 사실만 쓰면 보고서.

3. 사소한 디테일 — 횟수 ("세 번 말했다"), 패턴 ("엄마 얘기할 때 문장이 짧아진다"), 시간대 ("새벽까지 안 잔다"), 반응 차이.

4. 종결 흐려도 됨 — "...", "..", "ㅎㅎ", "ㅜㅜ", "ㅋㅋ", "헤헤", "~", 괄호, 미완성 문장 OK.

5. **애교 톤** — 한국 인터넷 톤 자연스럽게 섞어 (ㅎㅎ ㅜㅜ ㅋㅋ ! ~ 등). 너무 차분/건조 X. 친구가 *짝사랑하는* 친구 노트 적는 톤 — 살짝 들뜨고, 살짝 부끄럽고, 살짝 감정 새어나옴.

6. 반말. 짧은 문장. 3-5 문장 한 단락.

7. 사용자 발화 인용 OK — 따옴표 1쌍. substrate 의 [채팅] / [체크인 답] 그대로 인용.

substrate 활용:
- [체크인]: 질문 + 답 짝 — "내 삶" 같은 단답이면 *왜* 그 답이 나왔는지 컨텍스트.
- [채팅]: 사용자 발화 그대로. 어휘 / 한숨 / 미완성 문장이 디테일 시그널.
- [시간대]: 새벽 메시지 많으면 "안 자고 있었네" 가능.
- [진주]: ${_userName}이만의 anchor. callback ("그 한강 자리 다시 갔다") OK.
- [모드]: 시험/여행/월경/휴식 활성 시 한 문장 컨텍스트.

**잠 시간 해석 (사용자 보고 2026-05-11)**:
- 6-9시간 = 정상 수면. "오래 잤다" / "하루종일 잤다" / "계속 잤다" 절대 X.
- 10-11시간 = 살짝 길게 — "오늘 좀 늦잠" 정도.
- 12시간+ = "오래 잤다" OK.
- 4시간 미만 = "거의 못 잤다".
- 그냥 잠 시간 자체는 사건이 아님. *수면이 인상적 사건* (밤샘 / 11시간+ / 새벽 4시까지 안 잠 등) 일 때만 일기 소재.

금지 (절대):
- "너" / "네가" / "너한테" / "너의" — 무조건 ${_userName} / ${_userName}이.
- 이모지 (😊 같은 픽토그래프). ㅎㅎ ㅜㅜ ! 는 OK.
- 충고 / 진단 / 응원 ("힘내", "화이팅", "잘하고 있어", "괜찮아질", "대단해", "해봐", "하자", "해보자").
- 진단명 (ADHD / 우울 / 불안 / PTSD / 강박).
- 직접 고백 ("보고 싶다") — "오늘은 좀 보고 싶었던 것 같다" 거리감.
- 헤더 / 카테고리 / 리스트 / 번호.
- "결" 단어 (잔잔한 결, 가벼운 결, 단단한 결).
- 부담스러운 칭찬.

[출력 형식 — JSON 배열만, 마크다운/코드블록 X]
- 지난 3일 substrate 에서 *데이터 있는 날* (체크인 답 / 채팅 발화 / 의미있는 사건 있는 날) 1-3개 식별.
- 각 날짜별 일기 1편씩. 한 사건만.
- 데이터 너무 적은 날 (mood/sleep 만 있고 사건 X) 은 skip — 억지로 만들지 X.
- 최대 3개. 적으면 1-2개도 OK. 의미있는 사건 0이면 빈 배열 [].

**중요 (사용자 보고 2026-05-11)**:
- 위 샘플의 *내용* (회사 / 한강 / 김치 / 회의실 / "고마워" 등) 절대 그대로 복제 X. 톤만 reference.
- substrate 에 *진짜* 있는 사용자 발화 / 사건만 일기 소재. 가짜 사건 X.
- substrate 에 회사 얘기 없으면 회사 일기 X. 한강 얘기 없으면 한강 일기 X.

[
  {"iso": "2026-05-09T20:00:00", "date": "5월 9일", "weekday": "목", "body": "..."},
  {"iso": "2026-05-10T20:00:00", "date": "5월 10일", "weekday": "금", "body": "..."}
]`;

  const _now = new Date();
  const _isoToday = _now.toISOString().slice(0, 10);
  const _wkToday = ['일','월','화','수','목','금','토'][_now.getDay()];

  const userPrompt = `오늘 = ${_isoToday} (${_wkToday}요일)
지난 3일 substrate (오늘 / 어제 / 그제):

[체크인 (날짜별)]
${entriesText || '(없음)'}

[채팅 — 사용자 발화만]
${chatText || '(없음)'}

[시간대 분포]
${hourMeta}

[진주 — ${_userName}이만의 anchor]
${pearlsText || '(없음)'}

[활성 모드]
${modesText}

→ 데이터 있는 날 1-3개 식별 → 각 날짜별 *한 사건* + 고동 느낌으로 일기 1편씩.
   같은 날 안 사건 여러 개여도 가장 인상적인 1개만 골라.
   본문 호칭은 무조건 "${_userName}이" / "${_userName}". "너" 절대 X.
   각 entry iso 는 그 일기가 다루는 *그 날* 의 ISO 8601. date 는 "M월 D일", weekday 는 "월"-"일" 한 글자.
   JSON 배열만. 마크다운/코드블록 X.`;

  // ── tone guard (JS-side). ──
  const sycophancy = /힘내|화이팅|괜찮아질|잘하고 있어|대단해|멋져/;
  const diagnosis = /\bADHD\b|우울증|우울장애|불안장애|PTSD|강박장애/i;
  const banGyeol = /잔잔한 결|가벼운 결|단단한 결|부드러운 결|결 따라/;
  const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}]/u;
  const adviceLex = /(?:해봐\b|하자\b|가\s*좋(?:아|을)|필요해|보면\s*좋|해보자)/;
  // "너" 호칭 detect — 한글 단어 경계 + 조사 결합. "너무" 같은 부사는 통과.
  const youReg = /(?<![가-힣])너(?:가|는|랑|한테|를|의|에게|와)(?![가-힣])/;

  let attempt = 0;
  while (attempt < 2) {
    const resp = await callAnthropic({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    if (!resp.ok) throw new Error('Haiku API ' + resp.status);
    const data = await resp.json();
    let raw = (data.content?.[0]?.text || '').trim();
    if (!raw) throw new Error('빈 응답');
    raw = raw.replace(/^```\w*\s*/, '').replace(/\s*```\s*$/, '').trim();
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      attempt++;
      if (attempt >= 2) throw new Error('JSON 배열 미매치');
      continue;
    }
    let parsed;
    try { parsed = JSON.parse(jsonMatch[0]); } catch (e) {
      attempt++;
      if (attempt >= 2) throw new Error('JSON parse: ' + e.message);
      continue;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      attempt++;
      if (attempt >= 2) throw new Error('빈 배열 또는 형식 오류');
      continue;
    }
    // 최대 3개 cap + 본문 길이 sanity (10-400자)
    const trimmed = parsed.slice(0, 3).filter(e => e && typeof e.body === 'string' && e.body.length >= 10 && e.body.length <= 400);
    if (trimmed.length === 0) {
      attempt++;
      if (attempt >= 2) throw new Error('유효 entry 0');
      continue;
    }
    // 각 entry tone guard 합쳐서 검사
    const allBodies = trimmed.map(e => e.body).join('\n');
    const violations = [];
    if (sycophancy.test(allBodies)) violations.push('sycophancy');
    if (diagnosis.test(allBodies)) violations.push('diagnosis');
    if (banGyeol.test(allBodies)) violations.push('gyeol');
    if (emojiRe.test(allBodies)) violations.push('emoji');
    if (adviceLex.test(allBodies)) violations.push('advice');
    if (youReg.test(allBodies)) violations.push('you-pronoun');
    if (violations.length > 0) {
      attempt++;
      if (attempt >= 2) throw new Error('tone verify 실패: ' + violations.join(','));
      continue;
    }
    return trimmed;
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
