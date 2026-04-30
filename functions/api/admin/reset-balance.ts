// POST /api/admin/reset-balance — admin 측 사용자 잔액 직접 정정.
// 사용자 명시 2026-04-30 ultrathink: 이전 버그로 누적된 잔액 정정용.
//
// body: { target_user_id: string, new_balance_usd: number, reset_idempotency?: boolean }
// - target_user_id 명시 X 시 = 본인 (admin 본인 잔액 정정)
// - reset_idempotency = true 시 = soragodong_billing_idempotency 측 본인 record 도 삭제 (다시 처음부터 시작)

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';

interface AdminEnv extends Env {
  ADMIN_USER_ID?: string;
}

export async function onRequestPost(context: { request: Request; env: AdminEnv }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();
  if (!env.ADMIN_USER_ID) {
    console.error('[admin reset-balance] ADMIN_USER_ID env 미설정');
    return jsonResponse({ error: '서버 설정 오류 (관리자에게 문의)' }, 500);
  }
  if (user.id !== env.ADMIN_USER_ID) {
    return jsonResponse({ error: '관리자 권한 필요' }, 403);
  }

  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'invalid JSON' }, 400); }
  const { target_user_id, new_balance_usd, reset_idempotency } = body;
  const targetId = target_user_id || user.id;
  if (typeof new_balance_usd !== 'number' || isNaN(new_balance_usd)) {
    return jsonResponse({ error: 'new_balance_usd 숫자 필수' }, 400);
  }
  if (new_balance_usd < 0) {
    return jsonResponse({ error: 'new_balance_usd < 0 X' }, 400);
  }
  if (new_balance_usd > 100) {
    // 안전 — 잔액 100$ 초과 정정은 차단 (오타 등)
    return jsonResponse({ error: 'new_balance_usd > $100 차단 (안전선)' }, 400);
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'env missing' }, 500);
  }

  // 1. 잔액 PATCH
  const newBalanceRounded = Math.round(new_balance_usd * 1_000_000) / 1_000_000;
  let oldBalance: number | null = null;
  try {
    const oldResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${targetId}&select=credit_balance_usd`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    const oldRows: any = await oldResp.json();
    oldBalance = Number(oldRows?.[0]?.credit_balance_usd) || 0;

    const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${targetId}`, {
      method: 'PATCH',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ credit_balance_usd: newBalanceRounded })
    });
    if (!resp.ok) {
      return jsonResponse({ error: 'PATCH 실패: ' + resp.status }, 500);
    }
    const rows: any = await resp.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return jsonResponse({ error: 'target billing row 없음' }, 404);
    }

    // 2. (선택) idempotency 기록 reset — 0005 migration 적용 시
    let idempotencyDeleted = 0;
    if (reset_idempotency) {
      try {
        const delResp = await fetch(
          `${env.SUPABASE_URL}/rest/v1/soragodong_billing_idempotency?user_id=eq.${targetId}`,
          {
            method: 'DELETE',
            headers: {
              'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Prefer': 'return=representation'
            }
          }
        );
        if (delResp.ok) {
          const delRows: any = await delResp.json();
          idempotencyDeleted = Array.isArray(delRows) ? delRows.length : 0;
        }
      } catch (e) {
        console.warn('[admin reset-balance] idempotency 삭제 실패 (0005 미실행 가능):', e);
      }
    }

    return jsonResponse({
      ok: true,
      target_user_id: targetId,
      old_balance_usd: oldBalance,
      new_balance_usd: newBalanceRounded,
      idempotency_deleted: idempotencyDeleted,
      message: `잔액 ${oldBalance} → ${newBalanceRounded} 정정 완료`
    });
  } catch (e: any) {
    return jsonResponse({ error: e?.message || String(e) }, 500);
  }
}
