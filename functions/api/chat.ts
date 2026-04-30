// Cloudflare Pages Functions — Anthropic API 프록시.
// POST /api/chat — 인증 + budget check + Anthropic 호출 + 사용량 logging + 차감.

import { verifyAuth, unauthorized, jsonResponse, type Env } from './_lib/auth';
import { recordUsage, calculateCost } from './_lib/usage';
import { checkBudget, deductCost } from './_lib/billing';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;

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
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const evt = JSON.parse(line.slice(6));
                  if (evt.type === 'message_delta' && evt.usage) {
                    usageData = { ...(usageData || {}), ...evt.usage };
                  }
                  if (evt.type === 'message_start' && evt.message?.usage) {
                    usageData = { ...(usageData || {}), ...evt.message.usage };
                  }
                } catch {}
              }
            }
            controller.enqueue(value);
          }
          controller.close();
        } catch (e) {
          controller.error(e);
        } finally {
          if (usageData) {
            const cost = calculateCost(
              body.model,
              usageData.input_tokens || 0,
              usageData.output_tokens || 0,
              usageData.cache_read_input_tokens || 0,
              usageData.cache_creation_input_tokens || 0
            );
            recordUsage(env, {
              user_id: user.id,
              endpoint,
              model: body.model,
              input_tokens: usageData.input_tokens || 0,
              output_tokens: usageData.output_tokens || 0,
              cache_read_tokens: usageData.cache_read_input_tokens || 0,
              cache_creation_tokens: usageData.cache_creation_input_tokens || 0,
              cost_usd: cost
            }).catch(() => {});
            // 사용자 명시 2026-04-30: admin 특혜 제거. 항상 차감.
            deductCost(env, user.id, cost).catch(() => {});
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
  const cost = calculateCost(
    body.model,
    usage.input_tokens || 0,
    usage.output_tokens || 0,
    usage.cache_read_input_tokens || 0,
    usage.cache_creation_input_tokens || 0
  );
  recordUsage(env, {
    user_id: user.id,
    endpoint,
    model: body.model,
    input_tokens: usage.input_tokens || 0,
    output_tokens: usage.output_tokens || 0,
    cache_read_tokens: usage.cache_read_input_tokens || 0,
    cache_creation_tokens: usage.cache_creation_input_tokens || 0,
    cost_usd: cost
  }).catch(() => {});
  // 사용자 명시 2026-04-30: admin 특혜 제거. 항상 차감.
  deductCost(env, user.id, cost).catch(() => {});

  return jsonResponse(data);
}
