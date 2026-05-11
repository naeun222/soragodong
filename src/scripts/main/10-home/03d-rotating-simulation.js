// 사용자 명시 2026-05-09 ultrathink: 시뮬레이션 source 6 — cf 기반 가상 시나리오 + 예측 검증.
//
// 모드:
//  ✨ 고동이 모드 — 고동이가 cf 기반 시나리오 던짐 → 사용자가 자기 행동 예측 입력 → 고동이 예측 노출
//                  → 「비슷 / 다름」 verdict.
//  ✏️ 직접 모드   — 사용자가 시나리오 직접 적기 → 고동이가 cf 적용 예측 → 「비슷 / 다름」.
//
// 빈도: 4h block 단위 (00-04 / 04-08 / 08-12 / 12-16 / 16-20 / 20-24 KST). 같은 block 안 stash 사용.
//       새 block 진입 시 사용자가 source 카드를 실제로 본 시점에 generate (on-demand, 비용 절감).
//
// 모델: claude-sonnet-4-6 (예측 깊이 ↑). cf 컨텍스트 → 깊은 추론 필요.
//
// 사용자 모드: 하루 (4AM cutoff) 3개 cap.
//
// 의존: 03-rotating-card.js (state, _ensureRotatingCardState, _rcSessionOrder, _rcRenderShell,
//                            _rcEqualizeHeights, escapeHtml, callAnthropic, _canAI, saveState,
//                            _rcQuizCutoffKey).

// =============================================================================
// 4h block key — KST 기준 (00 / 04 / 08 / 12 / 16 / 20)
// =============================================================================
function _rcSimBlockKey() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  const h = kst.getUTCHours();
  const block = Math.floor(h / 4) * 4; // 0/4/8/12/16/20
  return `${y}-${m}-${d}-${String(block).padStart(2, '0')}`;
}

// 사용자 모드 카운터 키 (4AM cutoff — Quiz 와 동일)
function _rcSimUserCounterKey() {
  if (typeof _rcQuizCutoffKey === 'function') return _rcQuizCutoffKey();
  return _rcSimBlockKey().slice(0, 10);
}

// =============================================================================
// cf 컨텍스트 빌드 — 시뮬용 snapshot (verified + unverified 합쳐 50줄 cap)
// =============================================================================
function _rcSimCfSnapshot() {
  const cf = state.caseFormulation || {};
  const buckets = ['problems', 'mechanisms', 'strengths', 'goals', 'growth'];
  const lines = [];
  buckets.forEach(b => {
    const arr = Array.isArray(cf[b]) ? cf[b] : [];
    arr.slice(0, 6).forEach(it => {
      const text = (typeof it === 'string') ? it : (it?.text || it?.name || '');
      if (text) lines.push(`[${b}] ${text}`);
    });
  });
  // traits / values / patterns
  ['traits', 'values', 'patterns'].forEach(k => {
    const arr = Array.isArray(state[k]) ? state[k] : [];
    arr.slice(0, 5).forEach(it => {
      const name = it?.name || it?.text || '';
      const desc = it?.description || '';
      if (name) lines.push(`[${k}] ${name}${desc ? ' — ' + desc.slice(0, 80) : ''}`);
    });
  });
  return lines.slice(0, 50).join('\n');
}

function _rcSimCfItemCount() {
  const cf = state.caseFormulation || {};
  let n = 0;
  ['problems', 'mechanisms', 'strengths', 'goals', 'growth'].forEach(b => {
    n += (Array.isArray(cf[b]) ? cf[b].length : 0);
  });
  ['traits', 'values', 'patterns'].forEach(k => {
    n += (Array.isArray(state[k]) ? state[k].length : 0);
  });
  return n;
}

// =============================================================================
// in-memory inflight (페이지 reload 시 자동 reset)
// =============================================================================
let _rcSimGenerateInflight = false;

// =============================================================================
// Source 6 entry — 카드 분기
// =============================================================================
function _rcSource6Simulation() {
  const r = _ensureRotatingCardState();
  // 활성 조건: cf 항목 ≥ 3 (시뮬용 기반 충분)
  if (_rcSimCfItemCount() < 3) {
    return { id: 'simulation', available: false };
  }

  const blockKey = _rcSimBlockKey();
  const cur = r.currentSimulation;

  // stash 있고 같은 block + 진행 중이거나 끝남 → 그대로 보여줌
  if (cur && cur.blockKey === blockKey) {
    return _rcSimRenderByStage(cur);
  }

  // 다른 block (또는 stash X) — 사용자가 카드 본 시점에 generate 시작.
  // 단, generate 진행 중이면 로딩 카드.
  if (_rcSimGenerateInflight) {
    return _rcSimRenderGenerating();
  }

  // mode-pick 카드 노출 (사용자 모드 선택 → 클릭 시 godong 모드는 generate 시작 / user 모드는 입력 폼).
  return _rcSimRenderModePick(blockKey);
}

// =============================================================================
// Stage 별 카드 render
// =============================================================================
function _rcSimRenderByStage(cur) {
  const stage = cur.stage || 'mode-pick';
  switch (stage) {
    case 'mode-pick':         return _rcSimRenderModePick(cur.blockKey);
    case 'generating':        return _rcSimRenderGenerating();
    case 'godong-input':      return _rcSimRenderGodongInput(cur);
    case 'godong-result':     return _rcSimRenderGodongResult(cur);
    case 'user-input':        return _rcSimRenderUserInput(cur);
    case 'user-thinking':     return _rcSimRenderGenerating();
    case 'user-result':       return _rcSimRenderUserResult(cur);
    case 'verdict-add-note':  return _rcSimRenderVerdictAddNote(cur);
    case 'done':              return _rcSimRenderDone(cur);
    default:                  return _rcSimRenderModePick(cur.blockKey);
  }
}

// 사용자 명시 2026-05-09: verdict 후 추가 입력 stage — '비슷'/'다름' 둘 다 더 적을 수 있게 (비슷해도 좀 다를 수 있음).
function _rcSimRenderVerdictAddNote(cur) {
  const verdictMark = cur.userVerdict === '비슷' ? '✓ 비슷' : '✕ 다름';
  const placeholder = cur.userVerdict === '비슷'
    ? '비슷한데 살짝 달랐던 거 (옵션) — 적으면 고동이 학습 ↑'
    : '어떻게 달랐어? (옵션) — 너의 실제 답 적어';
  return {
    id: 'simulation',
    available: true,
    contentHash: 'sim_addnote_' + cur.id,
    bodyHtml: `
      <div class="rc-body-simulation">
        ${_rcSimResetBtnHtml()}
        <div class="rc-body-headline">상상 시뮬 ${verdictMark}</div>
        <textarea class="rc-sim-textarea" id="rcSimAddNoteInput" rows="3" placeholder="${escapeHtml(placeholder)}" onclick="event.stopPropagation();" oninput="event.stopPropagation();"></textarea>
        <div class="rc-sim-actions">
          <button class="rc-sim-btn rc-sim-btn-secondary" type="button" onclick="event.stopPropagation(); rcSimSkipAddNote()">건너뛰기</button>
          <button class="rc-sim-btn rc-sim-btn-primary" type="button" onclick="event.stopPropagation(); rcSimSubmitAddNote()">저장 ✦</button>
        </div>
        <button class="rc-sim-btn rc-sim-btn-chat" type="button" onclick="event.stopPropagation(); rcSimContinueInChat()" style="margin-top:8px; width:100%;">🐚 고동이랑 이어서 대화</button>
      </div>
    `,
    onTapClick: '',
  };
}

// 사용자 명시 2026-05-10 (큐 11): 시뮬 verdict 후 → 새 챕터 시작 + 시뮬 컨텍스트 inject + chat 화면 전환.
//   기존 활성 챕터 있으면 마무리 모달 → archive 이송. 새 챕터에 isSimulationContext flag.
//   챕터 마무리 시 chapterMeta.isSimulation 마킹 → cf 5차원 추출 X, traits/values/patterns 만 (extractedFrom='simulation').
async function rcSimContinueInChat() {
  // 사용자 보고 2026-05-10 (audit-billing 노랑): 더블클릭 시 두 번 generateAIResponse 호출 위험 — entry guard.
  if (window._rcSimContinueInflight) return;
  window._rcSimContinueInflight = true;
  try {
  const r = _ensureRotatingCardState();
  const cur = r.currentSimulation;
  if (!cur) { window._rcSimContinueInflight = false; return; }
  const noteEl = document.getElementById('rcSimAddNoteInput');
  if (noteEl) cur.diffNote = String(noteEl.value || '').trim() || cur.diffNote || null;
  // archive 저장 (시뮬 archive 풀에 stash + 분리 추출 path)
  try { _rcSimSaveToArchive(cur); } catch {}
  // 기존 활성 챕터 마무리 모달
  if (Array.isArray(state.chatMessages) && state.chatMessages.length > 0) {
    const ok = await (typeof showConfirmModal === 'function' ? showConfirmModal({
      title: '🐚 기존 대화 마무리할까?',
      message: '주제 섞이는 거 회피 — 기존 챕터 archive 이송 후 시뮬 컨텍스트 새 챕터 시작.',
      okLabel: '응 마무리',
      cancelLabel: '아니'
    }) : Promise.resolve(true));
    if (!ok) return;
    if (typeof _archiveCurrentChapter === 'function') {
      try { _archiveCurrentChapter({ manual: true }); } catch {}
    }
  }
  // 새 챕터 첫 메시지 — 시뮬 컨텍스트
  const _scenario = cur.scenario || cur.userScenario || '';
  const _gPred = cur.godongPrediction || '';
  const _myAns = cur.diffNote || cur.userPrediction || '';
  const _content = `[시뮬레이션] ${_scenario}\n[고동이 예측] ${_gPred}${_myAns ? `\n[내 답] ${_myAns}` : ''}`;
  state.chatMessages.push({
    role: 'user',
    content: _content,
    timestamp: new Date().toISOString(),
    isSimulationContext: true,
    chapterStart: true
  });
  cur.stage = 'done';
  if (typeof saveState === 'function') saveState();
  if (typeof showScreen === 'function') showScreen('chat');
  if (typeof renderChat === 'function') setTimeout(() => renderChat(), 100);
  // AI 응답 자동 trigger (사용자 입력 없이도 시뮬 컨텍스트로 깊은 대화 시작)
  if (typeof generateAIResponse === 'function') setTimeout(() => generateAIResponse(), 200);
  } finally {
    // 1초 후 guard 풀기 (다음 시뮬 흐름 위해)
    setTimeout(() => { window._rcSimContinueInflight = false; }, 1000);
  }
}

function _rcSimRenderModePick(blockKey) {
  const userCount = _rcSimUserCountToday();
  const userMax = 3;
  const userDisabled = userCount >= userMax;
  return {
    id: 'simulation',
    available: true,
    contentHash: 'sim_pick_' + blockKey,
    bodyHtml: `
      <div class="rc-body-simulation">
        <div class="rc-body-headline">상상 시뮬</div>
        <div class="rc-sim-sub">너 얼마나 그릴 수 있을까?</div>
        <div class="rc-sim-mode-row">
          <button class="rc-sim-mode-btn" type="button" onclick="event.stopPropagation(); rcSimPickMode('godong')">
            <div class="rc-sim-mode-emoji">✨</div>
            <div class="rc-sim-mode-title">고동이 모드</div>
            <div class="rc-sim-mode-desc">시나리오 → 너 예측</div>
          </button>
          <button class="rc-sim-mode-btn ${userDisabled ? 'is-disabled' : ''}" type="button" ${userDisabled ? 'disabled' : ''} onclick="event.stopPropagation(); rcSimPickMode('user')">
            <div class="rc-sim-mode-emoji">✏️</div>
            <div class="rc-sim-mode-title">직접 모드</div>
            <div class="rc-sim-mode-desc">${userDisabled ? '내일 다시' : '시나리오 → 예측 (' + userCount + '/' + userMax + ')'}</div>
          </button>
        </div>
      </div>
    `,
    onTapClick: '',
  };
}

// 사용자 명시 2026-05-11: 개발자 테스트용 reset 버튼 (↻ 다시 시도) 제거. rcSimReset 함수는 유지 (legacy 호환).
function _rcSimResetBtnHtml() {
  return '';
}

function _rcSimRenderGenerating() {
  return {
    id: 'simulation',
    available: true,
    contentHash: 'sim_generating',
    bodyHtml: `
      <div class="rc-body-simulation">
        ${_rcSimResetBtnHtml()}
        <div class="rc-body-headline">상상 시뮬</div>
        <div class="rc-sim-loading">고동이가 생각 중... ✦</div>
      </div>
    `,
    onTapClick: '',
  };
}

function _rcSimRenderGodongInput(cur) {
  return {
    id: 'simulation',
    available: true,
    contentHash: 'sim_godong_input_' + cur.id,
    bodyHtml: `
      <div class="rc-body-simulation">
        ${_rcSimResetBtnHtml()}
        <div class="rc-body-headline">상상 시뮬 ✨ 고동이 모드</div>
        <div class="rc-sim-scenario">${escapeHtml(cur.scenario || '')}</div>
        <div class="rc-sim-prompt-label">내가 어떻게 할 것 같아?</div>
        <textarea class="rc-sim-textarea" id="rcSimUserPredInput" rows="3" placeholder="내 행동/반응 예측 적어..." onclick="event.stopPropagation();" oninput="event.stopPropagation();"></textarea>
        <div class="rc-sim-actions">
          <button class="rc-sim-btn rc-sim-btn-secondary" type="button" onclick="event.stopPropagation(); rcSimReset()">취소</button>
          <button class="rc-sim-btn rc-sim-btn-primary" type="button" onclick="event.stopPropagation(); rcSimSubmitGodongPrediction()">고동이 답 보기 →</button>
        </div>
      </div>
    `,
    onTapClick: '',
  };
}

function _rcSimRenderGodongResult(cur) {
  return {
    id: 'simulation',
    available: true,
    contentHash: 'sim_godong_result_' + cur.id,
    bodyHtml: `
      <div class="rc-body-simulation">
        ${_rcSimResetBtnHtml()}
        <div class="rc-body-headline">상상 시뮬 ✨ 고동이 답</div>
        <div class="rc-sim-scenario">${escapeHtml(cur.scenario || '')}</div>
        <div class="rc-sim-block">
          <div class="rc-sim-block-label">너의 예측</div>
          <div class="rc-sim-block-text">${escapeHtml(cur.userPrediction || '')}</div>
        </div>
        <div class="rc-sim-block rc-sim-block-godong">
          <div class="rc-sim-block-label">고동이의 예측</div>
          <div class="rc-sim-block-text">${escapeHtml(cur.godongPrediction || '')}</div>
        </div>
        <div class="rc-sim-prompt-label">고동이가 너 잘 예측했어?</div>
        <div class="rc-sim-actions">
          <button class="rc-sim-btn rc-sim-btn-correct" type="button" onclick="event.stopPropagation(); rcSimVerdict('비슷')">비슷 ✓</button>
          <button class="rc-sim-btn rc-sim-btn-wrong" type="button" onclick="event.stopPropagation(); rcSimVerdict('다름')">다름 ✕</button>
        </div>
      </div>
    `,
    onTapClick: '',
  };
}

function _rcSimRenderUserInput(cur) {
  return {
    id: 'simulation',
    available: true,
    contentHash: 'sim_user_input_' + (cur.id || 'new'),
    bodyHtml: `
      <div class="rc-body-simulation">
        ${_rcSimResetBtnHtml()}
        <div class="rc-body-headline">상상 시뮬 ✏️ 직접 모드</div>
        <div class="rc-sim-prompt-label">시나리오 적어 — 고동이가 너의 행동 예측해볼게</div>
        <textarea class="rc-sim-textarea" id="rcSimUserScenarioInput" rows="4" placeholder="예: 친구가 갑자기 약속 취소했어. 내가 어떻게 할 것 같아?" onclick="event.stopPropagation();" oninput="event.stopPropagation();"></textarea>
        <div class="rc-sim-actions">
          <button class="rc-sim-btn rc-sim-btn-secondary" type="button" onclick="event.stopPropagation(); rcSimReset()">취소</button>
          <button class="rc-sim-btn rc-sim-btn-primary" type="button" onclick="event.stopPropagation(); rcSimSubmitUserScenario()">고동이 예측 받기 →</button>
        </div>
      </div>
    `,
    onTapClick: '',
  };
}

function _rcSimRenderUserResult(cur) {
  return {
    id: 'simulation',
    available: true,
    contentHash: 'sim_user_result_' + cur.id,
    bodyHtml: `
      <div class="rc-body-simulation">
        ${_rcSimResetBtnHtml()}
        <div class="rc-body-headline">상상 시뮬 ✏️ 고동이 답</div>
        <div class="rc-sim-block">
          <div class="rc-sim-block-label">너의 시나리오</div>
          <div class="rc-sim-block-text">${escapeHtml(cur.userScenario || '')}</div>
        </div>
        <div class="rc-sim-block rc-sim-block-godong">
          <div class="rc-sim-block-label">고동이의 예측</div>
          <div class="rc-sim-block-text">${escapeHtml(cur.godongPrediction || '')}</div>
        </div>
        <div class="rc-sim-prompt-label">예측 잘 맞았어?</div>
        <div class="rc-sim-actions">
          <button class="rc-sim-btn rc-sim-btn-correct" type="button" onclick="event.stopPropagation(); rcSimVerdict('비슷')">비슷 ✓</button>
          <button class="rc-sim-btn rc-sim-btn-wrong" type="button" onclick="event.stopPropagation(); rcSimVerdict('다름')">다름 ✕</button>
        </div>
      </div>
    `,
    onTapClick: '',
  };
}

function _rcSimRenderDone(cur) {
  const userCount = _rcSimUserCountToday();
  const canMore = userCount < 3;
  const verdictLine = cur.userVerdict
    ? `<div class="rc-sim-done-verdict">${cur.userVerdict === '비슷' ? '✓ 비슷' : '✕ 다름'}</div>`
    : '';
  return {
    id: 'simulation',
    available: true,
    contentHash: 'sim_done_' + cur.id,
    bodyHtml: `
      <div class="rc-body-simulation">
        ${_rcSimResetBtnHtml()}
        <div class="rc-body-headline">상상 시뮬 ✦ 끝</div>
        ${verdictLine}
        <div class="rc-sim-done-text">${cur.userVerdict === '비슷' ? '고동이가 너 잘 알아가고 있네 ✦' : '오케이 — 다음엔 더 가깝게 그려볼게'}</div>
        ${canMore ? `
          <button class="rc-sim-btn rc-sim-btn-secondary" type="button" onclick="event.stopPropagation(); rcSimPickMode('user')" style="margin-top:14px;">
            ✏️ 직접 시나리오 더 적기 (${userCount}/3)
          </button>
        ` : ''}
      </div>
    `,
    onTapClick: '',
  };
}

function _rcSimUserCountToday() {
  const r = _ensureRotatingCardState();
  const k = _rcSimUserCounterKey();
  return (r.userSimulationsToday && r.userSimulationsToday[k]) || 0;
}

function _rcSimIncUserCountToday() {
  const r = _ensureRotatingCardState();
  const k = _rcSimUserCounterKey();
  if (!r.userSimulationsToday) r.userSimulationsToday = {};
  r.userSimulationsToday[k] = (r.userSimulationsToday[k] || 0) + 1;
}

// =============================================================================
// Sonnet generate — 시나리오 + 고동이 예측 (godong 모드) / 예측 only (user 모드)
// =============================================================================
async function _rcSimGenerate(opts) {
  if (!_canAI()) throw new Error('AI 호출 권한 없음 (로그인 필요)');
  const mode = opts.mode;  // 'godong' | 'user'
  const userScenario = opts.userScenario || '';
  const cfSnapshot = _rcSimCfSnapshot();

  // 사용자 명시 2026-05-11 ultrathink: prompt template + SCENARIO_CATEGORIES backend 이전 — buildSimScenario 가 합성 + 카테고리 셔플.
  const r = _ensureRotatingCardState();
  const _recentScenarios = (Array.isArray(r.recentSimulations) ? r.recentSimulations : [])
    .slice(-10).map(s => `- "${(s.scenario || '').slice(0, 80)}"`).join('\n');

  const resp = await callAnthropic({
    _endpoint: 'archive_summary',
    _userContentType: 'sim_scenario',
    _vars: {
      mode: mode === 'godong' ? 'ai' : 'user',
      cfSnapshot,
      userScenario: userScenario.slice(0, 1000),
      recentScenarioList: _recentScenarios
    },
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [{ role: 'user', content: '' }],
  });
  if (!resp.ok) throw new Error('Sonnet HTTP ' + resp.status);
  const data = await resp.json();
  let raw = (data?.content?.[0]?.text || '').trim();
  raw = raw.replace(/^```\w*\s*/, '').replace(/\s*```\s*$/, '').trim();
  // JSON 추출
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('JSON 파싱 실패');
  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error('JSON parse: ' + e.message);
  }
  return parsed;
}

// =============================================================================
// 사용자 인터랙션 핸들러 — 전역 (onclick 호환)
// =============================================================================
async function rcSimPickMode(mode) {
  const r = _ensureRotatingCardState();
  const blockKey = _rcSimBlockKey();
  // user 모드 cap 가드
  if (mode === 'user' && _rcSimUserCountToday() >= 3) {
    if (typeof showToast === 'function') showToast('오늘 직접 모드 3개 끝 — 내일 다시');
    return;
  }
  if (_rcSimGenerateInflight) return;

  if (mode === 'user') {
    // 사용자 모드 = 입력 폼 먼저 (generate 는 사용자 입력 후)
    r.currentSimulation = {
      id: 'sim_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      blockKey,
      mode: 'user',
      stage: 'user-input',
      userScenario: null,
      godongPrediction: null,
      userVerdict: null,
      createdAt: new Date().toISOString(),
    };
    if (typeof saveState === 'function') saveState();
    _rcSimUpdateInSession();
    return;
  }

  // godong 모드 — 즉시 generate
  r.currentSimulation = {
    id: 'sim_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    blockKey,
    mode: 'godong',
    stage: 'generating',
    scenario: null,
    godongPrediction: null,
    userPrediction: null,
    userVerdict: null,
    createdAt: new Date().toISOString(),
  };
  if (typeof saveState === 'function') saveState();
  _rcSimUpdateInSession();

  _rcSimGenerateInflight = true;
  try {
    const out = await _rcSimGenerate({ mode: 'godong' });
    const _sc = (out.scenario || '').trim();
    r.currentSimulation.scenario = _sc;
    r.currentSimulation.godongPrediction = (out.godongPrediction || '').trim();
    r.currentSimulation.stage = 'godong-input';
    // 사용자 명시 2026-05-11: 다양성 — 최근 시나리오 stash (다음 generate 시 dedupe hint).
    if (_sc) {
      if (!Array.isArray(r.recentSimulations)) r.recentSimulations = [];
      r.recentSimulations.push({ scenario: _sc, createdAt: new Date().toISOString() });
      if (r.recentSimulations.length > 20) r.recentSimulations = r.recentSimulations.slice(-20);
    }
    if (typeof saveState === 'function') saveState();
  } catch (e) {
    console.warn('[sim generate godong]', e?.message);
    if (typeof showToast === 'function') showToast('시뮬 생성 실패: ' + (e?.message || ''));
    // 실패 시 mode-pick 으로 되돌림
    r.currentSimulation = null;
  } finally {
    _rcSimGenerateInflight = false;
    _rcSimUpdateInSession();
  }
}

function rcSimSubmitGodongPrediction() {
  const r = _ensureRotatingCardState();
  const cur = r.currentSimulation;
  if (!cur || cur.mode !== 'godong' || cur.stage !== 'godong-input') return;
  const ta = document.getElementById('rcSimUserPredInput');
  const text = (ta?.value || '').trim();
  if (!text) {
    if (typeof showToast === 'function') showToast('너의 예측 한 줄 적어');
    return;
  }
  cur.userPrediction = text;
  cur.stage = 'godong-result';
  if (typeof saveState === 'function') saveState();
  _rcSimUpdateInSession();
}

async function rcSimSubmitUserScenario() {
  const r = _ensureRotatingCardState();
  const cur = r.currentSimulation;
  if (!cur || cur.mode !== 'user' || cur.stage !== 'user-input') return;
  const ta = document.getElementById('rcSimUserScenarioInput');
  const text = (ta?.value || '').trim();
  if (!text || text.length < 5) {
    if (typeof showToast === 'function') showToast('시나리오 좀 더 자세히 적어');
    return;
  }
  if (_rcSimGenerateInflight) return;

  cur.userScenario = text;
  cur.stage = 'user-thinking';
  if (typeof saveState === 'function') saveState();
  _rcSimUpdateInSession();

  _rcSimGenerateInflight = true;
  try {
    const out = await _rcSimGenerate({ mode: 'user', userScenario: text });
    cur.godongPrediction = (out.godongPrediction || '').trim();
    cur.stage = 'user-result';
    _rcSimIncUserCountToday();
    if (typeof saveState === 'function') saveState();
  } catch (e) {
    console.warn('[sim generate user]', e?.message);
    if (typeof showToast === 'function') showToast('시뮬 생성 실패: ' + (e?.message || ''));
    cur.stage = 'user-input'; // 다시 입력 가능하게
  } finally {
    _rcSimGenerateInflight = false;
    _rcSimUpdateInSession();
  }
}

function rcSimVerdict(v) {
  const r = _ensureRotatingCardState();
  const cur = r.currentSimulation;
  if (!cur) return;
  if (cur.stage !== 'godong-result' && cur.stage !== 'user-result') return;
  cur.userVerdict = v;
  // 사용자 명시 2026-05-09: '비슷'/'다름' 둘 다 추가 입력 옵션 (비슷해도 좀 다를 수 있음).
  cur.stage = 'verdict-add-note';
  if (typeof saveState === 'function') saveState();
  _rcSimUpdateInSession();
}

// 사용자 명시 2026-05-09: verdict 후 추가 입력 (옵션) → archive stash + done.
function rcSimSubmitAddNote() {
  const r = _ensureRotatingCardState();
  const cur = r.currentSimulation;
  if (!cur || cur.stage !== 'verdict-add-note') return;
  const ta = document.getElementById('rcSimAddNoteInput');
  const text = (ta?.value || '').trim();
  if (text) cur.diffNote = text.slice(0, 500);
  _rcSimSaveToArchive(cur);
  cur.stage = 'done';
  if (typeof saveState === 'function') saveState();
  _rcSimUpdateInSession();
}

function rcSimSkipAddNote() {
  const r = _ensureRotatingCardState();
  const cur = r.currentSimulation;
  if (!cur || cur.stage !== 'verdict-add-note') return;
  _rcSimSaveToArchive(cur);
  cur.stage = 'done';
  if (typeof saveState === 'function') saveState();
  _rcSimUpdateInSession();
}

// 사용자 명시 2026-05-09 (재정정): 시뮬 결과 → state.simulationArchive 에 stash + 분리 추출 path.
// cf 5차원 (problems / mechanisms 등) 직접 갱신 X — 시뮬은 가상 시나리오라 진지한 자기 모델 침투 회피.
// traits/values/patterns 만 약하게 추출 (confidence ≥ 0.7, user_verified=false). Quiz 컨펌 거쳐야 main pool.
// state.archive (일반 깨달음 저장소) 와 분리 — 격리 보존.
function _rcSimSaveToArchive(cur) {
  if (!cur || !cur.userVerdict) return;
  if (!Array.isArray(state.simulationArchive)) state.simulationArchive = [];
  const lines = [];
  if (cur.scenario) lines.push(`[시나리오] ${cur.scenario}`);
  if (cur.userScenario) lines.push(`[내가 적은 시나리오] ${cur.userScenario}`);
  if (cur.userPrediction) lines.push(`[내 예측] ${cur.userPrediction}`);
  if (cur.godongPrediction) lines.push(`[고동이 예측] ${cur.godongPrediction}`);
  lines.push(`[verdict] ${cur.userVerdict}`);
  if (cur.diffNote) lines.push(`[나의 한마디] ${cur.diffNote}`);
  state.simulationArchive.unshift({
    id: cur.id,
    mode: cur.mode,
    scenario: cur.scenario || null,
    userScenario: cur.userScenario || null,
    userPrediction: cur.userPrediction || null,
    godongPrediction: cur.godongPrediction || null,
    userVerdict: cur.userVerdict,
    diffNote: cur.diffNote || null,
    body: lines.join('\n'),
    savedAt: new Date().toISOString(),
    _extracted: false,
  });
  // 최근 30개만 유지
  if (state.simulationArchive.length > 30) {
    state.simulationArchive = state.simulationArchive.slice(0, 30);
  }
  // 사용자 명시 2026-05-11 ultrathink: 5회 누적 자동 추출 trigger 제거.
  // 시뮬 추출은 챕터 마무리 / 5h+ 갭 / 4시 cutoff 의 일반 챕터 흐름에 통합 — 메인 챗 isSimulationContext 메시지가 분리 처리됨 (_runDailyExtractInline / _submitDailyExtractBatch / _archiveCurrentChapter).
  // simulationArchive stash 자체는 verdict history 보존용으로 유지.
}

// 사용자 명시 2026-05-09: 시뮬 전용 분리 추출 — 가상 시나리오 명시 + 보수적 confidence + cf 5차원 X.
// trigger: _rcSimSaveToArchive 안 누적 5+ 시 background 호출. fail silent.
async function extractFromSimulationArchive() {
  if (!_canAI()) return;
  if (window._onbTutorialMode) return;
  if (state.preferences && state.preferences.testerMode) return;

  const pending = (state.simulationArchive || []).filter(e => !e._extracted);
  if (pending.length < 5) return;
  // 최근 10개까지만 한 호출에
  const entries = pending.slice(0, 10);

  // 사용자 명시 2026-05-11 ultrathink: prompt template backend 이전 — buildSimExtract 가 합성.
  const _entriesBody = entries.map((e, i) => `[시뮬 ${i + 1}] (${e.userVerdict})\n${e.body}`).join('\n\n');

  try {
    const resp = await callAnthropic({
      _endpoint: 'extract_chapter',
      _userContentType: 'sim_extract',
      _vars: { entriesBody: _entriesBody, entriesCount: entries.length },
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: '' }],
    });
    if (!resp.ok) return;
    const data = await resp.json();
    const raw = data?.content?.[0]?.text || '';
    const jm = raw.match(/\{[\s\S]*\}/);
    if (!jm) return;
    let analysis;
    try { analysis = JSON.parse(jm[0]); } catch { return; }
    // cf 5차원 절대 추출 X — case_formulation_update 필드 무시 (LLM 이 실수로 출력해도)
    delete analysis.case_formulation_update;
    delete analysis.deep_profile_update;

    const touched = _processSimulationAnalysis(analysis);

    // 추출된 entries _extracted=true mark
    state.simulationArchive.forEach(e => {
      const m = entries.find(x => x.id === e.id);
      if (m) e._extracted = true;
    });

    if (touched || true) saveState();
    if (typeof renderModel === 'function') {
      try { renderModel(); } catch {}
    }
  } catch (e) {
    console.warn('[extractFromSimulationArchive]', e);
  }
}

// 시뮬 분리 추출 결과 처리 — traits/values/patterns 만, confidence ≥ 0.7, user_verified=false, extractedFrom='simulation'.
// cf 5차원 X. 진지한 자기 모델 시뮬 신호 침투 회피.
function _processSimulationAnalysis(analysis) {
  if (!analysis || typeof analysis !== 'object') return false;
  let touched = false;
  const THRESHOLD = 0.7; // 챕터 추출 0.6 보다 보수적

  if (Array.isArray(analysis.new_traits)) {
    analysis.new_traits.forEach(t => {
      if (!t || !t.name) return;
      const conf = typeof t.confidence === 'number' ? t.confidence : 0.5;
      const exists = (state.traits || []).find(e => similarText(e.name, t.name));
      if (!exists) {
        if (conf < THRESHOLD) return;
        state.traits = state.traits || [];
        state.traits.push({
          id: 'trait_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          name: t.name.trim(), description: (t.description || '').trim(),
          quiz_question: null,
          confidence: conf, user_verified: false, evidence_count: 1,
          extractedFrom: 'simulation',
          created_at: new Date().toISOString(),
        });
        touched = true;
      } else {
        exists.evidence_count = (exists.evidence_count || 1) + 1;
        exists.confidence = Math.min(1.0, (exists.confidence || 0.5) + 0.05);
        touched = true;
      }
    });
  }
  if (Array.isArray(analysis.new_values)) {
    analysis.new_values.forEach(v => {
      if (!v || !v.name) return;
      const conf = typeof v.confidence === 'number' ? v.confidence : 0.5;
      const exists = (state.values || []).find(e => similarText(e.name, v.name));
      if (!exists) {
        if (conf < THRESHOLD) return;
        state.values = state.values || [];
        state.values.push({
          id: 'val_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          name: v.name.trim(), description: (v.description || '').trim(),
          quiz_question: null,
          confidence: conf, user_verified: false, evidence_count: 1,
          sdt_need: v.sdt_need || null,
          extractedFrom: 'simulation',
          created_at: new Date().toISOString(),
        });
        touched = true;
      } else {
        exists.evidence_count = (exists.evidence_count || 1) + 1;
        exists.confidence = Math.min(1.0, (exists.confidence || 0.5) + 0.05);
        touched = true;
      }
    });
  }
  if (Array.isArray(analysis.new_patterns)) {
    analysis.new_patterns.forEach(p => {
      if (!p || !p.name) return;
      const conf = typeof p.confidence === 'number' ? p.confidence : 0.5;
      const exists = (state.patterns || []).find(e => similarText(e.name, p.name));
      if (!exists) {
        if (conf < THRESHOLD) return;
        state.patterns = state.patterns || [];
        state.patterns.push({
          id: 'pat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          name: p.name.trim(), description: (p.description || '').trim(),
          trigger: (p.trigger || '').trim(), sequence: (p.sequence || '').trim(),
          quiz_question: null,
          confidence: conf, user_verified: false, evidence_count: 1,
          extractedFrom: 'simulation',
          created_at: new Date().toISOString(),
        });
        touched = true;
      } else {
        exists.evidence_count = (exists.evidence_count || 1) + 1;
        exists.confidence = Math.min(1.0, (exists.confidence || 0.5) + 0.05);
        touched = true;
      }
    });
  }
  // 사용자 명시 2026-05-11 ultrathink: 나 탭 dot 안 켬 — extractedFrom='simulation' 항목은 renderModel 에서 hide 되므로 dot 켜도 사용자에게 보일 게 없음 ("dot 떴지만 나 탭 열어보니 새 게 없네" 경험 차단).
  return touched;
}

function rcSimReset() {
  const r = _ensureRotatingCardState();
  r.currentSimulation = null;
  if (typeof saveState === 'function') saveState();
  _rcSimUpdateInSession();
}

// =============================================================================
// sessionOrder 안 simulation source 갱신 + DOM 다시 렌더
// =============================================================================
function _rcSimUpdateInSession() {
  if (!Array.isArray(_rcSessionOrder)) {
    if (typeof renderRotatingCard === 'function') renderRotatingCard();
    return;
  }
  const idx = _rcSessionOrder.findIndex(s => s && s.id === 'simulation');
  if (idx < 0) {
    if (typeof renderRotatingCard === 'function') renderRotatingCard();
    return;
  }
  const newSrc = _rcSource6Simulation();
  if (newSrc) _rcSessionOrder[idx] = newSrc;
  const container = document.getElementById('rotatingCardContainer');
  if (container && typeof _rcRenderShell === 'function') {
    container.innerHTML = _rcRenderShell(_rcSessionOrder, _rcSessionIndex);
  }
  if (typeof _rcEqualizeHeights === 'function') _rcEqualizeHeights();
}
