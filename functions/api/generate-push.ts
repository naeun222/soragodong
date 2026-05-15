// V4 (사용자 명시 2026-05-16 cowork): POST /api/generate-push.
//   Google Play 출시 후 매일 사용자 1명당 1개 push 메시지를 Sonnet 으로 동적 생성. 톤 = 인앱 채팅 소라고동 동일, push 제약 (40자 / 단 한 줄).
//   인증: X-Internal-Secret header + env.PUSH_GENERATE_SECRET (backend cron / FCM 발사 system 호출용) 1차, verifyAuth fallback (개발자 self-test).
//   비용 가드: input field 200 char cap (push-logic.mjs), max_tokens 80, temperature 0.8, 응답 40 char hard truncate, 금지 표현 post-check → fallback.
//   Output: { message, tier, fallback: bool, model, reason? }. 항상 200 OK — cron silent X 보장.
//
//   호출 contract:
//     POST /api/generate-push
//     headers: X-Internal-Secret: <env.PUSH_GENERATE_SECRET>  (또는 Authorization: Bearer <user JWT>)
//     body: { tier: 1|2|3, context: string, ... tier 별 필드 }
//       tier 1 (thread followup):  { thread, since }
//       tier 2 (new insight):       { insight_type, insight }
//       tier 3 (casual):            { days_since_last_chat, recent_mood }

import { verifyAuth, jsonResponse, type Env } from './_lib/auth';
import { PUSH_PERSONA, PUSH_FALLBACKS, PUSH_BANNED_PHRASES } from './_lib/prompts/push-persona';
// @ts-ignore — .mjs ES module, TS strict 모드에서 type 추론 X. cloudflare wrangler 가 그대로 deploy.
import { clampPushMessage, validatePushMessage, buildUserPrompt, pickFallback } from './_lib/push-logic.mjs';

interface PushEnv extends Env {
  PUSH_GENERATE_SECRET?: string;
}

export async function onRequestPost(context: { request: Request; env: PushEnv }): Promise<Response> {
  const { request, env } = context;

  // ─── 인증: X-Internal-Secret 1차 → verifyAuth fallback ───────────────
  const internalSecret = request.headers.get('X-Internal-Secret');
  let authed = false;
  if (env.PUSH_GENERATE_SECRET && internalSecret && internalSecret === env.PUSH_GENERATE_SECRET) {
    authed = true;
  } else {
    const user = await verifyAuth(request, env).catch(() => null);
    if (user) authed = true;
  }
  if (!authed) return jsonResponse({ error: 'unauthorized' }, 401);

  // ─── input parse ─────────────────────────────────────────────────────
  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'invalid JSON' }, 400); }
  if (!body || ![1, 2, 3].includes(body.tier)) {
    return jsonResponse({ error: 'tier must be 1, 2, or 3' }, 400);
  }
  const tier = body.tier as 1 | 2 | 3;

  let userPrompt: string;
  try { userPrompt = buildUserPrompt(body); }
  catch (e: any) { return jsonResponse({ error: 'invalid input: ' + (e?.message || e) }, 400); }

  // ─── Sonnet 호출. env 누락 / 실패 시 fallback ────────────────────────
  if (!env.ANTHROPIC_API_KEY) {
    return jsonResponse({
      message: pickFallback(PUSH_FALLBACKS, tier),
      tier, fallback: true, reason: 'env_missing', model: 'claude-sonnet-4-6',
    });
  }

  let sonnetText = '';
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 80,
        temperature: 0.8,
        system: PUSH_PERSONA,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      console.warn('[generate-push] sonnet HTTP', resp.status, errBody.slice(0, 200));
    } else {
      const data: any = await resp.json();
      const text = data?.content?.[0]?.text;
      if (typeof text === 'string') sonnetText = text;
    }
  } catch (e: any) {
    console.warn('[generate-push] sonnet network', e?.message || e);
  }

  // ─── clamp + validate ───────────────────────────────────────────────
  const clamped = clampPushMessage(sonnetText);
  const verdict = validatePushMessage(clamped, PUSH_BANNED_PHRASES);

  if (verdict.ok) {
    return jsonResponse({ message: clamped, tier, fallback: false, model: 'claude-sonnet-4-6' });
  }

  console.warn('[generate-push] fallback fire:', verdict.reason, 'raw:', (sonnetText || '').slice(0, 80));
  return jsonResponse({
    message: pickFallback(PUSH_FALLBACKS, tier),
    tier, fallback: true, reason: verdict.reason, model: 'claude-sonnet-4-6',
  });
}
