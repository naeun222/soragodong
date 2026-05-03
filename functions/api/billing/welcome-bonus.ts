// POST /api/billing/welcome-bonus — 환영 선물 100만 토큰 grant.
// 사용자 명시 2026-05-02 ultrathink:
//   - 토큰 카운트 모델 (이전 USD $2.14 모델 대체) — welcome_bonus_tokens_remaining BIGINT 컬럼.
//   - 트리거 = 튜토리얼 완주 시점 (frontend onbFinish 가 호출).
//   - 30일 만료 — chat 호출 시 만료 lazy 처리 (consume_welcome_bonus_atomic 안에서).
//   - idempotent — grant_welcome_bonus_atomic RPC 가 welcome_bonus_total_granted > 0 이면 already_granted 응답.
//   - free_credit_granted=TRUE 도 같이 추가 (옛 flag 호환).

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';
import { ensureBillingRow, WELCOME_BONUS_TOKENS, WELCOME_BONUS_EXPIRES_DAYS } from '../_lib/billing';

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();

  // 1. billing row 확보 (없으면 잔액 0 으로 생성)
  const billing = await ensureBillingRow(env, user.id);
  if (!billing) {
    return jsonResponse({ ok: false, error: 'billing row 생성 실패' }, 500);
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ ok: false, error: 'env missing' }, 500);
  }

  // 2. grant_welcome_bonus_atomic RPC 호출 (idempotent)
  try {
    const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/grant_welcome_bonus_atomic`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_user_id: user.id,
        p_tokens: WELCOME_BONUS_TOKENS,
        p_expires_days: WELCOME_BONUS_EXPIRES_DAYS
      })
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.warn('[welcome-bonus] RPC 실패:', resp.status, text);
      return jsonResponse({ ok: false, error: 'RPC 실패: ' + resp.status }, 500);
    }
    const data: any = await resp.json();
    if (data?.already_granted) {
      return jsonResponse({
        ok: true,
        already_granted: true,
        tokens: WELCOME_BONUS_TOKENS,
        message: '이미 받았어요'
      });
    }
    return jsonResponse({
      ok: true,
      granted: true,
      tokens: data?.tokens || WELCOME_BONUS_TOKENS,
      expires_at: data?.expires_at,
      message: '환영 선물 받았어 — 100만 토큰 ✦'
    });
  } catch (e: any) {
    console.warn('[welcome-bonus] error:', e);
    return jsonResponse({ ok: false, error: e.message || String(e) }, 500);
  }
}
