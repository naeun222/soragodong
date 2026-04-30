// Cloudflare Pages Functions — Anthropic API 프록시.
// POST /api/chat — 인증 + budget check + Anthropic 호출 + 사용량 logging + 차감.

import { verifyAuth, unauthorized, jsonResponse, type Env } from './_lib/auth';
import { recordUsage, calculateCost } from './_lib/usage';
import { checkBudget, deductCost } from './_lib/billing';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

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
          if (usageData) {
            const cost = calculateCost(
              body.model,
              usageData.input_tokens || 0,
              usageData.output_tokens || 0,
              usageData.cache_read_input_tokens || 0,
              usageData.cache_creation_input_tokens || 0
            );
            // waitUntil — 워커 lifetime 연장으로 logging/차감 drop 방지.
            waitUntil(recordUsage(env, {
              user_id: user.id,
              endpoint,
              model: body.model,
              input_tokens: usageData.input_tokens || 0,
              output_tokens: usageData.output_tokens || 0,
              cache_read_tokens: usageData.cache_read_input_tokens || 0,
              cache_creation_tokens: usageData.cache_creation_input_tokens || 0,
              cost_usd: cost
            }).catch(() => {}));
            // 사용자 명시 2026-04-30: admin 특혜 제거. 항상 차감.
            waitUntil(deductCost(env, user.id, cost).catch(() => {}));
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
  // waitUntil — non-streaming 경로도 동일. jsonResponse 즉시 반환 후에도 logging/차감 완료 보장.
  waitUntil(recordUsage(env, {
    user_id: user.id,
    endpoint,
    model: body.model,
    input_tokens: usage.input_tokens || 0,
    output_tokens: usage.output_tokens || 0,
    cache_read_tokens: usage.cache_read_input_tokens || 0,
    cache_creation_tokens: usage.cache_creation_input_tokens || 0,
    cost_usd: cost
  }).catch(() => {}));
  // 사용자 명시 2026-04-30: admin 특혜 제거. 항상 차감.
  waitUntil(deductCost(env, user.id, cost).catch(() => {}));

  return jsonResponse(data);
}
