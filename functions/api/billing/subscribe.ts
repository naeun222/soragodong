// POST /api/billing/subscribe — 월 정액 가입 (사용자 명시 2026-05-02 ultrathink: light / premium / early_light).

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';
import { TIER_PLANS, type TierKey, validateTier } from '../_lib/billing';

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();

  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'invalid JSON' }, 400); }
  const { imp_uid, merchant_uid, plan } = body;
  if (!imp_uid || !merchant_uid || !plan) {
    return jsonResponse({ error: 'imp_uid + merchant_uid + plan 필수' }, 400);
  }
  // 사용자 명시 2026-05-02 ultrathink: tier 검증 (서버 사이드 — 클라이언트 위변조 방지).
  // early_light 는 early_user flag 필수 (validateTier 가 검증).
  const tierCheck = await validateTier(env, user.id, plan);
  if (!tierCheck.ok || !tierCheck.tier) {
    return jsonResponse({ error: tierCheck.error || 'tier 검증 실패' }, 400);
  }
  const tier = tierCheck.tier;
  if (!env.PORTONE_API_KEY || !env.PORTONE_API_SECRET) {
    return jsonResponse({ error: 'PORTONE env 미설정' }, 500);
  }

  let accessToken: string;
  try {
    const tokenResp = await fetch('https://api.iamport.kr/users/getToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imp_key: env.PORTONE_API_KEY, imp_secret: env.PORTONE_API_SECRET })
    });
    const tokenData: any = await tokenResp.json();
    accessToken = tokenData?.response?.access_token;
    if (!accessToken) throw new Error('포트원 토큰 없음');
  } catch (e: any) {
    return jsonResponse({ error: '포트원 인증 실패: ' + (e?.message || e) }, 502);
  }

  let payment: any;
  try {
    const payResp = await fetch(`https://api.iamport.kr/payments/${imp_uid}`, {
      headers: { 'Authorization': accessToken }
    });
    const payData: any = await payResp.json();
    payment = payData?.response;
    if (!payment || payment.status !== 'paid' || payment.merchant_uid !== merchant_uid) {
      return jsonResponse({ error: '결제 검증 실패' }, 400);
    }
    // 사용자 명시 2026-04-30: 결제 금액이 tier 가격과 일치하는지 검증 (위변조 방지).
    if (Number(payment.amount) !== tier.krw) {
      return jsonResponse({ error: `결제 금액 불일치 (${plan} = ${tier.krw}원, 실 ${payment.amount}원)` }, 400);
    }
  } catch (e: any) {
    return jsonResponse({ error: '결제 조회 실패: ' + (e?.message || e) }, 502);
  }

  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  const periodStartedAt = new Date().toISOString();

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
        amount_krw: payment.amount,
        portone_imp_uid: imp_uid,
        portone_merchant_uid: merchant_uid,
        status: 'paid',
        raw_response: payment
      })
    });
  } catch (e) { console.warn('[subscribe] payment 기록 실패:', e); }

  try {
    // 사용자 명시 2026-05-01 (agent audit): 동시 결제 race 차단 — `?subscription_active=eq.false` 필터.
    // 이미 active 한 사용자가 빠른 두 번 결제 시 첫 번째 PATCH 만 성공 (winner), 두 번째 = 0 row 응답 → 한 달 결제 사라지는 자리 fix.
    const patchResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${user.id}&or=(subscription_active.is.null,subscription_active.eq.false,subscription_expires_at.lt.${encodeURIComponent(new Date().toISOString())})`,
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
          monthly_period_started_at: periodStartedAt
        })
      }
    );
    const patched = await patchResp.json().catch(() => []);
    if (!Array.isArray(patched) || patched.length === 0) {
      // 이미 active 구독 — race 두 번째 호출이 도달했거나, 아직 만료 X. 결제는 성공 처리 (포트원 환불 정책에 맡김).
      return jsonResponse({ ok: true, already_active: true, message: '이미 활성 구독이 있어. 만료 시점에 다시 결제해줘.' }, 200);
    }
    return jsonResponse({ ok: true, expires_at: expiresAt, plan, cap_usd: tier.cap_usd });
  } catch (e: any) {
    return jsonResponse({ error: 'billing 갱신 실패: ' + (e?.message || e) }, 500);
  }
}
