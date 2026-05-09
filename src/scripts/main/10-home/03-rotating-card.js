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
  // 사용자 명시 2026-05-09 (Phase 2 source 7): surprise 1번 표시 후 영구 dismiss (spec 4-5).
  if (sourceId === 'surprise' && contentHash && /^surprise_/.test(contentHash)) {
    const milestoneKey = contentHash.replace(/^surprise_/, '');
    if (!Array.isArray(r.dismissedSurprises)) r.dismissedSurprises = [];
    if (!r.dismissedSurprises.includes(milestoneKey)) r.dismissedSurprises.push(milestoneKey);
  }
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

  if (candidates.length === 0) {
    // 비교 데이터 부족 — note / 단순 어제 회고 fallback (사용자 명시 2026-05-09)
    return _rcSource2YesterdaySimple();
  }

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

// Source 2 fallback — numeric 비교 부족 (recent < 3) 또는 metric 비교 candidate 0 케이스.
// 어제 entry 자체는 있으면 단순 회고 한 줄 + note 인용으로 가용 처리. 사용자 명시 2026-05-09 (회전 안 됨 fix).
function _rcSource2YesterdaySimple() {
  if (typeof todayKey !== 'function' || typeof _shiftDateKey !== 'function') {
    return { id: 'yesterday', available: false };
  }
  const yKey = _shiftDateKey(todayKey(), -1);
  const entries = state.entries || [];
  const yEntry = entries.find(e => e.date === yKey);
  if (!yEntry) return { id: 'yesterday', available: false };
  const noteText = yEntry.note || yEntry.diary || '';
  const hasNumeric = (yEntry.vitality != null) || (yEntry.mood != null) || (yEntry.sleep != null);
  if (!noteText && !hasNumeric) return { id: 'yesterday', available: false };
  // crisis keyword skip — anti-trigger
  if (_rcHasCrisis(noteText)) return { id: 'yesterday', available: false };

  let copy;
  if (noteText && noteText.length >= 4) {
    const snippet = noteText.length > 50 ? noteText.slice(0, 50) + '…' : noteText;
    copy = _rcPickRandom([
      `어제 너 — "${snippet}"`,
      `어제 적어둔 한 줄 — "${snippet}"`,
      `"${snippet}" — 어제 너 한 줄`,
    ]);
  } else {
    copy = _rcPickRandom([
      '어제 한 번 들렀더라.',
      '어 어제 흔적 남겼네.',
      '어제 짧게라도 기록해뒀어.',
    ]);
  }
  const bodyHtml = `
    <div class="rc-body-yesterday">
      <div class="rc-body-headline">어제</div>
      <div class="rc-body-copy">${escapeHtml(copy)}</div>
    </div>
  `;
  return {
    id: 'yesterday',
    available: true,
    contentHash: 'yesterday_' + yKey + '_fallback',
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
          <div class="rc-body-quote">${escapeHtml(snippet)}</div>
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
          <div class="rc-body-quote">${escapeHtml(snippet)}</div>
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

  // 사용자 명시 2026-05-09: 시간 매칭 X 시 옛 진주 fallback (가용성 ↑).
  // ≥ 30일 전 진주 중 note/content 있고 crisis X 인 것. 회상 의미 유지.
  const _now = Date.now();
  const _30dAgo = _now - 30 * 86400000;
  const _oldPearls = (state.pearls || [])
    .filter(p => {
      if (!p || p.type === 'dna_pearl') return false;
      if (!p.createdAt) return false;
      const t = new Date(p.createdAt).getTime();
      if (!t || t > _30dAgo) return false;
      const text = (p.content || '') + ' ' + (p.note || '');
      if (!text.trim() || text.trim().length < 3) return false;
      if (_rcHasCrisis(text)) return false;
      return true;
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  if (_oldPearls.length > 0) {
    // 가장 오래된 + (랜덤 변동) — 매번 같은 진주 X 위해 random pick
    const pick = _oldPearls[Math.floor(Math.random() * Math.min(3, _oldPearls.length))];
    const days = Math.floor((_now - new Date(pick.createdAt).getTime()) / 86400000);
    const dayLabel = days >= 365 ? `${Math.floor(days / 365)}년 전` : days >= 30 ? `${Math.floor(days / 30)}달 전` : `${days}일 전`;
    const text = pick.content || pick.note || '';
    const snippet = text.length > 80 ? text.slice(0, 80) + '…' : text;
    const bodyHtml = `
      <div class="rc-body-throwback">
        <div class="rc-body-headline">${escapeHtml(dayLabel)} 진주</div>
        <div class="rc-body-quote">${escapeHtml(snippet)}</div>
        <div class="rc-body-quote-by">— ${escapeHtml(pick.category || '진주')}</div>
      </div>
    `;
    return {
      id: 'throwback',
      available: true,
      contentHash: 'throwback_pearl_' + pick.id,
      bodyHtml,
      onTapClick: `if(typeof openPearl==='function'){openPearl('${pick.id}');}else{showScreen('archive'); if(typeof switchLibraryCat==='function') switchLibraryCat('pearls');}`,
      placeholder: dayLabel + ' 이 진주...',
    };
  }

  return { id: 'throwback', available: false };
}

// =============================================================================
// Source 3 — 새로 본 너 (분석 결과 새 항목 detect, Phase 2)
// =============================================================================
// state.rotatingCardState.newAnalysisItems = 30-force-analyze.js 분석 시 stash.
// 14일 안 만료, 가장 최근 1개 pick.
function _rcSource3NewView() {
  const r = _ensureRotatingCardState();
  const items = (r.newAnalysisItems || []).slice();
  if (items.length === 0) return { id: 'newView', available: false };
  const cutoff = Date.now() - 14 * 86400000;
  const fresh = items.filter(it => it.detectedAt && new Date(it.detectedAt).getTime() > cutoff);
  if (fresh.length === 0) return { id: 'newView', available: false };
  fresh.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
  const pick = fresh[0];
  if (!pick.name) return { id: 'newView', available: false };

  const kindLabel = { trait: '결', value: '가치', pattern: '패턴' }[pick.kind] || '소식';
  const intro = _rcPickRandom([
    `있잖아, 너 ${kindLabel} 하나 새로 발견됐어`,
    `어 너 새 ${kindLabel} 하나 있는 거 알아?`,
    `잠깐 — 너 새 ${kindLabel}`,
  ]);
  const desc = pick.description || '';
  const descTrim = desc.length > 90 ? desc.slice(0, 90) + '…' : desc;
  const bodyHtml = `
    <div class="rc-body-newview">
      <div class="rc-body-headline">${escapeHtml(intro)}</div>
      <div class="rc-body-newview-name">${escapeHtml(pick.name)}</div>
      ${descTrim ? `<div class="rc-body-newview-desc">${escapeHtml(descTrim)}</div>` : ''}
    </div>
  `;
  return {
    id: 'newView',
    available: true,
    contentHash: 'newView_' + pick.id,
    bodyHtml,
    onTapClick: `showScreen('model')`,
    placeholder: '이거...',
    pick,
  };
}

// =============================================================================
// Source 4 — 미니 리뷰 (Haiku, Phase 3)
// =============================================================================
// 가용 조건 (spec 4-2):
//   (마지막 미니 리뷰 ≥3일) AND (체크인 ≥2 OR chat turn ≥8 OR 미션 ≥1)
//   _canAI() 통과 (apiKey or session)
// 탭 시 → openMiniReviewModal() — Haiku 1턴 호출 + tone verify (spec 11-7)
function _rcSource4MiniReview() {
  if (typeof _canAI !== 'function' || !_canAI()) return { id: 'miniReview', available: false };
  const r = _ensureRotatingCardState();
  const lastMini = r.lastMiniReviewAt ? new Date(r.lastMiniReviewAt).getTime() : 0;
  const cooldownMs = 3 * 86400000;
  if (lastMini > 0 && Date.now() - lastMini < cooldownMs) return { id: 'miniReview', available: false };

  // 가용 조건 — 지난 3일 활동
  const since = Date.now() - cooldownMs;
  const recentCheckins = (state.entries || []).filter(e => {
    const t = e.date ? new Date(e.date + 'T00:00:00').getTime() : 0;
    return t > since;
  }).length;
  const recentChats = (state.chatMessages || []).filter(m => {
    const t = m.timestamp ? new Date(m.timestamp).getTime() : 0;
    return t > since;
  }).length;
  const recentMissions = (state.missions || []).filter(m => {
    const t = m.completedAt ? new Date(m.completedAt).getTime() : 0;
    return t > since && m.status === 'completed';
  }).length;

  if (recentCheckins < 2 && recentChats < 8 && recentMissions < 1) {
    return { id: 'miniReview', available: false };
  }

  const copy = _rcPickRandom([
    '지난 3일 어땠어? 짧게 한 번 짚어볼까.',
    '이 3일 — 같이 한 번 보자.',
    '며칠 모아둔 거 한 번 봐볼까?',
    '지나간 며칠, 짧게 정리해줄까?',
  ]);

  const bodyHtml = `
    <div class="rc-body-mini-review">
      <div class="rc-body-headline">지난 3일</div>
      <div class="rc-body-copy">${escapeHtml(copy)}</div>
      <div class="rc-body-mini-cta">탭 → 같이 정리 ✦</div>
    </div>
  `;
  return {
    id: 'miniReview',
    available: true,
    contentHash: 'miniReview_' + Math.floor(Date.now() / cooldownMs),
    bodyHtml,
    onTapClick: `openMiniReviewModal()`,
    placeholder: '이 3일...',
  };
}

// =============================================================================
// 미니 리뷰 모달 + Haiku 호출 + tone verify
// =============================================================================
async function openMiniReviewModal() {
  const existing = document.getElementById('rcMiniReviewModal');
  if (existing) return; // 중복 차단

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
    // lastMiniReviewAt 갱신 (cooldown 시작)
    const r = _ensureRotatingCardState();
    r.lastMiniReviewAt = new Date().toISOString();
    // 사용자 명시 2026-05-09 (P1-4): 미니 리뷰 결과 archive — state.miniReviews push.
    if (!Array.isArray(state.miniReviews)) state.miniReviews = [];
    state.miniReviews.unshift({
      id: 'mr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      content: text,
      generatedAt: new Date().toISOString(),
      source: 'haiku-3day',
    });
    if (typeof saveState === 'function') saveState();
  } catch (e) {
    console.warn('[mini-review]', e);
    const bodyEl = document.getElementById('rcMiniReviewBody');
    if (bodyEl) {
      bodyEl.innerHTML = `
        <div class="rc-mini-review-error">지금은 못 정리하겠어. 다음에 다시 시도.</div>
        <button class="rc-mini-review-dismiss" type="button" onclick="closeMiniReviewModal()">닫기</button>
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

async function _callMiniReviewHaiku() {
  if (typeof callAnthropic !== 'function') throw new Error('callAnthropic 미정의');
  const cooldownMs = 3 * 86400000;
  const since = Date.now() - cooldownMs;

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
- 부담스러운 칭찬 X.`;

  const userPrompt = `지난 3일 데이터:

[체크인]
${entriesText || '(없음)'}

[대화 발췌]
${chatText || '(없음)'}

[아카이브 헤드라인]
${archiveText || '(없음)'}

→ 한 단락 (3-4문장) 으로 정리해줘.`;

  // tone verify keyword (spec 11-7)
  const sycophancy = /힘내|화이팅|괜찮아질|잘하고 있어|대단해/;
  const diagnosis = /\bADHD\b|우울증|우울장애|불안장애|PTSD|강박장애/i;

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

    if (sycophancy.test(text) || diagnosis.test(text)) {
      attempt++;
      if (attempt >= 2) throw new Error('tone verify 실패');
      continue;
    }
    return text;
  }
  throw new Error('attempts exceeded');
}

// =============================================================================
// Source 6 — 통찰 한 줄 (지난 7일 vs 이전 7일, Phase 2 V1 hardcoded keyword)
// =============================================================================
const _RC_INSIGHT_KEYWORDS = ['ㅠ', '안 돼', '안돼', '몰라', '힘들', '괜찮', '진짜', '너무', '좋아'];

function _rcSource6Insight() {
  if (typeof todayKey !== 'function' || typeof _shiftDateKey !== 'function') {
    return { id: 'insight', available: false };
  }
  const tKey = todayKey();
  const wkAStart = _shiftDateKey(tKey, -7);   // 지난 7일 시작 (오늘 제외)
  const wkBStart = _shiftDateKey(tKey, -14);  // 이전 7일 시작
  const entriesArr = state.entries || [];
  const wkA = entriesArr.filter(e => e.date && e.date >= wkAStart && e.date < tKey);
  const wkB = entriesArr.filter(e => e.date && e.date >= wkBStart && e.date < wkAStart);
  if (wkA.length === 0) return { id: 'insight', available: false };

  const candidates = [];

  // 어휘 빈도
  const collectText = (week) => week.map(e => (e.note || '') + ' ' + (e.diary || '')).join(' ');
  const txtA = collectText(wkA);
  const txtB = collectText(wkB);
  for (const kw of _RC_INSIGHT_KEYWORDS) {
    try {
      const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const cntA = (txtA.match(re) || []).length;
      const cntB = (txtB.match(re) || []).length;
      if (cntA >= 3 && cntA >= cntB * 2 && cntA - cntB >= 3) {
        const copy = cntB > 0
          ? `이번 주 '${kw}' ${cntA}번 등장. 지난 주 ${cntB}번이었거든.`
          : `이번 주 '${kw}' ${cntA}번 등장.`;
        candidates.push({ kind: 'lexicon_' + kw, delta: cntA - cntB, absDelta: cntA - cntB, copy });
      }
    } catch (e) { /* skip bad regex */ }
  }

  // 잠 평균
  const sleepA = wkA.map(e => e.sleep).filter(v => v != null);
  const sleepB = wkB.map(e => e.sleep).filter(v => v != null);
  if (sleepA.length >= 3 && sleepB.length >= 3) {
    const avgA = _rcAvg(sleepA);
    const avgB = _rcAvg(sleepB);
    const delta = avgA - avgB;
    if (Math.abs(delta) >= 0.5) {
      const copy = delta < 0
        ? `이번 주 잠 ${_rcSleepHm(avgA)}쯤. 지난 주 ${_rcSleepHm(avgB)}이었거든.`
        : `이번 주 잠 ${_rcSleepHm(avgA)}쯤. 좀 늘었네.`;
      candidates.push({ kind: 'sleep', delta, absDelta: Math.abs(delta) * 5, copy }); // 잠 변화는 가중치 ↑
    }
  }

  // 활력 평균
  const vitA = wkA.map(e => e.vitality).filter(v => v != null);
  const vitB = wkB.map(e => e.vitality).filter(v => v != null);
  if (vitA.length >= 3 && vitB.length >= 3) {
    const avgA = _rcAvg(vitA);
    const avgB = _rcAvg(vitB);
    const delta = avgA - avgB;
    if (Math.abs(delta) >= 0.7) {
      const copy = delta < 0
        ? `이번 주 활력 평소보다 좀 처졌네.`
        : `이번 주 활력 좀 채워졌어.`;
      candidates.push({ kind: 'vitality', delta, absDelta: Math.abs(delta) * 4, copy });
    }
  }

  if (candidates.length === 0) return { id: 'insight', available: false };
  candidates.sort((a, b) => b.absDelta - a.absDelta);
  const top = candidates[0];

  const bodyHtml = `
    <div class="rc-body-insight">
      <div class="rc-body-headline">이번 주 너</div>
      <div class="rc-body-copy">${escapeHtml(top.copy)}</div>
    </div>
  `;
  return {
    id: 'insight',
    available: true,
    contentHash: 'insight_' + top.kind + '_' + tKey,
    bodyHtml,
    onTapClick: `showScreen('model')`,
    placeholder: '이번 주...',
  };
}

// =============================================================================
// Source 7 — Surprise / 기념 (milestone, Phase 2)
// =============================================================================
// streak/연속 milestone 제거 (memory feedback_no_streak_pressure 위반, spec 11-3).
// 함께한 N일 / 첫 진주 N일 / 분기 셸 / shellCollection N개.
// dismissedSurprises 가드로 1번 표시 후 영구 X (_rcRecordSeen 안 처리).
function _rcSource7Surprise() {
  const r = _ensureRotatingCardState();
  const dismissed = new Set(r.dismissedSurprises || []);
  const today = (typeof todayKey === 'function') ? todayKey() : new Date().toISOString().slice(0, 10);

  // 첫 사용 시점 = entries / chatMessages / pearls 중 가장 오래된 것
  let firstDate = null;
  const _addFirst = (d) => {
    if (!d) return;
    const dStr = String(d).slice(0, 10);
    if (!firstDate || dStr < firstDate) firstDate = dStr;
  };
  const earliestEntry = (state.entries || []).reduce((min, e) =>
    (!min || (e.date && e.date < min)) ? e.date : min, null);
  _addFirst(earliestEntry);
  const firstChatMsg = (state.chatMessages || []).find(m => m && m.timestamp);
  if (firstChatMsg) _addFirst(firstChatMsg.timestamp);
  let firstPearlIso = null;
  (state.pearls || []).forEach(p => {
    if (!p || !p.createdAt) return;
    if (!firstPearlIso || new Date(p.createdAt).getTime() < new Date(firstPearlIso).getTime()) {
      firstPearlIso = p.createdAt;
    }
  });
  if (firstPearlIso) _addFirst(firstPearlIso);

  const candidates = [];
  const _daysBetween = (a, b) => {
    const da = new Date(a + 'T00:00:00');
    const db = new Date(b + 'T00:00:00');
    return Math.floor((db - da) / 86400000);
  };

  // 함께한 N일
  if (firstDate) {
    const days = _daysBetween(firstDate, today);
    for (const m of [30, 60, 100, 180, 365, 500, 1000]) {
      if (days === m && !dismissed.has(`together_${m}`)) {
        candidates.push({
          key: `together_${m}`,
          copy: `${m}일 함께야 🐚`,
          sub: '첫 대화부터 오늘까지.',
          tap: `showScreen('archive')`,
        });
      }
    }
  }

  // 첫 진주 N일
  if (firstPearlIso) {
    const fpDate = String(firstPearlIso).slice(0, 10);
    const days = _daysBetween(fpDate, today);
    for (const m of [30, 90, 180, 365]) {
      if (days === m && !dismissed.has(`firstPearl_${m}`)) {
        candidates.push({
          key: `firstPearl_${m}`,
          copy: `너의 첫 진주가 ${m}일 됐어`,
          sub: '그때 그 한 순간.',
          tap: `showScreen('archive'); if(typeof switchLibraryCat==='function') switchLibraryCat('pearls');`,
        });
      }
    }
  }

  // 셸 컬렉션 카운트 (모래사장)
  const shellCount = (state.shellCollection || []).length;
  for (const m of [30, 50, 100]) {
    if (shellCount === m && !dismissed.has(`shells_${m}`)) {
      candidates.push({
        key: `shells_${m}`,
        copy: `${m}개 모았어 🐚`,
        sub: '모래사장에서 보자.',
        tap: `if(typeof openShellCollection==='function') openShellCollection();`,
      });
    }
  }

  // 진주 카운트 milestone (10/30/50/100)
  const pearlsCount = (state.pearls || []).filter(p => p && p.type !== 'dna_pearl').length;
  for (const m of [10, 30, 50, 100]) {
    if (pearlsCount === m && !dismissed.has(`pearls_${m}`)) {
      candidates.push({
        key: `pearls_${m}`,
        copy: `진주 ${m}개 됐어`,
        sub: '하나하나 너만의 시간.',
        tap: `showScreen('archive'); if(typeof switchLibraryCat==='function') switchLibraryCat('pearls');`,
      });
    }
  }

  if (candidates.length === 0) return { id: 'surprise', available: false };
  // 첫 candidate (보통 1-2개만 동시 trigger)
  const pick = candidates[0];

  const bodyHtml = `
    <div class="rc-body-surprise">
      <div class="rc-body-surprise-icon">✦</div>
      <div class="rc-body-surprise-main">${escapeHtml(pick.copy)}</div>
      <div class="rc-body-surprise-sub">${escapeHtml(pick.sub)}</div>
    </div>
  `;
  return {
    id: 'surprise',
    available: true,
    contentHash: 'surprise_' + pick.key,
    bodyHtml,
    onTapClick: pick.tap,
    placeholder: '...',
    milestoneKey: pick.key,
  };
}

// =============================================================================
// 가용 source 수집 + score 정렬 + 14일 dedupe
// =============================================================================
function _rcCollectAvailable() {
  // 사용자 보고 2026-05-09: source 함수 throw 시 회전 카드 자체가 안 보이는 케이스 → 각 source 격리.
  const safe = (fn, label) => {
    try { return fn(); } catch (e) { console.warn('[rotating-card source]', label, e); return null; }
  };
  const all = [
    safe(_rcSource1Pearl, 'pearl'),
    safe(_rcSource2Yesterday, 'yesterday'),
    safe(_rcSource3NewView, 'newView'),
    safe(_rcSource4MiniReview, 'miniReview'),
    safe(_rcSource5Throwback, 'throwback'),
    safe(_rcSource6Insight, 'insight'),
    safe(_rcSource7Surprise, 'surprise'),
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

  // 사용자 보고 2026-05-09: 회전 카드 안 보임 fix — 전체 throw 시 fallback 으로 source 1 (진주) 보장.
  try {
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
      if (s) {
        container.innerHTML = _rcRenderShell([s], 0);
        _rcAttachListeners(container);
      }
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
      if (firstSrc) _rcSetWindow(firstSrc.id, firstSrc.contentHash);
    }
    if (firstSrc && firstSrc.contentHash) _rcRecordSeen(firstSrc.id, firstSrc.contentHash);
    if (typeof saveState === 'function') saveState();

    container.innerHTML = _rcRenderShell(orderedSources, pickIdx);
    _rcAttachListeners(container);
  } catch (e) {
    console.error('[renderRotatingCard]', e);
    // 최후 fallback — 진주 source 1
    try {
      const s = _rcSource1Pearl();
      if (s) {
        container.innerHTML = _rcRenderShell([s], 0);
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
// Shell HTML — wrapper + indicator + chat 다리 footer
// =============================================================================
// 사용자 명시 2026-05-09 (P2-7): source 별 outer 라벨 sub variation.
const _RC_SOURCE_SUB_LABEL = {
  pearl: '진주',
  yesterday: '어제',
  newView: '새 발견',
  miniReview: '정리',
  throwback: '회상',
  insight: '이번 주',
  surprise: '기념',
};
// 사용자 명시 2026-05-09 (P2-1): source 별 footer 출처 label (transparent — 신뢰 ↑).
const _RC_SOURCE_ORIGIN = {
  pearl: '🐚 너의 진주 모음',
  yesterday: '📊 어제 + 14일 평균',
  newView: '🤖 새벽 분석 결과',
  miniReview: '🤖 Haiku · 3일 정리',
  throwback: '⏳ 옛 너의 흔적',
  insight: '📊 7일 vs 7일',
  surprise: '✦ 기념 시점',
};

function _rcRenderShell(orderedSources, currentIdx) {
  if (!orderedSources || orderedSources.length === 0) return '';
  const cur = orderedSources[currentIdx] || orderedSources[0];
  const total = orderedSources.length;
  const indicator = orderedSources.map((s, i) =>
    `<span class="rc-dot-i ${i === currentIdx ? 'is-active' : ''}"></span>`
  ).join('');
  const tapHandler = cur.onTapClick ? ` onclick="${cur.onTapClick}"` : '';
  const debugLine = (state.preferences && state.preferences.testerMode)
    ? `<div class="rc-debug">cur: ${escapeHtml(cur.id)} · ${currentIdx + 1}/${total} · avail: ${escapeHtml(orderedSources.map(s => s.id).join(', '))}</div>` : '';
  const indicatorHtml = total > 1 ? `<span class="rc-indicator">${indicator}</span>` : '';
  const arrowRow = total > 1 ? `
    <div class="rc-arrow-row">
      <button class="rc-arrow-btn rc-arrow-prev" type="button" onclick="event.stopPropagation(); _rcCycle(-1)" aria-label="이전 카드">‹</button>
      <button class="rc-arrow-btn rc-arrow-next" type="button" onclick="event.stopPropagation(); _rcCycle(1)" aria-label="다음 카드">›</button>
    </div>
  ` : '';

  // P2-7 outer 라벨 sub variation
  let sub = _RC_SOURCE_SUB_LABEL[cur.id] || '';
  if (cur.id === 'pearl' && cur.isEmpty) sub = '첫 진주';
  // P2-1 footer 출처 (transparent)
  const origin = _RC_SOURCE_ORIGIN[cur.id] || '';
  const subHtml = sub ? ` <span class="rc-label-sub">· ${escapeHtml(sub)}</span>` : '';
  const originHtml = origin ? `<div class="rc-origin-line">${escapeHtml(origin)}</div>` : '';

  return `
    <div class="rotating-card" id="rotatingCard" data-current-idx="${currentIdx}" data-total="${total}">
      <div class="rc-top-row">
        <span class="rc-label-main">🌟 오늘의 너${subHtml}</span>
        ${indicatorHtml}
      </div>
      <div class="rc-body-tap"${tapHandler}>
        ${cur.bodyHtml || ''}
      </div>
      ${originHtml}
      ${debugLine}
      ${arrowRow}
    </div>
  `;
}

// =============================================================================
// Swipe gesture (spec 11-1 가드 detail — Pointer Events + 30px lock + preventDefault)
// =============================================================================
// 사용자 명시 2026-05-09: swipe 제거 — 좌우 ‹ › 화살 버튼 만 사용 (단순화).
// touch-action 은 페이지 세로 스크롤 자연 처리.
function _rcAttachListeners(container) {
  return;
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

// 사용자 명시 2026-05-09: chat 다리 footer 제거 — _RC_PLACEHOLDERS / rcOpenChatBridge dead code 청소.
