// POST /api/admin/confirm-charge — admin이 송금 확인 후 status='paid' 처리.
// 잔액은 manual-charge 시점 이미 반영됨. 여기선 status만 갱신.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';

interface AdminEnv extends Env {
  ADMIN_USER_ID?: string;
}

export async function onRequestPost(context: { request: Request; env: AdminEnv }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();
  if (!env.ADMIN_USER_ID || user.id !== env.ADMIN_USER_ID) {
    return jsonResponse({ error: '관리자 권한 필요' }, 403);
  }

  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'invalid JSON' }, 400); }
  const { payment_id } = body;
  if (!payment_id) return jsonResponse({ error: 'payment_id 필수' }, 400);

  try {
    const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_payments?id=eq.${payment_id}&status=eq.pending_manual`, {
      method: 'PATCH',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ status: 'paid' })
    });
    if (!resp.ok) {
      return jsonResponse({ error: '갱신 실패' }, 500);
    }
    return jsonResponse({ ok: true });
  } catch (e: any) {
    return jsonResponse({ error: '예외: ' + (e?.message || e) }, 500);
  }
}
