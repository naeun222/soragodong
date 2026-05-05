// GET /api/billing/list-payments — 사용자 본인의 최근 결제 내역 조회.
// 사용자 명시 2026-05-06: 환불 UI 용 — 본인 결제만 status=paid 인 row 환불 가능.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'env missing' }, 500);
  }

  // 최근 6개월 결제 (refund 가능 범위 — 카드사 기본 6개월).
  const sinceDate = new Date(Date.now() - 180 * 86400000).toISOString();
  try {
    const resp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_payments?user_id=eq.${user.id}&created_at=gte.${encodeURIComponent(sinceDate)}&select=id,payment_type,amount_krw,amount_credit_usd,status,created_at,refund_amount_krw,refunded_at&order=created_at.desc&limit=50`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    if (!resp.ok) {
      return jsonResponse({ error: 'list fail: ' + resp.status }, 502);
    }
    const rows: any[] = await resp.json();
    return jsonResponse({ payments: rows });
  } catch (e: any) {
    return jsonResponse({ error: '조회 실패: ' + (e?.message || e) }, 500);
  }
}
