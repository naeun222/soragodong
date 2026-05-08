// POST /api/billing/portone-webhook
// PortOne V2 webhook 수신 — 결제 상태 변경 (외부 환불 / 가상계좌 입금 / 정기결제 결과 등) 비동기 알림.
// 사용자 명시 2026-05-06: V2 webhook 서명 (svix 호환) 검증 후 status 갱신.
// 멱등 — 같은 paymentId 여러 webhook 와도 안전하게 처리 (이미 적용된 상태면 no-op).

import { jsonResponse, type Env } from '../_lib/auth';
import { verifyPortOneWebhook, fetchPortOnePayment } from '../_lib/portone';

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const rawBody = await request.text();
  const webhookId = request.headers.get('webhook-id');
  const webhookTimestamp = request.headers.get('webhook-timestamp');
  const webhookSignature = request.headers.get('webhook-signature');

  // 서명 검증 — 위변조 / replay 방어.
  const verifyResult = await verifyPortOneWebhook(env, rawBody, webhookId, webhookTimestamp, webhookSignature);
  if (!verifyResult.ok) {
    console.warn('[portone-webhook] 서명 검증 실패:', verifyResult.error);
    return jsonResponse({ error: 'signature invalid' }, 401);
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch { return jsonResponse({ error: 'invalid JSON' }, 400); }

  // PortOne V2 webhook payload 형식: { type, timestamp, data: { paymentId, ... } }
  const eventType = event?.type || '';
  const paymentId = event?.data?.paymentId;
  if (!paymentId) {
    console.warn('[portone-webhook] paymentId 누락:', event);
    return jsonResponse({ ok: true, ignored: true });
  }

  // 결제 정보 다시 조회 — webhook payload 신뢰 X, 서버에서 확정 status 가져옴.
  const fetchResult = await fetchPortOnePayment(env, paymentId);
  if (!fetchResult.ok) {
    console.error('[portone-webhook] payment 조회 실패:', fetchResult.error);
    return jsonResponse({ error: 'payment fetch fail' }, 502);
  }
  const payment = fetchResult.payment;

  // event type 별 분기 (현재는 cancelled 만 자동 반영, 그 외 logging).
  if (eventType === 'Transaction.Cancelled' || payment.status === 'CANCELLED' || payment.status === 'PARTIAL_CANCELLED') {
    // 외부 환불 — billing 비활성화 + payment 기록 update.
    try {
      // user_id 찾기 (payments 테이블에서 paymentId 로 lookup).
      const lookupResp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/soragodong_payments?portone_merchant_uid=eq.${encodeURIComponent(paymentId)}&select=user_id&limit=1`,
        { headers: { 'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
      );
      const rows: any[] = await lookupResp.json();
      const userId = rows?.[0]?.user_id;
      if (userId) {
        // billing 비활성 (잔여 cap 보존 또는 0 — 환불 정책에 따름. 일단 active=false 만).
        await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${userId}`, {
          method: 'PATCH',
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ subscription_active: false })
        });
        // payment 기록 status update.
        // 사용자 명시 2026-05-08 ultrathink (audit WARN #11): 환불 기록 보완 — refund_amount_krw / refunded_at 명시.
        // 옛: status 만 update → 전자상거래법 §6 5년 보존 데이터 결손.
        // payment 객체에서 환불 금액 추출 (PortOne V2 cancellations 배열 합계).
        let _refundAmount = 0;
        try {
          const cancels = (payment as any)?.cancellations;
          if (Array.isArray(cancels)) {
            for (const c of cancels) _refundAmount += Number(c?.totalAmount || c?.amount || 0);
          } else if ((payment as any)?.amount?.cancelled) {
            _refundAmount = Number((payment as any).amount.cancelled) || 0;
          }
        } catch {}
        await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_payments?portone_merchant_uid=eq.${encodeURIComponent(paymentId)}`, {
          method: 'PATCH',
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            status: payment.status === 'CANCELLED' ? 'cancelled' : 'partial_cancelled',
            refund_amount_krw: _refundAmount > 0 ? _refundAmount : undefined,
            refunded_at: new Date().toISOString(),
            refund_reason: 'webhook_external'  // 외부 환불 (대시보드 / CS)
          })
        });
        console.log('[portone-webhook] cancelled 처리 완료:', paymentId);
      }
    } catch (e) { console.error('[portone-webhook] cancel 처리 실패:', e); }
  } else {
    console.log('[portone-webhook] event 받음 (no-op):', eventType, paymentId, payment.status);
  }

  return jsonResponse({ ok: true });
}
