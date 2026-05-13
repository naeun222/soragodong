// POST /api/billing/portone-verify-pay
// PortOne V2 결제 검증 — frontend 가 결제창 완료 후 호출.
// 사용자 명시 2026-05-06: V1 (subscribe.ts) 폐기, V2 마이그레이션. paymentId 만 받고 서버에서 실 status / amount 검증.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';
import { TIER_PLANS, type TierKey, validateTier } from '../_lib/billing';
import { fetchPortOnePayment } from '../_lib/portone';

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();
  if (user.is_anonymous) {
    return jsonResponse({ error: '게스트는 결제 X — 로그인 후 진행', code: 'GUEST_BLOCKED' }, 403);
  }

  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'invalid JSON' }, 400); }
  const { paymentId, plan } = body;
  if (!paymentId || typeof paymentId !== 'string') {
    return jsonResponse({ error: 'paymentId 필수' }, 400);
  }
  if (!plan) return jsonResponse({ error: 'plan 필수' }, 400);

  // tier 검증 — 서버 사이드 (클라이언트 위변조 방지).
  const tierCheck = await validateTier(env, user.id, plan);
  if (!tierCheck.ok || !tierCheck.tier) {
    return jsonResponse({ error: tierCheck.error || 'tier 검증 실패' }, 400);
  }
  const tier = tierCheck.tier;

  // PortOne V2 단건 조회.
  const fetchResult = await fetchPortOnePayment(env, paymentId);
  if (!fetchResult.ok) {
    return jsonResponse({ error: '결제 조회 실패: ' + fetchResult.error }, 502);
  }
  const payment = fetchResult.payment;

  // 결제 상태 검증.
  if (payment.status !== 'PAID') {
    return jsonResponse({
      error: `결제 상태 ${payment.status} — 완료된 결제 X`,
      code: 'NOT_PAID',
      portone_status: payment.status
    }, 400);
  }

  // 사용자 보고 2026-05-06: customer 매칭 검증 — anonymous swap / multi-account drift 방어.
  // 결제 시점 PortOne 측 customer.id 가 현재 호출자 user.id 와 같아야 함.
  const portoneCustomerId = (payment.customer && (payment.customer.id || payment.customer.customerId)) || '';
  if (portoneCustomerId && portoneCustomerId !== user.id) {
    return jsonResponse({
      error: '결제 시점 계정과 현재 로그인 계정이 달라 — 결제했던 계정으로 다시 로그인.',
      code: 'CUSTOMER_MISMATCH',
      portone_customer: portoneCustomerId,
      caller: user.id
    }, 403);
  }
  if (!portoneCustomerId) {
    console.warn('[verify-pay] payment.customer.id 없음 — 매칭 검증 skip:', paymentId);
  }

  // 금액 검증 (위변조 방지).
  const paidAmount = Number(payment.amount?.total || 0);
  if (paidAmount !== tier.krw) {
    return jsonResponse({
      error: `결제 금액 불일치 — 요청 ${tier.krw}원, 실 ${paidAmount}원`,
      code: 'AMOUNT_MISMATCH'
    }, 400);
  }

  // V4 (사용자 명시 2026-05-11 ultrathink): early_lifetime = 정가 entry tier (정기결제) 로 변경 — 옛 'lifetime 1회 결제' 가정 폐기.
  // 모든 plan 30일 cycle 동일 처리. 아래 isLifetime 분기는 자연히 dead code (변수만 호환 보존).
  // 새 정기결제 흐름은 portone-register-recurring.ts (즉시 결제) / portone-register-trial.ts (Plus 첫 달 무료) 사용.
  // 이 endpoint 는 옛 V1 IMP 흐름 legacy — 호출 안 됨.
  const isLifetime = false;
  const expiresAt = isLifetime ? '2099-12-31T23:59:59.000Z' : new Date(Date.now() + 30 * 86400000).toISOString();
  const periodStartedAt = new Date().toISOString();

  // early_lifetime 중복 결제 검출 — 이미 활성이면 환불 안내.
  if (isLifetime) {
    try {
      const checkResp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${user.id}&select=subscription_plan,subscription_active`,
        { headers: { 'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
      );
      const rows: any = await checkResp.json().catch(() => []);
      if (Array.isArray(rows) && rows[0]?.subscription_plan === 'early_lifetime' && rows[0]?.subscription_active) {
        return jsonResponse({ ok: true, already_active: true, duplicate: true, message: '이미 활성 구독이 있어 (중복 결제 감지). 환불 — soragodongapp@gmail.com' }, 200);
      }
    } catch {}
  }

  // 결제 기록 저장 (idempotent — paymentId unique 이라 중복 INSERT 자동 무시).
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
        payment_type: 'subscribe',
        amount_krw: paidAmount,
        portone_imp_uid: payment.txId || paymentId,    // V2 txId (옛 imp_uid 자리)
        portone_merchant_uid: paymentId,                // V2 paymentId (옛 merchant_uid 자리)
        status: 'paid',
        raw_response: payment,
        // 사용자 명시 2026-05-09 ultrathink (audit FAIL #8 + 사용자 명시): 영수증 + 현금영수증 자동 발급 기록.
        receipt_url: payment.receiptUrl || null,
        cash_receipt_status: (payment as any).cashReceipt?.status || ((payment as any).cashReceipt ? 'ISSUED' : 'NONE'),
        cash_receipt_type: (payment as any).cashReceipt?.type || 'SELF_ISSUE'
      })
    });
  } catch (e) { console.warn('[portone-verify-pay] payment 기록 실패:', e); }

  // billing 갱신 — race-safe (기존 active 면 중복 결제 감지).
  // early_lifetime = 무조건 갱신 (중복은 위에서 이미 감지). 일반 구독 = 비활성/만료/guest/early_light/early_lifetime 에서만.
  const patchUrl = isLifetime
    ? `${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${user.id}`
    : `${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${user.id}&or=(subscription_active.is.null,subscription_active.eq.false,subscription_expires_at.lt.${encodeURIComponent(new Date().toISOString())},subscription_plan.eq.guest,subscription_plan.eq.early_light,subscription_plan.eq.early_lifetime)`;
  try {
    const patchResp = await fetch(
      patchUrl,
      {
        method: 'PATCH',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          subscription_active: true,
          subscription_expires_at: expiresAt,
          subscription_plan: plan,
          monthly_quota_usd: tier.cap_usd,
          monthly_token_used: 0,
          monthly_period_started_at: periodStartedAt,
          // 사용자 명시 2026-05-12 ultrathink: 구독 시점부터 daily quota 0 부터 카운트.
          daily_quota_used: 0,
          daily_quota_reset_at: new Date(Date.now() + 86400_000).toISOString(),
          // 사용자 보고 2026-05-09 ultrathink: schema 통일 (migration 0016) — billing.user_email sync.
          user_email: user.email || null
        })
      }
    );
    const patched = await patchResp.json().catch(() => []);
    if (!Array.isArray(patched) || patched.length === 0) {
      // 이미 active 한 light/premium 구독 — 중복 결제. 환불 안내.
      return jsonResponse({
        ok: true,
        already_active: true,
        duplicate: true,
        message: '이미 활성 구독이 있어 (중복 결제 감지). 영수증 보관 후 환불 요청 — soragodongapp@gmail.com 으로 문의 (잔여일 비례 환불).'
      }, 200);
    }
    // V4 (사용자 보고 2026-05-13 ultrathink): saved_plan 검증 — portone-register-recurring 의 mismatch fix 와 동일 패턴.
    const savedRow = patched[0];
    if (savedRow && savedRow.subscription_plan !== plan) {
      console.error('[verify-pay] plan mismatch!', { sent: plan, saved: savedRow.subscription_plan, paymentId, user: user.id });
      return jsonResponse({
        error: `결제는 완료됐지만 plan 저장 실패. 관리자 문의 (paymentId: ${paymentId}, sent=${plan}, saved=${savedRow.subscription_plan}).`,
        code: 'UPSERT_MISMATCH',
        paymentId,
        sent_plan: plan,
        saved_plan: savedRow.subscription_plan
      }, 500);
    }
    return jsonResponse({ ok: true, expires_at: expiresAt, plan, cap_usd: tier.cap_usd });
  } catch (e: any) {
    return jsonResponse({ error: 'billing 갱신 실패: ' + (e?.message || e) }, 500);
  }
}
