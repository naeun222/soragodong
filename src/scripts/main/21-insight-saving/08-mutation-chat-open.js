// V4-fix v2: 돌연변이 임시 대화창 (V4 비전 6.3 + anchor 27/29)
// 현재 진행 중인 mutation chat state (overlay 단일 instance)
let _mutationChatState = null;

async function openMutationChat(strategyId, missionTitle, opts) {
  opts = opts || {};
  const firstGen = !!opts.firstGen;
  // first-gen 모드: getStrategyCard 검색이 category='strategy' 여도 통과하도록 marker pre-set.
  // (아래 본 _mutationChatState 할당 전에 lookup 호환)
  if (firstGen) {
    _mutationChatState = { firstGenTopicId: strategyId };
  }
  const card = getStrategyCard(strategyId);
  if (!card) { _mutationChatState = null; return; }
  const prevGen = getCurrentGeneration(card);
  const prevLayer = prevGen?.layer || 'L2';
  // 사용자 요청 2026-04-29: 자동 생성 X. 사용자가 대화 후 [🌱 가지 만들기] 버튼 누를 때 생성.
  if (!Array.isArray(card.evolutionChats)) card.evolutionChats = [];
  const inceptionMessage = firstGen
    ? `🌱 "${card.title}" — 이 주제를 *전략 카드*로 결정화해보자.\n\n어떤 상황에서 이 패턴/고민이 자주 나타나? 어떤 게 가장 어렵게 느껴져?\n\n충분히 풀고 [🌱 첫 가지 만들기] 누르면 5 가지 (인지/행동/환경/사회/메타) 제안할게.`
    : `🌿 "${card.title}" — 이 전략은 잘 안 맞았군.\n🧬 DNA가 진화할 준비 됐어. ✨\n\n어떤 점이 어려웠는지 같이 풀어보자. 충분히 풀고 [🌱 가지 만들기] 누르면 새 가지 4개 제안할게.`;
  _mutationChatState = {
    strategyId,
    missionTitle,
    prevLayer,
    firstGen,
    firstGenTopicId: firstGen ? strategyId : null,
    selectedRef: null,  // { msgIdx, optIdx } 또는 null
    confirmStep: false,
    messages: [{ role: 'assistant', content: inceptionMessage }],
    loading: false,
    chatRecord: {
      gen: (card.generations?.length || 0),
      triggerMission: missionTitle,
      triggerAt: new Date().toISOString(),
      options: [],
      selectedLayer: null,
      selectedAction: null,
      messages: [],
      firstGen
    }
  };
  _renderMutationChat();
}

// 사용자 요청 2026-04-29: 대화 흐름 반영해 가지 생성 — 인라인 메시지로 적용됨. 같은 차원 refine OK.
// 사용자 명시 2026-05-01: firstGen 모드 — topic → strategy 첫 결정화. 5 옵션 (L1-L5 각 1개) + prompt 분기.
async function _generateMutationOptions(strategyId, missionTitle, opts) {
  if (!_mutationChatState) return;
  const card = getStrategyCard(strategyId);
  if (!card) return;
  const firstGen = !!_mutationChatState.firstGen;
  const allowSameLayer = !!(opts && opts.allowSameLayer);
  const prevGen = getCurrentGeneration(card);
  const prevAction = prevGen?.action || card.actionStrategy || card.summary || '';
  const prevLayer = prevGen?.layer || 'L2';

  // 가지 만드는 중 — 임시 placeholder 메시지
  _mutationChatState.loading = true;
  _mutationChatState.messages.push({ role: 'assistant', content: '가지 만들고 있어... ✦', _placeholder: true });
  _renderMutationChat();

  // 사용자 보고 2026-04-29: 'isRegen' 변수 제거됐는데 reference 남아있던 ReferenceError fix.
  // 항상 임시 대화 전체를 컨텍스트로 (인사 메시지만 있어도 무해, 대화 풀린 상태면 사용자 컨텍스트 반영).
  const recentMsgs = _mutationChatState.messages
    .filter(m => m.role !== 'options' && !m._placeholder)
    .map(m => `${m.role === 'user' ? '나' : 'AI'}: ${m.content}`)
    .join('\n');
  const sameLayerNote = firstGen
    ? `\n[5 가지 모두 — L1, L2, L3, L4, L5 각 1개. 제외 X.]`
    : (allowSameLayer
      ? `\n[같은 가지 허용] 이전이 ${prevLayer} 여도 OK — 같은 가지에서 refine된 옵션 (이유 분석 + 보완) 도 1-2개 포함 가능. 단 똑같이 X — 대화에서 발견한 이유 반영해서 보완.`
      : `\n이전이 ${prevLayer} 였으니 그 외 4 가지 각 1개.`);
  const convoNote = recentMsgs
    ? `\n\n[지금까지 대화 — 이 사용자 컨텍스트 우선 반영]\n${recentMsgs}\n\n위 대화에서 사용자가 짚은 진짜 어려움을 옵션에 녹여. generic 답 X.`
    : '';
  const headerLine = firstGen
    ? `[주제 (토픽 → 전략 첫 결정화)] "${card.title}"\n[summary] ${card.summary || '(없음)'}\n[원래 카테고리] ${card.sourceTopicCategory || card.category || '?'}`
    : `[전략 카드] "${card.title}"\n[심리학 개념] ${card.psychConcept || '(없음)'}\n[문제 상황] ${card.problemContext || '(없음)'}\n[이전 가지 ${prevLayer} ${_LAYER_NAME[prevLayer]||''}] "${prevAction}"\n[안 통한 미션] "${missionTitle}"`;

  // AI 호출 (있으면) — fallback 즉시 사용 (UI 멈추지 않게)
  let aiOptions = [];
  if (_canAI()) {
    try {
      const resp = await callAnthropic({
          _endpoint: 'mutation',
          model: 'claude-opus-4-7',
          max_tokens: 900,
          messages: [{
            role: 'user',
            content: `${firstGen ? '토픽 → 전략 결정화: 첫 가지 5 옵션 (L1-L5 각 1개)' : '돌연변이 진화 4 옵션 생성'} (사용자 요청 2026-04-29: 대화 흐름 반영, 같은 가지 refine도 허용).

${headerLine}

[5 가지 — 의지 부담 ↓일수록 관찰 친화]
- L1 인지: 생각의 틀 재구조화 (CBT, 인지 재해석) — 의지 100%
- L2 행동: 알람·체크리스트·시간 박스 — 의지 90%
- L3 환경: 물리적 환경/도구 자체 변경, 자동 trigger — 의지 30%
- L4 사회: 친구·책임 파트너·공개 약속 — 의지 20%
- L5 메타: 가치 재검토, 마법의 소라고동, 큰 그림 보기 — 의지 10%
${sameLayerNote}${convoNote}

[옵션 작성 가이드 — 매우 중요]
1. 추상 X 구체 ○: "환경 바꿔" X, "오늘 저녁 7시까지 폰을 거실 책상 충전기에 꽂아두기" ○
2. 첫 행동 명확: 동사로 시작 + 5분 안에 시작 가능
3. 네 사용자 ${card.title} 패턴에 맞게 — 일반론 X
4. 왜 도움되는지 1구절 포함 (예: "도파민 trigger 외부화", "결정 부담 ↓")
5. 관찰 친화: 의지 부담 ↓ 가지 (L3/L4) 우선, L1·L5는 신중하게
6. 한 줄 70-100자

[출력 JSON만 — 마크다운 X 따옴표 안 escape]
{ "options": [{"layer":"L3","action":"오늘 저녁 7시까지 폰을 거실 충전기에 꽂아두기 — 손에 안 닿으면 자동 차단 (도파민 trigger 외부화)"},...] }

[절대 금지]
- "실패" / "안 됨" / "왜 못 했지" 단어
- 추상 다짐 ("열심히", "노력")
- 마크다운 / 줄바꿈 / 따옴표 escape`
          }]
      });
      const data = await resp.json();
      let raw = data.content[0].text.trim();
      raw = raw.replace(/^```\w*\s*/, '').replace(/\s*```\s*$/, '').trim();
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        if (Array.isArray(parsed.options)) {
          // firstGen: 모두 허용 (5 옵션) / 같은 가지 허용 시 prevLayer filter X / 기본 4 옵션 (prevLayer 제외)
          aiOptions = parsed.options.filter(o =>
            o.layer && o.action && (firstGen || allowSameLayer || o.layer !== prevLayer)
          );
        }
      }
    } catch (e) { console.warn('mutation AI failed:', e); }
  }
  if (!aiOptions.length) {
    // 사용자 요청 2026-04-28: 더 디테일·실용 — 구체 행동 + 왜 도움되는지 명시 (의료법 회피 wording).
    const allFallback = [
      { layer: 'L3', action: '오늘 저녁 7시까지 폰을 다른 방 충전기에 꽂아두기 — 손에 안 닿으면 자동 차단 (의지 X 환경 차원에서 trigger 외부화)' },
      { layer: 'L4', action: '믿을 친구 1명한테 카톡 한 줄: "나 오늘부터 X 시도 중. 매일 결과 한 줄 공유" — 책임 파트너 효과 + 외부 시선 = 도파민' },
      { layer: 'L2', action: '알람 1개 (실제 가능한 시간) + 5분만 시작하기 룰 — 5분 후 그만둬도 OK. 진입 마찰 ↓' },
      { layer: 'L1', action: '이 행동이 안 됐을 때 머릿속에 뜨는 생각을 적어보기 ("난 못해" 같은 거) → 다른 해석 시도 ("오늘은 못 했을 뿐, 내일 다시")' },
      { layer: 'L5', action: '마법의 소라고동에 큰 질문 적용하기: "이 행동이 정말 지금 나에게 필요한가?" 일주일 안고 살아보기 — 가치 재검토' }
    ];
    // firstGen: 5개 다 / mutation: prevLayer 제외 4개 (or allowSameLayer 시 4개 무제한)
    aiOptions = firstGen
      ? allFallback
      : allFallback.filter(o => allowSameLayer || o.layer !== prevLayer).slice(0, 4);
  }
  if (!_mutationChatState) return;  // 사용자가 그 사이 닫음
  // placeholder 메시지 제거
  _mutationChatState.messages = _mutationChatState.messages.filter(m => !m._placeholder);
  // 사용자 요청 2026-04-29: 가지를 인라인 메시지로 넣음 (대화 흐름에 자연 적용됨 — 시간순)
  _mutationChatState.messages.push({
    role: 'options',
    options: aiOptions,
    generatedAt: new Date().toISOString()
  });
  _mutationChatState.loading = false;
  // chatRecord.options = 가장 최근 (선택용)
  _mutationChatState.chatRecord.options = aiOptions.slice();
  _renderMutationChat();
}

// 사용자 요청 2026-04-29: 돌연변이 임시 대화창의 assistant 메시지를 ✦ 깨달음(scrap)으로 archive에 저장
async function saveMutationMsgAsInsight(msgIdx) {
  if (!_mutationChatState) return;
  const m = _mutationChatState.messages[msgIdx];
  if (!m || m.role !== 'assistant' || m.savedAsInsight) return;
  // 직전 user 메시지(질문) 같이 저장
  let priorUser = null;
  for (let i = msgIdx - 1; i >= 0; i--) {
    const p = _mutationChatState.messages[i];
    if (p && p.role === 'user') { priorUser = p; break; }
  }
  const userQuestion = priorUser?.content || '';
  const card = getStrategyCard(_mutationChatState.strategyId);
  const _dayKey = todayKey();
  const date = new Date(_dayKey + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

  // 사용자 명시 2026-05-01 ultrathink: haiku 정리 (4 ✦ 핸들러 일관 형식)
  const summary = await summarizeForArchive(m.content, userQuestion);
  const headline = (summary && summary.headline) ? summary.headline : (m.content || '').slice(0, 30);
  const body = (summary && summary.body) ? summary.body : (m.content || '').slice(0, 200);

  state.archive = state.archive || [];
  state.archive.unshift({
    type: 'scrap',
    headline,
    body,
    insight: m.content,
    userMsg: userQuestion,
    assistantMsg: m.content,
    date,
    source: card ? `🧬 돌연변이 (${card.title})` : '🧬 돌연변이',
    savedAt: new Date().toISOString(),
    tags: ['돌연변이', '진화']
  });
  m.savedAsInsight = true;
  saveState();
  if (typeof renderArchive === 'function') renderArchive();
  showToast('✦ 깨달음에 저장됐어');
  _renderMutationChat();
  // 사용자 요청 2026-04-29: 임시 대화 → caseFormulation feed-in (background, fail silent)
  extractAndApplyInsightToModel(m.content, userQuestion, 'mutation').catch(() => {});
}

