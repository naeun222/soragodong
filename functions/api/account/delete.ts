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
  // 사용자 명시 2026-05-08 ultrathink (audit WARN #18): Supabase 내부 오류 본문이 클라이언트에 노출 = PIPA §29 안전조치 위반.
  // 옛: 'RPC 실패: ' + t → 내부 DB 구조 / user_id leak 가능. 신: 서버 로그만 + 클라이언트 generic 메시지.
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
      console.error('[account/delete] RPC 실패:', rpcResp.status, t.slice(0, 500));
      return jsonResponse({ error: '탈퇴 처리 실패 — 잠시 후 다시 시도해주세요' }, 500);
    }
  } catch (e: any) {
    console.error('[account/delete] RPC 예외:', e?.message || e);
    return jsonResponse({ error: '탈퇴 처리 예외 — 잠시 후 다시 시도해주세요' }, 500);
  }

  // 2. auth.users row 삭제
  // 사용자 보고 2026-05-10 (audit-backend 초록): 옛 silent fail → response 에 auth_delete_failed hint. client 가 강제 logout 가능.
  let _authDeleteOk = true;
  try {
    const _authResp = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
      method: 'DELETE',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
    if (!_authResp.ok) {
      console.error('[delete account] auth.users 삭제 실패 status:', _authResp.status);
      _authDeleteOk = false;
    }
  } catch (e) {
    console.error('[delete account] auth.users 삭제 예외:', e);
    _authDeleteOk = false;
  }

  return jsonResponse({
    ok: true,
    message: '탈퇴 완료. 자기관찰 데이터 즉시 삭제됨.',
    auth_delete_failed: !_authDeleteOk  // client = 강제 logout + 재시도 안내
  });
}
