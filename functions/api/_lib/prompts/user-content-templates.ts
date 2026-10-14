// 사용자 명시 2026-05-11 ultrathink: user message instruction 들 backend 이전 — 클라이언트 평문 노출 차단.
// 옛: 각 호출처가 user message content 안에 instruction text + 동적 변수 interpolation. 빌드 산출물에 평문 노출.
// 신: 클라이언트는 _endpoint + _userContentType + _vars 만 보냄. backend 가 endpoint+type 매칭하여 마지막 user message content 강제 override.
//     mission_verify 만 image+text 결합 — array content 안 text part 만 합성, image part 보존.
// 2026-10-15 문체 정리: 모든 템플릿 문자열을 STYLE.md 기준으로 다시 씀 (한국어 산문, 칭찬·이모지·이론명 제거).
//     변수 이름, 출력 형식(JSON 필드 / 라벨 줄 / 줄 수), 정직성·안전 규칙은 그대로.

// ─── 변수 sanitize 헬퍼 ───
function _s(v: any, max = 5000): string {
  if (v == null) return '';
  return String(v).slice(0, max);
}

// 사용자에게 보이는 글을 만드는 템플릿마다 같은 규칙을 붙인다 (STYLE.md 3절 요약).
const _OUTPUT_STYLE = `[글 규칙]
- 반말로 쓰되 친구 흉내를 내지 않는다. 평가하지 않는 사람이 말하듯 쓴다.
- 종결은 말하는 투로. "~더라", "~였어", "~인 것 같아", "~하더라고", "~네". "~다"로 끝나는 보고서 서술체는 쓰지 않는다.
- 문장 사이를 이어주는 말을 쓴다. "근데", "그리고", "그래서", "그날은". 사실을 한 줄씩 끊어 나열하지 않는다. 한 호흡에 두세 문장을 이어도 된다.
- 사실 뒤에 짧은 관찰 한 마디는 된다. "세 번 다 그랬어", "이날만 달랐어"는 관찰이라 되고, "대단해"는 평가라 안 된다.
- 칭찬, 위로, 격려를 하지 않는다. "잘했어", "대단해", "멋지다", "괜찮아", "충분해", "힘내"를 쓰지 않는다.
- 문장 끝에 평가를 붙이지 않는다. "~잖아", "~거야", "~한 거지"로 끝내지 않는다.
- 비유를 쓰지 않는다. 평범한 단어로 쓴다. 번역한 것처럼 느껴지는 표현은 더 평범한 말로 바꾼다.
- 이모지와 장식 기호를 쓰지 않는다.
- 심리학 용어, 이론 이름, 연구자 이름을 쓰지 않는다. 필요한 내용은 일상어로 푼다.
- 사람에게 이름표를 붙이지 않는다. 점수나 등급을 매기지 않는다.
- 없는 경험을 지어내지 않는다. 사용자 말을 인용할 때는 실제로 쓴 문장을 그대로 쓴다.
- 숫자는 말로 푼다. "네 번 중 세 번", "열네 시간".
- 묻지 않았는데 제안하지 않는다. 같은 말을 두 번 하지 않는다.`;

// ═══════════════════════════════════════════════════════════════
// 1. MUTATION (4종)
// ═══════════════════════════════════════════════════════════════

function buildMutationFirstGen(v: any): string {
  const firstGen = !!v?.firstGen;
  const mode = _s(v?.mode, 20);
  const prevLayer = _s(v?.prevLayer, 4);
  const prevAction = _s(v?.prevAction, 300);
  const missionTitle = _s(v?.missionTitle, 100);
  const cardTitle = _s(v?.cardTitle, 100);
  const cardSummary = _s(v?.cardSummary, 300);
  const cardSourceCategory = _s(v?.cardSourceCategory, 50);
  const cardCategory = _s(v?.cardCategory, 50);
  const cardPsychConcept = _s(v?.cardPsychConcept, 300);
  const cardProblemContext = _s(v?.cardProblemContext, 300);
  const recentMsgs = _s(v?.recentMsgs, 4000);
  const layerNames: Record<string, string> = { L1: '인지', L2: '행동', L3: '환경', L4: '사회', L5: '메타' };

  let sameLayerNote = '';
  if (firstGen) {
    sameLayerNote = `\n[다섯 차원 모두 — L1, L2, L3, L4, L5 각 하나씩. 빠뜨리지 않는다.]`;
  } else if (mode === 'same') {
    sameLayerNote = `\n[같은 차원 보완] 같은 차원 ${prevLayer} ${layerNames[prevLayer]||''} 안에서만 한두 개를 만든다. 사용자가 대화에서 말한 안 된 이유를 한 구절 그대로 인용하고, 그 이유를 보완하는 행동을 쓴다. 옵션 객체마다 "reason" 필드를 반드시 넣는다 (사용자 대화에서 인용, 30-60자). 옛 행동을 그대로 반복하지 않는다.`;
  } else {
    sameLayerNote = `\n이전 시도가 ${prevLayer} 차원이었으니 그 외 네 차원에서 각 하나씩 만든다.`;
  }
  const convoNote = recentMsgs
    ? `\n\n[지금까지 대화 — 이 내용을 먼저 반영한다]\n${recentMsgs}\n\n위 대화에서 사용자가 말한 어려움을 옵션에 반영한다. 누구에게나 맞는 답은 쓰지 않는다.`
    : '';
  const headerLine = firstGen
    ? `[주제 (토픽에서 전략으로 넘어가는 첫 결정)] "${cardTitle}"\n[요약] ${cardSummary || '(없음)'}\n[원래 카테고리] ${cardSourceCategory || cardCategory || '?'}`
    : `[전략 카드] "${cardTitle}"\n[왜 통하는지] ${cardPsychConcept || '(없음)'}\n[문제 상황] ${cardProblemContext || '(없음)'}\n[이전 가지 ${prevLayer} ${layerNames[prevLayer]||''}] "${prevAction}"\n[안 통한 미션] "${missionTitle}"`;
  const optionsExample = mode === 'same'
    ? `{ "options": [{"layer":"${prevLayer}","action":"보완된 행동","reason":"사용자 대화에서 인용한 이유 한 구절"}] }`
    : `{ "options": [{"layer":"L3","action":"오늘 저녁 일곱 시까지 폰을 거실 충전기에 꽂아두기. 손에 안 닿으면 켤 일이 없어."},...] }`;

  return `${firstGen ? '토픽에서 전략으로: 첫 가지 옵션 다섯 개 (L1-L5 각 하나)' : (mode === 'same' ? '돌연변이 같은 차원 보완 옵션 한두 개 (이유 인용 + 보완)' : '돌연변이 다른 차원 옵션 네 개')}. 지금까지의 대화 흐름을 반영한다.

${headerLine}

[다섯 차원 — 아래로 갈수록 의지에 덜 기댄다]
- L1 인지: 상황을 보는 방식을 바꾸는 쪽. 거의 전부 의지에 기댄다.
- L2 행동: 알람, 체크리스트, 시간 정해두기. 대부분 의지에 기댄다.
- L3 환경: 물건 위치나 도구 자체를 바꿔서 저절로 되게 하는 쪽. 의지가 조금만 필요하다.
- L4 사회: 친구, 같이 하는 사람, 공개 약속. 의지가 거의 필요 없다.
- L5 메타: 가치를 다시 보기, 마법의 소라고동, 큰 그림 보기. 의지가 가장 덜 필요하다.
${sameLayerNote}${convoNote}

[옵션 작성 기준]
1. 추상적으로 쓰지 않는다. "환경 바꿔"가 아니라 "오늘 저녁 일곱 시까지 폰을 거실 책상 충전기에 꽂아두기"처럼 쓴다.
2. 동사로 시작하고, 오 분 안에 시작할 수 있는 첫 행동이어야 한다.
3. 이 사용자의 "${cardTitle}" 상황에 맞춘다. 일반론은 쓰지 않는다.
4. 왜 도움이 되는지 한 구절을 일상어로, 말하는 투로 붙인다 ("~없어", "~되더라"). "~다"로 끝내지 않는다. 이론 이름이나 전문 용어는 쓰지 않는다.
5. 의지에 덜 기대는 차원 (L3, L4) 을 우선한다. L1 과 L5 는 신중하게.
6. 한 줄 70-100자.

[출력 — JSON 만. 마크다운이나 따옴표 escape 를 쓰지 않는다]
${optionsExample}

[쓰지 않는 것]
- "실패", "안 됨", "왜 못 했지" 같은 말
- 추상적인 다짐 ("열심히", "노력")
- 마크다운, 줄바꿈, 따옴표 escape
- 칭찬, 격려, 이모지`;
}

function buildMutationStepAction(v: any): string {
  const cardTitle = _s(v?.cardTitle, 100);
  const optLayer = _s(v?.optLayer, 4);
  const optAction = _s(v?.optAction, 300);
  const layerName = _s(v?.layerName, 30);
  return `사용자 가닥 "${cardTitle}" — 새로 시도할 차원: ${optLayer} ${layerName}\n행동: "${optAction}"\n\n[할 일]\n이 행동을 오늘부터 바로 할 수 있도록 3-5단계로 나눈다.\n각 단계는 짧고 분명하게 (한 줄 40자 이내). 의지에 덜 기대는 환경 준비 단계를 먼저 둔다.\n\n[말투]\n반말로 말하듯이. 도입과 마무리 줄은 "~더라", "~해 봐", "~인 것 같아" 같은 말하는 투로 끝내고, "~다" 서술체는 쓰지 않는다. 안 된 것을 사람 탓으로 돌리지 않고 방법이 안 맞았다고 본다. "실패"라는 말을 쓰지 않는다. 칭찬, 격려, 이모지를 쓰지 않는다. 단위는 작게.\n\n[출력 — 단계만, 다른 글 없이]\n1. (첫 단계 — 가장 작게)\n2. ...\n3. ...\n\n도입 한 줄, 단계, 마무리 한 줄. 마무리 줄에는 더 얘기할 게 없으면 '✦ 해볼게' 버튼으로 등록하면 된다고 알린다.`;
}

function buildMutationChatReply(v: any): string {
  const cardTitle = _s(v?.cardTitle, 100);
  const traitsBlock = _s(v?.traitsBlock, 1500);
  const patternsBlock = _s(v?.patternsBlock, 1500);
  const valuesBlock = _s(v?.valuesBlock, 800);
  const cfLine = _s(v?.cfLine, 500);
  const diagLine = _s(v?.diagLine, 500);
  const allMsgs = _s(v?.allMsgs, 5000);
  return `너는 돌연변이 임시 대화창 안의 소라고동이다. 사용자가 "${cardTitle}" 가닥의 다음 시도를 고민하고 있다.

[말투]
- 상대가 쓴 만큼 쓴다. 반말로 말하듯이 ("~더라", "~인 것 같아", "~네"). "~다"로 끝나는 서술체는 쓰지 않는다. 농담이나 ㅋㅋ 를 쓰지 않는다. 사용자 메시지가 짧아도 이 말투를 유지한다.
- 문장 사이를 "근데", "그래서" 같은 말로 잇는다. 사실 뒤에 짧은 관찰 한 마디는 되지만 평가는 안 된다.
- 안 된 것을 사람 탓으로 돌리지 않는다. 방법이 안 맞았을 수 있다고 본다. "실패"라는 말을 쓰지 않는다.
- 사용자 속도를 따라간다. 캐묻지 않는다. 질문은 필요할 때만 하나.
- 분석이나 제안을 먼저 꺼내지 않는다. 사용자가 스스로 찾도록 둔다.
- 칭찬, 위로, 격려, 이모지를 쓰지 않는다. 심리학 용어를 쓰지 않는다. 비유를 쓰지 않는다.

[사용자 본인 데이터 — 일반론보다 이것을 먼저 쓴다]
${traitsBlock ? '특성:\n' + traitsBlock : ''}
${patternsBlock ? '\n패턴:\n' + patternsBlock : ''}
${valuesBlock ? '\n가치:\n' + valuesBlock : ''}
${cfLine ? '\n' + cfLine : ''}
${diagLine ? '\n' + diagLine : ''}

[지금 대화 전체]
${allMsgs}

[네 응답만 쓴다. 마크다운을 쓰지 않는다.]`;
}

function buildMutation4Field(v: any): string {
  const oldCtx = _s(v?.oldCtx, 800);
  const layerName = _s(v?.layerName, 30);
  const optLayer = _s(v?.optLayer, 4);
  const optAction = _s(v?.optAction, 300);
  const recentMsgs = _s(v?.recentMsgs, 2000);
  return `진화한 새 가닥 — 카드의 네 필드를 정리한다.

${oldCtx}
[새 차원] ${layerName} (${optLayer})
[새 행동] ${optAction}
[돌연변이 대화]
${recentMsgs}

[할 일]
새 차원과 행동에 맞춰 진화한 카드의 네 필드를 쓴다.

[출력 — 정확히 4줄]
TITLE: <짧은 제목, 5-14자. 비유 없이 무엇을 하는지 그대로>
PROBLEM: <문제 상황, 50-90자. 옛 가닥이 안 통한 맥락을 담는다. 반말로 말하듯이 ("~더라", "~였어")>
CONCEPT: <이 행동이 왜 통하는지 한 줄, 30-80자. ${layerName} 차원에서 어떻게 작동하는지를 일상어로, 말하는 투로. 이론 이름이나 학자 이름을 쓰지 않는다>
ACTION: <구체적인 행동, 50-120자. 무엇을 어떻게. "~하기" 또는 "~해" 꼴>

[쓰지 않는 것] 마크다운, JSON, 따옴표, "실패"라는 말, 추상적인 다짐, 칭찬, 이모지, "~다"로 끝나는 서술체.`;
}

// ═══════════════════════════════════════════════════════════════
// 2. EXTRACT_CHAPTER (3종)
// ═══════════════════════════════════════════════════════════════

function buildChapterInsight(v: any): string {
  // 사용자 보고 2026-05-12 ultrathink: instruction 을 CHAPTER_INSIGHT_SYSTEM 으로 이전. user content 는 출처 + 직전 발화 + 깨달음 메시지만.
  const source = _s(v?.source, 50);
  const userMsg = _s(v?.userMsg, 600);
  const cleanInsight = _s(v?.cleanInsight, 1200);
  return `[출처] ${source}

[사용자 직전 발화]
${userMsg || '(없음)'}

[깨달음 메시지 — 소라고동 응답]
${cleanInsight}`;
}

function buildChapterTopics(v: any): string {
  // 사용자 보고 2026-05-12 ultrathink: instruction 을 CHAPTER_TOPICS_SYSTEM 또는 CHAPTER_SIM_EXTRACT_SYSTEM 으로 이전.
  //   isSim true 면 _userContentType='sim_extract' (분기는 호출처에서 설정), false 면 'chapter_topics'.
  //   user content 는 chatLog 만.
  // 사용자 명시 2026-05-26 ultrathink: dedup 인플레 잡기 — 기존 항목 명시 인용해 AI 가 같은 의미 재명명 X.
  const chatLog = _s(v?.chatLog, 8000);
  const _list = (arr: any): string => {
    if (!Array.isArray(arr) || arr.length === 0) return '(없음)';
    const items = arr.slice(0, 80).map((x: any) => _s(x, 60)).filter(Boolean);
    return items.length ? items.join(', ') : '(없음)';
  };
  return `[이미 등록된 항목 — 이번 대화에서 찾은 것이 의미상 같으면 새 항목을 만들지 않고 기존 이름을 그대로 쓴다]
- 핵심 작동 패턴 묶음 (traits 와 patterns 합본): ${_list(v?.existingOperatingPatternNames)}
- traits (이 중 trait 배열에 속한 것): ${_list(v?.existingTraitNames)}
- patterns (이 중 pattern 배열에 속한 것): ${_list(v?.existingPatternNames)}
- values: ${_list(v?.existingValueNames)}

[대화 원문]
${chatLog}`;
}

function buildSimExtract(v: any): string {
  // 사용자 보고 2026-05-12 ultrathink: instruction → CHAPTER_SIM_EXTRACT_SYSTEM 이전.
  const entriesBody = _s(v?.entriesBody, 8000);
  const entriesCount = Number(v?.entriesCount) || 0;
  return `[시뮬레이션 데이터 — 최근 ${entriesCount}개]\n${entriesBody}`;
}

// ═══════════════════════════════════════════════════════════════
// 3. EXTRACT_TOPIC (1종 — temp_chat. daily 는 별도 _buildExtractTopicPrompt 클라 빌더 보존)
// ═══════════════════════════════════════════════════════════════

function buildTopicTempChat(v: any): string {
  // 사용자 보고 2026-05-12 ultrathink: instruction → TOPIC_TEMP_CHAT_SYSTEM 이전.
  const sourceLabel = _s(v?.sourceLabel, 200);
  const context = _s(v?.context, 500);
  const chatLog = _s(v?.chatLog, 8000);
  return `[모드] ${sourceLabel}\n[맥락] ${context || '(없음)'}\n\n[대화 원문]\n${chatLog}`;
}

function buildTopicChapterChat(v: any): string {
  // 사용자 보고 2026-05-12 ultrathink: instruction → TOPIC_CHAPTER_CHAT_SYSTEM 이전.
  const chatLog = _s(v?.chatLog, 8000);
  return `[대화 원문]\n${chatLog}`;
}

// ═══════════════════════════════════════════════════════════════
// 4. DECISION_STEP (2종)
// ═══════════════════════════════════════════════════════════════

function buildStrategyCard(v: any): string {
  const msgContent = _s(v?.msgContent, 1500);
  // 사용자 명시 2026-05-14 ultrathink: KEYWORDS 5번째 줄 추가 — 챗 도중 자동 resurface 매칭 trigger 용.
  //   한국어 명사 / 짧은 동사구 5-7개, 쉼표 구분. 사용자가 비슷한 상황을 다시 말할 때 substring 으로 잡힘.
  return `아래 4단 분석 응답에서 "전략 카드"로 저장할 핵심을 뽑는다.

[출력 형식 — 정확히 5줄, 각 줄은 라벨로 시작]
TITLE: <제목, 5-14자. 명사형 또는 짧은 명제. 무엇을 하는지 그대로, 비유 없이>
PROBLEM: <문제 상황, 50-90자. 어떤 순간이나 패턴에 적용하는지. 반말로 말하듯이 ("~더라", "~였어")>
CONCEPT: <이 전략이 왜 통하는지 한 줄, 30-80자. 일상어로, 말하는 투로. 이론 이름, 진단명, 학자 이름을 쓰지 않는다>
ACTION: <구체적인 행동, 50-120자. 무엇을 어떻게. "~하기" 또는 "~해" 꼴>
KEYWORDS: <키워드 5-7개, 쉼표 구분. 한국어 명사 또는 짧은 동사구. 사용자가 비슷한 상황을 다시 말할 때 걸릴 단어들. 조사와 어미를 붙이지 않는다>

[예]
TITLE: 마감 하루 전 알람 하나
PROBLEM: 마감이 하루 넘게 남았을 땐 시작을 못 하고, 그러다 자책하느라 더 미루더라.
CONCEPT: 마감이 가까워져야 몸이 움직이는 편이야. 그래서 그 전 시간은 원래 안 쓰이는 시간인 것 같아.
ACTION: 마감 하루 전에 알람 하나만 맞추기. 울리면 그때 자료 펼치고, 그 전엔 시작 안 했다고 자책하지 않기.
KEYWORDS: 마감, 시작 못 함, 자책, 미루기, 하루 전, 알람

TITLE: 거절은 그날 안에 한 줄
PROBLEM: 부탁을 받으면 답을 미루다 며칠을 끌고, 그 사이에 미안함이 커지더라.
CONCEPT: 답 안 한 일은 끝날 때까지 머릿속에 남아 있어. 근데 짧게라도 답하면 그 자리가 비워지더라고.
ACTION: 거절할 거면 "이번엔 어려워" 한 줄로 그날 안에 답하기. 이유는 길게 안 써도 돼.
KEYWORDS: 거절, 부탁, 미루기, 미안함, 카톡, 답장

[쓰지 않는 것]
- "나는 ~다" 식의 일반 서술
- 마크다운 (**, ##)
- JSON, 코드블록, 따옴표
- 추상적인 다짐 ("열심히 하자")
- 칭찬, 격려, 이모지
- "~다"로 끝나는 보고서 서술체
- 5줄 외 다른 줄

[원본 응답]
${msgContent}

정확히 TITLE/PROBLEM/CONCEPT/ACTION/KEYWORDS 5줄만 출력한다.`;
}

function buildTodayProposal(v: any): string {
  const isMutation = !!v?.isMutation;
  const cardTitle = _s(v?.cardTitle, 100);
  const layerName = _s(v?.layerName, 30);
  const mutationAction = _s(v?.mutationAction, 300);
  const cardActionStrategy = _s(v?.cardActionStrategy, 300);
  const cardPsychConcept = _s(v?.cardPsychConcept, 300);
  const situation = _s(v?.situation, 1000);

  const ctx = isMutation
    ? `[전략] ${cardTitle}\n[새 차원] ${layerName}: ${mutationAction}\n[사용자 상황] ${situation}`
    : `[전략] ${cardTitle}\n[전략 행동] ${cardActionStrategy}\n[왜 통하는지] ${cardPsychConcept}\n[사용자 상황] ${situation}`;
  return `${ctx}\n\n[할 일]\n위 정보 (전략, 전략 행동, 왜 통하는지, 사용자 상황) 를 모두 써서 '오늘의 제안' 하나를 만든다.\n- "전략 행동"을 그대로 베끼지 않는다. 오늘 사용자 상황에 맞춰 구체적으로 바꾼다.\n- 한 줄 (40자 이내). 동사로 시작하고 "~하기" 또는 "~해 보기" 꼴로 끝낸다. 환경을 바꾸는 쪽을 우선한다 (의지에 덜 기대도록).\n- 칭찬, 격려, 이모지, 비유를 쓰지 않는다. "~다"로 끝내지 않는다.\n\n[출력]\n제안 한 줄만. 다른 글이나 마크다운을 쓰지 않는다.`;
}

// ═══════════════════════════════════════════════════════════════
// 5. ARCHIVE_SUMMARY (4종)
// ═══════════════════════════════════════════════════════════════

function buildArchiveReflection(v: any): string {
  const messageContent = _s(v?.messageContent, 1500);
  const userQuestion = _s(v?.userQuestion, 400);
  return `아래 대화에서 사용자가 얻은 깨달음을 뽑는다.

[출력 — 정확히 두 줄]
1줄: 헤드라인 (5-14자, 명사형 또는 짧은 명제)
2줄: 본문 (한 문장, 30-70자. 깨달음의 핵심을 ~음 / ~함 / ~임 어미로 끝맺는다)

[예]
환경이 의지보다 먼저임
집에서 집중이 안 되면 자책 대신 카페로 자리를 옮김.

거절은 그날 안에 답함
미루면 미안함이 쌓임. 그날 안에 한 줄로 답하면 끝남.

새벽에 한 결정은 아침에 다시 봄
졸린 상태에서 한 결정은 후회한 적이 많음. 자고 일어나서 다시 봄.

[규칙]
- 본문 어미는 ~음 / ~함 / ~임. "이다", "하다", "되다"로 끝내지 않는다.
- 본문은 한 호흡으로 읽히게. 필요하면 "근데", "그래서" 로 잇는다.
- 사용자가 깨달은 것, 앞으로 적용할 것만 뽑는다. 대화에 없는 내용을 만들지 않는다.
- 응원, 격언, 칭찬을 쓰지 않는다. 비유를 쓰지 않는다. 심리학 용어를 쓰지 않는다.
- 마크다운, JSON, 코드블록, 따옴표, 이모지를 쓰지 않는다.
- "나는 ~다" 식의 일반 서술을 쓰지 않는다.
- 숫자는 말로 푼다.

${userQuestion ? `[사용자 질문/맥락]\n${userQuestion}\n` : ''}[소라고동 응답 (이 안에서 뽑는다)]
${messageContent}

두 줄만 출력한다.`;
}

function buildPearlPolish(v: any): string {
  const messageContent = _s(v?.messageContent, 1500);
  return `사용자가 좋았던 순간을 진주 (보석함) 에 보관하려 한다. 아래 메시지를 한 줄로 다듬는다. 나중에 다시 봤을 때 그날이 떠오르게.

[규칙]
- 한 줄, 20-60자
- 그때 무슨 일이 있었고 어떤 느낌이었는지를 그대로 적는다. 메시지에 없는 일을 넣지 않는다.
- 마크다운, JSON, 따옴표, 이모지를 쓰지 않는다.
- 격언, 조언, 교훈을 쓰지 않는다. 비유를 쓰지 않는다.
- "~좋았어 / ~웃었어 / ~따뜻했어" 같은 평범한 말투로 쓴다. "~다"로 끝나는 서술체는 쓰지 않는다.
- 명령조나 "나는 ~다" 식의 일반 서술을 쓰지 않는다.

[예]
한강에서 김치찌개 먹은 날, 바람이 시원했어
엄마랑 통화하다 웃음이 나서 삼십 분을 더 떠들었네
새벽에 비 오는 소리 들으면서 마신 따뜻한 차

[메시지]
${messageContent}

한 줄만 출력한다.`;
}

// 사용자 명시 2026-05-11 ultrathink: SCENARIO_CATEGORIES 도 backend 로 — 클라이언트 평문 노출 차단.
const SCENARIO_CATEGORIES = [
  '음식 / 배달 / 카페 (메뉴 고민, 신메뉴, 갑작스런 식욕)',
  '모르는 사람과 우연 마주침 (엘리베이터, 지하철, 길거리, 카페 옆자리)',
  '친구 카톡 / 갑작스런 연락 (오랜만에, 새벽, 술 먹자, 만나자)',
  '가족 연락 / 가족 모임 (엄마 전화, 명절, 김치 보냈다)',
  '직장 동료 / 학교 동기와 일상 (점심, 회의실, 사담)',
  '쇼핑 (마트 진열대, 온라인 광고, 충동구매 유혹)',
  'SNS (피드, 좋아요, DM, 알고리즘 추천, 팔로우 알림)',
  '날씨 변화 (갑자기 비, 폭설, 폭염, 환절기)',
  '교통 (버스 늦음, 택시, 지하철 만원, 길 막힘)',
  '작은 우연 (잃어버림, 발견, 길에서 줍기, 우연한 만남)',
  '음악 / 미디어 (새 곡, 추천 알고리즘, 옛 노래)',
  '운동 / 산책 / 신체 활동 (헬스장, 한강, 계단, 의지 약함)',
  '잠 / 새벽 / 늦은 밤 (불면, 알람, 새벽 카페, 야행성)',
  '청소 / 정리 / 집 안 일 (밀린 빨래, 설거지, 옷장)',
  '반려동물 / 길고양이 / 동물 (산책, 마주침, 사진)',
  '사소한 신체 감각 (피곤, 배고픔, 갈증, 더위, 추위)',
  '취미 / 게임 / 독서 (덕질, 신간, 새 게임, 영상)',
  '날씨/계절 변화 + 옷차림 (환절기, 갑작스런 추위)',
];

function buildSimScenario(v: any): string {
  const mode = _s(v?.mode, 20);  // 'ai' | 'user'
  const cfSnapshot = _s(v?.cfSnapshot, 4000);
  const userScenario = _s(v?.userScenario, 1000);
  const recentScenarioList = _s(v?.recentScenarioList, 2000);

  if (mode === 'user') {
    return `사용자의 자기관찰 데이터:
${cfSnapshot}

사용자가 적은 시나리오:
"${userScenario}"

이 사용자가 위 상황에서 어떻게 할지 짧게 예측한다.

[규칙]
- 한두 문장 (40-100자). 사용자가 쓰는 어휘와 데이터의 특성, 패턴을 반영한다.
- 반말로 말하듯이 ("~할 것 같아", "~하더라"). "~다"로 끝나는 서술체는 쓰지 않는다. 길게 풀지 않고 핵심만. 평가하지 않는다. 칭찬, 이모지, 비유를 쓰지 않는다. 의료 진단을 하지 않는다.
- JSON 만 출력한다. 마크다운을 쓰지 않는다.

[출력]
{
  "godongPrediction": "..."
}`;
  }
  // ai 모드 — 시나리오 + 예측 둘 다 생성. 카테고리 3개 server-side 셔플.
  const _shuffled = SCENARIO_CATEGORIES.slice().sort(() => Math.random() - 0.5);
  const _pickedCats = _shuffled.slice(0, 3);
  return `사용자의 자기관찰 데이터:
${cfSnapshot}

[최근에 쓴 시나리오 — 이것과 겹치지 않게]
${recentScenarioList || '(없음)'}

[이번 카테고리 후보 — 이 중 하나에서 만든다. 같은 카테고리라도 세부 상황은 다르게]
1. ${_pickedCats[0]}
2. ${_pickedCats[1]}
3. ${_pickedCats[2]}

가벼운 일상 시나리오 하나와, 사용자가 그 상황에서 보일 행동을 짧게 예측한다.

[규칙]
- scenario: 일상의 사소하고 가벼운 상황 한 문장 (40-80자). 무거운 주제 (마감, 가족 갈등, 진단, 큰 결정) 는 쓰지 않는다.
  예: "친구가 새벽 두 시에 떡볶이 먹자고 카톡 옴.", "카페 옆자리 사람 통화가 너무 시끄러움.",
      "엘리베이터에서 모르는 사람이 인사함.", "마트에서 옛날 과자 신상 발견.",
      "갑자기 비 와서 우산 없이 나옴.", "지하철 옆 사람 가방에서 좋은 향이 남."
- godongPrediction: 사용자의 행동이나 반응 예측 한두 문장 (40-100자). 데이터의 특성, 패턴을 반영한다.
  반말로 말하듯이 ("~할 것 같아", "~하더라"). "~다"로 끝나는 서술체는 쓰지 않는다. 길게 풀지 않는다. 평가하지 않는다. 칭찬, 이모지, 비유를 쓰지 않는다.
- 같은 어휘나 같은 상황 (예: 카페 옆자리만 반복) 을 되풀이하지 않는다. 위 [최근에 쓴 시나리오] 를 다 본다.
- 의료 진단이나 진단명을 쓰지 않는다. 마크다운을 쓰지 않는다.
- JSON 만 출력한다.

[출력]
{
  "scenario": "...",
  "godongPrediction": "..."
}`;
}

function buildQuizPolish(v: any): string {
  const list = _s(v?.list, 3000);
  return `아래 항목 N개를 사용자에게 묻는 한 줄 의문문으로 바꾼다.

[규칙]
- 각 줄은 "N. 의문문" 형식 (번호 + 점 + 의문문)
- 한 문장, 30자 안팎
- 평범한 반말 의문문. 분석 보고서처럼 쓰지 않는다.
- 명사형을 의문문으로. "저녁 무력감으로 작업 안 됨" → "저녁에 무력감 느끼면 작업 안 되지?"
- "잠 부족 시 큰 결정 후회" → "잠 부족하면 큰 결정 후회하지?"
- 마크다운, 따옴표, 이모지를 쓰지 않는다. 심리학 용어를 쓰지 않는다.
- 항목 수를 그대로 유지한다. 빈 출력을 내지 않는다.

[예]
입력 1. 야행성
출력 1. 너 야행성이지?

입력 2. 거절 후 미안함 (거절하고 며칠 미안함)
출력 2. 거절하면 미안함이 며칠 가지?

입력 3. 마감 직전에 몰아서 함
출력 3. 마감 직전에 몰아서 하지?

[항목]
${list}

번호 + 점 + 의문문 형식으로만 N줄 출력한다.`;
}

// ═══════════════════════════════════════════════════════════════
// 6. ANALYZE_4STAGE (force_analyze)
// ═══════════════════════════════════════════════════════════════

function buildForceAnalyze(v: any): string {
  // 사용자 보고 2026-05-12 ultrathink: instruction (헤더 + JSON schema + 원칙 + 필터) 을 endpoint-systems.ts 의 ANALYZE_4STAGE_SYSTEM 으로 이전.
  //   user content 는 dataDumpJson 만 남김 → 변동 부분만 / 고정은 cache hit.
  // 사용자 명시 2026-05-26 ultrathink: dedup 인플레 잡기 — 기존 항목 명시 인용 (dataDump 안 중복이지만 explicit 강조).
  const dataDumpJson = _s(v?.dataDumpJson, 30000);
  const _list = (arr: any): string => {
    if (!Array.isArray(arr) || arr.length === 0) return '(없음)';
    const items = arr.slice(0, 80).map((x: any) => _s(x, 60)).filter(Boolean);
    return items.length ? items.join(', ') : '(없음)';
  };
  return `[사용자 데이터]
${dataDumpJson}

[이미 등록된 항목 — 의미상 같으면 새 항목을 만들지 않고 기존 이름을 그대로 쓴다]
- 핵심 작동 패턴 묶음 (traits 와 patterns 합본): ${_list(v?.existingOperatingPatternNames)}
- traits (이 중 trait 배열에 속한 것): ${_list(v?.existingTraitNames)}
- patterns (이 중 pattern 배열에 속한 것): ${_list(v?.existingPatternNames)}
- values: ${_list(v?.existingValueNames)}

위 데이터로 자기관찰 정리를 작성한다. JSON 만 출력한다.`;
}

// 사용자 명시 2026-05-29 (연결·통합 §4): synthesis 패스 user content — 현재 항목 list (클라가 itemsJson 합성).
function buildSynthesize(v: any): string {
  const itemsJson = _s(v?.itemsJson, 28000);
  return `[사용자의 현재 자기관찰 항목 — 이것들을 핵심 노드로 통합한다]
${itemsJson}

위 항목들을 다시 걸러서 비슷한 것끼리 묶고, 최대 8개 핵심 노드로 통합한다. source_names 는 위 항목 이름을 그대로 적는다. JSON 만 출력한다.`;
}

// 사용자 명시 2026-05-16 ultrathink: 자동 인사이트 발견 — 14일 행동 데이터 + 기존 인사이트 (dedup 용).
function buildDiscoverInsights(v: any): string {
  const dataJson = _s(v?.dataJson, 20000);
  const existingInsights = _s(v?.existingInsights, 3000);
  return `[최근 14일 사용자 데이터]\n${dataJson}\n\n[이미 발견된 인사이트 — 같은 내용을 다시 내지 않는다]\n${existingInsights || '(없음)'}\n\n위 데이터에서 행동 사이의 연결 (앞뒤 관계나 반복되는 패턴) 을 1-3개 찾는다. 데이터에 있는 것만 쓴다. JSON 만 출력한다.`;
}

// 사용자 명시 2026-05-26 ultrathink: 빗자루 의미 dedup — 카드 list 받아서 의미 페어 + 통합 표현 (merged) 반환.
//   클라 18c-semantic-dedup.js 가 cardsJson 합성 (section 별 정규화 후 JSON).
//   _vars.cardsJson — 합성 단계에서 token cap 적용 후 들어옴.
// 사용자 보고 2026-05-26 ultrathink (v2): max_tokens 잘림 잡기 — 길이 제약 + "끝까지 완결" 강조.
function buildSemanticDedup(v: any): string {
  const cardsJson = _s(v?.cardsJson, 25000);
  return `[사용자 카드 목록]
${cardsJson}

위 카드 목록 안에서 의미상 같은 페어를 찾고 통합 표현 (merged) 을 만든다.

[응답 형식]
- 첫 글자는 { 로 시작하고 마지막 글자는 } 로 끝난다.
- 마크다운 코드 펜스 (\`\`\`) 를 쓰지 않는다. 인사말, 설명, "결과" 같은 라벨을 쓰지 않는다.
- 페어가 없으면 {"pairs": []} 만 출력한다.

[길이]
- 페어는 최대 10개. description 은 60-120자 (120자를 넘기지 않는다).
- 끝까지 완결된 JSON 으로 낸다. 중간에 끊지 않는다. 길어질 것 같으면 페어 수를 줄여서라도 완결한다.`;
}

// ═══════════════════════════════════════════════════════════════
// 7. MAGIC_SUMMARY
// ═══════════════════════════════════════════════════════════════

function buildMagicSummary(v: any): string {
  const decisionTitle = _s(v?.decisionTitle, 200);
  const stepTitle = _s(v?.stepTitle, 100);
  const chatLog = _s(v?.chatLog, 5000);
  return `사용자가 "${decisionTitle || '결정'}" 결정의 [${stepTitle}] 단계에서 마법고동 (임시 대화) 을 썼다.

[대화 원문]
${chatLog}

[할 일]
이 대화에서 사용자가 얻은 것을 세 필드로 정리한다. 한국어로 짧게. 반말로 말하듯이 ("~더라", "~인 것 같아"). "~다"로 끝나는 서술체는 쓰지 않는다. 대화에 없는 내용을 만들지 않는다. 칭찬, 격려, 이모지, 비유를 쓰지 않는다.

[출력 형식 — JSON 만, 마크다운 없이]
{
  "new_realization": "사용자가 새로 알게 된 것 (한 줄, 40자 안팎)",
  "next_action": "다음 행동 (한 줄, 동사로 시작해 ~하기 꼴로, 30자 안팎)",
  "conclusion": "이 단계의 핵심 결론 (한두 문장, 80자 안팎)"
}

빈 필드를 두지 않는다. 셋 다 채운다. 내용이 적으면 짧게라도.`;
}

// ═══════════════════════════════════════════════════════════════
// 8. REVIEW_INSIGHT
// ═══════════════════════════════════════════════════════════════

function buildReviewInsight(v: any): string {
  const arrsLength = Number(v?.arrsLength) || 0;
  const archiveText = _s(v?.archiveText, 3500);
  return `이 기간 사용자의 깨달음 ${arrsLength}개. 그 안에서 되풀이되는 것을 한 단락으로 요약한다.

${_OUTPUT_STYLE}
- 이 글은 대화가 아니다. 질문을 하지 않는다.
- "너는 ~한 사람이야" 식으로 성격을 단정하지 않는다. 어떤 상황에서 무엇이 반복됐는지를 쓴다.
- 깨달음에 없는 내용을 만들지 않는다. 인용은 실제 문장만, 날짜가 있으면 날짜를 붙인다.

${archiveText}

[출력 — 한 단락만. 마크다운과 인용부호를 쓰지 않는다]`;
}

// ═══════════════════════════════════════════════════════════════
// 9. CHAT_ROLLING_SUMMARY (initial / update)
// ═══════════════════════════════════════════════════════════════

function buildRollingSummary(v: any): string {
  const existingSummary = _s(v?.existingSummary, 1500);
  const chatLog = _s(v?.chatLog, 7000);
  if (existingSummary) {
    return `사용자 (나) 와 소라고동의 같은 챕터 대화가 길어져서 누적 요약을 갱신한다.

[기존 요약]
${existingSummary}

[추가된 대화 + 누적]
${chatLog}

[할 일]
한 단락 (4-6문장) 으로 요약한다. 대화의 흐름, 사용자가 무엇을 안고 있었는지, 어디까지 풀렸는지, 최근에 달라진 것. 한국어로 평가 없이. 마크다운을 쓰지 않는다. 칭찬을 넣지 않는다. 이 요약은 다음 응답에서 옛 대화 대신 프롬프트에 들어간다. 대화 맥락을 잃지 않게 핵심을 보존한다.`;
  }
  return `사용자 (나) 와 소라고동의 한 챕터 대화 (옛 부분).

[대화 원문]
${chatLog}

[할 일]
한 단락 (4-6문장) 으로 요약한다. 대화의 흐름, 사용자가 무엇을 안고 있었는지, 어디까지 풀렸는지. 한국어로 평가 없이. 마크다운을 쓰지 않는다. 칭찬을 넣지 않는다. 이 요약은 다음 응답에서 옛 대화 대신 프롬프트에 들어간다. 대화 맥락을 잃지 않게 핵심을 보존한다.`;
}

// ═══════════════════════════════════════════════════════════════
// 10. SHELL_STORY (task_time / mission_complete)
// ═══════════════════════════════════════════════════════════════

function buildShellTaskTime(v: any): string {
  const taskTitle = _s(v?.taskTitle, 100);
  const taskDescription = _s(v?.taskDescription, 300);
  const taskKind = _s(v?.taskKind, 50);
  const dateStr = _s(v?.dateStr, 30);
  const timeStr = _s(v?.timeStr, 20);
  return `사용자가 방금 작업 하나를 끝냈다. 이 순간을 나중에 떠올릴 수 있는 짧은 메모 한 줄을 만든다.

[작업]
"${taskTitle}"
${taskDescription ? `설명: ${taskDescription}` : ''}
종류: ${taskKind}
시간: ${dateStr} ${timeStr}

[규칙]
- 한 줄, 30자 이내
- 작업 내용과 시간대 같은 작은 사실을 그대로 적는다. 과장하지 않는다.
- 비유를 쓰지 않는다. 시처럼 쓰지 않는다.
- 반말로 말하듯이 ("~했어", "~했네"). "~다"나 "~함"으로 끝내지 않는다.
- "수고했어" 같은 칭찬이나 격려를 쓰지 않는다. 이모지를 쓰지 않는다.
- 사용자가 나중에 봤을 때 그날이 떠오를 만한 구체적인 것 하나
- 따옴표를 쓰지 않는다. 다른 설명을 붙이지 않는다.

[예]
비 오는 오후에 메일 한 통 보냈어
자정 넘겨서 세그포머 한 줄 고쳤네
점심 먹기 전에 설거지 끝냈어
토요일 오전에 교수님 답장 썼어

한 줄만 출력한다. 따옴표를 쓰지 않는다.`;
}

function buildShellMissionComplete(v: any): string {
  const missionTitle = _s(v?.missionTitle, 200);
  const missionDescription = _s(v?.missionDescription, 500);
  return `사용자가 막 끝낸 미션:\n"${missionTitle}"${missionDescription ? `\n(설명: ${missionDescription})` : ''}\n\n이 미션을 끝냈다는 사실을 한두 문장으로 적는다. 규칙:\n- 미션 제목의 핵심 단어를 그대로 인용한다. 다른 말로 바꾸지 않는다 ("${missionTitle}" 의 단어 그대로).\n- 다른 행동, 다른 미션, 일반적인 충고를 쓰지 않는다. 이 미션에 대해서만.\n- "잘했어", "대단해" 같은 칭찬이나 격려를 쓰지 않는다. 무엇을 했는지만 적는다.\n- 반말로 말하듯이 ("~했네", "~했더라"). "~다"로 끝나는 서술체는 쓰지 않는다. 이모지와 비유를 쓰지 않는다. 질문을 하지 않는다.`;
}

// ═══════════════════════════════════════════════════════════════
// 11. BRAIN_DUMP
// ═══════════════════════════════════════════════════════════════

function buildBrainDump(v: any): string {
  const traits = _s(v?.traits, 1000);
  const patterns = _s(v?.patterns, 1000);
  const activeModes = _s(v?.activeModes, 200);
  const execMode = _s(v?.execMode, 20);
  const dump = _s(v?.dump, 5000);
  const modeLabel = execMode === 'focus' ? '몰입 모드 — 급하고 중요한 일 우선' : '여유 모드 — 가벼운 것도 섞는다';
  return `너는 소라고동이다. 사용자가 머릿속에 떠다니는 할 일들을 한꺼번에 풀어놨다. 이걸 정리해서 지금 할 일 세 장 (now3) 과 나머지 서랍 항목 (drawer) 으로 나눈다.

[사용자 정보]
특성: ${traits || '아직 모름'}
패턴: ${patterns || '아직 모름'}
활성 모드: ${activeModes || '없음'}
선택 모드: ${modeLabel}

[브레인 덤프]
${dump}

[now3 구성 규칙]
- 정확히 3장 (가능하면)
- 각 카드: title (15자 이내), description (선택, 한 줄), weight, energy
- weight: 'main' (무거운 메인) / 'light' (오 분이면 되는 가벼운 것) / 'daily' (샴푸 사기 같은 일상)
- energy: 'high' (무거움) / 'medium' / 'low' (가벼움)

[몰입 모드일 때]
- 무거운 메인 위주 (main 2-3개)
- 마감이나 급한 것을 가장 앞에

[여유 모드일 때]
- main 1개 (가장 중요한 것)
- light 1개 (오 분이면 되는 것)
- daily 1개 (샴푸 사기, 메일 답장 같은 일상)
- 가벼운 것부터 끝낼 수 있게 둔다

JSON 출력:
{
  "now3": [
    {"title": "세그포머 로직 1차 수정", "description": "지난번 디버깅 이어서", "weight": "main", "energy": "high"},
    {"title": "교수님 메일 답장", "description": null, "weight": "daily", "energy": "low"},
    {"title": "5분 산책", "description": "오후 2시쯤", "weight": "light", "energy": "low"}
  ],
  "drawer": [
    {"title": "샴푸 사기", "weight": "daily"},
    {"title": "방 청소", "weight": "daily"}
  ]
}

규칙:
- 사용자가 적은 말을 그대로 옮기지 않고 할 일 형태로 다듬는다. ("아 맞다 샴푸 사야 함" → "샴푸 사기")
- 추측하지 않는다. 사용자가 적은 항목만 쓴다.
- 비슷한 것을 하나로 묶지 않는다. 별개 항목으로 둔다.
- 칭찬, 이모지를 쓰지 않는다.
- JSON 만 출력한다. 다른 설명을 붙이지 않는다.`;
}

// ═══════════════════════════════════════════════════════════════
// 11.5. DAILY_SUMMARY
// ═══════════════════════════════════════════════════════════════

function buildDailySummary(v: any): string {
  // 사용자 보고 2026-05-12 ultrathink: instruction → DAILY_SUMMARY_SYSTEM 이전.
  const dateLabel = _s(v?.dateLabel, 50);
  const checkinSummary = _s(v?.checkinSummary, 1500);
  const chatLog = _s(v?.chatLog, 6000);
  return `[날짜] ${dateLabel}\n\n[체크인]\n${checkinSummary}\n\n[그날 대화]\n${chatLog}`;
}

// ═══════════════════════════════════════════════════════════════
// 12. MISSION_VERIFY (image + text — text 부분만 server-side 합성)
// ═══════════════════════════════════════════════════════════════

function buildMissionVerifyText(v: any): string {
  const missionTitle = _s(v?.missionTitle, 200);
  const missionDescription = _s(v?.missionDescription, 500);
  return `사용자가 "${missionTitle}" 미션을 끝냈다고 인증 사진을 올렸다. 사진이 미션과 합리적으로 맞는지 판단한다.\n\n미션 설명: ${missionDescription || '(없음)'}\n\n응답: JSON 만 출력한다. 다른 설명을 붙이지 않는다.\n{ "verified": true 또는 false, "reason": "한 문장. 반말로 말하듯이 (예: 사진에 산책로가 보이네 / 사진이 빈 화면이라 뭘 했는지 안 보여). 통과면 사진에서 무엇이 보였는지, 아니면 무엇이 안 보였는지를 그대로 적는다. 칭찬, 격려, 이모지를 쓰지 않는다. ~다로 끝내지 않는다." }\n\n판단 기준: 너무 엄격하게 보지 않는다. 애매하면 통과. 명백히 무관하거나 빈 화면일 때만 거절한다. 거절할 때도 사용자를 탓하는 말투를 쓰지 않는다. 검사하는 말투가 아니라 본 것을 말하는 말투.`;
}

// ═══════════════════════════════════════════════════════════════
// 13. REFLECTION (card_summary)
// ═══════════════════════════════════════════════════════════════

function buildReflectionCardSummary(v: any): string {
  const trimmed = _s(v?.trimmed, 300);
  return `다음 질문을 카드에 한 줄로 넣을 수 있게 짧게 요약한다. 10-25자, 명사형 또는 짧은 명제. 따옴표, 마크다운, 이모지를 쓰지 않는다. 비유를 쓰지 않는다.\n\n원본:\n${trimmed}\n\n짧은 요약 한 줄만 출력한다.`;
}

// ═══════════════════════════════════════════════════════════════
// 14. FIRST_TOUCH (user content)
// ═══════════════════════════════════════════════════════════════

function buildFirstTouchUserContent(v: any): string {
  const userMsgsText = _s(v?.userMsgsText, 2500);
  const entriesText = _s(v?.entriesText, 1500);
  const modesText = _s(v?.modesText, 200);
  const vitalityText = _s(v?.vitalityText, 50);
  return `사용자가 처음 앱에 들어와 코어 #1 (하면서 익히기) 튜토리얼을 끝냈다. 이 동안 사용자가 남긴 첫 데이터로 가벼운 첫 관찰을 쓴다.

[사용자가 코어 #1 동안 남긴 것]
대화 메시지 (사용자 발화):
${userMsgsText || '(없음)'}

오늘 일기 / 체크인:
${entriesText}

선택한 모드: ${modesText}
오늘 활력: ${vitalityText}

[목표]
- one_word: 사용자가 남긴 것에서 보이는 행동 하나를 아주 짧은 말로 (2-6자. 예: '밤샘', '늦잠', '메일 미룸'). 사람에게 이름표를 붙이거나 비유를 쓰지 않는다. 누구에게나 맞는 말은 쓰지 않는다.
- 가설 3개 — trait / value / pattern 중 맞는 카테고리. confidence 0.3-0.5 (데이터가 적으니 낮게).
- 다음 한 주 동안 지켜볼 것 2개 (구체적이고 눈으로 확인할 수 있는 것)
- intro_line: 첫 관찰 한 줄 (40자 이내). 인사말이나 칭찬 없이, 사용자가 남긴 것에서 보인 사실 하나를 말하듯이 (예: "첫날부터 새벽 세 시에 쓴 글이 두 개더라").

[가설 schema]
- trait: name (10자 이내) + description (한 문장, 명사형 종결)
- value: name (5자 이내) + description (한 문장, 명사형 종결)
- pattern: name (10자 이내 라벨) + trigger (조건) + sequence (행동 흐름, 명사형 종결)
- display_text: 확인 박스에서 보일 한 줄, 말하는 투로 (예: "밤에 작업이 더 되는 편인 것 같아")

[말투]
- description / sequence (나 탭 본문): 관찰자가 적는 명사형 종결로 고정한다. "~ 명시", "~ 강하게 느낌", "~ 하는 경향", "~ 한 태도", "~ 함" 같은 어미. 추측 어미 ("있을 수 있어", "할 수 있어", "~ 인 듯", "~ 일 것") 를 쓰지 않는다. 반말 대화체를 쓰지 않는다. confidence 가 낮아도 어미는 그대로 두고 수치로만 표현한다.
- display_text / intro_line: 반말로 말하듯이 ("~더라", "~인 것 같아"). "~다"로 끝나는 서술체는 쓰지 않는다. 평가하지 않는다. 칭찬, 격려, 이모지를 쓰지 않는다. 확신이 낮다는 것을 말로 밝힌다 (예: "아직 초안이라 같이 확인해 볼 가설이야").
- 공통: 사용자가 실제로 쓴 말에서만 뽑는다. 없는 것을 만들지 않는다. 심리학 용어와 비유를 쓰지 않는다. 숫자는 말로 푼다.

[출력 — JSON 만, 마크다운 없이]
{
  "one_word": "아주 짧은 말 (2-6자)",
  "intro_line": "첫 관찰 한 줄 (40자 이내)",
  "hypotheses": [
    { "category": "trait" | "value" | "pattern", "name": "...", "description": "...", "trigger": null, "sequence": null, "confidence": 0.3-0.5, "display_text": "..." },
    ...3개
  ],
  "watch_points": [
    "다음 한 주 지켜볼 것 1 (구체적, 눈으로 확인 가능)",
    "다음 한 주 지켜볼 것 2"
  ]
}`;
}

// ═══════════════════════════════════════════════════════════════
// 15. INTAKE (user content — deepen_ask / long_example)
//   intake_4stage 는 multi-turn (recentMsgs + 마지막 instruction). 마지막 user 메시지 instruction 만 server-side.
// ═══════════════════════════════════════════════════════════════

function buildIntakeDeepenAsk(v: any): string {
  const userText = _s(v?.userText, 1000);
  return `너는 소라고동이다. 반말로 말하듯이, 짧게. "~다"로 끝나는 서술체는 쓰지 않는다.
사용자가 첫 발화를 짧게 했다. 조금 더 풀어 말해달라고 한 번 묻는다.
판단하지 않는다. 강요하지 않는다. 한두 문장.
사용자 발화의 핵심 단어 하나를 그대로 받아서 질문에 넣는다.
칭찬, 위로, 이모지, 비유를 쓰지 않는다. "나도 그런 적 있어" 같은 말을 쓰지 않는다.

사용자 첫 발화: "${userText}"

[출력]
한두 문장만. 다른 글이나 따옴표를 쓰지 않는다.`;
}

function buildIntakeLongExample(v: any): string {
  const userText = _s(v?.userText, 1000);
  return `사용자가 첫 발화로 "${userText}" 라고 짧게 말했다.
이걸 풀어 쓴 긴 글 하나를 예시로 만든다. "이런 식으로 풀어 쓰면 된다"를 보여주는 용도다.
50-100자. 무슨 상황이었는지, 어떤 기분이었는지, 자기가 그걸 어떻게 보는지가 들어가게. 반말로 말하듯이 ("~였어", "~인 것 같아", "~하더라"). "~다"로 끝나는 서술체는 쓰지 않는다. 문장 사이는 "근데", "그래서" 같은 말로 잇는다. 평범한 한국어.
사용자 발화의 핵심은 그대로 두고 내용만 더한다. 사용자가 말하지 않은 사실을 지어내지 않는다.
칭찬, 이모지, 비유, 심리학 용어를 쓰지 않는다.

[출력]
긴 글 하나만. 다른 글이나 따옴표를 쓰지 않는다.`;
}

const INTAKE_4STAGE_LAST_USER = '아까 그 얘기, 4단계로 더 깊게 분석해줘. [상황] / [내가 본 것] / [이게 뭐냐면] / [이럴 땐 이렇게] / [오늘의 제안] 형식으로. [상황]은 사용자가 시도하려는 원래 문제를 한 줄로 요약한다 (50자 이내, 미션 결과 확인 모달용 — 화면에는 안 보인다). 그 외 4단에서는 네가 관찰한 패턴도 한 줄 인용한다. 반말로 말하듯이 쓰고 "~다"로 끝나는 서술체는 쓰지 않는다. 칭찬, 격려, 이모지, 비유, 심리학 용어를 쓰지 않는다.';

// ═══════════════════════════════════════════════════════════════
// Apply override
// ═══════════════════════════════════════════════════════════════

// _userContentType (또는 _endpoint default) 매칭 시 마지막 user message content 강제 합성.
// mission_verify 만 multimodal: 클라가 image+text 결합 array content 보냄 → text part 만 server template 으로 교체, image 보존.
// intake_4stage 는 multi-turn: 클라가 recentMsgs + 빈 placeholder user 메시지 보냄 → 마지막 user 의 content 만 server-side instruction 으로 교체.
export function applyUserContentTemplate(body: any): boolean {
  if (!Array.isArray(body?.messages) || body.messages.length === 0) return false;
  const _ep = body._endpoint;
  const _ct = body._userContentType;
  const _v = body._vars || {};

  // Build templates by (_ct, _ep) priority.
  let built: string | null = null;

  // mutation (4종, _ct 분기)
  if (_ep === 'mutation') {
    if (_ct === 'mutation_first_gen') built = buildMutationFirstGen(_v);
    else if (_ct === 'mutation_step_action') built = buildMutationStepAction(_v);
    else if (_ct === 'mutation_chat_reply') built = buildMutationChatReply(_v);
    else if (_ct === 'mutation_4field') built = buildMutation4Field(_v);
  }

  // extract_chapter (3종)
  else if (_ep === 'extract_chapter') {
    if (_ct === 'chapter_insight') built = buildChapterInsight(_v);
    else if (_ct === 'chapter_topics') built = buildChapterTopics(_v);
    else if (_ct === 'sim_extract') built = buildSimExtract(_v);
  }

  // extract_topic (2종 — temp_chat / chapter_chat)
  else if (_ep === 'extract_topic') {
    if (_ct === 'temp_chat') built = buildTopicTempChat(_v);
    else if (_ct === 'chapter_chat') built = buildTopicChapterChat(_v);
  }

  // decision_step (2종)
  else if (_ep === 'decision_step') {
    if (_ct === 'strategy_card') built = buildStrategyCard(_v);
    else if (_ct === 'today_proposal') built = buildTodayProposal(_v);
  }

  // archive_summary (4종)
  else if (_ep === 'archive_summary') {
    if (_ct === 'reflection_insight') built = buildArchiveReflection(_v);
    else if (_ct === 'pearl_polish') built = buildPearlPolish(_v);
    else if (_ct === 'sim_scenario') built = buildSimScenario(_v);
    else if (_ct === 'quiz_polish') built = buildQuizPolish(_v);
  }

  // analyze_4stage (force_analyze)
  else if (_ep === 'analyze_4stage' && _ct === 'force_analyze') {
    built = buildForceAnalyze(_v);
  }

  // synthesize (사용자 명시 2026-05-29 연결·통합 §4) — 흩어진 항목 → 핵심 노드 통합
  else if (_ep === 'synthesize') {
    built = buildSynthesize(_v);
  }

  // discover_insights (사용자 명시 2026-05-16 ultrathink)
  else if (_ep === 'discover_insights' && _ct === 'discover_insights') {
    built = buildDiscoverInsights(_v);
  }

  // semantic_dedup (사용자 명시 2026-05-26 ultrathink) — 빗자루 의미 페어 + merged 통합 표현
  else if (_ep === 'semantic_dedup' && _ct === 'semantic_dedup') {
    built = buildSemanticDedup(_v);
  }

  // magic_summary (default)
  else if (_ep === 'magic_summary') {
    built = buildMagicSummary(_v);
  }

  // review_insight (default)
  else if (_ep === 'review_insight') {
    built = buildReviewInsight(_v);
  }

  // chat_rolling_summary (default)
  else if (_ep === 'chat_rolling_summary') {
    built = buildRollingSummary(_v);
  }

  // shell_story (2종)
  else if (_ep === 'shell_story') {
    if (_ct === 'task_time') built = buildShellTaskTime(_v);
    else if (_ct === 'mission_complete') built = buildShellMissionComplete(_v);
  }

  // brain_dump (default)
  else if (_ep === 'brain_dump') {
    built = buildBrainDump(_v);
  }

  // daily_summary (default)
  else if (_ep === 'daily_summary') {
    built = buildDailySummary(_v);
  }

  // reflection card_summary (자체 type)
  else if (_ep === 'reflection' && _ct === 'card_summary') {
    built = buildReflectionCardSummary(_v);
  }

  // first_touch user content (default)
  else if (_ep === 'first_touch') {
    built = buildFirstTouchUserContent(_v);
  }

  // intake (3종)
  else if (_ep === 'intake') {
    if (_ct === 'intake_deepen_ask') built = buildIntakeDeepenAsk(_v);
    else if (_ct === 'intake_long_example') built = buildIntakeLongExample(_v);
    else if (_ct === 'intake_4stage') built = INTAKE_4STAGE_LAST_USER;
  }

  // mission_verify — multimodal (image + text). text part 만 server template 으로 교체.
  if (_ep === 'mission_verify') {
    const verifyText = buildMissionVerifyText(_v);
    const lastIdx = body.messages.length - 1;
    const last = body.messages[lastIdx];
    if (last && last.role === 'user' && Array.isArray(last.content)) {
      // image part 보존 + text part 교체 (또는 추가)
      const newContent = last.content.map((c: any) => {
        if (c?.type === 'text') {
          return { type: 'text', text: verifyText };
        }
        return c;
      });
      // text part 가 없었으면 push
      if (!newContent.some((c: any) => c?.type === 'text')) {
        newContent.push({ type: 'text', text: verifyText });
      }
      body.messages[lastIdx] = { role: 'user', content: newContent };
      return true;
    } else {
      // fallback — 단일 user text 메시지로
      body.messages[lastIdx] = { role: 'user', content: verifyText };
      return true;
    }
  }

  if (built == null) return false;

  // 마지막 user 메시지 content 강제 교체.
  const lastIdx = body.messages.length - 1;
  body.messages[lastIdx] = { role: 'user', content: built };
  return true;
}
