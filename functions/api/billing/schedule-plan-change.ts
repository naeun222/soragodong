// POST /api/billing/schedule-plan-change
// V4 (사용자 명시 2026-05-13 ultrathink): 다운그레이드 = 다음 갱신부터 자동 전환 (Phase B).
//
// 입력:  { newPlan: 'light' | 'premium' | 'early_lifetime' }
// 동작:
//   - billing.scheduled_plan_change      = newPlan
//   - billing.scheduled_plan_change_at   = now()
//   - cancel_at_period_end / portone_billing_key 는 건드리지 X (정상 자동 갱신 흐름 유지, plan 만 swap).
//   - cron-charge-recurring 이 만료일 도달 시 scheduled_plan_change 보고 새 plan 으로 charge + 전환.
//
// 멱등 — 이미 같은 newPlan 예약돼있으면 OK 그대로.
//
// 가드:
//   - 활성 자동 갱신 구독 (subscription_active && portone_billing_key) 필수.
//   - cancel_at_period_end=true 이면 거부 (이미 해지 예약 — schedule 충돌).
//   - newPlan 이 valid tier 이고 currentPlan 과 달라야 함.
//   - 업그레이드 (rank 가 높은 plan) 요청은 거부 — 업그레이드는 즉시 결제 흐름 (portone-register-recurring) 사용.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';
import { TIER_PLANS, type TierKey } from '../_lib/billing';

const VALID_NEW_PLANS: TierKey[] = ['light', 'premium', 'early_lifetime'];
const TIER_RANK: Record<string, number> = { early_lifetime: 1, light: 2, premium: 3 };

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

  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'invalid JSON' }, 400); }

  // V4 (사용자 명시 2026-05-13 ultrathink): cancel:true 분기 — 예약된 plan 변경 취소.
  //   billing.scheduled_plan_change = NULL / scheduled_plan_change_at = NULL.
  //   현재 plan 그대로 다음 갱신 진행.
  if (body?.cancel === true) {
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
          scheduled_plan_change: null,
          scheduled_plan_change_at: null
        })
      });
      if (!patchResp.ok) {
        const errTxt = await patchResp.text().catch(() => '');
        if (errTxt.includes('scheduled_plan_change') || errTxt.includes('column')) {
          return jsonResponse({
            error: 'DB schema 미적용 — supabase migration 0022_scheduled_plan_change.sql 실행 필요.',
            code: 'COLUMN_MISSING'
          }, 500);
        }
        return jsonResponse({ error: 'cancel PATCH 실패: ' + patchResp.status }, 500);
      }
      return jsonResponse({ ok: true, cancelled: true, message: '예약된 plan 변경 취소됨 — 현재 plan 그대로 갱신.' });
    } catch (e: any) {
      return jsonResponse({ error: 'cancel throw: ' + (e?.message || e) }, 500);
    }
  }

  const newPlan = body?.newPlan;
  if (!newPlan || !VALID_NEW_PLANS.includes(newPlan)) {
    return jsonResponse({ error: 'newPlan = light | premium | early_lifetime 만 허용' }, 400);
  }
  if (!TIER_PLANS[newPlan as TierKey]) {
    return jsonResponse({ error: '알 수 없는 plan' }, 400);
  }

  // 현재 billing 조회.
  let billing: any = null;
  try {
    const resp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${user.id}&select=subscription_active,subscription_plan,subscription_expires_at,next_billing_at,cancel_at_period_end,portone_billing_key,scheduled_plan_change`,
      { headers: { 'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    const rows: any = await resp.json();
    billing = rows?.[0];
  } catch (e) {
    return jsonResponse({ error: 'billing 조회 실패' }, 500);
  }

  if (!billing || !billing.subscription_active) {
    return jsonResponse({ error: '활성 구독이 없어 — 먼저 구독부터.', code: 'NO_SUBSCRIPTION' }, 400);
  }
  if (!billing.portone_billing_key) {
    return jsonResponse({ error: '자동 갱신 카드가 등록돼있어야 plan 변경 예약 가능. 가계약 trial 사용자는 만료 후 직접 가입.', code: 'NO_BILLING_KEY' }, 400);
  }
  if (billing.cancel_at_period_end) {
    return jsonResponse({ error: '이미 해지 예약돼있어. 해지 취소 후 plan 변경 예약 가능.', code: 'ALREADY_CANCELLED' }, 400);
  }
  if (billing.subscription_plan === newPlan) {
    return jsonResponse({ error: '같은 plan 으로는 예약 X', code: 'SAME_PLAN' }, 400);
  }
  // 업그레이드 거부 — 업그레이드는 즉시 결제 흐름 (portone-register-recurring).
  const curRank = TIER_RANK[billing.subscription_plan] || 0;
  const newRank = TIER_RANK[newPlan] || 0;
  if (newRank > curRank) {
    return jsonResponse({ error: '업그레이드는 즉시 결제 흐름 사용 (portone-register-recurring). 이 endpoint 는 다운그레이드 전용.', code: 'UPGRADE_NOT_ALLOWED' }, 400);
  }

  // 멱등 체크 — 이미 같은 newPlan 예약돼있으면 OK 그대로.
  if (billing.scheduled_plan_change === newPlan) {
    return jsonResponse({
      ok: true,
      already_scheduled: true,
      scheduled_plan_change: newPlan,
      expires_at: billing.subscription_expires_at,
      next_billing_at: billing.next_billing_at
    });
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
        scheduled_plan_change: newPlan,
        scheduled_plan_change_at: new Date().toISOString()
      })
    });
    if (!patchResp.ok) {
      const errTxt = await patchResp.text().catch(() => '');
      // column missing 케이스 — migration 0022 미적용.
      if (errTxt.includes('scheduled_plan_change') || errTxt.includes('column')) {
        return jsonResponse({
          error: 'DB schema 미적용 — supabase migration 0022_scheduled_plan_change.sql 실행 필요.',
          code: 'COLUMN_MISSING'
        }, 500);
      }
      return jsonResponse({ error: 'billing PATCH 실패: ' + patchResp.status + ' ' + errTxt.slice(0, 200) }, 500);
    }
  } catch (e: any) {
    return jsonResponse({ error: 'PATCH throw: ' + (e?.message || e) }, 500);
  }

  const newTier = TIER_PLANS[newPlan as TierKey];
  return jsonResponse({
    ok: true,
    scheduled_plan_change: newPlan,
    next_billing_at: billing.next_billing_at,
    expires_at: billing.subscription_expires_at,
    message: `다음 갱신일 (${billing.next_billing_at ? new Date(billing.next_billing_at).toLocaleDateString('ko-KR') : '만료일'}) 에 자동으로 ${newTier.label} ${newTier.krw.toLocaleString()}원 결제 + 새 cycle 시작.`
  });
}
