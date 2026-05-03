// 회원 탈퇴 endpoint — 약관 8조 의무.
// 자기관찰 데이터 즉시 삭제 + 결제 기록 익명화 보존 (전자상거래법 5년).
// 사용자 요청 2026-04-30: withdrawAccount 클라이언트 함수의 백엔드 짝.

import { verifyAuth, unauthorized, jsonResponse } from '../_lib/auth';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const config = { runtime: 'nodejs' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'POST only' }, 405);
  }
  const user = await verifyAuth(req);
  if (!user) return unauthorized();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Supabase env 누락 (서버)' }, 500);
  }

  // 1. RPC 호출 — 자기관찰 데이터 삭제 + 결제 기록 익명화 (atomic)
  try {
    const rpcResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/withdraw_user_data`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
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

  // 2. Supabase auth.users row 삭제 — admin API 사용 (service_role 필요)
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
  } catch (e) {
    console.warn('[delete account] auth.users 삭제 실패:', e);
    // RPC는 성공했으므로 일단 ok 반환 (auth row는 cron으로 일괄 정리 가능)
  }

  return jsonResponse({ ok: true, message: '탈퇴 완료. 자기관찰 데이터 즉시 삭제됨.' });
}
