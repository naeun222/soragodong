// Cloudflare Pages Functions — Hook 생성 endpoint.
// POST /api/hook/generate
// body: { userName, substrateText, triggerDayK, askedHistory?, activeModes? }
// → Sonnet + tone guard + 4회 retry → JSON
//   성공: { ok: true, hook: { body, source, trigger_dayK, hook_type }, soft_warnings, retries }
//   실패: { ok: false, reason, last_hard?, last_soft?, raw? }
// 사용자 명시 2026-05-17 (_hook-system-spec.md backend 이식).
//
// E2EE 고려: 사용자 state 는 backend 가 못 봐서 substrate 를 frontend 에서 수집해서 보냄.
//   substrate 안 민감 디테일 가능 — Cloudflare Workers 가 log X. AI Gateway zero-retention.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';
import { recordUsage, calculateCost } from '../_lib/usage';
import { checkBudget, deductCost } from '../_lib/billing';
import { buildHookPrompt } from '../_lib/prompts/godong-hook';
import { checkTone } from '../_lib/tone-guard';

// V4 (사용자 보고 2026-05-11 ultrathink): Cloudflare AI Gateway native passthrough — HKG colo region block 우회.
const ANTHROPIC_URL = 'https://gateway.ai.cloudflare.com/v1/53e0f1f9111983b0d7a4275cf94b6dc0/soragodong-anthropic/anthropic/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const MAX_RETRY = 4;
const ENDPOINT = 'hook_generate';

export async function onRequestPost(context: {
  request: Request;
  env: Env;
}): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();

  // budget check
  const budget = await checkBudget(env, user.id);
  if (!budget.ok) {
    return jsonResponse({
      ok: false,
      reason: budget.reason,
      code: budget.code,
      remaining_credit_usd: budget.remaining_credit_usd
    }, 402);
  }

  let body: any;
  try { body = await request.json(); }
  catch { return jsonResponse({ ok: false, reason: 'invalid JSON' }, 400); }

  const userName = String(body?.userName || '').trim().slice(0, 20);
  const substrateText = String(body?.substrateText || '').trim();
  const triggerDayK = String(body?.triggerDayK || '').trim();
  const askedHistory = String(body?.askedHistory || '').slice(0, 1500);
  const activeModes = String(body?.activeModes || '').slice(0, 200);

  if (!userName) return jsonResponse({ ok: false, reason: 'userName 필수' }, 400);
  if (!substrateText) return jsonResponse({ ok: false, reason: 'substrateText 필수' }, 400);
  if (!triggerDayK) return jsonResponse({ ok: false, reason: 'triggerDayK 필수' }, 400);
  if (substrateText.length > 8000) {
    return jsonResponse({ ok: false, reason: 'substrateText 8000자 초과' }, 400);
  }
  if (!env.ANTHROPIC_API_KEY) {
    return jsonResponse({ ok: false, reason: 'ANTHROPIC_API_KEY 미설정' }, 500);
  }

  const { systemPrompt, userPrompt } = buildHookPrompt({
    userName, substrateText, triggerDayK, askedHistory, activeModes
  });

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
  };

  let lastHard: string[] = [];
  let lastSoft: string[] = [];
  let lastRaw = '';
  const usageAccum = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };

  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    const reqBody = {
      model: MODEL,
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    };

    let upstream: Response;
    try {
      upstream = await fetch(ANTHROPIC_URL, {
        method: 'POST', headers, body: JSON.stringify(reqBody)
      });
    } catch (e: any) {
      console.warn(`[hook generate] upstream throw attempt#${attempt + 1}`, e?.message || e);
      if (attempt === MAX_RETRY - 1) {
        return jsonResponse({ ok: false, reason: 'Anthropic unreachable' }, 502);
      }
      continue;
    }
    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      console.warn(`[hook generate] upstream ${upstream.status} attempt#${attempt + 1}`, errText.slice(0, 200));
      if (attempt === MAX_RETRY - 1) {
        return jsonResponse({
          ok: false,
          reason: `Anthropic ${upstream.status}: ${errText.slice(0, 200)}`
        }, 502);
      }
      continue;
    }

    let data: any;
    try { data = await upstream.json(); }
    catch (e: any) {
      console.warn(`[hook generate] JSON read fail attempt#${attempt + 1}`, e?.message);
      continue;
    }
    const text: string = data?.content?.[0]?.text || '';
    lastRaw = text;
    const usage = data?.usage || {};
    usageAccum.input += usage.input_tokens || 0;
    usageAccum.output += usage.output_tokens || 0;
    usageAccum.cacheRead += usage.cache_read_input_tokens || 0;
    usageAccum.cacheCreation += usage.cache_creation_input_tokens || 0;

    const parsed = _extractJson(text);
    if (!parsed) {
      console.warn(`[hook generate] JSON parse fail attempt#${attempt + 1}`, text.slice(0, 200));
      continue;
    }
    const hook = _normalizeHook(parsed, triggerDayK);
    if (!hook) {
      console.warn(`[hook generate] hook shape invalid attempt#${attempt + 1}`, JSON.stringify(parsed).slice(0, 200));
      continue;
    }

    const violations = checkTone(hook.body, { requiresQuestion: true });
    lastHard = violations.hard;
    lastSoft = violations.soft;
    if (violations.hard.length > 0) {
      console.warn(`[hook generate] tone hard violation attempt#${attempt + 1}`, violations.hard.join(','));
      continue;  // retry
    }

    // 성공 — usage 기록 + cost 차감.
    const cost = calculateCost(MODEL, usageAccum.input, usageAccum.output, usageAccum.cacheRead, usageAccum.cacheCreation);
    await recordUsage(env, {
      user_id: user.id, endpoint: ENDPOINT, model: MODEL,
      input_tokens: usageAccum.input,
      cache_read_tokens: usageAccum.cacheRead,
      cache_creation_tokens: usageAccum.cacheCreation,
      output_tokens: usageAccum.output,
      cost_usd: cost
    }).catch(e => console.warn('[hook generate] recordUsage:', e?.message));
    await deductCost(env, user.id, cost).catch(e => console.warn('[hook generate] deductCost:', e?.message));

    return jsonResponse({
      ok: true,
      hook,
      soft_warnings: violations.soft,
      retries: attempt
    });
  }

  // 4회 실패 — usage 만 기록 (이미 호출됨, 차감 필요).
  if (usageAccum.input > 0 || usageAccum.output > 0) {
    const cost = calculateCost(MODEL, usageAccum.input, usageAccum.output, usageAccum.cacheRead, usageAccum.cacheCreation);
    await recordUsage(env, {
      user_id: user.id, endpoint: ENDPOINT + '_failed', model: MODEL,
      input_tokens: usageAccum.input,
      cache_read_tokens: usageAccum.cacheRead,
      cache_creation_tokens: usageAccum.cacheCreation,
      output_tokens: usageAccum.output,
      cost_usd: cost
    }).catch(() => {});
    await deductCost(env, user.id, cost).catch(() => {});
  }
  return jsonResponse({
    ok: false,
    reason: `tone guard ${MAX_RETRY}회 fail`,
    last_hard: lastHard,
    last_soft: lastSoft,
    raw: lastRaw.slice(0, 300)
  });
}

// Balanced bracket finder — LLM prose 안 { … } 첫 valid object 만 추출.
function _extractJson(text: string): any | null {
  if (!text) return null;
  const cleaned = text.replace(/```\w*/g, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        const jsonText = cleaned.slice(start, i + 1);
        try { return JSON.parse(jsonText); } catch { return null; }
      }
    }
  }
  return null;
}

function _normalizeHook(raw: any, triggerDayK: string): {
  body: string; source: string; trigger_dayK: string; hook_type: number;
} | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = String(raw.body || '').trim();
  if (!body || body.length < 5 || body.length > 200) return null;
  const sourceRaw = String(raw.source || '').trim();
  const validSources = ['pearl', 'diary', 'topic', 'insight', 'checkin'];
  const source = validSources.includes(sourceRaw) ? sourceRaw : 'diary';
  const hookTypeRaw = parseInt(String(raw.hook_type || '1'), 10);
  const hook_type = (hookTypeRaw >= 1 && hookTypeRaw <= 6) ? hookTypeRaw : 1;
  return { body, source, trigger_dayK: triggerDayK, hook_type };
}
