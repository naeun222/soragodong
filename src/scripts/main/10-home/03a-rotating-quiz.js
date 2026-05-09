// 사용자 명시 2026-05-09 (회전 카드 spec final 6-4): Quiz source 4 — case formulation user_verified 기반.
// "고동이가 너 얼마나 맞히고 있을까?" — 5 question 묶음, 4AM cutoff, 진행 stash, dedupe 14d/1d.
// 의존: 03-rotating-card.js (state, helpers, _rcSessionMarkConfirmed, _rcCycle, renderRotatingCard).

// =============================================================================
// 4AM cutoff key (앱 일반 cutoff 와 일치)
// =============================================================================
function _rcQuizCutoffKey() {
  const now = new Date();
  // 4AM 이전이면 어제 날짜 키
  if (now.getHours() < 4) now.setDate(now.getDate() - 1);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// =============================================================================
// Quiz pool — case formulation user_verified=false + 추상 trait 제외 + dedupe
// =============================================================================
// 추상 / 구체 분류:
//  - 구체: name 안에 시간/숫자/관찰 가능 행동 표현 (예: "야행성", "주말 다음 월요일", "ㅠ 자주")
//  - 추상: 단순 형용사 / 인격 표현 (예: "신중한", "깊이 보는 사람")
// 자동 휴리스틱: name 길이 ≥ 4 + (description 길이 ≥ 8 또는 숫자/시간 단어 포함) → 구체로 인정
const _RC_QUIZ_CONCRETE_HINTS = /\d|[월화수목금토일]|시간|시\b|새벽|밤|아침|오후|주말|평일|아침|점심|저녁|마감|회의|카페|자주|많|적|짧|긴|이전|이후|뒤|앞|중|첫|마지막|더|덜|매일|매주/;

function _rcQuizIsConcreteEnough(item) {
  if (!item) return false;
  // 사용자 명시 2026-05-09: 시드/옛 사용자 = item.text, 새 force-analyze = item.name. 둘 다 인식.
  const name = String(item.name || item.text || '');
  if (name.length < 3) return false;
  const desc = String(item.description || '');
  // V1 휴리스틱: 5자 이상 = OK (시드 호환). 또는 구체 hint / description 길이 ≥ 12.
  if (name.length >= 5) return true;
  if (_RC_QUIZ_CONCRETE_HINTS.test(name) || _RC_QUIZ_CONCRETE_HINTS.test(desc)) return true;
  if (desc.length >= 12) return true;
  return false;
}

function _rcQuizCollectPool() {
  const r = _ensureRotatingCardState();
  const cf = state.caseFormulation || {};
  const now = Date.now();
  const dims = ['problems', 'mechanisms', 'strengths', 'goals', 'growth'];
  const pool = [];
  // 컨펌 안 된 것 (user_verified !== true) + 추상 제외 + dedupe cooldown 통과
  const visit = (kind, item, sourcePool) => {
    if (!item) return;
    const nm = item.name || item.text || '';
    if (!nm) return;
    if (item.user_verified === true) return;
    if (!_rcQuizIsConcreteEnough(item)) return;
    const id = `${kind}::${nm}`;
    // dedupe cooldown
    const denied = r.quizDeniedCooldown || {};
    const skipped = r.quizSkippedCooldown || {};
    if (denied[id] && denied[id] > now) return;
    if (skipped[id] && skipped[id] > now) return;
    pool.push({
      id, kind,
      name: nm,
      description: item.description || '',
      confidence: typeof item.confidence === 'number' ? item.confidence : 0.5,
      sourcePool,
    });
  };
  for (const kind of dims) {
    (Array.isArray(cf[kind]) ? cf[kind] : []).forEach(it => visit(kind, it, 'verified'));
    const ua = cf.unverified && Array.isArray(cf.unverified[kind]) ? cf.unverified[kind] : [];
    ua.forEach(it => visit(kind, it, 'unverified'));
  }
  return pool;
}

// =============================================================================
// Source 4 — Quiz card (4 가드: 신규 / 추상 / dedupe / 가용 < 5)
// =============================================================================
function _rcSource4Quiz() {
  const r = _ensureRotatingCardState();
  const todayK = _rcQuizCutoffKey();

  // 4AM cutoff — 새 날 진입 시 quizProgress 리셋 (새 5 pick 가능)
  if (r.quizDay !== todayK) {
    r.quizDay = todayK;
    r.quizProgress = null;
    r.quizScoreBefore = null;
  }

  // 사용자 명시 2026-05-09: Quiz 5개 단위로 진행. 한 세션 5개 다 풀면 다음 새 세션 (홈 진입) 에서 새 5개 pick.
  // 진행 stash 있고 끝났으면 → 새 세션이면 새 pick 으로 교체, 같은 세션이면 끝 화면 그대로.
  if (r.quizProgress && Array.isArray(r.quizProgress.questionIds) && r.quizProgress.questionIds.length > 0) {
    const p = r.quizProgress;
    const isDone = (p.currentIdx || 0) >= p.questionIds.length;
    if (isDone) {
      // 같은 세션 안 = 끝 화면 그대로 (사용자가 [좋아] 누르기 전)
      if (_rcSessionConfirmed.has('quiz')) {
        return _rcRenderQuizFromProgress();
      }
      // 새 세션 진입 = 남은 pool ≥ 5 면 새 pick, 아니면 source 비활성 (모아두기)
      const newPool = _rcQuizCollectPool();
      if (newPool.length < 5) return { id: 'quiz', available: false };
      const shuffled = newPool.slice().sort(() => Math.random() - 0.5);
      const picked = shuffled.slice(0, 5);
      r.quizProgress = {
        questionIds: picked.map(it => it.id),
        currentIdx: 0,
        answers: {},
      };
      r.quizScoreBefore = _rcQuizComputeAccuracyPct();
      if (typeof saveState === 'function') saveState();
      return _rcRenderQuizFromProgress();
    }
    // 진행 중 (다 답하지 않음) — 그대로 이어서
    return _rcRenderQuizFromProgress();
  }

  // 신규 — 사용자 명시 2026-05-09: 5개 단위. pool 5개 미만이면 source 비활성 (5개 모일 때까지 대기).
  const pool = _rcQuizCollectPool();
  if (pool.length < 5) return { id: 'quiz', available: false };

  // 5 random pick
  const shuffled = pool.slice().sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, 5);
  const questionIds = picked.map(it => it.id);
  // 점수 변화 표시용 — 시작 % stash
  r.quizScoreBefore = _rcQuizComputeAccuracyPct();
  r.quizProgress = {
    questionIds,
    currentIdx: 0,
    answers: {},
  };
  if (typeof saveState === 'function') saveState();
  // 사용자 명시 2026-05-09 ultrathink: pick 직후 quiz_question 없는 항목 batch Haiku polish 시작 (background).
  // extract-insight 프롬프트는 옛 형식 (quiz_question 안 받음) — polish 가 lazy 로 채움.
  if (typeof _rcStartQuizPolish === 'function') _rcStartQuizPolish(questionIds);
  return _rcRenderQuizFromProgress();
}

function _rcRenderQuizFromProgress() {
  const r = _ensureRotatingCardState();
  const p = r.quizProgress;
  if (!p || !Array.isArray(p.questionIds) || p.questionIds.length === 0) {
    return { id: 'quiz', available: false };
  }
  const total = p.questionIds.length;
  const idx = Math.min(p.currentIdx || 0, total);
  // 끝 화면
  if (idx >= total) {
    return _rcRenderQuizEndCard();
  }
  const itemId = p.questionIds[idx];
  const item = _rcQuizFindItem(itemId);
  if (!item) {
    // 항목 사라짐 (caseFormulation 갱신 등) → skip
    p.currentIdx = idx + 1;
    if (typeof saveState === 'function') saveState();
    return _rcRenderQuizFromProgress();
  }
  // 사용자 명시 2026-05-09 ultrathink: quiz_question 없고 polish 진행 중 = polishing 카드 (명사형 노출 회피)
  if (!item.quiz_question && _rcQuizPolishInflight && typeof _rcRenderQuizPolishingCard === 'function') {
    return _rcRenderQuizPolishingCard();
  }
  const desc = item.description || '';
  const descTrim = desc.length > 60 ? desc.slice(0, 60) + '…' : desc;
  // mini-indicator (카드 안 N 인디케이터)
  const miniIndicator = p.questionIds.map((_, i) => `<span class="rc-quiz-dot${i === idx ? ' is-active' : ''}"></span>`).join('');

  const bodyHtml = `
    <div class="rc-body-quiz">
      <div class="rc-body-headline">고동이가 너 얼마나 맞히고 있을까?</div>
      <div class="rc-quiz-progress">[${idx + 1}/${total}]</div>
      <div class="rc-quiz-question">${escapeHtml(item.displayQuestion || item.name)}</div>
      ${descTrim ? `<div class="rc-quiz-desc">${escapeHtml(descTrim)}</div>` : ''}
      <div class="rc-quiz-actions">
        <button class="rc-btn rc-btn--correct" type="button" onclick="event.stopPropagation(); _rcQuizAnswer('correct')">맞아 ✓</button>
        <button class="rc-btn rc-btn--wrong" type="button" onclick="event.stopPropagation(); _rcQuizAnswer('wrong')">아닌데 ✕</button>
        <button class="rc-btn rc-btn--skip" type="button" onclick="event.stopPropagation(); _rcQuizAnswer('skip')">넘기기 →</button>
      </div>
      <div class="rc-quiz-mini-row">
        <button class="rc-quiz-mini-arrow" type="button" onclick="event.stopPropagation(); _rcQuizPrevQuestion()" aria-label="이전 질문" ${idx === 0 ? 'disabled' : ''}>‹</button>
        <span class="rc-quiz-mini-indicator">${miniIndicator}</span>
        <button class="rc-quiz-mini-arrow" type="button" onclick="event.stopPropagation(); _rcQuizNextQuestion()" aria-label="다음 질문" ${idx >= total - 1 ? 'disabled' : ''}>›</button>
      </div>
    </div>
  `;
  return {
    id: 'quiz',
    available: true,
    contentHash: 'quiz_' + r.quizDay + '_' + idx,
    bodyHtml,
    onTapClick: '', // 카드 자체 탭 핸들러 X — 답 버튼만
    _isQuizActive: true,
  };
}

function _rcRenderQuizEndCard() {
  const r = _ensureRotatingCardState();
  const before = r.quizScoreBefore;
  const after = _rcQuizComputeAccuracyPct();
  const correctCount = _rcQuizCountAnswers('correct');
  const wrongCount = _rcQuizCountAnswers('wrong');
  const total = ((r.quizProgress && r.quizProgress.questionIds) || []).length;
  const summary = `오늘 ${correctCount}개 맞히고 ${wrongCount}개 빗나감.`;
  const scoreLine = (before != null && after != null)
    ? `${before}% → ${after}%`
    : (after != null ? `${after}%` : '');

  const bodyHtml = `
    <div class="rc-body-quiz rc-quiz-end">
      <div class="rc-body-headline">고동이 점수 ★</div>
      <div class="rc-quiz-summary">${escapeHtml(summary)}</div>
      ${scoreLine ? `<div class="rc-quiz-score-change">${escapeHtml(scoreLine)}</div>` : ''}
      <div class="rc-quiz-end-cta">
        <button class="rc-btn rc-btn--primary" type="button" onclick="event.stopPropagation(); _rcQuizConfirmEnd()">좋아</button>
      </div>
    </div>
  `;
  return {
    id: 'quiz',
    available: true,
    contentHash: 'quiz_end_' + r.quizDay,
    bodyHtml,
    onTapClick: '',
    _isQuizDone: true,
  };
}

function _rcQuizFindItem(itemId) {
  if (!itemId) return null;
  const sep = itemId.indexOf('::');
  if (sep <= 0) return null;
  const kind = itemId.slice(0, sep);
  const name = itemId.slice(sep + 2);
  const cf = state.caseFormulation || {};
  // 사용자 명시 2026-05-09: caseFormulation 5 차원 (problems/...) + traits/values/patterns 도 lookup.
  // quiz_question 필드가 traits/values/patterns 항목에 있을 수 있음 (extractChapter 가 stash).
  const arrays = [
    Array.isArray(cf[kind]) ? cf[kind] : null,
    cf.unverified && Array.isArray(cf.unverified[kind]) ? cf.unverified[kind] : null,
    Array.isArray(state.traits) ? state.traits : null,
    Array.isArray(state.values) ? state.values : null,
    Array.isArray(state.patterns) ? state.patterns : null,
  ].filter(Boolean);
  for (const arr of arrays) {
    const found = arr.find(it => it && (it.name === name || it.text === name));
    if (found) {
      // name||text 통합 + kind + quiz_question (있으면) 추가
      const baseName = found.name || found.text;
      return Object.assign({ kind }, found, {
        name: baseName,
        // displayQuestion = Quiz 카드 question. quiz_question 있으면 우선, 없으면 name 그대로.
        displayQuestion: found.quiz_question || baseName,
      });
    }
  }
  return null;
}

// =============================================================================
// Quiz 액션 — 답 / 넘기기 / 이전 / 다음 / 끝 컨펌
// =============================================================================
function _rcQuizAnswer(verdict) {
  const r = _ensureRotatingCardState();
  const p = r.quizProgress;
  if (!p || !Array.isArray(p.questionIds)) return;
  const idx = p.currentIdx || 0;
  const itemId = p.questionIds[idx];
  if (!itemId) return;
  if (!p.answers || typeof p.answers !== 'object') p.answers = {};
  p.answers[itemId] = verdict;

  // case formulation 항목 mutation + dedupe stash (name || text 둘 다 매칭)
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
      const i = arr.findIndex(it => it && (it.name === name || it.text === name));
      if (i >= 0) {
        const item = arr[i];
        if (verdict === 'correct') {
          item.user_verified = true;
          item.confidence = Math.min(1.0, (item.confidence || 0.5) + 0.2);
        } else if (verdict === 'wrong') {
          item.user_verified = false;
          item.confidence = Math.max(0.1, (item.confidence || 0.5) * 0.5);
          // 14일 cooldown
          if (!r.quizDeniedCooldown) r.quizDeniedCooldown = {};
          r.quizDeniedCooldown[itemId] = Date.now() + _RC_QUIZ_DENIED_COOLDOWN_MS;
        } else if (verdict === 'skip') {
          // 1일 cooldown
          if (!r.quizSkippedCooldown) r.quizSkippedCooldown = {};
          r.quizSkippedCooldown[itemId] = Date.now() + _RC_QUIZ_SKIPPED_COOLDOWN_MS;
        }
        break;
      }
    }
  }

  if (verdict === 'correct') {
    if (typeof showToast === 'function') showToast('고동이 +1');
  } else if (verdict === 'wrong') {
    if (typeof showToast === 'function') showToast('오케이 다시 볼게');
  }

  // 다음 질문 자동 advance
  p.currentIdx = idx + 1;
  if (typeof saveState === 'function') saveState();
  // sessionOrder 안 quiz 카드 위치 그대로 — 카드 컨텐츠만 갱신
  _rcQuizRefreshCard();
}

function _rcQuizPrevQuestion() {
  const r = _ensureRotatingCardState();
  const p = r.quizProgress;
  if (!p) return;
  if ((p.currentIdx || 0) <= 0) return;
  p.currentIdx = (p.currentIdx || 0) - 1;
  if (typeof saveState === 'function') saveState();
  _rcQuizRefreshCard();
}

function _rcQuizNextQuestion() {
  const r = _ensureRotatingCardState();
  const p = r.quizProgress;
  if (!p) return;
  const total = (p.questionIds || []).length;
  if ((p.currentIdx || 0) >= total - 1) return;
  p.currentIdx = (p.currentIdx || 0) + 1;
  if (typeof saveState === 'function') saveState();
  _rcQuizRefreshCard();
}

function _rcQuizConfirmEnd() {
  _rcSessionMarkConfirmed('quiz');
  if (typeof showToast === 'function') showToast('🐚 다음에 또 봐');
  // 다음 source 자동 cycle
  setTimeout(() => {
    if (typeof _rcCycle === 'function') _rcCycle(1);
  }, 200);
}

// sessionOrder 의 quiz 카드만 컨텐츠 갱신 (sessionOrder 변경 X)
function _rcQuizRefreshCard() {
  if (!_rcSessionOrder) {
    if (typeof renderRotatingCard === 'function') renderRotatingCard();
    return;
  }
  const idx = _rcSessionOrder.findIndex(s => s && s.id === 'quiz');
  if (idx < 0) {
    if (typeof renderRotatingCard === 'function') renderRotatingCard();
    return;
  }
  // quiz card 새 source 객체로 교체 (sessionOrder 안 위치 유지)
  const newSrc = _rcSource4Quiz();
  if (!newSrc || !newSrc.available) {
    // quiz 가 갑자기 비활성 (모든 항목 disappear) → 전체 재정렬
    if (typeof renderRotatingCard === 'function') renderRotatingCard();
    return;
  }
  _rcSessionOrder[idx] = newSrc;
  // 현재 인덱스가 quiz 가 아니면 그대로, quiz 면 카드 갱신
  const container = document.getElementById('rotatingCardContainer');
  if (container && typeof _rcRenderShell === 'function') {
    container.innerHTML = _rcRenderShell(_rcSessionOrder, _rcSessionIndex);
  }
}

// =============================================================================
// 누적 점수 — case formulation user_verified=true 비율
// =============================================================================
function _rcQuizComputeAccuracyPct() {
  const cf = state.caseFormulation || {};
  const dims = ['problems', 'mechanisms', 'strengths', 'goals', 'growth'];
  let total = 0;
  let verified = 0;
  for (const kind of dims) {
    (Array.isArray(cf[kind]) ? cf[kind] : []).forEach(it => {
      if (!it) return;
      const nm = it.name || it.text;
      if (!nm) return;
      total++;
      if (it.user_verified === true) verified++;
    });
  }
  if (total === 0) return null;
  return Math.round((verified / total) * 100);
}

function _rcQuizCountAnswers(verdict) {
  const r = _ensureRotatingCardState();
  const p = r.quizProgress;
  if (!p || !p.answers) return 0;
  return Object.values(p.answers).filter(v => v === verdict).length;
}
