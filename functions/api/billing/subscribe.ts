// POST /api/billing/subscribe — 월 정액 가입.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';

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
    await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${user.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        subscription_active: true,
        subscription_expires_at: expiresAt,
        subscription_plan: plan,
        monthly_token_used: 0,
        monthly_period_started_at: periodStartedAt
      })
    });
    return jsonResponse({ ok: true, expires_at: expiresAt, plan });
  } catch (e: any) {
    return jsonResponse({ error: 'billing 갱신 실패: ' + (e?.message || e) }, 500);
  }
}
