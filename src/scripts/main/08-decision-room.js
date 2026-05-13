// ═══════════════════════════════════════════════════════════════
// DECISION ROOM (Phase 3)
// ═══════════════════════════════════════════════════════════════

const DECISION_STEPS = [
  { id: 'situation',   num: '1',  title: '지금 상황',           desc: '판단 없이 다 적어. 무슨 결정이고, 왜 지금 떠올랐는지.', timeReq: '오늘',     dayUnlock: 0 },
  { id: 'weight',      num: '2',  title: '결정의 무게',         desc: '가역성, 영향 범위, 시간 스케일.',                       timeReq: '오늘',     dayUnlock: 0 },
  { id: 'state',       num: '3',  title: '지금 내 상태',        desc: 'hot-cold empathy gap (Loewenstein) — 뜨거운 상태 결정은 후회로 이어져.', timeReq: '오늘', dayUnlock: 0 },
  { id: 'widen',       num: '4',  title: '진짜 선택지가 둘뿐?', desc: 'WRAP의 Widen — 거짓 이분법 차단 (Heath brothers).',     timeReq: '3일 후',   dayUnlock: 3 },
  { id: 'reality',     num: '5',  title: '현실 검증',           desc: '가정을 시험. 실제 종사자에게 묻거나 작은 실험.',         timeReq: '7일 후',   dayUnlock: 7 },
  { id: 'distance',    num: '6',  title: '거리두기',            desc: 'Self-distancing (Kross & Grossmann) — 친한 친구에게 조언하듯.', timeReq: '10일 후', dayUnlock: 10 },
  { id: 'premortem',   num: '7',  title: 'Pre-mortem',          desc: '5년 후 이 결정이 실패였다면? (Klein)',                  timeReq: '12일 후',  dayUnlock: 12 },
  { id: 'odyssey',     num: '8',  title: 'Odyssey 3경로',       desc: '3가지 5년 후를 그려봐 (Burnett & Evans).',              timeReq: '14일 후',  dayUnlock: 14 },
  { id: 'values',      num: '9',  title: '가치 정렬',           desc: 'SDT 자율성·유능감·관계성 어느 쪽이 충족되는가 (Deci & Ryan).', timeReq: '14일 후', dayUnlock: 14 },
  { id: 'decision',    num: '10', title: '최종 결정 + 예측',    desc: '결정과 함께 3·6·12개월 예측 기록 (Wilson & Gilbert).',  timeReq: '14일 후',  dayUnlock: 14 }
];

// V4 사용자 명시 2026-05-04: 마법고동 임시대화창 = 각 단계의 "해당 질문" 답을 찾아가도록 돕는 도구.
// 단계마다: 이 단계가 풀려는 핵심 질문 / 산출물 / 도와주는 방식 / 다른 단계 영역(지금 X) 정의.
// _runMagicHelpAIResponse 의 sysPrompt 안에 주입 — AI 가 단계별 frame 안에 머무르도록.
const STEP_HELP_GUIDE = {
  situation: {
    q: '지금 마주한 결정이 정확히 뭐고, 왜 하필 지금 이게 떠올랐는가?',
    goal: '결정 사안 + 촉발 맥락(trigger) 한 단락. 평가/비교 X, 사실·맥락만.',
    how: [
      '사용자 글에서 빠진 "정확히 무엇 / 언제 / 누가 / 왜 지금" 중 1-2개만 콕 짚어 되묻기',
      '판단 단어("좋다/나쁘다/해야") 들어오면 사실 쪽으로 되돌리기'
    ],
    avoid: ['선택지 비교·평가', '해결책 제시', '결정 재촉']
  },
  weight: {
    q: '이 결정이 얼마나 되돌릴 수 없고, 누구에게 얼마나 오래 영향이 남는가?',
    goal: '가역성 / 영향 범위 / 시간 스케일 — 세 측면 각각 한 답.',
    how: [
      '추상 답("좀 큼") 들어오면 구체 환산 — "1년 안에 원상복구 가능?", "영향 받는 사람 수?"',
      '세 측면 한꺼번에 묻지 말고 한 측면씩'
    ],
    avoid: ['옵션 평가', '결정 재촉']
  },
  state: {
    q: '지금 결정 내리기에 머리·몸이 차분한 상태인가, 뜨거운 상태인가?',
    goal: '수면 / 감정 강도 / 압박감 자기관찰 한 답씩.',
    how: [
      '신체 단서(어깨, 잠, 숨, 짜증 빈도)로 환산해 묻기',
      'hot 신호(잠 부족 + 격앙 + 압박) 잡히면 "오늘은 다음 단계 미뤄도 돼" 명시'
    ],
    avoid: ['결정 진척', '옵션 비교']
  },
  widen: {
    q: '지금 떠오른 옵션 외에 — 둘 다, 둘 다 아님, 시간차, 제3의 길이 있을까?',
    goal: '추가 옵션 1-3개 (생각만이라도 꺼내기).',
    how: [
      'WRAP Widen reframing 한두 개 던지기: "둘 다 시도?", "6개월 미루면?", "1/10 크기로 작게?", "정반대 성향 사람은 어떻게?"'
    ],
    avoid: ['옵션 평가·순위', '결정']
  },
  reality: {
    q: '내 가정 중 검증 가능한 게 뭐고, 어떻게 작은 실험으로 시험할 수 있을까?',
    goal: '검증할 가정 1-2개 + 그걸 깰 수 있는 작은 실험/대화 1-3개.',
    how: [
      '사용자 글에서 검증 안 된 가정 한두 개 짚기',
      '실제 종사자 인터뷰 / 1주 trial / 데이터 수집 형태로 환산'
    ],
    avoid: ['일반 조언', '결정']
  },
  distance: {
    q: '친한 친구가 같은 상황이면 / 10년 후 미래의 내가 보면, 뭐라고 할까?',
    goal: 'third-person 시점으로 다시 본 관점 한 단락.',
    how: [
      '사용자 호칭(예: "나은 씨가") 으로 풀어보라 권유',
      '10년 후 미래 자아 시점 직접 빌리기 — "그때의 나는 지금의 나에게 뭐라고?"'
    ],
    avoid: ['1인칭 결정 강요', '옵션 비교']
  },
  premortem: {
    q: '5년 후 이 결정이 실패였다면, 가장 그럴듯한 실패 시나리오는?',
    goal: '실패 시나리오 + 원인 카테고리 2-5개.',
    how: [
      '아직 안 떠오른 실패 origin 카테고리 1-2개 제시 (관계 단절 / 번아웃 / 외부 충격 / 페이스 무리 / 자원 고갈)',
      '"이렇게 되면 나는 어떻게 조기에 알아챌까?" 신호도 함께'
    ],
    avoid: ['성공 시나리오', '결정 옹호']
  },
  odyssey: {
    q: '경로 셋 — A) 지금 경로 그대로 / B) 지금 경로가 사라졌다면 / C) 돈·시선 무관할 때 — 5년 후 모습?',
    goal: 'A/B/C 각 한 단락 (가능하면 평일 한 장면 묘사).',
    how: [
      '비어 있는 경로(특히 C)의 평일 아침 한 장면 그려보라 prompt',
      '경로마다 좋은 점 + 잃는 것 함께 (한쪽 만 X)'
    ],
    avoid: ['어느 경로가 정답인지 판단']
  },
  values: {
    q: 'SDT 3 욕구 (자율성·유능감·관계성) 중 이 결정이 어느 쪽을 채우고 어느 쪽을 깎나?',
    goal: '세 욕구 각각 + / - 짧게.',
    how: [
      '사용자 본인 traits/values 데이터 인용 — 예: "자율 가치 conf 높던데, 이 옵션은 자율을 깎는 쪽?"',
      '세 욕구 한꺼번에 묻지 말고 한 욕구씩'
    ],
    avoid: ['외부 가치 강요']
  },
  decision: {
    q: '어느 길로 가고, 3·6·12개월 뒤 나는 어떤 상태일 거라 예측하나?',
    goal: '결정 + 확신도(1-10) + 3 시점 예측 (잠 시간, 후회 빈도, 만족도 등 구체 신호).',
    how: [
      '예측을 추상("괜찮을 듯") 대신 구체 신호로 재진술 권유',
      '14일 미만이면 미루기 권유',
      '확신도 < 7 이면 어느 측면이 흐릿한지 짚기'
    ],
    avoid: ['결정 자체 대신 내려주기']
  }
};

let _weightSelections = {};

// 14일 숙성 ring SVG (사용자 명시 2026-04-30 ultrathink: 마법의 방 모티프 — 모래시계 진행도)
function _magicTimeRing(daysSince) {
  const days = Math.max(0, Math.min(daysSince, 14));
  const r = 18;
  const c = 2 * Math.PI * r;
  const offset = c - (c * (days / 14));
  const ready = daysSince >= 14;
  const remain = ready ? 0 : (14 - days);
  const titleText = ready ? '14일 숙성 완료 ✦' : `${days}일째 — ${remain}일 남음`;
  return `<div class="magic-time-ring ${ready ? 'ready' : ''}" title="${titleText}">
    <svg viewBox="0 0 46 46">
      <circle class="magic-ring-bg" cx="23" cy="23" r="${r}"/>
      <circle class="magic-ring-fill" cx="23" cy="23" r="${r}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"/>
    </svg>
    <div class="magic-ring-num">${days}<span>/14일</span></div>
  </div>`;
}

// 10단계 dot — locked / unlocked / done (사용자 명시 2026-04-30 ultrathink: step 진행도 시각화)
function _magicStepDots(steps, daysSince) {
  steps = steps || [];
  return `<div class="magic-step-dots">
    ${DECISION_STEPS.map((meta, i) => {
      const s = steps[i];
      const done = !!(s && s.completed);
      const unlocked = (typeof daysSince === 'number') ? (daysSince >= meta.dayUnlock) : true;
      const cls = done ? 'done' : (unlocked ? 'unlocked' : '');
      return `<span class="magic-step-dot ${cls}" title="${i+1}. ${meta.title}${done ? ' ✓' : (unlocked ? '' : ` (${meta.timeReq})`)}"></span>`;
    }).join('')}
    <span class="magic-step-dots-label">${steps.filter(s => s && s.completed).length}/${DECISION_STEPS.length}</span>
  </div>`;
}

function renderActiveDecisionsHome() {
  const container = document.getElementById('activeDecisionsContainer');
  if (!container) return;
  const active = (state.decisions || []).filter(d => d.status === 'in_progress');
  if (active.length === 0) { container.innerHTML = ''; return; }

  container.innerHTML = active.map(d => {
    const daysSince = Math.floor((new Date() - new Date(d.startedAt)) / 86400000);
    return `
      <div class="decision-card-home" onclick="openDecision('${d.id}')">
        <div class="decision-card-row">
          ${_magicTimeRing(daysSince)}
          <div class="decision-card-row-text">
            <div class="decision-card-label"><img src="/character/godong-wizard.svg" alt="" class="godong-icon godong-mood-wizard" decoding="async"> 진행 중인 결정 · ${daysSince}일째</div>
            <div class="decision-card-title">${escapeHtml(d.title)}</div>
            ${_magicStepDots(d.steps, daysSince)}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderDecisionsList() {
  const active = (state.decisions || []).filter(d => d.status === 'in_progress');
  const completed = (state.decisions || []).filter(d => d.status === 'decided' || d.status === 'abandoned');

  const activeList = document.getElementById('activeDecisionsList');
  const completedList = document.getElementById('completedDecisionsList');
  if (!activeList || !completedList) return;  // FIX BUG-1: null guard
  if (active.length === 0) {
    activeList.innerHTML = '<div style="font-size:12px; color:var(--text-dim); padding:14px; background:var(--surface); border-radius:12px; line-height:1.7;">지금 숙성 중인 결정 없어.<br>큰 고민 생기면 여기서 천천히 풀자 ✦</div>';
  } else {
    activeList.innerHTML = active.map(d => {
      const daysSince = Math.floor((new Date() - new Date(d.startedAt)) / 86400000);
      const ready = daysSince >= 14;
      return `
        <div class="decision-list-item" onclick="openDecision('${d.id}')">
          <div class="decision-card-row">
            ${_magicTimeRing(daysSince)}
            <div class="decision-card-row-text">
              <div class="decision-list-item-title">${escapeHtml(d.title)}</div>
              <div class="decision-list-item-meta">
                <span>${daysSince}일째${ready ? ' ✦ 숙성 완료' : ''}</span>
              </div>
              ${_magicStepDots(d.steps, daysSince)}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  if (completed.length === 0) {
    completedList.innerHTML = '<div style="font-size:12px; color:var(--text-soft); padding:14px;">아직 마무리한 결정은 없어.</div>';
  } else {
    completedList.innerHTML = completed.slice().reverse().map(d => `
      <div class="decision-list-item completed" onclick="openDecision('${d.id}')">
        <div class="decision-list-item-title">${escapeHtml(d.title)}</div>
        <div class="decision-list-item-meta">
          <span>${d.status === 'decided' ? '✓ 결정됨' : '✗ 중단'}</span>
          ${d.finalDecision ? `<span>→ ${escapeHtml(d.finalDecision.slice(0, 30))}</span>` : ''}
        </div>
      </div>
    `).join('');
  }
}

async function startNewDecision() {
  // 사용자 요청 2026-04-28: 튜토리얼/테스터 모드면 예시 시드 입력
  const isAutoFix = !!(window._onbTutorialMode || (state.preferences && state.preferences.testerMode));
  const title = await showInputModal({
    title: '마법고동 🐚',
    message: '14일 동안 천천히 익힐 거야.\n어떤 결정인지 한 줄로.',
    placeholder: '예: 창업할까 공기업 갈까 / 그에게 용기를 내볼까',
    defaultValue: isAutoFix ? '그에게 용기를 내볼까 vs 말까' : '',
    okLabel: '시작'
  });
  if (!title || !title.trim()) return;

  const decision = {
    id: 'dec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    title: title.trim(),
    startedAt: new Date().toISOString(),
    status: 'in_progress',
    steps: DECISION_STEPS.map(s => ({ id: s.id, completed: false, content: '' })),
    finalDecision: null,
    predictions: null
  };
  state.decisions.push(decision);
  saveState();
  openDecision(decision.id);
  showToast('마법고동 시작. 천천히 가자 🐚');
}

function openDecision(decisionId) {
  const decision = state.decisions.find(d => d.id === decisionId);
  if (!decision) return;
  decision.lastOpenedAt = new Date().toISOString();
  saveState();
  renderDecisionDetail(decision);
  showScreen('decision-detail');
}

function renderDecisionDetail(decision) {
  const screen = document.getElementById('screen-decision-detail');
  if (!screen) return;  // FIX BUG-1: null guard
  const completedSteps = decision.steps.filter(s => s.completed).length;
  const totalSteps = DECISION_STEPS.length;
  const pct = (completedSteps / totalSteps) * 100;
  const daysSince = Math.floor((new Date() - new Date(decision.startedAt)) / 86400000);

  let html = `
    <div class="screen-title">${escapeHtml(decision.title)}</div>
    <div class="screen-sub">${daysSince}일째 진행 중 · ${decision.status === 'decided' ? '✓ 결정 완료' : decision.status === 'abandoned' ? '✗ 중단됨' : '숙성 중'}</div>

    <div class="progress-circle">
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="progress-text">${completedSteps}/${totalSteps}</div>
    </div>
  `;

  decision.steps.forEach((step, idx) => {
    const meta = DECISION_STEPS[idx];
    const isTimeLocked = !step.completed && daysSince < meta.dayUnlock;
    const cls = step.completed ? 'completed' : (isTimeLocked ? '' : 'active');

    // 사용자 요청 2026-04-30: 마법 helpChat 접근성 — step 카드에 진행 중 대화 표시 + 1-click 재진입.
    const helpMsgs = (decision.helpChats && Array.isArray(decision.helpChats[step.id]))
      ? decision.helpChats[step.id].filter(m => !m._starter && !m.error)
      : [];
    const helpCount = helpMsgs.length;
    // 사용자 명시 2026-04-30: 임시대화창 접근성 높이기 — 보라 톤 + prominent.
    const helpButton = helpCount > 0
      ? `<button class="btn-secondary" onclick="askAIForStep('${decision.id}', '${step.id}')" style="margin-top:8px; background:linear-gradient(135deg, rgba(178,140,212,0.22), rgba(139,126,196,0.12)); border-color:rgba(178,140,212,0.45); color:#d4b8ff; font-size:13px; font-weight:600; padding:10px 14px; box-shadow:0 2px 8px rgba(139,126,196,0.18);"><img src="/character/godong-wizard.svg" alt="" class="godong-icon godong-mood-wizard" decoding="async"> 마법고동과 이어서 — ${helpCount}개 메시지</button>`
      : (decision.status === 'in_progress' ? `<button class="btn-secondary" onclick="askAIForStep('${decision.id}', '${step.id}')" style="margin-top:8px; background:linear-gradient(135deg, rgba(178,140,212,0.18), rgba(139,126,196,0.10)); border-color:rgba(178,140,212,0.40); color:#d4b8ff; font-size:13px; font-weight:600; padding:10px 14px;"><img src="/character/godong-wizard.svg" alt="" class="godong-icon godong-mood-wizard" decoding="async"> 마법고동한테 도움 받기 ✦</button>` : '');

    html += `
      <div class="step-card ${cls}">
        <div class="step-header">
          <div class="step-num">STEP ${meta.num}</div>
          <div class="step-status ${step.completed ? 'completed' : ''}">${step.completed ? '✓ 완료' : (isTimeLocked ? '🔒 ' + meta.timeReq : '대기 중')}</div>
        </div>
        <div class="step-title">${meta.title}</div>
        <div class="step-time-required">권장 시점: ${meta.timeReq}</div>
        <div class="step-desc">${meta.desc}</div>
        ${step.completed ? `
          <div class="step-content-saved">${formatStepContent(step)}</div>
          ${decision.status === 'in_progress' ? `<button class="btn-secondary" onclick="editStep('${decision.id}', '${step.id}')" style="margin-top:8px;">수정</button>` : ''}
          ${helpButton}
        ` : (decision.status === 'in_progress' ? `
          ${isTimeLocked ? `
            <div style="font-size:12px; color:var(--text-dim); padding:10px; background:var(--surface2); border-radius:10px; line-height:1.6;">
              ${meta.dayUnlock - daysSince}일 후에 다시 와. 숙성이 필요해.
            </div>
            <button class="btn-secondary" onclick="editStep('${decision.id}', '${step.id}')" style="margin-top:8px; font-size:11px;">그래도 지금 작성</button>
            ${helpButton}
          ` : `
            <button class="btn-primary decision" onclick="editStep('${decision.id}', '${step.id}')">시작</button>
            ${helpButton}
          `}
        ` : '')}
      </div>
    `;
  });

  if (decision.status === 'in_progress') {
    html += `
      <div style="margin-top: 30px; display:flex; flex-direction:column; gap: 8px;">
        <button class="btn-secondary btn-danger" onclick="abandonDecision('${decision.id}')">이 결정 중단</button>
        <button class="btn-secondary" onclick="showScreen('decisions')">결정 목록으로</button>
      </div>
    `;
  } else if (decision.status === 'abandoned') {
    html += `
      <div style="margin-top: 30px; display:flex; flex-direction:column; gap: 8px;">
        <button class="btn-primary decision" onclick="resumeDecision('${decision.id}')">다시 이 결정 이어가기 ✦</button>
        <button class="btn-secondary btn-danger" onclick="deleteDecisionForever('${decision.id}')">🗑 완전 삭제</button>
        <button class="btn-secondary" onclick="showScreen('decisions')">결정 목록으로</button>
      </div>
    `;
  } else {
    html += `<button class="btn-secondary" onclick="showScreen('decisions')" style="margin-top:30px;">결정 목록으로</button>`;
  }

  screen.innerHTML = html;
}

function formatStepContent(step) {
  if (!step.content) return '(비어 있음)';
  // For weight/state/decision, content is JSON
  if (['weight', 'state'].includes(step.id)) {
    try {
      const obj = JSON.parse(step.content);
      return Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join('\n');
    } catch { return escapeHtml(step.content); }
  }
  if (step.id === 'decision') {
    try {
      const obj = JSON.parse(step.content);
      return `결정: ${obj.decision}\n확신도: ${obj.confidence}/10\n\n3개월: ${obj.predictions?.['3months'] || ''}\n6개월: ${obj.predictions?.['6months'] || ''}\n12개월: ${obj.predictions?.['12months'] || ''}`;
    } catch { return escapeHtml(step.content); }
  }
  return escapeHtml(step.content);
}

function editStep(decisionId, stepId) {
  const decision = state.decisions.find(d => d.id === decisionId);
  if (!decision) return;
  const step = decision.steps.find(s => s.id === stepId);
  const meta = DECISION_STEPS.find(m => m.id === stepId);
  _weightSelections = {};

  if (stepId === 'weight') openWeightStep(decision, step);
  else if (stepId === 'state') openStateStep(decision, step);
  else if (stepId === 'decision') openFinalDecisionStep(decision, step);
  else openTextStep(decision, step, meta);
}

function openTextStep(decision, step, meta) {
  const screen = document.getElementById('screen-decision-detail');
  // 사용자 요청 2026-04-28: 튜토리얼/테스터 모드면 '지금 상황' step 예시 시드 prefill
  const isAutoFix = !!(window._onbTutorialMode || (state.preferences && state.preferences.testerMode));
  if (isAutoFix && step.id === 'situation' && !step.content) {
    step.content = '3개월 전 같이 듣는 수업에서 처음 만났어. 처음엔 인사만 했는데 지난달 그룹 발표 같이 하면서 자주 카톡하게 됨. 최근 둘이서 점심도 두 번 먹었어.\n\n근데 그 사람 카톡 답이 어떨 땐 1분, 어떨 땐 다음 날이라 진짜 호감 있어서 그런 건지 그냥 친구로 편해서 그런 건지 못 읽겠어.\n\n다음 주 수업 끝나고 둘이 따로 보자고 해볼까 싶은데, 거절당하면 같이 듣는 수업이라 한 학기 내내 어색해질까 봐 망설여져. 안 하면 후회할 것 같기도 하고.';
  }
  let hint = '';
  if (step.id === 'widen') hint = '💡 진짜로 두 가지뿐일까? "둘 다", "둘 다 아님", 새로운 제3의 길, 시간차 두기 등을 적어봐.';
  else if (step.id === 'reality') hint = '💡 가정을 검증할 수 있는 작은 실험. 그 분야 사람에게 연락하기. 짧은 시도. 무엇으로 가설을 깨뜨릴 수 있을까?';
  else if (step.id === 'distance') hint = '💡 "친한 친구가 이 상황이면 나는 뭐라고 조언할까?" 또는 "10년 후 미래의 내가 지금의 나에게..."';
  else if (step.id === 'premortem') hint = '💡 5년 후 이 결정이 큰 후회로 남았다고 상상해. 가능한 실패 이유를 구체적으로 다 적어봐.';
  else if (step.id === 'odyssey') hint = '💡 세 가지 경로를 5년 후 모습으로 그려봐.\nA. 지금 경로 그대로\nB. 지금 경로가 사라졌다면\nC. 돈·시선 무관할 때';
  else if (step.id === 'values') hint = '💡 SDT 3가지 욕구를 점검해봐.\n· 자율성: 내 의지·선택대로인가?\n· 유능감: 잘한다는 느낌·성장이 있나?\n· 관계성: 의미 있는 연결·기여가 있나?';

  screen.innerHTML = `
    <div class="screen-title">${escapeHtml(meta.title)}</div>
    <div class="screen-sub">${escapeHtml(meta.desc)}</div>

    ${hint ? `<div class="step-hint">${hint.replace(/\n/g, '<br>')}</div>` : ''}

    <div class="input-group">
      <textarea id="stepEditor" rows="10" placeholder="여기에 적어. 판단 없이, 솔직하게.">${escapeHtml(step.content || '')}</textarea>
    </div>

    <button class="btn-primary decision" onclick="saveTextStep('${decision.id}', '${step.id}')">완료</button>
    ${(() => {
      // 사용자 요청 2026-04-30: 도움 받기 버튼에 진행 중 대화 카운트 표시.
      const stepHelpMsgs = (decision.helpChats && Array.isArray(decision.helpChats[step.id]))
        ? decision.helpChats[step.id].filter(m => !m._starter && !m.error) : [];
      // 사용자 명시 2026-04-30: 임시대화창 접근성 높이기 — 보라 톤 + prominent.
      return stepHelpMsgs.length > 0
        ? `<button class="btn-secondary" onclick="askAIForStep('${decision.id}', '${step.id}')" style="background:linear-gradient(135deg, rgba(178,140,212,0.22), rgba(139,126,196,0.12)); border-color:rgba(178,140,212,0.45); color:#d4b8ff; font-size:14px; font-weight:600; padding:12px 16px; box-shadow:0 2px 10px rgba(139,126,196,0.20);"><img src="/character/godong-wizard.svg" alt="" class="godong-icon godong-mood-wizard" decoding="async"> 마법고동과 이어서 — ${stepHelpMsgs.length}개 메시지</button>`
        : `<button class="btn-secondary" onclick="askAIForStep('${decision.id}', '${step.id}')" style="background:linear-gradient(135deg, rgba(178,140,212,0.18), rgba(139,126,196,0.10)); border-color:rgba(178,140,212,0.40); color:#d4b8ff; font-size:14px; font-weight:600; padding:12px 16px;"><img src="/character/godong-wizard.svg" alt="" class="godong-icon godong-mood-wizard" decoding="async"> 마법고동한테 도움 받기 ✦</button>`;
    })()}
    <button class="btn-secondary" onclick="openDecision('${decision.id}')">돌아가기</button>
  `;
}

function saveTextStep(decisionId, stepId) {
  const decision = state.decisions.find(d => d.id === decisionId);
  const step = decision.steps.find(s => s.id === stepId);
  step.content = document.getElementById('stepEditor').value.trim();
  if (step.content) {
    step.completed = true;
    step.completedAt = new Date().toISOString();
  }
  saveState();
  openDecision(decisionId);
  showToast('저장됐어 🐚');
}

// 사용자 요청 2026-04-29: 마법 도움 받기 = 별도 helpChat 모달. decision/step별 영구 저장.
// 14일 숙성 중 며칠 걸쳐 이어볼 수 있음. 메인 chat 탭 안 건드림.
async function askAIForStep(decisionId, stepId) {
  // 사용자 요청 2026-04-30: apiKey 빈 상태에서도 백엔드 프록시로 동작 (Phase C). session 활성만 체크.
  if (!_canAI() &&(typeof session === 'undefined' || !session?.access_token)) {
    alert('로그인이 필요해요!');
    return;
  }
  openMagicHelpChat(decisionId, stepId);
}

// helpChat state
let _magicHelpState = null;

function openMagicHelpChat(decisionId, stepId) {
  const decision = (state.decisions || []).find(d => d.id === decisionId);
  if (!decision) return;
  const meta = DECISION_STEPS.find(m => m.id === stepId);
  if (!meta) return;
  // helpChat 영구 저장 위치: decision.helpChats[stepId] = []
  if (!decision.helpChats) decision.helpChats = {};
  if (!Array.isArray(decision.helpChats[stepId])) decision.helpChats[stepId] = [];

  _magicHelpState = { decisionId, stepId, _loading: false };

  // 사용자 요청 2026-04-29: 첫 진입 시 옛 askAIForStep의 컨텍스트 템플릿을 자동 user msg로 push + AI 응답 트리거
  if (decision.helpChats[stepId].length === 0) {
    const completedContext = (decision.steps || []).filter(s => s.completed).map(s => {
      const m = DECISION_STEPS.find(x => x.id === s.id);
      return `[${m?.title || s.id}]\n${typeof formatStepContent === 'function' ? formatStepContent(s) : (s.content || '')}`;
    }).join('\n\n');
    const editor = document.getElementById('stepEditor');
    const currentDraft = editor ? editor.value.trim() : '';

    const _coreQ = STEP_HELP_GUIDE[stepId] && STEP_HELP_GUIDE[stepId].q;
    const starterMsg = `[${meta.title}] "${decision.title}"
${_coreQ ? `\n이 단계가 풀려는 질문: "${_coreQ}"` : ''}

지금까지 작성한 단계:
${completedContext || '(아직 시작 X)'}

이번 단계 (${meta.title})에 내가 적은 거:
${currentDraft || '(비어있음 — 도움이 필요해)'}

이 질문에 대한 내 답을 찾도록 도와줘. 결정을 대신 내려주지 말고, 다른 단계로 새지도 말고.`;

    decision.helpChats[stepId].push({
      role: 'user',
      content: starterMsg,
      timestamp: new Date().toISOString(),
      _starter: true
    });
    saveState();
    _renderMagicHelpChat();
    // AI 자동 응답 트리거
    setTimeout(() => _runMagicHelpAIResponse(), 200);
    if (typeof updateMagicHelpChatModeBtn === 'function') updateMagicHelpChatModeBtn();
    return;
  }
  _renderMagicHelpChat();
  // V4 (사용자 명시 2026-05-13): per-room Opus 토글 visual sync.
  if (typeof updateMagicHelpChatModeBtn === 'function') updateMagicHelpChatModeBtn();
  // V4 (사용자 명시 2026-05-13): 첫 진입 1-step 튜토리얼 모달 (1회만).
  if (typeof showPerRoomOpusFirstClickModal === 'function') setTimeout(() => showPerRoomOpusFirstClickModal(), 400);
}

// AI 응답 만 호출 (sendMagicHelpMessage에서 입력 부분만 분리)
async function _runMagicHelpAIResponse() {
  if (!_magicHelpState) return;
  const decision = (state.decisions || []).find(d => d.id === _magicHelpState.decisionId);
  if (!decision) return;
  const stepId = _magicHelpState.stepId;
  if (!Array.isArray(decision.helpChats?.[stepId])) return;
  const meta = DECISION_STEPS.find(m => m.id === stepId);
  if (!meta) return;

  // 사용자 요청 2026-04-30: apiKey 빈 상태 + session 활성 시 백엔드 프록시 동작 (fetch interceptor 자동 swap).
  if (!_canAI() &&(typeof session === 'undefined' || !session?.access_token)) {
    decision.helpChats[stepId].push({ role: 'assistant', content: '(로그인이 필요해요. 새로고침 후 다시 시도해주세요.)', timestamp: new Date().toISOString() });
    _magicHelpState._loading = false;
    saveState();
    _renderMagicHelpChat();
    return;
  }

  _magicHelpState._loading = true;
  _renderMagicHelpChat();

  const completedContext = (decision.steps || []).filter(s => s.completed).map(s => {
    const m = DECISION_STEPS.find(x => x.id === s.id);
    return `[${m?.title || s.id}]\n${typeof formatStepContent === 'function' ? formatStepContent(s) : (s.content || '')}`;
  }).join('\n\n');
  const editor = document.getElementById('stepEditor');
  const currentDraft = editor ? editor.value : '';

  const _topByConf = (arr, n) => (arr || []).slice().sort((a, b) => (b.confidence || 0) - (a.confidence || 0)).slice(0, n);
  const traits = _topByConf(state.traits, 5).map(t => `- ${t.name}${t.description ? ': ' + t.description : ''}`).join('\n');
  const patterns = _topByConf(state.patterns, 5).map(p => `- ${p.name}${p.trigger ? ' (트리거: ' + p.trigger + ')' : ''}`).join('\n');
  const values = _topByConf(state.values, 3).map(v => `- ${v.name}`).join('\n');

  // 사용자 명시 2026-05-11 ultrathink: system prompt backend 이전 — backend (endpoint-systems.ts) buildMagicHelpSystem 가 _vars 받아 합성.
  //   1h cache_control 보존. STEP_HELP_GUIDE 항목은 클라가 _vars 로 packed 전달.
  const guide = STEP_HELP_GUIDE[stepId];

  try {
    const recentMsgs = decision.helpChats[stepId].slice(-15).map(m => ({ role: m.role, content: m.content }));
    const resp = await callAnthropic({
      _endpoint: 'magic_help',
      _vars: {
        decisionTitle: decision.title,
        stepTitle: meta.title,
        guideQ: guide?.q || '',
        guideGoal: guide?.goal || '',
        guideHowList: guide?.how || [],
        guideAvoidList: guide?.avoid || [],
        traitsBlock: traits,
        patternsBlock: patterns,
        valuesBlock: values,
        completedContext,
        currentDraft
      },
      // V4 (사용자 명시 2026-05-13): per-room useOpus — decision.helpChatUseOpus[stepId] (이 단계 한정). Premium 만 활성 가능.
      model: (decision.helpChatUseOpus && decision.helpChatUseOpus[stepId] && typeof canUseOpus === 'function' && canUseOpus()) ? 'claude-opus-4-7' : 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: recentMsgs
    });
    const data = await resp.json();
    const aiText = data.content?.[0]?.text?.trim() || '(응답 비어있어)';
    decision.helpChats[stepId].push({ role: 'assistant', content: aiText, timestamp: new Date().toISOString() });
  } catch (e) {
    console.warn('magic help AI:', e);
    decision.helpChats[stepId].push({ role: 'assistant', content: '(응답 실패 — 잠시 후 다시)', error: true, timestamp: new Date().toISOString() });
  }
  _magicHelpState._loading = false;
  saveState();
  _renderMagicHelpChat();
}

function _renderMagicHelpChat() {
  if (!_magicHelpState) return;
  const decision = (state.decisions || []).find(d => d.id === _magicHelpState.decisionId);
  if (!decision) { closeMagicHelpChat(); return; }
  const meta = DECISION_STEPS.find(m => m.id === _magicHelpState.stepId);
  if (!meta) { closeMagicHelpChat(); return; }
  const messages = (decision.helpChats && decision.helpChats[_magicHelpState.stepId]) || [];

  // 사용자 요청 2026-04-29: 풀스크린 (숙고의 방 패턴) — 모달 X
  if (typeof showScreen === 'function') {
    const cur = document.querySelector('.screen.active');
    if (!cur || cur.id !== 'screen-magic-help') {
      showScreen('magic-help');
    }
  }
  // 헤더 제목 (단계명 + 결정 주제)
  const qEl = document.getElementById('magicHelpScreenQ');
  if (qEl) {
    qEl.innerHTML = `<div style="font-size:13px; font-weight:600; color:var(--text);"><img src="/character/godong-wizard.svg" alt="" class="godong-icon godong-mood-wizard" decoding="async"> ${escapeHtml(meta.title)}</div>
      <div style="font-size:11px; color:var(--text-dim); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">"${escapeHtml(decision.title)}"</div>`;
  }
  // 입력바 표시
  const inputBar = document.getElementById('magicHelpInputBar');
  if (inputBar) inputBar.classList.add('active');
  // 메시지
  const area = document.getElementById('magicHelpArea');
  if (area) {
    let html = '';
    messages.forEach((m, i) => {
      // _starter는 회색 톤 (자동 컨텍스트 시작 메시지)
      const extraStyle = m._starter ? ' style="background:var(--surface); border:1px dashed var(--border); color:var(--text-dim); white-space:pre-wrap; font-size:11px;"' : '';
      html += `<div class="reflection-msg ${m.role}"${extraStyle}>${escapeHtml(m.content)}</div>`;
      // 사용자 요청 2026-04-29: 마법 helpChat assistant 메시지에 ✦ 깨달음으로 버튼 (숙고/돌연변이 패턴 통일)
      if (m.role === 'assistant' && !m._starter && !m.error) {
        html += `<button class="reflection-msg-insight ${m.savedAsInsight ? 'saved' : ''}" onclick="saveMagicHelpMsgAsInsight(${i})">${m.savedAsInsight ? '✦ 저장됨' : '✦ 깨달음으로'}</button>`;
      }
    });
    if (_magicHelpState._loading) {
      html += `<div class="reflection-msg assistant" style="opacity:0.6;">생각 중... ✦</div>`;
    }
    area.innerHTML = html;
    area.scrollTop = area.scrollHeight;
  }
  // textarea 자동 높이 + Enter 전송
  const ta = document.getElementById('magicHelpInput');
  if (ta && !ta._magicWired) {
    ta._magicWired = true;
    // 사용자 요청 2026-04-29: 메인 chat 탭처럼 자동 높이 (max 140px)
    // 사용자 보고 2026-05-02: rAF coalesce — 매 keystroke sync reflow 차단 (메인 chat 패턴 동일).
    let _magicResizeRaf = 0;
    ta.addEventListener('input', () => {
      if (_magicResizeRaf) return;
      _magicResizeRaf = requestAnimationFrame(() => {
        _magicResizeRaf = 0;
        ta.style.height = 'auto';
        ta.style.height = Math.min(140, ta.scrollHeight) + 'px';
      });
    });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMagicHelpMessage(); }
    });
  }
}

async function sendMagicHelpMessage() {
  if (!_magicHelpState || _magicHelpState._loading) return;
  const ta = document.getElementById('magicHelpInput');
  if (!ta) return;
  const text = ta.value.trim();
  if (!text) return;
  const decision = (state.decisions || []).find(d => d.id === _magicHelpState.decisionId);
  if (!decision) return;
  if (!decision.helpChats) decision.helpChats = {};
  const stepId = _magicHelpState.stepId;
  if (!Array.isArray(decision.helpChats[stepId])) decision.helpChats[stepId] = [];

  decision.helpChats[stepId].push({ role: 'user', content: text, timestamp: new Date().toISOString() });
  ta.value = ''; ta.style.height = 'auto';
  saveState();
  _renderMagicHelpChat();
  // AI 응답 — _runMagicHelpAIResponse 재사용
  await _runMagicHelpAIResponse();
}

// 사용자 명시 2026-05-01 ultrathink: closeMagicHelpChat 의 confirm 모달 + 자동 archive 저장 / 토픽 추출 폐기.
// 단순 닫기만 — 명시 저장은 endMagicHelpChat 버튼 (이 대화 끝내기) 흐름에서.
function closeMagicHelpChat() {
  _magicHelpState = null;
  const inputBar = document.getElementById('magicHelpInputBar');
  if (inputBar) inputBar.classList.remove('active');
  if (typeof showScreen === 'function') showScreen('decision-detail');
}

// 사용자 명시 2026-05-08 ultrathink: 마법고동 임시 대화 삭제 — chatArchive 이송 X = case formulation / topic 추출 input 에 안 들어감.
// helpChat[stepId] 만 비움. 결정 자체는 그대로.
async function deleteMagicHelpChat() {
  if (!_magicHelpState) { closeMagicHelpChat(); return; }
  const decision = (state.decisions || []).find(d => d.id === _magicHelpState.decisionId);
  if (!decision) { closeMagicHelpChat(); return; }
  const stepId = _magicHelpState.stepId;
  const messages = (decision.helpChats && decision.helpChats[stepId]) || [];
  const realMessages = messages.filter(m => !m._starter);
  if (realMessages.length === 0) {
    closeMagicHelpChat();
    return;
  }
  const ok = (typeof confirmDelete === 'function')
    ? await confirmDelete('이 마법고동 임시 대화', '대화 내용도 같이 사라져.\n분석 추출에 안 들어가.')
    : confirm('이 마법고동 임시 대화 삭제할까? 대화 내용도 같이 사라져.');
  if (!ok) return;
  if (decision.helpChats) decision.helpChats[stepId] = [];
  saveState();
  showToast('🗑 삭제됨');
  closeMagicHelpChat();
}

// 사용자 명시 2026-05-01 ultrathink: 마법 helpChat '이 대화 끝내기' = 숙고 결론과 같은 메커니즘.
// chatArchive 이송 (_pendingExtract:true) → 4AM 일괄 처리 시 case+topic + archive 마법 타입 자동 push.
async function endMagicHelpChat() {
  if (!_magicHelpState) { closeMagicHelpChat(); return; }
  const decision = (state.decisions || []).find(d => d.id === _magicHelpState.decisionId);
  if (!decision) { closeMagicHelpChat(); return; }
  const stepId = _magicHelpState.stepId;
  const messages = (decision.helpChats && decision.helpChats[stepId]) || [];
  const realMessages = messages.filter(m => !m._starter && !m.typing && !m.error);
  if (realMessages.length < 2) {
    showToast('대화가 너무 짧아 마무리할 게 없어');
    return;
  }
  const yes = await showConfirmModal({
    title: '이 대화 마무리할까?',
    message: '원본은 7일 뒤 자동으로 사라져.',
    okLabel: '마무리 ✦',
    cancelLabel: '취소'
  });
  if (!yes) return;

  if (!Array.isArray(state.chatArchive)) state.chatArchive = [];
  const meta = (typeof DECISION_STEPS !== 'undefined' ? DECISION_STEPS : []).find(s => s.id === stepId);
  const stepTitle = meta ? meta.title : stepId;
  const firstTs = realMessages[0] && realMessages[0].timestamp;
  const dateKey = firstTs ? getDayKey(firstTs) : todayKey();

  // 사용자 명시 2026-05-08 ultrathink: 마무리 시 즉시 AI 3 필드 요약 (Sonnet, ~300 tokens) — 옛 단순 라벨 (`🌀 마법 (step): title`) 대체.
  // 사용자가 마무리 직후 결과 즉시 봄 (도서관 카드에 conclusion / new_realization / next_action 노출).
  let _stepSummary = null;
  if (_canAI()) {
    try {
      showToast('🌀 마법 마무리 정리 중...');
      const chatLog = realMessages.map(m => {
        const role = m.role === 'user' ? '나' : '소라';
        let content = (m.content || '').replace(/```json[\s\S]*?```/g, '').trim();
        content = content.replace(/\{[\s\S]*"(?:new_traits|new_values)[\s\S]*\}\s*$/g, '').trim();
        return `${role}: ${content}`;
      }).join('\n\n');
      // 사용자 명시 2026-05-11 ultrathink: prompt template backend 이전 — buildMagicSummary 가 합성.
      const _resp = await callAnthropic({
        _endpoint: 'magic_summary',
        _vars: { decisionTitle: decision.title || '', stepTitle, chatLog },
        model: 'claude-sonnet-4-6',
        max_tokens: 350,
        messages: [{ role: 'user', content: '' }]
      });
      if (_resp.ok) {
        const _data = await _resp.json();
        let _raw = (_data?.content?.[0]?.text || '').trim();
        _raw = _raw.replace(/```json/g, '').replace(/```/g, '').trim();
        const _m = _raw.match(/\{[\s\S]*\}/);
        if (_m) {
          try { _stepSummary = JSON.parse(_m[0]); } catch {}
        }
      }
    } catch (e) { console.warn('[magic 3-field summary]', e); }
  }

  state.chatArchive.unshift({
    id: 'arch_magic_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    date: dateKey,
    summary: (_stepSummary && _stepSummary.conclusion)
      ? String(_stepSummary.conclusion).slice(0, 200)
      : `🌀 마법 (${stepTitle}): ${(decision.title || '결정').slice(0, 24)}`,
    new_realization: (_stepSummary && _stepSummary.new_realization) ? String(_stepSummary.new_realization).slice(0, 100) : null,
    next_action:     (_stepSummary && _stepSummary.next_action)     ? String(_stepSummary.next_action).slice(0, 80)     : null,
    conclusion:      (_stepSummary && _stepSummary.conclusion)      ? String(_stepSummary.conclusion).slice(0, 200)     : null,
    messageCount: realMessages.length,
    messages: realMessages.slice(),
    generatedAt: new Date().toISOString(),
    source: 'magic_help',
    decisionId: decision.id,
    stepId,
    _pendingExtract: true
  });
  // 마법 helpChat 안 messages 비움 (이송 후)
  if (decision.helpChats) decision.helpChats[stepId] = [];
  if (typeof pruneOldChatArchive === 'function') pruneOldChatArchive();
  saveState();
  showToast('정리 됐어 ✦');
  closeMagicHelpChat();
}

// 사용자 요청 2026-04-29: 마법 helpChat assistant 메시지를 ✦ 깨달음(scrap)으로 archive에 저장 + caseFormulation feed-in.
async function saveMagicHelpMsgAsInsight(msgIdx) {
  if (!_magicHelpState) return;
  const decision = (state.decisions || []).find(d => d.id === _magicHelpState.decisionId);
  if (!decision) return;
  const stepId = _magicHelpState.stepId;
  const messages = (decision.helpChats && decision.helpChats[stepId]) || [];
  const msg = messages[msgIdx];
  if (!msg || msg.role !== 'assistant' || msg.savedAsInsight) return;

  // 직전 user 메시지 찾기
  let priorUserMsg = '';
  for (let i = msgIdx - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') { priorUserMsg = messages[i].content; break; }
  }

  if (!Array.isArray(state.archive)) state.archive = [];
  const meta = (typeof DECISION_STEPS !== 'undefined' ? DECISION_STEPS : []).find(s => s.id === stepId);
  const stepTitle = meta ? meta.title : stepId;
  const _dayKey = todayKey();
  const date = new Date(_dayKey + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

  // 사용자 명시 2026-05-01 ultrathink: haiku 정리 (4 ✦ 핸들러 일관 형식)
  const summary = await summarizeForArchive(msg.content, priorUserMsg);
  const headline = (summary && summary.headline) ? summary.headline : (decision.title || '결정').slice(0, 30);
  const body = (summary && summary.body) ? summary.body : (msg.content || '').slice(0, 200);

  state.archive.unshift({
    type: 'magic',
    headline,
    body,
    insight: msg.content,
    userMsg: priorUserMsg,
    assistantMsg: msg.content,
    date,
    source: `🌀 마법 (${stepTitle})`,
    savedAt: new Date().toISOString(),
    tags: ['마법', '결정'],
    decisionId: decision.id,
    stepId
  });
  msg.savedAsInsight = true;
  saveState();
  if (typeof renderArchive === 'function') renderArchive();
  showToast('✦ 깨달음에 저장됐어');
  _renderMagicHelpChat();
  // 임시 대화 → caseFormulation feed-in (background, fail silent)
  extractAndApplyInsightToModel(msg.content, priorUserMsg, 'magic_help').catch(() => {});
}

function openWeightStep(decision, step) {
  const screen = document.getElementById('screen-decision-detail');
  const saved = step.content ? safeParseJSON(step.content) : { reversibility: '', impact: '', timescale: '' };
  _weightSelections = { ...saved };

  screen.innerHTML = `
    <div class="screen-title">결정의 무게</div>
    <div class="screen-sub">크기를 정확히 알아야 어떻게 다룰지 결정돼.</div>

    <div class="input-group">
      <div class="input-label">↩️ 가역성</div>
      <div class="weight-options">
        <div class="weight-option ${saved.reversibility === '되돌릴수있음' ? 'selected' : ''}" onclick="selectWeight(this, 'reversibility', '되돌릴수있음')">
          <div class="weight-option-title">되돌릴 수 있음</div>
          <div class="weight-option-desc">실수해도 회복 가능</div>
        </div>
        <div class="weight-option ${saved.reversibility === '거의불가' ? 'selected' : ''}" onclick="selectWeight(this, 'reversibility', '거의불가')">
          <div class="weight-option-title">거의 불가</div>
          <div class="weight-option-desc">한 번 가면 끝</div>
        </div>
      </div>
    </div>

    <div class="input-group">
      <div class="input-label">🌊 영향 범위</div>
      <div class="weight-options">
        <div class="weight-option ${saved.impact === '나만' ? 'selected' : ''}" onclick="selectWeight(this, 'impact', '나만')">
          <div class="weight-option-title">나만</div>
          <div class="weight-option-desc">개인적</div>
        </div>
        <div class="weight-option ${saved.impact === '주변사람' ? 'selected' : ''}" onclick="selectWeight(this, 'impact', '주변사람')">
          <div class="weight-option-title">주변 사람</div>
          <div class="weight-option-desc">가족·관계</div>
        </div>
        <div class="weight-option ${saved.impact === '커리어' ? 'selected' : ''}" onclick="selectWeight(this, 'impact', '커리어')">
          <div class="weight-option-title">커리어</div>
          <div class="weight-option-desc">직업·진로</div>
        </div>
        <div class="weight-option ${saved.impact === '인생전반' ? 'selected' : ''}" onclick="selectWeight(this, 'impact', '인생전반')">
          <div class="weight-option-title">인생 전반</div>
          <div class="weight-option-desc">광범위</div>
        </div>
      </div>
    </div>

    <div class="input-group">
      <div class="input-label">⏳ 영향 지속 시간</div>
      <div class="weight-options">
        <div class="weight-option ${saved.timescale === '몇주' ? 'selected' : ''}" onclick="selectWeight(this, 'timescale', '몇주')">
          <div class="weight-option-title">몇 주</div>
        </div>
        <div class="weight-option ${saved.timescale === '몇달' ? 'selected' : ''}" onclick="selectWeight(this, 'timescale', '몇달')">
          <div class="weight-option-title">몇 달</div>
        </div>
        <div class="weight-option ${saved.timescale === '몇년' ? 'selected' : ''}" onclick="selectWeight(this, 'timescale', '몇년')">
          <div class="weight-option-title">몇 년</div>
        </div>
        <div class="weight-option ${saved.timescale === '평생' ? 'selected' : ''}" onclick="selectWeight(this, 'timescale', '평생')">
          <div class="weight-option-title">평생</div>
        </div>
      </div>
    </div>

    <button class="btn-primary decision" onclick="saveWeightStep('${decision.id}')">완료</button>
    <button class="btn-secondary" onclick="openDecision('${decision.id}')">돌아가기</button>
  `;
}

function selectWeight(btn, key, value) {
  const parent = btn.closest('.weight-options');
  parent.querySelectorAll('.weight-option').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  _weightSelections[key] = value;
}

function saveWeightStep(decisionId) {
  const decision = state.decisions.find(d => d.id === decisionId);
  const step = decision.steps.find(s => s.id === 'weight');
  if (!_weightSelections.reversibility || !_weightSelections.impact || !_weightSelections.timescale) {
    alert('세 항목 모두 선택해주세요.');
    return;
  }
  step.content = JSON.stringify(_weightSelections);
  step.completed = true;
  step.completedAt = new Date().toISOString();
  _weightSelections = {};
  saveState();
  openDecision(decisionId);
  showToast('저장됐어');
}

function openStateStep(decision, step) {
  const screen = document.getElementById('screen-decision-detail');
  const saved = step.content ? safeParseJSON(step.content) : { sleep: '', emotion: '', pressure: '' };
  _weightSelections = { ...saved };

  screen.innerHTML = `
    <div class="screen-title">지금 내 상태</div>
    <div class="screen-sub">"뜨거운 상태"에서 결정하면 후회한다 (Loewenstein, hot-cold empathy gap, 2005).</div>

    <div class="input-group">
      <div class="input-label">😴 최근 수면</div>
      <div class="weight-options">
        <div class="weight-option ${saved.sleep === '충분' ? 'selected' : ''}" onclick="selectWeight(this, 'sleep', '충분')">
          <div class="weight-option-title">충분</div>
        </div>
        <div class="weight-option ${saved.sleep === '부족' ? 'selected' : ''}" onclick="selectWeight(this, 'sleep', '부족')">
          <div class="weight-option-title">부족</div>
        </div>
      </div>
    </div>

    <div class="input-group">
      <div class="input-label">🌡 지금 감정 강도</div>
      <div class="weight-options">
        <div class="weight-option ${saved.emotion === '차분' ? 'selected' : ''}" onclick="selectWeight(this, 'emotion', '차분')">
          <div class="weight-option-title">차분함</div>
        </div>
        <div class="weight-option ${saved.emotion === '약간격앙' ? 'selected' : ''}" onclick="selectWeight(this, 'emotion', '약간격앙')">
          <div class="weight-option-title">약간 격앙</div>
        </div>
        <div class="weight-option ${saved.emotion === '많이격앙' ? 'selected' : ''}" onclick="selectWeight(this, 'emotion', '많이격앙')">
          <div class="weight-option-title">많이 격앙</div>
        </div>
        <div class="weight-option ${saved.emotion === '폭발직전' ? 'selected' : ''}" onclick="selectWeight(this, 'emotion', '폭발직전')">
          <div class="weight-option-title">폭발 직전</div>
        </div>
      </div>
    </div>

    <div class="input-group">
      <div class="input-label">⚡ 압박감</div>
      <div class="weight-options">
        <div class="weight-option ${saved.pressure === '여유' ? 'selected' : ''}" onclick="selectWeight(this, 'pressure', '여유')">
          <div class="weight-option-title">여유 있음</div>
        </div>
        <div class="weight-option ${saved.pressure === '약간' ? 'selected' : ''}" onclick="selectWeight(this, 'pressure', '약간')">
          <div class="weight-option-title">약간 압박</div>
        </div>
        <div class="weight-option ${saved.pressure === '강함' ? 'selected' : ''}" onclick="selectWeight(this, 'pressure', '강함')">
          <div class="weight-option-title">강한 압박</div>
        </div>
        <div class="weight-option ${saved.pressure === '극심' ? 'selected' : ''}" onclick="selectWeight(this, 'pressure', '극심')">
          <div class="weight-option-title">극심</div>
        </div>
      </div>
    </div>

    <button class="btn-primary decision" onclick="saveStateStep('${decision.id}')">완료</button>
    <button class="btn-secondary" onclick="openDecision('${decision.id}')">돌아가기</button>
  `;
}

function saveStateStep(decisionId) {
  const decision = state.decisions.find(d => d.id === decisionId);
  const step = decision.steps.find(s => s.id === 'state');
  if (!_weightSelections.sleep || !_weightSelections.emotion || !_weightSelections.pressure) {
    alert('세 항목 모두 선택해주세요.');
    return;
  }
  step.content = JSON.stringify(_weightSelections);
  step.completed = true;
  step.completedAt = new Date().toISOString();

  const isHot = _weightSelections.sleep === '부족' || _weightSelections.emotion === '많이격앙' || _weightSelections.emotion === '폭발직전' || _weightSelections.pressure === '극심';
  _weightSelections = {};
  saveState();

  if (isHot) {
    alert('⚠️ 뜨거운 상태야.\n\nLoewenstein의 hot-cold empathy gap 연구에 따르면, 이런 상태에서 큰 결정은 후회로 이어질 가능성이 매우 높아.\n\n지금 다음 단계로 넘어가지 말고, 자고, 먹고, 진정시킨 후에 다시 와. 14일 숙성이 더 중요해졌어.');
  }
  openDecision(decisionId);
}

function openFinalDecisionStep(decision, step) {
  const screen = document.getElementById('screen-decision-detail');
  const saved = step.content ? safeParseJSON(step.content) : { decision: '', confidence: 5, predictions: { '3months': '', '6months': '', '12months': '' } };

  screen.innerHTML = `
    <div class="screen-title">최종 결정 + 예측</div>
    <div class="screen-sub">결정과 함께 예측을 기록해.<br>미래의 네가 정확도를 확인할 거야 (Wilson & Gilbert, affective forecasting).</div>

    <div class="input-group">
      <div class="input-label"><img src="/character/godong-wizard.svg" alt="" class="godong-icon godong-mood-wizard" decoding="async"> 최종 결정</div>
      <textarea id="finalDecision" rows="3" placeholder="결정을 한 문장으로...">${escapeHtml(saved.decision || '')}</textarea>
    </div>

    <div class="input-group">
      <div class="input-label">💯 확신도 (1-10)</div>
      <input type="number" id="confidence" min="1" max="10" value="${saved.confidence || 5}">
    </div>

    <div class="input-group">
      <div class="input-label">🔮 3개월 후 예측</div>
      <textarea id="pred3" rows="2" placeholder="이 결정 후 3개월 뒤, 나는 어떻게 느낄 것 같아?">${escapeHtml(saved.predictions?.['3months'] || '')}</textarea>
    </div>

    <div class="input-group">
      <div class="input-label">🔮 6개월 후 예측</div>
      <textarea id="pred6" rows="2" placeholder="6개월 후 상황은?">${escapeHtml(saved.predictions?.['6months'] || '')}</textarea>
    </div>

    <div class="input-group">
      <div class="input-label">🔮 12개월 후 예측</div>
      <textarea id="pred12" rows="2" placeholder="1년 후 나는 어디에 있을까?">${escapeHtml(saved.predictions?.['12months'] || '')}</textarea>
    </div>

    <button class="btn-primary decision" onclick="saveFinalDecision('${decision.id}')">결정 확정</button>
    <button class="btn-secondary" onclick="openDecision('${decision.id}')">돌아가기</button>
  `;
}

async function saveFinalDecision(decisionId) {
  const decision = state.decisions.find(d => d.id === decisionId);
  const step = decision.steps.find(s => s.id === 'decision');
  const finalDecision = document.getElementById('finalDecision').value.trim();
  const confidence = parseInt(document.getElementById('confidence').value) || 5;
  const predictions = {
    '3months': document.getElementById('pred3').value.trim(),
    '6months': document.getElementById('pred6').value.trim(),
    '12months': document.getElementById('pred12').value.trim()
  };

  if (!finalDecision) { alert('최종 결정을 적어주세요.'); return; }

  // 사용자 명시 2026-05-01 (agent audit): 14일 숙성 핵심 가치 보호.
  // saveTextStep / editStep "그래도 지금 작성" 우회 가능했던 자리. step 10 만 hardcap (decision = 14일).
  const daysSince = Math.floor((Date.now() - new Date(decision.createdAt).getTime()) / 86400000);
  if (daysSince < 14) {
    const yes = await showConfirmModal({
      title: `⚠️ 14일 숙성 권장`,
      message: `결정을 시작한 지 ${daysSince}일째야.\n\n마법고동은 14일 동안 시간을 두고 보는 도구야. 지금 결정하면 hot-cold empathy gap (감정 상태 변화) 후회로 이어지기 쉬워.\n\n그래도 지금 결정할래?`,
      okLabel: '그래도 결정',
      cancelLabel: '14일 기다릴게'
    });
    if (!yes) return;
  }

  const data = { decision: finalDecision, confidence, predictions };
  step.content = JSON.stringify(data);
  step.completed = true;
  step.completedAt = new Date().toISOString();

  decision.status = 'decided';
  decision.finalDecision = finalDecision;
  decision.confidence = confidence;
  decision.predictions = predictions;
  decision.decidedAt = new Date().toISOString();

  saveState();
  showCelebration('🐚', '결정 완료', '✨');
  setTimeout(() => { openDecision(decisionId); renderActiveDecisionsHome(); }, 1800);
}

async function abandonDecision(decisionId) {
  const yes = await showConfirmModal({
    title: '진행 중단할까?',
    message: '기록은 남아. "지난 결정"으로 옮겨져.',
    okLabel: '중단',
    cancelLabel: '계속 진행'
  });
  if (!yes) return;
  const decision = state.decisions.find(d => d.id === decisionId);
  decision.status = 'abandoned';
  decision.abandonedAt = new Date().toISOString();
  saveState();
  showScreen('decisions');
  showToast('결정 중단. 언제든 다시 시작할 수 있어.');
}

async function deleteDecisionForever(decisionId) {
  const decision = state.decisions.find(d => d.id === decisionId);
  if (!decision) return;
  const yes = await showConfirmModal({
    title: '완전히 삭제할까?',
    message: `"${decision.title}"\n\n돌이킬 수 없어. 정말 지울까?`,
    okLabel: '🗑 완전 삭제', cancelLabel: '아니'
  });
  if (!yes) return;
  state.decisions = state.decisions.filter(d => d.id !== decisionId);
  saveState();
  showScreen('decisions');
  showToast('완전히 삭제됨.');
}

function resumeDecision(decisionId) {
  const decision = state.decisions.find(d => d.id === decisionId);
  if (!decision) return;
  decision.status = 'in_progress';
  decision.abandonedAt = null;
  // Reset startedAt to today so the cooling-off cycle restarts
  // (actually keep original — user can pick up where they left off)
  saveState();
  showToast('결정이 다시 열렸어. 천천히 다시 생각해보자 🐚');
  openDecision(decisionId);
}

function safeParseJSON(str) {
  try { return JSON.parse(str); } catch { return {}; }
}

