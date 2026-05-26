// ═══════════════════════════════════════════════════════════════
// 사용자 명시 2026-05-16 ultrathink: 자동 인사이트 발견.
// UI 약속 "체크인 7일+ 자동 인사이트 발견" 의 실 구현.
//
// 흐름:
//   maybeRunDailyChapterExtract() 끝에 piggyback (4AM cutoff + init 4s 가드 이미 통과)
//     → maybeRunDailyInsightDiscover()
//       → 가드: entries>=7 + 7일 cooldown + !isGuest + !testerMode + _canAI()
//       → context build: 최근 14일 entries / chatArchive 요약 / missions completed / caseFormulation / 기존 insights
//       → Haiku 4.5 호출 (_endpoint='discover_insights')
//       → parse JSON / dedup / state.insights.push
//       → _lastInsightDiscoverAt = nowISO
//
// 비용: Sonnet 4.6 ~$0.02/call, 7일 cooldown 시 사용자당 월 ~$0.08
// 모델: 사용자 명시 2026-05-17 ultrathink — Haiku 4.5 → Sonnet 4.6 (force 호출 무반응 fix, JSON 추출 안정성 ↑).
// ═══════════════════════════════════════════════════════════════

const _INSIGHT_DISCOVER_COOLDOWN_MS = 7 * 86400000;   // 7일
const _INSIGHT_DISCOVER_MIN_ENTRIES = 7;              // 체크인 최소 7일
const _INSIGHT_DISCOVER_CONFIDENCE_MIN = 0.55;

// V4 (사용자 명시 2026-05-17 ultrathink): silent fail 진단 surface.
//   각 silent return 마다 _setInsightDiag('reason') 으로 마킹 → testForceInsightDiscover 가 toast.
function _setInsightDiag(reason) {
  try { window._lastInsightDiscoverDiag = { reason, at: Date.now() }; } catch {}
}

async function maybeRunDailyInsightDiscover(opts) {
  opts = opts || {};
  const force = !!opts.force;
  try {
    if (!state || !state.preferences) { _setInsightDiag('no-state'); return; }
    if (typeof _canAI !== 'function' || !_canAI()) { _setInsightDiag('canAI-false'); return; }
    if (state.isGuest) { _setInsightDiag('guest-mode'); return; }
    if (state.preferences.testerMode) { _setInsightDiag('tester-mode-on'); return; }
    if (!Array.isArray(state.entries) || state.entries.length < _INSIGHT_DISCOVER_MIN_ENTRIES) {
      _setInsightDiag('entries-total-lt-7:' + (state.entries?.length || 0));
      return;
    }
    // 7일 cooldown
    const last = state.preferences._lastInsightDiscoverAt;
    if (!force && last) {
      const lastMs = new Date(last).getTime();
      if (!isNaN(lastMs) && (Date.now() - lastMs) < _INSIGHT_DISCOVER_COOLDOWN_MS) { _setInsightDiag('cooldown-7d'); return; }
    }
    // race 방지
    if (window._insightDiscoverRunning) { _setInsightDiag('race-running'); return; }
    window._insightDiscoverRunning = true;

    try {
      const ctx = _buildInsightDiscoverContext();
      if (!ctx) { _setInsightDiag('ctx-null-recent14-lt-7'); return; }

      const resp = await callAnthropic({
        _endpoint: 'discover_insights',
        _userContentType: 'discover_insights',
        _vars: {
          dataJson: ctx.dataJson,
          existingInsights: ctx.existingInsights
        },
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        messages: [{ role: 'user', content: '' }]
      });
      if (!resp.ok) {
        const _txt = await resp.text().catch(() => '');
        console.warn('[auto-insight] API', resp.status, _txt);
        _setInsightDiag('api-status-' + resp.status);
        return;
      }
      const data = await resp.json();
      const raw = data?.content?.[0]?.text || '';
      // V4 (사용자 명시 2026-05-17 ultrathink): JSON 추출 robustness — markdown code fence / 앞뒤 텍스트 제거.
      let jsonStr = raw;
      const fenceM = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (fenceM) jsonStr = fenceM[1];
      const jm = jsonStr.match(/\{[\s\S]*\}/);
      if (!jm) { console.warn('[auto-insight] no JSON in:', raw.slice(0, 200)); _setInsightDiag('no-json-match'); return; }
      let parsed;
      try { parsed = JSON.parse(jm[0]); } catch (e) { console.warn('[auto-insight] parse fail:', e.message, jm[0].slice(0, 200)); _setInsightDiag('json-parse-fail'); return; }
      const discovered = Array.isArray(parsed && parsed.discovered) ? parsed.discovered : [];

      const existingContents = (Array.isArray(state.insights) ? state.insights : [])
        .filter(i => i && !i.dismissed)
        .map(i => typeof i.content === 'string' ? i.content.toLowerCase() : '');

      let pushedCount = 0;
      const nowIso = new Date().toISOString();
      discovered.forEach(d => {
        if (!d || typeof d !== 'object') return;
        const type = (d.type === 'causal' || d.type === 'pattern') ? d.type : null;
        if (!type) return;
        const content = (d.content || '').trim();
        const evidence = (d.evidence || '').trim();
        const conf = typeof d.confidence === 'number' ? d.confidence : 0;
        if (!content || content.length < 8) return;
        if (conf < _INSIGHT_DISCOVER_CONFIDENCE_MIN) return;
        if (_dedupInsight(content, existingContents)) return;
        state.insights = state.insights || [];
        state.insights.push({
          id: 'ins_auto_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          type,
          content: content.slice(0, 80),
          evidence: evidence.slice(0, 120),
          supportingEntryIds: [],
          confidence: Math.min(0.95, Math.max(0.55, conf)),
          discoveredAt: nowIso,
          dismissed: false,
          user_verified: false,
          source: 'auto'
        });
        existingContents.push(typeof content === 'string' ? content.toLowerCase() : '');
        pushedCount++;
      });

      state.preferences._lastInsightDiscoverAt = nowIso;
      try { saveState(); } catch {}
      if (typeof saveToCloudNow === 'function') { saveToCloudNow().catch(() => {}); }

      if (pushedCount > 0) {
        // 도서관/깨달음 화면 열려있으면 새로고침
        if (typeof renderArchive === 'function') { try { renderArchive(); } catch {} }
        if (typeof renderLensInsights === 'function') { try { renderLensInsights(); } catch {} }
      }
      return pushedCount;
    } finally {
      window._insightDiscoverRunning = false;
    }
  } catch (e) {
    console.warn('[auto-insight] fail:', e);
    _setInsightDiag('exception:' + (e?.message || 'unknown').slice(0, 60));
    window._insightDiscoverRunning = false;
  }
}

function _buildInsightDiscoverContext() {
  const today = Date.now();
  const cutoff = today - 14 * 86400000;
  // 14일 entries — mood / vitality / sleep duration / modes / note 짧게 / weather
  const recentEntries = (state.entries || []).filter(e => {
    const t = e && e.date ? new Date(e.date).getTime() : NaN;
    return !isNaN(t) && t >= cutoff;
  }).map(e => ({
    date: e.date,
    mood: e.mood,
    vitality: e.vitality,
    sleep: (e.sleepStart && e.sleepEnd) ? `${e.sleepStart}-${e.sleepEnd}` : null,
    modes: Object.keys(e.modes || {}).filter(k => e.modes[k]),
    note: e.note ? e.note.slice(0, 80) : null,
    weather: e.weather ? e.weather.label : null,
    music: e.music ? (e.music.title || '').slice(0, 30) : null
  }));
  if (recentEntries.length < _INSIGHT_DISCOVER_MIN_ENTRIES) return null;

  // 14일 chatArchive titles + 짧은 요약 (전문 X — 비용↓, privacy↑)
  const recentChatArchive = (state.chatArchive || []).filter(a => {
    if (!a || a._deleted) return false;
    const t = a.endedAt ? new Date(a.endedAt).getTime() : NaN;
    return !isNaN(t) && t >= cutoff;
  }).slice(-20).map(a => ({
    title: (a.title || '').slice(0, 40),
    summary: (a.summary || '').slice(0, 100)
  }));

  // 14일 missions completed + attemptStatus
  const recentMissions = (state.missions || []).filter(m => {
    if (!m) return false;
    const t = m.completedAt ? new Date(m.completedAt).getTime() : NaN;
    return !isNaN(t) && t >= cutoff;
  }).slice(-20).map(m => ({
    title: (m.title || '').slice(0, 40),
    completedDate: m.completedDate,
    attemptStatus: m.attemptStatus || null,
    strategy: m.strategyId || null
  }));

  // caseFormulation snapshot (최소 — problems/strengths text 만)
  const cf = state.caseFormulation || {};
  const cfSnap = {
    problems: (cf.problems || []).slice(0, 5).map(x => (x?.text || x || '').toString().slice(0, 60)),
    strengths: (cf.strengths || []).slice(0, 5).map(x => (x?.text || x || '').toString().slice(0, 60))
  };

  // 기존 insights — dedup 용 (dismissed 제외)
  const existingTexts = (state.insights || [])
    .filter(i => i && !i.dismissed)
    .slice(-12)
    .map(i => `- ${i.content || ''}`)
    .join('\n');

  const dataJson = JSON.stringify({
    entries: recentEntries,
    chatArchive: recentChatArchive,
    missions: recentMissions,
    caseFormulation: cfSnap
  }, null, 2);

  return { dataJson, existingInsights: existingTexts };
}

// 핵심 명사 fuzzy match — 2개+ 명사 겹치면 dup. lowercase + 공백 split + 2자+ 명사만.
function _dedupInsight(content, existingContents) {
  if (!content || !Array.isArray(existingContents) || existingContents.length === 0) return false;
  const norm = (s) => (s || '').toLowerCase().replace(/[^가-힣a-z0-9 ]+/g, ' ').split(/\s+/).filter(t => t.length >= 2);
  const a = new Set(norm(content));
  for (const ex of existingContents) {
    const b = norm(ex);
    let overlap = 0;
    for (const t of b) {
      if (a.has(t)) overlap++;
      if (overlap >= 2) return true;
    }
  }
  return false;
}

// NEW 배지용 — 24h 이내 발견 + dismissed X + 사용자 마지막 열람 시각 이후
function _countRecentInsights() {
  if (!Array.isArray(state.insights)) return 0;
  const lastViewed = state.preferences?._insightsLastViewedAt;
  const lastViewedMs = lastViewed ? new Date(lastViewed).getTime() : 0;
  return state.insights.filter(i => {
    if (!i || i.dismissed) return false;
    const t = i.discoveredAt ? new Date(i.discoveredAt).getTime() : NaN;
    if (isNaN(t)) return false;
    return t > lastViewedMs;
  }).length;
}

function markInsightsViewed() {
  if (!state.preferences) state.preferences = {};
  state.preferences._insightsLastViewedAt = new Date().toISOString();
  try { saveState(); } catch {}
}

// 테스터 강제 호출 — 가드 우회. 게스트는 통과 X.
async function testForceInsightDiscover() {
  if (!state.preferences || state.preferences.testerMode) {
    showToast('⚠️ 테스터 모드 OFF 후 사용 — 실 데이터로 발견');
    return;
  }
  if (typeof _canAI !== 'function' || !_canAI()) {
    showToast('⚠️ 로그인 후 사용');
    return;
  }
  if (!Array.isArray(state.entries) || state.entries.length < _INSIGHT_DISCOVER_MIN_ENTRIES) {
    showToast(`⚠️ 체크인 ${_INSIGHT_DISCOVER_MIN_ENTRIES}일+ 필요 (현재 ${state.entries?.length || 0}일)`);
    return;
  }
  showToast('🔮 AI 인사이트 발견 진행 중... (Sonnet, ~10-30초)');
  // V4 (사용자 명시 2026-05-17 ultrathink): undefined 반환 (silent fail) 시 진단 toast.
  window._lastInsightDiscoverDiag = null;
  try {
    const n = await maybeRunDailyInsightDiscover({ force: true });
    if (typeof n === 'number') {
      showToast(n > 0 ? `🔮 ${n}개 발견됨 — 홈 → 깨달음 확인` : '🔮 새 인사이트 없음 (충분한 데이터 아니거나 dedup)');
    } else {
      const diag = window._lastInsightDiscoverDiag;
      const reason = diag?.reason || 'unknown-undefined';
      showToast(`⚠️ 인사이트 발견 무반응 — ${reason} (console 확인)`);
      console.warn('[testForceInsightDiscover] silent fail diag:', diag);
    }
  } catch (e) {
    showToast('⚠️ 에러: ' + (e?.message || 'unknown'));
    console.error('[testForceInsightDiscover]', e);
  }
}
