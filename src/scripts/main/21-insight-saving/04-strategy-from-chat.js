// V3.13.x: askDeeper 응답을 전략 카드로 저장 (state.topicCards에 category='strategy')
// 4-필드 구조: title / problemContext / psychConcept / actionStrategy
async function saveMsgAsStrategy(idx) {
  const msg = state.chatMessages[idx];
  if (!msg || msg.savedStrategy) return;
  // V4 (사용자 명시 2026-05-06 ultrathink — 추가): 첫 🧬 전략으로 → 옛 Core 2 튜토리얼 (V8 UI) 1회 fire.
  // 마킹 즉시 — acceptProposal 가 자동 호출 한 saveMsgAsStrategy 는 이미 acceptProposal 가 마킹.
  const _firstC2Tutorial = (typeof shouldRunFirstStrategyTutorial === 'function') && shouldRunFirstStrategyTutorial();
  if (_firstC2Tutorial) {
    state.tutorialShown = state.tutorialShown || {};
    state.tutorialShown.core2 = true;
    try { saveState(); } catch {}
  }
  let title = '', problemContext = '', psychConcept = '', actionStrategy = '';
  if (!_canAI()) {
    title = msg.content.slice(0, 30);
    actionStrategy = msg.content.slice(30, 200);
  } else {
    try {
      const resp = await callAnthropic({
        _endpoint: 'decision_step',
        // 사용자 요청 2026-04-30: 사실상 대화 내용 정리 → sonnet 4.6 적합 (opus 과함).
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [{ role: 'user', content: `아래 4단 분석/전략 응답에서 "전략 카드"로 저장할 핵심을 뽑아줘.

[출력 형식 — 정확히 4줄, 각 줄은 라벨로 시작]
TITLE: <제목, 5-14자, 짧고 임팩트. 명사형 또는 짧은 명제>
PROBLEM: <문제 상황, 50-90자, "어떤 순간·패턴에 적용?">
CONCEPT: <심리학 개념 이름 + 1줄 설명, 30-80자>
ACTION: <전략적 행동, 50-120자, 구체적 무엇을 어떻게>

[좋은 예]
TITLE: 마감 직전 폭발력 신뢰하기
PROBLEM: 마감 24h 이상 남았는데 시작 못 했을 때 자책감으로 더 미루는 패턴.
CONCEPT: ADHD time blindness — 마감 임박해야 도파민이 충분해져 시작 가능.
ACTION: 24h 전엔 시작 못 했다고 자책 X. 마감 24h 전에 알람 1개만 설정. 그 알람을 trigger로 펼치기.

TITLE: 거절은 짧게 그날 안에
PROBLEM: 부탁받고 미루다 며칠 끌면서 부채감 커지는 패턴.
CONCEPT: 미결 부담 누적 (Zeigarnik effect) — 결정 안 된 것이 인지 자원 잡아먹음.
ACTION: 거절할 거면 "이번엔 어려워" 한 줄로 그날 안에 답하기. 이유 길게 설명 X.

[금지]
- "나는 ~다" 일반 서술
- 마크다운 (**, ##)
- JSON, 코드블록, 따옴표
- 추상적 다짐 ("열심히 하자")
- 4줄 외 다른 줄

[원본 응답]
${(msg.content || '').slice(0, 1500)}

정확히 TITLE/PROBLEM/CONCEPT/ACTION 4줄만 출력.` }]
      });
      const data = await resp.json();
      let raw = data.content[0].text.trim();
      raw = raw.replace(/^```\w*\s*/, '').replace(/\s*```\s*$/, '').trim();
      raw = raw.replace(/\*\*/g, '').replace(/^#+\s*/gm, '');
      const grab = (label) => {
        const re = new RegExp(`^${label}:\\s*(.+)$`, 'mi');
        const m = raw.match(re);
        return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
      };
      title = grab('TITLE').slice(0, 30);
      problemContext = grab('PROBLEM').slice(0, 200);
      psychConcept = grab('CONCEPT').slice(0, 200);
      actionStrategy = grab('ACTION').slice(0, 240);
    } catch (e) {
      title = msg.content.slice(0, 30);
      actionStrategy = msg.content.slice(30, 200);
    }
  }
  if (!title) title = '전략';
  const now = new Date().toISOString();
  // backward-compat summary 결합 (legacy 코드가 summary 참조)
  const summary = [problemContext, psychConcept, actionStrategy].filter(Boolean).join(' / ');
  state.topicCards = state.topicCards || [];
  const stratId = 'strat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  state.topicCards.push({
    id: stratId,
    category: 'strategy',
    title,
    summary,
    problemContext,
    psychConcept,
    actionStrategy,
    chapterStartedAt: now,
    chapterEndedAt: now,
    createdAt: now,
    messageCount: 1,
    source: 'deeper',
    // V4: 체화 시스템
    generations: [{
      gen: 1,
      layer: 'L2',
      action: actionStrategy || title,
      missions: [],
      shells: [],
      attempts: [],
      status: 'working'
    }],
    embodimentStatus: 'seedling',
    embodimentPath: null,
    evolutionChats: []
  });
  msg.savedStrategy = true;
  msg.strategyId = stratId;  // 사용자 요청 2026-04-28: msg에 strategyId 적용하기 → acceptProposal에서 mission 만들 때 자동 link
  saveState();
  renderChat();
  // V4 (v8 묶음 13): Core 2 튜토리얼 시점 — 카드 시각화 모달 자동 (사용자가 카드 미리보기)
  if (window._onbTutorialMode && _activeCoreId === 'core2' && typeof _showStrategyCardModal === 'function') {
    const justSaved = state.topicCards[state.topicCards.length - 1];
    setTimeout(() => _showStrategyCardModal(justSaved), 200);
  } else {
    showToast('전략 카드로 저장됐어 🧬');
  }

  // V4 (사용자 명시 2026-05-06 ultrathink — 추가): 첫 🧬 전략으로 클릭 → V8 코치마크 시퀀스.
  // runFirstStrategyTutorialV8 가 카드 미리보기 + ✦ 해볼게 안내 + 홈 + 미션 + 마무리 처리.
  if (_firstC2Tutorial && typeof runFirstStrategyTutorialV8 === 'function') {
    setTimeout(() => { runFirstStrategyTutorialV8('strategy', idx).catch(e => console.warn('[c2 first]', e)); }, 700);
  }
}

