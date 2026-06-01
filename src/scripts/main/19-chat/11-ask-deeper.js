async function askDeeper(messageIdx) {
  // V4 (v8 묶음 4): 진입 시 eligibility 체크
  const elig = _checkDeeperEligibility();
  if (!elig.ok) {
    _showDeeperCapToast();
    return;
  }
  // V4 (v8 묶음 16): 더 알아보기 첫 사용 placeholder dismiss
  if (typeof dismissPlaceholder === 'function') dismissPlaceholder('deeper');
  // Find the user message before this assistant response
  let userMsgIdx = messageIdx - 1;
  while (userMsgIdx >= 0 && state.chatMessages[userMsgIdx].role !== 'user') {
    userMsgIdx--;
  }
  if (userMsgIdx < 0) {
    showToast('관련 대화를 찾을 수 없어');
    return;
  }
  const userMsg = state.chatMessages[userMsgIdx];
  
  // V4-fix v3 (사용자 요청): 더 알고 싶어 → 4단 + 진단 인용 강제
  // 사용자 보고 2026-05-10: 대화탭 deeper prompt = 순수 4단 ([상황] 제거 — [상황]은 intake/미션 결과 체크 전용).
  state.chatMessages.push({
    role: 'user',
    content: '아까 그 얘기, 4단계로 더 깊게 분석해줘. [내가 본 것] / [이게 뭐냐면] / [이럴 땐 이렇게] / [오늘의 제안] 형식으로. 네가 관찰한 패턴도 한 줄 자연스럽게 인용해줘.',
    timestamp: new Date().toISOString(),
    isDeeperRequest: true
  });
  saveState();
  renderChat();
  // 사용자 요청 2026-04-30: '더 알아보기' 4단 응답 = 깊은 분석 → opus 4.7. 평소 메인 chat은 sonnet 유지.
  // 사용자 명시 2026-05-10 (재정정): 4단 분석은 plan 무관 누구나 Opus — cap 으로만 횟수 제한. 헤더 토글의 Opus 모드 (Premium 가드) 와 별개.
  // opts.isDeeper = true → callAnthropic body 에 is_deeper_analysis: true → backend Premium 가드 우회.
  let _deeperGenOk = false;
  try {
    await generateAIResponse('claude-opus-4-7', { isDeeper: true });
    // 마지막 assistant 메시지가 error 가 아닐 때만 정상 응답으로 인정.
    const _lastM = state.chatMessages[state.chatMessages.length - 1];
    _deeperGenOk = !!(_lastM && _lastM.role === 'assistant' && !_lastM.error && !_lastM.typing);
  } catch (_) {}
  // 사용자 보고 2026-05-10: 옛 흐름 = generate 실패해도 무조건 increment → cap 1 차감 + 30분 cooldown 발동 → "한 번만 눌러도 잠김" 버그.
  // 정상 응답 받았을 때만 cap 차감.
  if (_deeperGenOk && !window._onbTutorialMode && !(state.preferences && state.preferences.testerMode)) {
    _incrementDailyDeeperCount();
    const after = _checkDeeperEligibility();
    if (!after.ok && after.reason === 'cap' && state._dailyDeeperCount && !state._dailyDeeperCount.capToastShown) {
      state._dailyDeeperCount.capToastShown = true;
      saveState();
      showToast(`🔒 오늘 깊은 분석 ${after.cap}회 다 썼어 — 내일 또`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// 사용자 명시 2026-06-02: '이거 짚어줘' 기본 비트 + 가지 (왜 그런지 더 / 이어보기).
//   기본 비트 = ≤3줄 '한 수'. 조언/제안/전략/미션 일절 X (그건 '그럼 뭐 하지' = askDeeper).
//   비용: 기본 비트 + 가지 = beat cap (deeper×2, 쿨다운 없음). 무거운 '그럼 뭐 하지' = 기존 deeper cap.
// ═══════════════════════════════════════════════════════════════

// 콜드스타트 판정 + 이어보기 후보 — ctx(원본 대화)와 저장된 깨달음의 콘텐츠 단어 겹침으로 관련 과거 탐색.
const _BEAT_STOPWORDS = new Set(['그리고','근데','그래서','그게','그거','정말','진짜','너무','이거','저거','그런','이런','해서','하는','했어','있어','없어','같아','거야','그냥','약간','조금','계속']);
function _beatTokenize(s) {
  const out = new Set();
  String(s || '').toLowerCase().replace(/[^가-힣a-z0-9\s]/g, ' ').split(/\s+/).forEach(w => {
    if (w.length >= 2 && !_BEAT_STOPWORDS.has(w)) out.add(w);
  });
  return out;
}
function _findRelatedInsights(ctx, limit) {
  const items = (state.archive || []).filter(a => a && !a._deleted && a.type !== 'memo' && !a._excludeFromAI);
  if (!items.length || !ctx) return [];
  const ctxTokens = _beatTokenize(ctx);
  if (ctxTokens.size === 0) return [];
  const scored = items.map(a => {
    const text = [a.headline, a.body, a.insight, ...(Array.isArray(a.tags) ? a.tags : [])].filter(Boolean).join(' ');
    const tk = _beatTokenize(text);
    let overlap = 0;
    tk.forEach(w => { if (ctxTokens.has(w)) overlap++; });
    return { a, overlap };
  }).filter(x => x.overlap >= 2).sort((x, y) => y.overlap - x.overlap);
  return scored.slice(0, limit || 2).map(x => ({
    date: x.a.date || '',
    title: x.a.headline || (x.a.insight || x.a.body || '').slice(0, 40)
  }));
}
// 비트가 답한 원본 대화 텍스트 (원본 assistant + 직전 user).
function _beatContextText(idx) {
  const parts = [];
  const m = state.chatMessages[idx];
  if (m && m.content) parts.push(m.content);
  for (let i = idx - 1; i >= 0; i--) {
    const mm = state.chatMessages[i];
    if (mm && mm.role === 'user' && !mm.typing) { parts.push(mm.content || ''); break; }
  }
  return parts.join(' ').slice(0, 1000);
}

// beat cap 차감 + cap 도달 토스트 (성공 시에만). 튜토/테스터는 무제한 (increment X).
function _afterBeatGen() {
  if (window._onbTutorialMode || (state.preferences && state.preferences.testerMode)) return;
  if (typeof _incrementDailyBeatCount === 'function') _incrementDailyBeatCount();
  const after = (typeof _checkBeatEligibility === 'function') ? _checkBeatEligibility() : { ok: true };
  if (!after.ok && after.reason === 'cap' && state._dailyBeatCount && !state._dailyBeatCount.capToastShown) {
    state._dailyBeatCount.capToastShown = true;
    saveState();
    if (typeof _showBeatCapToast === 'function') _showBeatCapToast();
  }
}

// 1층 기본 비트 — 일반 assistant 메시지의 '이거 짚어줘' 칩.
async function askInsightBeat(idx) {
  const elig = (typeof _checkBeatEligibility === 'function') ? _checkBeatEligibility() : { ok: true };
  if (!elig.ok) { if (typeof _showBeatCapToast === 'function') _showBeatCapToast(); return; }
  if (typeof dismissPlaceholder === 'function') dismissPlaceholder('deeper');
  state.chatMessages.push({ role: 'user', content: '이거 짚어줘', timestamp: new Date().toISOString(), isBeatRequest: true });
  saveState();
  renderChat();
  let _ok = false;
  try {
    await generateAIResponse('claude-opus-4-7', { beat: true, maxTokens: 280, userContentType: 'insight_beat' });
    const _last = state.chatMessages[state.chatMessages.length - 1];
    _ok = !!(_last && _last.role === 'assistant' && !_last.error && !_last.typing && _last.fromBeat);
  } catch (_) {}
  if (_ok) {
    const beat = state.chatMessages[state.chatMessages.length - 1];
    try { beat.relatedCandidates = _findRelatedInsights(_beatContextText(idx), 2); } catch (_) { beat.relatedCandidates = []; }
    _afterBeatGen();
    saveState();
    renderChat();
  }
}

// 가지 — '왜 그런지 더' (개념 수준 심리). 비트 메시지 칩.
async function askWhyDeeper(idx) {
  const elig = (typeof _checkBeatEligibility === 'function') ? _checkBeatEligibility() : { ok: true };
  if (!elig.ok) { if (typeof _showBeatCapToast === 'function') _showBeatCapToast(); return; }
  state.chatMessages.push({ role: 'user', content: '왜 그런지 더', timestamp: new Date().toISOString(), isBranchReq: 'why' });
  saveState();
  renderChat();
  let _ok = false;
  try {
    await generateAIResponse('claude-opus-4-7', { branch: 'why', maxTokens: 520, userContentType: 'branch_why' });
    const _last = state.chatMessages[state.chatMessages.length - 1];
    _ok = !!(_last && _last.role === 'assistant' && !_last.error && !_last.typing && _last.fromBranch);
  } catch (_) {}
  if (_ok) { _afterBeatGen(); saveState(); renderChat(); }
}

// 가지 — '이어보기' (과거 깨달음 인용). idx = 비트 메시지 인덱스. 후보는 비트 생성 시 stash 된 relatedCandidates.
async function askConnect(idx) {
  const elig = (typeof _checkBeatEligibility === 'function') ? _checkBeatEligibility() : { ok: true };
  if (!elig.ok) { if (typeof _showBeatCapToast === 'function') _showBeatCapToast(); return; }
  const beat = state.chatMessages[idx];
  const candidates = (beat && Array.isArray(beat.relatedCandidates)) ? beat.relatedCandidates : [];
  state.chatMessages.push({ role: 'user', content: '이어보기', timestamp: new Date().toISOString(), isBranchReq: 'connect' });
  saveState();
  renderChat();
  let _ok = false;
  try {
    await generateAIResponse('claude-opus-4-7', { branch: 'connect', maxTokens: 480, userContentType: 'branch_connect', vars: { candidates } });
    const _last = state.chatMessages[state.chatMessages.length - 1];
    _ok = !!(_last && _last.role === 'assistant' && !_last.error && !_last.typing && _last.fromBranch);
  } catch (_) {}
  if (_ok) {
    // 변경 5: 핀 시 연결망 기록용 — 이어보기로 엮인 과거 조각 참조를 비트 메시지에 stash.
    if (beat && candidates.length) beat.connectedRefs = candidates.slice(0, 2);
    _afterBeatGen();
    saveState();
    renderChat();
  }
}

