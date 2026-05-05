// POST /api/billing/refund — 환불 (포트원 자동 환불 + 비례 환불).

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';
import { cancelPortOnePayment } from '../_lib/portone';

const KRW_PER_USD = 1400;

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();

  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'invalid JSON' }, 400); }
  const { payment_id, reason } = body;
  if (!payment_id) {
    return jsonResponse({ error: 'payment_id 필수' }, 400);
  }

  // 1. 결제 row 조회 + 본인 거 확인 + status='paid' atomic claim (사용자 명시 2026-05-01 agent audit P9)
  // 이전 = SELECT 후 status check + 그 후 PATCH — 두 번 환불 click race 시 둘 다 paid read → 이중 환불.
  // fix = PATCH ?status=eq.paid 필터 + status='processing' 으로 atomic 전환. winner 만 진행.
  let paymentRow: any;
  try {
    const claimResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_payments?id=eq.${payment_id}&user_id=eq.${user.id}&status=eq.paid`,
      {
        method: 'PATCH',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ status: 'processing', refund_started_at: new Date().toISOString() })
      }
    );
    const claimed: any = await claimResp.json();
    if (!Array.isArray(claimed) || claimed.length === 0) {
      // 다른 호출이 winner — 또는 본인 거 X / 이미 refunded.
      return jsonResponse({ error: '환불 불가 (이미 처리 중이거나 본인 거 X 또는 이미 환불됨)' }, 409);
    }
    paymentRow = claimed[0];
  } catch (e: any) {
    return jsonResponse({ error: '결제 조회 실패: ' + (e?.message || e) }, 500);
  }

  // 2. 비례 환불액 계산
  let refundAmountKrw = paymentRow.amount_krw;
  if (paymentRow.payment_type === 'charge') {
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
    const balance = billingRows[0]?.credit_balance_usd || 0;
    refundAmountKrw = Math.min(paymentRow.amount_krw, Math.floor(balance * KRW_PER_USD));
  } else if (paymentRow.payment_type === 'subscribe') {
    const paidAt = new Date(paymentRow.created_at).getTime();
    const elapsedDays = Math.floor((Date.now() - paidAt) / 86400000);
    const remainingDays = Math.max(0, 30 - elapsedDays);
    refundAmountKrw = Math.floor(paymentRow.amount_krw * remainingDays / 30);
  }

  if (refundAmountKrw <= 0) {
    // status atomic claim 했으니 paid 로 복원 (다른 사유 환불 불가).
    await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_payments?id=eq.${payment_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ status: 'paid', refund_started_at: null })
    }).catch(() => {});
    return jsonResponse({ error: '환불 가능 금액 0원' }, 400);
  }

  // 3. 포트원 V2 환불 (cancelPortOnePayment helper 사용).
  // 사용자 명시 2026-05-06: V1 (imp_uid + accessToken) 폐기 → V2 (paymentId + Authorization PortOne header).
  // payments 테이블 portone_merchant_uid 컬럼에 V2 paymentId 저장 (verify-pay 시 — 옛 imp_uid 자리는 txId).
  const v2PaymentId = paymentRow.portone_merchant_uid || paymentRow.portone_imp_uid;
  const cancelResult = await cancelPortOnePayment(env, v2PaymentId, reason || '사용자 환불 요청', refundAmountKrw);
  if (!cancelResult.ok) {
    // claim 복원 — 환불 실패 시 status=paid 로 되돌림.
    await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_payments?id=eq.${payment_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ status: 'paid', refund_started_at: null })
    }).catch(() => {});
    return jsonResponse({ error: '포트원 환불 실패: ' + cancelResult.error }, 502);
  }

  // 4. payments 갱신
  await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_payments?id=eq.${payment_id}`, {
    method: 'PATCH',
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
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

  // 5. 충전식이면 잔액 차감 — atomic RPC (race-safe, 사용자 명시 2026-04-30 ultrathink)
  if (paymentRow.payment_type === 'charge') {
    const refundUsd = refundAmountKrw / KRW_PER_USD;
    const { subtractCreditAtomic } = await import('../_lib/billing');
    await subtractCreditAtomic(env, user.id, refundUsd);
  }

  // 사용자 보고 2026-05-05 (audit High): 구독 환불 시 즉시 만료 처리 추가.
  // 이전 = subscription_active / expires_at 그대로 → 환불 후 잔여일 동안 무료 사용 가능 (분쟁 risk).
  // fix: 구독 환불 시 active=false + expires_at=now (Light/Premium/early_light 공통).
  if (paymentRow.payment_type === 'subscribe' || paymentRow.payment_type === 'toss_subscribe') {
    await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${user.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        subscription_active: false,
        subscription_expires_at: new Date().toISOString()
      })
    }).catch(() => {});
  }

  return jsonResponse({ ok: true, refunded_krw: refundAmountKrw, message: '환불 완료. 카드사 정책상 3-7영업일 내 카드 명세서 반영.' });
}
