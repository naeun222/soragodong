// Hook 생성 client — POST /api/hook/generate.
// 사용자 명시 2026-05-17 (_hook-system-spec.md).
//
// E2EE 호환: 사용자 state 는 backend 가 못 봐서 frontend 가 substrate 모아서 보냄.
// "Cron" = 앱 진입 시 cooldown / cold-start gate / 풍부도 / askedHooks cooldown 다 체크 후 1회 발사.

// ─────────────────────────────────────────────────────────────────────────────
// Constants (spec Section 11/12)
// ─────────────────────────────────────────────────────────────────────────────
const _HOOK_FREQ_COOLDOWN_HOURS = {
  'daily':            18,           // 매일 (18h 안전 마진)
  'every-other-day':  36,
  'thrice-week':      50,           // 주 3회 ≈ 56h, 50h 보수
  'off':              Infinity,
};
const _HOOK_ASKED_COOLDOWN_DAYS = 7;        // 같은 dayK 7일 cooldown
const _HOOK_RICHNESS_MIN = 30;
const _HOOK_MAX_ASKED_HOOKS = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Gates
// ─────────────────────────────────────────────────────────────────────────────
function _hookPassesColdStartGate() {
  if (!state) return false;
  const archiveLen = Array.isArray(state.chatArchive)
    ? state.chatArchive.filter(a => a && !a._deleted && !a._seed).length
    : 0;
  if (archiveLen < 2) return false;
  const pearlLen = Array.isArray(state.pearls)
    ? state.pearls.filter(p => p && !p._deleted).length
    : 0;
  const diaryLen = Array.isArray(state.entries)
    ? state.entries.filter(e => e && e.note && e.note.length >= 30).length
    : 0;
  if (pearlLen + diaryLen < 3) return false;
  return true;
}

function _hookFrequencyCooldownOk() {
  const freq = (state.preferences && state.preferences.hookFrequency) || 'daily';
  if (freq === 'off') return false;
  const cooldownH = _HOOK_FREQ_COOLDOWN_HOURS[freq] || _HOOK_FREQ_COOLDOWN_HOURS.daily;
  const askedHooks = state.askedHooks || [];
  const last = askedHooks[askedHooks.length - 1];
  if (!last || !last.askedAt) return true;
  const hoursSince = (Date.now() - new Date(last.askedAt).getTime()) / 3600000;
  return hoursSince >= cooldownH;
}

// ─────────────────────────────────────────────────────────────────────────────
// Substrate — dayK 별 6 source 그루핑 (옛 godong-diary 모달 `_bySource` 와 동일 로직 — backend 이동 예정).
// ─────────────────────────────────────────────────────────────────────────────
function _hookIsoToDayK(iso) {
  if (!iso) return null;
  if (typeof getDayKey === 'function') return getDayKey(iso);
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  // 4AM cutoff fallback
  const adj = new Date(d.getTime() - 4 * 3600000);
  return `${adj.getFullYear()}-${String(adj.getMonth() + 1).padStart(2, '0')}-${String(adj.getDate()).padStart(2, '0')}`;
}

function _hookSubstrateBySource(dayK) {
  const out = { checkin: null, diary: [], diarySummary: [], pearls: [], insights: [], topicCards: [] };
  // [A] 체크인
  const e = (state.entries || []).find(x => x && x.date === dayK);
  if (e) {
    out.checkin = {
      vit: e.vitality, mood: e.mood,
      sleepStart: e.sleepStart, sleepEnd: e.sleepEnd, allNighter: e.allNighter,
      question: e.dailyQuestion && e.dailyQuestion.text,
      answer: e.note,
    };
    if (e.note && e.note.length >= 30 && !(e.dailyQuestion && e.dailyQuestion.text)) {
      out.diary.push({ src: 'note', text: e.note.slice(0, 300) });
    }
  }
  // [B] 일기 — 현재 chat user 발화
  (state.chatMessages || []).forEach(m => {
    if (!m || !m.timestamp || m.role !== 'user' || m.isSimulationContext) return;
    if (_hookIsoToDayK(m.timestamp) !== dayK) return;
    const c = (m.content || '').replace(/\s+/g, ' ').trim();
    if (c.length >= 5) out.diary.push({ src: 'chat', text: c.slice(0, 200) });
  });
  // [C] 일기 요약 + 옛 chat 발화 (chatArchive)
  (state.chatArchive || []).forEach(a => {
    if (!a || a._deleted || a.isSimulation) return;
    if (a.date !== dayK) return;
    if (a.headline || a.summary) {
      out.diarySummary.push({
        headline: (a.headline || '').slice(0, 80),
        summary: (a.summary || '').slice(0, 200)
      });
    }
    if (Array.isArray(a.messages)) {
      a.messages.forEach(m => {
        if (!m || m.role !== 'user' || !m.content) return;
        const c = (m.content || '').replace(/\s+/g, ' ').trim();
        if (c.length >= 5) out.diary.push({ src: 'archive', text: c.slice(0, 200) });
      });
    }
  });
  // [D] 진주
  out.pearls = (state.pearls || []).filter(p => {
    if (!p || p._deleted || !p.createdAt) return false;
    return _hookIsoToDayK(p.createdAt) === dayK;
  });
  // [E] 깨달음 (archive + insights)
  const _arch = (state.archive || []).filter(a => {
    if (!a || a._deleted || a.type === 'memo' || a._excludeFromAI) return false;
    if (!a.savedAt) return false;
    return _hookIsoToDayK(a.savedAt) === dayK;
  });
  const _ins = (state.insights || []).filter(i => {
    if (!i || i._deleted || i.dismissed || !i.discoveredAt) return false;
    return _hookIsoToDayK(i.discoveredAt) === dayK;
  });
  out.insights = [
    ..._arch.map(a => ({ kind: 'archive', headline: a.headline, body: a.body, insight: a.insight })),
    ..._ins.map(i => ({ kind: 'auto', content: i.content })),
  ];
  // [F] 대화 토픽
  out.topicCards = (state.topicCards || []).filter(t => {
    if (!t || t._deleted) return false;
    const ts = t.chapterEndedAt || t.chapterStartedAt || t.createdAt;
    return ts && _hookIsoToDayK(ts) === dayK;
  });
  return out;
}

function _hookScoreRichness(src) {
  let score = 0;
  if (src.checkin && src.checkin.answer && src.checkin.answer.length > 5) score += 20;
  score += (src.diary || []).length * 15;
  score += (src.diarySummary || []).length * 10;
  score += (src.pearls || []).length * 20;
  score += (src.insights || []).length * 15;
  score += (src.topicCards || []).length * 12;
  return Math.min(100, score);
}

// 윈도우: 어제~14일 전 가중 random (1-3일 50% / 4-7일 30% / 8-14일 20%)
function _hookPickWeightedDayKOffset() {
  const r = Math.random();
  if (r < 0.5) return 1 + Math.floor(Math.random() * 3);     // 1-3
  if (r < 0.8) return 4 + Math.floor(Math.random() * 4);     // 4-7
  return 8 + Math.floor(Math.random() * 7);                  // 8-14
}

function _hookDayKOffset(off) {
  if (typeof getDayKey === 'function') return getDayKey(Date.now() - off * 86400000);
  const d = new Date(Date.now() - off * 86400000 - 4 * 3600000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// askedHooks 안 trigger_dayK + 최근 7일 = 회피.
function _hookAskedCooldownSet() {
  const now = Date.now();
  const cooldownMs = _HOOK_ASKED_COOLDOWN_DAYS * 86400000;
  const set = new Set();
  (state.askedHooks || []).forEach(h => {
    if (!h || !h.trigger_dayK || !h.askedAt) return;
    if ((now - new Date(h.askedAt).getTime()) < cooldownMs) set.add(h.trigger_dayK);
  });
  return set;
}

// 여러 candidate dayK 시도 → 풍부도 30+ AND cooldown 통과 day 중 1개 random pick.
function _hookPickTriggerDayK() {
  const cooldown = _hookAskedCooldownSet();
  const tried = new Set();
  // 최대 10회 시도 — 가중 random 으로 다양성 확보.
  for (let i = 0; i < 10; i++) {
    const off = _hookPickWeightedDayKOffset();
    const dayK = _hookDayKOffset(off);
    if (tried.has(dayK)) continue;
    tried.add(dayK);
    if (cooldown.has(dayK)) continue;
    const src = _hookSubstrateBySource(dayK);
    const score = _hookScoreRichness(src);
    if (score >= _HOOK_RICHNESS_MIN) return { dayK, src, score };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Substrate → prompt text
// ─────────────────────────────────────────────────────────────────────────────
function _hookFormatSubstrate(src, dayK) {
  const lines = [];
  lines.push(`[dayK = ${dayK}]`);
  lines.push('');

  // [A] 체크인
  lines.push('[A] 체크인:');
  if (src.checkin) {
    const c = src.checkin;
    if (c.answer && c.question) lines.push(`  - 질문 "${(c.question || '').slice(0, 60)}" 에 "${(c.answer || '').slice(0, 100)}"`);
    if (c.allNighter) lines.push('  - 잠: 밤샘');
    else if (c.sleepStart && c.sleepEnd) lines.push(`  - 잠: ${c.sleepStart}~${c.sleepEnd}`);
    if (c.vit != null && c.mood != null) lines.push(`  - vit ${c.vit}/5 mood ${c.mood}/7`);
    if (!c.answer && !c.allNighter && !c.sleepStart && (c.vit == null || c.mood == null)) lines.push('  - (없음)');
  } else lines.push('  - (없음)');

  // [B] 일기
  lines.push('[B] 일기 (사용자 발화/메모):');
  if ((src.diary || []).length > 0) {
    src.diary.slice(0, 6).forEach(d => {
      lines.push(`  - "${(d.text || '').slice(0, 120)}"`);
    });
    if (src.diary.length > 6) lines.push(`  - (외 ${src.diary.length - 6}건)`);
  } else lines.push('  - (없음)');

  // [C] 일기 요약
  lines.push('[C] 일기 요약 (옛 챕터 자동 정리):');
  if ((src.diarySummary || []).length > 0) {
    src.diarySummary.slice(0, 3).forEach(s => {
      const h = (s.headline || '').slice(0, 80);
      const sum = (s.summary || '').slice(0, 120);
      lines.push(`  - "${h}${sum ? ' / ' + sum : ''}"`);
    });
  } else lines.push('  - (없음)');

  // [D] 진주
  lines.push('[D] 진주:');
  if ((src.pearls || []).length > 0) {
    src.pearls.slice(0, 4).forEach(p => {
      const cat = p.category ? ` (${p.category})` : '';
      const note = p.note ? ` — ${(p.note || '').slice(0, 80)}` : '';
      lines.push(`  - "${(p.content || '').trim()}"${cat}${note}`);
    });
  } else lines.push('  - (없음)');

  // [E] 깨달음
  lines.push('[E] 깨달음:');
  if ((src.insights || []).length > 0) {
    src.insights.slice(0, 3).forEach(i => {
      if (i.kind === 'archive') {
        const h = (i.headline || '').slice(0, 60);
        const ins = (i.insight || i.body || '').slice(0, 100);
        lines.push(`  - "${h}${ins ? ' — ' + ins : ''}"`);
      } else {
        lines.push(`  - "${(i.content || '').slice(0, 120)}"`);
      }
    });
  } else lines.push('  - (없음)');

  // [F] 대화 토픽
  lines.push('[F] 대화 토픽:');
  if ((src.topicCards || []).length > 0) {
    src.topicCards.slice(0, 3).forEach(t => {
      const title = (t.title || '').slice(0, 60);
      const summary = (t.summary || '').slice(0, 120);
      lines.push(`  - "${title}${summary ? ' / ' + summary : ''}"`);
    });
  } else lines.push('  - (없음)');

  return lines.join('\n');
}

function _hookBuildAskedHistory() {
  const now = Date.now();
  const sevenDayMs = 7 * 86400000;
  const recent = (state.askedHooks || []).filter(h =>
    h && h.askedAt && (now - new Date(h.askedAt).getTime()) < sevenDayMs
  );
  if (recent.length === 0) return '';
  return recent.slice(-10).map(h => `- "${(h.body || '').slice(0, 80)}"`).join('\n');
}

function _hookActiveModesText() {
  const modeLabel = { exam: '시험기간', travel: '여행 중', sick: '아픈 중', rest: '휴식 중', period: '월경 중' };
  const active = Object.keys(state.modes || {}).filter(k => state.modes[k]);
  if (active.length === 0) return '';
  return active.map(k => modeLabel[k] || k).join(', ');
}

// ─────────────────────────────────────────────────────────────────────────────
// 메인 orchestrator
// ─────────────────────────────────────────────────────────────────────────────
let _hookGenerateInFlight = false;

async function maybeGenerateHook(opts) {
  opts = opts || {};
  const force = !!opts.force;

  if (_hookGenerateInFlight) return { skipped: 'in-flight' };
  if (!state) return { skipped: 'no-state' };
  if (state.isGuest) return { skipped: 'guest' };
  if (window._onbTutorialMode) return { skipped: 'tutorial' };
  if (window._initialDataLoading) return { skipped: 'loading' };

  const userName = (state.userName || '').trim();
  if (!userName) return { skipped: 'no-username' };

  if (!force) {
    if (!_hookPassesColdStartGate()) return { skipped: 'cold-start' };
    if (!_hookFrequencyCooldownOk()) return { skipped: 'frequency-cooldown' };
  }

  const pick = _hookPickTriggerDayK();
  if (!pick) return { skipped: 'no-rich-dayk' };

  _hookGenerateInFlight = true;
  try {
    const substrateText = _hookFormatSubstrate(pick.src, pick.dayK);
    const askedHistory = _hookBuildAskedHistory();
    const activeModes = _hookActiveModesText();

    const accessToken = (typeof session !== 'undefined' && session && session.access_token) || null;
    if (!accessToken) {
      return { skipped: 'no-auth' };
    }

    const resp = await fetch('/api/hook/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        userName,
        substrateText,
        triggerDayK: pick.dayK,
        askedHistory,
        activeModes
      })
    });
    if (!resp.ok) {
      console.warn('[hook] POST fail', resp.status);
      return { failed: 'http-' + resp.status };
    }
    const data = await resp.json();
    if (!data || !data.ok || !data.hook) {
      console.warn('[hook] backend reason:', data && data.reason);
      return { failed: data && data.reason || 'backend-fail' };
    }
    const h = data.hook;
    const entry = {
      id: 'hook_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      body: h.body,
      source: h.source,
      trigger_dayK: h.trigger_dayK,
      hook_type: h.hook_type,
      askedAt: new Date().toISOString(),
      answered: false,
      answeredAt: null,
      delivered: true,
    };
    if (!Array.isArray(state.askedHooks)) state.askedHooks = [];
    state.askedHooks.push(entry);
    // cap 50
    if (state.askedHooks.length > _HOOK_MAX_ASKED_HOOKS) {
      state.askedHooks.splice(0, state.askedHooks.length - _HOOK_MAX_ASKED_HOOKS);
    }
    if (typeof saveState === 'function') saveState(true);
    if (typeof renderRotatingCard === 'function') renderRotatingCard();
    console.log('[hook] generated:', entry.id, entry.body.slice(0, 60));
    // Phase B: 다음 push 시간에 발사할 수 있게 backend queue 에도 등록 (fire-and-forget).
    //   사용자가 push subscription 안 했으면 backend 에서 silent drop.
    _hookQueueForPush(entry).catch(e => console.warn('[hook queue]', e));
    return { ok: true, hook: entry };
  } catch (e) {
    console.error('[hook] generate exception:', e);
    return { failed: 'exception:' + (e && e.message || e) };
  } finally {
    _hookGenerateInFlight = false;
  }
}

// 수동 trigger — testerMode / 개발자 콘솔용. cooldown / cold-start gate 우회.
async function forceGenerateHook() {
  return maybeGenerateHook({ force: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase B: backend push queue 등록 — 다음 사용자 명시 시간에 push 발사용.
//   subscription 없으면 backend 가 silent drop (단순히 prefs row 미존재 → cron 무시).
//   같은 user_id row 가 있으면 upsert (가장 최근 hook 1개만 pending).
// ─────────────────────────────────────────────────────────────────────────────
async function _hookQueueForPush(entry) {
  if (!entry || !entry.body) return;
  const accessToken = (typeof session !== 'undefined' && session && session.access_token) || null;
  if (!accessToken) return;
  // 다음 push 시간 = 사용자 prefs.hookNotificationTime (오늘 그 시간 이미 지났으면 내일).
  const hour = (state.preferences && typeof state.preferences.hookNotificationTime === 'number')
    ? state.preferences.hookNotificationTime : 21;
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  try {
    await fetch('/api/hook/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({
        hook_id: entry.id,
        body: entry.body,
        scheduled_at: target.toISOString(),
        user_name: (state.userName || '').slice(0, 20),
      })
    });
  } catch (e) {
    console.warn('[hook queue] fetch fail:', e && e.message || e);
  }
}
