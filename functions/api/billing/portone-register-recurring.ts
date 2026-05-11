// POST /api/billing/portone-register-recurring
// 사용자 명시 2026-05-11: Light/Plus/Premium 정기결제 — 빌링키 등록 + 첫 달 즉시 결제 + 자동 갱신.
// V4 (사용자 명시 2026-05-11 ultrathink): Light(early_lifetime, 4,900) 도 정기 결제 허용 (옛 1회 결제 lifetime 폐기).
//   Plus(light, 9,900) trial 흐름은 별도 — `portone-register-trial.ts` 사용.
//
// frontend 흐름:
//   1) PortOne.requestIssueBillingKey 로 카드 등록 (KG이니시스 빌링 채널 또는 카카오페이 정기)
//   2) billingKey + plan(early_lifetime|light|premium) 을 이 endpoint 에 POST
//      ⚠ Plus(light) 가 first-time trial 흐름이면 frontend 가 `portone-register-trial` 호출 (이 endpoint X).
//        이 endpoint 는 *즉시 첫 달 결제* 흐름.
//   3) 서버:
//      a) 빌링키 진위 검증 (status=ISSUED, customer.id 매칭)
//      b) chargeWithBillingKey 로 첫 달 즉시 결제
//      c) soragodong_billing UPSERT — active=true, plan, expires_at=+30d, next_billing_at=+30d
//      d) soragodong_payments INSERT
//   4) cron-charge-recurring 이 30일 후 자동 결제
//
// 중복 호출 방어: 이미 활성 동일 plan 사용자 = 빌링키 변경만 가능 (재결제 X).
// 멱등: paymentId = `recurring-first-{user_id}-{cycleDay}` — race retry 시 PortOne unique 보호.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';
import { TIER_PLANS, type TierKey, validateTier } from '../_lib/billing';
import { fetchPortOneBillingKey, chargeWithBillingKey } from '../_lib/portone';

const CYCLE_DAYS = 30;

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  // V4 (사용자 명시 2026-05-11 — 가계약): 정기결제 흐름 자체 비활성화 시 빌링키 등록 차단.
  //   cron-charge-recurring 이 no-op 인 상태에서 등록 시 = 첫 달 결제 후 갱신 X → 무한 무료 사용 (본인 출혈).
  //   frontend 가계약 모드는 proceedOneTimePurchase 로 분기하므로 이 endpoint 호출 X. 직접 호출 방어용.
  if ((env as any).BILLING_RECURRING_ENABLED !== 'true') {
    return jsonResponse({
      error: '정기결제 흐름 비활성 (가계약 단계) — 1개월 일회성 결제만 가능. /api/billing/portone-verify-pay 사용.',
      code: 'RECURRING_DISABLED'
    }, 403);
  }
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();
  if (user.is_anonymous) {
    return jsonResponse({ error: '게스트는 결제 X — 로그인 후 진행', code: 'GUEST_BLOCKED' }, 403);
  }

  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'invalid JSON' }, 400); }
  const { billingKey, plan } = body;
  if (!billingKey || typeof billingKey !== 'string') {
    return jsonResponse({ error: 'billingKey 필수' }, 400);
  }
  if (plan !== 'early_lifetime' && plan !== 'light' && plan !== 'premium') {
    return jsonResponse({ error: 'plan = early_lifetime | light | premium 만 허용' }, 400);
  }

  const tierCheck = await validateTier(env, user.id, plan);
  if (!tierCheck.ok || !tierCheck.tier) {
    return jsonResponse({ error: tierCheck.error || 'tier 검증 실패' }, 400);
  }
  const tier = tierCheck.tier;

  // PortOne 진위 검증.
  const fetchResult = await fetchPortOneBillingKey(env, billingKey);
  if (!fetchResult.ok) {
    return jsonResponse({ error: '빌링키 검증 실패: ' + fetchResult.error }, 502);
  }
  const data = fetchResult.data;
  if (data.status && data.status !== 'ISSUED') {
    return jsonResponse({ error: `빌링키 상태 ${data.status} — 유효한 ISSUED 상태 X` }, 400);
  }
  const portoneCustomerId = (data.customer && (data.customer.id || data.customer.customerId)) || '';
  if (portoneCustomerId && portoneCustomerId !== user.id) {
    return jsonResponse({
      error: '카드 등록 시점 계정과 현재 계정이 달라 — 등록했던 계정으로 다시 로그인.',
      code: 'CUSTOMER_MISMATCH'
    }, 403);
  }

  // 중복 등록 방어 — 이미 active 동일 plan 이면 안내.
  try {
    const checkResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${user.id}&select=subscription_plan,subscription_active,portone_billing_key`,
      { headers: { 'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    const rows: any = await checkResp.json().catch(() => []);
    if (Array.isArray(rows) && rows[0]) {
      const r = rows[0];
      if (r.subscription_active && r.subscription_plan === plan && r.portone_billing_key && r.portone_billing_key !== billingKey) {
        return jsonResponse({
          ok: true,
          duplicate: true,
          message: `이미 활성 ${tier.label} 구독 — 빌링키 변경은 [설정 → 카드 변경] 에서.`
        }, 200);
      }
    }
  } catch {}

  const now = new Date();
  const cycleStartIso = now.toISOString();
  const nextCycleIso = new Date(now.getTime() + CYCLE_DAYS * 86400_000).toISOString();
  const cycleDay = cycleStartIso.slice(0, 10);

  // 첫 달 즉시 결제 — paymentId 멱등 (같은 cycleDay 내 retry 시 unique 보호).
  const paymentId = `rf-${plan.slice(0,4)}-${user.id.slice(0,8)}-${cycleDay}`;
  const chargeResult = await chargeWithBillingKey(env, paymentId, {
    billingKey,
    orderName: `소라고동 ${tier.label} 정기 (${tier.krw.toLocaleString()}원/월) — 첫 달`,
    amount: tier.krw,
    currency: 'KRW',
    customer: { id: user.id, email: user.email || undefined },
    customData: JSON.stringify({ tier: plan, type: 'subscribe_recurring_first' })
  });

  if (!chargeResult.ok || chargeResult.payment.status !== 'PAID') {
    const errMsg = (chargeResult as any).error || `status=${(chargeResult as any).payment?.status || 'undefined'}`;
    const errCode = (chargeResult as any).code || 'CHARGE_FAILED';
    console.error('[register-recurring] charge fail:', {
      paymentId, plan, errMsg, errCode,
      payment: (chargeResult as any).payment
    });
    return jsonResponse({
      error: `첫 달 결제 실패: ${errMsg}`,
      code: errCode
    }, 402);
  }

  const payment = chargeResult.payment;
  const paidAmount = Number(payment.amount?.total || 0);

  // payments INSERT (idempotent).
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_payments`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal,resolution=ignore-duplicates'
      },
      body: JSON.stringify({
        user_id: user.id,
        user_email: user.email || null,
        payment_type: 'subscribe_recurring_first',
        amount_krw: paidAmount,
        portone_imp_uid: payment.txId || paymentId,
        portone_merchant_uid: paymentId,
        status: 'paid',
        raw_response: payment,
        receipt_url: payment.receiptUrl || null,
        cash_receipt_status: (payment as any).cashReceipt?.status || 'ISSUED',
        cash_receipt_type: 'SELF_ISSUE'
      })
    });
  } catch (e) { console.warn('[register-recurring] payment 기록 실패:', e); }

  // billing UPSERT — active, plan, expires_at=+30d, next_billing_at=+30d.
  try {
    const upsertResp = await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_billing`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal,resolution=merge-duplicates'
      },
      body: JSON.stringify({
        user_id: user.id,
        user_email: user.email || null,
        subscription_active: true,
        subscription_plan: plan,
        subscription_expires_at: nextCycleIso,
        monthly_quota_usd: tier.cap_usd,
        monthly_token_used: 0,
        monthly_period_started_at: cycleStartIso,
        // 사용자 명시 2026-05-12 ultrathink: 구독 시점부터 daily quota 0 부터 카운트.
        daily_quota_used: 0,
        daily_quota_reset_at: new Date(Date.now() + 86400_000).toISOString(),
        portone_billing_key: billingKey,
        portone_billing_key_issued_at: cycleStartIso,
        trial_until: null,
        next_billing_at: nextCycleIso,
        cancel_at_period_end: false,
        cancelled_at: null,
        last_billing_error: null
      })
    });
    if (!upsertResp.ok) {
      const errTxt = await upsertResp.text().catch(() => '');
      return jsonResponse({ error: 'billing 저장 실패: ' + upsertResp.status + ' ' + errTxt.slice(0, 200) }, 500);
    }
  } catch (e: any) {
    return jsonResponse({ error: 'billing 저장 throw: ' + (e?.message || e) }, 500);
  }

  return jsonResponse({
    ok: true,
    plan,
    cap_usd: tier.cap_usd,
    expires_at: nextCycleIso,
    next_billing_at: nextCycleIso,
    amount_paid_krw: paidAmount,
    message: `${tier.label} 정기 구독 완료 — 다음 결제 ${nextCycleIso.slice(0,10)} (${tier.krw.toLocaleString()}원/월 자동 갱신).`
  });
}
