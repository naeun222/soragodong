// 환불 — 포트원 자동 환불 + payments 기록 + billing 잔액 차감 (충전 시 환불 시).
// 사용자 요청 2026-04-30 (Phase C): refund.md 정책대로 비례 환불.

import { verifyAuth, unauthorized, jsonResponse } from '../_lib/auth';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PORTONE_API_KEY = process.env.PORTONE_API_KEY || '';
const PORTONE_API_SECRET = process.env.PORTONE_API_SECRET || '';

const KRW_PER_USD = 1400;

export const config = { runtime: 'nodejs' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'POST only' }, 405);
  }
  const user = await verifyAuth(req);
  if (!user) return unauthorized();

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ error: 'invalid JSON' }, 400); }
  const { payment_id, reason } = body;
  if (!payment_id) {
    return jsonResponse({ error: 'payment_id 필수' }, 400);
  }

  // 1. 결제 row 조회 + 본인 거 확인 + 비례 환불액 계산
  let paymentRow: any;
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_payments?id=eq.${payment_id}&user_id=eq.${user.id}&select=*&limit=1`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    const rows = await resp.json();
    if (!rows || rows.length === 0) {
      return jsonResponse({ error: '결제 기록 없음 또는 본인 거 X' }, 404);
    }
    paymentRow = rows[0];
    if (paymentRow.status !== 'paid') {
      return jsonResponse({ error: '환불 불가 (status=' + paymentRow.status + ')' }, 400);
    }
  } catch (e: any) {
    return jsonResponse({ error: '결제 조회 실패: ' + (e?.message || e) }, 500);
  }

  // 2. 비례 환불액 계산 (refund.md 정책 따라)
  let refundAmountKrw = paymentRow.amount_krw;
  if (paymentRow.payment_type === 'charge') {
    // 충전식 — 잔여 충전 잔액 100% 환불 (사용분 차감)
    const billingResp = await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${user.id}&select=credit_balance_usd`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    const billingRows = await billingResp.json();
    const balance = billingRows[0]?.credit_balance_usd || 0;
    refundAmountKrw = Math.min(paymentRow.amount_krw, Math.floor(balance * KRW_PER_USD));
  } else if (paymentRow.payment_type === 'subscribe') {
    // 월 정액 — 잔여일 비율 환불
    const paidAt = new Date(paymentRow.created_at).getTime();
    const elapsedDays = Math.floor((Date.now() - paidAt) / 86400000);
    const remainingDays = Math.max(0, 30 - elapsedDays);
    refundAmountKrw = Math.floor(paymentRow.amount_krw * remainingDays / 30);
  }

  if (refundAmountKrw <= 0) {
    return jsonResponse({ error: '환불 가능 금액 0원' }, 400);
  }

  // 3. 포트원 토큰
  if (!PORTONE_API_KEY || !PORTONE_API_SECRET) {
    return jsonResponse({ error: 'PORTONE env 미설정' }, 500);
  }
  let accessToken: string;
  try {
    const tokenResp = await fetch('https://api.iamport.kr/users/getToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imp_key: PORTONE_API_KEY, imp_secret: PORTONE_API_SECRET })
    });
    const tokenData = await tokenResp.json();
    accessToken = tokenData?.response?.access_token;
    if (!accessToken) throw new Error('토큰 없음');
  } catch (e: any) {
    return jsonResponse({ error: '포트원 인증 실패: ' + (e?.message || e) }, 502);
  }

  // 4. 포트원 환불 요청
  try {
    const refundResp = await fetch('https://api.iamport.kr/payments/cancel', {
      method: 'POST',
      headers: { 'Authorization': accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imp_uid: paymentRow.portone_imp_uid,
        amount: refundAmountKrw,
        reason: reason || '사용자 환불 요청',
        checksum: refundAmountKrw   // 추가 검증
      })
    });
    const refundData = await refundResp.json();
    if (refundData?.code !== 0) {
      return jsonResponse({ error: '포트원 환불 실패: ' + (refundData?.message || '알 수 없음') }, 502);
    }
  } catch (e: any) {
    return jsonResponse({ error: '환불 요청 예외: ' + (e?.message || e) }, 502);
  }

  // 5. payments 기록 갱신
  await fetch(`${SUPABASE_URL}/rest/v1/soragodong_payments?id=eq.${payment_id}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      status: refundAmountKrw === paymentRow.amount_krw ? 'refunded' : 'paid',
      refund_amount_krw: refundAmountKrw,
      refunded_at: new Date().toISOString(),
      refund_reason: reason || ''
    })
  }).catch(() => {});

  // 6. 충전식이면 billing 잔액에서 환불액 차감
  if (paymentRow.payment_type === 'charge') {
    const refundUsd = refundAmountKrw / KRW_PER_USD;
    const billingResp = await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${user.id}&select=credit_balance_usd`,
      { headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    const rows = await billingResp.json();
    const newBalance = Math.max(0, (rows[0]?.credit_balance_usd || 0) - refundUsd);
    await fetch(`${SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${user.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ credit_balance_usd: Math.round(newBalance * 1_000_000) / 1_000_000 })
    }).catch(() => {});
  }

  return jsonResponse({ ok: true, refunded_krw: refundAmountKrw, message: '환불 완료. 카드사 정책에 따라 3-7영업일 내 카드 명세서 반영.' });
}
