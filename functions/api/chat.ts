// Cloudflare Pages Functions — Anthropic API 프록시.
// POST /api/chat — 인증 + budget check + Opus 가드 (Premium 전용 + 일일 30번) + Anthropic 호출 + 사용량 logging + 차감 (welcome bonus 우선 소진).

import { verifyAuth, unauthorized, jsonResponse, type Env } from './_lib/auth';
import { recordUsage, calculateCost } from './_lib/usage';
import { checkBudget, deductCost, getUserBilling, ensureBillingRow, promoteGuestToEarlyLight, OPUS_DAILY_LIMIT_PREMIUM } from './_lib/billing';
import {
  checkAndIncIpRate,
  checkGlobalGuestBudget,
  recordGuestCost,
  extractClientIp,
  type GuestEnv
} from './_lib/rate-limit';
import { verifyTurnstileToken } from './_lib/turnstile';

// 사용자 명시 2026-05-05: 게스트 (anonymous) 사용자 max_tokens 강제 cap — 비용 폭주 방어.
// chat = 800 (대화 응답). 분석 endpoint (extract_chapter / extract_topic / intake / first_touch) = 2000 (JSON 출력 길이 보장).
// $0.30 cap 이 1차 방어선 — max_tokens 는 단일 응답 길이만 제한.
// 사용자 보고 2026-05-06 ultrathink (재): intake hypotheses 3개 + 한국어 description → 1500 도 borderline truncate.
//   → 2000 으로 상향. 게스트 비용은 daily $0.30 cap 으로 별도 제한.
const GUEST_MAX_TOKENS_CAP = 800;
const GUEST_ANALYSIS_MAX_TOKENS = 2000;
const GUEST_ANALYSIS_ENDPOINTS = new Set(['extract_chapter', 'extract_topic', 'intake', 'first_touch']);
// 게스트 = Sonnet/Haiku 기본 허용. Opus 는 chat-style endpoint 에선 차단 (Premium 전용),
// 분석/추출 endpoint (intake / analyze_4stage / extract_* / review_* 등) 에선 통과.
// 사용자 보고 2026-05-09: 게스트 첫 진입 intake 4단 분석 (Opus) 차단되던 케이스 — 분기 도입.
const GUEST_BASE_ALLOWED_MODELS = new Set(['claude-sonnet-4-6', 'claude-haiku-4-5']);
// chat-style endpoint = 사용자 직접 발화 (메인 대화 / 도움 채팅 / 깊은 분석 채팅 / 돌연변이 채팅).
// 사용자가 헤더 토글로 useOpus 선택 시 발생 — 게스트는 여기서만 Opus 차단.
const CHAT_STYLE_ENDPOINTS = new Set([
  'chat_main',
  'magic_help',
  'reflection',
  'decision_step',
  'mutation',
  'archive_summary'
]);

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

// 사용자 명시 2026-05-08 ultrathink (audit FAIL #5): 서버측 자살예방 가드 — body 안 user 메시지 detect.
// 보수 list — false positive OK / false negative X. 클라이언트 13-crisis-detection.js 와 동일 키워드.
const _CRISIS_KEYWORDS_SERVER = [
  '죽고 싶', '죽어버리', '죽었으면', '사라지고 싶', '사라져버리',
  '더 이상 못 살', '더 못 살', '끝내고 싶', '끝내버리', '혼자 끝내',
  '뛰어내리', '없어지고 싶', '없어져버리', '자해', '자살',
  '살기 싫', '살고 싶지 않', '살아갈 의미'
];

function _detectCrisisInRequest(body: any): boolean {
  const messages = body?.messages;
  if (!Array.isArray(messages)) return false;
  for (const m of messages) {
    if (m?.role !== 'user') continue;
    let text = '';
    if (typeof m.content === 'string') {
      text = m.content;
    } else if (Array.isArray(m.content)) {
      text = m.content.map((c: any) => (c?.text || c?.content || '')).join(' ');
    }
    if (_CRISIS_KEYWORDS_SERVER.some(k => text.includes(k))) return true;
  }
  return false;
}

// 사용자 보고 2026-05-05 ultrathink: 'AI 서버 일시 과부하' 토스트 빈도 ↓ — Anthropic upstream 5xx + network throw 1회 재시도 (2s backoff).
// 클라이언트 callAnthropic 에도 1회 retry 가 있어 총 최대 4회 시도 (backend 2 + client 2). 일반 케이스는 1-2회 안 회복.
async function _fetchAnthropicWithRetry(
  headers: Record<string, string>,
  bodyJson: string,
  signal?: AbortSignal
): Promise<Response> {
  const init: RequestInit = { method: 'POST', headers, body: bodyJson, signal };
  let resp: Response;
  try {
    resp = await fetch(ANTHROPIC_URL, init);
  } catch (e: any) {
    console.warn('[chat.ts] Anthropic upstream throw:', e?.message || e);
    await new Promise(r => setTimeout(r, 2000));
    try {
      return await fetch(ANTHROPIC_URL, init);
    } catch (e2: any) {
      console.error('[chat.ts] Anthropic upstream retry throw:', e2?.message || e2);
      throw new Error('Anthropic upstream unreachable: ' + (e2?.message || String(e2)));
    }
  }
  if (resp.status >= 500 && resp.status < 600) {
    const _statusForLog = resp.status;
    console.warn(`[chat.ts] Anthropic upstream ${_statusForLog} — 2s 후 1회 재시도`);
    await new Promise(r => setTimeout(r, 2000));
    try {
      const retry = await fetch(ANTHROPIC_URL, init);
      if (retry.status >= 500) console.warn(`[chat.ts] retry 도 ${retry.status}`);
      return retry;
    } catch (e: any) {
      console.warn('[chat.ts] retry throw:', e?.message || e);
      return resp;
    }
  }
  return resp;
}

// 사용자 명시 2026-05-02 ultrathink: Opus = Premium 전용 + 일일 30번 한도 (메인 대화 한정).
// 튜토리얼 모드 (body.tutorial_mode === true) = 자유. 일반 사용자가 useOpus 토글 시도 시 client 가드 + server 검증 (이중).
async function checkOpusGate(env: Env, userId: string, isTutorial: boolean): Promise<{
  ok: boolean;
  code?: string;
  error?: string;
  status?: number;
  used?: number;
  remaining?: number;
  limit?: number;
}> {
  if (isTutorial) return { ok: true };
  const billing = await getUserBilling(env, userId);
  const isPremium = billing?.subscription_active && billing.subscription_plan === 'premium';
  if (!isPremium) {
    return { ok: false, code: 'OPUS_PREMIUM_ONLY', error: 'Opus 는 Premium 전용', status: 403 };
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, code: 'ENV_MISSING', error: 'env missing', status: 500 };
  }
  try {
    const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/consume_opus_daily_atomic`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_user_id: userId, p_limit: OPUS_DAILY_LIMIT_PREMIUM })
    });
    const data: any = await resp.json().catch(() => ({}));
    if (!data?.ok) {
      return {
        ok: false,
        code: 'OPUS_DAILY_LIMIT',
        error: 'Opus 일일 한도 도달',
        status: 429,
        used: data?.used,
        limit: data?.limit ?? OPUS_DAILY_LIMIT_PREMIUM
      };
    }
    return {
      ok: true,
      used: data?.used,
      remaining: data?.remaining,
      limit: data?.limit ?? OPUS_DAILY_LIMIT_PREMIUM
    };
  } catch (e: any) {
    console.warn('[opus-gate] RPC 실패:', e);
    // RPC 실패 시 fail-open (Premium 검증은 통과했으므로 일일 한도만 누락) — 보수적으로 통과.
    return { ok: true };
  }
}

// 사용자 명시 2026-05-05: 100만 토큰 환영 선물 정책 폐기 → chargeUsage 단순화.
// 처음 한 달 무료 (얼리 플랜) = subscription_active=true + monthly_quota_usd cap 으로 처리. 별도 카운트 RPC 불필요.
// monthly_token_used 누적은 _lib/usage.ts 의 recordUsage 가 RPC 통해 처리. cost 가 cap 초과하면 checkBudget 에서 NO_CREDIT 반환.
async function chargeUsage(
  env: Env,
  userId: string,
  endpoint: string,
  model: string,
  usageData: any,
  waitUntil: (promise: Promise<any>) => void,
  isGuest = false,
  guestIp?: string
): Promise<void> {
  const inputTokens = usageData.input_tokens || 0;
  const outputTokens = usageData.output_tokens || 0;
  const cacheReadTokens = usageData.cache_read_input_tokens || 0;
  const cacheCreationTokens = usageData.cache_creation_input_tokens || 0;
  const cost = calculateCost(model, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens);
  // 사용자 보고 2026-05-10 (audit-backend 노랑): admin 무한 plan 특혜 — deductCost / recordUsage 도 skip.
  //   옛: admin 도 차감 / 통계 insert → silent fail (credit 0 → atomic 음수 방지) + 통계 오염.
  //   신: admin 식별 시 chargeUsage 자체 skip. 비용 추적 측면 admin 사용 분리 (별도 admin log 가 필요하면 후속).
  const _isAdminCharge = !!(env.ADMIN_USER_ID && userId === env.ADMIN_USER_ID);
  if (_isAdminCharge) return;

  waitUntil(recordUsage(env, {
    user_id: userId,
    endpoint,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_read_tokens: cacheReadTokens,
    cache_creation_tokens: cacheCreationTokens,
    cost_usd: cost
  }).catch(() => {}));

  if (cost > 0.000001) {
    waitUntil(deductCost(env, userId, cost).catch(() => {}));
    // Phase 0: 게스트 cost 글로벌 budget 카운터에 누적 (KV) — 일일 총합 cap 방어.
    if (isGuest) {
      // 사용자 명시 2026-05-06: 화이트리스트 IP 면 글로벌 카운터 제외 — recordGuestCost 내부에서 isAllowlistedGuestIp check.
      waitUntil(recordGuestCost(env as GuestEnv, cost, guestIp).catch(() => {}));
    }
  }
}

// 사용자 보고 2026-04-30: recordUsage / deductCost fire-and-forget → 응답 빠르면 Worker 종료로 drop.
// context.waitUntil 로 워커 lifetime 연장. Cloudflare Pages Functions API.
// 사용자 보고 2026-05-05 ultrathink-3: Cloudflare Error 1101 (Worker threw exception) — onRequestPost 안 catch 안 된 throw 가 cf 자체 5xx HTML 페이지로 반환됨.
// fix = 함수 전체 try/catch wrap. throw 시 controlled 500 + detail (진짜 throw msg) JSON 으로 반환 → 클라이언트 토스트 detail 에 진짜 원인 노출.
export async function onRequestPost(context: {
  request: Request;
  env: Env;
  waitUntil: (promise: Promise<any>) => void;
}): Promise<Response> {
  try {
    return await _handleChatRequest(context);
  } catch (e: any) {
    const _msg = e?.message || String(e);
    const _stack = e?.stack ? String(e.stack).slice(0, 800) : '';
    console.error('[chat.ts] uncaught throw:', _stack || _msg);
    return jsonResponse({
      error: '백엔드 throw: ' + _msg,
      stack: _stack || undefined
    }, 500);
  }
}

async function _handleChatRequest(context: {
  request: Request;
  env: Env;
  waitUntil: (promise: Promise<any>) => void;
}): Promise<Response> {
  const { request, env, waitUntil } = context;
  const guestEnv = env as GuestEnv;

  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();

  const isGuest = !!user.is_anonymous;

  // 사용자 명시 2026-05-05 ultrathink (Phase 0): 게스트 비용 방어선 — IP rate limit + 글로벌 budget + Turnstile.
  // 인증 사용자는 이 블록 skip (기존 흐름 그대로).
  // 사용자 명시 2026-05-06: 화이트리스트 IP 격리 위해 chargeUsage 까지 ip 전달 — block 밖으로 hoist.
  let guestIp: string | undefined;
  if (isGuest) {
    const ip = extractClientIp(request);
    guestIp = ip;
    const ipCheck = await checkAndIncIpRate(guestEnv, ip);
    if (!ipCheck.ok) {
      return jsonResponse({ error: ipCheck.reason, code: ipCheck.code }, ipCheck.status);
    }
    const budgetCheck = await checkGlobalGuestBudget(guestEnv, ip);
    if (!budgetCheck.ok) {
      return jsonResponse({ error: budgetCheck.reason, code: budgetCheck.code }, budgetCheck.status);
    }
    const turnstileToken = request.headers.get('X-Turnstile-Token');
    const tsResult = await verifyTurnstileToken(guestEnv.TURNSTILE_SECRET_KEY, turnstileToken, ip);
    if (!tsResult.ok) {
      return jsonResponse({ error: tsResult.reason, code: 'TURNSTILE_FAIL' }, 403);
    }
  }

  // 사용자 명시 2026-04-30: admin 특혜 제거. admin 도 일반 사용자처럼 budget check + 차감.
  // Phase 0: 게스트는 'guest' tier ($0.20 cap) 로 자동 생성. checkBudget 진입 전에 명시적 ensure (isAnonymous flag 전달용).
  // 한도 도달 시 NO_CREDIT → frontend 가 isGuest 분기로 가입 유도 모달.
  await ensureBillingRow(env, user.id, { isAnonymous: isGuest, userEmail: user.email || null });
  // Phase 1c: 게스트 → 가입자 승격 자동 detect — is_anonymous=false 인데 plan='guest' 면 'early_light' 로 promote.
  if (!isGuest) {
    const _curBilling = await getUserBilling(env, user.id);
    if (_curBilling?.subscription_plan === 'guest') {
      await promoteGuestToEarlyLight(env, user.id);
    }
  }
  const budget = await checkBudget(env, user.id);
  if (!budget.ok) {
    return jsonResponse({
      error: budget.reason,
      code: isGuest ? 'GUEST_LIMIT' : budget.code,
      remaining_credit_usd: budget.remaining_credit_usd
    }, 402);
  }

  let body: any;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'invalid JSON' }, 400);
  }
  if (!body.model || !body.messages) {
    return jsonResponse({ error: 'model + messages 필수' }, 400);
  }
  if (!env.ANTHROPIC_API_KEY) {
    return jsonResponse({ error: 'ANTHROPIC_API_KEY 미설정 (서버)' }, 500);
  }

  // 게스트 강제 cap — model 화이트리스트 + endpoint-aware max_tokens.
  // chat = 800 / extract_chapter / extract_topic / intake / first_touch = 2000 (JSON 출력 길이 보장).
  // 사용자 명시 2026-05-09: 게스트 + Opus 차단은 chat-style endpoint 한정 — 분석/추출 endpoint 는 Opus 통과.
  //   chat 헤더 토글 (useOpus) 발 chat_main/reflection/decision_step/mutation 등 = 차단 (Premium 전용 안내).
  //   intake / analyze_4stage / extract_chapter / review_* 등 = Opus 통과 (4단 분석·인사이트 추출).
  if (isGuest) {
    const _ep = body._endpoint || 'chat';
    const _isChatStyle = CHAT_STYLE_ENDPOINTS.has(_ep) || _ep === 'chat';
    const _modelOk = GUEST_BASE_ALLOWED_MODELS.has(body.model)
      || (!_isChatStyle && body.model === 'claude-opus-4-7');
    if (!_modelOk) {
      return jsonResponse({
        error: '게스트 채팅은 기본 모델만 — 가입하면 Opus 등 풀 활용 가능',
        code: 'GUEST_MODEL_BLOCKED'
      }, 403);
    }
    const cap = GUEST_ANALYSIS_ENDPOINTS.has(_ep) ? GUEST_ANALYSIS_MAX_TOKENS : GUEST_MAX_TOKENS_CAP;
    const requested = Number(body.max_tokens) || cap;
    body.max_tokens = Math.min(requested, cap);
  }

  // 사용자 명시 2026-05-02 ultrathink: Opus 가드 (Premium 전용 + 일일 30번 한도, 메인 대화 한정).
  // body.tutorial_mode === true (client 가 튜토리얼 동안 명시) = 자유. 일반 사용 = Premium 검증 + atomic increment.
  // 사용자 명시 2026-05-09: 가드 = chat-style endpoint 한정. 분석/추출 endpoint (intake / analyze_4stage / extract_* / review_* 등) = Opus 자유 통과.
  //   사용자가 헤더 토글로 직접 useOpus 선택하는 경로 (chat_main / reflection / decision_step / magic_help / mutation / archive_summary) 만 검증.
  const isTutorial = !!body.tutorial_mode;
  const _epForOpusGate = body._endpoint || 'chat';
  const _isChatStyleForOpus = CHAT_STYLE_ENDPOINTS.has(_epForOpusGate) || _epForOpusGate === 'chat';
  // 사용자 보고 2026-05-10 (audit-backend): 옛 is_deeper_analysis client hint 보안 risk —
  //   non-Premium 사용자가 body.is_deeper_analysis=true 임의로 보내 Opus 가드 우회 가능.
  //   fix: hint flag 폐기 → client askDeeper 가 별도 endpoint (`analyze_4stage`, chat-style X) 로 호출.
  //   _isChatStyleForOpus=false 면 자연 가드 skip — 분석/추출 endpoint 그룹 통합.
  // 사용자 명시 2026-05-10: admin 계정 = Opus 가드 우회 (무한 plan 특혜).
  const _isAdminUser = !!(env.ADMIN_USER_ID && user.id === env.ADMIN_USER_ID);
  if (body.model === 'claude-opus-4-7' && _isChatStyleForOpus && !_isAdminUser) {
    const opusGate = await checkOpusGate(env, user.id, isTutorial);
    if (!opusGate.ok) {
      return jsonResponse({
        error: opusGate.error,
        code: opusGate.code,
        used: opusGate.used,
        limit: opusGate.limit
      }, opusGate.status || 403);
    }
  }

  // tutorial_mode / is_deeper_analysis body 필드는 upstream 으로 보내지 X (Anthropic API 거부 가능)
  // is_deeper_analysis 는 backend 에서 무시 (위 audit fix) — 옛 client 호환 위해 strip 만 유지.
  delete body.tutorial_mode;
  delete body.is_deeper_analysis;

  // 사용자 명시 2026-05-08 ultrathink (audit FAIL #5): 자살예방법 §15-6 협력 권고 — 서버측 위기 가드.
  // 옛: 위기 키워드 감지 = 클라이언트 (13-crisis-detection.js) 만. API 직접 호출 / 클라이언트 우회 시 무방비.
  // 신: 서버에서 user 메시지 자살·자해 키워드 detect → system prompt 에 안전 가드 강제 inject + 응답 헤더 X-Crisis-Detected.
  // chat endpoint (메인 대화) 한정 — 분석/추출 endpoint 는 X (사용자 직접 발화 X).
  const _isMainChat = (body._endpoint === 'chat' || !body._endpoint);
  const _crisisDetected = _isMainChat && _detectCrisisInRequest(body);

  // 사용자 명시 2026-05-08 ultrathink (audit WARN #20): 의료법 §27 / 표시광고법 §3 서버측 minimum 가드.
  // 옛: 시스템 프롬프트 §15 가드는 클라이언트 (20-system-prompt.js) 만. body 직접 호출 시 우회 가능.
  // 신: 모든 chat endpoint 응답에 의료법 가드 강제 suffix inject — 클라이언트가 가드 빼도 서버에서 다시 적용.
  if (_isMainChat) {
    const MED_LAW_GUARD = '\n\n[강제 가드 — 의료법 §27 / 표시광고법 §3] 응답에서 "치료·완화·관리·진단" 같은 임상 효능 시사 표현 X (예: "고치자", "낫게 해줄게", "관리될 거야", "치료될 거야"). "도와줄 수 있어 / 같이 봐보자 / 정리하는 데 도움 될 수도" 처럼 보조적 톤 OK. 효과 보장 표현 절대 X. 사용자 깊은 우울/심각한 증상 호소 시 부드럽게 "전문가랑 같이 보면 좋을 것 같아" 한 번 짚기.';
    if (typeof body.system === 'string') {
      body.system = body.system + MED_LAW_GUARD;
    } else if (Array.isArray(body.system)) {
      body.system.push({ type: 'text', text: MED_LAW_GUARD });
    } else {
      body.system = MED_LAW_GUARD;
    }
  }
  if (_crisisDetected) {
    const _crisisGuard = '\n\n[안전 가드 — 자살예방법 §15-6 협력 권고 강제 적용]\n사용자 메시지에 자살·자해 신호가 있어. 너의 응답 본문 끝에 반드시 부드럽게 한 줄 추가:\n"이런 무게 혼자 들기 어려워. 1393 (자살예방상담, 24h 무료) / 1577-0199 (정신건강위기상담) — 한 번 통화해보면 좋을 것 같아."\n명령조 X / 강제 X / 진단 톤 X. 친구가 걱정하며 슬쩍 짚는 톤.';
    if (typeof body.system === 'string') {
      body.system = body.system + _crisisGuard;
    } else if (Array.isArray(body.system)) {
      body.system.push({ type: 'text', text: _crisisGuard });
    } else {
      body.system = _crisisGuard;
    }
  }

  const isStream = !!body.stream;
  const endpoint = body._endpoint || 'chat';
  delete body._endpoint;

  // 사용자 명시 2026-05-09 ultrathink: 명시 검색 키워드 시만 web_search 도구 활성 + Haiku 강제.
  // client (19-chat/09-generate-ai-response.js) 가 SEARCH_TRIGGER regex 로 판정해서 _useWebSearch=true 보냄.
  // 일반 대화엔 검색 X — 학습 지식만 사용. (사용자 명시 비용 절감).
  const _useWebSearch = body._useWebSearch === true;
  delete body._useWebSearch;
  if (_useWebSearch) {
    // Haiku 강제 (사용자 명시: 검색은 Haiku).
    if (body.model && !String(body.model).includes('haiku')) {
      return jsonResponse({
        error: { type: 'invalid_request_error', message: 'web_search 는 Haiku 모델만 지원 (사용자 명시)' }
      }, 400);
    }
    body.model = body.model || 'claude-haiku-4-5-20251001';
    body.tools = Array.isArray(body.tools) ? body.tools : [];
    body.tools.push({
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 3,  // 비용 통제 — 한 응답에 최대 3회 검색
    });
    const _searchGuard = '\n\n[웹 검색 사용 규칙]\n- 사용자가 "검색해줘" / "찾아줘" / "구글링" 등 명시 검색 요청한 경우에만 web_search 도구 호출.\n- 일반 대화 / 공감 / 조언엔 학습된 지식만 사용 (검색 X).\n- 검색 결과는 친구 카톡 톤으로 간단히 전달 (보고서 X). 평가 X.\n- 출처는 도메인 또는 페이지 제목 짧게 (URL 길게 붙이지 X).\n- 4단 분석 라벨 ([상황] / [내가 본 것] / [이게 뭐냐면] / [이럴 땐 이렇게] / [오늘의 제안]) 절대 사용 X. JSON 분석 출력 X. 자유 텍스트만.\n- "오늘의 제안" / "오늘의 메뉴" 같은 검색 결과 인용 시에도 대괄호 [...] 라벨 형식 X.';
    if (Array.isArray(body.system)) {
      body.system.push({ type: 'text', text: _searchGuard });
    } else if (typeof body.system === 'string') {
      body.system = body.system + _searchGuard;
    } else {
      body.system = _searchGuard;
    }
  }

  const upstreamHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01'
  };

  if (isStream) {
    const upstream = await _fetchAnthropicWithRetry(upstreamHeaders, JSON.stringify(body));
    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error(`[chat.ts] stream Anthropic upstream ${upstream.status}:`, errText.slice(0, 500));
      return new Response(errText, { status: upstream.status });
    }
    if (!upstream.body) {
      return jsonResponse({ error: 'upstream body 없음' }, 502);
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let usageData: any = null;

    // 사용자 보고 2026-04-30 ultrathink: SSE 파서 buffer 잔여 처리 누락 → 마지막 message_delta (최종 output_tokens cumulative) 가 chunk 경계에 걸려 영원히 파싱 X 였음.
    // → output_tokens 가 message_start 초기값 (1) 으로 기록됐을 가능성. 사용량 표시 안 잡히던 root cause 후보.
    const _parseSseLine = (line: string) => {
      if (!line.startsWith('data: ')) return;
      try {
        const evt = JSON.parse(line.slice(6));
        if (evt.type === 'message_delta' && evt.usage) {
          usageData = { ...(usageData || {}), ...evt.usage };
        }
        if (evt.type === 'message_start' && evt.message?.usage) {
          usageData = { ...(usageData || {}), ...evt.message.usage };
        }
      } catch {}
    };

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) _parseSseLine(line);
            controller.enqueue(value);
          }
          // 루프 종료 후 buffer 잔여 + UTF-8 디코더 flush — 끝부분 message_delta 누락 fix.
          const tail = decoder.decode();
          if (tail) buffer += tail;
          if (buffer) {
            for (const line of buffer.split('\n')) _parseSseLine(line);
          }
          controller.close();
        } catch (e) {
          controller.error(e);
        } finally {
          // 사용자 명시 2026-05-01 (agent audit): output_tokens=1 (message_start 초기값만 받고 message_delta 누락) 케이스 차감 skip.
          const _outputTokens = usageData?.output_tokens || 0;
          if (usageData && _outputTokens > 1) {
            // 사용자 명시 2026-05-02 ultrathink: chargeUsage 헬퍼 — welcome bonus 우선 소진 + overflow USD 차감.
            // 사용자 보고 2026-05-05 (audit Critical): finally 안 await chargeUsage → stream close 후 워커 lifetime 보장 X → drop risk.
            // fix = waitUntil 로 명시 위임 + 즉시 finally 종료 (stream 깔끔하게 close).
            waitUntil(
              chargeUsage(env, user.id, endpoint, body.model, usageData, waitUntil, isGuest, guestIp).catch((e: any) => {
                console.warn('[chat.ts] chargeUsage 실패:', e);
              })
            );
          }
        }
      }
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...(_crisisDetected ? { 'X-Crisis-Detected': 'true' } : {})
      }
    });
  }

  // Non-streaming
  const upstream = await _fetchAnthropicWithRetry(upstreamHeaders, JSON.stringify(body));

  if (!upstream.ok) {
    const errText = await upstream.text();
    console.error(`[chat.ts] non-stream Anthropic upstream ${upstream.status}:`, errText.slice(0, 500));
    return new Response(errText, { status: upstream.status, headers: { 'Content-Type': 'application/json' } });
  }

  const data: any = await upstream.json();
  const usage = data.usage || {};
  // 사용자 명시 2026-05-02 ultrathink: chargeUsage 헬퍼 — welcome bonus 우선 소진 + overflow USD 차감.
  await chargeUsage(env, user.id, endpoint, body.model, usage, waitUntil, isGuest, guestIp);

  return jsonResponse(data);
}
