// 충전 결제 검증 + 잔액 추가 — 포트원 결제 완료 후 클라이언트가 imp_uid를 보내면 검증해서 잔액 반영.
// 사용자 요청 2026-04-30 (Phase C): 충전식 결제 모델.
//
// 흐름:
// 1. 클라이언트: 포트원 SDK로 결제 완료 → imp_uid 받음
// 2. 클라이언트: POST /api/billing/charge { imp_uid, merchant_uid }
// 3. 백엔드 (이 endpoint): 포트원에 imp_uid 검증 → 결제 금액 확인 → 잔액 추가 + payments 기록

import { verifyAuth, unauthorized, jsonResponse } from '../_lib/auth';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PORTONE_API_KEY = process.env.PORTONE_API_KEY || '';
const PORTONE_API_SECRET = process.env.PORTONE_API_SECRET || '';

// 환율 (KRW → USD 환산). 정확한 환율은 외부 API 또는 고정값 사용.
// 여기선 단순화: 1 USD = 1400 KRW 가정. 실제는 매월 회사가 조정 또는 외부 환율 API.
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
  const { imp_uid, merchant_uid } = body;
  if (!imp_uid || !merchant_uid) {
    return jsonResponse({ error: 'imp_uid + merchant_uid 필수' }, 400);
  }

  if (!PORTONE_API_KEY || !PORTONE_API_SECRET) {
    return jsonResponse({ error: 'PORTONE 환경변수 미설정' }, 500);
  }

  // 1. 포트원 access token 받기
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

  // 2. 결제 정보 조회 → 검증
  let payment: any;
  try {
    const payResp = await fetch(`https://api.iamport.kr/payments/${imp_uid}`, {
      headers: { 'Authorization': accessToken }
    });
    const payData = await payResp.json();
    payment = payData?.response;
    if (!payment) throw new Error('결제 정보 없음');
    if (payment.status !== 'paid') {
      return jsonResponse({ error: '결제 미완료: ' + payment.status }, 400);
    }
    if (payment.merchant_uid !== merchant_uid) {
      return jsonResponse({ error: 'merchant_uid 불일치 (위변조 가능)' }, 400);
    }
  } catch (e: any) {
    return jsonResponse({ error: '결제 검증 실패: ' + (e?.message || e) }, 502);
  }

  // 3. 결제 금액 → USD 환산
  const amount_krw = payment.amount;
  const amount_usd = Math.round((amount_krw / KRW_PER_USD) * 1_000_000) / 1_000_000;

  // 4. payments row 박기 (idempotent — 같은 imp_uid 중복 방지)
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
        payment_type: 'charge',
        amount_krw,
        amount_credit_usd: amount_usd,
        portone_imp_uid: imp_uid,
        portone_merchant_uid: merchant_uid,
        status: 'paid',
        raw_response: payment
      })
    });
  } catch (e) {
    console.warn('[charge] payment row 박기 실패:', e);
  }

  // 5. 사용자 잔액 추가
  try {
    // 현재 잔액 조회
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
    const currentBalance = (billingRows[0]?.credit_balance_usd) || 0;
    const newBalance = Math.round((currentBalance + amount_usd) * 1_000_000) / 1_000_000;
    await fetch(`${SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${user.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
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
