// POST /api/billing/overage-pack — 구독 cap 도달 시 1회성 추가팩 결제.
// 사용자 명시 2026-04-30 ultrathink: claude-style cap 초과 → "다음 cycle 대기 / tier 업그레이드 / 추가팩" 3 옵션 중 추가팩 경로.
//
// 추가팩 종류:
//   light_pack   5,000원 = +$4 어치
//   premium_pack 7,000원 = +$5 어치
//
// 결제 검증 후 credit_balance_usd 에 USD 추가 (구독 cap 도달 시 자동 fall-through 차감 — deduct_credit_atomic 참고).

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';
import { OVERAGE_PACKS, addCreditAtomic } from '../_lib/billing';

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();

  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'invalid JSON' }, 400); }
  const { imp_uid, merchant_uid, pack } = body;
  if (!imp_uid || !merchant_uid || !pack) {
    return jsonResponse({ error: 'imp_uid + merchant_uid + pack 필수' }, 400);
  }
  if (pack !== 'light_pack' && pack !== 'premium_pack') {
    return jsonResponse({ error: 'pack 은 light_pack 또는 premium_pack 만 허용' }, 400);
  }
  const packDef = OVERAGE_PACKS[pack as keyof typeof OVERAGE_PACKS];

  if (!env.PORTONE_API_KEY || !env.PORTONE_API_SECRET) {
    return jsonResponse({ error: 'PORTONE env 미설정' }, 500);
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
    if (Number(payment.amount) !== packDef.krw) {
      return jsonResponse({ error: `결제 금액 불일치 (${pack} = ${packDef.krw}원, 실 ${payment.amount}원)` }, 400);
    }
  } catch (e: any) {
    return jsonResponse({ error: '결제 조회 실패: ' + (e?.message || e) }, 502);
  }

  // payments 테이블에 기록 (멱등 — imp_uid UNIQUE)
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
        payment_type: 'overage_pack',
        amount_krw: payment.amount,
        amount_credit_usd: packDef.usd,
        portone_imp_uid: imp_uid,
        portone_merchant_uid: merchant_uid,
        status: 'paid',
        raw_response: payment
      })
    });
  } catch (e) { console.warn('[overage-pack] payment 기록 실패:', e); }

  // credit_balance_usd 에 추가 — atomic RPC + idempotency (imp_uid base, 사용자 명시 2026-04-30 ultrathink)
  const result = await addCreditAtomic(env, user.id, packDef.usd, 'portone_overage_' + imp_uid);
  if (!result.ok) {
    return jsonResponse({ error: 'billing 갱신 실패: ' + (result.error || 'unknown') }, 500);
  }
  return jsonResponse({
    ok: true,
    pack,
    added_usd: packDef.usd,
    new_balance_usd: result.balance_usd,
    already_applied: result.already_applied || false
  });
}
