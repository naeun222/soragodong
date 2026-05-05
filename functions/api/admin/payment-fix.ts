// POST /api/admin/payment-fix — admin 전용. paymentId row 의 user_id 진단 + 강제 sync.
// 사용자 보고 2026-05-06: 모바일 KG이니시스 redirect 흐름에서 verify-pay 가 다른 user.id 로 INSERT 한 케이스
// → 환불 시 NOT_OWN. 이 도구로 user_id 강제 sync 후 환불 재시도.
//
// body: {
//   paymentId: string (DB row id)
//   action?: 'diagnose' | 'sync_user'  (default: 'diagnose')
//   target_user_id?: string  (sync_user 시 — 미지정 시 caller admin 본인)
// }

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';

interface AdminEnv extends Env {
  ADMIN_USER_ID?: string;
}

export async function onRequestPost(context: { request: Request; env: AdminEnv }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();
  if (!env.ADMIN_USER_ID) {
    return jsonResponse({ error: '서버 설정 오류 (ADMIN_USER_ID 미설정)' }, 500);
  }
  if (user.id !== env.ADMIN_USER_ID) {
    return jsonResponse({ error: '관리자 권한 필요' }, 403);
  }

  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'invalid JSON' }, 400); }
  const { paymentId, action, target_user_id, limit } = body;
  const act = action || 'diagnose';

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'env missing' }, 500);
  }

  // 사용자 보고 2026-05-06: paymentId 모르는 경우 (일반 계정 못 들어감) — list_recent 액션으로 최근 결제 조회.
  if (act === 'list_recent') {
    const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
    try {
      const resp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/soragodong_payments?select=id,user_id,user_email,status,payment_type,amount_krw,created_at,portone_merchant_uid,refund_amount_krw,refunded_at&order=created_at.desc&limit=${lim}`,
        { headers: { 'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
      );
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        return jsonResponse({ error: 'list 실패: ' + resp.status + ' ' + txt.slice(0, 200) }, 500);
      }
      const rows = await resp.json();
      return jsonResponse({ ok: true, action: 'list_recent', rows });
    } catch (e: any) {
      return jsonResponse({ error: 'list 실패: ' + (e?.message || e) }, 500);
    }
  }

  // diagnose / sync_user 는 paymentId 필수.
  if (!paymentId || typeof paymentId !== 'string') {
    return jsonResponse({ error: 'paymentId 필수' }, 400);
  }

  // 1. row 조회.
  let row: any;
  try {
    const resp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_payments?id=eq.${paymentId}&select=*`,
      { headers: { 'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    const rows = await resp.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return jsonResponse({ error: 'paymentId row 없음', code: 'NOT_FOUND' }, 404);
    }
    row = rows[0];
  } catch (e: any) {
    return jsonResponse({ error: '조회 실패: ' + (e?.message || e) }, 500);
  }

  // 2. action='diagnose' (default) — 정보만 반환.
  if (act === 'diagnose') {
    return jsonResponse({
      ok: true,
      action: 'diagnose',
      payment: {
        id: row.id,
        user_id: row.user_id,
        user_email: row.user_email,
        status: row.status,
        payment_type: row.payment_type,
        amount_krw: row.amount_krw,
        portone_merchant_uid: row.portone_merchant_uid,
        portone_imp_uid: row.portone_imp_uid,
        created_at: row.created_at,
        refund_amount_krw: row.refund_amount_krw,
        refund_started_at: row.refund_started_at,
        refunded_at: row.refunded_at
      },
      caller: {
        user_id: user.id,
        email: user.email
      },
      diagnose: {
        match: row.user_id === user.id,
        reason: row.user_id === user.id
          ? 'user_id 매칭 OK — 환불 가능'
          : `user_id 불일치 (row=${row.user_id || '(null)'} ≠ caller=${user.id})`
      }
    });
  }

  // 3. action='sync_user' — user_id 강제 sync.
  if (act === 'sync_user') {
    const newUserId = target_user_id || user.id;
    const oldUserId = row.user_id;
    try {
      // 사용자 보고 2026-05-06: return=representation + 0 row 검증 (옛 return=minimal 은 0 row 매칭 시도 ok 응답하던 silent fail).
      const patchResp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/soragodong_payments?id=eq.${paymentId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({ user_id: newUserId })
        }
      );
      if (!patchResp.ok) {
        const txt = await patchResp.text().catch(() => '');
        return jsonResponse({ error: 'PATCH 실패: ' + patchResp.status + ' ' + txt.slice(0, 200) }, 500);
      }
      const patchedRows: any = await patchResp.json().catch(() => []);
      if (!Array.isArray(patchedRows) || patchedRows.length === 0) {
        return jsonResponse({ error: `PATCH 0 row matched — paymentId 형식 / 값 잘못됐을 수 있어. 입력 = ${paymentId}`, code: 'PATCH_NO_MATCH' }, 404);
      }
      return jsonResponse({
        ok: true,
        action: 'sync_user',
        old_user_id: oldUserId,
        new_user_id: newUserId,
        patched_count: patchedRows.length,
        patched_row: patchedRows[0],
        message: `user_id sync 완료: ${oldUserId || '(null)'} → ${newUserId}`
      });
    } catch (e: any) {
      return jsonResponse({ error: 'sync 실패: ' + (e?.message || e) }, 500);
    }
  }

  return jsonResponse({ error: '알 수 없는 action: ' + act }, 400);
}
