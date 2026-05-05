// POST /api/billing/upgrade-tier — Light/early_light → Premium 즉시 업그레이드 (정가 결제 + 새 사이클).
// 사용자 명시 2026-05-02 ultrathink (§8): "그 날부터 새 한 달 시작, 25,000원 결제 (Light 잔여 보상 X)".
// 차액 결제 패턴 폐기 — 단순함 + ChatGPT/Claude Pro 동일 멘탈 모델.
//
// 흐름:
//   1) Light/early_light 활성 사용자가 정가 25,000원 결제
//   2) subscription_plan = 'premium' / monthly_quota_usd = 13 (cap $13)
//   3) monthly_token_used = 0 (리셋 — 새 사이클)
//   4) subscription_expires_at = NOW + 30days (새 사이클 시작)

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';
import { TIER_PLANS } from '../_lib/billing';
import { fetchPortOnePayment } from '../_lib/portone';

const PREMIUM_KRW = TIER_PLANS.premium.krw; // 25,000

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();
  if (user.is_anonymous) {
    return jsonResponse({ error: '게스트는 결제 X', code: 'GUEST_BLOCKED' }, 403);
  }

  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'invalid JSON' }, 400); }
  const { paymentId } = body;
  if (!paymentId) {
    return jsonResponse({ error: 'paymentId 필수' }, 400);
  }

  // 현재 billing 상태 확인 — Light 활성 사용자만 업그레이드 가능
  let currentBilling: any;
  try {
    const resp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${user.id}&select=subscription_plan,subscription_active,subscription_expires_at`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    const rows: any = await resp.json();
    currentBilling = rows?.[0];
  } catch (e) {
    return jsonResponse({ error: 'billing 조회 실패' }, 500);
  }

  // 사용자 명시 2026-05-02 ultrathink: light 또는 early_light 활성 사용자 둘 다 가능.
  const isUpgradable = currentBilling
    && currentBilling.subscription_active
    && (currentBilling.subscription_plan === 'light' || currentBilling.subscription_plan === 'early_light');
  if (!isUpgradable) {
    return jsonResponse({ error: 'Light 또는 early_light 활성 사용자만 업그레이드 가능. 현재 plan: ' + (currentBilling?.subscription_plan || 'X') }, 400);
  }

  // PortOne V2 결제 검증.
  const fetchResult = await fetchPortOnePayment(env, paymentId);
  if (!fetchResult.ok) {
    return jsonResponse({ error: '결제 조회 실패: ' + fetchResult.error }, 502);
  }
  const payment = fetchResult.payment;
  if (payment.status !== 'PAID') {
    return jsonResponse({ error: `결제 상태 ${payment.status}`, code: 'NOT_PAID' }, 400);
  }
  const paidAmount = Number(payment.amount?.total || 0);
  if (paidAmount !== PREMIUM_KRW) {
    return jsonResponse({ error: `Premium 정가 불일치 (= ${PREMIUM_KRW}원, 실 ${paidAmount}원)` }, 400);
  }

  // payments 기록.
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
        payment_type: 'tier_upgrade',
        amount_krw: paidAmount,
        portone_imp_uid: payment.txId || paymentId,
        portone_merchant_uid: paymentId,
        status: 'paid',
        raw_response: payment
      })
    });
  } catch (e) { console.warn('[upgrade-tier] payment 기록 실패:', e); }

  // 사용자 명시 2026-05-02 ultrathink: tier 변경 + 새 사이클 시작.
  // plan = premium / quota = $13 / monthly_token_used = 0 (리셋) / expires_at = NOW + 30 days
  const newExpiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  const newPeriodStartedAt = new Date().toISOString();
  try {
    const patchResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${user.id}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          subscription_plan: 'premium',
          subscription_active: true,
          subscription_expires_at: newExpiresAt,
          monthly_quota_usd: TIER_PLANS.premium.cap_usd,
          monthly_token_used: 0,
          monthly_period_started_at: newPeriodStartedAt
        })
      }
    );
    if (!patchResp.ok) {
      console.error('[upgrade-tier] PATCH 실패:', patchResp.status);
      return jsonResponse({ error: '업그레이드 갱신 실패' }, 500);
    }
    return jsonResponse({
      ok: true,
      plan: 'premium',
      cap_usd: TIER_PLANS.premium.cap_usd,
      expires_at: newExpiresAt,
      period_started_at: newPeriodStartedAt
    });
  } catch (e: any) {
    return jsonResponse({ error: 'billing 갱신 실패: ' + (e?.message || e) }, 500);
  }
}
