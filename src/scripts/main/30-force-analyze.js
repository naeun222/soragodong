// ═══════════════════════════════════════════════════════════════
// FORCE ANALYZE
// ═══════════════════════════════════════════════════════════════
// 사용자 요청 2026-04-30: 일주일마다 자동 실행. 수동 호출 (개발자 도구 버튼)도 같은 함수.
// opts.auto = true 시 confirm modal X, 토스트 silent ("일주일 분석 자동 실행됨").
async function forceAnalyze(opts) {
  const isAuto = !!(opts && opts.auto);
  if (!_canAI()) {
    // 사용자 보고 2026-04-30: Phase C 후 키 모델 폐기 — 로그인이 게이트.
    if (!isAuto) alert('로그인 안 되어있어 — 다시 로그인 해줘.');
    return;
  }
  if (state.entries.length < 3 && state.chatMessages.length < 3) {
    if (!isAuto) alert('분석하려면 체크인이나 대화가 최소 3개 이상 쌓여야 해.');
    return;
  }
  if (!isAuto) {
    const yes = await showConfirmModal({
      title: '나에 대한 모델 업데이트',
      message: '지금까지의 데이터를 분석해서\n특성·가치·패턴을 새로 정리할게.\n1-2분 걸려.',
      okLabel: '분석 시작',
      cancelLabel: '나중에'
    });
    if (!yes) return;
  }

  setSyncStatus('syncing');
  try {
    // V4-fix v3 (사용자 보고 — API 429): dataDump 크기 대폭 줄임 (token 한계 + rate limit)
    const sliceEntry = (e) => ({
      date: e.date, mood: e.mood, vitality: e.vitality,
      sleep: e.sleepStart && e.sleepEnd ? `${e.sleepStart}-${e.sleepEnd}` : null,
      modes: Object.keys(e.modes || {}).filter(k => e.modes[k]),
      diary: e.diary ? e.diary.slice(0, 100) : null,
      note: e.note ? e.note.slice(0, 80) : null
    });
    const dataDump = {
      entries: (state.entries || []).slice(-60).map(sliceEntry),
      chatMessages: state.chatMessages.filter(m => !m.typing && !m.error).slice(-25).map(m => ({
        role: m.role, content: (m.content || '').slice(0, 200)
      })),
      // 사용자 명시 2026-05-06: 메모 type 은 강제 분석 input 에서 제외 (순수 메모)
      archive: (state.archive || []).filter(a => !a._deleted && a.type !== 'memo' && !a._excludeFromAI).slice(0, 15).map(a => ({
        type: a.type, headline: a.headline, body: (a.body || '').slice(0, 100)
      })),
      // 사용자 명시 2026-05-11: dismissed 미션은 AI substrate 에서 제외 (사용자 '치워둠' 의도 = 분석에서도 빼).
      missions: (state.missions || []).filter(m => m && m.status !== 'dismissed').slice(-15).map(m => ({
        title: m.title, status: m.status, attemptStatus: m.attemptStatus
      })),
      decisions: (state.decisions || []).filter(d => !d._deleted).slice(-5).map(d => ({
        topic: d.topic || d.title, status: d.status
      })),
      activeModes: Object.keys(state.modes || {}).filter(k => state.modes[k]),
      // 사용자 명시 2026-05-26 ultrathink: dedup 인플레 잡기 — 기존 항목 이름 AI 한테 전달.
      //   백엔드 프롬프트가 "이미 등록된 항목과 의미상 같으면 새로 만들지 말고 기존 이름 그대로 반환" 지시 사용.
      //   slice(80) 토큰 가드. confidence DESC 정렬 후 슬라이스 — 강한 신호 우선 노출.
      existingTraitNames: (state.traits || [])
        .filter(t => !t._deleted)
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
        .map(t => t.name).filter(Boolean).slice(0, 80),
      existingValueNames: (state.values || [])
        .filter(v => !v._deleted)
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
        .map(v => v.name).filter(Boolean).slice(0, 80),
      existingPatternNames: (state.patterns || [])
        .filter(p => !p._deleted)
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
        .map(p => p.name).filter(Boolean).slice(0, 80)
    };
    // 사용자 명시 2026-05-11 ultrathink: prompt template backend 이전 — buildForceAnalyze 가 합성.
    const _dataDumpJson = JSON.stringify(dataDump, null, 2);
    const response = await callAnthropic({
      _endpoint: 'analyze_4stage',
      _userContentType: 'force_analyze',
      // 사용자 명시 2026-05-26 ultrathink: backend [이미 등록된 항목] 블록 합성용 list — dataDump 안 중복이지만 explicit 강조.
      _vars: {
        dataDumpJson: _dataDumpJson,
        existingTraitNames: dataDump.existingTraitNames,
        existingValueNames: dataDump.existingValueNames,
        existingPatternNames: dataDump.existingPatternNames
      },
      model: 'claude-opus-4-7',
      max_tokens: 2500,
      messages: [{ role: 'user', content: '' }]
    });
    if (!response.ok) {
      if (response.status === 429) throw new Error('API 429 — Rate limit. 1-2분 후 다시.');
      if (response.status === 413) throw new Error('데이터 너무 큼. testerMode OFF 후 다시.');
      throw new Error('API ' + response.status);
    }
    const result = await response.json();
    const text = result.content[0].text;
    // V4-fix v3 (사용자 보고): code block fence 제거 + truncated 응답 복구
    let cleaned = text.replace(/^```\w*\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON 파싱 실패');
    let analysis;
    try {
      analysis = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      // V4-fix v3 (사용자 보고 - 두 번째): 더 robust 복구 — array 중간 truncate도 처리
      const partial = jsonMatch[0];
      // 1. 마지막 완전 element 위치 (depth=0, bracket=0인 마지막 } 또는 ])
      let braceDepth = 0, bracketDepth = 0, lastFullClose = -1;
      let inStr = false, escNext = false;
      for (let i = 0; i < partial.length; i++) {
        const c = partial[i];
        if (escNext) { escNext = false; continue; }
        if (c === '\\' && inStr) { escNext = true; continue; }
        if (c === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (c === '{') braceDepth++;
        else if (c === '}') { braceDepth--; if (braceDepth === 0 && bracketDepth === 0) lastFullClose = i; }
        else if (c === '[') bracketDepth++;
        else if (c === ']') bracketDepth--;
      }
      // 시도 1: 마지막 } 위치까지
      if (lastFullClose > 0) {
        try { analysis = JSON.parse(partial.slice(0, lastFullClose + 1)); }
        catch (e2) {
          // 시도 2: trailing comma 제거 + array/object 강제 닫기
          let attempt = partial.slice(0, lastFullClose + 1);
          attempt = attempt.replace(/,(\s*[}\]])/g, '$1');  // trailing comma
          try { analysis = JSON.parse(attempt); }
          catch (e3) {
            // 시도 3: open array/brace 강제 닫기 — incomplete JSON 강제 마무리
            let forced = partial.slice();
            forced = forced.replace(/,(\s*[}\]])/g, '$1');
            // 마지막 incomplete element 잘라내기 (마지막 ',' 또는 '{' 또는 '[' 이후 자르기)
            const lastComma = Math.max(forced.lastIndexOf(','), forced.lastIndexOf('{'), forced.lastIndexOf('['));
            if (lastComma > 0) forced = forced.slice(0, lastComma);
            // 닫는 괄호 보충
            let openBrace = 0, openBracket = 0; let inS = false; let escN = false;
            for (let i = 0; i < forced.length; i++) {
              const c = forced[i];
              if (escN) { escN = false; continue; }
              if (c === '\\' && inS) { escN = true; continue; }
              if (c === '"') { inS = !inS; continue; }
              if (inS) continue;
              if (c === '{') openBrace++;
              else if (c === '}') openBrace--;
              else if (c === '[') openBracket++;
              else if (c === ']') openBracket--;
            }
            for (let i = 0; i < openBracket; i++) forced += ']';
            for (let i = 0; i < openBrace; i++) forced += '}';
            try { analysis = JSON.parse(forced); }
            catch (e4) {
              throw new Error('JSON 파싱 실패 (3 시도 후): ' + parseErr.message);
            }
          }
        }
      } else {
        throw parseErr;
      }
    }

    // 사용자 명시 2026-05-09 (Phase 2 source 3): 분석 직전 prev id 캡처 — 새 항목 detect 용.
    const _rcPrevIds = {
      traits: new Set((state.traits || []).map(x => x.id)),
      values: new Set((state.values || []).map(x => x.id)),
      patterns: new Set((state.patterns || []).map(x => x.id)),
    };

    // V3.13.x: 덮어씌움 X. 추가 + 중복은 합치기 (evidence_count↑, confidence/description 더 좋은 거 채택)
    const mergeModelItem = (existing, incoming) => {
      existing.evidence_count = (existing.evidence_count || 1) + 1;
      if ((incoming.confidence || 0) > (existing.confidence || 0)) existing.confidence = incoming.confidence;
      if (incoming.description && (!existing.description || incoming.description.length > existing.description.length)) {
        existing.description = incoming.description;
      }
      // user_verified는 그대로 유지 (사용자가 검증한 건 안 건드림)
    };
    // 사용자 명시 2026-05-08 ultrathink: 0.6 → 0.4 완화. 너무 빡빡해 새 발견 적었음.
    //   "다음날 나에 대해 새로운 소식 보는 재미" 의도 — 약한 신호도 가설로 등록 후 evidence_count 로 강화.
    // 사용자 명시 2026-05-26 ultrathink: 0.4 → 0.65. 옛 정책 "약한 신호도 가설로 등록" 은
    //   dedup 안 잡히는 채로 별개 카드가 됨 = 인플레 원인. 새 정책 — 약한 신호는 fuzzy fallback 으로
    //   기존 카드 evidence ↑ 만 시도. 매칭 없으면 drop.
    const NEW_THRESHOLD = 0.65;
    // 사용자 명시 2026-05-26 ultrathink: similarText 못 잡는 fuzzy 의미 중복 → Levenshtein 폴백.
    //   _modelSimilarity (18a-model-dedup.js) 재사용. 0.6 = 약한 매칭 — 새 카드 만들지 않을 정도.
    const FUZZY_MERGE_THRESHOLD = 0.6;
    const _findFuzzyMatch = (arr, name) => {
      if (!arr || !name || typeof _modelSimilarity !== 'function') return null;
      for (const e of arr) {
        if (!e || !e.name) continue;
        if (_modelSimilarity(e.name, name) >= FUZZY_MERGE_THRESHOLD) return e;
      }
      return null;
    };
    if (analysis.traits) {
      analysis.traits.forEach(t => {
        let exist = state.traits.find(e => similarText(e.name, t.name))
                 || _findFuzzyMatch(state.traits, t.name);
        if (exist) mergeModelItem(exist, t);
        else {
          const conf = typeof t.confidence === 'number' ? t.confidence : 0.5;
          if (conf < NEW_THRESHOLD) return;
          state.traits.push({ id: 'trait_' + Date.now() + '_' + Math.random().toString(36).slice(2,6), ...t, user_verified: false, evidence_count: 1, created_at: new Date().toISOString() });
        }
      });
    }
    if (analysis.values) {
      analysis.values.forEach(v => {
        let exist = state.values.find(e => similarText(e.name, v.name))
                 || _findFuzzyMatch(state.values, v.name);
        if (exist) mergeModelItem(exist, v);
        else {
          const conf = typeof v.confidence === 'number' ? v.confidence : 0.5;
          if (conf < NEW_THRESHOLD) return;
          state.values.push({ id: 'val_' + Date.now() + '_' + Math.random().toString(36).slice(2,6), ...v, user_verified: false, evidence_count: 1, created_at: new Date().toISOString() });
        }
      });
    }
    if (analysis.patterns) {
      analysis.patterns.forEach(p => {
        let exist = state.patterns.find(e => similarText(e.name, p.name))
                 || _findFuzzyMatch(state.patterns, p.name);
        if (exist) mergeModelItem(exist, p);
        else {
          const conf = typeof p.confidence === 'number' ? p.confidence : 0.5;
          if (conf < NEW_THRESHOLD) return;
          state.patterns.push({ id: 'pat_' + Date.now() + '_' + Math.random().toString(36).slice(2,6), ...p, user_verified: false, evidence_count: 1, created_at: new Date().toISOString() });
        }
      });
    }
    if (analysis.case_formulation) {
      // V3.13.x: case_formulation도 덮어씌움 X. 추가 + similarText로 중복 합치기
      const cf = state.caseFormulation;
      cf.version = (cf.version || 0) + 1;
      cf.lastUpdated = new Date().toISOString();
      const mergeStrings = (existing, incoming) => {
        const out = [...(existing || [])];
        (incoming || []).forEach(item => {
          if (!item || typeof item !== 'string') return;
          if (!out.some(e => similarText(e, item))) out.push(item);
        });
        return out;
      };
      cf.problems = mergeStrings(cf.problems, analysis.case_formulation.problems);
      cf.mechanisms = mergeStrings(cf.mechanisms, analysis.case_formulation.mechanisms);
      cf.strengths = mergeStrings(cf.strengths, analysis.case_formulation.strengths);
    }
    // 사용자 명시 2026-05-09 (Phase 2 source 3): 새 항목 stash → 회전 카드 '새로 본 너' source.
    try {
      if (!state.rotatingCardState) state.rotatingCardState = {};
      if (!Array.isArray(state.rotatingCardState.newAnalysisItems)) state.rotatingCardState.newAnalysisItems = [];
      const _rcStash = state.rotatingCardState.newAnalysisItems;
      const _rcExistingIds = new Set(_rcStash.map(x => x.id));
      const _rcNow = new Date().toISOString();
      const _rcDescTrim = (s) => (typeof s === 'string') ? s.slice(0, 200) : '';
      (state.traits || []).forEach(t => {
        if (!t.id || _rcPrevIds.traits.has(t.id) || _rcExistingIds.has(t.id)) return;
        _rcStash.push({ kind: 'trait', id: t.id, name: t.name || '', description: _rcDescTrim(t.description || ''), detectedAt: _rcNow });
      });
      (state.values || []).forEach(v => {
        if (!v.id || _rcPrevIds.values.has(v.id) || _rcExistingIds.has(v.id)) return;
        _rcStash.push({ kind: 'value', id: v.id, name: v.name || '', description: _rcDescTrim(v.description || ''), detectedAt: _rcNow });
      });
      (state.patterns || []).forEach(p => {
        if (!p.id || _rcPrevIds.patterns.has(p.id) || _rcExistingIds.has(p.id)) return;
        _rcStash.push({ kind: 'pattern', id: p.id, name: p.name || '', description: _rcDescTrim(p.description || ''), detectedAt: _rcNow });
      });
      // 14일 지난 stash 자동 만료
      const _rcCutoff = Date.now() - 14 * 86400000;
      state.rotatingCardState.newAnalysisItems = _rcStash.filter(it =>
        it.detectedAt && new Date(it.detectedAt).getTime() > _rcCutoff
      );
    } catch (e) { console.warn('[rotating-card source 3 stash]', e); }

    state.lastForceAnalyzeAt = new Date().toISOString();
    saveState();
    renderModel(); renderModelPreview();
    // 사용자 명시 2026-05-26 ultrathink: 카드 총량 100+ 시 dedup nudge — 월 1회만.
    try {
      const _totalCards = (state.traits || []).length
                        + (state.values || []).length
                        + (state.patterns || []).length;
      const _monthKey = new Date().toISOString().slice(0, 7);
      if (_totalCards >= 100 && state._dedupNudgeShownMonth !== _monthKey) {
        state._dedupNudgeShownMonth = _monthKey;
        saveState();
        // showToast 가 silent toast 시간 후 dismiss. 사용자 인지 — 나 탭 🧹 버튼.
        if (typeof showToast === 'function') {
          showToast(`너에 대한 카드 ${_totalCards}장 쌓였어. 정리해볼래? 나 탭 🧹`);
        }
      }
    } catch (e) { console.warn('[dedup nudge]', e); }
    setSyncStatus('online');
    showToast(isAuto ? '🔍 일주일 모델 분석 자동 완료 ✦' : '분석 완료 ✦');
  } catch (err) {
    console.error(err);
    if (!isAuto) alert('분석 실패: ' + err.message);
    else console.warn('[force analyze auto] 실패:', err);
    setSyncStatus('error');
  }
}

// 사용자 요청 2026-04-30: 자동 분석 4단계 — 새벽 4시 cutoff 기반 트리거.
// 매일 / 매주 일요일 / 매월 1일 / 매분기 첫째달 1일 / 매년 1/1.

// 직전 매일 새벽 4시 cutoff (오늘 4AM 또는 어제 4AM)
function _lastDaily4amCutoff() {
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 4, 0, 0, 0);
  if (cutoff > now) cutoff.setDate(cutoff.getDate() - 1);
  return cutoff;
}

// 사용자 명시 2026-05-02 ultrathink: 리뷰 batch schedule 헬퍼 — 직전 schedule 시점.
// `_shouldRunSchedule(state.lastWeeklyReviewBatchAt, _lastWeekly4amCutoff())` 패턴으로 batch submit 자격 체크.

// 사용자 명시 2026-05-08 ultrathink (재): 직전 일요일 04:00 cutoff. (한국식 "일요일 새벽 4시" — 일요일 시작 후 4시간).
// 지금이 일요일 4AM 이전이면 = 지지난 일요일 4AM (이번 일요일 batch 아직 안 했음).
// 지금이 일요일 4AM 이후이면 = 이번 일요일 4AM (batch 자격).
function _lastWeekly4amCutoff() {
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 4, 0, 0, 0);
  // dayOfWeek: 0=일 1=월 ... 6=토. 일요일 = 0.
  const dow = cutoff.getDay();
  // 가장 가까운 과거 일요일까지 거슬러 (오늘이 일요일 4AM 이후면 0일, 월요일이면 1일, ..., 토요일이면 6일)
  const daysBack = (dow === 0) ? (cutoff <= now ? 0 : 7) : dow;
  cutoff.setDate(cutoff.getDate() - daysBack);
  // 만약 cutoff 가 미래면 (일요일 4AM 이전) 1주 더 거슬러
  if (cutoff > now) cutoff.setDate(cutoff.getDate() - 7);
  return cutoff;
}

// 직전 매월 1일 4AM cutoff. 이번 달 1일 4AM 이전 = 지난 달 1일 4AM. 이후 = 이번 달 1일 4AM.
function _lastMonthly4amCutoff() {
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth(), 1, 4, 0, 0, 0);
  if (cutoff > now) cutoff.setMonth(cutoff.getMonth() - 1);
  return cutoff;
}

// 직전 분기 첫 달 1일 4AM cutoff. 분기 = 1/4/7/10 월. 이번 분기 시작 4AM 이전 = 지난 분기 시작 4AM.
function _lastQuarterly4amCutoff() {
  const now = new Date();
  const month = now.getMonth();
  const quarterStartMonth = Math.floor(month / 3) * 3;  // 0/3/6/9
  const cutoff = new Date(now.getFullYear(), quarterStartMonth, 1, 4, 0, 0, 0);
  if (cutoff > now) cutoff.setMonth(cutoff.getMonth() - 3);
  return cutoff;
}

// 직전 1월 1일 4AM cutoff. 올해 1월 1일 4AM 이전 = 작년 1월 1일 4AM.
function _lastAnnual4amCutoff() {
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), 0, 1, 4, 0, 0, 0);
  if (cutoff > now) cutoff.setFullYear(cutoff.getFullYear() - 1);
  return cutoff;
}

// V4 (사용자 명시 2026-05-25 ultrathink): backlog cutoff helpers.
//   _lastXxx4amCutoff 직전 1개만 반환. backlog 자격 체크 위해 weeksAgo/monthsAgo offset 받는 variant.
//   _collectMissingReviews 에서 weekly 4주 / monthly 3개월 / quarterly 4분기 / annual 2년 backlog cover 용.
function _weeklyCutoffAt(weeksAgo) {
  const c = _lastWeekly4amCutoff();
  c.setDate(c.getDate() - 7 * (weeksAgo || 0));
  return c;
}
function _monthlyCutoffAt(monthsAgo) {
  const c = _lastMonthly4amCutoff();
  c.setMonth(c.getMonth() - (monthsAgo || 0));
  return c;
}
function _quarterlyCutoffAt(quartersAgo) {
  const c = _lastQuarterly4amCutoff();
  c.setMonth(c.getMonth() - 3 * (quartersAgo || 0));
  return c;
}
function _annualCutoffAt(yearsAgo) {
  const c = _lastAnnual4amCutoff();
  c.setFullYear(c.getFullYear() - (yearsAgo || 0));
  return c;
}

// V4 (사용자 명시 2026-05-25 ultrathink): review 빈 응답 sentinel.
//   diary 의 entry._aiSummaryFailed 와 동일 정책 — backend 가 succeeded 줬는데 parse fail / 빈 JSON 인 경우만 영구 skip.
//   transient fail (network / errored) 는 박지 X — 다음 진입에 자동 retry.
//   cap 50 개 — 오래된 거 drop (FIFO).
function _markReviewFailedKey(cycle, key) {
  const arrKey = cycle + 'ReviewsFailedKeys';
  state[arrKey] = state[arrKey] || [];
  if (!state[arrKey].includes(key)) state[arrKey].push(key);
  if (state[arrKey].length > 50) state[arrKey] = state[arrKey].slice(-50);
}

function _shouldRunSchedule(lastAt, cutoff) {
  if (!lastAt) return true;
  return new Date(lastAt) < cutoff;
}

// V4 (사용자 명시 2026-05-26 ultrathink): 가장 최근 일요일 KST 04:00 cutoff.
//   forceAnalyze 주 1회 자동 trigger 용 — maybeRunChapterCleanup step D 에서 사용.
//   지금이 이번 주 일요일 04:00 이전이면 저번 주 일요일 04:00 반환.
function _lastSunday4amCutoff() {
  const now = new Date();
  // KST 시간을 UTC 객체에 박는 trick: now + 9h
  const kstAsUtc = new Date(now.getTime() + 9 * 3600000);
  const day = kstAsUtc.getUTCDay();  // 0=Sun (KST 기준)
  const sundayKstAsUtc = new Date(kstAsUtc);
  sundayKstAsUtc.setUTCDate(kstAsUtc.getUTCDate() - day);
  sundayKstAsUtc.setUTCHours(4, 0, 0, 0);
  // KST → 진짜 UTC: -9h
  const sundayUtc = new Date(sundayKstAsUtc.getTime() - 9 * 3600000);
  if (sundayUtc.getTime() > now.getTime()) {
    return new Date(sundayUtc.getTime() - 7 * 86400000);
  }
  return sundayUtc;
}

// 매일 챕터 추출 — 어제 누적된 챕터들 1번 통합 추출.
// 사용자 명시 2026-05-02 ultrathink: 4AM extract = Anthropic Batch API 50% 할인 (사용자 자고 있어 latency 안 중요).
// 흐름: pending archive 모음 → batch submit + state.pendingBatch 넣음 + UI 인디케이터.
// 다음 사용자 활동 시 _resumePendingBatch 가 결과 fetch + 처리. 12h timeout 시 일반 API fallback.

// magic/reflection archive 자동 push 분리 (batch 결과 처리 + inline fallback 둘 다 사용).
function _pushMagicReflectionArchive(batch) {
  const archiveType = batch.source === 'magic_help' ? 'magic'
                    : batch.source === 'reflection_chat' ? 'reflection'
                    : null;
  if (!archiveType) return;
  try {
    const _dayKey = batch.date || todayKey();
    const _date = new Date(_dayKey + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    const _firstUser = (batch.messages || []).find(m => m.role === 'user');
    const _lastAssistant = [...(batch.messages || [])].reverse().find(m => m.role === 'assistant');
    const _body = (_lastAssistant?.content || _firstUser?.content || '').slice(0, 200);
    const _label = archiveType === 'magic' ? '🌀 마법' : '🌊 숙고';
    if (!Array.isArray(state.archive)) state.archive = [];
    state.archive.unshift({
      type: archiveType,
      headline: batch.summary || `${_label} 챕터`,
      body: _body,
      fullChat: (batch.messages || []).slice(),
      date: _date,
      source: _label,
      savedAt: new Date().toISOString(),
      tags: [archiveType === 'magic' ? '마법' : '숙고', '대화'],
      sourceChatArchiveId: batch.id,
      ...(batch.decisionId ? { decisionId: batch.decisionId } : {}),
      ...(batch.stepId ? { stepId: batch.stepId } : {}),
      ...(batch.reflectionQuestionId ? { reflectionQuestionId: batch.reflectionQuestionId } : {})
    });
  } catch (e) { console.warn('[archive push] fail:', e); }
}

// inline (일반 API) 처리 — submit 실패 시 fallback / 12h timeout fallback.
async function _runDailyExtractInline(pending) {
  // V4 (사용자 명시 2026-05-14 ultrathink): 옛 2026-05-06 정책 (비프리미엄 + 자동 분리 = topic 추출 skip) 폐기.
  //   모든 사용자 / 모든 분리 방식 (manual ✓ / 5h+ gap) 에 대해 chapter topic 추출 — 도서관 자연 누적.
  for (const batch of pending) {
    // V4 사용자 명시 2026-05-04: 추출 직전/직후 snapshot diff → 새 derived 항목에
    // sourceArchiveId 박음 (cascade soft delete 추적용).
    const _before = (typeof _captureDerivedSnapshot === 'function') ? _captureDerivedSnapshot() : null;
    // 사용자 명시 2026-05-08 ultrathink: _extractFromIndex 적용 — 이어서한 archive 의 옛 부분 input 제외.
    const _extractMsgs = (typeof _chapterExtractMessages === 'function') ? _chapterExtractMessages(batch) : (batch.messages || []);
    let _caseOk = false;
    try {
      // 사용자 명시 2026-05-10 (격리 강화 batch 12): 메시지 단위 분리 — 같은 챕터 안 시뮬 / 일반 혼재 시 각각 추출.
      //   옛: chapter 단위 isSimulation flag → 시뮬 1턴 + 일반 50턴 챕터 가 통째로 격리 → 일반 50턴 추출 누락.
      //   신: messages 의 isSimulationContext 별로 split → 일반 그룹 = 옛 흐름 / 시뮬 그룹 = isSim opt.
      const _normalMsgs = _extractMsgs.filter(m => !m || !m.isSimulationContext);
      const _simMsgs = _extractMsgs.filter(m => m && m.isSimulationContext);
      let _normalOk = true, _simOk = true;
      if (_normalMsgs.length >= 3) {
        _normalOk = !!(await extractChapterCaseAnalysis(_normalMsgs));
      }
      if (_simMsgs.length >= 3) {
        _simOk = !!(await extractChapterCaseAnalysis(_simMsgs, { isSimulation: true }));
      }
      _caseOk = _normalOk && _simOk;
    } catch (e) { console.warn('[inline] case fail:', e); }
    let _topicOk = false;  // V4 fix (사용자 보고 2026-05-22 ultrathink): topic silent fail 가시화 + _pendingExtract 보존 정책 강화용.
    try {
      // 사용자 명시 2026-05-10 (batch 14): 시뮬 메시지도 topic 추출 진행 — 단 topicCard 에 source: 'simulation' 마킹.
      //   도서관 일기·대화 chip 표시 시 '시나리오' 라벨로 구분.
      const _normalMsgs = _extractMsgs.filter(m => !m || !m.isSimulationContext);
      const _simMsgs = _extractMsgs.filter(m => m && m.isSimulationContext);
      if (typeof extractPreviousChapterTopics === 'function') {
        if (_normalMsgs.length >= 3) {
          await extractPreviousChapterTopics(_normalMsgs);
        }
        if (_simMsgs.length >= 3) {
          const _beforeSim = (state.topicCards || []).length;
          await extractPreviousChapterTopics(_simMsgs);
          // 새로 push 된 cards 에 source 마킹 (도서관 chip = '시나리오' 라벨)
          const _added = (state.topicCards || []).slice(_beforeSim);
          _added.forEach(card => { if (card) card.source = 'simulation'; });
        }
      }
      _topicOk = true;
    } catch (e) { console.warn('[inline] topic fail:', e); }
    _pushMagicReflectionArchive(batch);
    if (_before && typeof _stampSourceArchiveId === 'function') {
      _stampSourceArchiveId(_before, batch.id, batch);
    }
    // V4 fix (사용자 보고 2026-05-22 ultrathink): topic silent fail 시 _pendingExtract 보존.
    //   옛: case OK 만 보고 _pendingExtract 풀음 → topic catch fail 시 archive 데이터 (topic/headline) 누락된 채 마킹 풀림 = stuck-but-marked.
    //   새: case + topic 둘 다 OK 때만 _pendingExtract 풀음. case 만 OK 면 case 마커만 풀고 _pendingExtract 보존 (다음 trigger 시 topic 재시도).
    //   사용자 보고 2026-05-10 (audit batch 4): case_analysis fail 시 _pendingExtract 보존 — 다음 진입 시 재시도. (그대로 유지)
    if (_caseOk && _topicOk) {
      delete batch._pendingExtract;
      delete batch._pendingCaseAnalysis;
    } else if (_caseOk) {
      delete batch._pendingCaseAnalysis;
    }
    delete batch._batchSubmittedAt;
  }
  state.lastDailyChapterExtractAt = new Date().toISOString();
  saveState();
  if (typeof renderChatArchiveModal === 'function') renderChatArchiveModal();
  if (typeof renderArchive === 'function') renderArchive();
  // 사용자 명시 2026-05-02 ultrathink: batch 처리 끝 → 어제 카드 자동 갱신 (사용자 홈 보고 있으면 즉시 노출).
  if (typeof renderYesterdayCard === 'function') renderYesterdayCard();
  // 사용자 보고 2026-05-10 (audit batch 3): _runDailyExtractInline fallback path 에 renderModel 누락 → 나 탭 갱신 X.
  if (typeof renderModel === 'function') { try { renderModel(); } catch {} }
  if (typeof renderModelPreview === 'function') { try { renderModelPreview(); } catch {} }
}

// V4 (사용자 명시 2026-05-25 ultrathink): 옛 FEATURE_BATCH_REVIEWS / FEATURE_BATCH_DIARY 폐기.
//   review batch 가 chapter pending batch 와 분리됨 — 별 path (submitReviewChainBatch + maybeTriggerReviewChain).
//   diary 는 cleanup batch 단독 — inline path (runDiaryAutoSummaryIfNeeded) 폐기로 race 없음. flag 무의미.
const FEATURE_BATCH_REVIEWS = true;

// V4 (사용자 명시 2026-05-25 ultrathink): _buildReviewBatchRequests 폐기 (위 코멘트 참조).
//   대체: maybeTriggerReviewChain + submitReviewChainBatch (cooldown 폐기, key not in 자격).

// V4 (사용자 명시 2026-05-25 ultrathink): review trigger 재설계 — missing review list 자격 체크 helper.
//   옛 _buildReviewBatchRequests 의 cooldown stamp 정책 폐기. 새 자격:
//     1) cutoff 통과 (cutoffEnd <= now)
//     2) key not in state[cycle+'Reviews']
//     3) key not in state[cycle+'ReviewsFailedKeys'] (빈 응답 sentinel)
//     4) range entries >= 임계값 (weekly=3, monthly=7, quarterly=20, annual=90)
//   backlog 범위 (diary 의 7일 cover 와 대칭): weekly 4주 / monthly 3개월 / quarterly 4분기 / annual 2년.
//     이전 spec 은 직전 1주기만 — backend stuck / 일시적 fail 시 backlog 영영 누락 (W18, W20 사례).
//     entries 임계값 가드가 자연 cap 역할 — 데이터 진짜 있던 주만 검출.
//   range 기준: archive.date / entries.date 둘 다 dayK (4AM 기준). cutoffEnd 의 _toLocalDateISO 와 비교.
function _collectMissingReviews(now) {
  now = now || new Date();
  const missing = [];
  const _toISO = (d) => {
    if (!d) return '';
    const dd = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dd.getTime())) return '';
    const y = dd.getFullYear();
    const m = String(dd.getMonth() + 1).padStart(2, '0');
    const day = String(dd.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const _entriesInRange = (startISO, endISO) =>
    (state.entries || []).filter(e => e && e.date && e.date >= startISO && e.date < endISO);

  // weekly: 직전 4주 backlog
  for (let weeksAgo = 0; weeksAgo < 4; weeksAgo++) {
    const wEnd = _weeklyCutoffAt(weeksAgo);
    if (!wEnd || wEnd > now) continue;
    const wStart = new Date(wEnd.getTime() - 7 * 86400000);
    const weekKey = (typeof getWeekKey === 'function') ? getWeekKey(wEnd) : null;
    if (!weekKey) continue;
    if ((state.weeklyReviews || []).some(r => r && r.weekKey === weekKey)) continue;
    if ((state.weeklyReviewsFailedKeys || []).includes(weekKey)) continue;
    const ents = _entriesInRange(_toISO(wStart), _toISO(wEnd));
    if (ents.length >= 3) missing.push({ cycle: 'weekly', key: weekKey, cutoff: wStart, cutoffEnd: wEnd, entriesCount: ents.length });
  }

  // monthly: 직전 3개월 backlog
  for (let monthsAgo = 0; monthsAgo < 3; monthsAgo++) {
    const mEnd = _monthlyCutoffAt(monthsAgo);
    if (!mEnd || mEnd > now) continue;
    const mStart = new Date(mEnd.getFullYear(), mEnd.getMonth() - 1, 1, 4, 0, 0, 0);
    const monthKey = (typeof getMonthKey === 'function') ? getMonthKey(mStart) : null;
    if (!monthKey) continue;
    if ((state.monthlyReviews || []).some(r => r && r.monthKey === monthKey)) continue;
    if ((state.monthlyReviewsFailedKeys || []).includes(monthKey)) continue;
    const ents = _entriesInRange(_toISO(mStart), _toISO(mEnd));
    if (ents.length >= 7) missing.push({ cycle: 'monthly', key: monthKey, cutoff: mStart, cutoffEnd: mEnd, entriesCount: ents.length });
  }

  // quarterly: 직전 4분기 backlog
  for (let quartersAgo = 0; quartersAgo < 4; quartersAgo++) {
    const qEnd = _quarterlyCutoffAt(quartersAgo);
    if (!qEnd || qEnd > now) continue;
    const qStart = new Date(qEnd.getFullYear(), qEnd.getMonth() - 3, 1, 4, 0, 0, 0);
    const quarterKey = (typeof getQuarterKey === 'function') ? getQuarterKey(qStart) : null;
    if (!quarterKey) continue;
    if ((state.quarterlyReviews || []).some(r => r && r.quarterKey === quarterKey)) continue;
    if ((state.quarterlyReviewsFailedKeys || []).includes(quarterKey)) continue;
    const ents = _entriesInRange(_toISO(qStart), _toISO(qEnd));
    if (ents.length >= 20) missing.push({ cycle: 'quarterly', key: quarterKey, cutoff: qStart, cutoffEnd: qEnd, entriesCount: ents.length });
  }

  // annual: 직전 2년 backlog
  for (let yearsAgo = 0; yearsAgo < 2; yearsAgo++) {
    const aEnd = _annualCutoffAt(yearsAgo);
    if (!aEnd || aEnd > now) continue;
    const aStart = new Date(aEnd.getFullYear() - 1, 0, 1, 4, 0, 0, 0);
    const prevYear = aStart.getFullYear();
    if ((state.annualReviews || []).some(r => r && r.year === prevYear)) continue;
    if ((state.annualReviewsFailedKeys || []).includes(prevYear)) continue;
    const ents = _entriesInRange(_toISO(aStart), _toISO(aEnd));
    if (ents.length >= 90) missing.push({ cycle: 'annual', key: prevYear, cutoff: aStart, cutoffEnd: aEnd, entriesCount: ents.length });
  }

  return missing;
}

// V4 (사용자 명시 2026-05-25 ultrathink): diary auto summary batch — 어제부터 7일 거슬러 missing entry 의 request 추가.
//   조건 단순화: !entry.diary (사용자 직접 일기 X) + !entry.aiSummary (idempotent) + !entry._aiSummaryFailed (empty response sentinel) + !entry._seed (testerMode 분기) + dateKey ≠ todayKey (cutoff-aware, 2026-05-17 fix).
//   옛 hasContext 가드 / _pendingDiarySummary 마커 / inline retry guard (_aiSummaryAttempts, _aiSummaryLastAttemptAt) 폐기 — batch lastChapterCleanupAt stamp 가 24h cooldown 자연 역할.
function _buildDiaryBatchRequests() {
  const requests = [];
  const pendingDates = [];

  // 사용자 보고 2026-05-17 ultrathink: 앵커 = todayKey() (cutoff-aware), setDate(-i) on 그 앵커의 noon. dateKey === todayKey() 가드 추가.
  const _todayDk = (typeof todayKey === 'function') ? todayKey() : null;
  const _isTesterBD = !!(state.preferences && state.preferences.testerMode);
  for (let i = 1; i <= 7; i++) {
    let dateKey;
    if (_todayDk) {
      const _anchor = new Date(_todayDk + 'T12:00:00');
      _anchor.setDate(_anchor.getDate() - i);
      const _y = _anchor.getFullYear();
      const _m = String(_anchor.getMonth() + 1).padStart(2, '0');
      const _d = String(_anchor.getDate()).padStart(2, '0');
      dateKey = `${_y}-${_m}-${_d}`;
    } else {
      const noon = new Date();
      noon.setHours(12, 0, 0, 0);
      noon.setDate(noon.getDate() - i);
      dateKey = (typeof getDayKey === 'function') ? getDayKey(noon) : noon.toISOString().split('T')[0];
    }
    if (_todayDk && dateKey === _todayDk) continue;  // 오늘 entry 절대 batch 안 포함

    const entry = (state.entries || []).find(e => e.date === dateKey);
    if (!entry) continue;
    if (entry.diary) continue;             // 사용자 직접 일기 — 우선
    if (entry.aiSummary) continue;         // 이미 aiSummary 있음 (idempotent)
    if (entry._aiSummaryFailed) continue;  // backend _emptyResponse sentinel — 영구 skip
    if (!_isTesterBD && entry._seed) continue;  // B16 시드 entry 제외

    let messages = (state.chatMessages || []).filter(m =>
      m.timestamp && (typeof getDayKey === 'function' ? getDayKey(m.timestamp) : '') === dateKey && !m.typing && !m.error
      && (_isTesterBD || !m._seed)
    );
    if (messages.length < 2) {
      const archived = (state.chatArchive || []).find(a => a.date === dateKey && !a._deleted && (_isTesterBD || !a._seed));
      if (archived && Array.isArray(archived.messages)) {
        messages = archived.messages.filter(m => _isTesterBD || !m._seed);
      }
    }

    const spec = _buildDiarySummaryPrompt(dateKey, messages, entry);
    // V4 (사용자 명시 2026-05-25 ultrathink): case_/topic_ batch 와 동일 구조 — _endpoint/_vars 박음.
    //   현재 chat-batch.ts 는 raw passthrough 라 backend 합성 X (별 fix 사항 — 단 일관 구조 유지).
    requests.push({
      custom_id: `diary_${dateKey}`,
      params: {
        model: spec.model,
        max_tokens: spec.max_tokens,
        messages: [{ role: 'user', content: '' }],
        _endpoint: spec._endpoint,
        _vars: spec._vars
      }
    });
    pendingDates.push(dateKey);
  }

  return { requests, pendingDates };
}

// V4 (사용자 명시 2026-05-25 ultrathink): _submitDailyExtractBatch 폐기.
//   옛: chapter case (inline Sonnet) + topic (batch Haiku) + review (batch) + diary (batch) 한 batch_id 통합 — review trigger 가 chapter pending 의 부수 효과 = hidden coupling.
//   새 spec: chapter cleanup (case Opus + topic + diary) + review chain (review + insight) 별 batch_id.
//   대체 함수: submitChapterCleanupBatch + submitReviewChainBatch.

// pending batch 결과 fetch + 처리. 사용자 활동 시점 (앱 진입 / 다음 4AM) 호출.
async function _resumePendingBatch() {
  const pb = state.pendingBatch;
  if (!pb || !pb.batch_id) return;

  // V4 (사용자 명시 2026-05-26 ultrathink): 24h hard cap — status fetch 시도 전.
  //   Anthropic batch retention 끝나 status 가 404 영영 fail 시 statusFailCount 가 페이지 진입 단위 1씩만 누적 → 3회 도달 X → 영구 stuck.
  //   진단: 옛 batch msgbatch_01DvpXgPgdGWt71CteG2v6tQ 가 5/24 04:00 W21 cutoff 직후 (backend chat-batch.ts fix 직전) 제출되어 errored + retention 후 stuck.
  //   fix: submitted_at 24h+ 면 status 무관 즉시 timeout fallback.
  if (pb.submitted_at && Date.now() - pb.submitted_at > 24 * 3600 * 1000) {
    console.warn('[batch] 24h hard cap — submitted_at:', new Date(pb.submitted_at).toISOString(), '→ timeout');
    await _timeoutPendingBatch();
    return;
  }

  try {
    // status check
    const statusResp = await _authedFetch('/api/chat-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
      body: JSON.stringify({ action: 'status', batch_id: pb.batch_id })
    });
    if (!statusResp.ok) {
      console.warn('[batch status] fail:', statusResp.status);
      // V4 (사용자 명시 2026-05-26 ultrathink): 4xx 즉시 escape — 404/410 = retention 끝 (영구 fail). 5xx 만 fail count 누적.
      if (statusResp.status === 404 || statusResp.status === 410) {
        console.warn('[batch] status', statusResp.status, '— retention 끝, 즉시 timeout fallback');
        await _timeoutPendingBatch();
        return;
      }
      // 사용자 보고 2026-05-10 (audit batch 3): fail count 누적 → 3회 이상 시 timeout fallback (영구 stuck 회피).
      state.pendingBatch.statusFailCount = (state.pendingBatch.statusFailCount || 0) + 1;
      if (state.pendingBatch.statusFailCount >= 3) {
        console.warn('[batch] status fail 3회 이상 — timeout fallback');
        await _timeoutPendingBatch();
        return;
      }
      saveState();
      return;
    }
    const status = await statusResp.json();
    // status ok = fail count reset (부분 회복 케이스)
    if (state.pendingBatch.statusFailCount) delete state.pendingBatch.statusFailCount;
    if (status.processing_status !== 'ended') {
      console.log(`[batch] still processing — ${JSON.stringify(status.request_counts || {})}`);
      // 사용자 보고 2026-05-10 (audit batch 3): 6h 이상 not ended = stuck 의심 → timeout fallback (Anthropic Batch typical < 1h).
      const submittedMs = state.pendingBatch.submitted_at || 0;
      if (submittedMs > 0 && Date.now() - submittedMs > 6 * 3600 * 1000) {
        console.warn('[batch] 6h+ not ended — timeout fallback');
        await _timeoutPendingBatch();
      }
      return;
    }

    // ended — 결과 fetch
    const resultsResp = await _authedFetch('/api/chat-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
      body: JSON.stringify({ action: 'results', batch_id: pb.batch_id })
    });
    if (!resultsResp.ok) {
      console.warn('[batch results] fail:', resultsResp.status);
      state.pendingBatch.resultsFailCount = (state.pendingBatch.resultsFailCount || 0) + 1;
      if (state.pendingBatch.resultsFailCount >= 3) {
        console.warn('[batch] results fail 3회 이상 — timeout fallback');
        await _timeoutPendingBatch();
        return;
      }
      saveState();
      return;
    }
    const data = await resultsResp.json();
    if (!data.ok || !Array.isArray(data.results)) {
      console.warn('[batch results] invalid:', data);
      state.pendingBatch.dataInvalidCount = (state.pendingBatch.dataInvalidCount || 0) + 1;
      if (state.pendingBatch.dataInvalidCount >= 3) {
        console.warn('[batch] results invalid 3회 이상 — timeout fallback');
        await _timeoutPendingBatch();
        return;
      }
      saveState();
      return;
    }

    for (const r of data.results) {
      if (r?.result?.type !== 'succeeded') {
        console.warn(`[batch] ${r.custom_id} = ${r.result?.type}`);
        continue;
      }
      const msg = r.result.message;
      const text = msg?.content?.[0]?.text || '';
      const customId = r.custom_id || '';
      // 사용자 명시 2026-05-02 ultrathink: review_weekly_<key> / review_monthly_<key> / review_quarterly_<key> / review_annual_<year> 분기 추가.
      // prefix 'review_' 면 review type batch — 별도 처리.
      if (customId.startsWith('review_')) {
        try {
          // review_weekly_2026-W18 → ['review', 'weekly', '2026-W18'] (split 가 - 도 분리하므로 첫 _ 만 분리)
          const restAfterReview = customId.slice('review_'.length);
          const firstUnder = restAfterReview.indexOf('_');
          const reviewType = firstUnder < 0 ? restAfterReview : restAfterReview.slice(0, firstUnder);
          const reviewKey = firstUnder < 0 ? '' : restAfterReview.slice(firstUnder + 1);
          if (reviewType === 'weekly' || reviewType === 'monthly') {
            const json = _processReviewResult(text);
            // 사용자 명시 2026-05-09 ultrathink: batch path 도 quotes 환각 방지 (best-effort — cutoff 변동 가능성 있어도 entries 매칭은 보존됨).
            if (json && Array.isArray(json.quotes) && typeof _filterValidQuotes === 'function' && typeof _collectReviewData === 'function') {
              try {
                const _data = _collectReviewData(reviewType);
                json.quotes = _filterValidQuotes(json.quotes, _collectQuoteSources(_data));
              } catch {}
            }
            if (json) {
              // 사용자 명시 2026-05-10 (batch 9): weekly 신 schema 4 섹션만 store. 옛 field (pattern/strengths/quotes/emotions/cycles/value_align/risk_signals) 가 prompt 변경 후엔 안 와도 옛 cache 응답 강건.
              const _common = {
                id: (reviewType === 'weekly' ? 'wr_' : 'mr_') + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                type: reviewType,
                completedAt: new Date().toISOString(),
                auto: true
              };
              const review = reviewType === 'weekly' ? {
                ..._common,
                one_word_weekly: json.one_word_weekly,
                momentum_line: json.momentum_line,  // 사용자 명시 2026-05-10: MOMENTUM 보충 한 문장
                scenes: json.scenes,
                flow: json.flow,
                cycles: json.cycles,                // 사용자 명시 2026-05-10: 사이클
                soft_notice: json.soft_notice,
                seeds: json.seeds,
              } : {
                ..._common,
                ...json,  // monthly = 옛 schema 그대로 (pattern/strengths/cycles/emotions/etc.)
              };
              if (reviewType === 'weekly') review.weekKey = reviewKey;
              else review.monthKey = reviewKey;
              const arrKey = reviewType === 'weekly' ? 'weeklyReviews' : 'monthlyReviews';
              state[arrKey] = state[arrKey] || [];
              // 동일 key 중복 차단 (idempotent)
              const exists = state[arrKey].find(v => (reviewType === 'weekly' ? v.weekKey : v.monthKey) === reviewKey);
              if (!exists) state[arrKey].unshift(review);
            }
          } else if (reviewType === 'quarterly') {
            const json = _processQuarterlyReviewResult(text);
            // 사용자 명시 2026-05-09 ultrathink: batch path quotes 환각 방지 + transformation 인용 검증.
            if (json && typeof _filterValidQuotes === 'function' && typeof _collectQuarterlyData === 'function') {
              try {
                const _stats = (typeof getQuarterlyStats === 'function' && getQuarterlyStats(reviewKey)) || {};
                const _data = _collectQuarterlyData(reviewKey, _stats);
                const _sources = _collectQuoteSources(_data);
                if (Array.isArray(json.quotes)) json.quotes = _filterValidQuotes(json.quotes, _sources);
                if (json.transformation && typeof json.transformation === 'object') {
                  json.transformation.start_quote = _verifySingleQuote(json.transformation.start_quote, _sources);
                  json.transformation.end_quote = _verifySingleQuote(json.transformation.end_quote, _sources);
                }
              } catch {}
            }
            if (json) {
              const stats = (typeof getQuarterlyStats === 'function' && getQuarterlyStats(reviewKey)) || {};
              const review = {
                id: 'qr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                quarterKey: reviewKey,
                completedAt: new Date().toISOString(),
                stats,
                summary: json.summary || '',
                sections: Array.isArray(json.sections) ? json.sections : [],
                one_word: json.one_word,
                pattern: json.pattern,
                turning_point: json.turning_point,
                transformation: json.transformation,
                continuity: json.continuity,
                quotes: json.quotes,
                experiment: json.experiment,
                seeds: json.seeds,
                seed_callbacks: json.seed_callbacks,
                auto: true
              };
              state.quarterlyReviews = state.quarterlyReviews || [];
              const exists = state.quarterlyReviews.find(v => v.quarterKey === reviewKey);
              if (!exists) state.quarterlyReviews.push(review);
            }
          } else if (reviewType === 'annual') {
            const narrative = _robustJsonExtract(text);
            if (narrative) {
              const year = parseInt(reviewKey, 10);
              // 사용자 명시 2026-05-08 ultrathink: idempotent — 같은 year 이미 있으면 skip (user_viewed 보존).
              //   _processAnnualReviewResult 는 filter+unshift 패턴이라 user_viewed 잃을 수 있음. batch 경로에서 별도 가드.
              const existsAnnual = (state.annualReviews || []).find(r => r.year === year);
              if (!existsAnnual) {
                const data = _collectAnnualData(year);
                const annualReview = _processAnnualReviewResult(narrative, year, data, false);
                // batch path = auto: true (사용자가 click 안 함 — fresh 처리)
                if (annualReview) annualReview.auto = true;
              }
            }
          }
        } catch (e) { console.warn('[batch review] fail:', customId, e); }
        continue;
      }
      // V4 (사용자 명시 2026-05-25 ultrathink): legacy schema diary 분기 — 빈 응답 시 _aiSummaryFailed 영구 마킹.
      if (customId.startsWith('diary_')) {
        try {
          const dateKey = customId.slice('diary_'.length);
          const summary = _processDiarySummaryResult(text);
          const entry = (state.entries || []).find(e => e.date === dateKey);
          if (entry) {
            if (summary && summary.length > 0) {
              entry.aiSummary = summary;
              entry.dailySource = 'auto';
            } else {
              entry._aiSummaryFailed = true;
              entry._aiSummaryFailReason = 'empty_batch_response';
            }
          }
        } catch (e) { console.warn('[batch diary] fail:', customId, e); }
        continue;
      }
      // chapter / topic 기존 흐름
      const idx = customId.indexOf('_');
      if (idx < 0) continue;
      const type = customId.slice(0, idx);
      const archiveId = customId.slice(idx + 1);
      const archiveItem = (state.chatArchive || []).find(a => a.id === archiveId);
      if (!archiveItem || archiveItem._deleted) continue;

      // V4 사용자 명시 2026-05-04: 추출 직전/직후 snapshot diff → 새 derived 항목에
      // sourceArchiveId 박음 (cascade soft delete 추적용).
      const _before = (typeof _captureDerivedSnapshot === 'function') ? _captureDerivedSnapshot() : null;
      try {
        if (type === 'case') {
          const jm = text.match(/\{[\s\S]*\}/);
          if (jm) {
            try {
              const analysis = JSON.parse(jm[0]);
              _processExtractChapterAnalysis(analysis);
            } catch (e) { console.warn('[batch case] JSON parse fail:', e); }
          }
        } else if (type === 'topic') {
          let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
          const jm = cleaned.match(/\{[\s\S]*\}/);
          if (jm) {
            try {
              const parsed = JSON.parse(jm[0]);
              _processExtractTopicData(parsed, archiveItem.messages);
            } catch (e) { console.warn('[batch topic] JSON parse fail:', e); }
          }
        }
      } catch (e) { console.warn('[batch result process] fail:', customId, e); }
      if (_before && typeof _stampSourceArchiveId === 'function') {
        _stampSourceArchiveId(_before, archiveItem.id, archiveItem);
      }
    }

    // 정리 — pending 마커 제거 + magic/reflection archive push
    (state.chatArchive || []).forEach(a => {
      if (pb.archive_ids?.includes(a.id)) {
        const _bef = (typeof _captureDerivedSnapshot === 'function') ? _captureDerivedSnapshot() : null;
        _pushMagicReflectionArchive(a);
        if (_bef && typeof _stampSourceArchiveId === 'function') {
          _stampSourceArchiveId(_bef, a.id, a);
        }
        delete a._pendingExtract;
        delete a._pendingCaseAnalysis;
        delete a._batchSubmittedAt;
      }
    });
    state.pendingBatch = null;
    saveState();
    if (typeof renderChatArchiveModal === 'function') renderChatArchiveModal();
    if (typeof renderArchive === 'function') renderArchive();
    // 사용자 명시 2026-05-02 ultrathink: batch 처리 끝 → 어제 카드 + 리뷰 카드 자동 갱신.
    if (typeof renderYesterdayCard === 'function') renderYesterdayCard();
    if (typeof renderReviewPrompts === 'function') renderReviewPrompts();
    // 사용자 보고 2026-05-05: 4시 cutoff batch 후 traits/values/patterns/caseFormulation 갱신돼도 "나" 탭 안 보였던 버그 — renderModel 호출 누락.
    if (typeof renderModel === 'function') renderModel();
    if (typeof renderModelPreview === 'function') renderModelPreview();
    console.log(`[batch] ${data.results.length} results processed`);
  } catch (e) {
    console.warn('[batch] resume fail:', e);
  }
}

// 사용자 명시 2026-05-02 ultrathink: 리뷰 batch fail / 12h timeout 시 inline fallback.
// 각 type 별 generate* 직접 호출 (일반 API 1-2분 대기) → state.*Reviews push.
async function _runReviewExtractInline(reviewTypes, reviewKeys) {
  reviewKeys = reviewKeys || {};
  for (const type of reviewTypes) {
    try {
      if (type === 'weekly' || type === 'monthly') {
        const json = await generateReview(type);
        if (json) {
          const data = _collectReviewData(type);
          // 사용자 보고 2026-05-10: weekly weekKey = cutoffEnd 기준. monthly 는 cutoff (지난 달 시작) 그대로.
          const key = type === 'weekly' ? getWeekKey(data.cutoffEnd || data.cutoff) : getMonthKey(data.cutoff);
          const review = {
            id: (type === 'weekly' ? 'wr_' : 'mr_') + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            type, completedAt: new Date().toISOString(),
            ...json, auto: true
          };
          if (type === 'weekly') review.weekKey = key; else review.monthKey = key;
          const arrKey = type === 'weekly' ? 'weeklyReviews' : 'monthlyReviews';
          state[arrKey] = state[arrKey] || [];
          const exists = state[arrKey].find(v => (type === 'weekly' ? v.weekKey : v.monthKey) === key);
          if (!exists) state[arrKey].unshift(review);
        }
      } else if (type === 'quarterly') {
        const now = new Date();
        const Q = Math.floor(now.getMonth() / 3) + 1;
        const prevQuarterKey = reviewKeys.quarterly || (Q === 1 ? `${now.getFullYear() - 1}-Q4` : `${now.getFullYear()}-Q${Q - 1}`);
        const stats = (typeof getQuarterlyStats === 'function' && getQuarterlyStats(prevQuarterKey)) || {};
        const aiReview = await generateQuarterlyReview(prevQuarterKey, stats);
        if (aiReview) {
          const review = {
            id: 'qr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            quarterKey: prevQuarterKey, completedAt: new Date().toISOString(),
            stats, ...aiReview, auto: true
          };
          state.quarterlyReviews = state.quarterlyReviews || [];
          const exists = state.quarterlyReviews.find(v => v.quarterKey === prevQuarterKey);
          if (!exists) state.quarterlyReviews.push(review);
        }
      } else if (type === 'annual') {
        const prevYear = reviewKeys.annual || (new Date().getFullYear() - 1);
        await generateAnnualReview(prevYear);  // 자체 state.annualReviews push
      }
    } catch (e) { console.warn(`[review inline ${type}] fail:`, e); }
  }
  saveState();
  if (typeof renderReviewPrompts === 'function') renderReviewPrompts();
}

// 12h timeout fallback — batch 결과 안 와도 일반 API 으로 즉시 처리.
async function _timeoutPendingBatch() {
  console.warn('[batch] 12h timeout — fallback 일반 API');
  const pb = state.pendingBatch;
  if (!pb) return;
  const targets = (state.chatArchive || []).filter(a =>
    pb.archive_ids?.includes(a.id) && !a._deleted && (a._pendingExtract || a._pendingCaseAnalysis)
  );
  // 사용자 명시 2026-05-02 ultrathink: review_pending / diary_pending_dates 안 것 들 inline fallback.
  const reviewTypes = Array.isArray(pb.review_pending) ? pb.review_pending.slice() : [];
  const reviewKeys = pb.review_keys || {};
  const diaryDates = Array.isArray(pb.diary_pending_dates) ? pb.diary_pending_dates.slice() : [];
  state.pendingBatch = null;
  if (targets.length > 0) {
    await _runDailyExtractInline(targets);
  }
  if (reviewTypes.length > 0) {
    await _runReviewExtractInline(reviewTypes, reviewKeys);
  }
  // V4 (사용자 명시 2026-05-25 ultrathink): inline diary path 폐기 → _pendingDiarySummary 마커 자체 X.
  //   timeout 시 diary 는 다음 cleanup batch (4AM cutoff) 까지 자연 대기.
  if (targets.length === 0 && reviewTypes.length === 0 && diaryDates.length === 0) {
    saveState();
  }
  // 사용자 보고 2026-05-10 (audit batch 3): timeout fallback 후 홈 카드들 갱신 — pendingBatch null 됐으니 yesterdayCard / 주간 리뷰 카드 hide 가드 풀림.
  if (typeof renderYesterdayCard === 'function') { try { renderYesterdayCard(); } catch {} }
  if (typeof renderReviewPrompts === 'function') { try { renderReviewPrompts(); } catch {} }
  if (typeof renderModel === 'function') { try { renderModel(); } catch {} }
  if (typeof renderModelPreview === 'function') { try { renderModelPreview(); } catch {} }
}

// V4 (사용자 명시 2026-05-25 ultrathink): 신규 chapter cleanup batch — 옛 _submitDailyExtractBatch + _resumePendingBatch 의 chapter+topic+diary 부분만 분리.
//   review batch 는 별 path (review chain, step 3 신규). step 4 swap 까지 호출 X — 정의만.
//   case_analysis = Opus 4-7 (옛 Sonnet inline 폐기), topic = Haiku 4-5, diary = 옛 builder 재사용.
//   chain: cleanup 결과 도착 시 → archive._cleanedAt stamp → maybeTriggerReviewChain (step 3) 호출.
//   부분 성공 처리 (η): case + topic 둘 다 OK 일 때만 _cleanedAt + _pendingCleanup delete. 한쪽만 OK 면 _pendingCleanup 보존 → 다음 trigger 재시도.

async function submitChapterCleanupBatch(unprocessed) {
  unprocessed = Array.isArray(unprocessed) ? unprocessed : [];
  const requests = [];

  // case_analysis (Opus 4-7) per archive
  for (const batch of unprocessed) {
    if (!batch || !batch.id) continue;
    const _msgs = (typeof _chapterExtractMessages === 'function') ? _chapterExtractMessages(batch) : batch.messages;
    if (!Array.isArray(_msgs) || _msgs.length < 3) continue;
    const _normalMsgs = _msgs.filter(m => !m || !m.isSimulationContext);
    if (_normalMsgs.length < 3) continue;
    const _chatLog = _normalMsgs.map(m => {
      const role = m.role === 'user' ? '나' : '소라';
      let content = (m.content || '').replace(/```json[\s\S]*?```/g, '').trim();
      content = content.replace(/\{[\s\S]*"(?:new_traits|insight)[\s\S]*\}\s*$/g, '').trim();
      return `${role}: ${content}`;
    }).join('\n\n');
    const _maxTok = _normalMsgs.length >= 60 ? 4000 : (_normalMsgs.length >= 20 ? 2500 : 1500);
    requests.push({
      custom_id: `case_${batch.id}`,
      params: {
        // V4 (사용자 명시 2026-05-26 ultrathink): Opus 4-7 → Sonnet 4-6 다운.
        //   매일 4AM cleanup batch = 자주 발화 → Sonnet 으로 저렴.
        //   주 1회 forceAnalyze (Opus) 가 통합 깊은 분석 담당.
        model: 'claude-sonnet-4-6',
        max_tokens: _maxTok,
        messages: [{ role: 'user', content: '' }],
        _endpoint: 'extract_chapter',
        _userContentType: 'chapter_topics',
        _vars: { chatLog: _chatLog.slice(0, 8000), isSim: false }
      }
    });
  }

  // topic_extract (Haiku 4-5) per archive
  for (const batch of unprocessed) {
    if (!batch || !batch.id) continue;
    const _msgs = (typeof _chapterExtractMessages === 'function') ? _chapterExtractMessages(batch) : batch.messages;
    if (!Array.isArray(_msgs) || _msgs.length < 3) continue;
    if (typeof _buildExtractTopicPrompt !== 'function') continue;
    requests.push({
      custom_id: `topic_${batch.id}`,
      params: {
        model: 'claude-haiku-4-5',
        max_tokens: 600,
        messages: [{ role: 'user', content: '' }],
        _endpoint: 'extract_topic',
        _userContentType: 'chapter_chat',
        _vars: _buildExtractTopicPrompt(_msgs)
      }
    });
  }

  // diary auto summary (지난 7일 missing) — 옛 builder 재사용
  const diaryBatch = (typeof _buildDiaryBatchRequests === 'function') ? _buildDiaryBatchRequests() : { requests: [], pendingDates: [] };
  requests.push(...diaryBatch.requests);

  if (requests.length === 0) {
    state.lastChapterCleanupAt = new Date().toISOString();
    saveState();
    return;
  }

  console.log(`[cleanup batch] ${unprocessed.length} 챕터 + ${diaryBatch.pendingDates.length} 일기 → ${requests.length} requests submit`);

  try {
    const resp = await _authedFetch('/api/chat-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
      body: JSON.stringify({ action: 'submit', requests })
    });
    if (!resp.ok) throw new Error('batch submit failed: ' + resp.status);
    const data = await resp.json();
    if (!data.id) throw new Error('batch_id 없음');

    state.pendingChapterCleanupBatch = {
      batch_id: data.id,
      submitted_at: Date.now(),
      archive_ids: unprocessed.map(p => p.id),
      diary_pending_dates: diaryBatch.pendingDates
    };
    unprocessed.forEach(b => { b._batchSubmittedAt = Date.now(); });
    state.lastChapterCleanupAt = new Date().toISOString();
    saveState();
    console.log(`[cleanup batch] submitted: ${data.id}`);
    if (typeof renderChatArchiveModal === 'function') renderChatArchiveModal();
  } catch (e) {
    console.warn('[cleanup batch] submit fail — fallback 일반 API:', e);
    // V4 (사용자 명시 2026-05-25 ultrathink): _pendingDiarySummary 마커 자체 X — diary 는 다음 4AM cutoff 까지 자연 대기.
    if (typeof _runDailyExtractInline === 'function') {
      await _runDailyExtractInline(unprocessed);
    }
  }
}

async function _resumeChapterCleanupBatch() {
  const pb = state.pendingChapterCleanupBatch;
  if (!pb || !pb.batch_id) return;

  // V4 (사용자 명시 2026-05-26 ultrathink): 24h hard cap — _resumePendingBatch 와 동일 패턴.
  if (pb.submitted_at && Date.now() - pb.submitted_at > 24 * 3600 * 1000) {
    console.warn('[cleanup batch] 24h hard cap — submitted_at:', new Date(pb.submitted_at).toISOString(), '→ timeout');
    await _timeoutChapterCleanupBatch();
    return;
  }

  try {
    // status check
    const statusResp = await _authedFetch('/api/chat-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
      body: JSON.stringify({ action: 'status', batch_id: pb.batch_id })
    });
    if (!statusResp.ok) {
      // V4 (사용자 명시 2026-05-26 ultrathink): 4xx 즉시 escape.
      if (statusResp.status === 404 || statusResp.status === 410) {
        console.warn('[cleanup batch] status', statusResp.status, '— retention 끝, 즉시 timeout');
        await _timeoutChapterCleanupBatch();
        return;
      }
      state.pendingChapterCleanupBatch.statusFailCount = (state.pendingChapterCleanupBatch.statusFailCount || 0) + 1;
      if (state.pendingChapterCleanupBatch.statusFailCount >= 3) {
        await _timeoutChapterCleanupBatch();
        return;
      }
      saveState();
      return;
    }
    const status = await statusResp.json();
    if (state.pendingChapterCleanupBatch.statusFailCount) delete state.pendingChapterCleanupBatch.statusFailCount;
    if (status.processing_status !== 'ended') {
      const submittedMs = state.pendingChapterCleanupBatch.submitted_at || 0;
      if (submittedMs > 0 && Date.now() - submittedMs > 12 * 3600 * 1000) {
        await _timeoutChapterCleanupBatch();
      }
      return;
    }

    // ended — results fetch
    const resultsResp = await _authedFetch('/api/chat-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
      body: JSON.stringify({ action: 'results', batch_id: pb.batch_id })
    });
    if (!resultsResp.ok) {
      state.pendingChapterCleanupBatch.resultsFailCount = (state.pendingChapterCleanupBatch.resultsFailCount || 0) + 1;
      if (state.pendingChapterCleanupBatch.resultsFailCount >= 3) {
        await _timeoutChapterCleanupBatch();
        return;
      }
      saveState();
      return;
    }
    const data = await resultsResp.json();
    if (!data.ok || !Array.isArray(data.results)) {
      state.pendingChapterCleanupBatch.dataInvalidCount = (state.pendingChapterCleanupBatch.dataInvalidCount || 0) + 1;
      if (state.pendingChapterCleanupBatch.dataInvalidCount >= 3) {
        await _timeoutChapterCleanupBatch();
        return;
      }
      saveState();
      return;
    }

    // 결과 처리 (custom_id 별)
    for (const r of data.results) {
      if (r?.result?.type !== 'succeeded') {
        console.warn(`[cleanup resume] ${r.custom_id} = ${r.result?.type}`);
        continue;
      }
      const text = r.result.message?.content?.[0]?.text || '';
      const cid = r.custom_id || '';

      if (cid.startsWith('case_')) {
        const archiveId = cid.slice('case_'.length);
        const arch = (state.chatArchive || []).find(a => a && a.id === archiveId);
        if (!arch || arch._deleted) continue;
        const _bef = (typeof _captureDerivedSnapshot === 'function') ? _captureDerivedSnapshot() : null;
        try {
          const jm = text.match(/\{[\s\S]*\}/);
          if (jm) {
            const analysis = JSON.parse(jm[0]);
            if (typeof _processExtractChapterAnalysis === 'function') {
              _processExtractChapterAnalysis(analysis);
            }
            arch._caseAnalysisDone = true;
          }
        } catch (e) { console.warn('[cleanup resume] case JSON', archiveId, e); }
        if (_bef && typeof _stampSourceArchiveId === 'function') {
          _stampSourceArchiveId(_bef, arch.id, arch);
        }
      } else if (cid.startsWith('topic_')) {
        const archiveId = cid.slice('topic_'.length);
        const arch = (state.chatArchive || []).find(a => a && a.id === archiveId);
        if (!arch || arch._deleted) continue;
        const _bef = (typeof _captureDerivedSnapshot === 'function') ? _captureDerivedSnapshot() : null;
        try {
          let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
          const jm = cleaned.match(/\{[\s\S]*\}/);
          if (jm) {
            const parsed = JSON.parse(jm[0]);
            if (typeof _processExtractTopicData === 'function') {
              _processExtractTopicData(parsed, arch.messages);
            }
            arch._topicExtractDone = true;
          }
        } catch (e) { console.warn('[cleanup resume] topic JSON', archiveId, e); }
        if (_bef && typeof _stampSourceArchiveId === 'function') {
          _stampSourceArchiveId(_bef, arch.id, arch);
        }
      } else if (cid.startsWith('diary_')) {
        try {
          const dateKey = cid.slice('diary_'.length);
          const summary = (typeof _processDiarySummaryResult === 'function') ? _processDiarySummaryResult(text) : '';
          const entry = (state.entries || []).find(e => e.date === dateKey);
          // V4 (사용자 명시 2026-05-25 ultrathink): empty response sentinel — backend chat.ts 의 _emptyResponse path 와 동등.
          //   batch path 는 chat.ts 사이클을 안 거치므로 빈 text 자체를 sentinel 로 사용 (Anthropic 가 정상 응답 비울 일 없음).
          //   _aiSummaryFailed 영구 마킹 → 다음 batch 진입 시 _buildDiaryBatchRequests 가 자동 skip.
          if (entry) {
            if (summary && summary.length > 0) {
              entry.aiSummary = summary;
              entry.dailySource = 'auto';
            } else {
              entry._aiSummaryFailed = true;
              entry._aiSummaryFailReason = 'empty_batch_response';
              console.warn(`[cleanup resume] diary empty — 영구 skip ${dateKey}`);
            }
          }
        } catch (e) { console.warn('[cleanup resume] diary', cid, e); }
      }
    }

    // archive cleanup 마킹 — case + topic 둘 다 OK 일 때만 _cleanedAt 박고 마커 정리.
    // 부분 성공 (한쪽 fail) 시 _pendingCleanup 보존 → 다음 trigger 시 재시도.
    (pb.archive_ids || []).forEach(aid => {
      const arch = (state.chatArchive || []).find(a => a && a.id === aid);
      if (!arch) return;
      // magic/reflection archive push (옛 패턴 유지 — J 답: 마법/숙고 review content 포함)
      const _bef = (typeof _captureDerivedSnapshot === 'function') ? _captureDerivedSnapshot() : null;
      if (typeof _pushMagicReflectionArchive === 'function') {
        _pushMagicReflectionArchive(arch);
      }
      if (_bef && typeof _stampSourceArchiveId === 'function') {
        _stampSourceArchiveId(_bef, arch.id, arch);
      }
      if (arch._caseAnalysisDone && arch._topicExtractDone) {
        arch._cleanedAt = new Date().toISOString();
        delete arch._pendingCleanup;
        delete arch._batchSubmittedAt;
        // 옛 마커도 정리 (옛 코드 호환)
        delete arch._pendingExtract;
        delete arch._pendingCaseAnalysis;
      }
      delete arch._caseAnalysisDone;
      delete arch._topicExtractDone;
    });

    state.pendingChapterCleanupBatch = null;
    saveState();

    if (typeof renderChatArchiveModal === 'function') renderChatArchiveModal();
    if (typeof renderArchive === 'function') renderArchive();
    if (typeof renderModel === 'function') renderModel();
    if (typeof renderModelPreview === 'function') renderModelPreview();
    if (typeof renderYesterdayCard === 'function') renderYesterdayCard();

    // Chain: review chain trigger (step 3 에서 정의 — typeof 가드)
    if (typeof maybeTriggerReviewChain === 'function') {
      try { await maybeTriggerReviewChain(); } catch (e) { console.warn('[reviewChain trigger]', e); }
    }
  } catch (e) {
    console.warn('[cleanup resume] throw:', e);
  }
}

async function _timeoutChapterCleanupBatch() {
  const pb = state.pendingChapterCleanupBatch;
  if (!pb) return;
  console.warn('[cleanup batch] 12h timeout 또는 status/results fail 3회 — inline fallback');
  const archives = (state.chatArchive || []).filter(a => a && (pb.archive_ids || []).includes(a.id));
  // V4 (사용자 명시 2026-05-25 ultrathink): _pendingDiarySummary 마커 자체 X — diary 는 다음 cleanup batch (24h 후) 자연 picks up.
  // V4 fix (사용자 명시 2026-05-26 ultrathink): orphan stuck 해소 — _batchSubmittedAt strip + retry count.
  //   진단: 5/22 ~ 5/26 사이 5개 archive 가 _batchSubmittedAt 박혀 12h cooldown 영구 차단 (maybeRunChapterCleanup:1817 filter).
  //   fix: timeout 시 archive 의 _batchSubmittedAt strip → 다음 trigger 즉시 재시도.
  //   3회 retry 후에도 fail 시 _pendingCleanup delete + _cleanupFailedAt stamp = 영구 stuck 차단.
  archives.forEach(a => {
    if (a._batchSubmittedAt) delete a._batchSubmittedAt;
    a._cleanupRetryCount = (a._cleanupRetryCount || 0) + 1;
    if (a._cleanupRetryCount >= 3) {
      delete a._pendingCleanup;
      a._cleanupFailedAt = new Date().toISOString();
      console.warn('[cleanup batch] archive 3회 fail — 영구 stuck 차단:', a.id);
    }
  });
  state.pendingChapterCleanupBatch = null;
  saveState();
  if (archives.length > 0 && typeof _runDailyExtractInline === 'function') {
    await _runDailyExtractInline(archives);
  }
}

// V4 (사용자 명시 2026-05-25 ultrathink): 신규 review chain batch — 옛 _buildReviewBatchRequests + _resumePendingBatch 의 review 부분 분리.
//   weekly + insight 같은 batch_id (사용자 11 답). monthly/quarterly/annual 는 review request 만 (insight X).
//   자격: _collectMissingReviews — key not in state[cycle+'Reviews'] + entries >= 임계값.
//   chain: cleanup batch 결과 도착 시 _resumeChapterCleanupBatch 끝에서 호출 + step 4 의 maybeRunChapterCleanup 끝에서도 호출 (cleanup 없을 때도 trigger).
//   step 4 swap 까지 호출 X — 정의만.

async function maybeTriggerReviewChain() {
  // V4 (사용자 명시 2026-05-26 ultrathink): 24h+ stuck escape — _resumeReviewChainBatch 가 setTimeout polling 으로만 fire (페이지 닫히면 잃음) 인 corner case 대비.
  //   진단: 옛 batch msgbatch_01DvpXgPgdGWt71CteG2v6tQ 가 retention 끝 후에도 maybeTriggerReviewChain 가드에 걸려 신규 batch 영영 차단됨.
  //   resume path 의 24h hard cap 와 별개 — trigger 진입 자체에서도 stale batch_id 자동 해제.
  if (state.pendingReviewBatch?.batch_id
      && state.pendingReviewBatch.submitted_at
      && Date.now() - state.pendingReviewBatch.submitted_at > 24 * 3600 * 1000) {
    console.warn('[review chain] 24h+ stuck escape — clear stale batch_id');
    state.pendingReviewBatch = null;
    saveState();
  }
  if (state.pendingReviewBatch?.batch_id) return;  // 진행 중
  if (!_canAI()) return;  // 게스트 제외
  if (window._onbTutorialMode) return;
  if (state.preferences?.testerMode) return;
  if (typeof _collectMissingReviews !== 'function') return;

  const missing = _collectMissingReviews(new Date());
  if (missing.length === 0) return;

  console.log(`[review chain] missing: ${missing.map(m => m.cycle + '_' + m.key + '(entries=' + m.entriesCount + ')').join(', ')}`);
  await submitReviewChainBatch(missing);
}

async function submitReviewChainBatch(missingReviews) {
  if (!Array.isArray(missingReviews) || missingReviews.length === 0) return;
  const requests = [];

  for (const m of missingReviews) {
    let spec = null;
    try {
      if (m.cycle === 'weekly' || m.cycle === 'monthly') {
        const data = (typeof _collectReviewData === 'function')
          ? _collectReviewData(m.cycle, { cutoff: m.cutoff, cutoffEnd: m.cutoffEnd })
          : null;
        if (data && typeof _buildReviewPrompt === 'function') {
          spec = _buildReviewPrompt(m.cycle, data);
        }
      } else if (m.cycle === 'quarterly') {
        const stats = (typeof getQuarterlyStats === 'function' && getQuarterlyStats(m.key)) || {};
        if (typeof _collectQuarterlyData === 'function' && typeof _buildQuarterlyReviewPrompt === 'function') {
          const data = _collectQuarterlyData(m.key, stats);
          spec = _buildQuarterlyReviewPrompt(m.key, stats, data);
        }
      } else if (m.cycle === 'annual') {
        if (typeof _collectAnnualData === 'function' && typeof _buildAnnualReviewPrompt === 'function') {
          const data = _collectAnnualData(m.key);
          spec = _buildAnnualReviewPrompt(m.key, data);
        }
      }
    } catch (e) { console.warn('[review chain] spec build fail:', m.cycle, m.key, e); }
    if (!spec) continue;
    requests.push({
      custom_id: `review_${m.cycle}_${m.key}`,
      params: {
        model: spec.model,
        max_tokens: spec.max_tokens,
        system: spec.system,
        messages: [{ role: 'user', content: spec.userMessage }]
      }
    });
  }

  // weekly 있으면 insight 같은 batch_id 통합 (사용자 11 답)
  const hasWeekly = missingReviews.some(m => m.cycle === 'weekly');
  if (hasWeekly && typeof _buildInsightDiscoverContext === 'function') {
    try {
      const ctx = _buildInsightDiscoverContext();
      if (ctx) {
        requests.push({
          custom_id: `insight_weekly_${Date.now()}`,
          params: {
            model: 'claude-sonnet-4-6',
            max_tokens: 800,
            messages: [{ role: 'user', content: '' }],
            _endpoint: 'discover_insights',
            _userContentType: 'discover_insights',
            _vars: { dataJson: ctx.dataJson, existingInsights: ctx.existingInsights }
          }
        });
      }
    } catch (e) { console.warn('[review chain] insight ctx fail:', e); }
  }

  if (requests.length === 0) return;

  try {
    const resp = await _authedFetch('/api/chat-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
      body: JSON.stringify({ action: 'submit', requests })
    });
    if (!resp.ok) throw new Error('review chain batch submit failed: ' + resp.status);
    const data = await resp.json();
    if (!data.id) throw new Error('batch_id 없음');

    state.pendingReviewBatch = {
      batch_id: data.id,
      submitted_at: Date.now(),
      review_keys: missingReviews.map(m => ({ cycle: m.cycle, key: m.key })),
      has_insight: hasWeekly
    };
    saveState();
    console.log(`[review chain batch] submitted: ${data.id} — ${missingReviews.length} reviews + ${hasWeekly ? 1 : 0} insight`);
    if (typeof renderReviewPrompts === 'function') renderReviewPrompts();
  } catch (e) {
    console.warn('[review chain batch] submit fail:', e);
  }
}

async function _resumeReviewChainBatch() {
  const pb = state.pendingReviewBatch;
  if (!pb || !pb.batch_id) return;

  // V4 (사용자 명시 2026-05-26 ultrathink): 24h hard cap — _resumePendingBatch 와 동일 패턴.
  if (pb.submitted_at && Date.now() - pb.submitted_at > 24 * 3600 * 1000) {
    console.warn('[review chain] 24h hard cap — submitted_at:', new Date(pb.submitted_at).toISOString(), '→ timeout');
    await _timeoutReviewChainBatch();
    return;
  }

  try {
    const statusResp = await _authedFetch('/api/chat-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
      body: JSON.stringify({ action: 'status', batch_id: pb.batch_id })
    });
    if (!statusResp.ok) {
      // V4 (사용자 명시 2026-05-26 ultrathink): 4xx 즉시 escape.
      if (statusResp.status === 404 || statusResp.status === 410) {
        console.warn('[review chain] status', statusResp.status, '— retention 끝, 즉시 timeout');
        await _timeoutReviewChainBatch();
        return;
      }
      state.pendingReviewBatch.statusFailCount = (state.pendingReviewBatch.statusFailCount || 0) + 1;
      if (state.pendingReviewBatch.statusFailCount >= 3) {
        await _timeoutReviewChainBatch();
        return;
      }
      saveState();
      return;
    }
    const status = await statusResp.json();
    if (state.pendingReviewBatch.statusFailCount) delete state.pendingReviewBatch.statusFailCount;
    if (status.processing_status !== 'ended') {
      const submittedMs = state.pendingReviewBatch.submitted_at || 0;
      if (submittedMs > 0 && Date.now() - submittedMs > 12 * 3600 * 1000) {
        await _timeoutReviewChainBatch();
      }
      return;
    }

    const resultsResp = await _authedFetch('/api/chat-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
      body: JSON.stringify({ action: 'results', batch_id: pb.batch_id })
    });
    if (!resultsResp.ok) {
      state.pendingReviewBatch.resultsFailCount = (state.pendingReviewBatch.resultsFailCount || 0) + 1;
      if (state.pendingReviewBatch.resultsFailCount >= 3) {
        await _timeoutReviewChainBatch();
        return;
      }
      saveState();
      return;
    }
    const data = await resultsResp.json();
    if (!data.ok || !Array.isArray(data.results)) {
      state.pendingReviewBatch.dataInvalidCount = (state.pendingReviewBatch.dataInvalidCount || 0) + 1;
      if (state.pendingReviewBatch.dataInvalidCount >= 3) {
        await _timeoutReviewChainBatch();
        return;
      }
      saveState();
      return;
    }

    for (const r of data.results) {
      if (r?.result?.type !== 'succeeded') {
        console.warn(`[review chain resume] ${r.custom_id} = ${r.result?.type}`);
        continue;
      }
      const text = r.result.message?.content?.[0]?.text || '';
      const cid = r.custom_id || '';

      if (cid.startsWith('review_')) {
        const rest = cid.slice('review_'.length);
        const firstUnder = rest.indexOf('_');
        if (firstUnder < 0) continue;
        const cycle = rest.slice(0, firstUnder);
        const key = rest.slice(firstUnder + 1);
        try {
          if (cycle === 'weekly' || cycle === 'monthly') {
            const json = (typeof _processReviewResult === 'function') ? _processReviewResult(text) : null;
            if (json && Array.isArray(json.quotes) && typeof _filterValidQuotes === 'function' && typeof _collectReviewData === 'function') {
              try {
                const _data = _collectReviewData(cycle);
                json.quotes = _filterValidQuotes(json.quotes, _collectQuoteSources(_data));
              } catch {}
            }
            if (json) {
              const _common = {
                id: (cycle === 'weekly' ? 'wr_' : 'mr_') + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                type: cycle,
                completedAt: new Date().toISOString(),
                auto: true
              };
              const review = cycle === 'weekly' ? {
                ..._common,
                one_word_weekly: json.one_word_weekly,
                momentum_line: json.momentum_line,
                scenes: json.scenes,
                flow: json.flow,
                cycles: json.cycles,
                soft_notice: json.soft_notice,
                seeds: json.seeds,
              } : {
                ..._common,
                ...json
              };
              if (cycle === 'weekly') review.weekKey = key;
              else review.monthKey = key;
              const arrKey = cycle === 'weekly' ? 'weeklyReviews' : 'monthlyReviews';
              state[arrKey] = state[arrKey] || [];
              const exists = state[arrKey].find(v => (cycle === 'weekly' ? v.weekKey : v.monthKey) === key);
              if (!exists) state[arrKey].unshift(review);
            } else {
              // 빈 응답 sentinel — backend succeeded 줬는데 parse fail / 빈 JSON. 다음 진입에 자동 retry skip.
              _markReviewFailedKey(cycle, key);
              console.warn('[review chain resume] empty/parse-fail — sentinel 박음:', cid);
            }
          } else if (cycle === 'quarterly') {
            const json = (typeof _processQuarterlyReviewResult === 'function') ? _processQuarterlyReviewResult(text) : null;
            if (json && typeof _filterValidQuotes === 'function' && typeof _collectQuarterlyData === 'function') {
              try {
                const _stats = (typeof getQuarterlyStats === 'function' && getQuarterlyStats(key)) || {};
                const _data = _collectQuarterlyData(key, _stats);
                const _sources = _collectQuoteSources(_data);
                if (Array.isArray(json.quotes)) json.quotes = _filterValidQuotes(json.quotes, _sources);
                if (json.transformation && typeof json.transformation === 'object') {
                  json.transformation.start_quote = _verifySingleQuote(json.transformation.start_quote, _sources);
                  json.transformation.end_quote = _verifySingleQuote(json.transformation.end_quote, _sources);
                }
              } catch {}
            }
            if (json) {
              const stats = (typeof getQuarterlyStats === 'function' && getQuarterlyStats(key)) || {};
              const review = {
                id: 'qr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                quarterKey: key,
                completedAt: new Date().toISOString(),
                stats,
                summary: json.summary || '',
                sections: Array.isArray(json.sections) ? json.sections : [],
                one_word: json.one_word,
                pattern: json.pattern,
                turning_point: json.turning_point,
                transformation: json.transformation,
                continuity: json.continuity,
                quotes: json.quotes,
                experiment: json.experiment,
                seeds: json.seeds,
                seed_callbacks: json.seed_callbacks,
                auto: true
              };
              state.quarterlyReviews = state.quarterlyReviews || [];
              const exists = state.quarterlyReviews.find(v => v.quarterKey === key);
              if (!exists) state.quarterlyReviews.push(review);
            } else {
              _markReviewFailedKey(cycle, key);
              console.warn('[review chain resume] empty/parse-fail — sentinel 박음:', cid);
            }
          } else if (cycle === 'annual') {
            const narrative = (typeof _robustJsonExtract === 'function') ? _robustJsonExtract(text) : null;
            if (narrative) {
              const year = parseInt(key, 10);
              const existsAnnual = (state.annualReviews || []).find(r => r.year === year);
              if (!existsAnnual && typeof _processAnnualReviewResult === 'function' && typeof _collectAnnualData === 'function') {
                const dataAnnual = _collectAnnualData(year);
                const annualReview = _processAnnualReviewResult(narrative, year, dataAnnual, false);
                if (annualReview) annualReview.auto = true;
              }
            } else {
              _markReviewFailedKey(cycle, key);
              console.warn('[review chain resume] empty/parse-fail — sentinel 박음:', cid);
            }
          }
        } catch (e) { console.warn('[review chain resume] cycle fail:', cid, e); }
      } else if (cid.startsWith('insight_')) {
        try {
          let jsonStr = text;
          const fenceM = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          if (fenceM) jsonStr = fenceM[1];
          const jm = jsonStr.match(/\{[\s\S]*\}/);
          if (!jm) continue;
          const parsed = JSON.parse(jm[0]);
          const discovered = Array.isArray(parsed && parsed.discovered) ? parsed.discovered : [];
          const existingContents = (state.insights || []).filter(i => i && !i.dismissed).map(i => (i.content || '').toLowerCase());
          const nowIso = new Date().toISOString();
          discovered.forEach(d => {
            if (!d || typeof d !== 'object') return;
            const type = (d.type === 'causal' || d.type === 'pattern') ? d.type : null;
            if (!type) return;
            const content = (d.content || '').trim();
            const evidence = (d.evidence || '').trim();
            const conf = typeof d.confidence === 'number' ? d.confidence : 0;
            if (!content || content.length < 8) return;
            if (conf < 0.55) return;
            if (typeof _dedupInsight === 'function' && _dedupInsight(content, existingContents)) return;
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
            existingContents.push(content.toLowerCase());
          });
          if (!state.preferences) state.preferences = {};
          state.preferences._lastInsightDiscoverAt = nowIso;
        } catch (e) { console.warn('[review chain resume] insight fail:', cid, e); }
      }
    }

    state.pendingReviewBatch = null;
    saveState();

    if (typeof renderReviewPrompts === 'function') renderReviewPrompts();
    if (typeof renderArchive === 'function') renderArchive();
    if (typeof renderLensInsights === 'function') renderLensInsights();
    if (typeof renderModel === 'function') renderModel();
  } catch (e) {
    console.warn('[review chain resume] throw:', e);
  }
}

async function _timeoutReviewChainBatch() {
  const pb = state.pendingReviewBatch;
  if (!pb) return;
  console.warn('[review chain batch] 12h timeout 또는 fail 3회 — inline fallback');
  const reviewTypes = [];
  const reviewKeys = {};
  (pb.review_keys || []).forEach(rk => {
    if (rk.cycle === 'weekly' || rk.cycle === 'monthly' || rk.cycle === 'quarterly' || rk.cycle === 'annual') {
      reviewTypes.push(rk.cycle);
      reviewKeys[rk.cycle] = rk.key;
    }
  });
  state.pendingReviewBatch = null;
  saveState();
  if (reviewTypes.length > 0 && typeof _runReviewExtractInline === 'function') {
    await _runReviewExtractInline(reviewTypes, reviewKeys);
  }
}

// V4 (사용자 명시 2026-05-25 ultrathink): 재설계 main entry — maybeRunChapterCleanup.
//   step A: 챕터 분리 trigger
//     (i)  ✓ 버튼 — endChapter()/_archiveCurrentChapter manual=true 별도 path (여기 X)
//     (ii) lastMsg + 5h < now — 5h 갭, cutoff 와 별개 (사용자 spec 6)
//     (iii) 4AM cutoff 통과 + lastMsg < (cutoff - 5분)
//   step B: cleanup batch — 어제 batch 큐 처리 (_pendingCleanup 마커, daily cooldown)
//     · case (Opus) + topic (Haiku) + diary 같은 batch_id
//     · 결과 도착 시 archive._cleanedAt stamp + maybeTriggerReviewChain chain
//   step C: review chain — 매 진입 시도 (cleanup 없을 때도 backlog cover)
//     · weekly + monthly + quarterly + annual 자격 체크 (entries >= 임계값, key not in)
//     · 모든 missing 한 batch_id (weekly 있으면 insight 통합)
//   legacy: 옛 state.pendingBatch 잔재 = single-shot _resumePendingBatch 후 새 schema 만.
async function maybeRunChapterCleanup() {
  if (!authUserId || window._onbTutorialMode) return;
  if (state.preferences && state.preferences.testerMode) return;

  const isGuest = !_canAI();  // 게스트 = step A 분리만 (step B+C X)

  // ─── legacy pendingBatch (옛 schema) 잔재 처리 — single-shot ─────────
  if (!isGuest && state.pendingBatch && state.pendingBatch.batch_id) {
    try { await _resumePendingBatch(); } catch (e) { console.warn('[legacy resume]', e); }
    if (state.pendingBatch && state.pendingBatch.batch_id) {
      const submittedMs = state.pendingBatch.submitted_at || 0;
      if (Date.now() - submittedMs > 12 * 3600 * 1000) {
        try { await _timeoutPendingBatch(); } catch {}
      } else {
        const _bid = state.pendingBatch.batch_id;
        if (window._pendingBatchPollingFor !== _bid) {
          window._pendingBatchPollingFor = _bid;
          [300000, 900000, 1800000].forEach(ms => {
            setTimeout(() => {
              if (state.pendingBatch && state.pendingBatch.batch_id === _bid) {
                _resumePendingBatch().catch(e => console.warn('[legacy polling]', e));
              }
            }, ms);
          });
        }
      }
      return;  // legacy 진행 중이면 새 schema 시도 X
    }
  }

  // ─── 새 cleanup batch 결과 fetch ─────────────────────────
  if (!isGuest && state.pendingChapterCleanupBatch && state.pendingChapterCleanupBatch.batch_id) {
    try { await _resumeChapterCleanupBatch(); } catch (e) { console.warn('[cleanup resume]', e); }
    if (state.pendingChapterCleanupBatch && state.pendingChapterCleanupBatch.batch_id) {
      const _bid = state.pendingChapterCleanupBatch.batch_id;
      if (window._pendingCleanupBatchPollingFor !== _bid) {
        window._pendingCleanupBatchPollingFor = _bid;
        [300000, 900000, 1800000].forEach(ms => {  // 5min / 15min / 30min
          setTimeout(() => {
            if (state.pendingChapterCleanupBatch && state.pendingChapterCleanupBatch.batch_id === _bid) {
              _resumeChapterCleanupBatch().catch(e => console.warn('[cleanup polling]', e));
            }
          }, ms);
        });
      }
      return;  // cleanup 진행 중이면 새 cleanup batch 제출 X (중복 방지)
    }
  }

  // ─── 새 review chain batch 결과 fetch ──────────────────
  if (!isGuest && state.pendingReviewBatch && state.pendingReviewBatch.batch_id) {
    try { await _resumeReviewChainBatch(); } catch (e) { console.warn('[review resume]', e); }
    if (state.pendingReviewBatch && state.pendingReviewBatch.batch_id) {
      const _bid = state.pendingReviewBatch.batch_id;
      if (window._pendingReviewBatchPollingFor !== _bid) {
        window._pendingReviewBatchPollingFor = _bid;
        [300000, 900000, 1800000].forEach(ms => {
          setTimeout(() => {
            if (state.pendingReviewBatch && state.pendingReviewBatch.batch_id === _bid) {
              _resumeReviewChainBatch().catch(e => console.warn('[review polling]', e));
            }
          }, ms);
        });
      }
    }
  }

  // ─── step A: 챕터 분리 ───────────────────────────────────
  // mutation chat close (잠든 상태로 활성이면 단순 close)
  if (typeof _mutationChatState !== 'undefined' && _mutationChatState
      && typeof closeMutationChat === 'function') {
    try { closeMutationChat(true); } catch {}
  }

  // crisis pattern detect (자살예방법 §15-6)
  if (typeof _checkCrisisPattern === 'function' && _checkCrisisPattern()) {
    if (typeof showCrisisCarousel === 'function') {
      setTimeout(() => showCrisisCarousel('mood_pattern'), 1500);
    }
  }

  // 챕터 분리 자격 — trigger (ii) 5h 갭 또는 (iii) 4AM cutoff + lastMsg<cutoff-5분
  const lastMsg = (state.chatMessages && state.chatMessages.length > 0)
    ? state.chatMessages[state.chatMessages.length - 1] : null;
  const _lastMs = (lastMsg && lastMsg.timestamp) ? new Date(lastMsg.timestamp).getTime() : null;
  let _shouldArchive = false;
  if (_lastMs != null) {
    const _cutoffMs = _lastDaily4amCutoff().getTime();
    const _5hAgoMs = Date.now() - 5 * 3600 * 1000;
    // (ii) 5h 갭 — cutoff 와 별개, 언제든 trigger (사용자 spec 6)
    if (_lastMs < _5hAgoMs) _shouldArchive = true;
    // (iii) 4AM cutoff 통과 + lastMsg < cutoff-5분
    else if (_lastMs < (_cutoffMs - 5 * 60 * 1000)) _shouldArchive = true;
  }

  if (_shouldArchive
      && state.chatMessages && state.chatMessages.length >= 3
      && typeof _archiveCurrentChapter === 'function') {
    _archiveCurrentChapter({ manual: false });
  }

  // msg<3 stuck marker sweep (옛 + 새 마커 모두 cover) + 좀비 (_deleted + 마커 잔존) retro 청소
  let _sweptDeadMarker = false;
  (state.chatArchive || []).forEach(a => {
    if (!a) return;
    // V4 fix (사용자 보고 2026-05-26 ultrathink): 좀비 archive retro 청소 — _deleted 인데 cleanup 마커 잔존.
    //   원인: 삭제 path (_softDeleteArchiveCascade) 가 _pendingCleanup 등 마커 strip 안 함 → filter 영구 거부 → cleanup batch 매일 no-op.
    //   여기서 retro 청소 + 00-soft-delete.js 에서 삭제 path 자체 fix.
    if (a._deleted) {
      if (a._pendingCleanup || a._pendingExtract || a._pendingCaseAnalysis || a._batchSubmittedAt) {
        delete a._pendingCleanup;
        delete a._pendingExtract;
        delete a._pendingCaseAnalysis;
        delete a._batchSubmittedAt;
        _sweptDeadMarker = true;
      }
      return;
    }
    if (a._pendingCleanup || a._pendingExtract || a._pendingCaseAnalysis) {
      const _msgs = a.messages;
      const _invalid = !Array.isArray(_msgs) || _msgs.length < 3;
      if (_invalid) {
        delete a._pendingCleanup;
        delete a._pendingExtract;
        delete a._pendingCaseAnalysis;
        delete a._batchSubmittedAt;
        _sweptDeadMarker = true;
      }
    }
  });
  if (_sweptDeadMarker) {
    saveState();
    if (typeof renderChatArchiveModal === 'function') { try { renderChatArchiveModal(); } catch {} }
  }

  // ─── step B: cleanup batch (어제 큐 처리, daily cooldown) ────────────
  if (!isGuest && _shouldRunSchedule(state.lastChapterCleanupAt, _lastDaily4amCutoff())) {
    const unprocessed = (state.chatArchive || []).filter(a =>
      a && !a._deleted && a._pendingCleanup
      && !a.isSimulation  // K: 시뮬 챕터 처리 X
      && Array.isArray(a.messages) && a.messages.length >= 3
      && (!a._batchSubmittedAt || (Date.now() - a._batchSubmittedAt) > 12 * 3600 * 1000)
    );
    // unprocessed=[] 도 submit 함수가 lastChapterCleanupAt stamp 처리 (early return)
    await submitChapterCleanupBatch(unprocessed);
  }

  // ─── step C: review chain trigger ────────────────────────
  // cleanup batch 진행 중이면 _resumeChapterCleanupBatch 끝에서 chain 호출.
  // cleanup batch 없거나 끝났으면 직접 시도 (옛 cycle backlog cover).
  if (!isGuest && !state.pendingChapterCleanupBatch?.batch_id) {
    if (typeof maybeTriggerReviewChain === 'function') {
      try { await maybeTriggerReviewChain(); } catch (e) { console.warn('[reviewChain entry]', e); }
    }
  }

  // ─── step D: forceAnalyze 일요일 자동 trigger ────────────────────────
  // V4 (사용자 명시 2026-05-26 ultrathink): 주 1회 통합 분석 (Opus, trait/value/pattern + 회전 카드 '새로 본 너').
  //   일요일 04:00 KST cutoff. lastForceAnalyzeAt 이 cutoff 이전이면 trigger.
  //   fire-and-forget — Opus max_tokens 2500 시간 길어서 await X. silent toast (auto:true).
  if (!isGuest && typeof forceAnalyze === 'function'
      && _shouldRunSchedule(state.lastForceAnalyzeAt, _lastSunday4amCutoff())) {
    forceAnalyze({ auto: true }).catch(e => console.warn('[forceAnalyze auto sunday]', e));
  }
}

// V4 (사용자 명시 2026-05-25 ultrathink): 옛 함수명 alias — 옛 호출처 호환 (07-init / 35-bg-fetch).
//   step 4 의 호출처 rename 함께 진행. 다음 step (5) 에서 옛 함수 (_submitDailyExtractBatch 등) 폐기.
const maybeRunDailyChapterExtract = maybeRunChapterCleanup;

// 사용자 명시 2026-05-10: 주간 리뷰만 새로 받는 명령어 — _diagnoseExtract 의 weekly 부분만 추출.
//   console: `_forceWeeklyReview()` → 이번 주 weekKey 기준 새 review 생성 (이미 있으면 toast 알림 + skip).
window._forceWeeklyReview = async function() {
  if (typeof _runReviewExtractInline !== 'function' || typeof _collectReviewData !== 'function' || typeof getWeekKey !== 'function') {
    console.error('[forceWeeklyReview] helpers 미정의 (PWA reload 필요)');
    return;
  }
  if (!_canAI || !_canAI()) {
    console.error('[forceWeeklyReview] AI 호출 불가 (로그인 / 잔액 확인)');
    return;
  }
  const data = _collectReviewData('weekly');
  if (!data) { console.warn('[forceWeeklyReview] _collectReviewData null'); return; }
  const weekKey = getWeekKey(data.cutoffEnd || data.cutoff);
  const _before = (state.weeklyReviews || []).length;
  const _exists = (state.weeklyReviews || []).some(r => r.weekKey === weekKey);
  console.log('[forceWeeklyReview] weekKey:', weekKey, 'before count:', _before, 'exists:', _exists);
  if (_exists) {
    if (typeof showToast === 'function') showToast(`📅 ${weekKey} 리뷰 이미 있어 — 홈에서 확인`);
    return;
  }
  if (typeof showToast === 'function') showToast(`🌙 ${weekKey} 주간 리뷰 생성 중...`);
  try {
    await _runReviewExtractInline(['weekly'], { weekly: weekKey });
    const _after = (state.weeklyReviews || []).length;
    const _ok = (state.weeklyReviews || []).some(r => r.weekKey === weekKey);
    console.log('[forceWeeklyReview] after count:', _after, 'success:', _ok);
    // 사용자 보고 2026-05-10: 사용자 명령 (_forceWeeklyReview) 으로 만든 review = manual. _runReviewExtractInline 가 auto:true 박지만 사용자 trigger 라 정정.
    if (_ok) {
      const _just = (state.weeklyReviews || []).find(r => r.weekKey === weekKey);
      if (_just) {
        _just.auto = false;
        if (typeof saveState === 'function') saveState();
      }
    }
    if (typeof renderArchiveReviews === 'function') renderArchiveReviews();
    if (typeof showToast === 'function') {
      showToast(_ok ? `✦ ${weekKey} 주간 리뷰 생성 완료` : '주간 리뷰 생성 실패 — console 확인');
    }
  } catch (e) {
    console.error('[forceWeeklyReview] FAIL', e);
    if (typeof showToast === 'function') showToast('주간 리뷰 생성 실패: ' + (e?.message || e));
  }
};

// 사용자 보고 2026-05-10 (audit batch 3 진단): 강제 회복 후에도 yesterday/주간/나탭 안 뜸 케이스 진단 함수.
// console 에서 `_diagnoseExtract()` 호출 → 어디서 막히는지 console 에 풍부 로그.
window._diagnoseExtract = async function() {
  console.log('=== _diagnoseExtract 시작 ===');
  console.log('chatMessages count:', state.chatMessages?.length || 0);
  console.log('chatArchive count:', state.chatArchive?.length || 0);
  console.log('pendingBatch:', state.pendingBatch);
  console.log('traits:', state.traits?.length || 0, 'values:', state.values?.length || 0, 'patterns:', state.patterns?.length || 0);
  console.log('weeklyReviews count:', state.weeklyReviews?.length || 0);
  console.log('monthlyReviews count:', state.monthlyReviews?.length || 0);
  console.log('today getDay:', new Date().getDay(), '(0=Sun, 6=Sat)');
  console.log('_canAI:', typeof _canAI === 'function' ? _canAI() : 'undef');
  console.log('_onbTutorialMode:', window._onbTutorialMode);
  console.log('testerMode:', state.preferences?.testerMode);
  console.log('window._lastChapterAnalysisDebug:', window._lastChapterAnalysisDebug);

  // 1. chatArchive 의 최근 7일 데이터
  const since = Date.now() - 7 * 86400000;
  const recent = (state.chatArchive || []).filter(a =>
    a && !a._deleted && a.date && new Date(a.date + 'T00:00:00').getTime() > since &&
    Array.isArray(a.messages) && a.messages.length >= 3
  );
  console.log('최근 7일 archive (msg>=3):', recent.length);
  recent.forEach(a => console.log('  -', { id: a.id, date: a.date, msgCount: a.messages.length, _pendingExtract: a._pendingExtract, _pendingCaseAnalysis: a._pendingCaseAnalysis, headline: a.headline }));

  // 2. 각 archive case_analysis 강제 호출
  for (const t of recent) {
    try {
      console.log('[case_analysis] →', t.id, 'msgs:', t.messages.length);
      await extractChapterCaseAnalysis(t.messages);
      console.log('[case_analysis] done', t.id, 'lastDebug:', window._lastChapterAnalysisDebug);
    } catch (e) { console.error('[case_analysis] FAIL', t.id, e); }
  }

  // 3. 결과 리포트
  console.log('=== 추출 후 ===');
  console.log('traits:', state.traits?.length, '최근 3:', state.traits?.slice(-3));
  console.log('values:', state.values?.length, '최근 3:', state.values?.slice(-3));
  console.log('patterns:', state.patterns?.length, '최근 3:', state.patterns?.slice(-3));

  // 4. 강제 weekly review — _runReviewExtractInline 사용 (실제 함수). 일요일/평일 무관.
  if (typeof _runReviewExtractInline === 'function' && typeof _collectReviewData === 'function' && typeof getWeekKey === 'function') {
    try {
      const data = _collectReviewData('weekly');
      if (!data) {
        console.warn('[weekly review] _collectReviewData null');
      } else {
        const weekKey = getWeekKey(data.cutoffEnd || data.cutoff);
        console.log('[weekly review] weekKey:', weekKey, 'before count:', state.weeklyReviews?.length, 'exists:', state.weeklyReviews?.some(r => r.weekKey === weekKey));
        await _runReviewExtractInline(['weekly'], { weekly: weekKey });
        console.log('[weekly review] after count:', state.weeklyReviews?.length, 'exists:', state.weeklyReviews?.some(r => r.weekKey === weekKey));
      }
    } catch (e) { console.error('[weekly review] FAIL', e); }
  } else {
    console.log('[weekly review] helpers not found');
  }

  // 5. render 강제
  if (typeof renderModel === 'function') { try { renderModel(); console.log('renderModel ok'); } catch(e) { console.error(e); } }
  if (typeof renderYesterdayCard === 'function') { try { renderYesterdayCard(); console.log('renderYesterdayCard ok'); } catch(e) { console.error(e); } }
  if (typeof renderReviewPrompts === 'function') { try { renderReviewPrompts(); console.log('renderReviewPrompts ok'); } catch(e) { console.error(e); } }

  if (typeof showToast === 'function') showToast('🔍 진단 끝 — console 확인');
  console.log('=== _diagnoseExtract 끝 ===');
};

// 사용자 명시 2026-05-01 ultrathink: 옛 maybeRunWeekly/Monthly/Quarterly/YearlyAnalyze 제거.
// 자동 trigger 폐기 — 리뷰 카드 click 으로만 생성. last*AnalyzeAt state 필드는 보존 (옛 사용자 데이터 호환).

// 사용자 요청 2026-04-30 (변호사 검수): 첫 진입 동의 모달은 폐기 — login 화면 inline 동의 (state.preferences.consentLog 의 terms/privacy/crossBorder/age14/adult18/analytics) 로 통합. 처리는 위쪽 pending consent 블록 (localStorage 'soragodong_pending_consent' → consentLog) 단일 경로.


// ═══════════════════════════════════════════════════════════════
// V4 (사용자 명시 2026-05-06): 미구독/게스트 = 3턴마다 자동 모델 갱신.
// V4 (사용자 명시 2026-05-25 ultrathink): _maybeAutoForceAnalyzeFreeTier 폐기.
//   옛: 미구독/게스트 매 3턴 inline case_analysis (Sonnet) — 잦은 model 변경 + 비용.
//   새 spec 2: "사용자가 대화탭에서 대화 했을 때, 3턴마다. 아무 일도 일어나지 않음."
//   모든 사용자 동일 path: 챕터 마무리 → _pendingCleanup → cleanup batch (Opus, 4AM cutoff 통과 시).
//   함수 + 호출처 (19-chat/09-generate-ai-response.js:407-410) 제거.
