// POST /api/billing/overage-pack — Premium 구독 cap 도달 시 1회성 추가팩 결제 (PortOne V2).
// 사용자 명시 2026-05-06: V1 (imp_uid + accessToken) 폐기 → V2 (paymentId + Authorization PortOne).

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';
import { OVERAGE_PACKS, addCreditAtomic, getUserBilling } from '../_lib/billing';
import { fetchPortOnePayment } from '../_lib/portone';

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();
  if (user.is_anonymous) {
    return jsonResponse({ error: '게스트는 결제 X', code: 'GUEST_BLOCKED' }, 403);
  }

  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'invalid JSON' }, 400); }
  const { paymentId, pack } = body;
  if (!paymentId || !pack) {
    return jsonResponse({ error: 'paymentId + pack 필수' }, 400);
  }
  if (!OVERAGE_PACKS[pack as keyof typeof OVERAGE_PACKS]) {
    return jsonResponse({ error: 'pack 은 premium_pack 만 허용' }, 400);
  }
  const packDef = OVERAGE_PACKS[pack as keyof typeof OVERAGE_PACKS];

  // Premium 사용자만 추가팩 가능.
  const billing = await getUserBilling(env, user.id);
  const isPremium = billing?.subscription_active && billing?.subscription_plan === 'premium';
  if (!isPremium) {
    return jsonResponse({ error: '추가팩은 Premium 구독자만 결제 가능' }, 403);
  }

  // PortOne V2 단건 조회 + 검증.
  const fetchResult = await fetchPortOnePayment(env, paymentId);
  if (!fetchResult.ok) {
    return jsonResponse({ error: '결제 조회 실패: ' + fetchResult.error }, 502);
  }
  const payment = fetchResult.payment;
  if (payment.status !== 'PAID') {
    return jsonResponse({ error: `결제 상태 ${payment.status}`, code: 'NOT_PAID' }, 400);
  }
  const paidAmount = Number(payment.amount?.total || 0);
  if (paidAmount !== packDef.krw) {
    return jsonResponse({ error: `결제 금액 불일치 (${pack} = ${packDef.krw}원, 실 ${paidAmount}원)` }, 400);
  }

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
        amount_krw: paidAmount,
        amount_credit_usd: packDef.usd,
        portone_imp_uid: payment.txId || paymentId,
        portone_merchant_uid: paymentId,
        status: 'paid',
        raw_response: payment
      })
    });
  } catch (e) { console.warn('[overage-pack] payment 기록 실패:', e); }

  // credit_balance_usd 추가 — atomic RPC + idempotency (paymentId base).
  const result = await addCreditAtomic(env, user.id, packDef.usd, 'portone_overage_' + paymentId);
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
