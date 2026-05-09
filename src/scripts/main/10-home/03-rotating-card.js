// 사용자 명시 2026-05-09 (ultrathink): 홈 회전 카드 — '🌟 오늘의 너' 7 source rotating surface.
// spec: home-redesign-2026-05-09.md (본문 4절 + 11절 P0 보완 우선)
// 페인 = "며칠 쓰니 잘 안 들어감, 입력 ≫ 피드백 비대칭, 일상 털어놓을 다리 부족"
// 해법 = 기존 분석 자산을 매일 다른 angle 로 작게 보여주는 회전 카드 (zone 8-9 → 4-6) + chat 다리 footer
// Phase 1 = source 1 (진주) / source 2 (어제 비교) / source 5 (회상). 후속 Phase = 3 / 4 / 6 / 7.

// =============================================================================
// STATE 마이그 (spec 11-6 namespace 보호)
// =============================================================================
function _ensureRotatingCardState() {
  if (!state.rotatingCardState || typeof state.rotatingCardState !== 'object') {
    state.rotatingCardState = {};
  }
  const r = state.rotatingCardState;
  if (!Array.isArray(r.history)) r.history = [];                  // [{sourceId, contentHash, seenAt}] 14일 dedupe
  if (!Array.isArray(r.dismissedSurprises)) r.dismissedSurprises = []; // [milestoneKey] 1번 후 영구 X
  if (typeof r.lastMiniReviewAt === 'undefined') r.lastMiniReviewAt = null;
  if (typeof r.windowStartAt === 'undefined') r.windowStartAt = null;
  if (typeof r.windowSourceId === 'undefined') r.windowSourceId = null;
  if (typeof r.windowContentHash === 'undefined') r.windowContentHash = null;
  if (typeof r.currentIndex === 'undefined') r.currentIndex = 0;
  return r;
}

// =============================================================================
// Score / windowing (spec 4-3 + 11-2)
// =============================================================================
const _RC_WINDOW_MS = 4 * 60 * 60 * 1000;          // 4시간 — 같은 4시간 재진입 시 same source stay
const _RC_DEDUPE_MS = 14 * 24 * 60 * 60 * 1000;    // 14일 — 같은 contentHash 재노출 X

const _RC_BASE_WEIGHTS = {
  miniReview: 100,
  surprise: 90,
  newView: 80,
  insight: 60,
  throwback: 50,
  yesterday: 40,
  pearl: 20,
};

// tie-breaker stable order (id asc, spec 11-2)
const _RC_SOURCE_ORDER = ['insight', 'miniReview', 'newView', 'pearl', 'surprise', 'throwback', 'yesterday'];

function _rcRecordSeen(sourceId, contentHash) {
  const r = _ensureRotatingCardState();
  r.history.push({ sourceId, contentHash, seenAt: new Date().toISOString() });
  if (r.history.length > 200) r.history = r.history.slice(-200);
}

function _rcSeenHashes14d(sourceId) {
  const r = _ensureRotatingCardState();
  const cutoff = Date.now() - _RC_DEDUPE_MS;
  const set = new Set();
  for (const h of r.history) {
    if (h.sourceId !== sourceId) continue;
    const t = h.seenAt ? new Date(h.seenAt).getTime() : 0;
    if (t > cutoff) set.add(h.contentHash);
  }
  return set;
}

function _rcFreshnessPenalty(sourceId) {
  const r = _ensureRotatingCardState();
  const cutoff = Date.now() - _RC_WINDOW_MS;
  for (const h of r.history) {
    if (h.sourceId !== sourceId) continue;
    const t = h.seenAt ? new Date(h.seenAt).getTime() : 0;
    if (t > cutoff) return -10;
  }
  return 0;
}

function _rcIsoWeekStartMs() {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // 월=0, 일=6
  const ws = new Date(now);
  ws.setDate(ws.getDate() - dow);
  ws.setHours(4, 0, 0, 0);
  if (now.getTime() < ws.getTime()) ws.setDate(ws.getDate() - 7);
  return ws.getTime();
}

function _rcVarietyBonus(sourceId) {
  const r = _ensureRotatingCardState();
  const wkStart = _rcIsoWeekStartMs();
  const counts = {};
  for (const h of r.history) {
    const t = h.seenAt ? new Date(h.seenAt).getTime() : 0;
    if (t < wkStart) continue;
    counts[h.sourceId] = (counts[h.sourceId] || 0) + 1;
  }
  const cur = counts[sourceId] || 0;
  const allSeen = Object.values(counts);
  const minSeen = allSeen.length === 0 ? 0 : Math.min(...allSeen);
  return cur === minSeen ? 10 : 0;
}

function _rcScore(sourceId) {
  const base = _RC_BASE_WEIGHTS[sourceId] || 0;
  const fresh = _rcFreshnessPenalty(sourceId);
  const variety = _rcVarietyBonus(sourceId);
  return { total: base + fresh + variety, base, fresh, variety };
}

// =============================================================================
// 4시간 windowing — 같은 4시간 안 같은 source + 같은 contentHash stay (친구 카톡 비유, spec 11-2)
// =============================================================================
function _rcWindowedSource() {
  const r = _ensureRotatingCardState();
  if (!r.windowStartAt || !r.windowSourceId) return null;
  const elapsed = Date.now() - new Date(r.windowStartAt).getTime();
  if (elapsed > _RC_WINDOW_MS) return null;
  return { id: r.windowSourceId, contentHash: r.windowContentHash };
}

function _rcSetWindow(sourceId, contentHash) {
  const r = _ensureRotatingCardState();
  r.windowStartAt = new Date().toISOString();
  r.windowSourceId = sourceId;
  r.windowContentHash = contentHash || null;
}

// =============================================================================
// Helpers — 어제 비교 numeric
// =============================================================================
function _rcAvg(arr) {
  if (!arr || arr.length === 0) return null;
  const sum = arr.reduce((a, b) => a + b, 0);
  return sum / arr.length;
}

function _rcSleepHm(hours) {
  if (hours == null) return '';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}시간`;
  if (m === 30) return `${h}시간 반`;
  return `${h}시간 ${m}분`;
}

function _rcPickRandom(arr) {
  if (!arr || arr.length === 0) return '';
  return arr[Math.floor(Math.random() * arr.length)];
}

// =============================================================================
// crisis keyword filter (spec 11-4 회상 source 5 anti-trigger 가드)
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
  for (const kw of _RC_CRISIS_KEYWORDS) {
    if (s.includes(kw)) return true;
  }
  return false;
}

// =============================================================================
// Source 1 — 진주 (default fallback)
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
      placeholder: '첫 진주에 대해...',
    };
  }
  if (typeof _heroCardHtml !== 'function') return { id: 'pearl', available: false };

  // 4시간 windowing 안 같은 진주 stay — windowContentHash 가 'pearl_<id>' 면 그 진주 lookup
  const windowed = _rcWindowedSource();
  let pick = null;
  if (windowed && windowed.id === 'pearl' && windowed.contentHash) {
    const m = String(windowed.contentHash).match(/^pearl_(.+)$/);
    if (m) pick = pearls.find(p => p.id === m[1]) || null;
  }
  if (!pick && typeof _pickHeroPearl === 'function') {
    pick = _pickHeroPearl();
  }
  if (!pick) return { id: 'pearl', available: false };
  return {
    id: 'pearl',
    available: true,
    contentHash: 'pearl_' + (pick.id || ''),
    bodyHtml: _heroCardHtml(pick, { linkTo: 'pearls-tab' }),
    placeholder: '이 진주에 대해...',
    pick,
  };
}

// =============================================================================
// Source 2 — 어제 비교
// =============================================================================
function _rcSource2Yesterday() {
  if (typeof todayKey !== 'function' || typeof _shiftDateKey !== 'function') {
    return { id: 'yesterday', available: false };
  }
  const yKey = _shiftDateKey(todayKey(), -1);
  const entries = state.entries || [];
  const yEntry = entries.find(e => e.date === yKey);
  if (!yEntry) return { id: 'yesterday', available: false };

  const cutoff = _shiftDateKey(yKey, -14);
  const recent = entries.filter(e => e.date < yKey && e.date >= cutoff);
  if (recent.length < 3) return { id: 'yesterday', available: false };

  const candidates = [];

  // 잠
  if (yEntry.sleep != null) {
    const recentSleeps = recent.map(e => e.sleep).filter(v => v != null);
    if (recentSleeps.length >= 3) {
      const avg = _rcAvg(recentSleeps);
      const delta = yEntry.sleep - avg;
      if (Math.abs(delta) >= 1) {
        const yh = _rcSleepHm(yEntry.sleep);
        const ah = _rcSleepHm(avg);
        const copy = delta < 0
          ? _rcPickRandom([
              `어제 ${yh}밖에 못 잤네. 너 보통 ${ah}쯤 자거든.`,
              `어 너 어제 잠 진짜 짧았더라.`,
              `${yh}... 어제 좀 무리했어?`,
              `어제 잠 막대 한 시간쯤 잘렸어.`,
            ])
          : _rcPickRandom([
              `어제 ${yh} 잤네. 평소 ${ah}쯤이거든.`,
              `어제 좀 더 잤더라.`,
              `${yh}... 어제 푹 쉬었네.`,
            ]);
        candidates.push({ kind: 'sleep', delta, absDelta: Math.abs(delta), copy, y: yEntry.sleep, avg });
      }
    }
  }

  // 활력
  if (yEntry.vitality != null) {
    const recentVit = recent.map(e => e.vitality).filter(v => v != null);
    if (recentVit.length >= 3) {
      const avg = _rcAvg(recentVit);
      const delta = yEntry.vitality - avg;
      if (Math.abs(delta) >= 1) {
        const copy = delta < 0
          ? _rcPickRandom([
              `어제 활력 좀 처졌더라.`,
              `어 너 어제 살짝 가라앉아 있었어.`,
              `어제 평소보다 좀 비어 있더라.`,
            ])
          : _rcPickRandom([
              `어제 활력 평소보다 좋았더라.`,
              `어 너 어제 좀 채워져 있었네.`,
            ]);
        candidates.push({ kind: 'vitality', delta, absDelta: Math.abs(delta), copy, y: yEntry.vitality, avg });
      }
    }
  }

  // 기분
  if (yEntry.mood != null) {
    const recentMood = recent.map(e => e.mood).filter(v => v != null);
    if (recentMood.length >= 3) {
      const avg = _rcAvg(recentMood);
      const delta = yEntry.mood - avg;
      if (Math.abs(delta) >= 1) {
        const copy = delta < 0
          ? _rcPickRandom([
              `어제 기분 좀 가라앉았네.`,
              `어 너 어제 마음 좀 무거웠더라.`,
            ])
          : _rcPickRandom([
              `어제 기분 평소보다 가벼웠더라.`,
              `어 어제 좀 좋았네.`,
            ]);
        candidates.push({ kind: 'mood', delta, absDelta: Math.abs(delta), copy, y: yEntry.mood, avg });
      }
    }
  }

  if (candidates.length === 0) return { id: 'yesterday', available: false };

  // P1-1 부정 일변도 cooldown — 같은 부정 패턴이 최근 3일 안 노출됐으면 skip 가산점
  const r = _ensureRotatingCardState();
  const negativeRecent = r.history.filter(h => {
    if (h.sourceId !== 'yesterday') return false;
    const t = h.seenAt ? new Date(h.seenAt).getTime() : 0;
    return t > Date.now() - 3 * 86400000 && /__neg$/.test(h.contentHash || '');
  }).length;

  // sort by abs delta desc, but penalize negative if recently shown
  candidates.sort((a, b) => {
    const aPenalty = (a.delta < 0 && negativeRecent >= 2) ? 0.5 : 0;
    const bPenalty = (b.delta < 0 && negativeRecent >= 2) ? 0.5 : 0;
    return (b.absDelta - bPenalty) - (a.absDelta - aPenalty);
  });
  const top = candidates[0];

  // mini visual — 잠 막대 또는 점 비교
  let visual = '';
  if (top.kind === 'sleep') {
    const yPct = Math.min(100, Math.max(0, (top.y / 9) * 100));
    const aPct = Math.min(100, Math.max(0, (top.avg / 9) * 100));
    visual = `
      <div class="rc-y-bars">
        <div class="rc-y-row"><span class="rc-y-label">어제</span><div class="rc-y-track"><div class="rc-y-fill" style="width:${yPct.toFixed(0)}%;"></div></div></div>
        <div class="rc-y-row"><span class="rc-y-label">평소</span><div class="rc-y-track"><div class="rc-y-fill rc-y-fill--avg" style="width:${aPct.toFixed(0)}%;"></div></div></div>
      </div>
    `;
  } else if (top.kind === 'vitality' || top.kind === 'mood') {
    const max = 5;
    const dot = (n) => Array.from({ length: max }, (_, i) => `<span class="rc-dot ${i < n ? 'is-on' : ''}"></span>`).join('');
    visual = `
      <div class="rc-y-dots-rows">
        <div class="rc-y-dots-row"><span class="rc-y-label">어제</span><span class="rc-y-dots">${dot(Math.round(top.y))}</span></div>
        <div class="rc-y-dots-row"><span class="rc-y-label">평소</span><span class="rc-y-dots rc-y-dots--avg">${dot(Math.round(top.avg))}</span></div>
      </div>
    `;
  }

  const negTag = top.delta < 0 ? '__neg' : '__pos';
  const bodyHtml = `
    <div class="rc-body-yesterday">
      <div class="rc-body-headline">어제</div>
      <div class="rc-body-copy">${escapeHtml(top.copy)}</div>
      ${visual}
    </div>
  `;
  return {
    id: 'yesterday',
    available: true,
    contentHash: 'yesterday_' + yKey + '_' + top.kind + negTag,
    bodyHtml,
    onTapClick: `enterCheckin()`,
    placeholder: '어제...',
  };
}

// =============================================================================
// Source 5 — 회상 (1년 / 3개월 / 6개월 / 3주 / 12주)
// =============================================================================
function _rcShiftDateKeyMonths(key, deltaMonths) {
  if (!key) return null;
  const d = new Date(key + 'T00:00:00');
  const orig = d.getDate();
  d.setMonth(d.getMonth() + deltaMonths);
  // 윤년 / 30일 month fallback (spec 11-4: "월/일 재검증")
  if (d.getDate() !== orig) d.setDate(0);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function _rcShiftDateKeyYears(key, deltaYears) {
  if (!key) return null;
  const d = new Date(key + 'T00:00:00');
  const origMonth = d.getMonth();
  const origDate = d.getDate();
  d.setFullYear(d.getFullYear() + deltaYears);
  // 2/29 → 2/28 fallback
  if (d.getMonth() !== origMonth) d.setDate(0);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function _rcThrowbackEntryFor(targetKey) {
  if (!targetKey) return null;
  const entries = state.entries || [];
  const entry = entries.find(e => e.date === targetKey);
  if (!entry) return null;
  // mood ≥ 3 우선 (spec 11-4 score -20 — 1 mood 회피)
  if (entry.mood != null && entry.mood <= 1) return null;
  // crisis keyword 검사 (spec 11-4)
  const text = [entry.note, entry.diary].filter(Boolean).join(' ');
  if (_rcHasCrisis(text)) return null;
  return entry;
}

function _rcThrowbackArchiveFor(targetKey) {
  if (!targetKey) return null;
  const archive = state.chatArchive || [];
  const a = archive.find(c => c.date === targetKey);
  if (!a) return null;
  const text = (a.summary || '') + ' ' + (a.headline || '');
  if (_rcHasCrisis(text)) return null;
  return a;
}

function _rcSource5Throwback() {
  if (typeof todayKey !== 'function') return { id: 'throwback', available: false };
  const tKey = todayKey();

  // 우선순위: 1년 → 3개월 → 6개월 → 3주 → 12주
  const candidates = [
    { label: '1년 전 오늘', key: _rcShiftDateKeyYears(tKey, -1) },
    { label: '3개월 전 오늘', key: _rcShiftDateKeyMonths(tKey, -3) },
    { label: '6개월 전 오늘', key: _rcShiftDateKeyMonths(tKey, -6) },
    { label: '3주 전 오늘', key: _shiftDateKey ? _shiftDateKey(tKey, -21) : null },
    { label: '12주 전 오늘', key: _shiftDateKey ? _shiftDateKey(tKey, -84) : null },
  ];

  for (const c of candidates) {
    if (!c.key) continue;
    // entry note / diary 우선
    const entry = _rcThrowbackEntryFor(c.key);
    if (entry) {
      const noteText = entry.note || entry.diary || '';
      if (!noteText || noteText.length < 2) continue;
      const snippet = noteText.length > 80 ? noteText.slice(0, 80) + '…' : noteText;
      const intro = _rcPickRandom([
        `이거 ${c.label} 너가 쓴 거`,
        `${c.label} 너 — 한 줄`,
        `어 이거 ${c.label} 너 한 줄`,
      ]);
      const bodyHtml = `
        <div class="rc-body-throwback">
          <div class="rc-body-headline">${escapeHtml(c.label)}</div>
          <div class="rc-body-quote">"${escapeHtml(snippet)}"</div>
          <div class="rc-body-quote-by">— ${escapeHtml(intro)}</div>
        </div>
      `;
      return {
        id: 'throwback',
        available: true,
        contentHash: 'throwback_' + c.key + '_entry',
        bodyHtml,
        onTapClick: `if(typeof openDayModal==='function'){openDayModal('${c.key}');}else{showScreen('archive');}`,
        placeholder: c.label + ' 이 한 줄...',
      };
    }
    // chatArchive 다음 후보
    const archived = _rcThrowbackArchiveFor(c.key);
    if (archived) {
      const headline = archived.headline || archived.summary || '';
      if (!headline || headline.length < 2) continue;
      const snippet = headline.length > 80 ? headline.slice(0, 80) + '…' : headline;
      const bodyHtml = `
        <div class="rc-body-throwback">
          <div class="rc-body-headline">${escapeHtml(c.label)}</div>
          <div class="rc-body-quote">"${escapeHtml(snippet)}"</div>
          <div class="rc-body-quote-by">— 그날 대화 한 줄</div>
        </div>
      `;
      return {
        id: 'throwback',
        available: true,
        contentHash: 'throwback_' + c.key + '_chat',
        bodyHtml,
        onTapClick: `if(typeof openDayModal==='function'){openDayModal('${c.key}');}else{showScreen('archive');}`,
        placeholder: c.label + ' 대화...',
      };
    }
  }
  return { id: 'throwback', available: false };
}

// =============================================================================
// Source 3, 4, 6, 7 — 후속 phase placeholder
// =============================================================================
function _rcSource3NewView() { return { id: 'newView', available: false }; }
function _rcSource4MiniReview() { return { id: 'miniReview', available: false }; }
function _rcSource6Insight() { return { id: 'insight', available: false }; }
function _rcSource7Surprise() { return { id: 'surprise', available: false }; }

// =============================================================================
// 가용 source 수집 + score 정렬 + 14일 dedupe
// =============================================================================
function _rcCollectAvailable() {
  const all = [
    _rcSource1Pearl(),
    _rcSource2Yesterday(),
    _rcSource3NewView(),
    _rcSource4MiniReview(),
    _rcSource5Throwback(),
    _rcSource6Insight(),
    _rcSource7Surprise(),
  ];
  return all.filter(s => s && s.available);
}

function _rcSortByScore(sources) {
  const enriched = sources.map(s => {
    const seen = _rcSeenHashes14d(s.id);
    const isDup = s.contentHash && seen.has(s.contentHash);
    const sc = _rcScore(s.id);
    return {
      src: s,
      score: sc.total - (isDup ? 100 : 0), // 14일 내 같은 hash → 사실상 비활성
      sc,
      isDup,
    };
  });
  enriched.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // tie-breaker: source id asc
    const ai = _RC_SOURCE_ORDER.indexOf(a.src.id);
    const bi = _RC_SOURCE_ORDER.indexOf(b.src.id);
    return ai - bi;
  });
  return enriched;
}

// =============================================================================
// 렌더 — 메인
// =============================================================================
function renderRotatingCard() {
  const container = document.getElementById('rotatingCardContainer');
  if (!container) return;

  // 튜토리얼 모드 시 진주 source 1 강제 (LNGSHOT - Vanilla Days fixed)
  if (window._onbTutorialMode) {
    const s = _rcSource1Pearl();
    container.innerHTML = _rcRenderShell([s], 0);
    _rcAttachListeners(container);
    return;
  }

  const sources = _rcCollectAvailable();
  if (sources.length === 0) {
    // empty fallback — 첫 진주 CTA 단독
    const s = _rcSource1Pearl();
    container.innerHTML = _rcRenderShell([s], 0);
    _rcAttachListeners(container);
    return;
  }

  const ranked = _rcSortByScore(sources);

  // 4시간 windowing — 같은 4시간 안 같은 source + 같은 contentHash stay (spec 11-2)
  const windowed = _rcWindowedSource();
  let pickIdx = 0;
  if (windowed) {
    const idx = ranked.findIndex(r => r.src.id === windowed.id);
    if (idx >= 0) pickIdx = idx;
  }

  const orderedSources = ranked.map(r => r.src);
  const firstSrc = orderedSources[pickIdx];
  if (!windowed || !firstSrc || firstSrc.id !== windowed.id) {
    // 새 4시간 window 시작 (또는 windowed source 가 더 이상 가용 X 케이스)
    if (firstSrc) _rcSetWindow(firstSrc.id, firstSrc.contentHash);
  }
  if (firstSrc && firstSrc.contentHash) _rcRecordSeen(firstSrc.id, firstSrc.contentHash);
  if (typeof saveState === 'function') saveState();

  container.innerHTML = _rcRenderShell(orderedSources, pickIdx);
  _rcAttachListeners(container);
}

// =============================================================================
// Shell HTML — wrapper + indicator + chat 다리 footer
// =============================================================================
function _rcRenderShell(orderedSources, currentIdx) {
  if (!orderedSources || orderedSources.length === 0) return '';
  const cur = orderedSources[currentIdx] || orderedSources[0];
  const total = orderedSources.length;
  const pearlCount = (state.pearls || []).filter(p => p && p.type !== 'dna_pearl').length;
  const indicator = orderedSources.map((s, i) =>
    `<span class="rc-dot-i ${i === currentIdx ? 'is-active' : ''}"></span>`
  ).join('');
  const tapHandler = cur.onTapClick ? ` onclick="${cur.onTapClick}"` : '';
  const placeholder = cur.placeholder || '한 마디 적어볼까...';
  const debugLine = (state.preferences && state.preferences.testerMode)
    ? `<div class="rc-debug">${escapeHtml(cur.id)} · idx ${currentIdx + 1}/${total}</div>` : '';

  return `
    <div class="rotating-card" id="rotatingCard" data-current-idx="${currentIdx}" data-total="${total}">
      <div class="rc-top-row">
        <span class="rc-label-main">🌟 오늘의 너</span>
        <span class="rc-pearl-count">🐚 ${pearlCount}</span>
        <span class="rc-indicator">${indicator}</span>
      </div>
      <div class="rc-body-tap"${tapHandler}>
        ${cur.bodyHtml || ''}
      </div>
      ${debugLine}
      <div class="rc-footer">
        <button class="rc-chat-bridge" type="button" onclick="event.stopPropagation(); rcOpenChatBridge('${escapeHtml(cur.id)}', '${escapeHtml(placeholder)}')">
          🐚 한 마디 <span class="rc-chat-arrow">↗</span>
        </button>
      </div>
    </div>
  `;
}

// =============================================================================
// Swipe gesture (spec 11-1 가드 detail — Pointer Events + 30px lock + preventDefault)
// =============================================================================
function _rcAttachListeners(container) {
  const card = container.querySelector('.rotating-card');
  if (!card) return;
  const total = parseInt(card.dataset.total || '1', 10);
  if (total < 2) return; // 가용 source 1개 시 swipe 비활성

  let startX = null, startY = null, locked = null, hostId = null;
  const SWIPE_THRESHOLD = 50; // 30px lock 후 50px 이상 시 다음 source

  const onDown = (e) => {
    startX = e.clientX;
    startY = e.clientY;
    locked = null;
    hostId = e.pointerId;
    try { card.setPointerCapture(e.pointerId); } catch {}
  };
  const onMove = (e) => {
    if (startX == null || startY == null) return;
    if (e.pointerId !== hostId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (locked == null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return; // dead zone
      // 가로 우세면 기본 (페이지 가로 X), 세로 우세면 우리가 잡음
      locked = Math.abs(dy) > Math.abs(dx) ? 'v' : 'h';
    }
    if (locked === 'v') {
      // 세로 swipe — 페이지 스크롤 막고 우리 핸들러
      try { e.preventDefault(); } catch {}
      // 카드 살짝 따라옴 (~max 30px)
      const t = Math.max(-30, Math.min(30, dy));
      card.style.transform = `translateY(${t}px)`;
      card.style.opacity = String(Math.max(0.5, 1 - Math.abs(dy) / 200));
    }
  };
  const onUp = (e) => {
    if (e.pointerId !== hostId) return;
    if (startY != null && locked === 'v') {
      const dy = e.clientY - startY;
      card.style.transform = '';
      card.style.opacity = '';
      if (Math.abs(dy) >= SWIPE_THRESHOLD) {
        const dir = dy > 0 ? -1 : 1; // 위로 밀면 다음 (idx+1)
        _rcCycle(dir);
      }
    }
    startX = startY = null; locked = null; hostId = null;
    try { card.releasePointerCapture(e.pointerId); } catch {}
  };

  card.addEventListener('pointerdown', onDown);
  card.addEventListener('pointermove', onMove, { passive: false });
  card.addEventListener('pointerup', onUp);
  card.addEventListener('pointercancel', onUp);
}

function _rcCycle(dir) {
  const card = document.getElementById('rotatingCard');
  if (!card) return;
  const total = parseInt(card.dataset.total || '1', 10);
  const cur = parseInt(card.dataset.currentIdx || '0', 10);
  if (total < 2) return;
  let next = (cur + dir + total) % total;
  // window source id 갱신 — swipe 로 바뀌면 windowed 도 새로
  const sources = _rcCollectAvailable();
  if (sources.length === 0) return;
  const ranked = _rcSortByScore(sources);
  const orderedSources = ranked.map(r => r.src);
  if (next < 0 || next >= orderedSources.length) next = 0;
  const newSrc = orderedSources[next];
  if (newSrc && newSrc.contentHash) _rcRecordSeen(newSrc.id, newSrc.contentHash);
  if (newSrc) _rcSetWindow(newSrc.id, newSrc.contentHash);
  if (typeof saveState === 'function') saveState();
  const container = document.getElementById('rotatingCardContainer');
  if (container) {
    container.innerHTML = _rcRenderShell(orderedSources, next);
    _rcAttachListeners(container);
  }
}

// =============================================================================
// Chat 다리 footer (spec 11-5 페인 1번 직접 해결)
// =============================================================================
const _RC_PLACEHOLDERS = {
  pearl: '이 진주에 대해...',
  yesterday: '어제...',
  newView: '이게 맞는 거 같아? 아니면...',
  miniReview: '이 3일...',
  throwback: '1년 전 이 한 줄...',
  insight: '이번 주...',
  surprise: '...',
};

function rcOpenChatBridge(sourceId, customPlaceholder) {
  const placeholder = customPlaceholder || _RC_PLACEHOLDERS[sourceId] || '오늘 어땠어...';
  if (typeof showScreen === 'function') showScreen('chat');
  setTimeout(() => {
    const ta = document.getElementById('chatInput');
    if (ta) {
      ta.placeholder = placeholder;
      try { ta.focus({ preventScroll: false }); } catch { ta.focus(); }
    }
  }, 80);
}
