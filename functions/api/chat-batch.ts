// Cloudflare Pages Functions — Anthropic Message Batches API 프록시.
// 사용자 명시 2026-05-02 ultrathink: 4AM extract 흐름 (사용자 자고 있음, latency 안 중요) 50% 할인.
// POST /api/chat-batch — body.action 분기:
//   - 'submit'  : { requests: [{ custom_id, params: { model, max_tokens, messages } }, ...] } → batch 생성
//   - 'status'  : { batch_id } → processing_status / request_counts
//   - 'results' : { batch_id } → 결과 list (ended 상태일 때만, JSONL 파싱). usage 50% 할인 기록.

import { verifyAuth, unauthorized, jsonResponse, type Env } from './_lib/auth';
import { recordUsage, calculateCost } from './_lib/usage';
import { checkBudget, deductCost } from './_lib/billing';

// V4 (사용자 보고 2026-05-11 ultrathink): Cloudflare AI Gateway native passthrough — HKG colo region block 우회.
const ANTHROPIC_BASE = 'https://gateway.ai.cloudflare.com/v1/53e0f1f9111983b0d7a4275cf94b6dc0/soragodong-anthropic/anthropic/v1';
// batch beta header 필요 (Anthropic 공식 문서)
const BATCH_BETA_HEADER = 'message-batches-2024-09-24';

export async function onRequestPost(context: {
  request: Request;
  env: Env;
  waitUntil: (promise: Promise<any>) => void;
}): Promise<Response> {
  const { request, env, waitUntil } = context;

  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();

  // budget check (admin 도 동일 — 사용자 명시 2026-04-30)
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
  } catch {
    return jsonResponse({ error: 'invalid JSON' }, 400);
  }
  if (!env.ANTHROPIC_API_KEY) {
    return jsonResponse({ error: 'ANTHROPIC_API_KEY 미설정 (서버)' }, 500);
  }

  const action = body.action;
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': BATCH_BETA_HEADER
  };

  if (action === 'submit') {
    const requests = body.requests;
    if (!Array.isArray(requests) || requests.length === 0) {
      return jsonResponse({ error: 'requests 배열 필수' }, 400);
    }
    if (requests.length > 100) {
      // 클라이언트 자체 cap (Anthropic 한계 100k 단 비용 보호)
      return jsonResponse({ error: 'requests 100 초과 — 분할 필요' }, 400);
    }
    const upstream = await fetch(`${ANTHROPIC_BASE}/messages/batches`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ requests })
    });
    if (!upstream.ok) {
      const errText = await upstream.text();
      return new Response(errText, { status: upstream.status, headers: { 'Content-Type': 'application/json' } });
    }
    const data: any = await upstream.json();
    return jsonResponse(data);
  }

  if (action === 'status') {
    const batchId = body.batch_id;
    if (!batchId || typeof batchId !== 'string') {
      return jsonResponse({ error: 'batch_id 필수' }, 400);
    }
    const upstream = await fetch(`${ANTHROPIC_BASE}/messages/batches/${batchId}`, { headers });
    if (!upstream.ok) {
      const errText = await upstream.text();
      return new Response(errText, { status: upstream.status, headers: { 'Content-Type': 'application/json' } });
    }
    return jsonResponse(await upstream.json());
  }

  if (action === 'results') {
    const batchId = body.batch_id;
    if (!batchId || typeof batchId !== 'string') {
      return jsonResponse({ error: 'batch_id 필수' }, 400);
    }
    // status 먼저 — ended 상태인지 + results_url 받음
    const statusResp = await fetch(`${ANTHROPIC_BASE}/messages/batches/${batchId}`, { headers });
    if (!statusResp.ok) {
      const errText = await statusResp.text();
      return new Response(errText, { status: statusResp.status, headers: { 'Content-Type': 'application/json' } });
    }
    const statusData: any = await statusResp.json();
    if (statusData.processing_status !== 'ended') {
      return jsonResponse({
        ok: false,
        reason: 'batch_not_ended',
        processing_status: statusData.processing_status,
        request_counts: statusData.request_counts
      });
    }
    const resultsUrl = statusData.results_url;
    if (!resultsUrl) {
      return jsonResponse({ error: 'results_url 없음 — status: ' + JSON.stringify(statusData) }, 500);
    }
    const resultsResp = await fetch(resultsUrl, { headers });
    if (!resultsResp.ok) {
      const errText = await resultsResp.text();
      return new Response(errText, { status: resultsResp.status, headers: { 'Content-Type': 'application/json' } });
    }
    const text = await resultsResp.text();
    const lines = text.split('\n').filter(l => l.trim());
    const results: any[] = [];
    for (const l of lines) {
      try {
        results.push(JSON.parse(l));
      } catch {
        // skip malformed line
      }
    }

    // usage 50% 할인 기록 + 차감 (성공한 결과만)
    let totalCost = 0;
    for (const r of results) {
      if (r?.result?.type !== 'succeeded') continue;
      const msg = r.result.message;
      const usage = msg?.usage || {};
      const model = msg?.model || 'claude-sonnet-4-6';
      // batch API = input/output 50% off (Anthropic 공식). cache 별도 할인은 일반과 동일.
      // 단순화: calculateCost 결과 × 0.5 (full price 기준 50% 가격이 적용되었다는 회계).
      const fullCost = calculateCost(
        model,
        usage.input_tokens || 0,
        usage.output_tokens || 0,
        usage.cache_read_input_tokens || 0,
        usage.cache_creation_input_tokens || 0
      );
      const cost = Math.round(fullCost * 0.5 * 1_000_000) / 1_000_000;
      totalCost += cost;
      waitUntil(recordUsage(env, {
        user_id: user.id,
        endpoint: 'extract_batch',
        model,
        input_tokens: usage.input_tokens || 0,
        output_tokens: usage.output_tokens || 0,
        cache_read_tokens: usage.cache_read_input_tokens || 0,
        cache_creation_tokens: usage.cache_creation_input_tokens || 0,
        cost_usd: cost
      }).catch(() => {}));
    }
    if (totalCost > 0) {
      waitUntil(deductCost(env, user.id, totalCost).catch(() => {}));
    }

    return jsonResponse({
      ok: true,
      batch_id: batchId,
      results,
      total_cost_usd: totalCost,
      request_counts: statusData.request_counts
    });
  }

  return jsonResponse({ error: 'invalid action — submit / status / results' }, 400);
}
