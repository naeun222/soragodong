// Cloudflare Pages Functions — Anthropic API 프록시.
// POST /api/chat — 인증 + budget check + Opus 가드 (Premium 전용 + 일일 30번) + Anthropic 호출 + 사용량 logging + 차감 (welcome bonus 우선 소진).

import { verifyAuth, unauthorized, jsonResponse, type Env } from './_lib/auth';
import { recordUsage, calculateCost } from './_lib/usage';
import { checkBudget, deductCost, getUserBilling, OPUS_DAILY_LIMIT_PREMIUM } from './_lib/billing';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

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

// 사용자 명시 2026-05-02 ultrathink: 차감 우선순위 = welcome_bonus_tokens (카운트) → quota/credit (USD).
// caller (chat.ts) 가 consume_welcome_bonus_atomic 먼저 호출 → overflow 분 USD 비율 환산해서 deductCost.
// 단순 가정: overflow 분 cost = 전체 cost × (overflow / total). input/output 따로 차감 X — 회사 손해 부담.
async function chargeUsage(
  env: Env,
  userId: string,
  endpoint: string,
  model: string,
  usageData: any,
  waitUntil: (promise: Promise<any>) => void
): Promise<void> {
  const inputTokens = usageData.input_tokens || 0;
  const outputTokens = usageData.output_tokens || 0;
  const cacheReadTokens = usageData.cache_read_input_tokens || 0;
  const cacheCreationTokens = usageData.cache_creation_input_tokens || 0;
  const totalTokens = inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens;
  const cost = calculateCost(model, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens);

  // recordUsage 는 항상 정확한 cost 기록 (welcome bonus 와 무관 — 통계용)
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

  // welcome bonus 우선 소진 + overflow USD 차감 (waitUntil 안 다 처리)
  waitUntil((async () => {
    let overflowTokens = totalTokens;
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && totalTokens > 0) {
      try {
        const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/consume_welcome_bonus_atomic`, {
          method: 'POST',
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ p_user_id: userId, p_tokens: totalTokens })
        });
        const data: any = await resp.json().catch(() => ({}));
        if (data?.ok) overflowTokens = data.overflow ?? totalTokens;
      } catch (e) {
        console.warn('[charge] welcome bonus consume 실패:', e);
        // fail-open: overflow = total (welcome bonus 못 차감 시 전체 USD 차감)
      }
    }
    if (overflowTokens > 0) {
      const overflowCost = totalTokens > 0 ? cost * (overflowTokens / totalTokens) : cost;
      if (overflowCost > 0.000001) {
        await deductCost(env, userId, overflowCost).catch(() => {});
      }
    }
  })());
}

// 사용자 보고 2026-04-30: recordUsage / deductCost fire-and-forget → 응답 빠르면 Worker 종료로 drop.
// context.waitUntil 로 워커 lifetime 연장. Cloudflare Pages Functions API.
export async function onRequestPost(context: {
  request: Request;
  env: Env;
  waitUntil: (promise: Promise<any>) => void;
}): Promise<Response> {
  const { request, env, waitUntil } = context;

  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();

  // 사용자 명시 2026-04-30: admin 특혜 제거 ("관리자 계정이라고 결제/사용량 다르게 하지 말아줘"). admin 도 일반 사용자처럼 budget check + 차감.
  const budget = await checkBudget(env, user.id);
  if (!budget.ok) {
    return jsonResponse({
      error: budget.reason,
      code: budget.code,
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

  // 사용자 명시 2026-05-02 ultrathink: Opus 가드 (Premium 전용 + 일일 30번 한도, 메인 대화 한정).
  // body.tutorial_mode === true (client 가 튜토리얼 동안 명시) = 자유. 일반 사용 = Premium 검증 + atomic increment.
  const isTutorial = !!body.tutorial_mode;
  if (body.model === 'claude-opus-4-7') {
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

  // tutorial_mode body 필드는 upstream 으로 보내지 X (Anthropic API 거부 가능)
  delete body.tutorial_mode;

  const isStream = !!body.stream;
  const endpoint = body._endpoint || 'chat';
  delete body._endpoint;

  const upstreamHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01'
  };

  if (isStream) {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(body)
    });
    if (!upstream.ok) {
      const errText = await upstream.text();
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
              chargeUsage(env, user.id, endpoint, body.model, usageData, waitUntil).catch((e: any) => {
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
        'Connection': 'keep-alive'
      }
    });
  }

  // Non-streaming
  const upstream = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: upstreamHeaders,
    body: JSON.stringify(body)
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    return new Response(errText, { status: upstream.status, headers: { 'Content-Type': 'application/json' } });
  }

  const data: any = await upstream.json();
  const usage = data.usage || {};
  // 사용자 명시 2026-05-02 ultrathink: chargeUsage 헬퍼 — welcome bonus 우선 소진 + overflow USD 차감.
  await chargeUsage(env, user.id, endpoint, body.model, usage, waitUntil);

  return jsonResponse(data);
}
