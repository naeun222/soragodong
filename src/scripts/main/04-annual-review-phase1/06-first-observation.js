// 사용자 명시 2026-04-30 (정정): quiz form 폐기 → 코어 #1 종료 snapshot 기반 첫 관찰.
// 코어 #1 동안 사용자가 적용한 chatMessages user / entries / 모드 → AI 가설 추출. 동일 출력 schema (showFirstTouchResult 재사용).
async function generateFirstTouchFromCoreData(snapshot) {
  const userMsgsText = (snapshot.userMessages || []).map(m => m.content).join('\n---\n').slice(0, 2500);
  const entriesText = JSON.stringify(snapshot.entries || [], null, 0).slice(0, 1500);
  const modesText = (snapshot.selectedModes || []).join(', ') || '(없음)';
  const vitalityText = snapshot.pickedVitality || '(미응답)';
  const prompt = `사용자가 처음 앱에 진입해 코어 #1 (하면서 익히기) 튜토리얼을 끝냈다. 이 동안 사용자가 남긴 첫 데이터로 가벼운 첫 관찰을 작성한다.

[사용자가 코어 #1 동안 남긴 거]
대화 메시지 (사용자 발화):
${userMsgsText || '(없음)'}

오늘 일기 / 체크인:
${entriesText}

선택한 모드: ${modesText}
오늘 활력: ${vitalityText}

[목표]
- 한 단어 정체성 명명 (정형 X — 사용자 첫 데이터 기반 고유)
- 가설 3개 — trait / value / pattern 중 적절한 카테고리. confidence 0.3-0.5 (낮음 — 데이터 적음, 첫 인사 수준).
- 다음 1주 관찰 거리 2개 (구체, observable)
- 한 줄 친근 인사 + 첫 인상 (40자 이내)

[가설 schema 가이드]
- trait: name (10자 이내) + description (한 문장, 명사형 분석체)
- value: name (5자 이내) + description (한 문장, 명사형 분석체)
- pattern: name (10자 이내 라벨) + trigger (조건) + sequence (행동 흐름, 명사형 분석체)
- display_text: ✓ 박스에서 보일 친근한 한 줄 (예: "꼼꼼한 편인 거 같아")

[톤]
- description / sequence (나 탭 본문): **명사형 분석체 LOCK**. 관찰자 3인칭. 어미는 "~ 명시", "~ 강하게 느낌", "~ 하는 경향", "~ 한 태도", "~ 함" 같이 명사형 종결. 추측 어미 ("있을 수 있어", "할 수 있어", "~ 인 듯", "~ 일 것") 금지. 친근 반말 X. confidence 낮아도 어미는 분석체 유지 (수치로만 표현).
- display_text / intro_line: 친한 친구 반말. judgment X. self-compassion. confidence 낮음 명시 (예: "초안 — 함께 확인해볼 가설").
- 공통: Surprise > Truth — '어, 어떻게 알았어?' 트리거. Specific > Generic.

[출력 JSON 만, markdown X]
{
  "one_word": "한 단어 정체성",
  "intro_line": "한 줄 친근 인사 + 첫 인상 (40자 이내)",
  "hypotheses": [
    { "category": "trait" | "value" | "pattern", "name": "...", "description": "...", "trigger": null, "sequence": null, "confidence": 0.3-0.5, "display_text": "..." },
    ...3개
  ],
  "watch_points": [
    "다음 1주 관찰 거리 1 (구체, observable)",
    "다음 1주 관찰 거리 2"
  ]
}`;
  const resp = await callAnthropic({
    _endpoint: 'first_touch',
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: 'JSON 객체 하나만 반환. markdown code fence X. 다른 글 X. 모든 필수 필드 다 채워서 출력.',
    messages: [{ role: 'user', content: prompt }]
  });
  if (!resp.ok) throw new Error('API ' + resp.status);
  const data = await resp.json();
  const text = data?.content?.[0]?.text || '';
  return _robustJsonExtract(text);
}

// 코어 #1 종료 시점 (onbFinish) 호출. snapshot → AI 진단 → 결과 적용하기 + showFirstTouchResult.
// background — 사용자 화면 표시 후 1.5초 후 trigger. 실패 silent (사용자 막힘 X).
async function _runFirstTouchFromCore1(snapshot) {
  if (!_canAI()) { console.log('[firstTouch core1] AI 불가능 — skip'); return; }
  if (!snapshot || (!snapshot.userMessages?.length && !snapshot.entries?.length)) {
    console.log('[firstTouch core1] snapshot 비어있음 — skip');
    return;
  }
  try {
    const insight = await generateFirstTouchFromCoreData(snapshot);
    if (!insight || !insight.one_word) throw new Error('분석 결과 비어있음');
    state.firstTouchInsight = { ...insight, source: 'core1', completedAt: new Date().toISOString() };
    state.preferences = state.preferences || {};
    state.preferences._firstTouchDone = true;
    saveState();
    if (typeof showFirstTouchResult === 'function') showFirstTouchResult(insight);
  } catch (e) {
    console.warn('[firstTouch core1] 실패 — silent:', e);
    // 실패 silent. _firstTouchDone 마킹 X — 다음 진단 흐름에서 재시도 가능.
  }
}

function showFirstTouchResult(insight) {
  if (document.getElementById('firstTouchResultOverlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay show';
  overlay.id = 'firstTouchResultOverlay';
  overlay.style.zIndex = '10001';
  const hypothesesHtml = (insight.hypotheses || []).map((h, i) => {
    // 새 schema: { category, name, description, trigger, sequence, display_text, confidence }
    // 옛 schema: 그냥 string (backward compat)
    const displayText = (typeof h === 'string') ? h : (h.display_text || h.name || '');
    const catLabel = (typeof h === 'object' && h.category) ?
      `<span style="font-size:9px; color:var(--text-soft); letter-spacing:0.1em; text-transform:uppercase; margin-right:6px;">${h.category === 'trait' ? '특성' : h.category === 'value' ? '가치' : '패턴'}</span>` : '';
    return `
      <div class="ft-hypothesis">
        <label>
          <input type="checkbox" id="ftHyp${i}" data-idx="${i}">
          <span>${catLabel}${escapeHtml(displayText)}</span>
        </label>
      </div>
    `;
  }).join('');
  const watchPointsHtml = (insight.watch_points || []).map(w => `
    <div class="ft-watch">· ${escapeHtml(w)}</div>
  `).join('');
  overlay.innerHTML = `
    <div class="input-modal" style="max-width:440px; max-height:90vh; overflow-y:auto; padding:24px;">
      <div style="font-size:11px; color:var(--text-soft); letter-spacing:0.15em; text-transform:uppercase; margin-bottom:6px;">너의 첫 관찰</div>
      <div style="font-family:'Gowun Batang',serif; font-size:32px; color:var(--accent); margin-bottom:8px; letter-spacing:0.04em;">${escapeHtml(insight.one_word || '')}</div>
      <div style="font-size:14px; color:var(--text); line-height:1.7; margin-bottom:18px; padding:14px; background:linear-gradient(135deg, rgba(139,126,196,0.12), rgba(201,169,110,0.07)); border-radius:12px;">
        ${escapeHtml(insight.intro_line || '')}
      </div>
      <div style="font-size:11px; color:var(--accent); letter-spacing:0.12em; text-transform:uppercase; margin-bottom:8px; margin-top:14px;">🔍 가설 (✓ 맞으면 체크)</div>
      <div style="font-size:11px; color:var(--text-dim); line-height:1.6; margin-bottom:10px;">
        체크한 건 너의 첫 traits/patterns로 자리잡음 (검증 미완료 표시 — 나중에 ✓ 확정 가능).
      </div>
      <div class="ft-hypotheses">${hypothesesHtml}</div>
      <div style="font-size:11px; color:var(--accent); letter-spacing:0.12em; text-transform:uppercase; margin-bottom:8px; margin-top:18px;">🪄 다음 1주 관찰 거리</div>
      <div class="ft-watches">${watchPointsHtml}</div>
      <div style="font-size:11px; color:var(--text-soft); margin-top:8px; font-style:italic;">
        다음 주간 리뷰 때 어떻게 됐는지 같이 봐.
      </div>
      <button class="btn-primary" onclick="closeFirstTouchResult()" style="width:100%; margin-top:20px;">시작하기 ✦</button>
    </div>
  `;
  document.body.appendChild(overlay);
}

function closeFirstTouchResult() {
  // ✓한 가설 → 카테고리별 (traits/values/patterns) 표준 schema 적용하기 — 기존 분석 흐름과 동일
  const checked = [...document.querySelectorAll('#firstTouchResultOverlay input[type="checkbox"]:checked')];
  if (checked.length > 0 && state.firstTouchInsight && Array.isArray(state.firstTouchInsight.hypotheses)) {
    if (!Array.isArray(state.traits)) state.traits = [];
    if (!Array.isArray(state.values)) state.values = [];
    if (!Array.isArray(state.patterns)) state.patterns = [];
    const nowIso = new Date().toISOString();
    for (const cb of checked) {
      const idx = parseInt(cb.dataset.idx, 10);
      const hyp = state.firstTouchInsight.hypotheses[idx];
      if (!hyp) continue;
      const id = 'ft_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const conf = typeof hyp.confidence === 'number' ? hyp.confidence : 0.5;
      // 옛 schema (string) 호환 — trait로 폴백
      if (typeof hyp === 'string') {
        state.traits.push({ id, name: hyp.slice(0, 20), description: hyp, confidence: conf, source: 'first_touch', user_verified: false, addedAt: nowIso });
        continue;
      }
      const cat = hyp.category;
      if (cat === 'trait') {
        state.traits.push({ id, name: hyp.name || '', description: hyp.description || hyp.display_text || '', confidence: conf, source: 'first_touch', user_verified: false, addedAt: nowIso });
      } else if (cat === 'value') {
        state.values.push({ id, name: hyp.name || '', description: hyp.description || hyp.display_text || '', confidence: conf, source: 'first_touch', user_verified: false, addedAt: nowIso });
      } else if (cat === 'pattern') {
        state.patterns.push({ id, name: hyp.name || '', trigger: hyp.trigger || '', sequence: hyp.sequence || hyp.display_text || '', confidence: conf, source: 'first_touch', user_verified: false, addedAt: nowIso });
      } else {
        // 카테고리 없거나 알 수 없으면 trait로 폴백
        state.traits.push({ id, name: hyp.name || (hyp.display_text || '').slice(0, 20), description: hyp.display_text || '', confidence: conf, source: 'first_touch', user_verified: false, addedAt: nowIso });
      }
    }
  }
  // 첫 weekly review에서 callback 위해 watch points seeds로 저장
  if (state.firstTouchInsight && Array.isArray(state.firstTouchInsight.watch_points)) {
    state._firstTouchSeeds = state.firstTouchInsight.watch_points.slice();
  }
  saveState();
  const overlay = document.getElementById('firstTouchResultOverlay');
  if (overlay) overlay.remove();
  showToast('✦ 첫 관찰 완료. 시작하자.');
  // 사용자 요청 2026-04-30 + V203 (chooser 폐기): 첫 관찰 close 후 → 배너 큐 trigger (legacy bonus / sync tip / feedback)
  setTimeout(() => { if (typeof autoTourOnUpdate === 'function') autoTourOnUpdate(); }, 800);
}

// ═══════════════════════════════════════════════════════════════════════════
// 코어 #1 첫 관찰 — Intake Worry 인터랙티브 흐름 (사용자 명시 2026-04-30 ultrathink)
// 흐름: Step1 첫 발화 (한 마디/예시chip/음성) → Step2 AI deepening → Step3 장문 발화 → Step4 paraphrase → Step5 더 알고 싶어 → Step6 차원 분석 + 작은 전략 → Step7 traits/values/patterns 자동 합류
// state.intakeWorry 별도 array — testerMode OFF / 시드 sweep / backup restore 영향 X
// ═══════════════════════════════════════════════════════════════════════════

// 예시 entry 7개 (한 줄 / 장문 페어). Step1 = 랜덤 1개 short chip / Step3 = 같은 페어 long (사용자 직접 입력 시 fallback = 다른 랜덤 또는 AI 동적).
const INTAKE_EXAMPLES = [
  {
    id: 'mom_anger', icon: '💔',
    short: '엄마한테 화냈어',
    long: '엄마한테 별거 아닌 일로 화를 냈어. 통화하다가 잔소리해서 톡 쏘아붙였어. 끊고 나서 바로 후회됐는데 자주 그래. 왜 그러는지 모르겠어.'
  },
  {
    id: 'project_block', icon: '💼',
    short: '할 일이 자꾸 막혀',
    long: '프로젝트 마감 다가오는데 손도 못 대. 시작만 하면 되는데 자꾸 다른 거 하다가 결국 마감 임박해서야 폭발할까 봐 걱정. 매번 그래.'
  },
  {
    id: 'reject_guilt', icon: '💞',
    short: '거절했는데 마음이 무거워',
    long: '친구 부탁 거절했는데 자꾸 마음에 걸려. 거절은 맞다고 생각하는데 부채감이 안 사라져. 며칠째 그 생각만 떠올라.'
  },
  {
    id: 'sleep_fog', icon: '🌙',
    short: '잠을 못 자',
    long: '머리는 피곤한데 누우면 잡생각이 멈추질 않아. 다음날 종일 멍해서 아무것도 못 해. 이게 한 달째.'
  },
  {
    id: 'unknown_heavy', icon: '💭',
    short: '이유 모르겠는데 무거워',
    long: '큰 일 있는 것도 아닌데 그냥 가라앉아 있어. 며칠 됐어. 뭘 해도 마음이 잡히질 않고 의욕이 없어.'
  },
  {
    id: 'path_doubt', icon: '🌠',
    short: '이 길이 맞는 건지 헷갈려',
    long: '지금까지 온 게 아까운 건지 진짜 좋아하는 건지 모르겠어. 가끔 그만두고 싶다가도 끝까지 가야 할 거 같고 — 답이 안 나와.'
  },
  {
    id: 'overwhelmed', icon: '🔥',
    short: '다 압도돼서 못 따라가',
    long: '할 일이 너무 많아. 뭐부터 해야 할지 모르겠고 시작도 못 해. 한 발짝도 못 떼고 있는데 시간만 가. 답답해.'
  }
];

function _intakePickRandomExample(excludeId) {
  const pool = excludeId ? INTAKE_EXAMPLES.filter(e => e.id !== excludeId) : INTAKE_EXAMPLES;
  return pool[Math.floor(Math.random() * pool.length)];
}

// 짧음 detect — 15자 미만 = deepening 필요
function _intakeShouldDeepen(text) {
  if (!text) return true;
  return text.trim().replace(/\s+/g, '').length < 15;
}

// Step2: AI 가 사용자 첫 짧은 발화 받고 한 번 더 풀어달라 부탁 (1-2 문장).
async function _intakeDeepenAsk(userText) {
  if (!_canAI()) throw new Error('AI 호출 불가능');
  const prompt = `너는 소라고동 — 자기관찰 친구. 따뜻 + 짧게 + 반말.
사용자가 첫 발화로 짧게 말했어. 한 번 더 풀어달라 부탁해.
판단 X. 강요 X. 1-2 문장 follow-up 질문.
사용자 발화의 핵심어 1개를 자연스럽게 paraphrase 안에 넣어.

사용자 첫 발화: "${userText}"

[출력]
1-2 문장만. 다른 글 X. 따옴표 X.`;
  const resp = await callAnthropic({
    _endpoint: 'intake',
    model: 'claude-sonnet-4-6',
    max_tokens: 200,
    system: '소라고동 톤 — 따뜻하고 짧게. 1-2 문장만 출력. 따옴표·markdown X.',
    messages: [{ role: 'user', content: prompt }]
  });
  if (!resp.ok) throw new Error('API ' + resp.status);
  const data = await resp.json();
  return (data?.content?.[0]?.text || '').trim();
}

// Step3: AI 가 사용자 첫 발화 받고 장문 entry 1개 모방용 생성 (50-100자, 상황+감정+자기관찰).
async function _intakeGenLongExample(userText) {
  if (!_canAI()) throw new Error('AI 호출 불가능');
  const prompt = `사용자가 첫 발화로 "${userText}" 라고 말했어 (짧음).
이걸 자연스럽게 풀어 적은 장문 entry 1개를 모방용으로 생성해 — "이런 식으로 풀면 돼" 학습용.
50-100자, 상황 + 감정 + 자기관찰 3축, 반말, 자연 한국어.
사용자 발화의 핵심 그대로 살리면서 살 붙임.

[출력]
장문 entry 1개만. 다른 글 X. 따옴표 X.`;
  const resp = await callAnthropic({
    _endpoint: 'intake',
    // V4 (사용자 명시 2026-05-06 ultrathink): intake 모달 API 전부 Sonnet 통일.
    // 첫 진입 = 톤 / 한국어 자연스러움 우선, 가격 차이 < 첫인상 가치.
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    system: '장문 entry 1개만 출력. 50-100자. 따옴표·markdown X.',
    messages: [{ role: 'user', content: prompt }]
  });
  if (!resp.ok) throw new Error('API ' + resp.status);
  const data = await resp.json();
  return (data?.content?.[0]?.text || '').trim();
}

// Step6: 전체 intakeWorry chat 받아 4단 분석 raw text 생성 (askDeeper 와 동일 형식).
// 사용자 명시 2026-05-08: intake 분석 = 평소 '더 알아보기' 4단 분석과 똑같은 prompt + 출력.
//   [상황] / [내가 본 것] / [이게 뭐냐면] / [이럴 땐 이렇게] / [오늘의 제안] raw text. JSON / hypotheses 폐기.
//   결과는 formatAIResponse 로 렌더링 (askDeeper 응답과 100% 동일 시각).
async function _intakeAnalyze(intakeWorry) {
  if (!_canAI()) throw new Error('AI 세션 미준비');
  const chatText = (intakeWorry || []).map(m => `${m.role === 'user' ? '사용자' : '소라고동'}: ${m.content}`).join('\n');
  const prompt = `사용자가 첫 만남에서 고민을 풀었어. 4단계로 더 깊게 분석해줘. [상황] / [내가 본 것] / [이게 뭐냐면] / [이럴 땐 이렇게] / [오늘의 제안] 형식으로. [상황]은 사용자가 시도하려는 *원래 문제*를 한 줄로 요약 (50자 내, 미션 결과 체크 모달용 — 화면엔 안 보임). 그 외 4단은 대화에서 관찰한 패턴도 한 줄 자연스럽게 인용해줘.

[대화]
${chatText}`;
  const resp = await callAnthropic({
    _endpoint: 'intake',
    // 사용자 명시 2026-05-08: askDeeper 와 동일 모델 (Opus 4.7) — 첫 만남 4단 분석 = 깊이 우선.
    model: 'claude-opus-4-7',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }]
  });
  if (!resp.ok) {
    let detail = '';
    try { const t = await resp.text(); detail = t.slice(0, 200); } catch {}
    throw new Error(`API ${resp.status}${detail ? ': ' + detail : ''}`);
  }
  const data = await resp.json();
  const text = (data?.content?.[0]?.text || '').trim();
  if (!text) throw new Error('AI 빈 응답');
  // 4단 라벨 한 개라도 있어야 분석 성공 — 없으면 retry trigger.
  if (!/\[내가 본 것\]|\[이게 뭐냐면\]|\[이럴 땐 이렇게\]|\[오늘의 제안\]/.test(text)) {
    throw new Error('4단 라벨 미감지');
  }
  return { text };
}

// 분석 결과의 hypotheses → state.traits/values/patterns 자동 합류 (user_verified=false).
function _intakeApplyHypotheses(hypotheses) {
  if (!Array.isArray(hypotheses)) return;
  state.traits = state.traits || [];
  state.values = state.values || [];
  state.patterns = state.patterns || [];
  hypotheses.forEach((h, i) => {
    if (!h || !h.category || !h.name) return;
    const id = 'intake_' + h.category + '_' + Date.now() + '_' + i;
    const base = {
      id,
      name: h.name,
      description: h.description || '',
      display_text: h.display_text || h.name,
      confidence: typeof h.confidence === 'number' ? h.confidence : 0.5,
      user_verified: false,
      evidence_count: 1,
      created_at: new Date().toISOString(),
      source: 'intake_core1'
    };
    if (h.category === 'trait') state.traits.push(base);
    else if (h.category === 'value') state.values.push(base);
    else if (h.category === 'pattern') {
      state.patterns.push({
        ...base,
        trigger: h.trigger || '',
        sequence: h.sequence || ''
      });
    }
  });
}

// ─── Intake 모달 풀 흐름 (Step1-6) + Web Speech API ──────────────────────────
let _intakeState = null;  // { step, exampleStep1, aiLong, analysis, resolve, recognition, recognizing }

async function runIntakeFlow() {
  return new Promise((resolve) => {
    state.intakeWorry = [];
    _intakeState = {
      step: 1,
      exampleStep1: _intakePickRandomExample(),
      aiLong: null,
      analysis: null,
      resolve,
      recognition: null,
      recognizing: false
    };
    _showIntakeModal();
  });
}

// ─── 공용 입력창 음성 인식 (사용자 명시 2026-04-30 ultrathink: chat / reflection / magic / mutation 4곳) ──────────
window._inputSpeechActive = null;  // { recognition, btnEl, taEl }

window._toggleInputSpeech = function(taId, btnId) {
  const ta = document.getElementById(taId);
  const btn = document.getElementById(btnId);
  if (!ta || !btn) return;
  // 같은 button 재누름 = stop
  if (window._inputSpeechActive && window._inputSpeechActive.btnEl === btn) {
    try { window._inputSpeechActive.recognition?.stop(); } catch {}
    return;
  }
  // 다른 곳 진행 중이면 먼저 stop
  if (window._inputSpeechActive) {
    try { window._inputSpeechActive.recognition?.stop(); } catch {}
    window._inputSpeechActive = null;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    showToast('🎤 음성 인식이 이 브라우저에서는 안 돼. 직접 적어줘 ✦');
    return;
  }
  // 첫 사용 = privacy 안내 1회
  if (!localStorage.getItem('soragodong_v4_speech_consent')) {
    if (!confirm('🎤 음성 입력 안내\n\n음성은 Google 서버를 거쳐 텍스트로 변환됩니다. 동의하시고 사용하시겠어요?')) return;
    try { localStorage.setItem('soragodong_v4_speech_consent', '1'); } catch {}
  }
  const recognition = new SR();
  recognition.lang = 'ko-KR';
  recognition.continuous = true;
  recognition.interimResults = true;
  let finalText = ta.value ? ta.value + ' ' : '';
  let silenceTimer = null;
  const resetSilence = () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => { try { recognition.stop(); } catch {} }, 5000);
  };
  recognition.onstart = () => {
    btn.classList.add('speech-active');
    btn.textContent = '⏹';
    resetSilence();
  };
  recognition.onresult = (event) => {
    resetSilence();
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += t + ' ';
      else interim += t;
    }
    ta.value = (finalText + interim).trim();
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const _MIC_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11Z"/></svg>';
  recognition.onerror = (e) => {
    console.warn('[input speech] error', e);
    btn.classList.remove('speech-active');
    btn.innerHTML = _MIC_SVG;
  };
  recognition.onend = () => {
    btn.classList.remove('speech-active');
    btn.innerHTML = _MIC_SVG;
    if (silenceTimer) clearTimeout(silenceTimer);
    window._inputSpeechActive = null;
  };
  window._inputSpeechActive = { recognition, btnEl: btn, taEl: ta };
  try { recognition.start(); } catch (e) { console.warn('[input speech] start fail', e); }
};

