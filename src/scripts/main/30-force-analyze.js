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
      activeModes: Object.keys(state.modes || {}).filter(k => state.modes[k])
    };
    // 사용자 명시 2026-05-11 ultrathink: prompt template backend 이전 — buildForceAnalyze 가 합성.
    const _dataDumpJson = JSON.stringify(dataDump, null, 2);
    const response = await callAnthropic({
      _endpoint: 'analyze_4stage',
      _userContentType: 'force_analyze',
      _vars: { dataDumpJson: _dataDumpJson },
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
    const NEW_THRESHOLD = 0.4;
    if (analysis.traits) {
      analysis.traits.forEach(t => {
        const exist = state.traits.find(e => similarText(e.name, t.name));
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
        const exist = state.values.find(e => similarText(e.name, v.name));
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
        const exist = state.patterns.find(e => similarText(e.name, p.name));
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

function _shouldRunSchedule(lastAt, cutoff) {
  if (!lastAt) return true;
  return new Date(lastAt) < cutoff;
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
    } catch (e) { console.warn('[inline] topic fail:', e); }
    _pushMagicReflectionArchive(batch);
    if (_before && typeof _stampSourceArchiveId === 'function') {
      _stampSourceArchiveId(_before, batch.id, batch);
    }
    // 사용자 보고 2026-05-10 (audit batch 4): case_analysis fail 시 _pendingExtract 보존 — 다음 진입 시 재시도 가능.
    //   옛 흐름: 무조건 delete → silent fail 후 영구 추출 안 됨 (사용자 보고 케이스 root cause).
    if (_caseOk) {
      delete batch._pendingExtract;
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

// 사용자 명시 2026-05-02 ultrathink: 리뷰 batch request 빌더 — schedule 체크 후 weekly/monthly/quarterly/annual 추가.
// state.lastXxxReviewBatchAt + _shouldRunSchedule + _lastXxx4amCutoff 으로 1회 만 submit.
// 각 review type 별 _collectXxxData + _buildXxxReviewPrompt → null 이면 (데이터 부족) skip.
//
// 사용자 명시 2026-05-02 ultrathink: 리뷰 batch 활성 (50% 비용 절감 우선).
// 매력도 약점 (ritual sense / "처리 중 ⏳" 토스트) 받아들임 — chapter batch 동일 패턴 (사용자 활동 시 trigger).
// E (사용자 활동 시 trigger) 한계 인지 + C (server cron) E2EE 충돌로 폐기 + D (네이티브) Phase 3 인계.
const FEATURE_BATCH_REVIEWS = true;
// 사용자 명시 2026-05-02 ultrathink (A 옵션): diary auto summary 를 batch 로 통합. 4AM cutoff 도달 후 사용자 진입 시 batch submit.
// chapter / topic / review / diary 모두 같은 batch_id. 결과 도착 후 entry.aiSummary 적용됨 + 어제 카드 자동 노출.
const FEATURE_BATCH_DIARY = true;

function _buildReviewBatchRequests() {
  if (!FEATURE_BATCH_REVIEWS) return { requests: [], reviewKeys: {}, pendingTypes: [] };
  const requests = [];
  const reviewKeys = {};  // review type → key (weekly: weekKey, monthly: monthKey, ...)
  const pendingTypes = [];

  // weekly — 월요일 4AM cutoff
  if (_shouldRunSchedule(state.lastWeeklyReviewBatchAt, _lastWeekly4amCutoff())) {
    const data = _collectReviewData('weekly');
    const spec = _buildReviewPrompt('weekly', data);
    if (spec) {
      // 사용자 보고 2026-05-10: weekKey = cutoffEnd 기준 (사용자 인식 "이번 주" 일요일 = W19, 옛 cutoff 시작 기준 W18 mismatch fix).
      const weekKey = getWeekKey(data.cutoffEnd || data.cutoff);
      reviewKeys.weekly = weekKey;
      requests.push({
        custom_id: `review_weekly_${weekKey}`,
        params: {
          model: spec.model,
          max_tokens: spec.max_tokens,
          system: spec.system,
          messages: [{ role: 'user', content: spec.userMessage }]
        }
      });
      pendingTypes.push('weekly');
    }
  }
  // monthly — 매월 1일 4AM cutoff
  if (_shouldRunSchedule(state.lastMonthlyReviewBatchAt, _lastMonthly4amCutoff())) {
    const data = _collectReviewData('monthly');
    const spec = _buildReviewPrompt('monthly', data);
    if (spec) {
      const monthKey = getMonthKey(data.cutoff);
      reviewKeys.monthly = monthKey;
      requests.push({
        custom_id: `review_monthly_${monthKey}`,
        params: {
          model: spec.model,
          max_tokens: spec.max_tokens,
          system: spec.system,
          messages: [{ role: 'user', content: spec.userMessage }]
        }
      });
      pendingTypes.push('monthly');
    }
  }
  // quarterly — 분기 첫 달 1일 4AM cutoff
  if (_shouldRunSchedule(state.lastQuarterlyReviewBatchAt, _lastQuarterly4amCutoff())) {
    // ERROR #12 fix: prevQ 명시 계산.
    const now = new Date();
    const Q = Math.floor(now.getMonth() / 3) + 1;
    const prevQuarterKey = Q === 1 ? `${now.getFullYear() - 1}-Q4` : `${now.getFullYear()}-Q${Q - 1}`;
    const stats = (typeof getQuarterlyStats === 'function' && getQuarterlyStats(prevQuarterKey)) || null;
    if (stats) {
      const data = _collectQuarterlyData(prevQuarterKey, stats);
      const spec = _buildQuarterlyReviewPrompt(prevQuarterKey, stats, data);
      if (spec) {
        reviewKeys.quarterly = prevQuarterKey;
        requests.push({
          custom_id: `review_quarterly_${prevQuarterKey}`,
          params: {
            model: spec.model,
            max_tokens: spec.max_tokens,
            system: spec.system,
            messages: [{ role: 'user', content: spec.userMessage }]
          }
        });
        pendingTypes.push('quarterly');
      }
    }
  }
  // annual — 1월 1일 4AM cutoff
  if (_shouldRunSchedule(state.lastAnnualReviewBatchAt, _lastAnnual4amCutoff())) {
    const prevYear = new Date().getFullYear() - 1;
    const data = _collectAnnualData(prevYear);
    const spec = _buildAnnualReviewPrompt(prevYear, data);
    if (spec) {
      reviewKeys.annual = prevYear;
      requests.push({
        custom_id: `review_annual_${prevYear}`,
        params: {
          model: spec.model,
          max_tokens: spec.max_tokens,
          system: spec.system,
          messages: [{ role: 'user', content: spec.userMessage }]
        }
      });
      pendingTypes.push('annual');
    }
  }

  return { requests, reviewKeys, pendingTypes };
}

// 사용자 명시 2026-05-02 ultrathink (A 옵션): diary auto summary batch — 어제부터 7일 거슬러 missing entry 의 request 추가.
// inline path (runDiaryAutoSummaryIfNeeded) 와 동일 가드: entry 있고 + diary X + aiSummary X + chatMessages 2+ OR 체크인 정보 있음.
// _pendingDiarySummary 마커 적용해 batch 처리 중 inline race 차단.
function _buildDiaryBatchRequests() {
  if (!FEATURE_BATCH_DIARY) return { requests: [], pendingDates: [] };
  const requests = [];
  const pendingDates = [];

  // 사용자 보고 2026-05-17 ultrathink: inline path 와 동일 bug — calendar 기준 시작점이라 새벽 4시 전 today entry 가 batch 에 끼어듦.
  //   fix: 앵커 = todayKey() (cutoff-aware), setDate(-i) on 그 앵커의 noon. dateKey === todayKey() 가드 추가.
  const _todayDk = (typeof todayKey === 'function') ? todayKey() : null;
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
    if (entry.diary) continue;
    if (entry.aiSummary) continue;
    if (entry._pendingDiarySummary) continue;  // 이미 batch 가 처리 중
    // 사용자 보고 2026-05-04 (B16): testerMode 아닐 때 시드 entry 제외 — '엄마 김치찌개' 등 더미 데이터 batch 요약 노출 차단.
    const _isTesterBD = !!(state.preferences && state.preferences.testerMode);
    if (!_isTesterBD && entry._seed) continue;

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
    const hasContext = messages.length >= 2 || entry.vitality != null || entry.mood != null || (entry.note && entry.note.trim());
    if (!hasContext) continue;

    const spec = _buildDiarySummaryPrompt(dateKey, messages, entry);
    requests.push({
      custom_id: `diary_${dateKey}`,
      params: {
        model: spec.model,
        max_tokens: spec.max_tokens,
        messages: [{ role: 'user', content: spec.userMessage }]
      }
    });
    entry._pendingDiarySummary = true;
    pendingDates.push(dateKey);
  }

  return { requests, pendingDates };
}

// Batch submit — pending archive 들 → multi-request batch 으로 제출.
// 사용자 명시 2026-05-02 ultrathink: chapter + topic + review (4 type) 같은 batch 안 통합 — batch_id 한 개.
// 사용자 명시 2026-05-08 ultrathink: chapter case_analysis = inline 즉시 (UX — 나 탭 dot 1-2분 안에).
//   topic / review / diary 는 batch 유지 (50% 할인 + polling 가속 5/15/30분).
//   추가 비용 ~$0.05~0.1/주/사용자. 자연 종료 챕터만 영향 (사용자 ✓ 챕터는 이미 inline 처리됨).
async function _submitDailyExtractBatch(pending) {
  // 사용자 명시 2026-05-08 ultrathink: 이어서한 archive 의 _extractFromIndex 적용 — 옛 부분 input 제외.
  // chapter case_analysis 만 inline fire-and-forget — 사용자 wait X.
  // 사용자 보고 2026-05-10 (audit): 옛 `>= 6` 가드 = 짧은 챕터 (3-5 메시지) case_analysis 완전 skip → 나 탭 갱신 누락.
  //   topic 추출은 `>= 3` 인데 case_analysis 만 `>= 6` 이라 mismatch. pending 필터 (`>= 3`) 와 동일하게.
  pending
    .filter(b => {
      if (!b || !b.messages) return false;
      const _msgs = (typeof _chapterExtractMessages === 'function') ? _chapterExtractMessages(b) : b.messages;
      return _msgs.length >= 3;
    })
    .forEach(b => {
      const _msgs = (typeof _chapterExtractMessages === 'function') ? _chapterExtractMessages(b) : b.messages;
      // 사용자 명시 2026-05-11 ultrathink: 메시지 단위 분리 — 옛 path 는 isSimulation 미전달이라 시뮬 메시지가 cf 5차원 침투. _runDailyExtractInline (line 384-394) 모범 패턴 동일.
      const _normalMsgs = _msgs.filter(m => !m || !m.isSimulationContext);
      const _simMsgs = _msgs.filter(m => m && m.isSimulationContext);
      const _normalP = _normalMsgs.length >= 3 ? extractChapterCaseAnalysis(_normalMsgs) : Promise.resolve();
      const _simP = _simMsgs.length >= 3 ? extractChapterCaseAnalysis(_simMsgs, { isSimulation: true }) : Promise.resolve();
      Promise.all([_normalP, _simP])
        .then(() => {
          delete b._pendingCaseAnalysis;
          try { saveState(); } catch {}
        })
        .catch(e => console.warn('[chapter case inline]', b.id, e));
    });

  const requests = [];
  for (const batch of pending) {
    // case_analysis = inline 분리 (위). topic 만 batch.
    const _topicMsgs = (typeof _chapterExtractMessages === 'function') ? _chapterExtractMessages(batch) : batch.messages;
    if (_topicMsgs.length < 3) continue;
    requests.push({
      custom_id: `topic_${batch.id}`,
      params: {
        model: 'claude-haiku-4-5',
        max_tokens: 600,
        messages: [{ role: 'user', content: _buildExtractTopicPrompt(_topicMsgs) }]
      }
    });
  }

  // 사용자 명시 2026-05-02 ultrathink: review batch 통합 추가.
  const reviewBatch = _buildReviewBatchRequests();
  requests.push(...reviewBatch.requests);

  // 사용자 명시 2026-05-02 ultrathink (A 옵션): diary auto summary batch 통합.
  const diaryBatch = _buildDiaryBatchRequests();
  requests.push(...diaryBatch.requests);

  if (requests.length === 0) {
    state.lastDailyChapterExtractAt = new Date().toISOString();
    saveState();
    return;
  }

  console.log(`[daily extract] ${pending.length} 챕터 (case inline) + ${reviewBatch.pendingTypes.length} 리뷰 + ${diaryBatch.pendingDates.length} 일기 → ${requests.length} batch requests submit`);

  try {
    const resp = await _authedFetch('/api/chat-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
      body: JSON.stringify({ action: 'submit', requests })
    });
    if (!resp.ok) throw new Error('batch submit failed: ' + resp.status);
    const data = await resp.json();
    if (!data.id) throw new Error('batch_id 없음');

    state.pendingBatch = {
      batch_id: data.id,
      submitted_at: Date.now(),
      archive_ids: pending.map(p => p.id),
      review_pending: reviewBatch.pendingTypes,         // ['weekly', 'monthly', ...] race 차단용
      review_keys: reviewBatch.reviewKeys,               // { weekly: weekKey, monthly: monthKey, ... }
      diary_pending_dates: diaryBatch.pendingDates       // ['2026-05-01', ...] inline race 차단용
    };
    pending.forEach(b => { b._batchSubmittedAt = Date.now(); });
    state.lastDailyChapterExtractAt = new Date().toISOString();
    // 사용자 보고 2026-05-08 ultrathink: schedule cooldown stamp = 다음 cycle 시작 - 1ms.
    //   옛: stamp = now → 사용자가 cycle 가로질러 (예: 1주+ 갭 후 일요일 진입 → 월요일 진입) 시 두 번 trigger.
    //   fix: 현재 cycle 끝 시점 stamp → 같은 cycle 안 재 trigger 차단 + 다음 cycle 시작 시 정상 trigger.
    if (reviewBatch.pendingTypes.includes('weekly')) {
      const _nextWeek = new Date(_lastWeekly4amCutoff().getTime() + 7 * 86400000 - 1);
      state.lastWeeklyReviewBatchAt = _nextWeek.toISOString();
    }
    if (reviewBatch.pendingTypes.includes('monthly')) {
      const _curMon = _lastMonthly4amCutoff();
      const _nextMon = new Date(_curMon.getFullYear(), _curMon.getMonth() + 1, 1, 4, 0, 0, -1);
      state.lastMonthlyReviewBatchAt = _nextMon.toISOString();
    }
    if (reviewBatch.pendingTypes.includes('quarterly')) {
      const _curQ = _lastQuarterly4amCutoff();
      const _nextQ = new Date(_curQ.getFullYear(), _curQ.getMonth() + 3, 1, 4, 0, 0, -1);
      state.lastQuarterlyReviewBatchAt = _nextQ.toISOString();
    }
    if (reviewBatch.pendingTypes.includes('annual')) {
      const _curA = _lastAnnual4amCutoff();
      const _nextA = new Date(_curA.getFullYear() + 1, 0, 1, 4, 0, 0, -1);
      state.lastAnnualReviewBatchAt = _nextA.toISOString();
    }
    saveState();
    console.log(`[daily extract] batch submitted: ${data.id} — review_pending: ${reviewBatch.pendingTypes.join(',') || '(none)'}`);
    if (typeof renderChatArchiveModal === 'function') renderChatArchiveModal();
    if (typeof renderReviewPrompts === 'function') renderReviewPrompts();
  } catch (e) {
    console.warn('[daily extract] batch submit fail — fallback 일반 API:', e);
    // 사용자 명시 2026-05-02 ultrathink: diary _pendingDiarySummary 마커 cleanup — inline path 가 다시 처리할 수 있게.
    if (diaryBatch && Array.isArray(diaryBatch.pendingDates)) {
      diaryBatch.pendingDates.forEach(dk => {
        const ent = (state.entries || []).find(en => en.date === dk);
        if (ent) delete ent._pendingDiarySummary;
      });
    }
    await _runDailyExtractInline(pending);
  }
}

// pending batch 결과 fetch + 처리. 사용자 활동 시점 (앱 진입 / 다음 4AM) 호출.
async function _resumePendingBatch() {
  const pb = state.pendingBatch;
  if (!pb || !pb.batch_id) return;

  try {
    // status check
    const statusResp = await _authedFetch('/api/chat-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
      body: JSON.stringify({ action: 'status', batch_id: pb.batch_id })
    });
    if (!statusResp.ok) {
      console.warn('[batch status] fail:', statusResp.status);
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
      // 사용자 명시 2026-05-02 ultrathink (A 옵션): diary auto summary 분기.
      if (customId.startsWith('diary_')) {
        try {
          const dateKey = customId.slice('diary_'.length);
          const summary = _processDiarySummaryResult(text);
          const entry = (state.entries || []).find(e => e.date === dateKey);
          if (entry && summary) {
            entry.aiSummary = summary;
            entry.dailySource = 'auto';
            delete entry._pendingDiarySummary;
          } else if (entry) {
            delete entry._pendingDiarySummary;  // 결과 빈 시도 마커 cleanup
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
  // diary 의 _pendingDiarySummary 마커 cleanup — inline path (runDiaryAutoSummaryIfNeeded) 가 다시 처리 가능하게.
  if (diaryDates.length > 0) {
    diaryDates.forEach(dk => {
      const ent = (state.entries || []).find(en => en.date === dk);
      if (ent) delete ent._pendingDiarySummary;
    });
    saveState();
    // 다음 사용자 진입 시 (init 7초 후) runDiaryAutoSummaryIfNeeded 가 자동 처리.
  }
  if (targets.length === 0 && reviewTypes.length === 0 && diaryDates.length === 0) {
    saveState();
  }
  // 사용자 보고 2026-05-10 (audit batch 3): timeout fallback 후 홈 카드들 갱신 — pendingBatch null 됐으니 yesterdayCard / 주간 리뷰 카드 hide 가드 풀림.
  if (typeof renderYesterdayCard === 'function') { try { renderYesterdayCard(); } catch {} }
  if (typeof renderReviewPrompts === 'function') { try { renderReviewPrompts(); } catch {} }
  if (typeof renderModel === 'function') { try { renderModel(); } catch {} }
  if (typeof renderModelPreview === 'function') { try { renderModelPreview(); } catch {} }
}

// V4 사용자 명시 2026-05-01 ultrathink: 사용자 활동 시 (load / sendChat) trigger.
// 사용자 명시 2026-05-02 ultrathink: 4AM extract → Batch API 50% 할인.
// 1. pending batch 결과 먼저 처리 (batch_id 있으면 fetch). 12h 지났으면 timeout fallback.
// 2. 잠든 상태 (5h+ 갭) + 4AM cutoff → archive 이송 + batch submit.
async function maybeRunDailyChapterExtract() {
  if (!authUserId || window._onbTutorialMode) return;
  if (state.preferences && state.preferences.testerMode) return;
  if (!_canAI()) return;

  // 1. pending batch 결과 먼저 처리 (잠든 상태 가드 위에 둠 — 사용자 활동 시 즉시 결과 가져옴)
  if (state.pendingBatch && state.pendingBatch.batch_id) {
    await _resumePendingBatch();
    if (state.pendingBatch && state.pendingBatch.batch_id) {
      // 아직 결과 미완 — 12h 지났으면 timeout fallback
      const submittedMs = state.pendingBatch.submitted_at || 0;
      if (Date.now() - submittedMs > 12 * 3600 * 1000) {
        await _timeoutPendingBatch();
      } else {
        // 사용자 명시 2026-05-08 ultrathink (재): polling 가속 — 5분/15분/30분 retry.
        //   Anthropic Batch API typical latency = 5분~1시간. 2/4/6분 polling 은 너무 짧음 (대부분 fail).
        //   5/15/30분 = 평균 도착 시점 cover. 30분 후 미도착 = 사용자 다음 진입 시 처리.
        //   한 batch_id 당 1번만 schedule (window flag 가드). _resumePendingBatch 가 모든 type
        //   (chapter case+topic, weekly/monthly/quarterly/annual review, diary) 통합 처리.
        const _bid = state.pendingBatch.batch_id;
        if (window._pendingBatchPollingFor !== _bid) {
          window._pendingBatchPollingFor = _bid;
          [300000, 900000, 1800000].forEach(ms => {  // 5min / 15min / 30min
            setTimeout(() => {
              if (state.pendingBatch && state.pendingBatch.batch_id === _bid) {
                _resumePendingBatch().catch(e => console.warn('[batch polling retry]', e));
              }
            }, ms);
          });
        }
      }
      // batch 처리 중이면 새 batch 안 넣음 (중복 방지)
      return;
    }
  }

  // 2. 4AM cutoff schedule check
  if (!_shouldRunSchedule(state.lastDailyChapterExtractAt, _lastDaily4amCutoff())) return;

  // V4 (사용자 명시 2026-05-08): 4AM cutoff 자동 추출 폐기 — 사용자가 ✓ 깨달음 버튼 누른 것만 추출.
  // mutation chat 활성 상태로 잠들었으면 단순 close (skipSave=true). archive 추가 X.
  if (typeof _mutationChatState !== 'undefined' && _mutationChatState
      && typeof closeMutationChat === 'function') {
    try { closeMutationChat(true); } catch {}
  }

  // 4AM 시점 mood 패턴 위기 detect (자살예방법 §15-6)
  if (typeof _checkCrisisPattern === 'function' && _checkCrisisPattern()) {
    if (typeof showCrisisCarousel === 'function') {
      setTimeout(() => showCrisisCarousel('mood_pattern'), 1500);
    }
  }

  // 3. 잠든 상태 가드 — step 4 (chatMessages → archive 이송) 만 막는 의도.
  //   V4 (사용자 명시 2026-05-20 ultrathink): 4AM cutoff 단순 룰 — last msg < (직전 4AM cutoff - 5분) 이면 archive.
  //   옛 (_isDifferentDay && _gap >= 5h) 룰 폐기. 새 룰은 자정~새벽 단발 chat 도 매일 batch 에 묶이게.
  //   mid-session 보호: last msg 가 cutoff 직전 5분 또는 cutoff 이후 = defer (다음 4AM batch).
  //   archive date = first msg dayK (4AM 기준) — _archiveCurrentChapter 가 이미 그렇게 처리.
  //   사용자 보고 2026-05-12 ultrathink (보존): 가드 4 는 step 4 의 if 조건만 막음. step 5/6 (이미 archive 된 pending 의 batch submit) 은 항상 실행.
  const lastMsg = (state.chatMessages && state.chatMessages.length > 0)
    ? state.chatMessages[state.chatMessages.length - 1] : null;
  const _lastMs = (lastMsg && lastMsg.timestamp) ? new Date(lastMsg.timestamp).getTime() : null;
  let _shouldArchive = false;
  if (_lastMs != null) {
    const _cutoffMs = _lastDaily4amCutoff().getTime();
    _shouldArchive = _lastMs < (_cutoffMs - 5 * 60 * 1000);
  }

  // 4. chatMessages 의 현재 챕터도 archive 이송 — cutoff 통과 시.
  if (_shouldArchive
      && state.chatMessages && state.chatMessages.length >= 3
      && typeof _archiveCurrentChapter === 'function') {
    _archiveCurrentChapter({ manual: false });
  }

  // 5-pre. msgs < 3 archive 의 stuck 마커 cleanup — 사용자 보고 2026-05-12 ultrathink.
  //   batch path filter (아래 line) + _submitDailyExtractBatch / _runDailyExtractInline 모두 `messages.length >= 3` 필수.
  //   _archiveCurrentChapter 의 minLen=3 가드로 정상 path 엔 안 들어가지만 마이그레이션 / 옛 코드 / race 잔재 케이스 = 영원히 stuck → "🌙 4시 자동 정리 예정" 무한 노출.
  //   처리할 방법이 없는 archive 의 _pending* 마커만 정리. archive 자체 (history) 는 보존 — 사용자가 도서관에서 직접 삭제 가능.
  // V4 fix (사용자 보고 2026-05-17 ultrathink): 가드 확장 — messages 필드 자체 없거나 array 아닌 케이스도 cover.
  //   옛 root cause: Array.isArray(a.messages) && a.messages.length < 3 = messages 필드 없는 archive (옛 2026-05-10 이전 형식) 는 SKIP → 영원히 stuck.
  //   확장: messages 없거나 array 아니거나 <3 → 다 cleanup.
  let _sweptDeadMarker = false;
  (state.chatArchive || []).forEach(a => {
    if (!a || a._deleted) return;
    if (a._pendingExtract || a._pendingCaseAnalysis) {
      const _msgs = a.messages;
      const _invalid = !Array.isArray(_msgs) || _msgs.length < 3;
      if (_invalid) {
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

  // 5. pending archive 모음
  const pending = (state.chatArchive || []).filter(a =>
    a && !a._deleted && (a._pendingExtract || a._pendingCaseAnalysis) && Array.isArray(a.messages) && a.messages.length >= 3
  );
  if (pending.length === 0) {
    state.lastDailyChapterExtractAt = new Date().toISOString();
    saveState();
    return;
  }

  // 6. batch submit (50% 할인)
  await _submitDailyExtractBatch(pending);

  // 7. 자동 인사이트 발견 (사용자 명시 2026-05-16 ultrathink) — 7일 cooldown + entries>=7 가드 내부.
  if (typeof maybeRunDailyInsightDiscover === 'function') {
    try { await maybeRunDailyInsightDiscover(); } catch (e) { console.warn('[auto-insight]', e); }
  }
}

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
// V4 (사용자 명시 2026-05-08 ultrathink — 재): forceAnalyze (전체 데이터) → extractChapterCaseAnalysis (chatMessages 만, Opus 4.7) 으로 변경.
//   게스트 entries 거의 0 이라 forceAnalyze 의 entries/archive 분석 의미 X. chatMessages 분석이 합리.
//   모델은 Opus — 게스트/미구독자에게 가장 풍부한 분석 제공 (옛 forceAnalyze 도 Opus 였음).
// trigger: generateAIResponse 끝 hook.
// 가드:
//   - 미구독 (게스트 or 인증 X subscription_active) 만
//   - testerMode X (saveState noop 라 마킹 X / 개발자 본인 = 노이즈)
//   - chatMessages user role count 가 정확히 3 / 6 / 9 ... (3 배수)
//   - cooldown 60초 (race + 같은 turn 내 중복 fire 차단)
// 효과: 미구독 사용자가 데이터 쌓일 때마다 점진적으로 나 탭 (modelTraits/Values/Patterns) 갱신.
// ═══════════════════════════════════════════════════════════════
async function _maybeAutoForceAnalyzeFreeTier() {
  if (typeof state === 'undefined' || !state) return;
  if (state.preferences && state.preferences.testerMode) return;
  // 사용자 보고 2026-05-11: admin 계정도 매 3턴 자동 갱신 firing → 시뮬 중 방해. admin = 자동 X.
  if (typeof _isAdmin === 'function' && _isAdmin()) return;
  // 구독 detect — window._billingCache 가 source of truth (refreshBillingStatus 가 채움).
  const billing = window._billingCache;
  const isPaid = !!(billing && billing.subscription_active && billing.subscription_plan
    && ['light', 'premium', 'early_light', 'early_lifetime'].includes(billing.subscription_plan));
  if (isPaid) return;  // 유료 구독자 = 다른 흐름 (사용자 직접 클릭) — 자동 X
  // user role 메시지 count — 사용자 보고 2026-05-11: 시뮬 컨텍스트 메시지 제외 (시뮬 토론 중 자동 분석 firing 회피).
  const userMsgCount = (state.chatMessages || []).filter(m =>
    m && m.role === 'user' && !m.error && !m.typing && !m.isSimulationContext
  ).length;
  if (userMsgCount === 0 || userMsgCount % 3 !== 0) return;
  // cooldown — 같은 3턴 안에서 multi-fire 차단 + race 안전
  state.preferences = state.preferences || {};
  const lastAt = state.preferences._autoForceAnalyzeLastAt;
  if (lastAt) {
    try {
      const last = new Date(lastAt).getTime();
      if (Date.now() - last < 60000) return;
    } catch {}
  }
  state.preferences._autoForceAnalyzeLastAt = new Date().toISOString();
  try { saveState(); } catch {}
  // 사용자 명시 2026-05-08 ultrathink: extractChapterCaseAnalysis 호출. 옛 forceAnalyze 폐기.
  // 사용자 보고 2026-05-10 (audit-billing 노랑): 게스트 3턴마다 Opus 4.7 자동 호출 → 게스트 cap $0.30 빠른 소진.
  //   fix: 게스트 + 미구독자 = Sonnet (default). Premium 만 Opus. Opus 비용 = Sonnet 의 ~5배.
  if (typeof extractChapterCaseAnalysis === 'function') {
    try {
      const _msgs = (state.chatMessages || []).slice();
      const _bill = window._billingCache;
      const _isPremium = !!(_bill && _bill.subscription_plan === 'premium' && _bill.subscription_active);
      const _useOpus = _isPremium;
      await extractChapterCaseAnalysis(_msgs, { model: _useOpus ? 'claude-opus-4-7' : 'claude-sonnet-4-6' });
      // 사용자 명시 2026-05-15 ultrathink: 게스트 첫 자동 추출 직후 '나' 탭 가입 유도 배너 트리거 — 18-model-rendering.js 의 _renderGuestNudgeBanner 가 이 플래그 감시. 2026-05-08 통합(13e267f) 시 같이 사라졌던 회귀 복원. 첫 1회만 (가드 + dismiss 후 영구).
      if (state.isGuest && !state._guestAutoExtracted) {
        state._guestAutoExtracted = true;
        try { saveState(); } catch {}
        // V4 fix (사용자 보고 2026-05-17): 게스트 첫 추출 후 '나 탭 정리' 토스트 제거.
        //   사용자 보고 — 3턴 만에 토스트 뜨는데 나 탭 실제 갱신 안 돼 misleading. flag + renderModel 만 유지 (nudge banner trigger 보존).
        if (typeof renderModel === 'function') renderModel();
      }
    } catch (e) { console.warn('[auto chapter case]', e); }
  }
}
