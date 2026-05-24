// Cloudflare Pages Functions — Anthropic Message Batches API 프록시.
// 사용자 명시 2026-05-02 ultrathink: 4AM extract 흐름 (사용자 자고 있음, latency 안 중요) 50% 할인.
// POST /api/chat-batch — body.action 분기:
//   - 'submit'  : { requests: [{ custom_id, params: { model, max_tokens, messages } }, ...] } → batch 생성
//   - 'status'  : { batch_id } → processing_status / request_counts
//   - 'results' : { batch_id } → 결과 list (ended 상태일 때만, JSONL 파싱). usage 50% 할인 기록.

import { verifyAuth, unauthorized, jsonResponse, type Env } from './_lib/auth';
import { recordUsage, calculateCost } from './_lib/usage';
import { checkBudget, deductCost } from './_lib/billing';
// V4 (사용자 명시 2026-05-25 ultrathink): batch 에도 chat.ts 와 동일한 backend 합성 시퀀스 적용.
//   옛: raw passthrough → _endpoint/_userContentType/_vars 가 Anthropic 으로 그대로 forward 돼 무시 → system X + content="" → errored.
//   진단 증거: pendingReviewBatch 안 insight_weekly result.type='errored' / chatArchive 5개 _pendingCleanup stuck.
//   신: chat.ts 의 applyEndpointSystem + applyUserContentTemplate + (필요 시) applyPersonaToBody 패턴 그대로.
import { applyEndpointSystem, shouldSkipPersona } from './_lib/prompts/endpoint-systems';
import { applyUserContentTemplate } from './_lib/prompts/user-content-templates';
import { applyPersonaToBody } from './_lib/prompts/system-persona';

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
    // V4 (사용자 명시 2026-05-25 ultrathink): each request 를 chat.ts 와 동일하게 변환.
    //   applyEndpointSystem → body.system 강제 override (_endpoint / _promptType 매칭).
    //   applyUserContentTemplate → 마지막 user message content 강제 합성 (_userContentType / _endpoint+_vars 매칭).
    //   shouldSkipPersona 미해당 시 applyPersonaToBody → SYSTEM_PERSONA prepend.
    //   strip hint fields (_promptType / _userContentType / _vars / _chatMode) — Anthropic forward X.
    //   _endpoint 는 chat.ts 와 동일하게 보존 (Anthropic 가 unknown field 무시).
    //   review_<cycle>_<key> 처럼 system + userMessage 가 이미 직접 박힌 path 도 _endpoint 매칭 시 stable system override — 의도된 경로 (review-systems.ts).
    for (const req of requests) {
      const p = req && req.params;
      if (!p || typeof p !== 'object') continue;
      try {
        applyEndpointSystem(p);
        applyUserContentTemplate(p);
        if (!shouldSkipPersona(p)) {
          applyPersonaToBody(p);
        }
      } catch (e) {
        console.warn('[chat-batch] synthesis fail for', req.custom_id, e);
      }
      delete p._promptType;
      delete p._userContentType;
      delete p._vars;
      delete p._chatMode;
      // V4 (사용자 명시 2026-05-25 ultrathink): Anthropic batch API 가 unknown field strict reject — chat API 는 lenient 이라 chat.ts 는 _endpoint 박힌 채 forward OK 였지만, batch params 는 `_endpoint: Extra inputs are not permitted` 400 받음. batch path 에선 _endpoint 도 strip.
      delete p._endpoint;
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
