// POST /api/account/delete — 회원 탈퇴 (자기관찰 데이터 삭제 + 결제 기록 익명화).

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Supabase env 누락 (서버)' }, 500);
  }

  // 1. RPC 호출 — 자기관찰 데이터 삭제 + 결제 기록 익명화
  try {
    const rpcResp = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/withdraw_user_data`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_user_id: user.id })
    });
    if (!rpcResp.ok) {
      const t = await rpcResp.text();
      return jsonResponse({ error: 'RPC 실패: ' + t }, 500);
    }
  } catch (e: any) {
    return jsonResponse({ error: 'RPC 예외: ' + (e?.message || e) }, 500);
  }

  // 2. auth.users row 삭제
  try {
    await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
      method: 'DELETE',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
  } catch (e) {
    console.warn('[delete account] auth.users 삭제 실패:', e);
  }

  return jsonResponse({ ok: true, message: '탈퇴 완료. 자기관찰 데이터 즉시 삭제됨.' });
}
