// 톤 가드 — 고동 1인칭 LLM 응답 hard/soft regex 검사.
// hard 위반 = retry trigger (4회 실패 시 skip). soft = warn 만, 통과.
// 사용자 명시 2026-05-17 (_godong-llm-arch.md Section 5 + _hook-system-spec.md Section 8 → backend 이식).
//   frontend godong-diary modal 의 동일 regex 와 sync.

export type ToneViolations = {
  hard: string[];   // 위반 가드 이름들
  soft: string[];
};

export type ToneGuardOpts = {
  requiresQuestion?: boolean;  // true 면 끝에 ? 없으면 soft 위반 추가 (hook 한정)
};

const HARD_GUARDS: Record<string, RegExp> = {
  sycophancy:      /힘내|화이팅|괜찮아질|잘하고 있어|대단해|멋져/,
  diagnosis:       /\bADHD\b|우울증|우울장애|불안장애|PTSD|강박장애/i,
  emoji:           /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}]/u,
  advice:          /(?:해봐\b|하자\b|가\s*좋(?:아|을)|필요해|보면\s*좋|(?<![가-힣])해보자(?![가-힣]))/,
  youPronoun:      /(?<![가-힣])너(?:가|는|랑|한테|를|의|에게|와)(?![가-힣])/,
  formalLex:       /(?:인 것이다|라 할 수 있|로 추정|로 보인다|라는 점|것으로 보인|것이라고)/,
  metaLex:         /(?:관찰\s*되|분석\s*[하되]|패턴이\s*나타|경향이\s*나타|성향이\s*보|특성이\s*드러)/,
  assistant:       /(?:도와드릴게요|알려드리겠|드릴게요|드리겠습니다)/,
};

// event-trigger 명사 — 2개 이상 등장 시 사건 혼재 (별도 처리, 단일 출현 OK).
const EVENT_NOUNS_REGEX = /(?:회사|학교|카페|한강|영화관|병원|공원|식당|마트|약국|회의실|사무실)|(?:엄마|아빠|친구|동생|언니|오빠|누나|선배|후배|남친|여친|남자친구|여자친구|상사|동료|아이|아기)|(?:김치|김밥|커피|밥|술|영화|드라마|운동|산책|시험|점심|저녁|아침|회식|미팅|약속)/g;

const SOFT_GUARDS: Record<string, RegExp> = {
  banGyeol: /잔잔한 결|가벼운 결|단단한 결|부드러운 결|결 따라/,
};

const REQUIRES_QUESTION = /[?？]\s*$/;

export function checkTone(body: string, opts: ToneGuardOpts = {}): ToneViolations {
  const text = String(body || '');
  const hard: string[] = [];
  const soft: string[] = [];

  for (const [name, re] of Object.entries(HARD_GUARDS)) {
    if (re.test(text)) hard.push(name);
  }

  // multi-event-noun: 2종 이상 = 사건 혼재
  const eventMatches = new Set<string>();
  const eventRe = new RegExp(EVENT_NOUNS_REGEX.source, EVENT_NOUNS_REGEX.flags);
  let m: RegExpExecArray | null;
  while ((m = eventRe.exec(text)) !== null) eventMatches.add(m[0]);
  if (eventMatches.size >= 2) hard.push('multiEventNouns');

  for (const [name, re] of Object.entries(SOFT_GUARDS)) {
    if (re.test(text)) soft.push(name);
  }

  if (opts.requiresQuestion && !REQUIRES_QUESTION.test(text)) {
    soft.push('no-question-mark');
  }

  return { hard, soft };
}
