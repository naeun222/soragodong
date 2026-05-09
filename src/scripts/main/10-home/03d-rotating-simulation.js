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
    case 'mode-pick':     return _rcSimRenderModePick(cur.blockKey);
    case 'generating':    return _rcSimRenderGenerating();
    case 'godong-input':  return _rcSimRenderGodongInput(cur);
    case 'godong-result': return _rcSimRenderGodongResult(cur);
    case 'user-input':    return _rcSimRenderUserInput(cur);
    case 'user-thinking': return _rcSimRenderGenerating();
    case 'user-result':   return _rcSimRenderUserResult(cur);
    case 'done':          return _rcSimRenderDone(cur);
    default:              return _rcSimRenderModePick(cur.blockKey);
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
        <div class="rc-sim-sub">고동이가 너 얼마나 그릴 수 있을까? — 한 번 해볼래?</div>
        <div class="rc-sim-mode-row">
          <button class="rc-sim-mode-btn" type="button" onclick="event.stopPropagation(); rcSimPickMode('godong')">
            <div class="rc-sim-mode-emoji">✨</div>
            <div class="rc-sim-mode-title">고동이 모드</div>
            <div class="rc-sim-mode-desc">고동이가 시나리오 던지면 너의 답 예측해보기</div>
          </button>
          <button class="rc-sim-mode-btn ${userDisabled ? 'is-disabled' : ''}" type="button" ${userDisabled ? 'disabled' : ''} onclick="event.stopPropagation(); rcSimPickMode('user')">
            <div class="rc-sim-mode-emoji">✏️</div>
            <div class="rc-sim-mode-title">직접 모드</div>
            <div class="rc-sim-mode-desc">${userDisabled ? '오늘은 끝 — 내일 다시' : '시나리오 적으면 고동이가 예측 (오늘 ' + userCount + '/' + userMax + ')'}</div>
          </button>
        </div>
      </div>
    `,
    onTapClick: '',
  };
}

function _rcSimRenderGenerating() {
  return {
    id: 'simulation',
    available: true,
    contentHash: 'sim_generating',
    bodyHtml: `
      <div class="rc-body-simulation">
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
        <div class="rc-body-headline">상상 시뮬 ✨ 고동이 모드</div>
        <div class="rc-sim-scenario">${escapeHtml(cur.scenario || '')}</div>
        <div class="rc-sim-prompt-label">너는 어떻게 할 것 같아?</div>
        <textarea class="rc-sim-textarea" id="rcSimUserPredInput" rows="3" placeholder="너의 행동/반응 예측 적어..." onclick="event.stopPropagation();" oninput="event.stopPropagation();"></textarea>
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
        <div class="rc-body-headline">상상 시뮬 ✏️ 직접 모드</div>
        <div class="rc-sim-prompt-label">시나리오 적어 — 고동이가 너의 행동 예측해볼게</div>
        <textarea class="rc-sim-textarea" id="rcSimUserScenarioInput" rows="4" placeholder="예: 친구가 갑자기 약속 취소했어. 너는 어떻게 할 것 같아?" onclick="event.stopPropagation();" oninput="event.stopPropagation();"></textarea>
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

  let userPrompt;
  if (mode === 'godong') {
    userPrompt = `사용자의 case formulation 데이터:
${cfSnapshot}

위 cf 항목 중 하나를 베이스로 가상 시나리오 1개 + 사용자가 그 시나리오에서 어떻게 행동/반응할지 예측을 만들어.

[규칙]
- scenario: 일상 가상 상황 한 단락 (3-5 문장). 친구 카톡 톤. 평가/조언 X. 단순히 상황 묘사 — "저녁 8시, 마감 임박한 작업을 앞두고 있어. 카페는 닫혔고 집은 너무 조용해서 집중 안 돼. 지금 너의 상태는 ___ 인 상태." 같이.
- godongPrediction: cf 적용해서 사용자가 어떻게 행동/반응할지 예측 (3-5 문장). 사용자 어휘 / cf 의 패턴 / strengths / mechanisms 활용. 평가 X 객관 묘사. "환경 차원 도구 사용 늘어났으니까 카페 옮기는 거 시도할 듯" 같은.
- 의료 진단 / 진단명 X. 친구 톤.
- JSON 만 출력 (마크다운 X).

[출력]
{
  "scenario": "...",
  "godongPrediction": "..."
}`;
  } else {
    userPrompt = `사용자의 case formulation 데이터:
${cfSnapshot}

사용자가 적은 시나리오:
"${userScenario.slice(0, 1000)}"

위 사용자가 이 시나리오에서 어떻게 행동/반응할지 cf 적용해서 예측 (3-5 문장).

[규칙]
- 사용자 어휘 / cf 의 패턴 / strengths / mechanisms 활용. 평가 X 객관 묘사.
- 친구 카톡 톤. 의료 진단 X.
- JSON 만 출력 (마크다운 X).

[출력]
{
  "godongPrediction": "..."
}`;
  }

  const resp = await callAnthropic({
    _endpoint: 'archive_summary',
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{ role: 'user', content: userPrompt }],
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
    r.currentSimulation.scenario = (out.scenario || '').trim();
    r.currentSimulation.godongPrediction = (out.godongPrediction || '').trim();
    r.currentSimulation.stage = 'godong-input';
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
  cur.stage = 'done';
  if (typeof saveState === 'function') saveState();
  _rcSimUpdateInSession();
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
