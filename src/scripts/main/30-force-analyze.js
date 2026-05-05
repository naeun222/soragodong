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
      missions: (state.missions || []).slice(-15).map(m => ({
        title: m.title, status: m.status, attemptStatus: m.attemptStatus
      })),
      decisions: (state.decisions || []).filter(d => !d._deleted).slice(-5).map(d => ({
        topic: d.topic || d.title, status: d.status
      })),
      activeModes: Object.keys(state.modes || {}).filter(k => state.modes[k])
    };
    const prompt = `너는 임상심리학자로서 이 사용자의 Case Formulation을 구축한다.

아래는 사용자 데이터야:

${JSON.stringify(dataDump, null, 2)}

JSON으로 출력:

{
  "traits": [{"name": "...", "description": "근거와 함께", "confidence": 0.0-1.0}],
  "values": [{"name": "...", "description": "...", "sdt_need": "autonomy/competence/relatedness", "confidence": 0.0-1.0}],
  "patterns": [{"name": "...", "trigger": "...", "sequence": "...", "description": "...", "confidence": 0.0-1.0}],
  "case_formulation": {
    "problems": ["..."],
    "mechanisms": ["..."],
    "strengths": ["..."]
  }
}

원칙:
- 관찰 가능한 행동·표현에 근거.
- 사용자 실제 언어 반영.
- ADHD·직업·가치관 맥락 고려.
- 수면 시각 규칙성, 활력 변동, 2D affect 패턴, 미션 수락·완료 패턴도 해석.
- 활성 모드(월경, 마감 등) 컨텍스트로 분석.
- 각 카테고리 최대 5개씩 (5-10 X — 토큰 제한).
- JSON만 출력.
- 응답 잘리지 않게 짧고 구체적으로.

[필터 — 자동 거름] (사용자 명시 2026-05-03)
- trivial 일상 (음식·날씨·일정·단순 사건·짧은 잡담) 패턴화 X. 일회성 / 일반론 / 추측 X.
- 강한 자기상 / 감정 / 관계 / 갈등 / 변곡점 신호만.
- confidence < 0.6 항목 출력 X (강한 신호 아니면 등록 X).`;

    const response = await callAnthropic({ _endpoint: 'analyze_4stage', model: 'claude-opus-4-7', max_tokens: 2500, messages: [{ role: 'user', content: prompt }] });
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

    // V3.13.x: 덮어씌움 X. 추가 + 중복은 합치기 (evidence_count↑, confidence/description 더 좋은 거 채택)
    const mergeModelItem = (existing, incoming) => {
      existing.evidence_count = (existing.evidence_count || 1) + 1;
      if ((incoming.confidence || 0) > (existing.confidence || 0)) existing.confidence = incoming.confidence;
      if (incoming.description && (!existing.description || incoming.description.length > existing.description.length)) {
        existing.description = incoming.description;
      }
      // user_verified는 그대로 유지 (사용자가 검증한 건 안 건드림)
    };
    // 사용자 명시 2026-05-03 ultrathink: trivial 노이즈 cut — 신규 등록은 confidence 0.6 이상만 (mergeModelItem 갱신은 그대로).
    const NEW_THRESHOLD = 0.6;
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

// 사용자 명시 2026-05-02 ultrathink: 리뷰 batch schedule 헬퍼 — 직전 schedule 시점 (월요일 4AM / 매월 1일 4AM / 분기 첫 달 1일 4AM / 1월 1일 4AM).
// `_shouldRunSchedule(state.lastWeeklyReviewBatchAt, _lastWeekly4amCutoff())` 패턴으로 batch submit 자격 체크.

// 직전 월요일 4AM cutoff. (지난 주 = 그 직전 주 일요일 종료 시점 → 월요일 새벽 batch).
// 지금이 월요일 4AM 이전이면 = 지지난 월요일 4AM (이번 월요일 batch 아직 안 했음).
// 지금이 월요일 4AM 이후이면 = 이번 월요일 4AM (batch 자격).
function _lastWeekly4amCutoff() {
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 4, 0, 0, 0);
  // dayOfWeek: 0=일 1=월 ... 6=토. 월요일 = 1.
  const dow = cutoff.getDay();
  // 가장 가까운 과거 월요일까지 거슬러 (오늘이 월요일 4AM 이후면 0일, 화요일이면 1일, ..., 일요일이면 6일)
  const daysBack = (dow === 1) ? (cutoff <= now ? 0 : 7) : ((dow + 6) % 7);
  cutoff.setDate(cutoff.getDate() - daysBack);
  // 만약 cutoff 가 미래면 (월요일 4AM 이전) 1주 더 거슬러
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
  for (const batch of pending) {
    // V4 사용자 명시 2026-05-04: 추출 직전/직후 snapshot diff → 새 derived 항목에
    // sourceArchiveId 박음 (cascade soft delete 추적용).
    const _before = (typeof _captureDerivedSnapshot === 'function') ? _captureDerivedSnapshot() : null;
    try {
      if (batch.messages.length >= 6) {
        await extractChapterCaseAnalysis(batch.messages);
      }
    } catch (e) { console.warn('[inline] case fail:', e); }
    try {
      if (typeof extractPreviousChapterTopics === 'function') {
        await extractPreviousChapterTopics(batch.messages);
      }
    } catch (e) { console.warn('[inline] topic fail:', e); }
    _pushMagicReflectionArchive(batch);
    if (_before && typeof _stampSourceArchiveId === 'function') {
      _stampSourceArchiveId(_before, batch.id, batch);
    }
    delete batch._pendingExtract;
    delete batch._pendingCaseAnalysis;
    delete batch._batchSubmittedAt;
  }
  state.lastDailyChapterExtractAt = new Date().toISOString();
  saveState();
  if (typeof renderChatArchiveModal === 'function') renderChatArchiveModal();
  if (typeof renderArchive === 'function') renderArchive();
  // 사용자 명시 2026-05-02 ultrathink: batch 처리 끝 → 어제 카드 자동 갱신 (사용자 홈 보고 있으면 즉시 노출).
  if (typeof renderYesterdayCard === 'function') renderYesterdayCard();
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
      // ERROR #14 fix: weekKey 기준 = cutoff (지난 주 시작) 으로 저장.
      const weekKey = getWeekKey(data.cutoff);
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

  for (let i = 1; i <= 7; i++) {
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    noon.setDate(noon.getDate() - i);
    const dateKey = (typeof getDayKey === 'function') ? getDayKey(noon) : noon.toISOString().split('T')[0];

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
async function _submitDailyExtractBatch(pending) {
  const requests = [];
  for (const batch of pending) {
    if (batch.messages.length >= 6) {
      requests.push({
        custom_id: `case_${batch.id}`,
        params: {
          model: 'claude-sonnet-4-6',
          max_tokens: 1500,
          messages: [{ role: 'user', content: _buildExtractChapterPrompt(batch.messages) }]
        }
      });
    }
    requests.push({
      custom_id: `topic_${batch.id}`,
      params: {
        model: 'claude-haiku-4-5',
        max_tokens: 600,
        messages: [{ role: 'user', content: _buildExtractTopicPrompt(batch.messages) }]
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

  console.log(`[daily extract] ${pending.length} 챕터 + ${reviewBatch.pendingTypes.length} 리뷰 + ${diaryBatch.pendingDates.length} 일기 → ${requests.length} batch requests submit`);

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
    // schedule cooldown — 동일 cutoff 내 재submit 차단.
    const nowIso = new Date().toISOString();
    if (reviewBatch.pendingTypes.includes('weekly'))    state.lastWeeklyReviewBatchAt    = nowIso;
    if (reviewBatch.pendingTypes.includes('monthly'))   state.lastMonthlyReviewBatchAt   = nowIso;
    if (reviewBatch.pendingTypes.includes('quarterly')) state.lastQuarterlyReviewBatchAt = nowIso;
    if (reviewBatch.pendingTypes.includes('annual'))    state.lastAnnualReviewBatchAt    = nowIso;
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
      return;
    }
    const status = await statusResp.json();
    if (status.processing_status !== 'ended') {
      console.log(`[batch] still processing — ${JSON.stringify(status.request_counts || {})}`);
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
      return;
    }
    const data = await resultsResp.json();
    if (!data.ok || !Array.isArray(data.results)) {
      console.warn('[batch results] invalid:', data);
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
            if (json) {
              const review = {
                id: (reviewType === 'weekly' ? 'wr_' : 'mr_') + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                type: reviewType,
                completedAt: new Date().toISOString(),
                ...json,
                auto: true
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
              const data = _collectAnnualData(year);
              const annualReview = _processAnnualReviewResult(narrative, year, data, false);
              // batch path = auto: true (사용자가 click 안 함 — fresh 처리)
              if (annualReview) annualReview.auto = true;
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
          const key = type === 'weekly' ? getWeekKey(data.cutoff) : getMonthKey(data.cutoff);
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
      }
      // batch 처리 중이면 새 batch 안 넣음 (중복 방지)
      return;
    }
  }

  // 2. 4AM cutoff schedule check
  if (!_shouldRunSchedule(state.lastDailyChapterExtractAt, _lastDaily4amCutoff())) return;

  // V4 (사용자 명시 2026-05-04 — v7 §11 / v8 §11): 돌연변이 깨달음 자동 추출
  // 4AM cutoff 시점 _mutationChatState 활성 + messages>=5 면 LLM 추출 → state.archive type='mutation' + closeMutationChat (cleanup) + marker stash
  if (typeof _mutationChatState !== 'undefined' && _mutationChatState
      && Array.isArray(_mutationChatState.messages) && _mutationChatState.messages.length >= 5) {
    try {
      await _extractMutationInsight({ trigger: 'cutoff_auto', mutationChatState: _mutationChatState });
      state._mutationCutoffExtractedAt = new Date().toISOString();
      saveState();
    } catch (e) { console.warn('[mutation cutoff extract]:', e); }
    // mutation chat 자동 종료 (cleanup) — 사용자가 다음 진입 시 토스트 안내 (init 시점 hook 자리)
    if (typeof closeMutationChat === 'function') {
      try { closeMutationChat(true); } catch {}
    }
  }

  // 4AM 시점 mood 패턴 위기 detect (자살예방법 §15-6)
  if (typeof _checkCrisisPattern === 'function' && _checkCrisisPattern()) {
    if (typeof showCrisisCarousel === 'function') {
      setTimeout(() => showCrisisCarousel('mood_pattern'), 1500);
    }
  }

  // 3. 잠든 상태 (5h+ 갭) 가드
  const NEW_CHAPTER_GAP_MS = 5 * 60 * 60 * 1000;
  const lastMsg = (state.chatMessages && state.chatMessages.length > 0)
    ? state.chatMessages[state.chatMessages.length - 1] : null;
  const _gap = (lastMsg && lastMsg.timestamp)
    ? (Date.now() - new Date(lastMsg.timestamp).getTime())
    : Infinity;
  if (_gap < NEW_CHAPTER_GAP_MS) return;

  // 4. chatMessages 의 현재 챕터도 archive 이송
  if (state.chatMessages && state.chatMessages.length >= 3) {
    if (typeof _archiveCurrentChapter === 'function') {
      _archiveCurrentChapter({ manual: false });
    }
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
}

// 사용자 명시 2026-05-01 ultrathink: 옛 maybeRunWeekly/Monthly/Quarterly/YearlyAnalyze 제거.
// 자동 trigger 폐기 — 리뷰 카드 click 으로만 생성. last*AnalyzeAt state 필드는 보존 (옛 사용자 데이터 호환).

// 사용자 요청 2026-04-30 (변호사 검수): 첫 진입 동의 모달은 폐기 — login 화면 inline 동의 (state.preferences.consentLog 의 terms/privacy/crossBorder/age14/adult18/analytics) 로 통합. 처리는 위쪽 pending consent 블록 (localStorage 'soragodong_pending_consent' → consentLog) 단일 경로.

