// Anthropic API 프록시 — 인증 + budget check + 사용량 logging.
// 사용자 요청 2026-04-30 (Phase C): 클라이언트가 /api/chat 호출 → 백엔드가 Anthropic 호출 + 차감.
// 클라이언트는 ANTHROPIC_API_KEY 모름. Authorization: Bearer <Supabase JWT>로 인증.

import { verifyAuth, unauthorized, jsonResponse } from './_lib/auth';
import { recordUsage, calculateCost } from './_lib/usage';
import { checkBudget, deductCost } from './_lib/billing';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

export const config = { runtime: 'nodejs' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'POST only' }, 405);
  }

  // 1. 인증
  const user = await verifyAuth(req);
  if (!user) return unauthorized();

  // 2. budget 체크 (잔액 / 월 정액)
  const budget = await checkBudget(user.id);
  if (!budget.ok) {
    return jsonResponse({
      error: budget.reason,
      code: budget.code,
      remaining_credit_usd: budget.remaining_credit_usd
    }, 402);
  }

  // 3. body 파싱
  let body: any;
  try {
    body = await req.json();
  } catch (e) {
    return jsonResponse({ error: 'invalid JSON' }, 400);
  }
  if (!body.model || !body.messages) {
    return jsonResponse({ error: 'model + messages 필수' }, 400);
  }

  if (!ANTHROPIC_API_KEY) {
    return jsonResponse({ error: 'ANTHROPIC_API_KEY 미설정 (서버)' }, 500);
  }

  const isStream = !!body.stream;
  const endpoint = body._endpoint || 'chat';   // 사용자가 함수별 endpoint 추적용 (e.g. 'chat' / 'chapter_extract')
  delete body._endpoint;                       // Anthropic으로 안 보냄

  // 4. Anthropic 호출
  const upstreamHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01'
  };

  if (isStream) {
    // === Streaming proxy ===
    // upstream stream을 클라이언트로 forward + message_stop 이벤트에서 usage 추출 → DB 기록
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

    // SSE stream 가로채기 — usage 추출 + forward
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
            // SSE 파싱 — usage 추출
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
            // forward chunk
            controller.enqueue(value);
          }
          controller.close();
        } catch (e) {
          controller.error(e);
        } finally {
          // usage 기록 (background, fail silent)
          if (usageData) {
            const cost = calculateCost(
              body.model,
              usageData.input_tokens || 0,
              usageData.output_tokens || 0,
              usageData.cache_read_input_tokens || 0,
              usageData.cache_creation_input_tokens || 0
            );
            recordUsage({
              user_id: user.id,
              endpoint,
              model: body.model,
              input_tokens: usageData.input_tokens || 0,
              output_tokens: usageData.output_tokens || 0,
              cache_read_tokens: usageData.cache_read_input_tokens || 0,
              cache_creation_tokens: usageData.cache_creation_input_tokens || 0,
              cost_usd: cost
            }).catch(() => {});
            deductCost(user.id, cost).catch(() => {});
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

  // === Non-streaming ===
  const upstream = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: upstreamHeaders,
    body: JSON.stringify(body)
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    return new Response(errText, { status: upstream.status, headers: { 'Content-Type': 'application/json' } });
  }

  const data = await upstream.json();
  const usage = data.usage || {};
  const cost = calculateCost(
    body.model,
    usage.input_tokens || 0,
    usage.output_tokens || 0,
    usage.cache_read_input_tokens || 0,
    usage.cache_creation_input_tokens || 0
  );
  recordUsage({
    user_id: user.id,
    endpoint,
    model: body.model,
    input_tokens: usage.input_tokens || 0,
    output_tokens: usage.output_tokens || 0,
    cache_read_tokens: usage.cache_read_input_tokens || 0,
    cache_creation_tokens: usage.cache_creation_input_tokens || 0,
    cost_usd: cost
  }).catch(() => {});
  deductCost(user.id, cost).catch(() => {});

  return jsonResponse(data);
}
