// POST /api/billing/charge — 충전 결제 검증 + 잔액 추가.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';

const KRW_PER_USD = 1400;

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

  // 1. 포트원 access token
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

  // 2. 결제 검증
  let payment: any;
  try {
    const payResp = await fetch(`https://api.iamport.kr/payments/${imp_uid}`, {
      headers: { 'Authorization': accessToken }
    });
    const payData: any = await payResp.json();
    payment = payData?.response;
    if (!payment) throw new Error('결제 정보 없음');
    if (payment.status !== 'paid') {
      return jsonResponse({ error: '결제 미완료: ' + payment.status }, 400);
    }
    if (payment.merchant_uid !== merchant_uid) {
      return jsonResponse({ error: 'merchant_uid 불일치' }, 400);
    }
  } catch (e: any) {
    return jsonResponse({ error: '결제 검증 실패: ' + (e?.message || e) }, 502);
  }

  const amount_krw = payment.amount;
  const amount_usd = Math.round((amount_krw / KRW_PER_USD) * 1_000_000) / 1_000_000;

  // 3. payments 기록
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
        payment_type: 'charge',
        amount_krw,
        amount_credit_usd: amount_usd,
        portone_imp_uid: imp_uid,
        portone_merchant_uid: merchant_uid,
        status: 'paid',
        raw_response: payment
      })
    });
  } catch (e) { console.warn('[charge] payment 기록 실패:', e); }

  // 4. 잔액 추가
  try {
    const billingResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${user.id}&select=credit_balance_usd`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    const billingRows: any = await billingResp.json();
    const currentBalance = (billingRows[0]?.credit_balance_usd) || 0;
    const newBalance = Math.round((currentBalance + amount_usd) * 1_000_000) / 1_000_000;
    await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${user.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ credit_balance_usd: newBalance })
    });
    return jsonResponse({ ok: true, charged_krw: amount_krw, charged_usd: amount_usd, new_balance_usd: newBalance });
  } catch (e: any) {
    return jsonResponse({ error: '잔액 갱신 실패: ' + (e?.message || e) }, 500);
  }
}
