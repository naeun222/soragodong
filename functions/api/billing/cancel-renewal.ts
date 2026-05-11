// POST /api/billing/cancel-renewal
// 사용자 명시 2026-05-06: 다음 갱신 해지 — 현 결제 만료까지 사용, 자동 갱신 차단. 환불 X.
//
// 동작:
//   - billing.cancel_at_period_end = true
//   - billing.cancelled_at = now
//   - 빌링키 (모든 정기 plan: Light/Plus/Premium) 도 즉시 삭제 (다음 결제 시도 방지 이중 안전).
//     Plus trial 중 (still in 30-day window) 도 동일 — trial 만료 후 자동 비활성.
//
// 멱등 — 이미 cancel 상태면 그대로 OK 응답.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';
import { deletePortOneBillingKey } from '../_lib/portone';

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();
  if (user.is_anonymous) {
    return jsonResponse({ error: '게스트는 구독 X', code: 'GUEST_BLOCKED' }, 403);
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'env 미설정' }, 500);
  }

  // 현재 billing 조회.
  let billing: any = null;
  try {
    const resp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${user.id}&select=subscription_active,subscription_plan,subscription_expires_at,cancel_at_period_end,portone_billing_key`,
      { headers: { 'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    const rows: any = await resp.json();
    billing = rows?.[0];
  } catch (e) {
    return jsonResponse({ error: 'billing 조회 실패' }, 500);
  }

  if (!billing || !billing.subscription_active) {
    return jsonResponse({ error: '활성 구독이 없어' }, 400);
  }
  if (billing.cancel_at_period_end) {
    return jsonResponse({ ok: true, already_cancelled: true, expires_at: billing.subscription_expires_at });
  }

  // 빌링키 삭제 (모든 정기 plan 공통 — Light/Plus/Premium 모두 빌링키 있음).
  if (billing.portone_billing_key) {
    const delResult = await deletePortOneBillingKey(env, billing.portone_billing_key, '사용자 다음 갱신 해지');
    if (!delResult.ok) {
      // PortOne 삭제 실패해도 DB 표시는 진행 — cron 이 cancel_at_period_end=true 면 skip.
      console.warn('[cancel-renewal] 빌링키 삭제 실패 (계속 진행):', delResult.error);
    }
  }

  // billing 갱신.
  try {
    const patchResp = await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${user.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        cancel_at_period_end: true,
        cancelled_at: new Date().toISOString(),
        // 빌링키 clear (재구독 시 재등록).
        portone_billing_key: null,
        next_billing_at: null
      })
    });
    if (!patchResp.ok) {
      return jsonResponse({ error: 'billing PATCH 실패: ' + patchResp.status }, 500);
    }
  } catch (e: any) {
    return jsonResponse({ error: 'PATCH throw: ' + (e?.message || e) }, 500);
  }

  return jsonResponse({
    ok: true,
    expires_at: billing.subscription_expires_at,
    message: '다음 갱신 해지됨 — 만료일까지 사용 가능, 환불 X.'
  });
}
