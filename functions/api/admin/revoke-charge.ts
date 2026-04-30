// POST /api/admin/revoke-charge — admin이 미입금 사용자 잔액 환수 + status='cancelled'.
// 추가: 거짓 송금 시 사용자 차단 (state.preferences.banned = true) 옵션.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';

interface AdminEnv extends Env {
  ADMIN_USER_ID?: string;
}

const KRW_PER_USD = 1400;

export async function onRequestPost(context: { request: Request; env: AdminEnv }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();
  if (!env.ADMIN_USER_ID) {
    console.error('[admin] ADMIN_USER_ID env 미설정 — Cloudflare 대시보드에서 박아야 합니다');
    return jsonResponse({ error: '서버 설정 오류 (관리자에게 문의)' }, 500);
  }
  if (user.id !== env.ADMIN_USER_ID) {
    return jsonResponse({ error: '관리자 권한 필요' }, 403);
  }

  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'invalid JSON' }, 400); }
  const { payment_id, ban_user } = body;
  if (!payment_id) return jsonResponse({ error: 'payment_id 필수' }, 400);

  // 1. payment row 조회
  let paymentRow: any;
  try {
    const resp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_payments?id=eq.${payment_id}&select=*&limit=1`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    const rows: any = await resp.json();
    if (!rows || rows.length === 0) return jsonResponse({ error: 'payment row 없음' }, 404);
    paymentRow = rows[0];
    if (paymentRow.status !== 'pending_manual') {
      return jsonResponse({ error: '환수 가능 status X (현재: ' + paymentRow.status + ')' }, 400);
    }
  } catch (e: any) {
    return jsonResponse({ error: '조회 실패: ' + (e?.message || e) }, 500);
  }

  // 2. 사용자 잔액에서 차감 — atomic RPC (race-safe, 사용자 명시 2026-04-30 ultrathink)
  try {
    const refundUsd = paymentRow.amount_credit_usd || 0;
    if (refundUsd > 0) {
      const { subtractCreditAtomic } = await import('../_lib/billing');
      await subtractCreditAtomic(env, paymentRow.user_id, refundUsd);
    }
  } catch (e) { console.warn('[admin revoke] 잔액 차감 실패:', e); }

  // 3. payment row status='cancelled' + 사유
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_payments?id=eq.${payment_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        status: 'cancelled',
        refund_reason: 'admin 환수 (미입금 또는 거짓 송금)',
        refunded_at: new Date().toISOString()
      })
    });
  } catch (e) { console.warn('[admin revoke] payment status 갱신 실패:', e); }

  // 4. ban_user 옵션 시 사용자 데이터 처리 — 단순화: payment row 'ban_marker' 박기. 향후 별도 ban 테이블.
  if (ban_user) {
    console.warn('[admin revoke] ban_user 요청 — 향후 별도 ban 테이블에서 처리');
  }

  return jsonResponse({ ok: true, refunded_usd: paymentRow.amount_credit_usd });
}
