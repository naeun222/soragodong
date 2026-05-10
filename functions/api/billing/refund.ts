// POST /api/billing/refund — 환불 (포트원 자동 환불 + 비례 환불).
// 사용자 보고 2026-05-06: 단일 409 메시지 ("이미 처리 중이거나 본인 거 X 또는 이미 환불됨") = 진단 어려움
// → ① 사전 SELECT 분기 진단 ② 'processing' 10분+ stuck 자동 해소 ③ PortOne 측 외부 환불 sync ④ silent catch 제거.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';
import { cancelPortOnePayment, fetchPortOnePayment } from '../_lib/portone';

const PROCESSING_STUCK_MS = 10 * 60 * 1000;  // 10분 이상 'processing' = 이전 환불 호출 stuck → 자동 'paid' 복원

async function _restorePaidStatus(env: Env, payment_id: string): Promise<boolean> {
  try {
    const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_payments?id=eq.${payment_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ status: 'paid', refund_started_at: null })
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      console.error('[refund] paid 복원 실패:', resp.status, txt.slice(0, 200));
    }
    return resp.ok;
  } catch (e: any) {
    console.error('[refund] paid 복원 throw:', e?.message || e);
    return false;
  }
}

async function _markRefunded(env: Env, payment_id: string, refund_amount_krw: number, full: boolean, reason: string) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_payments?id=eq.${payment_id}`, {
    method: 'PATCH',
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      status: full ? 'refunded' : 'paid',
      refund_amount_krw,
      refunded_at: new Date().toISOString(),
      refund_reason: reason
    })
  });
}

async function _expireSubscription(env: Env, user_id: string) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${user_id}`, {
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
  });
}

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

  // 1. 사전 SELECT — row 존재 / 본인 / status 진단 분기.
  let existing: any;
  try {
    const checkResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_payments?id=eq.${payment_id}&user_id=eq.${user.id}&select=id,status,refund_started_at,amount_krw,refund_amount_krw,refunded_at,payment_type,created_at,portone_merchant_uid,portone_imp_uid`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    const rows: any[] = await checkResp.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      // user_id 매칭 실패 또는 row 자체가 없음 — 어느 쪽인지 분기.
      const anyResp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/soragodong_payments?id=eq.${payment_id}&select=id,user_id&limit=1`,
        {
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
          }
        }
      );
      const anyRows: any[] = await anyResp.json().catch(() => []);
      if (Array.isArray(anyRows) && anyRows.length > 0) {
        // 사용자 보고 2026-05-06: hint 만 같고 full 다른 케이스 진단 위해 admin caller 시 full 노출.
        const rowUid = anyRows[0].user_id;
        const isAdminCaller = (env as any).ADMIN_USER_ID && user.id === (env as any).ADMIN_USER_ID;
        const rowUidHint = rowUid ? String(rowUid).slice(0, 8) + '…' + String(rowUid).slice(-4) : '(null)';
        return jsonResponse({
          error: '본인 결제가 아니야 — 다른 계정으로 로그인했거나 ID 불일치.',
          code: 'NOT_OWN',
          caller_user_id: user.id,
          row_user_id_hint: rowUidHint,
          row_user_id_full: isAdminCaller ? rowUid : undefined
        }, 403);
      }
      return jsonResponse({ error: '결제를 찾을 수 없어 — payment_id 가 잘못됐을 수 있어.', code: 'NOT_FOUND' }, 404);
    }
    existing = rows[0];
  } catch (e: any) {
    return jsonResponse({ error: '결제 조회 실패: ' + (e?.message || e), code: 'CHECK_FAIL' }, 500);
  }

  // 1-A. status 별 분기.
  if (existing.status === 'refunded') {
    return jsonResponse({
      error: `이미 환불 완료된 결제 — ${(existing.refund_amount_krw || 0).toLocaleString()}원 환불됨.`,
      code: 'ALREADY_REFUNDED',
      refund_amount_krw: existing.refund_amount_krw,
      refunded_at: existing.refunded_at
    }, 409);
  }
  if (existing.status === 'cancelled' || existing.status === 'partial_cancelled') {
    return jsonResponse({
      error: '이미 외부에서 취소된 결제 — 추가 환불 불가.',
      code: 'ALREADY_CANCELLED'
    }, 409);
  }
  if (existing.status === 'processing') {
    // stuck 가능성 — refund_started_at 시점 체크.
    const startedAt = existing.refund_started_at ? new Date(existing.refund_started_at).getTime() : 0;
    const elapsedMs = startedAt ? Date.now() - startedAt : Infinity;
    if (elapsedMs > PROCESSING_STUCK_MS) {
      console.warn('[refund] processing stuck 자동 복원:', payment_id, '경과:', Math.round(elapsedMs / 60000), '분');
      const restored = await _restorePaidStatus(env, payment_id);
      if (!restored) {
        return jsonResponse({ error: 'stuck 해소 실패 — 잠시 후 다시 시도.', code: 'RESTORE_FAIL' }, 500);
      }
      // 복원 성공 — 아래 atomic claim 으로.
    } else {
      const remainMin = Math.max(1, Math.ceil((PROCESSING_STUCK_MS - elapsedMs) / 60000));
      return jsonResponse({
        error: `다른 환불이 처리 중 — 약 ${remainMin}분 후 자동 해제. 잠시 후 다시 시도.`,
        code: 'PROCESSING'
      }, 409);
    }
  } else if (existing.status !== 'paid') {
    return jsonResponse({
      error: `환불 불가 status: ${existing.status}`,
      code: 'INVALID_STATUS',
      status: existing.status
    }, 409);
  }

  // 2. status='paid' atomic claim (race-safe — 두 번 동시 클릭 시 winner 만 진행).
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
      return jsonResponse({ error: '환불 동시 시도 — 잠시 후 다시 시도.', code: 'RACE_LOSER' }, 409);
    }
    paymentRow = claimed[0];
  } catch (e: any) {
    return jsonResponse({ error: '결제 claim 실패: ' + (e?.message || e), code: 'CLAIM_FAIL' }, 500);
  }

  const v2PaymentId = paymentRow.portone_merchant_uid || paymentRow.portone_imp_uid;

  // 3. PortOne 측 결제 상태 pre-check — 이미 외부 환불 처리됐으면 우리 DB 만 sync.
  // 사용자 보고 2026-05-06: 첫 환불 호출이 cloudflare timeout 으로 끊겼지만 PortOne 쪽은 정상 환불된 케이스 가능.
  try {
    const fetchResult = await fetchPortOnePayment(env, v2PaymentId);
    if (fetchResult.ok) {
      const ponStatus = fetchResult.payment.status;
      if (ponStatus === 'CANCELLED' || ponStatus === 'PARTIAL_CANCELLED') {
        const cancelledAmount = Number(fetchResult.payment.amount?.cancelled) || paymentRow.amount_krw;
        const isFull = ponStatus === 'CANCELLED';
        await _markRefunded(env, payment_id, cancelledAmount, isFull, reason || '외부 환불 sync');
        if (paymentRow.payment_type === 'subscribe' || paymentRow.payment_type === 'toss_subscribe') {
          await _expireSubscription(env, user.id).catch(() => {});
        }
        return jsonResponse({
          ok: true,
          refunded_krw: cancelledAmount,
          sync: true,
          message: '외부에서 이미 환불 처리됨 — DB 동기화 완료. 카드 명세서 확인.'
        });
      }
      // PortOne 측 'PAID' 가 아니면 환불 호출 불가.
      if (ponStatus !== 'PAID') {
        await _restorePaidStatus(env, payment_id);
        return jsonResponse({
          error: `포트원 측 결제 상태 ${ponStatus} — 환불 호출 불가.`,
          code: 'PORTONE_NOT_PAID',
          portone_status: ponStatus
        }, 409);
      }
    }
    // fetchResult.ok 이 false 여도 cancel 시도 진행 (PortOne 일시 장애 가능).
  } catch (e) {
    console.warn('[refund] PortOne pre-check throw — cancel 시도 진행:', e);
  }

  // 4. 환불액 계산 — 청약철회 (전자상거래법 §17) + 사용량 검증.
  // 사용자 명시 2026-05-06:
  //   - 7일 이내 + 사용 X (4AM cutoff 자동 처리는 사용으로 안 침) → 전액 환불 (청약철회)
  //   - 24시간 이내인데 사용했으면 전액 환불 X → 1일치 차감
  //   - 그 외 = 일별 비례 (사용 했으면 elapsedDays / 안 했으면 elapsedDays 그대로)
  let refundAmountKrw = paymentRow.amount_krw;
  // 사용자 보고 2026-05-10 (audit-backend 노랑): tier_upgrade 도 30일 구독 — 비례 환불 적용. 옛 'subscribe' 만 비례 → tier_upgrade 항상 전액 환불 버그.
  if (paymentRow.payment_type === 'subscribe' || paymentRow.payment_type === 'tier_upgrade') {
    const paidAt = new Date(paymentRow.created_at).getTime();
    const elapsedDays = Math.floor((Date.now() - paidAt) / 86400000);

    // 사용량 조회 — paymentRow.user_id 기준 (admin force 케이스에서도 결제자 본인 billing).
    let usedUsd = 0;
    try {
      const billingResp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${paymentRow.user_id}&select=monthly_token_used`,
        { headers: { 'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
      );
      const billingRows: any[] = await billingResp.json().catch(() => []);
      const usedMicroUsd = Number(billingRows?.[0]?.monthly_token_used || 0);
      usedUsd = usedMicroUsd / 1_000_000;
    } catch (e) {
      console.warn('[refund] 사용량 조회 실패 — 사용량 0 으로 처리:', e);
    }

    // 4AM cutoff 자동 처리 비용 (~$0.01-0.03) 보다 위면 "실 사용" 으로 간주.
    const CUTOFF_THRESHOLD_USD = 0.05;
    const isClean = usedUsd < CUTOFF_THRESHOLD_USD;

    if (elapsedDays < 7 && isClean) {
      // 청약철회 — 전액 환불.
      refundAmountKrw = paymentRow.amount_krw;
    } else {
      // 일별 비례 — 사용했으면 24시간 이내라도 1일치 차감 (Math.max).
      const usedDays = Math.max(elapsedDays, isClean ? 0 : 1);
      const remainingDays = Math.max(0, 30 - usedDays);
      refundAmountKrw = Math.floor(paymentRow.amount_krw * remainingDays / 30);
    }
  }

  if (refundAmountKrw <= 0) {
    const restored = await _restorePaidStatus(env, payment_id);
    if (!restored) console.error('[refund] paid 복원 실패 — 수동 fix 필요:', payment_id);
    return jsonResponse({ error: '환불 가능 금액 0원 (사용 기간 모두 경과).', code: 'ZERO_REFUND' }, 400);
  }

  // 5. 포트원 V2 환불.
  const cancelResult = await cancelPortOnePayment(env, v2PaymentId, reason || '사용자 환불 요청', refundAmountKrw);
  if (!cancelResult.ok) {
    const restored = await _restorePaidStatus(env, payment_id);
    if (!restored) console.error('[refund] paid 복원 실패 (cancel fail 후) — 수동 fix 필요:', payment_id);
    return jsonResponse({
      error: '포트원 환불 실패: ' + cancelResult.error,
      code: 'PORTONE_FAIL',
      portone_error: cancelResult.error
    }, 502);
  }

  // 6. payments 갱신 — 명시적 ok 확인.
  // 사용자 명시 2026-05-09 ultrathink (audit FAIL #8 + 사용자 명시): 수정 영수증 자동 발급 — PortOne 환불 후 새 receiptUrl 받아 저장.
  // PortOne V2 = 환불 시 자동으로 cashReceipt cancel 처리 + 새 receipt URL 발급. 다시 fetch 해서 최신 URL 보존.
  let _newReceiptUrl: string | null = null;
  let _newCashReceiptStatus: string | null = null;
  try {
    const refreshed = await fetchPortOnePayment(env, v2PaymentId);
    if (refreshed.ok) {
      _newReceiptUrl = refreshed.payment.receiptUrl || null;
      _newCashReceiptStatus = (refreshed.payment as any).cashReceipt?.status || 'CANCELLED';
    }
  } catch (e) {
    console.warn('[refund] 환불 후 receiptUrl 조회 실패:', e);
  }
  try {
    const isFull = refundAmountKrw === paymentRow.amount_krw;
    // _markRefunded 확장 — receipt_url + cash_receipt_status 같이 update.
    const patchResp = await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_payments?id=eq.${payment_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        status: isFull ? 'refunded' : 'paid',
        refund_amount_krw: refundAmountKrw,
        refunded_at: new Date().toISOString(),
        refund_reason: reason || '',
        ...(typeof _newReceiptUrl === 'string' ? { receipt_url: _newReceiptUrl } : {}),
        ...(typeof _newCashReceiptStatus === 'string' ? { cash_receipt_status: _newCashReceiptStatus } : {})
      })
    });
    if (!patchResp.ok) {
      const txt = await patchResp.text().catch(() => '');
      console.error('[refund] payments 갱신 실패 — PortOne 환불 됐는데 DB 미반영:', payment_id, patchResp.status, txt.slice(0, 200));
    }
  } catch (e) {
    console.error('[refund] payments 갱신 throw:', e);
  }

  // 7. 구독 환불 시 즉시 만료.
  if (paymentRow.payment_type === 'subscribe' || paymentRow.payment_type === 'toss_subscribe') {
    try {
      const expResp = await _expireSubscription(env, user.id);
      if (!expResp.ok) console.warn('[refund] billing 만료 PATCH 실패:', expResp.status);
    } catch (e) {
      console.error('[refund] billing 만료 throw:', e);
    }
  }

  return jsonResponse({
    ok: true,
    refunded_krw: refundAmountKrw,
    receipt_url: _newReceiptUrl,
    cash_receipt_cancelled: _newCashReceiptStatus === 'CANCELLED',
    message: '환불 완료. 카드사 정책상 3-7영업일 내 카드 명세서 반영. 수정 영수증 자동 발급됨.'
  });
}
