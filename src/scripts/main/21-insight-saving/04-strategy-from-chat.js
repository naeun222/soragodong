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
      // 사용자 명시 2026-05-11 ultrathink: prompt template backend 이전 — buildStrategyCard 가 합성.
      const resp = await callAnthropic({
        _endpoint: 'decision_step',
        _userContentType: 'strategy_card',
        _vars: { msgContent: msg.content || '' },
        // 사용자 요청 2026-04-30: 사실상 대화 내용 정리 → sonnet 4.6 적합 (opus 과함).
        // V4 (사용자 명시 2026-05-14): KEYWORDS 줄 추가분 — max_tokens 500 → 700.
        model: 'claude-sonnet-4-6',
        max_tokens: 700,
        messages: [{ role: 'user', content: '' }]
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
      // V4 (사용자 명시 2026-05-14): KEYWORDS 5-7개 한국어 명사/짧은 동사구. resurface 매칭 trigger 용.
      const grabList = (label) => {
        const re = new RegExp(`^${label}:\\s*(.+)$`, 'mi');
        const m = raw.match(re);
        if (!m) return [];
        return m[1].split(/[,，]/).map(s => s.trim().replace(/^["']|["']$/g, '')).filter(s => s.length >= 2).slice(0, 7);
      };
      title = grab('TITLE').slice(0, 30);
      problemContext = grab('PROBLEM').slice(0, 200);
      psychConcept = grab('CONCEPT').slice(0, 200);
      actionStrategy = grab('ACTION').slice(0, 240);
      var _kws = grabList('KEYWORDS');
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
    evolutionChats: [],
    // V4 (사용자 명시 2026-05-14 ultrathink): resurface 시스템 필드 5종.
    keywords: (typeof _kws !== 'undefined' && Array.isArray(_kws) && _kws.length >= 3) ? _kws : null,
    embedding: null,
    lastResurfacedAt: null,
    resurfaceDismissedAt: null,
    resurfaceCount: 0
  });
  msg.savedStrategy = true;
  msg.strategyId = stratId;  // 사용자 요청 2026-04-28: msg에 strategyId 적용하기 → acceptProposal에서 mission 만들 때 자동 link
  saveState();
  // V4 (사용자 명시 2026-05-14): fire-and-forget embedding — useRag ON / Plus·Premium 만 실제 호출.
  setTimeout(() => {
    if (typeof _strategyEmbed === 'function') {
      _strategyEmbed(state.topicCards[state.topicCards.length - 1]).catch(()=>{});
    }
  }, 0);
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

