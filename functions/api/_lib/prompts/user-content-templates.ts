// 사용자 명시 2026-05-11 ultrathink: user message instruction 들 backend 이전 — 클라이언트 평문 노출 차단.
// 옛: 각 호출처가 user message content 안에 instruction text + 동적 변수 interpolation. 빌드 산출물에 평문 노출.
// 신: 클라이언트는 _endpoint + _userContentType + _vars 만 보냄. backend 가 endpoint+type 매칭하여 마지막 user message content 강제 override.
//     mission_verify 만 image+text 결합 — array content 안 text part 만 합성, image part 보존.

// ─── 변수 sanitize 헬퍼 ───
function _s(v: any, max = 5000): string {
  if (v == null) return '';
  return String(v).slice(0, max);
}

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
    sameLayerNote = `\n[5 가지 모두 — L1, L2, L3, L4, L5 각 1개. 제외 X.]`;
  } else if (mode === 'same') {
    sameLayerNote = `\n[지금 차원 보완 모드] 같은 차원 ${prevLayer} ${layerNames[prevLayer]||''} 에서만 1-2개. 사용자가 대화에서 짚은 *이유*를 한 구절 그대로 인용 후, 그 이유를 보완한 행동 작성. 옵션 객체마다 "reason" 필드 필수 (사용자 대화 인용, 30-60자). 옛 행동 똑같이 반복 X — 진짜 보완.`;
  } else {
    sameLayerNote = `\n이전이 ${prevLayer} 였으니 그 외 4 가지 각 1개.`;
  }
  const convoNote = recentMsgs
    ? `\n\n[지금까지 대화 — 이 사용자 컨텍스트 우선 반영]\n${recentMsgs}\n\n위 대화에서 사용자가 짚은 진짜 어려움을 옵션에 녹여. generic 답 X.`
    : '';
  const headerLine = firstGen
    ? `[주제 (토픽 → 전략 첫 결정화)] "${cardTitle}"\n[summary] ${cardSummary || '(없음)'}\n[원래 카테고리] ${cardSourceCategory || cardCategory || '?'}`
    : `[전략 카드] "${cardTitle}"\n[심리학 개념] ${cardPsychConcept || '(없음)'}\n[문제 상황] ${cardProblemContext || '(없음)'}\n[이전 가지 ${prevLayer} ${layerNames[prevLayer]||''}] "${prevAction}"\n[안 통한 미션] "${missionTitle}"`;
  const optionsExample = mode === 'same'
    ? `{ "options": [{"layer":"${prevLayer}","action":"보완된 행동","reason":"사용자 대화에서 인용한 이유 한 구절"}] }`
    : `{ "options": [{"layer":"L3","action":"오늘 저녁 7시까지 폰을 거실 충전기에 꽂아두기 — 손에 안 닿으면 자동 차단 (도파민 trigger 외부화)"},...] }`;

  return `${firstGen ? '토픽 → 전략 결정화: 첫 가지 5 옵션 (L1-L5 각 1개)' : (mode === 'same' ? '돌연변이 같은 차원 보완 옵션 1-2개 (이유 인용 + 보완)' : '돌연변이 진화 다른 차원 4 옵션')} (사용자 요청 2026-04-29: 대화 흐름 반영).

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
3. 네 사용자 ${cardTitle} 패턴에 맞게 — 일반론 X
4. 왜 도움되는지 1구절 포함 (예: "도파민 trigger 외부화", "결정 부담 ↓")
5. 관찰 친화: 의지 부담 ↓ 가지 (L3/L4) 우선, L1·L5는 신중하게
6. 한 줄 70-100자

[출력 JSON만 — 마크다운 X 따옴표 안 escape]
${optionsExample}

[절대 금지]
- "실패" / "안 됨" / "왜 못 했지" 단어
- 추상 다짐 ("열심히", "노력")
- 마크다운 / 줄바꿈 / 따옴표 escape`;
}

function buildMutationStepAction(v: any): string {
  const cardTitle = _s(v?.cardTitle, 100);
  const optLayer = _s(v?.optLayer, 4);
  const optAction = _s(v?.optAction, 300);
  const layerName = _s(v?.layerName, 30);
  return `사용자 가닥 "${cardTitle}" — 새 시도 차원: ${optLayer} ${layerName}\n행동: "${optAction}"\n\n[네 일]\n이 행동을 *오늘부터 바로 할 수 있도록* 구체적 step-by-step 3-5단계.\n각 단계: 짧고 명확하게 (한 줄 max 40자). 의지 부담↓ 환경 셋업 우선.\n\n[톤]\n진지 모드 친구. 외재화. "실패" 단어 X. 관찰 친화 (작은 단위).\n\n[출력 — 다른 거 X, 단계만]\n1. (첫 단계 — 가장 작게)\n2. ...\n3. ...\n\n도입 한 줄 + 단계 + 마무리 한 줄 ("시작 전에 더 얘기 X면 ✦ 해볼게로 등록").`;
}

function buildMutationChatReply(v: any): string {
  const cardTitle = _s(v?.cardTitle, 100);
  const traitsBlock = _s(v?.traitsBlock, 1500);
  const patternsBlock = _s(v?.patternsBlock, 1500);
  const valuesBlock = _s(v?.valuesBlock, 800);
  const cfLine = _s(v?.cfLine, 500);
  const diagLine = _s(v?.diagLine, 500);
  const allMsgs = _s(v?.allMsgs, 5000);
  return `너는 돌연변이 진화 임시 대화창 안 AI. "${cardTitle}" 가닥의 다음 시도를 사용자가 진지하게 고민 중.

[톤 — 진지 모드 (가벼운 ㅋㅋ / 농담 X)]
- 1-4문장. 차분한 친구. 외재화 ("X 패턴이 작동" / "이 도구 안 맞을 수도"). "실패" 단어 X.
- 사용자 페이스 따라가. 추궁성 질문 X.
- 사용자 메시지 짧아도 진지 톤 유지 (모드 sticky).
- 분석/제안 강요 X. 사용자가 자기 발견하도록.

[사용자 본인 데이터 — 우선 인용. generic textbook 단독 회피]
${traitsBlock ? '특성:\n' + traitsBlock : ''}
${patternsBlock ? '\n패턴:\n' + patternsBlock : ''}
${valuesBlock ? '\n가치:\n' + valuesBlock : ''}
${cfLine ? '\n' + cfLine : ''}
${diagLine ? '\n' + diagLine : ''}

[지금 대화 전체]
${allMsgs}

[네 응답만, 마크다운 X]`;
}

function buildMutation4Field(v: any): string {
  const oldCtx = _s(v?.oldCtx, 800);
  const layerName = _s(v?.layerName, 30);
  const optLayer = _s(v?.optLayer, 4);
  const optAction = _s(v?.optAction, 300);
  const recentMsgs = _s(v?.recentMsgs, 2000);
  return `진화한 새 가닥 — 카드 4 필드 정리.

${oldCtx}
[새 차원] ${layerName} (${optLayer})
[새 행동] ${optAction}
[돌연변이 대화]
${recentMsgs}

[네 일]
새 차원/행동 맞춰 진화한 카드의 4 필드 작성.

[출력 — 정확히 4줄]
TITLE: <짧은 제목, 5-14자>
PROBLEM: <문제 상황, 50-90자, 옛 가닥 안 통한 맥락 반영>
CONCEPT: <심리학 개념 + 1줄 설명, ${layerName} 차원 메커니즘, 30-80자>
ACTION: <전략적 행동, 50-120자, 구체적 무엇을 어떻게>

[금지] 마크다운, JSON, 따옴표, "실패" 단어, 추상적 다짐.`;
}

// ═══════════════════════════════════════════════════════════════
// 2. EXTRACT_CHAPTER (3종)
// ═══════════════════════════════════════════════════════════════

function buildChapterInsight(v: any): string {
  const source = _s(v?.source, 50);
  const userMsg = _s(v?.userMsg, 600);
  const cleanInsight = _s(v?.cleanInsight, 1200);
  return `다음은 사용자가 "✦ 깨달음으로" 보관한 메시지야 (출처: ${source}).
사용자가 의도적으로 가치 있다고 판단한 텍스트라서 자기 인식 / 패턴 / 가치관 신호가 있을 수 있어.

[사용자 직전 발화]
${userMsg || '(없음)'}

[깨달음 메시지 — AI(소라고동) 응답]
${cleanInsight}

이 깨달음에서 사용자(주체) 자신이 새로 발견 / 명확히 한 것 만 JSON으로 뽑아.
- ⚠️ AI(소라고동)의 가설·해석·"너 X해" 발화는 사용자 trait 후보 X. AI는 외부 관찰자.
- [사용자 직전 발화] 에 사용자 본인이 직접 표현한 자기 인식만 trait/value/pattern 후보.
- 깨달음 메시지(AI 응답)는 그 발화를 명명/연결한 lens일 뿐 — AI 가 단정한 명제 ≠ 사용자 자신의 인식.
- 사용자 직전 발화가 비어있거나 짧으면 → 모두 빈 배열.
- 추측·일반론 X. 근거 약하면 빈 배열.

{
  "new_traits": [{"name": "...", "description": "...", "confidence": 0.0~1.0}],
  "new_values": [{"name": "...", "description": "...", "sdt_need": "autonomy|competence|relatedness|null", "confidence": 0.0~1.0}],
  "new_patterns": [{"name": "...", "trigger": "...", "sequence": "...", "confidence": 0.0~1.0}],
  "case_formulation_update": {"new_problem": "...", "new_mechanism": "...", "new_strength": "...", "new_goal": "...", "new_growth": "..."}
}

JSON만, 다른 글 X.`;
}

function buildChapterTopics(v: any): string {
  const chatLog = _s(v?.chatLog, 8000);
  const isSim = !!v?.isSim;

  if (isSim) {
    return `사용자가 AI 친구 "소라고동"과 *상상 시뮬레이션* 컨텍스트에서 이어 나눈 대화.
가상 시나리오 + 사용자 답 → 깊은 대화. 진지한 자기 모델 데이터로 보지 X — 약한 행동 단서로만.

[규칙 — 매우 보수적]
- 강한 신호 (3+ 일관 evidence) 만 추출. confidence < 0.7 = 빈 배열.
- 가상 시나리오 시작이라 cf 5차원 (problems/mechanisms/strengths/goals/growth) / deep_profile_update 절대 출력 X.
- traits/values/patterns 만 — 행동 성향 / 가치 / 반응 패턴 수준.
- description 끝에 사용자 실제 발화 1줄 인용.

[대화 원문]
${chatLog}

[출력 — JSON만, 마크다운 X]
{
  "new_traits": [{"name": "...", "description": "...", "confidence": 0.0~1.0}],
  "new_values": [{"name": "...", "description": "...", "sdt_need": "autonomy|competence|relatedness|null", "confidence": 0.0~1.0}],
  "new_patterns": [{"name": "...", "trigger": "...", "sequence": "...", "confidence": 0.0~1.0}]
}`;
  }

  return `사용자가 AI 친구 "소라고동"과 한 챕터(연속 대화 묶음)에서 나눈 대화 전체.
챕터 전반에 걸쳐 발견된 사용자 자기 인식 / 패턴 / 가치관 / 문제·강점·목표를 JSON으로 추출.
강한 신호 (명시적 자기 인식, 행동·감정 증거 동반)만. 추측·일반론 X. 근거 약하면 빈 배열.

[필터 — 자동 거름]
- trivial 일상 (음식·날씨·일정·단순 사건·짧은 잡담) X. 일회성 진술 / 농담 / 일반론 X.
- 사용자 명시 발화 ("나는 ..." / "내가 ... 하더라" / "그때 ... 느꼈어") + 행동·감정 증거 1+ 함께일 때만 추출.
- confidence < 0.6 항목 빈 배열로 (강한 신호 아니면 등록 X).
- 각 description 끝에 사용자 실제 발화 1줄 인용 (예: 'description: 거절 후 부채감 — "거절했더니 미안한 마음이 며칠 가더라"').

[대화 원문]
${chatLog}

[출력 — JSON만]
{
  "new_traits": [{"name": "...", "description": "...", "confidence": 0.0~1.0}],
  "new_values": [{"name": "...", "description": "...", "sdt_need": "autonomy|competence|relatedness|null", "confidence": 0.0~1.0}],
  "new_patterns": [{"name": "...", "trigger": "...", "sequence": "...", "confidence": 0.0~1.0}],
  "case_formulation_update": {"new_problem": "...", "new_mechanism": "...", "new_strength": "...", "new_goal": "...", "new_growth": "..."},
  "deep_profile_update": {
    "development": {
      "childhood_addition": "어린 시절·가족·양육에 대한 새 정보 한 줄 (있을 때만, 사용자가 명시 언급)",
      "school_addition": "학창 시절 새 정보 한 줄",
      "adhd_addition": "자기 인식·발견 새 정보 한 줄 (진단명 발견 / 큰 깨달음 / 정체성 명명 등 — 사용자가 명시 언급한 것만)",
      "turning_point": {"when": "YYYY-MM 또는 시기", "title": "전환점 제목", "impact": "영향 한 줄"}
    },
    "relationships": [{"name": "이름 (있을 때)", "relation": "가족|친구|연인|동료|전문가|기타", "tone": "안전|자극|혼합", "influence": "positive|negative|mixed", "notes": "한 줄"}],
    "self_narrative": {
      "self_belief": "자신에 대한 신념 한 줄 (\"나는 ...\")",
      "world_belief": "세상에 대한 신념 한 줄 (\"세상은 ...\")",
      "future_belief": "미래에 대한 신념 한 줄 (\"미래는 ...\")",
      "identity_keyword": "정체성 keyword 1개"
    }
  }
}

deep_profile_update는 사용자가 챕터에서 명시적으로 언급한 정보만 (예: "엄마가 늘 비교해" / "그때 진단 받은 후 시야가 달라졌어" / "나는 패턴 인식이 강해"). 추측 X. 빈 부분은 빈 string 또는 null.

JSON만, 마크다운 X.`;
}

function buildSimExtract(v: any): string {
  const entriesBody = _s(v?.entriesBody, 8000);
  const entriesCount = Number(v?.entriesCount) || 0;
  return `사용자가 일상 가상 시나리오에 어떻게 반응할지 답한 시뮬 데이터.
가상 시나리오 — 깊은 자기 인식 데이터 X. 가벼운 행동 패턴 단서로만 활용.

[규칙 — 매우 보수적]
- 강한 신호 (3+ 시뮬에서 일관된 패턴) 만 추출.
- confidence < 0.7 항목 빈 배열 (보수적 임계값 — 챕터 추출 0.6 보다 ↑).
- 가상 시나리오라 절대적 자기 모델 X — 약한 단서로만 활용.
- 진단명 / 의료 용어 X.
- description 끝에 사용자 실제 답 1줄 인용 (예: 'description: 야행성 — "야행성이라 일단 호응부터 하고"').

[추출 가능 항목 — 행동 성향 / 가치 / 반응 패턴 만]
- new_traits: 행동 성향 (예: 야행성, 즉흥성, 회피)
- new_values: 가치 (예: 자율, 연결)
- new_patterns: 반응 패턴 (예: 거절 후 부채감)

[추출 X 항목 — cf 5차원 절대 X]
- problems / mechanisms / strengths / goals / growth 카테고리 출력 X. 시뮬 데이터로 진지한 자기 모델 갱신 X.

[시뮬 데이터 — 최근 ${entriesCount}개]
${entriesBody}

[출력 — JSON만, 마크다운 X]
{
  "new_traits": [{"name": "...", "description": "...", "confidence": 0.0~1.0}],
  "new_values": [{"name": "...", "description": "...", "sdt_need": "autonomy|competence|relatedness|null", "confidence": 0.0~1.0}],
  "new_patterns": [{"name": "...", "trigger": "...", "sequence": "...", "confidence": 0.0~1.0}]
}`;
}

// ═══════════════════════════════════════════════════════════════
// 3. EXTRACT_TOPIC (1종 — temp_chat. daily 는 별도 _buildExtractTopicPrompt 클라 빌더 보존)
// ═══════════════════════════════════════════════════════════════

function buildTopicTempChat(v: any): string {
  const sourceLabel = _s(v?.sourceLabel, 200);
  const context = _s(v?.context, 500);
  const chatLog = _s(v?.chatLog, 8000);
  return `사용자가 AI 친구 "소라고동"과 ${sourceLabel} 모드에서 나눈 대화를 토픽 카드로 정리해.

[컨텍스트] ${context || '(없음)'}

[대화 원문]
${chatLog}

[토픽 카드 추출 규칙]
- 의미 있는 토픽 1-3개 (잡담은 X)
- 카테고리 (V4 8 카테고리): diary | casual | concern | emotion | memory | todo | idea | relationship
- 각 카드: 짧은 제목 (~25자) + 1-2문장 요약
- 의미 없으면 빈 배열

[출력 형식 — JSON만]
{ "topics": [ { "title": "...", "summary": "...", "category": "concern" } ] }

JSON만, 마크다운 X.`;
}

function buildTopicChapterChat(v: any): string {
  const chatLog = _s(v?.chatLog, 8000);
  return `사용자가 AI 친구 "소라고동"과 나눈 한 챕터(연속된 대화 묶음)를 토픽 카드로 정리해.

[대화 원문]
${chatLog}

[토픽 카드 추출 규칙]
- 의미 있는 토픽 1-3개만 (잡담은 토픽 X)
- 카테고리 중 하나 선택 (V4 8 카테고리):
  · diary: 일기 / 그날 정서 기록
  · casual: 일상 / 가벼운 사실
  · concern: 고민 / 갈림길 / 큰 결정
  · emotion: 감정 / 마음 상태
  · memory: 기억할 순간 / 강한 인상
  · todo: 할 일 / 일감 / 마감
  · idea: 아이디어 / 통찰
  · relationship: 관계 / 사람
- 각 카드: 짧은 제목 (한 줄 ~25자) + 1-2문장 요약
- 의미 없는 짧은 잡담만 있으면 빈 배열 반환

[출력 형식 — 반드시 JSON만]
{
  "topics": [
    {
      "title": "이 일 계속할지 고민",
      "summary": "사람 갈등 + 진로 회의. 결정 못 내림.",
      "category": "concern"
    }
  ]
}

JSON만 출력. 마크다운 X. 다른 설명 X.`;
}

// ═══════════════════════════════════════════════════════════════
// 4. DECISION_STEP (2종)
// ═══════════════════════════════════════════════════════════════

function buildStrategyCard(v: any): string {
  const msgContent = _s(v?.msgContent, 1500);
  return `아래 4단 분석/전략 응답에서 "전략 카드"로 저장할 핵심을 뽑아줘.

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
${msgContent}

정확히 TITLE/PROBLEM/CONCEPT/ACTION 4줄만 출력.`;
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
    : `[전략] ${cardTitle}\n[전략 행동] ${cardActionStrategy}\n[심리학] ${cardPsychConcept}\n[사용자 상황] ${situation}`;
  return `${ctx}\n\n[네 일]\n위 정보 (전략·전략 행동·심리학 개념·사용자 상황) 셋 다 활용해서 '오늘의 제안' 1개 만들어.\n- "전략 행동" 그대로 복사 X — 오늘 사용자 상황에 맞춰 구체화/변형 필수\n- 한 줄 (max 40자). 동사로 시작. 환경 셋업 우선 (의지 부담 ↓).\n\n[출력]\n제안만 한 줄. 다른 거 X. 마크다운 X.`;
}

// ═══════════════════════════════════════════════════════════════
// 5. ARCHIVE_SUMMARY (4종)
// ═══════════════════════════════════════════════════════════════

function buildArchiveReflection(v: any): string {
  const messageContent = _s(v?.messageContent, 1500);
  const userQuestion = _s(v?.userQuestion, 400);
  return `아래 대화에서 사용자가 얻은 "지혜(깨달음)"를 뽑아.

[출력 — 정확히 두 줄]
1줄: 헤드라인 (5-14자, 명사형 또는 짧은 명제)
2줄: 본문 (1문장, 30-70자, 깨달음의 핵심을 ~음/~함/~임 어미로 끝맺음)

[좋은 예]
환경이 의지보다 강함
집중 안 될 때 자책 X. 카페로 옮기면 30% 더 됨.

거절은 빠를수록 가벼움
미루면 부채감 누적. 그날 안에 한 줄로 답하면 깨끗해짐.

새벽 결정 의심
졸린 상태 결정은 후회 빈도 ↑. 자고 일어난 후 다시 봐야 함.

[규칙]
- 본문 어미: ~음 / ~함 / ~임 (간결, 명제형). "이다" "하다" "되다" 등 X.
- "지혜" 추출: 사용자가 깨달은 것·앞으로 적용할 것
- 일반 응원·격언·"잘했어" X
- 마크다운/JSON/코드블록/따옴표/이모지 X
- "나는 ~다" 일반 서술 X

${userQuestion ? `[사용자 질문/맥락]\n${userQuestion}\n` : ''}[AI 응답 (이 안에서 지혜 추출)]
${messageContent}

두 줄만 출력.`;
}

function buildPearlPolish(v: any): string {
  const messageContent = _s(v?.messageContent, 1500);
  return `사용자가 행복했던/좋았던 순간을 진주(보석함)에 보관하려 해. 아래 메시지를 한 줄로 다듬어 — 나중에 다시 봐도 그 기분이 떠오르게.

[규칙]
- 한 줄, 20-60자
- 회상 톤 (그때 어떤 일이었고 어떤 느낌이었는지)
- 마크다운/JSON/따옴표/이모지 X
- 격언·조언·교훈 X
- "~좋았다 / ~행복했다 / ~따뜻했다" 같은 자연스러운 문장 OK
- 명령조 / 일반 서술 ("나는 ~다") X

[좋은 예]
한강에서 김치찌개 먹은 그날 바람이 살랑했음
엄마랑 통화하다 웃음이 터져서 30분을 더 떠들었음
새벽에 비 오는 소리 들으며 마신 따뜻한 차

[메시지]
${messageContent}

한 줄만 출력.`;
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
    return `사용자의 case formulation 데이터:
${cfSnapshot}

사용자가 적은 시나리오:
"${userScenario}"

이 사용자가 위 시나리오에서 어떻게 반응할지 짧게 예측.

[규칙 — 사용자 명시 2026-05-09]
- 1-2문장 (40-100자, 짧고 명료). 사용자 어휘 / cf 의 traits / patterns / strengths 살짝 반영.
- 친구 카톡 톤. 길게 풀지 X — 핵심만. 평가 X. 의료 진단 X.
- JSON 만 (마크다운 X).

[출력]
{
  "godongPrediction": "..."
}`;
  }
  // ai 모드 — 시나리오 + 예측 둘 다 생성. 카테고리 3개 server-side 셔플.
  const _shuffled = SCENARIO_CATEGORIES.slice().sort(() => Math.random() - 0.5);
  const _pickedCats = _shuffled.slice(0, 3);
  return `사용자의 case formulation 데이터:
${cfSnapshot}

[최근 시나리오 — 이거 피해서 다른 거]
${recentScenarioList || '(없음)'}

[이번 카테고리 후보 — 이 중 하나에서 만들어. 같은 카테고리라도 sub-scenario 다양하게]
1. ${_pickedCats[0]}
2. ${_pickedCats[1]}
3. ${_pickedCats[2]}

가벼운 일상 시나리오 1개 + 사용자가 그 상황에서 보일 행동을 짧게 예측해.

[규칙]
- scenario: 일상의 사소·가볍·재미있는 상황 1문장 (40-80자). 진지한 주제 X (마감 / 가족 갈등 / 진단 / 큰 결정 X).
  좋은 예: "친구가 새벽 2시에 떡볶이 먹자고 카톡 옴.", "카페 옆자리 사람 통화가 너무 시끄러움.",
          "엘리베이터 모르는 사람이 인사함.", "마트에 옛날 과자 신상 발견.",
          "갑자기 비 와서 우산 없이 나옴.", "지하철 옆 사람 가방에서 좋은 향 남."
- godongPrediction: 사용자 행동/반응 예측 1-2문장 (40-100자). cf 의 traits / patterns / strengths 살짝 반영.
  친구 카톡 톤. 길게 풀지 X. 평가 X.
- 같은 어휘 / 같은 패턴 (예: 카페 옆자리만 반복) 절대 X. 위 [최근 시나리오] 다 봐.
- 의료 진단 / 진단명 X. 마크다운 X.
- JSON 만.

[출력]
{
  "scenario": "...",
  "godongPrediction": "..."
}`;
}

function buildQuizPolish(v: any): string {
  const list = _s(v?.list, 3000);
  return `아래 항목 N개를 사용자에게 묻는 한 줄 의문문으로 변환.

[규칙]
- 각 줄 = "N. 의문문" 형식 (번호 + 점 + 의문문)
- 한 문장, ~30자 이내
- 친구 카톡 톤. 분석 보고서 X.
- 명사형 → 의문문. "저녁 무력감으로 작업 X" → "저녁에 무력감 느끼면 작업 안 되지?"
- "잠 부족 시 큰 결정 후회" → "잠 부족하면 큰 결정 후회하지?"
- 마크다운 / 따옴표 / 이모지 X.
- 항목 수 그대로. 빈 출력 X.

[좋은 예]
입력 1. 야행성
출력 1. 너 야행성이지?

입력 2. 거절 후 부채감 (거절 후 며칠 미안함)
출력 2. 거절하면 미안함 며칠 가지?

입력 3. 마감 직전 폭발력 신뢰 가능
출력 3. 마감 직전엔 폭발력 나오지?

[항목]
${list}

번호 + 점 + 의문문 형식으로만 N줄 출력.`;
}

// ═══════════════════════════════════════════════════════════════
// 6. ANALYZE_4STAGE (force_analyze)
// ═══════════════════════════════════════════════════════════════

function buildForceAnalyze(v: any): string {
  const dataDumpJson = _s(v?.dataDumpJson, 30000);
  return `너는 임상심리학자로서 이 사용자의 Case Formulation을 구축한다.

아래는 사용자 데이터야:

${dataDumpJson}

JSON으로 출력:

{
  "traits": [{"name": "...", "description": "근거와 함께", "confidence": 0.0-1.0}],
  "values": [{"name": "...", "description": "...", "sdt_need": "autonomy/competence/relatedness", "confidence": 0.0-1.0}],
  "patterns": [{"name": "...", "trigger": "...", "sequence": "...", "description": "...", "confidence": 0.0-1.0}],
  "case_formulation": {
    "problems": ["..."],
    "mechanisms": ["..."],
    "strengths": ["..."]
  }
}

원칙:
- 관찰 가능한 행동·표현에 근거.
- 사용자 실제 언어 반영.
- ADHD·직업·가치관 맥락 고려.
- 수면 시각 규칙성, 활력 변동, 2D affect 패턴, 미션 수락·완료 패턴도 해석.
- 활성 모드(월경, 마감 등) 컨텍스트로 분석.
- 각 카테고리 최대 6개씩 (5-10 X — 토큰 제한).
- JSON만 출력.
- 응답 잘리지 않게 짧고 구체적으로.

[필터 — 가벼운 거름] (사용자 명시 2026-05-08 ultrathink: 너무 빡빡 → 완화. "다음날 나에 대해 새로운 소식 보는 재미")
- 한 마디 잡담 (인사 / "ㅋㅋ" / 의미 X 발화) 만 패턴화 X. 일상의 작은 관찰도 OK — 음식 취향·날씨 반응·작은 습관 신호 환영.
- 자기상 / 감정 / 관계 / 갈등 / 변곡점 / 취향 / 일상 리듬 신호 다 OK.
- confidence ≥ 0.4 면 등록 (옛 0.6 너무 짠 — 새 발견 빈도 ↑).`;
}

// ═══════════════════════════════════════════════════════════════
// 7. MAGIC_SUMMARY
// ═══════════════════════════════════════════════════════════════

function buildMagicSummary(v: any): string {
  const decisionTitle = _s(v?.decisionTitle, 200);
  const stepTitle = _s(v?.stepTitle, 100);
  const chatLog = _s(v?.chatLog, 5000);
  return `사용자가 "${decisionTitle || '결정'}" 결정의 [${stepTitle}] 단계에서 마법고동(임시 대화)으로 도움 받음.

[대화 원문]
${chatLog}

[너의 일]
이 대화에서 사용자가 얻은 것 3 필드로 정리. 한국어, 간결, 친구 톤.

[출력 형식 — JSON만, 마크다운 X]
{
  "new_realization": "사용자가 새로 알게 된 것 (한 줄, ~40자)",
  "next_action": "다음 행동 (한 줄, 동사로 시작, ~30자)",
  "conclusion": "이 step 핵심 결론 (1-2문장, ~80자)"
}

빈 필드 X. 셋 다 채울 것. 무리하면 짧게라도.`;
}

// ═══════════════════════════════════════════════════════════════
// 8. REVIEW_INSIGHT
// ═══════════════════════════════════════════════════════════════

function buildReviewInsight(v: any): string {
  const arrsLength = Number(v?.arrsLength) || 0;
  const archiveText = _s(v?.archiveText, 3500);
  return `이 기간 사용자 깨달음 ${arrsLength}개. 핵심 통찰 한 단락 (3-4문장)으로 요약. 친구 톤, 외재화 ("X 패턴이 작동" / "너 X적이야" X), 따뜻하게.

${archiveText}

[출력 — 한 단락만, 마크다운/인용부호 X]`;
}

// ═══════════════════════════════════════════════════════════════
// 9. CHAT_ROLLING_SUMMARY (initial / update)
// ═══════════════════════════════════════════════════════════════

function buildRollingSummary(v: any): string {
  const existingSummary = _s(v?.existingSummary, 1500);
  const chatLog = _s(v?.chatLog, 7000);
  if (existingSummary) {
    return `사용자(나)와 AI(소라)의 같은 챕터 대화 흐름이 길어져서 누적 요약을 update.

[기존 요약]
${existingSummary}

[추가된 대화 + 누적]
${chatLog}

[너의 일]
한 단락 (4-6 문장) 요약. 대화 핵심 흐름 + 사용자가 무엇을 가지고 있었는지 + 어디까지 풀렸는지 + 최근 변화. 한국어, 친구 톤. 마크다운 X. 이 요약은 다음 응답에서 옛 대화 대신 prompt 에 들어감 — 대화 맥락 잃지 않게 핵심 보존.`;
  }
  return `사용자(나)와 AI(소라)의 한 챕터 대화 (옛 부분).

[대화 원문]
${chatLog}

[너의 일]
한 단락 (4-6 문장) 요약. 대화 핵심 흐름 + 사용자가 무엇을 가지고 있었는지 + 어디까지 풀렸는지. 한국어, 친구 톤. 마크다운 X. 이 요약은 다음 응답에서 옛 대화 대신 prompt 에 들어감 — 대화 맥락 잃지 않게 핵심 보존.`;
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
  return `사용자가 방금 작업을 완료했어. 이 순간을 기억할 수 있는 짧은 한 줄 또는 두 줄짜리 메모를 만들어.

[작업]
"${taskTitle}"
${taskDescription ? `설명: ${taskDescription}` : ''}
종류: ${taskKind}
시간: ${dateStr} ${timeStr}

[규칙]
- 1-2줄, 30자 이내
- 그 순간의 분위기를 살리되 과장 X
- 너무 시적이지 X, 너무 건조하지 X
- 친근한 반말
- "수고했어" 같은 칭찬 X
- 사용자가 나중에 봤을 때 그날을 떠올릴 수 있을 만한 작은 디테일
- 따옴표 X, 다른 설명 X

[좋은 예시]
"오후의 작은 마침표"
"세그포머 한 줄, 그래도 한 줄"
"메일 하나, 어깨 가벼워짐"
"마감 직전의 천재 모드"
"오늘 첫 번째 도파민"

한 줄만 출력. 따옴표 X.`;
}

function buildShellMissionComplete(v: any): string {
  const missionTitle = _s(v?.missionTitle, 200);
  const missionDescription = _s(v?.missionDescription, 500);
  return `사용자가 막 완료한 미션:\n"${missionTitle}"${missionDescription ? `\n(설명: ${missionDescription})` : ''}\n\n친구처럼 짧게 (1-2문장) 축하 메시지를 써줘. 규칙:\n- 미션 제목의 핵심 단어를 *그대로* 인용 (paraphrase / 다른 말로 바꾸기 X — "${missionTitle}" 의 단어 그대로).\n- 다른 행동 / 다른 미션 / 일반 충고 X — 이 미션 한정.\n- "잘했어!" 같은 판박이 평가 X. 과정·노력에 초점.\n- 반말. 이모지 최대 1개.`;
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
  const modeLabel = execMode === 'focus' ? '🔥 몰입 모드 — 급하고 중요한 일 우선' : '🌿 여유 모드 — 가벼운 것도 섞어줘';
  return `너는 사용자의 AI 친구 "소라고동". 사용자가 머릿속에 떠다니는 할 일들을 와다다 풀어놨어. 이걸 정리해서 "Now 3" 카드 3장과 나머지 "서랍장(drawer)" 항목으로 분류해.

[사용자 정보]
특성: ${traits || '아직 모름'}
패턴: ${patterns || '아직 모름'}
활성 모드: ${activeModes || '없음'}
선택 모드: ${modeLabel}

[브레인 덤프]
${dump}

[Now 3 구성 규칙]
- 정확히 3장 (가능하면)
- 각 카드: title (15자 이내), description (선택, 1줄), weight, energy
- weight: 'main' (무거운 메인) / 'light' (5분컷 가벼움) / 'daily' (샴푸 사기 같은 일상)
- energy: 'high' (무거움) / 'medium' / 'low' (가벼움)

[몰입 모드일 때]
- 무거운 메인 위주 (main 2-3개)
- 마감/긴급한 거 최우선

[여유 모드일 때 — 황금비율]
- main 1개 (가장 중요)
- light 1개 (5분컷 쉬운 거)
- daily 1개 (샴푸 사기, 메일 답장 같은 일상)
- 도파민 충전용 가벼운 거 먼저 깰 수 있게

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
- 사용자가 적은 거 그대로 쓰지 마. 살짝 다듬어. ("아 맞다 샴푸 사야 함" → "샴푸 사기")
- 추측 X. 사용자가 적은 항목만 사용.
- 비슷한 거 묶지 마. 별개 항목.
- JSON만 출력. 다른 설명 X.`;
}

// ═══════════════════════════════════════════════════════════════
// 11.5. DAILY_SUMMARY
// ═══════════════════════════════════════════════════════════════

function buildDailySummary(v: any): string {
  const dateLabel = _s(v?.dateLabel, 50);
  const checkinSummary = _s(v?.checkinSummary, 1500);
  const chatLog = _s(v?.chatLog, 6000);
  return `${dateLabel}의 기록이야. 일기를 안 썼지만 그 날 흔적으로 짧은 요약을 만들어줘.

[체크인]
${checkinSummary}

[그 날 대화]
${chatLog}

[요약 규칙]
- 1단락, 2-4문장 (150자 이내)
- 그 날의 감정·상황·중요한 일만
- 사용자 시점 ("나는 ~했다") 자연스럽게
- 친근한 톤, 반말 OK
- 형식: 그냥 한 단락. 제목 X, 불릿 X
- 정보 적으면 정직하게 짧게 ("기록 적은 하루. 체크인 보면 ~")

[좋은 예시]
"활력 낮고 기분도 다운된 하루. 소라랑 짧게 압박감에 대해 얘기. 별다른 행동은 없었지만 자기 인식 있었음."

요약만 출력. 다른 설명 X.`;
}

// ═══════════════════════════════════════════════════════════════
// 12. MISSION_VERIFY (image + text — text 부분만 server-side 합성)
// ═══════════════════════════════════════════════════════════════

function buildMissionVerifyText(v: any): string {
  const missionTitle = _s(v?.missionTitle, 200);
  const missionDescription = _s(v?.missionDescription, 500);
  return `사용자가 "${missionTitle}" 미션을 완료했다고 인증샷을 올렸어. 사진이 미션과 합리적으로 일치하는지 판단해줘.\n\n미션 설명: ${missionDescription || '(없음)'}\n\n응답: JSON만 출력. 다른 설명 X.\n{ "verified": true 또는 false, "reason": "한 문장. 친근한 반말. 통과면 격려, 실패면 부드럽게." }\n\n판단 기준: 너무 엄격하지 X. 모호하면 통과. 명백히 무관하거나 빈 화면일 때만 거절. 안티-수치심 톤 — '검증' X '축하/안내'.`;
}

// ═══════════════════════════════════════════════════════════════
// 13. REFLECTION (card_summary)
// ═══════════════════════════════════════════════════════════════

function buildReflectionCardSummary(v: any): string {
  const trimmed = _s(v?.trimmed, 300);
  return `다음 질문을 카드에 한 줄로 넣을 수 있게 짧게 요약. 10-25자, 명사형 또는 짧은 명제. 따옴표/마크다운 X.\n\n원본:\n${trimmed}\n\n짧은 요약 한 줄만 출력.`;
}

// ═══════════════════════════════════════════════════════════════
// 14. FIRST_TOUCH (user content)
// ═══════════════════════════════════════════════════════════════

function buildFirstTouchUserContent(v: any): string {
  const userMsgsText = _s(v?.userMsgsText, 2500);
  const entriesText = _s(v?.entriesText, 1500);
  const modesText = _s(v?.modesText, 200);
  const vitalityText = _s(v?.vitalityText, 50);
  return `사용자가 처음 앱에 진입해 코어 #1 (하면서 익히기) 튜토리얼을 끝냈다. 이 동안 사용자가 남긴 첫 데이터로 가벼운 첫 관찰을 작성한다.

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
}

// ═══════════════════════════════════════════════════════════════
// 15. INTAKE (user content — deepen_ask / long_example)
//   intake_4stage 는 multi-turn (recentMsgs + 마지막 instruction). 마지막 user 메시지 instruction 만 server-side.
// ═══════════════════════════════════════════════════════════════

function buildIntakeDeepenAsk(v: any): string {
  const userText = _s(v?.userText, 1000);
  return `너는 소라고동 — 자기관찰 친구. 따뜻 + 짧게 + 반말.
사용자가 첫 발화로 짧게 말했어. 한 번 더 풀어달라 부탁해.
판단 X. 강요 X. 1-2 문장 follow-up 질문.
사용자 발화의 핵심어 1개를 자연스럽게 paraphrase 안에 넣어.

사용자 첫 발화: "${userText}"

[출력]
1-2 문장만. 다른 글 X. 따옴표 X.`;
}

function buildIntakeLongExample(v: any): string {
  const userText = _s(v?.userText, 1000);
  return `사용자가 첫 발화로 "${userText}" 라고 말했어 (짧음).
이걸 자연스럽게 풀어 적은 장문 entry 1개를 모방용으로 생성해 — "이런 식으로 풀면 돼" 학습용.
50-100자, 상황 + 감정 + 자기관찰 3축, 반말, 자연 한국어.
사용자 발화의 핵심 그대로 살리면서 살 붙임.

[출력]
장문 entry 1개만. 다른 글 X. 따옴표 X.`;
}

const INTAKE_4STAGE_LAST_USER = '아까 그 얘기, 4단계로 더 깊게 분석해줘. [상황] / [내가 본 것] / [이게 뭐냐면] / [이럴 땐 이렇게] / [오늘의 제안] 형식으로. [상황]은 사용자가 시도하려는 *원래 문제*를 한 줄로 요약 (50자 내, 미션 결과 체크 모달용 — 화면엔 안 보임). 그 외 4단은 네가 관찰한 패턴도 한 줄 자연스럽게 인용해줘.';

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
