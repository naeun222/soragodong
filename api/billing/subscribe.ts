// 월 정액 가입 — 포트원 결제 검증 후 subscription_active=true + expires_at 박기.
// 사용자 요청 2026-04-30 (Phase C): 월 정액제.

import { verifyAuth, unauthorized, jsonResponse } from '../_lib/auth';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PORTONE_API_KEY = process.env.PORTONE_API_KEY || '';
const PORTONE_API_SECRET = process.env.PORTONE_API_SECRET || '';

export const config = { runtime: 'nodejs' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'POST only' }, 405);
  }
  const user = await verifyAuth(req);
  if (!user) return unauthorized();

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ error: 'invalid JSON' }, 400); }
  const { imp_uid, merchant_uid, plan } = body;
  if (!imp_uid || !merchant_uid || !plan) {
    return jsonResponse({ error: 'imp_uid + merchant_uid + plan 필수' }, 400);
  }

  if (!PORTONE_API_KEY || !PORTONE_API_SECRET) {
    return jsonResponse({ error: 'PORTONE env 미설정' }, 500);
  }

  // 포트원 토큰 + 결제 검증 (charge.ts와 동일 패턴)
  let accessToken: string;
  try {
    const tokenResp = await fetch('https://api.iamport.kr/users/getToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imp_key: PORTONE_API_KEY, imp_secret: PORTONE_API_SECRET })
    });
    const tokenData = await tokenResp.json();
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
    const payData = await payResp.json();
    payment = payData?.response;
    if (!payment || payment.status !== 'paid' || payment.merchant_uid !== merchant_uid) {
      return jsonResponse({ error: '결제 검증 실패' }, 400);
    }
  } catch (e: any) {
    return jsonResponse({ error: '결제 조회 실패: ' + (e?.message || e) }, 502);
  }

  // 만료일 = 현재 + 30일
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  const periodStartedAt = new Date().toISOString();

  // payments 기록
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/soragodong_payments`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
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

  // billing row 갱신 — subscription_active + expires_at + plan + period 리셋
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${user.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
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
