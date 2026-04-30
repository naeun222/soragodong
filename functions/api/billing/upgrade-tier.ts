// POST /api/billing/upgrade-tier — Light → Premium 차액 결제로 즉시 업그레이드.
// 사용자 명시 2026-04-30 ultrathink: cap 도달 시 "tier 업그레이드 — 차액 16,100원 결제" 옵션.
//
// 흐름:
//   1) Light 활성 사용자가 16,100원 (= 25K - 8.9K) 결제
//   2) subscription_plan = 'premium' / monthly_quota_usd = 15
//   3) monthly_token_used 는 그대로 유지 (이미 사용한 분 차감 X — 새 cap 안 으로 자동 흡수됨)
//   4) subscription_expires_at 그대로 (현재 cycle 끝까지)

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';
import { TIER_PLANS } from '../_lib/billing';

const UPGRADE_DIFF_KRW = TIER_PLANS.premium.krw - TIER_PLANS.light.krw; // 16,100

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();

  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'invalid JSON' }, 400); }
  const { imp_uid, merchant_uid } = body;
  if (!imp_uid || !merchant_uid) {
    return jsonResponse({ error: 'imp_uid + merchant_uid 필수' }, 400);
  }
  if (!env.PORTONE_API_KEY || !env.PORTONE_API_SECRET) {
    return jsonResponse({ error: 'PORTONE env 미설정' }, 500);
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

  if (!currentBilling || currentBilling.subscription_plan !== 'light' || !currentBilling.subscription_active) {
    return jsonResponse({ error: 'Light 활성 사용자만 업그레이드 가능. 현재 plan: ' + (currentBilling?.subscription_plan || 'X') }, 400);
  }

  // 포트원 결제 검증
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
    if (Number(payment.amount) !== UPGRADE_DIFF_KRW) {
      return jsonResponse({ error: `차액 불일치 (Light→Premium = ${UPGRADE_DIFF_KRW}원, 실 ${payment.amount}원)` }, 400);
    }
  } catch (e: any) {
    return jsonResponse({ error: '결제 조회 실패: ' + (e?.message || e) }, 502);
  }

  // payments 기록
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
        amount_krw: payment.amount,
        portone_imp_uid: imp_uid,
        portone_merchant_uid: merchant_uid,
        status: 'paid',
        raw_response: payment
      })
    });
  } catch (e) { console.warn('[upgrade-tier] payment 기록 실패:', e); }

  // tier 변경: plan = premium, quota = 15 USD. expires_at / monthly_token_used 그대로 유지.
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
          monthly_quota_usd: TIER_PLANS.premium.cap_usd
        })
      }
    );
    if (!patchResp.ok) {
      console.error('[upgrade-tier] PATCH 실패:', patchResp.status);
      return jsonResponse({ error: '업그레이드 갱신 실패' }, 500);
    }
    return jsonResponse({ ok: true, plan: 'premium', cap_usd: TIER_PLANS.premium.cap_usd });
  } catch (e: any) {
    return jsonResponse({ error: 'billing 갱신 실패: ' + (e?.message || e) }, 500);
  }
}
