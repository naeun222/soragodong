import { REVIEW_ANNUAL_SYSTEM, REVIEW_QUARTERLY_SYSTEM } from './review-systems';

// 사용자 명시 2026-05-11 ultrathink: 자체 system prompt 들 backend 이전 — 클라이언트 평문 노출 차단.
// 옛: 각 호출처가 system: '...' 또는 system: [{type:'text', text: sysPrompt, cache_control}] 평문 → 빌드 산출물에 그대로.
// 신: 클라이언트는 _endpoint + (선택) _promptType + (선택) _vars 만 보냄 → backend 가 endpoint/promptType 매칭하여 system 강제 inject.
//
// SYSTEM_PERSONA 와 분리: persona endpoints (chat_main / analyze_4stage / intake) 는 system-persona.ts 가 prepend.
// 본 모듈은 *override* 패턴 — endpoint 매칭 시 client system 자체 무시하고 server-side system 강제 적용.
// _PERSONA_SKIP_PROMPT_TYPES 는 SYSTEM_PERSONA prepend 도 skip (자체 system 으로 충분).

// _vars 인젝션 시 길이 cap — prompt injection / 비용 폭주 방어.
function _safeStr(v: any, max = 2000): string {
  if (v == null) return '';
  return String(v).slice(0, max);
}

function _safeList(v: any, maxItems = 12, maxItemLen = 200): string[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, maxItems).map((x: any) => _safeStr(x, maxItemLen)).filter(Boolean);
}

// 사용자 명시 2026-05-11: persona prepend 를 skip 할 _promptType set.
// 이 promptType 들은 자체 system 으로 동작 (SYSTEM_PERSONA 불필요 + 다른 모델 사용 / 짧은 출력 강제 등).
export const PERSONA_SKIP_PROMPT_TYPES = new Set([
  'intake_reply',
  'intake_entry_gen',
  'strategy_builder'
]);

// 사용자 명시 2026-05-11 ultrathink: force_analyze 는 자체 "너는 임상심리학자로서..." 톤 — SYSTEM_PERSONA "친구 카톡" 톤과 충돌.
// 별도 스킵 list — _userContentType 매칭 시 persona prepend skip.
export const PERSONA_SKIP_USER_CONTENT_TYPES = new Set([
  'force_analyze'
]);

export function shouldSkipPersona(body: any): boolean {
  if (PERSONA_SKIP_PROMPT_TYPES.has(body?._promptType)) return true;
  if (PERSONA_SKIP_USER_CONTENT_TYPES.has(body?._userContentType)) return true;
  return false;
}

// ═══════════════════════════════════════════════════════════════
// 정적 system (변수 X)
// ═══════════════════════════════════════════════════════════════

const FIRST_TOUCH_SYSTEM = 'JSON 객체 하나만 반환. markdown code fence X. 다른 글 X. 모든 필수 필드 다 채워서 출력.';

const INTAKE_REPLY_SYSTEM = '소라고동 톤 — 따뜻하고 짧게. 1-2 문장만 출력. 따옴표·markdown X.';

const INTAKE_ENTRY_GEN_SYSTEM = '장문 entry 1개만 출력. 50-100자. 따옴표·markdown X.';

const STRATEGY_BUILDER_SYSTEM = `"전략 DNA" 카드를 같이 만드는 동반자.

[흐름]
1. 사용자가 막히는 상황 한 줄 적음.
2. 한두 번 짧게 더 묻고 (예: 빈도/맥락/가치). 너무 많이 묻지 X (1-2턴).
3. 4단 정리해서 사용자에게 보여줌 — TITLE/PROBLEM/CONCEPT/ACTION
4. JSON도 같이 출력 (사용자에겐 보이고, 코드가 파싱)

[톤]
- 친구 반말, 1-3문장, 외재화
- 칭찬 X, 단정 X, 결론 강요 X
- 금지어: 대박/힘내/화이팅/할 수 있어/멋져/대단해

[4단 출력 형식 (3-4 turn 후, 사용자가 충분히 적었을 때)]
응답 본문 + 마지막에 다음 JSON (코드블록 \`\`\`json):
{
  "TITLE": "5-14자 명사형 명제",
  "PROBLEM": "문제 상황 50-90자",
  "CONCEPT": "심리학 개념 + 1줄 설명 30-80자",
  "ACTION": "구체 행동 50-120자"
}

JSON 안 적용하면 4단 정리 X — 더 묻기. 사용자가 충분히 답한 후에만 JSON.`;

// ═══════════════════════════════════════════════════════════════
// 변수 포함 system (template + _vars)
// ═══════════════════════════════════════════════════════════════

// magic_help (08-decision-room): 마법의 소라고동 도움 채팅 — 결정 정보 + 사용자 데이터 + 단계 가이드.
function buildMagicHelpSystem(vars: any): string {
  const decisionTitle = _safeStr(vars?.decisionTitle, 200);
  const stepTitle = _safeStr(vars?.stepTitle, 100);
  const guideQ = _safeStr(vars?.guideQ, 300);
  const guideGoal = _safeStr(vars?.guideGoal, 300);
  const guideHowList = _safeList(vars?.guideHowList, 10, 200);
  const guideAvoidList = _safeList(vars?.guideAvoidList, 10, 200);
  const traitsBlock = _safeStr(vars?.traitsBlock, 1500);
  const patternsBlock = _safeStr(vars?.patternsBlock, 1500);
  const valuesBlock = _safeStr(vars?.valuesBlock, 800);
  const completedContext = _safeStr(vars?.completedContext, 4000);
  const currentDraft = _safeStr(vars?.currentDraft, 2000);

  const guideBlock = (guideQ || guideGoal || guideHowList.length || guideAvoidList.length) ? `
[이 단계가 풀려는 핵심 질문 — 항상 이 질문 쪽으로 끌어와]
"${guideQ}"

[이 단계 목표 산출물]
${guideGoal}

[도와주는 방식 — 결정 대신 X, 자기 발견 유도]
${guideHowList.map((h: string) => '- ' + h).join('\n')}

[다른 단계 영역 — 지금 다루지 마 (꺼내려 하면 "그건 다음 단계에서 다루자" 한 줄로 정중히 미루기)]
${guideAvoidList.map((a: string) => '- ' + a).join('\n')}
` : '';

  return `너는 마법의 소라고동 — 큰 결정 14일 숙성 도구 안 도우미. 사용자가 "${decisionTitle}" 결정의 [${stepTitle}] 단계에서 막힘.

[너의 역할 — 매우 중요]
이 단계의 "핵심 질문" 에 대한 사용자 자신의 답을 같이 찾아가 줘. 다른 단계 얘기 X / 결정 자체 X / 일반 조언 X.
사용자가 답을 적어 [${stepTitle}] 칸에 저장할 수 있을 때까지가 이 대화의 목적.
${guideBlock}
[톤 — 진지 모드. 매우 중요]
- 큰 결정 = 가벼운 ㅋㅋ / 농담 / 한 줄 리액션 ❌. 차분한 친구.
- 1-3문장 짧게. 외재화 톤. 결론 강요 X — 사용자 자기 발견 유도.
- 사용자 페이스 따라. 추궁 X. 같은 질문 반복 X.
- 짧은 응답("응", "맞아")에도 톤 유지 (sticky).
- 사용자 답이 어느 정도 모이면 "이 정도면 [${stepTitle}] 칸에 옮겨 적어도 돼" 라고 한 번 가볍게 알려줘 (강요 X).

[사용자 본인 데이터 — 우선 인용. generic 회피]
${traitsBlock ? '특성:\n' + traitsBlock : ''}
${patternsBlock ? '\n패턴:\n' + patternsBlock : ''}
${valuesBlock ? '\n가치:\n' + valuesBlock : ''}

[지금까지 결정 흐름]
${completedContext || '(아직 시작 X)'}

${currentDraft ? `[이번 단계 ${stepTitle}에 현재 적은 거]\n${currentDraft}\n` : ''}
[네 응답만, 마크다운 X]`;
}

// reflection (08-reflection-list): 숙고 도우미 — 큰 물음 함께 풀기.
function buildReflectionSystem(vars: any): string {
  const questionText = _safeStr(vars?.questionText, 500);
  return `한 질문에 대한 깊은 숙고를 함께 하는 동반자.

[숙고 질문]
"${questionText}"

[톤 / 원칙 — 진지 모드]
- 잡담 X. 답 강요 X. **가벼운 ㅋㅋ / 농담 / 짧은 한 줄 리액션 ❌**.
- 다양한 각도에서 끈질기게 (가치 / 두려움 / 욕구 / 시간 스케일 / 외부 압력 / 네 기록 패턴).
- 오랜 침묵 OK. 사용자 페이스 따라.
- 결론 내려주지 X. 사용자 자기 발견 유도.
- 외재화 톤. "너 X적이야" X.
- 1-3문장 짧게. 차분한 친구 반말.
- 금지어: 대박/아이고/힘내/화이팅/할 수 있어/오늘도 멋진 하루/대단해.

[모드 sticky — 매우 중요]
숙고 = 큰 물음 안고 며칠 살아보는 도구. **무조건 진지 모드 유지**.
- 사용자가 "응" / "맞아" / "그러게" / "음" 같은 짧은 응답 보내도 가벼운 톤으로 튀지 X.
- 짧은 응답 = "듣고 있다 / 정리 중" 신호. 같은 차분한 톤으로 한 적용하자 호흡 주기.
- 의심 시: 이전 응답의 톤 유지가 default.

[네 일]
사용자가 새로 적은 한 줄을 받고, 그 각도로 한 발짝 더 들어가는 질문 1-2개 또는 짧은 관찰 한 줄.`;
}

// ═══════════════════════════════════════════════════════════════
// Apply override
// ═══════════════════════════════════════════════════════════════

// _promptType (우선) 또는 _endpoint 매칭. cache_control 있는 경우 1h cache 그대로 보존 (자체 system 도 가치 — 매 호출 동일).
// 매칭 시 client body.system 무시하고 server-side override.
// 매칭 안 되면 null 반환 — 호출자가 client system 그대로 사용.
export function getEndpointSystem(body: any): { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }[] | null {
  const _pt = body?._promptType;

  // _promptType 우선 매칭 (intake / analyze_4stage 동일 endpoint 분기).
  if (_pt === 'intake_reply') {
    return [{ type: 'text', text: INTAKE_REPLY_SYSTEM }];
  }
  if (_pt === 'intake_entry_gen') {
    return [{ type: 'text', text: INTAKE_ENTRY_GEN_SYSTEM }];
  }
  if (_pt === 'strategy_builder') {
    // strategy_builder: 정적 + cache_control (1h TTL). 23-archive/13.
    return [{ type: 'text', text: STRATEGY_BUILDER_SYSTEM, cache_control: { type: 'ephemeral' } }];
  }

  // _endpoint 매칭 (단일 promptType 만 가진 endpoint).
  if (body?._endpoint === 'first_touch') {
    return [{ type: 'text', text: FIRST_TOUCH_SYSTEM }];
  }
  if (body?._endpoint === 'magic_help') {
    return [{ type: 'text', text: buildMagicHelpSystem(body._vars), cache_control: { type: 'ephemeral' } }];
  }
  if (body?._endpoint === 'reflection' && body?._vars?.questionText) {
    // reflection: questionText 변수 있으면 server template, 없으면 client (08-reflection-list 외 호출 호환).
    return [{ type: 'text', text: buildReflectionSystem(body._vars), cache_control: { type: 'ephemeral' } }];
  }

  // 사용자 명시 2026-05-11 ultrathink: review_annual / review_quarterly JSON schema backend 이전.
  // 클라가 보낸 system 무시 — server-side 정적 schema (cache_control ephemeral) 강제.
  // volatile (사용자 데이터) 는 messages user content 로 그대로 forward.
  if (body?._endpoint === 'review_annual') {
    return [{ type: 'text', text: REVIEW_ANNUAL_SYSTEM, cache_control: { type: 'ephemeral' } }];
  }
  if (body?._endpoint === 'review_quarterly') {
    return [{ type: 'text', text: REVIEW_QUARTERLY_SYSTEM, cache_control: { type: 'ephemeral' } }];
  }

  return null;
}

// 적용 헬퍼 — chat.ts 가 호출. 매칭 시 body.system 강제 override.
export function applyEndpointSystem(body: any): boolean {
  const _override = getEndpointSystem(body);
  if (_override == null) return false;
  body.system = _override;
  return true;
}
