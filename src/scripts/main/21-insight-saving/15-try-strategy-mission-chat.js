async function callTryStrategy(strategyId) {
  const card = getStrategyCard(strategyId);
  if (!card) return;

  // 사용자 요청 2026-04-30: 같은 strategy로 여러 미션 OK (내용 다르면).
  // strategyId 기반 blanket 차단 제거. 동일 title 중복은 createMission 직전에 체크 (createMission 안에).

  if (card.embodimentStatus === 'embodied') {
    showToast('이미 체화된 가닥이야 ✨');
    return;
  }

  // V4 (v8 묶음 19-I): just-evolved 클래스 청소 — 사용자가 ✦ 해볼게 클릭 = 진화 안내 끝
  if (state._justEvolvedCardId === strategyId) {
    state._justEvolvedCardId = null;
    saveState();
    if (typeof renderArchive === 'function') renderArchive();
  }

  await openStrategyMissionChat(strategyId, null);
}

// 임시 대화 흐름 — 양생방 ✦ 해볼게 / 돌연변이 ✦ 이 차원으로 해볼게 둘 다 사용
async function openStrategyMissionChat(strategyId, mutationOpt) {
  const card = getStrategyCard(strategyId);
  if (!card) return;

  const isMutation = !!mutationOpt;
  const layerName = isMutation ? (_LAYER_NAME[mutationOpt.layer] || mutationOpt.layer) : '';
  const introMsg = isMutation
    ? `"${card.title}" → ${layerName} 차원 진화 시작.\n어떤 상황이야? 오늘 시도하려는 거 짧게 알려줘.\n그 맥락에 맞춰 '오늘의 제안' 만들어줄게.`
    : `"${card.title}" — 다시 시도해보자!\n어떤 상황이야? 오늘 하려는 거 짧게 알려줘.\n그 맥락에 맞춰 '오늘의 제안' 만들어줄게.`;

  // 사용자 요청 2026-04-28: 튜토리얼/테스터 모드 시 예시 자동 입력
  const _isAuto = !!(window._onbTutorialMode || (state.preferences && state.preferences.testerMode));
  const situation = await showInputModal({
    title: '🌿 어떤 상황이야?',
    message: introMsg,
    placeholder: '예: 내일 발표인데 자료 준비가 안 돼서 카페에서 30분 집중 시도',
    multiline: true,
    okLabel: '제안 받기 →',
    defaultValue: _isAuto ? '카페에서 30분 집중' : ''
  });
  if (!situation) return;

  showToast('🐚 오늘의 제안 생성 중...');
  let proposal = '';
  // 사용자 보고 2026-04-30: 개인 API 키 비운 상태에서도 백엔드 프록시로 동작하게.
  // fetch interceptor가 state.apiKey 비어있으면 자동으로 /api/chat 라우팅. 게이트만 풀면 됨.
  if (_canAI()) {
    try {
      const ctx = isMutation
        ? `[전략] ${card.title}\n[새 차원] ${layerName}: ${mutationOpt.action}\n[사용자 상황] ${situation}`
        : `[전략] ${card.title}\n[전략 행동] ${card.actionStrategy || ''}\n[심리학] ${card.psychConcept || ''}\n[사용자 상황] ${situation}`;
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: _anthropicHeaders(),
        body: JSON.stringify({
          _endpoint: 'decision_step',
          model: 'claude-sonnet-4-6', max_tokens: 120,
          messages: [{
            role: 'user',
            content: `${ctx}\n\n[네 일]\n위 상황·전략에 맞춰 '오늘의 제안' 1개 — 오늘 바로 할 수 있는 구체 행동.\n한 줄 (max 40자). 동사로 시작. 환경 셋업 우선. 의지 부담 ↓.\n\n[출력]\n제안만 한 줄. 다른 거 X. 마크다운 X.`
          }]
        })
      });
      const data = await resp.json();
      proposal = (data.content?.[0]?.text || '').trim().replace(/^["「'`]|["」'`]$/g, '').split('\n')[0].trim();
    } catch (e) { console.warn('proposal AI:', e); }
  }
  if (!proposal) {
    proposal = isMutation ? mutationOpt.action : (card.actionStrategy || card.title);
  }

  const yes = await showConfirmModal({
    title: '🌿 오늘의 제안',
    message: `"${proposal}"\n\n이걸로 '소라의 부름' 등록할까?`,
    okLabel: '✦ 부름으로 등록',
    cancelLabel: '취소'
  });
  if (!yes) return;

  if (isMutation) {
    mutateToNewGeneration(strategyId, mutationOpt.layer, mutationOpt.action);
    const refreshed = getStrategyCard(strategyId);
    const newGenIdx = (refreshed?.generations?.length || 1) - 1;
    createMission(proposal, `🧬 ${card.title} — ${layerName} 차원`, {
      strategyId,
      generationIdx: newGenIdx,
      linkedStrategy: card.title,
      // V4 (v8 묶음 2): 사용자가 직접 입력한 상황 → 결과 체크 모달 📌 원래 문제 박스
      situation: situation,
      _situationSource: 'user_input'
    });
  } else {
    const newGenIdx = (card.generations?.length || 1) - 1;
    createMission(proposal, card.actionStrategy || '', {
      strategyId,
      generationIdx: newGenIdx,
      linkedStrategy: card.title,
      // V4 (v8 묶음 2): 사용자가 직접 입력한 상황 → 결과 체크 모달 📌 원래 문제 박스
      situation: situation,
      _situationSource: 'user_input'
    });
  }

  saveState({ force: true });
  showCelebration('🐚', '새 부름 등록!', '✨');
  if (typeof renderTodayMission === 'function') renderTodayMission();
  if (typeof renderArchive === 'function') renderArchive();
  if (typeof showScreen === 'function') showScreen('home');
}

